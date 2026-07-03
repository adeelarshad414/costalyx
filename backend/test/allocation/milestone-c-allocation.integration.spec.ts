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
      if (token.includes('admin')) {
        return { subject: 'admin-user', role: 'admin' };
      }
      if (token.includes('analyst')) {
        return { subject: 'analyst-user', role: 'analyst' };
      }
      const role: Role = 'viewer';
      return { subject: 'viewer-user', role };
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

describe('Milestone C allocation and dynamic tagging', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await createApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each([
    ['POST', '/api/v1/dimensions'],
    ['POST', '/api/v1/dimensions/11111111-1111-4111-8111-111111111111/mappings'],
    ['POST', '/api/v1/resource-tags']
  ])('returns 403 when a Viewer directly calls %s %s', async (method, path) => {
    await request(app.getHttpAdapter().getInstance())[method.toLowerCase() as 'post'](path)
      .set('Authorization', 'Bearer viewer-token')
      .set('Idempotency-Key', 'viewer-c-denied')
      .send({})
      .expect(403);
  });

  it('creates unbounded dimensions and reflects a manual retag in dimension-filtered aggregates', async () => {
    await request(app.getHttpAdapter().getInstance())
      .post('/api/v1/ingestion/batches')
      .set('Authorization', 'Bearer admin-token')
      .set('Idempotency-Key', 'milestone-c-ingestion')
      .send({ provider: 'aws', sourceUri: 'backend/test/fixtures/aws-cur-sample.csv' })
      .expect(202);

    let dimensionId = '';
    for (let index = 1; index <= 12; index += 1) {
      const response = await request(app.getHttpAdapter().getInstance())
        .post('/api/v1/dimensions')
        .set('Authorization', 'Bearer analyst-token')
        .set('Idempotency-Key', `milestone-c-dimension-${index}`)
        .send({ name: `Dimension ${index}` })
        .expect(201);
      dimensionId = response.body.id;
    }

    await request(app.getHttpAdapter().getInstance())
      .post(`/api/v1/dimensions/${dimensionId}/mappings`)
      .set('Authorization', 'Bearer analyst-token')
      .set('Idempotency-Key', 'milestone-c-owner-mapping')
      .send({ tagKey: 'owner', tagValuePattern: 'platform' })
      .expect(201);

    await request(app.getHttpAdapter().getInstance())
      .get(`/api/v1/cost-records/summary?dimension=${dimensionId}`)
      .set('Authorization', 'Bearer viewer-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.totalCostUsd).toBe('0.00000000');
        expect(body.resourceCount).toBe(0);
        expect(body.untaggedCount).toBe(3);
      });

    const tag = await request(app.getHttpAdapter().getInstance())
      .post('/api/v1/resource-tags')
      .set('Authorization', 'Bearer analyst-token')
      .set('Idempotency-Key', 'milestone-c-retag-resource')
      .send({ resourceId: 'i-aws-prod-001', tagKey: 'owner', tagValue: 'platform', source: 'manual' })
      .expect(201);
    expect(tag.body).toMatchObject({ resourceId: 'i-aws-prod-001', source: 'manual' });

    await request(app.getHttpAdapter().getInstance())
      .get('/api/v1/resource-tags?resourceId=i-aws-prod-001')
      .set('Authorization', 'Bearer viewer-token')
      .expect(200)
      .expect(({ body }) => expect(body.data).toEqual([tag.body]));

    await request(app.getHttpAdapter().getInstance())
      .get(`/api/v1/cost-records/summary?dimension=${dimensionId}`)
      .set('Authorization', 'Bearer viewer-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.totalCostUsd).toBe('0.41600000');
        expect(body.resourceCount).toBe(1);
        expect(body.untaggedCount).toBe(2);
      });

    await request(app.getHttpAdapter().getInstance())
      .get('/api/v1/audit-log')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.map((entry: { action: string }) => entry.action)).toEqual(
          expect.arrayContaining(['dimension_created', 'dimension_mapping_created', 'resource_tag_upserted'])
        );
      });
  });
});
