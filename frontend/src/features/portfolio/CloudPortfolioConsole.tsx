import { Cloud, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CostalyxClient } from '../../api/client';
import { PermissionGate } from '../../auth/PermissionGate';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';

interface CloudPortfolioConsoleProps {
  client: CostalyxClient;
}

type LoadState = 'loading' | 'loaded' | 'error';
type CloudProvider = 'all' | 'aws' | 'azure' | 'gcp';
type ListTenants = NonNullable<CostalyxClient['listTenants']>;
type ListCloudConnections = NonNullable<CostalyxClient['listCloudConnections']>;
type CloudConnection = Awaited<ReturnType<ListCloudConnections>>['data'][number];
type AccessMode = 'aws_assume_role' | 'azure_delegated_app' | 'gcp_workload_identity';

interface CloudConnectionForm {
  provider: Exclude<CloudProvider, 'all'>;
  displayName: string;
  externalTenantId: string;
  accessMode: AccessMode;
  readOnlyPrincipal: string;
  billingExportUri: string;
}

const providerOptions: CloudProvider[] = ['all', 'aws', 'azure', 'gcp'];

const connectionDefaults: Record<Exclude<CloudProvider, 'all'>, CloudConnectionForm> = {
  aws: {
    provider: 'aws',
    displayName: 'AWS production payer',
    externalTenantId: '123456789012',
    accessMode: 'aws_assume_role',
    readOnlyPrincipal: 'arn:aws:iam::123456789012:role/CostalyxReadOnlyBilling',
    billingExportUri: 's3://customer-cur/costalyx/'
  },
  azure: {
    provider: 'azure',
    displayName: 'Azure production subscription',
    externalTenantId: '11111111-1111-4111-8111-111111111111',
    accessMode: 'azure_delegated_app',
    readOnlyPrincipal: '22222222-2222-4222-8222-222222222222',
    billingExportUri: 'https://storage.example.test/costalyx/exports/'
  },
  gcp: {
    provider: 'gcp',
    displayName: 'GCP billing export',
    externalTenantId: 'billing-account-123456',
    accessMode: 'gcp_workload_identity',
    readOnlyPrincipal: 'projects/123456789/locations/global/workloadIdentityPools/costalyx/providers/billing',
    billingExportUri: 'bigquery://billing-project.billing_export.gcp_billing_export_v1'
  }
};

