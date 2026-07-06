import { gzipSync } from 'node:zlib';
import {
  DefaultBillingSourceReader,
  type AwsS3BillingSourceClient
} from '../../src/ingestion/billing-source-reader';
import type { CloudConnection } from '../../src/governance/governance.types';

const connection: CloudConnection = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  externalId: 'costalyx:22222222-2222-4222-8222-222222222222:11111111-1111-4111-8111-111111111111',
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

describe('DefaultBillingSourceReader', () => {
  it('assumes the registered AWS role and loads the newest CUR CSV object from S3', async () => {
    const rawCsv = 'lineItem/UsageType,lineItem/LineItemType\nBoxUsage:m7g.large,Usage\n';
    const credentials = {
      accessKeyId: 'AKIAFAKE',
      secretAccessKey: 'fake-secret',
      sessionToken: 'fake-session',
      accountId: connection.externalTenantId
    };
    const awsClient: AwsS3BillingSourceClient = {
      assumeRole: jest.fn(async () => credentials),
      listObjects: jest.fn(async () => [
        { key: 'costalyx/2026-06/cur.csv.gz', lastModified: new Date('2026-06-30T00:00:00.000Z'), size: 10 },
        { key: 'costalyx/2026-07/cur.csv.gz', lastModified: new Date('2026-07-05T00:00:00.000Z'), size: 10 },
        { key: 'costalyx/2026-07/manifest.json', lastModified: new Date('2026-07-06T00:00:00.000Z'), size: 10 }
      ]),
      getObject: jest.fn(async () => ({
        body: gzipSync(Buffer.from(rawCsv, 'utf8')),
        contentEncoding: 'gzip'
      }))
    };
    const reader = new DefaultBillingSourceReader(awsClient);

    await expect(
      reader.read({
        provider: 'aws',
        sourceUri: 's3://customer-cur/costalyx/',
        cloudConnection: connection,
        env: { COSTALYX_AWS_INGESTION_REGION: 'us-west-2' }
      })
    ).resolves.toEqual({
      raw: rawCsv,
      resolvedSourceUri: 's3://customer-cur/costalyx/2026-07/cur.csv.gz'
    });

    expect(awsClient.assumeRole).toHaveBeenCalledWith({
      roleArn: connection.readOnlyPrincipal,
      externalId: `costalyx:${connection.tenantId}:${connection.id}`,
      sessionName: 'costalyx-ingest-11111111111141118',
      region: 'us-west-2'
    });
    expect(awsClient.listObjects).toHaveBeenCalledWith({
      bucket: 'customer-cur',
      prefix: 'costalyx/',
      region: 'us-west-2',
      credentials
    });
    expect(awsClient.getObject).toHaveBeenCalledWith({
      bucket: 'customer-cur',
      key: 'costalyx/2026-07/cur.csv.gz',
      region: 'us-west-2',
      credentials
    });
  });

  it('rejects S3 sources outside the registered billing export prefix', async () => {
    const awsClient: AwsS3BillingSourceClient = {
      assumeRole: jest.fn(),
      listObjects: jest.fn(),
      getObject: jest.fn()
    };
    const reader = new DefaultBillingSourceReader(awsClient);

    await expect(
      reader.read({
        provider: 'aws',
        sourceUri: 's3://customer-cur/other-prefix/cur.csv',
        cloudConnection: connection
      })
    ).rejects.toThrow('registered billing export prefix');

    expect(awsClient.assumeRole).not.toHaveBeenCalled();
    expect(awsClient.getObject).not.toHaveBeenCalled();
  });
});
