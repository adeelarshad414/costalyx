import { FileText, Play, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CostalyxClient } from '../../api/client';
import { PermissionGate } from '../../auth/PermissionGate';
import { bootstrapKeys, takeBootstrapValue } from '../../bootstrapCache';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { JobToast, ProgressButton, TaskQueue, type TaskQueueItem } from '../../components/LoadingExperience';
import { LoadingState } from '../../components/LoadingState';
import { toUserFacingError } from '../../utils/userFacingError';

interface ReportingConsoleProps {
  client: CostalyxClient;
}

type LoadState = 'loading' | 'loaded' | 'error';
type Report = Awaited<ReturnType<CostalyxClient['listReports']>>['data'][number];
type SavedView = Awaited<ReturnType<CostalyxClient['listViews']>>['data'][number];
type ReportRun = Awaited<ReturnType<CostalyxClient['runReport']>>;
interface ReportingBootstrap {
  reports: Report[];
  views: SavedView[];
}

const categoryLabels: Record<string, string> = {
  cost: 'Cost',
  cost_summary: 'Summary',
  invoices: 'Billing',
  utilization: 'Usage',
  underutilization: 'Waste'
};

export function ReportingConsole({ client }: ReportingConsoleProps) {
  const [bootstrappedReporting] = useState<ReportingBootstrap | null>(
    () => takeBootstrapValue<ReportingBootstrap>(bootstrapKeys.reporting) ?? null
  );
  const [state, setState] = useState<LoadState>(bootstrappedReporting ? 'loaded' : 'loading');
  const [reports, setReports] = useState<Report[]>(() => bootstrappedReporting?.reports ?? []);
  const [views, setViews] = useState<SavedView[]>(() => bootstrappedReporting?.views ?? []);
  const [activeViewId, setActiveViewId] = useState<string | undefined>(() => bootstrappedReporting?.views[0]?.id);
  const [reportRun, setReportRun] = useState<ReportRun | null>(null);
  const [isCreatingView, setIsCreatingView] = useState(false);
  const [runningReportId, setRunningReportId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskQueueItem[]>([]);
  const [error, setError] = useState('');

  const pushTask = useCallback((task: TaskQueueItem) => {
    setTasks((current) => [...current.filter((candidate) => candidate.id !== task.id), task].slice(-6));
  }, []);

  const updateTask = useCallback((taskId: string, updates: Partial<TaskQueueItem>) => {
    setTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, ...updates } : task))
    );
  }, []);

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
      setError(toUserFacingError(loadError, 'Load reports'));
      setState('error');
    }
  }, [client]);

  useEffect(() => {
    if (bootstrappedReporting) {
      return;
    }
    void loadReporting();
  }, [bootstrappedReporting, loadReporting]);

  const createAwsView = useCallback(async () => {
    setIsCreatingView(true);
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
      setError(toUserFacingError(createError, 'Create saved view'));
      setState('error');
    } finally {
      setIsCreatingView(false);
    }
  }, [client]);

  const runReport = useCallback(
    async (report: Report) => {
      const taskId = createTaskId(`report-run-${report.id}`);
      setRunningReportId(report.id);
      pushTask({
        id: taskId,
        title: `Run report · ${report.name}`,
        status: 'running',
        phaseLabel: 'Building scoped result',
        detail: activeViewId ? 'Applying the selected shared view before rendering results.' : 'Running against the workspace default scope.'
      });
      try {
        setReportRun(await client.runReport({ id: report.id, activeViewId }));
        updateTask(taskId, {
          status: 'done',
          phaseLabel: 'Completed',
          detail: 'Report result is ready in the results panel.'
        });
      } catch (runError) {
        const errorMessage = toUserFacingError(runError, 'Run report');
        updateTask(taskId, { status: 'failed', phaseLabel: 'Failed', detail: errorMessage });
        setError(errorMessage);
        setState('error');
      } finally {
        setRunningReportId(null);
      }
    },
    [activeViewId, client, pushTask, updateTask]
  );

  const activeView = useMemo(() => views.find((view) => view.id === activeViewId), [activeViewId, views]);

  if (state === 'loading') {
    return (
      <section className="panel">
        <LoadingState title="Loading reports" variant="table" />
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
          <ProgressButton
            idleLabel="Create AWS view"
            runningLabel="Creating view..."
            isRunning={isCreatingView}
            disabled={runningReportId !== null}
            onClick={createAwsView}
          >
            <Plus aria-hidden="true" size={16} />
          </ProgressButton>
        </PermissionGate>
      </div>

      <TaskQueue title="Reporting activity" tasks={tasks} emptyMessage="No report jobs are running in this session." />

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
                  <ProgressButton
                    idleLabel={`Run ${report.name}`}
                    runningLabel="Running..."
                    isRunning={runningReportId === report.id}
                    disabled={runningReportId !== null && runningReportId !== report.id}
                    onClick={() => runReport(report)}
                  >
                    <Play aria-hidden="true" size={16} />
                  </ProgressButton>
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

      <JobToast tasks={tasks} />
    </section>
  );
}

function createIdempotencyKey(scope: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${scope}-${crypto.randomUUID()}`;
  }
  return `${scope}-${Date.now()}`;
}

function createTaskId(scope: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${scope}-${crypto.randomUUID()}`;
  }
  return `${scope}-${Date.now()}`;
}
