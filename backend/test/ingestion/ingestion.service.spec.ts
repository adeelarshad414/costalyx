import { readFileSync } from 'node:fs';
import { CostModelService } from '../../src/cost-model/cost-model.service';
import { InMemoryCostModelRepository } from '../../src/cost-model/in-memory-cost-model.repository';
import type { CloudConnection } from '../../src/governance/governance.types';
import type { BillingSourceReader } from '../../src/ingestion/billing-source-reader';
import { IngestionService } from '../../src/ingestion/ingestion.service';
import { DEFAULT_TENANT_ID } from '../../src/security/token-verifier';

const cloudConnection: CloudConnection = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: DEFAULT_TENANT_ID,
  externalId: `costalyx:${DEFAULT_TENANT_ID}:11111111-1111-4111-8111-111111111111`,
  provider: 'aws',
  displayName: 'AWS production payer',
  externalTenantId: '123456789012',
  accessMode: 'aws_assume_role',
  readOnlyPrincipal: 'arn:aws:iam::123456789012:role/CostalyxReadOnlyBilling',
  billingExportUri: 's3://customer-cur/costalyx/',
  status: 'validated',
  lastValidatedAt: '2026-07-06T00:00:00.000Z',
  lastValidationAttemptedAt: '2026-07-06T00:00:00.000Z',
  lastValidationCode: 'aws_probe_passed',
  lastValidationMessage: 'AWS STS AssumeRole and CUR S3 read probes passed.',
  createdAt: '2026-07-06T00:00:00.000Z'
};

describe('IngestionService', () => {
  it('loads a fixture source URI through the provider adapter and persists normalized rows', async () => {
    const costModel = new CostModelService(new InMemoryCostModelRepository());
    const service = new IngestionService(costModel);

    const batch = await service.createBatch({
      tenantId: DEFAULT_TENANT_ID,
      provider: 'aws',
      sourceUri: 'backend/test/fixtures/aws-cur-sample.csv',
      idempotencyKey: 'service-fixture'
    });

    expect(batch.status).toBe('complete');
    expect(batch.ingestedRows).toBe(3);
    await expect(costModel.listRecords({ tenantId: DEFAULT_TENANT_ID, page: 1, pageSize: 25 })).resolves.toMatchObject({
      meta: { total: 3 }
    });
  });

  it('loads an AWS S3 CUR export through the registered cloud connection source reader', async () => {
    const raw = readFileSync(`${process.cwd()}/test/fixtures/aws-cur-sample.csv`, 'utf8');
    const costModel = new CostModelService(new InMemoryCostModelRepository());
    const governance = {
      getCloudConnection: jest.fn(async () => cloudConnection),
      recordCloudConnectionRun: jest.fn()
    };
    const sourceReader: BillingSourceReader = {
      read: jest.fn(async () => ({
        raw,
        resolvedSourceUri: 's3://customer-cur/costalyx/2026-07/cur.csv.gz'
      }))
    };
    const service = new IngestionService(costModel, governance as never, sourceReader);

    const batch = await service.createBatch({
      tenantId: DEFAULT_TENANT_ID,
      provider: 'aws',
      cloudConnectionId: cloudConnection.id,
      sourceUri: 's3://customer-cur/costalyx/',
      idempotencyKey: 'service-s3-cur',
      actor: { subject: 'admin-user', role: 'admin', tenantId: DEFAULT_TENANT_ID }
    });

    expect(batch.status).toBe('complete');
    expect(batch.sourceUri).toBe('s3://customer-cur/costalyx/2026-07/cur.csv.gz');
    expect(sourceReader.read).toHaveBeenCalledWith({
      provider: 'aws',
      sourceUri: 's3://customer-cur/costalyx/',
      cloudConnection
    });
    expect(governance.recordCloudConnectionRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runType: 'ingestion',
        status: 'succeeded',
        evidence: expect.objectContaining({
          provider: 'aws',
          sourceUri: 's3://customer-cur/costalyx/',
          resolvedSourceUri: 's3://customer-cur/costalyx/2026-07/cur.csv.gz',
          ingestedRows: 3,
          duplicateRows: 0
        })
      }),
      { subject: 'admin-user', role: 'admin', tenantId: DEFAULT_TENANT_ID }
    );
  });

  it('redacts secret-shaped source reader failures before recording run evidence', async () => {
    const costModel = new CostModelService(new InMemoryCostModelRepository());
    const governance = {
      getCloudConnection: jest.fn(async () => cloudConnection),
      recordCloudConnectionRun: jest.fn()
    };
    const sourceReader: BillingSourceReader = {
      read: jest.fn(async () => {
        throw new Error('AWS_SECRET_ACCESS_KEY=should-not-leak');
      })
    };
    const service = new IngestionService(costModel, governance as never, sourceReader);

    await expect(
      service.createBatch({
        tenantId: DEFAULT_TENANT_ID,
        provider: 'aws',
        cloudConnectionId: cloudConnection.id,
        sourceUri: 's3://customer-cur/costalyx/',
        idempotencyKey: 'service-s3-cur-failure',
        actor: { subject: 'admin-user', role: 'admin', tenantId: DEFAULT_TENANT_ID }
      })
    ).rejects.toThrow('[redacted]');

    expect(governance.recordCloudConnectionRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runType: 'ingestion',
        status: 'failed',
        evidence: expect.objectContaining({
          provider: 'aws',
          sourceUri: 's3://customer-cur/costalyx/',
          message: '[redacted]'
        })
      }),
      { subject: 'admin-user', role: 'admin', tenantId: DEFAULT_TENANT_ID }
    );
  });
});
