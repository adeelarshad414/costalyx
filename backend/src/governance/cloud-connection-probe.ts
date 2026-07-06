import {
  CostManagementClient,
  KnownExportType,
  KnownFunctionType,
  KnownTimeframeType
} from '@azure/arm-costmanagement';
import { DefaultAzureCredential, type TokenCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { AssumeRoleCommand, GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { BigQuery } from '@google-cloud/bigquery';
import { validateCloudConnectionShape } from './dto/cloud-connection.dto';
import type {
  CloudConnection,
  CloudConnectionStatus,
  CloudConnectionValidationCode,
  CloudConnectionValidationResult
} from './governance.types';

type Env = Record<string, string | undefined>;

export interface AzureBlobExportLocation {
  accountName: string;
  containerName: string;
  prefix: string;
  accountUrl: string;
}

export interface BigQueryExportLocation {
  projectId: string;
  datasetId: string;
  tableId: string;
}

export interface AwsProbeClient {
  assumeRole(input: {
    roleArn: string;
    externalId: string;
    sessionName: string;
  }): Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken: string; accountId: string }>;
  listBillingExport(input: {
    bucket: string;
    prefix: string;
    region: string;
    credentials: { accessKeyId: string; secretAccessKey: string; sessionToken: string };
  }): Promise<{ objectCount: number }>;
}

export interface AzureProbeClient {
  checkCostManagementAccess(input: { scope: string }): Promise<void>;
  listBillingExport(input: AzureBlobExportLocation): Promise<{ objectCount: number }>;
}

export interface GcpProbeClient {
  queryBillingExport(input: BigQueryExportLocation): Promise<{ rowCount: number }>;
}

export interface ProbeOptions {
  env?: Env;
  now?: () => string;
  awsClient?: AwsProbeClient;
  azureClient?: AzureProbeClient;
  gcpClient?: GcpProbeClient;
}

export function buildCloudConnectionExternalId(connection: Pick<CloudConnection, 'id' | 'tenantId'>): string {
  return `costalyx:${connection.tenantId}:${connection.id}`;
}

export async function probeCloudConnection(
  connection: CloudConnection,
  options: ProbeOptions = {}
): Promise<CloudConnectionValidationResult> {
  const now = options.now ?? (() => new Date().toISOString());
  const attemptedAt = now();
  const isWellFormed = validateCloudConnectionShape({
    provider: connection.provider,
    displayName: connection.displayName,
    externalTenantId: connection.externalTenantId,
    accessMode: connection.accessMode,
    readOnlyPrincipal: connection.readOnlyPrincipal,
    billingExportUri: connection.billingExportUri ?? undefined
  });

  if (!isWellFormed) {
    return result('validation_failed', 'shape_invalid', 'Connection shape does not match the selected provider.', attemptedAt);
  }

  const env = options.env ?? process.env;
  if (env.COSTALYX_LIVE_CLOUD_PROBES !== 'enabled') {
    return result(
      'ready_for_live_probe',
      'live_probes_disabled',
      `Structural validation passed. Set COSTALYX_LIVE_CLOUD_PROBES=enabled in the Costalyx runtime to run ${connection.provider.toUpperCase()} live provider probes.`,
      attemptedAt
    );
  }

  if (connection.provider === 'azure') {
    return probeAzureConnection(connection, options, attemptedAt);
  }

  if (connection.provider === 'gcp') {
    return probeGcpConnection(connection, options, attemptedAt);
  }

  const exportLocation = parseS3Uri(connection.billingExportUri);
  if (!exportLocation) {
    return result(
      'validation_failed',
      'aws_billing_export_required',
      'AWS validation requires a readable CUR S3 URI such as s3://bucket/prefix/.',
      attemptedAt
    );
  }

  const region = env.COSTALYX_AWS_PROBE_REGION ?? env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? 'us-east-1';
  const externalId = buildCloudConnectionExternalId(connection);
  const sessionName = `costalyx-${connection.id.replace(/-/g, '').slice(0, 24)}`;
  const awsClient = options.awsClient ?? new AwsSdkProbeClient(region);

  try {
    const credentials = await awsClient.assumeRole({
      roleArn: connection.readOnlyPrincipal,
      externalId,
      sessionName
    });
    if (credentials.accountId !== connection.externalTenantId) {
      return result(
        'validation_failed',
        'aws_account_mismatch',
        'AWS role account does not match the registered account ID.',
        attemptedAt
      );
    }
    const exportProbe = await awsClient.listBillingExport({
      ...exportLocation,
      region,
      credentials
    });
    if (exportProbe.objectCount < 1) {
      return result(
        'validation_failed',
        'aws_billing_export_empty',
        'AWS role was assumed, but the CUR S3 prefix did not return readable billing export objects.',
        attemptedAt
      );
    }
    return result('validated', 'aws_probe_passed', 'AWS STS AssumeRole and CUR S3 read probes passed.', attemptedAt, attemptedAt);
  } catch (error) {
    return result('validation_failed', 'aws_probe_failed', describeProbeFailure(error), attemptedAt);
  }
}

async function probeAzureConnection(
  connection: CloudConnection,
  options: ProbeOptions,
  attemptedAt: string
): Promise<CloudConnectionValidationResult> {
  const exportLocation = parseAzureBlobUri(connection.billingExportUri);
  if (!exportLocation) {
    return result(
      'validation_failed',
      'azure_billing_export_required',
      'Azure validation requires an unsigned Blob export URI such as https://account.blob.core.windows.net/container/prefix/.',
      attemptedAt
    );
  }

  const client = options.azureClient ?? new AzureSdkProbeClient();
  try {
    await client.checkCostManagementAccess({ scope: azureBillingScope(connection.externalTenantId) });
    const exportProbe = await client.listBillingExport(exportLocation);
    if (exportProbe.objectCount < 1) {
      return result(
        'validation_failed',
        'azure_billing_export_empty',
        'Azure Cost Management scope was readable, but the Blob export prefix did not return readable billing export objects.',
        attemptedAt
      );
    }
    return result(
      'validated',
      'azure_probe_passed',
      'Azure Cost Management and Blob export read probes passed.',
      attemptedAt,
      attemptedAt
    );
  } catch (error) {
    return result('validation_failed', 'azure_probe_failed', describeProviderFailure('Azure', error), attemptedAt);
  }
}

async function probeGcpConnection(
  connection: CloudConnection,
  options: ProbeOptions,
  attemptedAt: string
): Promise<CloudConnectionValidationResult> {
  const exportLocation = parseBigQueryUri(connection.billingExportUri);
  if (!exportLocation) {
    return result(
      'validation_failed',
      'gcp_billing_export_required',
      'GCP validation requires a BigQuery billing export URI such as bigquery://project.dataset.table.',
      attemptedAt
    );
  }

  const env = options.env ?? process.env;
  const client = options.gcpClient ?? new GcpBigQueryProbeClient(env.COSTALYX_GCP_BIGQUERY_LOCATION);
  try {
    const exportProbe = await client.queryBillingExport(exportLocation);
    if (exportProbe.rowCount < 1) {
      return result(
        'validation_failed',
        'gcp_billing_export_empty',
        'GCP credentials were accepted, but the BigQuery billing export table did not return readable rows.',
        attemptedAt
      );
    }
    return result(
      'validated',
      'gcp_probe_passed',
      'GCP Workload Identity and BigQuery billing export probes passed.',
      attemptedAt,
      attemptedAt
    );
  } catch (error) {
    return result('validation_failed', 'gcp_probe_failed', describeProviderFailure('GCP', error), attemptedAt);
  }
}

export function parseS3Uri(value: string | null): { bucket: string; prefix: string } | null {
  if (!value) {
    return null;
  }
  try {
    const uri = new URL(value);
    if (uri.protocol !== 's3:' || !uri.hostname) {
      return null;
    }
    return {
      bucket: uri.hostname,
      prefix: uri.pathname.replace(/^\/+/, '')
    };
  } catch {
    return null;
  }
}

export function parseAzureBlobUri(value: string | null): AzureBlobExportLocation | null {
  if (!value) {
    return null;
  }
  try {
    const uri = new URL(value);
    if (uri.protocol !== 'https:' || uri.search || !uri.hostname.endsWith('.blob.core.windows.net')) {
      return null;
    }
    const [containerName, ...prefixParts] = uri.pathname.replace(/^\/+/, '').split('/');
    if (!containerName) {
      return null;
    }
    return {
      accountName: uri.hostname.replace(/\.blob\.core\.windows\.net$/, ''),
      containerName,
      prefix: prefixParts.join('/'),
      accountUrl: `${uri.protocol}//${uri.hostname}`
    };
  } catch {
    return null;
  }
}

export function parseBigQueryUri(value: string | null): BigQueryExportLocation | null {
  if (!value) {
    return null;
  }
  try {
    const uri = new URL(value);
    if (uri.protocol !== 'bigquery:' || uri.search) {
      return null;
    }
    if (uri.pathname) {
      const [datasetId, tableId] = uri.pathname.replace(/^\/+/, '').split('/');
      return validBigQueryExportLocation(uri.hostname, datasetId, tableId)
        ? { projectId: uri.hostname, datasetId: datasetId!, tableId: tableId! }
        : null;
    }
    const [projectId, datasetId, tableId] = uri.hostname.split('.');
    return validBigQueryExportLocation(projectId, datasetId, tableId)
      ? { projectId: projectId!, datasetId: datasetId!, tableId: tableId! }
      : null;
  } catch {
    return null;
  }
}

function validBigQueryExportLocation(
  projectId: string | undefined,
  datasetId: string | undefined,
  tableId: string | undefined
): boolean {
  return Boolean(
    projectId &&
      datasetId &&
      tableId &&
      /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/i.test(projectId) &&
      /^[A-Za-z_][A-Za-z0-9_]{0,1023}$/.test(datasetId) &&
      /^[A-Za-z_][A-Za-z0-9_]{0,1023}$/.test(tableId)
  );
}

function azureBillingScope(value: string): string {
  if (value.startsWith('/subscriptions/') || value.startsWith('/providers/Microsoft.Management/managementGroups/')) {
    return value;
  }
  return `/subscriptions/${value}`;
}

function result(
  status: CloudConnectionStatus,
  code: CloudConnectionValidationCode,
  message: string,
  attemptedAt: string,
  validatedAt: string | null = null
): CloudConnectionValidationResult {
  return {
    status,
    code,
    message,
    attemptedAt,
    validatedAt
  };
}

function describeProbeFailure(error: unknown): string {
  const name = error instanceof Error && error.name ? error.name : 'CloudProviderProbeError';
  return `AWS live probe failed with ${name}. Check the read-only role trust policy, external ID, billing export URI, and Costalyx broker credentials.`;
}

function describeProviderFailure(provider: 'Azure' | 'GCP', error: unknown): string {
  const name = error instanceof Error && error.name ? error.name : 'CloudProviderProbeError';
  return `${provider} live probe failed with ${name}. Check the delegated identity, read-only IAM/RBAC grants, billing export URI, and Costalyx broker credentials.`;
}

class AwsSdkProbeClient implements AwsProbeClient {
  constructor(private readonly region: string) {}

  async assumeRole(input: {
    roleArn: string;
    externalId: string;
    sessionName: string;
  }): Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken: string; accountId: string }> {
    const sts = new STSClient({ region: this.region });
    const assumed = await sts.send(
      new AssumeRoleCommand({
        RoleArn: input.roleArn,
        ExternalId: input.externalId,
        RoleSessionName: input.sessionName,
        DurationSeconds: 900
      })
    );
    const credentials = assumed.Credentials;
    if (!credentials?.AccessKeyId || !credentials.SecretAccessKey || !credentials.SessionToken) {
      throw new Error('AssumeRoleMissingCredentials');
    }
    const caller = await new STSClient({
      region: this.region,
      credentials: {
        accessKeyId: credentials.AccessKeyId,
        secretAccessKey: credentials.SecretAccessKey,
        sessionToken: credentials.SessionToken
      }
    }).send(new GetCallerIdentityCommand({}));
    return {
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken,
      accountId: caller.Account ?? ''
    };
  }

  async listBillingExport(input: {
    bucket: string;
    prefix: string;
    region: string;
    credentials: { accessKeyId: string; secretAccessKey: string; sessionToken: string };
  }): Promise<{ objectCount: number }> {
    const s3 = new S3Client({ region: input.region, credentials: input.credentials });
    const result = await s3.send(
      new ListObjectsV2Command({
        Bucket: input.bucket,
        Prefix: input.prefix,
        MaxKeys: 1
      })
    );
    return { objectCount: result.KeyCount ?? result.Contents?.length ?? 0 };
  }
}

