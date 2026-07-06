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

describe('Milestone F executive and TCO API', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await createApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('serves executive summary, PDF export, and a TCO estimate that reconciles with live ingested fixture cost', async () => {
    await request(app.getHttpAdapter().getInstance())
      .post('/api/v1/ingestion/batches')
      .set('Authorization', 'Bearer admin-token')
      .set('Idempotency-Key', 'milestone-f-ingestion')
      .send({ provider: 'aws', sourceUri: 'backend/test/fixtures/aws-cur-sample.csv' })
      .expect(202);

    const summary = await request(app.getHttpAdapter().getInstance())
      .get('/api/v1/executive-summary?revenueBaselineUsd=1000.00000000&budgetBaselineUsd=100.00000000')
      .set('Authorization', 'Bearer viewer-token')
      .expect(200);
    const pdf = await request(app.getHttpAdapter().getInstance())
      .get('/api/v1/executive-summary/export')
      .set('Authorization', 'Bearer viewer-token')
      .expect(200);
    const tco = await request(app.getHttpAdapter().getInstance())
      .post('/api/v1/tco/estimate')
      .set('Authorization', 'Bearer viewer-token')
      .set('Idempotency-Key', 'milestone-f-tco')
      .send({
        workloadSpec: {
          usageHours: '730.0000',
          providerHourlyRatesUsd: {
            aws: '0.06800000',
            azure: '0.09600000',
            gcp: '0.04750000'
          }
        }
      })
      .expect(200);

    expect(summary.body).toMatchObject({
      totalSpendUsd: '50.15600000',
      spendAsRevenuePercent: '5.0156',
      budgetUsedPercent: '50.1560'
    });
    expect(summary.body.topMovers[0]).toEqual(
      expect.objectContaining({ resourceId: 'db-prod-001', deltaUsd: '49.64000000' })
    );
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.text.startsWith('%PDF-1.4')).toBe(true);
    expect(tco.body.aws.monthlyCostUsd).toBe('49.64000000');
    expect(tco.body.tolerancePercent).toBe('0.0000');
  });
});
