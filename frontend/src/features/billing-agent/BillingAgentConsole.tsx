import { AlertTriangle, Radar, ShieldCheck } from 'lucide-react';
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
type FalsePositiveReason = NonNullable<
  Parameters<NonNullable<CostalyxClient['updateAnomalyStatus']>>[0]['falsePositiveReason']
>;

const falsePositiveReasons: FalsePositiveReason[] = ['seasonal', 'planned_change', 'known_migration', 'other'];

export function BillingAgentConsole({ client }: BillingAgentConsoleProps) {
  const [state, setState] = useState<LoadState>('loading');
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [error, setError] = useState('');
  const [isMutating, setIsMutating] = useState(false);
  const [reasonById, setReasonById] = useState<Record<string, FalsePositiveReason>>({});

  const loadAnomalies = useCallback(async () => {
    setState('loading');
    try {
      const response = await requireListAnomalies(client)({ status: 'open', pageSize: 50 });
      setAnomalies(response.data);
      setState('loaded');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unknown billing-agent request failure');
      setState('error');
    }
  }, [client]);

  useEffect(() => {
    void loadAnomalies();
  }, [loadAnomalies]);

  const runScan = useCallback(async () => {
    setIsMutating(true);
    try {
      await requireScanBillingAnomalies(client)();
      await loadAnomalies();
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : 'Unknown anomaly scan failure');
      setState('error');
    } finally {
      setIsMutating(false);
    }
  }, [client, loadAnomalies]);

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
        await loadAnomalies();
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : 'Unknown anomaly update failure');
        setState('error');
      } finally {
        setIsMutating(false);
      }
    },
    [client, loadAnomalies, reasonById]
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
        <ErrorState title="Could not load anomalies" detail={error} onRetry={loadAnomalies} />
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
