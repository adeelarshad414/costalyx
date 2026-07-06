import { parseBigQueryUri, parseS3Uri } from './cloud-connection-probe';
import type { CloudConnection, CloudConnectionOnboarding } from './governance.types';

const awsPrincipalArnPattern = /^arn:aws:iam::\d{12}:(role\/[\w+=,.@/-]+|root)$/;

export interface CloudConnectionOnboardingOptions {
  awsBrokerPrincipalArn?: string;
}

export function buildCloudConnectionOnboarding(
  connection: CloudConnection,
  options: CloudConnectionOnboardingOptions = {}
): CloudConnectionOnboarding {
  if (connection.provider === 'azure') {
    return buildAzureOnboarding(connection);
  }

  if (connection.provider === 'gcp') {
    return buildGcpOnboarding(connection);
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

function buildAzureOnboarding(connection: CloudConnection): CloudConnectionOnboarding {
  const scope = azureScope(connection.externalTenantId);
  const roleAssignments: Record<string, unknown>[] = [
    {
      roleDefinitionName: 'Reader',
      principalId: connection.readOnlyPrincipal,
      scope
    },
    {
      roleDefinitionName: 'Cost Management Reader',
      principalId: connection.readOnlyPrincipal,
      scope
    }
  ];
  if (connection.billingExportUri) {
    roleAssignments.push({
      roleDefinitionName: 'Storage Blob Data Reader',
      principalId: connection.readOnlyPrincipal,
      scope: 'storage account or container that hosts the Cost Management export'
    });
  }

  return {
    provider: connection.provider,
    connectionId: connection.id,
    externalId: connection.externalId,
    status: 'ready',
    brokerPrincipalArn: null,
    billingExportUri: connection.billingExportUri,
    trustPolicy: null,
    permissionsPolicy: {
      provider: 'azure',
      principalId: connection.readOnlyPrincipal,
      billingScope: scope,
      roleAssignments,
      exportUri: connection.billingExportUri
    },
    customerSteps: [
      'Grant the Costalyx delegated app or workload identity Reader on the billing scope.',
      'Grant Cost Management Reader on the same subscription or management-group scope.',
      connection.billingExportUri
        ? 'Grant Storage Blob Data Reader on the storage account or container used by the Cost Management export.'
        : 'Add a Cost Management export URI before enabling export-read validation.'
    ]
  };
}

function buildGcpOnboarding(connection: CloudConnection): CloudConnectionOnboarding {
  const exportLocation = parseBigQueryUri(connection.billingExportUri);
  if (!exportLocation) {
    return {
      provider: connection.provider,
      connectionId: connection.id,
      externalId: connection.externalId,
      status: 'billing_export_missing',
      brokerPrincipalArn: null,
      billingExportUri: connection.billingExportUri,
      trustPolicy: null,
      permissionsPolicy: {
        provider: 'gcp',
        principalSet: gcpPrincipalSet(connection.readOnlyPrincipal),
        billingResource: connection.externalTenantId
      },
      customerSteps: ['Add a BigQuery billing export URI such as bigquery://project.dataset.table.']
    };
  }

  const principalSet = gcpPrincipalSet(connection.readOnlyPrincipal);
  return {
    provider: connection.provider,
    connectionId: connection.id,
    externalId: connection.externalId,
    status: 'ready',
    brokerPrincipalArn: null,
    billingExportUri: connection.billingExportUri,
    trustPolicy: null,
    permissionsPolicy: {
      provider: 'gcp',
      principalSet,
      billingResource: connection.externalTenantId,
      bindings: [
        {
          role: 'roles/billing.viewer',
          member: principalSet,
          resource: connection.externalTenantId
        },
        {
          role: 'roles/bigquery.dataViewer',
          member: principalSet,
          resource: `${exportLocation.projectId}.${exportLocation.datasetId}`
        },
        {
          role: 'roles/bigquery.jobUser',
          member: principalSet,
          resource: exportLocation.projectId
        }
      ],
      export: exportLocation
    },
    customerSteps: [
      'Create the Workload Identity Federation provider shown on the connection.',
      'Grant Billing Account Viewer or Billing Viewer on the billing account/project scope.',
      'Grant BigQuery Data Viewer on the billing export dataset and BigQuery Job User on the export project.'
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

function azureScope(value: string): string {
  if (value.startsWith('/subscriptions/') || value.startsWith('/providers/Microsoft.Management/managementGroups/')) {
    return value;
  }
  return `/subscriptions/${value}`;
}

function gcpPrincipalSet(providerPath: string): string {
  const poolPath = providerPath.replace(/\/providers\/[^/]+$/, '');
  return `principalSet://iam.googleapis.com/${poolPath}/*`;
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
