import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { load } from 'js-yaml';

type Operation = {
  'x-required-role'?: string;
  parameters?: Array<{ name?: string } | { $ref: string }>;
};

type OpenApi = {
  paths: Record<string, Record<string, Operation>>;
  components: {
    parameters: Record<string, unknown>;
    schemas: Record<string, unknown>;
  };
};

describe('Milestone G OpenAPI contract', () => {
  const spec = load(readFileSync('openapi.yaml', 'utf8')) as OpenApi;

  it('documents canned reports and saved views as authenticated reporting surfaces', () => {
    expect(spec.paths['/reports'].get['x-required-role']).toBe('viewer');
    expect(spec.paths['/reports/{id}/run'].get['x-required-role']).toBe('viewer');
    expect(spec.paths['/views'].get['x-required-role']).toBe('viewer');
    expect(spec.paths['/views'].post['x-required-role']).toBe('analyst');
    expect(spec.paths['/views'].post.parameters).toContainEqual(
      expect.objectContaining({ $ref: '#/components/parameters/IdempotencyKey' })
    );
  });

  it('documents active view scoping and reporting schemas', () => {
    expect(spec.components.parameters).toHaveProperty('ActiveViewId');
    expect(spec.paths['/cost-records'].get.parameters).toContainEqual(
      expect.objectContaining({ $ref: '#/components/parameters/ActiveViewId' })
    );
    expect(spec.paths['/cost-records/summary'].get.parameters).toContainEqual(
      expect.objectContaining({ $ref: '#/components/parameters/ActiveViewId' })
    );
    expect(spec.paths['/reports/{id}/run'].get.parameters).toContainEqual(
      expect.objectContaining({ $ref: '#/components/parameters/ActiveViewId' })
    );
    expect(spec.components.schemas).toHaveProperty('Report');
    expect(spec.components.schemas).toHaveProperty('ReportRun');
    expect(spec.components.schemas).toHaveProperty('View');
    expect(spec.components.schemas).toHaveProperty('ViewCreate');
  });
});
