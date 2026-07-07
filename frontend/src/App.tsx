import { useMemo } from 'react';
import { createCostalyxClient } from './api/client';
import { AuthBoundary } from './auth/AuthBoundary';
import { RoleScopeNotice } from './auth/RoleScopeNotice';
import { useAuth } from './auth/AuthProvider';
import { PermissionGate } from './auth/PermissionGate';
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

const productSections = [
  { id: 'cloud-portfolio', label: 'Cloud portfolio' },
  { id: 'costs', label: 'Costs' },
  { id: 'executive', label: 'Executive' },
  { id: 'insights', label: 'Insights' },
  { id: 'optimization', label: 'Optimization' },
  { id: 'billing-agent', label: 'Billing Agent' },
  { id: 'reporting', label: 'Reporting' },
  { id: 'allocation', label: 'Allocation' },
  { id: 'governance', label: 'Governance' },
  { id: 'operator', label: 'Operator', adminOnly: true }
] as const;

export function App() {
  const auth = useAuth();
  const client = useMemo(() => createCostalyxClient({ getAccessToken: auth.getAccessToken }), [auth.getAccessToken]);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p>Costalyx</p>
          <h1>Cloud spend, normalized at the source</h1>
        </div>
        <div className="header-actions">
          <ThemeToggle />
          {auth.status === 'authenticated' ? (
            <div className="session-pill">
              <span>{auth.role}</span>
              <button type="button" onClick={auth.logout}>
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </header>
      <AuthBoundary>
        <RoleScopeNotice />
        <nav className="section-nav" aria-label="Product sections">
          {productSections
            .filter((section) => !('adminOnly' in section) || auth.role === 'admin')
            .map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                {section.label}
              </a>
            ))}
        </nav>
        <div id="cloud-portfolio" className="section-anchor">
          <CloudPortfolioConsole client={client} />
        </div>
        <div id="costs" className="section-anchor">
          <IngestionOverview client={client} />
        </div>
        <div id="executive" className="section-anchor">
          <ExecutiveConsole client={client} />
        </div>
        <div id="insights" className="section-anchor">
          <InsightsConsole client={client} />
        </div>
        <div id="optimization" className="section-anchor">
          <OptimizationConsole client={client} />
        </div>
        <div id="billing-agent" className="section-anchor">
          <BillingAgentConsole client={client} />
        </div>
        <div id="reporting" className="section-anchor">
          <ReportingConsole client={client} />
        </div>
        <div id="allocation" className="section-anchor">
          <AllocationConsole client={client} />
        </div>
        <div id="governance" className="section-anchor">
          <GovernanceConsole client={client} />
        </div>
        <PermissionGate requiredRole="admin" mode="hide">
          <div id="operator" className="section-anchor">
            <OperatorReadinessConsole client={client} />
          </div>
        </PermissionGate>
      </AuthBoundary>
    </main>
  );
}
