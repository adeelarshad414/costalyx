import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { CostalyxClient } from '../../api/client';
import { AuthProvider, type KeycloakAdapter } from '../../auth/AuthProvider';
import { AllocationConsole } from './AllocationConsole';

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

describe('AllocationConsole', () => {
  it('shows dimensions to viewers while hiding tag edit controls', async () => {
    const client: CostalyxClient = {
      listCostRecords: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
      createIngestionBatch: async () => {
        throw new Error('not expected');
      },
      exportCostRecords: async () => 'id,provider\n',
      listRoles: async () => ({ data: [] }),
      listDimensions: async () => ({
        data: [{ id: 'dimension-1', orgId: 'org-1', name: 'Team', createdBy: 'actor-1', createdAt: '2026-07-03T00:00:00.000Z' }],
        meta: { total: 1, page: 1, pageSize: 25 }
      }),
      createDimension: async () => {
        throw new Error('not expected');
      },
      createDimensionMapping: async () => {
        throw new Error('not expected');
      },
      listResourceTags: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
      upsertResourceTag: async () => {
        throw new Error('not expected');
      },
      getCostSummary: async () => ({
        totalCostUsd: '0.00000000',
        resourceCount: 0,
        untaggedCount: 3,
        inactiveCount: 0,
        isEstimate: false
      }),
      getCostExplorerFlow: async () => ({ nodes: [], links: [] }),
      listRecommendations: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
      updateRecommendation: async () => {
        throw new Error('not expected');
      },
      listRealizedSavings: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } })
    };

    renderWithRole(<AllocationConsole client={client} />, ['viewer']);

    await waitFor(() => expect(screen.getByText('Team')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Create dimension' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retag resource' })).not.toBeInTheDocument();
  });

  it('lets analysts create dimensions, mappings, and manual resource tags through the generated client wrapper', async () => {
    const user = userEvent.setup();
    const createDimension = vi.fn(async () => ({
      id: 'dimension-1',
      orgId: 'org-1',
      name: 'Team',
      createdBy: 'actor-1',
      createdAt: '2026-07-03T00:00:00.000Z'
    }));
    const createDimensionMapping = vi.fn(async () => ({
      id: 'mapping-1',
      dimensionId: 'dimension-1',
      tagKey: 'owner',
      tagValuePattern: 'platform'
    }));
    const upsertResourceTag = vi.fn(async () => ({
      resourceId: 'i-aws-prod-001',
      tagKey: 'owner',
      tagValue: 'platform',
      source: 'manual' as const
    }));
    const client: CostalyxClient = {
      listCostRecords: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
      createIngestionBatch: async () => {
        throw new Error('not expected');
      },
      exportCostRecords: async () => 'id,provider\n',
      listRoles: async () => ({ data: [] }),
      listDimensions: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
      createDimension,
      createDimensionMapping,
      listResourceTags: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
      upsertResourceTag,
      getCostSummary: async () => ({
        totalCostUsd: '0.41600000',
        resourceCount: 1,
        untaggedCount: 2,
        inactiveCount: 0,
        isEstimate: false
      }),
      getCostExplorerFlow: async () => ({ nodes: [], links: [] }),
      listRecommendations: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
      updateRecommendation: async () => {
        throw new Error('not expected');
      },
      listRealizedSavings: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } })
    };

    renderWithRole(<AllocationConsole client={client} />, ['analyst']);

    await user.click(await screen.findByRole('button', { name: 'Create dimension' }));
    await user.click(screen.getByRole('button', { name: 'Retag resource' }));

    expect(createDimension).toHaveBeenCalledWith(expect.objectContaining({ name: 'Team' }));
    expect(createDimensionMapping).toHaveBeenCalledWith(
      expect.objectContaining({ dimensionId: 'dimension-1', tagKey: 'owner', tagValuePattern: 'platform' })
    );
    expect(upsertResourceTag).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: 'i-aws-prod-001',
        tagKey: 'owner',
        tagValue: 'platform',
        source: 'manual'
      })
    );
    expect(await screen.findByText('0.41600000')).toBeInTheDocument();
  });
});
