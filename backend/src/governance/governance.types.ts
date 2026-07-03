import type { CloudProvider } from '../cost-model/cost-record.types';
import type { Role } from '../security/roles';

export interface AccountReference {
  id: string;
  provider: CloudProvider;
  externalAccountId: string;
  displayName: string;
  vendor: string;
  createdAt: string;
  vaultCredentialPath?: string;
}

export interface AccountGroup {
  id: string;
  name: string;
  accountIds: string[];
  createdAt: string;
}

export interface CloudCredentialReference {
  id: string;
  provider: CloudProvider;
  accountId: string;
  displayName: string;
  vaultPath: string;
  createdAt: string;
  rotatedAt: string | null;
}

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  roles: Role[];
}

export interface FixedRoleRecord {
  name: Role;
  fixed: true;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  prevHash: string | null;
  hash: string;
  createdAt: string;
}

export interface PageQuery {
  page: number;
  pageSize: number;
}

export interface Paginated<T> {
  data: T[];
  meta: { total: number; page: number; pageSize: number };
}
