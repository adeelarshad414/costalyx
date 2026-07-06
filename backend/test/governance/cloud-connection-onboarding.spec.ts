import { buildCloudConnectionOnboarding } from '../../src/governance/cloud-connection-onboarding';
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
  status: 'ready_for_live_probe',
  lastValidatedAt: null,
  lastValidationAttemptedAt: '2026-07-06T00:00:00.000Z',
  lastValidationCode: 'live_probes_disabled',
  lastValidationMessage: 'Structural validation passed.',
  createdAt: '2026-07-06T00:00:00.000Z'
};

describe('cloud connection onboarding templates', () => {
  it('returns configuration-needed state instead of fake trust policy when broker principal is missing', () => {
    const onboarding = buildCloudConnectionOnboarding(connection);

    expect(onboarding.status).toBe('broker_principal_missing');
    expect(onboarding.trustPolicy).toBeNull();
    expect(onboarding.permissionsPolicy).toMatchObject({
      Statement: expect.arrayContaining([
        expect.objectContaining({ Action: ['s3:ListBucket'], Resource: 'arn:aws:s3:::customer-cur' }),
        expect.objectContaining({ Action: ['s3:GetObject'], Resource: 'arn:aws:s3:::customer-cur/costalyx/*' })
      ])
    });
  });

  it('builds AWS external-ID trust and least-privilege CUR S3 read policies', () => {
    const onboarding = buildCloudConnectionOnboarding(connection, {
      awsBrokerPrincipalArn: 'arn:aws:iam::999999999999:role/CostalyxBroker'
    });

    expect(onboarding.status).toBe('ready');
    expect(onboarding.trustPolicy).toEqual({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: 'arn:aws:iam::999999999999:role/CostalyxBroker' },
          Action: 'sts:AssumeRole',
          Condition: { StringEquals: { 'sts:ExternalId': connection.externalId } }
        }
      ]
    });
    expect(JSON.stringify(onboarding.permissionsPolicy)).not.toContain('undefined');
    expect(onboarding.permissionsPolicy).toMatchObject({
      Version: '2012-10-17',
      Statement: [
        expect.objectContaining({
          Sid: 'CostalyxListBillingExportPrefix',
          Action: ['s3:ListBucket'],
          Resource: 'arn:aws:s3:::customer-cur',
          Condition: { StringLike: { 's3:prefix': ['costalyx/*'] } }
        }),
        expect.objectContaining({
          Sid: 'CostalyxReadBillingExportObjects',
          Action: ['s3:GetObject'],
          Resource: 'arn:aws:s3:::customer-cur/costalyx/*'
        })
      ]
    });
  });

  it('does not generate policies for provider templates that are not implemented yet', () => {
    const onboarding = buildCloudConnectionOnboarding({
      ...connection,
      provider: 'gcp',
      accessMode: 'gcp_workload_identity',
      readOnlyPrincipal: 'projects/123456789/locations/global/workloadIdentityPools/costalyx/providers/billing',
      billingExportUri: 'bigquery://billing-project.billing_export.gcp_billing_export_v1'
    });

    expect(onboarding.status).toBe('provider_not_implemented');
    expect(onboarding.trustPolicy).toBeNull();
    expect(onboarding.permissionsPolicy).toBeNull();
  });
});
