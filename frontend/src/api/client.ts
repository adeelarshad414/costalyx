import type { paths } from './schema';

type CostRecordListResponse =
  paths['/cost-records']['get']['responses']['200']['content']['application/json'];

export interface CostalyxClient {
  listCostRecords(): Promise<CostRecordListResponse>;
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export const costalyxClient: CostalyxClient = {
  async listCostRecords() {
    const response = await fetch(`${apiBaseUrl}/cost-records`, {
      headers: {
        Accept: 'application/json',
        'x-costalyx-role': 'viewer'
      }
    });
    if (!response.ok) {
      throw new Error(`Cost records request failed with ${response.status}`);
    }
    return response.json() as Promise<CostRecordListResponse>;
  }
};
