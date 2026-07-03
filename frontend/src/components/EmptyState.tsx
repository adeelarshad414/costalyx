import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  detail?: string;
  actionLabel: string;
  onAction?: () => void;
}

export function EmptyState({ title, detail = 'Run an ingestion to populate this view.', actionLabel, onAction }: EmptyStateProps) {
  return (
    <section className="state" aria-live="polite">
      <Inbox aria-hidden="true" />
      <h2>{title}</h2>
      <p>{detail}</p>
      <button type="button" onClick={onAction}>
        {actionLabel}
      </button>
    </section>
  );
}
