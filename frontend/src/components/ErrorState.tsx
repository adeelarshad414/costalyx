import { AlertTriangle } from 'lucide-react';

interface ErrorStateProps {
  title: string;
  detail: string;
  onRetry: () => void;
  actionLabel?: string;
}

export function ErrorState({ title, detail, onRetry, actionLabel = 'Retry' }: ErrorStateProps) {
  return (
    <section className="state" role="alert">
      <AlertTriangle aria-hidden="true" />
      <h2>{title}</h2>
      <p>{detail}</p>
      <button type="button" onClick={onRetry}>
        {actionLabel}
      </button>
    </section>
  );
}
