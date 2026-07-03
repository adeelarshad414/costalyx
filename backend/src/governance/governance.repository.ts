import type { CreateAccountDto, CreateAccountGroupDto, PatchAccountGroupDto } from './dto/account.dto';
import type { CreateCloudCredentialDto, RotateCloudCredentialDto } from './dto/cloud-credential.dto';
import type { CreateUserDto } from './dto/user.dto';
import type {
  AccountGroup,
  AccountReference,
  AuditLogEntry,
  CloudCredentialReference,
  CreateViewInput,
  FixedRoleRecord,
  PageQuery,
  Paginated,
  SavedView,
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
  listAccounts(query: PageQuery): Promise<Paginated<Omit<AccountReference, 'vaultCredentialPath'>>>;
  createAccount(
    input: CreateAccountDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<AccountReference>;
  listAccountGroups(query: PageQuery): Promise<Paginated<AccountGroup>>;
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
  listCredentials(query: PageQuery): Promise<Paginated<CloudCredentialReference>>;
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
  listUsers(query: PageQuery): Promise<Paginated<UserRecord>>;
  createUser(input: CreateUserDto, actor: AuthenticatedUser, idempotencyKey: string): Promise<UserRecord>;
  listRoles(): Promise<{ data: FixedRoleRecord[] }>;
  listAuditLog(query: PageQuery): Promise<Paginated<AuditLogEntry>>;
  listViews(query: PageQuery, role: AuthenticatedUser['role']): Promise<Paginated<SavedView>>;
  createView(input: CreateViewInput, actor: AuthenticatedUser, idempotencyKey: string): Promise<SavedView>;
  getViewForRole(id: string, role: AuthenticatedUser['role']): Promise<SavedView>;
}
