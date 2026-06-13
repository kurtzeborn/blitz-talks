import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';

export function MockAuthPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const redirectUri = searchParams.get('post_login_redirect_uri') || '/';

  useEffect(() => {
    // Set mock auth principal in localStorage
    const mockPrincipal = JSON.stringify({
      userId: 'mock-user-id',
      userDetails: 'scott@kurtzeborn.org',
      identityProvider: 'aad',
      userRoles: ['anonymous', 'authenticated'],
      claims: [
        { typ: 'name', val: 'Scott Kurtzeborn' },
      ],
    });
    localStorage.setItem('mockAuthPrincipal', mockPrincipal);
    navigate(redirectUri);
  }, [navigate, redirectUri]);

  return null;
}

export function MockLogoutPage() {
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.removeItem('mockAuthPrincipal');
    navigate('/');
  }, [navigate]);

  return null;
}
