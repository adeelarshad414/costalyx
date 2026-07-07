import { Controller, Get, Header, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GovernanceService } from './governance/governance.service';
import type { CloudConnection, CloudConnectionStatus } from './governance/governance.types';
import { Public, RequiredRole } from './security/roles.decorator';

@Controller()
export class HealthController {
  constructor(
    private readonly governance: GovernanceService,
    private readonly config: ConfigService
  ) {}

  @Public()
  @Get('healthz')
  getHealthz() {
    return { status: 'ok' };
  }

  @Public()
  @Get('health/live')
  getLive() {
    return { status: 'ok' };
  }

  @Public()
  @Get('health/ready')
  async getReady() {
    try {
      await this.governance.listCloudConnectionsForScheduler();
      return {
        status: 'ready',
        checks: [{ name: 'governance-repository', status: 'ok' }]
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        checks: [{ name: 'governance-repository', status: 'failed' }]
      });
    }
  }

  @RequiredRole('admin')
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    const connections = await this.governance.listCloudConnectionsForScheduler();
    return buildPrometheusMetrics(connections, {
      schedulerEnabled: this.config.get<string>('COSTALYX_CLOUD_SCHEDULER_ENABLED') === 'enabled',
      schedulerIngestionEnabled: this.config.get<string>('COSTALYX_CLOUD_SCHEDULER_INGESTION_ENABLED') === 'enabled',
      schedulerIntervalMs: Number(this.config.get<string>('COSTALYX_CLOUD_SCHEDULER_INTERVAL_MS') ?? 900000)
    });
  }
}

export interface MetricsRuntimeOptions {
  schedulerEnabled: boolean;
  schedulerIngestionEnabled: boolean;
  schedulerIntervalMs: number;
}

const providers = ['aws', 'azure', 'gcp'] as const;
const statuses: CloudConnectionStatus[] = ['pending_validation', 'ready_for_live_probe', 'validated', 'validation_failed'];

export function buildPrometheusMetrics(
  connections: CloudConnection[],
  options: MetricsRuntimeOptions,
  now: () => number = () => Date.now()
): string {
  const memory = process.memoryUsage();
  const lines = [
    '# HELP costalyx_build_info Costalyx build information.',
    '# TYPE costalyx_build_info gauge',
    'costalyx_build_info{version="0.1.0"} 1',
    '# HELP costalyx_process_uptime_seconds Node.js process uptime in seconds.',
    '# TYPE costalyx_process_uptime_seconds gauge',
    `costalyx_process_uptime_seconds ${(process.uptime()).toFixed(3)}`,
    '# HELP costalyx_nodejs_heap_used_bytes Node.js heap used in bytes.',
    '# TYPE costalyx_nodejs_heap_used_bytes gauge',
    `costalyx_nodejs_heap_used_bytes ${memory.heapUsed}`,
    '# HELP costalyx_metrics_generated_timestamp_seconds Unix timestamp when these metrics were generated.',
    '# TYPE costalyx_metrics_generated_timestamp_seconds gauge',
    `costalyx_metrics_generated_timestamp_seconds ${(now() / 1000).toFixed(3)}`,
    '# HELP costalyx_cloud_scheduler_enabled Whether the cloud scheduler worker is enabled in this process config.',
    '# TYPE costalyx_cloud_scheduler_enabled gauge',
    `costalyx_cloud_scheduler_enabled ${options.schedulerEnabled ? 1 : 0}`,
    '# HELP costalyx_cloud_scheduler_ingestion_enabled Whether scheduled provider-native ingestion is enabled.',
    '# TYPE costalyx_cloud_scheduler_ingestion_enabled gauge',
    `costalyx_cloud_scheduler_ingestion_enabled ${options.schedulerIngestionEnabled ? 1 : 0}`,
    '# HELP costalyx_cloud_scheduler_interval_ms Configured scheduler interval in milliseconds.',
    '# TYPE costalyx_cloud_scheduler_interval_ms gauge',
    `costalyx_cloud_scheduler_interval_ms ${Number.isFinite(options.schedulerIntervalMs) ? options.schedulerIntervalMs : 900000}`,
    '# HELP costalyx_cloud_connections_total Cloud connections by provider and validation status.',
    '# TYPE costalyx_cloud_connections_total gauge'
  ];

  for (const provider of providers) {
    for (const status of statuses) {
      lines.push(
        `costalyx_cloud_connections_total{provider="${provider}",status="${status}"} ${countConnections(connections, provider, status)}`
      );
    }
  }
  lines.push(
    '# HELP costalyx_cloud_connection_tenants_total Number of tenants with at least one cloud connection.',
    '# TYPE costalyx_cloud_connection_tenants_total gauge',
    `costalyx_cloud_connection_tenants_total ${new Set(connections.map((connection) => connection.tenantId)).size}`
  );

  return `${lines.join('\n')}\n`;
}

function countConnections(
  connections: CloudConnection[],
  provider: CloudConnection['provider'],
  status: CloudConnectionStatus
): number {
  return connections.filter((connection) => connection.provider === provider && connection.status === status).length;
}
