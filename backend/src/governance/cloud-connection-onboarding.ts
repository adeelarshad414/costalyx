import { parseBigQueryUri, parseS3Uri } from './cloud-connection-probe';
import type {
  CloudConnection,
  CloudConnectionDeploymentTemplates,
  CloudConnectionOnboarding
} from './governance.types';

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
      deploymentTemplates: null,
      customerSteps: ['Set COSTALYX_AWS_BROKER_PRINCIPAL_ARN before generating the customer trust policy.']
    };
  }

  if (!awsPrincipalArnPattern.test(brokerPrincipalArn)) {
    return {
      ...base,
      status: 'broker_principal_invalid',
      trustPolicy: null,
      permissionsPolicy: exportLocation ? buildAwsCurReadPolicy(exportLocation) : null,
      deploymentTemplates: null,
      customerSteps: ['Fix COSTALYX_AWS_BROKER_PRINCIPAL_ARN so it is an AWS IAM role ARN or account-root ARN.']
    };
  }

  if (!exportLocation) {
    return {
      ...base,
      status: 'billing_export_missing',
      trustPolicy: buildAwsTrustPolicy(brokerPrincipalArn, connection.externalId),
      permissionsPolicy: null,
      deploymentTemplates: null,
      customerSteps: ['Add an S3 CUR URI such as s3://bucket/prefix/ before generating the least-privilege S3 policy.']
    };
  }

  return {
    ...base,
    status: 'ready',
    trustPolicy: buildAwsTrustPolicy(brokerPrincipalArn, connection.externalId),
    permissionsPolicy: buildAwsCurReadPolicy(exportLocation),
    deploymentTemplates: buildAwsDeploymentTemplates(connection, brokerPrincipalArn, exportLocation),
    customerSteps: [
      'Deploy the generated CloudFormation or Terraform template in the customer AWS account.',
      'Review that the role trust policy uses the generated external ID and the Costalyx broker principal.',
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
    deploymentTemplates: null,
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
      deploymentTemplates: null,
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
    deploymentTemplates: null,
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

function buildAwsDeploymentTemplates(
  connection: CloudConnection,
  brokerPrincipalArn: string,
  exportLocation: { bucket: string; prefix: string }
): CloudConnectionDeploymentTemplates {
  const roleName = customerRoleName(connection.readOnlyPrincipal);
  return {
    cloudFormation: {
      fileName: 'costalyx-aws-readonly-role.yaml',
      format: 'cloudformation-yaml',
      body: buildAwsCloudFormationTemplate({
        roleName,
        brokerPrincipalArn,
        externalId: connection.externalId,
        bucket: exportLocation.bucket,
        prefix: exportLocation.prefix
      })
    },
    terraform: {
      fileName: 'costalyx_aws_readonly_role.tf',
      format: 'terraform-hcl',
      body: buildAwsTerraformTemplate({
        roleName,
        brokerPrincipalArn,
        externalId: connection.externalId,
        bucket: exportLocation.bucket,
        prefix: exportLocation.prefix
      })
    }
  };
}

function customerRoleName(roleArn: string): string {
  const rolePath = /^arn:aws:iam::\d{12}:role\/(.+)$/.exec(roleArn)?.[1];
  const roleSegments = rolePath?.split('/').filter(Boolean) ?? [];
  const roleName = roleSegments.length > 0 ? roleSegments[roleSegments.length - 1] : 'CostalyxReadOnlyBilling';
  return /^[\w+=,.@-]{1,64}$/.test(roleName) ? roleName : 'CostalyxReadOnlyBilling';
}

function buildAwsCloudFormationTemplate(input: {
  roleName: string;
  brokerPrincipalArn: string;
  externalId: string;
  bucket: string;
  prefix: string;
}): string {
  return [
    "AWSTemplateFormatVersion: '2010-09-09'",
    'Description: Customer-managed Costalyx readonly IAM role for AWS billing exports.',
    'Parameters:',
    '  CostalyxRoleName:',
    '    Type: String',
    `    Default: ${yamlQuote(input.roleName)}`,
    '    MinLength: 1',
    '    MaxLength: 64',
    "    AllowedPattern: '^[A-Za-z0-9+=,.@_-]+$'",
    '  CostalyxBrokerPrincipalArn:',
    '    Type: String',
    `    Default: ${yamlQuote(input.brokerPrincipalArn)}`,
    '  CostalyxExternalId:',
    '    Type: String',
    `    Default: ${yamlQuote(input.externalId)}`,
    '  CurBucketName:',
    '    Type: String',
    `    Default: ${yamlQuote(input.bucket)}`,
    '  CurPrefix:',
    '    Type: String',
    `    Default: ${yamlQuote(input.prefix)}`,
    'Conditions:',
    "  HasCurPrefix: !Not [!Equals [!Ref CurPrefix, '']]",
    'Resources:',
    '  CostalyxReadOnlyBillingRole:',
    '    Type: AWS::IAM::Role',
    '    Properties:',
    '      RoleName: !Ref CostalyxRoleName',
    '      Description: Read-only Costalyx access to AWS Cost and Usage Report exports.',
    '      AssumeRolePolicyDocument:',
    "        Version: '2012-10-17'",
    '        Statement:',
    '          - Effect: Allow',
    '            Principal:',
    '              AWS: !Ref CostalyxBrokerPrincipalArn',
    '            Action: sts:AssumeRole',
    '            Condition:',
    '              StringEquals:',
    '                sts:ExternalId: !Ref CostalyxExternalId',
    '      Policies:',
    '        - PolicyName: CostalyxCurReadOnly',
    '          PolicyDocument:',
    "            Version: '2012-10-17'",
    '            Statement:',
    '              - Sid: CostalyxListBillingExportPrefix',
    '                Effect: Allow',
    '                Action: s3:ListBucket',
    "                Resource: !Sub 'arn:aws:s3:::${CurBucketName}'",
    '                Condition: !If',
    '                  - HasCurPrefix',
    '                  - StringLike:',
    '                      s3:prefix:',
    "                        - !Sub '${CurPrefix}*'",
    '                  - !Ref AWS::NoValue',
    '              - Sid: CostalyxReadBillingExportObjects',
    '                Effect: Allow',
    '                Action: s3:GetObject',
    '                Resource: !If',
    '                  - HasCurPrefix',
    "                  - !Sub 'arn:aws:s3:::${CurBucketName}/${CurPrefix}*'",
    "                  - !Sub 'arn:aws:s3:::${CurBucketName}/*'",
    'Outputs:',
    '  CostalyxReadOnlyRoleArn:',
    '    Description: Return this role ARN to Costalyx as the readOnlyPrincipal.',
    '    Value: !GetAtt CostalyxReadOnlyBillingRole.Arn'
  ].join('\n');
}

function buildAwsTerraformTemplate(input: {
  roleName: string;
  brokerPrincipalArn: string;
  externalId: string;
  bucket: string;
  prefix: string;
}): string {
  return [
    'terraform {',
    '  required_version = ">= 1.5.0"',
    '',
    '  required_providers {',
    '    aws = {',
    '      source  = "hashicorp/aws"',
    '      version = "~> 5.0"',
    '    }',
    '  }',
    '}',
    '',
    'provider "aws" {}',
    '',
    'variable "costalyx_role_name" {',
    '  description = "Customer IAM role name that Costalyx assumes for readonly billing ingestion."',
    '  type        = string',
    `  default     = ${hclQuote(input.roleName)}`,
    '',
    '  validation {',
    '    condition     = length(var.costalyx_role_name) > 0 && length(var.costalyx_role_name) <= 64',
    '    error_message = "costalyx_role_name must be 1-64 characters."',
    '  }',
    '}',
    '',
    'variable "costalyx_broker_principal_arn" {',
    '  description = "Costalyx broker IAM principal allowed to assume the readonly billing role."',
    '  type        = string',
    `  default     = ${hclQuote(input.brokerPrincipalArn)}`,
    '}',
    '',
    'variable "costalyx_external_id" {',
    '  description = "Costalyx-generated external ID for this tenant and cloud connection."',
    '  type        = string',
    `  default     = ${hclQuote(input.externalId)}`,
    '}',
    '',
    'variable "cur_bucket_name" {',
    '  description = "S3 bucket containing the Cost and Usage Report export."',
    '  type        = string',
    `  default     = ${hclQuote(input.bucket)}`,
    '}',
    '',
    'variable "cur_prefix" {',
    '  description = "S3 prefix containing the Cost and Usage Report export objects."',
    '  type        = string',
    `  default     = ${hclQuote(input.prefix)}`,
    '}',
    '',
    'data "aws_iam_policy_document" "costalyx_assume_role" {',
    '  statement {',
    '    effect  = "Allow"',
    '    actions = ["sts:AssumeRole"]',
    '',
    '    principals {',
    '      type        = "AWS"',
    '      identifiers = [var.costalyx_broker_principal_arn]',
    '    }',
    '',
    '    condition {',
    '      test     = "StringEquals"',
    '      variable = "sts:ExternalId"',
    '      values   = [var.costalyx_external_id]',
    '    }',
    '  }',
    '}',
    '',
    'resource "aws_iam_role" "costalyx_readonly_billing" {',
    '  name               = var.costalyx_role_name',
    '  description        = "Read-only Costalyx access to AWS Cost and Usage Report exports."',
    '  assume_role_policy = data.aws_iam_policy_document.costalyx_assume_role.json',
    '',
    '  tags = {',
    '    ManagedBy = "CostalyxCustomerTerraform"',
    '    Purpose   = "CostalyxReadOnlyBilling"',
    '  }',
    '}',
    '',
    'data "aws_iam_policy_document" "costalyx_cur_readonly" {',
    '  statement {',
    '    sid       = "CostalyxListBillingExportPrefix"',
    '    effect    = "Allow"',
    '    actions   = ["s3:ListBucket"]',
    '    resources = ["arn:aws:s3:::${var.cur_bucket_name}"]',
    '',
    '    dynamic "condition" {',
    '      for_each = var.cur_prefix == "" ? [] : [var.cur_prefix]',
    '      content {',
    '        test     = "StringLike"',
    '        variable = "s3:prefix"',
    '        values   = ["${condition.value}*"]',
    '      }',
    '    }',
    '  }',
    '',
    '  statement {',
    '    sid     = "CostalyxReadBillingExportObjects"',
    '    effect  = "Allow"',
    '    actions = ["s3:GetObject"]',
    '    resources = [',
    '      var.cur_prefix == "" ?',
    '      "arn:aws:s3:::${var.cur_bucket_name}/*" :',
    '      "arn:aws:s3:::${var.cur_bucket_name}/${var.cur_prefix}*"',
    '    ]',
    '  }',
    '}',
    '',
    'resource "aws_iam_role_policy" "costalyx_cur_readonly" {',
    '  name   = "CostalyxCurReadOnly"',
    '  role   = aws_iam_role.costalyx_readonly_billing.id',
    '  policy = data.aws_iam_policy_document.costalyx_cur_readonly.json',
    '}',
    '',
    'output "costalyx_readonly_role_arn" {',
    '  description = "Return this role ARN to Costalyx as the readOnlyPrincipal."',
    '  value       = aws_iam_role.costalyx_readonly_billing.arn',
    '}'
  ].join('\n');
}

function yamlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function hclQuote(value: string): string {
  return JSON.stringify(value);
}
