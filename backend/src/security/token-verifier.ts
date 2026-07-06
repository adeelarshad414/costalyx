import type { Role } from './roles';

export const AUTH_TOKEN_VERIFIER = Symbol('AUTH_TOKEN_VERIFIER');
export const DEFAULT_TENANT_ID = '00000000-0000-4000-8000-000000000001';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AuthenticatedUser {
  subject: string;
  role: Role;
  tenantId: string;
}

export interface TokenVerifier {
  verifyBearerToken(token: string): Promise<AuthenticatedUser>;
}

export function normalizeTenantId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return uuidPattern.test(normalized) ? normalized : null;
}

export function tenantScopedIdempotencyKey(actor: AuthenticatedUser, idempotencyKey: string): string {
  return `${actor.tenantId}:${idempotencyKey}`;
}
