import { BadRequestException, Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CostModelService } from '../cost-model/cost-model.service';
import type { CloudProvider } from '../cost-model/cost-record.types';
import { AwsCurIngestionAdapter } from './adapters/aws-cur-ingestion.adapter';
import { AzureCostManagementAdapter } from './adapters/azure-cost-management.adapter';
import { GcpBillingExportAdapter } from './adapters/gcp-billing-export.adapter';
import type { CostIngestionAdapter } from './cost-ingestion-adapter';

@Injectable()
export class IngestionService {
  private readonly adapters: Record<CloudProvider, CostIngestionAdapter> = {
    aws: new AwsCurIngestionAdapter(),
    azure: new AzureCostManagementAdapter(),
    gcp: new GcpBillingExportAdapter()
  };

  constructor(private readonly costModel: CostModelService) {}

  async createBatch(input: { provider: CloudProvider; sourceUri: string; idempotencyKey: string }) {
    const adapter = this.adapters[input.provider];
    const sourcePath = resolve(process.cwd(), '..', input.sourceUri);

    try {
      const raw = readFileSync(sourcePath, 'utf8');
      const rows = adapter.parse(raw, input.idempotencyKey);
      return await this.costModel.saveIngestion({ ...input, rows });
    } catch (error) {
      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  getBatch(id: string) {
    return this.costModel.getBatch(id);
  }
}
