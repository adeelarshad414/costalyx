import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PUBLIC_ROUTE_KEY, REQUIRED_ROLE_KEY } from './roles.decorator';
import { hasRequiredRole, parseRole, type Role } from './roles';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
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
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const role = parseRole(request.headers['x-costalyx-role']);

    if (!role) {
      throw new UnauthorizedException('Missing x-costalyx-role test role header.');
    }
    if (!hasRequiredRole(role, minimumRole)) {
      throw new ForbiddenException(`Requires ${minimumRole} role.`);
    }
    return true;
  }
}
