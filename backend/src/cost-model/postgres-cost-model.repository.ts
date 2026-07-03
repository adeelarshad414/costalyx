import { NotFoundException, type OnModuleDestroy } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import type { CostModelRepository } from './cost-model.repository';
import type { CloudProvider, IngestionBatch, LeaseType, NormalizedCostRecord } from './cost-record.types';
import { formatDecimal, roundMoneyToCent } from './decimal';
import { stableId } from './stable-id';

type PgPool = Pick<Pool, 'connect' | 'query'> & Partial<Pick<Pool, 'end'>>;
type PgRow = Record<string, unknown>;

export class PostgresCostModelRepository implements CostModelRepository, OnModuleDestroy {
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

  async saveIngestion(input: {
    provider: CloudProvider;
    sourceUri: string;
    idempotencyKey: string;
    rows: NormalizedCostRecord[];
  }): Promise<IngestionBatch> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query('SELECT * FROM ingestion_batches WHERE idempotency_key = $1', [
        input.idempotencyKey
      ]);
      if (existing.rows[0]) {
        await client.query('COMMIT');
        return mapBatch(existing.rows[0] as PgRow);
      }

      const now = new Date().toISOString();
      const batchId = stableId(`batch:${input.provider}:${input.sourceUri}:${input.idempotencyKey}`);
      await client.query(
        `INSERT INTO ingestion_batches
          (id, provider, status, source_uri, idempotency_key, created_at, completed_at, ingested_rows, duplicate_rows)
         VALUES ($1, $2, 'complete', $3, $4, $5, $5, 0, 0)`,
        [batchId, input.provider, input.sourceUri, input.idempotencyKey, now]
      );

      let ingestedRows = 0;
      let duplicateRows = 0;
      for (const row of input.rows) {
        await this.upsertAccount(client, row);
        const duplicate = await client.query('SELECT id FROM cost_records WHERE fingerprint = $1', [row.fingerprint]);
        if ((duplicate.rowCount ?? duplicate.rows.length) > 0) {
          duplicateRows += 1;
          continue;
        }

        await client.query(
          `INSERT INTO cost_records
            (id, provider, account_id, resource_id, service_name, usage_family, lease_type,
             transaction_type, hourly_rate_usd, usage_hours, is_estimate, valid_from, valid_to,
             ingested_at, source_batch_id, fingerprint)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            row.id,
            row.provider,
            row.accountId,
            row.resourceId,
            row.serviceName,
            row.usageFamily,
            row.leaseType,
            row.transactionType,
            row.hourlyRateUsd,
            row.usageHours,
            row.isEstimate,
            row.validFrom,
            row.validTo,
            now,
            batchId,
            row.fingerprint
          ]
        );
        ingestedRows += 1;
      }

      await client.query('UPDATE ingestion_batches SET ingested_rows = $1, duplicate_rows = $2 WHERE id = $3', [
        ingestedRows,
        duplicateRows,
        batchId
      ]);
      const saved = await client.query('SELECT * FROM ingestion_batches WHERE id = $1', [batchId]);
      await client.query('COMMIT');
      return mapBatch(saved.rows[0] as PgRow);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getBatch(id: string): Promise<IngestionBatch> {
    const result = await this.pool.query('SELECT * FROM ingestion_batches WHERE id = $1', [id]);
    if (!result.rows[0]) {
      throw new NotFoundException(`Ingestion batch ${id} was not found.`);
    }
    return mapBatch(result.rows[0] as PgRow);
  }

  async listRecords(query: {
    provider?: CloudProvider;
    accountId?: string;
    service?: string;
    page: number;
    pageSize: number;
  }) {
    const { whereSql, params } = buildRecordWhere(query);
    const offset = (query.page - 1) * query.pageSize;
    const data = await this.pool.query(
      `SELECT
         cr.id,
         cr.provider,
         cr.account_id,
         a.external_account_id AS account_external_id,
         cr.resource_id,
         cr.service_name,
         cr.usage_family,
         cr.lease_type,
         cr.transaction_type,
         cr.hourly_rate_usd::text AS hourly_rate_usd,
         cr.usage_hours::text AS usage_hours,
         (cr.hourly_rate_usd * cr.usage_hours)::text AS cost_total_usd,
         cr.is_estimate,
         cr.valid_from,
         cr.valid_to,
         cr.ingested_at,
         cr.source_batch_id,
         cr.fingerprint
       FROM cost_records cr
       JOIN accounts a ON a.id = cr.account_id
       ${whereSql}
       ORDER BY cr.valid_from ASC, cr.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset]
    );
    const total = await this.pool.query(`SELECT COUNT(*)::int AS total FROM cost_records cr ${whereSql}`, params);

