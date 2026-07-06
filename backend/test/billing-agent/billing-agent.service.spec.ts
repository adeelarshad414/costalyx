import { BillingAgentService } from '../../src/billing-agent/billing-agent.service';
import { BILLING_AGENT_EVENT_TOPIC, InMemoryBillingAgentEventPublisher } from '../../src/billing-agent/billing-agent-event.publisher';
import { InMemoryBillingAgentRepository } from '../../src/billing-agent/in-memory-billing-agent.repository';
import { CostModelService } from '../../src/cost-model/cost-model.service';
import { InMemoryCostModelRepository } from '../../src/cost-model/in-memory-cost-model.repository';
import { DEFAULT_TENANT_ID } from '../../src/security/token-verifier';
import { cleanAnomalyRecords, goldenAnomalyRecords } from './billing-agent.fixtures';

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
