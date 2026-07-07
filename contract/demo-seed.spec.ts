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
});
