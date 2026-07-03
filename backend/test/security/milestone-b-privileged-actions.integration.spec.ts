import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { ProblemDetailsFilter } from '../../src/common/problem-details.filter';
import type { Role } from '../../src/security/roles';
import { AUTH_TOKEN_VERIFIER, type AuthenticatedUser, type TokenVerifier } from '../../src/security/token-verifier';

const accountId = '11111111-1111-4111-8111-111111111111';

describe('Milestone B privileged action enforcement', () => {
  let app: INestApplication;

  beforeAll(async () => {
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

  it.each([
    ['POST', '/api/v1/account-groups'],
    ['PATCH', `/api/v1/account-groups/${accountId}`],
    ['DELETE', `/api/v1/account-groups/${accountId}`],
    ['POST', '/api/v1/cloud-credentials'],
    ['PATCH', `/api/v1/cloud-credentials/${accountId}/rotation`],
    ['POST', '/api/v1/users'],
    ['GET', '/api/v1/roles'],
    ['GET', '/api/v1/audit-log']
  ])('returns 403 when a Viewer directly calls %s %s', async (method, path) => {
    const response = request(app.getHttpAdapter().getInstance())[method.toLowerCase() as 'get'](path)
      .set('Authorization', 'Bearer viewer-token')
      .set('Idempotency-Key', 'viewer-denied-key-0001')
      .send({});

    await response.expect(403);
  });

  it('keeps export authenticated while allowing every fixed role to export', async () => {
    await request(app.getHttpAdapter().getInstance()).get('/api/v1/cost-records/export').expect(401);

    await request(app.getHttpAdapter().getInstance())
      .get('/api/v1/cost-records/export')
      .set('Authorization', 'Bearer viewer-token')
      .expect(200)
      .expect('Content-Type', /text\/csv/);
  });

  it('allows an Admin to manage account groups, credentials, users, fixed roles, and audit evidence', async () => {
    const createdGroup = await request(app.getHttpAdapter().getInstance())
      .post('/api/v1/account-groups')
      .set('Authorization', 'Bearer admin-token')
      .set('Idempotency-Key', 'admin-group-create-0001')
      .send({ name: 'Platform engineering', accountIds: [accountId] })
      .expect(201);
    expect(createdGroup.body).toMatchObject({ name: 'Platform engineering', accountIds: [accountId] });

    await request(app.getHttpAdapter().getInstance())
      .patch(`/api/v1/account-groups/${createdGroup.body.id}`)
      .set('Authorization', 'Bearer admin-token')
      .set('Idempotency-Key', 'admin-group-patch-0001')
      .send({ name: 'Platform cost owners' })
      .expect(200)
      .expect(({ body }) => expect(body.name).toBe('Platform cost owners'));

    const credential = await request(app.getHttpAdapter().getInstance())
      .post('/api/v1/cloud-credentials')
      .set('Authorization', 'Bearer admin-token')
      .set('Idempotency-Key', 'admin-credential-create-0001')
      .send({
        provider: 'aws',
        accountId,
        displayName: 'AWS production billing',
        vaultPath: 'kv/costalyx/aws/prod-billing'
      })
      .expect(201);
    expect(JSON.stringify(credential.body)).not.toContain('secret');
    expect(credential.body).toMatchObject({ provider: 'aws', vaultPath: 'kv/costalyx/aws/prod-billing' });

    await request(app.getHttpAdapter().getInstance())
      .patch(`/api/v1/cloud-credentials/${credential.body.id}/rotation`)
      .set('Authorization', 'Bearer admin-token')
      .set('Idempotency-Key', 'admin-credential-rotate-0001')
      .send({ vaultPath: 'kv/costalyx/aws/prod-billing-v2' })
      .expect(200)
      .expect(({ body }) => expect(body.vaultPath).toBe('kv/costalyx/aws/prod-billing-v2'));

    await request(app.getHttpAdapter().getInstance())
      .post('/api/v1/users')
      .set('Authorization', 'Bearer admin-token')
      .set('Idempotency-Key', 'admin-user-create-0001')
      .send({ email: 'viewer@example.test', displayName: 'Viewer User', roles: ['viewer'] })
      .expect(201);

    await request(app.getHttpAdapter().getInstance())
      .get('/api/v1/roles')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual([
          { name: 'viewer', fixed: true },
          { name: 'analyst', fixed: true },
          { name: 'admin', fixed: true }
        ]);
      });

    await request(app.getHttpAdapter().getInstance())
      .post('/api/v1/roles')
      .set('Authorization', 'Bearer admin-token')
      .set('Idempotency-Key', 'admin-custom-role-rejected-0001')
      .send({ name: 'finops_manager', permissionBitset: '111' })
      .expect(400);

    await request(app.getHttpAdapter().getInstance())
      .get('/api/v1/audit-log')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.map((entry: { action: string }) => entry.action)).toEqual(
          expect.arrayContaining(['account_group_created', 'credential_rotated', 'role_change'])
        );
        expect(body.data.every((entry: { hash?: string }) => typeof entry.hash === 'string')).toBe(true);
      });
  });

  it('rejects plaintext credential material at the API boundary', async () => {
    await request(app.getHttpAdapter().getInstance())
      .post('/api/v1/cloud-credentials')
      .set('Authorization', 'Bearer admin-token')
      .set('Idempotency-Key', 'admin-secret-reject-0001')
      .send({
        provider: 'aws',
        accountId,
        displayName: 'Bad credential',
        vaultPath: 'kv/costalyx/aws/bad',
        secretAccessKey: 'do-not-accept'
      })
      .expect(400);
  });
});
