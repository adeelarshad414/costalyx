import { BadRequestException, Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CostModelService } from '../cost-model/cost-model.service';
import type { CloudProvider, IngestionBatch } from '../cost-model/cost-record.types';
import { GovernanceService } from '../governance/governance.service';
import type { AuthenticatedUser } from '../security/token-verifier';
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

  constructor(
    private readonly costModel: CostModelService,
    private readonly governance?: GovernanceService
  ) {}

  async createBatch(input: {
    tenantId: string;
    provider: CloudProvider;
    cloudConnectionId?: string;
    sourceUri: string;
    idempotencyKey: string;
    actor?: AuthenticatedUser;
  }) {
    const adapter = this.adapters[input.provider];
    const sourcePath = resolve(process.cwd(), '..', input.sourceUri);
    const startedAt = new Date().toISOString();

    if (input.cloudConnectionId && input.actor && this.governance) {
      await this.governance.getCloudConnection(input.cloudConnectionId, input.actor);
    }

    let batch: IngestionBatch;
    try {
      const raw = readFileSync(sourcePath, 'utf8');
      const rows = adapter.parse(raw, input.idempotencyKey);
      batch = await this.costModel.saveIngestion({ ...input, rows });
    } catch (error) {
      if (error instanceof Error) {
        if (input.cloudConnectionId && input.actor && this.governance) {
          await this.governance.recordCloudConnectionRun(
            {
              cloudConnectionId: input.cloudConnectionId,
              runType: 'ingestion',
              status: 'failed',
              startedAt,
              completedAt: new Date().toISOString(),
              evidence: {
                provider: input.provider,
                sourceUri: input.sourceUri,
                message: error.message
              }
            },
            input.actor
          );
        }
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    if (input.cloudConnectionId && input.actor && this.governance) {
      await this.governance.recordCloudConnectionRun(
        {
          cloudConnectionId: input.cloudConnectionId,
          runType: 'ingestion',
          status: 'succeeded',
          startedAt,
          completedAt: batch.completedAt ?? new Date().toISOString(),
          evidence: {
            provider: input.provider,
            sourceUri: input.sourceUri,
            batchId: batch.id,
            ingestedRows: batch.ingestedRows,
            duplicateRows: batch.duplicateRows
          }
        },
        input.actor
      );
    }
    return batch;
  }

  getBatch(id: string, tenantId: string) {
    return this.costModel.getBatch(id, tenantId);
  }
}
