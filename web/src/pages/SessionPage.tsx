import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAuthStatus, fetchSession, fetchVoterStatus, registerVoter, fetchTopics, submitTopic, deleteTopic } from '../api';
import type { Topic } from '../types';

export function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: auth, isLoading: authLoading } = useQuery({
    queryKey: ['auth'],
    queryFn: fetchAuthStatus,
  });

  const { data: session, isLoading: sessionLoading, error: sessionError } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => fetchSession(sessionId!),
    enabled: !!sessionId && auth?.isAuthenticated === true,
  });

  const { data: voter, isLoading: voterLoading } = useQuery({
    queryKey: ['voter', sessionId],
    queryFn: () => fetchVoterStatus(sessionId!),
    enabled: !!session,
  });

  const { data: topics } = useQuery({
    queryKey: ['topics', sessionId],
    queryFn: () => fetchTopics(sessionId!),
    enabled: !!session && voter?.registered === true,
    refetchInterval: 10_000,
  });

  if (authLoading) {
    return <PageShell>Loading...</PageShell>;
  }

  if (!auth?.isAuthenticated) {
    return (
      <PageShell>
        <h2 className="text-2xl font-bold mb-4">Sign in to participate</h2>
        <p className="text-gray-400 mb-6">You need a Microsoft account to submit topics and vote.</p>
        <a
          href={`/.auth/login/aad?post_login_redirect_uri=${window.location.pathname}`}
          className="px-6 py-3 bg-blue-600 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          Sign in with Microsoft
        </a>
      </PageShell>
    );
  }

  if (sessionLoading || voterLoading) {
    return <PageShell>Loading session...</PageShell>;
  }

  if (sessionError || !session) {
    return (
      <PageShell>
        <h2 className="text-2xl font-bold mb-4">Session not found</h2>
        <p className="text-gray-400 mb-6">Code "{sessionId}" doesn't match any active session.</p>
        <button onClick={() => navigate('/')} className="text-blue-400 hover:text-blue-300">
          ← Back to home
        </button>
      </PageShell>
    );
  }

  if (!voter?.registered) {
    return <RegistrationForm sessionId={sessionId!} suggestedName={auth.suggestedName} />;
  }

  return (
    <SessionView
      sessionId={sessionId!}
      sessionName={session.name}
      voter={voter}
      topics={topics || []}
      queryClient={queryClient}
    />
  );
}

// --- Shell layout ---

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      {typeof children === 'string' ? <p className="text-gray-400">{children}</p> : children}
    </div>
  );
}

// --- Registration form ---

