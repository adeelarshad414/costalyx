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

describeIfLive('Milestone E live backend contract', () => {
  it('applies an optimization recommendation and exposes an ingested-billing realized savings row', async () => {
    await request('/api/v1/ingestion/batches', {
      method: 'POST',
      headers: { ...authHeaders('admin'), 'Content-Type': 'application/json', 'Idempotency-Key': 'live-e-ingestion' },
      body: JSON.stringify({ provider: 'aws', sourceUri: 'backend/test/fixtures/aws-cur-sample.csv' })
    });

    const recommendationsResponse = await request('/api/v1/recommendations?status=open', {
      headers: authHeaders('viewer')
    });
    const recommendations = await recommendationsResponse.json();
    const recommendation = recommendations.data.find(
      (item: { resourceId: string }) => item.resourceId === 'i-aws-prod-001'
    );

    expect(recommendationsResponse.status).toBe(200);
    expect(recommendation).toBeTruthy();

    const applyResponse = await request(`/api/v1/recommendations/${recommendation.id}`, {
      method: 'PATCH',
      headers: { ...authHeaders('analyst'), 'Content-Type': 'application/json', 'Idempotency-Key': 'live-e-apply' },
      body: JSON.stringify({ status: 'applied' })
    });
    const ledgerResponse = await request('/api/v1/realized-savings', {
      headers: authHeaders('viewer')
    });
    const ledger = await ledgerResponse.json();

    expect(applyResponse.status).toBe(200);
    expect(ledgerResponse.status).toBe(200);
    expect(ledger.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recommendationId: recommendation.id,
          verificationSource: 'ingested_billing'
        })
      ])
    );
  });
});
