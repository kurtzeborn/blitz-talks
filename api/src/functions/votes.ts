import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { votesTable, votersTable, topicsTable } from '../shared/storage.js';
import { requireAuth, AuthError } from '../shared/auth.js';
import { VoteEntity, VoterEntity, TopicEntity } from '../shared/types.js';
import { resolveSession } from '../shared/helpers.js';

const MIN_DISTINCT_FOR_STACKING = 3;

/**
 * Get all vote entities for a voter in a session.
 */
async function getVoterVotes(sessionId: string, email: string): Promise<VoteEntity[]> {
  const votes: VoteEntity[] = [];
  const entities = votesTable.listEntities<VoteEntity>({
    queryOptions: { filter: `PartitionKey eq '${sessionId}'` },
  });
  for await (const entity of entities) {
    if (entity.voterEmail === email) {
      votes.push(entity);
    }
  }
  return votes;
}

/**
 * Check vote regeneration: if enough time has passed, grant +1 vote.
 * Returns the updated voter entity and whether a vote was granted.
 */
async function checkVoteRegeneration(
  sessionId: string,
  voter: VoterEntity,
  voteIntervalMinutes: number
): Promise<{ voter: VoterEntity; granted: boolean }> {
  if (voter.topicsSubmitted === 0) {
    return { voter, granted: false };
  }

  const now = new Date();
  const lastGranted = new Date(voter.lastVoteGrantedAt);
  const elapsed = (now.getTime() - lastGranted.getTime()) / (1000 * 60);

  if (elapsed >= voteIntervalMinutes) {
    const updatedVoter = {
      ...voter,
      totalVotesGranted: voter.totalVotesGranted + 1,
      lastVoteGrantedAt: now,
    };

    await votersTable.updateEntity({
      partitionKey: sessionId,
      rowKey: voter.rowKey,
      totalVotesGranted: updatedVoter.totalVotesGranted,
      lastVoteGrantedAt: now,
    }, 'Merge');

    return { voter: updatedVoter, granted: true };
  }

  return { voter, granted: false };
}

// GET /api/sessions/:id/votes/me — vote status + regeneration check
app.http('getMyVotes', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sessions/{sessionId}/votes/me',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const user = requireAuth(request);
      const email = user.userDetails.toLowerCase();

      const result = await resolveSession(request);
      if ('error' in result) return result.error;
      const { sessionId, session } = result;

      // Get voter record
      let voter: VoterEntity;
      try {
        voter = await votersTable.getEntity<VoterEntity>(sessionId, email);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return { status: 200, jsonBody: { canVote: false, remaining: 0, totalGranted: 0, used: 0, allocations: [] } };
        }
        throw error;
      }

      // Check vote regeneration
      const regen = await checkVoteRegeneration(sessionId, voter, session.voteIntervalMinutes);
      voter = regen.voter;

      // Get current vote allocations
      const votes = await getVoterVotes(sessionId, email);
      const allocations = votes.map(v => ({ topicId: v.topicId, count: v.count }));

      const remaining = voter.totalVotesGranted - voter.votesUsed;
      const lastGranted = new Date(voter.lastVoteGrantedAt);
      const nextVoteAt = new Date(lastGranted.getTime() + session.voteIntervalMinutes * 60 * 1000);

      return {
        status: 200,
        jsonBody: {
          canVote: voter.topicsSubmitted > 0,
          remaining,
          totalGranted: voter.totalVotesGranted,
          used: voter.votesUsed,
          allocations,
          nextVoteAt: nextVoteAt.toISOString(),
          voteGranted: regen.granted,
        },
      };
    } catch (error) {
      if (error instanceof AuthError) {
        return { status: error.statusCode, jsonBody: { error: error.message } };
      }
      context.error('Failed to get vote status:', error);
      return { status: 500, jsonBody: { error: 'Failed to get vote status' } };
    }
  },
});

