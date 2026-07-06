import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { BillingAgentService } from '../../src/billing-agent/billing-agent.service';
import { ProblemDetailsFilter } from '../../src/common/problem-details.filter';
import { CostModelService } from '../../src/cost-model/cost-model.service';
import type { NormalizedCostRecord } from '../../src/cost-model/cost-record.types';
import { DEFAULT_TENANT_ID } from '../../src/security/token-verifier';
import { costRecord } from './billing-agent.fixtures';

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

describe('Milestone I.2 stakeholder statement API', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await createApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('enforces approval before send, supports dispute roundtrip, exports artifacts, and writes hash-chained audit rows', async () => {
    const account = await createAccount('statement-account-a', 'Billing owner account');
    const group = await request(app.getHttpServer())
      .post('/api/v1/account-groups')
      .set('x-costalyx-role', 'admin')
      .set('Idempotency-Key', 'statement-account-group-a')
      .send({ name: 'Billing owners', accountIds: [account.id] })
      .expect(201);

    const costModel = app.get(CostModelService);
    await costModel.saveIngestion({
      tenantId: DEFAULT_TENANT_ID,
      provider: 'aws',
      sourceUri: 'billing-statements-api-fixture',
      idempotencyKey: 'billing-statements-api-fixture',
      rows: [
        statementRecord('statement-api-a', account.id, account.externalAccountId, '1.25000000', '8.0000'),
        statementRecord('statement-api-b', 'unallocated-account', 'unallocated-account', '2.00000000', '1.0000')
      ]
    });

    const stakeholder = await request(app.getHttpServer())
      .post('/api/v1/billing-statement-stakeholders')
      .set('x-costalyx-role', 'admin')
      .set('Idempotency-Key', 'statement-stakeholder-api')
      .send({
        name: 'Finance Partner',
        email: 'finance-partner@example.test',
        roleLabel: 'Budget owner',
        notificationChannel: 'email'
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/billing-scopes')
      .set('x-costalyx-role', 'admin')
      .set('Idempotency-Key', 'statement-scope-api')
      .send({
        stakeholderId: stakeholder.body.id,
        scopeType: 'account_group',
        scopeRef: group.body.id,
        label: 'Billing owner account group',
        scopeFilter: { accountIds: [account.id] }
      })
      .expect(201);

    const generated = await request(app.getHttpServer())
      .post('/api/v1/billing-statements/generate')
      .set('x-costalyx-role', 'analyst')
      .set('Idempotency-Key', 'statement-generate-api')
      .send({
        periodStart: '2026-06-01T00:00:00.000Z',
        periodEnd: '2026-06-30T23:59:59.000Z'
      })
      .expect(201);
    expect(generated.body.reconciliation).toEqual(
      expect.objectContaining({
        tenantTotalUsd: '12.00',
        allocatedUniqueUsd: '10.00',
        unallocatedUsd: '2.00',
        reconcilesToTenantTotal: true
      })
    );
    const statementId = generated.body.statements[0].id;

    await request(app.getHttpServer())
      .get('/api/v1/billing-statements')
      .set('x-costalyx-role', 'viewer')
      .expect(200)
      .expect(({ body }) => expect(body.data.map((statement: { id: string }) => statement.id)).toContain(statementId));

    await request(app.getHttpServer())
      .get(`/api/v1/billing-statements/${statementId}`)
      .set('x-costalyx-role', 'viewer')
      .expect(200)
      .expect(({ body }) => {
        expect(body.lineItems).toEqual(
          expect.arrayContaining([expect.objectContaining({ lineType: 'cost', amountUsd: '10.00' })])
        );
      });

    await request(app.getHttpServer())
      .get(`/api/v1/billing-statements/${statementId}/export.csv`)
      .set('x-costalyx-role', 'viewer')
      .expect(200)
      .expect('Content-Type', /text\/csv/)
      .expect(({ text }) => {
        expect(text).toContain('Finance Partner');
        expect(text).toContain('10.00');
      });

    await request(app.getHttpServer())
      .get(`/api/v1/billing-statements/${statementId}/export.pdf`)
      .set('x-costalyx-role', 'viewer')
      .expect(200)
      .expect('Content-Type', /application\/pdf/);

    await request(app.getHttpServer())
      .post(`/api/v1/billing-statements/${statementId}/send`)
      .set('x-costalyx-role', 'viewer')
      .set('Idempotency-Key', 'statement-send-viewer')
      .expect(403);

    await request(app.getHttpServer())
      .post(`/api/v1/billing-statements/${statementId}/send`)
      .set('x-costalyx-role', 'admin')
      .set('Idempotency-Key', 'statement-send-before-approval')
      .expect(400)
      .expect(({ body }) => expect(JSON.stringify(body)).toContain('approved'));

    await request(app.getHttpServer())
      .post(`/api/v1/billing-statements/${statementId}/approve`)
      .set('x-costalyx-role', 'analyst')
      .set('Idempotency-Key', 'statement-approve-analyst')
      .expect(403);

    const approved = await request(app.getHttpServer())
      .post(`/api/v1/billing-statements/${statementId}/approve`)
      .set('x-costalyx-role', 'admin')
      .set('Idempotency-Key', 'statement-approve-admin')
      .expect(200);
    expect(approved.body.status).toBe('approved');
    expect(approved.body.approvedBy).toEqual(expect.any(String));

    const sent = await request(app.getHttpServer())
      .post(`/api/v1/billing-statements/${statementId}/send`)
      .set('x-costalyx-role', 'admin')
      .set('Idempotency-Key', 'statement-send-after-approval')
      .expect(200);
    expect(sent.body.status).toBe('sent');
    expect(sent.body.sentAt).toEqual(expect.any(String));

    const disputed = await request(app.getHttpServer())
      .post(`/api/v1/billing-statements/${statementId}/dispute`)
      .set('x-costalyx-role', 'analyst')
      .set('Idempotency-Key', 'statement-dispute-analyst')
      .send({ note: 'Stakeholder disputed the shared support allocation.' })
      .expect(200);
    expect(disputed.body.status).toBe('disputed');
    expect(disputed.body.dispute).toEqual(
      expect.objectContaining({
        previousStatus: 'sent',
        note: 'Stakeholder disputed the shared support allocation.'
      })
    );

    const auditLog = await request(app.getHttpServer())
      .get('/api/v1/audit-log?page=1&pageSize=20')
      .set('x-costalyx-role', 'admin')
      .expect(200);
    const transitions = auditLog.body.data.filter((entry: { targetId: string }) => entry.targetId === statementId);
    expect(transitions.map((entry: { action: string }) => entry.action)).toEqual(
      expect.arrayContaining(['billing_statement_disputed', 'billing_statement_sent', 'billing_statement_approved'])
    );
    const disputedAudit = transitions.find((entry: { action: string }) => entry.action === 'billing_statement_disputed');
    const sentAudit = transitions.find((entry: { action: string }) => entry.action === 'billing_statement_sent');
    const approvedAudit = transitions.find((entry: { action: string }) => entry.action === 'billing_statement_approved');
    expect(disputedAudit.prevHash).toBe(sentAudit.hash);
    expect(sentAudit.prevHash).toBe(approvedAudit.hash);
  });

  it('exposes the agent-run ledger to admins only', async () => {
    const billingAgent = app.get(BillingAgentService);
    const run = await billingAgent.runAgentCycle({
      tenantId: DEFAULT_TENANT_ID,
      runType: 'anomaly_scan',
      actor: { subject: 'system-admin', role: 'admin', tenantId: DEFAULT_TENANT_ID },
      startedAt: '2026-07-06T13:00:00.000Z',
      notificationLimit: 1
    });

    await request(app.getHttpServer()).get('/api/v1/agent-runs').set('x-costalyx-role', 'viewer').expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/agent-runs?runType=anomaly_scan')
      .set('x-costalyx-role', 'admin')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toContainEqual(
          expect.objectContaining({
            id: run.id,
            runType: 'anomaly_scan',
            inputsSummary: expect.objectContaining({ notificationLimit: 1 })
          })
        );
      });
  });

  async function createAccount(externalAccountId: string, displayName: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('x-costalyx-role', 'admin')
      .set('Idempotency-Key', `create-${externalAccountId}`)
      .send({ provider: 'aws', externalAccountId, displayName })
      .expect(201);
    return response.body as { id: string; externalAccountId: string };
  }
});

function statementRecord(
  id: string,
  accountId: string,
  accountExternalId: string,
  hourlyRateUsd: string,
  usageHours: string
): NormalizedCostRecord {
  return costRecord({
    id,
    accountId,
    accountExternalId,
    resourceId: `resource-${id}`,
    hourlyRateUsd,
    usageHours,
    validFrom: '2026-06-12T00:00:00.000Z',
    validTo: '2026-06-12T01:00:00.000Z',
    fingerprint: `statement-api:${id}`
  });
}
