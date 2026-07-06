import {
  buildCloudConnectionExternalId,
  parseAzureBlobUri,
  parseBigQueryUri,
  parseS3Uri,
  probeCloudConnection,
  type AzureProbeClient,
  type AwsProbeClient,
  type GcpProbeClient
} from '../../src/governance/cloud-connection-probe';
import type { CloudConnection } from '../../src/governance/governance.types';

const connection: CloudConnection = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: '00000000-0000-4000-8000-000000000001',
  externalId: 'costalyx:00000000-0000-4000-8000-000000000001:11111111-1111-4111-8111-111111111111',
  provider: 'aws',
  displayName: 'AWS production payer',
  externalTenantId: '123456789012',
  accessMode: 'aws_assume_role',
  readOnlyPrincipal: 'arn:aws:iam::123456789012:role/CostalyxReadOnlyBilling',
  billingExportUri: 's3://customer-cur/costalyx/',
  status: 'pending_validation',
  lastValidatedAt: null,
  lastValidationAttemptedAt: null,
  lastValidationCode: null,
  lastValidationMessage: null,
  createdAt: '2026-07-06T00:00:00.000Z'
};

const azureConnection: CloudConnection = {
  ...connection,
  id: '22222222-2222-4222-8222-222222222222',
  externalId: 'costalyx:00000000-0000-4000-8000-000000000001:22222222-2222-4222-8222-222222222222',
  provider: 'azure',
  displayName: 'Azure production subscription',
  externalTenantId: '33333333-3333-4333-8333-333333333333',
  accessMode: 'azure_delegated_app',
  readOnlyPrincipal: '44444444-4444-4444-8444-444444444444',
  billingExportUri: 'https://costalyxexports.blob.core.windows.net/billing/exports/'
};

const gcpConnection: CloudConnection = {
  ...connection,
  id: '33333333-3333-4333-8333-333333333333',
  externalId: 'costalyx:00000000-0000-4000-8000-000000000001:33333333-3333-4333-8333-333333333333',
  provider: 'gcp',
  displayName: 'GCP billing export',
  externalTenantId: 'billingAccounts/123456-ABCDEF-123456',
  accessMode: 'gcp_workload_identity',
  readOnlyPrincipal: 'projects/123456789/locations/global/workloadIdentityPools/costalyx/providers/billing',
  billingExportUri: 'bigquery://billing-project.billing_export.gcp_billing_export_v1'
};

