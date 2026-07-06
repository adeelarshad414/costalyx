import { parseS3Uri } from './cloud-connection-probe';
import type { CloudConnection, CloudConnectionOnboarding } from './governance.types';

const awsPrincipalArnPattern = /^arn:aws:iam::\d{12}:(role\/[\w+=,.@/-]+|root)$/;

export interface CloudConnectionOnboardingOptions {
  awsBrokerPrincipalArn?: string;
}

export function buildCloudConnectionOnboarding(
  connection: CloudConnection,
  options: CloudConnectionOnboardingOptions = {}
): CloudConnectionOnboarding {
  if (connection.provider !== 'aws') {
    return {
      provider: connection.provider,
      connectionId: connection.id,
      externalId: connection.externalId,
      status: 'provider_not_implemented',
      brokerPrincipalArn: null,
      billingExportUri: connection.billingExportUri,
      trustPolicy: null,
      permissionsPolicy: null,
      customerSteps: [`${connection.provider.toUpperCase()} onboarding templates are not implemented yet.`]
    };
  }

  const brokerPrincipalArn = options.awsBrokerPrincipalArn?.trim() || null;
  const exportLocation = parseS3Uri(connection.billingExportUri);
  const base = {
    provider: connection.provider,
    connectionId: connection.id,
    externalId: connection.externalId,
    brokerPrincipalArn,
    billingExportUri: connection.billingExportUri
  };

  if (!brokerPrincipalArn) {
    return {
      ...base,
      status: 'broker_principal_missing',
      trustPolicy: null,
      permissionsPolicy: exportLocation ? buildAwsCurReadPolicy(exportLocation) : null,
      customerSteps: ['Set COSTALYX_AWS_BROKER_PRINCIPAL_ARN before generating the customer trust policy.']
    };
  }

  if (!awsPrincipalArnPattern.test(brokerPrincipalArn)) {
    return {
      ...base,
      status: 'broker_principal_invalid',
      trustPolicy: null,
      permissionsPolicy: exportLocation ? buildAwsCurReadPolicy(exportLocation) : null,
      customerSteps: ['Fix COSTALYX_AWS_BROKER_PRINCIPAL_ARN so it is an AWS IAM role ARN or account-root ARN.']
    };
  }

  if (!exportLocation) {
    return {
      ...base,
      status: 'billing_export_missing',
      trustPolicy: buildAwsTrustPolicy(brokerPrincipalArn, connection.externalId),
      permissionsPolicy: null,
      customerSteps: ['Add an S3 CUR URI such as s3://bucket/prefix/ before generating the least-privilege S3 policy.']
    };
  }

  return {
    ...base,
    status: 'ready',
    trustPolicy: buildAwsTrustPolicy(brokerPrincipalArn, connection.externalId),
    permissionsPolicy: buildAwsCurReadPolicy(exportLocation),
    customerSteps: [
      'Create or update the AWS IAM role trust policy with the generated external ID.',
      'Attach the least-privilege CUR S3 read policy to that role.',
      'Return the role ARN and CUR S3 URI to Costalyx, then run cloud connection validation.'
    ]
  };
}

function buildAwsTrustPolicy(brokerPrincipalArn: string, externalId: string): Record<string, unknown> {
  return {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: brokerPrincipalArn },
        Action: 'sts:AssumeRole',
        Condition: {
          StringEquals: {
            'sts:ExternalId': externalId
          }
        }
      }
    ]
  };
}

function buildAwsCurReadPolicy(exportLocation: { bucket: string; prefix: string }): Record<string, unknown> {
  const normalizedPrefix = exportLocation.prefix.replace(/^\/+/, '');
  const objectArn = normalizedPrefix
    ? `arn:aws:s3:::${exportLocation.bucket}/${normalizedPrefix}*`
    : `arn:aws:s3:::${exportLocation.bucket}/*`;
  const listStatement: Record<string, unknown> = {
    Sid: 'CostalyxListBillingExportPrefix',
    Effect: 'Allow',
    Action: ['s3:ListBucket'],
    Resource: `arn:aws:s3:::${exportLocation.bucket}`
  };
  if (normalizedPrefix) {
    listStatement.Condition = {
      StringLike: {
        's3:prefix': [`${normalizedPrefix}*`]
      }
    };
  }
  return {
    Version: '2012-10-17',
    Statement: [
      listStatement,
      {
        Sid: 'CostalyxReadBillingExportObjects',
        Effect: 'Allow',
        Action: ['s3:GetObject'],
        Resource: objectArn
      }
    ]
  };
}
