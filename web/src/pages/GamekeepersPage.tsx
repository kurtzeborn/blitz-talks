import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAuthStatus, fetchGamekeepers, inviteGamekeeper, removeGamekeeper } from '../api';

export function GamekeepersPage() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');

  const { data: auth } = useQuery({
    queryKey: ['auth'],
    queryFn: fetchAuthStatus,
  });

  const { data: keepers, isLoading } = useQuery({
    queryKey: ['gamekeepers'],
    queryFn: fetchGamekeepers,
    enabled: auth?.isGamekeeper === true,
  });

  const inviteMutation = useMutation({
    mutationFn: (email: string) => inviteGamekeeper(email),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gamekeepers'] });
      setEmail('');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (email: string) => removeGamekeeper(email),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gamekeepers'] });
    },
  });

  if (!auth?.isGamekeeper) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-gray-400">Gamekeeper access required.</p>
      </div>
    );
  }

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      inviteMutation.mutate(email.trim());
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Gamekeepers</h1>
          <a href="/dashboard" className="text-blue-400 hover:text-blue-300 text-sm">
            ← Back to Dashboard
          </a>
        </div>

        <form onSubmit={handleInvite} className="mb-8 flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address to invite"
            className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!email.trim() || inviteMutation.isPending}
            className="px-6 py-2 bg-blue-600 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            Invite
          </button>
        </form>

        {inviteMutation.isError && (
          <p className="text-red-400 mb-4">Failed to invite. They may already be a gamekeeper.</p>
        )}

        {isLoading ? (
          <p className="text-gray-400">Loading...</p>
        ) : (
          <div className="space-y-2">
            {keepers?.map((keeper) => (
              <div key={keeper.email} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                <div>
                  <p className="font-medium">{keeper.displayName}</p>
                  <p className="text-gray-400 text-sm">{keeper.email}</p>
                </div>
                {keeper.email !== auth.user?.userDetails?.toLowerCase() && (
                  <button
                    onClick={() => removeMutation.mutate(keeper.email)}
                    disabled={removeMutation.isPending}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Remove
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
