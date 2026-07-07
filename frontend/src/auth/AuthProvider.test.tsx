import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth, type KeycloakAdapter } from './AuthProvider';

function Probe() {
  const auth = useAuth();
  return (
    <div>
      <p>{auth.status}</p>
      <p>{auth.role ?? 'none'}</p>
      <button type="button" onClick={() => auth.login()}>
        Sign in
      </button>
      <button type="button" onClick={() => auth.signup({ redirectPath: '/portfolio', loginHint: 'finops@example.com' })}>
        Sign up
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

function MultiTokenProbe({ onTokens }: { onTokens: (tokens: Array<string | null>) => void }) {
  const auth = useAuth();
  return (
    <button type="button" onClick={async () => onTokens(await Promise.all([auth.getAccessToken(), auth.getAccessToken()]))}>
      Read tokens
    </button>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

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
    window.history.replaceState({}, '', '/executive');
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

    expect(adapter.login).toHaveBeenCalledWith(expect.objectContaining({ redirectUri: `${window.location.origin}/executive` }));
  });

  it('starts Keycloak registration from the signup action with a safe redirect path and email hint', async () => {
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
    await user.click(screen.getByRole('button', { name: 'Sign up' }));

    expect(adapter.login).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'register',
        loginHint: 'finops@example.com',
        redirectUri: `${window.location.origin}/portfolio`
      })
    );
  });

  it('does not initialize the same Keycloak adapter twice under React StrictMode', async () => {
    const adapter: KeycloakAdapter = {
      init: vi.fn().mockImplementation(() => {
        if ((adapter.init as ReturnType<typeof vi.fn>).mock.calls.length > 1) {
          throw new Error("A 'Keycloak' instance can only be initialized once.");
        }
        return Promise.resolve(false);
      }),
      login: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn(),
      updateToken: vi.fn()
    };

    render(
      <StrictMode>
        <AuthProvider adapter={adapter}>
          <Probe />
        </AuthProvider>
      </StrictMode>
    );

    await waitFor(() => expect(screen.getByText('unauthenticated')).toBeInTheDocument());
    expect(adapter.init).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/only be initialized once/i)).not.toBeInTheDocument();
  });

  it('initializes Keycloak without automatic silent SSO redirects', async () => {
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
    expect(adapter.init).toHaveBeenCalledWith(
      expect.objectContaining({
        checkLoginIframe: false
      })
    );
    const initOptions = (adapter.init as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(initOptions).not.toHaveProperty('onLoad');
    expect(initOptions).not.toHaveProperty('silentCheckSsoRedirectUri');
    expect(initOptions).not.toHaveProperty('silentCheckSsoFallback');
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

  it('returns a fresh Keycloak token to concurrent callers without forcing refresh', async () => {
    const user = userEvent.setup();
    const onTokens = vi.fn();
    const adapter: KeycloakAdapter = {
      token: 'fresh-token',
      refreshToken: 'refresh-token',
      tokenParsed: {
        sub: 'user-1',
        exp: Math.floor(Date.now() / 1000) + 300,
        realm_access: { roles: ['admin'] }
      },
      init: vi.fn().mockResolvedValue(true),
      login: vi.fn(),
      logout: vi.fn(),
      updateToken: vi.fn().mockResolvedValue(true)
    };

    render(
      <AuthProvider adapter={adapter}>
        <MultiTokenProbe onTokens={onTokens} />
      </AuthProvider>
    );

    await user.click(await screen.findByRole('button', { name: 'Read tokens' }));

    expect(adapter.updateToken).not.toHaveBeenCalled();
    expect(onTokens).toHaveBeenCalledWith(['fresh-token', 'fresh-token']);
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
