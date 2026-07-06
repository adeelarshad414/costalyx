import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { ProblemDetailsFilter } from '../../src/common/problem-details.filter';
import type { Role } from '../../src/security/roles';
import { AUTH_TOKEN_VERIFIER, DEFAULT_TENANT_ID, type AuthenticatedUser, type TokenVerifier } from '../../src/security/token-verifier';

async function createApp(): Promise<INestApplication> {
  const roleVerifier: TokenVerifier = {
    verifyBearerToken: jest.fn(async (token: string): Promise<AuthenticatedUser> => {
      const role: Role = token.includes('admin') ? 'admin' : token.includes('analyst') ? 'analyst' : 'viewer';
      return { subject: `${role}-user`, role, tenantId: DEFAULT_TENANT_ID };
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

describe('Milestone D insights surfaces', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await createApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns authenticated Resource Inventory KPIs and Explorer flow totals that reconcile exactly', async () => {
    await request(app.getHttpAdapter().getInstance())
      .post('/api/v1/ingestion/batches')
      .set('Authorization', 'Bearer admin-token')
      .set('Idempotency-Key', 'milestone-d-ingestion')
      .send({ provider: 'aws', sourceUri: 'backend/test/fixtures/aws-cur-sample.csv' })
      .expect(202);

    const summary = await request(app.getHttpAdapter().getInstance())
      .get('/api/v1/cost-records/summary?provider=aws')
      .set('Authorization', 'Bearer viewer-token')
      .expect(200);

    const records = await request(app.getHttpAdapter().getInstance())
      .get('/api/v1/cost-records?provider=aws&page=1&pageSize=2')
      .set('Authorization', 'Bearer viewer-token')
      .expect(200);

    const flow = await request(app.getHttpAdapter().getInstance())
      .get('/api/v1/cost-explorer/flow?provider=aws&dimensions=service,leaseType&costFloorUsd=0.00000000')
      .set('Authorization', 'Bearer viewer-token')
      .expect(200);

    const linkTotal = flow.body.links.reduce((sum: number, link: { costTotalUsd: string }) => {
      return sum + Number(link.costTotalUsd);
    }, 0);

    expect(summary.body).toMatchObject({
      totalCostUsd: '50.15600000',
      resourceCount: 3,
      untaggedCount: 3
    });
    expect(records.body.meta).toEqual({ total: 3, page: 1, pageSize: 2 });
    expect(linkTotal.toFixed(8)).toBe(summary.body.totalCostUsd);
  });

  it('requires authentication for the Explorer flow endpoint', async () => {
    await request(app.getHttpAdapter().getInstance()).get('/api/v1/cost-explorer/flow').expect(401);
  });
});
