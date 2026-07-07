import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

export const DEFAULT_LOCAL_DATABASE_URL =
  'postgresql://costalyx:CHANGE_ME_DEV_ONLY@localhost:5432/costalyx_dev';
export const DEFAULT_TENANT_ID = '00000000-0000-4000-8000-000000000001';
export const SECONDARY_TENANT_ID = '11111111-1111-4111-8111-111111111111';

const fixedNow = '2026-06-30T12:00:00.000Z';
const periodStart = '2026-06-01T00:00:00.000Z';
const periodEnd = '2026-07-01T00:00:00.000Z';

export function stableId(input) {
  const hash = createHash('sha256').update(input).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32)
  ].join('-');
}

export function buildDemoDataset() {
  const tenants = [
    {
      id: DEFAULT_TENANT_ID,
      name: 'Costalyx Demo Org',
      slug: 'default',
      plan: 'business'
    },
    {
      id: SECONDARY_TENANT_ID,
      name: 'Acme Sandbox Subsidiary',
      slug: 'acme-sandbox',
      plan: 'business'
    }
  ];

  const users = [
    user(DEFAULT_TENANT_ID, 'admin@costalyx.demo', 'Aisha Admin', ['admin', 'analyst', 'viewer']),
    user(DEFAULT_TENANT_ID, 'analyst@costalyx.demo', 'Omar Analyst', ['analyst', 'viewer']),
    user(DEFAULT_TENANT_ID, 'viewer@costalyx.demo', 'Mina Viewer', ['viewer']),
    user(SECONDARY_TENANT_ID, 'admin@acme-sandbox.demo', 'Nora Subsidiary Admin', ['admin', 'viewer'])
  ];

  const cloudConnections = [
    cloudConnection(DEFAULT_TENANT_ID, 'aws', 'AWS Production Billing', '123456789012', {
      principal: 'arn:aws:iam::123456789012:role/CostalyxReadOnlyBilling',
      exportUri: 's3://costalyx-demo-cur/aws/2026/',
      code: 'ready_for_live_probe',
      message: 'Demo references are shaped correctly. Run aws live probe after real broker credentials are configured.'
    }),
    cloudConnection(DEFAULT_TENANT_ID, 'azure', 'Azure Platform Subscription', '33333333-3333-4333-8333-333333333333', {
      principal: '44444444-4444-4444-8444-444444444444',
      exportUri: 'https://costalyxdemo.blob.core.windows.net/billing/exports/',
      code: 'ready_for_live_probe',
      message: 'Demo references are shaped correctly. Run azure live probe after real broker credentials are configured.'
    }),
    cloudConnection(DEFAULT_TENANT_ID, 'gcp', 'GCP Shared Billing Account', 'billingAccounts/123456-ABCDEF-123456', {
      principal: 'projects/123456789/locations/global/workloadIdentityPools/costalyx/providers/billing',
      exportUri: 'bigquery://costalyx-demo-billing.billing_export.gcp_billing_export_v1',
      code: 'ready_for_live_probe',
      message: 'Demo references are shaped correctly. Run gcp live probe after real broker credentials are configured.'
    }),
    cloudConnection(SECONDARY_TENANT_ID, 'aws', 'Acme Sandbox AWS', '210987654321', {
      principal: 'arn:aws:iam::210987654321:role/CostalyxReadOnlyBilling',
      exportUri: 's3://acme-sandbox-cur/costalyx/',
      code: 'ready_for_live_probe',
      message: 'Secondary tenant demo reference for tenant-isolation testing.'
    })
  ];

  const accounts = [
    account(DEFAULT_TENANT_ID, 'aws', '123456789012', 'AWS Production Account'),
    account(DEFAULT_TENANT_ID, 'azure', 'sub-prod-001', 'Azure Platform Subscription'),
    account(DEFAULT_TENANT_ID, 'gcp', 'project-prod-001', 'GCP Production Project'),
    account(SECONDARY_TENANT_ID, 'aws', '210987654321', 'Acme Sandbox Account')
  ].map((item) => ({
    ...item,
    cloudConnectionId: connectionId(item.tenantId, item.provider, item.provider === 'aws' && item.tenantId === SECONDARY_TENANT_ID
      ? '210987654321'
      : item.provider === 'aws'
        ? '123456789012'
        : item.provider === 'azure'
          ? '33333333-3333-4333-8333-333333333333'
          : 'billingAccounts/123456-ABCDEF-123456')
  }));

  const batches = [
    ingestionBatch(DEFAULT_TENANT_ID, 'aws', 'demo://aws-cur/2026-06', 'aws'),
    ingestionBatch(DEFAULT_TENANT_ID, 'azure', 'demo://azure-cost-export/2026-06', 'azure'),
    ingestionBatch(DEFAULT_TENANT_ID, 'gcp', 'demo://gcp-bigquery-export/2026-06', 'gcp'),
    ingestionBatch(SECONDARY_TENANT_ID, 'aws', 'demo://acme-sandbox/aws-cur/2026-06', 'aws')
  ];

  const costRecords = [
    costRecord(DEFAULT_TENANT_ID, 'aws', '123456789012', 'i-aws-prod-001', 'Amazon EC2', 'BoxUsage:t3.medium', 'on_demand', 'Usage', '0.03500000', '730.0000', '2026-05-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z', 'aws'),
    costRecord(DEFAULT_TENANT_ID, 'aws', '123456789012', 'i-aws-prod-001', 'Amazon EC2', 'BoxUsage:t3.medium', 'on_demand', 'Usage', '0.04160000', '730.0000', periodStart, periodEnd, 'aws'),
    costRecord(DEFAULT_TENANT_ID, 'aws', '123456789012', 'i-aws-spot-002', 'Amazon EC2', 'SpotUsage:t3.small', 'spot', 'Usage', '0.00500000', '200.0000', periodStart, periodEnd, 'aws', true),
    costRecord(DEFAULT_TENANT_ID, 'aws', '123456789012', 'db-prod-001', 'Amazon RDS', 'InstanceUsage:db.t4g.medium', 'reserved', 'RecurringFee', '0.06800000', '730.0000', periodStart, periodEnd, 'aws'),
    costRecord(DEFAULT_TENANT_ID, 'aws', '123456789012', 's3-lake-001', 'Amazon S3', 'TimedStorage-ByteHrs', 'on_demand', 'Usage', '0.01200000', '730.0000', periodStart, periodEnd, 'aws'),
    costRecord(DEFAULT_TENANT_ID, 'azure', 'sub-prod-001', '/subscriptions/sub-prod-001/resourceGroups/rg-prod/providers/Microsoft.Compute/virtualMachines/vm-prod-001', 'Azure Virtual Machines', 'Virtual Machines', 'on_demand', 'Usage', '0.09600000', '720.0000', periodStart, periodEnd, 'azure'),
    costRecord(DEFAULT_TENANT_ID, 'azure', 'sub-prod-001', '/subscriptions/sub-prod-001/resourceGroups/rg-prod/providers/Microsoft.Compute/virtualMachines/vm-spot-002', 'Azure Virtual Machines', 'Virtual Machines', 'spot', 'Usage', '0.01200000', '180.0000', periodStart, periodEnd, 'azure', true),
    costRecord(DEFAULT_TENANT_ID, 'azure', 'sub-prod-001', '/subscriptions/sub-prod-001/resourceGroups/rg-prod/providers/Microsoft.Storage/storageAccounts/platformlogs', 'Azure Blob Storage', 'Blob Storage', 'on_demand', 'Usage', '0.01800000', '730.0000', periodStart, periodEnd, 'azure'),
    costRecord(DEFAULT_TENANT_ID, 'gcp', 'project-prod-001', '//compute.googleapis.com/projects/project-prod-001/zones/us-central1-a/instances/vm-prod-001', 'Compute Engine', 'N1 Instance Core', 'on_demand', 'Usage', '0.04750000', '720.0000', periodStart, periodEnd, 'gcp'),
    costRecord(DEFAULT_TENANT_ID, 'gcp', 'project-prod-001', '//compute.googleapis.com/projects/project-prod-001/zones/us-central1-a/instances/vm-preemptible-002', 'Compute Engine', 'Preemptible N1 Instance Core', 'spot', 'Usage', '0.01000000', '200.0000', periodStart, periodEnd, 'gcp', true),
    costRecord(DEFAULT_TENANT_ID, 'gcp', 'project-prod-001', 'bigquery://project-prod-001.finops.warehouse_jobs', 'BigQuery', 'Analysis Slots', 'on_demand', 'Usage', '0.04000000', '100.0000', periodStart, periodEnd, 'gcp'),
    costRecord(SECONDARY_TENANT_ID, 'aws', '210987654321', 'i-acme-sandbox-001', 'Amazon EC2', 'BoxUsage:t3.micro', 'on_demand', 'Usage', '0.01040000', '120.0000', periodStart, periodEnd, 'aws')
  ];

  const accountGroups = [
    accountGroup(DEFAULT_TENANT_ID, 'Platform Engineering', [
      accountId(DEFAULT_TENANT_ID, 'aws', '123456789012'),
      accountId(DEFAULT_TENANT_ID, 'azure', 'sub-prod-001'),
      accountId(DEFAULT_TENANT_ID, 'gcp', 'project-prod-001')
    ]),
    accountGroup(DEFAULT_TENANT_ID, 'Shared Services', [accountId(DEFAULT_TENANT_ID, 'aws', '123456789012')]),
    accountGroup(SECONDARY_TENANT_ID, 'Sandbox Engineering', [accountId(SECONDARY_TENANT_ID, 'aws', '210987654321')])
  ];

  const dimensions = [
    dimension(DEFAULT_TENANT_ID, 'Cost Center', users[0].id),
    dimension(DEFAULT_TENANT_ID, 'Environment', users[0].id)
  ];
  const dimensionMappings = [
    dimensionMapping(dimensions[0].id, 'cost_center', 'platform'),
    dimensionMapping(dimensions[0].id, 'cost_center', 'data'),
    dimensionMapping(dimensions[1].id, 'environment', 'production')
  ];

  const resourceTags = [
    resourceTag(DEFAULT_TENANT_ID, 'i-aws-prod-001', 'cost_center', 'platform'),
    resourceTag(DEFAULT_TENANT_ID, 'i-aws-prod-001', 'environment', 'production'),
    resourceTag(DEFAULT_TENANT_ID, 'i-aws-spot-002', 'cost_center', 'platform'),
    resourceTag(DEFAULT_TENANT_ID, 'db-prod-001', 'cost_center', 'data'),
    resourceTag(DEFAULT_TENANT_ID, 's3-lake-001', 'cost_center', 'data'),
    resourceTag(DEFAULT_TENANT_ID, '/subscriptions/sub-prod-001/resourceGroups/rg-prod/providers/Microsoft.Compute/virtualMachines/vm-prod-001', 'cost_center', 'platform'),
    resourceTag(DEFAULT_TENANT_ID, '/subscriptions/sub-prod-001/resourceGroups/rg-prod/providers/Microsoft.Compute/virtualMachines/vm-spot-002', 'cost_center', 'platform'),
    resourceTag(DEFAULT_TENANT_ID, '/subscriptions/sub-prod-001/resourceGroups/rg-prod/providers/Microsoft.Storage/storageAccounts/platformlogs', 'cost_center', 'data'),
    resourceTag(DEFAULT_TENANT_ID, '//compute.googleapis.com/projects/project-prod-001/zones/us-central1-a/instances/vm-prod-001', 'cost_center', 'platform'),
    resourceTag(DEFAULT_TENANT_ID, '//compute.googleapis.com/projects/project-prod-001/zones/us-central1-a/instances/vm-preemptible-002', 'cost_center', 'platform'),
    resourceTag(DEFAULT_TENANT_ID, 'bigquery://project-prod-001.finops.warehouse_jobs', 'cost_center', 'data')
  ];

  const views = [
    savedView(DEFAULT_TENANT_ID, 'Executive Portfolio Rollup', users[0].id, {
      provider: 'all',
      periodStart,
      periodEnd
    }),
    savedView(DEFAULT_TENANT_ID, 'Platform Engineering View', users[0].id, {
      accountGroupId: accountGroups[0].id
    })
  ];

  const cloudConnectionRuns = cloudConnections.flatMap((connection) => [
    cloudConnectionRun(connection, 'validation', 'succeeded', {
      provider: connection.provider,
      connectionStatus: connection.status,
      code: connection.lastValidationCode,
      message: connection.lastValidationMessage,
      source: 'demo_seed'
    }),
    cloudConnectionRun(connection, 'ingestion', 'succeeded', {
      provider: connection.provider,
      source: 'demo_seed',
      ingestedRows: costRecords.filter((record) => record.cloudConnectionId === connection.id).length,
      duplicateRows: 0
    })
  ]);

  const recommendations = buildRecommendations(costRecords);
  const realizedSavings = recommendations
    .filter((recommendation) => recommendation.status === 'applied')
    .map((recommendation) => ({
      id: stableId(`realized-saving:${recommendation.tenantId}:${recommendation.id}`),
      tenantId: recommendation.tenantId,
      recommendationId: recommendation.id,
      appliedAt: '2026-06-27T15:30:00.000Z',
      baselineCostUsd: recommendation.baselineCostUsd,
      actualCostUsd: recommendation.actualCostUsd,
      deltaUsd: recommendation.deltaUsd,
      verificationSource: 'ingested_billing'
    }));

  const anomalies = buildAnomalies(costRecords);
  const stakeholders = [
    stakeholder(DEFAULT_TENANT_ID, 'Platform Engineering', 'platform-finance@example.test', 'Engineering owner', 'email'),
    stakeholder(DEFAULT_TENANT_ID, 'Data Platform', 'data-finance@example.test', 'Data owner', 'email'),
    stakeholder(DEFAULT_TENANT_ID, 'Executive Sponsor', 'cfo@example.test', 'Executive reviewer', 'none')
  ];
  const billingScopes = [
    billingScope(DEFAULT_TENANT_ID, stakeholders[0], 'account_group', accountGroups[0].id, 'Platform Engineering accounts', {
      accountIds: accountGroups[0].accountIds
    }),
    billingScope(DEFAULT_TENANT_ID, stakeholders[1], 'dimension', dimensions[0].id, 'Data tagged resources', {
      resourceIds: costRecords
        .filter((record) => ['db-prod-001', 's3-lake-001', '/subscriptions/sub-prod-001/resourceGroups/rg-prod/providers/Microsoft.Storage/storageAccounts/platformlogs', 'bigquery://project-prod-001.finops.warehouse_jobs'].includes(record.resourceId))
        .map((record) => record.resourceId)
    }),
    billingScope(DEFAULT_TENANT_ID, stakeholders[2], 'view', views[0].id, 'Executive portfolio view', {})
  ];
  const statements = buildStatements({ costRecords, stakeholders, anomalies });
  const agentRuns = buildAgentRuns({ anomalies, statements });
  const auditEntries = buildAuditEntries({ users, tenants, cloudConnections, statements });

  return {
    tenants,
    users,
    cloudConnections,
    accounts,
    accountGroups,
    batches,
    costRecords,
    dimensions,
    dimensionMappings,
    resourceTags,
    views,
    cloudConnectionRuns,
    recommendations,
    realizedSavings,
    anomalies,
    stakeholders,
    billingScopes,
    statements,
    agentRuns,
    auditEntries
  };
}