function RegistrationForm({ sessionId, suggestedName }: { sessionId: string; suggestedName?: string }) {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(suggestedName || '');

  const registerMutation = useMutation({
    mutationFn: (name: string) => registerVoter(sessionId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voter', sessionId] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = displayName.trim();
    if (name) {
      registerMutation.mutate(name);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <h2 className="text-2xl font-bold mb-2">⚡ Join Session</h2>
      <p className="text-gray-400 mb-6">Confirm your display name to get started.</p>

      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div>
          <label htmlFor="display-name" className="block text-sm font-medium text-gray-300 mb-1">
            Your name
          </label>
          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={30}
            placeholder="e.g., Scott K."
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>
        <button
          type="submit"
          disabled={!displayName.trim() || registerMutation.isPending}
          className="w-full px-4 py-3 bg-blue-600 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {registerMutation.isPending ? 'Joining...' : 'Join Session'}
        </button>
        {registerMutation.isError && (
          <p className="text-red-400 text-sm text-center">Failed to join. Please try again.</p>
        )}
      </form>
    </div>
  );
}

// --- Main session view ---

interface SessionViewProps {
  sessionId: string;
  sessionName: string;
  voter: { topicsSubmitted?: number; totalVotesGranted?: number; votesUsed?: number; displayName?: string };
  topics: Topic[];
  queryClient: ReturnType<typeof useQueryClient>;
}

function SessionView({ sessionId, sessionName, voter, topics, queryClient }: SessionViewProps) {
  const [showTopicForm, setShowTopicForm] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState('');

  const submitMutation = useMutation({
    mutationFn: (title: string) => submitTopic(sessionId, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topics', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['voter', sessionId] });
      setNewTopicTitle('');
      setShowTopicForm(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (topicId: string) => deleteTopic(sessionId, topicId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topics', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['voter', sessionId] });
    },
  });

  const handleSubmitTopic = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTopicTitle.trim();
    if (title) {
      submitMutation.mutate(title);
    }
  };

  const topicsSubmitted = voter.topicsSubmitted ?? 0;
  const canSubmitMore = topicsSubmitted < 3;
  const hasSubmittedTopic = topicsSubmitted > 0;
  const remaining = (voter.totalVotesGranted ?? 0) - (voter.votesUsed ?? 0);
  const pendingTopics = topics.filter(t => t.status === 'pending');

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">⚡ {sessionName}</h1>
          <p className="text-gray-400 text-sm">Signed in as {voter.displayName}</p>
        </div>

        {/* Topic submission */}
        {canSubmitMore && (
          <div className="mb-6">
            {!showTopicForm ? (
              <button
                onClick={() => setShowTopicForm(true)}
                className="w-full px-4 py-3 bg-gray-800 border border-dashed border-gray-600 rounded-lg text-gray-300 hover:border-blue-500 hover:text-white transition-colors"
              >
                + Submit a topic ({3 - topicsSubmitted} remaining)
              </button>
            ) : (
              <form onSubmit={handleSubmitTopic} className="space-y-3">
                <div>
                  <label htmlFor="topic-title" className="block text-sm font-medium text-gray-300 mb-1">
                    What would you like to talk about?
                  </label>
                  <input
                    id="topic-title"
                    type="text"
                    value={newTopicTitle}
                    onChange={(e) => setNewTopicTitle(e.target.value)}
                    maxLength={100}
                    placeholder="e.g., How I automated my deploy pipeline"
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={!newTopicTitle.trim() || submitMutation.isPending}
                    className="flex-1 px-4 py-2 bg-blue-600 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {submitMutation.isPending ? 'Submitting...' : 'Submit Topic'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowTopicForm(false); setNewTopicTitle(''); }}
                    className="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                {submitMutation.isError && (
                  <p className="text-red-400 text-sm">Failed to submit topic. Please try again.</p>
                )}
              </form>
            )}
          </div>
        )}

        {/* Prompt to submit first topic */}
        {!hasSubmittedTopic && (
          <div className="mb-6 p-4 bg-yellow-900/30 border border-yellow-700/50 rounded-lg">
            <p className="text-yellow-200 text-sm">Submit at least 1 topic to unlock voting ({remaining > 0 ? `${remaining} votes ready` : '3 votes will be granted'}).</p>
          </div>
        )}

        {/* Vote status bar */}
        {hasSubmittedTopic && (
          <div className="mb-6 p-3 bg-gray-800 rounded-lg flex items-center justify-between">
            <span className="text-sm text-gray-300">
              Votes remaining: <span className="font-bold text-white">{remaining}</span>
            </span>
            <span className="text-xs text-gray-500">
              Voting coming in Phase 3
            </span>
          </div>
        )}

        {/* Topics list */}
        {pendingTopics.length > 0 ? (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-300">Topics ({pendingTopics.length})</h2>
            {pendingTopics.map((topic) => (
              <TopicCard
                key={topic.id}
                topic={topic}
                onDelete={topic.isOwn ? () => deleteMutation.mutate(topic.id) : undefined}
                isDeleting={deleteMutation.isPending}
              />
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No topics submitted yet. Be the first!</p>
        )}

        {/* Footer nav */}
        <div className="mt-8 text-center">
          <a href="/" className="text-gray-500 hover:text-gray-300 text-sm">← Back to home</a>
        </div>
      </div>
    </div>
  );
}

// --- Topic card ---

function TopicCard({ topic, onDelete, isDeleting }: { topic: Topic; onDelete?: () => void; isDeleting: boolean }) {
  return (
    <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="font-medium">{topic.title}</p>
          {topic.isOwn && (
            <span className="text-xs text-blue-400">Your topic</span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-lg font-bold text-gray-300">{topic.voteCount}</span>
          {onDelete && (
            <button
              onClick={onDelete}
              disabled={isDeleting}
              className="text-red-400 hover:text-red-300 text-xs disabled:opacity-50"
              title="Delete topic"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
