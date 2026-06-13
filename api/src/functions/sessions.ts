import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sessionsTable } from '../shared/storage.js';
import { requireGamekeeper, AuthError } from '../shared/auth.js';
import { SessionEntity } from '../shared/types.js';
import { validateSessionId, generateSessionCode, getSessionEntity, sanitizeText } from '../shared/helpers.js';

// POST /api/sessions
app.http('createSession', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'sessions',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const user = await requireGamekeeper(request);

      let body: { name?: string; voteIntervalMinutes?: number } = {};
      try {
        body = await request.json() as typeof body;
      } catch {
        return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
      }

      if (!body.name || body.name.trim().length === 0) {
        return { status: 400, jsonBody: { error: 'Session name is required' } };
      }

      const name = body.name.trim();
      if (name.length > 50) {
        return { status: 400, jsonBody: { error: 'Session name must be 50 characters or less' } };
      }

      const voteIntervalMinutes = body.voteIntervalMinutes ?? 120;
      if (voteIntervalMinutes < 30 || voteIntervalMinutes > 1440) {
        return { status: 400, jsonBody: { error: 'Vote interval must be between 30 and 1440 minutes' } };
      }

      const sessionId = await generateSessionCode();

      const entity: SessionEntity = {
        partitionKey: 'session',
        rowKey: sessionId,
        name: sanitizeText(name),
        status: 'active',
        voteIntervalMinutes,
        createdBy: user.userDetails,
        createdAt: new Date(),
      };

      await sessionsTable.createEntity(entity);

      return {
        status: 201,
        jsonBody: {
          id: sessionId,
          name: entity.name,
          status: entity.status,
          voteIntervalMinutes: entity.voteIntervalMinutes,
          createdBy: entity.createdBy,
          createdAt: entity.createdAt,
        },
      };
    } catch (error) {
      if (error instanceof AuthError) {
        return { status: error.statusCode, jsonBody: { error: error.message } };
      }
      context.error('Failed to create session:', error);
      return { status: 500, jsonBody: { error: 'Failed to create session' } };
    }
  },
});

// GET /api/sessions
app.http('listSessions', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sessions',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      await requireGamekeeper(request);

      const sessions: Array<{
        id: string;
        name: string;
        status: string;
        voteIntervalMinutes: number;
        createdAt: Date;
      }> = [];

      const entities = sessionsTable.listEntities<SessionEntity>({
        queryOptions: { filter: "PartitionKey eq 'session'" },
      });

      for await (const entity of entities) {
        sessions.push({
          id: entity.rowKey,
          name: entity.name,
          status: entity.status,
          voteIntervalMinutes: entity.voteIntervalMinutes,
          createdAt: entity.createdAt,
        });
      }

      sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return { status: 200, jsonBody: sessions };
    } catch (error) {
      if (error instanceof AuthError) {
        return { status: error.statusCode, jsonBody: { error: error.message } };
      }
      context.error('Failed to list sessions:', error);
      return { status: 500, jsonBody: { error: 'Failed to list sessions' } };
    }
  },
});

// GET /api/sessions/:id
app.http('getSession', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sessions/{sessionId}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const sessionId = validateSessionId(request.params.sessionId);
      if (!sessionId) {
        return { status: 400, jsonBody: { error: 'Invalid session ID' } };
      }

      const session = await getSessionEntity(sessionId);
      if (!session) {
        return { status: 404, jsonBody: { error: 'Session not found' } };
      }

      return {
        status: 200,
        jsonBody: {
          id: session.rowKey,
          name: session.name,
          status: session.status,
          voteIntervalMinutes: session.voteIntervalMinutes,
          createdAt: session.createdAt,
        },
      };
    } catch (error) {
      context.error('Failed to get session:', error);
      return { status: 500, jsonBody: { error: 'Failed to get session' } };
    }
  },
});

// PATCH /api/sessions/:id
app.http('updateSession', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'sessions/{sessionId}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      await requireGamekeeper(request);

      const sessionId = validateSessionId(request.params.sessionId);
      if (!sessionId) {
        return { status: 400, jsonBody: { error: 'Invalid session ID' } };
      }

      const session = await getSessionEntity(sessionId);
      if (!session) {
        return { status: 404, jsonBody: { error: 'Session not found' } };
      }

      let body: { status?: string; voteIntervalMinutes?: number; name?: string } = {};
      try {
        body = await request.json() as typeof body;
      } catch {
        return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
      }

      const updates: Record<string, unknown> & { partitionKey: string; rowKey: string } = {
        partitionKey: 'session',
        rowKey: sessionId,
      };

      if (body.status !== undefined) {
        if (body.status !== 'active' && body.status !== 'archived') {
          return { status: 400, jsonBody: { error: 'Status must be active or archived' } };
        }
        updates.status = body.status;
      }

      if (body.voteIntervalMinutes !== undefined) {
        if (body.voteIntervalMinutes < 30 || body.voteIntervalMinutes > 1440) {
          return { status: 400, jsonBody: { error: 'Vote interval must be between 30 and 1440 minutes' } };
        }
        updates.voteIntervalMinutes = body.voteIntervalMinutes;
      }

      if (body.name !== undefined) {
        const name = body.name.trim();
        if (name.length === 0 || name.length > 50) {
          return { status: 400, jsonBody: { error: 'Session name must be 1-50 characters' } };
        }
        updates.name = sanitizeText(name);
      }

      await sessionsTable.updateEntity(updates, 'Merge');

      return {
        status: 200,
        jsonBody: {
          id: sessionId,
          name: (updates.name as string) ?? session.name,
          status: (updates.status as string) ?? session.status,
          voteIntervalMinutes: (updates.voteIntervalMinutes as number) ?? session.voteIntervalMinutes,
        },
      };
    } catch (error) {
      if (error instanceof AuthError) {
        return { status: error.statusCode, jsonBody: { error: error.message } };
      }
      context.error('Failed to update session:', error);
      return { status: 500, jsonBody: { error: 'Failed to update session' } };
    }
  },
});
