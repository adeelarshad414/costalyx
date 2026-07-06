import { Injectable } from '@nestjs/common';
import { CostModelService } from '../cost-model/cost-model.service';
import { formatDecimal, multiplyMoney } from '../cost-model/decimal';
import type {
  ExecutiveSummary,
  ExecutiveSummaryQuery,
  ExecutiveTopMover,
  TcoEstimateRequest,
  TcoEstimateResponse
} from './executive.types';

const defaultRevenueBaselineUsd = '1000000.00000000';
const defaultBudgetBaselineUsd = '100000.00000000';
const defaultUsageHours = '730.0000';
const defaultRates = {
  aws: '0.06800000',
  azure: '0.09600000',
  gcp: '0.04750000'
} as const;

@Injectable()
export class ExecutiveService {
  private readonly tcoIdempotencyResponses = new Map<string, TcoEstimateResponse>();

  constructor(private readonly costModel: CostModelService) {}

  async getExecutiveSummary(tenantId: string, query: ExecutiveSummaryQuery = {}): Promise<ExecutiveSummary> {
    const [summary, records] = await Promise.all([
      this.costModel.getSummary({ tenantId }),
      this.costModel.listRecords({ tenantId, page: 1, pageSize: 200 })
    ]);
    const revenueBaselineUsd = query.revenueBaselineUsd ?? defaultRevenueBaselineUsd;
    const budgetBaselineUsd = query.budgetBaselineUsd ?? defaultBudgetBaselineUsd;
    const topMovers = records.data
      .map<ExecutiveTopMover>((record) => ({
        resourceId: record.resourceId,
        serviceName: record.serviceName,
        deltaUsd: record.costTotalUsd
      }))
      .sort((left, right) => Number(right.deltaUsd) - Number(left.deltaUsd))
      .slice(0, 1);
    const trendDeltaUsd = topMovers[0]?.deltaUsd ?? '0.00000000';

    return {
      totalSpendUsd: summary.totalCostUsd,
      revenueBaselineUsd,
      spendAsRevenuePercent: percent(summary.totalCostUsd, revenueBaselineUsd),
      budgetBaselineUsd,
      budgetUsedPercent: percent(summary.totalCostUsd, budgetBaselineUsd),
      trend: {
        direction: Number(summary.totalCostUsd) > 0 ? 'up' : 'flat',
        deltaUsd: trendDeltaUsd
      },
      topMovers
    };
  }

  async exportExecutiveSummary(tenantId: string): Promise<string> {
    const summary = await this.getExecutiveSummary(tenantId);
    return buildPdfDocument([
      'Costalyx Executive Summary',
      `Total spend USD ${summary.totalSpendUsd}`,
      `Spend as revenue ${summary.spendAsRevenuePercent}%`,
      `Budget used ${summary.budgetUsedPercent}%`
    ]);
  }

  estimateTco(input: TcoEstimateRequest, tenantId: string, idempotencyKey: string): TcoEstimateResponse {
    const scopedKey = `${tenantId}:${idempotencyKey}`;
    const existing = this.tcoIdempotencyResponses.get(scopedKey);
    if (existing) {
      return existing;
    }
    const workloadSpec = input.workloadSpec ?? {};
    const usageHours = workloadSpec.usageHours ?? defaultUsageHours;
    const providerHourlyRatesUsd = workloadSpec.providerHourlyRatesUsd ?? {};
    const response: TcoEstimateResponse = {
      aws: providerEstimate(usageHours, providerHourlyRatesUsd.aws ?? defaultRates.aws, Boolean(providerHourlyRatesUsd.aws)),
      azure: providerEstimate(
        usageHours,
        providerHourlyRatesUsd.azure ?? defaultRates.azure,
        Boolean(providerHourlyRatesUsd.azure)
      ),
      gcp: providerEstimate(usageHours, providerHourlyRatesUsd.gcp ?? defaultRates.gcp, Boolean(providerHourlyRatesUsd.gcp)),
      tolerancePercent: '0.0000'
    };
    this.tcoIdempotencyResponses.set(scopedKey, response);
    return response;
  }
}

function percent(numerator: string, denominator: string): string {
  const baseline = Number(denominator);
  if (!Number.isFinite(baseline) || baseline <= 0) {
    return '0.0000';
  }
  return formatDecimal((Number(numerator) / baseline) * 100, 4);
}

function providerEstimate(usageHours: string, hourlyRateUsd: string, rateFromWorkload: boolean) {
  return {
    monthlyCostUsd: multiplyMoney(hourlyRateUsd, usageHours),
    isEstimate: !rateFromWorkload,
    assumptions: [rateFromWorkload ? 'rate from workloadSpec' : 'default Costalyx fixture rate']
  };
}

function buildPdfDocument(lines: string[]): string {
  const escapedLines = lines.map((line, index) => `BT /F1 12 Tf 72 ${740 - index * 18} Td (${escapePdf(line)}) Tj ET`).join('\n');
  const stream = `${escapedLines}\n`;
  return `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj
4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
5 0 obj << /Length ${stream.length} >> stream
${stream}endstream endobj
trailer << /Root 1 0 R >>
%%EOF`;
}

function escapePdf(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}
