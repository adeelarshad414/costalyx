import { InMemoryAuditLogStore } from '../../src/audit/audit-log.store';
import { AllocationService } from '../../src/allocation/allocation.service';
import { InMemoryAllocationRepository } from '../../src/allocation/in-memory-allocation.repository';
import { DEFAULT_TENANT_ID, type AuthenticatedUser } from '../../src/security/token-verifier';

const actor: AuthenticatedUser = { subject: 'analyst-user', role: 'analyst', tenantId: DEFAULT_TENANT_ID };

describe('AllocationService', () => {
  let service: AllocationService;

  beforeEach(() => {
    service = new AllocationService(new InMemoryAllocationRepository(new InMemoryAuditLogStore()));
  });

  it('creates dimension #50 without requiring a fixed-slot schema change', async () => {
    const dimensions = [];
    for (let index = 1; index <= 50; index += 1) {
      dimensions.push(
        await service.createDimension({ name: `Dimension ${index}` }, actor, `dimension-create-${index}`)
      );
    }

    const listed = await service.listDimensions({ page: 1, pageSize: 200 }, actor);

    expect(dimensions).toHaveLength(50);
    expect(listed.meta.total).toBe(50);
    expect(listed.data[49]).toEqual(
      expect.objectContaining({
        name: 'Dimension 50',
        orgId: actor.tenantId,
        createdBy: expect.any(String)
      })
    );
  });

  it('idempotently creates mappings and retags resources with manual tags', async () => {
    const dimension = await service.createDimension({ name: 'Team' }, actor, 'dimension-team');
    const mapping = await service.createDimensionMapping(
      dimension.id,
      { tagKey: 'owner', tagValuePattern: 'platform' },
      actor,
      'mapping-team-owner'
    );
    const replayedMapping = await service.createDimensionMapping(
      dimension.id,
      { tagKey: 'ignored' },
      actor,
      'mapping-team-owner'
    );

    const tag = await service.upsertResourceTag(
      { resourceId: 'i-aws-prod-001', tagKey: 'owner', tagValue: 'platform', source: 'manual' },
      actor,
      'tag-i-aws-prod-001'
    );
    const listedTags = await service.listResourceTags({ resourceId: 'i-aws-prod-001', page: 1, pageSize: 25 }, actor);

    expect(replayedMapping).toBe(mapping);
    expect(tag).toEqual({ resourceId: 'i-aws-prod-001', tagKey: 'owner', tagValue: 'platform', source: 'manual' });
    expect(listedTags.data).toEqual([tag]);
  });
});
