import fs from 'node:fs';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const requiredDocs = [
  'COMPETITIVE-MATRIX.md',
  'CONFORMANCE.md',
  'handover/HANDOVER-README.md',
  'handover/OPERATIONS-RUNBOOK.md',
  'handover/INSTALLATION-GUIDE.md',
  'handover/ONBOARDING-CHECKLIST.md',
  'handover/SECURITY-OVERVIEW.md',
  'handover/SLO-AND-SUPPORT.md',
  'handover/DEMO-SCRIPT.md',
  'handover/GO-LIVE-CHECKLIST.md'
];

describe('customer handover package', () => {
  it('keeps all required handover artifacts present and free of placeholders', () => {
    for (const file of requiredDocs) {
      const text = fs.readFileSync(file, 'utf8');

      expect(text.length, file).toBeGreaterThan(400);
      expect(text, file).not.toMatch(/\bTODO\b|\bTBD\b|lorem ipsum/i);
    }
  });

  it('documents competitive and conformance gaps without pretending dummy data is production proof', () => {
    const competitive = fs.readFileSync('COMPETITIVE-MATRIX.md', 'utf8');
    const conformance = fs.readFileSync('CONFORMANCE.md', 'utf8');
    const handoverReadme = fs.readFileSync('handover/HANDOVER-README.md', 'utf8');

    expect(competitive).toContain('GAP-045');
    expect(competitive).toContain('GAP-046');
    expect(competitive).toContain('GAP-047');
    expect(conformance).toContain('Milestone H live probes require real customer references');
    expect(handoverReadme).toContain('verified locally with deterministic demo data');
    expect(`${competitive}\n${conformance}\n${handoverReadme}`).toMatch(/verified\(mock\)|dummy data/i);
  });

  it('keeps the demo seed profile aligned with the canonical seed contract', () => {
    const profile = JSON.parse(fs.readFileSync('handover/demo-seed-profile.json', 'utf8')) as {
      verificationMode: string;
      seedCommand: string;
      expectedCounts: Record<string, number>;
      providers: string[];
      flagshipRoutes: string[];
    };

    expect(profile.verificationMode).toBe('verified(mock)');
    expect(profile.seedCommand).toBe('npm run seed:demo');
    expect(profile.expectedCounts).toMatchObject({
      tenants: 2,
      users: 4,
      cloudConnections: 4,
      accounts: 4,
      costRecords: 12,
      anomalies: 2,
      statements: 3,
      agentRuns: 3
    });
    expect(profile.providers.sort()).toEqual(['aws', 'azure', 'gcp']);
    expect(profile.flagshipRoutes).toContain('/login');
  });

  it('ships Prometheus alert rules that reference metrics exported by the backend', () => {
    const rulesFile = fs.readFileSync('deploy/prometheus/costalyx-alerts.yml', 'utf8');
    const parsed = yaml.load(rulesFile) as { groups: Array<{ rules: Array<{ alert: string; expr: string }> }> };
    const exportedMetrics = fs.readFileSync('backend/src/health.controller.ts', 'utf8');

    const alerts = parsed.groups.flatMap((group) => group.rules);
    expect(alerts.map((rule) => rule.alert)).toEqual([
      'CostalyxMetricsStale',
      'CostalyxSchedulerDisabled',
      'CostalyxIngestionSchedulerDisabled',
      'CostalyxCloudValidationFailures',
      'CostalyxNoCloudConnections'
    ]);

    for (const metric of [
      'costalyx_metrics_generated_timestamp_seconds',
      'costalyx_cloud_scheduler_enabled',
      'costalyx_cloud_scheduler_ingestion_enabled',
      'costalyx_cloud_connections_total',
      'costalyx_cloud_connection_tenants_total'
    ]) {
      expect(rulesFile).toContain(metric);
      expect(exportedMetrics).toContain(metric);
    }
  });
});

