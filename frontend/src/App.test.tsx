import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { createCostalyxClient, type CostalyxClient } from './api/client';
import { AuthProvider, type KeycloakAdapter } from './auth/AuthProvider';
import { clearBootstrapCache } from './bootstrapCache';
import { UserPreferencesProvider } from './preferences/UserPreferences';

vi.mock('./api/client', () => ({
  createCostalyxClient: vi.fn(() => ({}))
}));

vi.mock('./features/portfolio/CloudPortfolioConsole', () => ({
  CloudPortfolioConsole: () => <section aria-label="Cloud portfolio">Portfolio page</section>
}));

vi.mock('./features/ingestion/IngestionOverview', () => ({
  IngestionOverview: () => <section aria-label="Normalized cost records">Costs page</section>
}));

vi.mock('./features/executive/ExecutiveConsole', () => ({
  ExecutiveConsole: () => <section aria-label="Executive summary">Executive page</section>
}));

vi.mock('./features/insights/InsightsConsole', () => ({
  InsightsConsole: () => <section aria-label="Resource inventory and cost explorer">Insights page</section>
}));

vi.mock('./features/optimization/OptimizationConsole', () => ({
  OptimizationConsole: () => <section aria-label="Optimization recommendations">Optimization page</section>
}));

vi.mock('./features/billing-agent/BillingAgentConsole', () => ({
  BillingAgentConsole: () => <section aria-label="Billing anomalies">Billing Agent page</section>
}));

vi.mock('./features/reporting/ReportingConsole', () => ({
  ReportingConsole: () => <section aria-label="Reporting and saved views">Reporting page</section>
}));

vi.mock('./features/allocation/AllocationConsole', () => ({
  AllocationConsole: () => <section aria-label="Allocation and dynamic tagging">Allocation page</section>
}));

vi.mock('./features/governance/GovernanceConsole', () => ({
  GovernanceConsole: () => <section aria-label="Access and trust controls">Governance page</section>
}));

vi.mock('./features/settings/SettingsConsole', () => ({
  SettingsConsole: () => <section aria-label="Settings">Settings page</section>
}));

vi.mock('./features/operator/OperatorReadinessConsole', () => ({
  OperatorReadinessConsole: () => <section aria-label="Operational readiness">Operator page</section>
}));

