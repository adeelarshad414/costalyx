import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InMemoryAuditLogStore, type AuditLogStore } from '../audit/audit-log.store';
import { stableId } from '../cost-model/stable-id';
import { DEFAULT_TENANT_ID, type AuthenticatedUser } from '../security/token-verifier';
import type { CreateAccountDto, CreateAccountGroupDto, PatchAccountGroupDto } from './dto/account.dto';
import {
  buildCloudConnectionExternalId,
  probeCloudConnection
} from './cloud-connection-probe';
import type { CreateCloudConnectionDto } from './dto/cloud-connection.dto';
import type { CreateCloudCredentialDto, RotateCloudCredentialDto } from './dto/cloud-credential.dto';
import type { CreateTenantDto } from './dto/tenant.dto';
import type { CreateUserDto } from './dto/user.dto';
import { fixedRoles, type GovernanceRepository } from './governance.repository';
import type {
  AccountGroup,
  AccountReference,
  CloudConnection,
  CloudConnectionRun,
  CloudCredentialReference,
  CreateViewInput,
  PageQuery,
  Paginated,
  RecordCloudConnectionRunInput,
  SavedView,
  TenantRecord,
  UserRecord
} from './governance.types';

@Injectable()
export class InMemoryGovernanceRepository implements GovernanceRepository {
  private readonly tenants = new Map<string, TenantRecord>([
    [
      DEFAULT_TENANT_ID,
      {
        id: DEFAULT_TENANT_ID,
        name: 'Default Tenant',
        slug: 'default',
        plan: 'business',
        createdAt: new Date(0).toISOString()
      }
    ]
  ]);
  private readonly cloudConnections = new Map<string, CloudConnection>();
  private readonly cloudConnectionRuns = new Map<string, CloudConnectionRun>();
  private readonly accounts = new Map<string, AccountReference>();
  private readonly accountGroups = new Map<string, AccountGroup>();
  private readonly credentials = new Map<string, CloudCredentialReference>();
  private readonly users = new Map<string, UserRecord>();
  private readonly views = new Map<string, SavedView>();
  private readonly idempotentResponses = new Map<string, unknown>();

  constructor(private readonly auditLog: AuditLogStore = new InMemoryAuditLogStore()) {}

  async listTenants(actor: AuthenticatedUser): Promise<{ data: TenantRecord[] }> {
    return { data: [...this.tenants.values()].filter((tenant) => tenant.id === actor.tenantId) };
  }

  async createTenant(input: CreateTenantDto, actor: AuthenticatedUser, idempotencyKey: string): Promise<TenantRecord> {
    return this.withIdempotency(actor, idempotencyKey, () => {
      const slug = input.slug ?? slugify(input.name);
      const tenant: TenantRecord = {
        id: stableId(`tenant:${slug}`),
        name: input.name,
        slug,
        plan: input.plan ?? 'business',
        createdAt: new Date().toISOString()
      };
      this.tenants.set(tenant.id, tenant);
      void this.auditLog.append(actor, 'tenant_created', 'tenant', tenant.id);
      return tenant;
    });
  }

  async listCloudConnections(query: PageQuery, actor: AuthenticatedUser): Promise<Paginated<CloudConnection>> {
    return paginate(
      [...this.cloudConnections.values()].filter((connection) => connection.tenantId === actor.tenantId),
      query
    );
  }

