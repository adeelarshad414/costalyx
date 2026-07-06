import { AlertTriangle, CheckCircle2, FileDown, Radar, Send, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { CostalyxClient } from '../../api/client';
import { PermissionGate } from '../../auth/PermissionGate';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';

interface BillingAgentConsoleProps {
  client: CostalyxClient;
}

type LoadState = 'loading' | 'loaded' | 'error';
type Anomaly = Awaited<ReturnType<NonNullable<CostalyxClient['listAnomalies']>>>['data'][number];
type BillingStatement = Awaited<ReturnType<NonNullable<CostalyxClient['listBillingStatements']>>>['data'][number];
type FalsePositiveReason = NonNullable<
  Parameters<NonNullable<CostalyxClient['updateAnomalyStatus']>>[0]['falsePositiveReason']
>;

const falsePositiveReasons: FalsePositiveReason[] = ['seasonal', 'planned_change', 'known_migration', 'other'];

export function BillingAgentConsole({ client }: BillingAgentConsoleProps) {
  const [state, setState] = useState<LoadState>('loading');
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [statements, setStatements] = useState<BillingStatement[]>([]);
  const [error, setError] = useState('');
  const [isMutating, setIsMutating] = useState(false);
  const [reasonById, setReasonById] = useState<Record<string, FalsePositiveReason>>({});
  const [period, setPeriod] = useState(defaultStatementPeriod);

  const loadConsole = useCallback(async () => {
    setState('loading');
    try {
      const [anomalyResponse, statementResponse] = await Promise.all([
        requireListAnomalies(client)({ status: 'open', pageSize: 50 }),
        client.listBillingStatements?.({ pageSize: 50 }) ?? Promise.resolve({ data: [], meta: { total: 0, page: 1, pageSize: 50 } })
      ]);
      setAnomalies(anomalyResponse.data);
      setStatements(statementResponse.data);
      setState('loaded');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unknown billing-agent request failure');
      setState('error');
    }
  }, [client]);

  useEffect(() => {
    void loadConsole();
  }, [loadConsole]);

  const runScan = useCallback(async () => {
    setIsMutating(true);
    try {
      await requireScanBillingAnomalies(client)();
      await loadConsole();
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : 'Unknown anomaly scan failure');
      setState('error');
    } finally {
      setIsMutating(false);
    }
  }, [client, loadConsole]);

  const markFalsePositive = useCallback(
    async (anomaly: Anomaly) => {
      setIsMutating(true);
      try {
        await requireUpdateAnomalyStatus(client)({
          id: anomaly.id,
          status: 'false_positive',
          falsePositiveReason: reasonById[anomaly.id] ?? 'seasonal',
          idempotencyKey: createIdempotencyKey('anomaly-false-positive')
        });
        await loadConsole();
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : 'Unknown anomaly update failure');
        setState('error');
      } finally {
        setIsMutating(false);
      }
    },
    [client, loadConsole, reasonById]
  );

  const generateStatements = useCallback(async () => {
    setIsMutating(true);
    try {
      await requireGenerateBillingStatements(client)({
        periodStart: `${period.periodStart}T00:00:00.000Z`,
        periodEnd: `${period.periodEnd}T23:59:59.000Z`,
        idempotencyKey: createIdempotencyKey('statement-generate')
      });
      await loadConsole();
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'Unknown statement generation failure');
      setState('error');
    } finally {
      setIsMutating(false);
    }
  }, [client, loadConsole, period]);

  const approveStatement = useCallback(
    async (statement: BillingStatement) => {
      setIsMutating(true);
      try {
        await requireApproveBillingStatement(client)({
          id: statement.id,
          idempotencyKey: createIdempotencyKey('statement-approve')
        });
        await loadConsole();
      } catch (approveError) {
        setError(approveError instanceof Error ? approveError.message : 'Unknown statement approval failure');
        setState('error');
      } finally {
        setIsMutating(false);
      }
    },
    [client, loadConsole]
  );

  const sendStatement = useCallback(
    async (statement: BillingStatement) => {
      setIsMutating(true);
      try {
        await requireSendBillingStatement(client)({
          id: statement.id,
          idempotencyKey: createIdempotencyKey('statement-send')
        });
        await loadConsole();
      } catch (sendError) {
        setError(sendError instanceof Error ? sendError.message : 'Unknown statement send failure');
        setState('error');
      } finally {
        setIsMutating(false);
      }
    },
    [client, loadConsole]
  );

  const disputeStatement = useCallback(
    async (statement: BillingStatement) => {
      setIsMutating(true);
      try {
        await requireDisputeBillingStatement(client)({
          id: statement.id,
          note: 'Stakeholder requested allocation review.',
          idempotencyKey: createIdempotencyKey('statement-dispute')
        });
        await loadConsole();
      } catch (disputeError) {
        setError(disputeError instanceof Error ? disputeError.message : 'Unknown statement dispute failure');
        setState('error');
      } finally {
        setIsMutating(false);
      }
    },
    [client, loadConsole]
  );

  const exportStatement = useCallback(
    async (statement: BillingStatement, format: 'csv' | 'pdf') => {
      setIsMutating(true);
      try {
        if (format === 'csv') {
          await requireExportBillingStatementCsv(client)({ id: statement.id });
        } else {
          await requireExportBillingStatementPdf(client)({ id: statement.id });
        }
      } catch (exportError) {
        setError(exportError instanceof Error ? exportError.message : 'Unknown statement export failure');
        setState('error');
      } finally {
        setIsMutating(false);
      }
    },
    [client]
  );

  if (state === 'loading') {
    return (
      <section className="panel" aria-busy="true">
        <p>Loading anomalies</p>
      </section>
    );
  }

  if (state === 'error') {
    return (
      <section className="panel">
        <ErrorState title="Could not load anomalies" detail={error} onRetry={loadConsole} />
      </section>
    );
  }

  return (
    <section className="panel" aria-label="Billing anomalies">
      <div className="panel-toolbar anomaly-toolbar">
        <h2>Billing Agent</h2>
        <PermissionGate requiredRole="analyst" mode="hide">
          <button type="button" onClick={runScan} disabled={isMutating}>
            <Radar aria-hidden="true" size={16} />
            Run scan
          </button>
        </PermissionGate>
      </div>

      {anomalies.length === 0 ? (
        <EmptyState title="No open anomalies" detail="Fresh scans will appear here when billing evidence crosses a threshold." />
      ) : (
        <ul className="anomaly-list">
          {anomalies.map((anomaly) => (
            <li key={anomaly.id}>
              <AlertTriangle aria-hidden="true" className={`severity-${anomaly.severity}`} size={20} />
              <div className="anomaly-body">
                <div className="anomaly-title-row">
                  <strong>{labelForType(anomaly.type)}</strong>
                  <span className={`status-chip severity-${anomaly.severity}`}>{anomaly.severity}</span>
                </div>
                <p>{anomaly.explanationMd}</p>
                <div className="anomaly-evidence">
                  <span>
                    Records <strong className="font-mono-data">{anomaly.evidence.costRecordIds.length}</strong>
                  </span>
                  <span>
                    Pricing rows <strong className="font-mono-data">{anomaly.evidence.pricingRows.length}</strong>
                  </span>
                  <span className="font-mono-data">{anomaly.windowEnd.slice(0, 10)}</span>
                </div>
              </div>
              <PermissionGate requiredRole="analyst" mode="hide">
                <div className="anomaly-actions">
                  <select
                    aria-label={`False positive reason for ${labelForType(anomaly.type)}`}
                    value={reasonById[anomaly.id] ?? 'seasonal'}
                    onChange={(event) =>
                      setReasonById((current) => ({ ...current, [anomaly.id]: event.target.value as FalsePositiveReason }))
                    }
                  >
                    {falsePositiveReasons.map((reason) => (
                      <option key={reason} value={reason}>
                        {reasonLabel(reason)}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => markFalsePositive(anomaly)} disabled={isMutating}>
                    <ShieldCheck aria-hidden="true" size={16} />
                    False positive
                  </button>
                </div>
              </PermissionGate>
            </li>
          ))}
        </ul>
      )}

      <div className="panel-toolbar anomaly-toolbar statement-toolbar">
        <h3>Stakeholder Statements</h3>
        <PermissionGate requiredRole="analyst" mode="hide">
          <div className="statement-period-controls">
            <input
              aria-label="Statement period start"
              type="date"
              value={period.periodStart}
              onChange={(event) => setPeriod((current) => ({ ...current, periodStart: event.target.value }))}
            />
            <input
              aria-label="Statement period end"
              type="date"
              value={period.periodEnd}
              onChange={(event) => setPeriod((current) => ({ ...current, periodEnd: event.target.value }))}
            />
            <button type="button" onClick={generateStatements} disabled={isMutating}>
              <FileDown aria-hidden="true" size={16} />
              Generate
            </button>
          </div>
        </PermissionGate>
      </div>

      {statements.length === 0 ? (
        <EmptyState title="No stakeholder statements" detail="Generated statements will appear here for approval and delivery." />
      ) : (
        <ul className="anomaly-list statement-list">
          {statements.map((statement) => (
            <li key={statement.id}>
              <FileDown aria-hidden="true" size={20} />
              <div className="anomaly-body">
                <div className="anomaly-title-row">
                  <strong>{statement.stakeholderName}</strong>
                  <span className={`status-chip status-${statement.status}`}>{statement.status.replace('_', ' ')}</span>
                </div>
                <p>{statement.narrativeMd}</p>
                <div className="anomaly-evidence">
                  <span>
                    Total <strong className="font-mono-data">${statement.totalUsd}</strong>
                  </span>
                  <span>
                    Lines <strong className="font-mono-data">{statement.lineItems.length}</strong>
                  </span>
                  <span>
                    Warnings <strong className="font-mono-data">{statement.scopeWarnings.length}</strong>
                  </span>
                  <span className="font-mono-data">{statement.periodEnd.slice(0, 10)}</span>
                </div>
              </div>
              <div className="anomaly-actions statement-actions">
                <button type="button" onClick={() => exportStatement(statement, 'csv')} disabled={isMutating}>
                  <FileDown aria-hidden="true" size={16} />
                  CSV
                </button>
                <button type="button" onClick={() => exportStatement(statement, 'pdf')} disabled={isMutating}>
                  <FileDown aria-hidden="true" size={16} />
                  PDF
                </button>
                <PermissionGate requiredRole="admin" mode="hide">
                  <button type="button" onClick={() => approveStatement(statement)} disabled={isMutating}>
                    <CheckCircle2 aria-hidden="true" size={16} />
                    Approve
                  </button>
                  <button type="button" onClick={() => sendStatement(statement)} disabled={isMutating}>
                    <Send aria-hidden="true" size={16} />
                    Send
                  </button>
                </PermissionGate>
                <PermissionGate requiredRole="analyst" mode="hide">
                  <button type="button" onClick={() => disputeStatement(statement)} disabled={isMutating}>
                    <AlertTriangle aria-hidden="true" size={16} />
                    Dispute
                  </button>
                </PermissionGate>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function requireListAnomalies(client: CostalyxClient): NonNullable<CostalyxClient['listAnomalies']> {
  if (!client.listAnomalies) {
    throw new Error('Billing agent client is not configured');
  }
  return client.listAnomalies;
}

function requireScanBillingAnomalies(client: CostalyxClient): NonNullable<CostalyxClient['scanBillingAnomalies']> {
  if (!client.scanBillingAnomalies) {
    throw new Error('Billing agent client is not configured');
  }
  return client.scanBillingAnomalies;
}

function requireUpdateAnomalyStatus(client: CostalyxClient): NonNullable<CostalyxClient['updateAnomalyStatus']> {
  if (!client.updateAnomalyStatus) {
    throw new Error('Billing agent client is not configured');
  }
  return client.updateAnomalyStatus;
}

function requireGenerateBillingStatements(client: CostalyxClient): NonNullable<CostalyxClient['generateBillingStatements']> {
  if (!client.generateBillingStatements) {
    throw new Error('Billing statement generation client is not configured');
  }
  return client.generateBillingStatements;
}

function requireApproveBillingStatement(client: CostalyxClient): NonNullable<CostalyxClient['approveBillingStatement']> {
  if (!client.approveBillingStatement) {
    throw new Error('Billing statement approval client is not configured');
  }
  return client.approveBillingStatement;
}

function requireSendBillingStatement(client: CostalyxClient): NonNullable<CostalyxClient['sendBillingStatement']> {
  if (!client.sendBillingStatement) {
    throw new Error('Billing statement send client is not configured');
  }
  return client.sendBillingStatement;
}

function requireDisputeBillingStatement(client: CostalyxClient): NonNullable<CostalyxClient['disputeBillingStatement']> {
  if (!client.disputeBillingStatement) {
    throw new Error('Billing statement dispute client is not configured');
  }
  return client.disputeBillingStatement;
}

function requireExportBillingStatementCsv(client: CostalyxClient): NonNullable<CostalyxClient['exportBillingStatementCsv']> {
  if (!client.exportBillingStatementCsv) {
    throw new Error('Billing statement CSV export client is not configured');
  }
  return client.exportBillingStatementCsv;
}

function requireExportBillingStatementPdf(client: CostalyxClient): NonNullable<CostalyxClient['exportBillingStatementPdf']> {
  if (!client.exportBillingStatementPdf) {
    throw new Error('Billing statement PDF export client is not configured');
  }
  return client.exportBillingStatementPdf;
}

function labelForType(type: Anomaly['type']): string {
  return type
    .split('_')
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function reasonLabel(reason: FalsePositiveReason): string {
  return reason
    .split('_')
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function createIdempotencyKey(scope: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${scope}-${crypto.randomUUID()}`;
  }
  return `${scope}-${Date.now()}`;
}

const defaultStatementPeriod = {
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30'
};
