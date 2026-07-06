import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../security/token-verifier';
import type { CreateAccountDto, CreateAccountGroupDto, PatchAccountGroupDto } from './dto/account.dto';
import type { CreateCloudConnectionDto } from './dto/cloud-connection.dto';
import type { CreateCloudCredentialDto, RotateCloudCredentialDto } from './dto/cloud-credential.dto';
import type { CreateTenantDto } from './dto/tenant.dto';
import type { CreateUserDto } from './dto/user.dto';
import type { CreateViewDto } from './dto/view.dto';
import { buildCloudConnectionOnboarding } from './cloud-connection-onboarding';
import { findCloudConnectionSecretMaterial } from './cloud-connection-secret-guard';
import { GOVERNANCE_REPOSITORY, type GovernanceRepository } from './governance.repository';
import type {
  AccountGroup,
  AccountReference,
  AuditLogEntry,
  CloudCredentialReference,
  CloudConnection,
  CloudConnectionOnboarding,
  PageQuery,
  Paginated,
  SavedView,
  TenantRecord,
  ViewFilter,
  UserRecord
} from './governance.types';

@Injectable()
export class GovernanceService {
  constructor(@Inject(GOVERNANCE_REPOSITORY) private readonly repository: GovernanceRepository) {}

  listTenants(actor: AuthenticatedUser): Promise<{ data: TenantRecord[] }> {
    return this.repository.listTenants(actor);
  }

  createTenant(input: CreateTenantDto, actor: AuthenticatedUser, idempotencyKey: string): Promise<TenantRecord> {
    return this.repository.createTenant(input, actor, idempotencyKey);
  }

  listCloudConnections(query: PageQuery, actor: AuthenticatedUser): Promise<Paginated<CloudConnection>> {
    return this.repository.listCloudConnections(query, actor);
  }

  getCloudConnection(id: string, actor: AuthenticatedUser): Promise<CloudConnection> {
    return this.repository.getCloudConnection(id, actor);
  }

  createCloudConnection(
    input: CreateCloudConnectionDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<CloudConnection> {
    const secretFields = findCloudConnectionSecretMaterial(input as unknown as Record<string, unknown>);
    if (secretFields.length > 0) {
      throw new BadRequestException(
        'Cloud connection references must not include access keys, client secrets, service-account keys, signed URLs, or base64 credential blobs.'
      );
    }
    return this.repository.createCloudConnection(input, actor, idempotencyKey);
  }

  validateCloudConnection(id: string, actor: AuthenticatedUser, idempotencyKey: string): Promise<CloudConnection> {
    return this.repository.validateCloudConnection(id, actor, idempotencyKey);
  }

  async getCloudConnectionOnboarding(id: string, actor: AuthenticatedUser): Promise<CloudConnectionOnboarding> {
    const connection = await this.getCloudConnection(id, actor);
    return buildCloudConnectionOnboarding(connection, {
      awsBrokerPrincipalArn: process.env.COSTALYX_AWS_BROKER_PRINCIPAL_ARN
    });
  }

  listAccounts(query: PageQuery, actor: AuthenticatedUser): Promise<Paginated<Omit<AccountReference, 'vaultCredentialPath'>>> {
    return this.repository.listAccounts(query, actor);
  }

  createAccount(
    input: CreateAccountDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<AccountReference> {
    return this.repository.createAccount(input, actor, idempotencyKey);
  }

  listAccountGroups(query: PageQuery, actor: AuthenticatedUser): Promise<Paginated<AccountGroup>> {
    return this.repository.listAccountGroups(query, actor);
  }

  createAccountGroup(
    input: CreateAccountGroupDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<AccountGroup> {
    return this.repository.createAccountGroup(input, actor, idempotencyKey);
  }

  updateAccountGroup(
    id: string,
    input: PatchAccountGroupDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<AccountGroup> {
    return this.repository.updateAccountGroup(id, input, actor, idempotencyKey);
  }

  deleteAccountGroup(id: string, actor: AuthenticatedUser, idempotencyKey: string): Promise<void> {
    return this.repository.deleteAccountGroup(id, actor, idempotencyKey);
  }

  listCredentials(query: PageQuery, actor: AuthenticatedUser): Promise<Paginated<CloudCredentialReference>> {
    return this.repository.listCredentials(query, actor);
  }

  createCredential(
    input: CreateCloudCredentialDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<CloudCredentialReference> {
    return this.repository.createCredential(input, actor, idempotencyKey);
  }

  rotateCredential(
    id: string,
    input: RotateCloudCredentialDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<CloudCredentialReference> {
    return this.repository.rotateCredential(id, input, actor, idempotencyKey);
  }

  listUsers(query: PageQuery, actor: AuthenticatedUser): Promise<Paginated<UserRecord>> {
    return this.repository.listUsers(query, actor);
  }

  createUser(input: CreateUserDto, actor: AuthenticatedUser, idempotencyKey: string): Promise<UserRecord> {
    return this.repository.createUser(input, actor, idempotencyKey);
  }

  listRoles() {
    return this.repository.listRoles();
  }

  rejectCustomRoleCreation(): never {
    throw new BadRequestException('Milestone B ships fixed roles only; custom roles are an additive later milestone.');
  }

  listAuditLog(query: PageQuery, actor: AuthenticatedUser): Promise<Paginated<AuditLogEntry>> {
    return this.repository.listAuditLog(query, actor);
  }

  listViews(query: PageQuery, actor: AuthenticatedUser): Promise<Paginated<SavedView>> {
    return this.repository.listViews(query, actor);
  }

  createView(input: CreateViewDto, actor: AuthenticatedUser, idempotencyKey: string): Promise<SavedView> {
    return this.repository.createView(
      {
        ...input,
        filterJson: normalizeViewFilter(input.filterJson),
        sharedRoleScope: input.sharedRoleScope?.length ? input.sharedRoleScope : [actor.role]
      },
      actor,
      idempotencyKey
    );
  }

  getViewForRole(id: string, actor: AuthenticatedUser): Promise<SavedView> {
    return this.repository.getViewForRole(id, actor);
  }

  async applyViewScope<T extends object>(query: T, actor: AuthenticatedUser, viewId?: string): Promise<T> {
    if (!viewId) {
      return query;
    }
    const view = await this.getViewForRole(viewId, actor);
    return mergeViewScope(query, view.filterJson);
  }
}

function mergeViewScope<T extends object>(query: T, filter: ViewFilter): T {
  const scoped = { ...query } as Record<string, unknown>;
  for (const key of ['provider', 'accountId', 'accountGroupId', 'cloudConnectionId', 'service', 'dimension', 'from', 'to'] as const) {
    const value = filter[key];
    if (value) {
      scoped[key] = value;
    }
  }
  return scoped as T;
}

function normalizeViewFilter(value: Record<string, unknown>): ViewFilter {
  const filter: ViewFilter = {};
  if (value.provider === 'aws' || value.provider === 'azure' || value.provider === 'gcp') {
    filter.provider = value.provider;
  }
  for (const key of ['accountId', 'accountGroupId', 'cloudConnectionId', 'service', 'dimension', 'from', 'to'] as const) {
    if (typeof value[key] === 'string' && value[key]) {
      filter[key] = value[key];
    }
  }
  return filter;
}