class AzureSdkProbeClient implements AzureProbeClient {
  constructor(private readonly credential: TokenCredential = new DefaultAzureCredential()) {}

  async checkCostManagementAccess(input: { scope: string }): Promise<void> {
    const client = new CostManagementClient(this.credential);
    await client.query.usage(input.scope, {
      type: KnownExportType.Usage,
      timeframe: KnownTimeframeType.MonthToDate,
      dataset: {
        aggregation: {
          totalCost: {
            name: 'PreTaxCost',
            function: KnownFunctionType.Sum
          }
        }
      }
    });
  }

  async listBillingExport(input: AzureBlobExportLocation): Promise<{ objectCount: number }> {
    const serviceClient = new BlobServiceClient(input.accountUrl, this.credential);
    const container = serviceClient.getContainerClient(input.containerName);
    let objectCount = 0;
    for await (const _blob of container.listBlobsFlat({ prefix: input.prefix || undefined })) {
      objectCount += 1;
      break;
    }
    return { objectCount };
  }
}

class GcpBigQueryProbeClient implements GcpProbeClient {
  constructor(private readonly location?: string) {}

  async queryBillingExport(input: BigQueryExportLocation): Promise<{ rowCount: number }> {
    const bigQuery = new BigQuery({ projectId: input.projectId });
    const [rows] = await bigQuery.query({
      query: `SELECT 1 FROM \`${input.projectId}.${input.datasetId}.${input.tableId}\` LIMIT 1`,
      location: this.location
    });
    return { rowCount: rows.length };
  }
}
