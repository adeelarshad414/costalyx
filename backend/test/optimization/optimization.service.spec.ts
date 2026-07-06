import { CostModelService } from '../../src/cost-model/cost-model.service';
import { InMemoryCostModelRepository } from '../../src/cost-model/in-memory-cost-model.repository';
import type { NormalizedCostRecord } from '../../src/cost-model/cost-record.types';
import { InMemoryOptimizationRepository } from '../../src/optimization/in-memory-optimization.repository';
import { OptimizationService } from '../../src/optimization/optimization.service';
import { DEFAULT_TENANT_ID } from '../../src/security/token-verifier';

const actor = { subject: 'analyst-user', role: 'analyst' as const, tenantId: DEFAULT_TENANT_ID };

function record(overrides: Partial<NormalizedCostRecord> = {}): NormalizedCostRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    provider: 'aws',
    accountId: '22222222-2222-4222-8222-222222222222',
    accountExternalId: '123456789012',
    resourceId: 'i-underused-001',
    serviceName: 'Amazon EC2',
    usageFamily: 'BoxUsage:t3.medium',
    leaseType: 'on_demand',
    transactionType: 'usage',
    hourlyRateUsd: '0.01000000',
    usageHours: '10.0000',
    costTotalUsd: '0.10000000',
    costTotalUsdRoundedToCent: '0.10',
    isEstimate: false,
    validFrom: '2026-06-01T00:00:00.000Z',
    validTo: '2026-06-01T10:00:00.000Z',
    ingestedAt: '2026-06-01T10:00:00.000Z',
    sourceBatchId: 'batch-1',
    fingerprint: 'optimization-row-1',
    ...overrides
  };
}

describe('OptimizationService', () => {
  async function createService() {
    const costModel = new CostModelService(new InMemoryCostModelRepository());
    await costModel.saveIngestion({
      tenantId: DEFAULT_TENANT_ID,
      provider: 'aws',
      sourceUri: 'optimization-fixture.csv',
      idempotencyKey: 'optimization-fixture',
      rows: [record()]
    });
    return new OptimizationService(costModel, new InMemoryOptimizationRepository());
  }

  it('derives realized savings from actual ingested billing data instead of copying the estimate', async () => {
    const service = await createService();
    const recommendations = await service.listRecommendations({
      tenantId: DEFAULT_TENANT_ID,
      status: 'open',
      page: 1,
      pageSize: 25
    });
    const recommendation = recommendations.data.find((item) => item.resourceId === 'i-underused-001');

    expect(recommendation).toEqual(
      expect.objectContaining({
        type: 'rightsizing',
        estimatedSavingsUsd: '1.44000000',
        status: 'open'
      })
    );

    const applied = await service.updateRecommendation(
      recommendation!.id,
      { status: 'applied' },
      actor,
      'optimization-apply-key'
    );
    const replay = await service.updateRecommendation(
      recommendation!.id,
      { status: 'applied' },
      actor,
      'optimization-apply-key'
    );
    const realized = await service.listRealizedSavings({ tenantId: DEFAULT_TENANT_ID, page: 1, pageSize: 25 });

    expect(replay).toEqual(applied);
    expect(applied.status).toBe('applied');
    expect(realized.meta.total).toBe(1);
    expect(realized.data[0]).toEqual(
      expect.objectContaining({
        recommendationId: recommendation!.id,
        baselineCostUsd: '7.30000000',
        actualCostUsd: '0.10000000',
        deltaUsd: '7.20000000',
        verificationSource: 'ingested_billing'
      })
    );
    expect(realized.data[0].deltaUsd).not.toBe(recommendation!.estimatedSavingsUsd);
  });

  it('does not create realized savings rows for dismissed recommendations', async () => {
    const service = await createService();
    const recommendations = await service.listRecommendations({
      tenantId: DEFAULT_TENANT_ID,
      status: 'open',
      page: 1,
      pageSize: 25
    });

    await service.updateRecommendation(
      recommendations.data[0].id,
      { status: 'dismissed' },
      actor,
      'optimization-dismiss-key'
    );

    await expect(
      service.listRecommendations({ tenantId: DEFAULT_TENANT_ID, status: 'dismissed', page: 1, pageSize: 25 })
    ).resolves.toMatchObject({
      meta: { total: 1 },
      data: [expect.objectContaining({ status: 'dismissed' })]
    });
    await expect(service.listRealizedSavings({ tenantId: DEFAULT_TENANT_ID, page: 1, pageSize: 25 })).resolves.toMatchObject({
      meta: { total: 0 },
      data: []
    });
  });
});
