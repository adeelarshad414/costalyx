import { RefreshCw, ServerCog } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CostalyxClient } from '../../api/client';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { toUserFacingError } from '../../utils/userFacingError';

interface OperatorReadinessConsoleProps {
  client: CostalyxClient;
}

type OperatorReadiness = Awaited<ReturnType<NonNullable<CostalyxClient['getOperatorReadiness']>>>;
type OperatorCheck = OperatorReadiness['checks'][number];
type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

const categoryLabels: Record<OperatorCheck['category'], string> = {
  runtime: 'Runtime',
  cloud: 'Cloud readiness',
  'supporting-service': 'Supporting services'
};

const categoryOrder: OperatorCheck['category'][] = ['runtime', 'cloud', 'supporting-service'];

export function OperatorReadinessConsole({ client }: OperatorReadinessConsoleProps) {
  const [readiness, setReadiness] = useState<OperatorReadiness | null>(null);
  const [state, setState] = useState<LoadState>('idle');
  const [error, setError] = useState('');

  const loadReadiness = useCallback(async () => {
    setState('loading');
    try {
      if (!client.getOperatorReadiness) {
        throw new Error('Operator readiness client method is unavailable.');
      }
      const response = await client.getOperatorReadiness();
      setReadiness(response);
      setState('loaded');
    } catch (loadError) {
      setError(toUserFacingError(loadError, 'Load operator readiness'));
      setState('error');
    }
  }, [client]);

  useEffect(() => {
    void loadReadiness();
  }, [loadReadiness]);

  const checksByCategory = useMemo(() => {
    const grouped = new Map<OperatorCheck['category'], OperatorCheck[]>();
    for (const category of categoryOrder) {
      grouped.set(category, []);
    }
    for (const check of readiness?.checks ?? []) {
      grouped.set(check.category, [...(grouped.get(check.category) ?? []), check]);
    }
    return grouped;
  }, [readiness]);

  return (
    <section className="panel operator-panel" aria-label="Operational readiness">
      <div className="panel-toolbar operator-toolbar">
        <div>
          <p className="section-kicker">Operator</p>
          <h2>Operational readiness</h2>
        </div>
        <button type="button" onClick={loadReadiness}>
          <RefreshCw aria-hidden="true" size={16} />
          Refresh
        </button>
      </div>

      {state === 'loading' || state === 'idle' ? (
        <LoadingState title="Loading operator readiness" variant="list" rows={4} />
      ) : null}

      {state === 'error' ? (
        <ErrorState title="Could not load operator readiness" detail={error} onRetry={loadReadiness} />
      ) : null}

      {state === 'loaded' && readiness ? (
        <div className="operator-layout">
          <div className="operator-summary">
            <div className="operator-status">
              <ServerCog aria-hidden="true" size={22} />
              <div>
                <span className={`status-chip ${statusClass(readiness.status)}`}>{readiness.status}</span>
                <p>Generated {formatTimestamp(readiness.generatedAt)}</p>
              </div>
            </div>
            <dl className="metric-list operator-environment">
              <div>
                <dt>APP_ENV</dt>
                <dd className="font-mono-data">{readiness.environment.appEnv}</dd>
              </div>
              <div>
                <dt>NODE_ENV</dt>
                <dd className="font-mono-data">{readiness.environment.nodeEnv}</dd>
              </div>
              <div>
                <dt>USE_MOCKS</dt>
                <dd className="font-mono-data">{readiness.environment.useMocks ? 'true' : 'false'}</dd>
              </div>
              <div>
                <dt>Live probes</dt>
                <dd className="font-mono-data">{readiness.environment.liveCloudProbes ? 'enabled' : 'disabled'}</dd>
              </div>
            </dl>
          </div>

          <div className="operator-check-grid">
            {categoryOrder.map((category) => (
              <section key={category} className="operator-check-group" aria-label={categoryLabels[category]}>
                <h3>{categoryLabels[category]}</h3>
                <ul className="operator-check-list">
                  {(checksByCategory.get(category) ?? []).map((check) => (
                    <li key={check.id}>
                      <div>
                        <span className={`status-chip ${statusClass(check.status)}`}>{check.status}</span>
                        <strong>{check.label}</strong>
                      </div>
                      <p>{check.detail}</p>
                      {check.remediation ? <p className="operator-remediation">{check.remediation}</p> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <section className="operator-action-band" aria-label="Production blockers">
            <h3>Production blockers</h3>
            {readiness.blockers.length > 0 ? (
              <ul>
                {readiness.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            ) : (
              <p>No production blockers reported by this runtime.</p>
            )}
          </section>

          <section className="operator-action-band" aria-label="Operator next actions">
            <h3>Next actions</h3>
            <ul className="operator-next-actions">
              {readiness.nextActions.map((action) => (
                <li key={`${action.label}-${action.command ?? 'manual'}`}>
                  <strong>{action.label}</strong>
                  {action.command ? <code className="font-mono-data">{action.command}</code> : null}
                  <span>{action.detail}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function statusClass(status: OperatorReadiness['status']): string {
  if (status === 'ready') {
    return 'status-success';
  }
  if (status === 'attention') {
    return 'status-warning';
  }
  return 'status-danger';
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}
