import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';

describe('Multi-tenant cloud portfolio', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps cloud connections and ingested cost rows isolated per tenant', async () => {
    const createConnection = await request(app.getHttpServer())
      .post('/api/v1/cloud-connections')
      .set('x-costalyx-role', 'admin')
      .set('x-costalyx-tenant-id', tenantA)
      .set('Idempotency-Key', 'connection-create')
      .send({
        provider: 'aws',
        displayName: 'AWS payer account',
        externalTenantId: '123456789012',
        accessMode: 'aws_assume_role',
        readOnlyPrincipal: 'arn:aws:iam::123456789012:role/CostalyxReadOnlyBilling',
        billingExportUri: 's3://customer-cur/costalyx/'
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/cloud-connections/${createConnection.body.id}/validation`)
      .set('x-costalyx-role', 'admin')
      .set('x-costalyx-tenant-id', tenantA)
      .set('Idempotency-Key', 'connection-validate')
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('validated'));

    await request(app.getHttpServer())
      .get('/api/v1/cloud-connections')
      .set('x-costalyx-role', 'viewer')
      .set('x-costalyx-tenant-id', tenantB)
      .expect(200)
      .expect(({ body }) => expect(body.data).toEqual([]));

    for (const tenantId of [tenantA, tenantB]) {
      await request(app.getHttpServer())
        .post('/api/v1/ingestion/batches')
        .set('x-costalyx-role', 'admin')
        .set('x-costalyx-tenant-id', tenantId)
        .set('Idempotency-Key', 'same-human-key')
        .send({
          provider: 'aws',
          cloudConnectionId: tenantId === tenantA ? createConnection.body.id : undefined,
          sourceUri: 'backend/test/fixtures/aws-cur-sample.csv'
        })
        .expect(202)
        .expect(({ body }) => expect(body.tenantId).toBe(tenantId));
    }

    const tenantARecords = await request(app.getHttpServer())
      .get('/api/v1/cost-records?provider=aws&page=1&pageSize=25')
      .set('x-costalyx-role', 'viewer')
      .set('x-costalyx-tenant-id', tenantA)
      .expect(200);
    const tenantBRecords = await request(app.getHttpServer())
      .get('/api/v1/cost-records?provider=aws&page=1&pageSize=25')
      .set('x-costalyx-role', 'viewer')
      .set('x-costalyx-tenant-id', tenantB)
      .expect(200);

    expect(tenantARecords.body.meta.total).toBeGreaterThan(0);
    expect(tenantBRecords.body.meta.total).toBeGreaterThan(0);
    expect(tenantARecords.body.data.map((record: { sourceBatchId: string }) => record.sourceBatchId)).not.toEqual(
      tenantBRecords.body.data.map((record: { sourceBatchId: string }) => record.sourceBatchId)
    );
  });
});
