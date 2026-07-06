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

describe('Milestone E optimization API', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await createApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('lists rule-based recommendations and writes an audited realized-savings ledger row when applied', async () => {
    await request(app.getHttpAdapter().getInstance())
      .post('/api/v1/ingestion/batches')
      .set('Authorization', 'Bearer admin-token')
      .set('Idempotency-Key', 'milestone-e-ingestion')
      .send({ provider: 'aws', sourceUri: 'backend/test/fixtures/aws-cur-sample.csv' })
      .expect(202);

    const recommendations = await request(app.getHttpAdapter().getInstance())
      .get('/api/v1/recommendations?status=open')
      .set('Authorization', 'Bearer viewer-token')
      .expect(200);
    const recommendation = recommendations.body.data.find(
      (item: { resourceId: string }) => item.resourceId === 'i-aws-prod-001'
    );

    expect(recommendation).toEqual(
      expect.objectContaining({
        type: 'rightsizing',
        status: 'open'
      })
    );

    await request(app.getHttpAdapter().getInstance())
      .patch(`/api/v1/recommendations/${recommendation.id}`)
      .set('Authorization', 'Bearer viewer-token')
      .set('Idempotency-Key', 'milestone-e-viewer-apply')
      .send({ status: 'applied' })
      .expect(403);

    const applied = await request(app.getHttpAdapter().getInstance())
      .patch(`/api/v1/recommendations/${recommendation.id}`)
      .set('Authorization', 'Bearer analyst-token')
      .set('Idempotency-Key', 'milestone-e-apply')
      .send({ status: 'applied' })
      .expect(200);

    const ledger = await request(app.getHttpAdapter().getInstance())
      .get('/api/v1/realized-savings')
      .set('Authorization', 'Bearer viewer-token')
      .expect(200);
    const audit = await request(app.getHttpAdapter().getInstance())
      .get('/api/v1/audit-log')
      .set('Authorization', 'Bearer admin-token')
      .expect(200);

    expect(applied.body.status).toBe('applied');
    expect(ledger.body.data[0]).toEqual(
      expect.objectContaining({
        recommendationId: recommendation.id,
        verificationSource: 'ingested_billing'
      })
    );
    expect(Number(ledger.body.data[0].deltaUsd)).toBeGreaterThan(0);
    expect(ledger.body.data[0].deltaUsd).not.toBe(recommendation.estimatedSavingsUsd);
    expect(audit.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'recommendation_applied',
          targetType: 'recommendation',
          targetId: recommendation.id
        })
      ])
    );
  });
});
