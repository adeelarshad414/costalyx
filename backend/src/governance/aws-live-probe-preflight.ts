import { stableId } from '../cost-model/stable-id';
import { buildCloudConnectionExternalId, probeCloudConnection, type ProbeOptions } from './cloud-connection-probe';
import type { CloudConnection, CloudConnectionValidationResult } from './governance.types';

type Env = Record<string, string | undefined>;

export interface AwsLiveProbePreflightInput {
  tenantId: string;
  accountId: string;
  roleArn: string;
  billingExportUri: string;
  connectionId?: string;
  displayName?: string;
}

export interface AwsLiveProbePreflightOutput {
  connection: Pick<
    CloudConnection,
    'id' | 'tenantId' | 'externalId' | 'provider' | 'externalTenantId' | 'readOnlyPrincipal' | 'billingExportUri'
  >;
  result: CloudConnectionValidationResult;
  nextAction: string;
}

const requiredEnv = [
  'COSTALYX_TENANT_ID',
  'COSTALYX_AWS_CUSTOMER_ACCOUNT_ID',
  'COSTALYX_AWS_READONLY_ROLE_ARN',
  'COSTALYX_AWS_CUR_S3_URI'
];

export function readAwsLiveProbePreflightInput(env: Env): AwsLiveProbePreflightInput {
  const missing = requiredEnv.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required AWS preflight environment values: ${missing.join(', ')}`);
  }
  return {
    tenantId: env.COSTALYX_TENANT_ID!.trim(),
    accountId: env.COSTALYX_AWS_CUSTOMER_ACCOUNT_ID!.trim(),
    roleArn: env.COSTALYX_AWS_READONLY_ROLE_ARN!.trim(),
    billingExportUri: env.COSTALYX_AWS_CUR_S3_URI!.trim(),
    connectionId: env.COSTALYX_CLOUD_CONNECTION_ID?.trim() || undefined,
    displayName: env.COSTALYX_AWS_CONNECTION_NAME?.trim() || undefined
  };
}

export async function runAwsLiveProbePreflight(
  input: AwsLiveProbePreflightInput,
  options: ProbeOptions = {}
): Promise<AwsLiveProbePreflightOutput> {
  const connection = buildAwsPreflightConnection(input);
  const result = await probeCloudConnection(connection, {
    ...options,
    env: { ...process.env, ...(options.env ?? {}), COSTALYX_LIVE_CLOUD_PROBES: 'enabled' }
  });
  return {
    connection: {
      id: connection.id,
      tenantId: connection.tenantId,
      externalId: connection.externalId,
      provider: connection.provider,
      externalTenantId: connection.externalTenantId,
      readOnlyPrincipal: connection.readOnlyPrincipal,
      billingExportUri: connection.billingExportUri
    },
    result,
    nextAction:
      result.status === 'validated'
        ? 'Create or refresh the matching Costalyx cloud connection, then run POST /api/v1/cloud-connections/{id}/validation in the production API.'
        : 'Fix the role trust policy, external ID, customer account ID, CUR S3 URI, or Costalyx broker credentials, then rerun this preflight.'
  };
}

export function buildAwsPreflightConnection(input: AwsLiveProbePreflightInput): CloudConnection {
  const id = input.connectionId ?? stableId(`cloud-connection:${input.tenantId}:aws:${input.accountId}`);
  const connection = {
    id,
    tenantId: input.tenantId,
    provider: 'aws',
    displayName: input.displayName ?? 'AWS live preflight',
    externalTenantId: input.accountId,
    accessMode: 'aws_assume_role',
    readOnlyPrincipal: input.roleArn,
    billingExportUri: input.billingExportUri,
    status: 'pending_validation',
    lastValidatedAt: null,
    lastValidationAttemptedAt: null,
    lastValidationCode: null,
    lastValidationMessage: null,
    createdAt: new Date(0).toISOString()
  } satisfies Omit<CloudConnection, 'externalId'>;
  return {
    ...connection,
    externalId: buildCloudConnectionExternalId(connection)
  };
}

export function awsPreflightExitCode(output: AwsLiveProbePreflightOutput): number {
  return output.result.status === 'validated' ? 0 : 1;
}
