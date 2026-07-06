import { formatDecimal, multiplyMoney, roundMoneyToCent } from '../../cost-model/decimal';
import type { LeaseType, NormalizedCostRecord } from '../../cost-model/cost-record.types';
import { stableId } from '../../cost-model/stable-id';
import type { CostIngestionAdapter } from '../cost-ingestion-adapter';
import { parseCsv, required, type CsvRow } from './csv';

export class GcpBillingExportAdapter implements CostIngestionAdapter {
  parse(rawBatch: string, sourceBatchId: string): NormalizedCostRecord[] {
    return parseCsv(rawBatch).map((row) => this.normalizeRow(row, sourceBatchId));
  }

  private normalizeRow(row: CsvRow, sourceBatchId: string): NormalizedCostRecord {
    const pricingType = required(row, 'pricing_type');
    const leaseType = classifyLeaseType(pricingType, required(row, 'sku_description'));
    const hourlyRateUsd = formatDecimal(required(row, 'hourly_rate_usd'), 8);
    const usageHours = formatDecimal(required(row, 'usage_hours'), 4);
    const costTotalUsd = multiplyMoney(hourlyRateUsd, usageHours);
    const accountExternalId = required(row, 'billing_account_id');
    const resourceId = required(row, 'resource_name');
    const validFrom = new Date(required(row, 'usage_start_time')).toISOString();
    const validTo = new Date(required(row, 'usage_end_time')).toISOString();
    const transactionType = normalizeTransactionType(required(row, 'transaction_type'));
    const fingerprint = stableId(
      ['gcp', accountExternalId, resourceId, pricingType, transactionType, validFrom, validTo].join(':')
    );

    return {
      id: fingerprint,
      provider: 'gcp',
      accountId: stableId(`gcp-account:${accountExternalId}`),
      accountExternalId,
      resourceId,
      serviceName: required(row, 'service_description'),
      usageFamily: required(row, 'sku_description'),
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

function classifyLeaseType(...values: string[]): LeaseType {
  const normalized = values.join(' ').toLowerCase();
  if (normalized.includes('spot') || normalized.includes('preemptible')) {
    return 'spot';
  }
  if (normalized.includes('committed') || normalized.includes('reserved')) {
    return 'reserved';
  }
  return 'on_demand';
}

function normalizeTransactionType(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'usage';
}
