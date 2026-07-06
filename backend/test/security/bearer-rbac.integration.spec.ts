import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { ProblemDetailsFilter } from '../../src/common/problem-details.filter';
import { AUTH_TOKEN_VERIFIER, DEFAULT_TENANT_ID, type TokenVerifier } from '../../src/security/token-verifier';

describe('Bearer token RBAC integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const viewerVerifier: TokenVerifier = {
      verifyBearerToken: jest.fn().mockResolvedValue({ subject: 'viewer-user', role: 'viewer', tenantId: DEFAULT_TENANT_ID })
    };
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(AUTH_TOKEN_VERIFIER)
      .useValue(viewerVerifier)
      .compile();

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
    await app.close();
  });

  it('returns 403, not a filtered 200, when a Viewer bearer token calls an Admin-only endpoint', async () => {
    await request(app.getHttpAdapter().getInstance())
      .post('/api/v1/ingestion/batches')
      .set('Authorization', 'Bearer viewer-token')
      .set('Idempotency-Key', 'viewer-admin-denied')
      .send({ provider: 'aws', sourceUri: 'backend/test/fixtures/aws-cur-sample.csv' })
      .expect(403);
  });
});
