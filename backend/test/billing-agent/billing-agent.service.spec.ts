import { createServer, type AddressInfo, type Server } from 'node:net';
import { BillingAgentService } from '../../src/billing-agent/billing-agent.service';
import { BILLING_AGENT_EVENT_TOPIC, InMemoryBillingAgentEventPublisher } from '../../src/billing-agent/billing-agent-event.publisher';
import { InMemoryBillingAgentRepository } from '../../src/billing-agent/in-memory-billing-agent.repository';
import { CostModelService } from '../../src/cost-model/cost-model.service';
import type { CostModelRepository } from '../../src/cost-model/cost-model.repository';
import type { NormalizedCostRecord } from '../../src/cost-model/cost-record.types';
import { InMemoryCostModelRepository } from '../../src/cost-model/in-memory-cost-model.repository';
import { DEFAULT_TENANT_ID } from '../../src/security/token-verifier';
import { cleanAnomalyRecords, costRecord, goldenAnomalyRecords } from './billing-agent.fixtures';

const actor = { subject: 'analyst-user', role: 'analyst' as const, tenantId: DEFAULT_TENANT_ID };

async function createService(rows = goldenAnomalyRecords()) {
  const costModel = new CostModelService(new InMemoryCostModelRepository());
  await costModel.saveIngestion({
    tenantId: DEFAULT_TENANT_ID,
    provider: 'aws',
    sourceUri: 'billing-agent-fixture',
    idempotencyKey: 'billing-agent-fixture',
    rows
  });
  const repository = new InMemoryBillingAgentRepository();
  const events = new InMemoryBillingAgentEventPublisher();
  const service = new BillingAgentService(costModel, repository, events);
  return { costModel, events, repository, service };
}

describe('BillingAgentService anomaly detection', () => {
  it('detects the four Milestone I anomaly families from deterministic cost evidence', async () => {
    const { costModel, events, service } = await createService();
    const result = await service.scanAnomalies(DEFAULT_TENANT_ID);
    const storedRecords = await costModel.listRecords({ tenantId: DEFAULT_TENANT_ID, page: 1, pageSize: 200 });
    const storedIds = new Set(storedRecords.data.map((record) => record.id));

    expect(result.created.map((anomaly) => anomaly.type).sort()).toEqual(['coverage', 'new_spend', 'unit_price', 'usage']);
    expect(result.totalOpen).toBe(4);
    expect(events.events).toHaveLength(4);
    expect(events.events.every((entry) => entry.topic === BILLING_AGENT_EVENT_TOPIC)).toBe(true);
    expect(result.created.every((anomaly) => anomaly.evidence.costRecordIds.every((id) => storedIds.has(id)))).toBe(true);
    expect(result.created.every((anomaly) => anomaly.evidence.pricingRows.length > 0)).toBe(true);
  });

  it('does not flag clean billing data', async () => {
    const { service } = await createService(cleanAnomalyRecords());

    await expect(service.scanAnomalies(DEFAULT_TENANT_ID)).resolves.toEqual({ created: [], totalOpen: 0 });
  });

  it('learns false-positive suppressions and skips the suppressed fingerprint on rescans', async () => {
    const { service } = await createService();
    const first = await service.scanAnomalies(DEFAULT_TENANT_ID);
    const usage = first.created.find((anomaly) => anomaly.type === 'usage');

    await service.updateAnomalyStatus(
      usage!.id,
      { status: 'false_positive', falsePositiveReason: 'seasonal', falsePositiveNote: 'Quarter-end backup cycle.' },
      actor,
      'usage-false-positive'
    );
    const second = await service.scanAnomalies(DEFAULT_TENANT_ID);
    const openUsage = await service.listAnomalies({ tenantId: DEFAULT_TENANT_ID, status: 'open', type: 'usage', page: 1, pageSize: 25 });

    expect(second.created.map((anomaly) => anomaly.type)).not.toContain('usage');
    expect(openUsage.meta.total).toBe(0);
  });

  it('requires an inspectable reason code before marking an anomaly false positive', async () => {
    const { service } = await createService();
    const first = await service.scanAnomalies(DEFAULT_TENANT_ID);

    await expect(
      service.updateAnomalyStatus(first.created[0].id, { status: 'false_positive' }, actor, 'missing-false-positive-reason')
    ).rejects.toThrow(/falsePositiveReason is required/);
  });
});

