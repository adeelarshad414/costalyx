import type { CreateAccountDto, CreateAccountGroupDto, PatchAccountGroupDto } from './dto/account.dto';
import type { CreateCloudConnectionDto } from './dto/cloud-connection.dto';
import type { CreateCloudCredentialDto, RotateCloudCredentialDto } from './dto/cloud-credential.dto';
import type { CreateTenantDto } from './dto/tenant.dto';
import type { CreateUserDto } from './dto/user.dto';
import type {
  AccountGroup,
  AccountReference,
  AuditLogEntry,
  CloudConnection,
  CloudCredentialReference,
  CreateViewInput,
  FixedRoleRecord,
  PageQuery,
  Paginated,
  SavedView,
  TenantRecord,
  UserRecord
} from './governance.types';
import type { AuthenticatedUser } from '../security/token-verifier';

export const GOVERNANCE_REPOSITORY = Symbol('GOVERNANCE_REPOSITORY');

export const fixedRoles: FixedRoleRecord[] = [
  { name: 'viewer', fixed: true },
  { name: 'analyst', fixed: true },
  { name: 'admin', fixed: true }
];

export interface GovernanceRepository {
  listTenants(actor: AuthenticatedUser): Promise<{ data: TenantRecord[] }>;
  createTenant(input: CreateTenantDto, actor: AuthenticatedUser, idempotencyKey: string): Promise<TenantRecord>;
  listCloudConnections(query: PageQuery, actor: AuthenticatedUser): Promise<Paginated<CloudConnection>>;
  createCloudConnection(
    input: CreateCloudConnectionDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<CloudConnection>;
  validateCloudConnection(id: string, actor: AuthenticatedUser, idempotencyKey: string): Promise<CloudConnection>;
  listAccounts(query: PageQuery, actor: AuthenticatedUser): Promise<Paginated<Omit<AccountReference, 'vaultCredentialPath'>>>;
  createAccount(
    input: CreateAccountDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<AccountReference>;
  listAccountGroups(query: PageQuery, actor: AuthenticatedUser): Promise<Paginated<AccountGroup>>;
  createAccountGroup(
    input: CreateAccountGroupDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<AccountGroup>;
  updateAccountGroup(
    id: string,
    input: PatchAccountGroupDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<AccountGroup>;
  deleteAccountGroup(id: string, actor: AuthenticatedUser, idempotencyKey: string): Promise<void>;
  listCredentials(query: PageQuery, actor: AuthenticatedUser): Promise<Paginated<CloudCredentialReference>>;
  createCredential(
    input: CreateCloudCredentialDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<CloudCredentialReference>;
  rotateCredential(
    id: string,
    input: RotateCloudCredentialDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<CloudCredentialReference>;
  listUsers(query: PageQuery, actor: AuthenticatedUser): Promise<Paginated<UserRecord>>;
  createUser(input: CreateUserDto, actor: AuthenticatedUser, idempotencyKey: string): Promise<UserRecord>;
  listRoles(): Promise<{ data: FixedRoleRecord[] }>;
  listAuditLog(query: PageQuery, actor: AuthenticatedUser): Promise<Paginated<AuditLogEntry>>;
  listViews(query: PageQuery, actor: AuthenticatedUser): Promise<Paginated<SavedView>>;
  createView(input: CreateViewInput, actor: AuthenticatedUser, idempotencyKey: string): Promise<SavedView>;
  getViewForRole(id: string, actor: AuthenticatedUser): Promise<SavedView>;
}
