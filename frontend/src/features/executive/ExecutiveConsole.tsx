import { Download, TrendingUp } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { CostalyxClient } from '../../api/client';
import { bootstrapKeys, takeBootstrapValue } from '../../bootstrapCache';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { ProgressButton } from '../../components/LoadingExperience';
import { LoadingState } from '../../components/LoadingState';
import { toUserFacingError } from '../../utils/userFacingError';

interface ExecutiveConsoleProps {
  client: CostalyxClient;
}

type LoadState = 'loading' | 'loaded' | 'error';
type ExecutiveSummary = Awaited<ReturnType<CostalyxClient['getExecutiveSummary']>>;
type TcoEstimate = Awaited<ReturnType<CostalyxClient['estimateTco']>>;

const defaultTcoWorkload = {
  usageHours: '730.0000',
  providerHourlyRatesUsd: {
    aws: '0.06800000',
    azure: '0.09600000',
    gcp: '0.04750000'
  }
};

export function ExecutiveConsole({ client }: ExecutiveConsoleProps) {
  const [bootstrappedSummary] = useState<ExecutiveSummary | null>(
    () => takeBootstrapValue<ExecutiveSummary>(bootstrapKeys.executive) ?? null
  );
  const [state, setState] = useState<LoadState>(bootstrappedSummary ? 'loaded' : 'loading');
  const [summary, setSummary] = useState<ExecutiveSummary | null>(bootstrappedSummary);
  const [estimate, setEstimate] = useState<TcoEstimate | null>(null);
  const [error, setError] = useState('');
  const [exportStatus, setExportStatus] = useState('');
  const [busyAction, setBusyAction] = useState<'export' | 'estimate' | null>(null);

  const loadSummary = useCallback(async () => {
    setState('loading');
    setExportStatus('');
    try {
      const nextSummary = await client.getExecutiveSummary({
        revenueBaselineUsd: '1000.00000000',
        budgetBaselineUsd: '100.00000000'
      });
      setSummary(nextSummary);
      setState('loaded');
    } catch (loadError) {
      setError(toUserFacingError(loadError, 'Load executive summary'));
      setState('error');
    }
  }, [client]);

  useEffect(() => {
    if (bootstrappedSummary) {
      return;
    }
    void loadSummary();
  }, [bootstrappedSummary, loadSummary]);

  const exportPdf = useCallback(async () => {
    setBusyAction('export');
    try {
      await client.exportExecutiveSummaryPdf();
      setExportStatus('PDF ready');
    } catch (exportError) {
      setError(toUserFacingError(exportError, 'Export executive PDF'));
      setState('error');
    } finally {
      setBusyAction(null);
    }
  }, [client]);

  const estimateTco = useCallback(async () => {
    setBusyAction('estimate');
    try {
      setEstimate(
        await client.estimateTco({
          workloadSpec: defaultTcoWorkload,
          idempotencyKey: createIdempotencyKey('tco-estimate')
        })
      );
    } catch (estimateError) {
      setError(toUserFacingError(estimateError, 'Estimate TCO'));
      setState('error');
    } finally {
      setBusyAction(null);
    }
  }, [client]);

  if (state === 'loading') {
    return (
      <section className="panel">
        <LoadingState title="Loading executive summary" variant="cards" rows={4} />
      </section>
    );
  }

  if (state === 'error') {
    return (
      <section className="panel">
        <ErrorState title="Could not load executive summary" detail={error} onRetry={loadSummary} />
      </section>
    );
  }

  return (
    <section className="panel" aria-label="Executive summary">
      <div className="panel-toolbar executive-toolbar">
        <h2>Executive Summary</h2>
        <div className="action-row">
          <ProgressButton
            idleLabel="Export executive PDF"
            runningLabel="Exporting PDF..."
            isRunning={busyAction === 'export'}
            disabled={busyAction !== null && busyAction !== 'export'}
            onClick={exportPdf}
          >
            <Download aria-hidden="true" size={16} />
          </ProgressButton>
          <ProgressButton
            idleLabel="Estimate TCO"
            runningLabel="Estimating TCO..."
            isRunning={busyAction === 'estimate'}
            disabled={busyAction !== null && busyAction !== 'estimate'}
            onClick={estimateTco}
          >
            <TrendingUp aria-hidden="true" size={16} />
          </ProgressButton>
        </div>
      </div>

      {summary ? (
        <>
          <dl className="metric-list executive-metrics">
            <div>
              <dt>Total spend</dt>
              <dd className="font-mono-data">{summary.totalSpendUsd}</dd>
            </div>
            <div>
              <dt>Revenue</dt>
              <dd className="font-mono-data">{summary.spendAsRevenuePercent}%</dd>
            </div>
            <div>
              <dt>Budget used</dt>
              <dd className="font-mono-data">{summary.budgetUsedPercent}%</dd>
            </div>
            <div>
              <dt>Trend delta</dt>
              <dd className="font-mono-data">USD {summary.trend.deltaUsd}</dd>
            </div>
          </dl>

          {exportStatus ? <p className="font-mono-data">{exportStatus}</p> : null}

          <div className="executive-grid">
            <section aria-label="Top Movers">
              <h3>Top Movers</h3>
              {summary.topMovers.length === 0 ? (
                <EmptyState title="No top movers yet" detail="Run ingestion to populate executive movement." />
              ) : (
                <ul className="executive-list">
                  {summary.topMovers.map((mover) => (
                    <li key={mover.resourceId}>
                      <span className="font-mono-data">{mover.resourceId}</span>
                      <span>{mover.serviceName}</span>
                      <strong className="font-mono-data">USD {mover.deltaUsd}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-label="What-if TCO">
              <h3>What-if TCO</h3>
              {estimate ? (
                <dl className="tco-grid">
                  <div>
                    <dt>AWS</dt>
                    <dd className="font-mono-data">{estimate.aws.monthlyCostUsd}</dd>
                  </div>
                  <div>
                    <dt>Azure</dt>
                    <dd className="font-mono-data">{estimate.azure.monthlyCostUsd}</dd>
                  </div>
                  <div>
                    <dt>GCP</dt>
                    <dd className="font-mono-data">{estimate.gcp.monthlyCostUsd}</dd>
                  </div>
                  <div>
                    <dt>Tolerance</dt>
                    <dd className="font-mono-data">{estimate.tolerancePercent}%</dd>
                  </div>
                </dl>
              ) : (
                <EmptyState title="No TCO estimate yet" detail="Estimate the fixture workload to compare providers." />
              )}
            </section>
          </div>
        </>
      ) : (
        <EmptyState title="No executive summary yet" detail="Run ingestion to populate executive metrics." />
      )}
    </section>
  );
}

function createIdempotencyKey(scope: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${scope}-${crypto.randomUUID()}`;
  }
  return `${scope}-${Date.now()}`;
}