describe('BillingAgentService stakeholder statements', () => {
  it('generates stakeholder statements, flags overlapping scopes, and reconciles to the tenant total from rate * usage', async () => {
    const records = statementRecords();
    const costModel = new CostModelService(new StatementCostRepository(records, statementAccountGroups()));
    const repository = new InMemoryBillingAgentRepository();
    const service = new BillingAgentService(costModel, repository, new InMemoryBillingAgentEventPublisher());

    const [finance, engineering, support] = await Promise.all([
      service.createStatementStakeholder(
        { name: 'Finance owner', email: 'finance@example.test', roleLabel: 'Budget owner', notificationChannel: 'email' },
        actor,
        'statement-stakeholder-finance'
      ),
      service.createStatementStakeholder(
        { name: 'Engineering owner', email: 'engineering@example.test', roleLabel: 'Service owner', notificationChannel: 'email' },
        actor,
        'statement-stakeholder-engineering'
      ),
      service.createStatementStakeholder(
        { name: 'Support owner', email: 'support@example.test', roleLabel: 'Support owner', notificationChannel: 'email' },
        actor,
        'statement-stakeholder-support'
      )
    ]);

    await Promise.all([
      service.createBillingScope(
        {
          stakeholderId: finance.id,
          scopeType: 'account_group',
          scopeRef: 'group-finance',
          label: 'Finance account group'
        },
        actor,
        'statement-scope-finance'
      ),
      service.createBillingScope(
        {
          stakeholderId: engineering.id,
          scopeType: 'account_group',
          scopeRef: 'group-engineering',
          label: 'Engineering account group'
        },
        actor,
        'statement-scope-engineering'
      ),
      service.createBillingScope(
        {
          stakeholderId: support.id,
          scopeType: 'account_group',
          scopeRef: 'group-support',
          label: 'Support account group'
        },
        actor,
        'statement-scope-support'
      )
    ]);
    await repository.upsertAnomalyCandidates(DEFAULT_TENANT_ID, [
      {
        id: '11111111-1111-4111-8111-111111119999',
        tenantId: DEFAULT_TENANT_ID,
        type: 'usage',
        severity: 'high',
        detectedAt: '2026-06-15T00:00:00.000Z',
        windowStart: '2026-06-01T00:00:00.000Z',
        windowEnd: '2026-06-30T00:00:00.000Z',
        explanationMd: 'Usage anomaly overlaps the engineering statement scope.',
        evidence: {
          fingerprint: 'statement-anomaly:engineering',
          costRecordIds: ['statement-b'],
          pricingRows: [
            {
              costRecordId: 'statement-b',
              resourceId: 'resource-b',
              hourlyRateUsd: '2.00000000',
              usageHours: '10.0000',
              validFrom: '2026-06-12T00:00:00.000Z',
              validTo: null
            }
          ],
          metrics: { currentUsageHours: '10.0000' }
        }
      }
    ]);

    const generated = await service.generateStatements(
      {
        periodStart: '2026-06-01T00:00:00.000Z',
        periodEnd: '2026-06-30T23:59:59.000Z'
      },
      actor,
      'statement-generate-june'
    );

    expect(generated.statements).toHaveLength(3);
    expect(generated.reconciliation).toEqual(
      expect.objectContaining({
        tenantTotalUsd: '57.00',
        allocatedUniqueUsd: '50.00',
        unallocatedUsd: '7.00',
        overlapUsd: '5.00',
        reconcilesToTenantTotal: true
      })
    );
    expect(generated.scopeWarnings).toContainEqual(
      expect.objectContaining({
        code: 'overlap_detected',
        amountUsd: '5.00',
        costRecordIds: ['statement-overlap']
      })
    );
    const engineeringStatement = generated.statements.find((statement) => statement.stakeholderId === engineering.id);
    expect(engineeringStatement).toEqual(
      expect.objectContaining({
        status: 'pending_approval',
        totalUsd: '25.00',
        openAnomalyCount: 1
      })
    );
    expect(engineeringStatement?.lineItems).toContainEqual(
      expect.objectContaining({
        lineType: 'anomaly',
        description: expect.stringContaining('Usage anomaly')
      })
    );
  });

  it('delivers approved statements through a configured local SMTP relay', async () => {
    const costModel = new CostModelService(new InMemoryCostModelRepository());
    await costModel.saveIngestion({
      tenantId: DEFAULT_TENANT_ID,
      provider: 'aws',
      sourceUri: 'statement-smtp-fixture',
      idempotencyKey: 'statement-smtp-fixture',
      rows: statementRecords()
    });
    const repository = new InMemoryBillingAgentRepository();
    const service = new BillingAgentService(costModel, repository, new InMemoryBillingAgentEventPublisher());
    const stakeholder = await service.createStatementStakeholder(
      { name: 'Finance owner', email: 'finance@example.test', roleLabel: 'Budget owner', notificationChannel: 'email' },
      actor,
      'smtp-stakeholder'
    );
    await service.createBillingScope(
      {
        stakeholderId: stakeholder.id,
        scopeType: 'account_group',
        scopeRef: 'group-finance',
        label: 'Finance account group',
        scopeFilter: { accountIds: ['account-a'] }
      },
      actor,
      'smtp-scope'
    );
    const generated = await service.generateStatements(
      {
        periodStart: '2026-06-01T00:00:00.000Z',
        periodEnd: '2026-06-30T23:59:59.000Z'
      },
      actor,
      'smtp-generate'
    );
    const approved = await service.approveStatement(generated.statements[0].id, actor, 'smtp-approve');
    const smtp = await startFakeSmtpServer();
    const previousHost = process.env.SMTP_HOST;
    const previousPort = process.env.SMTP_PORT;
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = String(smtp.port);
    try {
      const sent = await service.sendStatement(approved.id, actor, 'smtp-send');

      expect(sent.status).toBe('sent');
      expect(sent.sendEvidence).toEqual(expect.objectContaining({ deliveryMode: 'smtp', smtpPort: smtp.port }));
      expect(smtp.transcript.join('\n')).toContain('RCPT TO:<finance@example.test>');
      expect(smtp.transcript.join('\n')).toContain('Total USD: 10.00');
    } finally {
      restoreEnv('SMTP_HOST', previousHost);
      restoreEnv('SMTP_PORT', previousPort);
      await smtp.close();
    }
  });
});

