import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { CostalyxClient } from '../../api/client';
import { AuthProvider, type KeycloakAdapter } from '../../auth/AuthProvider';
import { CloudPortfolioConsole } from './CloudPortfolioConsole';

type CloudConnectionOnboarding = Awaited<ReturnType<NonNullable<CostalyxClient['getCloudConnectionOnboarding']>>>;
type CloudConnectionRuns = Awaited<ReturnType<NonNullable<CostalyxClient['listCloudConnectionRuns']>>>;

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

const onboarding: CloudConnectionOnboarding = {
  provider: 'aws',
  connectionId: connection.id,
  externalId: connection.externalId,
  status: 'ready',
  brokerPrincipalArn: 'arn:aws:iam::999999999999:role/CostalyxBroker',
  billingExportUri: connection.billingExportUri,
  trustPolicy: {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: 'arn:aws:iam::999999999999:role/CostalyxBroker' },
        Action: 'sts:AssumeRole',
        Condition: { StringEquals: { 'sts:ExternalId': connection.externalId } }
      }
    ]
  },
  permissionsPolicy: {
    Version: '2012-10-17',
    Statement: [{ Sid: 'CostalyxReadBillingExportObjects', Action: ['s3:GetObject'] }]
  },
  customerSteps: ['Create or update the AWS IAM role trust policy with the generated external ID.']
};

const connectionRuns: CloudConnectionRuns = {
  data: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      tenantId: connection.tenantId,
      cloudConnectionId: connection.id,
      runType: 'ingestion',
      status: 'succeeded',
      startedAt: '2026-07-06T01:00:00.000Z',
      completedAt: '2026-07-06T01:00:02.000Z',
      evidence: {
        provider: 'aws',
        sourceUri: 'backend/test/fixtures/aws-cur-sample.csv',
        ingestedRows: 3,
        duplicateRows: 0
      },
      createdAt: '2026-07-06T01:00:02.000Z'
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      tenantId: connection.tenantId,
      cloudConnectionId: connection.id,
      runType: 'validation',
      status: 'succeeded',
      startedAt: '2026-07-06T00:00:00.000Z',
      completedAt: '2026-07-06T00:00:00.000Z',
      evidence: {
        code: 'live_probes_disabled',
        connectionStatus: 'ready_for_live_probe',
        message: connection.lastValidationMessage
      },
      createdAt: '2026-07-06T00:00:00.000Z'
    }
  ],
  meta: { total: 2, page: 1, pageSize: 5 }
};

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
    getCloudConnectionOnboarding: async () => onboarding,
    listCloudConnectionRuns: async () => connectionRuns,
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
    expect(await screen.findByText('Run evidence')).toBeInTheDocument();
    expect(screen.getByText('ingestion')).toBeInTheDocument();
    expect(screen.getByText('validation')).toBeInTheDocument();
    expect(screen.getByText('3 rows, 0 duplicates')).toHaveClass('font-mono-data');
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

  it('lets admins load AWS onboarding policies for the selected connection', async () => {
    const user = userEvent.setup();
    const getCloudConnectionOnboarding = vi.fn(createClient().getCloudConnectionOnboarding);

    renderWithRole(<CloudPortfolioConsole client={createClient({ getCloudConnectionOnboarding })} />, ['admin']);

    await user.selectOptions(await screen.findByLabelText('Connection'), connection.id);
    await user.click(screen.getByRole('button', { name: 'Load policies' }));

    expect(getCloudConnectionOnboarding).toHaveBeenCalledWith({ id: connection.id });
    expect(await screen.findByText('arn:aws:iam::999999999999:role/CostalyxBroker')).toHaveClass('font-mono-data');
    expect(screen.getByText('Create or update the AWS IAM role trust policy with the generated external ID.')).toBeInTheDocument();
    expect(screen.getByText(/sts:ExternalId/)).toBeInTheDocument();
    expect(screen.getByText(/CostalyxReadBillingExportObjects/)).toBeInTheDocument();
  });
});
