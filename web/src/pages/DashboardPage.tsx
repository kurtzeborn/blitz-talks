import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAuthStatus, fetchSessions, createSession, deleteSession } from '../api';
import type { Session } from '../types';

export function DashboardPage() {
  const queryClient = useQueryClient();
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionRequireTopic, setNewSessionRequireTopic] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: auth, isLoading: authLoading } = useQuery({
    queryKey: ['auth'],
    queryFn: fetchAuthStatus,
  });

  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: fetchSessions,
    enabled: auth?.isGamekeeper === true,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => createSession(name, undefined, newSessionRequireTopic),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      setNewSessionName('');
      setNewSessionRequireTopic(true);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) => deleteSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      setDeleteConfirm(null);
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!auth?.isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
        <h2 className="text-2xl font-bold mb-4">Gamekeeper Dashboard</h2>
        <a
          href="/.auth/login/aad?post_login_redirect_uri=/dashboard"
          className="px-6 py-3 bg-blue-600 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          Sign in with Microsoft
        </a>
      </div>
    );
  }

  if (!auth.isGamekeeper) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
        <h2 className="text-2xl font-bold mb-4">Access Denied</h2>
        <p className="text-gray-400 mb-2">
          You're signed in as <span className="text-white">{auth.user?.userDetails}</span> but you're not authorized as a gamekeeper.
        </p>
        <p className="text-gray-500">Ask an existing gamekeeper to invite you.</p>
        <a href="/.auth/logout" className="mt-4 text-blue-400 hover:text-blue-300 text-sm">
          Sign out
        </a>
      </div>
    );
  }

  const handleCreateSession = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newSessionName.trim();
    if (name) {
      createMutation.mutate(name);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">⚡ Blitz Talks Dashboard</h1>
          <div className="flex items-center gap-4">
            <a href="/dashboard/keepers" className="text-blue-400 hover:text-blue-300 text-sm">
              Manage Keepers
            </a>
            <a href="/.auth/logout" className="text-gray-400 hover:text-gray-300 text-sm">
              Sign out
            </a>
          </div>
        </div>

        <form onSubmit={handleCreateSession} className="mb-8 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              placeholder="New session name (e.g., Team Offsite 2026)"
              maxLength={50}
              className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={!newSessionName.trim() || createMutation.isPending}
              className="px-6 py-2 bg-blue-600 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Session'}
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={!newSessionRequireTopic}
              onChange={(e) => setNewSessionRequireTopic(!e.target.checked)}
              className="rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
            />
            Allow voting without submitting a topic
          </label>
        </form>

        {createMutation.isError && (
          <p className="text-red-400 mb-4">Failed to create session. Please try again.</p>
        )}

        {sessionsLoading ? (
          <p className="text-gray-400">Loading sessions...</p>
        ) : (
          <div className="space-y-3">
            {sessions?.length === 0 && (
              <p className="text-gray-500">No sessions yet. Create one above.</p>
            )}
            {sessions?.map((session: Session) => (
              <div
                key={session.id}
                className="flex items-center gap-2"
              >
                <a
                  href={`/dashboard/${session.id}`}
                  className="flex-1 block p-4 bg-gray-800 rounded-lg hover:bg-gray-750 transition-colors border border-gray-700"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">{session.name}</h3>
                      <p className="text-gray-400 text-sm">Code: {session.id}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      session.status === 'active'
                        ? 'bg-green-900 text-green-300'
                        : 'bg-gray-700 text-gray-400'
                    }`}>
                      {session.status}
                    </span>
                  </div>
                </a>
                {deleteConfirm === session.id ? (
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => deleteMutation.mutate(session.id)}
                      disabled={deleteMutation.isPending}
                      className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 disabled:opacity-50"
                    >
                      {deleteMutation.isPending ? '...' : 'Confirm'}
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded hover:bg-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(session.id)}
                    className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                    title="Delete session"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
