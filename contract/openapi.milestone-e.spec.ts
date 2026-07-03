import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { load } from 'js-yaml';

type Operation = {
  'x-required-role'?: string;
  parameters?: Array<{ name?: string } | { $ref: string }>;
  requestBody?: unknown;
};

type OpenApi = {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
};

describe('Milestone E OpenAPI contract', () => {
  const spec = load(readFileSync('openapi.yaml', 'utf8')) as OpenApi;

  it('documents optimization recommendations and realized savings with server-side roles', () => {
    expect(spec.paths['/recommendations'].get['x-required-role']).toBe('viewer');
    expect(spec.paths['/recommendations/{id}'].patch['x-required-role']).toBe('analyst');
    expect(spec.paths['/realized-savings'].get['x-required-role']).toBe('viewer');
  });

  it('documents applied/dismissed status changes and ingested-billing verification', () => {
    expect(spec.paths['/recommendations/{id}'].patch.parameters).toContainEqual(
      expect.objectContaining({ $ref: '#/components/parameters/IdempotencyKey' })
    );
    expect(spec.components.schemas.RecommendationPatch.properties?.status).toEqual(
      expect.objectContaining({ enum: ['applied', 'dismissed'] })
    );
    expect(spec.components.schemas.RealizedSaving.properties?.verificationSource).toEqual(
      expect.objectContaining({ enum: ['ingested_billing'] })
    );
  });
});
