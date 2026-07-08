import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';

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
      <Button onClick={onRetry}>
        {actionLabel}
      </Button>
    </section>
  );
}
