import { pathToFileURL } from 'node:url';

const PROVIDER_ORDER = ['aws', 'azure', 'gcp'];

const PROVIDER_CONFIG = {
  aws: {
    command: 'npm run probe:aws-live',
    variables: [
      {
        name: 'COSTALYX_AWS_CUSTOMER_ACCOUNT_ID',
        validate: (value) => (/^\d{12}$/.test(value) ? null : 'must be a 12-digit AWS account ID')
      },
      {
        name: 'COSTALYX_AWS_READONLY_ROLE_ARN',
        validate: (value, env) => {
          const match = value.match(/^arn:aws(?:-[a-z]+)?:iam::(\d{12}):role\/[A-Za-z0-9+=,.@_/-]+$/);
          if (!match) {
            return 'must be an IAM role ARN for the customer read-only billing role';
          }
          const accountId = readEnv(env, 'COSTALYX_AWS_CUSTOMER_ACCOUNT_ID');
          if (accountId && accountId !== match[1]) {
            return 'role ARN account must match COSTALYX_AWS_CUSTOMER_ACCOUNT_ID';
          }
          return null;
        }
      },
      {
        name: 'COSTALYX_AWS_CUR_S3_URI',
        validate: (value) => {
          if (!value.startsWith('s3://')) {
            return 'must be an unsigned s3:// billing export prefix';
          }
          if (/[?&]/.test(value) || /X-Amz-|AWSAccessKeyId|Signature=/i.test(value)) {
            return 'must not include signed URL query material';
          }
          const path = value.slice('s3://'.length);
          const bucket = path.split('/')[0] ?? '';
          if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
            return 'must include a valid S3 bucket name';
          }
          return null;
        }
      }
    ],
    brokerIdentity: (env) => {
      const sources = [];
      const warnings = [];
      const blockers = [];

      if (readEnv(env, 'AWS_PROFILE')) {
        sources.push('AWS_PROFILE');
      }
      if (readEnv(env, 'AWS_WEB_IDENTITY_TOKEN_FILE') && readEnv(env, 'AWS_ROLE_ARN')) {
        sources.push('AWS_WEB_IDENTITY_TOKEN_FILE+AWS_ROLE_ARN');
      }
      if (readEnv(env, 'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI') || readEnv(env, 'AWS_CONTAINER_CREDENTIALS_FULL_URI')) {
        sources.push('AWS_CONTAINER_CREDENTIALS');
      }
      if (readEnv(env, 'AWS_ACCESS_KEY_ID') && readEnv(env, 'AWS_SECRET_ACCESS_KEY')) {
        sources.push('AWS_ENV_STATIC_CREDENTIALS');
        warnings.push('Prefer workload identity, profile, or container credentials over static AWS environment keys.');
      }

      if (sources.length === 0) {
        blockers.push(
          'Costalyx AWS broker identity is missing; configure AWS_PROFILE, AWS web identity, container credentials, or an operator-approved broker credential source.'
        );
      }

      return { ready: blockers.length === 0, sources, warnings, blockers };
    }
  },
  azure: {
    command: 'npm run probe:azure-live',
    variables: [
      {
        name: 'COSTALYX_AZURE_BILLING_SCOPE_ID',
        validate: (value) => {
          if (/[?&]/.test(value) || looksSecretShaped(value)) {
            return 'must be an Azure billing/subscription/management-group scope reference, not credential material';
          }
          return null;
        }
      },
      {
        name: 'COSTALYX_AZURE_DELEGATED_PRINCIPAL_ID',
        validate: (value) =>
          isUuid(value) ? null : 'must be the delegated Costalyx broker principal object/application ID'
      },
      {
        name: 'COSTALYX_AZURE_EXPORT_BLOB_URI',
        validate: (value) => {
          let parsed;
          try {
            parsed = new URL(value);
          } catch {
            return 'must be an unsigned HTTPS Azure Blob export prefix';
          }
          if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.blob.core.windows.net')) {
            return 'must be an unsigned HTTPS Azure Blob export prefix';
          }
          if (parsed.search || /sig=|sv=|se=|sp=|skoid=|sktid=/i.test(value)) {
            return 'must not include SAS query material';
          }
          return null;
        }
      }
    ],
    brokerIdentity: (env) => {
      const sources = [];
      const warnings = [];
      const blockers = [];

      if (readEnv(env, 'AZURE_CLIENT_SECRET')) {
        blockers.push('AZURE_CLIENT_SECRET is not accepted for the readiness path; use managed identity or workload identity federation.');
      }
      if (readEnv(env, 'AZURE_FEDERATED_TOKEN_FILE') && readEnv(env, 'AZURE_CLIENT_ID') && readEnv(env, 'AZURE_TENANT_ID')) {
        sources.push('AZURE_WORKLOAD_IDENTITY');
      }
      if (readEnv(env, 'IDENTITY_ENDPOINT') || readEnv(env, 'MSI_ENDPOINT')) {
        sources.push('AZURE_MANAGED_IDENTITY');
      }
      if (readEnv(env, 'AZURE_CONFIG_DIR')) {
        sources.push('AZURE_CLI_CACHE');
        warnings.push('Azure CLI cache is acceptable for a local operator probe; production should use managed or workload identity.');
      }
      if (sources.length === 0) {
        blockers.push(
          'Costalyx Azure broker identity is missing; configure managed identity, workload identity federation, or an operator-approved Azure CLI login for local probing.'
        );
      }

      return { ready: blockers.length === 0, sources, warnings, blockers };
    }
  },
  gcp: {
    command: 'npm run probe:gcp-live',
    variables: [
      {
        name: 'COSTALYX_GCP_BILLING_RESOURCE_ID',
        validate: (value) =>
          /^billingAccounts\/[A-Za-z0-9-]+$/.test(value)
            ? null
            : 'must be a GCP billing account resource such as billingAccounts/123456-ABCDEF-123456'
      },
      {
        name: 'COSTALYX_GCP_WORKLOAD_IDENTITY_PROVIDER',
        validate: (value) =>
          /^projects\/\d+\/locations\/global\/workloadIdentityPools\/[A-Za-z0-9_-]+\/providers\/[A-Za-z0-9_-]+$/.test(value)
            ? null
            : 'must be a Workload Identity Federation provider resource path'
      },
      {
        name: 'COSTALYX_GCP_BIGQUERY_EXPORT_URI',
        validate: (value) =>
          /^bigquery:\/\/[A-Za-z0-9_-]+\.[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/.test(value)
            ? null
            : 'must be a bigquery://project.dataset.table billing export reference'
      },
      {
        name: 'COSTALYX_GCP_BIGQUERY_LOCATION',
        optional: true,
        validate: (value) =>
          /^[A-Za-z0-9_-]+$/.test(value) ? null : 'must be a BigQuery region or multi-region token'
      }
    ],
    brokerIdentity: (env) => {
      const sources = [];
      const blockers = [];

      const adcPath = readEnv(env, 'GOOGLE_APPLICATION_CREDENTIALS');
      if (adcPath) {
        if (looksInlineJson(adcPath) || looksSecretShaped(adcPath)) {
          blockers.push('GOOGLE_APPLICATION_CREDENTIALS must be a file path or runtime ADC source, not inline credential JSON or token material.');
        } else {
          sources.push('GOOGLE_APPLICATION_CREDENTIALS');
        }
      }
      if (readEnv(env, 'GCE_METADATA_HOST') || readEnv(env, 'GCP_METADATA_HOST') || readEnv(env, 'K_SERVICE')) {
        sources.push('GCP_RUNTIME_METADATA_IDENTITY');
      }
      if (readEnv(env, 'GOOGLE_OAUTH_ACCESS_TOKEN')) {
        blockers.push('GOOGLE_OAUTH_ACCESS_TOKEN is not accepted for the readiness path; use ADC or Workload Identity Federation.');
      }
      if (sources.length === 0) {
        blockers.push(
          'Costalyx GCP broker identity is missing; configure Application Default Credentials backed by Workload Identity Federation or a managed runtime identity.'
        );
      }

      return { ready: blockers.length === 0, sources, warnings: [], blockers };
    }
  }
};

