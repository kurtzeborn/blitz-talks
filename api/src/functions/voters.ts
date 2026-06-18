import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { votersTable } from '../shared/storage.js';
import { requireAuth, AuthError } from '../shared/auth.js';
import { VoterEntity } from '../shared/types.js';
import { resolveSession, normalizeEmail, sanitizeText } from '../shared/helpers.js';

const INITIAL_VOTES = 3;

// GET /api/sessions/:id/voter
app.http('getVoter', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sessions/{sessionId}/voter',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const user = requireAuth(request);

      const result = await resolveSession(request);
      if ('error' in result) return result.error;
      const { sessionId } = result;

      const email = normalizeEmail(user.userDetails);
      try {
        const voter = await votersTable.getEntity<VoterEntity>(sessionId, email);
        return {
          status: 200,
          jsonBody: {
            registered: true,
            displayName: voter.displayName,
            topicsSubmitted: voter.topicsSubmitted,
            totalVotesGranted: voter.totalVotesGranted,
            votesUsed: voter.votesUsed,
            lastVoteGrantedAt: voter.lastVoteGrantedAt,
            registeredAt: voter.registeredAt,
          },
        };
      } catch (error: any) {
        if (error.statusCode === 404) {
          return { status: 200, jsonBody: { registered: false } };
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof AuthError) {
        return { status: error.statusCode, jsonBody: { error: error.message } };
      }
      context.error('Failed to get voter:', error);
      return { status: 500, jsonBody: { error: 'Failed to get voter status' } };
    }
  },
});

// POST /api/sessions/:id/register
app.http('registerVoter', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'sessions/{sessionId}/register',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const user = requireAuth(request);

      const result = await resolveSession(request, { requireActive: true });
      if ('error' in result) return result.error;
      const { sessionId, session } = result;

      let body: { displayName?: string } = {};
      try {
        body = await request.json() as typeof body;
      } catch {
        return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
      }

      const displayName = body.displayName?.trim();
      if (!displayName || displayName.length === 0 || displayName.length > 30) {
        return { status: 400, jsonBody: { error: 'Display name must be 1-30 characters' } };
      }

      const email = normalizeEmail(user.userDetails);

      // Check if already registered
      try {
        await votersTable.getEntity<VoterEntity>(sessionId, email);
        return { status: 409, jsonBody: { error: 'Already registered for this session' } };
      } catch (error: any) {
        if (error.statusCode !== 404) throw error;
      }

      // Grant initial votes immediately if topic requirement is off
      const grantVotes = session.requireTopicToVote === false;

      const entity: VoterEntity = {
        partitionKey: sessionId,
        rowKey: email,
        displayName: sanitizeText(displayName),
        topicsSubmitted: 0,
        totalVotesGranted: grantVotes ? INITIAL_VOTES : 0,
        votesUsed: 0,
        lastVoteGrantedAt: new Date(),
        registeredAt: new Date(),
      };

      await votersTable.createEntity(entity);

      return {
        status: 201,
        jsonBody: {
          registered: true,
          displayName: entity.displayName,
          topicsSubmitted: 0,
          totalVotesGranted: entity.totalVotesGranted,
          votesUsed: 0,
        },
      };
    } catch (error) {
      if (error instanceof AuthError) {
        return { status: error.statusCode, jsonBody: { error: error.message } };
      }
      context.error('Failed to register voter:', error);
      return { status: 500, jsonBody: { error: 'Failed to register' } };
    }
  },
});
