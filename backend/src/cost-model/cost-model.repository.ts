import type {
  CloudProvider,
  CostExplorerDimension,
  CostExplorerFlow,
  IngestionBatch,
  NormalizedCostRecord
} from './cost-record.types';

export const COST_MODEL_REPOSITORY = Symbol('COST_MODEL_REPOSITORY');

export interface CostModelRepository {
  saveIngestion(input: {
    tenantId: string;
    provider: CloudProvider;
    cloudConnectionId?: string;
    sourceUri: string;
    idempotencyKey: string;
    rows: NormalizedCostRecord[];
  }): Promise<IngestionBatch>;

  getBatch(id: string, tenantId: string): Promise<IngestionBatch>;

  listRecords(query: {
    tenantId: string;
    provider?: CloudProvider;
    accountId?: string;
    accountGroupId?: string;
    cloudConnectionId?: string;
    service?: string;
    dimension?: string;
    from?: string;
    to?: string;
    page: number;
    pageSize: number;
  }): Promise<{
    data: NormalizedCostRecord[];
    meta: { total: number; page: number; pageSize: number };
  }>;

  getSummary(query: {
    tenantId: string;
    provider?: CloudProvider;
    accountId?: string;
    accountGroupId?: string;
    cloudConnectionId?: string;
    service?: string;
    dimension?: string;
    from?: string;
    to?: string;
  }): Promise<{
    totalCostUsd: string;
    resourceCount: number;
    untaggedCount: number;
    inactiveCount: number;
    isEstimate: boolean;
  }>;

  getExplorerFlow(query: {
    tenantId: string;
    provider?: CloudProvider;
    accountId?: string;
    accountGroupId?: string;
    cloudConnectionId?: string;
    service?: string;
    dimension?: string;
    from?: string;
    to?: string;
    dimensions?: CostExplorerDimension[];
    costFloorUsd?: string;
  }): Promise<CostExplorerFlow>;
}