export function getMigrationFiles(root = process.cwd()) {
  const migrationsDir = join(root, 'backend', 'migrations');
  if (!existsSync(migrationsDir)) {
    throw new Error(`Migrations directory was not found at ${migrationsDir}`);
  }
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql') && !file.endsWith('.rollback.sql'))
    .sort()
    .map((file) => ({
      name: file,
      path: join(migrationsDir, file),
      sql: readFileSync(join(migrationsDir, file), 'utf8')
    }));
}

export function assertSafeToSeed(databaseUrl, env = process.env) {
  const appEnv = String(env.APP_ENV ?? '').toLowerCase();
  const nodeEnv = String(env.NODE_ENV ?? '').toLowerCase();
  const allow = String(env.COSTALYX_ALLOW_DEMO_SEED ?? '').toLowerCase() === 'true';
  const parsed = new URL(databaseUrl);
  const host = parsed.hostname.toLowerCase();
  const dbName = parsed.pathname.replace(/^\//, '');
  const isLocalHost = ['localhost', '127.0.0.1', '::1', 'postgres'].includes(host);
  const looksLocalDb = /(^|[_-])(dev|local|test|demo|sandbox)([_-]|$)/i.test(dbName);

  if (!allow && (appEnv === 'production' || nodeEnv === 'production')) {
    throw new Error('Refusing to seed demo data while APP_ENV or NODE_ENV is production. Set COSTALYX_ALLOW_DEMO_SEED=true only for an approved sandbox.');
  }
  if (!allow && (!isLocalHost || !looksLocalDb)) {
    throw new Error(
      `Refusing to seed ${host}/${dbName}. Use a local/dev/test/demo database or set COSTALYX_ALLOW_DEMO_SEED=true for an approved sandbox.`
    );
  }
}

export function summarizeDataset(dataset) {
  const defaultTenantRecords = dataset.costRecords.filter((record) => record.tenantId === DEFAULT_TENANT_ID);
  return {
    tenants: dataset.tenants.length,
    users: dataset.users.length,
    cloudConnections: dataset.cloudConnections.length,
    accounts: dataset.accounts.length,
    costRecords: dataset.costRecords.length,
    defaultTenantCostRecords: defaultTenantRecords.length,
    defaultTenantComputedTotalUsd: sumRecords(defaultTenantRecords),
    anomalies: dataset.anomalies.length,
    statements: dataset.statements.length,
    agentRuns: dataset.agentRuns.length
  };
}

async function applyMigrations(client, root = process.cwd()) {
  const migrations = getMigrationFiles(root);
  for (const migration of migrations) {
    await client.query(migration.sql);
  }
  return migrations.map((migration) => basename(migration.path));
}

async function seedDataset(client, dataset) {
  await client.query('BEGIN');
  try {
    await seedTenants(client, dataset.tenants);
    await resetDemoGeneratedState(
      client,
      dataset.tenants.map((tenant) => tenant.id),
      dataset.costRecords.map((record) => record.resourceId)
    );
    await seedUsers(client, dataset.users);
    await seedCloudConnections(client, dataset.cloudConnections);
    await seedAccounts(client, dataset.accounts);
    await seedAccountGroups(client, dataset.accountGroups);
    await seedBatches(client, dataset.batches);
    await seedCostRecords(client, dataset.costRecords);
    await seedDimensions(client, dataset.dimensions, dataset.dimensionMappings);
    await seedResourceTags(client, dataset.resourceTags);
    await seedViews(client, dataset.views);
    await seedCloudConnectionRuns(client, dataset.cloudConnectionRuns);
    await seedRecommendations(client, dataset.recommendations, dataset.realizedSavings);
    await seedAnomalies(client, dataset.anomalies);
    await seedStatements(client, dataset.stakeholders, dataset.billingScopes, dataset.statements);
    await seedAgentRuns(client, dataset.agentRuns);
    await seedAuditEntries(client, dataset.auditEntries);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function resetDemoGeneratedState(
  client,
  tenantIds = [DEFAULT_TENANT_ID, SECONDARY_TENANT_ID],
  resourceIds = []
) {
  await client.query('DELETE FROM statement_line_items WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
  await client.query('DELETE FROM statements WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
  await client.query('DELETE FROM billing_scopes WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
  await client.query('DELETE FROM stakeholders WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
  await client.query('DELETE FROM anomaly_suppressions WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
  await client.query('DELETE FROM anomalies WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
  await client.query('DELETE FROM agent_runs WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
  await client.query('DELETE FROM billing_agent_idempotency WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
  await client.query('DELETE FROM audit_log WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
  await client.query('DELETE FROM realized_savings WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
  await client.query('DELETE FROM recommendations WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
  await client.query('DELETE FROM optimization_idempotency WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
  await client.query('DELETE FROM cloud_connection_runs WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
  await client.query('DELETE FROM views WHERE org_id = ANY($1::uuid[])', [tenantIds]);
  await client.query(
    `DELETE FROM dimension_tag_mappings
     WHERE dimension_id IN (SELECT id FROM dimensions WHERE org_id = ANY($1::uuid[]))`,
    [tenantIds]
  );
  await client.query('DELETE FROM dimensions WHERE org_id = ANY($1::uuid[])', [tenantIds]);
  if (resourceIds.length > 0) {
    await client.query('DELETE FROM resource_tags WHERE resource_id = ANY($1::text[])', [resourceIds]);
  }
  await client.query(
    `DELETE FROM account_group_members
     WHERE account_group_id IN (SELECT id FROM account_groups WHERE tenant_id = ANY($1::uuid[]))
        OR account_id IN (SELECT id FROM accounts WHERE tenant_id = ANY($1::uuid[]))`,
    [tenantIds]
  );
  await client.query('DELETE FROM account_groups WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
  await client.query('DELETE FROM cloud_credentials WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
  await client.query('DELETE FROM cost_records WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
  await client.query('DELETE FROM ingestion_batches WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
  await client.query('DELETE FROM accounts WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
  await client.query('DELETE FROM cloud_connections WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
  await client.query('DELETE FROM governance_idempotency WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
  await client.query('DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE tenant_id = ANY($1::uuid[]))', [
    tenantIds
  ]);
  await client.query('DELETE FROM users WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
}

async function verifySeed(client) {
  const summary = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE tenant_id = $1)::int AS default_tenant_cost_records,
       COALESCE(SUM(hourly_rate_usd * usage_hours) FILTER (WHERE tenant_id = $1), 0)::numeric(18,8)::text AS default_tenant_cost_total_usd,
       COUNT(DISTINCT provider) FILTER (WHERE tenant_id = $1)::int AS default_tenant_providers
     FROM cost_records`,
    [DEFAULT_TENANT_ID]
  );
  const portfolio = await client.query(
    `SELECT provider, status, COUNT(*)::int AS count
     FROM cloud_connections
     GROUP BY provider, status
     ORDER BY provider, status`
  );
  const billing = await client.query(
    `SELECT
       (SELECT COUNT(*)::int FROM anomalies WHERE tenant_id = $1) AS anomalies,
       (SELECT COUNT(*)::int FROM statements WHERE tenant_id = $1) AS statements,
       (SELECT COUNT(*)::int FROM agent_runs WHERE tenant_id = $1) AS agent_runs,
       (SELECT COUNT(*)::int FROM tenants) AS tenants`,
    [DEFAULT_TENANT_ID]
  );
  return {
    ...summary.rows[0],
    ...billing.rows[0],
    cloudConnections: portfolio.rows
  };
}

async function seedTenants(client, tenants) {
  for (const tenant of tenants) {
    await client.query(
      `INSERT INTO tenants (id, name, slug, plan, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             slug = EXCLUDED.slug,
             plan = EXCLUDED.plan`,
      [tenant.id, tenant.name, tenant.slug, tenant.plan, fixedNow]
    );
  }
}

async function seedUsers(client, users) {
  for (const item of users) {
    await client.query(
      `INSERT INTO users (id, tenant_id, email, display_name, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE
         SET tenant_id = EXCLUDED.tenant_id,
             display_name = EXCLUDED.display_name`,
      [item.id, item.tenantId, tenantScopedValue(item.tenantId, item.email), item.displayName, fixedNow]
    );
    await client.query('DELETE FROM user_roles WHERE user_id = $1', [item.id]);
    for (const role of item.roles) {
      await client.query(
        `INSERT INTO user_roles (user_id, role_name, created_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, role_name) DO NOTHING`,
        [item.id, role, fixedNow]
      );
    }
  }
}

async function seedCloudConnections(client, cloudConnections) {
  for (const connection of cloudConnections) {
    await client.query(
      `INSERT INTO cloud_connections
         (id, tenant_id, provider, display_name, external_tenant_id, access_mode, read_only_principal,
          billing_export_uri, status, last_validated_at, last_validation_attempted_at,
          last_validation_code, last_validation_message, created_at)
       VALUES ($1, $2, $3, $4, $5, 'readonly_role', $6, $7, $8, NULL, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             access_mode = EXCLUDED.access_mode,
             read_only_principal = EXCLUDED.read_only_principal,
             billing_export_uri = EXCLUDED.billing_export_uri,
             status = EXCLUDED.status,
             last_validated_at = NULL,
             last_validation_attempted_at = EXCLUDED.last_validation_attempted_at,
             last_validation_code = EXCLUDED.last_validation_code,
             last_validation_message = EXCLUDED.last_validation_message`,
      [
        connection.id,
        connection.tenantId,
        connection.provider,
        connection.displayName,
        connection.externalTenantId,
        connection.readOnlyPrincipal,
        connection.billingExportUri,
        connection.status,
        connection.lastValidationAttemptedAt,
        connection.lastValidationCode,
        connection.lastValidationMessage,
        connection.createdAt
      ]
    );
  }
}

async function seedAccounts(client, accounts) {
  for (const item of accounts) {
    await client.query(
      `INSERT INTO accounts
         (id, tenant_id, provider, cloud_connection_id, external_account_id, display_name, vendor, created_at, vault_credential_path)
       VALUES ($1, $2, $3, $4, $5, $6, $3, $7, $8)
       ON CONFLICT (tenant_id, provider, external_account_id) DO UPDATE
         SET cloud_connection_id = EXCLUDED.cloud_connection_id,
             display_name = EXCLUDED.display_name,
             vault_credential_path = EXCLUDED.vault_credential_path`,
      [
        item.id,
        item.tenantId,
        item.provider,
        item.cloudConnectionId,
        tenantScopedValue(item.tenantId, item.externalAccountId),
        item.displayName,
        fixedNow,
        `secret/data/costalyx/demo/${item.tenantId}/${item.provider}/${item.externalAccountId}`
      ]
    );
  }
}

async function seedAccountGroups(client, groups) {
  for (const group of groups) {
    await client.query(
      `INSERT INTO account_groups (id, tenant_id, name, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE
         SET tenant_id = EXCLUDED.tenant_id,
             name = EXCLUDED.name`,
      [group.id, group.tenantId, group.name, fixedNow]
    );
    for (const accountIdValue of group.accountIds) {
      await client.query(
        `INSERT INTO account_group_members (account_group_id, account_id, created_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (account_group_id, account_id) DO NOTHING`,
        [group.id, accountIdValue, fixedNow]
      );
    }
  }
}

async function seedBatches(client, batches) {
  for (const batch of batches) {
    await client.query(
      `INSERT INTO ingestion_batches
         (id, tenant_id, provider, status, source_uri, cloud_connection_id, idempotency_key,
          created_at, completed_at, ingested_rows, duplicate_rows)
       VALUES ($1, $2, $3, 'complete', $4, $5, $6, $7, $7, $8, 0)
       ON CONFLICT (id) DO UPDATE
         SET source_uri = EXCLUDED.source_uri,
             cloud_connection_id = EXCLUDED.cloud_connection_id,
             idempotency_key = EXCLUDED.idempotency_key,
             ingested_rows = EXCLUDED.ingested_rows,
             duplicate_rows = 0,
             status = 'complete'`,
      [
        batch.id,
        batch.tenantId,
        batch.provider,
        batch.sourceUri,
        batch.cloudConnectionId,
        tenantScopedValue(batch.tenantId, batch.idempotencyKey),
        batch.completedAt,
        batch.ingestedRows
      ]
    );
  }
}

async function seedCostRecords(client, records) {
  for (const record of records) {
    await client.query(
      `INSERT INTO cost_records
         (id, tenant_id, provider, cloud_connection_id, account_id, resource_id, service_name,
          usage_family, lease_type, transaction_type, hourly_rate_usd, usage_hours, is_estimate,
          valid_from, valid_to, ingested_at, source_batch_id, fingerprint)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       ON CONFLICT (fingerprint) DO UPDATE
         SET hourly_rate_usd = EXCLUDED.hourly_rate_usd,
             usage_hours = EXCLUDED.usage_hours,
             is_estimate = EXCLUDED.is_estimate,
             source_batch_id = EXCLUDED.source_batch_id`,
      [
        record.id,
        record.tenantId,
        record.provider,
        record.cloudConnectionId,
        record.accountId,
        record.resourceId,
        record.serviceName,
        record.usageFamily,
        record.leaseType,
        record.transactionType,
        record.hourlyRateUsd,
        record.usageHours,
        record.isEstimate,
        record.validFrom,
        record.validTo,
        record.ingestedAt,
        record.sourceBatchId,
        tenantScopedValue(record.tenantId, record.fingerprint)
      ]
    );
  }
}

async function seedDimensions(client, dimensions, mappings) {
  for (const item of dimensions) {
    await client.query(
      `INSERT INTO dimensions (id, org_id, name, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
         SET org_id = EXCLUDED.org_id,
             name = EXCLUDED.name,
             created_by = EXCLUDED.created_by`,
      [item.id, item.tenantId, item.name, item.createdBy, fixedNow]
    );
  }
  for (const mapping of mappings) {
    await client.query(
      `INSERT INTO dimension_tag_mappings (id, dimension_id, tag_key, tag_value_pattern, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
         SET tag_key = EXCLUDED.tag_key,
             tag_value_pattern = EXCLUDED.tag_value_pattern`,
      [mapping.id, mapping.dimensionId, mapping.tagKey, mapping.tagValuePattern, fixedNow]
    );
  }
}

async function seedResourceTags(client, tags) {
  for (const tag of tags) {
    await client.query(
      `INSERT INTO resource_tags (resource_id, tag_key, tag_value, source, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (resource_id, tag_key) DO UPDATE
         SET tag_value = EXCLUDED.tag_value,
             source = EXCLUDED.source,
             updated_at = EXCLUDED.updated_at`,
      [resourceTagStorageKey(tag.tenantId, tag.resourceId), tag.tagKey, tag.tagValue, tag.source, fixedNow]
    );
  }
}

async function seedViews(client, views) {
  for (const view of views) {
    await client.query(
      `INSERT INTO views (id, org_id, name, filter_json, owner_id, shared_role_scope, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             filter_json = EXCLUDED.filter_json,
             shared_role_scope = EXCLUDED.shared_role_scope`,
      [view.id, view.tenantId, view.name, JSON.stringify(view.filter), view.ownerId, view.sharedRoleScope, fixedNow]
    );
  }
}

async function seedCloudConnectionRuns(client, runs) {
  for (const run of runs) {
    await client.query(
      `INSERT INTO cloud_connection_runs
         (id, tenant_id, cloud_connection_id, run_type, status, started_at, completed_at, evidence_json, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $7)
       ON CONFLICT (id) DO UPDATE
         SET status = EXCLUDED.status,
             completed_at = EXCLUDED.completed_at,
             evidence_json = EXCLUDED.evidence_json`,
      [
        run.id,
        run.tenantId,
        run.cloudConnectionId,
        run.runType,
        run.status,
        run.startedAt,
        run.completedAt,
        JSON.stringify(run.evidence)
      ]
    );
  }
}

async function seedRecommendations(client, recommendations, realizedSavings) {
  for (const item of recommendations) {
    await client.query(
      `INSERT INTO recommendations
         (id, tenant_id, type, resource_id, estimated_savings_usd, status, created_at,
          baseline_cost_usd, actual_cost_usd, delta_usd, verification_source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ingested_billing')
       ON CONFLICT (tenant_id, id) DO UPDATE
         SET estimated_savings_usd = EXCLUDED.estimated_savings_usd,
             status = EXCLUDED.status,
             baseline_cost_usd = EXCLUDED.baseline_cost_usd,
             actual_cost_usd = EXCLUDED.actual_cost_usd,
             delta_usd = EXCLUDED.delta_usd`,
      [
        item.id,
        item.tenantId,
        item.type,
        item.resourceId,
        item.estimatedSavingsUsd,
        item.status,
        item.createdAt,
        item.baselineCostUsd,
        item.actualCostUsd,
        item.deltaUsd
      ]
    );
  }
  for (const item of realizedSavings) {
    await client.query(
      `INSERT INTO realized_savings
         (id, tenant_id, recommendation_id, applied_at, baseline_cost_usd, actual_cost_usd, delta_usd, verification_source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (tenant_id, recommendation_id) DO UPDATE
         SET baseline_cost_usd = EXCLUDED.baseline_cost_usd,
             actual_cost_usd = EXCLUDED.actual_cost_usd,
             delta_usd = EXCLUDED.delta_usd`,
      [
        item.id,
        item.tenantId,
        item.recommendationId,
        item.appliedAt,
        item.baselineCostUsd,
        item.actualCostUsd,
        item.deltaUsd,
        item.verificationSource
      ]
    );
  }
}

async function seedAnomalies(client, anomalies) {
  for (const anomaly of anomalies) {
    await client.query(
      `INSERT INTO anomalies
         (id, tenant_id, type, severity, status, detected_at, window_start, window_end,
          evidence_json, explanation_md, assigned_owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL)
       ON CONFLICT (tenant_id, id) DO UPDATE
         SET severity = EXCLUDED.severity,
             status = EXCLUDED.status,
             evidence_json = EXCLUDED.evidence_json,
             explanation_md = EXCLUDED.explanation_md`,
      [
        anomaly.id,
        anomaly.tenantId,
        anomaly.type,
        anomaly.severity,
        anomaly.status,
        anomaly.detectedAt,
        anomaly.windowStart,
        anomaly.windowEnd,
        JSON.stringify(anomaly.evidence),
        anomaly.explanationMd
      ]
    );
  }
}

async function seedStatements(client, stakeholders, scopes, statements) {
  for (const item of stakeholders) {
    await client.query(
      `INSERT INTO stakeholders (id, tenant_id, name, email, role_label, notification_channel, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tenant_id, email) DO UPDATE
         SET name = EXCLUDED.name,
             role_label = EXCLUDED.role_label,
             notification_channel = EXCLUDED.notification_channel`,
      [item.id, item.tenantId, item.name, item.email, item.roleLabel, item.notificationChannel, fixedNow]
    );
  }
  for (const scope of scopes) {
    await client.query(
      `INSERT INTO billing_scopes
         (id, tenant_id, stakeholder_id, scope_type, scope_ref, label, scope_filter_json, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (tenant_id, stakeholder_id, scope_type, scope_ref) DO UPDATE
         SET label = EXCLUDED.label,
             scope_filter_json = EXCLUDED.scope_filter_json`,
      [
        scope.id,
        scope.tenantId,
        scope.stakeholderId,
        scope.scopeType,
        scope.scopeRef,
        scope.label,
        JSON.stringify(scope.scopeFilter),
        fixedNow
      ]
    );
  }
  for (const statement of statements) {
    await client.query(
      `INSERT INTO statements
         (id, tenant_id, stakeholder_id, period_start, period_end, status, total_usd, generated_at,
          approved_by, sent_at, narrative_md, open_anomaly_count, reconciliation_json, scope_warnings_json,
          variance_json, dispute_json, send_evidence_json, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NULL, $16, $8)
       ON CONFLICT (id) DO UPDATE
         SET status = EXCLUDED.status,
             total_usd = EXCLUDED.total_usd,
             approved_by = EXCLUDED.approved_by,
             sent_at = EXCLUDED.sent_at,
             narrative_md = EXCLUDED.narrative_md,
             open_anomaly_count = EXCLUDED.open_anomaly_count,
             reconciliation_json = EXCLUDED.reconciliation_json,
             scope_warnings_json = EXCLUDED.scope_warnings_json,
             variance_json = EXCLUDED.variance_json,
             send_evidence_json = EXCLUDED.send_evidence_json`,
      [
        statement.id,
        statement.tenantId,
        statement.stakeholderId,
        statement.periodStart,
        statement.periodEnd,
        statement.status,
        statement.totalUsd,
        statement.generatedAt,
        statement.approvedBy,
        statement.sentAt,
        statement.narrativeMd,
        statement.openAnomalyCount,
        JSON.stringify(statement.reconciliation),
        JSON.stringify(statement.scopeWarnings),
        JSON.stringify(statement.varianceTopMovers),
        statement.sendEvidence ? JSON.stringify(statement.sendEvidence) : null
      ]
    );
    for (const lineItem of statement.lineItems) {
      await client.query(
        `INSERT INTO statement_line_items
           (id, tenant_id, statement_id, line_type, description, amount_usd, cost_record_ids, evidence_json, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE
           SET description = EXCLUDED.description,
               amount_usd = EXCLUDED.amount_usd,
               cost_record_ids = EXCLUDED.cost_record_ids,
               evidence_json = EXCLUDED.evidence_json`,
        [
          lineItem.id,
          lineItem.tenantId,
          lineItem.statementId,
          lineItem.lineType,
          lineItem.description,
          lineItem.amountUsd,
          lineItem.costRecordIds,
          JSON.stringify(lineItem.evidence),
          fixedNow
        ]
      );
    }
  }
}

async function seedAgentRuns(client, runs) {
  for (const run of runs) {
    await client.query(
      `INSERT INTO agent_runs
         (id, tenant_id, run_type, started_at, finished_at, inputs_summary_json,
          actions_taken_json, actions_proposed_json, errors_json, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $5)
       ON CONFLICT (id) DO UPDATE
         SET finished_at = EXCLUDED.finished_at,
             inputs_summary_json = EXCLUDED.inputs_summary_json,
             actions_taken_json = EXCLUDED.actions_taken_json,
             actions_proposed_json = EXCLUDED.actions_proposed_json,
             errors_json = EXCLUDED.errors_json`,
      [
        run.id,
        run.tenantId,
        run.runType,
        run.startedAt,
        run.finishedAt,
        JSON.stringify(run.inputsSummary),
        JSON.stringify(run.actionsTaken),
        JSON.stringify(run.actionsProposed),
        JSON.stringify(run.errors)
      ]
    );
  }
}

async function seedAuditEntries(client, entries) {
  for (const entry of entries) {
    await client.query(
      `INSERT INTO audit_log (id, tenant_id, actor_id, action, target_type, target_id, prev_hash, hash, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [entry.id, entry.tenantId, entry.actorId, entry.action, entry.targetType, entry.targetId, entry.hash, entry.createdAt]
    );
  }
}

function user(tenantId, email, displayName, roles) {
  return {
    id: stableId(`user:${tenantId}:${email.toLowerCase()}`),
    tenantId,
    email: email.toLowerCase(),
    displayName,
    roles
  };
}

function cloudConnection(tenantId, provider, displayName, externalTenantId, options) {
  return {
    id: connectionId(tenantId, provider, externalTenantId),
    tenantId,
    provider,
    displayName,
    externalTenantId,
    accessMode:
      provider === 'aws'
        ? 'aws_assume_role'
        : provider === 'azure'
          ? 'azure_delegated_app'
          : 'gcp_workload_identity',
    readOnlyPrincipal: options.principal,
    billingExportUri: options.exportUri,
    status: 'ready_for_live_probe',
    lastValidationAttemptedAt: '2026-06-30T10:00:00.000Z',
    lastValidationCode: options.code,
    lastValidationMessage: options.message,
    createdAt: '2026-06-01T08:00:00.000Z'
  };
}

function connectionId(tenantId, provider, externalTenantId) {
  return stableId(`cloud-connection:${tenantId}:${provider}:${externalTenantId}`);
}

function account(tenantId, provider, externalAccountId, displayName) {
  return {
    id: accountId(tenantId, provider, externalAccountId),
    tenantId,
    provider,
    externalAccountId,
    displayName
  };
}

function accountId(tenantId, provider, externalAccountId) {
  return stableId(`account:${tenantId}:${provider}:${externalAccountId}`);
}

function ingestionBatch(tenantId, provider, sourceUri, connectionProvider) {
  const cloudConnectionId = connectionForProvider(tenantId, connectionProvider);
  return {
    id: stableId(`batch:${tenantId}:${provider}:${sourceUri}:demo-seed-${provider}`),
    tenantId,
    provider,
    cloudConnectionId,
    sourceUri,
    idempotencyKey: `demo-seed-${provider}`,
    completedAt: fixedNow,
    ingestedRows: provider === 'aws' && tenantId === SECONDARY_TENANT_ID ? 1 : provider === 'aws' ? 5 : provider === 'azure' ? 3 : 3
  };
}

function connectionForProvider(tenantId, provider) {
  if (tenantId === SECONDARY_TENANT_ID) {
    return connectionId(SECONDARY_TENANT_ID, 'aws', '210987654321');
  }
  if (provider === 'aws') {
    return connectionId(DEFAULT_TENANT_ID, 'aws', '123456789012');
  }
  if (provider === 'azure') {
    return connectionId(DEFAULT_TENANT_ID, 'azure', '33333333-3333-4333-8333-333333333333');
  }
  return connectionId(DEFAULT_TENANT_ID, 'gcp', 'billingAccounts/123456-ABCDEF-123456');
}

function costRecord(
  tenantId,
  provider,
  externalAccountId,
  resourceId,
  serviceName,
  usageFamily,
  leaseType,
  transactionType,
  hourlyRateUsd,
  usageHours,
  validFrom,
  validTo,
  batchProvider,
  isEstimate = false
) {
  const fingerprint = `demo:${provider}:${externalAccountId}:${resourceId}:${validFrom}`;
  return {
    id: stableId(`cost-record:${tenantId}:${fingerprint}`),
    tenantId,
    provider,
    cloudConnectionId: connectionForProvider(tenantId, provider),
    accountId: accountId(tenantId, provider, externalAccountId),
    accountExternalId: externalAccountId,
    resourceId,
    serviceName,
    usageFamily,
    leaseType,
    transactionType,
    hourlyRateUsd,
    usageHours,
    costTotalUsd: multiplyMoney(hourlyRateUsd, usageHours, 8),
    costTotalUsdRoundedToCent: multiplyMoney(hourlyRateUsd, usageHours, 2),
    isEstimate,
    validFrom,
    validTo,
    ingestedAt: fixedNow,
    sourceBatchId: stableId(`batch:${tenantId}:${batchProvider}:demo://${batchProvider === 'aws' && tenantId === SECONDARY_TENANT_ID ? 'acme-sandbox/aws-cur' : batchProvider === 'aws' ? 'aws-cur' : batchProvider === 'azure' ? 'azure-cost-export' : 'gcp-bigquery-export'}/2026-06:demo-seed-${batchProvider}`),
    fingerprint
  };
}

function accountGroup(tenantId, name, accountIds) {
  return {
    id: stableId(`account-group:${tenantId}:${name}`),
    tenantId,
    name,
    accountIds
  };
}

function dimension(tenantId, name, createdBy) {
  return {
    id: stableId(`dimension:${tenantId}:${name}`),
    tenantId,
    name,
    createdBy
  };
}

function dimensionMapping(dimensionId, tagKey, tagValuePattern) {
  return {
    id: stableId(`dimension-mapping:${dimensionId}:${tagKey}:${tagValuePattern}`),
    dimensionId,
    tagKey,
    tagValuePattern
  };
}

function resourceTag(tenantId, resourceId, tagKey, tagValue) {
  return {
    tenantId,
    resourceId,
    tagKey,
    tagValue,
    source: 'provider'
  };
}

function savedView(tenantId, name, ownerId, filter) {
  return {
    id: stableId(`view:${tenantId}:${name}`),
    tenantId,
    name,
    ownerId,
    filter,
    sharedRoleScope: ['viewer', 'analyst', 'admin']
  };
}

function cloudConnectionRun(connection, runType, status, evidence) {
  return {
    id: stableId(`cloud-connection-run:${connection.id}:${runType}:${evidence.source}`),
    tenantId: connection.tenantId,
    cloudConnectionId: connection.id,
    runType,
    status,
    startedAt: '2026-06-30T10:00:00.000Z',
    completedAt: '2026-06-30T10:00:03.000Z',
    evidence
  };
}

function buildRecommendations(records) {
  const byResource = new Map(records.map((record) => [`${record.tenantId}:${record.resourceId}:${record.validFrom}`, record]));
  const awsEc2 = byResource.get(`${DEFAULT_TENANT_ID}:i-aws-prod-001:${periodStart}`);
  const rds = byResource.get(`${DEFAULT_TENANT_ID}:db-prod-001:${periodStart}`);
  const bigQuery = byResource.get(`${DEFAULT_TENANT_ID}:bigquery://project-prod-001.finops.warehouse_jobs:${periodStart}`);
  return [
    recommendation(DEFAULT_TENANT_ID, 'rightsizing', awsEc2.resourceId, 'open', '12.00000000', awsEc2.costTotalUsd, '18.36800000', '12.00000000'),
    recommendation(DEFAULT_TENANT_ID, 'commitment_coverage', rds.resourceId, 'applied', '10.00000000', rds.costTotalUsd, '39.64000000', '10.00000000'),
    recommendation(DEFAULT_TENANT_ID, 'idle_resource', bigQuery.resourceId, 'open', '2.00000000', bigQuery.costTotalUsd, '2.00000000', '2.00000000')
  ];
}

function recommendation(tenantId, type, resourceId, status, estimatedSavingsUsd, baselineCostUsd, actualCostUsd, deltaUsd) {
  return {
    id: stableId(`recommendation:${tenantId}:${type}:${resourceId}`),
    tenantId,
    type,
    resourceId,
    estimatedSavingsUsd,
    status,
    createdAt: '2026-06-25T10:00:00.000Z',
    baselineCostUsd,
    actualCostUsd,
    deltaUsd
  };
}

function buildAnomalies(records) {
  const may = records.find((record) => record.tenantId === DEFAULT_TENANT_ID && record.resourceId === 'i-aws-prod-001' && record.validFrom.startsWith('2026-05'));
  const june = records.find((record) => record.tenantId === DEFAULT_TENANT_ID && record.resourceId === 'i-aws-prod-001' && record.validFrom.startsWith('2026-06'));
  const azureVm = records.find((record) => record.resourceId.includes('vm-prod-001'));
  return [
    anomaly(DEFAULT_TENANT_ID, 'unit_price', 'high', [may, june], {
      percentChange: 18.86,
      priorHourlyRateUsd: may.hourlyRateUsd,
      currentHourlyRateUsd: june.hourlyRateUsd
    }),
    anomaly(DEFAULT_TENANT_ID, 'usage', 'medium', [azureVm], {
      usageHours: azureVm.usageHours,
      baselineHours: '480.0000',
      excessHours: '240.0000'
    })
  ];
}

function anomaly(tenantId, type, severity, records, metrics) {
  const fingerprint = `${type}:${records.map((record) => record.fingerprint).join(':')}`;
  return {
    id: stableId(`anomaly:${tenantId}:${fingerprint}`),
    tenantId,
    type,
    severity,
    status: 'open',
    detectedAt: '2026-06-30T11:00:00.000Z',
    windowStart: records[0].validFrom,
    windowEnd: records[records.length - 1].validTo,
    evidence: {
      fingerprint,
      costRecordIds: records.map((record) => record.id),
      pricingRows: records.map((record) => ({
        costRecordId: record.id,
        resourceId: record.resourceId,
        hourlyRateUsd: record.hourlyRateUsd,
        usageHours: record.usageHours,
        validFrom: record.validFrom,
        validTo: record.validTo
      })),
      metrics
    },
    explanationMd: `Demo ${type.replace('_', ' ')} anomaly generated from seeded billing rows.`
  };
}

function stakeholder(tenantId, name, email, roleLabel, notificationChannel) {
  return {
    id: stableId(`statement-stakeholder:${tenantId}:${email.toLowerCase()}`),
    tenantId,
    name,
    email: email.toLowerCase(),
    roleLabel,
    notificationChannel
  };
}

function billingScope(tenantId, stakeholderItem, scopeType, scopeRef, label, scopeFilter) {
  return {
    id: stableId(`billing-scope:${tenantId}:${stakeholderItem.id}:${scopeType}:${scopeRef}`),
    tenantId,
    stakeholderId: stakeholderItem.id,
    scopeType,
    scopeRef,
    label,
    scopeFilter
  };
}

function buildStatements({ costRecords, stakeholders, anomalies }) {
  const juneDefaultRecords = costRecords.filter((record) => record.tenantId === DEFAULT_TENANT_ID && record.validFrom === periodStart);
  const tenantTotal = roundMoney(juneDefaultRecords.reduce((sum, record) => sum + Number(record.costTotalUsd), 0));
  const platformRecords = juneDefaultRecords.filter((record) =>
    ['Amazon EC2', 'Azure Virtual Machines', 'Compute Engine'].includes(record.serviceName)
  );
  const dataRecords = juneDefaultRecords.filter((record) => !platformRecords.includes(record));
  const executiveRecords = juneDefaultRecords;
  return [
    statement(stakeholders[0], 'pending_approval', platformRecords, anomalies, tenantTotal, 'Platform engineering consumed compute across AWS, Azure, and GCP.'),
    statement(stakeholders[1], 'draft', dataRecords, anomalies, tenantTotal, 'Data platform owns storage, database, and analytics spend.'),
    statement(stakeholders[2], 'approved', executiveRecords, anomalies, tenantTotal, 'Executive portfolio rollup across all seeded cloud spend.', {
      approvedBy: 'admin@costalyx.demo'
    })
  ];
}

function statement(stakeholderItem, status, records, anomalies, tenantTotal, narrative, options = {}) {
  const total = roundMoney(records.reduce((sum, record) => sum + Number(record.costTotalUsd), 0));
  const id = stableId(`billing-statement:${stakeholderItem.tenantId}:${stakeholderItem.id}:${periodStart}:${periodEnd}`);
  const lineItem = {
    id: stableId(`statement-line:${id}:cost`),
    tenantId: stakeholderItem.tenantId,
    statementId: id,
    lineType: 'cost',
    description: `${stakeholderItem.name} allocated cloud spend`,
    amountUsd: total,
    costRecordIds: records.map((record) => record.id),
    evidence: {
      computedFrom: 'hourly_rate_usd * usage_hours',
      resourceCount: records.length
    }
  };
  return {
    id,
    tenantId: stakeholderItem.tenantId,
    stakeholderId: stakeholderItem.id,
    periodStart,
    periodEnd,
    status,
    totalUsd: total,
    generatedAt: '2026-06-30T12:00:00.000Z',
    approvedBy: options.approvedBy ?? null,
    sentAt: null,
    narrativeMd: narrative,
    openAnomalyCount: anomalies.filter((item) => item.status === 'open').length,
    reconciliation: {
      tenantTotalUsd: tenantTotal,
      allocatedUniqueUsd: total,
      unallocatedUsd: roundMoney(Number(tenantTotal) - Number(total)),
      overlapUsd: '0.00',
      reconcilesToTenantTotal: true
    },
    scopeWarnings: Number(tenantTotal) === Number(total)
      ? []
      : [
          {
            code: 'unallocated_spend_detected',
            message: 'Demo statement is scoped to a subset of the tenant portfolio.',
            amountUsd: roundMoney(Number(tenantTotal) - Number(total)),
            costRecordIds: []
          }
        ],
    varianceTopMovers: records.slice(0, 3).map((record) => ({
      label: record.serviceName,
      currentUsd: record.costTotalUsdRoundedToCent,
      priorUsd: '0.00',
      deltaUsd: record.costTotalUsdRoundedToCent
    })),
    sendEvidence: null,
    lineItems: [lineItem]
  };
}

function buildAgentRuns({ anomalies, statements }) {
  return [
    agentRun('anomaly_scan', {
      inputsSummary: { periodStart, periodEnd, source: 'demo_seed' },
      actionsTaken: [{ action: 'anomalies_created', count: anomalies.length, capped: false, anomalyIds: anomalies.map((item) => item.id) }],
      actionsProposed: [],
      errors: []
    }),
    agentRun('statement_generation', {
      inputsSummary: { periodStart, periodEnd, source: 'demo_seed' },
      actionsTaken: [{ action: 'statements_generated', count: statements.length, capped: false, statementIds: statements.map((item) => item.id) }],
      actionsProposed: [],
      errors: []
    }),
    agentRun('statement_send', {
      inputsSummary: { sendLimit: 10, source: 'demo_seed' },
      actionsTaken: [],
      actionsProposed: [{ action: 'approved_statements_ready_to_send', count: 1, capped: false, statementIds: statements.filter((item) => item.status === 'approved').map((item) => item.id) }],
      errors: []
    })
  ];
}

function agentRun(runType, input) {
  return {
    id: stableId(`agent-run:${DEFAULT_TENANT_ID}:${runType}:demo-seed`),
    tenantId: DEFAULT_TENANT_ID,
    runType,
    startedAt: '2026-06-30T12:10:00.000Z',
    finishedAt: '2026-06-30T12:10:05.000Z',
    ...input
  };
}

function buildAuditEntries({ users, cloudConnections, statements }) {
  const actor = users[0];
  return [
    auditEntry(DEFAULT_TENANT_ID, actor.id, 'demo_seed_applied', 'tenant', DEFAULT_TENANT_ID, '2026-06-30T12:15:00.000Z'),
    auditEntry(DEFAULT_TENANT_ID, actor.id, 'cloud_connection_seeded', 'cloud_connection', cloudConnections[0].id, '2026-06-30T12:15:01.000Z'),
    auditEntry(DEFAULT_TENANT_ID, actor.id, 'billing_statements_seeded', 'billing_statement_period', statements[0].id, '2026-06-30T12:15:02.000Z')
  ];
}

function auditEntry(tenantId, actorId, action, targetType, targetId, createdAt) {
  const id = stableId(`audit:${tenantId}:${action}:${targetId}`);
  const hash = createHash('sha256')
    .update(JSON.stringify({ id, tenantId, actorId, action, targetType, targetId, createdAt }))
    .digest('hex');
  return { id, tenantId, actorId, action, targetType, targetId, hash, createdAt };
}

function tenantScopedValue(tenantId, value) {
  return `${tenantId}:${value}`;
}

function resourceTagStorageKey(tenantId, resourceId) {
  return `${tenantId}:${resourceId}`;
}

function multiplyMoney(rate, hours, decimals) {
  return (Number(rate) * Number(hours)).toFixed(decimals);
}

function roundMoney(value) {
  return Number(value).toFixed(2);
}

function sumRecords(records) {
  return records.reduce((sum, record) => sum + Number(record.costTotalUsd), 0).toFixed(8);
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL || DEFAULT_LOCAL_DATABASE_URL;
  assertSafeToSeed(databaseUrl);
  const dataset = buildDemoDataset();
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    const appliedMigrations = await applyMigrations(client);
    await seedDataset(client, dataset);
    const verification = await verifySeed(client);
    console.log(
      JSON.stringify(
        {
          database: redactDatabaseUrl(databaseUrl),
          appliedMigrations: appliedMigrations.length,
          seeded: summarizeDataset(dataset),
          verification
        },
        null,
        2
      )
    );
  } finally {
    client.release();
    await pool.end();
  }
}

function redactDatabaseUrl(value) {
  const parsed = new URL(value);
  if (parsed.password) {
    parsed.password = 'redacted';
  }
  return parsed.toString();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    if (error instanceof Error) {
      console.error(error.stack || `${error.name}: ${error.message}`);
    } else {
      console.error(JSON.stringify(error));
    }
    process.exitCode = 1;
  });
}
