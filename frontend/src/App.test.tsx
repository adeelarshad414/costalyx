import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { AuthProvider, type KeycloakAdapter } from './auth/AuthProvider';
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

  it('renders a first-party signup route that opens Keycloak registration with an email hint', async () => {
    const user = userEvent.setup();
    const adapter = unauthenticatedAdapter();
    window.history.replaceState({}, '', '/signup?next=/executive');

    renderApp(adapter);

    await screen.findByRole('heading', { name: 'Create your Costalyx account' });
    await screen.findByRole('button', { name: 'Create account' });
    await user.type(screen.getByLabelText('Email'), 'cfo@example.com');
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
    expect(screen.getByRole('region', { name: 'Executive summary' })).toHaveTextContent('Executive page');
    expect(screen.queryByRole('region', { name: 'Cloud portfolio' })).not.toBeInTheDocument();

    const executiveLink = screen.getByRole('link', { name: 'Executive' });
    expect(executiveLink).toHaveAttribute('href', '/executive');
    expect(executiveLink).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByRole('link').every((link) => !(link.getAttribute('href') ?? '').startsWith('#'))).toBe(true);
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
