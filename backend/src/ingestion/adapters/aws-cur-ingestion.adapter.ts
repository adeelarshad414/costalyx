import { formatDecimal, multiplyMoney, roundMoneyToCent } from '../../cost-model/decimal';
import type { LeaseType, NormalizedCostRecord } from '../../cost-model/cost-record.types';
import { stableId } from '../../cost-model/stable-id';
import type { CostIngestionAdapter } from '../cost-ingestion-adapter';

type CurRow = Record<string, string>;

export class AwsCurIngestionAdapter implements CostIngestionAdapter {
  parse(rawBatch: string, sourceBatchId: string): NormalizedCostRecord[] {
    return parseCsv(rawBatch).map((row) => this.normalizeRow(row, sourceBatchId));
  }

  private normalizeRow(row: CurRow, sourceBatchId: string): NormalizedCostRecord {
    const usageType = required(row, 'lineItem/UsageType');
    const lineItemType = required(row, 'lineItem/LineItemType');
    const leaseType = classifyLeaseType(usageType);
    const hourlyRateUsd = formatDecimal(required(row, 'pricing/publicOnDemandRate'), 8);
    const usageHours = formatDecimal(required(row, 'lineItem/UsageAmount'), 4);
    const costTotalUsd = multiplyMoney(hourlyRateUsd, usageHours);
    const accountExternalId = required(row, 'lineItem/UsageAccountId');
    const resourceId = required(row, 'lineItem/ResourceId');
    const validFrom = new Date(required(row, 'lineItem/UsageStartDate')).toISOString();
    const validTo = new Date(required(row, 'lineItem/UsageEndDate')).toISOString();
    const transactionType = classifyTransactionType(lineItemType);
    const fingerprint = stableId(
      ['aws', accountExternalId, resourceId, usageType, transactionType, validFrom, validTo].join(':')
    );

    return {
      id: fingerprint,
      provider: 'aws',
      accountId: stableId(`aws-account:${accountExternalId}`),
      accountExternalId,
      resourceId,
      serviceName: required(row, 'product/ProductName'),
      usageFamily: usageType,
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

function classifyLeaseType(usageType: string): LeaseType {
  const normalized = usageType.toLowerCase();
  if (normalized.includes('spot') || normalized.includes('preemptible')) {
    return 'spot';
  }
  if (normalized.includes('reserved')) {
    return 'reserved';
  }
  if (normalized.includes('savingsplan')) {
    return 'savings_plan';
  }
  return 'on_demand';
}

function classifyTransactionType(lineItemType: string): string {
  const normalized = lineItemType.toLowerCase();
  if (normalized.includes('recurring')) {
    return 'recurring_charge';
  }
  if (normalized.includes('credit')) {
    return 'credit';
  }
  if (normalized.includes('tax')) {
    return 'tax';
  }
  return 'usage';
}

function required(row: CurRow, key: string): string {
  const value = row[key];
  if (value === undefined || value === '') {
    throw new Error(`Missing required CUR field ${key}`);
  }
  return value;
}

function parseCsv(raw: string): CurRow[] {
  const lines = raw.trim().split(/\r?\n/);
  const headers = splitCsvLine(lines[0] ?? '');
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;

  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}
