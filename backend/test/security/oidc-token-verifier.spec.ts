import { UnauthorizedException } from '@nestjs/common';
import { extractRoleFromClaims } from '../../src/security/oidc-token-verifier';

describe('extractRoleFromClaims', () => {
  it('selects the highest fixed Costalyx role from Keycloak realm roles', () => {
    expect(
      extractRoleFromClaims({
        sub: 'user-1',
        realm_access: { roles: ['viewer', 'admin'] }
      })
    ).toEqual({ subject: 'user-1', role: 'admin' });
  });

  it('accepts Keycloak client roles for the Costalyx web client', () => {
    expect(
      extractRoleFromClaims({
        sub: 'user-2',
        resource_access: {
          'costalyx-web': { roles: ['analyst'] }
        }
      })
    ).toEqual({ subject: 'user-2', role: 'analyst' });
  });

  it('rejects authenticated tokens without a fixed Costalyx role', () => {
    expect(() =>
      extractRoleFromClaims({
        sub: 'user-3',
        realm_access: { roles: ['offline_access'] }
      })
    ).toThrow(UnauthorizedException);
  });
});
