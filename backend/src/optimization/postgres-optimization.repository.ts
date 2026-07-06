import { BadRequestException, Injectable, NotFoundException, type OnModuleDestroy } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { stableId } from '../cost-model/stable-id';
import type { AuthenticatedUser } from '../security/token-verifier';
import type { UpdateRecommendationDto } from './dto/recommendation.dto';
import type { OptimizationRepository } from './optimization.repository';
import type {
  RealizedSaving,
  RealizedSavingsQuery,
  Recommendation,
  RecommendationCandidate,
  RecommendationQuery
} from './optimization.types';

type PgPool = Pick<Pool, 'connect' | 'query'> & Partial<Pick<Pool, 'end'>>;
type PgRow = Record<string, unknown>;

@Injectable()
export class PostgresOptimizationRepository implements OptimizationRepository, OnModuleDestroy {
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

  async syncRecommendations(tenantId: string, candidates: RecommendationCandidate[]): Promise<void> {
    for (const candidate of candidates) {
      await this.pool.query(
        `INSERT INTO recommendations
           (id, tenant_id, type, resource_id, estimated_savings_usd, status, created_at,
            baseline_cost_usd, actual_cost_usd, delta_usd, verification_source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ingested_billing')
         ON CONFLICT (tenant_id, id) DO UPDATE
           SET estimated_savings_usd = EXCLUDED.estimated_savings_usd,
               baseline_cost_usd = EXCLUDED.baseline_cost_usd,
               actual_cost_usd = EXCLUDED.actual_cost_usd,
               delta_usd = EXCLUDED.delta_usd
         WHERE recommendations.status = 'open'`,
        [
          candidate.recommendation.id,
          tenantId,
          candidate.recommendation.type,
          candidate.recommendation.resourceId,
          candidate.recommendation.estimatedSavingsUsd,
          candidate.recommendation.status,
          candidate.recommendation.createdAt,
          candidate.realization.baselineCostUsd,
          candidate.realization.actualCostUsd,
          candidate.realization.deltaUsd
        ]
      );
    }
  }