export function buildReadinessReport(env = process.env) {
  const providers = selectProviders(env);
  const globalChecks = buildGlobalChecks(env, providers);
  const providerReports = providers.map((provider) => buildProviderReport(provider, env, globalChecks.tenantReady));
  const unknownProviders = readProviderScope(env).filter((provider) => !PROVIDER_ORDER.includes(provider));

  if (unknownProviders.length > 0) {
    globalChecks.blockers.push(`Unknown COSTALYX_LIVE_PROVIDERS entries: ${unknownProviders.join(', ')}`);
  }

  const ready = globalChecks.blockers.length === 0 && providerReports.every((provider) => provider.ready);

  return {
    ready,
    providerScope: providers,
    global: globalChecks,
    providers: providerReports,
    nextCommands: providerReports.filter((provider) => provider.ready).map((provider) => provider.command),
    securityNotes: [
      'Customers should provide only read-only role/principal/export references; do not collect customer access keys, client secrets, service-account JSON, SAS URLs, signed URLs, passwords, or private keys.',
      'This readiness report intentionally prints variable names and credential-source types only; run the provider-specific probe commands to validate real cloud access.',
      'A provider is not production-validated until its live probe exits 0 and the resulting sanitized evidence is recorded in PROGRESS.md.'
    ]
  };
}

