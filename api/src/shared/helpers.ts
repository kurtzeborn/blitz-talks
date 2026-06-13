import { HttpRequest } from '@azure/functions';
import { sessionsTable } from './storage.js';
import { SessionEntity } from './types.js';

const SESSION_ID_PATTERN = /^[A-Z0-9]{4}$/;

/**
 * Validate and normalize a session ID from request params.
 */
export function validateSessionId(raw: string | undefined): string | null {
  if (!raw) return null;
  const id = raw.toUpperCase();
  return SESSION_ID_PATTERN.test(id) ? id : null;
}

/**
 * Look up a session entity by ID. Returns null if not found.
 */
export async function getSessionEntity(sessionId: string): Promise<SessionEntity | null> {
  try {
    return await sessionsTable.getEntity<SessionEntity>('session', sessionId);
  } catch (error: any) {
    if (error.statusCode === 404) return null;
    throw error;
  }
}

/**
 * Generate a unique 4-character alphanumeric session code.
 */
export async function generateSessionCode(): Promise<string> {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    const existing = await getSessionEntity(code);
    if (!existing) return code;
  }
  throw new Error('Failed to generate unique session code after 10 attempts');
}

/**
 * Validate the session ID from request params and fetch the session entity.
 * Returns { sessionId, session } or an error response.
 */
export async function resolveSession(
  request: HttpRequest,
  opts?: { requireActive?: boolean }
): Promise<{ sessionId: string; session: SessionEntity } | { error: { status: number; jsonBody: { error: string } } }> {
  const sessionId = validateSessionId(request.params.sessionId);
  if (!sessionId) {
    return { error: { status: 400, jsonBody: { error: 'Invalid session ID' } } };
  }

  const session = await getSessionEntity(sessionId);
  if (!session) {
    return { error: { status: 404, jsonBody: { error: 'Session not found' } } };
  }

  if (opts?.requireActive && session.status !== 'active') {
    return { error: { status: 400, jsonBody: { error: 'Session is archived' } } };
  }

  return { sessionId, session };
}
