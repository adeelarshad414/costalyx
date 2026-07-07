import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { JWTPayload } from 'jose';
import { parseRole, type Role } from './roles';
import { DEFAULT_TENANT_ID, normalizeTenantId, type AuthenticatedUser, type TokenVerifier } from './token-verifier';

interface KeycloakClaims extends JWTPayload {
  realm_access?: { roles?: unknown };
  resource_access?: Record<string, { roles?: unknown }>;
  tenant_id?: unknown;
  costalyx_tenant_id?: unknown;
  org_id?: unknown;
}

const roleRank: Record<Role, number> = {
  viewer: 1,
  analyst: 2,
  admin: 3
};

@Injectable()
export class OidcTokenVerifier implements TokenVerifier {
  private readonly issuerUrl: string | undefined;
  private readonly jwksUrl: string | undefined;
  private readonly audience: string;
  private readonly clientId: string;
  private remoteJwks: unknown;

  constructor(config: ConfigService) {
    this.issuerUrl = config.get<string>('KEYCLOAK_ISSUER_URL');
    this.jwksUrl = config.get<string>('KEYCLOAK_JWKS_URL');
    this.clientId = config.get<string>('KEYCLOAK_CLIENT_ID') ?? 'costalyx-web';
    this.audience = config.get<string>('KEYCLOAK_AUDIENCE') ?? this.clientId;
  }

  async verifyBearerToken(token: string): Promise<AuthenticatedUser> {
    if (!this.issuerUrl) {
      throw new UnauthorizedException('OIDC issuer is not configured.');
    }

    try {
      const { createRemoteJWKSet, jwtVerify } = await import('jose');
      this.remoteJwks ??= createRemoteJWKSet(resolveJwksUrl(this.issuerUrl, this.jwksUrl));
      const verified = await jwtVerify(token, this.remoteJwks as Parameters<typeof jwtVerify>[1], {
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

export function resolveJwksUrl(issuerUrl: string, configuredJwksUrl?: string): URL {
  if (configuredJwksUrl) {
    return new URL(configuredJwksUrl);
  }
  return new URL(`${issuerUrl.replace(/\/$/, '')}/protocol/openid-connect/certs`);
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

  const tenantId =
    normalizeTenantId(claims.costalyx_tenant_id) ??
    normalizeTenantId(claims.tenant_id) ??
    normalizeTenantId(claims.org_id) ??
    DEFAULT_TENANT_ID;

  return { subject, role, tenantId };
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