describe('App routing and auth pages', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    clearBootstrapCache();
    vi.mocked(createCostalyxClient).mockReturnValue(createClientStub());
  });

  it('renders a first-party login route that starts Keycloak sign-in for the workspace', async () => {
    const user = userEvent.setup();
    const adapter = unauthenticatedAdapter();
    window.history.replaceState({}, '', '/login');

    renderApp(adapter);

    await screen.findByRole('heading', { name: 'Sign in to Costalyx' });
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));

    expect(adapter.login).toHaveBeenCalledWith(expect.objectContaining({ redirectUri: `${window.location.origin}/portfolio` }));
  });

  it('renders a first-party signin route that starts the same Keycloak sign-in module', async () => {
    const user = userEvent.setup();
    const adapter = unauthenticatedAdapter();
    window.history.replaceState({}, '', '/signin?next=/costs');

    renderApp(adapter);

    await screen.findByRole('region', { name: 'Signin' });
    await screen.findByRole('heading', { name: 'Sign in to Costalyx' });
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));

    expect(adapter.login).toHaveBeenCalledWith(expect.objectContaining({ redirectUri: `${window.location.origin}/costs` }));
  });

  it('renders a first-party signup route that opens Keycloak registration with an email hint', async () => {
    const user = userEvent.setup();
    const adapter = unauthenticatedAdapter();
    window.history.replaceState({}, '', '/signup?next=/executive');

    renderApp(adapter);

    await screen.findByRole('heading', { name: 'Create your Costalyx account' });
    await screen.findByRole('button', { name: 'Create account' });
    await user.type(screen.getByLabelText('Email'), 'cfo@example.com');
    expect(screen.getByRole('link', { name: 'Already have an account?' })).toHaveAttribute('href', '/signin?next=%2Fexecutive');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(adapter.login).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'register',
        loginHint: 'cfo@example.com',
        redirectUri: `${window.location.origin}/executive`
      })
    );
  });

  it('renders one product page per path and uses path links instead of hash anchors', async () => {
    window.history.replaceState({}, '', '/executive');

    renderApp(authenticatedAdapter());

    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Product sections' })).toBeVisible());
    expect(await screen.findByText('Executive page')).toBeInTheDocument();
    expect(document.title).toBe('Executive | Costalyx');
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      'Turn cloud spend into a buyer-ready view of trend, budget posture, and top movers.'
    );
    expect(screen.queryByText('Portfolio page')).not.toBeInTheDocument();

    const executiveLink = screen.getByRole('link', { name: /Executive/i });
    expect(executiveLink).toHaveAttribute('href', '/executive');
    expect(executiveLink).toHaveAttribute('aria-current', 'page');
    const productNav = screen.getByRole('navigation', { name: 'Product sections' });
    expect(within(productNav).getAllByRole('link').every((link) => !(link.getAttribute('href') ?? '').startsWith('#'))).toBe(true);
  });

  it('renders a dedicated not-found route instead of dropping unknown paths into auth fallback', async () => {
    window.history.replaceState({}, '', '/does-not-exist');

    renderApp(unauthenticatedAdapter());

    expect(await screen.findByRole('heading', { name: 'That Costalyx page does not exist' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open cloud portfolio' })).toHaveAttribute('href', '/portfolio');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/signin');
    expect(document.title).toBe('Page not found | Costalyx');
  });

  it('opens a searchable command palette for quick route access', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/executive');

    renderApp(authenticatedAdapter());

    await screen.findByText('Executive page');
    await user.click(await screen.findByRole('button', { name: /Jump to screen/i }));

    const searchInput = await screen.findByLabelText('Search screens');
    expect(searchInput).toHaveAttribute('placeholder', 'Search portfolio, billing, reporting...');
    await user.type(searchInput, 'govern');
    const palette = screen.getByRole('region', { name: 'Jump to any workspace screen' });
    expect(within(palette).getByRole('link', { name: /Governance/i })).toHaveAttribute('href', '/governance');
  });

  it('keeps protected deep links on a proper login screen and returns users to that page after auth', async () => {
    const user = userEvent.setup();
    const adapter = unauthenticatedAdapter();
    window.history.replaceState({}, '', '/billing-agent');

    renderApp(adapter);

    await screen.findByRole('heading', { name: 'Sign in to Costalyx' });
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));

    expect(adapter.login).toHaveBeenCalledWith(
      expect.objectContaining({ redirectUri: `${window.location.origin}/billing-agent` })
    );
  });

  it('shows a staged workspace loader while authenticated route data is still warming', async () => {
    const client = createClientStub();
    let releaseWorkspaceLoad: (() => void) | undefined;
    const heldWorkspaceLoad = new Promise<void>((resolve) => {
      releaseWorkspaceLoad = resolve;
    });

    vi.mocked(createCostalyxClient).mockReturnValue({
      ...client,
      listViews: vi.fn(async () => {
        await heldWorkspaceLoad;
        return {
          data: [],
          meta: { total: 0, page: 1, pageSize: 5 }
        };
      }),
      getExecutiveSummary: vi.fn(async () => {
        await heldWorkspaceLoad;
        return {
          totalSpendUsd: '0.00000000',
          revenueBaselineUsd: '1000.00000000',
          spendAsRevenuePercent: '0.0000',
          budgetBaselineUsd: '100.00000000',
          budgetUsedPercent: '0.0000',
          trend: { direction: 'flat' as const, deltaUsd: '0.00000000' },
          topMovers: []
        };
      })
    } as unknown as CostalyxClient);

    window.history.replaceState({}, '', '/executive');
    renderApp(authenticatedAdapter());

    expect(await screen.findByRole('main', { name: 'Preparing Costalyx workspace' })).toBeVisible();
    expect(screen.getByRole('progressbar', { name: 'Workspace ready' })).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('Syncing workspace context')).toBeInTheDocument();

    releaseWorkspaceLoad?.();
    await waitFor(() => expect(screen.getByText('Executive page')).toBeInTheDocument());
  });
});

