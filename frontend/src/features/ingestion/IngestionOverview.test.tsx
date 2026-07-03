import { render, screen, waitFor } from '@testing-library/react';
import { IngestionOverview } from './IngestionOverview';
import type { CostalyxClient } from '../../api/client';
import { AuthProvider, type KeycloakAdapter } from '../../auth/AuthProvider';

function renderAsAdmin(ui: React.ReactElement) {
  const adapter: KeycloakAdapter = {
    token: 'token-1',
    tokenParsed: { sub: 'admin-user', realm_access: { roles: ['admin'] } },
    init: async () => true,
    login: async () => undefined,
    logout: async () => undefined,
    updateToken: async () => true
  };
  return render(<AuthProvider adapter={adapter}>{ui}</AuthProvider>);
}

describe('IngestionOverview', () => {
  it('renders populated cost data with mono-formatted money from the generated client wrapper', async () => {
    const client: CostalyxClient = {
      listCostRecords: async () => ({
        data: [
          {
            id: 'row-1',
            provider: 'aws',
            accountId: 'account-1',
            resourceId: 'i-aws-prod-001',
            serviceName: 'Amazon EC2',
            leaseType: 'on_demand',
            hourlyRateUsd: '0.04160000',
            usageHours: '10.0000',
            costTotalUsd: '0.41600000',
            isEstimate: false,
            validFrom: '2026-06-01T00:00:00.000Z'
          }
        ],
        meta: { total: 1, page: 1, pageSize: 25 }
      })
    };

    renderAsAdmin(<IngestionOverview client={client} />);

    expect(screen.getByText('Loading cost records')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('i-aws-prod-001')).toBeInTheDocument());
    expect(screen.getByText('0.41600000')).toHaveClass('font-mono-data');
  });

  it('renders a designed empty state when the API returns no cost records', async () => {
    const client: CostalyxClient = {
      listCostRecords: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } })
    };

    renderAsAdmin(<IngestionOverview client={client} />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'No cost records yet' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Run ingestion' })).toBeInTheDocument();
  });

  it('renders a designed error state when the API rejects', async () => {
    const client: CostalyxClient = {
      listCostRecords: async () => {
        throw new Error('Forbidden');
      }
    };

    renderAsAdmin(<IngestionOverview client={client} />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Could not load cost records' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
