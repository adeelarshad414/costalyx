import { FileText, Play, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CostalyxClient } from '../../api/client';
import { PermissionGate } from '../../auth/PermissionGate';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';

interface ReportingConsoleProps {
  client: CostalyxClient;
}

type LoadState = 'loading' | 'loaded' | 'error';
type Report = Awaited<ReturnType<CostalyxClient['listReports']>>['data'][number];
type SavedView = Awaited<ReturnType<CostalyxClient['listViews']>>['data'][number];
type ReportRun = Awaited<ReturnType<CostalyxClient['runReport']>>;

const categoryLabels: Record<string, string> = {
  cost: 'Cost',
  cost_summary: 'Summary',
  invoices: 'Billing',
  utilization: 'Usage',
  underutilization: 'Waste'
};

export function ReportingConsole({ client }: ReportingConsoleProps) {
  const [state, setState] = useState<LoadState>('loading');
  const [reports, setReports] = useState<Report[]>([]);
  const [views, setViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | undefined>();
  const [reportRun, setReportRun] = useState<ReportRun | null>(null);
  const [error, setError] = useState('');

  const loadReporting = useCallback(async () => {
    setState('loading');
    try {
      const [reportResponse, viewResponse] = await Promise.all([
        client.listReports({ page: 1, pageSize: 25 }),
        client.listViews({ page: 1, pageSize: 25 })
      ]);
      setReports(reportResponse.data ?? []);
      setViews(viewResponse.data ?? []);
      setActiveViewId(viewResponse.data?.[0]?.id);
      setState('loaded');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unknown reporting request failure');
      setState('error');
    }
  }, [client]);

  useEffect(() => {
    void loadReporting();
  }, [loadReporting]);

  const createAwsView = useCallback(async () => {
    try {
      const view = await client.createView({
        name: 'AWS Viewer Scope',
        filterJson: { provider: 'aws' },
        sharedRoleScope: ['viewer'],
        idempotencyKey: createIdempotencyKey('view-create')
      });
      setViews((current) => [view, ...current.filter((candidate) => candidate.id !== view.id)]);
      setActiveViewId(view.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unknown view create failure');
      setState('error');
    }
  }, [client]);

  const runReport = useCallback(
    async (report: Report) => {
      try {
        setReportRun(await client.runReport({ id: report.id, activeViewId }));
      } catch (runError) {
        setError(runError instanceof Error ? runError.message : 'Unknown report run failure');
        setState('error');
      }
    },
    [activeViewId, client]
  );

  const activeView = useMemo(() => views.find((view) => view.id === activeViewId), [activeViewId, views]);

  if (state === 'loading') {
    return (
      <section className="panel" aria-busy="true">
        <p>Loading reports</p>
      </section>
    );
  }

  if (state === 'error') {
    return (
      <section className="panel">
        <ErrorState title="Could not load reports" detail={error} onRetry={loadReporting} />
      </section>
    );
  }

  return (
    <section className="panel" aria-label="Reporting and saved views">
      <div className="panel-toolbar reporting-toolbar">
        <h2>Reports</h2>
        <PermissionGate requiredRole="admin" mode="hide">
          <button type="button" onClick={createAwsView}>
            <Plus aria-hidden="true" size={16} />
            Create AWS view
          </button>
        </PermissionGate>
      </div>

      <div className="reporting-grid">
        <section aria-label="Report Gallery">
          <h3>Report Gallery</h3>
          {reports.length === 0 ? (
            <EmptyState title="No reports available" detail="Canned reports appear when the catalog is reachable." />
          ) : (
            <ul className="report-list">
              {reports.map((report) => (
                <li key={report.id}>
                  <FileText aria-hidden="true" size={18} />
                  <div>
                    <strong>{report.name}</strong>
                    <span>{categoryLabels[report.category] ?? report.category}</span>
                  </div>
                  <button type="button" onClick={() => runReport(report)}>
                    <Play aria-hidden="true" size={16} />
                    Run {report.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Saved Views">
          <h3>Saved Views</h3>
          {views.length === 0 ? (
            <EmptyState title="No shared views" detail="Admin-created views appear here when shared with your role." />
          ) : (
            <ul className="view-list">
              {views.map((view) => (
                <li key={view.id}>
                  <label>
                    <input
                      type="radio"
                      name="active-view"
                      checked={view.id === activeViewId}
                      onChange={() => setActiveViewId(view.id)}
                    />
                    <span>{view.name}</span>
                  </label>
                  <span className="font-mono-data">{view.sharedRoleScope.join(', ')}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {activeView ? <p className="font-mono-data">Active view: {activeView.name}</p> : null}

      {reportRun ? (
        <section aria-label="Report Result">
          <h3>Report Result</h3>
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Resource</th>
                <th className="numeric-cell">Cost</th>
              </tr>
            </thead>
            <tbody>
              {reportRun.rows.map((row, index) => (
                <tr key={`${row.resourceId ?? row.accountId ?? row.provider}-${index}`}>
                  <td>{String(row.provider ?? '')}</td>
                  <td className="font-mono-data">{String(row.resourceId ?? row.accountId ?? 'summary')}</td>
                  <td className="font-mono-data numeric-cell">{String(row.costTotalUsd ?? row.invoiceTotalUsd ?? row.totalCostUsd ?? '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </section>
  );
}

function createIdempotencyKey(scope: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${scope}-${crypto.randomUUID()}`;
  }
  return `${scope}-${Date.now()}`;
}
