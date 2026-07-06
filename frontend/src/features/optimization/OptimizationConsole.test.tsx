import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { CostalyxClient } from '../../api/client';
import { AuthProvider, type KeycloakAdapter } from '../../auth/AuthProvider';
import { OptimizationConsole } from './OptimizationConsole';

function renderWithRole(ui: React.ReactElement, roles: string[]) {
  const adapter: KeycloakAdapter = {
    token: 'token-1',
    tokenParsed: { sub: 'user-1', realm_access: { roles } },
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
    listRecommendations: async () => ({
      data: [
        {
          id: 'recommendation-1',
          type: 'rightsizing',
          resourceId: 'i-aws-prod-001',
          estimatedSavingsUsd: '1.44000000',
          status: 'open',
          createdAt: '2026-07-04T00:00:00.000Z'
        }
      ],
      meta: { total: 1, page: 1, pageSize: 25 }
    }),
    updateRecommendation: async () => ({
      id: 'recommendation-1',
      type: 'rightsizing',
      resourceId: 'i-aws-prod-001',
      estimatedSavingsUsd: '1.44000000',
      status: 'applied',
      createdAt: '2026-07-04T00:00:00.000Z'
    }),
    listRealizedSavings: async () => ({
      data: [
        {
          id: 'saving-1',
          recommendationId: 'recommendation-1',
          appliedAt: '2026-07-04T00:10:00.000Z',
          baselineCostUsd: '7.30000000',
          actualCostUsd: '0.10000000',
          deltaUsd: '7.20000000',
          verificationSource: 'ingested_billing'
        }
      ],
      meta: { total: 1, page: 1, pageSize: 25 }
    }),
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

describe('OptimizationConsole', () => {
  it('shows read-only recommendations and realized savings to viewers without apply actions', async () => {
    renderWithRole(<OptimizationConsole client={createClient()} />, ['viewer']);

    await waitFor(() => expect(screen.getByText('i-aws-prod-001')).toBeInTheDocument());
    expect(screen.getByText('rightsizing')).toBeInTheDocument();
    expect(screen.getByText('7.20000000')).toHaveClass('font-mono-data');
    expect(screen.queryByRole('button', { name: 'Apply recommendation' })).not.toBeInTheDocument();
  });

  it('lets analysts apply recommendations through the generated client and reloads the ledger', async () => {
    const user = userEvent.setup();
    const updateRecommendation = vi.fn(async () => ({
      id: 'recommendation-1',
      type: 'rightsizing' as const,
      resourceId: 'i-aws-prod-001',
      estimatedSavingsUsd: '1.44000000',
      status: 'applied' as const,
      createdAt: '2026-07-04T00:00:00.000Z'
    }));
    const listRealizedSavings = vi
      .fn()
      .mockResolvedValueOnce({ data: [], meta: { total: 0, page: 1, pageSize: 25 } })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'saving-1',
            recommendationId: 'recommendation-1',
            appliedAt: '2026-07-04T00:10:00.000Z',
            baselineCostUsd: '7.30000000',
            actualCostUsd: '0.10000000',
            deltaUsd: '7.20000000',
            verificationSource: 'ingested_billing'
          }
        ],
        meta: { total: 1, page: 1, pageSize: 25 }
      });

    renderWithRole(
      <OptimizationConsole client={createClient({ updateRecommendation, listRealizedSavings })} />,
      ['analyst']
    );

    await user.click(await screen.findByRole('button', { name: 'Apply recommendation' }));

    expect(updateRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'recommendation-1', status: 'applied' })
    );
    expect(await screen.findByText('7.20000000')).toBeInTheDocument();
  });

  it('renders empty states when no recommendations or realized savings exist', async () => {
    renderWithRole(
      <OptimizationConsole
        client={createClient({
          listRecommendations: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
          listRealizedSavings: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } })
        })}
      />,
      ['viewer']
    );

    expect(await screen.findByRole('heading', { name: 'No open recommendations' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No realized savings yet' })).toBeInTheDocument();
  });

  it('renders an error state when optimization requests fail', async () => {
    renderWithRole(
      <OptimizationConsole
        client={createClient({
          listRecommendations: async () => {
            throw new Error('Optimization unavailable');
          }
        })}
      />,
      ['viewer']
    );

    expect(await screen.findByRole('heading', { name: 'Could not load optimization' })).toBeInTheDocument();
    expect(screen.getByText('Optimization unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
