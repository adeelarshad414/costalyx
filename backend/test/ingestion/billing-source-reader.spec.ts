import { gzipSync } from 'node:zlib';
import {
  DefaultBillingSourceReader,
  type AwsS3BillingSourceClient,
  type AzureBlobBillingSourceClient,
  type GcpBigQueryBillingSourceClient
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

const azureConnection: CloudConnection = {
  ...connection,
  provider: 'azure',
  externalTenantId: '11111111-1111-4111-8111-111111111111',
  accessMode: 'azure_delegated_app',
  readOnlyPrincipal: '22222222-2222-4222-8222-222222222222',
  billingExportUri: 'https://costalyxexports.blob.core.windows.net/billing/exports/',
  lastValidationCode: 'azure_probe_passed',
  lastValidationMessage: 'Azure Cost Management and Blob export read probes passed.'
};

const gcpConnection: CloudConnection = {
  ...connection,
  provider: 'gcp',
  externalTenantId: 'billingAccounts/gcp-billing-001',
  accessMode: 'gcp_workload_identity',
  readOnlyPrincipal: 'projects/123456789/locations/global/workloadIdentityPools/costalyx/providers/billing',
  billingExportUri: 'bigquery://billing-project.billing_export.gcp_billing_export_v1',
  lastValidationCode: 'gcp_probe_passed',
  lastValidationMessage: 'GCP Workload Identity and BigQuery billing export probes passed.'
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

  it('loads the newest Azure Cost Management CSV object from the registered Blob export prefix', async () => {
    const rawCsv = 'SubscriptionId,ResourceId\nsub-prod-001,/subscriptions/sub-prod-001/resourceGroups/rg-prod\n';
    const azureClient: AzureBlobBillingSourceClient = {
      listObjects: jest.fn(async () => [
        { name: 'exports/2026-06/export.csv', lastModified: new Date('2026-06-30T00:00:00.000Z'), contentLength: 10 },
        { name: 'exports/2026-07/export.csv.gz', lastModified: new Date('2026-07-05T00:00:00.000Z'), contentLength: 10 },
        { name: 'exports/manifest.json', lastModified: new Date('2026-07-06T00:00:00.000Z'), contentLength: 10 }
      ]),
      getObject: jest.fn(async () => ({
        body: gzipSync(Buffer.from(rawCsv, 'utf8')),
        contentEncoding: 'gzip'
      }))
    };
    const reader = new DefaultBillingSourceReader(undefined, azureClient);

    await expect(
      reader.read({
        provider: 'azure',
        sourceUri: 'https://costalyxexports.blob.core.windows.net/billing/exports/',
        cloudConnection: azureConnection
      })
    ).resolves.toEqual({
      raw: rawCsv,
      resolvedSourceUri: 'https://costalyxexports.blob.core.windows.net/billing/exports/2026-07/export.csv.gz'
    });

    expect(azureClient.listObjects).toHaveBeenCalledWith({
      accountName: 'costalyxexports',
      containerName: 'billing',
      prefix: 'exports/',
      accountUrl: 'https://costalyxexports.blob.core.windows.net'
    });
    expect(azureClient.getObject).toHaveBeenCalledWith({
      accountName: 'costalyxexports',
      containerName: 'billing',
      prefix: 'exports/',
      accountUrl: 'https://costalyxexports.blob.core.windows.net',
      blobName: 'exports/2026-07/export.csv.gz'
    });
  });

  it('converts GCP BigQuery billing export rows into the adapter CSV contract', async () => {
    const gcpClient: GcpBigQueryBillingSourceClient = {
      queryRows: jest.fn(async () => [
        {
          billing_account_id: 'gcp-billing-001',
          project_id: 'project-prod-001',
          resource_name: '//compute.googleapis.com/projects/project-prod-001/zones/us-central1-a/instances/vm-prod-001',
          service_description: 'Compute Engine',
          sku_description: 'N1 Instance Core',
          pricing_type: 'OnDemand',
          transaction_type: 'Usage',
          hourly_rate_usd: '0.04750000',
          usage_hours: '4.0000',
          usage_start_time: '2026-06-01T00:00:00Z',
          usage_end_time: '2026-06-01T04:00:00Z'
        }
      ])
    };
    const reader = new DefaultBillingSourceReader(undefined, undefined, gcpClient);

    await expect(
      reader.read({
        provider: 'gcp',
        sourceUri: 'bigquery://billing-project.billing_export.gcp_billing_export_v1',
        cloudConnection: gcpConnection,
        env: { COSTALYX_GCP_BIGQUERY_LOCATION: 'US' }
      })
    ).resolves.toEqual({
      raw:
        'billing_account_id,project_id,resource_name,service_description,sku_description,pricing_type,transaction_type,hourly_rate_usd,usage_hours,usage_start_time,usage_end_time\n' +
        'gcp-billing-001,project-prod-001,//compute.googleapis.com/projects/project-prod-001/zones/us-central1-a/instances/vm-prod-001,Compute Engine,N1 Instance Core,OnDemand,Usage,0.04750000,4.0000,2026-06-01T00:00:00Z,2026-06-01T04:00:00Z',
      resolvedSourceUri: 'bigquery://billing-project.billing_export.gcp_billing_export_v1'
    });

    expect(gcpClient.queryRows).toHaveBeenCalledWith({
      projectId: 'billing-project',
      datasetId: 'billing_export',
      tableId: 'gcp_billing_export_v1',
      location: 'US',
      maxRows: 5000
    });
  });
});
