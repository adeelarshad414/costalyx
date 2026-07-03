import { Injectable, NotFoundException } from '@nestjs/common';
import { CostModelService } from '../cost-model/cost-model.service';
import { formatDecimal } from '../cost-model/decimal';
import { stableId } from '../cost-model/stable-id';
import type { Report, ReportQuery, ReportRun, ReportRunQuery } from './reporting.types';

const cannedReports: Report[] = [
  {
    id: stableId('report:cost'),
    name: 'Cost Detail',
    category: 'cost',
    description: 'Resource-level cost rows by cloud provider.'
  },
  {
    id: stableId('report:cost-summary'),
    name: 'Cost Summary',
    category: 'cost_summary',
    description: 'Executive cost totals and resource counts.'
  },
  {
    id: stableId('report:invoices'),
    name: 'Invoices',
    category: 'invoices',
    description: 'Invoice-like totals grouped by provider account.'
  },
  {
    id: stableId('report:utilization'),
    name: 'Utilization',
    category: 'utilization',
    description: 'Usage hours and lease type by resource.'
  },
  {
    id: stableId('report:underutilization'),
    name: 'Underutilization',
    category: 'underutilization',
    description: 'Low-usage and low-cost resources for follow-up.'
  }
];

@Injectable()
export class ReportingService {
  constructor(private readonly costModel: CostModelService) {}

  listReports(query: ReportQuery) {
    const filtered = query.category ? cannedReports.filter((report) => report.category === query.category) : cannedReports;
    const start = (query.page - 1) * query.pageSize;
    return {
      data: filtered.slice(start, start + query.pageSize),
      meta: { total: filtered.length, page: query.page, pageSize: query.pageSize }
    };
  }

  async runReport(id: string, query: ReportRunQuery = {}): Promise<ReportRun> {
    const report = cannedReports.find((candidate) => candidate.id === id);
    if (!report) {
      throw new NotFoundException(`Report ${id} was not found.`);
    }
    const records = await this.costModel.listRecords({ ...query, page: 1, pageSize: 200 });
    const rows = report.category === 'cost_summary' ? await this.summaryRows(query) : reportRows(report, records.data);
    return {
      reportId: report.id,
      generatedAt: new Date().toISOString(),
      rows
    };
  }

  private async summaryRows(query: ReportRunQuery) {
    const summary = await this.costModel.getSummary(query);
    return [
      {
        totalCostUsd: summary.totalCostUsd,
        resourceCount: summary.resourceCount,
        untaggedCount: summary.untaggedCount,
        inactiveCount: summary.inactiveCount,
        isEstimate: summary.isEstimate
      }
    ];
  }
}

function reportRows(report: Report, records: Awaited<ReturnType<CostModelService['listRecords']>>['data']) {
  if (report.category === 'invoices') {
    return invoiceRows(records);
  }
  if (report.category === 'utilization') {
    return records.map((record) => ({
      provider: record.provider,
      resourceId: record.resourceId,
      serviceName: record.serviceName,
      usageHours: record.usageHours,
      leaseType: record.leaseType
    }));
  }
  if (report.category === 'underutilization') {
    return records
      .filter((record) => Number(record.usageHours) <= 10 || Number(record.costTotalUsd) <= 1)
      .map((record) => ({
        provider: record.provider,
        resourceId: record.resourceId,
        serviceName: record.serviceName,
        costTotalUsd: record.costTotalUsd,
        usageHours: record.usageHours
      }));
  }
  return records.map((record) => ({
    provider: record.provider,
    accountId: record.accountId,
    resourceId: record.resourceId,
    serviceName: record.serviceName,
    costTotalUsd: record.costTotalUsd,
    isEstimate: record.isEstimate
  }));
}

function invoiceRows(records: Awaited<ReturnType<CostModelService['listRecords']>>['data']) {
  const totals = new Map<string, { provider: string; accountId: string; total: number }>();
  for (const record of records) {
    const key = `${record.provider}:${record.accountId}`;
    const current = totals.get(key) ?? { provider: record.provider, accountId: record.accountId, total: 0 };
    current.total += Number(record.costTotalUsd);
    totals.set(key, current);
  }
  return [...totals.values()].map((row) => ({
    provider: row.provider,
    accountId: row.accountId,
    invoiceTotalUsd: formatDecimal(row.total, 8)
  }));
}
