import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { AssumeRoleCommand, GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { DefaultAzureCredential, type TokenCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';
import { BigQuery } from '@google-cloud/bigquery';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { CloudProvider } from '../cost-model/cost-record.types';
import {
  buildCloudConnectionExternalId,
  parseAzureBlobUri,
  parseBigQueryUri,
  parseS3Uri,
  type AzureBlobExportLocation,
  type BigQueryExportLocation
} from '../governance/cloud-connection-probe';
import type { CloudConnection } from '../governance/governance.types';

type Env = Record<string, string | undefined>;

export interface BillingSourceReadInput {
  provider: CloudProvider;
  sourceUri: string;
  cloudConnection?: CloudConnection;
  env?: Env;
}

export interface BillingSourcePayload {
  raw: string;
  resolvedSourceUri: string;
}

export interface BillingSourceReader {
  read(input: BillingSourceReadInput): Promise<BillingSourcePayload>;
}

export const BILLING_SOURCE_READER = Symbol('BILLING_SOURCE_READER');

interface AwsTemporaryCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  accountId: string;
}

export interface AwsS3BillingSourceClient {
  assumeRole(input: {
    roleArn: string;
    externalId: string;
    sessionName: string;
    region: string;
  }): Promise<AwsTemporaryCredentials>;
  listObjects(input: {
    bucket: string;
    prefix: string;
    region: string;
    credentials: AwsTemporaryCredentials;
  }): Promise<Array<{ key: string; lastModified?: Date; size?: number }>>;
  getObject(input: {
    bucket: string;
    key: string;
    region: string;
    credentials: AwsTemporaryCredentials;
  }): Promise<{ body: Uint8Array | string | unknown; contentEncoding?: string }>;
}

export interface AzureBlobBillingSourceClient {
  listObjects(input: AzureBlobExportLocation): Promise<Array<{ name: string; lastModified?: Date; contentLength?: number }>>;
  getObject(input: AzureBlobExportLocation & { blobName: string }): Promise<{ body: Uint8Array | string | unknown; contentEncoding?: string }>;
}

export interface GcpBigQueryBillingSourceClient {
  queryRows(input: BigQueryExportLocation & { location?: string; maxRows: number }): Promise<Array<Record<string, unknown>>>;
}

export interface GcpBillingExportSchema {
  hasResourceColumn: boolean;
}

export class DefaultBillingSourceReader implements BillingSourceReader {
  constructor(
    private readonly awsClient: AwsS3BillingSourceClient = new AwsSdkS3BillingSourceClient(),
    private readonly azureClient: AzureBlobBillingSourceClient = new AzureSdkBlobBillingSourceClient(),
    private readonly gcpClient: GcpBigQueryBillingSourceClient = new GcpSdkBigQueryBillingSourceClient()
  ) {}

  async read(input: BillingSourceReadInput): Promise<BillingSourcePayload> {
    const s3Location = parseS3Uri(input.sourceUri);
    if (s3Location) {
      return this.readAwsS3(input, s3Location);
    }

    const azureLocation = parseAzureBlobUri(input.sourceUri);
    if (azureLocation) {
      return this.readAzureBlob(input, azureLocation);
    }

    const gcpLocation = parseBigQueryUri(input.sourceUri);
    if (gcpLocation) {
      return this.readGcpBigQuery(input, gcpLocation);
    }

    return {
      raw: readFileSync(resolve(process.cwd(), '..', input.sourceUri), 'utf8'),
      resolvedSourceUri: input.sourceUri
    };
  }

  private async readAwsS3(
    input: BillingSourceReadInput,
    s3Location: { bucket: string; prefix: string }
  ): Promise<BillingSourcePayload> {
    if (input.provider !== 'aws') {
      throw new Error('S3 billing export ingestion is currently supported only for AWS CUR sources.');
    }
    if (!input.cloudConnection) {
      throw new Error('AWS S3 billing export ingestion requires a registered cloud connection.');
    }
    const registeredLocation = parseS3Uri(input.cloudConnection.billingExportUri);
    if (
      !registeredLocation ||
      registeredLocation.bucket !== s3Location.bucket ||
      !s3Location.prefix.startsWith(registeredLocation.prefix)
    ) {
      throw new Error('AWS S3 billing export ingestion must stay within the registered billing export prefix.');
    }

    const env = input.env ?? process.env;
    const region = env.COSTALYX_AWS_INGESTION_REGION ?? env.COSTALYX_AWS_PROBE_REGION ?? env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? 'us-east-1';
    const credentials = await this.awsClient.assumeRole({
      roleArn: input.cloudConnection.readOnlyPrincipal,
      externalId: buildCloudConnectionExternalId(input.cloudConnection),
      sessionName: `costalyx-ingest-${input.cloudConnection.id.replace(/-/g, '').slice(0, 17)}`,
      region
    });
    if (credentials.accountId !== input.cloudConnection.externalTenantId) {
      throw new Error('AWS role account does not match the registered account ID.');
    }

    const key = await this.resolveObjectKey({
      bucket: s3Location.bucket,
      prefix: s3Location.prefix,
      region,
      credentials
    });
    const object = await this.awsClient.getObject({
      bucket: s3Location.bucket,
      key,
      region,
      credentials
    });
    const raw = decodeObjectBody(await bodyToBuffer(object.body, 'AWS S3'), key, object.contentEncoding);
    return {
      raw,
      resolvedSourceUri: `s3://${s3Location.bucket}/${key}`
    };
  }

  private async readAzureBlob(
    input: BillingSourceReadInput,
    exportLocation: AzureBlobExportLocation
  ): Promise<BillingSourcePayload> {
    if (input.provider !== 'azure') {
      throw new Error('Azure Blob billing export ingestion is currently supported only for Azure sources.');
    }
    if (!input.cloudConnection) {
      throw new Error('Azure Blob billing export ingestion requires a registered cloud connection.');
    }
    const registeredLocation = parseAzureBlobUri(input.cloudConnection.billingExportUri);
    if (
      !registeredLocation ||
      registeredLocation.accountName !== exportLocation.accountName ||
      registeredLocation.containerName !== exportLocation.containerName ||
      !exportLocation.prefix.startsWith(registeredLocation.prefix)
    ) {
      throw new Error('Azure Blob billing export ingestion must stay within the registered billing export prefix.');
    }

    const blobName = await this.resolveAzureBlobName(exportLocation);
    const object = await this.azureClient.getObject({ ...exportLocation, blobName });
    const raw = decodeObjectBody(await bodyToBuffer(object.body, 'Azure Blob'), blobName, object.contentEncoding);
    return {
      raw,
      resolvedSourceUri: `${exportLocation.accountUrl}/${exportLocation.containerName}/${blobName}`
    };
  }

  private async readGcpBigQuery(
    input: BillingSourceReadInput,
    exportLocation: BigQueryExportLocation
  ): Promise<BillingSourcePayload> {
    if (input.provider !== 'gcp') {
      throw new Error('BigQuery billing export ingestion is currently supported only for GCP sources.');
    }
    if (!input.cloudConnection) {
      throw new Error('GCP BigQuery billing export ingestion requires a registered cloud connection.');
    }
    const registeredLocation = parseBigQueryUri(input.cloudConnection.billingExportUri);
    if (
      !registeredLocation ||
      registeredLocation.projectId !== exportLocation.projectId ||
      registeredLocation.datasetId !== exportLocation.datasetId ||
      registeredLocation.tableId !== exportLocation.tableId
    ) {
      throw new Error('GCP BigQuery billing export ingestion must use the registered billing export table.');
    }

    const env = input.env ?? process.env;
    const rows = await this.gcpClient.queryRows({
      ...exportLocation,
      location: env.COSTALYX_GCP_BIGQUERY_LOCATION,
      maxRows: 5000
    });
    if (rows.length === 0) {
      throw new Error('GCP BigQuery billing export table did not return readable billing rows.');
    }
    return {
      raw: recordsToCsv(rows, gcpBillingCsvHeaders),
      resolvedSourceUri: input.sourceUri
    };
  }

  private async resolveObjectKey(input: {
    bucket: string;
    prefix: string;
    region: string;
    credentials: AwsTemporaryCredentials;
  }): Promise<string> {
    if (isDirectCsvObject(input.prefix)) {
      return input.prefix;
    }

    const objects = await this.awsClient.listObjects(input);
    const candidates = objects
      .filter((object) => object.key && isDirectCsvObject(object.key) && object.size !== 0)
      .sort((a, b) => {
        const modifiedDelta = (b.lastModified?.getTime() ?? 0) - (a.lastModified?.getTime() ?? 0);
        return modifiedDelta || a.key.localeCompare(b.key);
      });
    const selected = candidates[0];
    if (!selected) {
      throw new Error('AWS S3 billing export prefix did not contain readable CSV or CSV.GZ CUR objects.');
    }
    return selected.key;
  }

  private async resolveAzureBlobName(input: AzureBlobExportLocation): Promise<string> {
    if (isDirectCsvObject(input.prefix)) {
      return input.prefix;
    }

    const objects = await this.azureClient.listObjects(input);
    const candidates = objects
      .filter((object) => object.name && isDirectCsvObject(object.name) && object.contentLength !== 0)
      .sort((a, b) => {
        const modifiedDelta = (b.lastModified?.getTime() ?? 0) - (a.lastModified?.getTime() ?? 0);
        return modifiedDelta || a.name.localeCompare(b.name);
      });
    const selected = candidates[0];
    if (!selected) {
      throw new Error('Azure Blob billing export prefix did not contain readable CSV or CSV.GZ export objects.');
    }
    return selected.name;
  }
}

function isDirectCsvObject(key: string): boolean {
  return /\.(csv|csv\.gz)$/i.test(key) && !key.endsWith('/');
}

function decodeObjectBody(buffer: Buffer, key: string, contentEncoding?: string): string {
  if (/gzip/i.test(contentEncoding ?? '') || /\.gz$/i.test(key)) {
    return gunzipSync(buffer).toString('utf8');
  }
  return buffer.toString('utf8');
}

async function bodyToBuffer(body: unknown, sourceLabel: string): Promise<Buffer> {
  if (typeof body === 'string') {
    return Buffer.from(body, 'utf8');
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  const byteArrayBody = body as { transformToByteArray?: () => Promise<Uint8Array> } | null;
  if (byteArrayBody?.transformToByteArray) {
    return Buffer.from(await byteArrayBody.transformToByteArray());
  }
  const streamBody = body as NodeJS.ReadableStream | null;
  if (streamBody?.on) {
    return new Promise((resolveBuffer, reject) => {
      const chunks: Buffer[] = [];
      streamBody.on('data', (chunk: Buffer | string | Uint8Array) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      streamBody.on('error', reject);
      streamBody.on('end', () => resolveBuffer(Buffer.concat(chunks)));
    });
  }
  throw new Error(`${sourceLabel} billing export object returned an unreadable body.`);
}

const gcpBillingCsvHeaders = [
  'billing_account_id',
  'project_id',
  'resource_name',
  'service_description',
  'sku_description',
  'pricing_type',
  'transaction_type',
  'hourly_rate_usd',
  'usage_hours',
  'usage_start_time',
  'usage_end_time'
];

function recordsToCsv(rows: Array<Record<string, unknown>>, headers: string[]): string {
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(','))
  ].join('\n');
}

function csvValue(value: unknown): string {
  const stringValue = value instanceof Date ? value.toISOString() : value == null ? '' : String(value);
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

class AwsSdkS3BillingSourceClient implements AwsS3BillingSourceClient {
  async assumeRole(input: {
    roleArn: string;
    externalId: string;
    sessionName: string;
    region: string;
  }): Promise<AwsTemporaryCredentials> {
    const sts = new STSClient({ region: input.region });
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
    const scopedCredentials = {
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken
    };
    const caller = await new STSClient({ region: input.region, credentials: scopedCredentials }).send(
      new GetCallerIdentityCommand({})
    );
    return {
      ...scopedCredentials,
      accountId: caller.Account ?? ''
    };
  }

  async listObjects(input: {
    bucket: string;
    prefix: string;
    region: string;
    credentials: AwsTemporaryCredentials;
  }): Promise<Array<{ key: string; lastModified?: Date; size?: number }>> {
    const s3 = new S3Client({ region: input.region, credentials: input.credentials });
    const result = await s3.send(
      new ListObjectsV2Command({
        Bucket: input.bucket,
        Prefix: input.prefix,
        MaxKeys: 50
      })
    );
    return (result.Contents ?? []).map((object) => ({
      key: object.Key ?? '',
      lastModified: object.LastModified,
      size: object.Size
    }));
  }

  async getObject(input: {
    bucket: string;
    key: string;
    region: string;
    credentials: AwsTemporaryCredentials;
  }): Promise<{ body: unknown; contentEncoding?: string }> {
    const s3 = new S3Client({ region: input.region, credentials: input.credentials });
    const result = await s3.send(new GetObjectCommand({ Bucket: input.bucket, Key: input.key }));
    return { body: result.Body, contentEncoding: result.ContentEncoding };
  }
}

class AzureSdkBlobBillingSourceClient implements AzureBlobBillingSourceClient {
  constructor(private readonly credential: TokenCredential = new DefaultAzureCredential()) {}

  async listObjects(input: AzureBlobExportLocation): Promise<Array<{ name: string; lastModified?: Date; contentLength?: number }>> {
    const container = new BlobServiceClient(input.accountUrl, this.credential).getContainerClient(input.containerName);
    const objects: Array<{ name: string; lastModified?: Date; contentLength?: number }> = [];
    for await (const blob of container.listBlobsFlat({ prefix: input.prefix || undefined })) {
      objects.push({
        name: blob.name,
        lastModified: blob.properties.lastModified,
        contentLength: blob.properties.contentLength
      });
      if (objects.length >= 50) {
        break;
      }
    }
    return objects;
  }

  async getObject(input: AzureBlobExportLocation & { blobName: string }): Promise<{ body: Uint8Array; contentEncoding?: string }> {
    const blob = new BlobServiceClient(input.accountUrl, this.credential)
      .getContainerClient(input.containerName)
      .getBlobClient(input.blobName);
    const body = await blob.downloadToBuffer();
    const properties = await blob.getProperties();
    return {
      body,
      contentEncoding: properties.contentEncoding
    };
  }
}

class GcpSdkBigQueryBillingSourceClient implements GcpBigQueryBillingSourceClient {
  async queryRows(input: BigQueryExportLocation & { location?: string; maxRows: number }): Promise<Array<Record<string, unknown>>> {
    const bigQuery = new BigQuery({ projectId: input.projectId });
    const schema = await detectGcpBillingExportSchema(bigQuery as unknown as BigQueryQueryRunner, input);
    const [rows] = await bigQuery.query({
      query: buildGcpBillingExportQuery(input, schema),
      location: input.location,
      params: { maxRows: input.maxRows }
    });
    return rows as Array<Record<string, unknown>>;
  }
}

interface BigQueryQueryRunner {
  query(input: { query: string; location?: string; params?: Record<string, unknown> }): Promise<[Array<Record<string, unknown>>]>;
}

export async function detectGcpBillingExportSchema(
  bigQuery: BigQueryQueryRunner,
  input: BigQueryExportLocation & { location?: string }
): Promise<GcpBillingExportSchema> {
  const [rows] = await bigQuery.query({
    query: `
SELECT column_name AS columnName
FROM \`${input.projectId}.${input.datasetId}.INFORMATION_SCHEMA.COLUMNS\`
WHERE table_name = @tableId
  AND column_name = 'resource'
LIMIT 1`.trim(),
    location: input.location,
    params: { tableId: input.tableId }
  });
  return { hasResourceColumn: rows.length > 0 };
}

export function buildGcpBillingExportQuery(
  input: BigQueryExportLocation,
  schema: GcpBillingExportSchema = { hasResourceColumn: true }
): string {
  const projectExpression = "COALESCE(project.id, CAST(project.number AS STRING), 'unknown-project')";
  const skuExpression = "REGEXP_REPLACE(COALESCE(sku.id, sku.description, 'unknown-sku'), r'[^A-Za-z0-9._/-]+', '_')";
  const standardResourceExpression = `CONCAT('//cloudbilling.googleapis.com/projects/', ${projectExpression}, '/skus/', ${skuExpression})`;
  const resourceExpression = schema.hasResourceColumn
    ? `COALESCE(resource.name, resource.global_name, ${standardResourceExpression})`
    : standardResourceExpression;

  return `
SELECT
  billing_account_id,
  ${projectExpression} AS project_id,
  ${resourceExpression} AS resource_name,
  service.description AS service_description,
  sku.description AS sku_description,
  CASE
    WHEN REGEXP_CONTAINS(LOWER(sku.description), r'(spot|preemptible)') THEN 'Preemptible'
    WHEN REGEXP_CONTAINS(LOWER(sku.description), r'(commit|reserved)') THEN 'Committed'
    ELSE 'OnDemand'
  END AS pricing_type,
  COALESCE(cost_type, 'Usage') AS transaction_type,
  CAST(ROUND(SAFE_DIVIDE(CAST(cost AS NUMERIC), NULLIF(CAST(usage.amount AS NUMERIC), 0)), 8) AS STRING) AS hourly_rate_usd,
  CAST(ROUND(CAST(usage.amount AS NUMERIC), 4) AS STRING) AS usage_hours,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', usage_start_time) AS usage_start_time,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', usage_end_time) AS usage_end_time
FROM \`${input.projectId}.${input.datasetId}.${input.tableId}\`
WHERE usage_start_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 90 DAY)
ORDER BY usage_start_time DESC
LIMIT @maxRows`.trim();
}
