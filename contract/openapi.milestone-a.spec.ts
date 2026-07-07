import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { load } from 'js-yaml';

type OpenApi = {
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, unknown>; responses: Record<string, unknown> };
};

describe('Milestone A OpenAPI contract', () => {
  const spec = load(readFileSync('openapi.yaml', 'utf8')) as OpenApi;

  it('documents the ingestion and cost-record endpoints used by the implementation', () => {
    expect(spec.paths['/healthz']).toHaveProperty('get');
    expect(spec.paths['/health/live']).toHaveProperty('get');
    expect(spec.paths['/health/ready']).toHaveProperty('get');
    expect(spec.paths['/metrics']).toHaveProperty('get');
    expect(spec.paths['/ingestion/batches']).toHaveProperty('post');
    expect(spec.paths['/ingestion/batches/{id}']).toHaveProperty('get');
    expect(spec.paths['/ingestion/batches/{id}/errors']).toHaveProperty('get');
    expect(spec.paths['/cost-records']).toHaveProperty('get');
    expect(spec.paths['/cost-records/summary']).toHaveProperty('get');
    expect((spec.paths['/metrics'].get as { ['x-required-role']?: string })['x-required-role']).toBe('admin');
    expect((spec.paths['/health/live'].get as { security?: unknown[] }).security).toEqual([]);
    expect((spec.paths['/health/ready'].get as { security?: unknown[] }).security).toEqual([]);
  });

  it('keeps generated-client response schemas and RFC 7807 problem responses available', () => {
    expect(spec.components.schemas).toHaveProperty('ReadinessStatus');
    expect(spec.components.schemas).toHaveProperty('CostRecord');
    expect(spec.components.schemas).toHaveProperty('IngestionBatch');
    expect(spec.components.responses).toHaveProperty('Forbidden');
    expect(spec.components.responses).toHaveProperty('BadRequest');
  });
});
