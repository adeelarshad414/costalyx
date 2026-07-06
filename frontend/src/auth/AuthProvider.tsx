import Keycloak from 'keycloak-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { highestRole, type Role } from './roles';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

interface KeycloakClaims {
  sub?: string;
  realm_access?: { roles?: unknown[] };
  resource_access?: Record<string, { roles?: unknown[] }>;
}

export interface KeycloakAdapter {
  token?: string;
  refreshToken?: string;
  tokenParsed?: KeycloakClaims;
  init(options: Record<string, unknown>): Promise<boolean>;
  login(options?: Record<string, unknown>): Promise<void>;
  logout(options?: Record<string, unknown>): Promise<void>;
  updateToken(minValidity: number): Promise<boolean>;
}

interface AuthContextValue {
  status: AuthStatus;
  role: Role | null;
  token: string | null;
  error: string;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  adapter?: KeycloakAdapter;
  children: React.ReactNode;
}

export function AuthProvider({ adapter = createKeycloakAdapter(), children }: AuthProviderProps) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [role, setRole] = useState<Role | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState('');

  const captureAuthenticatedSession = useCallback(() => {
    setRole(extractRoleFromToken(adapter.tokenParsed));
    setToken(adapter.token ?? null);
    setStatus('authenticated');
  }, [adapter]);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const authenticated = await adapter.init({
          onLoad: 'check-sso',
          pkceMethod: 'S256',
          silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`
        });
        if (cancelled) {
          return;
        }
        if (authenticated) {
          captureAuthenticatedSession();
        } else {
          setRole(null);
          setToken(null);
          setStatus('unauthenticated');
        }
      } catch (initError) {
        if (!cancelled) {
          setError(initError instanceof Error ? initError.message : 'Keycloak initialization failed');
          setStatus('error');
        }
      }
    }

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [adapter, captureAuthenticatedSession]);

  const login = useCallback(async () => {
    await adapter.login({ redirectUri: window.location.origin });
  }, [adapter]);

  const logout = useCallback(async () => {
    await adapter.logout({ redirectUri: window.location.origin });
  }, [adapter]);

  const getAccessToken = useCallback(async () => {
    const currentToken = adapter.token ?? token;
    if (status !== 'authenticated' && !currentToken) {
      return null;
    }
    if (adapter.refreshToken) {
      await adapter.updateToken(30);
    }
    const refreshedToken = adapter.token ?? currentToken ?? null;
    setToken(refreshedToken);
    return refreshedToken;
  }, [adapter, status, token]);

  const value = useMemo(
    () => ({ status, role, token, error, login, logout, getAccessToken }),
    [error, getAccessToken, login, logout, role, status, token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider.');
  }
  return value;
}

export function extractRoleFromToken(claims: KeycloakClaims | undefined, clientId = keycloakClientId()): Role | null {
  if (!claims) {
    return null;
  }
  return highestRole([...(claims.realm_access?.roles ?? []), ...(claims.resource_access?.[clientId]?.roles ?? [])]);
}

function createKeycloakAdapter(): KeycloakAdapter {
  return new Keycloak({
    url: import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8080',
    realm: import.meta.env.VITE_KEYCLOAK_REALM ?? 'costalyx-dev',
    clientId: keycloakClientId()
  });
}

function keycloakClientId(): string {
  return import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'costalyx-web';
}
