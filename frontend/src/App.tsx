import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bell,
  Cloud,
  Construction,
  Database,
  FileText,
  Menu,
  PiggyBank,
  Radar,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  User,
  type LucideIcon
} from 'lucide-react';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { createCostalyxClient, type CostalyxClient } from './api/client';
import { AuthPage, type AuthPageMode } from './auth/AuthPage';
import { type AuthStatus, useAuth } from './auth/AuthProvider';
import { RoleScopeNotice } from './auth/RoleScopeNotice';
import { bootstrapKeys, clearBootstrapValue, primeBootstrapValue } from './bootstrapCache';
import { Button, ButtonLink } from './components/Button';
import { BootSplash, SessionLoader, type LoaderStep } from './components/LoadingExperience';
import { Drawer, PopoverSurface } from './components/Overlays';
import { ThemeToggle } from './components/ThemeToggle';
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
import { useUserPreferences } from './preferences/UserPreferences';
import { toUserFacingError } from './utils/userFacingError';

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
  summary: string;
  icon: LucideIcon;
  adminOnly?: true;
}

type SystemPageMode = 'error' | 'maintenance';

const defaultProductPath = '/portfolio';
const sessionLoaderDelayMs = 150;
const sessionLoaderMinimumVisibleMs = 400;

const productRoutes: ProductRoute[] = [
  {
    id: 'cloud-portfolio',
    path: '/portfolio',
    label: 'Cloud portfolio',
    headline: 'Connected cloud portfolio',
    summary: 'See AWS, Azure, and GCP accounts individually or as one operating picture.',
    icon: Cloud
  },
  {
    id: 'costs',
    path: '/costs',
    label: 'Costs',
    headline: 'Normalized cost records',
    summary: 'Track ingestion health and keep normalized billing evidence moving on schedule.',
    icon: Database
  },
  {
    id: 'executive',
    path: '/executive',
    label: 'Executive',
    headline: 'Executive summary',
    summary: 'Turn cloud spend into a buyer-ready view of trend, budget posture, and top movers.',
    icon: BarChart3
  },
  {
    id: 'insights',
    path: '/insights',
    label: 'Insights',
    headline: 'Resource inventory and cost explorer',
    summary: 'Inspect inventory, flow spend by dimension, and move between graph and table views.',
    icon: Search
  },
  {
    id: 'optimization',
    path: '/optimization',
    label: 'Optimization',
    headline: 'Optimization recommendations',
    summary: 'Review candidate savings and prove realized impact with auditable evidence.',
    icon: PiggyBank
  },
  {
    id: 'billing-agent',
    path: '/billing-agent',
    label: 'Billing Agent',
    headline: 'Agentic billing intelligence',
    summary: 'Investigate anomalies, generate statements, and keep finance-ready narratives close to the data.',
    icon: Radar
  },
  {
    id: 'reporting',
    path: '/reporting',
    label: 'Reporting',
    headline: 'Reporting and saved views',
    summary: 'Package the right slices into repeatable reports and saved operating views.',
    icon: FileText
  },
  {
    id: 'allocation',
    path: '/allocation',
    label: 'Allocation',
    headline: 'Allocation and dynamic tagging',
    summary: 'Shape showback logic with dimensions, mappings, and governed resource tagging.',
    icon: SlidersHorizontal
  },
  {
    id: 'governance',
    path: '/governance',
    label: 'Governance',
    headline: 'Access and trust controls',
    summary: 'Keep credentials, roles, and cross-account boundaries aligned with readonly operating practice.',
    icon: ShieldCheck
  },
  {
    id: 'settings',
    path: '/settings',
    label: 'Settings',
    headline: 'Workspace settings',
    summary: 'Tune appearance and operator preferences without drifting from the shared design system.',
    icon: Settings
  },
  {
    id: 'operator',
    path: '/operator',
    label: 'Operator',
    headline: 'Operational readiness',
    summary: 'Check scheduler, health, and cloud-readiness blockers before handover or go-live.',
    icon: Activity,
    adminOnly: true
  }
];

