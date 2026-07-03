import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { load } from 'js-yaml';

type Operation = {
  'x-required-role'?: string;
  responses?: Record<string, unknown>;
};

type OpenApi = {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, unknown> };
};

describe('Milestone B OpenAPI contract', () => {
  const spec = load(readFileSync('openapi.yaml', 'utf8')) as OpenApi;

  it('documents server-enforced privileged action surfaces with required roles', () => {
    expect(spec.paths['/account-groups'].post['x-required-role']).toBe('admin');
    expect(spec.paths['/account-groups/{id}'].patch['x-required-role']).toBe('admin');
    expect(spec.paths['/cloud-credentials'].post['x-required-role']).toBe('admin');
    expect(spec.paths['/cloud-credentials/{id}/rotation'].patch['x-required-role']).toBe('admin');
    expect(spec.paths['/users'].post['x-required-role']).toBe('admin');
    expect(spec.paths['/roles'].get['x-required-role']).toBe('admin');
    expect(spec.paths['/audit-log'].get['x-required-role']).toBe('admin');
  });

  it('keeps fixed-role and Vault-reference schemas available to the generated client', () => {
    expect(spec.components.schemas).toHaveProperty('Role');
    expect(spec.components.schemas).toHaveProperty('CloudCredential');
    expect(spec.components.schemas).toHaveProperty('CloudCredentialCreate');
    expect(spec.components.schemas).toHaveProperty('PaginatedCloudCredentials');
    expect(spec.paths['/roles'].post.responses).not.toHaveProperty('201');
  });

  it('documents export as authenticated but available to every fixed role', () => {
    expect(spec.paths['/cost-records/export'].get['x-required-role']).toBe('viewer');
    expect(spec.paths['/cost-records/export'].get.responses).toHaveProperty('200');
  });
});
