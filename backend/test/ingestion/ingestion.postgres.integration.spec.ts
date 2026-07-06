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

describeIfPostgres('Milestone A ingestion API with PostgreSQL persistence', () => {
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
      '008_multitenant_cloud_portfolio.sql'
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

  it('persists ingested rows across Nest application instances', async () => {
    const body = {
      provider: 'aws',
      sourceUri: 'backend/test/fixtures/aws-cur-sample.csv'
    };

    const writer = await createApp();
    const first = await request(writer.getHttpAdapter().getInstance())
      .post('/api/v1/ingestion/batches')
      .set('x-costalyx-role', 'admin')
      .set('Idempotency-Key', 'milestone-a-postgres-api')
      .send(body)
      .expect(202);
    await writer.close();

    const reader = await createApp();
    const records = await request(reader.getHttpAdapter().getInstance())
      .get('/api/v1/cost-records?page=1&pageSize=25')
      .set('x-costalyx-role', 'viewer')
      .expect(200);
    const replay = await request(reader.getHttpAdapter().getInstance())
      .post('/api/v1/ingestion/batches')
      .set('x-costalyx-role', 'admin')
      .set('Idempotency-Key', 'milestone-a-postgres-api')
      .send(body)
      .expect(202);
    await reader.close();

    expect(first.body.ingestedRows).toBe(3);
    expect(records.body.meta.total).toBe(3);
    expect(replay.body).toEqual(first.body);
  });
});
