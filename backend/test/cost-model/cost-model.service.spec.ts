import type { NormalizedCostRecord } from '../../src/cost-model/cost-record.types';
import { CostModelService } from '../../src/cost-model/cost-model.service';
import { InMemoryCostModelRepository } from '../../src/cost-model/in-memory-cost-model.repository';

function record(overrides: Partial<NormalizedCostRecord> = {}): NormalizedCostRecord {
  return {
    id: 'row-1',
    provider: 'aws',
    accountId: 'account-1',
    accountExternalId: '123456789012',
    resourceId: 'resource-1',
    serviceName: 'Amazon EC2',
    usageFamily: 'BoxUsage:t3.medium',
    leaseType: 'on_demand',
    transactionType: 'usage',
    hourlyRateUsd: '0.04160000',
    usageHours: '10.0000',
    costTotalUsd: '0.41600000',
    costTotalUsdRoundedToCent: '0.42',
    isEstimate: false,
    validFrom: '2026-06-01T00:00:00.000Z',
    validTo: '2026-06-01T10:00:00.000Z',
    ingestedAt: '1970-01-01T00:00:00.000Z',
    sourceBatchId: 'batch-1',
    fingerprint: 'fingerprint-1',
    ...overrides
  };
}

describe('CostModelService', () => {
  function createService() {
    return new CostModelService(new InMemoryCostModelRepository());
  }

  it('stores new rows and counts duplicate replay rows without duplicating records', async () => {
    const service = createService();

    const first = await service.saveIngestion({
      provider: 'aws',
      sourceUri: 'fixture.csv',
      idempotencyKey: 'first',
      rows: [record()]
    });
    const second = await service.saveIngestion({
      provider: 'aws',
      sourceUri: 'fixture.csv',
      idempotencyKey: 'second',
      rows: [record()]
    });

    expect(first.ingestedRows).toBe(1);
    expect(second.duplicateRows).toBe(1);
    await expect(service.listRecords({ page: 1, pageSize: 25 })).resolves.toMatchObject({
      meta: { total: 1 }
    });
  });

  it('replays the exact response for duplicate idempotency keys', async () => {
    const service = createService();
    const first = await service.saveIngestion({
      provider: 'aws',
      sourceUri: 'fixture.csv',
      idempotencyKey: 'same-key',
      rows: [record()]
    });
    const replay = await service.saveIngestion({
      provider: 'aws',
      sourceUri: 'fixture.csv',
      idempotencyKey: 'same-key',
      rows: [record({ fingerprint: 'different' })]
    });

    expect(replay).toEqual(first);
  });

  it('returns computed summary totals from stored hourly rates and usage hours', async () => {
    const service = createService();
    await service.saveIngestion({
      provider: 'aws',
      sourceUri: 'fixture.csv',
      idempotencyKey: 'summary',
      rows: [record(), record({ id: 'row-2', resourceId: 'resource-2', fingerprint: 'fingerprint-2', costTotalUsd: '1.00000000', isEstimate: true })]
    });

    await expect(service.getSummary()).resolves.toEqual({
      totalCostUsd: '1.41600000',
      resourceCount: 2,
      untaggedCount: 2,
      inactiveCount: 0,
      isEstimate: true
    });
  });
});
