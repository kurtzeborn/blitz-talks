import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export function LandingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [sessionCode, setSessionCode] = useState(searchParams.get('session') || '');

  const handleJoinSession = (e: React.FormEvent) => {
    e.preventDefault();
    const code = sessionCode.trim().toUpperCase();
    if (code.length === 4) {
      navigate(`/session/${code}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-4xl font-bold mb-2">⚡ Blitz Talks</h1>
      <p className="text-gray-400 mb-8">Submit a topic. Vote on talks. Hear what matters.</p>

      <form onSubmit={handleJoinSession} className="w-full max-w-sm">
        <label htmlFor="session-code" className="block text-sm font-medium text-gray-300 mb-2">
          Enter session code
        </label>
        <div className="flex gap-2">
          <input
            id="session-code"
            type="text"
            maxLength={4}
            value={sessionCode}
            onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
            placeholder="ABCD"
            className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-center text-2xl tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          <button
            type="submit"
            disabled={sessionCode.trim().length !== 4}
            className="px-6 py-3 bg-blue-600 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Join
          </button>
        </div>
      </form>

      <div className="mt-12 text-gray-500 text-sm">
        <a href="/.auth/login/aad?post_login_redirect_uri=/dashboard" className="hover:text-gray-300 transition-colors">
          Gamekeeper sign in →
        </a>
      </div>
    </div>
  );
}
