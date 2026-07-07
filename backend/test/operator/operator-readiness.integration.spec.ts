import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { ProblemDetailsFilter } from '../../src/common/problem-details.filter';

const envKeys = [
  'APP_ENV',
  'NODE_ENV',
  'USE_MOCKS',
  'AUTH_ALLOW_TEST_ROLE_HEADER',
  'DATABASE_URL',
  'KEYCLOAK_ISSUER_URL',
  'VAULT_ADDR',
  'VAULT_TOKEN',
  'REDPANDA_BROKERS',
  'SMTP_HOST',
  'SMTP_PORT',
  'COSTALYX_AWS_BROKER_PRINCIPAL_ARN',
  'COSTALYX_LIVE_CLOUD_PROBES'
] as const;

describe('Operator readiness endpoint', () => {
  let app: INestApplication;
  const originalEnv = new Map<string, string | undefined>();

  beforeAll(async () => {
    for (const key of envKeys) {
      originalEnv.set(key, process.env[key]);
    }

    process.env.AUTH_ALLOW_TEST_ROLE_HEADER = 'true';
    process.env.APP_ENV = 'local';
    process.env.NODE_ENV = 'test';
    process.env.USE_MOCKS = 'false';
    process.env.DATABASE_URL = 'postgresql://costalyx:super-secret-db-password@localhost:5432/costalyx_dev';
    process.env.KEYCLOAK_ISSUER_URL = 'https://auth.example.test/realms/costalyx';
    process.env.VAULT_ADDR = 'https://vault.internal.example.test';
    process.env.VAULT_TOKEN = 'vault-root-token-super-secret';
    process.env.REDPANDA_BROKERS = 'redpanda:9092';
    process.env.SMTP_HOST = 'mailpit.internal.example.test';
    process.env.SMTP_PORT = '1025';
    process.env.COSTALYX_AWS_BROKER_PRINCIPAL_ARN = 'arn:aws:iam::999999999999:role/CostalyxBroker';
    delete process.env.COSTALYX_LIVE_CLOUD_PROBES;

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
    for (const [key, value] of originalEnv) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    await app.close();
  });

  it('requires an admin role for deployment readiness state', async () => {
    await request(app.getHttpAdapter().getInstance()).get('/api/v1/operator-readiness').expect(401);
    await request(app.getHttpAdapter().getInstance())
      .get('/api/v1/operator-readiness')
      .set('x-costalyx-role', 'viewer')
      .expect(403);
  });

  it('returns sanitized go-live readiness checks without leaking configured values', async () => {
    const response = await request(app.getHttpAdapter().getInstance())
      .get('/api/v1/operator-readiness')
      .set('x-costalyx-role', 'admin')
      .expect(200);

    expect(response.body.status).toBe('blocked');
    expect(response.body.environment).toMatchObject({
      appEnv: 'local',
      nodeEnv: 'test',
      useMocks: false,
      liveCloudProbes: false
    });
    expect(response.body.checks).toContainEqual(
      expect.objectContaining({
        id: 'live-cloud-probes',
        label: 'Live cloud probes',
        status: 'blocked'
      })
    );
    expect(response.body.checks).toContainEqual(
      expect.objectContaining({
        id: 'aws-broker-principal',
        label: 'AWS broker principal',
        status: 'ready'
      })
    );
    expect(response.body.blockers).toContain('Enable COSTALYX_LIVE_CLOUD_PROBES only after broker credentials are present.');
    expect(response.body.nextActions).toContainEqual(
      expect.objectContaining({
        label: 'Run live readiness probe',
        command: 'npm run probe:live-readiness'
      })
    );

    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('super-secret-db-password');
    expect(serialized).not.toContain('vault-root-token-super-secret');
    expect(serialized).not.toContain('arn:aws:iam::999999999999:role/CostalyxBroker');
    expect(serialized).not.toContain('auth.example.test');
    expect(serialized).not.toContain('vault.internal.example.test');
  });
});
