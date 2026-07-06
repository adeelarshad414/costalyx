import { CloudConnectionSchedulerService } from '../../src/ingestion/cloud-connection-scheduler.service';
import type { ConfigService } from '@nestjs/config';
import type { CloudConnection } from '../../src/governance/governance.types';
import type { GovernanceService } from '../../src/governance/governance.service';
import type { IngestionService } from '../../src/ingestion/ingestion.service';

const connection: CloudConnection = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  externalId: 'costalyx:22222222-2222-4222-8222-222222222222:11111111-1111-4111-8111-111111111111',
  provider: 'aws',
  displayName: 'AWS production payer',
  externalTenantId: '123456789012',
  accessMode: 'aws_assume_role',
  readOnlyPrincipal: 'arn:aws:iam::123456789012:role/CostalyxReadOnlyBilling',
  billingExportUri: 'backend/test/fixtures/aws-cur-sample.csv',
  status: 'ready_for_live_probe',
  lastValidatedAt: null,
  lastValidationAttemptedAt: null,
  lastValidationCode: null,
  lastValidationMessage: null,
  createdAt: '2026-07-06T00:00:00.000Z'
};

function createConfig(values: Record<string, string | undefined>) {
  return { get: jest.fn((key: string) => values[key]) };
}

describe('CloudConnectionSchedulerService', () => {
  it('validates every registered cloud connection with a tenant-scoped system actor', async () => {
    const governance = {
      listCloudConnectionsForScheduler: jest.fn(async () => [connection]),
      validateCloudConnection: jest.fn(async () => connection),
      recordCloudConnectionRun: jest.fn()
    };
    const ingestion = { createBatch: jest.fn() };
    const scheduler = new CloudConnectionSchedulerService(
      governance as unknown as GovernanceService,
      ingestion as unknown as IngestionService,
      createConfig({}) as unknown as ConfigService
    );

    await expect(scheduler.runOnce({ now: () => '2026-07-06T12:00:00.000Z' })).resolves.toEqual({
      scanned: 1,
      validated: 1,
      ingested: 0,
      failed: 0
    });

    expect(governance.validateCloudConnection).toHaveBeenCalledWith(
      connection.id,
      {
        subject: 'costalyx-cloud-scheduler',
        role: 'admin',
        tenantId: connection.tenantId
      },
      `scheduler-validation-${connection.id}-2026-07-06T12:00:00.000Z`
    );
    expect(ingestion.createBatch).not.toHaveBeenCalled();
  });

  it('can ingest the registered export URI when scheduled ingestion is explicitly enabled', async () => {
    const governance = {
      listCloudConnectionsForScheduler: jest.fn(async () => [connection]),
      validateCloudConnection: jest.fn(async () => connection),
      recordCloudConnectionRun: jest.fn()
    };
    const ingestion = { createBatch: jest.fn(async () => ({ id: 'batch-1', status: 'complete' })) };
    const scheduler = new CloudConnectionSchedulerService(
      governance as unknown as GovernanceService,
      ingestion as unknown as IngestionService,
      createConfig({ COSTALYX_CLOUD_SCHEDULER_INGESTION_ENABLED: 'enabled' }) as unknown as ConfigService
    );

    await expect(scheduler.runOnce({ now: () => '2026-07-06T12:05:00.000Z' })).resolves.toEqual({
      scanned: 1,
      validated: 1,
      ingested: 1,
      failed: 0
    });

    expect(ingestion.createBatch).toHaveBeenCalledWith({
      tenantId: connection.tenantId,
      provider: connection.provider,
      cloudConnectionId: connection.id,
      sourceUri: connection.billingExportUri,
      idempotencyKey: `scheduler-ingestion-${connection.id}-2026-07-06T12:05:00.000Z`,
      actor: {
        subject: 'costalyx-cloud-scheduler',
        role: 'admin',
        tenantId: connection.tenantId
      }
    });
  });

  it('records sanitized failed validation evidence when a scheduler pass cannot validate a connection', async () => {
    const governance = {
      listCloudConnectionsForScheduler: jest.fn(async () => [connection]),
      validateCloudConnection: jest.fn(async () => {
        throw new Error('AWS_SECRET_ACCESS_KEY=should-not-leak');
      }),
      recordCloudConnectionRun: jest.fn()
    };
    const ingestion = { createBatch: jest.fn() };
    const scheduler = new CloudConnectionSchedulerService(
      governance as unknown as GovernanceService,
      ingestion as unknown as IngestionService,
      createConfig({}) as unknown as ConfigService
    );

    await expect(scheduler.runOnce({ now: () => '2026-07-06T12:10:00.000Z' })).resolves.toEqual({
      scanned: 1,
      validated: 0,
      ingested: 0,
      failed: 1
    });

    expect(governance.recordCloudConnectionRun).toHaveBeenCalledWith(
      {
        cloudConnectionId: connection.id,
        runType: 'validation',
        status: 'failed',
        startedAt: '2026-07-06T12:10:00.000Z',
        completedAt: '2026-07-06T12:10:00.000Z',
        evidence: {
          provider: 'aws',
          code: 'scheduler_validation_failed',
          message: '[redacted]'
        }
      },
      {
        subject: 'costalyx-cloud-scheduler',
        role: 'admin',
        tenantId: connection.tenantId
      }
    );
  });

  it('continues scanning when one connection fails unexpectedly', async () => {
    const secondConnection: CloudConnection = {
      ...connection,
      id: '33333333-3333-4333-8333-333333333333',
      externalId: 'costalyx:22222222-2222-4222-8222-222222222222:33333333-3333-4333-8333-333333333333',
      displayName: 'AWS development payer'
    };
    const governance = {
      listCloudConnectionsForScheduler: jest.fn(async () => [connection, secondConnection]),
      validateCloudConnection: jest
        .fn()
        .mockRejectedValueOnce(new Error('AWS_SESSION_TOKEN=should-not-leak'))
        .mockResolvedValueOnce(secondConnection),
      recordCloudConnectionRun: jest.fn(async () => {
        throw new Error('database password should-not-leak');
      })
    };
    const ingestion = { createBatch: jest.fn() };
    const scheduler = new CloudConnectionSchedulerService(
      governance as unknown as GovernanceService,
      ingestion as unknown as IngestionService,
      createConfig({}) as unknown as ConfigService
    );

    await expect(scheduler.runOnce({ now: () => '2026-07-06T12:15:00.000Z' })).resolves.toEqual({
      scanned: 2,
      validated: 1,
      ingested: 0,
      failed: 1
    });

    expect(governance.validateCloudConnection).toHaveBeenCalledTimes(2);
    expect(governance.validateCloudConnection).toHaveBeenLastCalledWith(
      secondConnection.id,
      {
        subject: 'costalyx-cloud-scheduler',
        role: 'admin',
        tenantId: secondConnection.tenantId
      },
      `scheduler-validation-${secondConnection.id}-2026-07-06T12:15:00.000Z`
    );
  });
});
