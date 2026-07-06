import { BadRequestException, Injectable, NotFoundException, type OnModuleDestroy } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { stableId } from '../cost-model/stable-id';
import type { AuthenticatedUser } from '../security/token-verifier';
import type { BillingAgentRepository } from './billing-agent.repository';
import type {
  AgentRun,
  AgentRunActionSummary,
  AgentRunCreateInput,
  AgentRunQuery,
  AnomalyEvidence,
  BillingScope,
  BillingAnomaly,
  BillingAnomalyCandidate,
  BillingAnomalyQuery,
  BillingStatement,
  BillingStatementDispute,
  BillingStatementGenerateResult,
  BillingStatementQuery,
  BillingStatementStatus,
  BillingStatementLineItem,
  BillingStatementReconciliation,
  BillingStatementScopeWarning,
  BillingStatementVarianceMover,
  BillingScopeFilter,
  StatementStakeholder,
  SuppressionInput
} from './billing-agent.types';

type PgPool = Pick<Pool, 'connect' | 'query'> & Partial<Pick<Pool, 'end'>>;
type PgRow = Record<string, unknown>;

@Injectable()
export class PostgresBillingAgentRepository implements BillingAgentRepository, OnModuleDestroy {
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

  async upsertAnomalyCandidates(
    tenantId: string,
    candidates: BillingAnomalyCandidate[]
  ): Promise<{ created: BillingAnomaly[]; all: BillingAnomaly[] }> {
    return this.withTransaction(async (client) => {
      const created: BillingAnomaly[] = [];
      const all: BillingAnomaly[] = [];
      for (const candidate of candidates) {
        const existing = await client.query('SELECT * FROM anomalies WHERE tenant_id = $1 AND id = $2', [tenantId, candidate.id]);
        if (existing.rows[0]) {
          const existingAnomaly = mapAnomaly(existing.rows[0] as PgRow);
          if (existingAnomaly.status !== 'open') {
            all.push(existingAnomaly);
            continue;
          }
          const refreshed = await client.query(
            `UPDATE anomalies
             SET severity = $3,
                 detected_at = $4,
                 window_start = $5,
                 window_end = $6,
                 evidence_json = $7,
                 explanation_md = $8
             WHERE tenant_id = $1 AND id = $2 AND status = 'open'
             RETURNING *`,
            [
              tenantId,
              candidate.id,
              candidate.severity,
              candidate.detectedAt,
              candidate.windowStart,
              candidate.windowEnd,
              JSON.stringify(candidate.evidence),
              candidate.explanationMd
            ]
          );
          all.push(mapAnomaly(refreshed.rows[0] as PgRow));
          continue;
        }

        const inserted = await client.query(
          `INSERT INTO anomalies
             (id, tenant_id, type, severity, status, detected_at, window_start, window_end, evidence_json, explanation_md, assigned_owner_id)
           VALUES ($1, $2, $3, $4, 'open', $5, $6, $7, $8, $9, NULL)
           RETURNING *`,
          [
            candidate.id,
            tenantId,
            candidate.type,
            candidate.severity,
            candidate.detectedAt,
            candidate.windowStart,
            candidate.windowEnd,
            JSON.stringify(candidate.evidence),
            candidate.explanationMd
          ]
        );
        const anomaly = mapAnomaly(inserted.rows[0] as PgRow);
        created.push(anomaly);
        all.push(anomaly);
      }
      return { created, all };
    });
  }

  async listAnomalies(query: BillingAnomalyQuery) {
    const clauses = ['tenant_id = $1'];
    const params: Array<string | number> = [query.tenantId];
    if (query.type) {
      params.push(query.type);
      clauses.push(`type = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      clauses.push(`status = $${params.length}`);
    }
    const whereSql = `WHERE ${clauses.join(' AND ')}`;
    const offset = (query.page - 1) * query.pageSize;
    const data = await this.pool.query(
      `SELECT *
       FROM anomalies
       ${whereSql}
       ORDER BY detected_at DESC, id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset]
    );
    const total = await this.pool.query(`SELECT COUNT(id)::int AS total FROM anomalies ${whereSql}`, params);
    return {
      data: data.rows.map((row) => mapAnomaly(row as PgRow)),
      meta: { total: Number((total.rows[0] as PgRow | undefined)?.total ?? 0), page: query.page, pageSize: query.pageSize }
    };
  }

