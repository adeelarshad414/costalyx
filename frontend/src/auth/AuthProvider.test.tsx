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

function TokenProbe({ onToken }: { onToken: (token: string | null) => void }) {
  const auth = useAuth();
  return (
    <button type="button" onClick={async () => onToken(await auth.getAccessToken())}>
      Read token
    </button>
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

  it('returns the current access token when Keycloak did not issue a refresh token', async () => {
    const user = userEvent.setup();
    const onToken = vi.fn();
    const adapter: KeycloakAdapter = {
      token: 'access-token-only',
      tokenParsed: {
        sub: 'user-1',
        realm_access: { roles: ['admin'] }
      },
      init: vi.fn().mockResolvedValue(true),
      login: vi.fn(),
      logout: vi.fn(),
      updateToken: vi.fn().mockRejectedValue(new Error('Unable to update token, no refresh token available.'))
    };

    render(
      <AuthProvider adapter={adapter}>
        <TokenProbe onToken={onToken} />
      </AuthProvider>
    );

    await user.click(await screen.findByRole('button', { name: 'Read token' }));

    expect(adapter.updateToken).not.toHaveBeenCalled();
    expect(onToken).toHaveBeenCalledWith('access-token-only');
  });

  it('returns an already-present adapter token while auth status is still settling', async () => {
    const user = userEvent.setup();
    const onToken = vi.fn();
    const adapter: KeycloakAdapter = {
      token: 'settling-token',
      tokenParsed: {
        sub: 'user-1',
        realm_access: { roles: ['admin'] }
      },
      init: vi.fn(() => new Promise<boolean>(() => undefined)),
      login: vi.fn(),
      logout: vi.fn(),
      updateToken: vi.fn()
    };

    render(
      <AuthProvider adapter={adapter}>
        <TokenProbe onToken={onToken} />
      </AuthProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Read token' }));

    expect(adapter.updateToken).not.toHaveBeenCalled();
    expect(onToken).toHaveBeenCalledWith('settling-token');
  });
});
