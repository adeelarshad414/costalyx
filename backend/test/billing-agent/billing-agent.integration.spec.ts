import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { ProblemDetailsFilter } from '../../src/common/problem-details.filter';
import { CostModelService } from '../../src/cost-model/cost-model.service';
import { DEFAULT_TENANT_ID } from '../../src/security/token-verifier';
import { goldenAnomalyRecords } from './billing-agent.fixtures';

async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule]
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );
  app.useGlobalFilters(new ProblemDetailsFilter());
  await app.init();
  return app;
}

describe('Milestone I billing-agent anomaly API', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await createApp();
    const costModel = app.get(CostModelService);
    await costModel.saveIngestion({
      tenantId: DEFAULT_TENANT_ID,
      provider: 'aws',
      sourceUri: 'billing-agent-api-fixture',
      idempotencyKey: 'billing-agent-api-fixture',
      rows: goldenAnomalyRecords()
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('enforces RBAC while exposing scan, list, and false-positive learning endpoints', async () => {
    await request(app.getHttpAdapter().getInstance())
      .post('/api/v1/billing-agent/anomaly-scan')
      .set('x-costalyx-role', 'viewer')
      .expect(403);

    const scan = await request(app.getHttpAdapter().getInstance())
      .post('/api/v1/billing-agent/anomaly-scan')
      .set('x-costalyx-role', 'analyst')
      .expect(200);
    expect(scan.body.created).toHaveLength(4);
    expect(scan.body.totalOpen).toBe(4);

    const listed = await request(app.getHttpAdapter().getInstance())
      .get('/api/v1/anomalies?status=open')
      .set('x-costalyx-role', 'viewer')
      .expect(200);
    const usage = listed.body.data.find((anomaly: { type: string }) => anomaly.type === 'usage');

    await request(app.getHttpAdapter().getInstance())
      .patch(`/api/v1/anomalies/${usage.id}`)
      .set('x-costalyx-role', 'analyst')
      .send({ status: 'false_positive', falsePositiveReason: 'seasonal' })
      .expect(400);

    const updated = await request(app.getHttpAdapter().getInstance())
      .patch(`/api/v1/anomalies/${usage.id}`)
      .set('x-costalyx-role', 'analyst')
      .set('Idempotency-Key', 'usage-false-positive-api')
      .send({ status: 'false_positive', falsePositiveReason: 'seasonal' })
      .expect(200);

    expect(updated.body.status).toBe('false_positive');

    const openUsage = await request(app.getHttpAdapter().getInstance())
      .get('/api/v1/anomalies?status=open&type=usage')
      .set('x-costalyx-role', 'viewer')
      .expect(200);
    expect(openUsage.body.meta.total).toBe(0);
  });
});