// POST /api/sessions/:id/votes — cast a vote
app.http('castVote', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'sessions/{sessionId}/votes',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const user = requireAuth(request);
      const email = user.userDetails.toLowerCase();

      const result = await resolveSession(request, { requireActive: true });
      if ('error' in result) return result.error;
      const { sessionId } = result;

      let body: { topicId?: string } = {};
      try {
        body = await request.json() as typeof body;
      } catch {
        return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
      }

      if (!body.topicId) {
        return { status: 400, jsonBody: { error: 'topicId is required' } };
      }

      const topicId = body.topicId;

      // Verify voter exists and has submitted a topic
      let voter: VoterEntity;
      try {
        voter = await votersTable.getEntity<VoterEntity>(sessionId, email);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return { status: 400, jsonBody: { error: 'You must register for this session first' } };
        }
        throw error;
      }

      if (voter.topicsSubmitted === 0) {
        return { status: 400, jsonBody: { error: 'Submit at least 1 topic before voting' } };
      }

      // Check remaining votes
      const remaining = voter.totalVotesGranted - voter.votesUsed;
      if (remaining <= 0) {
        return { status: 400, jsonBody: { error: 'No votes remaining' } };
      }

      // Verify topic exists and is pending
      let topic: TopicEntity;
      try {
        topic = await topicsTable.getEntity<TopicEntity>(sessionId, topicId);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return { status: 404, jsonBody: { error: 'Topic not found' } };
        }
        throw error;
      }

      if (topic.status === 'completed') {
        return { status: 400, jsonBody: { error: 'Cannot vote on a completed topic' } };
      }

      // Get current vote allocations for stacking check
      const existingVotes = await getVoterVotes(sessionId, email);
      const voteRowKey = `${email}#${topicId}`;
      const existingVote = existingVotes.find(v => v.topicId === topicId);
      const distinctTopics = new Set(existingVotes.filter(v => v.count > 0).map(v => v.topicId));

      // Stacking check: if already voted on this topic, require ≥3 distinct topics
      if (existingVote && existingVote.count > 0) {
        if (distinctTopics.size < MIN_DISTINCT_FOR_STACKING) {
          return {
            status: 400,
            jsonBody: {
              error: `Vote on at least ${MIN_DISTINCT_FOR_STACKING} different topics before adding more votes to one`,
            },
          };
        }
      }

      // Upsert vote record
      if (existingVote) {
        await votesTable.updateEntity({
          partitionKey: sessionId,
          rowKey: voteRowKey,
          count: existingVote.count + 1,
          updatedAt: new Date(),
        }, 'Merge');
      } else {
        const voteEntity: VoteEntity = {
          partitionKey: sessionId,
          rowKey: voteRowKey,
          topicId,
          voterEmail: email,
          count: 1,
          updatedAt: new Date(),
        };
        await votesTable.createEntity(voteEntity);
      }

      // Increment voter's votesUsed
      await votersTable.updateEntity({
        partitionKey: sessionId,
        rowKey: email,
        votesUsed: voter.votesUsed + 1,
      }, 'Merge');

      // Increment topic's voteCount
      await topicsTable.updateEntity({
        partitionKey: sessionId,
        rowKey: topicId,
        voteCount: topic.voteCount + 1,
      }, 'Merge');

      return {
        status: 200,
        jsonBody: {
          topicId,
          count: (existingVote?.count ?? 0) + 1,
          remaining: remaining - 1,
        },
      };
    } catch (error) {
      if (error instanceof AuthError) {
        return { status: error.statusCode, jsonBody: { error: error.message } };
      }
      context.error('Failed to cast vote:', error);
      return { status: 500, jsonBody: { error: 'Failed to cast vote' } };
    }
  },
});

// DELETE /api/sessions/:id/votes/:topicId — withdraw a vote
app.http('withdrawVote', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'sessions/{sessionId}/votes/{topicId}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const user = requireAuth(request);
      const email = user.userDetails.toLowerCase();

      const result = await resolveSession(request, { requireActive: true });
      if ('error' in result) return result.error;
      const { sessionId } = result;

      const topicId = request.params.topicId;
      if (!topicId) {
        return { status: 400, jsonBody: { error: 'Topic ID is required' } };
      }

      // Verify topic exists and is not completed (votes on completed topics are locked)
      let topic: TopicEntity;
      try {
        topic = await topicsTable.getEntity<TopicEntity>(sessionId, topicId);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return { status: 404, jsonBody: { error: 'Topic not found' } };
        }
        throw error;
      }

      if (topic.status === 'completed') {
        return { status: 400, jsonBody: { error: 'Cannot withdraw votes from a completed topic' } };
      }

      // Get the vote record
      const voteRowKey = `${email}#${topicId}`;
      let vote: VoteEntity;
      try {
        vote = await votesTable.getEntity<VoteEntity>(sessionId, voteRowKey);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return { status: 404, jsonBody: { error: 'No vote found for this topic' } };
        }
        throw error;
      }

      if (vote.count <= 0) {
        return { status: 400, jsonBody: { error: 'No votes to withdraw' } };
      }

      // Decrement or delete vote record
      if (vote.count === 1) {
        await votesTable.deleteEntity(sessionId, voteRowKey);
      } else {
        await votesTable.updateEntity({
          partitionKey: sessionId,
          rowKey: voteRowKey,
          count: vote.count - 1,
          updatedAt: new Date(),
        }, 'Merge');
      }

      // Decrement voter's votesUsed
      let voter: VoterEntity;
      try {
        voter = await votersTable.getEntity<VoterEntity>(sessionId, email);
        await votersTable.updateEntity({
          partitionKey: sessionId,
          rowKey: email,
          votesUsed: Math.max(0, voter.votesUsed - 1),
        }, 'Merge');
      } catch {
        // Voter not found — edge case, skip
      }

      // Decrement topic's voteCount
      await topicsTable.updateEntity({
        partitionKey: sessionId,
        rowKey: topicId,
        voteCount: Math.max(0, topic.voteCount - 1),
      }, 'Merge');

      return {
        status: 200,
        jsonBody: {
          topicId,
          count: vote.count - 1,
          remaining: voter! ? voter.totalVotesGranted - voter.votesUsed + 1 : 0,
        },
      };
    } catch (error) {
      if (error instanceof AuthError) {
        return { status: error.statusCode, jsonBody: { error: error.message } };
      }
      context.error('Failed to withdraw vote:', error);
      return { status: 500, jsonBody: { error: 'Failed to withdraw vote' } };
    }
  },
});
