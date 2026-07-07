type LoadingVariant = 'cards' | 'table' | 'list' | 'form';

interface LoadingStateProps {
  title: string;
  variant?: LoadingVariant;
  rows?: number;
}

export function LoadingState({ title, variant = 'cards', rows }: LoadingStateProps) {
  const rowCount = rows ?? (variant === 'table' ? 5 : 3);

  return (
    <section className={`loading-state loading-state-${variant}`} role="status" aria-busy="true" aria-label={title}>
      <p>{title}</p>
      <div className="skeleton-layout" data-testid="loading-skeleton" data-variant={variant} aria-hidden="true">
        {variant === 'table' ? <TableSkeleton rows={rowCount} /> : null}
        {variant === 'cards' ? <CardSkeleton rows={rowCount} /> : null}
        {variant === 'list' ? <ListSkeleton rows={rowCount} /> : null}
        {variant === 'form' ? <FormSkeleton rows={rowCount} /> : null}
      </div>
    </section>
  );
}

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <>
      <div className="skeleton-table-header">
        {staticItems(4, 'header').map((item) => (
          <span key={item} className="skeleton-line skeleton-line-short" />
        ))}
      </div>
      {staticItems(rows, 'row').map((item) => (
        <div key={item} className="skeleton-table-row" data-testid="skeleton-table-row">
          <span className="skeleton-line skeleton-line-wide" />
          <span className="skeleton-line" />
          <span className="skeleton-line" />
          <span className="skeleton-line skeleton-line-short" />
        </div>
      ))}
    </>
  );
}

function CardSkeleton({ rows }: { rows: number }) {
  return (
    <div className="skeleton-card-grid">
      {staticItems(rows, 'card').map((item) => (
        <div key={item} className="skeleton-card">
          <span className="skeleton-line skeleton-line-short" />
          <span className="skeleton-line skeleton-line-wide" />
          <span className="skeleton-line" />
        </div>
      ))}
    </div>
  );
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="skeleton-list">
      {staticItems(rows, 'item').map((item) => (
        <div key={item} className="skeleton-list-item">
          <span className="skeleton-dot" />
          <span className="skeleton-line skeleton-line-wide" />
          <span className="skeleton-line skeleton-line-short" />
        </div>
      ))}
    </div>
  );
}

function FormSkeleton({ rows }: { rows: number }) {
  return (
    <div className="skeleton-form">
      {staticItems(rows, 'field').map((item) => (
        <div key={item} className="skeleton-field">
          <span className="skeleton-line skeleton-line-short" />
          <span className="skeleton-input" />
        </div>
      ))}
    </div>
  );
}

function staticItems(count: number, prefix: string): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`);
}
