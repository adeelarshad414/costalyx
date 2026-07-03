import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { ProblemDetailsFilter } from '../../src/common/problem-details.filter';

describe('Milestone A ingestion API', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

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

  it('ingests the AWS CUR fixture and does not duplicate rows when replayed', async () => {
    const body = {
      provider: 'aws',
      sourceUri: 'backend/test/fixtures/aws-cur-sample.csv'
    };

    const first = await request(app.getHttpServer())
      .post('/api/v1/ingestion/batches')
      .set('x-costalyx-role', 'admin')
      .set('Idempotency-Key', 'milestone-a-first-ingest')
      .send(body)
      .expect(202);

    expect(first.body.status).toBe('complete');
    expect(first.body.ingestedRows).toBe(3);
    expect(first.body.duplicateRows).toBe(0);

    const second = await request(app.getHttpServer())
      .post('/api/v1/ingestion/batches')
      .set('x-costalyx-role', 'admin')
      .set('Idempotency-Key', 'milestone-a-second-ingest')
      .send(body)
      .expect(202);

    expect(second.body.status).toBe('complete');
    expect(second.body.ingestedRows).toBe(0);
    expect(second.body.duplicateRows).toBe(3);

    const records = await request(app.getHttpServer())
      .get('/api/v1/cost-records?page=1&pageSize=25')
      .set('x-costalyx-role', 'viewer')
      .expect(200);

    expect(records.body.meta.total).toBe(3);
    expect(records.body.data.map((row: { resourceId: string }) => row.resourceId)).toEqual([
      'i-aws-prod-001',
      'i-aws-spot-002',
      'db-prod-001'
    ]);
  });

  it('returns the original response for a duplicate Idempotency-Key', async () => {
    const body = {
      provider: 'aws',
      sourceUri: 'backend/test/fixtures/aws-cur-sample.csv'
    };

    const first = await request(app.getHttpServer())
      .post('/api/v1/ingestion/batches')
      .set('x-costalyx-role', 'admin')
      .set('Idempotency-Key', 'milestone-a-idempotency-key')
      .send(body)
      .expect(202);

    const replay = await request(app.getHttpServer())
      .post('/api/v1/ingestion/batches')
      .set('x-costalyx-role', 'admin')
      .set('Idempotency-Key', 'milestone-a-idempotency-key')
      .send(body)
      .expect(202);

    expect(replay.body).toEqual(first.body);
  });
});
