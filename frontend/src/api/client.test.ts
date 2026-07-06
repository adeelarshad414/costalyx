import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCostalyxClient } from './client';

describe('createCostalyxClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends bearer auth from the Keycloak session and never uses the local test-role header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } })
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createCostalyxClient({
      baseUrl: 'http://api.test/api/v1',
      getAccessToken: async () => 'signed-keycloak-token'
    });

    await client.listCostRecords();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/v1/cost-records',
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer signed-keycloak-token'
        }
      })
    );
    expect(JSON.stringify(fetchMock.mock.calls[0][1])).not.toContain('x-costalyx-role');
  });

  it('creates ingestion batches with bearer auth and an idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'batch-1',
        provider: 'aws',
        status: 'complete',
        sourceUri: 'backend/test/fixtures/aws-cur-sample.csv',
        createdAt: '2026-07-03T00:00:00.000Z',
        completedAt: '2026-07-03T00:00:00.000Z',
        ingestedRows: 1,
        duplicateRows: 0
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createCostalyxClient({
      baseUrl: 'http://api.test/api/v1',
      getAccessToken: async () => 'signed-keycloak-token'
    });

    await client.createIngestionBatch({
      provider: 'aws',
      sourceUri: 'backend/test/fixtures/aws-cur-sample.csv',
      idempotencyKey: 'ingestion-key-1'
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/v1/ingestion/batches',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer signed-keycloak-token',
          'Content-Type': 'application/json',
          'Idempotency-Key': 'ingestion-key-1'
        },
        body: JSON.stringify({ provider: 'aws', sourceUri: 'backend/test/fixtures/aws-cur-sample.csv' })
      })
    );
  });

  it('loads fixed roles and exports cost records with bearer auth', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ name: 'viewer', fixed: true }] })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'id,provider\n'
      });
    vi.stubGlobal('fetch', fetchMock);

    const client = createCostalyxClient({
      baseUrl: 'http://api.test/api/v1',
      getAccessToken: async () => 'signed-keycloak-token'
    });

    await expect(client.listRoles()).resolves.toEqual({ data: [{ name: 'viewer', fixed: true }] });
    await expect(client.exportCostRecords()).resolves.toBe('id,provider\n');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/api/v1/roles',
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer signed-keycloak-token'
        }
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/api/v1/cost-records/export',
      expect.objectContaining({
        headers: {
          Accept: 'text/csv',
          Authorization: 'Bearer signed-keycloak-token'
        }
      })
    );
  });

  it('loads cost explorer flow with filters, dimensions, and bearer auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        nodes: [{ id: 'service:Amazon EC2', label: 'Amazon EC2', costTotalUsd: '0.41600000' }],
        links: []
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createCostalyxClient({
      baseUrl: 'http://api.test/api/v1',
      getAccessToken: async () => 'signed-keycloak-token'
    });

    await client.getCostExplorerFlow({
      provider: 'aws',
      dimensions: ['service', 'leaseType'],
      costFloorUsd: '0.01000000'
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/v1/cost-explorer/flow?provider=aws&dimensions=service%2CleaseType&costFloorUsd=0.01000000',
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer signed-keycloak-token'
        }
      })
    );
  });

  it('sends bearer auth and idempotency keys for dynamic allocation mutations', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'dimension-1', orgId: 'org-1', name: 'Team', createdBy: 'actor-1', createdAt: '2026-07-03T00:00:00.000Z' }],
          meta: { total: 1, page: 1, pageSize: 25 }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'dimension-1', orgId: 'org-1', name: 'Team', createdBy: 'actor-1', createdAt: '2026-07-03T00:00:00.000Z' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'mapping-1', dimensionId: 'dimension-1', tagKey: 'owner', tagValuePattern: 'platform' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ resourceId: 'i-aws-prod-001', tagKey: 'owner', tagValue: 'platform', source: 'manual' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ totalCostUsd: '0.41600000', resourceCount: 1, untaggedCount: 2, inactiveCount: 0, isEstimate: false })
      });
    vi.stubGlobal('fetch', fetchMock);

    const client = createCostalyxClient({
      baseUrl: 'http://api.test/api/v1',
      getAccessToken: async () => 'signed-keycloak-token'
    });

    await client.listDimensions();
    await client.createDimension({ name: 'Team', idempotencyKey: 'dimension-key-1' });
    await client.createDimensionMapping({
      dimensionId: 'dimension-1',
      tagKey: 'owner',
      tagValuePattern: 'platform',
      idempotencyKey: 'mapping-key-1'
    });
    await client.upsertResourceTag({
      resourceId: 'i-aws-prod-001',
      tagKey: 'owner',
      tagValue: 'platform',
      source: 'manual',
      idempotencyKey: 'tag-key-1'
    });
    await client.getCostSummary({ dimension: 'dimension-1' });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/api/v1/dimensions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer signed-keycloak-token',
          'Idempotency-Key': 'dimension-key-1'
        })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://api.test/api/v1/dimensions/dimension-1/mappings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer signed-keycloak-token',
          'Idempotency-Key': 'mapping-key-1'
        })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://api.test/api/v1/resource-tags',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer signed-keycloak-token',
          'Idempotency-Key': 'tag-key-1'
        })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'http://api.test/api/v1/cost-records/summary?dimension=dimension-1',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer signed-keycloak-token' })
      })
    );
  });

  it('sends bearer auth and idempotency keys for optimization recommendations', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'recommendation-1', type: 'rightsizing', resourceId: 'i-1', estimatedSavingsUsd: '1.00000000', status: 'open', createdAt: '2026-07-04T00:00:00.000Z' }],
          meta: { total: 1, page: 1, pageSize: 25 }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'recommendation-1',
          type: 'rightsizing',
          resourceId: 'i-1',
          estimatedSavingsUsd: '1.00000000',
          status: 'applied',
          createdAt: '2026-07-04T00:00:00.000Z'
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } })
      });
    vi.stubGlobal('fetch', fetchMock);

    const client = createCostalyxClient({
      baseUrl: 'http://api.test/api/v1',
      getAccessToken: async () => 'signed-keycloak-token'
    });

    await client.listRecommendations({ status: 'open' });
    await client.updateRecommendation({
      id: 'recommendation-1',
      status: 'applied',
      idempotencyKey: 'recommendation-key-1'
    });
    await client.listRealizedSavings();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/api/v1/recommendations?status=open',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer signed-keycloak-token' })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/api/v1/recommendations/recommendation-1',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          Authorization: 'Bearer signed-keycloak-token',
          'Idempotency-Key': 'recommendation-key-1'
        }),
        body: JSON.stringify({ status: 'applied' })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://api.test/api/v1/realized-savings',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer signed-keycloak-token' })
      })
    );
  });

  it('sends bearer auth for executive summary and idempotency keys for TCO estimates', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalSpendUsd: '50.15600000',
          revenueBaselineUsd: '1000.00000000',
          spendAsRevenuePercent: '5.0156',
          budgetBaselineUsd: '100.00000000',
          budgetUsedPercent: '50.1560',
          trend: { direction: 'up', deltaUsd: '49.64000000' },
          topMovers: []
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '%PDF-1.4 executive'
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          aws: { monthlyCostUsd: '49.64000000', isEstimate: false, assumptions: ['rate from workloadSpec'] },
          azure: { monthlyCostUsd: '70.08000000', isEstimate: true, assumptions: ['rate from workloadSpec'] },
          gcp: { monthlyCostUsd: '34.67500000', isEstimate: true, assumptions: ['rate from workloadSpec'] },
          tolerancePercent: '0.0000'
        })
      });
    vi.stubGlobal('fetch', fetchMock);

    const client = createCostalyxClient({
      baseUrl: 'http://api.test/api/v1',
      getAccessToken: async () => 'signed-keycloak-token'
    });

    await client.getExecutiveSummary({ revenueBaselineUsd: '1000.00000000', budgetBaselineUsd: '100.00000000' });
    await expect(client.exportExecutiveSummaryPdf()).resolves.toBe('%PDF-1.4 executive');
    await client.estimateTco({
      workloadSpec: {
        usageHours: '730.0000',
        providerHourlyRatesUsd: { aws: '0.06800000', azure: '0.09600000', gcp: '0.04750000' }
      },
      idempotencyKey: 'tco-key-1'
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/api/v1/executive-summary?revenueBaselineUsd=1000.00000000&budgetBaselineUsd=100.00000000',
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer signed-keycloak-token'
        }
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/api/v1/executive-summary/export',
      expect.objectContaining({
        headers: {
          Accept: 'application/pdf',
          Authorization: 'Bearer signed-keycloak-token'
        }
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://api.test/api/v1/tco/estimate',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer signed-keycloak-token',
          'Content-Type': 'application/json',
          'Idempotency-Key': 'tco-key-1'
        }
      })
    );
  });

  it('sends bearer auth, active view scope, and idempotency for reporting views', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'report-1', name: 'Cost Detail', category: 'cost' }],
          meta: { total: 1, page: 1, pageSize: 25 }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          reportId: 'report-1',
          generatedAt: '2026-07-04T00:00:00.000Z',
          rows: [{ provider: 'aws', resourceId: 'db-prod-001', costTotalUsd: '49.64000000' }]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'view-1', name: 'AWS Viewer Scope', filterJson: { provider: 'aws' }, sharedRoleScope: ['viewer'] }],
          meta: { total: 1, page: 1, pageSize: 25 }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'view-1',
          name: 'AWS Viewer Scope',
          filterJson: { provider: 'aws' },
          sharedRoleScope: ['viewer']
        })
      });
    vi.stubGlobal('fetch', fetchMock);

    const client = createCostalyxClient({
      baseUrl: 'http://api.test/api/v1',
      getAccessToken: async () => 'signed-keycloak-token'
    });

    await client.listReports({ category: 'cost' });
    await client.runReport({ id: 'report-1', activeViewId: 'view-1' });
    await client.listViews();
    await client.createView({
      name: 'AWS Viewer Scope',
      filterJson: { provider: 'aws' },
      sharedRoleScope: ['viewer'],
      idempotencyKey: 'view-key-1'
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/api/v1/reports?category=cost',
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer signed-keycloak-token'
        }
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/api/v1/reports/report-1/run',
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer signed-keycloak-token',
          'X-Costalyx-View-Id': 'view-1'
        }
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://api.test/api/v1/views',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer signed-keycloak-token',
          'Content-Type': 'application/json',
          'Idempotency-Key': 'view-key-1'
        },
        body: JSON.stringify({
          name: 'AWS Viewer Scope',
          filterJson: { provider: 'aws' },
          sharedRoleScope: ['viewer']
        })
      })
    );
  });
});
