import type { NormalizedCostRecord } from '../cost-model/cost-record.types';

export interface CostIngestionAdapter {
  parse(rawBatch: string, sourceBatchId: string): NormalizedCostRecord[];
}