  async listCloudConnectionsForScheduler(): Promise<CloudConnection[]> {
    return [...this.cloudConnections.values()].sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
    );
  }

  async getCloudConnection(id: string, actor: AuthenticatedUser): Promise<CloudConnection> {
    const connection = this.cloudConnections.get(id);
    if (!connection || connection.tenantId !== actor.tenantId) {
      throw new NotFoundException(`Cloud connection ${id} was not found.`);
    }
    return connection;
  }

  async createCloudConnection(
    input: CreateCloudConnectionDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<CloudConnection> {
    return this.withIdempotency(actor, idempotencyKey, () => {
      const connection: CloudConnection = {
        id: stableId(`cloud-connection:${actor.tenantId}:${input.provider}:${input.externalTenantId}`),
        tenantId: actor.tenantId,
        externalId: '',
        provider: input.provider,
        displayName: input.displayName,
        externalTenantId: input.externalTenantId,
        accessMode: input.accessMode,
        readOnlyPrincipal: input.readOnlyPrincipal,
        billingExportUri: input.billingExportUri ?? null,
        status: 'pending_validation',
        lastValidatedAt: null,
        lastValidationAttemptedAt: null,
        lastValidationCode: null,
        lastValidationMessage: null,
        createdAt: new Date().toISOString()
      };
      connection.externalId = buildCloudConnectionExternalId(connection);
      this.cloudConnections.set(connection.id, connection);
      void this.auditLog.append(actor, 'cloud_connection_created', 'cloud_connection', connection.id);
      return connection;
    });
  }

  async validateCloudConnection(id: string, actor: AuthenticatedUser, idempotencyKey: string): Promise<CloudConnection> {
    return this.withIdempotency(actor, idempotencyKey, async () => {
      const existing = this.cloudConnections.get(id);
      if (!existing || existing.tenantId !== actor.tenantId) {
        throw new NotFoundException(`Cloud connection ${id} was not found.`);
      }
      const validation = await probeCloudConnection(existing);
      const updated: CloudConnection = {
        ...existing,
        status: validation.status,
        lastValidatedAt: validation.validatedAt,
        lastValidationAttemptedAt: validation.attemptedAt,
        lastValidationCode: validation.code,
        lastValidationMessage: validation.message
      };
      this.cloudConnections.set(id, updated);
      await this.recordCloudConnectionRun(
        {
          cloudConnectionId: id,
          runType: 'validation',
          status: validation.status === 'validation_failed' ? 'failed' : 'succeeded',
          startedAt: validation.attemptedAt,
          completedAt: validation.attemptedAt,
          evidence: {
            provider: existing.provider,
            connectionStatus: validation.status,
            code: validation.code,
            message: validation.message
          }
        },
        actor
      );
      void this.auditLog.append(actor, 'cloud_connection_validated', 'cloud_connection', id);
      return updated;
    });
  }

  async listCloudConnectionRuns(
    id: string,
    query: PageQuery,
    actor: AuthenticatedUser
  ): Promise<Paginated<CloudConnectionRun>> {
    const connection = await this.getCloudConnection(id, actor);
    const runs = [...this.cloudConnectionRuns.values()].filter(
      (run) => run.tenantId === actor.tenantId && run.cloudConnectionId === id
    );
    const syntheticValidationRun = buildSyntheticValidationRun(connection);
    if (syntheticValidationRun && !runs.some((run) => run.runType === 'validation')) {
      runs.push(syntheticValidationRun);
    }
    return paginate(
      runs.sort((a, b) => b.completedAt.localeCompare(a.completedAt) || b.id.localeCompare(a.id)),
      query
    );
  }

  async recordCloudConnectionRun(
    input: RecordCloudConnectionRunInput,
    actor: AuthenticatedUser
  ): Promise<CloudConnectionRun> {
    const connection = this.cloudConnections.get(input.cloudConnectionId);
    if (!connection || connection.tenantId !== actor.tenantId) {
      throw new NotFoundException(`Cloud connection ${input.cloudConnectionId} was not found.`);
    }
    const run: CloudConnectionRun = {
      id: randomUUID(),
      tenantId: actor.tenantId,
      cloudConnectionId: input.cloudConnectionId,
      runType: input.runType,
      status: input.status,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      evidence: { ...input.evidence },
      createdAt: new Date().toISOString()
    };
    this.cloudConnectionRuns.set(run.id, run);
    void this.auditLog.append(actor, 'cloud_connection_run_recorded', 'cloud_connection', input.cloudConnectionId);
    return run;
  }

  async listAccounts(
    query: PageQuery,
    actor: AuthenticatedUser
  ): Promise<Paginated<Omit<AccountReference, 'vaultCredentialPath'>>> {
    return paginate(
      [...this.accounts.values()]
        .filter((account) => account.tenantId === actor.tenantId)
        .map(({ vaultCredentialPath: _vaultCredentialPath, ...account }) => account),
      query
    );
  }

  async createAccount(
    input: CreateAccountDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<AccountReference> {
    return this.withIdempotency(actor, idempotencyKey, () => {
      const now = new Date().toISOString();
      const account: AccountReference = {
        id: stableId(`account:${actor.tenantId}:${input.provider}:${input.externalAccountId}`),
        tenantId: actor.tenantId,
        provider: input.provider,
        cloudConnectionId: input.cloudConnectionId ?? null,
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

  async listAccountGroups(query: PageQuery, actor: AuthenticatedUser): Promise<Paginated<AccountGroup>> {
    return paginate(
      [...this.accountGroups.values()].filter((group) => group.tenantId === actor.tenantId),
      query
    );
  }

  async createAccountGroup(
    input: CreateAccountGroupDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<AccountGroup> {
    return this.withIdempotency(actor, idempotencyKey, () => {
      const group: AccountGroup = {
        id: randomUUID(),
        tenantId: actor.tenantId,
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
    return this.withIdempotency(actor, idempotencyKey, () => {
      const existing = this.accountGroups.get(id);
      if (!existing || existing.tenantId !== actor.tenantId) {
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
    this.withIdempotency(actor, idempotencyKey, () => {
      const existing = this.accountGroups.get(id);
      if (!existing || existing.tenantId !== actor.tenantId) {
        throw new NotFoundException(`Account group ${id} was not found.`);
      }
      this.accountGroups.delete(id);
      void this.auditLog.append(actor, 'account_group_deleted', 'account_group', id);
      return { deleted: true };
    });
  }

  async listCredentials(query: PageQuery, actor: AuthenticatedUser): Promise<Paginated<CloudCredentialReference>> {
    return paginate(
      [...this.credentials.values()].filter((credential) => credential.tenantId === actor.tenantId),
      query
    );
  }

  async createCredential(
    input: CreateCloudCredentialDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<CloudCredentialReference> {
    return this.withIdempotency(actor, idempotencyKey, () => {
      const credential: CloudCredentialReference = {
        id: randomUUID(),
        tenantId: actor.tenantId,
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
    return this.withIdempotency(actor, idempotencyKey, () => {
      const existing = this.credentials.get(id);
      if (!existing || existing.tenantId !== actor.tenantId) {
        throw new NotFoundException(`Cloud credential ${id} was not found.`);
      }
      const updated = { ...existing, vaultPath: input.vaultPath, rotatedAt: new Date().toISOString() };
      this.credentials.set(id, updated);
      void this.auditLog.append(actor, 'credential_rotated', 'cloud_credential', id);
      return updated;
    });
  }

  async listUsers(query: PageQuery, actor: AuthenticatedUser): Promise<Paginated<UserRecord>> {
    return paginate(
      [...this.users.values()].filter((user) => user.tenantId === actor.tenantId),
      query
    );
  }

  async createUser(input: CreateUserDto, actor: AuthenticatedUser, idempotencyKey: string): Promise<UserRecord> {
    return this.withIdempotency(actor, idempotencyKey, () => {
      const user: UserRecord = {
        id: stableId(`user:${actor.tenantId}:${input.email.toLowerCase()}`),
        tenantId: actor.tenantId,
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

  async listAuditLog(query: PageQuery, actor: AuthenticatedUser) {
    return this.auditLog.list(query, actor.tenantId);
  }

  async listViews(query: PageQuery, actor: AuthenticatedUser): Promise<Paginated<SavedView>> {
    return paginate(
      [...this.views.values()].filter(
        (view) => view.orgId === actor.tenantId && (actor.role === 'admin' || view.sharedRoleScope.includes(actor.role))
      ),
      query
    );
  }

  async createView(input: CreateViewInput, actor: AuthenticatedUser, idempotencyKey: string): Promise<SavedView> {
    return this.withIdempotency(actor, idempotencyKey, () => {
      const view: SavedView = {
        id: randomUUID(),
        orgId: actor.tenantId,
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

  async getViewForRole(id: string, actor: AuthenticatedUser): Promise<SavedView> {
    const view = this.views.get(id);
    if (!view || view.orgId !== actor.tenantId) {
      throw new NotFoundException(`View ${id} was not found.`);
    }
    if (actor.role !== 'admin' && !view.sharedRoleScope.includes(actor.role)) {
      throw new ForbiddenException(`View ${id} is not shared with ${actor.role}.`);
    }
    return view;
  }

  private withIdempotency<T>(actor: AuthenticatedUser, idempotencyKey: string, create: () => T): T {
    const scopedKey = `${actor.tenantId}:${idempotencyKey}`;
    const existing = this.idempotentResponses.get(scopedKey);
    if (existing) {
      return existing as T;
    }
    const response = create();
    this.idempotentResponses.set(scopedKey, response);
    return response;
  }
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
  return slug || 'tenant';
}

function paginate<T>(items: T[], query: PageQuery): Paginated<T> {
  const page = Number.isFinite(Number(query.page)) && Number(query.page) > 0 ? Number(query.page) : 1;
  const pageSize = Number.isFinite(Number(query.pageSize)) && Number(query.pageSize) > 0 ? Number(query.pageSize) : 25;
  const start = (page - 1) * pageSize;
  return {
    data: items.slice(start, start + pageSize),
    meta: { total: items.length, page, pageSize }
  };
}

function buildSyntheticValidationRun(connection: CloudConnection): CloudConnectionRun | null {
  if (!connection.lastValidationAttemptedAt || !connection.lastValidationCode || !connection.lastValidationMessage) {
    return null;
  }
  return {
    id: stableId(
      `cloud-connection-run:${connection.tenantId}:${connection.id}:validation:${connection.lastValidationAttemptedAt}`
    ),
    tenantId: connection.tenantId,
    cloudConnectionId: connection.id,
    runType: 'validation',
    status: connection.status === 'validation_failed' ? 'failed' : 'succeeded',
    startedAt: connection.lastValidationAttemptedAt,
    completedAt: connection.lastValidationAttemptedAt,
    evidence: {
      provider: connection.provider,
      connectionStatus: connection.status,
      code: connection.lastValidationCode,
      message: connection.lastValidationMessage
    },
    createdAt: connection.lastValidationAttemptedAt
  };
}
