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

describeIfPostgres('Milestone G reporting API with PostgreSQL persistence', () => {
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
        realized_savings,
        recommendations,
        optimization_idempotency,
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

  it('persists saved views and applies them to reports across app instances', async () => {
    const writer = await createApp();
    await request(writer.getHttpAdapter().getInstance())
      .post('/api/v1/ingestion/batches')
      .set('x-costalyx-role', 'admin')
      .set('Idempotency-Key', 'pg-g-aws-ingestion')
      .send({ provider: 'aws', sourceUri: 'backend/test/fixtures/aws-cur-sample.csv' })
      .expect(202);
    await request(writer.getHttpAdapter().getInstance())
      .post('/api/v1/ingestion/batches')
      .set('x-costalyx-role', 'admin')
      .set('Idempotency-Key', 'pg-g-azure-ingestion')
      .send({ provider: 'azure', sourceUri: 'backend/test/fixtures/azure-cost-export-sample.csv' })
      .expect(202);

    const view = await request(writer.getHttpAdapter().getInstance())
      .post('/api/v1/views')
      .set('x-costalyx-role', 'admin')
      .set('Idempotency-Key', 'pg-g-view')
      .send({ name: 'AWS persisted scope', filterJson: { provider: 'aws' }, sharedRoleScope: ['viewer'] })
      .expect(201);
    await writer.close();

    const reader = await createApp();
    await request(reader.getHttpAdapter().getInstance())
      .get('/api/v1/cost-records/summary')
      .set('x-costalyx-role', 'viewer')
      .set('X-Costalyx-View-Id', view.body.id)
      .expect(200)
      .expect(({ body }) => expect(body.totalCostUsd).toBe('50.15600000'));

    await request(reader.getHttpAdapter().getInstance())
      .get('/api/v1/views?page=1&pageSize=25')
      .set('x-costalyx-role', 'viewer')
      .expect(200)
      .expect(({ body }) => expect(body.data[0].id).toBe(view.body.id));
    await reader.close();
  });
});
