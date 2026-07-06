import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import azureGolden from '../fixtures/azure-cost-export-golden.json';
import gcpGolden from '../fixtures/gcp-billing-export-golden.json';
import { AzureCostManagementAdapter } from '../../src/ingestion/adapters/azure-cost-management.adapter';
import { GcpBillingExportAdapter } from '../../src/ingestion/adapters/gcp-billing-export.adapter';
import type { NormalizedCostRecord } from '../../src/cost-model/cost-record.types';

function publicShape(row: NormalizedCostRecord) {
  return {
    provider: row.provider,
    accountExternalId: row.accountExternalId,
    resourceId: row.resourceId,
    serviceName: row.serviceName,
    usageFamily: row.usageFamily,
    leaseType: row.leaseType,
    transactionType: row.transactionType,
    hourlyRateUsd: row.hourlyRateUsd,
    usageHours: row.usageHours,
    costTotalUsd: row.costTotalUsd,
    costTotalUsdRoundedToCent: row.costTotalUsdRoundedToCent,
    isEstimate: row.isEstimate,
    validFrom: row.validFrom,
    validTo: row.validTo
  };
}

describe('multi-cloud ingestion adapters', () => {
  it('normalizes an Azure Cost Management export into the golden cost model', () => {
    const raw = readFileSync(resolve(__dirname, '../fixtures/azure-cost-export-sample.csv'), 'utf8');
    const rows = new AzureCostManagementAdapter().parse(raw, 'batch-azure-export-fixture');

    expect(rows.map(publicShape)).toEqual(azureGolden);
    expect(rows.find((row) => row.leaseType === 'spot')?.isEstimate).toBe(true);
  });

  it('normalizes a GCP Billing Export into the golden cost model', () => {
    const raw = readFileSync(resolve(__dirname, '../fixtures/gcp-billing-export-sample.csv'), 'utf8');
    const rows = new GcpBillingExportAdapter().parse(raw, 'batch-gcp-export-fixture');

    expect(rows.map(publicShape)).toEqual(gcpGolden);
    expect(rows.find((row) => row.leaseType === 'spot')?.isEstimate).toBe(true);
  });
});
