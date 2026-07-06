import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider, type KeycloakAdapter } from './AuthProvider';
import { PermissionGate } from './PermissionGate';

function renderWithRole(role: string, ui: React.ReactElement) {
  const adapter: KeycloakAdapter = {
    token: 'token-1',
    tokenParsed: { sub: 'user-1', realm_access: { roles: [role] } },
    init: vi.fn().mockResolvedValue(true),
    login: vi.fn(),
    logout: vi.fn(),
    updateToken: vi.fn().mockResolvedValue(true)
  };

  return render(<AuthProvider adapter={adapter}>{ui}</AuthProvider>);
}

describe('PermissionGate', () => {
  it('hides privileged actions for an insufficient role', async () => {
    renderWithRole(
      'viewer',
      <PermissionGate requiredRole="admin" mode="hide">
        <button type="button">Run ingestion</button>
      </PermissionGate>
    );

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Run ingestion' })).not.toBeInTheDocument());
  });

  it('renders an in-page unauthorized state when a protected panel is denied', async () => {
    renderWithRole(
      'viewer',
      <PermissionGate requiredRole="admin" mode="error">
        <button type="button">Rotate credential</button>
      </PermissionGate>
    );

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Access restricted' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Rotate credential' })).not.toBeInTheDocument();
  });
});
