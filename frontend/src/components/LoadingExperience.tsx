import { CheckCircle2, Circle, LoaderCircle, ShieldCheck, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Button } from './Button';
import { ToastViewport } from './Overlays';

export type LoaderStepStatus = 'done' | 'active' | 'pending' | 'failed';

export interface LoaderStep {
  id: string;
  label: string;
  status: LoaderStepStatus;
  detail?: string;
}

export interface TaskQueueItem {
  id: string;
  title: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  detail?: string;
  phaseLabel?: string;
  progressPercent?: number;
}

interface BootSplashProps {
  productName: string;
  phaseLabel?: string;
  onRetry?: () => void;
}

interface ProgressBarProps {
  label: string;
  value: number;
  phaseLabel?: string;
  mode?: 'determinate' | 'phased';
}

interface SessionLoaderProps {
  productName: string;
  eyebrow?: string;
  displayName?: string | null;
  identityLine?: string | null;
  steps: LoaderStep[];
  progressValue: number;
  progressLabel: string;
  phaseLabel: string;
  showTrustCue?: boolean;
  errorTitle?: string;
  errorDetail?: string;
  onRetry?: () => void;
}

interface ProgressButtonProps {
  idleLabel: string;
  runningLabel: string;
  isRunning: boolean;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  children?: ReactNode;
}

interface TaskQueueProps {
  title: string;
  tasks: TaskQueueItem[];
  emptyMessage?: string;
}

interface JobToastProps {
  tasks: TaskQueueItem[];
}

interface LiveTailProps {
  title: string;
  isLive: boolean;
  onToggleLive?: () => void;
  children: ReactNode;
}

const bootSplashTextDelayMs = 3000;
const bootSplashRetryDelayMs = 10000;

