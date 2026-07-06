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

describeIfPostgres('Milestone B governance API with PostgreSQL persistence', () => {
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

  it('persists account groups, credential references, users, and audit evidence across app instances', async () => {
    const writer = await createApp();
    const account = await request(writer.getHttpAdapter().getInstance())
      .post('/api/v1/accounts')
      .set('x-costalyx-role', 'admin')
      .set('Idempotency-Key', 'pg-account-create')
      .send({
        provider: 'aws',
        externalAccountId: '123456789012',
        displayName: 'AWS production',
        vaultCredentialPath: 'kv/costalyx/aws/prod'
      })
      .expect(201);

    await request(writer.getHttpAdapter().getInstance())
      .post('/api/v1/account-groups')
      .set('x-costalyx-role', 'admin')
      .set('Idempotency-Key', 'pg-group-create')
      .send({ name: 'Platform engineering', accountIds: [account.body.id] })
      .expect(201);

    const credential = await request(writer.getHttpAdapter().getInstance())
      .post('/api/v1/cloud-credentials')
      .set('x-costalyx-role', 'admin')
      .set('Idempotency-Key', 'pg-credential-create')
      .send({
        provider: 'aws',
        accountId: account.body.id,
        displayName: 'AWS production billing',
        vaultPath: 'kv/costalyx/aws/prod-billing'
      })
      .expect(201);

    await request(writer.getHttpAdapter().getInstance())
      .post('/api/v1/users')
      .set('x-costalyx-role', 'admin')
      .set('Idempotency-Key', 'pg-user-create')
      .send({ email: 'viewer@example.test', displayName: 'Viewer User', roles: ['viewer'] })
      .expect(201);
    await writer.close();

    const reader = await createApp();
    await request(reader.getHttpAdapter().getInstance())
      .get('/api/v1/accounts?page=1&pageSize=25')
      .set('x-costalyx-role', 'viewer')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data[0]).toMatchObject({ displayName: 'AWS production' });
        expect(body.data[0]).not.toHaveProperty('vaultCredentialPath');
      });

    await request(reader.getHttpAdapter().getInstance())
      .get('/api/v1/account-groups?page=1&pageSize=25')
      .set('x-costalyx-role', 'viewer')
      .expect(200)
      .expect(({ body }) => expect(body.data[0].accountIds).toEqual([account.body.id]));

    await request(reader.getHttpAdapter().getInstance())
      .get('/api/v1/cloud-credentials?page=1&pageSize=25')
      .set('x-costalyx-role', 'admin')
      .expect(200)
      .expect(({ body }) => expect(body.data[0].id).toBe(credential.body.id));

    await request(reader.getHttpAdapter().getInstance())
      .get('/api/v1/users?page=1&pageSize=25')
      .set('x-costalyx-role', 'admin')
      .expect(200)
      .expect(({ body }) => expect(body.data[0].roles).toEqual(['viewer']));

    await request(reader.getHttpAdapter().getInstance())
      .get('/api/v1/audit-log?page=1&pageSize=25')
      .set('x-costalyx-role', 'admin')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.map((entry: { action: string }) => entry.action)).toEqual(
          expect.arrayContaining(['account_created', 'account_group_created', 'credential_created', 'role_change'])
        );
      });
    await reader.close();
  });
});
