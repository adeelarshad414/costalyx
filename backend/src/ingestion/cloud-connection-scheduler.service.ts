import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CloudConnection } from '../governance/governance.types';
import { GovernanceService } from '../governance/governance.service';
import type { AuthenticatedUser } from '../security/token-verifier';
import { IngestionService } from './ingestion.service';

export interface CloudConnectionSchedulerResult {
  scanned: number;
  validated: number;
  ingested: number;
  failed: number;
}

export interface CloudConnectionSchedulerRunOptions {
  now?: () => string;
}

@Injectable()
export class CloudConnectionSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CloudConnectionSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly governance: GovernanceService,
    private readonly ingestion: IngestionService,
    private readonly config: ConfigService
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('COSTALYX_CLOUD_SCHEDULER_ENABLED') !== 'enabled') {
      return;
    }
    const intervalMs = this.intervalMs();
    this.timer = setInterval(() => {
      void this.runOnce().catch((error) => {
        this.logger.error(`Cloud connection scheduler pass failed: ${redactError(error)}`);
      });
    }, intervalMs);
    this.timer.unref?.();
    this.logger.log(`Cloud connection scheduler enabled with interval ${intervalMs}ms`);
    void this.runOnce().catch((error) => {
      this.logger.error(`Initial cloud connection scheduler pass failed: ${redactError(error)}`);
    });
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runOnce(options: CloudConnectionSchedulerRunOptions = {}): Promise<CloudConnectionSchedulerResult> {
    if (this.running) {
      return { scanned: 0, validated: 0, ingested: 0, failed: 0 };
    }
    this.running = true;
    const now = options.now ?? (() => new Date().toISOString());
    const result: CloudConnectionSchedulerResult = { scanned: 0, validated: 0, ingested: 0, failed: 0 };
    try {
      const connections = await this.governance.listCloudConnectionsForScheduler();
      for (const connection of connections) {
        result.scanned += 1;
        try {
          const actor = schedulerActor(connection.tenantId);
          const runStartedAt = now();
          const validationSucceeded = await this.validateConnection(connection, actor, runStartedAt);
          if (validationSucceeded) {
            result.validated += 1;
          } else {
            result.failed += 1;
          }
          if (this.ingestionEnabled() && connection.billingExportUri) {
            const ingestionSucceeded = await this.ingestConnection(connection, actor, runStartedAt);
            if (ingestionSucceeded) {
              result.ingested += 1;
            } else {
              result.failed += 1;
            }
          }
        } catch (error) {
          result.failed += 1;
          this.logger.warn(`Cloud connection scheduler skipped ${connection.id}: ${redactError(error)}`);
        }
      }
      return result;
    } finally {
      this.running = false;
    }
  }

  private async validateConnection(
    connection: CloudConnection,
    actor: AuthenticatedUser,
    runStartedAt: string
  ): Promise<boolean> {
    try {
      await this.governance.validateCloudConnection(
        connection.id,
        actor,
        `scheduler-validation-${connection.id}-${runStartedAt}`
      );
      return true;
    } catch (error) {
      const completedAt = runStartedAt;
      await this.governance.recordCloudConnectionRun(
        {
          cloudConnectionId: connection.id,
          runType: 'validation',
          status: 'failed',
          startedAt: runStartedAt,
          completedAt,
          evidence: {
            provider: connection.provider,
            code: 'scheduler_validation_failed',
            message: redactError(error)
          }
        },
        actor
      );
      return false;
    }
  }

  private async ingestConnection(connection: CloudConnection, actor: AuthenticatedUser, runStartedAt: string): Promise<boolean> {
    try {
      await this.ingestion.createBatch({
        tenantId: connection.tenantId,
        provider: connection.provider,
        cloudConnectionId: connection.id,
        sourceUri: connection.billingExportUri!,
        idempotencyKey: `scheduler-ingestion-${connection.id}-${runStartedAt}`,
        actor
      });
      return true;
    } catch (error) {
      this.logger.warn(`Cloud connection ingestion failed for ${connection.id}: ${redactError(error)}`);
      return false;
    }
  }

  private ingestionEnabled(): boolean {
    return this.config.get<string>('COSTALYX_CLOUD_SCHEDULER_INGESTION_ENABLED') === 'enabled';
  }

  private intervalMs(): number {
    const configured = Number(this.config.get<string>('COSTALYX_CLOUD_SCHEDULER_INTERVAL_MS'));
    if (Number.isFinite(configured) && configured >= 60000) {
      return configured;
    }
    return 900000;
  }
}

function schedulerActor(tenantId: string): AuthenticatedUser {
  return {
    subject: 'costalyx-cloud-scheduler',
    role: 'admin',
    tenantId
  };
}

function redactError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/(secret|token|password|credential|access[_ -]?key|private[_ -]?key)/i.test(message)) {
    return '[redacted]';
  }
  return message.slice(0, 300);
}
