import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider, type KeycloakAdapter } from '../../auth/AuthProvider';
import { UserPreferencesProvider } from '../../preferences/UserPreferences';
import { SettingsConsole } from './SettingsConsole';

function renderSettings(role = 'admin') {
  const adapter: KeycloakAdapter = {
    token: 'token-1',
    tokenParsed: { sub: 'user-1', realm_access: { roles: [role] } },
    init: vi.fn().mockResolvedValue(true),
    login: vi.fn(),
    logout: vi.fn(),
    updateToken: vi.fn().mockResolvedValue(true)
  };

  return render(
    <UserPreferencesProvider>
      <AuthProvider adapter={adapter}>
        <SettingsConsole />
      </AuthProvider>
    </UserPreferencesProvider>
  );
}

describe('SettingsConsole', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.dataset.density = '';
  });

  it('persists theme and density preferences without exposing raw auth details', async () => {
    const user = userEvent.setup();
    renderSettings('analyst');

    await waitFor(() => expect(screen.getByRole('region', { name: 'Settings' })).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    for (const roleValue of screen.getAllByText('analyst')) {
      expect(roleValue).toHaveClass('font-mono-data');
    }

    await user.click(screen.getByRole('button', { name: 'Light' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('costalyx-theme')).toBe('light');

    await user.click(screen.getByRole('button', { name: 'Compact' }));
    expect(document.documentElement.dataset.density).toBe('compact');
    expect(localStorage.getItem('costalyx-density')).toBe('compact');

    expect(screen.getByRole('group', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Density' })).toBeInTheDocument();
    expect(screen.queryByText(/token|refresh|403|stack|authorization/i)).not.toBeInTheDocument();
  });
});
