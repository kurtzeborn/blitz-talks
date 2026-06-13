import type { AuthStatus, Session, Gamekeeper, Topic, VoterStatus, VoteStatus } from '../types';

const API_BASE = '/api';

function getAuthHeader(): Record<string, string> {
  if (import.meta.env.DEV) {
    const mockPrincipal = localStorage.getItem('mockAuthPrincipal');
    if (mockPrincipal) {
      return { 'x-ms-client-principal': btoa(mockPrincipal) };
    }
  }
  return {};
}

export class ApiError extends Error {
  public status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const authHeaders = getAuthHeader();
  const headers: Record<string, string> = { ...authHeaders };
  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      ...headers,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new ApiError(error.error || 'Request failed', response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// ============ Auth ============

export async function fetchAuthStatus(): Promise<AuthStatus> {
  return apiFetch<AuthStatus>('/me');
}

// ============ Sessions ============

export async function createSession(name: string, voteIntervalMinutes?: number): Promise<Session> {
  return apiFetch<Session>('/sessions', {
    method: 'POST',
    body: JSON.stringify({ name, voteIntervalMinutes }),
  });
}

export async function fetchSessions(): Promise<Session[]> {
  return apiFetch<Session[]>('/sessions');
}

export async function fetchSession(sessionId: string): Promise<Session> {
  return apiFetch<Session>(`/sessions/${sessionId}`);
}

export async function updateSession(sessionId: string, updates: { status?: string; name?: string; voteIntervalMinutes?: number }): Promise<Session> {
  return apiFetch<Session>(`/sessions/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

// ============ Gamekeepers ============

export async function fetchGamekeepers(): Promise<Gamekeeper[]> {
  return apiFetch<Gamekeeper[]>('/gamekeepers');
}

export async function inviteGamekeeper(email: string): Promise<Gamekeeper> {
  return apiFetch<Gamekeeper>('/gamekeepers', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function removeGamekeeper(email: string): Promise<void> {
  return apiFetch<void>(`/gamekeepers/${encodeURIComponent(email)}`, { method: 'DELETE' });
}

// ============ Voters ============

export async function fetchVoterStatus(sessionId: string): Promise<VoterStatus> {
  return apiFetch<VoterStatus>(`/sessions/${sessionId}/voter`);
}

export async function registerVoter(sessionId: string, displayName: string): Promise<VoterStatus> {
  return apiFetch<VoterStatus>(`/sessions/${sessionId}/register`, {
    method: 'POST',
    body: JSON.stringify({ displayName }),
  });
}

// ============ Topics ============

export async function fetchTopics(sessionId: string): Promise<Topic[]> {
  return apiFetch<Topic[]>(`/sessions/${sessionId}/topics`);
}

export async function submitTopic(sessionId: string, title: string): Promise<Topic & { votesGranted: number }> {
  return apiFetch<Topic & { votesGranted: number }>(`/sessions/${sessionId}/topics`, {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
}

export async function deleteTopic(sessionId: string, topicId: string): Promise<void> {
  return apiFetch<void>(`/sessions/${sessionId}/topics/${topicId}`, { method: 'DELETE' });
}

export async function updateTopicStatus(sessionId: string, topicId: string, status: string): Promise<Topic> {
  return apiFetch<Topic>(`/sessions/${sessionId}/topics/${topicId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

// ============ Votes ============

export async function fetchVoteStatus(sessionId: string): Promise<VoteStatus> {
  return apiFetch<VoteStatus>(`/sessions/${sessionId}/votes/me`);
}

export async function castVote(sessionId: string, topicId: string): Promise<{ topicId: string; count: number; remaining: number }> {
  return apiFetch(`/sessions/${sessionId}/votes`, {
    method: 'POST',
    body: JSON.stringify({ topicId }),
  });
}

export async function withdrawVote(sessionId: string, topicId: string): Promise<{ topicId: string; count: number; remaining: number }> {
  return apiFetch(`/sessions/${sessionId}/votes/${topicId}`, { method: 'DELETE' });
}
