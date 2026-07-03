import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { TokenVerifier } from '../../src/security/token-verifier';
import { RolesGuard } from '../../src/security/roles.guard';

function contextForHeaders(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ headers })
    })
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  function createGuard(requiredRole: string, verifier: TokenVerifier = { verifyBearerToken: jest.fn() }) {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValueOnce(false).mockReturnValueOnce('analyst') } as unknown as Reflector;
    (reflector.getAllAndOverride as jest.Mock).mockReset();
    (reflector.getAllAndOverride as jest.Mock).mockReturnValueOnce(false).mockReturnValueOnce(requiredRole);
    const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    return new RolesGuard(reflector, verifier, config);
  }

  it('allows a test role header that satisfies the required server-side role when no issuer is configured', async () => {
    const guard = createGuard('analyst');

    await expect(guard.canActivate(contextForHeaders({ 'x-costalyx-role': 'admin' }))).resolves.toBe(true);
  });

  it('uses bearer-token claims before the local test role fallback', async () => {
    const verifier: TokenVerifier = {
      verifyBearerToken: jest.fn().mockResolvedValue({ subject: 'user-1', role: 'viewer' })
    };
    const guard = createGuard('viewer', verifier);

    await expect(
      guard.canActivate(
        contextForHeaders({
          authorization: 'Bearer signed-token',
          'x-costalyx-role': 'admin'
        })
      )
    ).resolves.toBe(true);
    expect(verifier.verifyBearerToken).toHaveBeenCalledWith('signed-token');
  });

  it('rejects missing authentication as unauthenticated', async () => {
    const guard = createGuard('viewer');

    await expect(guard.canActivate(contextForHeaders({}))).rejects.toThrow(UnauthorizedException);
  });

  it('returns 403 semantics for insufficient roles', async () => {
    const guard = createGuard('admin');

    await expect(guard.canActivate(contextForHeaders({ 'x-costalyx-role': 'viewer' }))).rejects.toThrow(
      ForbiddenException
    );
  });
});
