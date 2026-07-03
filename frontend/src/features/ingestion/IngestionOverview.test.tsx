import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IngestionOverview } from './IngestionOverview';
import type { CostalyxClient } from '../../api/client';
import { AuthProvider, type KeycloakAdapter } from '../../auth/AuthProvider';

function renderAsAdmin(ui: React.ReactElement) {
  const adapter: KeycloakAdapter = {
    token: 'token-1',
    tokenParsed: { sub: 'admin-user', realm_access: { roles: ['admin'] } },
    init: async () => true,
    login: async () => undefined,
    logout: async () => undefined,
    updateToken: async () => true
  };
  return render(<AuthProvider adapter={adapter}>{ui}</AuthProvider>);
}

describe('IngestionOverview', () => {
  const governanceClientMethods = {
    exportCostRecords: async () => 'id,provider\n',
    listRoles: async () => ({ data: [] }),
    getCostSummary: async () => ({
      totalCostUsd: '0.00000000',
      resourceCount: 0,
      untaggedCount: 0,
      inactiveCount: 0,
      isEstimate: false
    }),
    getCostExplorerFlow: async () => ({ nodes: [], links: [] }),
    listDimensions: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
    createDimension: async () => {
      throw new Error('not expected');
    },
    createDimensionMapping: async () => {
      throw new Error('not expected');
    },
    listResourceTags: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
    upsertResourceTag: async () => {
      throw new Error('not expected');
    },
    listRecommendations: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
    updateRecommendation: async () => {
      throw new Error('not expected');
    },
    listRealizedSavings: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
    getExecutiveSummary: async () => ({
      totalSpendUsd: '0.00000000',
      revenueBaselineUsd: '1000.00000000',
      spendAsRevenuePercent: '0.0000',
      budgetBaselineUsd: '100.00000000',
      budgetUsedPercent: '0.0000',
      trend: { direction: 'flat', deltaUsd: '0.00000000' },
      topMovers: []
    }),
    exportExecutiveSummaryPdf: async () => '%PDF-1.4',
    estimateTco: async () => ({
      aws: { monthlyCostUsd: '0.00000000', isEstimate: true, assumptions: [] },
      azure: { monthlyCostUsd: '0.00000000', isEstimate: true, assumptions: [] },
      gcp: { monthlyCostUsd: '0.00000000', isEstimate: true, assumptions: [] },
      tolerancePercent: '0.0000'
    })
  } satisfies Omit<CostalyxClient, 'listCostRecords' | 'createIngestionBatch'>;

  it('renders populated cost data with mono-formatted money from the generated client wrapper', async () => {
    const client: CostalyxClient = {
      ...governanceClientMethods,
      listCostRecords: async () => ({
        data: [
          {
            id: 'row-1',
            provider: 'aws',
            accountId: 'account-1',
            resourceId: 'i-aws-prod-001',
            serviceName: 'Amazon EC2',
            leaseType: 'on_demand',
            hourlyRateUsd: '0.04160000',
            usageHours: '10.0000',
            costTotalUsd: '0.41600000',
            isEstimate: false,
            validFrom: '2026-06-01T00:00:00.000Z'
          }
        ],
        meta: { total: 1, page: 1, pageSize: 25 }
      }),
      createIngestionBatch: async () => {
        throw new Error('not expected');
      }
    };

    renderAsAdmin(<IngestionOverview client={client} />);

    expect(screen.getByText('Loading cost records')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('i-aws-prod-001')).toBeInTheDocument());
    expect(screen.getByText('0.41600000')).toHaveClass('font-mono-data');
  });

  it('renders a designed empty state when the API returns no cost records', async () => {
    const client: CostalyxClient = {
      ...governanceClientMethods,
      listCostRecords: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
      createIngestionBatch: async () => {
        throw new Error('not expected');
      }
    };

    renderAsAdmin(<IngestionOverview client={client} />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'No cost records yet' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Run ingestion' })).toBeInTheDocument();
  });

  it('renders a designed error state when the API rejects', async () => {
    const client: CostalyxClient = {
      ...governanceClientMethods,
      listCostRecords: async () => {
        throw new Error('Forbidden');
      },
      createIngestionBatch: async () => {
        throw new Error('not expected');
      }
    };

    renderAsAdmin(<IngestionOverview client={client} />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Could not load cost records' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('runs ingestion through the real client and reloads records', async () => {
    let loaded = false;
    const client: CostalyxClient = {
      ...governanceClientMethods,
      listCostRecords: async () =>
        loaded
          ? {
              data: [
                {
                  id: 'row-1',
                  provider: 'aws',
                  accountId: 'account-1',
                  resourceId: 'i-aws-prod-001',
                  serviceName: 'Amazon EC2',
                  leaseType: 'on_demand',
                  hourlyRateUsd: '0.04160000',
                  usageHours: '10.0000',
                  costTotalUsd: '0.41600000',
                  isEstimate: false,
                  validFrom: '2026-06-01T00:00:00.000Z'
                }
              ],
              meta: { total: 1, page: 1, pageSize: 25 }
            }
          : { data: [], meta: { total: 0, page: 1, pageSize: 25 } },
      createIngestionBatch: async () => {
        loaded = true;
        return {
          id: 'batch-1',
          provider: 'aws',
          status: 'complete',
          sourceUri: 'backend/test/fixtures/aws-cur-sample.csv',
          createdAt: '2026-07-03T00:00:00.000Z',
          completedAt: '2026-07-03T00:00:00.000Z',
          ingestedRows: 1,
          duplicateRows: 0
        };
      }
    };

    renderAsAdmin(<IngestionOverview client={client} />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'No cost records yet' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Run ingestion' }));

    await waitFor(() => expect(screen.getByText('i-aws-prod-001')).toBeInTheDocument());
  });
});
