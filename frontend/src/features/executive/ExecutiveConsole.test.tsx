import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { CostalyxClient } from '../../api/client';
import { AuthProvider, type KeycloakAdapter } from '../../auth/AuthProvider';
import { ExecutiveConsole } from './ExecutiveConsole';

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

function createClient(overrides: Partial<CostalyxClient> = {}): CostalyxClient {
  return {
    listCostRecords: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
    getCostSummary: async () => ({
      totalCostUsd: '0.00000000',
      resourceCount: 0,
      untaggedCount: 0,
      inactiveCount: 0,
      isEstimate: false
    }),
    getCostExplorerFlow: async () => ({ nodes: [], links: [] }),
    createIngestionBatch: async () => {
      throw new Error('not expected');
    },
    exportCostRecords: async () => 'id,provider\n',
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
      totalSpendUsd: '50.15600000',
      revenueBaselineUsd: '1000.00000000',
      spendAsRevenuePercent: '5.0156',
      budgetBaselineUsd: '100.00000000',
      budgetUsedPercent: '50.1560',
      trend: { direction: 'up', deltaUsd: '49.64000000' },
      topMovers: [{ resourceId: 'db-prod-001', serviceName: 'Amazon RDS', deltaUsd: '49.64000000' }]
    }),
    exportExecutiveSummaryPdf: async () => '%PDF-1.4 executive',
    estimateTco: async () => ({
      aws: { monthlyCostUsd: '49.64000000', isEstimate: false, assumptions: ['rate from workloadSpec'] },
      azure: { monthlyCostUsd: '70.08000000', isEstimate: true, assumptions: ['rate from workloadSpec'] },
      gcp: { monthlyCostUsd: '34.67500000', isEstimate: true, assumptions: ['rate from workloadSpec'] },
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

describe('ExecutiveConsole', () => {
  it('renders executive spend KPIs, top movers, PDF export, and TCO comparison', async () => {
    const user = userEvent.setup();
    const exportExecutiveSummaryPdf = vi.fn(async () => '%PDF-1.4 executive');
    const estimateTco = vi.fn(createClient().estimateTco);

    renderAsViewer(<ExecutiveConsole client={createClient({ exportExecutiveSummaryPdf, estimateTco })} />);

    await waitFor(() => expect(screen.getByText('50.15600000')).toBeInTheDocument());
    expect(screen.getByText('5.0156%')).toBeInTheDocument();
    expect(screen.getByText('db-prod-001')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Export executive PDF' }));
    expect(exportExecutiveSummaryPdf).toHaveBeenCalled();
    expect(await screen.findByText('PDF ready')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Estimate TCO' }));
    expect(estimateTco).toHaveBeenCalled();
    expect(await screen.findByText('49.64000000')).toBeInTheDocument();
    expect(screen.getByText('70.08000000')).toBeInTheDocument();
    expect(screen.getByText('34.67500000')).toBeInTheDocument();
  });

  it('renders empty states for top movers and TCO before an estimate is requested', async () => {
    renderAsViewer(
      <ExecutiveConsole
        client={createClient({
          getExecutiveSummary: async () => ({
            totalSpendUsd: '0.00000000',
            revenueBaselineUsd: '1000.00000000',
            spendAsRevenuePercent: '0.0000',
            budgetBaselineUsd: '100.00000000',
            budgetUsedPercent: '0.0000',
            trend: { direction: 'flat', deltaUsd: '0.00000000' },
            topMovers: []
          })
        })}
      />
    );

    expect(await screen.findByRole('heading', { name: 'No top movers yet' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No TCO estimate yet' })).toBeInTheDocument();
  });

  it('renders an error state with retry when the summary request fails', async () => {
    const getExecutiveSummary = vi
      .fn()
      .mockRejectedValueOnce(new Error('Executive unavailable'))
      .mockResolvedValueOnce({
        totalSpendUsd: '50.15600000',
        revenueBaselineUsd: '1000.00000000',
        spendAsRevenuePercent: '5.0156',
        budgetBaselineUsd: '100.00000000',
        budgetUsedPercent: '50.1560',
        trend: { direction: 'up' as const, deltaUsd: '49.64000000' },
        topMovers: [{ resourceId: 'db-prod-001', serviceName: 'Amazon RDS', deltaUsd: '49.64000000' }]
      });
    const user = userEvent.setup();

    renderAsViewer(<ExecutiveConsole client={createClient({ getExecutiveSummary })} />);

    expect(await screen.findByRole('heading', { name: 'Could not load executive summary' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('50.15600000')).toBeInTheDocument();
  });
});