class StatementCostRepository implements CostModelRepository {
  constructor(
    private readonly rows: NormalizedCostRecord[],
    private readonly groups: Record<string, string[]>
  ) {}

  saveIngestion: CostModelRepository['saveIngestion'] = async () => {
    throw new Error('not used');
  };

  getBatch: CostModelRepository['getBatch'] = async () => {
    throw new Error('not used');
  };

  listRecords: CostModelRepository['listRecords'] = async (query) => {
    const groupAccountIds = query.accountGroupId ? new Set(this.groups[query.accountGroupId] ?? []) : null;
    const filtered = this.rows.filter((row) => {
      const startsAt = new Date(row.validFrom).getTime();
      return (
        (!groupAccountIds || groupAccountIds.has(row.accountId)) &&
        (!query.from || startsAt >= new Date(query.from).getTime()) &&
        (!query.to || startsAt <= new Date(query.to).getTime())
      );
    });
    const start = (query.page - 1) * query.pageSize;
    return {
      data: filtered.slice(start, start + query.pageSize),
      meta: { total: filtered.length, page: query.page, pageSize: query.pageSize }
    };
  };

  getSummary: CostModelRepository['getSummary'] = async () => {
    throw new Error('not used');
  };

  getExplorerFlow: CostModelRepository['getExplorerFlow'] = async () => {
    throw new Error('not used');
  };
}

function statementAccountGroups(): Record<string, string[]> {
  return {
    'group-finance': ['account-a', 'account-overlap'],
    'group-engineering': ['account-b', 'account-overlap'],
    'group-support': ['account-c']
  };
}

function statementRecords(): NormalizedCostRecord[] {
  return [
    statementRecord('statement-a', 'account-a', 'resource-a', '1.00000000', '10.0000'),
    statementRecord('statement-b', 'account-b', 'resource-b', '2.00000000', '10.0000'),
    statementRecord('statement-c', 'account-c', 'resource-c', '3.00000000', '5.0000'),
    statementRecord('statement-overlap', 'account-overlap', 'resource-overlap', '5.00000000', '1.0000', {
      costTotalUsd: '999.00000000',
      costTotalUsdRoundedToCent: '999.00'
    }),
    statementRecord('statement-unallocated', 'account-unallocated', 'resource-unallocated', '7.00000000', '1.0000')
  ];
}

function statementRecord(
  id: string,
  accountId: string,
  resourceId: string,
  hourlyRateUsd: string,
  usageHours: string,
  overrides: Partial<NormalizedCostRecord> = {}
): NormalizedCostRecord {
  return costRecord({
    id,
    accountId,
    accountExternalId: accountId,
    resourceId,
    hourlyRateUsd,
    usageHours,
    validFrom: '2026-06-12T00:00:00.000Z',
    validTo: '2026-06-12T01:00:00.000Z',
    fingerprint: `statement:${id}`,
    ...overrides
  });
}

async function startFakeSmtpServer(): Promise<{ port: number; transcript: string[]; close: () => Promise<void> }> {
  const transcript: string[] = [];
  const server: Server = createServer((socket) => {
    socket.write('220 fake-mailpit ESMTP\r\n');
    socket.on('data', (chunk) => {
      const text = chunk.toString();
      transcript.push(text);
      if (text.startsWith('DATA')) {
        socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
      } else if (text.includes('\r\n.\r\n')) {
        socket.write('250 queued\r\n');
      } else if (text.startsWith('QUIT')) {
        socket.write('221 bye\r\n');
      } else {
        socket.write('250 ok\r\n');
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    port: (server.address() as AddressInfo).port,
    transcript,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
