import {
  azurePreflightExitCode,
  buildAzurePreflightConnection,
  readAzureLiveProbePreflightInput,
  runAzureLiveProbePreflight
} from '../../src/governance/azure-live-probe-preflight';
import type { AzureProbeClient, GcpProbeClient } from '../../src/governance/cloud-connection-probe';
import {
  buildGcpPreflightConnection,
  gcpPreflightExitCode,
  readGcpLiveProbePreflightInput,
  runGcpLiveProbePreflight
} from '../../src/governance/gcp-live-probe-preflight';

const azureEnv = {
  COSTALYX_TENANT_ID: '00000000-0000-4000-8000-000000000001',
  COSTALYX_AZURE_BILLING_SCOPE_ID: '33333333-3333-4333-8333-333333333333',
  COSTALYX_AZURE_DELEGATED_PRINCIPAL_ID: '44444444-4444-4444-8444-444444444444',
  COSTALYX_AZURE_EXPORT_BLOB_URI: 'https://costalyxexports.blob.core.windows.net/billing/exports/',
  COSTALYX_AZURE_CONNECTION_NAME: 'Azure production subscription'
};

const gcpEnv = {
  COSTALYX_TENANT_ID: '00000000-0000-4000-8000-000000000001',
  COSTALYX_GCP_BILLING_RESOURCE_ID: 'billingAccounts/123456-ABCDEF-123456',
  COSTALYX_GCP_WORKLOAD_IDENTITY_PROVIDER: 'projects/123456789/locations/global/workloadIdentityPools/costalyx/providers/billing',
  COSTALYX_GCP_BIGQUERY_EXPORT_URI: 'bigquery://billing-project.billing_export.gcp_billing_export_v1',
  COSTALYX_GCP_CONNECTION_NAME: 'GCP billing export'
};

describe('Azure live probe preflight', () => {
  it('requires the customer scope/principal/export references without asking for secrets', () => {
    expect(() =>
      readAzureLiveProbePreflightInput({ ...azureEnv, COSTALYX_AZURE_DELEGATED_PRINCIPAL_ID: '' })
    ).toThrow('COSTALYX_AZURE_DELEGATED_PRINCIPAL_ID');
  });

  it('derives the same connection ID and external ID as the API for a tenant Azure scope', () => {
    const connection = buildAzurePreflightConnection(readAzureLiveProbePreflightInput(azureEnv));

    expect(connection.id).toBe('26f95ea3-374d-4bc8-8e01-5e5d5a7520d4');
    expect(connection.externalId).toBe(
      'costalyx:00000000-0000-4000-8000-000000000001:26f95ea3-374d-4bc8-8e01-5e5d5a7520d4'
    );
    expect(connection.readOnlyPrincipal).toBe('44444444-4444-4444-8444-444444444444');
  });

  it('runs the live Azure validation path with injected clients and redacted output', async () => {
    const calls: string[] = [];
    const azureClient: AzureProbeClient = {
      async checkCostManagementAccess(input) {
        calls.push(input.scope);
      },
      async listBillingExport(input) {
        calls.push(`${input.accountUrl}/${input.containerName}/${input.prefix}`);
        return { objectCount: 1 };
      }
    };

    const output = await runAzureLiveProbePreflight(readAzureLiveProbePreflightInput(azureEnv), {
      now: () => '2026-07-06T00:00:00.000Z',
      azureClient
    });

    expect(output.result.status).toBe('validated');
    expect(output.result.code).toBe('azure_probe_passed');
    expect(output.connection.externalTenantId).toBe('33333333-3333-4333-8333-333333333333');
    expect(JSON.stringify(output)).not.toContain('client-secret');
    expect(JSON.stringify(output)).not.toContain('sas-token');
    expect(calls).toEqual([
      '/subscriptions/33333333-3333-4333-8333-333333333333',
      'https://costalyxexports.blob.core.windows.net/billing/exports'
    ]);
    expect(azurePreflightExitCode(output)).toBe(0);
  });

  it('returns a failing exit code for empty Azure exports', async () => {
    const output = await runAzureLiveProbePreflight(readAzureLiveProbePreflightInput(azureEnv), {
      now: () => '2026-07-06T00:00:00.000Z',
      azureClient: {
        async checkCostManagementAccess() {},
        async listBillingExport() {
          return { objectCount: 0 };
        }
      }
    });

    expect(output.result.status).toBe('validation_failed');
    expect(output.result.code).toBe('azure_billing_export_empty');
    expect(azurePreflightExitCode(output)).toBe(1);
  });
});

describe('GCP live probe preflight', () => {
  it('requires the customer billing resource/provider/export references without asking for secrets', () => {
    expect(() => readGcpLiveProbePreflightInput({ ...gcpEnv, COSTALYX_GCP_BIGQUERY_EXPORT_URI: '' })).toThrow(
      'COSTALYX_GCP_BIGQUERY_EXPORT_URI'
    );
  });

  it('derives the same connection ID and external ID as the API for a tenant GCP billing resource', () => {
    const connection = buildGcpPreflightConnection(readGcpLiveProbePreflightInput(gcpEnv));

    expect(connection.id).toBe('ed1bd0b9-d4f7-4b17-8ecd-878ffb633d65');
    expect(connection.externalId).toBe(
      'costalyx:00000000-0000-4000-8000-000000000001:ed1bd0b9-d4f7-4b17-8ecd-878ffb633d65'
    );
    expect(connection.readOnlyPrincipal).toBe(
      'projects/123456789/locations/global/workloadIdentityPools/costalyx/providers/billing'
    );
  });

  it('runs the live GCP validation path with injected clients and redacted output', async () => {
    const calls: string[] = [];
    const gcpClient: GcpProbeClient = {
      async queryBillingExport(input) {
        calls.push(`${input.projectId}.${input.datasetId}.${input.tableId}`);
        return { rowCount: 1 };
      }
    };

    const output = await runGcpLiveProbePreflight(readGcpLiveProbePreflightInput(gcpEnv), {
      env: { COSTALYX_GCP_BIGQUERY_LOCATION: 'us' },
      now: () => '2026-07-06T00:00:00.000Z',
      gcpClient
    });

    expect(output.result.status).toBe('validated');
    expect(output.result.code).toBe('gcp_probe_passed');
    expect(output.connection.externalTenantId).toBe('billingAccounts/123456-ABCDEF-123456');
    expect(JSON.stringify(output)).not.toContain('private_key');
    expect(JSON.stringify(output)).not.toContain('service-account-json');
    expect(calls).toEqual(['billing-project.billing_export.gcp_billing_export_v1']);
    expect(gcpPreflightExitCode(output)).toBe(0);
  });

  it('returns a failing exit code for empty BigQuery exports', async () => {
    const output = await runGcpLiveProbePreflight(readGcpLiveProbePreflightInput(gcpEnv), {
      now: () => '2026-07-06T00:00:00.000Z',
      gcpClient: {
        async queryBillingExport() {
          return { rowCount: 0 };
        }
      }
    });

    expect(output.result.status).toBe('validation_failed');
    expect(output.result.code).toBe('gcp_billing_export_empty');
    expect(gcpPreflightExitCode(output)).toBe(1);
  });
});
