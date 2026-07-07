import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { ProblemDetailsFilter } from '../../src/common/problem-details.filter';

describe('HTTP rate limiting', () => {
  let app: INestApplication;
  const originalMax = process.env.COSTALYX_RATE_LIMIT_MAX;
  const originalWindow = process.env.COSTALYX_RATE_LIMIT_WINDOW_MS;
  const originalDisabled = process.env.COSTALYX_RATE_LIMIT_DISABLED;

  beforeAll(async () => {
    process.env.COSTALYX_RATE_LIMIT_MAX = '2';
    process.env.COSTALYX_RATE_LIMIT_WINDOW_MS = '60000';
    delete process.env.COSTALYX_RATE_LIMIT_DISABLED;

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
    restoreEnv('COSTALYX_RATE_LIMIT_MAX', originalMax);
    restoreEnv('COSTALYX_RATE_LIMIT_WINDOW_MS', originalWindow);
    restoreEnv('COSTALYX_RATE_LIMIT_DISABLED', originalDisabled);
    await app.close();
  });

  it('limits repeated public health requests from the same client', async () => {
    const server = app.getHttpAdapter().getInstance();

    await request(server).get('/healthz').set('x-forwarded-for', '203.0.113.10').expect(200);
    await request(server).get('/healthz').set('x-forwarded-for', '203.0.113.10').expect(200);

    const response = await request(server).get('/healthz').set('x-forwarded-for', '203.0.113.10').expect(429);

    expect(response.headers['retry-after']).toBe('60');
    expect(response.body).toEqual({
      type: 'about:blank',
      title: 'Too Many Requests',
      status: 429,
      detail: 'Rate limit exceeded. Try again shortly.'
    });

    await request(server).get('/healthz').set('x-forwarded-for', '203.0.113.11').expect(200);
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
