import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import golden from '../fixtures/aws-cur-golden.json';
import { AwsCurIngestionAdapter } from '../../src/ingestion/adapters/aws-cur-ingestion.adapter';

describe('AwsCurIngestionAdapter', () => {
  it('normalizes a CUR fixture into the golden cost model to the cent', () => {
    const raw = readFileSync(resolve(__dirname, '../fixtures/aws-cur-sample.csv'), 'utf8');
    const rows = new AwsCurIngestionAdapter().parse(raw, 'batch-aws-cur-fixture');

    expect(rows).toHaveLength(golden.length);
    expect(
      rows.map((row) => ({
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
      }))
    ).toEqual(golden);
  });

  it('marks every spot/preemptible row as an estimate during normalization', () => {
    const raw = readFileSync(resolve(__dirname, '../fixtures/aws-cur-sample.csv'), 'utf8');
    const rows = new AwsCurIngestionAdapter().parse(raw, 'batch-aws-cur-fixture');

    expect(rows.find((row) => row.leaseType === 'spot')?.isEstimate).toBe(true);
  });
});
