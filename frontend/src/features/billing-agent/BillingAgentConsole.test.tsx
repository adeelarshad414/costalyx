import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { CostalyxClient } from '../../api/client';
import { AuthProvider, type KeycloakAdapter } from '../../auth/AuthProvider';
import { BillingAgentConsole } from './BillingAgentConsole';

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

const anomaly = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: '00000000-0000-4000-8000-000000000001',
  type: 'usage' as const,
  severity: 'medium' as const,
  status: 'open' as const,
  detectedAt: '2026-07-06T00:00:00.000Z',
  windowStart: '2026-07-01T00:00:00.000Z',
  windowEnd: '2026-07-06T00:00:00.000Z',
  evidence: {
    fingerprint: 'usage:row-1',
    costRecordIds: ['22222222-2222-4222-8222-222222222222'],
    pricingRows: [
      {
        costRecordId: '22222222-2222-4222-8222-222222222222',
        resourceId: 's3-usage-001',
        hourlyRateUsd: '0.01000000',
        usageHours: '50.0000',
        validFrom: '2026-07-06T00:00:00.000Z',
        validTo: null
      }
    ],
    metrics: { ratioPercent: '500.00' }
  },
  explanationMd: 'Usage reached 50.0000 hours, 500.00% of the trailing median 10.0000 hours.',
  assignedOwnerId: null
};

function createClient(overrides: Partial<CostalyxClient> = {}): CostalyxClient {
  return {
    listCostRecords: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
    getCostSummary: async () => ({
      totalCostUsd: '0.00000000',
      resourceCount: 0,
      untaggedCount: 0,
      inactiveCount: 0,
      isEstimate: false
    }),
    getCostExplorerFlow: async () => ({ nodes: [], links: [] }),
    createIngestionBatch: async () => {
      throw new Error('not expected');
    },
    exportCostRecords: async () => 'id,provider\n',
    listRoles: async () => ({ data: [] }),
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
    },
    listRecommendations: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
    updateRecommendation: async () => {
      throw new Error('not expected');
    },
    listRealizedSavings: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
    scanBillingAnomalies: async () => ({ created: [anomaly], totalOpen: 1 }),
    listAnomalies: async () => ({ data: [anomaly], meta: { total: 1, page: 1, pageSize: 50 } }),
    updateAnomalyStatus: async () => ({ ...anomaly, status: 'false_positive' }),
    getExecutiveSummary: async () => ({
      totalSpendUsd: '0.00000000',
      revenueBaselineUsd: '1000.00000000',
      spendAsRevenuePercent: '0.0000',
      budgetBaselineUsd: '100.00000000',
      budgetUsedPercent: '0.0000',
      trend: { direction: 'flat', deltaUsd: '0.00000000' },
      topMovers: []
    }),
    exportExecutiveSummaryPdf: async () => '%PDF-1.4',
    estimateTco: async () => ({
      aws: { monthlyCostUsd: '0.00000000', isEstimate: true, assumptions: [] },
      azure: { monthlyCostUsd: '0.00000000', isEstimate: true, assumptions: [] },
      gcp: { monthlyCostUsd: '0.00000000', isEstimate: true, assumptions: [] },
      tolerancePercent: '0.0000'
    }),
    listReports: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
    runReport: async () => ({ reportId: 'report-1', generatedAt: '2026-07-04T00:00:00.000Z', rows: [] }),
    listViews: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
    createView: async () => {
      throw new Error('not expected');
    },
    ...overrides
  };
}

describe('BillingAgentConsole', () => {
  it('shows open anomalies to viewers without mutation actions', async () => {
    renderWithRole(<BillingAgentConsole client={createClient()} />, ['viewer']);

    await waitFor(() => expect(screen.getByText('Usage')).toBeInTheDocument());
    expect(screen.getByText(/Usage reached 50.0000 hours/)).toBeInTheDocument();
    expect(screen.getByText('2026-07-06')).toHaveClass('font-mono-data');
    expect(screen.queryByRole('button', { name: /Run scan/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /False positive/ })).not.toBeInTheDocument();
  });

  it('lets analysts scan and mark anomalies as false positive with a reason code', async () => {
    const user = userEvent.setup();
    const scanBillingAnomalies = vi.fn(async () => ({ created: [anomaly], totalOpen: 1 }));
    const updateAnomalyStatus = vi.fn(async () => ({ ...anomaly, status: 'false_positive' as const }));
    const listAnomalies = vi
      .fn()
      .mockResolvedValueOnce({ data: [anomaly], meta: { total: 1, page: 1, pageSize: 50 } })
      .mockResolvedValueOnce({ data: [anomaly], meta: { total: 1, page: 1, pageSize: 50 } })
      .mockResolvedValueOnce({ data: [], meta: { total: 0, page: 1, pageSize: 50 } });

    renderWithRole(
      <BillingAgentConsole client={createClient({ scanBillingAnomalies, updateAnomalyStatus, listAnomalies })} />,
      ['analyst']
    );

    await user.click(await screen.findByRole('button', { name: /Run scan/ }));
    await user.selectOptions(screen.getByLabelText('False positive reason for Usage'), 'planned_change');
    await user.click(screen.getByRole('button', { name: /False positive/ }));

    expect(scanBillingAnomalies).toHaveBeenCalledTimes(1);
    expect(updateAnomalyStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: anomaly.id, status: 'false_positive', falsePositiveReason: 'planned_change' })
    );
    expect(await screen.findByRole('heading', { name: 'No open anomalies' })).toBeInTheDocument();
  });

  it('renders empty and error states', async () => {
    const { rerender } = renderWithRole(
      <BillingAgentConsole
        client={createClient({ listAnomalies: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 50 } }) })}
      />,
      ['viewer']
    );

    expect(await screen.findByRole('heading', { name: 'No open anomalies' })).toBeInTheDocument();

    rerender(
      <AuthProvider
        adapter={{
          token: 'token-1',
          tokenParsed: { sub: 'user-1', realm_access: { roles: ['viewer'] } },
          init: async () => true,
          login: async () => undefined,
          logout: async () => undefined,
          updateToken: async () => true
        }}
      >
        <BillingAgentConsole
          client={createClient({
            listAnomalies: async () => {
              throw new Error('Anomaly service unavailable');
            }
          })}
        />
      </AuthProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Could not load anomalies' })).toBeInTheDocument();
    expect(screen.getByText('Anomaly service unavailable')).toBeInTheDocument();
  });
});
