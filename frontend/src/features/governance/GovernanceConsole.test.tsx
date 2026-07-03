import { render, screen, waitFor } from '@testing-library/react';
import type { CostalyxClient } from '../../api/client';
import { AuthProvider, type KeycloakAdapter } from '../../auth/AuthProvider';
import { GovernanceConsole } from './GovernanceConsole';

function renderWithRole(ui: React.ReactElement, roles: string[]) {
  const adapter: KeycloakAdapter = {
    token: 'token-1',
    tokenParsed: { sub: 'user-1', realm_access: { roles } },
    init: async () => true,
    login: async () => undefined,
    logout: async () => undefined,
    updateToken: async () => true
  };
  return render(<AuthProvider adapter={adapter}>{ui}</AuthProvider>);
}

const allocationClientMethods = {
  getCostSummary: async () => ({
    totalCostUsd: '0.00000000',
    resourceCount: 0,
    untaggedCount: 0,
    inactiveCount: 0,
    isEstimate: false
  }),
  listDimensions: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
  createDimension: async () => {
    throw new Error('not expected');
  },
  createDimensionMapping: async () => {
    throw new Error('not expected');
  },
  listResourceTags: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
  upsertResourceTag: async () => {
    throw new Error('not expected');
  }
} satisfies Pick<
  CostalyxClient,
  | 'getCostSummary'
  | 'listDimensions'
  | 'createDimension'
  | 'createDimensionMapping'
  | 'listResourceTags'
  | 'upsertResourceTag'
>;

describe('GovernanceConsole', () => {
  it('hides admin-only governance actions for a viewer while keeping export available', async () => {
    const client: CostalyxClient = {
      ...allocationClientMethods,
      listCostRecords: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
      createIngestionBatch: async () => {
        throw new Error('not expected');
      },
      listRoles: async () => ({ data: [] }),
      exportCostRecords: async () => 'id,provider\n'
    };

    renderWithRole(<GovernanceConsole client={client} />, ['viewer']);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Register credential' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Fixed roles' })).not.toBeInTheDocument();
  });

  it('loads fixed roles and shows admin-only governance actions for an admin', async () => {
    const client: CostalyxClient = {
      ...allocationClientMethods,
      listCostRecords: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
      createIngestionBatch: async () => {
        throw new Error('not expected');
      },
      listRoles: async () => ({
        data: [
          { name: 'viewer', fixed: true },
          { name: 'analyst', fixed: true },
          { name: 'admin', fixed: true }
        ]
      }),
      exportCostRecords: async () => 'id,provider\n'
    };

    renderWithRole(<GovernanceConsole client={client} />, ['admin']);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Fixed roles' })).toBeInTheDocument());
    expect(screen.getByText('viewer')).toBeInTheDocument();
    expect(screen.getByText('analyst')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register credential' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account group' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invite user' })).toBeInTheDocument();
  });
});