describe('cloud connection probes', () => {
  it('generates the tenant-scoped AWS external ID customers put in the role trust policy', () => {
    expect(buildCloudConnectionExternalId(connection)).toBe(connection.externalId);
  });

  it('parses S3 billing export URIs without accepting non-S3 locations', () => {
    expect(parseS3Uri('s3://customer-cur/costalyx/')).toEqual({ bucket: 'customer-cur', prefix: 'costalyx/' });
    expect(parseS3Uri('https://example.test/costalyx/')).toBeNull();
  });

  it('parses unsigned Azure Blob export URIs without accepting SAS query material', () => {
    expect(parseAzureBlobUri('https://costalyxexports.blob.core.windows.net/billing/exports/')).toEqual({
      accountName: 'costalyxexports',
      accountUrl: 'https://costalyxexports.blob.core.windows.net',
      containerName: 'billing',
      prefix: 'exports'
    });
    expect(parseAzureBlobUri('https://costalyxexports.blob.core.windows.net/billing/exports/?sig=secret')).toBeNull();
  });

  it('parses BigQuery billing export URIs without accepting query credentials', () => {
    expect(parseBigQueryUri('bigquery://billing-project.billing_export.gcp_billing_export_v1')).toEqual({
      projectId: 'billing-project',
      datasetId: 'billing_export',
      tableId: 'gcp_billing_export_v1'
    });
    expect(parseBigQueryUri('bigquery://billing-project/billing_export/gcp_billing_export_v1?token=secret')).toBeNull();
    expect(parseBigQueryUri('bigquery://billing-project.billing_export.gcp_billing_export_v1`')).toBeNull();
  });

  it('does not mark a structurally valid AWS connection as live validated when probes are disabled', async () => {
    const result = await probeCloudConnection(connection, {
      env: {},
      now: () => '2026-07-06T00:00:00.000Z'
    });

    expect(result).toEqual({
      status: 'ready_for_live_probe',
      code: 'live_probes_disabled',
      message:
        'Structural validation passed. Set COSTALYX_LIVE_CLOUD_PROBES=enabled in the Costalyx runtime to run AWS live provider probes.',
      attemptedAt: '2026-07-06T00:00:00.000Z',
      validatedAt: null
    });
  });

  it('passes AWS validation only after AssumeRole and CUR S3 read probes succeed', async () => {
    const calls: string[] = [];
    const awsClient: AwsProbeClient = {
      async assumeRole(input) {
        calls.push(`${input.roleArn}:${input.externalId}`);
        return {
          accessKeyId: 'access-key',
          secretAccessKey: 'secret-key',
          sessionToken: 'session-token',
          accountId: '123456789012'
        };
      },
      async listBillingExport(input) {
        calls.push(`${input.bucket}/${input.prefix}`);
        return { objectCount: 1 };
      }
    };

    const result = await probeCloudConnection(connection, {
      env: { COSTALYX_LIVE_CLOUD_PROBES: 'enabled', AWS_REGION: 'us-east-1' },
      now: () => '2026-07-06T00:00:00.000Z',
      awsClient
    });

    expect(result.status).toBe('validated');
    expect(result.code).toBe('aws_probe_passed');
    expect(result.validatedAt).toBe('2026-07-06T00:00:00.000Z');
    expect(calls).toEqual([
      'arn:aws:iam::123456789012:role/CostalyxReadOnlyBilling:costalyx:00000000-0000-4000-8000-000000000001:11111111-1111-4111-8111-111111111111',
      'customer-cur/costalyx/'
    ]);
  });

  it('fails AWS validation when the assumed role belongs to a different account', async () => {
    const awsClient: AwsProbeClient = {
      async assumeRole() {
        return {
          accessKeyId: 'access-key',
          secretAccessKey: 'secret-key',
          sessionToken: 'session-token',
          accountId: '999999999999'
        };
      },
      async listBillingExport() {
        throw new Error('must not read S3 after account mismatch');
      }
    };

    const result = await probeCloudConnection(connection, {
      env: { COSTALYX_LIVE_CLOUD_PROBES: 'enabled', AWS_REGION: 'us-east-1' },
      now: () => '2026-07-06T00:00:00.000Z',
      awsClient
    });

    expect(result.status).toBe('validation_failed');
    expect(result.code).toBe('aws_account_mismatch');
  });

  it('passes Azure validation only after Cost Management and Blob export probes succeed', async () => {
    const calls: string[] = [];
    const azureClient: AzureProbeClient = {
      async checkCostManagementAccess(input) {
        calls.push(input.scope);
      },
      async listBillingExport(input) {
        calls.push(`${input.accountName}/${input.containerName}/${input.prefix}`);
        return { objectCount: 1 };
      }
    };

    const result = await probeCloudConnection(azureConnection, {
      env: { COSTALYX_LIVE_CLOUD_PROBES: 'enabled' },
      now: () => '2026-07-06T00:00:00.000Z',
      azureClient
    });

    expect(result.status).toBe('validated');
    expect(result.code).toBe('azure_probe_passed');
    expect(calls).toEqual([
      '/subscriptions/33333333-3333-4333-8333-333333333333',
      'costalyxexports/billing/exports'
    ]);
  });

  it('fails Azure validation when the Blob export reference is missing or not readable', async () => {
    const missingExport = await probeCloudConnection({ ...azureConnection, billingExportUri: null }, {
      env: { COSTALYX_LIVE_CLOUD_PROBES: 'enabled' },
      now: () => '2026-07-06T00:00:00.000Z'
    });
    expect(missingExport.status).toBe('validation_failed');
    expect(missingExport.code).toBe('azure_billing_export_required');

    const emptyExport = await probeCloudConnection(azureConnection, {
      env: { COSTALYX_LIVE_CLOUD_PROBES: 'enabled' },
      now: () => '2026-07-06T00:00:00.000Z',
      azureClient: {
        async checkCostManagementAccess() {},
        async listBillingExport() {
          return { objectCount: 0 };
        }
      }
    });
    expect(emptyExport.status).toBe('validation_failed');
    expect(emptyExport.code).toBe('azure_billing_export_empty');
  });

  it('passes GCP validation only after the BigQuery billing export probe succeeds', async () => {
    const calls: string[] = [];
    const gcpClient: GcpProbeClient = {
      async queryBillingExport(input) {
        calls.push(`${input.projectId}.${input.datasetId}.${input.tableId}`);
        return { rowCount: 1 };
      }
    };

    const result = await probeCloudConnection(gcpConnection, {
      env: { COSTALYX_LIVE_CLOUD_PROBES: 'enabled' },
      now: () => '2026-07-06T00:00:00.000Z',
      gcpClient
    });

    expect(result.status).toBe('validated');
    expect(result.code).toBe('gcp_probe_passed');
    expect(calls).toEqual(['billing-project.billing_export.gcp_billing_export_v1']);
  });

  it('fails GCP validation when the BigQuery export is missing or empty', async () => {
    const missingExport = await probeCloudConnection({ ...gcpConnection, billingExportUri: null }, {
      env: { COSTALYX_LIVE_CLOUD_PROBES: 'enabled' },
      now: () => '2026-07-06T00:00:00.000Z'
    });
    expect(missingExport.status).toBe('validation_failed');
    expect(missingExport.code).toBe('gcp_billing_export_required');

    const emptyExport = await probeCloudConnection(gcpConnection, {
      env: { COSTALYX_LIVE_CLOUD_PROBES: 'enabled' },
      now: () => '2026-07-06T00:00:00.000Z',
      gcpClient: {
        async queryBillingExport() {
          return { rowCount: 0 };
        }
      }
    });
    expect(emptyExport.status).toBe('validation_failed');
    expect(emptyExport.code).toBe('gcp_billing_export_empty');
  });
});
