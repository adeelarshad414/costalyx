import { UnauthorizedException } from '@nestjs/common';
import { extractRoleFromClaims, OidcTokenVerifier, resolveJwksUrl } from '../../src/security/oidc-token-verifier';
import { DEFAULT_TENANT_ID } from '../../src/security/token-verifier';

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(() => 'jwks-resolver'),
  jwtVerify: jest.fn(async () => {
    throw new Error('connect ECONNREFUSED keycloak.local Authorization: Bearer should-not-leak');
  })
}));

describe('extractRoleFromClaims', () => {
  it('selects the highest fixed Costalyx role from Keycloak realm roles', () => {
    expect(
      extractRoleFromClaims({
        sub: 'user-1',
        realm_access: { roles: ['viewer', 'admin'] }
      })
    ).toEqual({ subject: 'user-1', role: 'admin', tenantId: DEFAULT_TENANT_ID });
  });

  it('accepts Keycloak client roles for the Costalyx web client', () => {
    expect(
      extractRoleFromClaims({
        sub: 'user-2',
        resource_access: {
          'costalyx-web': { roles: ['analyst'] }
        }
      })
    ).toEqual({ subject: 'user-2', role: 'analyst', tenantId: DEFAULT_TENANT_ID });
  });

  it('extracts a tenant claim when present', () => {
    expect(
      extractRoleFromClaims({
        sub: 'user-4',
        tenant_id: '11111111-1111-4111-8111-111111111111',
        realm_access: { roles: ['viewer'] }
      })
    ).toEqual({ subject: 'user-4', role: 'viewer', tenantId: '11111111-1111-4111-8111-111111111111' });
  });

  it('rejects authenticated tokens without a fixed Costalyx role', () => {
    expect(() =>
      extractRoleFromClaims({
        sub: 'user-3',
        realm_access: { roles: ['offline_access'] }
      })
    ).toThrow(UnauthorizedException);
  });

  it('can validate a public issuer while fetching JWKS through an internal Docker URL', () => {
    expect(
      resolveJwksUrl(
        'http://localhost:8080/realms/costalyx-dev',
        'http://keycloak:8080/realms/costalyx-dev/protocol/openid-connect/certs'
      ).toString()
    ).toBe('http://keycloak:8080/realms/costalyx-dev/protocol/openid-connect/certs');
  });

  it('sanitizes Keycloak/JWKS outage failures behind a stable unauthorized error', async () => {
    const verifier = new OidcTokenVerifier({
      get: (key: string) =>
        ({
          KEYCLOAK_ISSUER_URL: 'https://auth.example.test/realms/costalyx',
          KEYCLOAK_JWKS_URL: 'https://auth.example.test/realms/costalyx/protocol/openid-connect/certs',
          KEYCLOAK_CLIENT_ID: 'costalyx-web'
        })[key]
    } as never);

    await expect(verifier.verifyBearerToken('header.payload.signature')).rejects.toThrow(UnauthorizedException);
    await expect(verifier.verifyBearerToken('header.payload.signature')).rejects.toThrow('Invalid bearer token.');
  });
});