export function BootSplash({ productName, phaseLabel = 'Connecting...', onRetry }: BootSplashProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 250);
    return () => window.clearInterval(interval);
  }, []);

  const canShowPhaseCopy = elapsedMs >= bootSplashTextDelayMs;
  const canShowRetry = elapsedMs >= bootSplashRetryDelayMs;

  return (
    <main className="boot-splash" aria-label={`${productName} boot splash`} aria-busy="true">
      <div className="boot-splash-mark" aria-hidden="true">
        <span className="boot-splash-ring boot-splash-ring-outer" />
        <span className="boot-splash-ring boot-splash-ring-inner" />
        <div className="boot-splash-glyph">{productName.slice(0, 1)}</div>
      </div>
      {canShowPhaseCopy ? (
        <div className="boot-splash-copy" aria-live="polite">
          <p className="section-kicker">CONNECTING</p>
          <p>{phaseLabel}</p>
          {canShowRetry && onRetry ? (
            <Button variant="secondary" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}

export function ProgressBar({ label, value, phaseLabel, mode = 'determinate' }: ProgressBarProps) {
  const safeValue = clampProgress(value);

  return (
    <div className="loader-progress">
      <div className="loader-progress-header">
        <strong className="loader-progress-value font-mono-data">{`${Math.round(safeValue)}%`}</strong>
        <span className="loader-progress-label">{label}</span>
      </div>
      <div
        className={`loader-progress-track loader-progress-track-${mode}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(safeValue)}
        style={{ '--loader-fill-width': `${safeValue}%` } as CSSProperties}
      >
        <span className="loader-progress-fill" style={{ width: `${safeValue}%` }} />
        {mode === 'phased' && safeValue < 100 ? <span className="loader-progress-remainder" /> : null}
      </div>
      <div className="loader-progress-phase" aria-live="polite">
        {phaseLabel}
      </div>
    </div>
  );
}

export function SessionLoader({
  productName,
  eyebrow = 'WORKSPACE',
  displayName,
  identityLine,
  steps,
  progressValue,
  progressLabel,
  phaseLabel,
  showTrustCue = false,
  errorTitle,
  errorDetail,
  onRetry
}: SessionLoaderProps) {
  const hasFailure = Boolean(errorTitle);

  return (
    <main
      className={`session-loader${hasFailure ? ' session-loader-error' : ''}`}
      aria-label={`Preparing ${productName} workspace`}
      aria-busy={!hasFailure}
    >
      <section className="session-loader-panel">
        <div className="session-loader-mark">
          <span>{productName.slice(0, 1)}</span>
        </div>
        <div className="session-loader-heading">
          <p className="section-kicker">{eyebrow}</p>
          <h1>{productName}</h1>
        </div>
        {displayName ? (
          <div className="session-loader-identity">
            <div className="session-loader-avatar" aria-hidden="true">
              {initialsForName(displayName)}
            </div>
            <div>
              <strong>{`Welcome back, ${firstName(displayName)}`}</strong>
              <p>{identityLine ?? 'Authenticated workspace session'}</p>
            </div>
          </div>
        ) : null}
        <ProgressBar label={progressLabel} value={progressValue} phaseLabel={phaseLabel} mode="phased" />
        <ol className="session-loader-steps" aria-label="Workspace preparation steps">
          {steps.map((step) => (
            <li key={step.id} className={`session-loader-step session-loader-step-${step.status}`}>
              <span className="session-loader-step-icon" aria-hidden="true">
                {step.status === 'done' ? <CheckCircle2 size={16} /> : null}
                {step.status === 'active' ? <LoaderCircle size={16} className="session-loader-spin" /> : null}
                {step.status === 'failed' ? <XCircle size={16} /> : null}
                {step.status === 'pending' ? <Circle size={14} /> : null}
              </span>
              <div>
                <strong>{step.label}</strong>
                {step.detail ? <p>{step.detail}</p> : null}
              </div>
            </li>
          ))}
        </ol>
        {hasFailure ? (
          <div className="session-loader-failure" role="alert">
            <strong>{errorTitle}</strong>
            {errorDetail ? <p>{errorDetail}</p> : null}
            {onRetry ? (
              <Button onClick={onRetry}>
                Retry workspace load
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>
      {showTrustCue ? (
        <div className="session-loader-trust-cue" aria-live="polite">
          <ShieldCheck aria-hidden="true" size={14} />
          <span>SECURE SESSION</span>
        </div>
      ) : null}
    </main>
  );
}

export function ProgressButton({
  idleLabel,
  runningLabel,
  isRunning,
  onClick,
  disabled = false,
  children
}: ProgressButtonProps) {
  return (
    <Button
      className="progress-button"
      isLoading={isRunning}
      loadingLabel={runningLabel}
      onClick={() => void onClick()}
      disabled={disabled}
      leadingIcon={children}
    >
      {idleLabel}
    </Button>
  );
}

export function TaskQueue({ title, tasks, emptyMessage }: TaskQueueProps) {
  if (tasks.length === 0) {
    return emptyMessage ? <p className="task-queue-empty">{emptyMessage}</p> : null;
  }

  return (
    <section className="task-queue" aria-label={title}>
      <h3>{title}</h3>
      <ul className="task-queue-list">
        {tasks.map((task) => (
          <li key={task.id} className={`task-queue-item task-queue-item-${task.status}`}>
            <div className="task-queue-item-heading">
              <strong>{task.title}</strong>
              <span className={`status-chip task-status-${task.status}`}>{task.status}</span>
            </div>
            {task.detail ? <p>{task.detail}</p> : null}
            {typeof task.progressPercent === 'number' ? (
              <ProgressBar
                label={`${task.title} progress`}
                value={task.progressPercent}
                phaseLabel={task.phaseLabel ?? 'Working...'}
                mode="phased"
              />
            ) : task.phaseLabel ? (
              <p className="task-queue-phase">{task.phaseLabel}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function JobToast({ tasks }: JobToastProps) {
  const visibleTasks = useMemo(() => tasks.filter((task) => task.status !== 'queued').slice(-3), [tasks]);

  if (visibleTasks.length === 0) {
    return null;
  }

  return (
    <ToastViewport
      toasts={visibleTasks.map((task) => ({
        id: task.id,
        title: task.title,
        detail: task.detail ?? task.phaseLabel ?? 'Working...',
        tone: task.status === 'failed' ? 'critical' : task.status === 'done' ? 'success' : 'info'
      }))}
    />
  );
}

export function LiveTail({ title, isLive, onToggleLive, children }: LiveTailProps) {
  return (
    <section className="live-tail" aria-label={title}>
      <div className="live-tail-header">
        <strong>{title}</strong>
        <Button type="button" variant="ghost" size="compact" className={isLive ? 'is-live' : ''} onClick={onToggleLive}>
          {isLive ? 'Live · streaming' : 'Paused'}
        </Button>
      </div>
      <div className="live-tail-body">{children}</div>
    </section>
  );
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function firstName(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return 'there';
  }
  const [firstSegment] = normalized.replace(/[@._-]+/g, ' ').split(/\s+/);
  return capitalize(firstSegment || 'there');
}

function initialsForName(value: string): string {
  const parts = value
    .trim()
    .replace(/[@._-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || 'C';
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
