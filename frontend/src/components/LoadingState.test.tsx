import { render, screen } from '@testing-library/react';
import { LoadingState } from './LoadingState';

describe('LoadingState', () => {
  it('renders a busy status with a shape-matched table skeleton', () => {
    render(<LoadingState title="Loading cost records" variant="table" />);

    expect(screen.getByRole('status', { name: 'Loading cost records' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading cost records')).toBeInTheDocument();
    expect(screen.getByTestId('loading-skeleton')).toHaveAttribute('data-variant', 'table');
    expect(screen.getAllByTestId('skeleton-table-row')).toHaveLength(5);
  });
});
