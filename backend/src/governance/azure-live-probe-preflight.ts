import { stableId } from '../cost-model/stable-id';
import { buildCloudConnectionExternalId, probeCloudConnection, type ProbeOptions } from './cloud-connection-probe';
import type { CloudConnection, CloudConnectionValidationResult } from './governance.types';

type Env = Record<string, string | undefined>;

export interface AzureLiveProbePreflightInput {
  tenantId: string;
  billingScopeId: string;
  delegatedPrincipalId: string;
  billingExportUri: string;
  connectionId?: string;
  displayName?: string;
}

export interface AzureLiveProbePreflightOutput {
  connection: Pick<
    CloudConnection,
    'id' | 'tenantId' | 'externalId' | 'provider' | 'externalTenantId' | 'readOnlyPrincipal' | 'billingExportUri'
  >;
  result: CloudConnectionValidationResult;
  nextAction: string;
}

const requiredEnv = [
  'COSTALYX_TENANT_ID',
  'COSTALYX_AZURE_BILLING_SCOPE_ID',
  'COSTALYX_AZURE_DELEGATED_PRINCIPAL_ID',
  'COSTALYX_AZURE_EXPORT_BLOB_URI'
];

export function readAzureLiveProbePreflightInput(env: Env): AzureLiveProbePreflightInput {
  const missing = requiredEnv.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required Azure preflight environment values: ${missing.join(', ')}`);
  }
  return {
    tenantId: env.COSTALYX_TENANT_ID!.trim(),
    billingScopeId: env.COSTALYX_AZURE_BILLING_SCOPE_ID!.trim(),
    delegatedPrincipalId: env.COSTALYX_AZURE_DELEGATED_PRINCIPAL_ID!.trim(),
    billingExportUri: env.COSTALYX_AZURE_EXPORT_BLOB_URI!.trim(),
    connectionId: env.COSTALYX_CLOUD_CONNECTION_ID?.trim() || undefined,
    displayName: env.COSTALYX_AZURE_CONNECTION_NAME?.trim() || undefined
  };
}

export async function runAzureLiveProbePreflight(
  input: AzureLiveProbePreflightInput,
  options: ProbeOptions = {}
): Promise<AzureLiveProbePreflightOutput> {
  const connection = buildAzurePreflightConnection(input);
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
        : 'Fix the Azure delegated identity, Reader/Cost Management Reader grants, Storage Blob Data Reader grant, export URI, or Costalyx broker credentials, then rerun this preflight.'
  };
}

export function buildAzurePreflightConnection(input: AzureLiveProbePreflightInput): CloudConnection {
  const id = input.connectionId ?? stableId(`cloud-connection:${input.tenantId}:azure:${input.billingScopeId}`);
  const connection = {
    id,
    tenantId: input.tenantId,
    provider: 'azure',
    displayName: input.displayName ?? 'Azure live preflight',
    externalTenantId: input.billingScopeId,
    accessMode: 'azure_delegated_app',
    readOnlyPrincipal: input.delegatedPrincipalId,
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

export function azurePreflightExitCode(output: AzureLiveProbePreflightOutput): number {
  return output.result.status === 'validated' ? 0 : 1;
}

function sanitizeConnection(
  connection: CloudConnection
): AzureLiveProbePreflightOutput['connection'] {
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
