import { BadRequestException, Injectable, NotFoundException, type OnModuleDestroy } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import { stableId } from '../cost-model/stable-id';
import type { BillingAgentRepository } from './billing-agent.repository';
import type {
  AnomalyEvidence,
  BillingAnomaly,
  BillingAnomalyCandidate,
  BillingAnomalyQuery,
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
