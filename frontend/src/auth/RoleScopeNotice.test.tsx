import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider, type KeycloakAdapter } from './AuthProvider';
import { RoleScopeNotice } from './RoleScopeNotice';

function renderWithRole(role: string) {
  const adapter: KeycloakAdapter = {
    token: 'token-1',
    tokenParsed: { sub: 'user-1', realm_access: { roles: [role] } },
    init: vi.fn().mockResolvedValue(true),
    login: vi.fn(),
    logout: vi.fn(),
    updateToken: vi.fn().mockResolvedValue(true)
  };

  return render(
    <AuthProvider adapter={adapter}>
      <RoleScopeNotice />
    </AuthProvider>
  );
}

describe('RoleScopeNotice', () => {
  it('explains a viewer session without surfacing raw authorization errors', async () => {
    renderWithRole('viewer');

    await waitFor(() => expect(screen.getByRole('region', { name: 'Access scope' })).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Viewer access' })).toBeInTheDocument();
    expect(screen.getByText('Read-only mode')).toBeInTheDocument();
    expect(screen.getByText(/You can inspect costs, exports, statements, and saved views/i)).toBeInTheDocument();
    expect(screen.getByText(/Analyst and admin actions stay hidden/i)).toBeInTheDocument();
    expect(screen.queryByText(/403|unauthorized|forbidden|stack|token/i)).not.toBeInTheDocument();
  });

  it('does not add an access warning for admins', async () => {
    renderWithRole('admin');

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Access scope' })).not.toBeInTheDocument());
  });
});
