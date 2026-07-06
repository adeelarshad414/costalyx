import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { load } from 'js-yaml';

type Operation = {
  'x-required-role'?: string;
  parameters?: Array<{ name?: string } | { $ref: string }>;
};

type SchemaObject = {
  properties?: Record<string, unknown>;
  required?: string[];
  enum?: string[];
};

type OpenApi = {
  paths: Record<string, Record<string, Operation>>;
  components: {
    schemas: Record<string, SchemaObject>;
  };
};

describe('Milestone I OpenAPI contract', () => {
  const spec = load(readFileSync('openapi.yaml', 'utf8')) as OpenApi;

  it('documents billing-agent anomaly endpoints with server-side roles', () => {
    expect(spec.paths['/billing-agent/anomaly-scan'].post['x-required-role']).toBe('analyst');
    expect(spec.paths['/anomalies'].get['x-required-role']).toBe('viewer');
    expect(spec.paths['/anomalies/{id}'].patch['x-required-role']).toBe('analyst');
    expect(spec.paths['/anomalies/{id}'].patch.parameters).toContainEqual(
      expect.objectContaining({ $ref: '#/components/parameters/IdempotencyKey' })
    );
  });

  it('documents the four deterministic anomaly types and false-positive reason codes', () => {
    expect(spec.components.schemas.AnomalyType.enum).toEqual(['unit_price', 'usage', 'new_spend', 'coverage']);
    expect(spec.components.schemas.AnomalyStatus.enum).toEqual(['open', 'acknowledged', 'resolved', 'false_positive']);
    expect(spec.components.schemas.FalsePositiveReason.enum).toEqual([
      'seasonal',
      'planned_change',
      'known_migration',
      'other'
    ]);
    expect(spec.components.schemas.AnomalyStatusPatch.required).toEqual(['status']);
    expect(spec.components.schemas.AnomalyStatusPatch.properties).toHaveProperty('falsePositiveReason');
  });

  it('requires traceable evidence rows and deterministic explanation text on anomalies', () => {
    expect(spec.components.schemas.BillingAnomaly.required).toEqual(
      expect.arrayContaining(['evidence', 'explanationMd', 'windowStart', 'windowEnd'])
    );
    expect(spec.components.schemas.AnomalyEvidence.required).toEqual(
      expect.arrayContaining(['fingerprint', 'costRecordIds', 'pricingRows', 'metrics'])
    );
    expect(spec.components.schemas.AnomalyPricingRow.required).toEqual(
      expect.arrayContaining(['costRecordId', 'hourlyRateUsd', 'usageHours', 'validFrom'])
    );
    expect(spec.components.schemas.AnomalyScanResult.required).toEqual(['created', 'totalOpen']);
  });

  it('documents stakeholder statement workflow with approval-gated send actions', () => {
    expect(spec.paths['/billing-statement-stakeholders'].post['x-required-role']).toBe('admin');
    expect(spec.paths['/billing-scopes'].post['x-required-role']).toBe('admin');
    expect(spec.paths['/billing-statements/generate'].post['x-required-role']).toBe('analyst');
    expect(spec.paths['/billing-statements'].get['x-required-role']).toBe('viewer');
    expect(spec.paths['/billing-statements/{id}/approve'].post['x-required-role']).toBe('admin');
    expect(spec.paths['/billing-statements/{id}/send'].post['x-required-role']).toBe('admin');
    expect(spec.paths['/billing-statements/{id}/dispute'].post['x-required-role']).toBe('analyst');
    expect(spec.paths['/billing-statements/{id}/send'].post.parameters).toContainEqual(
      expect.objectContaining({ $ref: '#/components/parameters/IdempotencyKey' })
    );
    expect(spec.components.schemas.BillingStatementStatus.enum).toEqual([
      'draft',
      'pending_approval',
      'approved',
      'sent',
      'disputed',
      'void'
    ]);
    expect(spec.components.schemas.BillingStatement.required).toEqual(
      expect.arrayContaining(['lineItems', 'reconciliation', 'scopeWarnings', 'approvedBy', 'sentAt'])
    );
    expect(spec.components.schemas.BillingStatementReconciliation.required).toEqual(
      expect.arrayContaining(['tenantTotalUsd', 'allocatedUniqueUsd', 'unallocatedUsd', 'overlapUsd'])
    );
  });
});
