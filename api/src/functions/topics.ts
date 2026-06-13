import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { topicsTable, votersTable, votesTable } from '../shared/storage.js';
import { requireAuth, requireGamekeeper, isGamekeeper, AuthError } from '../shared/auth.js';
import { TopicEntity, VoterEntity, VoteEntity } from '../shared/types.js';
import { resolveSession, sanitizeText, normalizeEmail } from '../shared/helpers.js';
import { randomUUID } from 'crypto';

const MAX_TOPICS_PER_SESSION = 3;
const INITIAL_VOTES = 3;

// POST /api/sessions/:id/topics — submit a topic
app.http('submitTopic', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'sessions/{sessionId}/topics',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const user = requireAuth(request);
      const email = normalizeEmail(user.userDetails);

      const result = await resolveSession(request, { requireActive: true });
      if ('error' in result) return result.error;
      const { sessionId } = result;

      let body: { title?: string } = {};
      try {
        body = await request.json() as typeof body;
      } catch {
        return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
      }

      const title = body.title?.trim();
      if (!title || title.length === 0 || title.length > 100) {
        return { status: 400, jsonBody: { error: 'Topic title must be 1-100 characters' } };
      }

      // Check voter registration
      let voter: VoterEntity;
      try {
        voter = await votersTable.getEntity<VoterEntity>(sessionId, email);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return { status: 400, jsonBody: { error: 'You must register for this session first' } };
        }
        throw error;
      }

      // Check topic limit
      if (voter.topicsSubmitted >= MAX_TOPICS_PER_SESSION) {
        return { status: 400, jsonBody: { error: `Maximum ${MAX_TOPICS_PER_SESSION} topics per session` } };
      }

      const topicId = randomUUID();
      const isFirstTopic = voter.topicsSubmitted === 0;

      const topicEntity: TopicEntity = {
        partitionKey: sessionId,
        rowKey: topicId,
        title: sanitizeText(title),
        submittedBy: email,
        speakerName: voter.displayName,
        status: 'pending',
        voteCount: 0,
        createdAt: new Date(),
      };

      await topicsTable.createEntity(topicEntity);

      // Update voter: increment topicsSubmitted, grant initial votes on first topic
      const voterUpdates: Record<string, unknown> & { partitionKey: string; rowKey: string } = {
        partitionKey: sessionId,
        rowKey: email,
        topicsSubmitted: voter.topicsSubmitted + 1,
      };

      if (isFirstTopic) {
        voterUpdates.totalVotesGranted = INITIAL_VOTES;
        voterUpdates.lastVoteGrantedAt = new Date();
      }

      await votersTable.updateEntity(voterUpdates, 'Merge');

      return {
        status: 201,
        jsonBody: {
          id: topicId,
          sessionId,
          title: topicEntity.title,
          status: 'pending',
          voteCount: 0,
          createdAt: topicEntity.createdAt,
          votesGranted: isFirstTopic ? INITIAL_VOTES : 0,
        },
      };
    } catch (error) {
      if (error instanceof AuthError) {
        return { status: error.statusCode, jsonBody: { error: error.message } };
      }
      context.error('Failed to submit topic:', error);
      return { status: 500, jsonBody: { error: 'Failed to submit topic' } };
    }
  },
});

// GET /api/sessions/:id/topics — list topics (role-aware)
app.http('listTopics', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sessions/{sessionId}/topics',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const user = requireAuth(request);

      const result = await resolveSession(request);
      if ('error' in result) return result.error;
      const { sessionId } = result;

      const keeperStatus = await isGamekeeper(user.userDetails);

      const topics: Array<Record<string, unknown>> = [];
      const entities = topicsTable.listEntities<TopicEntity>({
        queryOptions: { filter: `PartitionKey eq '${sessionId}'` },
      });

      for await (const entity of entities) {
        const topic: Record<string, unknown> = {
          id: entity.rowKey,
          sessionId,
          title: entity.title,
          status: entity.status,
          voteCount: entity.voteCount,
          createdAt: entity.createdAt,
        };

        // Gamekeepers see speaker names and submitter info
        if (keeperStatus) {
          topic.speakerName = entity.speakerName;
          topic.submittedBy = entity.submittedBy;
          topic.completedAt = entity.completedAt;
        }

        // Participants can see if they submitted it
        if (entity.submittedBy === user.userDetails.toLowerCase()) {
          topic.isOwn = true;
        }

        topics.push(topic);
      }

      // Sort by vote count descending, then by creation date
      topics.sort((a, b) => {
        const votesDiff = (b.voteCount as number) - (a.voteCount as number);
        if (votesDiff !== 0) return votesDiff;
        return new Date(a.createdAt as string).getTime() - new Date(b.createdAt as string).getTime();
      });

      return { status: 200, jsonBody: topics };
    } catch (error) {
      if (error instanceof AuthError) {
        return { status: error.statusCode, jsonBody: { error: error.message } };
      }
      context.error('Failed to list topics:', error);
      return { status: 500, jsonBody: { error: 'Failed to list topics' } };
    }
  },
});

