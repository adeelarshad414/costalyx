import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { ProblemDetailsFilter } from '../../src/common/problem-details.filter';
import { AUTH_TOKEN_VERIFIER, DEFAULT_TENANT_ID, type AuthenticatedUser, type TokenVerifier } from '../../src/security/token-verifier';
import type { Role } from '../../src/security/roles';

type HttpMethod = 'post' | 'patch' | 'delete';
type ProtectedRoute = {
  method: HttpMethod;
  path: string;
  requiredRole: Exclude<Role, 'viewer'>;
};

const id = '11111111-1111-4111-8111-111111111111';

const protectedMutatingRoutes: ProtectedRoute[] = [
  { method: 'post', path: '/api/v1/ingestion/batches', requiredRole: 'admin' },
  { method: 'patch', path: `/api/v1/recommendations/${id}`, requiredRole: 'analyst' },
  { method: 'post', path: '/api/v1/billing-agent/anomaly-scan', requiredRole: 'analyst' },
  { method: 'patch', path: `/api/v1/anomalies/${id}`, requiredRole: 'analyst' },
  { method: 'post', path: '/api/v1/billing-statement-stakeholders', requiredRole: 'admin' },
  { method: 'post', path: '/api/v1/billing-scopes', requiredRole: 'admin' },
  { method: 'post', path: '/api/v1/billing-statements/generate', requiredRole: 'analyst' },
  { method: 'post', path: `/api/v1/billing-statements/${id}/approve`, requiredRole: 'admin' },
  { method: 'post', path: `/api/v1/billing-statements/${id}/send`, requiredRole: 'admin' },
  { method: 'post', path: `/api/v1/billing-statements/${id}/dispute`, requiredRole: 'analyst' },
  { method: 'post', path: '/api/v1/tenants', requiredRole: 'admin' },
  { method: 'post', path: '/api/v1/cloud-connections', requiredRole: 'admin' },
  { method: 'post', path: `/api/v1/cloud-connections/${id}/validation`, requiredRole: 'admin' },
  { method: 'post', path: '/api/v1/accounts', requiredRole: 'admin' },
  { method: 'post', path: '/api/v1/account-groups', requiredRole: 'admin' },
  { method: 'patch', path: `/api/v1/account-groups/${id}`, requiredRole: 'admin' },
  { method: 'delete', path: `/api/v1/account-groups/${id}`, requiredRole: 'admin' },
  { method: 'post', path: '/api/v1/cloud-credentials', requiredRole: 'admin' },
  { method: 'patch', path: `/api/v1/cloud-credentials/${id}/rotation`, requiredRole: 'admin' },
  { method: 'post', path: '/api/v1/users', requiredRole: 'admin' },
  { method: 'post', path: '/api/v1/roles', requiredRole: 'admin' },
  { method: 'post', path: '/api/v1/views', requiredRole: 'analyst' },
  { method: 'post', path: '/api/v1/dimensions', requiredRole: 'analyst' },
  { method: 'post', path: `/api/v1/dimensions/${id}/mappings`, requiredRole: 'analyst' },
  { method: 'post', path: '/api/v1/resource-tags', requiredRole: 'analyst' }
];

describe('Mutating route RBAC matrix', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const roleVerifier: TokenVerifier = {
      verifyBearerToken: jest.fn(async (token: string): Promise<AuthenticatedUser> => {
        const role = token.includes('admin') ? 'admin' : token.includes('analyst') ? 'analyst' : 'viewer';
        return { subject: `${role}-user`, role, tenantId: DEFAULT_TENANT_ID };
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

  it.each(buildDeniedCases())(
    'returns 403 for %s calling %s %s requiring %s',
    async (callerRole, method, path, requiredRole) => {
      await request(app.getHttpAdapter().getInstance())
        [method](path)
        .set('Authorization', `Bearer ${callerRole}-token`)
        .set('Idempotency-Key', `rbac-${callerRole}-${method}`)
        .send({})
        .expect(403)
        .expect(({ body }) => {
          expect(JSON.stringify(body)).toContain(`Requires ${requiredRole} role.`);
        });
    }
  );
});

function buildDeniedCases(): Array<[Role, HttpMethod, string, ProtectedRoute['requiredRole']]> {
  return protectedMutatingRoutes.flatMap((route) => {
    const deniedRoles: Role[] = route.requiredRole === 'admin' ? ['viewer', 'analyst'] : ['viewer'];
    return deniedRoles.map(
      (role): [Role, HttpMethod, string, ProtectedRoute['requiredRole']] => [
        role,
        route.method,
        route.path,
        route.requiredRole
      ]
    );
  });
}
