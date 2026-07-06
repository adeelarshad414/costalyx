import { Download, GitBranch, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CostalyxClient } from '../../api/client';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';

interface InsightsConsoleProps {
  client: CostalyxClient;
}

type LoadState = 'loading' | 'loaded' | 'error';
type CloudProvider = 'aws' | 'azure' | 'gcp';
type CostRecord = Awaited<ReturnType<CostalyxClient['listCostRecords']>>['data'][number];
type CostSummary = Awaited<ReturnType<CostalyxClient['getCostSummary']>>;
type CostExplorerFlow = Awaited<ReturnType<CostalyxClient['getCostExplorerFlow']>>;

const providers: CloudProvider[] = ['aws', 'azure', 'gcp'];
const defaultDimensions = ['service', 'leaseType'];
const dimensionOptions = [
  { value: 'service', label: 'Service' },
  { value: 'leaseType', label: 'Lease type' },
  { value: 'transactionType', label: 'Transaction type' },
  { value: 'usageFamily', label: 'Usage family' }
];

export function InsightsConsole({ client }: InsightsConsoleProps) {
  const [state, setState] = useState<LoadState>('loading');
  const [provider, setProvider] = useState<CloudProvider>('aws');
  const [costFloorUsd, setCostFloorUsd] = useState('0.00000000');
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [records, setRecords] = useState<CostRecord[]>([]);
  const [flow, setFlow] = useState<CostExplorerFlow | null>(null);
  const [error, setError] = useState('');
  const [exportStatus, setExportStatus] = useState('');

  const loadInsights = useCallback(async () => {
    setState('loading');
    setExportStatus('');
    try {
      const query = { provider, page: 1, pageSize: 25 };
      const [nextSummary, nextRecords, nextFlow] = await Promise.all([
        client.getCostSummary({ provider }),
        client.listCostRecords(query),
        client.getCostExplorerFlow({ provider, dimensions: defaultDimensions, costFloorUsd })
      ]);
      setSummary(nextSummary);
      setRecords(nextRecords.data);
      setFlow(nextFlow);
      setState('loaded');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unknown insights request failure');
      setState('error');
    }
  }, [client, costFloorUsd, provider]);

  useEffect(() => {
    void loadInsights();
  }, [loadInsights]);

  const exportInventory = useCallback(async () => {
    try {
      const csv = await client.exportCostRecords();
      setExportStatus(`${csvRows(csv)} CSV rows ready`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Unknown export failure');
      setState('error');
    }
  }, [client]);

  const linkTotal = useMemo(() => {
    return flow?.links.reduce((sum, link) => sum + Number(link.costTotalUsd), 0).toFixed(8) ?? '0.00000000';
  }, [flow]);

  if (state === 'loading') {
    return (
      <section className="panel" aria-busy="true">
        <p>Loading insights</p>
      </section>
    );
  }

  if (state === 'error') {
    return (
      <section className="panel">
        <ErrorState title="Could not load insights" detail={error} onRetry={loadInsights} />
      </section>
    );
  }

  return (
    <section className="panel" aria-label="Resource inventory and cost explorer">
      <div className="panel-toolbar insights-toolbar">
        <div className="provider-tabs" role="tablist" aria-label="Provider">
          {providers.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={provider === option}
              className={provider === option ? 'is-active' : undefined}
              onClick={() => setProvider(option)}
            >
              {option.toUpperCase()}
            </button>
          ))}
        </div>
        <button type="button" onClick={exportInventory}>
          <Download aria-hidden="true" size={16} />
          Export inventory CSV
        </button>
      </div>

      {summary ? (
        <dl className="metric-list insights-metrics">
          <div>
            <dt>Cost total</dt>
            <dd className="font-mono-data">{summary.totalCostUsd}</dd>
          </div>
          <div>
            <dt>Total resources</dt>
            <dd className="font-mono-data">{summary.resourceCount}</dd>
          </div>
          <div>
            <dt>Untagged</dt>
            <dd className="font-mono-data">{summary.untaggedCount}</dd>
          </div>
          <div>
            <dt>Inactive</dt>
            <dd className="font-mono-data">{summary.inactiveCount}</dd>
          </div>
        </dl>
      ) : null}

      {exportStatus ? <p className="font-mono-data">{exportStatus}</p> : null}

      {records.length === 0 ? (
        <EmptyState title="No inventory rows match this filter" detail="Try another provider or run ingestion." />
      ) : (
        <div className="insights-grid">
          <section aria-label="Resource Inventory">
            <h2>Resource Inventory</h2>
            <table>
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>Service</th>
                  <th>Lease</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td className="font-mono-data">{record.resourceId}</td>
                    <td>{record.serviceName}</td>
                    <td>{record.leaseType}</td>
                    <td className="font-mono-data">USD {record.costTotalUsd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section aria-label="Cost Explorer">
            <div className="explorer-header">
              <h2>Cost Explorer</h2>
              <p className="font-mono-data">Flow {linkTotal}</p>
            </div>
            <div className="dimension-chip-row" aria-label="Explorer dimensions">
              {dimensionOptions.map((dimension) => (
                <span key={dimension.value}>{dimension.label}</span>
              ))}
            </div>
            <label className="cost-floor-control">
              <SlidersHorizontal aria-hidden="true" size={16} />
              Cost floor
              <input
                type="range"
                min="0"
                max="5"
                step="0.01"
                value={Number(costFloorUsd)}
                onChange={(event) => setCostFloorUsd(Number(event.target.value).toFixed(8))}
              />
              <span className="font-mono-data">{costFloorUsd}</span>
            </label>
            {flow && flow.links.length > 0 ? (
              <ul className="flow-list">
                {flow.links.map((link) => (
                  <li key={`${link.source}-${link.target}`}>
                    <GitBranch aria-hidden="true" size={16} />
                    <span>{flowLabel(flow, link.source)} -&gt; {flowLabel(flow, link.target)}</span>
                    <span className="font-mono-data">USD {link.costTotalUsd}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No explorer flow for this threshold" detail="Lower the cost floor or run ingestion." />
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function flowLabel(flow: CostExplorerFlow, id: string): string {
  return flow.nodes.find((node) => node.id === id)?.label ?? id;
}

function csvRows(csv: string): number {
  return csv
    .trim()
    .split(/\r?\n/)
    .filter(Boolean).length;
}
