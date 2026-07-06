export type Role = 'viewer' | 'analyst' | 'admin';

const roleRank: Record<Role, number> = {
  viewer: 1,
  analyst: 2,
  admin: 3
};

export function parseRole(value: unknown): Role | null {
  return value === 'viewer' || value === 'analyst' || value === 'admin' ? value : null;
}

export function hasRequiredRole(actual: Role | null, required: Role): boolean {
  return actual ? roleRank[actual] >= roleRank[required] : false;
}

export function highestRole(values: unknown[]): Role | null {
  return values
    .flatMap((value) => {
      const role = parseRole(value);
      return role ? [role] : [];
    })
    .sort((left, right) => roleRank[right] - roleRank[left])[0] ?? null;
}
