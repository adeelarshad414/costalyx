import { useMemo, useState } from 'react';
import { createCostalyxClient, type CostalyxClient } from './api/client';
import { RoleScopeNotice } from './auth/RoleScopeNotice';
import { useAuth, type AuthRedirectOptions } from './auth/AuthProvider';
import { ThemeToggle } from './components/ThemeToggle';
import { ErrorState } from './components/ErrorState';
import { LoadingState } from './components/LoadingState';
import { AllocationConsole } from './features/allocation/AllocationConsole';
import { BillingAgentConsole } from './features/billing-agent/BillingAgentConsole';
import { ExecutiveConsole } from './features/executive/ExecutiveConsole';
import { GovernanceConsole } from './features/governance/GovernanceConsole';
import { IngestionOverview } from './features/ingestion/IngestionOverview';
import { InsightsConsole } from './features/insights/InsightsConsole';
import { OptimizationConsole } from './features/optimization/OptimizationConsole';
import { OperatorReadinessConsole } from './features/operator/OperatorReadinessConsole';
import { CloudPortfolioConsole } from './features/portfolio/CloudPortfolioConsole';
import { ReportingConsole } from './features/reporting/ReportingConsole';
import { SettingsConsole } from './features/settings/SettingsConsole';

type ProductRouteId =
  | 'cloud-portfolio'
  | 'costs'
  | 'executive'
  | 'insights'
  | 'optimization'
  | 'billing-agent'
  | 'reporting'
  | 'allocation'
  | 'governance'
  | 'settings'
  | 'operator';

interface ProductRoute {
  id: ProductRouteId;
  path: string;
  label: string;
  headline: string;
  adminOnly?: true;
}

const defaultProductPath = '/portfolio';

const productRoutes: ProductRoute[] = [
  {
    id: 'cloud-portfolio',
    path: '/portfolio',
    label: 'Cloud portfolio',
    headline: 'Connected cloud portfolio'
  },
  {
    id: 'costs',
    path: '/costs',
    label: 'Costs',
    headline: 'Normalized cost records'
  },
  {
    id: 'executive',
    path: '/executive',
    label: 'Executive',
    headline: 'Executive summary'
  },
  {
    id: 'insights',
    path: '/insights',
    label: 'Insights',
    headline: 'Resource inventory and cost explorer'
  },
  {
    id: 'optimization',
    path: '/optimization',
    label: 'Optimization',
    headline: 'Optimization recommendations'
  },
  {
    id: 'billing-agent',
    path: '/billing-agent',
    label: 'Billing Agent',
    headline: 'Agentic billing intelligence'
  },
  {
    id: 'reporting',
    path: '/reporting',
    label: 'Reporting',
    headline: 'Reporting and saved views'
  },
  {
    id: 'allocation',
    path: '/allocation',
    label: 'Allocation',
    headline: 'Allocation and dynamic tagging'
  },
  {
    id: 'governance',
    path: '/governance',
    label: 'Governance',
    headline: 'Access and trust controls'
  },
  {
    id: 'settings',
    path: '/settings',
    label: 'Settings',
    headline: 'Workspace settings'
  },
  {
    id: 'operator',
    path: '/operator',
    label: 'Operator',
    headline: 'Operational readiness',
    adminOnly: true
  }
];

export function App() {
  const auth = useAuth();
  const route = routeForPath(window.location.pathname);
  const client = useMemo(() => createCostalyxClient({ getAccessToken: auth.getAccessToken }), [auth.getAccessToken]);

  if (route === 'login' || route === 'signup') {
    return <AuthPage mode={route} />;
  }

  if (auth.status !== 'authenticated') {
    return <AuthPage mode="login" protectedPath={route?.path ?? defaultProductPath} />;
  }

  return <ProductShell route={route} client={client} />;
}

function ProductShell({ route, client }: { route: ProductRoute | null; client: CostalyxClient }) {
  const auth = useAuth();
  const accessibleRoutes = productRoutes.filter((candidate) => !candidate.adminOnly || auth.role === 'admin');

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p>Costalyx</p>
          <h1>{route?.headline ?? 'Page not found'}</h1>
        </div>
        <div className="header-actions">
          <ThemeToggle />
          <div className="session-pill">
            <span>{auth.role ?? 'signed in'}</span>
            <button type="button" onClick={auth.logout}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <RoleScopeNotice />
      <nav className="section-nav" aria-label="Product sections">
        {accessibleRoutes.map((candidate) => (
          <a key={candidate.id} href={candidate.path} aria-current={candidate.path === route?.path ? 'page' : undefined}>
            {candidate.label}
          </a>
        ))}
      </nav>
      {route && accessibleRoutes.some((candidate) => candidate.id === route.id) ? (
        <ProductPage route={route} client={client} />
      ) : (
        <section className="panel state" aria-label="Page not found">
          <h2>Page not found</h2>
          <p>Use the product navigation to open a Costalyx workspace page.</p>
          <a className="button-link" href={defaultProductPath}>
            Open cloud portfolio
          </a>
        </section>
      )}
    </main>
  );
}

