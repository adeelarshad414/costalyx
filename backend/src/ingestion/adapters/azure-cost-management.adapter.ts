import type { NormalizedCostRecord } from '../../cost-model/cost-record.types';
import type { CostIngestionAdapter } from '../cost-ingestion-adapter';

export class AzureCostManagementAdapter implements CostIngestionAdapter {
  parse(): NormalizedCostRecord[] {
    return [];
  }
}
