import Keycloak from 'keycloak-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toUserFacingError } from '../utils/userFacingError';
import { highestRole, type Role } from './roles';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

const sessionExpiredMessage = 'Sign in again to continue.';

interface KeycloakClaims {
  sub?: string;
  exp?: number;
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
const tokenRefreshSkewSeconds = 30;

interface AuthProviderProps {
  adapter?: KeycloakAdapter;
  children: React.ReactNode;
}

export function AuthProvider({ adapter, children }: AuthProviderProps) {
  const keycloakAdapter = useMemo(() => adapter ?? createKeycloakAdapter(), [adapter]);
  const initAdapterRef = useRef<KeycloakAdapter | null>(null);
  const initPromiseRef = useRef<Promise<boolean> | null>(null);
  const refreshPromiseRef = useRef<Promise<boolean> | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [role, setRole] = useState<Role | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState('');

  const captureAuthenticatedSession = useCallback(() => {
    setRole(extractRoleFromToken(keycloakAdapter.tokenParsed));
    setToken(keycloakAdapter.token ?? null);
    setStatus('authenticated');
  }, [keycloakAdapter]);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        if (initAdapterRef.current !== keycloakAdapter) {
          initAdapterRef.current = keycloakAdapter;
          initPromiseRef.current = null;
          refreshPromiseRef.current = null;
        }
        initPromiseRef.current ??= keycloakAdapter.init({
          checkLoginIframe: false,
          pkceMethod: 'S256'
        });
        const authenticated = await initPromiseRef.current;
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
          setError(toUserFacingError(initError, 'Initialize sign in'));
          setStatus('error');
        }
      }
    }

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [keycloakAdapter, captureAuthenticatedSession]);

  const login = useCallback(async () => {
    await keycloakAdapter.login({ redirectUri: window.location.origin });
  }, [keycloakAdapter]);

  const logout = useCallback(async () => {
    setRole(null);
    setToken(null);
    setError('');
    setStatus('unauthenticated');
    await keycloakAdapter.logout({ redirectUri: window.location.origin });
  }, [keycloakAdapter]);

  const getAccessToken = useCallback(async () => {
    const currentToken = keycloakAdapter.token ?? token;
    if (status !== 'authenticated' && !currentToken) {
      return null;
    }
    if (keycloakAdapter.refreshToken && shouldRefreshToken(keycloakAdapter.tokenParsed, tokenRefreshSkewSeconds)) {
      refreshPromiseRef.current ??= keycloakAdapter.updateToken(tokenRefreshSkewSeconds).finally(() => {
        refreshPromiseRef.current = null;
      });
      try {
        await refreshPromiseRef.current;
      } catch {
        setRole(null);
        setToken(null);
        setError(sessionExpiredMessage);
        setStatus('unauthenticated');
        return null;
      }
    }
    const refreshedToken = keycloakAdapter.token ?? currentToken ?? null;
    setToken(refreshedToken);
    return refreshedToken;
  }, [keycloakAdapter, status, token]);

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

function shouldRefreshToken(claims: KeycloakClaims | undefined, minValiditySeconds: number): boolean {
  if (typeof claims?.exp !== 'number') {
    return true;
  }
  return claims.exp - Math.floor(Date.now() / 1000) <= minValiditySeconds;
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
