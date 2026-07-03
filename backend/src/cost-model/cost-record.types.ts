export type CloudProvider = 'aws' | 'azure' | 'gcp';
export type LeaseType = 'on_demand' | 'reserved' | 'savings_plan' | 'spot';

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
  provider: CloudProvider;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  sourceUri: string;
  createdAt: string;
  completedAt: string | null;
  ingestedRows: number;
  duplicateRows: number;
}
