import { render, screen, waitFor } from '@testing-library/react';
import type { CostalyxClient } from '../../api/client';
import { AuthProvider, type KeycloakAdapter } from '../../auth/AuthProvider';
import { OperatorReadinessConsole } from './OperatorReadinessConsole';

type OperatorReadiness = Awaited<ReturnType<NonNullable<CostalyxClient['getOperatorReadiness']>>>;

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

const readiness: OperatorReadiness = {
  status: 'blocked',
  generatedAt: '2026-07-07T00:00:00.000Z',
  environment: {
    appEnv: 'local',
    nodeEnv: 'development',
    useMocks: false,
    liveCloudProbes: false
  },
  checks: [
    {
      id: 'use-mocks',
      label: 'USE_MOCKS disabled',
      category: 'runtime',
      status: 'ready',
      detail: 'Runtime is not gated behind frontend mocks.'
    },
    {
      id: 'live-cloud-probes',
      label: 'Live cloud probes',
      category: 'cloud',
      status: 'blocked',
      detail: 'Live provider probes are disabled for this runtime.',
      remediation: 'Enable COSTALYX_LIVE_CLOUD_PROBES after broker credentials are configured.'
    },
    {
      id: 'aws-broker-principal',
      label: 'AWS broker principal',
      category: 'cloud',
      status: 'ready',
      detail: 'Broker principal is configured without exposing its ARN.'
    }
  ],
  blockers: ['Enable COSTALYX_LIVE_CLOUD_PROBES only after broker credentials are present.'],
  nextActions: [
    {
      label: 'Run live readiness probe',
      command: 'npm run probe:live-readiness',
      detail: 'Verifies the configured broker and provider references before real customer-cloud validation.'
    }
  ]
};

describe('OperatorReadinessConsole', () => {
  it('shows sanitized go-live blockers and operator next actions for admins', async () => {
    const client = {
      getOperatorReadiness: async () => readiness
    } as unknown as CostalyxClient;

    renderWithRole(<OperatorReadinessConsole client={client} />, ['admin']);

    expect(await screen.findByRole('region', { name: 'Operational readiness' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Operational readiness' })).toBeInTheDocument();
    expect(screen.getAllByText('blocked')[0]).toHaveClass('status-danger');
    expect(screen.getByText('USE_MOCKS disabled')).toBeInTheDocument();
    expect(screen.getByText('Live cloud probes')).toBeInTheDocument();
    expect(screen.getByText('AWS broker principal')).toBeInTheDocument();
    expect(screen.getByText('npm run probe:live-readiness')).toHaveClass('font-mono-data');
    expect(screen.getByText('Enable COSTALYX_LIVE_CLOUD_PROBES only after broker credentials are present.')).toBeInTheDocument();

    await waitFor(() => expect(screen.queryByText(/super-secret|arn:aws|vault-root-token|auth\.example/i)).not.toBeInTheDocument());
  });

  it('renders a user-facing error state without raw API details', async () => {
    const client = {
      getOperatorReadiness: async () => {
        throw new Error('HTTP 500 {"detail":"vault-root-token-super-secret","stack":"at readiness"}');
      }
    } as unknown as CostalyxClient;

    renderWithRole(<OperatorReadinessConsole client={client} />, ['admin']);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Load operator readiness failed. Try again or contact an administrator if this keeps happening.'
    );
    expect(screen.queryByText(/vault-root-token|HTTP 500|stack/)).not.toBeInTheDocument();
  });
});
