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

  async syncRecommendations(candidates: RecommendationCandidate[]): Promise<void> {
    for (const candidate of candidates) {
      await this.pool.query(
        `INSERT INTO recommendations
           (id, type, resource_id, estimated_savings_usd, status, created_at,
            baseline_cost_usd, actual_cost_usd, delta_usd, verification_source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ingested_billing')
         ON CONFLICT (id) DO UPDATE
           SET estimated_savings_usd = EXCLUDED.estimated_savings_usd,
               baseline_cost_usd = EXCLUDED.baseline_cost_usd,
               actual_cost_usd = EXCLUDED.actual_cost_usd,
               delta_usd = EXCLUDED.delta_usd
         WHERE recommendations.status = 'open'`,
        [
          candidate.recommendation.id,
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
    const clauses: string[] = [];
    const params: string[] = [];
    if (query.status) {
      params.push(query.status);
      clauses.push(`status = $${params.length}`);
    }
    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const offset = (query.page - 1) * query.pageSize;
    const result = await this.pool.query(
      `SELECT id, type, resource_id, estimated_savings_usd::text, status, created_at
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
      this.withIdempotency(client, idempotencyKey, async () => {
        const existing = await client.query('SELECT * FROM recommendations WHERE id = $1', [id]);
        if (!existing.rows[0]) {
          throw new NotFoundException(`Recommendation ${id} was not found.`);
        }
        const saved = await client.query(
          `UPDATE recommendations
           SET status = $1
           WHERE id = $2
           RETURNING id, type, resource_id, estimated_savings_usd::text, status, created_at`,
          [input.status, id]
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
      `SELECT id, recommendation_id, applied_at, baseline_cost_usd::text, actual_cost_usd::text, delta_usd::text,
              verification_source
       FROM realized_savings
       ORDER BY applied_at DESC, id ASC
       LIMIT $1 OFFSET $2`,
      [query.pageSize, offset]
    );
    const total = await this.pool.query('SELECT COUNT(id)::int AS total FROM realized_savings');
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
    idempotencyKey: string,
    create: () => Promise<T>
  ): Promise<T> {
    const existing = await client.query('SELECT response_json FROM optimization_idempotency WHERE idempotency_key = $1', [
      idempotencyKey
    ]);
    if (existing.rows[0]) {
      return (existing.rows[0] as PgRow).response_json as T;
    }
    const response = await create();
    await client.query(
      `INSERT INTO optimization_idempotency (idempotency_key, response_json, created_at)
       VALUES ($1, $2, $3)`,
      [idempotencyKey, JSON.stringify(response), new Date().toISOString()]
    );
    return response;
  }

  private async createRealizedSaving(client: PoolClient, row: PgRow, actor: AuthenticatedUser): Promise<void> {
    if (Number(row.delta_usd ?? 0) <= 0) {
      throw new BadRequestException('Recommendation cannot be applied until ingested billing verifies a positive delta.');
    }
    await client.query(
      `INSERT INTO realized_savings
         (id, recommendation_id, applied_at, baseline_cost_usd, actual_cost_usd, delta_usd, verification_source)
       VALUES ($1, $2, $3, $4, $5, $6, 'ingested_billing')
       ON CONFLICT (recommendation_id) DO NOTHING`,
      [
        randomUUID(),
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
  const previous = await client.query('SELECT hash FROM audit_log ORDER BY created_at DESC, id DESC LIMIT 1');
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

function mapRecommendation(row: PgRow): Recommendation {
  return {
    id: String(row.id),
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
