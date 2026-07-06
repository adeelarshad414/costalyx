import type { NormalizedCostRecord } from '../../src/cost-model/cost-record.types';

const accountId = '22222222-2222-4222-8222-222222222222';
const accountExternalId = '123456789012';

export function costRecord(overrides: Partial<NormalizedCostRecord> = {}): NormalizedCostRecord {
  const hourlyRateUsd = overrides.hourlyRateUsd ?? '0.10000000';
  const usageHours = overrides.usageHours ?? '10.0000';
  const costTotalUsd = (Number(hourlyRateUsd) * Number(usageHours)).toFixed(8);
  const id = overrides.id ?? '11111111-1111-4111-8111-111111111111';
  return {
    id,
    provider: 'aws',
    accountId,
    accountExternalId,
    resourceId: 'resource-1',
    serviceName: 'Amazon EC2',
    usageFamily: 'BoxUsage:t3.medium',
    leaseType: 'on_demand',
    transactionType: 'usage',
    hourlyRateUsd,
    usageHours,
    costTotalUsd: overrides.costTotalUsd ?? costTotalUsd,
    costTotalUsdRoundedToCent: overrides.costTotalUsdRoundedToCent ?? Number(overrides.costTotalUsd ?? costTotalUsd).toFixed(2),
    isEstimate: false,
    validFrom: '2026-06-01T00:00:00.000Z',
    validTo: '2026-06-01T01:00:00.000Z',
    ingestedAt: '1970-01-01T00:00:00.000Z',
    sourceBatchId: 'batch-fixture',
    fingerprint: `fixture:${id}`,
    ...overrides
  };
}

export function goldenAnomalyRecords(): NormalizedCostRecord[] {
  return [
    costRecord({
      id: '11111111-1111-4111-8111-111111111101',
      resourceId: 'i-price-001',
      hourlyRateUsd: '0.10000000',
      usageHours: '1.0000',
      validFrom: '2026-06-01T00:00:00.000Z',
      validTo: '2026-06-01T01:00:00.000Z'
    }),
    costRecord({
      id: '11111111-1111-4111-8111-111111111102',
      resourceId: 'i-price-001',
      hourlyRateUsd: '0.15000000',
      usageHours: '1.0000',
      validFrom: '2026-06-02T00:00:00.000Z',
      validTo: '2026-06-02T01:00:00.000Z'
    }),
    ...[1, 2, 3].map((day) =>
      costRecord({
        id: `11111111-1111-4111-8111-11111111210${day}`,
        resourceId: 's3-usage-001',
        serviceName: 'Amazon S3',
        usageFamily: 'TimedStorage-ByteHrs',
        hourlyRateUsd: '0.01000000',
        usageHours: '10.0000',
        validFrom: `2026-06-0${day}T00:00:00.000Z`,
        validTo: `2026-06-0${day}T01:00:00.000Z`
      })
    ),
    costRecord({
      id: '11111111-1111-4111-8111-111111112104',
      resourceId: 's3-usage-001',
      serviceName: 'Amazon S3',
      usageFamily: 'TimedStorage-ByteHrs',
      hourlyRateUsd: '0.01000000',
      usageHours: '50.0000',
      validFrom: '2026-06-04T00:00:00.000Z',
      validTo: '2026-06-04T01:00:00.000Z'
    }),
    costRecord({
      id: '11111111-1111-4111-8111-111111113101',
      resourceId: 'bedrock-model-001',
      serviceName: 'Amazon Bedrock',
      usageFamily: 'ModelInvocation',
      hourlyRateUsd: '30.00000000',
      usageHours: '1.0000',
      validFrom: '2026-06-06T00:00:00.000Z',
      validTo: '2026-06-06T01:00:00.000Z'
    }),
    costRecord({
      id: '11111111-1111-4111-8111-111111114101',
      resourceId: 'rds-commit-001',
      serviceName: 'Amazon RDS',
      usageFamily: 'DatabaseUsage',
      leaseType: 'reserved',
      hourlyRateUsd: '0.10000000',
      usageHours: '80.0000',
      validFrom: '2026-06-01T00:00:00.000Z',
      validTo: '2026-06-01T01:00:00.000Z'
    }),
    costRecord({
      id: '11111111-1111-4111-8111-111111114102',
      resourceId: 'rds-ondemand-001',
      serviceName: 'Amazon RDS',
      usageFamily: 'DatabaseUsage',
      leaseType: 'on_demand',
      hourlyRateUsd: '0.10000000',
      usageHours: '20.0000',
      validFrom: '2026-06-01T00:00:00.000Z',
      validTo: '2026-06-01T01:00:00.000Z'
    }),
    costRecord({
      id: '11111111-1111-4111-8111-111111114103',
      resourceId: 'rds-ondemand-002',
      serviceName: 'Amazon RDS',
      usageFamily: 'DatabaseUsage',
      leaseType: 'on_demand',
      hourlyRateUsd: '0.10000000',
      usageHours: '100.0000',
      validFrom: '2026-06-02T00:00:00.000Z',
      validTo: '2026-06-02T01:00:00.000Z'
    })
  ];
}

export function cleanAnomalyRecords(): NormalizedCostRecord[] {
  return [1, 2, 3, 4].map((day) =>
    costRecord({
      id: `11111111-1111-4111-8111-11111111510${day}`,
      resourceId: 'i-clean-001',
      hourlyRateUsd: '0.10000000',
      usageHours: '10.0000',
      validFrom: `2026-06-0${day}T00:00:00.000Z`,
      validTo: `2026-06-0${day}T01:00:00.000Z`
    })
  );
}