  async listRecommendations(query: RecommendationQuery) {
    const clauses: string[] = ['tenant_id = $1'];
    const params: string[] = [query.tenantId];
    if (query.status) {
      params.push(query.status);
      clauses.push(`status = $${params.length}`);
    }
    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const offset = (query.page - 1) * query.pageSize;
    const result = await this.pool.query(
      `SELECT id, tenant_id, type, resource_id, estimated_savings_usd::text, status, created_at
       FROM recommendations
       ${whereSql}
       ORDER BY created_at ASC, id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, String(query.pageSize), String(offset)]
    );
    const total = await this.pool.query(`SELECT COUNT(id)::int AS total FROM recommendations ${whereSql}`, params);
    return {
      data: result.rows.map((row) => mapRecommendation(row as PgRow)),
      meta: { total: Number((total.rows[0] as PgRow | undefined)?.total ?? 0), page: query.page, pageSize: query.pageSize }
    };
  }

  async updateRecommendation(
    id: string,
    input: UpdateRecommendationDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<Recommendation> {
    return this.withTransaction((client) =>
      this.withIdempotency(client, actor.tenantId, idempotencyKey, async () => {
        const existing = await client.query('SELECT * FROM recommendations WHERE id = $1 AND tenant_id = $2', [
          id,
          actor.tenantId
        ]);
        if (!existing.rows[0]) {
          throw new NotFoundException(`Recommendation ${id} was not found.`);
        }
        const saved = await client.query(
          `UPDATE recommendations
           SET status = $1
           WHERE id = $2 AND tenant_id = $3
           RETURNING id, tenant_id, type, resource_id, estimated_savings_usd::text, status, created_at`,
          [input.status, id, actor.tenantId]
        );
        if (input.status === 'applied') {
          await this.createRealizedSaving(client, existing.rows[0] as PgRow, actor);
        }
        return mapRecommendation(saved.rows[0] as PgRow);
      })
    );
  }

  async listRealizedSavings(query: RealizedSavingsQuery) {
    const offset = (query.page - 1) * query.pageSize;
    const result = await this.pool.query(
      `SELECT id, tenant_id, recommendation_id, applied_at, baseline_cost_usd::text, actual_cost_usd::text, delta_usd::text,
              verification_source
       FROM realized_savings
       WHERE tenant_id = $3
       ORDER BY applied_at DESC, id ASC
       LIMIT $1 OFFSET $2`,
      [query.pageSize, offset, query.tenantId]
    );
    const total = await this.pool.query('SELECT COUNT(id)::int AS total FROM realized_savings WHERE tenant_id = $1', [
      query.tenantId
    ]);
    return {
      data: result.rows.map((row) => mapRealizedSaving(row as PgRow)),
      meta: { total: Number((total.rows[0] as PgRow | undefined)?.total ?? 0), page: query.page, pageSize: query.pageSize }
    };
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
      'SELECT response_json FROM optimization_idempotency WHERE tenant_id = $1 AND idempotency_key = ANY($2::text[])',
      [tenantId, tenantStorageCandidates(tenantId, idempotencyKey)]
    );
    if (existing.rows[0]) {
      return (existing.rows[0] as PgRow).response_json as T;
    }
    const response = await create();
    await client.query(
      `INSERT INTO optimization_idempotency (tenant_id, idempotency_key, response_json, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, idempotency_key) DO NOTHING`,
      [tenantId, scopedIdempotencyKey, JSON.stringify(response), new Date().toISOString()]
    );
    return response;
  }

  private async createRealizedSaving(client: PoolClient, row: PgRow, actor: AuthenticatedUser): Promise<void> {
    if (Number(row.delta_usd ?? 0) <= 0) {
      throw new BadRequestException('Recommendation cannot be applied until ingested billing verifies a positive delta.');
    }
    await client.query(
      `INSERT INTO realized_savings
         (id, tenant_id, recommendation_id, applied_at, baseline_cost_usd, actual_cost_usd, delta_usd, verification_source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ingested_billing')
       ON CONFLICT (tenant_id, recommendation_id) DO NOTHING`,
      [
        randomUUID(),
        actor.tenantId,
        row.id,
        new Date().toISOString(),
        row.baseline_cost_usd,
        row.actual_cost_usd,
        row.delta_usd
      ]
    );
    await appendAudit(client, actor, 'recommendation_applied', 'recommendation', String(row.id));
  }
}

async function appendAudit(
  client: PoolClient,
  actor: AuthenticatedUser,
  action: string,
  targetType: string,
  targetId: string
): Promise<void> {
  const previous = await client.query(
    'SELECT hash FROM audit_log WHERE tenant_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1',
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

function mapRecommendation(row: PgRow): Recommendation {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    type: row.type as Recommendation['type'],
    resourceId: String(row.resource_id),
    estimatedSavingsUsd: Number(row.estimated_savings_usd ?? 0).toFixed(8),
    status: row.status as Recommendation['status'],
    createdAt: toIso(row.created_at)
  };
}

function mapRealizedSaving(row: PgRow): RealizedSaving {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    recommendationId: String(row.recommendation_id),
    appliedAt: toIso(row.applied_at),
    baselineCostUsd: Number(row.baseline_cost_usd ?? 0).toFixed(8),
    actualCostUsd: Number(row.actual_cost_usd ?? 0).toFixed(8),
    deltaUsd: Number(row.delta_usd ?? 0).toFixed(8),
    verificationSource: 'ingested_billing'
  };
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
}

function tenantScopedStorageValue(tenantId: string, value: string): string {
  return `${tenantId}:${value}`;
}

function tenantStorageCandidates(tenantId: string, value: string): string[] {
  return [tenantScopedStorageValue(tenantId, value), value];
}
