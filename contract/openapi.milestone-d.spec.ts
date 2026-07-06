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

describe('Milestone D OpenAPI contract', () => {
  const spec = load(readFileSync('openapi.yaml', 'utf8')) as OpenApi;

  it('documents Resource Inventory and Cost Explorer as viewer-authenticated surfaces', () => {
    expect(spec.paths['/cost-records'].get['x-required-role']).toBe('viewer');
    expect(spec.paths['/cost-records/summary'].get['x-required-role']).toBe('viewer');
    expect(spec.paths['/cost-records/export'].get['x-required-role']).toBe('viewer');
    expect(spec.paths['/cost-explorer/flow'].get['x-required-role']).toBe('viewer');
  });

  it('documents explorer drill-down dimensions and cost-floor filtering', () => {
    expect(spec.paths['/cost-explorer/flow'].get.parameters).toContainEqual(
      expect.objectContaining({ name: 'dimensions' })
    );
    expect(spec.paths['/cost-explorer/flow'].get.parameters).toContainEqual(
      expect.objectContaining({ name: 'costFloorUsd' })
    );
    expect(spec.components.schemas).toHaveProperty('CostExplorerFlow');
  });
});
