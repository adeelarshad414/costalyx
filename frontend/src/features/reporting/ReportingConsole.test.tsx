import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { CostalyxClient } from '../../api/client';
import { AuthProvider, type KeycloakAdapter } from '../../auth/AuthProvider';
import { ReportingConsole } from './ReportingConsole';

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
    listReports: async () => ({
      data: [
        { id: '11111111-1111-4111-8111-111111111111', name: 'Cost Detail', category: 'cost' },
        { id: '22222222-2222-4222-8222-222222222222', name: 'Cost Summary', category: 'cost_summary' },
        { id: '33333333-3333-4333-8333-333333333333', name: 'Invoices', category: 'invoices' },
        { id: '44444444-4444-4444-8444-444444444444', name: 'Utilization', category: 'utilization' },
        { id: '55555555-5555-4555-8555-555555555555', name: 'Underutilization', category: 'underutilization' }
      ],
      meta: { total: 5, page: 1, pageSize: 25 }
    }),
    runReport: async () => ({
      reportId: '11111111-1111-4111-8111-111111111111',
      generatedAt: '2026-07-04T00:00:00.000Z',
      rows: [{ provider: 'aws', resourceId: 'db-prod-001', costTotalUsd: '49.64000000' }]
    }),
    listViews: async () => ({
      data: [
        {
          id: '66666666-6666-4666-8666-666666666666',
          orgId: '77777777-7777-4777-8777-777777777777',
          name: 'AWS Viewer Scope',
          filterJson: { provider: 'aws' },
          ownerId: '88888888-8888-4888-8888-888888888888',
          sharedRoleScope: ['viewer']
        }
      ],
      meta: { total: 1, page: 1, pageSize: 25 }
    }),
    createView: async () => ({
      id: '66666666-6666-4666-8666-666666666666',
      orgId: '77777777-7777-4777-8777-777777777777',
      name: 'AWS Viewer Scope',
      filterJson: { provider: 'aws' },
      ownerId: '88888888-8888-4888-8888-888888888888',
      sharedRoleScope: ['viewer']
    }),
    ...overrides
  };
}

describe('ReportingConsole', () => {
  it('renders canned reports, active shared views, and scoped report results', async () => {
    const user = userEvent.setup();
    const runReport = vi.fn(createClient().runReport);

    renderWithRole(<ReportingConsole client={createClient({ runReport })} />, ['viewer']);

    expect(await screen.findByText('Cost Detail')).toBeInTheDocument();
    expect(screen.getByText('Cost Summary')).toBeInTheDocument();
    expect(screen.getByText('Invoices')).toBeInTheDocument();
    expect(screen.getByText('Utilization')).toBeInTheDocument();
    expect(screen.getByText('Underutilization')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create AWS view' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Run Cost Detail' }));
    expect(runReport).toHaveBeenCalledWith(
      expect.objectContaining({ id: '11111111-1111-4111-8111-111111111111', activeViewId: '66666666-6666-4666-8666-666666666666' })
    );
    expect(await screen.findByText('db-prod-001')).toBeInTheDocument();
    expect(screen.getByText('49.64000000')).toHaveClass('font-mono-data');
  });

  it('lets admins create a Viewer-shared AWS scoped view', async () => {
    const user = userEvent.setup();
    const createView = vi.fn(createClient().createView);

    renderWithRole(<ReportingConsole client={createClient({ createView, listViews: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }) })} />, ['admin']);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Create AWS view' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Create AWS view' }));

    expect(createView).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'AWS Viewer Scope',
        filterJson: { provider: 'aws' },
        sharedRoleScope: ['viewer']
      })
    );
    expect(await screen.findByText('AWS Viewer Scope')).toBeInTheDocument();
  });

  it('renders an error state with retry when reporting requests fail', async () => {
    const listReports = vi.fn().mockRejectedValueOnce(new Error('Reports unavailable')).mockResolvedValueOnce({
      data: [],
      meta: { total: 0, page: 1, pageSize: 25 }
    });
    const user = userEvent.setup();

    renderWithRole(<ReportingConsole client={createClient({ listReports })} />, ['viewer']);

    expect(await screen.findByRole('heading', { name: 'Could not load reports' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'No reports available' })).toBeInTheDocument();
  });
});
