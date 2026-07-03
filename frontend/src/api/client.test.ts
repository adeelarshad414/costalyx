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
});
