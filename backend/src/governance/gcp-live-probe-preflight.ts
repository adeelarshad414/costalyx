import { stableId } from '../cost-model/stable-id';
import { buildCloudConnectionExternalId, probeCloudConnection, type ProbeOptions } from './cloud-connection-probe';
import type { CloudConnection, CloudConnectionValidationResult } from './governance.types';

type Env = Record<string, string | undefined>;

export interface GcpLiveProbePreflightInput {
  tenantId: string;
  billingResourceId: string;
  workloadIdentityProvider: string;
  bigQueryExportUri: string;
  connectionId?: string;
  displayName?: string;
}

export interface GcpLiveProbePreflightOutput {
  connection: Pick<
    CloudConnection,
    'id' | 'tenantId' | 'externalId' | 'provider' | 'externalTenantId' | 'readOnlyPrincipal' | 'billingExportUri'
  >;
  result: CloudConnectionValidationResult;
  nextAction: string;
}

const requiredEnv = [
  'COSTALYX_TENANT_ID',
  'COSTALYX_GCP_BILLING_RESOURCE_ID',
  'COSTALYX_GCP_WORKLOAD_IDENTITY_PROVIDER',
  'COSTALYX_GCP_BIGQUERY_EXPORT_URI'
];

export function readGcpLiveProbePreflightInput(env: Env): GcpLiveProbePreflightInput {
  const missing = requiredEnv.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required GCP preflight environment values: ${missing.join(', ')}`);
  }
  return {
    tenantId: env.COSTALYX_TENANT_ID!.trim(),
    billingResourceId: env.COSTALYX_GCP_BILLING_RESOURCE_ID!.trim(),
    workloadIdentityProvider: env.COSTALYX_GCP_WORKLOAD_IDENTITY_PROVIDER!.trim(),
    bigQueryExportUri: env.COSTALYX_GCP_BIGQUERY_EXPORT_URI!.trim(),
    connectionId: env.COSTALYX_CLOUD_CONNECTION_ID?.trim() || undefined,
    displayName: env.COSTALYX_GCP_CONNECTION_NAME?.trim() || undefined
  };
}

export async function runGcpLiveProbePreflight(
  input: GcpLiveProbePreflightInput,
  options: ProbeOptions = {}
): Promise<GcpLiveProbePreflightOutput> {
  const connection = buildGcpPreflightConnection(input);
  const result = await probeCloudConnection(connection, {
    ...options,
    env: { ...process.env, ...(options.env ?? {}), COSTALYX_LIVE_CLOUD_PROBES: 'enabled' }
  });
  return {
    connection: sanitizeConnection(connection),
    result,
    nextAction:
      result.status === 'validated'
        ? 'Create or refresh the matching Costalyx cloud connection, then run POST /api/v1/cloud-connections/{id}/validation in the production API.'
        : 'Fix the GCP Workload Identity Federation provider, Billing Viewer grant, BigQuery read/job grants, export URI, or Costalyx broker credentials, then rerun this preflight.'
  };
}

export function buildGcpPreflightConnection(input: GcpLiveProbePreflightInput): CloudConnection {
  const id = input.connectionId ?? stableId(`cloud-connection:${input.tenantId}:gcp:${input.billingResourceId}`);
  const connection = {
    id,
    tenantId: input.tenantId,
    provider: 'gcp',
    displayName: input.displayName ?? 'GCP live preflight',
    externalTenantId: input.billingResourceId,
    accessMode: 'gcp_workload_identity',
    readOnlyPrincipal: input.workloadIdentityProvider,
    billingExportUri: input.bigQueryExportUri,
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

export function gcpPreflightExitCode(output: GcpLiveProbePreflightOutput): number {
  return output.result.status === 'validated' ? 0 : 1;
}

function sanitizeConnection(connection: CloudConnection): GcpLiveProbePreflightOutput['connection'] {
  return {
    id: connection.id,
    tenantId: connection.tenantId,
    externalId: connection.externalId,
    provider: connection.provider,
    externalTenantId: connection.externalTenantId,
    readOnlyPrincipal: connection.readOnlyPrincipal,
    billingExportUri: connection.billingExportUri
  };
}
