import { render, screen } from '@testing-library/react';
import { ErrorState } from './ErrorState';

describe('ErrorState', () => {
  it('renders an in-page retry path instead of a raw toast-only failure', () => {
    render(<ErrorState title="Could not load costs" detail="Backend timed out" onRetry={() => undefined} />);

    expect(screen.getByRole('heading', { name: 'Could not load costs' })).toBeInTheDocument();
    expect(screen.getByText('Backend timed out')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
