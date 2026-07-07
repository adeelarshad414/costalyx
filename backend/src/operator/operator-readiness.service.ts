import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  OperatorNextAction,
  OperatorReadiness,
  OperatorReadinessCheck,
  OperatorReadinessStatus
} from './operator-readiness.types';

@Injectable()
export class OperatorReadinessService {
  constructor(private readonly config: ConfigService) {}

  getReadiness(now: () => Date = () => new Date()): OperatorReadiness {
    const appEnv = normalizeEnvironmentName(this.config.get<string>('APP_ENV') ?? process.env.APP_ENV ?? 'local');
    const nodeEnv = normalizeEnvironmentName(this.config.get<string>('NODE_ENV') ?? process.env.NODE_ENV ?? 'development');
    const useMocks = this.config.get<string>('USE_MOCKS') === 'true';
    const liveCloudProbes = this.config.get<string>('COSTALYX_LIVE_CLOUD_PROBES') === 'enabled';

    const checks: OperatorReadinessCheck[] = [
      {
        id: 'use-mocks',
        label: 'USE_MOCKS disabled',
        category: 'runtime',
        status: useMocks ? 'blocked' : 'ready',
        detail: useMocks
          ? 'Frontend mock mode is enabled. Production features must run against the real API.'
          : 'Runtime is not gated behind frontend mocks.',
        remediation: useMocks ? 'Set USE_MOCKS=false before any production or customer-cloud validation.' : undefined
      },
      configuredCheck('database-url', 'Postgres connection', 'supporting-service', 'DATABASE_URL'),
      configuredCheck('keycloak-issuer', 'Keycloak issuer', 'supporting-service', 'KEYCLOAK_ISSUER_URL'),
      configuredCheck('vault-address', 'Vault address', 'supporting-service', 'VAULT_ADDR'),
      configuredCheck('redpanda-brokers', 'Redpanda brokers', 'supporting-service', 'REDPANDA_BROKERS'),
      configuredCheck('smtp-relay', 'SMTP relay', 'supporting-service', 'SMTP_HOST'),
      {
        id: 'aws-broker-principal',
        label: 'AWS broker principal',
        category: 'cloud',
        status: this.hasConfigured('COSTALYX_AWS_BROKER_PRINCIPAL_ARN') ? 'ready' : 'blocked',
        detail: this.hasConfigured('COSTALYX_AWS_BROKER_PRINCIPAL_ARN')
          ? 'Broker principal is configured without exposing its ARN.'
          : 'Costalyx needs a broker IAM principal before customers can trust a read-only AWS role.',
        remediation: this.hasConfigured('COSTALYX_AWS_BROKER_PRINCIPAL_ARN')
          ? undefined
          : 'Configure COSTALYX_AWS_BROKER_PRINCIPAL_ARN from deployment config.'
      },
      {
        id: 'live-cloud-probes',
        label: 'Live cloud probes',
        category: 'cloud',
        status: liveCloudProbes ? 'ready' : 'blocked',
        detail: liveCloudProbes
          ? 'Live provider probes are enabled for this runtime.'
          : 'Live provider probes are disabled for this runtime.',
        remediation: liveCloudProbes
          ? undefined
          : 'Enable COSTALYX_LIVE_CLOUD_PROBES only after broker credentials are present.'
      }
    ];

    const blockers = checks
      .filter((check) => check.status === 'blocked')
      .map((check) => check.remediation ?? `${check.label} requires attention.`);

    return {
      status: summarizeStatus(checks),
      generatedAt: now().toISOString(),
      environment: {
        appEnv,
        nodeEnv,
        useMocks,
        liveCloudProbes
      },
      checks,
      blockers,
      nextActions: buildNextActions(blockers.length > 0)
    };
  }

  private hasConfigured(key: string): boolean {
    const value = this.config.get<string>(key);
    return typeof value === 'string' && value.trim().length > 0;
  }
}

function configuredCheck(
  id: string,
  label: string,
  category: OperatorReadinessCheck['category'],
  envKey: string
): OperatorReadinessCheck {
  const configured = typeof process.env[envKey] === 'string' && process.env[envKey].trim().length > 0;
  return {
    id,
    label,
    category,
    status: configured ? 'ready' : 'attention',
    detail: configured
      ? `${label} is configured; exact runtime values are intentionally hidden.`
      : `${label} is not configured in this runtime.`,
    remediation: configured ? undefined : `Configure ${envKey} before a production go-live check.`
  };
}

function summarizeStatus(checks: OperatorReadinessCheck[]): OperatorReadinessStatus {
  if (checks.some((check) => check.status === 'blocked')) {
    return 'blocked';
  }
  if (checks.some((check) => check.status === 'attention')) {
    return 'attention';
  }
  return 'ready';
}

function buildNextActions(hasBlockers: boolean): OperatorNextAction[] {
  return [
    {
      label: 'Run demo seed',
      command: 'npm run seed:demo',
      detail: 'Refreshes deterministic dummy data before handing the UI to testers.'
    },
    {
      label: 'Run live readiness probe',
      command: 'npm run probe:live-readiness',
      detail: 'Verifies configured broker and provider references before real customer-cloud validation.'
    },
    {
      label: hasBlockers ? 'Clear production blockers' : 'Proceed to customer cloud onboarding',
      detail: hasBlockers
        ? 'Resolve every blocker listed here before validating real AWS, Azure, or GCP accounts.'
        : 'Use Cloud portfolio onboarding to generate read-only customer account instructions.'
    }
  ];
}

function normalizeEnvironmentName(value: string): string {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : 'local';
}
