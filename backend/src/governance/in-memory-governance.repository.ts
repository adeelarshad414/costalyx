import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InMemoryAuditLogStore, type AuditLogStore } from '../audit/audit-log.store';
import { stableId } from '../cost-model/stable-id';
import type { AuthenticatedUser } from '../security/token-verifier';
import type { CreateAccountDto, CreateAccountGroupDto, PatchAccountGroupDto } from './dto/account.dto';
import type { CreateCloudCredentialDto, RotateCloudCredentialDto } from './dto/cloud-credential.dto';
import type { CreateUserDto } from './dto/user.dto';
import { fixedRoles, type GovernanceRepository } from './governance.repository';
import type {
  AccountGroup,
  AccountReference,
  CloudCredentialReference,
  CreateViewInput,
  PageQuery,
  Paginated,
  SavedView,
  UserRecord
} from './governance.types';

@Injectable()
export class InMemoryGovernanceRepository implements GovernanceRepository {
  private readonly accounts = new Map<string, AccountReference>();
  private readonly accountGroups = new Map<string, AccountGroup>();
  private readonly credentials = new Map<string, CloudCredentialReference>();
  private readonly users = new Map<string, UserRecord>();
  private readonly views = new Map<string, SavedView>();
  private readonly idempotentResponses = new Map<string, unknown>();

  constructor(private readonly auditLog: AuditLogStore = new InMemoryAuditLogStore()) {}

  async listAccounts(query: PageQuery): Promise<Paginated<Omit<AccountReference, 'vaultCredentialPath'>>> {
    return paginate(
      [...this.accounts.values()].map(({ vaultCredentialPath: _vaultCredentialPath, ...account }) => account),
      query
    );
  }

