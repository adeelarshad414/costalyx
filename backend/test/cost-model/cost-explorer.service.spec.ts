import { CostModelService } from '../../src/cost-model/cost-model.service';
import { InMemoryCostModelRepository } from '../../src/cost-model/in-memory-cost-model.repository';
import type { NormalizedCostRecord } from '../../src/cost-model/cost-record.types';
import { DEFAULT_TENANT_ID } from '../../src/security/token-verifier';

const baseRecord = {
  provider: 'aws',
  accountId: '11111111-1111-4111-8111-111111111111',
  accountExternalId: '123456789012',
  transactionType: 'usage',
  hourlyRateUsd: '1.00000000',
  usageHours: '1.0000',
  costTotalUsd: '1.00000000',
  costTotalUsdRoundedToCent: '1.00',
  isEstimate: false,
  validFrom: '2026-06-01T00:00:00.000Z',
  validTo: '2026-06-01T01:00:00.000Z',
  ingestedAt: '2026-06-01T01:00:00.000Z',
  sourceBatchId: 'batch-1'
} satisfies Partial<NormalizedCostRecord>;

describe('Cost Explorer flow reconciliation', () => {
  it('reconciles Explorer link totals exactly with Resource Inventory summary totals for the same filters', async () => {
    const service = new CostModelService(new InMemoryCostModelRepository());
    await service.saveIngestion({
      tenantId: DEFAULT_TENANT_ID,
      provider: 'aws',
      sourceUri: 'explorer-fixture.csv',
      idempotencyKey: 'explorer-fixture',
      rows: [
        {
          ...baseRecord,
          id: '11111111-1111-4111-8111-111111111111',
          resourceId: 'i-ec2-1',
          serviceName: 'Amazon EC2',
          usageFamily: 'BoxUsage:t3.medium',
          leaseType: 'on_demand',
          fingerprint: 'explorer-row-1'
        },
        {
          ...baseRecord,
          id: '22222222-2222-4222-8222-222222222222',
          resourceId: 'db-rds-1',
          serviceName: 'Amazon RDS',
          usageFamily: 'InstanceUsage:db.t4g.medium',
          leaseType: 'reserved',
          hourlyRateUsd: '2.00000000',
          costTotalUsd: '2.00000000',
          costTotalUsdRoundedToCent: '2.00',
          fingerprint: 'explorer-row-2'
        }
      ] as NormalizedCostRecord[]
    });

    const summary = await service.getSummary({ tenantId: DEFAULT_TENANT_ID, provider: 'aws' });
    const flow = await service.getExplorerFlow({
      tenantId: DEFAULT_TENANT_ID,
      provider: 'aws',
      dimensions: ['service', 'leaseType'],
      costFloorUsd: '0.00000000'
    });
    const linkTotal = flow.links.reduce((sum, link) => sum + Number(link.costTotalUsd), 0);

    expect(summary.totalCostUsd).toBe('3.00000000');
    expect(linkTotal.toFixed(8)).toBe(summary.totalCostUsd);
    expect(flow.nodes.map((node) => node.label)).toEqual(
      expect.arrayContaining(['Amazon EC2', 'Amazon RDS', 'on_demand', 'reserved'])
    );
  });

  it('applies the cost-floor threshold without storing or mutating computed totals', async () => {
    const service = new CostModelService(new InMemoryCostModelRepository());
    await service.saveIngestion({
      tenantId: DEFAULT_TENANT_ID,
      provider: 'aws',
      sourceUri: 'explorer-floor-fixture.csv',
      idempotencyKey: 'explorer-floor-fixture',
      rows: [
        {
          ...baseRecord,
          id: '33333333-3333-4333-8333-333333333333',
          resourceId: 'i-small',
          serviceName: 'Amazon EC2',
          usageFamily: 'BoxUsage:t3.nano',
          leaseType: 'on_demand',
          hourlyRateUsd: '0.01000000',
          costTotalUsd: '0.01000000',
          costTotalUsdRoundedToCent: '0.01',
          fingerprint: 'explorer-floor-small'
        },
        {
          ...baseRecord,
          id: '44444444-4444-4444-8444-444444444444',
          resourceId: 'i-large',
          serviceName: 'Amazon EC2',
          usageFamily: 'BoxUsage:m7i.large',
          leaseType: 'on_demand',
          hourlyRateUsd: '4.00000000',
          costTotalUsd: '4.00000000',
          costTotalUsdRoundedToCent: '4.00',
          fingerprint: 'explorer-floor-large'
        }
      ] as NormalizedCostRecord[]
    });

    const flow = await service.getExplorerFlow({
      tenantId: DEFAULT_TENANT_ID,
      provider: 'aws',
      dimensions: ['usageFamily', 'leaseType'],
      costFloorUsd: '1.00000000'
    });

    expect(flow.links).toHaveLength(1);
    expect(flow.links[0]).toEqual(
      expect.objectContaining({ source: 'usageFamily:BoxUsage:m7i.large', costTotalUsd: '4.00000000' })
    );
  });
});
