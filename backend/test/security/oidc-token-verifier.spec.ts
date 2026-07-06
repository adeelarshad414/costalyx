import { UnauthorizedException } from '@nestjs/common';
import { extractRoleFromClaims, resolveJwksUrl } from '../../src/security/oidc-token-verifier';
import { DEFAULT_TENANT_ID } from '../../src/security/token-verifier';

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
});
