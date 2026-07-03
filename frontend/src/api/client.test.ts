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
});
