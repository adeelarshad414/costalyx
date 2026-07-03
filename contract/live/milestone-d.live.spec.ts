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

describeIfLive('Milestone D live backend contract', () => {
  it('reconciles Cost Explorer flow totals with Resource Inventory summary totals', async () => {
    await request('/api/v1/ingestion/batches', {
      method: 'POST',
      headers: { ...authHeaders('admin'), 'Content-Type': 'application/json', 'Idempotency-Key': 'live-d-ingestion' },
      body: JSON.stringify({ provider: 'aws', sourceUri: 'backend/test/fixtures/aws-cur-sample.csv' })
    });

    const summaryResponse = await request('/api/v1/cost-records/summary?provider=aws', {
      headers: authHeaders('viewer')
    });
    const flowResponse = await request('/api/v1/cost-explorer/flow?provider=aws&dimensions=service,leaseType&costFloorUsd=0.00000000', {
      headers: authHeaders('viewer')
    });
    const summary = await summaryResponse.json();
    const flow = await flowResponse.json();
    const linkTotal = flow.links.reduce((sum: number, link: { costTotalUsd: string }) => sum + Number(link.costTotalUsd), 0);

    expect(summaryResponse.status).toBe(200);
    expect(flowResponse.status).toBe(200);
    expect(linkTotal.toFixed(8)).toBe(summary.totalCostUsd);
  });
});
