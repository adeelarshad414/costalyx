import type { paths } from './schema';

type CostRecordListResponse =
  paths['/cost-records']['get']['responses']['200']['content']['application/json'];
type IngestionBatchCreateRequest =
  paths['/ingestion/batches']['post']['requestBody']['content']['application/json'];
type IngestionBatchResponse =
  paths['/ingestion/batches']['post']['responses']['202']['content']['application/json'];
type TenantsResponse = paths['/tenants']['get']['responses']['200']['content']['application/json'];
type TenantCreateRequest = paths['/tenants']['post']['requestBody']['content']['application/json'];
type TenantResponse = paths['/tenants']['post']['responses']['201']['content']['application/json'];
type CloudConnectionsResponse =
  paths['/cloud-connections']['get']['responses']['200']['content']['application/json'];
type CloudConnectionCreateRequest =
  paths['/cloud-connections']['post']['requestBody']['content']['application/json'];
type CloudConnectionResponse =
  paths['/cloud-connections']['post']['responses']['201']['content']['application/json'];
type CloudConnectionOnboardingResponse =
  paths['/cloud-connections/{id}/onboarding']['get']['responses']['200']['content']['application/json'];
type CloudConnectionRunsResponse =
  paths['/cloud-connections/{id}/runs']['get']['responses']['200']['content']['application/json'];
type AccountsResponse = paths['/accounts']['get']['responses']['200']['content']['application/json'];
type AccountGroupsResponse = paths['/account-groups']['get']['responses']['200']['content']['application/json'];
type RolesResponse = paths['/roles']['get']['responses']['200']['content']['application/json'];
type CostSummaryResponse =
  paths['/cost-records/summary']['get']['responses']['200']['content']['application/json'];
type CostExplorerFlowResponse =
  paths['/cost-explorer/flow']['get']['responses']['200']['content']['application/json'];
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
type RecommendationsResponse = paths['/recommendations']['get']['responses']['200']['content']['application/json'];
type RecommendationPatchRequest =
  paths['/recommendations/{id}']['patch']['requestBody']['content']['application/json'];
type RecommendationResponse =
  paths['/recommendations/{id}']['patch']['responses']['200']['content']['application/json'];
type RealizedSavingsResponse = paths['/realized-savings']['get']['responses']['200']['content']['application/json'];
type ExecutiveSummaryResponse =
  paths['/executive-summary']['get']['responses']['200']['content']['application/json'];
type TcoEstimateRequest = paths['/tco/estimate']['post']['requestBody']['content']['application/json'];
type TcoEstimateResponse = paths['/tco/estimate']['post']['responses']['200']['content']['application/json'];
type ReportsResponse = paths['/reports']['get']['responses']['200']['content']['application/json'];
type ReportRunResponse = paths['/reports/{id}/run']['get']['responses']['200']['content']['application/json'];
type ViewsResponse = paths['/views']['get']['responses']['200']['content']['application/json'];
type ViewCreateRequest = paths['/views']['post']['requestBody']['content']['application/json'];
type ViewResponse = paths['/views']['post']['responses']['201']['content']['application/json'];
type CostRecordPathQuery = NonNullable<paths['/cost-records']['get']['parameters']['query']>;
type CloudProvider = NonNullable<CostRecordPathQuery['provider']>;
type ReportCategory = NonNullable<NonNullable<paths['/reports']['get']['parameters']['query']>['category']>;
type RecommendationStatus = NonNullable<
  NonNullable<paths['/recommendations']['get']['parameters']['query']>['status']
>;

interface CostRecordQuery {
  provider?: CloudProvider;
  accountId?: string;
  accountGroupId?: string;
  cloudConnectionId?: string;
  service?: string;
  from?: string;
  to?: string;
  dimension?: string;
  page?: number;
  pageSize?: number;
  activeViewId?: string;
}

interface CostExplorerFlowQuery {
  provider?: CloudProvider;
  accountId?: string;
  accountGroupId?: string;
  cloudConnectionId?: string;
  from?: string;
  to?: string;
  dimensions?: string[];
  costFloorUsd?: string;
  activeViewId?: string;
}

