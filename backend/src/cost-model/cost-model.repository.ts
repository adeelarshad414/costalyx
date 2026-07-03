import type { CloudProvider, IngestionBatch, NormalizedCostRecord } from './cost-record.types';

export const COST_MODEL_REPOSITORY = Symbol('COST_MODEL_REPOSITORY');

export interface CostModelRepository {
  saveIngestion(input: {
    provider: CloudProvider;
    sourceUri: string;
    idempotencyKey: string;
    rows: NormalizedCostRecord[];
  }): Promise<IngestionBatch>;

  getBatch(id: string): Promise<IngestionBatch>;

  listRecords(query: {
    provider?: CloudProvider;
    accountId?: string;
    service?: string;
    page: number;
    pageSize: number;
  }): Promise<{
    data: NormalizedCostRecord[];
    meta: { total: number; page: number; pageSize: number };
  }>;

  getSummary(): Promise<{
    totalCostUsd: string;
    resourceCount: number;
    untaggedCount: number;
    inactiveCount: number;
    isEstimate: boolean;
  }>;
}
