import { NotFoundException } from '@nestjs/common';
import { PostgresCostModelRepository } from '../../src/cost-model/postgres-cost-model.repository';
import type { NormalizedCostRecord } from '../../src/cost-model/cost-record.types';
import { DEFAULT_TENANT_ID } from '../../src/security/token-verifier';

type QueryResult = { rows: unknown[]; rowCount?: number };
type FakeResult = QueryResult | Error;

class FakePgClient {
  readonly queries: Array<{ sql: string; params: unknown[] }> = [];

  constructor(private readonly results: FakeResult[]) {}

  async query(sql: string, params: unknown[] = []) {
    this.queries.push({ sql, params });
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) {
      return { rows: [], rowCount: 0 };
    }
    const result = this.results.shift();
    if (result instanceof Error) {
      throw result;
    }
    return result ?? { rows: [], rowCount: 0 };
  }

  release = jest.fn();
}

class FakePool {
  readonly client: FakePgClient;

  constructor(results: FakeResult[]) {
    this.client = new FakePgClient(results);
  }

  connect = jest.fn(async () => this.client);
  query = jest.fn(async (sql: string, params: unknown[] = []) => this.client.query(sql, params));
}

const batchRow = {
  id: '11111111-1111-4111-8111-111111111111',
  tenant_id: DEFAULT_TENANT_ID,
  provider: 'aws',
  status: 'complete',
  cloud_connection_id: null,
  source_uri: 'backend/test/fixtures/aws-cur-sample.csv',
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  completed_at: new Date('2026-01-01T00:00:00.000Z'),
  ingested_rows: 1,
  duplicate_rows: 0
};

const duplicateBatchRow = {
  ...batchRow,
  duplicate_rows: 1
};

const normalizedRow: NormalizedCostRecord = {
  id: '22222222-2222-4222-8222-222222222222',
  provider: 'aws',
  accountId: '33333333-3333-4333-8333-333333333333',
  accountExternalId: '123456789012',
  resourceId: 'i-123',
  serviceName: 'Amazon EC2',
  usageFamily: 'BoxUsage:m6i.large',
  leaseType: 'on_demand',
  transactionType: 'usage',
  hourlyRateUsd: '0.10000000',
  usageHours: '2.0000',
  costTotalUsd: '0.20000000',
  costTotalUsdRoundedToCent: '0.20',
  isEstimate: false,
  validFrom: '2026-01-01T00:00:00.000Z',
  validTo: '2026-01-01T01:00:00.000Z',
  ingestedAt: '1970-01-01T00:00:00.000Z',
  sourceBatchId: 'source-batch',
  fingerprint: '22222222-2222-4222-8222-222222222222'
};

describe('PostgresCostModelRepository', () => {
  it('replays the persisted response for a repeated idempotency key', async () => {
    const pool = new FakePool([{ rows: [batchRow], rowCount: 1 }]);
    const repository = new PostgresCostModelRepository(pool as never);

    const result = await repository.saveIngestion({
      tenantId: DEFAULT_TENANT_ID,
      provider: 'aws',
      sourceUri: 'backend/test/fixtures/aws-cur-sample.csv',
      idempotencyKey: 'idem-1',
      rows: [normalizedRow]
    });

    expect(result.id).toBe(batchRow.id);
    expect(pool.client.queries).toHaveLength(3);
    expect(pool.client.queries[1].sql).toContain('FROM ingestion_batches');
    expect(pool.client.queries.some((query) => query.sql.includes('INSERT INTO cost_records'))).toBe(false);
    expect(pool.client.queries.at(-1)?.sql).toBe('COMMIT');
  });

  it('persists a new batch and counts duplicate fingerprints without storing cost totals', async () => {
    const pool = new FakePool([
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [duplicateBatchRow], rowCount: 1 }
    ]);
    const repository = new PostgresCostModelRepository(pool as never);

    const result = await repository.saveIngestion({
      tenantId: DEFAULT_TENANT_ID,
      provider: 'aws',
      sourceUri: 'backend/test/fixtures/aws-cur-sample.csv',
      idempotencyKey: 'idem-2',
      rows: [normalizedRow, { ...normalizedRow }]
    });

    const combinedSql = pool.client.queries.map((query) => query.sql).join('\n');
    expect(result.ingestedRows).toBe(1);
    expect(result.duplicateRows).toBe(1);
    expect(combinedSql).toContain('INSERT INTO accounts');
    expect(combinedSql).toContain('INSERT INTO cost_records');
    expect(combinedSql).toContain('UPDATE ingestion_batches');
    expect(combinedSql).not.toContain('cost_total_usd');
  });

  it('rolls back the whole ingestion transaction when a row insert fails mid-batch', async () => {
    const pool = new FakePool([
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 0 },
      new Error('simulated cost_records insert failure')
    ]);
    const repository = new PostgresCostModelRepository(pool as never);

    await expect(
      repository.saveIngestion({
        tenantId: DEFAULT_TENANT_ID,
        provider: 'aws',
        sourceUri: 'backend/test/fixtures/aws-cur-sample.csv',
        idempotencyKey: 'idem-mid-batch-failure',
        rows: [normalizedRow, { ...normalizedRow, id: '33333333-3333-4333-8333-333333333333', fingerprint: 'mid-batch-row-2' }]
      })
    ).rejects.toThrow('simulated cost_records insert failure');

    const statements = pool.client.queries.map((query) => query.sql);
    expect(statements[0]).toBe('BEGIN');
    expect(statements).toContain('ROLLBACK');
    expect(statements).not.toContain('COMMIT');
    expect(statements.some((sql) => sql.includes('UPDATE ingestion_batches'))).toBe(false);
    expect(pool.client.release).toHaveBeenCalled();
  });

  it('computes cost totals from hourly rate and usage hours when listing records', async () => {
    const pool = new FakePool([
      {
        rows: [
          {
            id: normalizedRow.id,
            tenant_id: DEFAULT_TENANT_ID,
            provider: 'aws',
            cloud_connection_id: null,
            account_id: normalizedRow.accountId,
            account_external_id: normalizedRow.accountExternalId,
            resource_id: normalizedRow.resourceId,
            service_name: normalizedRow.serviceName,
            usage_family: normalizedRow.usageFamily,
            lease_type: normalizedRow.leaseType,
            transaction_type: normalizedRow.transactionType,
            hourly_rate_usd: normalizedRow.hourlyRateUsd,
            usage_hours: normalizedRow.usageHours,
            cost_total_usd: normalizedRow.costTotalUsd,
            is_estimate: false,
            valid_from: new Date(normalizedRow.validFrom),
            valid_to: new Date(normalizedRow.validTo ?? ''),
            ingested_at: new Date('2026-01-01T00:00:00.000Z'),
            source_batch_id: batchRow.id,
            fingerprint: normalizedRow.fingerprint
          }
        ],
        rowCount: 1
      },
      { rows: [{ total: '1' }], rowCount: 1 }
    ]);
    const repository = new PostgresCostModelRepository(pool as never);

    const result = await repository.listRecords({ tenantId: DEFAULT_TENANT_ID, page: 1, pageSize: 25 });

    expect(result.data[0].costTotalUsd).toBe('0.20000000');
    expect(pool.client.queries[0].sql).toContain('(cr.hourly_rate_usd * cr.usage_hours)');
  });

  it('throws NotFoundException when a batch does not exist', async () => {
    const pool = new FakePool([{ rows: [], rowCount: 0 }]);
    const repository = new PostgresCostModelRepository(pool as never);

    await expect(repository.getBatch('missing', DEFAULT_TENANT_ID)).rejects.toThrow(NotFoundException);
  });
});
