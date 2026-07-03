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
});