export function App() {
  const auth = useAuth();
  const preferences = useUserPreferences();
  const route = routeForPath(window.location.pathname);
  const client = useMemo(() => createCostalyxClient({ getAccessToken: auth.getAccessToken }), [auth.getAccessToken]);
  const accessibleRoute = isProductRoute(route) && canAccessRoute(route, auth.role) ? route : null;
  const workspaceBoot = useWorkspaceBoot({
    authStatus: auth.status,
    client,
    role: auth.role,
    route: accessibleRoute
  });

  useDocumentMeta(route, preferences.resolvedTheme);

  if (isAuthRoute(route)) {
    return <AuthPage mode={route} defaultPath={defaultProductPath} />;
  }

  if (isSystemRoute(route)) {
    return <SystemPage mode={route} isAuthenticated={auth.status === 'authenticated'} />;
  }

  if (route === null) {
    return <SystemPage mode="not-found" isAuthenticated={auth.status === 'authenticated'} />;
  }

  if (auth.status === 'loading') {
    return <BootSplash productName="Costalyx" onRetry={() => window.location.reload()} />;
  }

  if (auth.status === 'authenticated' && accessibleRoute) {
    if (workspaceBoot.status === 'loading' && !workspaceBoot.visible) {
      return <BootSplash productName="Costalyx" />;
    }

    if (workspaceBoot.status === 'loading' || workspaceBoot.status === 'error') {
      return (
        <SessionLoader
          productName="Costalyx"
          eyebrow="PARTNER PORTAL"
          displayName={auth.displayName}
          identityLine={auth.identityLine}
          steps={workspaceBoot.steps}
          progressValue={workspaceBoot.progressValue}
          progressLabel="Workspace ready"
          phaseLabel={workspaceBoot.phaseLabel}
          errorTitle={workspaceBoot.status === 'error' ? 'Workspace setup needs attention' : undefined}
          errorDetail={workspaceBoot.status === 'error' ? workspaceBoot.error : undefined}
          onRetry={workspaceBoot.retry}
          showTrustCue={window.location.protocol === 'https:'}
        />
      );
    }
  }

  if (auth.status !== 'authenticated') {
    return <AuthPage mode="signin" protectedPath={route?.path ?? defaultProductPath} defaultPath={defaultProductPath} />;
  }

  return <ProductShell route={isProductRoute(route) ? route : null} client={client} />;
}

