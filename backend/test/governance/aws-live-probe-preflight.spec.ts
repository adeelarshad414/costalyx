import {
  awsPreflightExitCode,
  buildAwsPreflightConnection,
  readAwsLiveProbePreflightInput,
  runAwsLiveProbePreflight
} from '../../src/governance/aws-live-probe-preflight';
import type { AwsProbeClient } from '../../src/governance/cloud-connection-probe';

const env = {
  COSTALYX_TENANT_ID: '00000000-0000-4000-8000-000000000001',
  COSTALYX_AWS_CUSTOMER_ACCOUNT_ID: '123456789012',
  COSTALYX_AWS_READONLY_ROLE_ARN: 'arn:aws:iam::123456789012:role/CostalyxReadOnlyBilling',
  COSTALYX_AWS_CUR_S3_URI: 's3://customer-cur/costalyx/',
  COSTALYX_AWS_CONNECTION_NAME: 'AWS production payer'
};

describe('AWS live probe preflight', () => {
  it('requires the customer role/account/CUR references without asking for secrets', () => {
    expect(() => readAwsLiveProbePreflightInput({ ...env, COSTALYX_AWS_READONLY_ROLE_ARN: '' })).toThrow(
      'COSTALYX_AWS_READONLY_ROLE_ARN'
    );
  });

  it('derives the same connection ID and external ID as the API for a tenant AWS account', () => {
    const connection = buildAwsPreflightConnection(readAwsLiveProbePreflightInput(env));

    expect(connection.id).toBe('334dc37a-f4e8-48b1-84bd-e74ead3ee33f');
    expect(connection.externalId).toBe(
      'costalyx:00000000-0000-4000-8000-000000000001:334dc37a-f4e8-48b1-84bd-e74ead3ee33f'
    );
    expect(connection.readOnlyPrincipal).toBe('arn:aws:iam::123456789012:role/CostalyxReadOnlyBilling');
  });

  it('runs the live AWS validation path with injected AWS clients and redacted output', async () => {
    const calls: string[] = [];
    const awsClient: AwsProbeClient = {
      async assumeRole(input) {
        calls.push(`${input.roleArn}:${input.externalId}:${input.sessionName}`);
        return {
          accessKeyId: 'access-key',
          secretAccessKey: 'secret-key',
          sessionToken: 'session-token',
          accountId: '123456789012'
        };
      },
      async listBillingExport(input) {
        calls.push(`${input.bucket}/${input.prefix}:${input.region}`);
        return { objectCount: 1 };
      }
    };

    const output = await runAwsLiveProbePreflight(readAwsLiveProbePreflightInput(env), {
      env: { AWS_REGION: 'us-west-2' },
      now: () => '2026-07-06T00:00:00.000Z',
      awsClient
    });

    expect(output.result.status).toBe('validated');
    expect(output.result.code).toBe('aws_probe_passed');
    expect(output.connection.externalTenantId).toBe('123456789012');
    expect(JSON.stringify(output)).not.toContain('access-key');
    expect(JSON.stringify(output)).not.toContain('secret-key');
    expect(JSON.stringify(output)).not.toContain('session-token');
    expect(calls).toEqual([
      'arn:aws:iam::123456789012:role/CostalyxReadOnlyBilling:costalyx:00000000-0000-4000-8000-000000000001:334dc37a-f4e8-48b1-84bd-e74ead3ee33f:costalyx-334dc37af4e848b184bde74e',
      'customer-cur/costalyx/:us-west-2'
    ]);
    expect(awsPreflightExitCode(output)).toBe(0);
  });

  it('returns a failing exit code for account mismatches', async () => {
    const output = await runAwsLiveProbePreflight(readAwsLiveProbePreflightInput(env), {
      env: { AWS_REGION: 'us-west-2' },
      now: () => '2026-07-06T00:00:00.000Z',
      awsClient: {
        async assumeRole() {
          return {
            accessKeyId: 'access-key',
            secretAccessKey: 'secret-key',
            sessionToken: 'session-token',
            accountId: '999999999999'
          };
        },
        async listBillingExport() {
          throw new Error('must not list billing export after account mismatch');
        }
      }
    });

    expect(output.result.status).toBe('validation_failed');
    expect(output.result.code).toBe('aws_account_mismatch');
    expect(awsPreflightExitCode(output)).toBe(1);
  });
});
