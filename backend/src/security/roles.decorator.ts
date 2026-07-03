import { SetMetadata } from '@nestjs/common';
import type { Role } from './roles';

export const REQUIRED_ROLE_KEY = 'requiredRole';
export const PUBLIC_ROUTE_KEY = 'publicRoute';

export const RequiredRole = (role: Role) => SetMetadata(REQUIRED_ROLE_KEY, role);
export const Public = () => SetMetadata(PUBLIC_ROUTE_KEY, true);
