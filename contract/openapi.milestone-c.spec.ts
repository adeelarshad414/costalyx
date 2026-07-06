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

describe('Milestone C OpenAPI contract', () => {
  const spec = load(readFileSync('openapi.yaml', 'utf8')) as OpenApi;

  it('documents analyst-gated unbounded dimension and manual retag mutations', () => {
    expect(spec.paths['/dimensions'].get['x-required-role']).toBe('viewer');
    expect(spec.paths['/dimensions'].post['x-required-role']).toBe('analyst');
    expect(spec.paths['/dimensions/{id}/mappings'].post['x-required-role']).toBe('analyst');
    expect(spec.paths['/resource-tags'].post['x-required-role']).toBe('analyst');
    expect(spec.paths['/resource-tags'].get['x-required-role']).toBe('viewer');
  });

  it('requires Idempotency-Key for every Milestone C mutating endpoint', () => {
    expect(spec.paths['/dimensions'].post.parameters).toContainEqual({ $ref: '#/components/parameters/IdempotencyKey' });
    expect(spec.paths['/dimensions/{id}/mappings'].post.parameters).toContainEqual({
      $ref: '#/components/parameters/IdempotencyKey'
    });
    expect(spec.paths['/resource-tags'].post.parameters).toContainEqual({
      $ref: '#/components/parameters/IdempotencyKey'
    });
  });

  it('keeps dynamic dimension schemas unbounded and exposes dimension filters on aggregate views', () => {
    expect(spec.components.schemas).toHaveProperty('Dimension');
    expect(spec.components.schemas).toHaveProperty('DimensionMapping');
    expect(spec.components.schemas).toHaveProperty('ResourceTag');
    expect(spec.components.schemas).not.toHaveProperty('DimensionSlot12');
    expect(spec.components.schemas).not.toHaveProperty('DimensionSlot50');
    expect(spec.paths['/cost-records/summary'].get.parameters).toContainEqual(
      expect.objectContaining({ name: 'dimension' })
    );
  });
});
