export type CloudProvider = 'aws' | 'azure' | 'gcp';
export type LeaseType = 'on_demand' | 'reserved' | 'savings_plan' | 'spot';
export type CostExplorerDimension = 'provider' | 'account' | 'service' | 'leaseType' | 'transactionType' | 'usageFamily';

export interface NormalizedCostRecord {
  id: string;
  provider: CloudProvider;
  accountId: string;
  accountExternalId: string;
  resourceId: string;
  serviceName: string;
  usageFamily: string;
  leaseType: LeaseType;
  transactionType: string;
  hourlyRateUsd: string;
  usageHours: string;
  costTotalUsd: string;
  costTotalUsdRoundedToCent: string;
  isEstimate: boolean;
  validFrom: string;
  validTo: string | null;
  ingestedAt: string;
  sourceBatchId: string;
  fingerprint: string;
}

export interface IngestionBatch {
  id: string;
  tenantId: string;
  provider: CloudProvider;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  cloudConnectionId: string | null;
  sourceUri: string;
  createdAt: string;
  completedAt: string | null;
  ingestedRows: number;
  duplicateRows: number;
}

export interface CostExplorerNode {
  id: string;
  label: string;
  costTotalUsd: string;
}

export interface CostExplorerLink {
  source: string;
  target: string;
  costTotalUsd: string;
}

export interface CostExplorerFlow {
  nodes: CostExplorerNode[];
  links: CostExplorerLink[];
}
