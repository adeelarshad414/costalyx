import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth, type KeycloakAdapter } from './AuthProvider';

function Probe() {
  const auth = useAuth();
  return (
    <div>
      <p>{auth.status}</p>
      <p>{auth.role ?? 'none'}</p>
      <button type="button" onClick={auth.login}>
        Sign in
      </button>
    </div>
  );
}

describe('AuthProvider', () => {
  it('extracts the highest fixed role from a Keycloak-authenticated session', async () => {
    const adapter: KeycloakAdapter = {
      token: 'token-1',
      tokenParsed: {
        sub: 'user-1',
        realm_access: { roles: ['viewer', 'admin'] }
      },
      init: vi.fn().mockResolvedValue(true),
      login: vi.fn(),
      logout: vi.fn(),
      updateToken: vi.fn().mockResolvedValue(true)
    };

    render(
      <AuthProvider adapter={adapter}>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('authenticated')).toBeInTheDocument());
    expect(screen.getByText('admin')).toBeInTheDocument();
  });

  it('starts an actual Keycloak login redirect when unauthenticated users sign in', async () => {
    const user = userEvent.setup();
    const adapter: KeycloakAdapter = {
      init: vi.fn().mockResolvedValue(false),
      login: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn(),
      updateToken: vi.fn()
    };

    render(
      <AuthProvider adapter={adapter}>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('unauthenticated')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(adapter.login).toHaveBeenCalledWith(expect.objectContaining({ redirectUri: window.location.origin }));
  });
});
