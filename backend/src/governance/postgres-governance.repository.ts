import { ForbiddenException, Injectable, NotFoundException, type OnModuleDestroy } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import type { CloudProvider } from '../cost-model/cost-record.types';
import { stableId } from '../cost-model/stable-id';
import type { Role } from '../security/roles';
import { DEFAULT_TENANT_ID, type AuthenticatedUser } from '../security/token-verifier';
import type { CreateAccountDto, CreateAccountGroupDto, PatchAccountGroupDto } from './dto/account.dto';
import { validateCloudConnectionShape, type CreateCloudConnectionDto } from './dto/cloud-connection.dto';
import type { CreateCloudCredentialDto, RotateCloudCredentialDto } from './dto/cloud-credential.dto';
import type { CreateTenantDto } from './dto/tenant.dto';
import type { CreateUserDto } from './dto/user.dto';
import { fixedRoles, type GovernanceRepository } from './governance.repository';
import type {
  AccountGroup,
  AccountReference,
  AuditLogEntry,
  CloudConnection,
  CloudCredentialReference,
  CreateViewInput,
  PageQuery,
  Paginated,
  SavedView,
  TenantRecord,
  UserRecord
} from './governance.types';

type PgPool = Pick<Pool, 'connect' | 'query'> & Partial<Pick<Pool, 'end'>>;
type PgRow = Record<string, unknown>;

@Injectable()
export class PostgresGovernanceRepository implements GovernanceRepository, OnModuleDestroy {
  private readonly pool: PgPool;
  private readonly ownsPool: boolean;

  constructor(poolOrConnectionString: PgPool | string) {
    if (typeof poolOrConnectionString === 'string') {
      this.ownsPool = true;
      this.pool = new Pool({ connectionString: poolOrConnectionString });
    } else {
      this.ownsPool = false;
      this.pool = poolOrConnectionString;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.ownsPool && this.pool.end) {
      await this.pool.end();
    }
  }

  async listTenants(actor: AuthenticatedUser): Promise<{ data: TenantRecord[] }> {
    const result = await this.pool.query(
      `SELECT id, name, slug, plan, created_at
       FROM tenants
       WHERE id = $1
       ORDER BY name ASC`,
      [actor.tenantId]
    );
    if (result.rows.length === 0 && actor.tenantId === DEFAULT_TENANT_ID) {
      return {
        data: [
          {
            id: DEFAULT_TENANT_ID,
            name: 'Default Tenant',
            slug: 'default',
            plan: 'business',
            createdAt: new Date(0).toISOString()
          }
        ]
      };
    }
    return { data: result.rows.map((row) => mapTenant(row as PgRow)) };
  }

  async createTenant(input: CreateTenantDto, actor: AuthenticatedUser, idempotencyKey: string): Promise<TenantRecord> {
    return this.withTransaction((client) =>
      this.withIdempotency(client, actor.tenantId, idempotencyKey, async () => {
        const slug = input.slug ?? slugify(input.name);
        const saved = await client.query(
          `INSERT INTO tenants (id, name, slug, plan, created_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, plan = EXCLUDED.plan
           RETURNING id, name, slug, plan, created_at`,
          [stableId(`tenant:${slug}`), input.name, slug, input.plan ?? 'business', new Date().toISOString()]
        );
        const tenant = mapTenant(saved.rows[0] as PgRow);
        await this.appendAudit(client, actor, 'tenant_created', 'tenant', tenant.id);
        return tenant;
      })
    );
  }

  async listCloudConnections(query: PageQuery, actor: AuthenticatedUser): Promise<Paginated<CloudConnection>> {
    const offset = (query.page - 1) * query.pageSize;
    const result = await this.pool.query(
      `SELECT id, tenant_id, provider, display_name, external_tenant_id, access_mode, read_only_principal,
              billing_export_uri, status, last_validated_at, created_at
       FROM cloud_connections
       WHERE tenant_id = $1
       ORDER BY created_at ASC, id ASC
       LIMIT $2 OFFSET $3`,
      [actor.tenantId, query.pageSize, offset]
    );
    const total = await this.pool.query('SELECT COUNT(id)::int AS total FROM cloud_connections WHERE tenant_id = $1', [
      actor.tenantId
    ]);
    return {
      data: result.rows.map((row) => mapCloudConnection(row as PgRow)),
      meta: { total: Number((total.rows[0] as PgRow | undefined)?.total ?? 0), page: query.page, pageSize: query.pageSize }
    };
  }

