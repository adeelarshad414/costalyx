import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from './ThemeToggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = 'dark';
  });

  it('makes light mode reachable and persists the selected theme', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    const toggle = screen.getByRole('button', { name: 'Switch to light theme' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await user.click(toggle);

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('costalyx-theme')).toBe('light');
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toHaveAttribute('aria-pressed', 'true');
  });
});