  async updateAnomalyStatus(input: {
    id: string;
    tenantId: string;
    status: BillingAnomaly['status'];
    falsePositiveReason?: SuppressionInput['reason'];
    falsePositiveNote?: string;
    idempotencyKey: string;
  }): Promise<BillingAnomaly> {
    return this.withTransaction((client) =>
      this.withIdempotency(client, input.tenantId, input.idempotencyKey, async () => {
        const existing = await client.query('SELECT * FROM anomalies WHERE id = $1 AND tenant_id = $2', [input.id, input.tenantId]);
        if (!existing.rows[0]) {
          throw new NotFoundException(`Anomaly ${input.id} was not found.`);
        }
        const falsePositiveReason =
          input.status === 'false_positive' ? requireFalsePositiveReason(input.falsePositiveReason) : null;
        const saved = await client.query(
          `UPDATE anomalies
           SET status = $1
           WHERE id = $2 AND tenant_id = $3
           RETURNING *`,
          [input.status, input.id, input.tenantId]
        );
        const anomaly = mapAnomaly(saved.rows[0] as PgRow);
        if (input.status === 'false_positive') {
          await this.recordSuppressionWithClient(client, {
            anomaly,
            reason: falsePositiveReason!,
            note: input.falsePositiveNote
          });
        }
        return anomaly;
      })
    );
  }

  async listSuppressedFingerprints(tenantId: string): Promise<Set<string>> {
    const result = await this.pool.query('SELECT fingerprint FROM anomaly_suppressions WHERE tenant_id = $1', [tenantId]);
    return new Set(result.rows.map((row) => String((row as PgRow).fingerprint)));
  }

  async recordSuppression(input: SuppressionInput): Promise<void> {
    await this.recordSuppressionWithClient(this.pool, input);
  }

  async createStatementStakeholder(
    input: {
      tenantId: string;
      name: string;
      email: string;
      roleLabel: string;
      notificationChannel: StatementStakeholder['notificationChannel'];
      idempotencyKey: string;
    },
    actor: AuthenticatedUser
  ): Promise<StatementStakeholder> {
    return this.withTransaction((client) =>
      this.withIdempotency(client, input.tenantId, input.idempotencyKey, async () => {
        const saved = await client.query(
          `INSERT INTO stakeholders (id, tenant_id, name, email, role_label, notification_channel, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (tenant_id, email)
           DO UPDATE SET name = EXCLUDED.name,
                         role_label = EXCLUDED.role_label,
                         notification_channel = EXCLUDED.notification_channel
           RETURNING id, tenant_id, name, email, role_label, notification_channel, created_at`,
          [
            stableId(`statement-stakeholder:${input.tenantId}:${input.email.toLowerCase()}`),
            input.tenantId,
            input.name,
            input.email.toLowerCase(),
            input.roleLabel,
            input.notificationChannel,
            new Date().toISOString()
          ]
        );
        const stakeholder = mapStatementStakeholder(saved.rows[0] as PgRow);
        await this.appendAudit(client, actor, 'statement_stakeholder_created', 'statement_stakeholder', stakeholder.id);
        return stakeholder;
      })
    );
  }

  async listStatementStakeholders(tenantId: string): Promise<StatementStakeholder[]> {
    const result = await this.pool.query(
      `SELECT id, tenant_id, name, email, role_label, notification_channel, created_at
       FROM stakeholders
       WHERE tenant_id = $1
       ORDER BY name ASC, id ASC`,
      [tenantId]
    );
    return result.rows.map((row) => mapStatementStakeholder(row as PgRow));
  }

