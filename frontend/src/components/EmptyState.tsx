import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './Button';

interface EmptyStateProps {
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
  action?: ReactNode;
}

export function EmptyState({ title, detail = 'Run an ingestion to populate this view.', actionLabel, onAction, action }: EmptyStateProps) {
  return (
    <section className="state" aria-live="polite">
      <Inbox aria-hidden="true" />
      <h2>{title}</h2>
      <p>{detail}</p>
      {action ??
        (actionLabel ? (
          <Button onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null)}
    </section>
  );
}
