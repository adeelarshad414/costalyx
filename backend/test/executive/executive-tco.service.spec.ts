import { CostModelService } from '../../src/cost-model/cost-model.service';
import { InMemoryCostModelRepository } from '../../src/cost-model/in-memory-cost-model.repository';
import type { NormalizedCostRecord } from '../../src/cost-model/cost-record.types';
import { ExecutiveService } from '../../src/executive/executive.service';

function record(overrides: Partial<NormalizedCostRecord> = {}): NormalizedCostRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    provider: 'aws',
    accountId: '22222222-2222-4222-8222-222222222222',
    accountExternalId: '123456789012',
    resourceId: 'db-prod-001',
    serviceName: 'Amazon RDS',
    usageFamily: 'InstanceUsage:db.t4g.medium',
    leaseType: 'on_demand',
    transactionType: 'usage',
    hourlyRateUsd: '0.06800000',
    usageHours: '730.0000',
    costTotalUsd: '49.64000000',
    costTotalUsdRoundedToCent: '49.64',
    isEstimate: false,
    validFrom: '2026-06-01T00:00:00.000Z',
    validTo: '2026-07-01T00:00:00.000Z',
    ingestedAt: '2026-07-01T00:00:00.000Z',
    sourceBatchId: 'batch-1',
    fingerprint: 'executive-row-1',
    ...overrides
  };
}

describe('ExecutiveService', () => {
  async function createService() {
    const costModel = new CostModelService(new InMemoryCostModelRepository());
    await costModel.saveIngestion({
      provider: 'aws',
      sourceUri: 'executive-fixture.csv',
      idempotencyKey: 'executive-fixture',
      rows: [
        record(),
        record({
          id: '33333333-3333-4333-8333-333333333333',
          resourceId: 'i-api-001',
          serviceName: 'Amazon EC2',
          hourlyRateUsd: '0.01000000',
          usageHours: '10.0000',
          costTotalUsd: '0.10000000',
          costTotalUsdRoundedToCent: '0.10',
          fingerprint: 'executive-row-2'
        })
      ]
    });
    return new ExecutiveService(costModel);
  }

  it('builds an executive summary with spend percentages and top movers from ingested cost data', async () => {
    const service = await createService();

    await expect(
      service.getExecutiveSummary({ revenueBaselineUsd: '1000.00000000', budgetBaselineUsd: '100.00000000' })
    ).resolves.toMatchObject({
      totalSpendUsd: '49.74000000',
      spendAsRevenuePercent: '4.9740',
      budgetUsedPercent: '49.7400',
      topMovers: [expect.objectContaining({ resourceId: 'db-prod-001', deltaUsd: '49.64000000' })]
    });
  });

  it('estimates fixture workload TCO with the same hourly-rate multiplication used by ingestion', async () => {
    const service = await createService();
    const estimate = await service.estimateTco(
      {
        workloadSpec: {
          usageHours: '730.0000',
          providerHourlyRatesUsd: {
            aws: '0.06800000',
            azure: '0.09600000',
            gcp: '0.04750000'
          }
        }
      },
      'tco-estimate-key'
    );

    expect(estimate.aws.monthlyCostUsd).toBe('49.64000000');
    expect(estimate.azure.monthlyCostUsd).toBe('70.08000000');
    expect(estimate.gcp.monthlyCostUsd).toBe('34.67500000');
    expect(estimate.tolerancePercent).toBe('0.0000');
  });
});
