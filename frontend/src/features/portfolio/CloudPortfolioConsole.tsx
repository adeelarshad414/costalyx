import { Activity, Check, Clipboard, Cloud, KeyRound, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import type { CostalyxClient } from '../../api/client';
import { PermissionGate } from '../../auth/PermissionGate';
import { bootstrapKeys, takeBootstrapValue } from '../../bootstrapCache';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { ProgressButton } from '../../components/LoadingExperience';
import { LoadingState } from '../../components/LoadingState';
import { toUserFacingError } from '../../utils/userFacingError';

interface CloudPortfolioConsoleProps {
  client: CostalyxClient;
}

type LoadState = 'loading' | 'loaded' | 'error';
type CloudProvider = 'all' | 'aws' | 'azure' | 'gcp';
type ListTenants = NonNullable<CostalyxClient['listTenants']>;
type ListCloudConnections = NonNullable<CostalyxClient['listCloudConnections']>;
type CloudConnection = Awaited<ReturnType<ListCloudConnections>>['data'][number];
type GetCloudConnectionOnboarding = NonNullable<CostalyxClient['getCloudConnectionOnboarding']>;
type CloudConnectionOnboarding = Awaited<ReturnType<GetCloudConnectionOnboarding>>;
type ListCloudConnectionRuns = NonNullable<CostalyxClient['listCloudConnectionRuns']>;
type CloudConnectionRun = Awaited<ReturnType<ListCloudConnectionRuns>>['data'][number];
type AccessMode = 'aws_assume_role' | 'azure_delegated_app' | 'gcp_workload_identity';
interface PortfolioBootstrap {
  tenants: Awaited<ReturnType<ListTenants>>['data'];
  connections: CloudConnection[];
  accountCount: number;
  groupCount: number;
  totalCostUsd: string;
}

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
  const [bootstrappedPortfolio] = useState<PortfolioBootstrap | null>(
    () => takeBootstrapValue<PortfolioBootstrap>(bootstrapKeys.cloudPortfolio) ?? null
  );
  const [state, setState] = useState<LoadState>(bootstrappedPortfolio ? 'loaded' : 'loading');
  const [error, setError] = useState('');
  const [tenants, setTenants] = useState<Awaited<ReturnType<ListTenants>>['data']>(() => bootstrappedPortfolio?.tenants ?? []);
  const [connections, setConnections] = useState<CloudConnection[]>(() => bootstrappedPortfolio?.connections ?? []);
  const [accountCount, setAccountCount] = useState(() => bootstrappedPortfolio?.accountCount ?? 0);
  const [groupCount, setGroupCount] = useState(() => bootstrappedPortfolio?.groupCount ?? 0);
  const [provider, setProvider] = useState<CloudProvider>('all');
  const [connectionId, setConnectionId] = useState('');
  const [totalCostUsd, setTotalCostUsd] = useState(() => bootstrappedPortfolio?.totalCostUsd ?? '0.00000000');
  const [form, setForm] = useState<CloudConnectionForm>(connectionDefaults.aws);
  const [onboarding, setOnboarding] = useState<CloudConnectionOnboarding | null>(null);
  const [onboardingError, setOnboardingError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [connectionRuns, setConnectionRuns] = useState<CloudConnectionRun[]>([]);
  const [runError, setRunError] = useState('');
  const [busyAction, setBusyAction] = useState<'create' | 'runs' | 'onboarding' | null>(null);
  const [isRefreshingSummary, setIsRefreshingSummary] = useState(false);

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
      setError(toUserFacingError(loadError, 'Load cloud portfolio'));
      setState('error');
    }
  }, [client]);

  const loadSummary = useCallback(async () => {
    setIsRefreshingSummary(true);
    try {
      const summary = await client.getCostSummary({
        provider: provider === 'all' ? undefined : provider,
        cloudConnectionId: connectionId || undefined
      });
      setTotalCostUsd(summary.totalCostUsd);
    } catch (summaryError) {
      setError(toUserFacingError(summaryError, 'Load portfolio summary'));
      setState('error');
    } finally {
      setIsRefreshingSummary(false);
    }
  }, [client, connectionId, provider]);

  useEffect(() => {
    if (bootstrappedPortfolio) {
      return;
    }
    void loadPortfolio();
  }, [bootstrappedPortfolio, loadPortfolio]);

  useEffect(() => {
    if (state === 'loaded') {
      void loadSummary();
    }
  }, [loadSummary, state]);

  useEffect(() => {
    setOnboarding(null);
    setOnboardingError('');
    setCopyStatus('');
  }, [connectionId]);

  const createConnection = useCallback(async () => {
    setBusyAction('create');
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
      setError(toUserFacingError(createError, 'Create cloud connection'));
      setState('error');
    } finally {
      setBusyAction(null);
    }
  }, [client, form, loadPortfolio]);

  const loadOnboarding = useCallback(async () => {
    if (!selectedConnection) {
      return;
    }
    setBusyAction('onboarding');
    try {
      const { getCloudConnectionOnboarding } = client;
      if (!getCloudConnectionOnboarding) {
        throw new Error('Cloud portfolio client is unavailable');
      }
      setCopyStatus('');
      setOnboarding(await getCloudConnectionOnboarding({ id: selectedConnection.id }));
      setOnboardingError('');
    } catch (onboardingLoadError) {
      setOnboardingError(toUserFacingError(onboardingLoadError, 'Load onboarding guidance'));
    } finally {
      setBusyAction(null);
    }
  }, [client, selectedConnection]);

  const copyOnboardingText = useCallback(async (label: string, value: string) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setCopyStatus(`Copy unavailable for ${label}`);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus(`Copied ${label}`);
    } catch {
      setCopyStatus(`Could not copy ${label}`);
    }
  }, []);

  const loadConnectionRuns = useCallback(async () => {
    if (!selectedConnection) {
      setConnectionRuns([]);
      return;
    }
    setBusyAction('runs');
    try {
      const { listCloudConnectionRuns } = client;
      if (!listCloudConnectionRuns) {
        throw new Error('Cloud portfolio client is unavailable');
      }
      const response = await listCloudConnectionRuns({ id: selectedConnection.id, page: 1, pageSize: 5 });
      setConnectionRuns(response.data);
      setRunError('');
    } catch (runsLoadError) {
      setConnectionRuns([]);
      setRunError(toUserFacingError(runsLoadError, 'Load run evidence'));
    } finally {
      setBusyAction(null);
    }
  }, [client, selectedConnection]);

  useEffect(() => {
    void loadConnectionRuns();
  }, [loadConnectionRuns]);

  if (state === 'loading') {
    return (
      <section className="panel">
        <LoadingState title="Loading cloud portfolio" variant="form" rows={4} />
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
        <Button variant="secondary" onClick={loadPortfolio} leadingIcon={<RefreshCw aria-hidden="true" size={16} />}>
          Refresh
        </Button>
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
          {isRefreshingSummary ? (
            <p className="copy-status" role="status" aria-live="polite">
              <RefreshCw aria-hidden="true" size={16} />
              Refreshing spend summary...
            </p>
          ) : null}

          <div className="provider-tabs" role="tablist" aria-label="Portfolio provider">
            {providerOptions.map((option) => (
              <Button
                key={option}
                role="tab"
                aria-selected={provider === option}
                variant={provider === option ? 'primary' : 'secondary'}
                size="compact"
                onClick={() => setProvider(option)}
              >
                {option === 'all' ? 'All' : option.toUpperCase()}
              </Button>
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
                  <span className={statusClass(connection.status)}>{statusLabel(connection.status)}</span>
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
            <ProgressButton
              idleLabel="Add connection"
              runningLabel="Adding connection..."
              isRunning={busyAction === 'create'}
              disabled={busyAction !== null && busyAction !== 'create'}
              onClick={createConnection}
            >
              <Plus aria-hidden="true" size={16} />
            </ProgressButton>
          </section>
        </PermissionGate>
      </div>

      {selectedConnection ? (
        <>
          <dl className="connection-detail" aria-label="Selected cloud connection details">
            <div>
              <dt>
                <KeyRound aria-hidden="true" size={16} />
                External ID
              </dt>
              <dd className="copyable-value">
                <span className="font-mono-data">{selectedConnection.externalId}</span>
                <Button
                  variant="secondary"
                  size="compact"
                  className="artifact-copy-button"
                  aria-label="Copy External ID"
                  leadingIcon={<Clipboard aria-hidden="true" size={16} />}
                  onClick={() => copyOnboardingText('External ID', selectedConnection.externalId)}
                >
                  Copy
                </Button>
              </dd>
            </div>
            <div>
              <dt>Principal</dt>
              <dd className="font-mono-data">{selectedConnection.readOnlyPrincipal}</dd>
            </div>
            <div>
              <dt>Probe result</dt>
              <dd>{selectedConnection.lastValidationMessage ?? statusLabel(selectedConnection.status)}</dd>
            </div>
          </dl>
          {copyStatus ? (
            <p className="copy-status" role="status" aria-label="Onboarding copy status">
              <Check aria-hidden="true" size={16} />
              {copyStatus}
            </p>
          ) : null}
        </>
      ) : null}

      {selectedConnection ? (
        <section className="run-evidence" aria-label="Cloud connection run evidence">
          <div className="panel-toolbar portfolio-toolbar">
            <div className="connection-form-header">
              <Activity aria-hidden="true" size={18} />
              <h2>Run evidence</h2>
            </div>
            <ProgressButton
              idleLabel="Refresh"
              runningLabel="Refreshing..."
              isRunning={busyAction === 'runs'}
              disabled={busyAction !== null && busyAction !== 'runs'}
              onClick={loadConnectionRuns}
            >
              <RefreshCw aria-hidden="true" size={16} />
            </ProgressButton>
          </div>
          {runError ? <p role="alert">{runError}</p> : null}
          {connectionRuns.length === 0 && !runError ? (
            <EmptyState title="No run evidence" />
          ) : (
            <ul className="run-list">
              {connectionRuns.map((run) => (
                <li key={run.id}>
                  <span>{run.runType}</span>
                  <span className={run.status === 'succeeded' ? 'status-success' : 'status-danger'}>{run.status}</span>
                  <span className="font-mono-data">{formatRunTime(run.completedAt)}</span>
                  <span className="font-mono-data">{runEvidenceSummary(run)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {selectedConnection ? (
        <PermissionGate requiredRole="admin" mode="hide">
          <section className="onboarding-panel" aria-label={`${selectedConnection.provider.toUpperCase()} onboarding`}>
            <div className="panel-toolbar portfolio-toolbar">
              <h2>{selectedConnection.provider.toUpperCase()} onboarding</h2>
              <ProgressButton
                idleLabel="Load policies"
                runningLabel="Loading policies..."
                isRunning={busyAction === 'onboarding'}
                disabled={busyAction !== null && busyAction !== 'onboarding'}
                onClick={loadOnboarding}
              >
                <ShieldCheck aria-hidden="true" size={16} />
              </ProgressButton>
            </div>
            {onboardingError ? <p role="alert">{onboardingError}</p> : null}
            {onboarding ? (
              <div className="onboarding-grid">
                <dl>
                  <div>
                    <dt>Status</dt>
                    <dd>{onboarding.status}</dd>
                  </div>
                  <div>
                    <dt>Broker principal</dt>
                    <dd className="font-mono-data">{onboarding.brokerPrincipalArn ?? 'not configured'}</dd>
                  </div>
                </dl>
                <ol className="onboarding-steps">
                  {onboarding.customerSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <OnboardingArtifact
                  title="Trust policy"
                  body={JSON.stringify(onboarding.trustPolicy, null, 2)}
                  onCopy={copyOnboardingText}
                />
                <OnboardingArtifact
                  title="Permissions policy"
                  body={JSON.stringify(onboarding.permissionsPolicy, null, 2)}
                  onCopy={copyOnboardingText}
                />
                {onboarding.deploymentTemplates ? (
                  <>
                    <OnboardingArtifact
                      title={onboarding.deploymentTemplates.cloudFormation.fileName}
                      body={onboarding.deploymentTemplates.cloudFormation.body}
                      onCopy={copyOnboardingText}
                    />
                    <OnboardingArtifact
                      title={onboarding.deploymentTemplates.terraform.fileName}
                      body={onboarding.deploymentTemplates.terraform.body}
                      onCopy={copyOnboardingText}
                    />
                  </>
                ) : null}
              </div>
            ) : null}
          </section>
        </PermissionGate>
      ) : null}
    </section>
  );
}

interface OnboardingArtifactProps {
  title: string;
  body: string;
  onCopy: (label: string, value: string) => void | Promise<void>;
  children?: ReactNode;
}

function OnboardingArtifact({ title, body, onCopy, children }: OnboardingArtifactProps) {
  return (
    <section className="onboarding-artifact" aria-label={`${title} artifact`}>
      <div className="artifact-header">
        <h3>{title}</h3>
        <Button
          variant="secondary"
          size="compact"
          className="artifact-copy-button"
          aria-label={`Copy ${title}`}
          leadingIcon={<Clipboard aria-hidden="true" size={16} />}
          onClick={() => onCopy(title, body)}
        >
          Copy
        </Button>
      </div>
      {children ?? <pre className="policy-json">{body}</pre>}
    </section>
  );
}

function statusLabel(status: CloudConnection['status']): string {
  if (status === 'validated') {
    return 'validated';
  }
  if (status === 'validation_failed') {
    return 'validation failed';
  }
  if (status === 'ready_for_live_probe') {
    return 'ready for probe';
  }
  return 'pending validation';
}

function statusClass(status: CloudConnection['status']): string {
  if (status === 'validated') {
    return 'status-success';
  }
  if (status === 'validation_failed') {
    return 'status-danger';
  }
  return 'status-warning';
}

function runEvidenceSummary(run: CloudConnectionRun): string {
  if (run.runType === 'ingestion') {
    return `${Number(run.evidence.ingestedRows ?? 0)} rows, ${Number(run.evidence.duplicateRows ?? 0)} duplicates`;
  }
  return String(run.evidence.code ?? run.evidence.message ?? run.status);
}

function formatRunTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}
