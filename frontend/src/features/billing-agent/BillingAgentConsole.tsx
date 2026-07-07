import { Activity, AlertTriangle, CheckCircle2, FileDown, FileSearch, Radar, Send, ShieldCheck, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { CostalyxClient } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { PermissionGate } from '../../auth/PermissionGate';
import { hasRequiredRole } from '../../auth/roles';
import { ConfirmAction } from '../../components/ConfirmAction';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { toUserFacingError } from '../../utils/userFacingError';

interface BillingAgentConsoleProps {
  client: CostalyxClient;
}

type LoadState = 'loading' | 'loaded' | 'error';
type Anomaly = Awaited<ReturnType<NonNullable<CostalyxClient['listAnomalies']>>>['data'][number];
type BillingStatement = Awaited<ReturnType<NonNullable<CostalyxClient['listBillingStatements']>>>['data'][number];
type AgentRun = Awaited<ReturnType<NonNullable<CostalyxClient['listAgentRuns']>>>['data'][number];
type FalsePositiveReason = NonNullable<
  Parameters<NonNullable<CostalyxClient['updateAnomalyStatus']>>[0]['falsePositiveReason']
>;

const falsePositiveReasons: FalsePositiveReason[] = ['seasonal', 'planned_change', 'known_migration', 'other'];

export function BillingAgentConsole({ client }: BillingAgentConsoleProps) {
  const auth = useAuth();
  const [state, setState] = useState<LoadState>('loading');
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [statements, setStatements] = useState<BillingStatement[]>([]);
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [error, setError] = useState('');
  const [isMutating, setIsMutating] = useState(false);
  const [reasonById, setReasonById] = useState<Record<string, FalsePositiveReason>>({});
  const [selectedAnomalyId, setSelectedAnomalyId] = useState<string | null>(null);
  const [period, setPeriod] = useState(defaultStatementPeriod);

  const loadConsole = useCallback(async () => {
    if (auth.status === 'loading') {
      return;
    }
    setState('loading');
    try {
      const canListAgentRuns = hasRequiredRole(auth.role, 'admin');
      const [anomalyResponse, statementResponse, agentRunResponse] = await Promise.all([
        requireListAnomalies(client)({ status: 'open', pageSize: 50 }),
        client.listBillingStatements?.({ pageSize: 50 }) ?? Promise.resolve({ data: [], meta: { total: 0, page: 1, pageSize: 50 } }),
        canListAgentRuns && client.listAgentRuns
          ? client.listAgentRuns({ pageSize: 5 })
          : Promise.resolve({ data: [], meta: { total: 0, page: 1, pageSize: 5 } })
      ]);
      const loadedAnomalies: Anomaly[] = anomalyResponse.data ?? [];
      setAnomalies(loadedAnomalies);
      setSelectedAnomalyId((current) =>
        current && loadedAnomalies.some((anomaly) => anomaly.id === current) ? current : null
      );
      setStatements(statementResponse.data);
      setAgentRuns(agentRunResponse.data);
      setState('loaded');
    } catch (loadError) {
      setError(toUserFacingError(loadError, 'Load billing anomalies'));
      setState('error');
    }
  }, [auth.role, auth.status, client]);

  useEffect(() => {
    void loadConsole();
  }, [loadConsole]);

  const runScan = useCallback(async () => {
    setIsMutating(true);
    try {
      await requireScanBillingAnomalies(client)();
      await loadConsole();
    } catch (scanError) {
      setError(toUserFacingError(scanError, 'Run anomaly scan'));
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
        setError(toUserFacingError(updateError, 'Mark anomaly false positive'));
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
      setError(toUserFacingError(generateError, 'Generate statements'));
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
        setError(toUserFacingError(approveError, 'Approve statement'));
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
        setError(toUserFacingError(sendError, 'Send statement'));
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
        setError(toUserFacingError(disputeError, 'Dispute statement'));
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
        setError(toUserFacingError(exportError, `Export statement ${format.toUpperCase()}`));
        setState('error');
      } finally {
        setIsMutating(false);
      }
    },
    [client]
  );

  if (state === 'loading') {
    return (
      <section className="panel">
        <LoadingState title="Loading anomalies" variant="list" rows={4} />
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

  const selectedAnomaly = anomalies.find((anomaly) => anomaly.id === selectedAnomalyId) ?? null;

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
              <div className="anomaly-actions">
                <button
                  type="button"
                  aria-controls="anomaly-evidence-story"
                  aria-expanded={selectedAnomalyId === anomaly.id}
                  aria-label={`Review evidence for ${labelForType(anomaly.type)}`}
                  onClick={() => setSelectedAnomalyId(anomaly.id)}
                >
                  <FileSearch aria-hidden="true" size={16} />
                  Review evidence
                </button>
                <PermissionGate requiredRole="analyst" mode="hide">
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
                  <ConfirmAction
                    actionLabel="False positive"
                    consequence={`Mark ${labelForType(anomaly.type)} as false positive with ${reasonLabel(
                      reasonById[anomaly.id] ?? 'seasonal'
                    )}. Future scans will suppress matching anomalies.`}
                    disabled={isMutating}
                    onConfirm={() => markFalsePositive(anomaly)}
                  >
                    <ShieldCheck aria-hidden="true" size={16} />
                    False positive
                  </ConfirmAction>
                </PermissionGate>
              </div>
            </li>
          ))}
        </ul>
      )}

      {selectedAnomaly ? <AnomalyEvidenceStory anomaly={selectedAnomaly} onClose={() => setSelectedAnomalyId(null)} /> : null}

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
                  <ConfirmAction
                    actionLabel="Approve"
                    consequence={`Approve the ${statement.stakeholderName} statement for ${statement.periodEnd.slice(
                      0,
                      10
                    )}. This allows an admin to send it.`}
                    disabled={isMutating}
                    onConfirm={() => approveStatement(statement)}
                  >
                    <CheckCircle2 aria-hidden="true" size={16} />
                    Approve
                  </ConfirmAction>
                  <ConfirmAction
                    actionLabel="Send"
                    consequence={`Send the ${statement.stakeholderName} statement for ${statement.periodEnd.slice(
                      0,
                      10
                    )} to its stakeholder and record delivery evidence.`}
                    disabled={isMutating}
                    onConfirm={() => sendStatement(statement)}
                  >
                    <Send aria-hidden="true" size={16} />
                    Send
                  </ConfirmAction>
                </PermissionGate>
                <PermissionGate requiredRole="analyst" mode="hide">
                  <ConfirmAction
                    actionLabel="Dispute"
                    consequence={`Open a stakeholder dispute on the ${statement.stakeholderName} statement and record an allocation review note.`}
                    disabled={isMutating}
                    onConfirm={() => disputeStatement(statement)}
                  >
                    <AlertTriangle aria-hidden="true" size={16} />
                    Dispute
                  </ConfirmAction>
                </PermissionGate>
              </div>
            </li>
          ))}
        </ul>
      )}

      <PermissionGate requiredRole="admin" mode="hide">
        <div className="panel-toolbar anomaly-toolbar statement-toolbar">
          <h3>Agent Runs</h3>
        </div>
        {agentRuns.length === 0 ? (
          <EmptyState title="No agent runs" detail="Scheduled decision cycles will appear here with their actions and guardrails." />
        ) : (
          <ul className="anomaly-list agent-run-list">
            {agentRuns.map((run) => (
              <li key={run.id}>
                <Activity aria-hidden="true" size={20} />
                <div className="anomaly-body">
                  <div className="anomaly-title-row">
                    <strong>{labelForRunType(run.runType)}</strong>
                    <span className={`status-chip ${run.errors.length ? 'severity-high' : 'severity-low'}`}>
                      {run.errors.length ? 'error' : 'recorded'}
                    </span>
                  </div>
                  <p>
                    Took <strong className="font-mono-data">{sumActionCounts(run.actionsTaken)}</strong> actions and proposed{' '}
                    <strong className="font-mono-data">{sumActionCounts(run.actionsProposed)}</strong> follow-ups.
                  </p>
                  <div className="anomaly-evidence">
                    <span className="font-mono-data">{run.startedAt.slice(0, 10)}</span>
                    <span>
                      Caps <strong className="font-mono-data">{run.actionsTaken.filter((action) => action.capped).length + run.actionsProposed.filter((action) => action.capped).length}</strong>
                    </span>
                    <span>
                      Errors <strong className="font-mono-data">{run.errors.length}</strong>
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PermissionGate>
    </section>
  );
}

function AnomalyEvidenceStory({ anomaly, onClose }: { anomaly: Anomaly; onClose: () => void }) {
  const primaryRow = anomaly.evidence.pricingRows[0];
  const impactedSpendUsd = formatComputedSpendUsd(anomaly.evidence.pricingRows);

  return (
    <section id="anomaly-evidence-story" className="anomaly-detail-story" aria-label="Anomaly evidence story">
      <div className="anomaly-detail-header">
        <div>
          <p className="section-kicker">Evidence story</p>
          <h3>{labelForType(anomaly.type)}</h3>
        </div>
        <button type="button" className="icon-button" aria-label="Close anomaly detail" onClick={onClose}>
          <X aria-hidden="true" size={18} />
        </button>
      </div>

      <dl className="anomaly-story-grid">
        <div>
          <dt>What changed</dt>
          <dd>{anomaly.explanationMd}</dd>
        </div>
        <div>
          <dt>Since when</dt>
          <dd>
            <span className="font-mono-data">{formatDate(anomaly.windowStart)}</span>
            <span aria-hidden="true"> to </span>
            <span className="font-mono-data">{formatDate(anomaly.windowEnd)}</span>
          </dd>
        </div>
        <div>
          <dt>Impact</dt>
          <dd>
            <span className="font-mono-data">{impactedSpendUsd}</span> affected spend computed from hourly rate and usage.
          </dd>
        </div>
        <div>
          <dt>Recommended action</dt>
          <dd>{recommendedActionForType(anomaly.type)}</dd>
        </div>
      </dl>

      <div className="anomaly-story-evidence">
        <h4>Evidence chain</h4>
        <ul>
          {anomaly.evidence.pricingRows.map((row) => (
            <li key={`${row.costRecordId}-${row.resourceId}-${row.validFrom}`}>
              <span className="font-mono-data">{row.resourceId}</span>
              <span>
                Rate <strong className="font-mono-data">${row.hourlyRateUsd}</strong>
              </span>
              <span>
                Usage <strong className="font-mono-data">{row.usageHours} h</strong>
              </span>
              <span>
                Valid from <strong className="font-mono-data">{formatDate(row.validFrom)}</strong>
              </span>
            </li>
          ))}
        </ul>
        <p>
          Fingerprint <span className="font-mono-data">{anomaly.evidence.fingerprint}</span>
          {primaryRow ? (
            <>
              {' '}
              links back to cost record <span className="font-mono-data">{primaryRow.costRecordId}</span>.
            </>
          ) : null}
        </p>
      </div>
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

function labelForRunType(type: AgentRun['runType']): string {
  return type
    .split('_')
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function recommendedActionForType(type: Anomaly['type']): string {
  const actionByType: Record<Anomaly['type'], string> = {
    coverage: 'Review commitment coverage, confirm expected demand, and attach the decision to the stakeholder statement.',
    new_spend: 'Confirm the new billing source owner, then assign or dispute the spend before the next statement is sent.',
    unit_price: 'Check the pricing row against the contract rate and escalate any unexplained rate movement.',
    usage: 'Investigate the affected resource and either assign an owner, resolve the driver, or mark it false positive with evidence.'
  };
  return actionByType[type];
}

function formatComputedSpendUsd(rows: Anomaly['evidence']['pricingRows']): string {
  const total = rows.reduce((sum, row) => sum + Number(row.hourlyRateUsd) * Number(row.usageHours), 0);
  return `$${total.toFixed(2)}`;
}

function formatDate(value: string): string {
  return value.slice(0, 10);
}

function sumActionCounts(actions: AgentRun['actionsTaken']): number {
  return actions.reduce((sum, action) => sum + Number(action.count ?? 0), 0);
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
