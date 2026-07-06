import { describe, expect, it } from 'vitest';

const baseUrl = process.env.LIVE_API_BASE_URL;
const describeIfLive = baseUrl ? describe : describe.skip;
const milestoneITenantId = '00000000-0000-4000-8000-000000000009';

function authHeaders(role: 'viewer' | 'analyst' | 'admin') {
  const token = process.env.LIVE_API_TOKEN;
  return token
    ? { Authorization: `Bearer ${token}` }
    : { 'x-costalyx-role': role, 'x-costalyx-tenant-id': milestoneITenantId };
}

async function request(path: string, init: RequestInit = {}) {
  if (!baseUrl) {
    throw new Error('LIVE_API_BASE_URL is required.');
  }
  return fetch(`${baseUrl}${path}`, init);
}

describeIfLive('Milestone I live backend contract', () => {
  it('scans ingested fixture billing rows and exposes anomaly triage endpoints', async () => {
    await request('/api/v1/ingestion/batches', {
      method: 'POST',
      headers: { ...authHeaders('admin'), 'Content-Type': 'application/json', 'Idempotency-Key': 'live-i-ingestion' },
      body: JSON.stringify({ provider: 'aws', sourceUri: 'backend/test/fixtures/billing-agent-anomalies.csv' })
    });

    const deniedScan = await request('/api/v1/billing-agent/anomaly-scan', {
      method: 'POST',
      headers: authHeaders('viewer')
    });
    expect(deniedScan.status).toBe(403);

    const scanResponse = await request('/api/v1/billing-agent/anomaly-scan', {
      method: 'POST',
      headers: authHeaders('analyst')
    });
    const scan = await scanResponse.json();

    expect(scanResponse.status).toBe(200);
    expect(scan.created.map((anomaly: { type: string }) => anomaly.type).sort()).toEqual([
      'coverage',
      'new_spend',
      'unit_price',
      'usage'
    ]);
    expect(
      scan.created.every(
        (anomaly: { evidence: { costRecordIds: string[]; pricingRows: unknown[] }; explanationMd: string }) =>
          anomaly.evidence.costRecordIds.length > 0 && anomaly.evidence.pricingRows.length > 0 && anomaly.explanationMd.length > 0
      )
    ).toBe(true);

    const listResponse = await request('/api/v1/anomalies?status=open&type=usage', {
      headers: authHeaders('viewer')
    });
    const listed = await listResponse.json();
    const usage = listed.data[0];

    expect(listResponse.status).toBe(200);
    expect(usage.type).toBe('usage');

    const badUpdate = await request(`/api/v1/anomalies/${usage.id}`, {
      method: 'PATCH',
      headers: { ...authHeaders('analyst'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'false_positive', falsePositiveReason: 'seasonal' })
    });
    expect(badUpdate.status).toBe(400);

    const updateResponse = await request(`/api/v1/anomalies/${usage.id}`, {
      method: 'PATCH',
      headers: { ...authHeaders('analyst'), 'Content-Type': 'application/json', 'Idempotency-Key': 'live-i-false-positive' },
      body: JSON.stringify({ status: 'false_positive', falsePositiveReason: 'seasonal' })
    });
    const updated = await updateResponse.json();

    expect(updateResponse.status).toBe(200);
    expect(updated.status).toBe('false_positive');
  });
});
