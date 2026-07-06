import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { AssumeRoleCommand, GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { validateCloudConnectionShape } from './dto/cloud-connection.dto';
import type {
  CloudConnection,
  CloudConnectionStatus,
  CloudConnectionValidationCode,
  CloudConnectionValidationResult
} from './governance.types';

type Env = Record<string, string | undefined>;

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

export interface ProbeOptions {
  env?: Env;
  now?: () => string;
  awsClient?: AwsProbeClient;
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

  if (connection.provider !== 'aws') {
    return result(
      'ready_for_live_probe',
      'provider_probe_not_implemented',
      `${connection.provider.toUpperCase()} live probes are not implemented yet; structural validation passed.`,
      attemptedAt
    );
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

  const env = options.env ?? process.env;
  if (env.COSTALYX_LIVE_CLOUD_PROBES !== 'enabled') {
    return result(
      'ready_for_live_probe',
      'live_probes_disabled',
      'Structural validation passed. Set COSTALYX_LIVE_CLOUD_PROBES=enabled in the Costalyx runtime to run AWS STS and CUR S3 probes.',
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
