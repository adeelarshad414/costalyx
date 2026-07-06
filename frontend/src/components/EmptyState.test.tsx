import { render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders a clear message and primary action for zero-data screens', () => {
    render(<EmptyState title="No cost records yet" actionLabel="Run ingestion" />);

    expect(screen.getByRole('heading', { name: 'No cost records yet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run ingestion' })).toBeInTheDocument();
  });
});
