import type { paths } from './schema';

type CostRecordListResponse =
  paths['/cost-records']['get']['responses']['200']['content']['application/json'];

export interface CostalyxClient {
  listCostRecords(): Promise<CostRecordListResponse>;
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

interface CostalyxClientOptions {
  baseUrl?: string;
  getAccessToken?: () => Promise<string | null>;
}

export function createCostalyxClient({ baseUrl = apiBaseUrl, getAccessToken }: CostalyxClientOptions = {}): CostalyxClient {
  return {
    async listCostRecords() {
      const token = await getAccessToken?.();
      const headers: Record<string, string> = {
        Accept: 'application/json'
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(`${baseUrl}/cost-records`, { headers });
      if (!response.ok) {
        throw new Error(`Cost records request failed with ${response.status}`);
      }
      return response.json() as Promise<CostRecordListResponse>;
    }
  };
}

export const costalyxClient: CostalyxClient = createCostalyxClient();
