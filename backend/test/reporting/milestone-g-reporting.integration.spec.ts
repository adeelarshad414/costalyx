import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { ProblemDetailsFilter } from '../../src/common/problem-details.filter';
import type { Role } from '../../src/security/roles';
import { AUTH_TOKEN_VERIFIER, type AuthenticatedUser, type TokenVerifier } from '../../src/security/token-verifier';

async function createApp(): Promise<INestApplication> {
  const roleVerifier: TokenVerifier = {
    verifyBearerToken: jest.fn(async (token: string): Promise<AuthenticatedUser> => {
      const role: Role = token.includes('admin') ? 'admin' : token.includes('analyst') ? 'analyst' : 'viewer';
      return { subject: `${role}-user`, role };
    })
  };
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule]
  })
    .overrideProvider(AUTH_TOKEN_VERIFIER)
    .useValue(roleVerifier)
    .compile();

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

describe('Milestone G reporting and saved views API', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await createApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('ships canned reports and applies an Admin-created Viewer view to the whole API session', async () => {
    await request(app.getHttpAdapter().getInstance())
      .post('/api/v1/ingestion/batches')
      .set('Authorization', 'Bearer admin-token')
      .set('Idempotency-Key', 'milestone-g-aws-ingestion')
      .send({ provider: 'aws', sourceUri: 'backend/test/fixtures/aws-cur-sample.csv' })
      .expect(202);
    await request(app.getHttpAdapter().getInstance())
      .post('/api/v1/ingestion/batches')
      .set('Authorization', 'Bearer admin-token')
      .set('Idempotency-Key', 'milestone-g-azure-ingestion')
      .send({ provider: 'azure', sourceUri: 'backend/test/fixtures/azure-cost-export-sample.csv' })
      .expect(202);

    const reports = await request(app.getHttpAdapter().getInstance())
      .get('/api/v1/reports?page=1&pageSize=10')
      .set('Authorization', 'Bearer viewer-token')
      .expect(200);
    expect(reports.body.data.map((report: { category: string }) => report.category)).toEqual(
      expect.arrayContaining(['cost', 'cost_summary', 'invoices', 'utilization', 'underutilization'])
    );

    const view = await request(app.getHttpAdapter().getInstance())
      .post('/api/v1/views')
      .set('Authorization', 'Bearer admin-token')
      .set('Idempotency-Key', 'milestone-g-view-create')
      .send({
        name: 'AWS Viewer Scope',
        filterJson: { provider: 'aws' },
        sharedRoleScope: ['viewer']
      })
      .expect(201);
    const viewId = view.body.id;

    await request(app.getHttpAdapter().getInstance())
      .get('/api/v1/views?page=1&pageSize=25')
      .set('Authorization', 'Bearer viewer-token')
      .expect(200)
      .expect(({ body }) => expect(body.data[0]).toMatchObject({ id: viewId, name: 'AWS Viewer Scope' }));

    await request(app.getHttpAdapter().getInstance())
      .get('/api/v1/cost-records/summary')
      .set('Authorization', 'Bearer viewer-token')
      .expect(200)
      .expect(({ body }) => expect(body.totalCostUsd).toBe('50.56400000'));

    await request(app.getHttpAdapter().getInstance())
      .get('/api/v1/cost-records/summary')
      .set('Authorization', 'Bearer viewer-token')
      .set('X-Costalyx-View-Id', viewId)
      .expect(200)
      .expect(({ body }) => expect(body.totalCostUsd).toBe('50.15600000'));

    await request(app.getHttpAdapter().getInstance())
      .get('/api/v1/cost-records?provider=azure')
      .set('Authorization', 'Bearer viewer-token')
      .set('X-Costalyx-View-Id', viewId)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.length).toBeGreaterThan(0);
        expect(body.data.every((row: { provider: string }) => row.provider === 'aws')).toBe(true);
      });

    const costReport = reports.body.data.find((report: { category: string }) => report.category === 'cost');
    await request(app.getHttpAdapter().getInstance())
      .get(`/api/v1/reports/${costReport.id}/run`)
      .set('Authorization', 'Bearer viewer-token')
      .set('X-Costalyx-View-Id', viewId)
      .expect(200)
      .expect(({ body }) => {
        expect(body.rows.length).toBeGreaterThan(0);
        expect(body.rows.every((row: { provider?: string }) => row.provider === 'aws')).toBe(true);
      });
  });
});