function renderApp(adapter: KeycloakAdapter) {
  return render(
    <UserPreferencesProvider>
      <AuthProvider adapter={adapter}>
        <App />
      </AuthProvider>
    </UserPreferencesProvider>
  );
}

function unauthenticatedAdapter(): KeycloakAdapter {
  return {
    init: vi.fn().mockResolvedValue(false),
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
    updateToken: vi.fn()
  };
}

function authenticatedAdapter(): KeycloakAdapter {
  return {
    token: 'token-1',
    tokenParsed: {
      sub: 'user-1',
      realm_access: { roles: ['admin'] }
    },
    init: vi.fn().mockResolvedValue(true),
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
    updateToken: vi.fn().mockResolvedValue(true)
  };
}

function createClientStub(): CostalyxClient {
  return {
    listCostRecords: vi.fn(async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } })),
    getCostSummary: vi.fn(async () => ({
      totalCostUsd: '0.00000000',
      resourceCount: 0,
      untaggedCount: 0,
      inactiveCount: 0,
      isEstimate: false
    })),
    getCostExplorerFlow: vi.fn(async () => ({ nodes: [], links: [] })),
    createIngestionBatch: vi.fn(async () => ({
      id: 'ingestion-1',
      provider: 'aws' as const,
      status: 'pending' as const,
      createdAt: '2026-07-08T00:00:00.000Z',
      ingestedRows: 0,
      duplicateRows: 0
    })),
    exportCostRecords: vi.fn(async () => 'id,provider\n'),
    listRoles: vi.fn(async () => ({ data: [] })),
    listDimensions: vi.fn(async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } })),
    createDimension: vi.fn(async () => ({
      id: 'dimension-1',
      orgId: 'org-1',
      name: 'Team',
      createdBy: 'user-1',
      createdAt: '2026-07-08T00:00:00.000Z'
    })),
    createDimensionMapping: vi.fn(async () => ({
      id: 'mapping-1',
      dimensionId: 'dimension-1',
      tagKey: 'owner',
      tagValuePattern: 'platform'
    })),
    listResourceTags: vi.fn(async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } })),
    upsertResourceTag: vi.fn(async () => ({
      resourceId: 'resource-1',
      tagKey: 'owner',
      tagValue: 'platform',
      source: 'manual' as const
    })),
    listRecommendations: vi.fn(async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } })),
    updateRecommendation: vi.fn(async () => ({
      id: 'recommendation-1',
      type: 'idle' as const,
      resourceId: 'resource-1',
      estimatedSavingsUsd: '0.00000000',
      status: 'applied' as const,
      createdAt: '2026-07-08T00:00:00.000Z'
    })),
    listRealizedSavings: vi.fn(async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } })),
    getExecutiveSummary: vi.fn(async () => ({
      totalSpendUsd: '0.00000000',
      revenueBaselineUsd: '1000.00000000',
      spendAsRevenuePercent: '0.0000',
      budgetBaselineUsd: '100.00000000',
      budgetUsedPercent: '0.0000',
      trend: { direction: 'flat' as const, deltaUsd: '0.00000000' },
      topMovers: []
    })),
    exportExecutiveSummaryPdf: vi.fn(async () => '%PDF-1.4'),
    estimateTco: vi.fn(async () => ({
      aws: { monthlyCostUsd: '0.00000000', isEstimate: true, assumptions: [] },
      azure: { monthlyCostUsd: '0.00000000', isEstimate: true, assumptions: [] },
      gcp: { monthlyCostUsd: '0.00000000', isEstimate: true, assumptions: [] },
      tolerancePercent: '0.0000'
    })),
    listReports: vi.fn(async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } })),
    runReport: vi.fn(async () => ({ reportId: 'report-1', generatedAt: '2026-07-04T00:00:00.000Z', rows: [] })),
    listViews: vi.fn(async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 5 } })),
    createView: vi.fn(async () => ({
      id: 'view-1',
      orgId: 'org-1',
      name: 'AWS Viewer Scope',
      filterJson: { provider: 'aws' },
      ownerId: 'owner-1',
      sharedRoleScope: ['viewer' as const]
    }))
  } as unknown as CostalyxClient;
}
