import type { paths } from './schema';

type CostRecordListResponse =
  paths['/cost-records']['get']['responses']['200']['content']['application/json'];
type IngestionBatchCreateRequest =
  paths['/ingestion/batches']['post']['requestBody']['content']['application/json'];
type IngestionBatchResponse =
  paths['/ingestion/batches']['post']['responses']['202']['content']['application/json'];
type RolesResponse = paths['/roles']['get']['responses']['200']['content']['application/json'];
type CostSummaryResponse =
  paths['/cost-records/summary']['get']['responses']['200']['content']['application/json'];
type DimensionsResponse = paths['/dimensions']['get']['responses']['200']['content']['application/json'];
type DimensionCreateRequest = paths['/dimensions']['post']['requestBody']['content']['application/json'];
type DimensionResponse = paths['/dimensions']['post']['responses']['201']['content']['application/json'];
type DimensionMappingCreateRequest =
  paths['/dimensions/{id}/mappings']['post']['requestBody']['content']['application/json'];
type DimensionMappingResponse =
  paths['/dimensions/{id}/mappings']['post']['responses']['201']['content']['application/json'];
type ResourceTagsResponse = paths['/resource-tags']['get']['responses']['200']['content']['application/json'];
type ResourceTagUpsertRequest = paths['/resource-tags']['post']['requestBody']['content']['application/json'];
type ResourceTagResponse = paths['/resource-tags']['post']['responses']['201']['content']['application/json'];

export interface CostalyxClient {
  listCostRecords(query?: { dimension?: string }): Promise<CostRecordListResponse>;
  getCostSummary(query?: { dimension?: string }): Promise<CostSummaryResponse>;
  createIngestionBatch(input: IngestionBatchCreateRequest & { idempotencyKey: string }): Promise<IngestionBatchResponse>;
  exportCostRecords(): Promise<string>;
  listRoles(): Promise<RolesResponse>;
  listDimensions(): Promise<DimensionsResponse>;
  createDimension(input: DimensionCreateRequest & { idempotencyKey: string }): Promise<DimensionResponse>;
  createDimensionMapping(
    input: DimensionMappingCreateRequest & { dimensionId: string; idempotencyKey: string }
  ): Promise<DimensionMappingResponse>;
  listResourceTags(input: { resourceId: string }): Promise<ResourceTagsResponse>;
  upsertResourceTag(input: ResourceTagUpsertRequest & { idempotencyKey: string }): Promise<ResourceTagResponse>;
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
    async listCostRecords(query) {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...(await authHeaders())
      };
      const params = new URLSearchParams();
      if (query?.dimension) {
        params.set('dimension', query.dimension);
      }

      const response = await fetch(`${baseUrl}/cost-records${queryString(params)}`, { headers });
      if (!response.ok) {
        throw new Error(`Cost records request failed with ${response.status}`);
      }
      return response.json() as Promise<CostRecordListResponse>;
    },

    async getCostSummary(query) {
      const params = new URLSearchParams();
      if (query?.dimension) {
        params.set('dimension', query.dimension);
      }
      const response = await fetch(`${baseUrl}/cost-records/summary${queryString(params)}`, {
        headers: {
          Accept: 'application/json',
          ...(await authHeaders())
        }
      });
      if (!response.ok) {
        throw new Error(`Cost summary request failed with ${response.status}`);
      }
      return response.json() as Promise<CostSummaryResponse>;
    },

    async exportCostRecords() {
      const response = await fetch(`${baseUrl}/cost-records/export`, {
        headers: {
          Accept: 'text/csv',
          ...(await authHeaders())
        }
      });
      if (!response.ok) {
        throw new Error(`Cost records export failed with ${response.status}`);
      }
      return response.text();
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
    },

    async listRoles() {
      const response = await fetch(`${baseUrl}/roles`, {
        headers: {
          Accept: 'application/json',
          ...(await authHeaders())
        }
      });
      if (!response.ok) {
        throw new Error(`Roles request failed with ${response.status}`);
      }
      return response.json() as Promise<RolesResponse>;
    },

    async listDimensions() {
      const response = await fetch(`${baseUrl}/dimensions`, {
        headers: {
          Accept: 'application/json',
          ...(await authHeaders())
        }
      });
      if (!response.ok) {
        throw new Error(`Dimensions request failed with ${response.status}`);
      }
      return response.json() as Promise<DimensionsResponse>;
    },

    async createDimension({ idempotencyKey, ...body }) {
      const response = await fetch(`${baseUrl}/dimensions`, {
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
        throw new Error(`Dimension create request failed with ${response.status}`);
      }
      return response.json() as Promise<DimensionResponse>;
    },

    async createDimensionMapping({ dimensionId, idempotencyKey, ...body }) {
      const response = await fetch(`${baseUrl}/dimensions/${dimensionId}/mappings`, {
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
        throw new Error(`Dimension mapping request failed with ${response.status}`);
      }
      return response.json() as Promise<DimensionMappingResponse>;
    },

    async listResourceTags({ resourceId }) {
      const params = new URLSearchParams({ resourceId });
      const response = await fetch(`${baseUrl}/resource-tags${queryString(params)}`, {
        headers: {
          Accept: 'application/json',
          ...(await authHeaders())
        }
      });
      if (!response.ok) {
        throw new Error(`Resource tags request failed with ${response.status}`);
      }
      return response.json() as Promise<ResourceTagsResponse>;
    },

    async upsertResourceTag({ idempotencyKey, ...body }) {
      const response = await fetch(`${baseUrl}/resource-tags`, {
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
        throw new Error(`Resource tag request failed with ${response.status}`);
      }
      return response.json() as Promise<ResourceTagResponse>;
    }
  };
}

export const costalyxClient: CostalyxClient = createCostalyxClient();

function queryString(params: URLSearchParams): string {
  const value = params.toString();
  return value ? `?${value}` : '';
}