function buildGlobalChecks(env, providers) {
  const tenantValue = readEnv(env, 'COSTALYX_TENANT_ID');
  const blockers = [];
  let tenantStatus = 'present';

  if (!tenantValue) {
    tenantStatus = 'missing';
    blockers.push('COSTALYX_TENANT_ID is required for tenant-scoped live cloud validation.');
  } else if (looksSecretShaped(tenantValue) || looksInlineJson(tenantValue)) {
    tenantStatus = 'unsafe';
    blockers.push('COSTALYX_TENANT_ID looks like credential material; provide the tenant ID/reference only.');
  }

  return {
    tenantId: { name: 'COSTALYX_TENANT_ID', status: tenantStatus },
    providersRequested: providers,
    tenantReady: tenantStatus === 'present',
    blockers
  };
}

function buildProviderReport(provider, env, tenantReady) {
  const config = PROVIDER_CONFIG[provider];
  const references = config.variables.map((variable) => buildReferenceCheck(variable, env));
  const brokerIdentity = config.brokerIdentity(env);
  const blockers = [
    ...references
      .filter((reference) => reference.status !== 'present' && reference.status !== 'optional_missing')
      .map((reference) => `${reference.name}: ${reference.reason}`),
    ...brokerIdentity.blockers
  ];

  if (!tenantReady) {
    blockers.unshift('COSTALYX_TENANT_ID must be present before provider live validation.');
  }

  return {
    provider,
    ready: blockers.length === 0,
    command: config.command,
    requiredReferences: references,
    brokerIdentity: {
      ready: brokerIdentity.ready,
      sources: brokerIdentity.sources,
      warnings: brokerIdentity.warnings
    },
    blockers
  };
}

function buildReferenceCheck(variable, env) {
  const value = readEnv(env, variable.name);
  if (!value) {
    return {
      name: variable.name,
      status: variable.optional ? 'optional_missing' : 'missing',
      reason: variable.optional ? 'optional' : 'required reference is missing'
    };
  }

  const unsafeReason = looksInlineJson(value)
    ? 'must not contain inline JSON credential material'
    : looksSecretShaped(value)
      ? 'must not contain token, key, password, or private credential material'
      : null;
  const validationReason = unsafeReason ?? variable.validate(value, env);

  if (validationReason) {
    return { name: variable.name, status: 'unsafe', reason: validationReason };
  }

  return { name: variable.name, status: 'present' };
}

function selectProviders(env) {
  const requested = readProviderScope(env);
  const scoped = requested.filter((provider) => PROVIDER_ORDER.includes(provider));
  if (requested.length > 0) {
    return [...new Set(scoped)];
  }

  const detected = PROVIDER_ORDER.filter((provider) =>
    PROVIDER_CONFIG[provider].variables.some((variable) => readEnv(env, variable.name))
  );
  return detected.length > 0 ? detected : PROVIDER_ORDER;
}

function readProviderScope(env) {
  return readEnv(env, 'COSTALYX_LIVE_PROVIDERS')
    .split(',')
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean);
}

function readEnv(env, name) {
  return String(env[name] ?? '').trim();
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function looksInlineJson(value) {
  const trimmed = value.trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) || /"private_key"|"client_email"|"client_secret"/i.test(trimmed);
}

function looksSecretShaped(value) {
  const trimmed = value.trim();
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(trimmed)) {
    return true;
  }
  if (/\b(secret_access_key|client_secret|access_token|refresh_token|password|private_key)\b/i.test(trimmed)) {
    return true;
  }
  if (/^(?:eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(trimmed)) {
    return true;
  }
  if (/^(?:AKIA|ASIA)[A-Z0-9]{16}$/.test(trimmed)) {
    return true;
  }
  return /^[A-Za-z0-9+/]{96,}={0,2}$/.test(trimmed);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = buildReadinessReport(process.env);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ready ? 0 : 2;
}