  async createAccount(
    input: CreateAccountDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<AccountReference> {
    return this.withIdempotency(idempotencyKey, () => {
      const now = new Date().toISOString();
      const account: AccountReference = {
        id: stableId(`account:${input.provider}:${input.externalAccountId}`),
        provider: input.provider,
        externalAccountId: input.externalAccountId,
        displayName: input.displayName,
        vendor: input.provider,
        createdAt: now,
        vaultCredentialPath: input.vaultCredentialPath
      };
      this.accounts.set(account.id, account);
      void this.auditLog.append(actor, 'account_created', 'account', account.id);
      return account;
    });
  }

  async listAccountGroups(query: PageQuery): Promise<Paginated<AccountGroup>> {
    return paginate([...this.accountGroups.values()], query);
  }

  async createAccountGroup(
    input: CreateAccountGroupDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<AccountGroup> {
    return this.withIdempotency(idempotencyKey, () => {
      const group: AccountGroup = {
        id: randomUUID(),
        name: input.name,
        accountIds: [...input.accountIds],
        createdAt: new Date().toISOString()
      };
      this.accountGroups.set(group.id, group);
      void this.auditLog.append(actor, 'account_group_created', 'account_group', group.id);
      return group;
    });
  }

  async updateAccountGroup(
    id: string,
    input: PatchAccountGroupDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<AccountGroup> {
    return this.withIdempotency(idempotencyKey, () => {
      const existing = this.accountGroups.get(id);
      if (!existing) {
        throw new NotFoundException(`Account group ${id} was not found.`);
      }
      const updated = {
        ...existing,
        name: input.name ?? existing.name,
        accountIds: input.accountIds ? [...input.accountIds] : existing.accountIds
      };
      this.accountGroups.set(id, updated);
      void this.auditLog.append(actor, 'account_group_updated', 'account_group', id);
      return updated;
    });
  }

  async deleteAccountGroup(id: string, actor: AuthenticatedUser, idempotencyKey: string): Promise<void> {
    this.withIdempotency(idempotencyKey, () => {
      if (!this.accountGroups.delete(id)) {
        throw new NotFoundException(`Account group ${id} was not found.`);
      }
      void this.auditLog.append(actor, 'account_group_deleted', 'account_group', id);
      return { deleted: true };
    });
  }

  async listCredentials(query: PageQuery): Promise<Paginated<CloudCredentialReference>> {
    return paginate([...this.credentials.values()], query);
  }

  async createCredential(
    input: CreateCloudCredentialDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<CloudCredentialReference> {
    return this.withIdempotency(idempotencyKey, () => {
      const credential: CloudCredentialReference = {
        id: randomUUID(),
        provider: input.provider,
        accountId: input.accountId,
        displayName: input.displayName,
        vaultPath: input.vaultPath,
        createdAt: new Date().toISOString(),
        rotatedAt: null
      };
      this.credentials.set(credential.id, credential);
      void this.auditLog.append(actor, 'credential_created', 'cloud_credential', credential.id);
      return credential;
    });
  }

  async rotateCredential(
    id: string,
    input: RotateCloudCredentialDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<CloudCredentialReference> {
    return this.withIdempotency(idempotencyKey, () => {
      const existing = this.credentials.get(id);
      if (!existing) {
        throw new NotFoundException(`Cloud credential ${id} was not found.`);
      }
      const updated = { ...existing, vaultPath: input.vaultPath, rotatedAt: new Date().toISOString() };
      this.credentials.set(id, updated);
      void this.auditLog.append(actor, 'credential_rotated', 'cloud_credential', id);
      return updated;
    });
  }

  async listUsers(query: PageQuery): Promise<Paginated<UserRecord>> {
    return paginate([...this.users.values()], query);
  }

  async createUser(input: CreateUserDto, actor: AuthenticatedUser, idempotencyKey: string): Promise<UserRecord> {
    return this.withIdempotency(idempotencyKey, () => {
      const user: UserRecord = {
        id: stableId(`user:${input.email.toLowerCase()}`),
        email: input.email,
        displayName: input.displayName,
        roles: [...new Set(input.roles)]
      };
      this.users.set(user.id, user);
      void this.auditLog.append(actor, 'role_change', 'user', user.id);
      return user;
    });
  }

  async listRoles() {
    return { data: fixedRoles };
  }

  async listAuditLog(query: PageQuery) {
    return this.auditLog.list(query);
  }

  async listViews(query: PageQuery, role: AuthenticatedUser['role']): Promise<Paginated<SavedView>> {
    return paginate(
      [...this.views.values()].filter((view) => role === 'admin' || view.sharedRoleScope.includes(role)),
      query
    );
  }

  async createView(input: CreateViewInput, actor: AuthenticatedUser, idempotencyKey: string): Promise<SavedView> {
    return this.withIdempotency(idempotencyKey, () => {
      const view: SavedView = {
        id: randomUUID(),
        orgId: stableId('org:default'),
        name: input.name,
        filterJson: input.filterJson,
        ownerId: stableId(`actor:${actor.subject}`),
        sharedRoleScope: [...new Set(input.sharedRoleScope ?? [actor.role])]
      };
      this.views.set(view.id, view);
      void this.auditLog.append(actor, 'view_created', 'view', view.id);
      return view;
    });
  }

  async getViewForRole(id: string, role: AuthenticatedUser['role']): Promise<SavedView> {
    const view = this.views.get(id);
    if (!view) {
      throw new NotFoundException(`View ${id} was not found.`);
    }
    if (role !== 'admin' && !view.sharedRoleScope.includes(role)) {
      throw new ForbiddenException(`View ${id} is not shared with ${role}.`);
    }
    return view;
  }

  private withIdempotency<T>(idempotencyKey: string, create: () => T): T {
    const existing = this.idempotentResponses.get(idempotencyKey);
    if (existing) {
      return existing as T;
    }
    const response = create();
    this.idempotentResponses.set(idempotencyKey, response);
    return response;
  }
}

function paginate<T>(items: T[], query: PageQuery): Paginated<T> {
  const start = (query.page - 1) * query.pageSize;
  return {
    data: items.slice(start, start + query.pageSize),
    meta: { total: items.length, page: query.page, pageSize: query.pageSize }
  };
}
