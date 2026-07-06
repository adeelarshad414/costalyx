import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { ProblemDetailsFilter } from '../../src/common/problem-details.filter';

const tenantId = '11111111-1111-4111-8111-111111111111';

describe('Health and metrics endpoints', () => {
  let app: INestApplication;
  const originalSchedulerEnabled = process.env.COSTALYX_CLOUD_SCHEDULER_ENABLED;
  const originalSchedulerIngestionEnabled = process.env.COSTALYX_CLOUD_SCHEDULER_INGESTION_ENABLED;
  const originalSchedulerInterval = process.env.COSTALYX_CLOUD_SCHEDULER_INTERVAL_MS;
  const originalLiveProbes = process.env.COSTALYX_LIVE_CLOUD_PROBES;

  beforeAll(async () => {
    process.env.COSTALYX_CLOUD_SCHEDULER_ENABLED = 'enabled';
    process.env.COSTALYX_CLOUD_SCHEDULER_INGESTION_ENABLED = 'enabled';
    process.env.COSTALYX_CLOUD_SCHEDULER_INTERVAL_MS = '600000';
    delete process.env.COSTALYX_LIVE_CLOUD_PROBES;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true
      })
    );
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
  });

  afterAll(async () => {
    restoreEnv('COSTALYX_CLOUD_SCHEDULER_ENABLED', originalSchedulerEnabled);
    restoreEnv('COSTALYX_CLOUD_SCHEDULER_INGESTION_ENABLED', originalSchedulerIngestionEnabled);
    restoreEnv('COSTALYX_CLOUD_SCHEDULER_INTERVAL_MS', originalSchedulerInterval);
    restoreEnv('COSTALYX_LIVE_CLOUD_PROBES', originalLiveProbes);
    await app.close();
  });

  it('keeps liveness public while requiring Admin for operational metrics', async () => {
    await request(app.getHttpAdapter().getInstance()).get('/healthz').expect(200).expect({ status: 'ok' });
    await request(app.getHttpAdapter().getInstance()).get('/metrics').expect(401);
    await request(app.getHttpAdapter().getInstance()).get('/metrics').set('x-costalyx-role', 'viewer').expect(403);
  });

  it('exports sanitized Prometheus metrics for cloud connection readiness', async () => {
    const awsConnection = await request(app.getHttpAdapter().getInstance())
      .post('/api/v1/cloud-connections')
      .set('x-costalyx-role', 'admin')
      .set('x-costalyx-tenant-id', tenantId)
      .set('Idempotency-Key', 'health-metrics-aws-create')
      .send({
        provider: 'aws',
        displayName: 'AWS production payer',
        externalTenantId: '123456789012',
        accessMode: 'aws_assume_role',
        readOnlyPrincipal: 'arn:aws:iam::123456789012:role/CostalyxReadOnlyBilling',
        billingExportUri: 's3://customer-cur/costalyx/'
      })
      .expect(201);

    await request(app.getHttpAdapter().getInstance())
      .post(`/api/v1/cloud-connections/${awsConnection.body.id}/validation`)
      .set('x-costalyx-role', 'admin')
      .set('x-costalyx-tenant-id', tenantId)
      .set('Idempotency-Key', 'health-metrics-aws-validate')
      .expect(201);

    await request(app.getHttpAdapter().getInstance())
      .post('/api/v1/cloud-connections')
      .set('x-costalyx-role', 'admin')
      .set('x-costalyx-tenant-id', tenantId)
      .set('Idempotency-Key', 'health-metrics-gcp-create')
      .send({
        provider: 'gcp',
        displayName: 'GCP billing export',
        externalTenantId: 'billingAccounts/123456-ABCDEF-123456',
        accessMode: 'gcp_workload_identity',
        readOnlyPrincipal: 'projects/123456789/locations/global/workloadIdentityPools/costalyx/providers/billing',
        billingExportUri: 'bigquery://billing-project.billing_export.gcp_billing_export_v1'
      })
      .expect(201);

    const response = await request(app.getHttpAdapter().getInstance())
      .get('/metrics')
      .set('x-costalyx-role', 'admin')
      .expect(200)
      .expect('Content-Type', /text\/plain/);

    expect(response.text).toContain('# TYPE costalyx_build_info gauge');
    expect(response.text).toContain('costalyx_cloud_scheduler_enabled 1');
    expect(response.text).toContain('costalyx_cloud_scheduler_ingestion_enabled 1');
    expect(response.text).toContain('costalyx_cloud_scheduler_interval_ms 600000');
    expect(response.text).toContain(
      'costalyx_cloud_connections_total{provider="aws",status="ready_for_live_probe"} 1'
    );
    expect(response.text).toContain('costalyx_cloud_connections_total{provider="gcp",status="pending_validation"} 1');
    expect(response.text).toContain('costalyx_cloud_connection_tenants_total 1');
    expect(response.text).not.toContain(tenantId);
    expect(response.text).not.toContain('arn:aws');
    expect(response.text).not.toContain('billingAccounts/');
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