interface RecommendationsQuery {
  status?: RecommendationStatus;
  page?: number;
  pageSize?: number;
}

interface ExecutiveSummaryQuery {
  revenueBaselineUsd?: string;
  budgetBaselineUsd?: string;
}

interface ReportsQuery {
  category?: ReportCategory;
  page?: number;
  pageSize?: number;
}

interface ReportRunQuery {
  id: string;
  activeViewId?: string;
  provider?: CloudProvider;
  accountId?: string;
  accountGroupId?: string;
  cloudConnectionId?: string;
  from?: string;
  to?: string;
}

export interface CostalyxClient {
  listCostRecords(query?: CostRecordQuery): Promise<CostRecordListResponse>;
  getCostSummary(query?: Omit<CostRecordQuery, 'page' | 'pageSize'>): Promise<CostSummaryResponse>;
  getCostExplorerFlow(query?: CostExplorerFlowQuery): Promise<CostExplorerFlowResponse>;
  createIngestionBatch(input: IngestionBatchCreateRequest & { idempotencyKey: string }): Promise<IngestionBatchResponse>;
  exportCostRecords(input?: { activeViewId?: string }): Promise<string>;
  listTenants?(): Promise<TenantsResponse>;
  createTenant?(input: TenantCreateRequest & { idempotencyKey: string }): Promise<TenantResponse>;
  listCloudConnections?(query?: { page?: number; pageSize?: number }): Promise<CloudConnectionsResponse>;
  createCloudConnection?(
    input: CloudConnectionCreateRequest & { idempotencyKey: string }
  ): Promise<CloudConnectionResponse>;
  validateCloudConnection?(input: { id: string; idempotencyKey: string }): Promise<CloudConnectionResponse>;
  getCloudConnectionOnboarding?(input: { id: string }): Promise<CloudConnectionOnboardingResponse>;
  listCloudConnectionRuns?(input: { id: string; page?: number; pageSize?: number }): Promise<CloudConnectionRunsResponse>;
  listAccounts?(query?: { page?: number; pageSize?: number }): Promise<AccountsResponse>;
  listAccountGroups?(query?: { page?: number; pageSize?: number }): Promise<AccountGroupsResponse>;
  listRoles(): Promise<RolesResponse>;
  listDimensions(): Promise<DimensionsResponse>;
  createDimension(input: DimensionCreateRequest & { idempotencyKey: string }): Promise<DimensionResponse>;
  createDimensionMapping(
    input: DimensionMappingCreateRequest & { dimensionId: string; idempotencyKey: string }
  ): Promise<DimensionMappingResponse>;
  listResourceTags(input: { resourceId: string }): Promise<ResourceTagsResponse>;
  upsertResourceTag(input: ResourceTagUpsertRequest & { idempotencyKey: string }): Promise<ResourceTagResponse>;
  listRecommendations(query?: RecommendationsQuery): Promise<RecommendationsResponse>;
  updateRecommendation(
    input: RecommendationPatchRequest & { id: string; idempotencyKey: string }
  ): Promise<RecommendationResponse>;
  listRealizedSavings(query?: { page?: number; pageSize?: number }): Promise<RealizedSavingsResponse>;
  getExecutiveSummary(query?: ExecutiveSummaryQuery): Promise<ExecutiveSummaryResponse>;
  exportExecutiveSummaryPdf(): Promise<string>;
  estimateTco(input: TcoEstimateRequest & { idempotencyKey: string }): Promise<TcoEstimateResponse>;
  listReports(query?: ReportsQuery): Promise<ReportsResponse>;
  runReport(query: ReportRunQuery): Promise<ReportRunResponse>;
  listViews(query?: { page?: number; pageSize?: number }): Promise<ViewsResponse>;
  createView(input: ViewCreateRequest & { idempotencyKey: string }): Promise<ViewResponse>;
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
        ...activeViewHeader(query?.activeViewId),
        ...(await authHeaders())
      };
      const params = costRecordParams(query);

      const response = await fetch(`${baseUrl}/cost-records${queryString(params)}`, { headers });
      if (!response.ok) {
        throw new Error(`Cost records request failed with ${response.status}`);
      }
      return response.json() as Promise<CostRecordListResponse>;
    },

    async getCostSummary(query) {
      const params = costRecordParams(query);
      const response = await fetch(`${baseUrl}/cost-records/summary${queryString(params)}`, {
        headers: {
          Accept: 'application/json',
          ...activeViewHeader(query?.activeViewId),
          ...(await authHeaders())
        }
      });
      if (!response.ok) {
        throw new Error(`Cost summary request failed with ${response.status}`);
      }
      return response.json() as Promise<CostSummaryResponse>;
    },

    async getCostExplorerFlow(query) {
      const params = new URLSearchParams();
      appendParam(params, 'provider', query?.provider);
      appendParam(params, 'accountId', query?.accountId);
      appendParam(params, 'accountGroupId', query?.accountGroupId);
      appendParam(params, 'cloudConnectionId', query?.cloudConnectionId);
      appendParam(params, 'from', query?.from);
      appendParam(params, 'to', query?.to);
      if (query?.dimensions?.length) {
        params.set('dimensions', query.dimensions.join(','));
      }
      appendParam(params, 'costFloorUsd', query?.costFloorUsd);
      const response = await fetch(`${baseUrl}/cost-explorer/flow${queryString(params)}`, {
        headers: {
          Accept: 'application/json',
          ...activeViewHeader(query?.activeViewId),
          ...(await authHeaders())
        }
      });
      if (!response.ok) {
        throw new Error(`Cost explorer request failed with ${response.status}`);
      }
      return response.json() as Promise<CostExplorerFlowResponse>;
    },

    async exportCostRecords(input) {
      const response = await fetch(`${baseUrl}/cost-records/export`, {
        headers: {
          Accept: 'text/csv',
          ...activeViewHeader(input?.activeViewId),
          ...(await authHeaders())
        }
      });
      if (!response.ok) {
        throw new Error(`Cost records export failed with ${response.status}`);
      }
      return response.text();
    },

    async listTenants() {
      const response = await fetch(`${baseUrl}/tenants`, {
        headers: {
          Accept: 'application/json',
          ...(await authHeaders())
        }
      });
      if (!response.ok) {
        throw new Error(`Tenants request failed with ${response.status}`);
      }
      return response.json() as Promise<TenantsResponse>;
    },

    async createTenant({ idempotencyKey, ...body }) {
      const response = await fetch(`${baseUrl}/tenants`, {
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
        throw new Error(`Tenant create request failed with ${response.status}`);
      }
      return response.json() as Promise<TenantResponse>;
    },

    async listCloudConnections(query) {
      const params = new URLSearchParams();
      appendParam(params, 'page', query?.page);
      appendParam(params, 'pageSize', query?.pageSize);
      const response = await fetch(`${baseUrl}/cloud-connections${queryString(params)}`, {
        headers: {
          Accept: 'application/json',
          ...(await authHeaders())
        }
      });
      if (!response.ok) {
        throw new Error(`Cloud connections request failed with ${response.status}`);
      }
      return response.json() as Promise<CloudConnectionsResponse>;
    },

    async createCloudConnection({ idempotencyKey, ...body }) {
      const response = await fetch(`${baseUrl}/cloud-connections`, {
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
        throw new Error(`Cloud connection create request failed with ${response.status}`);
      }
      return response.json() as Promise<CloudConnectionResponse>;
    },

    async validateCloudConnection({ id, idempotencyKey }) {
      const response = await fetch(`${baseUrl}/cloud-connections/${id}/validation`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Idempotency-Key': idempotencyKey,
          ...(await authHeaders())
        }
      });
      if (!response.ok) {
        throw new Error(`Cloud connection validation request failed with ${response.status}`);
      }
      return response.json() as Promise<CloudConnectionResponse>;
    },

    async getCloudConnectionOnboarding({ id }) {
      const response = await fetch(`${baseUrl}/cloud-connections/${id}/onboarding`, {
        headers: {
          Accept: 'application/json',
          ...(await authHeaders())
        }
      });
      if (!response.ok) {
        throw new Error(`Cloud connection onboarding request failed with ${response.status}`);
      }
      return response.json() as Promise<CloudConnectionOnboardingResponse>;
    },

    async listCloudConnectionRuns({ id, page, pageSize }) {
      const params = new URLSearchParams();
      appendParam(params, 'page', page);
      appendParam(params, 'pageSize', pageSize);
      const response = await fetch(`${baseUrl}/cloud-connections/${id}/runs${queryString(params)}`, {
        headers: {
          Accept: 'application/json',
          ...(await authHeaders())
        }
      });
      if (!response.ok) {
        throw new Error(`Cloud connection runs request failed with ${response.status}`);
      }
      return response.json() as Promise<CloudConnectionRunsResponse>;
    },

    async listAccounts(query) {
      const params = new URLSearchParams();
      appendParam(params, 'page', query?.page);
      appendParam(params, 'pageSize', query?.pageSize);
      const response = await fetch(`${baseUrl}/accounts${queryString(params)}`, {
        headers: {
          Accept: 'application/json',
          ...(await authHeaders())
        }
      });
      if (!response.ok) {
        throw new Error(`Accounts request failed with ${response.status}`);
      }
      return response.json() as Promise<AccountsResponse>;
    },

    async listAccountGroups(query) {
      const params = new URLSearchParams();
      appendParam(params, 'page', query?.page);
      appendParam(params, 'pageSize', query?.pageSize);
      const response = await fetch(`${baseUrl}/account-groups${queryString(params)}`, {
        headers: {
          Accept: 'application/json',
          ...(await authHeaders())
        }
      });
      if (!response.ok) {
        throw new Error(`Account groups request failed with ${response.status}`);
      }
      return response.json() as Promise<AccountGroupsResponse>;
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
    },

    async listRecommendations(query) {
      const params = new URLSearchParams();
      appendParam(params, 'status', query?.status);
      appendParam(params, 'page', query?.page);
      appendParam(params, 'pageSize', query?.pageSize);
      const response = await fetch(`${baseUrl}/recommendations${queryString(params)}`, {
        headers: {
          Accept: 'application/json',
          ...(await authHeaders())
        }
      });
      if (!response.ok) {
        throw new Error(`Recommendations request failed with ${response.status}`);
      }
      return response.json() as Promise<RecommendationsResponse>;
    },

    async updateRecommendation({ id, idempotencyKey, ...body }) {
      const response = await fetch(`${baseUrl}/recommendations/${id}`, {
        method: 'PATCH',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          ...(await authHeaders())
        },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        throw new Error(`Recommendation update failed with ${response.status}`);
      }
      return response.json() as Promise<RecommendationResponse>;
    },

    async listRealizedSavings(query) {
      const params = new URLSearchParams();
      appendParam(params, 'page', query?.page);
      appendParam(params, 'pageSize', query?.pageSize);
      const response = await fetch(`${baseUrl}/realized-savings${queryString(params)}`, {
        headers: {
          Accept: 'application/json',
          ...(await authHeaders())
        }
      });
      if (!response.ok) {
        throw new Error(`Realized savings request failed with ${response.status}`);
      }
      return response.json() as Promise<RealizedSavingsResponse>;
    },

    async getExecutiveSummary(query) {
      const params = new URLSearchParams();
      appendParam(params, 'revenueBaselineUsd', query?.revenueBaselineUsd);
      appendParam(params, 'budgetBaselineUsd', query?.budgetBaselineUsd);
      const response = await fetch(`${baseUrl}/executive-summary${queryString(params)}`, {
        headers: {
          Accept: 'application/json',
          ...(await authHeaders())
        }
      });
      if (!response.ok) {
        throw new Error(`Executive summary request failed with ${response.status}`);
      }
      return response.json() as Promise<ExecutiveSummaryResponse>;
    },

    async exportExecutiveSummaryPdf() {
      const response = await fetch(`${baseUrl}/executive-summary/export`, {
        headers: {
          Accept: 'application/pdf',
          ...(await authHeaders())
        }
      });
      if (!response.ok) {
        throw new Error(`Executive summary export failed with ${response.status}`);
      }
      return response.text();
    },

    async estimateTco({ idempotencyKey, ...body }) {
      const response = await fetch(`${baseUrl}/tco/estimate`, {
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
        throw new Error(`TCO estimate request failed with ${response.status}`);
      }
      return response.json() as Promise<TcoEstimateResponse>;
    },

    async listReports(query) {
      const params = new URLSearchParams();
      appendParam(params, 'category', query?.category);
      appendParam(params, 'page', query?.page);
      appendParam(params, 'pageSize', query?.pageSize);
      const response = await fetch(`${baseUrl}/reports${queryString(params)}`, {
        headers: {
          Accept: 'application/json',
          ...(await authHeaders())
        }
      });
      if (!response.ok) {
        throw new Error(`Reports request failed with ${response.status}`);
      }
      return response.json() as Promise<ReportsResponse>;
    },

    async runReport({ id, activeViewId, provider, accountId, accountGroupId, cloudConnectionId, from, to }) {
      const params = new URLSearchParams();
      appendParam(params, 'provider', provider);
      appendParam(params, 'accountId', accountId);
      appendParam(params, 'accountGroupId', accountGroupId);
      appendParam(params, 'cloudConnectionId', cloudConnectionId);
      appendParam(params, 'from', from);
      appendParam(params, 'to', to);
      const response = await fetch(`${baseUrl}/reports/${id}/run${queryString(params)}`, {
        headers: {
          Accept: 'application/json',
          ...activeViewHeader(activeViewId),
          ...(await authHeaders())
        }
      });
      if (!response.ok) {
        throw new Error(`Report run request failed with ${response.status}`);
      }
      return response.json() as Promise<ReportRunResponse>;
    },

    async listViews(query) {
      const params = new URLSearchParams();
      appendParam(params, 'page', query?.page);
      appendParam(params, 'pageSize', query?.pageSize);
      const response = await fetch(`${baseUrl}/views${queryString(params)}`, {
        headers: {
          Accept: 'application/json',
          ...(await authHeaders())
        }
      });
      if (!response.ok) {
        throw new Error(`Views request failed with ${response.status}`);
      }
      return response.json() as Promise<ViewsResponse>;
    },

    async createView({ idempotencyKey, ...body }) {
      const response = await fetch(`${baseUrl}/views`, {
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
        throw new Error(`View create request failed with ${response.status}`);
      }
      return response.json() as Promise<ViewResponse>;
    }
  };
}

