import { ForbiddenException, Injectable, NotFoundException, type OnModuleDestroy } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import type { CloudProvider } from '../cost-model/cost-record.types';
import { stableId } from '../cost-model/stable-id';
import type { Role } from '../security/roles';
import type { AuthenticatedUser } from '../security/token-verifier';
import type { CreateAccountDto, CreateAccountGroupDto, PatchAccountGroupDto } from './dto/account.dto';
import type { CreateCloudCredentialDto, RotateCloudCredentialDto } from './dto/cloud-credential.dto';
import type { CreateUserDto } from './dto/user.dto';
import { fixedRoles, type GovernanceRepository } from './governance.repository';
import type {
  AccountGroup,
  AccountReference,
  AuditLogEntry,
  CloudCredentialReference,
  CreateViewInput,
  PageQuery,
  Paginated,
  SavedView,
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

  async listAccounts(query: PageQuery): Promise<Paginated<Omit<AccountReference, 'vaultCredentialPath'>>> {
    const offset = (query.page - 1) * query.pageSize;
    const result = await this.pool.query(
      `SELECT id, provider, external_account_id, display_name, vendor, created_at
       FROM accounts
       ORDER BY created_at ASC, id ASC
       LIMIT $1 OFFSET $2`,
      [query.pageSize, offset]
    );
    const total = await this.pool.query('SELECT COUNT(id)::int AS total FROM accounts');
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
      this.withIdempotency(client, idempotencyKey, async () => {
        const now = new Date().toISOString();
        const accountId = stableId(`account:${input.provider}:${input.externalAccountId}`);
        const saved = await client.query(
          `INSERT INTO accounts (id, provider, external_account_id, display_name, vendor, created_at, vault_credential_path)
           VALUES ($1, $2, $3, $4, $2, $5, $6)
           ON CONFLICT (provider, external_account_id)
           DO UPDATE SET display_name = EXCLUDED.display_name, vault_credential_path = EXCLUDED.vault_credential_path
           RETURNING id, provider, external_account_id, display_name, vendor, created_at, vault_credential_path`,
          [accountId, input.provider, input.externalAccountId, input.displayName, now, input.vaultCredentialPath ?? null]
        );
        const account = mapAccount(saved.rows[0] as PgRow);
        const response = { ...account, vaultCredentialPath: input.vaultCredentialPath };
        await this.appendAudit(client, actor, 'account_created', 'account', account.id);
        return response;
      })
    );
  }

  async listAccountGroups(query: PageQuery): Promise<Paginated<AccountGroup>> {
    const offset = (query.page - 1) * query.pageSize;
    const result = await this.pool.query(
      `SELECT
         ag.id,
         ag.name,
         ag.created_at,
         COALESCE(array_agg(agm.account_id::text ORDER BY agm.account_id) FILTER (WHERE agm.account_id IS NOT NULL), ARRAY[]::text[]) AS account_ids
       FROM account_groups ag
       LEFT JOIN account_group_members agm ON agm.account_group_id = ag.id
       GROUP BY ag.id, ag.name, ag.created_at
       ORDER BY ag.created_at ASC, ag.id ASC
       LIMIT $1 OFFSET $2`,
      [query.pageSize, offset]
    );
    const total = await this.pool.query('SELECT COUNT(id)::int AS total FROM account_groups');
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
      this.withIdempotency(client, idempotencyKey, async () => {
        const groupId = randomUUID();
        const saved = await client.query(
          `INSERT INTO account_groups (id, name, created_at)
           VALUES ($1, $2, $3)
           RETURNING id, name, created_at`,
          [groupId, input.name, new Date().toISOString()]
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
      this.withIdempotency(client, idempotencyKey, async () => {
        const existing = await this.getAccountGroup(client, id);
        await client.query('UPDATE account_groups SET name = $1 WHERE id = $2', [input.name ?? existing.name, id]);
        if (input.accountIds) {
          await this.replaceAccountGroupMembers(client, id, input.accountIds);
        }
        const updated = await this.getAccountGroup(client, id);
        await this.appendAudit(client, actor, 'account_group_updated', 'account_group', id);
        return updated;
      })
    );
  }

  async deleteAccountGroup(id: string, actor: AuthenticatedUser, idempotencyKey: string): Promise<void> {
    await this.withTransaction((client) =>
      this.withIdempotency(client, idempotencyKey, async () => {
        await client.query('DELETE FROM account_group_members WHERE account_group_id = $1', [id]);
        const deleted = await client.query('DELETE FROM account_groups WHERE id = $1', [id]);
        if ((deleted.rowCount ?? 0) === 0) {
          throw new NotFoundException(`Account group ${id} was not found.`);
        }
        await this.appendAudit(client, actor, 'account_group_deleted', 'account_group', id);
        return { deleted: true };
      })
    );
  }

  async listCredentials(query: PageQuery): Promise<Paginated<CloudCredentialReference>> {
    const offset = (query.page - 1) * query.pageSize;
    const result = await this.pool.query(
      `SELECT id, provider, account_id, display_name, vault_path, created_at, rotated_at
       FROM cloud_credentials
       ORDER BY created_at ASC, id ASC
       LIMIT $1 OFFSET $2`,
      [query.pageSize, offset]
    );
    const total = await this.pool.query('SELECT COUNT(id)::int AS total FROM cloud_credentials');
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
      this.withIdempotency(client, idempotencyKey, async () => {
        const saved = await client.query(
          `INSERT INTO cloud_credentials (id, provider, account_id, display_name, vault_path, created_at, rotated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NULL)
           RETURNING id, provider, account_id, display_name, vault_path, created_at, rotated_at`,
          [randomUUID(), input.provider, input.accountId, input.displayName, input.vaultPath, new Date().toISOString()]
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
      this.withIdempotency(client, idempotencyKey, async () => {
        const saved = await client.query(
          `UPDATE cloud_credentials
           SET vault_path = $1, rotated_at = $2
           WHERE id = $3
           RETURNING id, provider, account_id, display_name, vault_path, created_at, rotated_at`,
          [input.vaultPath, new Date().toISOString(), id]
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

  async listUsers(query: PageQuery): Promise<Paginated<UserRecord>> {
    const offset = (query.page - 1) * query.pageSize;
    const result = await this.pool.query(
      `SELECT
         u.id,
         u.email,
         u.display_name,
         COALESCE(array_agg(ur.role_name ORDER BY ur.role_name) FILTER (WHERE ur.role_name IS NOT NULL), ARRAY[]::text[]) AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       GROUP BY u.id, u.email, u.display_name
       ORDER BY u.email ASC, u.id ASC
       LIMIT $1 OFFSET $2`,
      [query.pageSize, offset]
    );
    const total = await this.pool.query('SELECT COUNT(id)::int AS total FROM users');
    return {
      data: result.rows.map((row) => mapUser(row as PgRow)),
      meta: { total: Number((total.rows[0] as PgRow | undefined)?.total ?? 0), page: query.page, pageSize: query.pageSize }
    };
  }

  async createUser(input: CreateUserDto, actor: AuthenticatedUser, idempotencyKey: string): Promise<UserRecord> {
    return this.withTransaction((client) =>
      this.withIdempotency(client, idempotencyKey, async () => {
        const userId = stableId(`user:${input.email.toLowerCase()}`);
        const saved = await client.query(
          `INSERT INTO users (id, email, display_name)
           VALUES ($1, $2, $3)
           ON CONFLICT (email)
           DO UPDATE SET display_name = EXCLUDED.display_name
           RETURNING id, email, display_name`,
          [userId, input.email, input.displayName]
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

  async listAuditLog(query: PageQuery): Promise<Paginated<AuditLogEntry>> {
    const offset = (query.page - 1) * query.pageSize;
    const result = await this.pool.query(
      `SELECT id, actor_id, action, target_type, target_id, prev_hash, hash, created_at
       FROM audit_log
       ORDER BY created_at DESC, id DESC
       LIMIT $1 OFFSET $2`,
      [query.pageSize, offset]
    );
    const total = await this.pool.query('SELECT COUNT(id)::int AS total FROM audit_log');
    return {
      data: result.rows.map((row) => mapAuditLogEntry(row as PgRow)),
      meta: { total: Number((total.rows[0] as PgRow | undefined)?.total ?? 0), page: query.page, pageSize: query.pageSize }
    };
  }

  async listViews(query: PageQuery, role: Role): Promise<Paginated<SavedView>> {
    const offset = (query.page - 1) * query.pageSize;
    const result = await this.pool.query(
      `SELECT id, org_id, name, filter_json, owner_id, shared_role_scope
       FROM views
       WHERE $3 = 'admin' OR $3 = ANY(shared_role_scope)
       ORDER BY created_at ASC, id ASC
       LIMIT $1 OFFSET $2`,
      [query.pageSize, offset, role]
    );
    const total = await this.pool.query(
      `SELECT COUNT(id)::int AS total
       FROM views
       WHERE $1 = 'admin' OR $1 = ANY(shared_role_scope)`,
      [role]
    );
    return {
      data: result.rows.map((row) => mapView(row as PgRow)),
      meta: { total: Number((total.rows[0] as PgRow | undefined)?.total ?? 0), page: query.page, pageSize: query.pageSize }
    };
  }

  async createView(input: CreateViewInput, actor: AuthenticatedUser, idempotencyKey: string): Promise<SavedView> {
    return this.withTransaction((client) =>
      this.withIdempotency(client, idempotencyKey, async () => {
        const saved = await client.query(
          `INSERT INTO views (id, org_id, name, filter_json, owner_id, shared_role_scope, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, org_id, name, filter_json, owner_id, shared_role_scope`,
          [
            randomUUID(),
            stableId('org:default'),
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

  async getViewForRole(id: string, role: Role): Promise<SavedView> {
    const result = await this.pool.query(
      `SELECT id, org_id, name, filter_json, owner_id, shared_role_scope
       FROM views
       WHERE id = $1`,
      [id]
    );
    if (!result.rows[0]) {
      throw new NotFoundException(`View ${id} was not found.`);
    }
    const view = mapView(result.rows[0] as PgRow);
    if (role !== 'admin' && !view.sharedRoleScope.includes(role)) {
      throw new ForbiddenException(`View ${id} is not shared with ${role}.`);
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
    idempotencyKey: string,
    create: () => Promise<T>
  ): Promise<T> {
    const existing = await client.query(
      `SELECT response_json
       FROM governance_idempotency
       WHERE idempotency_key = $1`,
      [idempotencyKey]
    );
    if (existing.rows[0]) {
      return (existing.rows[0] as PgRow).response_json as T;
    }
    const response = await create();
    await client.query(
      `INSERT INTO governance_idempotency (idempotency_key, response_json, created_at)
       VALUES ($1, $2, $3)`,
      [idempotencyKey, JSON.stringify(response), new Date().toISOString()]
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

  private async getAccountGroup(client: PoolClient, id: string): Promise<AccountGroup> {
    const result = await client.query(
      `SELECT
         ag.id,
         ag.name,
         ag.created_at,
         COALESCE(array_agg(agm.account_id::text ORDER BY agm.account_id) FILTER (WHERE agm.account_id IS NOT NULL), ARRAY[]::text[]) AS account_ids
       FROM account_groups ag
       LEFT JOIN account_group_members agm ON agm.account_group_id = ag.id
       WHERE ag.id = $1
       GROUP BY ag.id, ag.name, ag.created_at`,
      [id]
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
       ORDER BY created_at DESC, id DESC
       LIMIT 1`
    );
    const entryWithoutHash = {
      id: randomUUID(),
      actorId: stableId(`actor:${actor.subject}`),
      action,
      targetType,
      targetId,
      prevHash: (previous.rows[0] as PgRow | undefined)?.hash ? String((previous.rows[0] as PgRow).hash) : null,
      createdAt: new Date().toISOString()
    };
    const hash = createHash('sha256').update(canonicalJson(entryWithoutHash)).digest('hex');
    await client.query(
      `INSERT INTO audit_log (id, actor_id, action, target_type, target_id, prev_hash, hash, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entryWithoutHash.id,
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
  return {
    id: String(row.id),
    provider: row.provider as CloudProvider,
    externalAccountId: String(row.external_account_id),
    displayName: String(row.display_name),
    vendor: String(row.vendor),
    createdAt: toIso(row.created_at)
  };
}

function mapAccountGroup(row: PgRow): AccountGroup {
  return {
    id: String(row.id),
    name: String(row.name),
    accountIds: toStringArray(row.account_ids),
    createdAt: toIso(row.created_at)
  };
}

function mapCredential(row: PgRow): CloudCredentialReference {
  return {
    id: String(row.id),
    provider: row.provider as CloudProvider,
    accountId: String(row.account_id),
    displayName: String(row.display_name),
    vaultPath: String(row.vault_path),
    createdAt: toIso(row.created_at),
    rotatedAt: row.rotated_at ? toIso(row.rotated_at) : null
  };
}

function mapUser(row: PgRow): UserRecord {
  return {
    id: String(row.id),
    email: String(row.email),
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

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
}
