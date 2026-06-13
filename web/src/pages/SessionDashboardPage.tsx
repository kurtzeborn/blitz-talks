import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { fetchAuthStatus, fetchSession, fetchTopics, updateTopicStatus, updateSession } from '../api';
import type { Topic } from '../types';

export function SessionDashboardPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const queryClient = useQueryClient();
  const [showNames, setShowNames] = useState(false);

  const { data: auth } = useQuery({
    queryKey: ['auth'],
    queryFn: fetchAuthStatus,
  });

  const { data: session } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => fetchSession(sessionId!),
    enabled: !!sessionId && auth?.isGamekeeper === true,
  });

  const { data: topics } = useQuery({
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
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => updateSession(sessionId!, { status: 'archived' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    },
  });

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

  const sessionUrl = `${window.location.origin}/?session=${sessionId}`;
  const pendingTopics = (topics || []).filter((t: Topic) => t.status === 'pending');
  const completedTopics = (topics || []).filter((t: Topic) => t.status === 'completed');

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold">⚡ {session.name}</h1>
            <p className="text-gray-400 mt-1">
              {session.status === 'active' ? 'Session active' : 'Session archived'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a href="/dashboard" className="text-blue-400 hover:text-blue-300 text-sm">← Dashboard</a>
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
        <div className="flex items-center gap-8 mb-8 p-6 bg-gray-800 rounded-xl">
          <div className="bg-white p-3 rounded-lg">
            <QRCodeSVG value={sessionUrl} size={180} />
          </div>
          <div>
            <p className="text-gray-400 text-sm mb-1">Scan to submit &amp; vote</p>
            <p className="text-6xl font-mono font-bold tracking-widest">{sessionId}</p>
            <p className="text-gray-500 text-sm mt-2">{sessionUrl}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Pending Topics ({pendingTopics.length})</h2>
          <button
            onClick={() => setShowNames(!showNames)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              showNames ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            {showNames ? 'Hide Names' : 'Show Names'}
          </button>
        </div>

        {/* Pending topics table */}
        {pendingTopics.length > 0 ? (
          <div className="bg-gray-800 rounded-lg overflow-hidden mb-8">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left p-4 text-gray-400 font-medium w-8">#</th>
                  <th className="text-left p-4 text-gray-400 font-medium">Topic</th>
                  {showNames && <th className="text-left p-4 text-gray-400 font-medium">Speaker</th>}
                  <th className="text-center p-4 text-gray-400 font-medium w-20">Votes</th>
                  <th className="text-center p-4 text-gray-400 font-medium w-24"></th>
                </tr>
              </thead>
              <tbody>
                {pendingTopics.map((topic: Topic, i: number) => (
                  <tr key={topic.id} className="border-b border-gray-700/50 hover:bg-gray-750">
                    <td className="p-4 text-gray-500">{i + 1}</td>
                    <td className="p-4 font-medium text-lg">{topic.title}</td>
                    {showNames && <td className="p-4 text-gray-300">{topic.speakerName}</td>}
                    <td className="p-4 text-center text-xl font-bold">{topic.voteCount}</td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => markCompleteMutation.mutate({ topicId: topic.id, status: 'completed' })}
                        disabled={markCompleteMutation.isPending}
                        className="px-3 py-1 bg-green-700 hover:bg-green-600 rounded text-sm transition-colors"
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
          <div className="p-8 bg-gray-800 rounded-lg text-center mb-8">
            <p className="text-gray-500 text-lg">
              {completedTopics.length > 0 ? 'All talks complete!' : 'No topics submitted yet.'}
            </p>
          </div>
        )}

        {/* Completed topics */}
        {completedTopics.length > 0 && (
          <>
            <h2 className="text-xl font-semibold mb-4 text-gray-400">Completed ({completedTopics.length})</h2>
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <table className="w-full">
                <tbody>
                  {completedTopics.map((topic: Topic) => (
                    <tr key={topic.id} className="border-b border-gray-700/50">
                      <td className="p-4 text-gray-400">{topic.title}</td>
                      {showNames && <td className="p-4 text-gray-500">{topic.speakerName}</td>}
                      <td className="p-4 text-center text-gray-500 w-20">{topic.voteCount}</td>
                      <td className="p-4 text-center w-24">
                        <button
                          onClick={() => markCompleteMutation.mutate({ topicId: topic.id, status: 'pending' })}
                          disabled={markCompleteMutation.isPending}
                          className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors"
                        >
                          Revert
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
