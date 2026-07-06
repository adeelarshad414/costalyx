import { NotFoundException } from '@nestjs/common';
import { CostModelService } from '../../src/cost-model/cost-model.service';
import { InMemoryCostModelRepository } from '../../src/cost-model/in-memory-cost-model.repository';
import type { NormalizedCostRecord } from '../../src/cost-model/cost-record.types';
import { ReportingService } from '../../src/reporting/reporting.service';
import { DEFAULT_TENANT_ID } from '../../src/security/token-verifier';

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
    fingerprint: 'reporting-row-1',
    ...overrides
  };
}

describe('ReportingService', () => {
  async function createService() {
    const costModel = new CostModelService(new InMemoryCostModelRepository());
    await costModel.saveIngestion({
      tenantId: DEFAULT_TENANT_ID,
      provider: 'aws',
      sourceUri: 'reporting-fixture.csv',
      idempotencyKey: 'reporting-fixture',
      rows: [
        record(),
        record({
          id: '33333333-3333-4333-8333-333333333333',
          provider: 'azure',
          accountId: '44444444-4444-4444-8444-444444444444',
          accountExternalId: 'sub-prod-001',
          resourceId: 'vm-prod-001',
          serviceName: 'Azure Virtual Machines',
          hourlyRateUsd: '0.09600000',
          usageHours: '3.0000',
          costTotalUsd: '0.28800000',
          costTotalUsdRoundedToCent: '0.29',
          fingerprint: 'reporting-row-2'
        })
      ]
    });
    return new ReportingService(costModel);
  }

  it('ships the canned report catalog and runs each report category against scoped cost data', async () => {
    const service = await createService();
    const reports = service.listReports({ page: 1, pageSize: 10 });

    expect(reports.data.map((report) => report.category)).toEqual([
      'cost',
      'cost_summary',
      'invoices',
      'utilization',
      'underutilization'
    ]);

    const reportByCategory = Object.fromEntries(reports.data.map((report) => [report.category, report.id]));
    await expect(service.runReport(reportByCategory.cost, { tenantId: DEFAULT_TENANT_ID, provider: 'aws' })).resolves.toMatchObject({
      rows: [expect.objectContaining({ provider: 'aws', resourceId: 'db-prod-001', costTotalUsd: '49.64000000' })]
    });
    await expect(
      service.runReport(reportByCategory.cost_summary, { tenantId: DEFAULT_TENANT_ID, provider: 'aws' })
    ).resolves.toMatchObject({
      rows: [expect.objectContaining({ totalCostUsd: '49.64000000', resourceCount: 1 })]
    });
    await expect(service.runReport(reportByCategory.invoices, { tenantId: DEFAULT_TENANT_ID, provider: 'aws' })).resolves.toMatchObject({
      rows: [expect.objectContaining({ provider: 'aws', invoiceTotalUsd: '49.64000000' })]
    });
    await expect(
      service.runReport(reportByCategory.utilization, { tenantId: DEFAULT_TENANT_ID, provider: 'aws' })
    ).resolves.toMatchObject({
      rows: [expect.objectContaining({ provider: 'aws', usageHours: '730.0000' })]
    });
    await expect(
      service.runReport(reportByCategory.underutilization, { tenantId: DEFAULT_TENANT_ID, provider: 'azure' })
    ).resolves.toMatchObject({
      rows: [expect.objectContaining({ provider: 'azure', resourceId: 'vm-prod-001' })]
    });
  });

  it('rejects unknown report ids', async () => {
    const service = await createService();

    await expect(
      service.runReport('99999999-9999-4999-8999-999999999999', { tenantId: DEFAULT_TENANT_ID })
    ).rejects.toThrow(NotFoundException);
  });
});
