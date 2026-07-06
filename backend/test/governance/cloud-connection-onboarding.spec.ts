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
    expect(onboarding.deploymentTemplates).toBeNull();
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
    expect(onboarding.deploymentTemplates?.cloudFormation).toMatchObject({
      fileName: 'costalyx-aws-readonly-role.yaml',
      format: 'cloudformation-yaml'
    });
    expect(onboarding.deploymentTemplates?.terraform).toMatchObject({
      fileName: 'costalyx_aws_readonly_role.tf',
      format: 'terraform-hcl'
    });
    expect(onboarding.deploymentTemplates?.cloudFormation.body).toContain('CostalyxReadOnlyBillingRole');
    expect(onboarding.deploymentTemplates?.cloudFormation.body).toContain('arn:aws:iam::999999999999:role/CostalyxBroker');
    expect(onboarding.deploymentTemplates?.cloudFormation.body).toContain(connection.externalId);
    expect(onboarding.deploymentTemplates?.cloudFormation.body).toContain("Default: 'customer-cur'");
    expect(onboarding.deploymentTemplates?.cloudFormation.body).toContain("Default: 'costalyx/'");
    expect(onboarding.deploymentTemplates?.terraform.body).toContain('data "aws_iam_policy_document" "costalyx_assume_role"');
    expect(onboarding.deploymentTemplates?.terraform.body).toContain('actions = ["sts:AssumeRole"]');
    expect(onboarding.deploymentTemplates?.terraform.body).toContain('actions   = ["s3:ListBucket"]');
    expect(onboarding.deploymentTemplates?.terraform.body).toContain('actions = ["s3:GetObject"]');
    expect(onboarding.deploymentTemplates?.terraform.body).toContain('"customer-cur"');
    expect(onboarding.deploymentTemplates?.terraform.body).toContain('"costalyx/"');
    expect(JSON.stringify(onboarding.deploymentTemplates)).not.toMatch(/secretAccessKey|accessKeyId|clientSecret/i);
  });

  it('builds Azure readonly role assignment guidance', () => {
    const onboarding = buildCloudConnectionOnboarding({
      ...connection,
      provider: 'azure',
      externalTenantId: '11111111-1111-4111-8111-111111111111',
      accessMode: 'azure_delegated_app',
      readOnlyPrincipal: '22222222-2222-4222-8222-222222222222',
      billingExportUri: 'https://storage.example.test/costalyx/exports/'
    });

    expect(onboarding.status).toBe('ready');
    expect(onboarding.trustPolicy).toBeNull();
    expect(onboarding.permissionsPolicy).toMatchObject({
      provider: 'azure',
      principalId: '22222222-2222-4222-8222-222222222222',
      billingScope: '/subscriptions/11111111-1111-4111-8111-111111111111',
      roleAssignments: expect.arrayContaining([
        expect.objectContaining({ roleDefinitionName: 'Reader' }),
        expect.objectContaining({ roleDefinitionName: 'Cost Management Reader' }),
        expect.objectContaining({ roleDefinitionName: 'Storage Blob Data Reader' })
      ])
    });
  });

  it('builds GCP Workload Identity and BigQuery billing-export IAM guidance', () => {
    const onboarding = buildCloudConnectionOnboarding({
      ...connection,
      provider: 'gcp',
      accessMode: 'gcp_workload_identity',
      readOnlyPrincipal: 'projects/123456789/locations/global/workloadIdentityPools/costalyx/providers/billing',
      billingExportUri: 'bigquery://billing-project.billing_export.gcp_billing_export_v1'
    });

    expect(onboarding.status).toBe('ready');
    expect(onboarding.trustPolicy).toBeNull();
    expect(onboarding.permissionsPolicy).toMatchObject({
      provider: 'gcp',
      principalSet:
        'principalSet://iam.googleapis.com/projects/123456789/locations/global/workloadIdentityPools/costalyx/*',
      bindings: expect.arrayContaining([
        expect.objectContaining({ role: 'roles/billing.viewer' }),
        expect.objectContaining({ role: 'roles/bigquery.dataViewer', resource: 'billing-project.billing_export' }),
        expect.objectContaining({ role: 'roles/bigquery.jobUser', resource: 'billing-project' })
      ]),
      export: {
        projectId: 'billing-project',
        datasetId: 'billing_export',
        tableId: 'gcp_billing_export_v1'
      }
    });
  });

  it('requires a BigQuery export URI before GCP export-read validation can be prepared', () => {
    const onboarding = buildCloudConnectionOnboarding({
      ...connection,
      provider: 'gcp',
      accessMode: 'gcp_workload_identity',
      readOnlyPrincipal: 'projects/123456789/locations/global/workloadIdentityPools/costalyx/providers/billing',
      billingExportUri: null
    });

    expect(onboarding.status).toBe('billing_export_missing');
    expect(onboarding.permissionsPolicy).toMatchObject({
      provider: 'gcp',
      principalSet:
        'principalSet://iam.googleapis.com/projects/123456789/locations/global/workloadIdentityPools/costalyx/*'
    });
  });
});
