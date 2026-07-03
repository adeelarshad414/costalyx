import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../security/token-verifier';
import type { CreateAccountDto, CreateAccountGroupDto, PatchAccountGroupDto } from './dto/account.dto';
import type { CreateCloudCredentialDto, RotateCloudCredentialDto } from './dto/cloud-credential.dto';
import type { CreateUserDto } from './dto/user.dto';
import type { CreateViewDto } from './dto/view.dto';
import { GOVERNANCE_REPOSITORY, type GovernanceRepository } from './governance.repository';
import type {
  AccountGroup,
  AccountReference,
  AuditLogEntry,
  CloudCredentialReference,
  PageQuery,
  Paginated,
  SavedView,
  ViewFilter,
  UserRecord
} from './governance.types';

@Injectable()
export class GovernanceService {
  constructor(@Inject(GOVERNANCE_REPOSITORY) private readonly repository: GovernanceRepository) {}

  listAccounts(query: PageQuery): Promise<Paginated<Omit<AccountReference, 'vaultCredentialPath'>>> {
    return this.repository.listAccounts(query);
  }

  createAccount(
    input: CreateAccountDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<AccountReference> {
    return this.repository.createAccount(input, actor, idempotencyKey);
  }

  listAccountGroups(query: PageQuery): Promise<Paginated<AccountGroup>> {
    return this.repository.listAccountGroups(query);
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

  listCredentials(query: PageQuery): Promise<Paginated<CloudCredentialReference>> {
    return this.repository.listCredentials(query);
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

  listUsers(query: PageQuery): Promise<Paginated<UserRecord>> {
    return this.repository.listUsers(query);
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

  listAuditLog(query: PageQuery): Promise<Paginated<AuditLogEntry>> {
    return this.repository.listAuditLog(query);
  }

  listViews(query: PageQuery, actor: AuthenticatedUser): Promise<Paginated<SavedView>> {
    return this.repository.listViews(query, actor.role);
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
    return this.repository.getViewForRole(id, actor.role);
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
  for (const key of ['provider', 'accountId', 'service', 'dimension', 'from', 'to'] as const) {
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
  for (const key of ['accountId', 'service', 'dimension', 'from', 'to'] as const) {
    if (typeof value[key] === 'string' && value[key]) {
      filter[key] = value[key];
    }
  }
  return filter;
}
