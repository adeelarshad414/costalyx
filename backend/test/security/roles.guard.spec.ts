import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../src/security/roles.guard';

function contextForRole(role?: string): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ headers: role ? { 'x-costalyx-role': role } : {} })
    })
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows a role that satisfies the required server-side role', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValueOnce(false).mockReturnValueOnce('analyst') } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(contextForRole('admin'))).toBe(true);
  });

  it('rejects missing role headers as unauthenticated', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValueOnce(false).mockReturnValueOnce('viewer') } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(contextForRole())).toThrow(UnauthorizedException);
  });

  it('returns 403 semantics for insufficient roles', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValueOnce(false).mockReturnValueOnce('admin') } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(contextForRole('viewer'))).toThrow(ForbiddenException);
  });
});
