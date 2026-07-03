import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';
import { PostgresCostModelRepository } from '../../src/cost-model/postgres-cost-model.repository';
import type { NormalizedCostRecord } from '../../src/cost-model/cost-record.types';

const runPostgresSuite = process.env.RUN_POSTGRES_INTEGRATION === 'true' && process.env.DATABASE_URL;
const describeIfPostgres = runPostgresSuite ? describe : describe.skip;
jest.setTimeout(30000);

const record: NormalizedCostRecord = {
  id: '44444444-4444-4444-8444-444444444444',
  provider: 'aws',
  accountId: '55555555-5555-4555-8555-555555555555',
  accountExternalId: '123456789012',
  resourceId: 'i-postgres-001',
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
  validTo: '2026-01-01T02:00:00.000Z',
  ingestedAt: '1970-01-01T00:00:00.000Z',
  sourceBatchId: 'source-batch',
  fingerprint: '44444444-4444-4444-8444-444444444444'
};

describeIfPostgres('PostgresCostModelRepository with a real database', () => {
  let pool: Pool;
  let repository: PostgresCostModelRepository;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    repository = new PostgresCostModelRepository(pool);

    for (const migration of ['001_initial_cost_model.sql', '002_persisted_ingestion_idempotency.sql']) {
      const sql = readFileSync(join(process.cwd(), 'migrations', migration), 'utf8');
      await pool.query(sql);
    }
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE cost_records, accounts, ingestion_batches CASCADE');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('persists ingestion state durably and computes cost totals from pricing fields', async () => {
    const firstRepository = new PostgresCostModelRepository(pool);
    const first = await firstRepository.saveIngestion({
      provider: 'aws',
      sourceUri: 'postgres-fixture.csv',
      idempotencyKey: 'pg-idem-1',
      rows: [record]
    });

    const secondRepository = new PostgresCostModelRepository(pool);
    const replay = await secondRepository.saveIngestion({
      provider: 'aws',
      sourceUri: 'postgres-fixture.csv',
      idempotencyKey: 'pg-idem-1',
      rows: [{ ...record, fingerprint: 'different-fingerprint' }]
    });
    const records = await secondRepository.listRecords({ page: 1, pageSize: 25 });
    const storedCostTotalColumn = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM information_schema.columns
       WHERE table_name = 'cost_records' AND column_name = 'cost_total_usd'`
    );

    expect(first.ingestedRows).toBe(1);
    expect(replay).toEqual(first);
    expect(records.meta.total).toBe(1);
    expect(records.data[0].costTotalUsd).toBe('0.20000000');
    expect(storedCostTotalColumn.rows[0].count).toBe(0);
  });

  it('counts duplicate fingerprints across different idempotency keys', async () => {
    await repository.saveIngestion({
      provider: 'aws',
      sourceUri: 'postgres-fixture.csv',
      idempotencyKey: 'pg-idem-2',
      rows: [record]
    });

    const replay = await repository.saveIngestion({
      provider: 'aws',
      sourceUri: 'postgres-fixture.csv',
      idempotencyKey: 'pg-idem-3',
      rows: [record]
    });

    expect(replay.ingestedRows).toBe(0);
    expect(replay.duplicateRows).toBe(1);
  });

  it('reconciles filtered Cost Explorer totals with Resource Inventory summary totals', async () => {
    await repository.saveIngestion({
      provider: 'aws',
      sourceUri: 'postgres-explorer-aws.csv',
      idempotencyKey: 'pg-explorer-aws',
      rows: [record]
    });
    await repository.saveIngestion({
      provider: 'azure',
      sourceUri: 'postgres-explorer-azure.csv',
      idempotencyKey: 'pg-explorer-azure',
      rows: [
        {
          ...record,
          id: '66666666-6666-4666-8666-666666666666',
          provider: 'azure',
          accountId: '77777777-7777-4777-8777-777777777777',
          accountExternalId: 'azure-subscription-1',
          resourceId: 'vm-azure-001',
          serviceName: 'Azure Virtual Machines',
          hourlyRateUsd: '4.00000000',
          usageHours: '1.0000',
          costTotalUsd: '4.00000000',
          costTotalUsdRoundedToCent: '4.00',
          fingerprint: '66666666-6666-4666-8666-666666666666'
        }
      ]
    });

    const summary = await repository.getSummary({ provider: 'aws' });
    const flow = await repository.getExplorerFlow({
      provider: 'aws',
      dimensions: ['service', 'leaseType'],
      costFloorUsd: '0.00000000'
    });
    const linkTotal = flow.links.reduce((sum, link) => sum + Number(link.costTotalUsd), 0);

    expect(summary.totalCostUsd).toBe('0.20000000');
    expect(linkTotal.toFixed(8)).toBe(summary.totalCostUsd);
    expect(flow.nodes.map((node) => node.label)).toContain('Amazon EC2');
  });
});
