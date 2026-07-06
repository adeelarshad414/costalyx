import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { AssumeRoleCommand, GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { CloudProvider } from '../cost-model/cost-record.types';
import {
  buildCloudConnectionExternalId,
  parseS3Uri
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

export class DefaultBillingSourceReader implements BillingSourceReader {
  constructor(private readonly awsClient: AwsS3BillingSourceClient = new AwsSdkS3BillingSourceClient()) {}

  async read(input: BillingSourceReadInput): Promise<BillingSourcePayload> {
    const s3Location = parseS3Uri(input.sourceUri);
    if (!s3Location) {
      return {
        raw: readFileSync(resolve(process.cwd(), '..', input.sourceUri), 'utf8'),
        resolvedSourceUri: input.sourceUri
      };
    }

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
    const raw = decodeObjectBody(await bodyToBuffer(object.body), key, object.contentEncoding);
    return {
      raw,
      resolvedSourceUri: `s3://${s3Location.bucket}/${key}`
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

async function bodyToBuffer(body: unknown): Promise<Buffer> {
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
  throw new Error('AWS S3 billing export object returned an unreadable body.');
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
