import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { load } from 'js-yaml';

type Operation = {
  'x-required-role'?: string;
  parameters?: Array<{ name?: string } | { $ref: string }>;
  responses?: Record<string, unknown>;
};

type OpenApi = {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, unknown> };
};

describe('Milestone F OpenAPI contract', () => {
  const spec = load(readFileSync('openapi.yaml', 'utf8')) as OpenApi;

  it('documents executive summary, PDF export, and TCO surfaces as viewer-authenticated', () => {
    expect(spec.paths['/executive-summary'].get['x-required-role']).toBe('viewer');
    expect(spec.paths['/executive-summary/export'].get['x-required-role']).toBe('viewer');
    expect(spec.paths['/tco/estimate'].post['x-required-role']).toBe('viewer');
  });

  it('documents executive summary and TCO response schemas', () => {
    expect(spec.components.schemas).toHaveProperty('ExecutiveSummary');
    expect(spec.components.schemas).toHaveProperty('ExecutiveTopMover');
    expect(spec.components.schemas).toHaveProperty('TcoEstimateResponse');
    expect(spec.paths['/tco/estimate'].post.parameters).toContainEqual(
      expect.objectContaining({ $ref: '#/components/parameters/IdempotencyKey' })
    );
  });
});
