import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { JWTPayload } from 'jose';
import { parseRole, type Role } from './roles';
import type { AuthenticatedUser, TokenVerifier } from './token-verifier';

interface KeycloakClaims extends JWTPayload {
  realm_access?: { roles?: unknown };
  resource_access?: Record<string, { roles?: unknown }>;
}

const roleRank: Record<Role, number> = {
  viewer: 1,
  analyst: 2,
  admin: 3
};

@Injectable()
export class OidcTokenVerifier implements TokenVerifier {
  private readonly issuerUrl: string | undefined;
  private readonly audience: string;
  private readonly clientId: string;

  constructor(config: ConfigService) {
    this.issuerUrl = config.get<string>('KEYCLOAK_ISSUER_URL');
    this.clientId = config.get<string>('KEYCLOAK_CLIENT_ID') ?? 'costalyx-web';
    this.audience = config.get<string>('KEYCLOAK_AUDIENCE') ?? this.clientId;
  }

  async verifyBearerToken(token: string): Promise<AuthenticatedUser> {
    if (!this.issuerUrl) {
      throw new UnauthorizedException('OIDC issuer is not configured.');
    }

    try {
      const { createRemoteJWKSet, jwtVerify } = await import('jose');
      const jwks = createRemoteJWKSet(new URL(`${this.issuerUrl}/protocol/openid-connect/certs`));
      const verified = await jwtVerify(token, jwks, {
        issuer: this.issuerUrl,
        audience: this.audience
      });
      return extractRoleFromClaims(verified.payload, this.clientId);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid bearer token.');
    }
  }
}

export function extractRoleFromClaims(claims: KeycloakClaims, clientId = 'costalyx-web'): AuthenticatedUser {
  const subject = typeof claims.sub === 'string' && claims.sub.length > 0 ? claims.sub : null;
  if (!subject) {
    throw new UnauthorizedException('Bearer token is missing subject.');
  }

  const candidateRoles = [
    ...rolesFrom(claims.realm_access?.roles),
    ...rolesFrom(claims.resource_access?.[clientId]?.roles)
  ];
  const role = candidateRoles.sort((left, right) => roleRank[right] - roleRank[left])[0];
  if (!role) {
    throw new UnauthorizedException('Bearer token has no Costalyx role.');
  }

  return { subject, role };
}

function rolesFrom(value: unknown): Role[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((role) => {
    const parsed = parseRole(role);
    return parsed ? [parsed] : [];
  });
}
