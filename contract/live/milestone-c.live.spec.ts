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

describeIfLive('Milestone C live backend contract', () => {
  it('enforces analyst-only dynamic tagging mutations and reflects retags in aggregate summaries', async () => {
    const viewerDenied = await request('/api/v1/dimensions', {
      method: 'POST',
      headers: { ...authHeaders('viewer'), 'Content-Type': 'application/json', 'Idempotency-Key': 'live-c-viewer' },
      body: JSON.stringify({ name: 'Viewer blocked' })
    });
    expect(viewerDenied.status).toBe(403);

    await request('/api/v1/ingestion/batches', {
      method: 'POST',
      headers: { ...authHeaders('admin'), 'Content-Type': 'application/json', 'Idempotency-Key': 'live-c-ingestion' },
      body: JSON.stringify({ provider: 'aws', sourceUri: 'backend/test/fixtures/aws-cur-sample.csv' })
    });

    let dimensionId = '';
    for (let index = 1; index <= 12; index += 1) {
      const dimension = await request('/api/v1/dimensions', {
        method: 'POST',
        headers: {
          ...authHeaders('analyst'),
          'Content-Type': 'application/json',
          'Idempotency-Key': `live-c-dimension-${index}`
        },
        body: JSON.stringify({ name: `Live Dimension ${index}` })
      });
      expect(dimension.status).toBe(201);
      dimensionId = (await dimension.json()).id;
    }

    const mapping = await request(`/api/v1/dimensions/${dimensionId}/mappings`, {
      method: 'POST',
      headers: { ...authHeaders('analyst'), 'Content-Type': 'application/json', 'Idempotency-Key': 'live-c-mapping' },
      body: JSON.stringify({ tagKey: 'owner', tagValuePattern: 'platform' })
    });
    expect(mapping.status).toBe(201);

    const before = await request(`/api/v1/cost-records/summary?dimension=${dimensionId}`, {
      headers: authHeaders('viewer')
    });
    await expect(before.json()).resolves.toEqual(
      expect.objectContaining({ totalCostUsd: '0.00000000', resourceCount: 0, untaggedCount: 3 })
    );

    const tag = await request('/api/v1/resource-tags', {
      method: 'POST',
      headers: { ...authHeaders('analyst'), 'Content-Type': 'application/json', 'Idempotency-Key': 'live-c-tag' },
      body: JSON.stringify({ resourceId: 'i-aws-prod-001', tagKey: 'owner', tagValue: 'platform', source: 'manual' })
    });
    expect(tag.status).toBe(201);

    const after = await request(`/api/v1/cost-records/summary?dimension=${dimensionId}`, {
      headers: authHeaders('viewer')
    });
    await expect(after.json()).resolves.toEqual(
      expect.objectContaining({ totalCostUsd: '0.41600000', resourceCount: 1, untaggedCount: 2 })
    );
  });
});
