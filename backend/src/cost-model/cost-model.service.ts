import { Inject, Injectable } from '@nestjs/common';
import { COST_MODEL_REPOSITORY, type CostModelRepository } from './cost-model.repository';
import type { CloudProvider, IngestionBatch, NormalizedCostRecord } from './cost-record.types';

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
    page: number;
    pageSize: number;
  }) {
    return this.repository.listRecords(query);
  }

  getSummary() {
    return this.repository.getSummary();
  }
}
