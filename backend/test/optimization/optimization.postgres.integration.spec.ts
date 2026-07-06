import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { ProblemDetailsFilter } from '../../src/common/problem-details.filter';

const runPostgresSuite = process.env.RUN_POSTGRES_INTEGRATION === 'true' && process.env.DATABASE_URL;
const describeIfPostgres = runPostgresSuite ? describe : describe.skip;
jest.setTimeout(30000);

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

describeIfPostgres('Milestone E optimization API with PostgreSQL persistence', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    for (const migration of [
      '001_initial_cost_model.sql',
      '002_persisted_ingestion_idempotency.sql',
      '003_rbac_trust_tiers.sql',
      '004_governance_idempotency.sql',
      '005_dynamic_allocation.sql',
      '006_optimization.sql',
      '007_reporting_views.sql',
      '008_multitenant_cloud_portfolio.sql',
      '009_cloud_connection_probe_evidence.sql',
      '010_cloud_connection_runs.sql'
    ]) {
      const sql = readFileSync(join(process.cwd(), 'migrations', migration), 'utf8');
      await pool.query(sql);
    }
  });

  beforeEach(async () => {
    await pool.query(
      `TRUNCATE
        optimization_idempotency,
        realized_savings,
        recommendations,
        allocation_idempotency,
        governance_idempotency,
        views,
        resource_tags,
        dimension_tag_mappings,
        dimensions,
        audit_log,
        user_roles,
        users,
        cloud_credentials,
        account_group_members,
        account_groups,
        cloud_connections,
        cost_records,
        accounts,
        ingestion_batches
       CASCADE`
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('persists applied recommendations, realized savings, and audit evidence across app instances', async () => {
    const writer = await createApp();
    await request(writer.getHttpAdapter().getInstance())
      .post('/api/v1/ingestion/batches')
      .set('x-costalyx-role', 'admin')
      .set('Idempotency-Key', 'pg-e-ingestion')
      .send({ provider: 'aws', sourceUri: 'backend/test/fixtures/aws-cur-sample.csv' })
      .expect(202);

    const recommendations = await request(writer.getHttpAdapter().getInstance())
      .get('/api/v1/recommendations?status=open')
      .set('x-costalyx-role', 'viewer')
      .expect(200);
    const recommendation = recommendations.body.data.find(
      (item: { resourceId: string }) => item.resourceId === 'i-aws-prod-001'
    );

    await request(writer.getHttpAdapter().getInstance())
      .patch(`/api/v1/recommendations/${recommendation.id}`)
      .set('x-costalyx-role', 'analyst')
      .set('Idempotency-Key', 'pg-e-apply')
      .send({ status: 'applied' })
      .expect(200);
    await writer.close();

    const reader = await createApp();
    await request(reader.getHttpAdapter().getInstance())
      .get('/api/v1/recommendations?status=applied')
      .set('x-costalyx-role', 'viewer')
      .expect(200)
      .expect(({ body }) => expect(body.data[0].id).toBe(recommendation.id));

    await request(reader.getHttpAdapter().getInstance())
      .get('/api/v1/realized-savings')
      .set('x-costalyx-role', 'viewer')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data[0]).toMatchObject({
          recommendationId: recommendation.id,
          verificationSource: 'ingested_billing'
        });
        expect(body.data[0].deltaUsd).not.toBe(recommendation.estimatedSavingsUsd);
      });

    await request(reader.getHttpAdapter().getInstance())
      .get('/api/v1/audit-log')
      .set('x-costalyx-role', 'admin')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              action: 'recommendation_applied',
              targetType: 'recommendation',
              targetId: recommendation.id
            })
          ])
        );
      });
    await reader.close();
  });
});
