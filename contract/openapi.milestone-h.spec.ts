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
};

type OpenApi = {
  paths: Record<string, Record<string, Operation>>;
  components: {
    schemas: Record<string, SchemaObject>;
  };
};

function hasQueryParameter(operation: Operation, name: string): boolean {
  return (operation.parameters ?? []).some((parameter) => 'name' in parameter && parameter.name === name);
}

describe('Milestone H OpenAPI contract', () => {
  const spec = load(readFileSync('openapi.yaml', 'utf8')) as OpenApi;

  it('documents tenant and cloud-connection admin surfaces', () => {
    expect(spec.paths['/tenants'].get['x-required-role']).toBe('viewer');
    expect(spec.paths['/tenants'].post['x-required-role']).toBe('admin');
    expect(spec.paths['/cloud-connections'].get['x-required-role']).toBe('viewer');
    expect(spec.paths['/cloud-connections'].post['x-required-role']).toBe('admin');
    expect(spec.paths['/cloud-connections/{id}/validation'].post['x-required-role']).toBe('admin');
    expect(spec.paths['/cloud-connections/{id}/onboarding'].get['x-required-role']).toBe('admin');
    expect(spec.paths['/cloud-connections'].post.parameters).toContainEqual(
      expect.objectContaining({ $ref: '#/components/parameters/IdempotencyKey' })
    );
    expect(spec.paths['/cloud-connections/{id}/validation'].post.parameters).toContainEqual(
      expect.objectContaining({ $ref: '#/components/parameters/IdempotencyKey' })
    );
  });

  it('keeps cloud onboarding read-only and free of secret material', () => {
    const createProperties = spec.components.schemas.CloudConnectionCreate.properties ?? {};
    const responseProperties = spec.components.schemas.CloudConnection.properties ?? {};
    expect(spec.components.schemas).toHaveProperty('Tenant');
    expect(spec.components.schemas).toHaveProperty('CloudConnection');
    expect(spec.components.schemas.CloudConnectionCreate.required).toEqual(
      expect.arrayContaining(['provider', 'displayName', 'externalTenantId', 'accessMode', 'readOnlyPrincipal'])
    );
    expect(spec.components.schemas.CloudConnection.required).toEqual(
      expect.arrayContaining(['externalId', 'lastValidationAttemptedAt', 'lastValidationCode', 'lastValidationMessage'])
    );
    expect(responseProperties).toHaveProperty('externalId');
    expect(responseProperties).toHaveProperty('lastValidationCode');
    expect(JSON.stringify(responseProperties.status)).toContain('ready_for_live_probe');
    expect(spec.components.schemas).toHaveProperty('CloudConnectionOnboarding');
    expect(spec.components.schemas.CloudConnectionOnboarding.required).toEqual(
      expect.arrayContaining(['externalId', 'trustPolicy', 'permissionsPolicy', 'customerSteps'])
    );
    expect(createProperties).not.toHaveProperty('accessKeyId');
    expect(createProperties).not.toHaveProperty('secretAccessKey');
    expect(createProperties).not.toHaveProperty('clientSecret');
    expect(createProperties).not.toHaveProperty('password');
  });

  it('documents tenant-aware portfolio filters on cost and reporting reads', () => {
    for (const operation of [
      spec.paths['/cost-records'].get,
      spec.paths['/cost-records/summary'].get,
      spec.paths['/cost-explorer/flow'].get,
      spec.paths['/reports/{id}/run'].get
    ]) {
      expect(hasQueryParameter(operation, 'accountGroupId')).toBe(true);
      expect(hasQueryParameter(operation, 'cloudConnectionId')).toBe(true);
    }
  });
});
