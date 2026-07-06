import type { CloudProvider } from '../cost-model/cost-record.types';
import type { PageQuery, Paginated } from '../governance/governance.types';

export type ReportCategory = 'cost' | 'cost_summary' | 'invoices' | 'utilization' | 'underutilization';

export interface Report {
  id: string;
  name: string;
  category: ReportCategory;
  description?: string;
}

export interface ReportRun {
  reportId: string;
  generatedAt: string;
  rows: Array<Record<string, string | number | boolean>>;
}

export interface ReportQuery extends PageQuery {
  category?: ReportCategory;
}

export interface ReportRunQuery {
  tenantId: string;
  provider?: CloudProvider;
  accountId?: string;
  accountGroupId?: string;
  cloudConnectionId?: string;
  service?: string;
  dimension?: string;
  from?: string;
  to?: string;
}

export type PaginatedReports = Paginated<Report>;
