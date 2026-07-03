import { render, screen, waitFor } from '@testing-library/react';
import type { CostalyxClient } from '../../api/client';
import { AuthProvider, type KeycloakAdapter } from '../../auth/AuthProvider';
import { GovernanceConsole } from './GovernanceConsole';

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

const allocationClientMethods = {
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
  }),
  listReports: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
  runReport: async () => ({ reportId: 'report-1', generatedAt: '2026-07-04T00:00:00.000Z', rows: [] }),
  listViews: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
  createView: async () => {
    throw new Error('not expected');
  }
} satisfies Pick<
  CostalyxClient,
  | 'getCostSummary'
  | 'getCostExplorerFlow'
  | 'listDimensions'
  | 'createDimension'
  | 'createDimensionMapping'
  | 'listResourceTags'
  | 'upsertResourceTag'
  | 'listRecommendations'
  | 'updateRecommendation'
  | 'listRealizedSavings'
  | 'getExecutiveSummary'
  | 'exportExecutiveSummaryPdf'
  | 'estimateTco'
  | 'listReports'
  | 'runReport'
  | 'listViews'
  | 'createView'
>;

describe('GovernanceConsole', () => {
  it('hides admin-only governance actions for a viewer while keeping export available', async () => {
    const client: CostalyxClient = {
      ...allocationClientMethods,
      listCostRecords: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
      createIngestionBatch: async () => {
        throw new Error('not expected');
      },
      listRoles: async () => ({ data: [] }),
      exportCostRecords: async () => 'id,provider\n'
    };

    renderWithRole(<GovernanceConsole client={client} />, ['viewer']);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Register credential' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Fixed roles' })).not.toBeInTheDocument();
  });

  it('loads fixed roles and shows admin-only governance actions for an admin', async () => {
    const client: CostalyxClient = {
      ...allocationClientMethods,
      listCostRecords: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
      createIngestionBatch: async () => {
        throw new Error('not expected');
      },
      listRoles: async () => ({
        data: [
          { name: 'viewer', fixed: true },
          { name: 'analyst', fixed: true },
          { name: 'admin', fixed: true }
        ]
      }),
      exportCostRecords: async () => 'id,provider\n'
    };

    renderWithRole(<GovernanceConsole client={client} />, ['admin']);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Fixed roles' })).toBeInTheDocument());
    expect(await screen.findByText('viewer')).toBeInTheDocument();
    expect(await screen.findByText('analyst')).toBeInTheDocument();
    expect(await screen.findByText('admin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register credential' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account group' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invite user' })).toBeInTheDocument();
  });
});