    return {
      data: data.rows.map((row) => mapRecord(row as PgRow)),
      meta: {
        total: Number((total.rows[0] as PgRow | undefined)?.total ?? 0),
        page: query.page,
        pageSize: query.pageSize
      }
    };
  }

  async getSummary() {
    const result = await this.pool.query(
      `SELECT
         COALESCE(SUM(hourly_rate_usd * usage_hours), 0)::text AS total_cost_usd,
         COUNT(DISTINCT resource_id)::int AS resource_count,
         COUNT(*)::int AS untagged_count,
         0::int AS inactive_count,
         COALESCE(BOOL_OR(is_estimate), false) AS is_estimate
       FROM cost_records`
    );
    const row = (result.rows[0] ?? {}) as PgRow;
    return {
      totalCostUsd: formatDecimal(String(row.total_cost_usd ?? '0'), 8),
      resourceCount: Number(row.resource_count ?? 0),
      untaggedCount: Number(row.untagged_count ?? 0),
      inactiveCount: Number(row.inactive_count ?? 0),
      isEstimate: Boolean(row.is_estimate)
    };
  }

  private async upsertAccount(client: PoolClient, row: NormalizedCostRecord): Promise<void> {
    await client.query(
      `INSERT INTO accounts (id, provider, external_account_id, display_name, vendor)
       VALUES ($1, $2, $3, $4, $2)
       ON CONFLICT (provider, external_account_id)
       DO UPDATE SET display_name = EXCLUDED.display_name`,
      [row.accountId, row.provider, row.accountExternalId, row.accountExternalId]
    );
  }
}

function buildRecordWhere(query: { provider?: CloudProvider; accountId?: string; service?: string }) {
  const clauses: string[] = [];
  const params: string[] = [];
  if (query.provider) {
    params.push(query.provider);
    clauses.push(`cr.provider = $${params.length}`);
  }
  if (query.accountId) {
    params.push(query.accountId);
    clauses.push(`cr.account_id = $${params.length}`);
  }
  if (query.service) {
    params.push(query.service);
    clauses.push(`cr.service_name = $${params.length}`);
  }
  return {
    whereSql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  };
}

function mapBatch(row: PgRow): IngestionBatch {
  return {
    id: String(row.id),
    provider: row.provider as CloudProvider,
    status: row.status as IngestionBatch['status'],
    sourceUri: String(row.source_uri),
    createdAt: toIso(row.created_at),
    completedAt: row.completed_at ? toIso(row.completed_at) : null,
    ingestedRows: Number(row.ingested_rows ?? 0),
    duplicateRows: Number(row.duplicate_rows ?? 0)
  };
}

function mapRecord(row: PgRow): NormalizedCostRecord {
  const costTotalUsd = formatDecimal(String(row.cost_total_usd ?? '0'), 8);
  return {
    id: String(row.id),
    provider: row.provider as CloudProvider,
    accountId: String(row.account_id),
    accountExternalId: String(row.account_external_id),
    resourceId: String(row.resource_id),
    serviceName: String(row.service_name),
    usageFamily: String(row.usage_family),
    leaseType: row.lease_type as LeaseType,
    transactionType: String(row.transaction_type),
    hourlyRateUsd: formatDecimal(String(row.hourly_rate_usd), 8),
    usageHours: formatDecimal(String(row.usage_hours), 4),
    costTotalUsd,
    costTotalUsdRoundedToCent: roundMoneyToCent(costTotalUsd),
    isEstimate: Boolean(row.is_estimate),
    validFrom: toIso(row.valid_from),
    validTo: row.valid_to ? toIso(row.valid_to) : null,
    ingestedAt: toIso(row.ingested_at),
    sourceBatchId: String(row.source_batch_id),
    fingerprint: String(row.fingerprint)
  };
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}
