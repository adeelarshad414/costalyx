import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { CostalyxClient } from '../../api/client';
import { AuthProvider, type KeycloakAdapter } from '../../auth/AuthProvider';
import { InsightsConsole } from './InsightsConsole';

function renderAsViewer(ui: React.ReactElement) {
  const adapter: KeycloakAdapter = {
    token: 'token-1',
    tokenParsed: { sub: 'viewer-user', realm_access: { roles: ['viewer'] } },
    init: async () => true,
    login: async () => undefined,
    logout: async () => undefined,
    updateToken: async () => true
  };
  return render(<AuthProvider adapter={adapter}>{ui}</AuthProvider>);
}

function createInsightsClient(overrides: Partial<CostalyxClient> = {}): CostalyxClient {
  return {
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
    getCostSummary: async () => ({
      totalCostUsd: '0.41600000',
      resourceCount: 1,
      untaggedCount: 1,
      inactiveCount: 0,
      isEstimate: false
    }),
    getCostExplorerFlow: async () => ({
      nodes: [
        { id: 'service:Amazon EC2', label: 'Amazon EC2', costTotalUsd: '0.41600000' },
        { id: 'leaseType:on_demand', label: 'on_demand', costTotalUsd: '0.41600000' }
      ],
      links: [{ source: 'service:Amazon EC2', target: 'leaseType:on_demand', costTotalUsd: '0.41600000' }]
    }),
    createIngestionBatch: async () => {
      throw new Error('not expected');
    },
    exportCostRecords: async () => 'id,provider\nrow-1,aws\n',
    listRoles: async () => ({ data: [] }),
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
    }),
    listReports: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
    runReport: async () => ({ reportId: 'report-1', generatedAt: '2026-07-04T00:00:00.000Z', rows: [] }),
    listViews: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
    createView: async () => {
      throw new Error('not expected');
    },
    ...overrides
  };
}

describe('InsightsConsole', () => {
  it('renders Resource Inventory KPIs, paginated detail, CSV export, and reconciled Explorer flow', async () => {
    const user = userEvent.setup();
    const exportCostRecords = vi.fn(async () => 'id,provider\nrow-1,aws\n');
    const client = createInsightsClient({ exportCostRecords });

    renderAsViewer(<InsightsConsole client={client} />);

    await waitFor(() => expect(screen.getByText('0.41600000')).toBeInTheDocument());
    expect(screen.getByText('Total resources')).toBeInTheDocument();
    expect(screen.getByText('Untagged')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.getByText('i-aws-prod-001')).toBeInTheDocument();
    expect(screen.getByText('Amazon EC2 -> on_demand')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'View as table' }));
    const flowTable = screen.getByRole('table', { name: 'Cost Explorer flow table' });
    expect(flowTable).toBeInTheDocument();
    expect(within(flowTable).getByRole('columnheader', { name: 'Source' })).toBeInTheDocument();
    expect(within(flowTable).getByRole('columnheader', { name: 'Target' })).toBeInTheDocument();
    expect(within(flowTable).getByRole('cell', { name: 'USD 0.41600000' })).toHaveClass('font-mono-data', 'numeric-cell');
    await user.click(screen.getByRole('button', { name: 'View as flow' }));
    expect(screen.queryByRole('table', { name: 'Cost Explorer flow table' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Export inventory CSV' }));
    expect(exportCostRecords).toHaveBeenCalled();
    expect(await screen.findByText('2 CSV rows ready')).toBeInTheDocument();
  });

  it('renders the Resource Inventory empty state when no records match the provider filter', async () => {
    const client = createInsightsClient({
      listCostRecords: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
      getCostSummary: async () => ({
        totalCostUsd: '0.00000000',
        resourceCount: 0,
        untaggedCount: 0,
        inactiveCount: 0,
        isEstimate: false
      }),
      getCostExplorerFlow: async () => ({ nodes: [], links: [] })
    });

    renderAsViewer(<InsightsConsole client={client} />);

    expect(await screen.findByRole('heading', { name: 'No inventory rows match this filter' })).toBeInTheDocument();
  });

  it('renders an error state with retry when an insights request fails', async () => {
    const client = createInsightsClient({
      getCostExplorerFlow: async () => {
        throw new Error('HTTP 500 {"detail":"Explorer unavailable","access_token":"secret","stack":"at getCostExplorerFlow"}');
      }
    });

    renderAsViewer(<InsightsConsole client={client} />);

    expect(await screen.findByRole('heading', { name: 'Could not load insights' })).toBeInTheDocument();
    expect(screen.getByText('Load insights failed. Try again or contact an administrator if this keeps happening.')).toBeInTheDocument();
    expect(screen.queryByText(/access_token|stack|HTTP 500/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
