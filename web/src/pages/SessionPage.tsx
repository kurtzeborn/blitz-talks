import { useQuery } from '@tanstack/react-query';
import { fetchAuthStatus } from '../api';

export function SessionPage() {
  const { data: auth, isLoading } = useQuery({
    queryKey: ['auth'],
    queryFn: fetchAuthStatus,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!auth?.isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
        <h2 className="text-2xl font-bold mb-4">Sign in to participate</h2>
        <p className="text-gray-400 mb-6">You need a Microsoft account to submit topics and vote.</p>
        <a
          href={`/.auth/login/aad?post_login_redirect_uri=${window.location.pathname}`}
          className="px-6 py-3 bg-blue-600 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          Sign in with Microsoft
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <h2 className="text-2xl font-bold mb-4">⚡ Session</h2>
      <p className="text-gray-400">Signed in as {auth.user?.userDetails}</p>
      <p className="text-gray-500 mt-2">Topic submission and voting coming in Phase 2.</p>
    </div>
  );
}
