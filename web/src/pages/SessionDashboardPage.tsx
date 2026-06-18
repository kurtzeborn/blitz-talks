import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { fetchAuthStatus, fetchSession, fetchTopics, updateTopicStatus, updateSession } from '../api';
import type { Topic, Session } from '../types';

export function SessionDashboardPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const queryClient = useQueryClient();
  const [showNames, setShowNames] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const [confirmTarget, setConfirmTarget] = useState<{ topicId: string; title: string; action: 'complete' | 'revert' } | null>(null);

  const { data: auth } = useQuery({
    queryKey: ['auth'],
    queryFn: fetchAuthStatus,
  });

  const { data: session } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => fetchSession(sessionId!),
    enabled: !!sessionId && auth?.isGamekeeper === true,
  });

  const { data: topics, dataUpdatedAt } = useQuery({
    queryKey: ['topics', sessionId],
    queryFn: () => fetchTopics(sessionId!),
    enabled: !!session,
    refetchInterval: 5_000,
  });

  const markCompleteMutation = useMutation({
    mutationFn: ({ topicId, status }: { topicId: string; status: string }) =>
      updateTopicStatus(sessionId!, topicId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topics', sessionId] });
      setConfirmTarget(null);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => updateSession(sessionId!, { status: 'archived' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    },
  });

  const toggleTopicRequirementMutation = useMutation({
    mutationFn: (requireTopicToVote: boolean) => updateSession(sessionId!, { requireTopicToVote }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    },
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['topics', sessionId] });
    queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
  };

  if (!auth?.isGamekeeper) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-gray-400">Gamekeeper access required.</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-gray-400">Loading session...</p>
      </div>
    );
  }

  const sessionUrl = `${window.location.origin}/session/${sessionId}`;
  const pendingTopics = (topics || []).filter((t: Topic) => t.status === 'pending');
  const completedTopics = (topics || []).filter((t: Topic) => t.status === 'completed');
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '';

  // Build stable anonymous speaker labels from all topics
  const allTopics = [...pendingTopics, ...completedTopics];
  const uniqueSpeakers = [...new Set(allTopics.map(t => t.speakerName))];
  const speakerLabel = (name: string | undefined) => {
    if (!name) return showNames ? 'Unknown' : 'Speaker ?';
    return showNames ? name : `Speaker ${uniqueSpeakers.indexOf(name) + 1}`;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-4xl font-bold">⚡ {session.name}</h1>
            <p className="text-gray-400 mt-1">
              {session.status === 'active' ? 'Session active' : 'Session archived'}
              {' · '}{(topics || []).length} topics
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a href="/dashboard" className="text-blue-400 hover:text-blue-300 text-sm">← Dashboard</a>
            <button
              onClick={handleRefresh}
              className="px-3 py-1 bg-gray-700 rounded text-sm hover:bg-gray-600 transition-colors"
              title="Refresh now"
            >
              ↻ Refresh
            </button>
            {session.status === 'active' && (
              <button
                onClick={() => archiveMutation.mutate()}
                disabled={archiveMutation.isPending}
                className="px-3 py-1 bg-gray-700 rounded text-sm hover:bg-gray-600 transition-colors"
              >
                Archive
              </button>
            )}
          </div>
        </div>

        {/* QR Code + Session Code */}
        <div className="flex items-center gap-6 mb-4 p-4 bg-gray-800 rounded-xl">
          <div className="bg-white p-3 rounded-lg">
            <QRCodeSVG value={sessionUrl} size={180} aria-label={`QR code to join session ${sessionId}`} />
          </div>
          <div>
            <p className="text-gray-400 text-sm mb-1">Scan to submit &amp; vote</p>
            <p className="text-6xl font-mono font-bold tracking-widest">{sessionId}</p>
            <p className="text-gray-500 text-sm mt-2">{sessionUrl}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">📋 Pending Topics ({pendingTopics.length})</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">Updated {lastUpdated}</span>
            <button
              onClick={() => toggleTopicRequirementMutation.mutate(!(session as Session).requireTopicToVote)}
              disabled={toggleTopicRequirementMutation.isPending}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                (session as Session).requireTopicToVote === false ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-700 hover:bg-gray-600'
              }`}
              title={(session as Session).requireTopicToVote === false
                ? 'Topic NOT required to vote (click to require)'
                : 'Topic required to vote (click to allow voting without topic)'}
            >
              {(session as Session).requireTopicToVote === false ? '🗳️ Open Voting' : '🔒 Topic Required'}
            </button>
            <button
              onClick={() => setShowNames(!showNames)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                showNames ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              {showNames ? 'Hide Names' : 'Show Names'}
            </button>
          </div>
        </div>

        {/* Pending topics table */}
        {pendingTopics.length > 0 ? (
          <div className="bg-gray-800 rounded-lg overflow-hidden mb-4">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left px-2 py-1 text-gray-400 font-medium text-xs w-8">#</th>
                  <th className="text-left px-2 py-1 text-gray-400 font-medium text-xs">Topic</th>
                  <th className="text-left px-2 py-1 text-gray-400 font-medium text-xs w-36 hidden md:table-cell">Speaker</th>
                  <th className="text-center px-2 py-1 text-gray-400 font-medium text-xs w-16">Votes</th>
                  <th className="text-center px-2 py-1 text-gray-400 font-medium text-xs w-20"></th>
                </tr>
              </thead>
              <tbody>
                {pendingTopics.map((topic: Topic, i: number) => (
                  <tr key={topic.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="px-2 py-1 text-gray-500 text-sm">{i + 1}</td>
                    <td className="px-2 py-1 font-medium text-sm">{topic.title}</td>
                    <td className="px-2 py-1 text-gray-300 text-sm hidden md:table-cell">{speakerLabel(topic.speakerName)}</td>
                    <td className="px-2 py-1 text-center text-lg font-bold">{topic.voteCount}</td>
                    <td className="px-2 py-1 text-center">
                      <button
                        onClick={() => setConfirmTarget({ topicId: topic.id, title: topic.title, action: 'complete' })}
                        disabled={markCompleteMutation.isPending}
                        className="px-2 py-1 bg-green-700 hover:bg-green-600 rounded text-xs font-medium transition-colors"
                      >
                        ✓ Done
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4 bg-gray-800 rounded-lg text-center mb-4">
            <p className="text-gray-400 text-sm">
              {completedTopics.length > 0 ? '🎉 All talks complete!' : 'No topics submitted yet.'}
            </p>
          </div>
        )}

        {/* Completed topics — collapsible */}
        {completedTopics.length > 0 && (
          <div className="mb-4">
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="flex items-center gap-2 text-sm font-semibold text-gray-400 hover:text-gray-300 transition-colors mb-2"
            >
              <span className="text-xs">{showCompleted ? '▼' : '▶'}</span>
              ✅ Completed ({completedTopics.length})
            </button>
            {showCompleted && (
              <div className="bg-gray-800 rounded-lg overflow-hidden">
                <table className="w-full">
                  <tbody>
                    {completedTopics.map((topic: Topic) => (
                      <tr key={topic.id} className="border-b border-gray-700/50">
                        <td className="px-2 py-1 text-gray-400 text-sm">{topic.title}</td>
                        <td className="px-2 py-1 text-gray-500 text-sm w-36 hidden md:table-cell">{speakerLabel(topic.speakerName)}</td>
                        <td className="px-2 py-1 text-center text-gray-500 text-sm w-16">{topic.voteCount}</td>
                        <td className="px-2 py-1 text-center w-20">
                          <button
                            onClick={() => setConfirmTarget({ topicId: topic.id, title: topic.title, action: 'revert' })}
                            disabled={markCompleteMutation.isPending}
                            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors"
                          >
                            Revert
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation dialog */}
      {confirmTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md mx-4 border border-gray-700 shadow-2xl">
            <h3 className="text-lg font-bold mb-2">
              {confirmTarget.action === 'complete' ? 'Mark as Complete?' : 'Revert to Pending?'}
            </h3>
            <p className="text-gray-300 mb-6">
              {confirmTarget.action === 'complete'
                ? `"${confirmTarget.title}" will be moved to the completed list and votes will be locked.`
                : `"${confirmTarget.title}" will be moved back to pending and votes will be unlocked.`}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmTarget(null)}
                className="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => markCompleteMutation.mutate({
                  topicId: confirmTarget.topicId,
                  status: confirmTarget.action === 'complete' ? 'completed' : 'pending',
                })}
                disabled={markCompleteMutation.isPending}
                className={`px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                  confirmTarget.action === 'complete'
                    ? 'bg-green-600 hover:bg-green-500'
                    : 'bg-yellow-600 hover:bg-yellow-500'
                }`}
              >
                {markCompleteMutation.isPending ? 'Updating...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
