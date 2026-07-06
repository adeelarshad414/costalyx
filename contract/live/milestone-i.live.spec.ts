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

  it('generates stakeholder statements and enforces approval before send', async () => {
    await request('/api/v1/ingestion/batches', {
      method: 'POST',
      headers: { ...authHeaders('admin'), 'Content-Type': 'application/json', 'Idempotency-Key': 'live-i-statements-ingestion' },
      body: JSON.stringify({ provider: 'aws', sourceUri: 'backend/test/fixtures/billing-agent-anomalies.csv' })
    });

    const recordsResponse = await request('/api/v1/cost-records?page=1&pageSize=1', {
      headers: authHeaders('viewer')
    });
    const records = await recordsResponse.json();
    expect(recordsResponse.status).toBe(200);
    expect(records.data.length).toBeGreaterThan(0);

    const accountGroupResponse = await request('/api/v1/account-groups', {
      method: 'POST',
      headers: { ...authHeaders('admin'), 'Content-Type': 'application/json', 'Idempotency-Key': 'live-i-statement-group' },
      body: JSON.stringify({ name: 'Live statement owner', accountIds: [records.data[0].accountId] })
    });
    const accountGroup = await accountGroupResponse.json();
    expect(accountGroupResponse.status).toBe(201);

    const stakeholderResponse = await request('/api/v1/billing-statement-stakeholders', {
      method: 'POST',
      headers: { ...authHeaders('admin'), 'Content-Type': 'application/json', 'Idempotency-Key': 'live-i-statement-stakeholder' },
      body: JSON.stringify({
        name: 'Live Finance Partner',
        email: 'live-finance@example.test',
        roleLabel: 'Budget owner',
        notificationChannel: 'email'
      })
    });
    const stakeholder = await stakeholderResponse.json();
    expect(stakeholderResponse.status).toBe(201);

    const scopeResponse = await request('/api/v1/billing-scopes', {
      method: 'POST',
      headers: { ...authHeaders('admin'), 'Content-Type': 'application/json', 'Idempotency-Key': 'live-i-statement-scope' },
      body: JSON.stringify({
        stakeholderId: stakeholder.id,
        scopeType: 'account_group',
        scopeRef: accountGroup.id,
        label: 'Live statement account group',
        scopeFilter: { accountIds: [records.data[0].accountId] }
      })
    });
    expect(scopeResponse.status).toBe(201);

    const generatedResponse = await request('/api/v1/billing-statements/generate', {
      method: 'POST',
      headers: { ...authHeaders('analyst'), 'Content-Type': 'application/json', 'Idempotency-Key': 'live-i-statements-generate' },
      body: JSON.stringify({
        periodStart: '2026-06-01T00:00:00.000Z',
        periodEnd: '2026-06-30T23:59:59.000Z'
      })
    });
    const generated = await generatedResponse.json();
    expect(generatedResponse.status).toBe(201);
    expect(generated.reconciliation.reconcilesToTenantTotal).toBe(true);
    expect(generated.statements.length).toBeGreaterThan(0);
    const statement = generated.statements[0];

    const deniedSend = await request(`/api/v1/billing-statements/${statement.id}/send`, {
      method: 'POST',
      headers: { ...authHeaders('viewer'), 'Idempotency-Key': 'live-i-statement-denied-send' }
    });
    expect(deniedSend.status).toBe(403);

    const sendBeforeApproval = await request(`/api/v1/billing-statements/${statement.id}/send`, {
      method: 'POST',
      headers: { ...authHeaders('admin'), 'Idempotency-Key': 'live-i-statement-send-before-approval' }
    });
    expect(sendBeforeApproval.status).toBe(400);

    const approveResponse = await request(`/api/v1/billing-statements/${statement.id}/approve`, {
      method: 'POST',
      headers: { ...authHeaders('admin'), 'Idempotency-Key': 'live-i-statement-approve' }
    });
    const approved = await approveResponse.json();
    expect(approveResponse.status).toBe(200);
    expect(approved.status).toBe('approved');

    const sendResponse = await request(`/api/v1/billing-statements/${statement.id}/send`, {
      method: 'POST',
      headers: { ...authHeaders('admin'), 'Idempotency-Key': 'live-i-statement-send' }
    });
    const sent = await sendResponse.json();
    expect(sendResponse.status).toBe(200);
    expect(sent.status).toBe('sent');
  });
});