export function CloudPortfolioConsole({ client }: CloudPortfolioConsoleProps) {
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [tenants, setTenants] = useState<Awaited<ReturnType<ListTenants>>['data']>([]);
  const [connections, setConnections] = useState<CloudConnection[]>([]);
  const [accountCount, setAccountCount] = useState(0);
  const [groupCount, setGroupCount] = useState(0);
  const [provider, setProvider] = useState<CloudProvider>('all');
  const [connectionId, setConnectionId] = useState('');
  const [totalCostUsd, setTotalCostUsd] = useState('0.00000000');
  const [form, setForm] = useState<CloudConnectionForm>(connectionDefaults.aws);

  const selectedConnection = useMemo(
    () => connections.find((connection) => connection.id === connectionId) ?? null,
    [connectionId, connections]
  );

  const loadPortfolio = useCallback(async () => {
    setState('loading');
    try {
      const { listTenants, listCloudConnections, listAccounts, listAccountGroups } = client;
      if (!listTenants || !listCloudConnections || !listAccounts || !listAccountGroups) {
        throw new Error('Cloud portfolio client is unavailable');
      }
      const [tenantResponse, connectionResponse, accountResponse, groupResponse] = await Promise.all([
        listTenants(),
        listCloudConnections({ page: 1, pageSize: 100 }),
        listAccounts({ page: 1, pageSize: 1 }),
        listAccountGroups({ page: 1, pageSize: 1 })
      ]);
      setTenants(tenantResponse.data);
      setConnections(connectionResponse.data);
      setAccountCount(accountResponse.meta.total);
      setGroupCount(groupResponse.meta.total);
      setState('loaded');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unknown portfolio request failure');
      setState('error');
    }
  }, [client]);

  const loadSummary = useCallback(async () => {
    try {
      const summary = await client.getCostSummary({
        provider: provider === 'all' ? undefined : provider,
        cloudConnectionId: connectionId || undefined
      });
      setTotalCostUsd(summary.totalCostUsd);
    } catch (summaryError) {
      setError(summaryError instanceof Error ? summaryError.message : 'Unknown portfolio summary failure');
      setState('error');
    }
  }, [client, connectionId, provider]);

  useEffect(() => {
    void loadPortfolio();
  }, [loadPortfolio]);

  useEffect(() => {
    if (state === 'loaded') {
      void loadSummary();
    }
  }, [loadSummary, state]);

  const createConnection = useCallback(async () => {
    try {
      const { createCloudConnection, validateCloudConnection } = client;
      if (!createCloudConnection || !validateCloudConnection) {
        throw new Error('Cloud portfolio client is unavailable');
      }
      const created = await createCloudConnection({
        ...form,
        idempotencyKey: `cloud-connection-${form.provider}-${form.externalTenantId}`
      });
      await validateCloudConnection({
        id: created.id,
        idempotencyKey: `cloud-connection-validation-${created.id}`
      });
      await loadPortfolio();
      setConnectionId(created.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unknown connection create failure');
      setState('error');
    }
  }, [client, form, loadPortfolio]);

  if (state === 'loading') {
    return (
      <section className="panel" aria-busy="true">
        <p>Loading cloud portfolio</p>
      </section>
    );
  }

  if (state === 'error') {
    return (
      <section className="panel">
        <ErrorState title="Could not load cloud portfolio" detail={error} onRetry={loadPortfolio} />
      </section>
    );
  }

  return (
    <section className="panel" aria-label="Cloud portfolio">
      <div className="panel-toolbar portfolio-toolbar">
        <div>
          <h2>Cloud portfolio</h2>
          <p className="font-mono-data">{tenants[0]?.slug ?? 'tenant'}</p>
        </div>
        <button type="button" onClick={loadPortfolio}>
          <RefreshCw aria-hidden="true" size={16} />
          Refresh
        </button>
      </div>

      <div className="portfolio-grid">
        <section aria-label="Portfolio rollup">
          <dl className="metric-list portfolio-metrics">
            <div>
              <dt>Total spend</dt>
              <dd className="font-mono-data">USD {totalCostUsd}</dd>
            </div>
            <div>
              <dt>Connections</dt>
              <dd className="font-mono-data">{connections.length}</dd>
            </div>
            <div>
              <dt>Accounts</dt>
              <dd className="font-mono-data">{accountCount}</dd>
            </div>
            <div>
              <dt>Groups</dt>
              <dd className="font-mono-data">{groupCount}</dd>
            </div>
          </dl>

          <div className="provider-tabs" role="tablist" aria-label="Portfolio provider">
            {providerOptions.map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={provider === option}
                className={provider === option ? 'is-active' : undefined}
                onClick={() => setProvider(option)}
              >
                {option === 'all' ? 'All' : option.toUpperCase()}
              </button>
            ))}
          </div>

          <label className="field-row">
            Connection
            <select value={connectionId} onChange={(event) => setConnectionId(event.target.value)}>
              <option value="">All connections</option>
              {connections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.displayName}
                </option>
              ))}
            </select>
          </label>

          {connections.length === 0 ? (
            <EmptyState title="No cloud connections" />
          ) : (
            <ul className="connection-list">
              {connections.map((connection) => (
                <li key={connection.id}>
                  <Cloud aria-hidden="true" size={18} />
                  <span>{connection.displayName}</span>
                  <span>{connection.provider.toUpperCase()}</span>
                  <span className={connection.status === 'validated' ? 'status-success' : 'status-warning'}>
                    {connection.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <PermissionGate requiredRole="admin" mode="hide">
          <section aria-label="Register cloud connection">
            <div className="connection-form-header">
              <ShieldCheck aria-hidden="true" size={18} />
              <h2>Read-only connection</h2>
            </div>
            <label className="field-row">
              Provider
              <select
                value={form.provider}
                onChange={(event) =>
                  setForm(connectionDefaults[event.target.value as Exclude<CloudProvider, 'all'>])
                }
              >
                <option value="aws">AWS</option>
                <option value="azure">Azure</option>
                <option value="gcp">GCP</option>
              </select>
            </label>
            <label className="field-row">
              Name
              <input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} />
            </label>
            <label className="field-row">
              Scope ID
              <input
                value={form.externalTenantId}
                onChange={(event) => setForm({ ...form, externalTenantId: event.target.value })}
              />
            </label>
            <label className="field-row">
              Principal
              <input
                value={form.readOnlyPrincipal}
                onChange={(event) => setForm({ ...form, readOnlyPrincipal: event.target.value })}
              />
            </label>
            <label className="field-row">
              Export URI
              <input
                value={form.billingExportUri}
                onChange={(event) => setForm({ ...form, billingExportUri: event.target.value })}
              />
            </label>
            <button type="button" onClick={createConnection}>
              <Plus aria-hidden="true" size={16} />
              Add connection
            </button>
          </section>
        </PermissionGate>
      </div>

      {selectedConnection ? <p className="font-mono-data">{selectedConnection.readOnlyPrincipal}</p> : null}
    </section>
  );
}
