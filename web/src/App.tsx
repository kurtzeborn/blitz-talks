import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from './api';
import { LandingPage } from './pages/LandingPage';
import { SessionPage } from './pages/SessionPage';
import { DashboardPage } from './pages/DashboardPage';
import { SessionDashboardPage } from './pages/SessionDashboardPage';
import { GamekeepersPage } from './pages/GamekeepersPage';
import { MockAuthPage, MockLogoutPage } from './pages/MockAuthPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 5,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/session/:sessionId" element={<SessionPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/dashboard/:sessionId" element={<SessionDashboardPage />} />
          <Route path="/dashboard/keepers" element={<GamekeepersPage />} />
          {/* Mock auth routes for local development only */}
          {import.meta.env.DEV && (
            <>
              <Route path="/.auth/login/aad" element={<MockAuthPage />} />
              <Route path="/.auth/logout" element={<MockLogoutPage />} />
            </>
          )}
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
