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

describeIfLive('Milestone G live backend contract', () => {
  it('applies a shared saved view to Viewer cost summary and canned report runs', async () => {
    await request('/api/v1/ingestion/batches', {
      method: 'POST',
      headers: { ...authHeaders('admin'), 'Content-Type': 'application/json', 'Idempotency-Key': 'live-g-aws' },
      body: JSON.stringify({ provider: 'aws', sourceUri: 'backend/test/fixtures/aws-cur-sample.csv' })
    });
    await request('/api/v1/ingestion/batches', {
      method: 'POST',
      headers: { ...authHeaders('admin'), 'Content-Type': 'application/json', 'Idempotency-Key': 'live-g-azure' },
      body: JSON.stringify({ provider: 'azure', sourceUri: 'backend/test/fixtures/azure-cost-export-sample.csv' })
    });

    const viewResponse = await request('/api/v1/views', {
      method: 'POST',
      headers: { ...authHeaders('admin'), 'Content-Type': 'application/json', 'Idempotency-Key': 'live-g-view' },
      body: JSON.stringify({ name: 'Live AWS viewer scope', filterJson: { provider: 'aws' }, sharedRoleScope: ['viewer'] })
    });
    const view = await viewResponse.json();

    const reportsResponse = await request('/api/v1/reports?page=1&pageSize=10', { headers: authHeaders('viewer') });
    const reports = await reportsResponse.json();
    const costReport = reports.data.find((report: { category: string }) => report.category === 'cost');
    const summaryResponse = await request('/api/v1/cost-records/summary', {
      headers: { ...authHeaders('viewer'), 'X-Costalyx-View-Id': view.id }
    });
    const reportRunResponse = await request(`/api/v1/reports/${costReport.id}/run`, {
      headers: { ...authHeaders('viewer'), 'X-Costalyx-View-Id': view.id }
    });
    const summary = await summaryResponse.json();
    const reportRun = await reportRunResponse.json();

    expect(viewResponse.status).toBe(201);
    expect(reportsResponse.status).toBe(200);
    expect(summary.totalCostUsd).toBe('50.15600000');
    expect(reportRunResponse.status).toBe(200);
    expect(reportRun.rows.every((row: { provider?: string }) => row.provider === 'aws')).toBe(true);
  });
});
