import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { CostalyxClient } from '../../api/client';
import { AuthProvider, type KeycloakAdapter } from '../../auth/AuthProvider';
import { CloudPortfolioConsole } from './CloudPortfolioConsole';

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

const connection = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: '00000000-0000-4000-8000-000000000001',
  externalId: 'costalyx:00000000-0000-4000-8000-000000000001:11111111-1111-4111-8111-111111111111',
  provider: 'aws',
  displayName: 'AWS production payer',
  externalTenantId: '123456789012',
  accessMode: 'aws_assume_role',
  readOnlyPrincipal: 'arn:aws:iam::123456789012:role/CostalyxReadOnlyBilling',
  billingExportUri: 's3://customer-cur/costalyx/',
  status: 'ready_for_live_probe',
  lastValidatedAt: null,
  lastValidationAttemptedAt: '2026-07-06T00:00:00.000Z',
  lastValidationCode: 'live_probes_disabled',
  lastValidationMessage:
    'Structural validation passed. Set COSTALYX_LIVE_CLOUD_PROBES=enabled in the Costalyx runtime to run AWS STS and CUR S3 probes.',
  createdAt: '2026-07-06T00:00:00.000Z'
} as const;

function createClient(overrides: Partial<CostalyxClient> = {}): CostalyxClient {
  return {
    listCostRecords: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
    getCostSummary: async () => ({
      totalCostUsd: '123.45000000',
      resourceCount: 4,
      untaggedCount: 0,
      inactiveCount: 0,
      isEstimate: false
    }),
    getCostExplorerFlow: async () => ({ nodes: [], links: [] }),
    createIngestionBatch: async () => {
      throw new Error('not expected');
    },
    exportCostRecords: async () => 'id,provider\n',
    listTenants: async () => ({
      data: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          name: 'Default Tenant',
          slug: 'default',
          plan: 'business',
          createdAt: '2026-07-06T00:00:00.000Z'
        }
      ]
    }),
    listCloudConnections: async () => ({ data: [connection], meta: { total: 1, page: 1, pageSize: 100 } }),
    createCloudConnection: async () => connection,
    validateCloudConnection: async () => connection,
    listAccounts: async () => ({ data: [], meta: { total: 4, page: 1, pageSize: 1 } }),
    listAccountGroups: async () => ({ data: [], meta: { total: 2, page: 1, pageSize: 1 } }),
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
    runReport: async () => ({ reportId: 'report-1', generatedAt: '2026-07-06T00:00:00.000Z', rows: [] }),
    listViews: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
    createView: async () => {
      throw new Error('not expected');
    },
    ...overrides
  };
}

describe('CloudPortfolioConsole', () => {
  it('shows tenant rollups and provider/connection filters without admin controls for viewers', async () => {
    const user = userEvent.setup();
    const getCostSummary = vi.fn(createClient().getCostSummary);

    renderWithRole(<CloudPortfolioConsole client={createClient({ getCostSummary })} />, ['viewer']);

    expect(await screen.findByRole('heading', { name: 'Cloud portfolio' })).toBeInTheDocument();
    expect(screen.getByText('default')).toHaveClass('font-mono-data');
    expect(await screen.findByText('USD 123.45000000')).toHaveClass('font-mono-data');
    expect(screen.getAllByText('AWS production payer').length).toBeGreaterThan(0);
    expect(screen.getByText('ready for probe')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add connection' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'AWS' }));
    await waitFor(() => expect(getCostSummary).toHaveBeenCalledWith(expect.objectContaining({ provider: 'aws' })));

    await user.selectOptions(screen.getByLabelText('Connection'), connection.id);
    await waitFor(() =>
      expect(getCostSummary).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'aws', cloudConnectionId: connection.id })
      )
    );
    expect(screen.getByText(connection.externalId)).toHaveClass('font-mono-data');
    expect(screen.getByText(connection.lastValidationMessage)).toBeInTheDocument();
  });

  it('lets admins register and validate a read-only cloud connection', async () => {
    const user = userEvent.setup();
    const createCloudConnection = vi.fn(createClient().createCloudConnection);
    const validateCloudConnection = vi.fn(createClient().validateCloudConnection);

    renderWithRole(
      <CloudPortfolioConsole client={createClient({ createCloudConnection, validateCloudConnection })} />,
      ['admin']
    );

    await user.click(await screen.findByRole('button', { name: 'Add connection' }));

    expect(createCloudConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'aws',
        accessMode: 'aws_assume_role',
        readOnlyPrincipal: connection.readOnlyPrincipal,
        idempotencyKey: 'cloud-connection-aws-123456789012'
      })
    );
    expect(validateCloudConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        id: connection.id,
        idempotencyKey: `cloud-connection-validation-${connection.id}`
      })
    );
  });
});