function SystemPage({ mode, isAuthenticated }: { mode: SystemPageMode | 'not-found'; isAuthenticated: boolean }) {
  const config = systemPageCopy(mode);
  const Icon = config.icon;

  return (
    <main className="auth-page system-page">
      <header className="auth-header">
        <div>
          <p>Costalyx</p>
          <h1>{config.title}</h1>
          <span className="auth-subtitle">{config.subtitle}</span>
        </div>
        <ThemeToggle />
      </header>
      <div className="auth-layout system-layout">
        <section className="auth-showcase system-showcase" aria-label="System status guidance">
          <div className="auth-showcase-copy">
            <p className="section-kicker">{config.kicker}</p>
            <h2>{config.headline}</h2>
            <p>{config.detail}</p>
          </div>
          <ul className="system-showcase-list">
            {config.checklist.map((item) => (
              <li key={item}>
                <ShieldCheck aria-hidden="true" size={16} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="auth-panel system-panel" aria-label={config.ariaLabel}>
          <div className="system-status-mark" aria-hidden="true">
            <Icon size={24} />
          </div>
          <div className="system-panel-copy">
            <p className="section-kicker">{config.panelKicker}</p>
            <h2>{config.panelTitle}</h2>
            <p>{config.panelDetail}</p>
          </div>
          <div className="auth-actions system-actions">
            <ButtonLink href={defaultProductPath} variant="primary">
              Open cloud portfolio
            </ButtonLink>
            {isAuthenticated ? (
              <Button variant="secondary" onClick={() => window.history.back()}>
                <ArrowLeft size={16} aria-hidden="true" />
                Go back
              </Button>
            ) : (
              <ButtonLink href="/signin" variant="secondary">
                Sign in
              </ButtonLink>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function ProductShell({ route, client }: { route: ProductRoute | null; client: CostalyxClient }) {
  const auth = useAuth();
  const preferences = useUserPreferences();
  const accessibleRoutes = productRoutes.filter((candidate) => !candidate.adminOnly || auth.role === 'admin');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const notificationsButtonRef = useRef<HTMLButtonElement | null>(null);
  const profileButtonRef = useRef<HTMLButtonElement | null>(null);
  const workspaceNotices = useMemo(() => buildWorkspaceNotices(auth.role), [auth.role]);
  const filteredRoutes = accessibleRoutes.filter((candidate) => routeMatchesQuery(candidate, commandQuery));
  const shortcutLabel = useMemo(() => keyboardShortcutLabel(), []);

  useEffect(() => {
    setIsMobileNavOpen(false);
    setIsCommandPaletteOpen(false);
    setIsNotificationsOpen(false);
    setIsProfileOpen(false);
    setCommandQuery('');
  }, [route?.path]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isCommandShortcut(event) || isEditableTarget(event.target)) {
        return;
      }
      event.preventDefault();
      setIsCommandPaletteOpen(true);
      setIsNotificationsOpen(false);
      setIsProfileOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="app-shell-root">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <div className="app-shell-layout">
        <aside className="app-sidebar" aria-label="Workspace navigation">
          <div className="sidebar-brand">
            <div className="sidebar-brand-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div>
              <p>Costalyx</p>
              <h1>Cloud cost operations</h1>
              <span>Multi-tenant portfolio, billing, governance, and executive visibility.</span>
            </div>
          </div>

          <nav className="sidebar-nav" aria-label="Product sections">
            {accessibleRoutes.map((candidate) => (
              <ProductRouteLink key={candidate.id} route={candidate} active={candidate.path === route?.path} />
            ))}
          </nav>

          <dl className="sidebar-facts" aria-label="Workspace facts">
            <div>
              <dt>Role</dt>
              <dd>{labelForToken(auth.role ?? 'signed_in')}</dd>
            </div>
            <div>
              <dt>Appearance</dt>
              <dd>{formatAppearanceLabel(preferences.theme, preferences.accent)}</dd>
            </div>
            <div>
              <dt>Environment</dt>
              <dd>{deploymentLabel()}</dd>
            </div>
          </dl>
        </aside>

        <main className="app-main-shell" id="main-content" tabIndex={-1}>
          <header className="app-topbar">
            <div className="topbar-leading">
              <Button
                variant="icon"
                className="topbar-menu-button"
                aria-label="Open navigation"
                title="Open navigation"
                onClick={() => setIsMobileNavOpen(true)}
                leadingIcon={<Menu size={18} aria-hidden="true" />}
              />
              <div className="topbar-title-group">
                <p>Costalyx</p>
                <h2>{route?.headline ?? 'Page not found'}</h2>
                <span>{route?.summary ?? 'Use the workspace navigation to return to a live Costalyx screen.'}</span>
              </div>
            </div>

            <div className="topbar-actions">
              <Button
                variant="secondary"
                size="compact"
                className="command-launcher"
                onClick={() => {
                  setIsCommandPaletteOpen(true);
                  setIsNotificationsOpen(false);
                  setIsProfileOpen(false);
                }}
                leadingIcon={<Search size={16} aria-hidden="true" />}
              >
                <span>Jump to screen</span>
                <kbd>{shortcutLabel}</kbd>
              </Button>

              <div className="topbar-icon-button">
                <Button
                  ref={notificationsButtonRef}
                  variant="icon"
                  aria-label={`Workspace notices (${workspaceNotices.length})`}
                  title="Workspace notices"
                  onClick={() => {
                    setIsNotificationsOpen((current) => !current);
                    setIsProfileOpen(false);
                  }}
                  leadingIcon={<Bell size={18} aria-hidden="true" />}
                />
                {workspaceNotices.length > 0 ? <span className="action-badge">{workspaceNotices.length}</span> : null}
              </div>

              <ThemeToggle />

              <Button
                ref={profileButtonRef}
                variant="secondary"
                size="compact"
                className="profile-trigger"
                aria-label="Open account menu"
                onClick={() => {
                  setIsProfileOpen((current) => !current);
                  setIsNotificationsOpen(false);
                }}
              >
                <span className="profile-avatar" aria-hidden="true">
                  {initialsFor(auth.displayName ?? 'Costalyx User')}
                </span>
                <span className="profile-trigger-copy">
                  <strong>{auth.displayName ?? 'Workspace user'}</strong>
                  <span>{labelForToken(auth.role ?? 'signed_in')}</span>
                </span>
                <User size={16} aria-hidden="true" />
              </Button>
            </div>
          </header>

          {route ? (
            <section className="route-hero" aria-label={`${route.label} overview`}>
              <div>
                <p className="section-kicker">Current workspace</p>
                <h3>{route.label}</h3>
                <p>{route.summary}</p>
              </div>
              <div className="route-hero-facts">
                <div>
                  <span>Routes</span>
                  <strong className="font-mono-data">{accessibleRoutes.length}</strong>
                </div>
                <div>
                  <span>Notices</span>
                  <strong className="font-mono-data">{workspaceNotices.length}</strong>
                </div>
                <div>
                  <span>Accent</span>
                  <strong>{preferences.accent === 'terracotta' ? 'Terracotta' : 'Default'}</strong>
                </div>
              </div>
            </section>
          ) : null}

          {isCommandPaletteOpen ? (
            <section className="command-palette-surface panel" aria-label="Jump to any workspace screen">
              <div className="panel-toolbar command-palette-toolbar">
                <div>
                  <p className="section-kicker">Command palette</p>
                  <h3>Jump to any workspace screen</h3>
                </div>
                <Button variant="secondary" size="compact" onClick={() => setIsCommandPaletteOpen(false)}>
                  Close
                </Button>
              </div>
              <label className="field-row command-palette-search">
                <span>Search screens</span>
                <input
                  autoFocus
                  value={commandQuery}
                  onChange={(event) => setCommandQuery(event.target.value)}
                  placeholder="Search portfolio, billing, reporting..."
                />
              </label>
              {filteredRoutes.length > 0 ? (
                <ul className="command-palette-results">
                  {filteredRoutes.map((candidate) => {
                    const Icon = candidate.icon;
                    return (
                      <li key={candidate.id}>
                        <a href={candidate.path}>
                          <span className="command-palette-icon">
                            <Icon size={16} aria-hidden="true" />
                          </span>
                          <span className="command-palette-copy">
                            <strong>{candidate.label}</strong>
                            <span>{candidate.summary}</span>
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="state command-palette-empty">
                  <h3>No matching screen</h3>
                  <p>Try searching by module name like Billing, Allocation, or Operator.</p>
                </div>
              )}
            </section>
          ) : null}

          <RoleScopeNotice />

          {route && accessibleRoutes.some((candidate) => candidate.id === route.id) ? (
            <ProductPage route={route} client={client} />
          ) : (
            <section className="panel state" aria-label="Page not found">
              <h2>Page not found</h2>
              <p>Use the workspace navigation to open a Costalyx page that exists for your role.</p>
              <ButtonLink href={defaultProductPath} variant="primary">
                Open cloud portfolio
              </ButtonLink>
            </section>
          )}
        </main>
      </div>

      <Drawer
        open={isMobileNavOpen}
        title="Product sections"
        description="Navigate between Costalyx workspaces on small screens."
        onClose={() => setIsMobileNavOpen(false)}
      >
        <nav className="mobile-nav" aria-label="Product sections">
          {accessibleRoutes.map((candidate) => (
            <ProductRouteLink key={candidate.id} route={candidate} active={candidate.path === route?.path} />
          ))}
        </nav>
      </Drawer>

      <PopoverSurface
        open={isNotificationsOpen}
        anchorRef={notificationsButtonRef}
        onClose={() => setIsNotificationsOpen(false)}
        ariaLabel="Workspace notices"
      >
        <div className="shell-popover">
          <div className="shell-popover-header">
            <p className="section-kicker">Workspace notices</p>
            <h3>What matters right now</h3>
          </div>
          <ul className="notice-list">
            {workspaceNotices.map((notice) => (
              <li key={notice.id}>
                <strong>{notice.title}</strong>
                <p>{notice.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </PopoverSurface>

      <PopoverSurface
        open={isProfileOpen}
        anchorRef={profileButtonRef}
        onClose={() => setIsProfileOpen(false)}
        ariaLabel="Account menu"
      >
        <div className="shell-popover">
          <div className="shell-popover-header">
            <p className="section-kicker">Workspace identity</p>
            <h3>{auth.displayName ?? 'Workspace user'}</h3>
            <p>{auth.identityLine ?? 'Authenticated Costalyx session'}</p>
          </div>
          <dl className="profile-facts">
            <div>
              <dt>Role</dt>
              <dd>{labelForToken(auth.role ?? 'signed_in')}</dd>
            </div>
            <div>
              <dt>Theme</dt>
              <dd>{labelForToken(preferences.theme)}</dd>
            </div>
            <div>
              <dt>Accent</dt>
              <dd>{preferences.accent === 'terracotta' ? 'Terracotta' : 'Default'}</dd>
            </div>
          </dl>
          <div className="shell-popover-actions">
            <ButtonLink href="/settings" variant="secondary">
              Open settings
            </ButtonLink>
            <Button variant="secondary" size="compact" onClick={auth.logout}>
              Sign out
            </Button>
          </div>
        </div>
      </PopoverSurface>
    </div>
  );
}

function ProductRouteLink({ route, active }: { route: ProductRoute; active: boolean }) {
  const Icon = route.icon;

  return (
    <a className={`sidebar-link ${active ? 'is-active' : ''}`} href={route.path} aria-current={active ? 'page' : undefined}>
      <span className="sidebar-link-icon" aria-hidden="true">
        <Icon size={16} />
      </span>
      <span className="sidebar-link-copy">
        <strong>{route.label}</strong>
        <span>{route.summary}</span>
      </span>
    </a>
  );
}

interface WorkspaceNotice {
  id: string;
  title: string;
  detail: string;
}

function buildWorkspaceNotices(role: string | null): WorkspaceNotice[] {
  const notices: WorkspaceNotice[] = [
    {
      id: 'demo-proof-boundary',
      title: 'Demo-ready seeded data',
      detail:
        'The product supports presentable local demo data today, while real cloud validation still depends on readonly customer roles and broker identities.'
    }
  ];

  if (role === 'admin') {
    notices.push({
      id: 'operator-readiness',
      title: 'Operator readiness is available',
      detail: 'Use the Operator screen before handover to verify health, scheduler state, and live-cloud blockers.'
    });
  } else {
    notices.push({
      id: 'guided-role-scope',
      title: 'Guided access is active',
      detail: 'Higher-risk controls stay hidden until your role expands, so the workspace never teaches permissions through broken clicks.'
    });
  }

  return notices;
}

function routeMatchesQuery(route: ProductRoute, query: string) {
  if (!query.trim()) {
    return true;
  }
  const haystack = `${route.label} ${route.headline} ${route.summary}`.toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

function keyboardShortcutLabel() {
  if (typeof navigator === 'undefined') {
    return 'Ctrl+K';
  }
  return /Mac|iPhone|iPad/i.test(navigator.platform) ? 'Cmd+K' : 'Ctrl+K';
}

function isCommandShortcut(event: KeyboardEvent) {
  return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
}

function isEditableTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) {
    return false;
  }
  return (
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.tagName === 'SELECT' ||
    element.isContentEditable
  );
}

function deploymentLabel() {
  if (typeof window === 'undefined') {
    return 'Protected workspace';
  }
  return /localhost|127\.0\.0\.1/.test(window.location.hostname) ? 'Local demo' : 'Protected workspace';
}

function initialsFor(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((token) => token[0]?.toUpperCase() ?? '')
    .join('');
}

function formatAppearanceLabel(theme: string, accent: string) {
  const accentLabel = accent === 'terracotta' ? 'terracotta' : 'default';
  return `${labelForToken(theme)} / ${labelForToken(accentLabel)}`;
}

function useDocumentMeta(route: ProductRoute | AuthPageMode | SystemPageMode | null, resolvedTheme: 'dark' | 'light') {
  useEffect(() => {
    const meta = metaForRoute(route);
    document.title = meta.title;
    setMetaTag('description', meta.description);
    setMetaTag('og:title', meta.title, 'property');
    setMetaTag('og:description', meta.description, 'property');
    setMetaTag('twitter:title', meta.title);
    setMetaTag('twitter:description', meta.description);
    setMetaTag('theme-color', readThemeColorToken());
    document.body.dataset.route = meta.routeId;
  }, [resolvedTheme, route]);
}

function metaForRoute(route: ProductRoute | AuthPageMode | SystemPageMode | null) {
  if (route === 'login' || route === 'signin') {
    return {
      title: 'Sign in | Costalyx',
      description: 'Sign in to Costalyx to manage multi-cloud cost operations, billing intelligence, and governance.',
      routeId: route
    };
  }
  if (route === 'signup') {
    return {
      title: 'Create account | Costalyx',
      description: 'Create your Costalyx account through the configured identity provider.',
      routeId: route
    };
  }
  if (route === 'maintenance') {
    return {
      title: 'Maintenance | Costalyx',
      description: 'Costalyx is in a scheduled maintenance window.',
      routeId: route
    };
  }
  if (route === 'error') {
    return {
      title: 'Service issue | Costalyx',
      description: 'Costalyx hit a service issue and is guiding you back to a stable route.',
      routeId: route
    };
  }
  if (!route) {
    return {
      title: 'Page not found | Costalyx',
      description: 'Return to a valid Costalyx workspace page.',
      routeId: 'not-found'
    };
  }
  return {
    title: `${route.label} | Costalyx`,
    description: route.summary,
    routeId: route.id
  };
}

function readThemeColorToken() {
  if (typeof window === 'undefined') {
    return '';
  }
  return getComputedStyle(document.documentElement).getPropertyValue('--browser-theme-color').trim();
}

function setMetaTag(name: string, content: string, attribute: 'name' | 'property' = 'name') {
  const selector = `meta[${attribute}="${name}"]`;
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, name);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function labelForToken(value: string) {
  return value
    .split(/[_-]+/)
    .filter(Boolean)
    .map((token) => token[0]?.toUpperCase() + token.slice(1))
    .join(' ');
}

function systemPageCopy(mode: SystemPageMode | 'not-found') {
  switch (mode) {
    case 'maintenance':
      return {
        ariaLabel: 'Maintenance notice',
        kicker: 'Scheduled maintenance',
        title: 'Costalyx is briefly unavailable',
        subtitle: 'The workspace is in a planned maintenance window while availability and data integrity checks complete.',
        headline: 'We are protecting the workspace before bringing it back.',
        detail: 'Use the actions on the right to return later or jump back to the main workspace once maintenance is complete.',
        panelKicker: 'Maintenance mode',
        panelTitle: 'Maintenance in progress',
        panelDetail: 'No customer data has been removed. Retry from the portfolio once the maintenance window closes.',
        checklist: [
          'Identity and readonly cloud posture remain unchanged during the maintenance window.',
          'Use the Operator workspace after recovery to confirm health and scheduler status.',
          'Production communication should point customers to this route instead of a blank screen.'
        ],
        icon: Construction
      };
    case 'error':
      return {
        ariaLabel: 'Service issue',
        kicker: 'Service guidance',
        title: 'Costalyx hit a recoverable issue',
        subtitle: 'The app reached a state that should hand users back to a stable route instead of leaving them stranded.',
        headline: 'The UI stays honest about failures and gives a real next step.',
        detail: 'This route exists so support, docs, and operator runbooks can send customers somewhere concrete during a service event.',
        panelKicker: 'Error state',
        panelTitle: 'Service issue detected',
        panelDetail: 'Return to the portfolio or sign in again after the underlying backend or identity issue is cleared.',
        checklist: [
          'API failures should resolve to a designed surface, never console-only output.',
          'Session expiry routes users back through the sign-in module with preserved intent.',
          'Operator readiness remains the place to review blockers before declaring recovery.'
        ],
        icon: TriangleAlert
      };
    default:
      return {
        ariaLabel: 'Page not found',
        kicker: 'Routed workspace',
        title: 'That Costalyx page does not exist',
        subtitle: 'Use the real routed screens instead of falling into a dead end or a hash-fragment shell.',
        headline: 'Unknown routes resolve to a deliberate 404 experience.',
        detail: 'This keeps docs, bookmarks, and customer handoff links honest when a path is wrong or no longer valid.',
        panelKicker: '404 route',
        panelTitle: 'Page not found',
        panelDetail: 'Open the cloud portfolio or return to the last stable route from this session.',
        checklist: [
          'Route metadata still updates so browser history and previews stay descriptive.',
          'Customers always have a path back to a live screen.',
          'The 404 experience is available before authentication as well as inside the product shell.'
        ],
        icon: TriangleAlert
      };
  }
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

function routeForPath(pathname: string): ProductRoute | AuthPageMode | SystemPageMode | null {
  const normalizedPath = normalizePath(pathname);
  if (normalizedPath === '/login') {
    return 'login';
  }
  if (normalizedPath === '/signin') {
    return 'signin';
  }
  if (normalizedPath === '/signup') {
    return 'signup';
  }
  if (normalizedPath === '/maintenance') {
    return 'maintenance';
  }
  if (normalizedPath === '/error') {
    return 'error';
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

function isAuthRoute(route: ProductRoute | AuthPageMode | SystemPageMode | null): route is AuthPageMode {
  return route === 'login' || route === 'signin' || route === 'signup';
}

function isSystemRoute(route: ProductRoute | AuthPageMode | SystemPageMode | null): route is SystemPageMode {
  return route === 'maintenance' || route === 'error';
}

function isProductRoute(route: ProductRoute | AuthPageMode | SystemPageMode | null): route is ProductRoute {
  return typeof route === 'object' && route !== null && 'id' in route;
}

function canAccessRoute(route: ProductRoute, role: string | null): boolean {
  return !route.adminOnly || role === 'admin';
}

interface WorkspaceBootState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  visible: boolean;
  steps: LoaderStep[];
  progressValue: number;
  phaseLabel: string;
  error: string;
}

interface WorkspaceBootOptions {
  authStatus: AuthStatus;
  client: CostalyxClient;
  role: string | null;
  route: ProductRoute | null;
}

type WorkspaceStepId = 'verify' | 'sync' | 'route';

interface WorkspaceStepDefinition {
  id: WorkspaceStepId;
  label: string;
  phaseLabel: string;
  pendingDetail?: string;
  doneDetail?: string;
}

function useWorkspaceBoot({ authStatus, client, role, route }: WorkspaceBootOptions) {
  const [retryNonce, setRetryNonce] = useState(0);
  const [state, setState] = useState<WorkspaceBootState>({
    status: 'idle',
    visible: false,
    steps: [],
    progressValue: 0,
    phaseLabel: 'READY',
    error: ''
  });

  useEffect(() => {
    if (authStatus !== 'authenticated' || !route) {
      setState({
        status: 'idle',
        visible: false,
        steps: [],
        progressValue: 0,
        phaseLabel: 'READY',
        error: ''
      });
      return;
    }

    const activeRoute = route;
    const stepDefinitions = createWorkspaceStepDefinitions(activeRoute);
    const routeBootstrapKey = bootstrapKeyForRoute(activeRoute.id);
    let cancelled = false;
    let shownAt = 0;
    let delayedLoaderTimeout = 0;
    let minimumVisibleTimeout = 0;

    setState({
      status: 'loading',
      visible: false,
      steps: materializeSteps(stepDefinitions, 'verify'),
      progressValue: 0,
      phaseLabel: 'VERIFYING',
      error: ''
    });

    delayedLoaderTimeout = window.setTimeout(() => {
      shownAt = Date.now();
      if (!cancelled) {
        setState((current) => ({ ...current, visible: true }));
      }
    }, sessionLoaderDelayMs);

    async function run() {
      try {
        if (!cancelled) {
          setState((current) => nextBootState(current, stepDefinitions, 'verify', 'done'));
          setState((current) => nextBootState(current, stepDefinitions, 'sync', 'active'));
        }
        await primeBootstrapValue(bootstrapKeys.workspaceContext, async () => client.listViews({ page: 1, pageSize: 5 }));
        if (!cancelled) {
          setState((current) => nextBootState(current, stepDefinitions, 'sync', 'done'));
        }

        if (routeBootstrapKey) {
          if (!cancelled) {
            setState((current) => nextBootState(current, stepDefinitions, 'route', 'active'));
          }
          await primeBootstrapValue(routeBootstrapKey, () => warmRouteData(activeRoute.id, client, role));
          if (!cancelled) {
            setState((current) => nextBootState(current, stepDefinitions, 'route', 'done'));
          }
        }

        const finalize = () => {
          if (cancelled) {
            return;
          }
          startTransition(() => {
            setState((current) => ({
              ...current,
              status: 'ready',
              visible: false,
              progressValue: 100,
              phaseLabel: 'READY'
            }));
          });
        };

        window.clearTimeout(delayedLoaderTimeout);
        if (shownAt > 0) {
          const remainingVisibleMs = sessionLoaderMinimumVisibleMs - (Date.now() - shownAt);
          if (remainingVisibleMs > 0) {
            minimumVisibleTimeout = window.setTimeout(finalize, remainingVisibleMs);
            return;
          }
        }

        finalize();
      } catch (loadError) {
        window.clearTimeout(delayedLoaderTimeout);
        if (cancelled) {
          return;
        }
        const failedStepId = routeBootstrapKey ? 'route' : 'sync';
        const errorMessage = toUserFacingError(loadError, 'Load workspace');
        const failedState = nextBootState(
          {
            ...state,
            steps: stepDefinitions.map((definition) => ({
              id: definition.id,
              label: definition.label,
              status: definition.id === failedStepId ? 'active' : 'pending'
            }))
          },
          stepDefinitions,
          failedStepId,
          'failed',
          errorMessage
        );
        setState({
          ...failedState,
          status: 'error',
          visible: true,
          error: errorMessage
        });
      }
    }

    void run();

    return () => {
      cancelled = true;
      window.clearTimeout(delayedLoaderTimeout);
      window.clearTimeout(minimumVisibleTimeout);
    };
  }, [authStatus, client, role, retryNonce, route]);

  return {
    ...state,
    retry() {
      clearBootstrapValue(bootstrapKeys.workspaceContext);
      const routeBootstrapKey = route ? bootstrapKeyForRoute(route.id) : null;
      if (routeBootstrapKey) {
        clearBootstrapValue(routeBootstrapKey);
      }
      setRetryNonce((current) => current + 1);
    }
  };
}

function createWorkspaceStepDefinitions(route: ProductRoute): WorkspaceStepDefinition[] {
  const definitions: WorkspaceStepDefinition[] = [
    {
      id: 'verify',
      label: 'Verifying workspace access',
      phaseLabel: 'VERIFYING',
      doneDetail: 'Identity and role are confirmed.'
    },
    {
      id: 'sync',
      label: 'Syncing workspace context',
      phaseLabel: 'SYNCING',
      pendingDetail: 'Loading shared views and connection context.',
      doneDetail: 'Shared workspace context is ready.'
    }
  ];

  const routeStep = routeStepDefinition(route.id);
  if (routeStep) {
    definitions.push(routeStep);
  }
  return definitions;
}

function routeStepDefinition(routeId: ProductRouteId): WorkspaceStepDefinition | null {
  switch (routeId) {
    case 'cloud-portfolio':
      return {
        id: 'route',
        label: 'Preparing cloud portfolio',
        phaseLabel: 'PERSONALIZING',
        pendingDetail: 'Loading tenant, connection, and account context.',
        doneDetail: 'Cloud portfolio context is ready.'
      };
    case 'costs':
      return {
        id: 'route',
        label: 'Preparing cost records',
        phaseLabel: 'PERSONALIZING',
        pendingDetail: 'Loading normalized cost records for your workspace.',
        doneDetail: 'Cost records are ready.'
      };
    case 'executive':
      return {
        id: 'route',
        label: 'Preparing executive summary',
        phaseLabel: 'PERSONALIZING',
        pendingDetail: 'Loading top movers, trend, and budget context.',
        doneDetail: 'Executive summary is ready.'
      };
    case 'insights':
      return {
        id: 'route',
        label: 'Preparing insights workspace',
        phaseLabel: 'PERSONALIZING',
        pendingDetail: 'Loading inventory, totals, and explorer flow.',
        doneDetail: 'Insights workspace is ready.'
      };
    case 'optimization':
      return {
        id: 'route',
        label: 'Preparing optimization queue',
        phaseLabel: 'PERSONALIZING',
        pendingDetail: 'Loading recommendations and realized savings.',
        doneDetail: 'Optimization queue is ready.'
      };
    case 'billing-agent':
      return {
        id: 'route',
        label: 'Preparing billing operations',
        phaseLabel: 'PERSONALIZING',
        pendingDetail: 'Loading anomalies, statements, and recent runs.',
        doneDetail: 'Billing operations are ready.'
      };
    case 'reporting':
      return {
        id: 'route',
        label: 'Preparing reports',
        phaseLabel: 'PERSONALIZING',
        pendingDetail: 'Loading report catalog and saved views.',
        doneDetail: 'Reports are ready.'
      };
    case 'allocation':
      return {
        id: 'route',
        label: 'Preparing allocation model',
        phaseLabel: 'PERSONALIZING',
        pendingDetail: 'Loading dimensions and aggregate cost context.',
        doneDetail: 'Allocation model is ready.'
      };
    case 'governance':
      return {
        id: 'route',
        label: 'Preparing access controls',
        phaseLabel: 'PERSONALIZING',
        pendingDetail: 'Loading role inventory for governance review.',
        doneDetail: 'Governance controls are ready.'
      };
    case 'operator':
      return {
        id: 'route',
        label: 'Preparing operator readiness',
        phaseLabel: 'PERSONALIZING',
        pendingDetail: 'Loading production blockers and next actions.',
        doneDetail: 'Operational readiness is ready.'
      };
    default:
      return null;
  }
}

function materializeSteps(definitions: WorkspaceStepDefinition[], activeStepId: WorkspaceStepId): LoaderStep[] {
  return definitions.map((definition) => ({
    id: definition.id,
    label: definition.label,
    status: definition.id === activeStepId ? 'active' : 'pending',
    detail: definition.id === activeStepId ? definition.pendingDetail : undefined
  }));
}

function nextBootState(
  current: WorkspaceBootState,
  definitions: WorkspaceStepDefinition[],
  targetStepId: WorkspaceStepId,
  targetStatus: LoaderStep['status'],
  detailOverride?: string
): WorkspaceBootState {
  const steps: LoaderStep[] = definitions.map((definition): LoaderStep => {
    const previousStep = current.steps.find((candidate) => candidate.id === definition.id);
    if (definition.id !== targetStepId) {
      return previousStep ?? {
        id: definition.id,
        label: definition.label,
        status: 'pending'
      };
    }
    return {
      id: definition.id,
      label: definition.label,
      status: targetStatus,
      detail:
        detailOverride ??
        (targetStatus === 'done' ? definition.doneDetail : targetStatus === 'active' ? definition.pendingDetail : previousStep?.detail)
    };
  });

  return {
    ...current,
    steps,
    progressValue: deriveProgressValue(steps),
    phaseLabel: activePhaseLabel(steps, definitions)
  };
}

function deriveProgressValue(steps: LoaderStep[]): number {
  if (steps.length === 0) {
    return 0;
  }
  const total = steps.length;
  const completed = steps.filter((step) => step.status === 'done').length;
  const active = steps.some((step) => step.status === 'active');
  const exactValue = active ? ((completed + 0.5) / total) * 100 : (completed / total) * 100;
  return Math.round(exactValue);
}

function activePhaseLabel(steps: LoaderStep[], definitions: WorkspaceStepDefinition[]): string {
  const activeStep = steps.find((step) => step.status === 'active');
  if (!activeStep) {
    return 'READY';
  }
  return definitions.find((definition) => definition.id === activeStep.id)?.phaseLabel ?? 'WORKING';
}

function bootstrapKeyForRoute(routeId: ProductRouteId): string | null {
  switch (routeId) {
    case 'cloud-portfolio':
      return bootstrapKeys.cloudPortfolio;
    case 'costs':
      return bootstrapKeys.costs;
    case 'executive':
      return bootstrapKeys.executive;
    case 'insights':
      return bootstrapKeys.insights;
    case 'optimization':
      return bootstrapKeys.optimization;
    case 'billing-agent':
      return bootstrapKeys.billingAgent;
    case 'reporting':
      return bootstrapKeys.reporting;
    case 'allocation':
      return bootstrapKeys.allocation;
    case 'governance':
      return bootstrapKeys.governance;
    case 'operator':
      return bootstrapKeys.operator;
    default:
      return null;
  }
}

async function warmRouteData(routeId: ProductRouteId, client: CostalyxClient, role: string | null) {
  switch (routeId) {
    case 'cloud-portfolio': {
      const { listTenants, listCloudConnections, listAccounts, listAccountGroups } = client;
      if (!listTenants || !listCloudConnections || !listAccounts || !listAccountGroups) {
        throw new Error('Cloud portfolio client is unavailable.');
      }
      const [tenantResponse, connectionResponse, accountResponse, groupResponse, summary] = await Promise.all([
        listTenants(),
        listCloudConnections({ page: 1, pageSize: 100 }),
        listAccounts({ page: 1, pageSize: 1 }),
        listAccountGroups({ page: 1, pageSize: 1 }),
        client.getCostSummary()
      ]);
      return {
        tenants: tenantResponse.data,
        connections: connectionResponse.data,
        accountCount: accountResponse.meta.total,
        groupCount: groupResponse.meta.total,
        totalCostUsd: summary.totalCostUsd
      };
    }
    case 'costs':
      return (await client.listCostRecords()).data;
    case 'executive':
      return client.getExecutiveSummary({
        revenueBaselineUsd: '1000.00000000',
        budgetBaselineUsd: '100.00000000'
      });
    case 'insights': {
      const provider = 'aws';
      const costFloorUsd = '0.00000000';
      const [summary, records, flow] = await Promise.all([
        client.getCostSummary({ provider }),
        client.listCostRecords({ provider, page: 1, pageSize: 25 }),
        client.getCostExplorerFlow({ provider, dimensions: ['service', 'leaseType'], costFloorUsd })
      ]);
      return {
        provider,
        costFloorUsd,
        summary,
        records: records.data,
        flow
      };
    }
    case 'optimization': {
      const [recommendations, savings] = await Promise.all([
        client.listRecommendations({ status: 'open' }),
        client.listRealizedSavings()
      ]);
      return { recommendations: recommendations.data, savings: savings.data };
    }
    case 'billing-agent': {
      const [anomalies, statements, agentRuns] = await Promise.all([
        client.listAnomalies?.({ status: 'open', pageSize: 50 }) ?? Promise.resolve({ data: [] }),
        client.listBillingStatements?.({ pageSize: 50 }) ?? Promise.resolve({ data: [] }),
        role === 'admin' && client.listAgentRuns ? client.listAgentRuns({ pageSize: 5 }) : Promise.resolve({ data: [] })
      ]);
      return {
        anomalies: anomalies.data ?? [],
        statements: statements.data ?? [],
        agentRuns: agentRuns.data ?? []
      };
    }
    case 'reporting': {
      const [reports, views] = await Promise.all([
        client.listReports({ page: 1, pageSize: 25 }),
        client.listViews({ page: 1, pageSize: 25 })
      ]);
      return { reports: reports.data ?? [], views: views.data ?? [] };
    }
    case 'allocation': {
      const dimensions = await client.listDimensions();
      const selectedDimensionId = dimensions.data[0]?.id;
      const summary = selectedDimensionId ? await client.getCostSummary({ dimension: selectedDimensionId }) : null;
      return {
        dimensions: dimensions.data,
        summary
      };
    }
    case 'governance':
      if (role !== 'admin') {
        return { roles: [] };
      }
      return { roles: (await client.listRoles()).data };
    case 'operator':
      if (!client.getOperatorReadiness) {
        throw new Error('Operator readiness client method is unavailable.');
      }
      return client.getOperatorReadiness();
    default:
      return null;
  }
}
