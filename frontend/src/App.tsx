import { useMemo } from 'react';
import { createCostalyxClient } from './api/client';
import { AuthBoundary } from './auth/AuthBoundary';
import { useAuth } from './auth/AuthProvider';
import { AllocationConsole } from './features/allocation/AllocationConsole';
import { BillingAgentConsole } from './features/billing-agent/BillingAgentConsole';
import { ExecutiveConsole } from './features/executive/ExecutiveConsole';
import { GovernanceConsole } from './features/governance/GovernanceConsole';
import { IngestionOverview } from './features/ingestion/IngestionOverview';
import { InsightsConsole } from './features/insights/InsightsConsole';
import { OptimizationConsole } from './features/optimization/OptimizationConsole';
import { CloudPortfolioConsole } from './features/portfolio/CloudPortfolioConsole';
import { ReportingConsole } from './features/reporting/ReportingConsole';

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
        {auth.status === 'authenticated' ? (
          <div className="session-pill">
            <span>{auth.role}</span>
            <button type="button" onClick={auth.logout}>
              Sign out
            </button>
          </div>
        ) : null}
      </header>
      <AuthBoundary>
        <CloudPortfolioConsole client={client} />
        <IngestionOverview client={client} />
        <ExecutiveConsole client={client} />
        <InsightsConsole client={client} />
        <OptimizationConsole client={client} />
        <BillingAgentConsole client={client} />
        <ReportingConsole client={client} />
        <AllocationConsole client={client} />
        <GovernanceConsole client={client} />
      </AuthBoundary>
    </main>
  );
}
