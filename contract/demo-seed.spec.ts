import { describe, expect, it } from 'vitest';

type DemoSeedModule = {
  DEFAULT_LOCAL_DATABASE_URL: string;
  DEFAULT_TENANT_ID: string;
  buildDemoDataset: () => {
    cloudConnections: Array<{ provider: string; accessMode: string; status: string; lastValidatedAt?: string | null }>;
    costRecords: Array<{
      id: string;
      tenantId: string;
      resourceId: string;
      hourlyRateUsd: string;
      usageHours: string;
      costTotalUsd: string;
      costTotalUsdRoundedToCent: string;
      validFrom: string;
    }>;
    statements: Array<{
      totalUsd: string;
      lineItems: Array<{ amountUsd: string; costRecordIds: string[]; evidence: Record<string, unknown> }>;
    }>;
    tenants: unknown[];
    anomalies: unknown[];
    agentRuns: unknown[];
  };
  summarizeDataset: (dataset: ReturnType<DemoSeedModule['buildDemoDataset']>) => Record<string, unknown>;
  assertSafeToSeed: (databaseUrl: string, env?: Record<string, string>) => void;
  getMigrationFiles: (root?: string) => Array<{ name: string }>;
  resetDemoGeneratedState: (
    client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
    tenantIds?: string[],
    resourceIds?: string[]
  ) => Promise<void>;
};

async function loadSeedModule(): Promise<DemoSeedModule> {
  return (await import('../scripts/seed-demo-data.mjs')) as DemoSeedModule;
}

