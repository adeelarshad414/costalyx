import { describe, expect, it } from 'vitest';

const baseUrl = process.env.LIVE_API_BASE_URL;
const describeIfLive = baseUrl ? describe : describe.skip;

function authHeaders(role: 'viewer' | 'analyst' | 'admin') {
  const token = process.env.LIVE_API_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : { 'x-costalyx-role': role };
}

async function request(path: string, init: RequestInit = {}) {
  if (!baseUrl) {
    throw new Error('LIVE_API_BASE_URL is required.');
  }
  return fetch(`${baseUrl}${path}`, init);
}

describeIfLive('Milestone B live backend contract', () => {
  it('returns 403, not a filtered 200, when Viewer calls privileged endpoints directly', async () => {
    const privilegedRequests = [
      request('/api/v1/account-groups', {
        method: 'POST',
        headers: { ...authHeaders('viewer'), 'Content-Type': 'application/json', 'Idempotency-Key': 'live-b-group' },
        body: JSON.stringify({ name: 'Viewer blocked', accountIds: [] })
      }),
      request('/api/v1/cloud-credentials', {
        method: 'POST',
        headers: { ...authHeaders('viewer'), 'Content-Type': 'application/json', 'Idempotency-Key': 'live-b-cred' },
        body: JSON.stringify({
          provider: 'aws',
          accountId: '11111111-1111-4111-8111-111111111111',
          displayName: 'Blocked',
          vaultPath: 'kv/blocked'
        })
      }),
      request('/api/v1/users', {
        method: 'POST',
        headers: { ...authHeaders('viewer'), 'Content-Type': 'application/json', 'Idempotency-Key': 'live-b-user' },
        body: JSON.stringify({ email: 'blocked@example.test', displayName: 'Blocked', roles: ['viewer'] })
      }),
      request('/api/v1/roles', { headers: authHeaders('viewer') }),
      request('/api/v1/audit-log', { headers: authHeaders('viewer') })
    ];

    await Promise.all(
      privilegedRequests.map(async (responsePromise) => {
        const response = await responsePromise;
        expect(response.status).toBe(403);
      })
    );
  });

  it('returns fixed roles to an Admin and rejects custom role creation for Milestone B', async () => {
    const roles = await request('/api/v1/roles', { headers: authHeaders('admin') });
    await expect(roles.json()).resolves.toEqual({
      data: [
        { name: 'viewer', fixed: true },
        { name: 'analyst', fixed: true },
        { name: 'admin', fixed: true }
      ]
    });
    expect(roles.status).toBe(200);

    const customRole = await request('/api/v1/roles', {
      method: 'POST',
      headers: { ...authHeaders('admin'), 'Content-Type': 'application/json', 'Idempotency-Key': 'live-b-role' },
      body: JSON.stringify({ name: 'finops_manager', permissionBitset: '111' })
    });
    expect(customRole.status).toBe(400);
  });

  it('keeps cost export authenticated at the Viewer tier', async () => {
    const unauthenticated = await request('/api/v1/cost-records/export');
    expect(unauthenticated.status).toBe(401);

    const viewer = await request('/api/v1/cost-records/export', { headers: authHeaders('viewer') });
    expect(viewer.status).toBe(200);
    expect(viewer.headers.get('content-type')).toContain('text/csv');
  });
});
