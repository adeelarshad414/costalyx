import { Inject, Injectable } from '@nestjs/common';
import { COST_MODEL_REPOSITORY, type CostModelRepository } from './cost-model.repository';
import type { CloudProvider, CostExplorerDimension, IngestionBatch, NormalizedCostRecord } from './cost-record.types';

@Injectable()
export class CostModelService {
  constructor(@Inject(COST_MODEL_REPOSITORY) private readonly repository: CostModelRepository) {}

  saveIngestion(input: {
    provider: CloudProvider;
    sourceUri: string;
    idempotencyKey: string;
    rows: NormalizedCostRecord[];
  }): Promise<IngestionBatch> {
    return this.repository.saveIngestion(input);
  }

  getBatch(id: string): Promise<IngestionBatch> {
    return this.repository.getBatch(id);
  }

  listRecords(query: {
    provider?: CloudProvider;
    accountId?: string;
    service?: string;
    dimension?: string;
    from?: string;
    to?: string;
    page: number;
    pageSize: number;
  }) {
    return this.repository.listRecords(query);
  }

  getSummary(query?: {
    provider?: CloudProvider;
    accountId?: string;
    service?: string;
    dimension?: string;
    from?: string;
    to?: string;
  }) {
    return this.repository.getSummary(query);
  }

  getExplorerFlow(query?: {
    provider?: CloudProvider;
    accountId?: string;
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