  async createCloudConnection(
    input: CreateCloudConnectionDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<CloudConnection> {
    return this.withTransaction((client) =>
      this.withIdempotency(client, actor.tenantId, idempotencyKey, async () => {
        const saved = await client.query(
          `INSERT INTO cloud_connections
             (id, tenant_id, provider, display_name, external_tenant_id, access_mode, read_only_principal,
              billing_export_uri, status, last_validated_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending_validation', NULL, $9)
           ON CONFLICT (tenant_id, provider, external_tenant_id)
           DO UPDATE SET display_name = EXCLUDED.display_name,
                         access_mode = EXCLUDED.access_mode,
                         read_only_principal = EXCLUDED.read_only_principal,
                         billing_export_uri = EXCLUDED.billing_export_uri
           RETURNING id, tenant_id, provider, display_name, external_tenant_id, access_mode, read_only_principal,
                     billing_export_uri, status, last_validated_at, created_at`,
          [
            stableId(`cloud-connection:${actor.tenantId}:${input.provider}:${input.externalTenantId}`),
            actor.tenantId,
            input.provider,
            input.displayName,
            input.externalTenantId,
            input.accessMode,
            input.readOnlyPrincipal,
            input.billingExportUri ?? null,
            new Date().toISOString()
          ]
        );
        const connection = mapCloudConnection(saved.rows[0] as PgRow);
        await this.appendAudit(client, actor, 'cloud_connection_created', 'cloud_connection', connection.id);
        return connection;
      })
    );
  }

  async validateCloudConnection(id: string, actor: AuthenticatedUser, idempotencyKey: string): Promise<CloudConnection> {
    return this.withTransaction((client) =>
      this.withIdempotency(client, actor.tenantId, idempotencyKey, async () => {
        const existing = await client.query(
          `SELECT id, tenant_id, provider, display_name, external_tenant_id, access_mode, read_only_principal,
                  billing_export_uri, status, last_validated_at, created_at
           FROM cloud_connections
           WHERE id = $1 AND tenant_id = $2`,
          [id, actor.tenantId]
        );
        if (!existing.rows[0]) {
          throw new NotFoundException(`Cloud connection ${id} was not found.`);
        }
        const current = mapCloudConnection(existing.rows[0] as PgRow);
        const isValid = validateCloudConnectionShape({
          provider: current.provider,
          displayName: current.displayName,
          externalTenantId: current.externalTenantId,
          accessMode: current.accessMode,
          readOnlyPrincipal: current.readOnlyPrincipal,
          billingExportUri: current.billingExportUri ?? undefined
        });
        const saved = await client.query(
          `UPDATE cloud_connections
           SET status = $1, last_validated_at = $2
           WHERE id = $3 AND tenant_id = $4
           RETURNING id, tenant_id, provider, display_name, external_tenant_id, access_mode, read_only_principal,
                     billing_export_uri, status, last_validated_at, created_at`,
          [isValid ? 'validated' : 'validation_failed', new Date().toISOString(), id, actor.tenantId]
        );
        const connection = mapCloudConnection(saved.rows[0] as PgRow);
        await this.appendAudit(client, actor, 'cloud_connection_validated', 'cloud_connection', id);
        return connection;
      })
    );
  }

  async listAccounts(
    query: PageQuery,
    actor: AuthenticatedUser
  ): Promise<Paginated<Omit<AccountReference, 'vaultCredentialPath'>>> {
    const offset = (query.page - 1) * query.pageSize;
    const result = await this.pool.query(
      `SELECT id, tenant_id, provider, cloud_connection_id, external_account_id, display_name, vendor, created_at
       FROM accounts
       WHERE tenant_id = $1
       ORDER BY created_at ASC, id ASC
       LIMIT $2 OFFSET $3`,
      [actor.tenantId, query.pageSize, offset]
    );
    const total = await this.pool.query('SELECT COUNT(id)::int AS total FROM accounts WHERE tenant_id = $1', [actor.tenantId]);
    return {
      data: result.rows.map((row) => mapAccount(row as PgRow)),
      meta: { total: Number((total.rows[0] as PgRow | undefined)?.total ?? 0), page: query.page, pageSize: query.pageSize }
    };
  }

  async createAccount(
    input: CreateAccountDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<AccountReference> {
    return this.withTransaction((client) =>
      this.withIdempotency(client, actor.tenantId, idempotencyKey, async () => {
        const now = new Date().toISOString();
        const accountId = stableId(`account:${actor.tenantId}:${input.provider}:${input.externalAccountId}`);
        const scopedExternalAccountId = tenantScopedStorageValue(actor.tenantId, input.externalAccountId);
        const saved = await client.query(
          `INSERT INTO accounts
             (id, tenant_id, provider, cloud_connection_id, external_account_id, display_name, vendor, created_at, vault_credential_path)
           VALUES ($1, $2, $3, $4, $5, $6, $3, $7, $8)
           ON CONFLICT (tenant_id, provider, external_account_id)
           DO UPDATE SET display_name = EXCLUDED.display_name,
                         cloud_connection_id = EXCLUDED.cloud_connection_id,
                         vault_credential_path = EXCLUDED.vault_credential_path
           RETURNING id, tenant_id, provider, cloud_connection_id, external_account_id, display_name, vendor, created_at, vault_credential_path`,
          [
            accountId,
            actor.tenantId,
            input.provider,
            input.cloudConnectionId ?? null,
            scopedExternalAccountId,
            input.displayName,
            now,
            input.vaultCredentialPath ?? null
          ]
        );
        const account = mapAccount(saved.rows[0] as PgRow);
        const response = { ...account, vaultCredentialPath: input.vaultCredentialPath };
        await this.appendAudit(client, actor, 'account_created', 'account', account.id);
        return response;
      })
    );
  }

  async listAccountGroups(query: PageQuery, actor: AuthenticatedUser): Promise<Paginated<AccountGroup>> {
    const offset = (query.page - 1) * query.pageSize;
    const result = await this.pool.query(
      `SELECT
         ag.id,
         ag.tenant_id,
         ag.name,
         ag.created_at,
         COALESCE(array_agg(agm.account_id::text ORDER BY agm.account_id) FILTER (WHERE agm.account_id IS NOT NULL), ARRAY[]::text[]) AS account_ids
       FROM account_groups ag
       LEFT JOIN account_group_members agm ON agm.account_group_id = ag.id
       WHERE ag.tenant_id = $1
       GROUP BY ag.id, ag.tenant_id, ag.name, ag.created_at
       ORDER BY ag.created_at ASC, ag.id ASC
       LIMIT $2 OFFSET $3`,
      [actor.tenantId, query.pageSize, offset]
    );
    const total = await this.pool.query('SELECT COUNT(id)::int AS total FROM account_groups WHERE tenant_id = $1', [
      actor.tenantId
    ]);
    return {
      data: result.rows.map((row) => mapAccountGroup(row as PgRow)),
      meta: { total: Number((total.rows[0] as PgRow | undefined)?.total ?? 0), page: query.page, pageSize: query.pageSize }
    };
  }

  async createAccountGroup(
    input: CreateAccountGroupDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<AccountGroup> {
    return this.withTransaction((client) =>
      this.withIdempotency(client, actor.tenantId, idempotencyKey, async () => {
        const groupId = randomUUID();
        const saved = await client.query(
          `INSERT INTO account_groups (id, tenant_id, name, created_at)
           VALUES ($1, $2, $3, $4)
           RETURNING id, tenant_id, name, created_at`,
          [groupId, actor.tenantId, input.name, new Date().toISOString()]
        );
        await this.replaceAccountGroupMembers(client, groupId, input.accountIds);
        const group = { ...mapAccountGroup(saved.rows[0] as PgRow), accountIds: [...input.accountIds] };
        await this.appendAudit(client, actor, 'account_group_created', 'account_group', group.id);
        return group;
      })
    );
  }

  async updateAccountGroup(
    id: string,
    input: PatchAccountGroupDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<AccountGroup> {
    return this.withTransaction((client) =>
      this.withIdempotency(client, actor.tenantId, idempotencyKey, async () => {
        const existing = await this.getAccountGroup(client, id, actor.tenantId);
        await client.query('UPDATE account_groups SET name = $1 WHERE id = $2', [input.name ?? existing.name, id]);
        if (input.accountIds) {
          await this.replaceAccountGroupMembers(client, id, input.accountIds);
        }
        const updated = await this.getAccountGroup(client, id, actor.tenantId);
        await this.appendAudit(client, actor, 'account_group_updated', 'account_group', id);
        return updated;
      })
    );
  }

  async deleteAccountGroup(id: string, actor: AuthenticatedUser, idempotencyKey: string): Promise<void> {
    await this.withTransaction((client) =>
      this.withIdempotency(client, actor.tenantId, idempotencyKey, async () => {
        await client.query('DELETE FROM account_group_members WHERE account_group_id = $1', [id]);
        const deleted = await client.query('DELETE FROM account_groups WHERE id = $1 AND tenant_id = $2', [
          id,
          actor.tenantId
        ]);
        if ((deleted.rowCount ?? 0) === 0) {
          throw new NotFoundException(`Account group ${id} was not found.`);
        }
        await this.appendAudit(client, actor, 'account_group_deleted', 'account_group', id);
        return { deleted: true };
      })
    );
  }

  async listCredentials(query: PageQuery, actor: AuthenticatedUser): Promise<Paginated<CloudCredentialReference>> {
    const offset = (query.page - 1) * query.pageSize;
    const result = await this.pool.query(
      `SELECT id, tenant_id, provider, account_id, display_name, vault_path, created_at, rotated_at
       FROM cloud_credentials
       WHERE tenant_id = $1
       ORDER BY created_at ASC, id ASC
       LIMIT $2 OFFSET $3`,
      [actor.tenantId, query.pageSize, offset]
    );
    const total = await this.pool.query('SELECT COUNT(id)::int AS total FROM cloud_credentials WHERE tenant_id = $1', [
      actor.tenantId
    ]);
    return {
      data: result.rows.map((row) => mapCredential(row as PgRow)),
      meta: { total: Number((total.rows[0] as PgRow | undefined)?.total ?? 0), page: query.page, pageSize: query.pageSize }
    };
  }

  async createCredential(
    input: CreateCloudCredentialDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<CloudCredentialReference> {
    return this.withTransaction((client) =>
      this.withIdempotency(client, actor.tenantId, idempotencyKey, async () => {
        const saved = await client.query(
          `INSERT INTO cloud_credentials (id, tenant_id, provider, account_id, display_name, vault_path, created_at, rotated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
           RETURNING id, tenant_id, provider, account_id, display_name, vault_path, created_at, rotated_at`,
          [
            randomUUID(),
            actor.tenantId,
            input.provider,
            input.accountId,
            input.displayName,
            input.vaultPath,
            new Date().toISOString()
          ]
        );
        const credential = mapCredential(saved.rows[0] as PgRow);
        await this.appendAudit(client, actor, 'credential_created', 'cloud_credential', credential.id);
        return credential;
      })
    );
  }

  async rotateCredential(
    id: string,
    input: RotateCloudCredentialDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<CloudCredentialReference> {
    return this.withTransaction((client) =>
      this.withIdempotency(client, actor.tenantId, idempotencyKey, async () => {
        const saved = await client.query(
          `UPDATE cloud_credentials
           SET vault_path = $1, rotated_at = $2
           WHERE id = $3 AND tenant_id = $4
           RETURNING id, tenant_id, provider, account_id, display_name, vault_path, created_at, rotated_at`,
          [input.vaultPath, new Date().toISOString(), id, actor.tenantId]
        );
        if (!saved.rows[0]) {
          throw new NotFoundException(`Cloud credential ${id} was not found.`);
        }
        const credential = mapCredential(saved.rows[0] as PgRow);
        await this.appendAudit(client, actor, 'credential_rotated', 'cloud_credential', id);
        return credential;
      })
    );
  }

  async listUsers(query: PageQuery, actor: AuthenticatedUser): Promise<Paginated<UserRecord>> {
    const offset = (query.page - 1) * query.pageSize;
    const result = await this.pool.query(
      `SELECT
         u.id,
         u.tenant_id,
         u.email,
         u.display_name,
         COALESCE(array_agg(ur.role_name ORDER BY ur.role_name) FILTER (WHERE ur.role_name IS NOT NULL), ARRAY[]::text[]) AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       WHERE u.tenant_id = $1
       GROUP BY u.id, u.tenant_id, u.email, u.display_name
       ORDER BY u.email ASC, u.id ASC
       LIMIT $2 OFFSET $3`,
      [actor.tenantId, query.pageSize, offset]
    );
    const total = await this.pool.query('SELECT COUNT(id)::int AS total FROM users WHERE tenant_id = $1', [actor.tenantId]);
    return {
      data: result.rows.map((row) => mapUser(row as PgRow)),
      meta: { total: Number((total.rows[0] as PgRow | undefined)?.total ?? 0), page: query.page, pageSize: query.pageSize }
    };
  }

  async createUser(input: CreateUserDto, actor: AuthenticatedUser, idempotencyKey: string): Promise<UserRecord> {
    return this.withTransaction((client) =>
      this.withIdempotency(client, actor.tenantId, idempotencyKey, async () => {
        const userId = stableId(`user:${actor.tenantId}:${input.email.toLowerCase()}`);
        const scopedEmail = tenantScopedStorageValue(actor.tenantId, input.email.toLowerCase());
        const saved = await client.query(
          `INSERT INTO users (id, tenant_id, email, display_name)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (tenant_id, email)
           DO UPDATE SET display_name = EXCLUDED.display_name
           RETURNING id, tenant_id, email, display_name`,
          [userId, actor.tenantId, scopedEmail, input.displayName]
        );
        await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
        const uniqueRoles = [...new Set(input.roles)];
        for (const role of uniqueRoles) {
          await client.query(
            `INSERT INTO user_roles (user_id, role_name)
             VALUES ($1, $2)
             ON CONFLICT (user_id, role_name) DO NOTHING`,
            [userId, role]
          );
        }
        const user = { ...mapUser(saved.rows[0] as PgRow), roles: uniqueRoles };
        await this.appendAudit(client, actor, 'role_change', 'user', user.id);
        return user;
      })
    );
  }

  async listRoles(): Promise<{ data: typeof fixedRoles }> {
    const result = await this.pool.query(
      `SELECT name, fixed
       FROM roles
       WHERE name IN ('viewer', 'analyst', 'admin')
       ORDER BY CASE name WHEN 'viewer' THEN 1 WHEN 'analyst' THEN 2 WHEN 'admin' THEN 3 ELSE 4 END`
    );
    const data = result.rows.length > 0 ? result.rows.map((row) => mapRole(row as PgRow)) : fixedRoles;
    return { data };
  }

  async listAuditLog(query: PageQuery, actor: AuthenticatedUser): Promise<Paginated<AuditLogEntry>> {
    const offset = (query.page - 1) * query.pageSize;
    const result = await this.pool.query(
      `SELECT id, tenant_id, actor_id, action, target_type, target_id, prev_hash, hash, created_at
       FROM audit_log
       WHERE tenant_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2 OFFSET $3`,
      [actor.tenantId, query.pageSize, offset]
    );
    const total = await this.pool.query('SELECT COUNT(id)::int AS total FROM audit_log WHERE tenant_id = $1', [
      actor.tenantId
    ]);
    return {
      data: result.rows.map((row) => mapAuditLogEntry(row as PgRow)),
      meta: { total: Number((total.rows[0] as PgRow | undefined)?.total ?? 0), page: query.page, pageSize: query.pageSize }
    };
  }

  async listViews(query: PageQuery, actor: AuthenticatedUser): Promise<Paginated<SavedView>> {
    const offset = (query.page - 1) * query.pageSize;
    const result = await this.pool.query(
      `SELECT id, org_id, name, filter_json, owner_id, shared_role_scope
       FROM views
       WHERE org_id = $3
         AND ($4 = 'admin' OR $4 = ANY(shared_role_scope))
       ORDER BY created_at ASC, id ASC
       LIMIT $1 OFFSET $2`,
      [query.pageSize, offset, actor.tenantId, actor.role]
    );
    const total = await this.pool.query(
      `SELECT COUNT(id)::int AS total
       FROM views
       WHERE org_id = $1
         AND ($2 = 'admin' OR $2 = ANY(shared_role_scope))`,
      [actor.tenantId, actor.role]
    );
    return {
      data: result.rows.map((row) => mapView(row as PgRow)),
      meta: { total: Number((total.rows[0] as PgRow | undefined)?.total ?? 0), page: query.page, pageSize: query.pageSize }
    };
  }

  async createView(input: CreateViewInput, actor: AuthenticatedUser, idempotencyKey: string): Promise<SavedView> {
    return this.withTransaction((client) =>
      this.withIdempotency(client, actor.tenantId, idempotencyKey, async () => {
        const saved = await client.query(
          `INSERT INTO views (id, org_id, name, filter_json, owner_id, shared_role_scope, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, org_id, name, filter_json, owner_id, shared_role_scope`,
          [
            randomUUID(),
            actor.tenantId,
            input.name,
            JSON.stringify(input.filterJson),
            stableId(`actor:${actor.subject}`),
            [...new Set(input.sharedRoleScope ?? [actor.role])],
            new Date().toISOString()
          ]
        );
        const view = mapView(saved.rows[0] as PgRow);
        await this.appendAudit(client, actor, 'view_created', 'view', view.id);
        return view;
      })
    );
  }

  async getViewForRole(id: string, actor: AuthenticatedUser): Promise<SavedView> {
    const result = await this.pool.query(
      `SELECT id, org_id, name, filter_json, owner_id, shared_role_scope
       FROM views
       WHERE id = $1 AND org_id = $2`,
      [id, actor.tenantId]
    );
    if (!result.rows[0]) {
      throw new NotFoundException(`View ${id} was not found.`);
    }
    const view = mapView(result.rows[0] as PgRow);
    if (actor.role !== 'admin' && !view.sharedRoleScope.includes(actor.role)) {
      throw new ForbiddenException(`View ${id} is not shared with ${actor.role}.`);
    }
    return view;
  }

  private async withTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async withIdempotency<T>(
    client: PoolClient,
    tenantId: string,
    idempotencyKey: string,
    create: () => Promise<T>
  ): Promise<T> {
    const scopedIdempotencyKey = tenantScopedStorageValue(tenantId, idempotencyKey);
    const existing = await client.query(
      `SELECT response_json
       FROM governance_idempotency
       WHERE tenant_id = $1 AND idempotency_key = ANY($2::text[])`,
      [tenantId, tenantStorageCandidates(tenantId, idempotencyKey)]
    );
    if (existing.rows[0]) {
      return (existing.rows[0] as PgRow).response_json as T;
    }
    const response = await create();
    await client.query(
      `INSERT INTO governance_idempotency (tenant_id, idempotency_key, response_json, created_at)
       VALUES ($1, $2, $3, $4)`,
      [tenantId, scopedIdempotencyKey, JSON.stringify(response), new Date().toISOString()]
    );
    return response;
  }

  private async replaceAccountGroupMembers(client: PoolClient, groupId: string, accountIds: string[]): Promise<void> {
    await client.query('DELETE FROM account_group_members WHERE account_group_id = $1', [groupId]);
    for (const accountId of [...new Set(accountIds)]) {
      await client.query(
        `INSERT INTO account_group_members (account_group_id, account_id)
         VALUES ($1, $2)
         ON CONFLICT (account_group_id, account_id) DO NOTHING`,
        [groupId, accountId]
      );
    }
  }

  private async getAccountGroup(client: PoolClient, id: string, tenantId: string): Promise<AccountGroup> {
    const result = await client.query(
      `SELECT
         ag.id,
         ag.tenant_id,
         ag.name,
         ag.created_at,
         COALESCE(array_agg(agm.account_id::text ORDER BY agm.account_id) FILTER (WHERE agm.account_id IS NOT NULL), ARRAY[]::text[]) AS account_ids
       FROM account_groups ag
       LEFT JOIN account_group_members agm ON agm.account_group_id = ag.id
       WHERE ag.id = $1 AND ag.tenant_id = $2
       GROUP BY ag.id, ag.tenant_id, ag.name, ag.created_at`,
      [id, tenantId]
    );
    if (!result.rows[0]) {
      throw new NotFoundException(`Account group ${id} was not found.`);
    }
    return mapAccountGroup(result.rows[0] as PgRow);
  }

  private async appendAudit(
    client: PoolClient,
    actor: AuthenticatedUser,
    action: string,
    targetType: string,
    targetId: string
  ): Promise<void> {
    const previous = await client.query(
      `SELECT hash
       FROM audit_log
       WHERE tenant_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [actor.tenantId]
    );
    const entryWithoutHash = {
      id: randomUUID(),
      tenantId: actor.tenantId,
      actorId: stableId(`actor:${actor.subject}`),
      action,
      targetType,
      targetId,
      prevHash: (previous.rows[0] as PgRow | undefined)?.hash ? String((previous.rows[0] as PgRow).hash) : null,
      createdAt: new Date().toISOString()
    };
    const hash = createHash('sha256').update(canonicalJson(entryWithoutHash)).digest('hex');
    await client.query(
      `INSERT INTO audit_log (id, tenant_id, actor_id, action, target_type, target_id, prev_hash, hash, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        entryWithoutHash.id,
        actor.tenantId,
        entryWithoutHash.actorId,
        action,
        targetType,
        targetId,
        entryWithoutHash.prevHash,
        hash,
        entryWithoutHash.createdAt
      ]
    );
  }
}

function mapAccount(row: PgRow): Omit<AccountReference, 'vaultCredentialPath'> {
  const tenantId = String(row.tenant_id);
  return {
    id: String(row.id),
    tenantId,
    provider: row.provider as CloudProvider,
    cloudConnectionId: row.cloud_connection_id ? String(row.cloud_connection_id) : null,
    externalAccountId: decodeTenantScopedStorageValue(tenantId, String(row.external_account_id)),
    displayName: String(row.display_name),
    vendor: String(row.vendor),
    createdAt: toIso(row.created_at)
  };
}

function mapAccountGroup(row: PgRow): AccountGroup {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    accountIds: toStringArray(row.account_ids),
    createdAt: toIso(row.created_at)
  };
}

function mapCredential(row: PgRow): CloudCredentialReference {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    provider: row.provider as CloudProvider,
    accountId: String(row.account_id),
    displayName: String(row.display_name),
    vaultPath: String(row.vault_path),
    createdAt: toIso(row.created_at),
    rotatedAt: row.rotated_at ? toIso(row.rotated_at) : null
  };
}

function mapUser(row: PgRow): UserRecord {
  const tenantId = String(row.tenant_id);
  return {
    id: String(row.id),
    tenantId,
    email: decodeTenantScopedStorageValue(tenantId, String(row.email)),
    displayName: String(row.display_name),
    roles: toStringArray(row.roles) as Role[]
  };
}

function mapRole(row: PgRow): (typeof fixedRoles)[number] {
  return {
    name: row.name as Role,
    fixed: Boolean(row.fixed) as true
  };
}

function mapAuditLogEntry(row: PgRow): AuditLogEntry {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    actorId: String(row.actor_id),
    action: String(row.action),
    targetType: String(row.target_type),
    targetId: String(row.target_id),
    prevHash: row.prev_hash ? String(row.prev_hash) : null,
    hash: String(row.hash),
    createdAt: toIso(row.created_at)
  };
}

function mapView(row: PgRow): SavedView {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    name: String(row.name),
    filterJson: toObject(row.filter_json),
    ownerId: String(row.owner_id),
    sharedRoleScope: toStringArray(row.shared_role_scope) as Role[]
  };
}

function mapTenant(row: PgRow): TenantRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    plan: row.plan as TenantRecord['plan'],
    createdAt: toIso(row.created_at)
  };
}

function mapCloudConnection(row: PgRow): CloudConnection {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    provider: row.provider as CloudProvider,
    displayName: String(row.display_name),
    externalTenantId: String(row.external_tenant_id),
    accessMode: row.access_mode as CloudConnection['accessMode'],
    readOnlyPrincipal: String(row.read_only_principal),
    billingExportUri: row.billing_export_uri ? String(row.billing_export_uri) : null,
    status: row.status as CloudConnection['status'],
    lastValidatedAt: row.last_validated_at ? toIso(row.last_validated_at) : null,
    createdAt: toIso(row.created_at)
  };
}

function toObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  return [];
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
  return slug || 'tenant';
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
}

function tenantScopedStorageValue(tenantId: string, value: string): string {
  return `${tenantId}:${value}`;
}

function decodeTenantScopedStorageValue(tenantId: string, value: string): string {
  const prefix = `${tenantId}:`;
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function tenantStorageCandidates(tenantId: string, value: string): string[] {
  return [tenantScopedStorageValue(tenantId, value), value];
}
