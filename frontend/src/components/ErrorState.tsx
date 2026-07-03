import { AlertTriangle } from 'lucide-react';

interface ErrorStateProps {
  title: string;
  detail: string;
  onRetry: () => void;
}

export function ErrorState({ title, detail, onRetry }: ErrorStateProps) {
  return (
    <section className="state" role="alert">
      <AlertTriangle aria-hidden="true" />
      <h2>{title}</h2>
      <p>{detail}</p>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </section>
  );
}
