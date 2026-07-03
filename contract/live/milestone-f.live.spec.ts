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

describeIfLive('Milestone F live backend contract', () => {
  it('returns executive summary and a fixture-matching TCO estimate', async () => {
    await request('/api/v1/ingestion/batches', {
      method: 'POST',
      headers: { ...authHeaders('admin'), 'Content-Type': 'application/json', 'Idempotency-Key': 'live-f-ingestion' },
      body: JSON.stringify({ provider: 'aws', sourceUri: 'backend/test/fixtures/aws-cur-sample.csv' })
    });

    const summaryResponse = await request(
      '/api/v1/executive-summary?revenueBaselineUsd=1000.00000000&budgetBaselineUsd=100.00000000',
      { headers: authHeaders('viewer') }
    );
    const tcoResponse = await request('/api/v1/tco/estimate', {
      method: 'POST',
      headers: { ...authHeaders('viewer'), 'Content-Type': 'application/json', 'Idempotency-Key': 'live-f-tco' },
      body: JSON.stringify({
        workloadSpec: {
          usageHours: '730.0000',
          providerHourlyRatesUsd: {
            aws: '0.06800000',
            azure: '0.09600000',
            gcp: '0.04750000'
          }
        }
      })
    });
    const summary = await summaryResponse.json();
    const tco = await tcoResponse.json();

    expect(summaryResponse.status).toBe(200);
    expect(tcoResponse.status).toBe(200);
    expect(summary.totalSpendUsd).toBe('50.15600000');
    expect(tco.aws.monthlyCostUsd).toBe('49.64000000');
    expect(tco.tolerancePercent).toBe('0.0000');
  });
});
