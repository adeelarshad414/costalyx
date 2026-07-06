import { Inject, Injectable } from '@nestjs/common';
import { COST_MODEL_REPOSITORY, type CostModelRepository } from './cost-model.repository';
import type { CloudProvider, CostExplorerDimension, IngestionBatch, NormalizedCostRecord } from './cost-record.types';

@Injectable()
export class CostModelService {
  constructor(@Inject(COST_MODEL_REPOSITORY) private readonly repository: CostModelRepository) {}

  saveIngestion(input: {
    tenantId: string;
    provider: CloudProvider;
    cloudConnectionId?: string;
    sourceUri: string;
    idempotencyKey: string;
    rows: NormalizedCostRecord[];
  }): Promise<IngestionBatch> {
    return this.repository.saveIngestion(input);
  }

  getBatch(id: string, tenantId: string): Promise<IngestionBatch> {
    return this.repository.getBatch(id, tenantId);
  }

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
  }) {
    return this.repository.listRecords(query);
  }

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
  }) {
    return this.repository.getSummary(query);
  }

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
  }) {
    return this.repository.getExplorerFlow(query);
  }
}