  async createBillingScope(
    input: {
      tenantId: string;
      stakeholderId: string;
      scopeType: BillingScope['scopeType'];
      scopeRef: string;
      label: string;
      scopeFilter: BillingScopeFilter;
      idempotencyKey: string;
    },
    actor: AuthenticatedUser
  ): Promise<BillingScope> {
    return this.withTransaction((client) =>
      this.withIdempotency(client, input.tenantId, input.idempotencyKey, async () => {
        const stakeholder = await client.query('SELECT id FROM stakeholders WHERE id = $1 AND tenant_id = $2', [
          input.stakeholderId,
          input.tenantId
        ]);
        if (!stakeholder.rows[0]) {
          throw new NotFoundException(`Stakeholder ${input.stakeholderId} was not found.`);
        }
        const saved = await client.query(
          `INSERT INTO billing_scopes
             (id, tenant_id, stakeholder_id, scope_type, scope_ref, label, scope_filter_json, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (tenant_id, stakeholder_id, scope_type, scope_ref)
           DO UPDATE SET label = EXCLUDED.label,
                         scope_filter_json = EXCLUDED.scope_filter_json
           RETURNING id, tenant_id, stakeholder_id, scope_type, scope_ref, label, scope_filter_json, created_at`,
          [
            stableId(`billing-scope:${input.tenantId}:${input.stakeholderId}:${input.scopeType}:${input.scopeRef}`),
            input.tenantId,
            input.stakeholderId,
            input.scopeType,
            input.scopeRef,
            input.label,
            JSON.stringify(input.scopeFilter),
            new Date().toISOString()
          ]
        );
        const scope = mapBillingScope(saved.rows[0] as PgRow);
        await this.appendAudit(client, actor, 'billing_scope_created', 'billing_scope', scope.id);
        return scope;
      })
    );
  }

  async listBillingScopes(tenantId: string): Promise<BillingScope[]> {
    const result = await this.pool.query(
      `SELECT id, tenant_id, stakeholder_id, scope_type, scope_ref, label, scope_filter_json, created_at
       FROM billing_scopes
       WHERE tenant_id = $1
       ORDER BY created_at ASC, id ASC`,
      [tenantId]
    );
    return result.rows.map((row) => mapBillingScope(row as PgRow));
  }

