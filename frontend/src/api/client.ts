import type { paths } from './schema';

type CostRecordListResponse =
  paths['/cost-records']['get']['responses']['200']['content']['application/json'];
type IngestionBatchCreateRequest =
  paths['/ingestion/batches']['post']['requestBody']['content']['application/json'];
type IngestionBatchResponse =
  paths['/ingestion/batches']['post']['responses']['202']['content']['application/json'];

export interface CostalyxClient {
  listCostRecords(): Promise<CostRecordListResponse>;
  createIngestionBatch(input: IngestionBatchCreateRequest & { idempotencyKey: string }): Promise<IngestionBatchResponse>;
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

interface CostalyxClientOptions {
  baseUrl?: string;
  getAccessToken?: () => Promise<string | null>;
}

export function createCostalyxClient({ baseUrl = apiBaseUrl, getAccessToken }: CostalyxClientOptions = {}): CostalyxClient {
  async function authHeaders(): Promise<Record<string, string>> {
    const token = await getAccessToken?.();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  return {
    async listCostRecords() {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...(await authHeaders())
      };

      const response = await fetch(`${baseUrl}/cost-records`, { headers });
      if (!response.ok) {
        throw new Error(`Cost records request failed with ${response.status}`);
      }
      return response.json() as Promise<CostRecordListResponse>;
    },

    async createIngestionBatch({ idempotencyKey, ...body }) {
      const response = await fetch(`${baseUrl}/ingestion/batches`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          ...(await authHeaders())
        },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        throw new Error(`Ingestion request failed with ${response.status}`);
      }
      return response.json() as Promise<IngestionBatchResponse>;
    }
  };
}

export const costalyxClient: CostalyxClient = createCostalyxClient();
