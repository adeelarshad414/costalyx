export interface ExecutiveSummaryQuery {
  revenueBaselineUsd?: string;
  budgetBaselineUsd?: string;
}

export interface ExecutiveTrend {
  direction: 'up' | 'down' | 'flat';
  deltaUsd: string;
}

export interface ExecutiveTopMover {
  resourceId: string;
  serviceName: string;
  deltaUsd: string;
}

export interface ExecutiveSummary {
  totalSpendUsd: string;
  revenueBaselineUsd: string;
  spendAsRevenuePercent: string;
  budgetBaselineUsd: string;
  budgetUsedPercent: string;
  trend: ExecutiveTrend;
  topMovers: ExecutiveTopMover[];
}

export interface TcoWorkloadSpec {
  usageHours?: string;
  providerHourlyRatesUsd?: Partial<Record<'aws' | 'azure' | 'gcp', string>>;
}

export interface TcoEstimateRequest {
  workloadSpec: TcoWorkloadSpec;
}

export interface TcoProviderEstimate {
  monthlyCostUsd: string;
  isEstimate: boolean;
  assumptions: string[];
}

export interface TcoEstimateResponse {
  aws: TcoProviderEstimate;
  azure: TcoProviderEstimate;
  gcp: TcoProviderEstimate;
  tolerancePercent: string;
}
