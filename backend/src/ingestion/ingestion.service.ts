import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { CostModelService } from '../cost-model/cost-model.service';
import type { CloudProvider, IngestionBatch } from '../cost-model/cost-record.types';
import { GovernanceService } from '../governance/governance.service';
import type { CloudConnection } from '../governance/governance.types';
import type { AuthenticatedUser } from '../security/token-verifier';
import { AwsCurIngestionAdapter } from './adapters/aws-cur-ingestion.adapter';
import { AzureCostManagementAdapter } from './adapters/azure-cost-management.adapter';
import { GcpBillingExportAdapter } from './adapters/gcp-billing-export.adapter';
import { BILLING_SOURCE_READER, DefaultBillingSourceReader, type BillingSourceReader } from './billing-source-reader';
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
    @Optional() private readonly governance?: GovernanceService,
    @Inject(BILLING_SOURCE_READER) private readonly sourceReader: BillingSourceReader = new DefaultBillingSourceReader()
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
    const startedAt = new Date().toISOString();
    let connection: CloudConnection | undefined;

    if (input.cloudConnectionId && input.actor && this.governance) {
      connection = await this.governance.getCloudConnection(input.cloudConnectionId, input.actor);
    }

    let batch: IngestionBatch;
    let resolvedSourceUri = input.sourceUri;
    try {
      const source = await this.sourceReader.read({
        provider: input.provider,
        sourceUri: input.sourceUri,
        cloudConnection: connection
      });
      resolvedSourceUri = source.resolvedSourceUri;
      const raw = source.raw;
      const rows = adapter.parse(raw, input.idempotencyKey);
      batch = await this.costModel.saveIngestion({ ...input, sourceUri: resolvedSourceUri, rows });
    } catch (error) {
      if (error instanceof Error) {
        const message = redactIngestionError(error);
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
                resolvedSourceUri,
                message
              }
            },
            input.actor
          );
        }
        throw new BadRequestException(message);
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
            resolvedSourceUri,
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

function redactIngestionError(error: Error): string {
  if (/(secret|token|password|credential|access[_ -]?key|private[_ -]?key)/i.test(error.message)) {
    return '[redacted]';
  }
  return error.message.slice(0, 300);
}