  async saveGeneratedStatements(
    input: BillingStatementGenerateResult & { tenantId: string; periodStart: string; periodEnd: string; idempotencyKey: string },
    actor: AuthenticatedUser
  ): Promise<BillingStatementGenerateResult> {
    return this.withTransaction((client) =>
      this.withIdempotency(client, input.tenantId, input.idempotencyKey, async () => {
        for (const statement of input.statements) {
          await client.query(
            `INSERT INTO statements
               (id, tenant_id, stakeholder_id, period_start, period_end, status, total_usd, generated_at,
                approved_by, sent_at, narrative_md, open_anomaly_count, reconciliation_json,
                scope_warnings_json, variance_json, dispute_json, send_evidence_json, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NULL, $9, $10, $11, $12, $13, NULL, NULL, $14)
             ON CONFLICT (tenant_id, stakeholder_id, period_start, period_end)
             DO UPDATE SET status = EXCLUDED.status,
                           total_usd = EXCLUDED.total_usd,
                           generated_at = EXCLUDED.generated_at,
                           narrative_md = EXCLUDED.narrative_md,
                           open_anomaly_count = EXCLUDED.open_anomaly_count,
                           reconciliation_json = EXCLUDED.reconciliation_json,
                           scope_warnings_json = EXCLUDED.scope_warnings_json,
                           variance_json = EXCLUDED.variance_json,
                           dispute_json = NULL,
                           send_evidence_json = NULL
             RETURNING id`,
            [
              statement.id,
              statement.tenantId,
              statement.stakeholderId,
              statement.periodStart,
              statement.periodEnd,
              statement.status,
              statement.totalUsd,
              statement.generatedAt,
              statement.narrativeMd,
              statement.openAnomalyCount,
              JSON.stringify(statement.reconciliation),
              JSON.stringify(statement.scopeWarnings),
              JSON.stringify(statement.varianceTopMovers),
              new Date().toISOString()
            ]
          );
          await client.query('DELETE FROM statement_line_items WHERE tenant_id = $1 AND statement_id = $2', [
            statement.tenantId,
            statement.id
          ]);
          for (const lineItem of statement.lineItems) {
            await client.query(
              `INSERT INTO statement_line_items
                 (id, tenant_id, statement_id, line_type, description, amount_usd, cost_record_ids, evidence_json, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [
                lineItem.id,
                lineItem.tenantId,
                lineItem.statementId,
                lineItem.lineType,
                lineItem.description,
                lineItem.amountUsd,
                lineItem.costRecordIds,
                JSON.stringify(lineItem.evidence),
                new Date().toISOString()
              ]
            );
          }
        }
        await this.appendAudit(
          client,
          actor,
          'billing_statements_generated',
          'billing_statement_period',
          stableId(`billing-statement-period:${input.tenantId}:${input.periodStart}:${input.periodEnd}`)
        );
        return {
          statements: input.statements,
          reconciliation: input.reconciliation,
          scopeWarnings: input.scopeWarnings
        };
      })
    );
  }

  async listStatements(query: BillingStatementQuery) {
    const clauses = ['s.tenant_id = $1'];
    const params: Array<string | number> = [query.tenantId];
    if (query.status) {
      params.push(query.status);
      clauses.push(`s.status = $${params.length}`);
    }
    if (query.stakeholderId) {
      params.push(query.stakeholderId);
      clauses.push(`s.stakeholder_id = $${params.length}`);
    }
    const whereSql = `WHERE ${clauses.join(' AND ')}`;
    const offset = (query.page - 1) * query.pageSize;
    const result = await this.pool.query(
      `SELECT s.*, st.name AS stakeholder_name, st.email AS stakeholder_email
       FROM statements s
       JOIN stakeholders st ON st.id = s.stakeholder_id AND st.tenant_id = s.tenant_id
       ${whereSql}
       ORDER BY s.generated_at DESC, s.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset]
    );
    const total = await this.pool.query(`SELECT COUNT(id)::int AS total FROM statements s ${whereSql}`, params);
    const statements = await Promise.all(result.rows.map((row) => this.mapStatementWithLineItems(row as PgRow)));
    return {
      data: statements,
      meta: { total: Number((total.rows[0] as PgRow | undefined)?.total ?? 0), page: query.page, pageSize: query.pageSize }
    };
  }

  async getStatement(id: string, tenantId: string): Promise<BillingStatement> {
    const result = await this.pool.query(
      `SELECT s.*, st.name AS stakeholder_name, st.email AS stakeholder_email
       FROM statements s
       JOIN stakeholders st ON st.id = s.stakeholder_id AND st.tenant_id = s.tenant_id
       WHERE s.id = $1 AND s.tenant_id = $2`,
      [id, tenantId]
    );
    if (!result.rows[0]) {
      throw new NotFoundException(`Billing statement ${id} was not found.`);
    }
    return this.mapStatementWithLineItems(result.rows[0] as PgRow);
  }

  async transitionStatement(
    input: {
      id: string;
      tenantId: string;
      status: BillingStatementStatus;
      idempotencyKey: string;
      approvedBy?: string;
      sentAt?: string;
      dispute?: BillingStatementDispute;
      sendEvidence?: Record<string, unknown>;
    },
    actor: AuthenticatedUser
  ): Promise<BillingStatement> {
    return this.withTransaction((client) =>
      this.withIdempotency(client, input.tenantId, input.idempotencyKey, async () => {
        const saved = await client.query(
          `UPDATE statements
           SET status = $1,
               approved_by = COALESCE($2, approved_by),
               sent_at = COALESCE($3, sent_at),
               dispute_json = COALESCE($4, dispute_json),
               send_evidence_json = COALESCE($5, send_evidence_json)
           WHERE id = $6 AND tenant_id = $7
           RETURNING *`,
          [
            input.status,
            input.approvedBy ?? null,
            input.sentAt ?? null,
            input.dispute ? JSON.stringify(input.dispute) : null,
            input.sendEvidence ? JSON.stringify(input.sendEvidence) : null,
            input.id,
            input.tenantId
          ]
        );
        if (!saved.rows[0]) {
          throw new NotFoundException(`Billing statement ${input.id} was not found.`);
        }
        await this.appendAudit(client, actor, auditActionForStatementStatus(input.status), 'billing_statement', input.id);
        const joined = await client.query(
          `SELECT s.*, st.name AS stakeholder_name, st.email AS stakeholder_email
           FROM statements s
           JOIN stakeholders st ON st.id = s.stakeholder_id AND st.tenant_id = s.tenant_id
           WHERE s.id = $1 AND s.tenant_id = $2`,
          [input.id, input.tenantId]
        );
        return this.mapStatementWithLineItems(joined.rows[0] as PgRow, client);
      })
    );
  }

  async createAgentRun(input: AgentRunCreateInput, actor: AuthenticatedUser): Promise<AgentRun> {
    return this.withTransaction(async (client) => {
      const saved = await client.query(
        `INSERT INTO agent_runs
           (id, tenant_id, run_type, started_at, finished_at, inputs_summary_json,
            actions_taken_json, actions_proposed_json, errors_json, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id)
         DO UPDATE SET finished_at = EXCLUDED.finished_at,
                       inputs_summary_json = EXCLUDED.inputs_summary_json,
                       actions_taken_json = EXCLUDED.actions_taken_json,
                       actions_proposed_json = EXCLUDED.actions_proposed_json,
                       errors_json = EXCLUDED.errors_json
         RETURNING *`,
        [
          input.id,
          input.tenantId,
          input.runType,
          input.startedAt,
          input.finishedAt,
          JSON.stringify(input.inputsSummary),
          JSON.stringify(input.actionsTaken),
          JSON.stringify(input.actionsProposed),
          JSON.stringify(input.errors),
          new Date().toISOString()
        ]
      );
      await this.appendAudit(client, actor, 'agent_run_recorded', 'agent_run', input.id);
      return mapAgentRun(saved.rows[0] as PgRow);
    });
  }

  async listAgentRuns(query: AgentRunQuery) {
    const clauses = ['tenant_id = $1'];
    const params: Array<string | number> = [query.tenantId];
    if (query.runType) {
      params.push(query.runType);
      clauses.push(`run_type = $${params.length}`);
    }
    const whereSql = `WHERE ${clauses.join(' AND ')}`;
    const offset = (query.page - 1) * query.pageSize;
    const data = await this.pool.query(
      `SELECT *
       FROM agent_runs
       ${whereSql}
       ORDER BY started_at DESC, id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset]
    );
    const total = await this.pool.query(`SELECT COUNT(id)::int AS total FROM agent_runs ${whereSql}`, params);
    return {
      data: data.rows.map((row) => mapAgentRun(row as PgRow)),
      meta: { total: Number((total.rows[0] as PgRow | undefined)?.total ?? 0), page: query.page, pageSize: query.pageSize }
    };
  }

  private async recordSuppressionWithClient(client: Pick<PoolClient, 'query'> | PgPool, input: SuppressionInput): Promise<void> {
    await client.query(
      `INSERT INTO anomaly_suppressions
         (id, tenant_id, anomaly_id, type, fingerprint, reason_code, note, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (tenant_id, fingerprint)
       DO UPDATE SET reason_code = EXCLUDED.reason_code, note = EXCLUDED.note`,
      [
        stableId(`anomaly-suppression:${input.anomaly.tenantId}:${input.anomaly.evidence.fingerprint}`),
        input.anomaly.tenantId,
        input.anomaly.id,
        input.anomaly.type,
        input.anomaly.evidence.fingerprint,
        input.reason,
        input.note ?? null,
        new Date().toISOString()
      ]
    );
  }

  private async mapStatementWithLineItems(row: PgRow, client: Pick<PoolClient, 'query'> | PgPool = this.pool): Promise<BillingStatement> {
    const lineItems = await client.query(
      `SELECT id, tenant_id, statement_id, line_type, description, amount_usd::text AS amount_usd,
              cost_record_ids, evidence_json
       FROM statement_line_items
       WHERE tenant_id = $1 AND statement_id = $2
       ORDER BY created_at ASC, id ASC`,
      [row.tenant_id, row.id]
    );
    return mapStatement(row, lineItems.rows.map((lineItem) => mapStatementLineItem(lineItem as PgRow)));
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
    const scopedKey = `${tenantId}:${idempotencyKey}`;
    const existing = await client.query(
      'SELECT response_json FROM billing_agent_idempotency WHERE tenant_id = $1 AND idempotency_key = ANY($2::text[])',
      [tenantId, [scopedKey, idempotencyKey]]
    );
    if (existing.rows[0]) {
      return (existing.rows[0] as PgRow).response_json as T;
    }
    const response = await create();
    await client.query(
      `INSERT INTO billing_agent_idempotency (tenant_id, idempotency_key, response_json, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, idempotency_key) DO NOTHING`,
      [tenantId, scopedKey, JSON.stringify(response), new Date().toISOString()]
    );
    return response;
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

function mapAnomaly(row: PgRow): BillingAnomaly {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    type: row.type as BillingAnomaly['type'],
    severity: row.severity as BillingAnomaly['severity'],
    status: row.status as BillingAnomaly['status'],
    detectedAt: toIso(row.detected_at),
    windowStart: toIso(row.window_start),
    windowEnd: toIso(row.window_end),
    evidence: parseEvidence(row.evidence_json),
    explanationMd: String(row.explanation_md),
    assignedOwnerId: row.assigned_owner_id ? String(row.assigned_owner_id) : null
  };
}

function parseEvidence(value: unknown): AnomalyEvidence {
  return (typeof value === 'string' ? JSON.parse(value) : value) as AnomalyEvidence;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function requireFalsePositiveReason(value: SuppressionInput['reason'] | undefined): SuppressionInput['reason'] {
  if (!value) {
    throw new BadRequestException('falsePositiveReason is required when marking an anomaly false_positive.');
  }
  return value;
}

function mapStatementStakeholder(row: PgRow): StatementStakeholder {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    email: String(row.email),
    roleLabel: String(row.role_label),
    notificationChannel: row.notification_channel as StatementStakeholder['notificationChannel'],
    createdAt: toIso(row.created_at)
  };
}

function mapBillingScope(row: PgRow): BillingScope {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    stakeholderId: String(row.stakeholder_id),
    scopeType: row.scope_type as BillingScope['scopeType'],
    scopeRef: String(row.scope_ref),
    label: String(row.label),
    scopeFilter: toObject(row.scope_filter_json) as BillingScopeFilter,
    createdAt: toIso(row.created_at)
  };
}

function mapStatement(row: PgRow, lineItems: BillingStatementLineItem[]): BillingStatement {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    stakeholderId: String(row.stakeholder_id),
    stakeholderName: String(row.stakeholder_name),
    stakeholderEmail: String(row.stakeholder_email),
    periodStart: toIso(row.period_start),
    periodEnd: toIso(row.period_end),
    status: row.status as BillingStatement['status'],
    totalUsd: moneyString(row.total_usd),
    generatedAt: toIso(row.generated_at),
    approvedBy: row.approved_by ? String(row.approved_by) : null,
    sentAt: row.sent_at ? toIso(row.sent_at) : null,
    narrativeMd: String(row.narrative_md),
    openAnomalyCount: Number(row.open_anomaly_count ?? 0),
    lineItems,
    reconciliation: toObject(row.reconciliation_json) as unknown as BillingStatementReconciliation,
    scopeWarnings: toArray(row.scope_warnings_json) as BillingStatementScopeWarning[],
    varianceTopMovers: toArray(row.variance_json) as BillingStatementVarianceMover[],
    dispute: row.dispute_json ? (toObject(row.dispute_json) as unknown as BillingStatementDispute) : null,
    sendEvidence: row.send_evidence_json ? toObject(row.send_evidence_json) : null
  };
}

function mapStatementLineItem(row: PgRow): BillingStatementLineItem {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    statementId: String(row.statement_id),
    lineType: row.line_type as BillingStatementLineItem['lineType'],
    description: String(row.description),
    amountUsd: moneyString(row.amount_usd),
    costRecordIds: toStringArray(row.cost_record_ids),
    evidence: toObject(row.evidence_json)
  };
}

function mapAgentRun(row: PgRow): AgentRun {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    runType: row.run_type as AgentRun['runType'],
    startedAt: toIso(row.started_at),
    finishedAt: toIso(row.finished_at),
    inputsSummary: toObject(row.inputs_summary_json),
    actionsTaken: toArray(row.actions_taken_json) as AgentRunActionSummary[],
    actionsProposed: toArray(row.actions_proposed_json) as AgentRunActionSummary[],
    errors: toArray(row.errors_json).map(String)
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

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  return [];
}

function moneyString(value: unknown): string {
  return Number(value ?? 0).toFixed(2);
}

function auditActionForStatementStatus(status: BillingStatementStatus): string {
  if (status === 'approved') {
    return 'billing_statement_approved';
  }
  if (status === 'sent') {
    return 'billing_statement_sent';
  }
  if (status === 'disputed') {
    return 'billing_statement_disputed';
  }
  if (status === 'void') {
    return 'billing_statement_voided';
  }
  return 'billing_statement_updated';
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
}
