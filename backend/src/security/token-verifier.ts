import type { Role } from './roles';

export const AUTH_TOKEN_VERIFIER = Symbol('AUTH_TOKEN_VERIFIER');

export interface AuthenticatedUser {
  subject: string;
  role: Role;
}

export interface TokenVerifier {
  verifyBearerToken(token: string): Promise<AuthenticatedUser>;
}
