import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuthBoundary } from './AuthBoundary';
import { AuthProvider, useAuth, type KeycloakAdapter } from './AuthProvider';

function SessionProbe() {
  const auth = useAuth();
  return (
    <div>
      <p>Protected content</p>
      <button type="button" onClick={() => void auth.getAccessToken()}>
        Refresh token
      </button>
    </div>
  );
}

describe('AuthBoundary', () => {
  it('replaces the protected app with a session-expired state when token refresh fails', async () => {
    const user = userEvent.setup();
    const adapter: KeycloakAdapter = {
      token: 'expired-token',
      refreshToken: 'refresh-token',
      tokenParsed: {
        sub: 'user-1',
        exp: Math.floor(Date.now() / 1000) - 60,
        realm_access: { roles: ['admin'] }
      },
      init: vi.fn().mockResolvedValue(true),
      login: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn(),
      updateToken: vi.fn().mockRejectedValue(new Error('HTTP 401 {"refresh_token":"secret","stack":"at token"}'))
    };

    render(
      <AuthProvider adapter={adapter}>
        <AuthBoundary>
          <SessionProbe />
        </AuthBoundary>
      </AuthProvider>
    );

    await user.click(await screen.findByRole('button', { name: 'Refresh token' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Session expired' })).toBeInTheDocument());
    expect(screen.getByText('Sign in again to continue.')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    expect(screen.queryByText(/refresh_token|HTTP 401|stack/)).not.toBeInTheDocument();
  });
});
