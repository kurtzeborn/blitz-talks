import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, fetchAuthStatus, fetchSession, fetchVoterStatus, registerVoter, fetchTopics, submitTopic, deleteTopic, fetchVoteStatus, castVote, withdrawVote } from '../api';
import type { Topic, VoteStatus } from '../types';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/Toast';

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

  const { data: voteStatus } = useQuery({
    queryKey: ['voteStatus', sessionId],
    queryFn: () => fetchVoteStatus(sessionId!),
    enabled: !!session && voter?.registered === true && (voter?.topicsSubmitted ?? 0) > 0,
    refetchInterval: 30_000,
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
      voteStatus={voteStatus}
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
          <p className="text-red-400 text-sm text-center">
            {registerMutation.error instanceof ApiError ? registerMutation.error.message : 'Failed to join. Please try again.'}
          </p>
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
  voteStatus?: VoteStatus;
  queryClient: ReturnType<typeof useQueryClient>;
}

function SessionView({ sessionId, sessionName, voter, topics, voteStatus, queryClient }: SessionViewProps) {
  const [showTopicForm, setShowTopicForm] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const { toasts, addToast, removeToast } = useToast();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['topics', sessionId] });
    queryClient.invalidateQueries({ queryKey: ['voter', sessionId] });
    queryClient.invalidateQueries({ queryKey: ['voteStatus', sessionId] });
  };

  const submitMutation = useMutation({
    mutationFn: (title: string) => submitTopic(sessionId, title),
    onSuccess: () => {
      invalidateAll();
      setNewTopicTitle('');
      setShowTopicForm(false);
      addToast('Topic submitted!', 'success');
    },
    onError: (error) => {
      addToast(error instanceof ApiError ? error.message : 'Failed to submit topic');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (topicId: string) => deleteTopic(sessionId, topicId),
    onSuccess: () => {
      invalidateAll();
      addToast('Topic deleted', 'info');
    },
    onError: (error) => {
      addToast(error instanceof ApiError ? error.message : 'Failed to delete topic');
    },
  });

  const voteMutation = useMutation({
    mutationFn: (topicId: string) => castVote(sessionId, topicId),
    onMutate: async (topicId) => {
      await queryClient.cancelQueries({ queryKey: ['topics', sessionId] });
      await queryClient.cancelQueries({ queryKey: ['voteStatus', sessionId] });
      const prevTopics = queryClient.getQueryData<Topic[]>(['topics', sessionId]);
      const prevVoteStatus = queryClient.getQueryData<VoteStatus>(['voteStatus', sessionId]);
      queryClient.setQueryData<Topic[]>(['topics', sessionId], old =>
        old?.map(t => t.id === topicId ? { ...t, voteCount: t.voteCount + 1 } : t)
      );
      if (prevVoteStatus) {
        const existing = prevVoteStatus.allocations.find(a => a.topicId === topicId);
        queryClient.setQueryData<VoteStatus>(['voteStatus', sessionId], {
          ...prevVoteStatus,
          remaining: prevVoteStatus.remaining - 1,
          used: prevVoteStatus.used + 1,
          allocations: existing
            ? prevVoteStatus.allocations.map(a => a.topicId === topicId ? { ...a, count: a.count + 1 } : a)
            : [...prevVoteStatus.allocations, { topicId, count: 1 }],
        });
      }
      return { prevTopics, prevVoteStatus };
    },
    onError: (error, _topicId, context) => {
      if (context?.prevTopics) queryClient.setQueryData(['topics', sessionId], context.prevTopics);
      if (context?.prevVoteStatus) queryClient.setQueryData(['voteStatus', sessionId], context.prevVoteStatus);
      addToast(error instanceof ApiError ? error.message : 'Failed to cast vote');
    },
    onSettled: invalidateAll,
  });

  const unvoteMutation = useMutation({
    mutationFn: (topicId: string) => withdrawVote(sessionId, topicId),
    onMutate: async (topicId) => {
      await queryClient.cancelQueries({ queryKey: ['topics', sessionId] });
      await queryClient.cancelQueries({ queryKey: ['voteStatus', sessionId] });
      const prevTopics = queryClient.getQueryData<Topic[]>(['topics', sessionId]);
      const prevVoteStatus = queryClient.getQueryData<VoteStatus>(['voteStatus', sessionId]);
      queryClient.setQueryData<Topic[]>(['topics', sessionId], old =>
        old?.map(t => t.id === topicId ? { ...t, voteCount: Math.max(0, t.voteCount - 1) } : t)
      );
      if (prevVoteStatus) {
        const existing = prevVoteStatus.allocations.find(a => a.topicId === topicId);
        queryClient.setQueryData<VoteStatus>(['voteStatus', sessionId], {
          ...prevVoteStatus,
          remaining: prevVoteStatus.remaining + 1,
          used: prevVoteStatus.used - 1,
          allocations: existing && existing.count <= 1
            ? prevVoteStatus.allocations.filter(a => a.topicId !== topicId)
            : prevVoteStatus.allocations.map(a => a.topicId === topicId ? { ...a, count: a.count - 1 } : a),
        });
      }
      return { prevTopics, prevVoteStatus };
    },
    onError: (error, _topicId, context) => {
      if (context?.prevTopics) queryClient.setQueryData(['topics', sessionId], context.prevTopics);
      if (context?.prevVoteStatus) queryClient.setQueryData(['voteStatus', sessionId], context.prevVoteStatus);
      addToast(error instanceof ApiError ? error.message : 'Failed to withdraw vote');
    },
    onSettled: invalidateAll,
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
        {hasSubmittedTopic && voteStatus && (
          <VoteStatusBar voteStatus={voteStatus} />
        )}

        {/* Topics list */}
        {pendingTopics.length > 0 ? (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-300">Topics ({pendingTopics.length})</h2>
            {pendingTopics.map((topic) => (
              <TopicCard
                key={topic.id}
                topic={topic}
                voteStatus={voteStatus}
                onDelete={topic.isOwn ? () => deleteMutation.mutate(topic.id) : undefined}
                isDeleting={deleteMutation.isPending}
                onVote={voteStatus?.canVote ? () => voteMutation.mutate(topic.id) : undefined}
                onUnvote={voteStatus?.canVote ? () => unvoteMutation.mutate(topic.id) : undefined}
                voting={voteMutation.isPending || unvoteMutation.isPending}
              />
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No topics submitted yet. Be the first!</p>
        )}

      </div>

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}

// --- Vote Status Bar ---

function VoteStatusBar({ voteStatus }: { voteStatus: VoteStatus }) {
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    if (!voteStatus.nextVoteAt) return;
    const target = new Date(voteStatus.nextVoteAt).getTime();
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        setCountdown('now');
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setCountdown(`${mins}:${secs.toString().padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [voteStatus.nextVoteAt]);

  return (
    <div className="mb-6 p-3 bg-gray-800 rounded-lg flex items-center justify-between">
      <span className="text-sm text-gray-300">
        Votes: <span className="font-bold text-white">{voteStatus.remaining}</span> remaining
        <span className="text-gray-500 ml-2">({voteStatus.used}/{voteStatus.totalGranted} used)</span>
      </span>
      {voteStatus.nextVoteAt && countdown !== 'now' && (
        <span className="text-xs text-gray-400">+1 in {countdown}</span>
      )}
      {countdown === 'now' && (
        <span className="text-xs text-green-400">+1 vote available — refresh</span>
      )}
    </div>
  );
}

// --- Topic card ---

function TopicCard({ topic, voteStatus, onDelete, isDeleting, onVote, onUnvote, voting }: {
  topic: Topic;
  voteStatus?: VoteStatus;
  onDelete?: () => void;
  isDeleting: boolean;
  onVote?: () => void;
  onUnvote?: () => void;
  voting: boolean;
}) {
  const myVotes = voteStatus?.allocations?.find(a => a.topicId === topic.id)?.count ?? 0;
  const hasVotesRemaining = (voteStatus?.remaining ?? 0) > 0;

  return (
    <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="font-medium">{topic.title}</p>
          {topic.isOwn && (
            <span className="text-xs text-blue-400">Your topic</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Vote controls */}
          {onUnvote && myVotes > 0 && (
            <button
              onClick={onUnvote}
              disabled={voting}
              className="w-7 h-7 flex items-center justify-center rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 text-sm"
              aria-label="Remove a vote"
              title="Remove a vote"
            >
              −
            </button>
          )}
          <span className="text-lg font-bold text-gray-300 min-w-[2ch] text-center" title={`${topic.voteCount} total votes${myVotes > 0 ? ` (${myVotes} yours)` : ''}`}>
            {topic.voteCount}
          </span>
          {onVote && hasVotesRemaining && (
            <button
              onClick={onVote}
              disabled={voting}
              className="w-7 h-7 flex items-center justify-center rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 text-sm"
              aria-label="Add a vote"
              title="Add a vote"
            >
              +
            </button>
          )}
          {myVotes > 0 && (
            <span className="text-xs text-blue-400 ml-1">×{myVotes}</span>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              disabled={isDeleting}
              className="text-red-400 hover:text-red-300 text-xs disabled:opacity-50 ml-1"
              aria-label="Delete topic"
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
