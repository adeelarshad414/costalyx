export type Role = 'viewer' | 'analyst' | 'admin';

const roleRank: Record<Role, number> = {
  viewer: 1,
  analyst: 2,
  admin: 3
};

export function hasRequiredRole(actual: Role, required: Role): boolean {
  return roleRank[actual] >= roleRank[required];
}

export function parseRole(value: unknown): Role | null {
  if (value === 'viewer' || value === 'analyst' || value === 'admin') {
    return value;
  }
  return null;
}