export const costalyxClient: CostalyxClient = createCostalyxClient();

function queryString(params: URLSearchParams): string {
  const value = params.toString();
  return value ? `?${value}` : '';
}

function costRecordParams(query?: CostRecordQuery): URLSearchParams {
  const params = new URLSearchParams();
  appendParam(params, 'provider', query?.provider);
  appendParam(params, 'accountId', query?.accountId);
  appendParam(params, 'accountGroupId', query?.accountGroupId);
  appendParam(params, 'cloudConnectionId', query?.cloudConnectionId);
  appendParam(params, 'service', query?.service);
  appendParam(params, 'from', query?.from);
  appendParam(params, 'to', query?.to);
  appendParam(params, 'dimension', query?.dimension);
  if ('page' in (query ?? {}) && query?.page) {
    params.set('page', String(query.page));
  }
  if ('pageSize' in (query ?? {}) && query?.pageSize) {
    params.set('pageSize', String(query.pageSize));
  }
  return params;
}

function appendParam(params: URLSearchParams, key: string, value: string | number | undefined): void {
  if (value !== undefined && value !== '') {
    params.set(key, String(value));
  }
}

function activeViewHeader(activeViewId: string | undefined): Record<string, string> {
  return activeViewId ? { 'X-Costalyx-View-Id': activeViewId } : {};
}