function ProductPage({ route, client }: { route: ProductRoute; client: CostalyxClient }) {
  switch (route.id) {
    case 'cloud-portfolio':
      return <CloudPortfolioConsole client={client} />;
    case 'costs':
      return <IngestionOverview client={client} />;
    case 'executive':
      return <ExecutiveConsole client={client} />;
    case 'insights':
      return <InsightsConsole client={client} />;
    case 'optimization':
      return <OptimizationConsole client={client} />;
    case 'billing-agent':
      return <BillingAgentConsole client={client} />;
    case 'reporting':
      return <ReportingConsole client={client} />;
    case 'allocation':
      return <AllocationConsole client={client} />;
    case 'governance':
      return <GovernanceConsole client={client} />;
    case 'settings':
      return <SettingsConsole />;
    case 'operator':
      return <OperatorReadinessConsole client={client} />;
    default:
      return null;
  }
}

function AuthPage({ mode, protectedPath }: { mode: 'login' | 'signup'; protectedPath?: string }) {
  const auth = useAuth();
  const [emailHint, setEmailHint] = useState('');
  const nextPath = protectedPath ?? requestedNextPath() ?? defaultProductPath;
  const isSignup = mode === 'signup';
  const submitLabel = isSignup ? 'Create account' : 'Sign in';
  const alternateHref = isSignup ? `/login?next=${encodeURIComponent(nextPath)}` : `/signup?next=${encodeURIComponent(nextPath)}`;

  async function submitAuth() {
    const options: AuthRedirectOptions = {
      redirectPath: nextPath,
      loginHint: emailHint
    };
    if (isSignup) {
      await auth.signup(options);
    } else {
      await auth.login(options);
    }
  }

  return (
    <main className="auth-page">
      <header className="auth-header">
        <div>
          <p>Costalyx</p>
          <h1>{isSignup ? 'Create your Costalyx account' : 'Sign in to Costalyx'}</h1>
        </div>
        <ThemeToggle />
      </header>
      <section className="auth-panel" aria-label={isSignup ? 'Signup' : 'Login'}>
        {auth.status === 'loading' ? (
          <LoadingState title="Checking sign in" variant="cards" rows={2} />
        ) : null}
        {auth.status === 'error' ? (
          <ErrorState title="Could not initialize sign in" detail={auth.error} onRetry={submitAuth} actionLabel={submitLabel} />
        ) : null}
        {auth.status === 'authenticated' ? (
          <div className="state">
            <h2>You are signed in</h2>
            <p>Continue to your Costalyx workspace.</p>
            <a className="button-link" href={nextPath}>
              Open workspace
            </a>
          </div>
        ) : null}
        {auth.status === 'unauthenticated' ? (
          <>
            <div>
              <p className="section-kicker">{isSignup ? 'Secure signup' : 'Secure login'}</p>
              <h2>{isSignup ? 'Start with your work email' : 'Use your Costalyx identity'}</h2>
              <p>
                {isSignup
                  ? 'Costalyx sends account creation to the identity provider so passwords and MFA never live in the app.'
                  : 'Sign in through the configured identity provider to reach your cloud cost workspace.'}
              </p>
            </div>
            <label className="field-row">
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                value={emailHint}
                onChange={(event) => setEmailHint(event.target.value)}
                placeholder="name@company.com"
              />
            </label>
            {auth.error ? <p className="inline-alert">{auth.error}</p> : null}
            <div className="auth-actions">
              <button type="button" onClick={submitAuth}>
                {submitLabel}
              </button>
              <a href={alternateHref}>{isSignup ? 'Already have an account?' : 'Create account'}</a>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}

function routeForPath(pathname: string): ProductRoute | 'login' | 'signup' | null {
  const normalizedPath = normalizePath(pathname);
  if (normalizedPath === '/login') {
    return 'login';
  }
  if (normalizedPath === '/signup') {
    return 'signup';
  }
  if (normalizedPath === '/') {
    return productRoutes[0];
  }
  return productRoutes.find((route) => route.path === normalizedPath) ?? null;
}

function normalizePath(pathname: string): string {
  const normalizedPath = pathname.replace(/\/+$/, '');
  return normalizedPath || '/';
}

function requestedNextPath(): string | null {
  const next = new URLSearchParams(window.location.search).get('next');
  if (!next || !next.startsWith('/') || next.startsWith('//') || next === '/login' || next === '/signup') {
    return null;
  }
  return next;
}
