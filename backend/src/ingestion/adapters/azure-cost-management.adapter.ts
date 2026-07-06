import { formatDecimal, multiplyMoney, roundMoneyToCent } from '../../cost-model/decimal';
import type { LeaseType, NormalizedCostRecord } from '../../cost-model/cost-record.types';
import { stableId } from '../../cost-model/stable-id';
import type { CostIngestionAdapter } from '../cost-ingestion-adapter';
import { parseCsv, required, type CsvRow } from './csv';

export class AzureCostManagementAdapter implements CostIngestionAdapter {
  parse(rawBatch: string, sourceBatchId: string): NormalizedCostRecord[] {
    return parseCsv(rawBatch).map((row) => this.normalizeRow(row, sourceBatchId));
  }

  private normalizeRow(row: CsvRow, sourceBatchId: string): NormalizedCostRecord {
    const pricingModel = required(row, 'PricingModel');
    const leaseType = classifyLeaseType(pricingModel);
    const hourlyRateUsd = formatDecimal(required(row, 'EffectivePrice'), 8);
    const usageHours = formatDecimal(required(row, 'Quantity'), 4);
    const costTotalUsd = multiplyMoney(hourlyRateUsd, usageHours);
    const accountExternalId = required(row, 'SubscriptionId');
    const resourceId = required(row, 'ResourceId');
    const validFrom = new Date(required(row, 'UsageStart')).toISOString();
    const validTo = new Date(required(row, 'UsageEnd')).toISOString();
    const transactionType = normalizeTransactionType(required(row, 'ChargeType'));
    const fingerprint = stableId(
      ['azure', accountExternalId, resourceId, pricingModel, transactionType, validFrom, validTo].join(':')
    );

    return {
      id: fingerprint,
      provider: 'azure',
      accountId: stableId(`azure-account:${accountExternalId}`),
      accountExternalId,
      resourceId,
      serviceName: required(row, 'ServiceName'),
      usageFamily: required(row, 'MeterCategory'),
      leaseType,
      transactionType,
      hourlyRateUsd,
      usageHours,
      costTotalUsd,
      costTotalUsdRoundedToCent: roundMoneyToCent(costTotalUsd),
      isEstimate: leaseType === 'spot',
      validFrom,
      validTo,
      ingestedAt: new Date(0).toISOString(),
      sourceBatchId,
      fingerprint
    };
  }
}

function classifyLeaseType(value: string): LeaseType {
  const normalized = value.toLowerCase();
  if (normalized.includes('spot') || normalized.includes('preemptible')) {
    return 'spot';
  }
  if (normalized.includes('reserved')) {
    return 'reserved';
  }
  if (normalized.includes('savings')) {
    return 'savings_plan';
  }
  return 'on_demand';
}

function normalizeTransactionType(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'usage';
}