// DELETE /api/sessions/:id/topics/:topicId — delete own pending topic
app.http('deleteTopic', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'sessions/{sessionId}/topics/{topicId}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const user = requireAuth(request);
      const email = normalizeEmail(user.userDetails);

      const result = await resolveSession(request, { requireActive: true });
      if ('error' in result) return result.error;
      const { sessionId } = result;

      const topicId = request.params.topicId;
      if (!topicId) {
        return { status: 400, jsonBody: { error: 'Topic ID is required' } };
      }

      // Get the topic
      let topic: TopicEntity;
      try {
        topic = await topicsTable.getEntity<TopicEntity>(sessionId, topicId);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return { status: 404, jsonBody: { error: 'Topic not found' } };
        }
        throw error;
      }

      // Only the submitter can delete their own topic
      if (topic.submittedBy !== email) {
        return { status: 403, jsonBody: { error: 'You can only delete your own topics' } };
      }

      // Cannot delete completed topics
      if (topic.status === 'completed') {
        return { status: 400, jsonBody: { error: 'Cannot delete a completed topic' } };
      }

      // Find and delete all votes on this topic, returning votes to voters
      const votesToDelete: VoteEntity[] = [];
      const voteEntities = votesTable.listEntities<VoteEntity>({
        queryOptions: { filter: `PartitionKey eq '${sessionId}'` },
      });

      for await (const vote of voteEntities) {
        if (vote.topicId === topicId) {
          votesToDelete.push(vote);
        }
      }

      // Return votes to each voter
      for (const vote of votesToDelete) {
        try {
          const voter = await votersTable.getEntity<VoterEntity>(sessionId, vote.voterEmail);
          await votersTable.updateEntity({
            partitionKey: sessionId,
            rowKey: vote.voterEmail,
            votesUsed: Math.max(0, voter.votesUsed - vote.count),
          }, 'Merge');
        } catch {
          // Voter may have been removed — skip
        }
        await votesTable.deleteEntity(sessionId, vote.rowKey);
      }

      // Delete the topic
      await topicsTable.deleteEntity(sessionId, topicId);

      // Decrement the submitter's topic count
      try {
        const voter = await votersTable.getEntity<VoterEntity>(sessionId, email);
        await votersTable.updateEntity({
          partitionKey: sessionId,
          rowKey: email,
          topicsSubmitted: Math.max(0, voter.topicsSubmitted - 1),
        }, 'Merge');
      } catch {
        // Voter record may not exist — skip
      }

      return { status: 204, body: undefined };
    } catch (error) {
      if (error instanceof AuthError) {
        return { status: error.statusCode, jsonBody: { error: error.message } };
      }
      context.error('Failed to delete topic:', error);
      return { status: 500, jsonBody: { error: 'Failed to delete topic' } };
    }
  },
});

// PATCH /api/sessions/:id/topics/:topicId — mark complete/pending (gamekeeper only)
app.http('updateTopic', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'sessions/{sessionId}/topics/{topicId}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      await requireGamekeeper(request);

      const result = await resolveSession(request);
      if ('error' in result) return result.error;
      const { sessionId } = result;

      const topicId = request.params.topicId;
      if (!topicId) {
        return { status: 400, jsonBody: { error: 'Topic ID is required' } };
      }

      let body: { status?: string } = {};
      try {
        body = await request.json() as typeof body;
      } catch {
        return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
      }

      if (!body.status || (body.status !== 'pending' && body.status !== 'completed')) {
        return { status: 400, jsonBody: { error: 'Status must be pending or completed' } };
      }

      // Verify topic exists
      let topic: TopicEntity;
      try {
        topic = await topicsTable.getEntity<TopicEntity>(sessionId, topicId);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return { status: 404, jsonBody: { error: 'Topic not found' } };
        }
        throw error;
      }

      const updates: Record<string, unknown> & { partitionKey: string; rowKey: string } = {
        partitionKey: sessionId,
        rowKey: topicId,
        status: body.status,
      };

      if (body.status === 'completed') {
        updates.completedAt = new Date();
      } else {
        updates.completedAt = null;
      }

      await topicsTable.updateEntity(updates, 'Merge');

      return {
        status: 200,
        jsonBody: {
          id: topicId,
          sessionId,
          title: topic.title,
          speakerName: topic.speakerName,
          status: body.status,
          voteCount: topic.voteCount,
          completedAt: body.status === 'completed' ? updates.completedAt : undefined,
        },
      };
    } catch (error) {
      if (error instanceof AuthError) {
        return { status: error.statusCode, jsonBody: { error: error.message } };
      }
      context.error('Failed to update topic:', error);
      return { status: 500, jsonBody: { error: 'Failed to update topic' } };
    }
  },
});
