import {
  buildCloudConnectionExternalId,
  parseS3Uri,
  probeCloudConnection,
  type AwsProbeClient
} from '../../src/governance/cloud-connection-probe';
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
  status: 'pending_validation',
  lastValidatedAt: null,
  lastValidationAttemptedAt: null,
  lastValidationCode: null,
  lastValidationMessage: null,
  createdAt: '2026-07-06T00:00:00.000Z'
};

describe('cloud connection probes', () => {
  it('generates the tenant-scoped AWS external ID customers put in the role trust policy', () => {
    expect(buildCloudConnectionExternalId(connection)).toBe(connection.externalId);
  });

  it('parses S3 billing export URIs without accepting non-S3 locations', () => {
    expect(parseS3Uri('s3://customer-cur/costalyx/')).toEqual({ bucket: 'customer-cur', prefix: 'costalyx/' });
    expect(parseS3Uri('https://example.test/costalyx/')).toBeNull();
  });

  it('does not mark a structurally valid AWS connection as live validated when probes are disabled', async () => {
    const result = await probeCloudConnection(connection, {
      env: {},
      now: () => '2026-07-06T00:00:00.000Z'
    });

    expect(result).toEqual({
      status: 'ready_for_live_probe',
      code: 'live_probes_disabled',
      message:
        'Structural validation passed. Set COSTALYX_LIVE_CLOUD_PROBES=enabled in the Costalyx runtime to run AWS STS and CUR S3 probes.',
      attemptedAt: '2026-07-06T00:00:00.000Z',
      validatedAt: null
    });
  });

  it('passes AWS validation only after AssumeRole and CUR S3 read probes succeed', async () => {
    const calls: string[] = [];
    const awsClient: AwsProbeClient = {
      async assumeRole(input) {
        calls.push(`${input.roleArn}:${input.externalId}`);
        return {
          accessKeyId: 'access-key',
          secretAccessKey: 'secret-key',
          sessionToken: 'session-token',
          accountId: '123456789012'
        };
      },
      async listBillingExport(input) {
        calls.push(`${input.bucket}/${input.prefix}`);
        return { objectCount: 1 };
      }
    };

    const result = await probeCloudConnection(connection, {
      env: { COSTALYX_LIVE_CLOUD_PROBES: 'enabled', AWS_REGION: 'us-east-1' },
      now: () => '2026-07-06T00:00:00.000Z',
      awsClient
    });

    expect(result.status).toBe('validated');
    expect(result.code).toBe('aws_probe_passed');
    expect(result.validatedAt).toBe('2026-07-06T00:00:00.000Z');
    expect(calls).toEqual([
      'arn:aws:iam::123456789012:role/CostalyxReadOnlyBilling:costalyx:00000000-0000-4000-8000-000000000001:11111111-1111-4111-8111-111111111111',
      'customer-cur/costalyx/'
    ]);
  });

  it('fails AWS validation when the assumed role belongs to a different account', async () => {
    const awsClient: AwsProbeClient = {
      async assumeRole() {
        return {
          accessKeyId: 'access-key',
          secretAccessKey: 'secret-key',
          sessionToken: 'session-token',
          accountId: '999999999999'
        };
      },
      async listBillingExport() {
        throw new Error('must not read S3 after account mismatch');
      }
    };

    const result = await probeCloudConnection(connection, {
      env: { COSTALYX_LIVE_CLOUD_PROBES: 'enabled', AWS_REGION: 'us-east-1' },
      now: () => '2026-07-06T00:00:00.000Z',
      awsClient
    });

    expect(result.status).toBe('validation_failed');
    expect(result.code).toBe('aws_account_mismatch');
  });
});
