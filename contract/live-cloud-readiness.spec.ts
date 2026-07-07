import { describe, expect, it } from 'vitest';

type ReadinessReport = {
  ready: boolean;
  providerScope: string[];
  global: {
    blockers: string[];
  };
  providers: Array<{
    provider: string;
    ready: boolean;
    command: string;
    requiredReferences: Array<{ name: string; status: string; reason?: string }>;
    brokerIdentity: { ready: boolean; sources: string[]; warnings: string[] };
    blockers: string[];
  }>;
  nextCommands: string[];
};

async function buildReport(env: Record<string, string>): Promise<ReadinessReport> {
  const module = (await import('../scripts/live-cloud-readiness.mjs')) as {
    buildReadinessReport: (env: Record<string, string>) => ReadinessReport;
  };
  return module.buildReadinessReport(env);
}

describe('live cloud readiness doctor', () => {
  it('reports every provider as blocked when no live-cloud references are configured', async () => {
    const report = await buildReport({});

    expect(report.ready).toBe(false);
    expect(report.providerScope).toEqual(['aws', 'azure', 'gcp']);
    expect(report.global.blockers).toContain('COSTALYX_TENANT_ID is required for tenant-scoped live cloud validation.');
    expect(report.nextCommands).toEqual([]);
    expect(report.providers).toHaveLength(3);
    expect(report.providers.every((provider) => provider.ready === false)).toBe(true);
    expect(report.providers[0].requiredReferences).toContainEqual(
      expect.objectContaining({ name: 'COSTALYX_AWS_CUSTOMER_ACCOUNT_ID', status: 'missing' })
    );
  });

  it('blocks unknown provider scope entries without expanding the run to every cloud', async () => {
    const report = await buildReport({
      COSTALYX_LIVE_PROVIDERS: 'oracle',
      COSTALYX_TENANT_ID: 'tenant-production-001'
    });

    expect(report.ready).toBe(false);
    expect(report.providerScope).toEqual([]);
    expect(report.providers).toEqual([]);
    expect(report.global.blockers).toContain('Unknown COSTALYX_LIVE_PROVIDERS entries: oracle');
  });

  it('marks a scoped AWS readiness check ready without echoing customer account, role, or bucket values', async () => {
    const report = await buildReport({
      COSTALYX_LIVE_PROVIDERS: 'aws',
      COSTALYX_TENANT_ID: 'tenant-production-001',
      COSTALYX_AWS_CUSTOMER_ACCOUNT_ID: '123456789012',
      COSTALYX_AWS_READONLY_ROLE_ARN: 'arn:aws:iam::123456789012:role/CostalyxReadOnlyBilling',
      COSTALYX_AWS_CUR_S3_URI: 's3://customer-cur-bucket/costalyx/',
      AWS_PROFILE: 'costalyx-broker'
    });

    expect(report.ready).toBe(true);
    expect(report.providerScope).toEqual(['aws']);
    expect(report.nextCommands).toEqual(['npm run probe:aws-live']);
    expect(report.providers[0]).toMatchObject({
      provider: 'aws',
      ready: true,
      command: 'npm run probe:aws-live',
      brokerIdentity: {
        ready: true,
        sources: ['AWS_PROFILE'],
        warnings: []
      }
    });

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('123456789012');
    expect(serialized).not.toContain('arn:aws:iam');
    expect(serialized).not.toContain('customer-cur-bucket');
    expect(serialized).not.toContain('costalyx-broker');
  });

  it('blocks signed export URLs and broker client secrets without printing secret material', async () => {
    const report = await buildReport({
      COSTALYX_LIVE_PROVIDERS: 'azure',
      COSTALYX_TENANT_ID: 'tenant-production-001',
      COSTALYX_AZURE_BILLING_SCOPE_ID: '/subscriptions/11111111-1111-4111-8111-111111111111',
      COSTALYX_AZURE_DELEGATED_PRINCIPAL_ID: '44444444-4444-4444-8444-444444444444',
      COSTALYX_AZURE_EXPORT_BLOB_URI:
        'https://costalyxexports.blob.core.windows.net/billing/exports/?sv=2026-01-01&sig=do-not-print-me',
      AZURE_CLIENT_SECRET: 'super-sensitive-client-secret'
    });

    expect(report.ready).toBe(false);
    expect(report.providers).toHaveLength(1);
    expect(report.providers[0].blockers.join(' ')).toContain('COSTALYX_AZURE_EXPORT_BLOB_URI');
    expect(report.providers[0].blockers.join(' ')).toContain('AZURE_CLIENT_SECRET');

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('do-not-print-me');
    expect(serialized).not.toContain('super-sensitive-client-secret');
    expect(serialized).not.toContain('costalyxexports.blob.core.windows.net');
  });

  it('accepts GCP Workload Identity and BigQuery references through ADC-backed broker identity', async () => {
    const report = await buildReport({
      COSTALYX_LIVE_PROVIDERS: 'gcp',
      COSTALYX_TENANT_ID: 'tenant-production-001',
      COSTALYX_GCP_BILLING_RESOURCE_ID: 'billingAccounts/123456-ABCDEF-123456',
      COSTALYX_GCP_WORKLOAD_IDENTITY_PROVIDER:
        'projects/123456789/locations/global/workloadIdentityPools/costalyx/providers/billing',
      COSTALYX_GCP_BIGQUERY_EXPORT_URI: 'bigquery://billing-project.billing_export.gcp_billing_export_v1',
      COSTALYX_GCP_BIGQUERY_LOCATION: 'us',
      GOOGLE_APPLICATION_CREDENTIALS: '/secure/runtime/gcp-wif-adc.json'
    });

    expect(report.ready).toBe(true);
    expect(report.providerScope).toEqual(['gcp']);
    expect(report.nextCommands).toEqual(['npm run probe:gcp-live']);
    expect(report.providers[0].brokerIdentity.sources).toEqual(['GOOGLE_APPLICATION_CREDENTIALS']);

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('billing-project');
    expect(serialized).not.toContain('/secure/runtime/gcp-wif-adc.json');
  });
});