describe('demo seed dataset', () => {
  it('builds tenant-scoped AWS, Azure, and GCP dummy data without claiming real validation', async () => {
    const seed = await loadSeedModule();
    const dataset = seed.buildDemoDataset();

    expect(seed.summarizeDataset(dataset)).toMatchObject({
      tenants: 2,
      cloudConnections: 4,
      costRecords: 12,
      anomalies: 2,
      statements: 3,
      agentRuns: 3
    });
    expect(dataset.cloudConnections.map((connection) => connection.provider).sort()).toEqual([
      'aws',
      'aws',
      'azure',
      'gcp'
    ]);
    expect(dataset.cloudConnections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: 'aws', accessMode: 'aws_assume_role', status: 'ready_for_live_probe' }),
        expect.objectContaining({ provider: 'azure', accessMode: 'azure_delegated_app', status: 'ready_for_live_probe' }),
        expect.objectContaining({ provider: 'gcp', accessMode: 'gcp_workload_identity', status: 'ready_for_live_probe' })
      ])
    );
    expect(JSON.stringify(dataset)).not.toMatch(/secret_access_key|client_secret|private_key|BEGIN PRIVATE KEY|sig=/i);
  });

  it('computes statement totals from seeded hourly rate and usage rows', async () => {
    const seed = await loadSeedModule();
    const dataset = seed.buildDemoDataset();
    const recordsById = new Map(dataset.costRecords.map((record) => [record.id, record]));

    for (const statement of dataset.statements) {
      const computedLineTotal = statement.lineItems.reduce((sum, lineItem) => {
        expect(lineItem.evidence.computedFrom).toBe('hourly_rate_usd * usage_hours');
        const lineTotal = lineItem.costRecordIds.reduce((lineSum, recordId) => {
          const record = recordsById.get(recordId);
          expect(record).toBeDefined();
          return lineSum + Number(record!.hourlyRateUsd) * Number(record!.usageHours);
        }, 0);
        expect(Number(lineItem.amountUsd)).toBeCloseTo(Number(lineTotal.toFixed(2)), 2);
        return sum + lineTotal;
      }, 0);
      expect(Number(statement.totalUsd)).toBeCloseTo(Number(computedLineTotal.toFixed(2)), 2);
    }
  });

  it('allows local dev databases but refuses production-looking seed targets by default', async () => {
    const seed = await loadSeedModule();

    expect(() => seed.assertSafeToSeed(seed.DEFAULT_LOCAL_DATABASE_URL, { APP_ENV: 'local' })).not.toThrow();
    expect(() =>
      seed.assertSafeToSeed('postgresql://costalyx:pass@db.example.com:5432/costalyx_prod', {
        NODE_ENV: 'production'
      })
    ).toThrow(/Refusing to seed demo data/);
    expect(() =>
      seed.assertSafeToSeed('postgresql://costalyx:pass@db.example.com:5432/costalyx_sandbox', {
        COSTALYX_ALLOW_DEMO_SEED: 'true'
      })
    ).not.toThrow();
  });

  it('applies all forward migrations and never rollback files', async () => {
    const seed = await loadSeedModule();
    const migrations = seed.getMigrationFiles();

    expect(migrations.length).toBeGreaterThanOrEqual(13);
    expect(migrations.map((migration) => migration.name)).toEqual(
      migrations.map((migration) => migration.name).slice().sort()
    );
    expect(migrations.some((migration) => migration.name.includes('rollback'))).toBe(false);
  });

  it('resets generated and mutable demo rows before reseeding canonical fixtures', async () => {
    const seed = await loadSeedModule();
    const queries: Array<{ sql: string; params?: unknown[] }> = [];
    const fakeClient = {
      async query(sql: string, params?: unknown[]) {
        queries.push({ sql, params });
        return { rows: [] };
      }
    };
    const tenantIds = [seed.DEFAULT_TENANT_ID];
    const resourceIds = ['i-aws-prod-001'];

    await seed.resetDemoGeneratedState(fakeClient, tenantIds, resourceIds);

    expect(queries.map((query) => query.sql)).toEqual([
      'DELETE FROM statement_line_items WHERE tenant_id = ANY($1::uuid[])',
      'DELETE FROM statements WHERE tenant_id = ANY($1::uuid[])',
      'DELETE FROM billing_scopes WHERE tenant_id = ANY($1::uuid[])',
      'DELETE FROM stakeholders WHERE tenant_id = ANY($1::uuid[])',
      'DELETE FROM anomaly_suppressions WHERE tenant_id = ANY($1::uuid[])',
      'DELETE FROM anomalies WHERE tenant_id = ANY($1::uuid[])',
      'DELETE FROM agent_runs WHERE tenant_id = ANY($1::uuid[])',
      'DELETE FROM billing_agent_idempotency WHERE tenant_id = ANY($1::uuid[])',
      'DELETE FROM audit_log WHERE tenant_id = ANY($1::uuid[])',
      'DELETE FROM realized_savings WHERE tenant_id = ANY($1::uuid[])',
      'DELETE FROM recommendations WHERE tenant_id = ANY($1::uuid[])',
      'DELETE FROM optimization_idempotency WHERE tenant_id = ANY($1::uuid[])',
      'DELETE FROM cloud_connection_runs WHERE tenant_id = ANY($1::uuid[])',
      'DELETE FROM views WHERE org_id = ANY($1::uuid[])',
      `DELETE FROM dimension_tag_mappings
     WHERE dimension_id IN (SELECT id FROM dimensions WHERE org_id = ANY($1::uuid[]))`,
      'DELETE FROM dimensions WHERE org_id = ANY($1::uuid[])',
      'DELETE FROM resource_tags WHERE resource_id = ANY($1::text[])',
      `DELETE FROM account_group_members
     WHERE account_group_id IN (SELECT id FROM account_groups WHERE tenant_id = ANY($1::uuid[]))
        OR account_id IN (SELECT id FROM accounts WHERE tenant_id = ANY($1::uuid[]))`,
      'DELETE FROM account_groups WHERE tenant_id = ANY($1::uuid[])',
      'DELETE FROM cloud_credentials WHERE tenant_id = ANY($1::uuid[])',
      'DELETE FROM cost_records WHERE tenant_id = ANY($1::uuid[])',
      'DELETE FROM ingestion_batches WHERE tenant_id = ANY($1::uuid[])',
      'DELETE FROM accounts WHERE tenant_id = ANY($1::uuid[])',
      'DELETE FROM cloud_connections WHERE tenant_id = ANY($1::uuid[])',
      'DELETE FROM governance_idempotency WHERE tenant_id = ANY($1::uuid[])',
      'DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE tenant_id = ANY($1::uuid[]))',
      'DELETE FROM users WHERE tenant_id = ANY($1::uuid[])'
    ]);
    expect(queries.filter((query) => query.sql.includes('resource_tags')).every((query) => query.params?.[0] === resourceIds)).toBe(true);
    expect(queries.filter((query) => !query.sql.includes('resource_tags')).every((query) => query.params?.[0] === tenantIds)).toBe(true);
  });
});
