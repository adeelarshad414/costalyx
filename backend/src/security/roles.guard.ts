import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { PUBLIC_ROUTE_KEY, REQUIRED_ROLE_KEY } from './roles.decorator';
import { hasRequiredRole, parseRole, type Role } from './roles';
import { AUTH_TOKEN_VERIFIER, type AuthenticatedUser, type TokenVerifier } from './token-verifier';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH_TOKEN_VERIFIER) private readonly tokenVerifier: TokenVerifier,
    private readonly config: ConfigService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<Role>(REQUIRED_ROLE_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    const minimumRole = required ?? 'viewer';
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; user?: AuthenticatedUser }>();
    const user = await this.authenticate(request.headers);
    request.user = user;

    if (!hasRequiredRole(user.role, minimumRole)) {
      throw new ForbiddenException(`Requires ${minimumRole} role.`);
    }
    return true;
  }

  private async authenticate(headers: Record<string, string | undefined>): Promise<AuthenticatedUser> {
    const bearerToken = parseBearerToken(headers.authorization);
    if (bearerToken) {
      return this.tokenVerifier.verifyBearerToken(bearerToken);
    }

    const headerFallbackRole = this.allowTestRoleHeader() ? parseRole(headers['x-costalyx-role']) : null;
    if (headerFallbackRole) {
      return { subject: 'local-test-user', role: headerFallbackRole };
    }

    throw new UnauthorizedException(
      this.allowTestRoleHeader()
        ? 'Missing bearer token or x-costalyx-role test role header.'
        : 'Missing bearer token.'
    );
  }

  private allowTestRoleHeader(): boolean {
    const explicit = this.config.get<string>('AUTH_ALLOW_TEST_ROLE_HEADER');
    if (explicit !== undefined) {
      return explicit === 'true';
    }
    return !this.config.get<string>('KEYCLOAK_ISSUER_URL');
  }
}

function parseBearerToken(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const [scheme, token] = value.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }
  return token;
}
