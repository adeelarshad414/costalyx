import { performance } from 'node:perf_hooks';
import { CostModelService } from '../../src/cost-model/cost-model.service';
import { InMemoryCostModelRepository } from '../../src/cost-model/in-memory-cost-model.repository';
import type { LeaseType, NormalizedCostRecord } from '../../src/cost-model/cost-record.types';
import { DEFAULT_TENANT_ID } from '../../src/security/token-verifier';

const services = ['Amazon EC2', 'Amazon RDS', 'Amazon S3', 'Google BigQuery', 'Azure VM'] as const;
const leaseTypes: LeaseType[] = ['on_demand', 'reserved', 'spot'];

describe('Cost Explorer load smoke', () => {
  it('lists, summarizes, and builds explorer flow for 5000 realistic cost records inside the local budget', async () => {
    const service = new CostModelService(new InMemoryCostModelRepository());
    const rows = Array.from({ length: 5000 }, (_, index) => buildRecord(index));

    await service.saveIngestion({
      tenantId: DEFAULT_TENANT_ID,
      provider: 'aws',
      sourceUri: 'load-smoke.csv',
      idempotencyKey: 'load-smoke-5000',
      rows
    });

    const started = performance.now();
    const [records, summary, flow] = await Promise.all([
      service.listRecords({ tenantId: DEFAULT_TENANT_ID, provider: 'aws', page: 1, pageSize: 100 }),
      service.getSummary({ tenantId: DEFAULT_TENANT_ID, provider: 'aws' }),
      service.getExplorerFlow({
        tenantId: DEFAULT_TENANT_ID,
        provider: 'aws',
        dimensions: ['service', 'leaseType'],
        costFloorUsd: '0.00000000'
      })
    ]);
    const elapsedMs = performance.now() - started;

    expect(records.meta.total).toBe(5000);
    expect(records.data).toHaveLength(100);
    expect(summary.resourceCount).toBe(5000);
    expect(summary.totalCostUsd).toBe('125.00000000');
    expect(flow.nodes.length).toBeGreaterThanOrEqual(services.length + leaseTypes.length);
    expect(flow.links.length).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(2000);
  });
});

function buildRecord(index: number): NormalizedCostRecord {
  const serviceName = services[index % services.length];
  const leaseType = leaseTypes[index % leaseTypes.length];
  const validFrom = new Date(Date.UTC(2026, 6, 1, index % 24)).toISOString();
  const validTo = new Date(Date.UTC(2026, 6, 1, (index % 24) + 1)).toISOString();
  return {
    id: `load-record-${index}`,
    provider: 'aws',
    accountId: `account-${index % 20}`,
    accountExternalId: `1234567890${String(index % 10).padStart(2, '0')}`,
    resourceId: `resource-${index}`,
    serviceName,
    usageFamily: `${serviceName.replace(/\s+/g, '-')}:family-${index % 10}`,
    leaseType,
    transactionType: 'usage',
    hourlyRateUsd: '0.01000000',
    usageHours: '2.5000',
    costTotalUsd: '0.02500000',
    costTotalUsdRoundedToCent: '0.03',
    isEstimate: leaseType === 'spot',
    validFrom,
    validTo,
    ingestedAt: validTo,
    sourceBatchId: 'load-smoke-batch',
    fingerprint: `load-smoke-${index}`
  };
}
