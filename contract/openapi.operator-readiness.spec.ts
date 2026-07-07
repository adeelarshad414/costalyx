import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { load } from 'js-yaml';

type Operation = {
  'x-required-role'?: string;
  responses: Record<string, unknown>;
};

type SchemaObject = {
  properties?: Record<string, unknown>;
  required?: string[];
};

type OpenApi = {
  paths: Record<string, Record<string, Operation>>;
  components: {
    schemas: Record<string, SchemaObject>;
  };
};

describe('Operator readiness OpenAPI contract', () => {
  const spec = load(readFileSync('openapi.yaml', 'utf8')) as OpenApi;

  it('documents the admin-only sanitized go-live readiness endpoint', () => {
    expect(spec.paths['/operator-readiness'].get['x-required-role']).toBe('admin');
    expect(spec.paths['/operator-readiness'].get.responses).toHaveProperty('200');
    expect(spec.paths['/operator-readiness'].get.responses).toHaveProperty('401');
    expect(spec.paths['/operator-readiness'].get.responses).toHaveProperty('403');
    expect(spec.components.schemas).toHaveProperty('OperatorReadiness');
    expect(spec.components.schemas.OperatorReadiness.required).toEqual(
      expect.arrayContaining(['status', 'generatedAt', 'environment', 'checks', 'blockers', 'nextActions'])
    );
    expect(spec.components.schemas).toHaveProperty('OperatorReadinessCheck');
    expect(JSON.stringify(spec.components.schemas.OperatorReadinessCheck)).toContain('live-cloud-probes');
    expect(JSON.stringify(spec.components.schemas.OperatorReadinessCheck)).not.toMatch(
      /secretAccessKey|accessKeyId|clientSecret|password|token|vaultToken/i
    );
  });
});
