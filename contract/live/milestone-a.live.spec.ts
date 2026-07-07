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

describeIfLive('Milestone A live backend contract', () => {
  it('serves the public health endpoint from a real backend instance', async () => {
    const response = await request('/healthz');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });

    const live = await request('/health/live');
    expect(live.status).toBe(200);
    await expect(live.json()).resolves.toEqual({ status: 'ok' });

    const ready = await request('/health/ready');
    expect(ready.status).toBe(200);
    await expect(ready.json()).resolves.toEqual({
      status: 'ready',
      checks: [{ name: 'governance-repository', status: 'ok' }]
    });
  });

  it('serves admin-gated Prometheus metrics from a real backend instance', async () => {
    const viewer = await request('/metrics', { headers: authHeaders('viewer') });
    expect(viewer.status).toBe(403);

    const response = await request('/metrics', { headers: authHeaders('admin') });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(body).toContain('costalyx_build_info{version="0.1.0"} 1');
    expect(body).toContain('costalyx_cloud_connections_total{provider="aws",status="pending_validation"}');
    expect(body).toContain('costalyx_cloud_scheduler_enabled');
  });

  it('returns the documented paginated cost-records shape', async () => {
    const response = await request('/api/v1/cost-records?page=1&pageSize=1', {
      headers: authHeaders('viewer')
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta).toEqual(expect.objectContaining({ page: 1, pageSize: 1 }));
    expect(typeof body.meta.total).toBe('number');
  });

  it('returns RFC 7807 bad-request shape for missing Idempotency-Key', async () => {
    const response = await request('/api/v1/ingestion/batches', {
      method: 'POST',
      headers: {
        ...authHeaders('admin'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ provider: 'aws', sourceUri: 'backend/test/fixtures/aws-cur-sample.csv' })
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(body).toEqual(
      expect.objectContaining({
        title: 'Validation Error',
        status: 400,
        detail: 'Idempotency-Key header is required.'
      })
    );
  });

  it('returns 403, not a filtered 200, for Viewer access to Admin ingestion', async () => {
    const response = await request('/api/v1/ingestion/batches', {
      method: 'POST',
      headers: {
        ...authHeaders('viewer'),
        'Content-Type': 'application/json',
        'Idempotency-Key': 'live-contract-viewer-denied'
      },
      body: JSON.stringify({ provider: 'aws', sourceUri: 'backend/test/fixtures/aws-cur-sample.csv' })
    });

    expect(response.status).toBe(403);
  });
});
