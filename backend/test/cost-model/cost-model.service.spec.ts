import type { NormalizedCostRecord } from '../../src/cost-model/cost-record.types';
import { CostModelService } from '../../src/cost-model/cost-model.service';

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
  it('stores new rows and counts duplicate replay rows without duplicating records', () => {
    const service = new CostModelService();

    const first = service.saveIngestion({
      provider: 'aws',
      sourceUri: 'fixture.csv',
      idempotencyKey: 'first',
      rows: [record()]
    });
    const second = service.saveIngestion({
      provider: 'aws',
      sourceUri: 'fixture.csv',
      idempotencyKey: 'second',
      rows: [record()]
    });

    expect(first.ingestedRows).toBe(1);
    expect(second.duplicateRows).toBe(1);
    expect(service.listRecords({ page: 1, pageSize: 25 }).meta.total).toBe(1);
  });

  it('replays the exact response for duplicate idempotency keys', () => {
    const service = new CostModelService();
    const first = service.saveIngestion({
      provider: 'aws',
      sourceUri: 'fixture.csv',
      idempotencyKey: 'same-key',
      rows: [record()]
    });
    const replay = service.saveIngestion({
      provider: 'aws',
      sourceUri: 'fixture.csv',
      idempotencyKey: 'same-key',
      rows: [record({ fingerprint: 'different' })]
    });

    expect(replay).toEqual(first);
  });

  it('returns computed summary totals from stored hourly rates and usage hours', () => {
    const service = new CostModelService();
    service.saveIngestion({
      provider: 'aws',
      sourceUri: 'fixture.csv',
      idempotencyKey: 'summary',
      rows: [record(), record({ id: 'row-2', resourceId: 'resource-2', fingerprint: 'fingerprint-2', costTotalUsd: '1.00000000', isEstimate: true })]
    });

    expect(service.getSummary()).toEqual({
      totalCostUsd: '1.41600000',
      resourceCount: 2,
      untaggedCount: 2,
      inactiveCount: 0,
      isEstimate: true
    });
  });
});
