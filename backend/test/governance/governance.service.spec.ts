import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GovernanceService } from '../../src/governance/governance.service';
import { InMemoryGovernanceRepository } from '../../src/governance/in-memory-governance.repository';
import type { AuthenticatedUser } from '../../src/security/token-verifier';

const actor: AuthenticatedUser = { subject: 'admin-user', role: 'admin' };
const accountId = '11111111-1111-4111-8111-111111111111';

describe('GovernanceService', () => {
  let service: GovernanceService;

  beforeEach(() => {
    service = new GovernanceService(new InMemoryGovernanceRepository());
  });

  it('creates account references without exposing Vault paths in list responses', async () => {
    const account = await service.createAccount(
      {
        provider: 'aws',
        externalAccountId: '123456789012',
        displayName: 'AWS production',
        vaultCredentialPath: 'kv/costalyx/aws/prod'
      },
      actor,
      'account-create-key'
    );

    expect(account.vaultCredentialPath).toBe('kv/costalyx/aws/prod');
    expect((await service.listAccounts({ page: 1, pageSize: 25 })).data[0]).not.toHaveProperty('vaultCredentialPath');
  });

  it('creates, updates, deletes, and idempotently replays account groups', async () => {
    const created = await service.createAccountGroup(
      { name: 'Platform', accountIds: [accountId] },
      actor,
      'group-create-key'
    );
    await expect(service.createAccountGroup({ name: 'Ignored', accountIds: [] }, actor, 'group-create-key')).resolves.toBe(
      created
    );

    const updated = await service.updateAccountGroup(created.id, { name: 'Platform owners' }, actor, 'group-update-key');
    expect(updated).toMatchObject({ name: 'Platform owners', accountIds: [accountId] });

    await service.deleteAccountGroup(created.id, actor, 'group-delete-key');
    expect((await service.listAccountGroups({ page: 1, pageSize: 25 })).data).toEqual([]);
    await expect(service.updateAccountGroup(created.id, { name: 'Missing' }, actor, 'group-missing-key')).rejects.toThrow(
      NotFoundException
    );
  });

  it('stores credential references only and records rotation audit evidence', async () => {
    const credential = await service.createCredential(
      {
        provider: 'aws',
        accountId,
        displayName: 'AWS billing',
        vaultPath: 'kv/costalyx/aws/prod'
      },
      actor,
      'credential-create-key'
    );
    const rotated = await service.rotateCredential(
      credential.id,
      { vaultPath: 'kv/costalyx/aws/prod-v2' },
      actor,
      'credential-rotate-key'
    );

    expect(rotated.vaultPath).toBe('kv/costalyx/aws/prod-v2');
    expect(rotated.rotatedAt).toEqual(expect.any(String));
    await expect(
      service.rotateCredential('22222222-2222-4222-8222-222222222222', { vaultPath: 'kv/missing' }, actor, 'missing')
    ).rejects.toThrow(
      NotFoundException
    );
  });

  it('keeps Milestone B roles fixed while auditing user role changes', async () => {
    const user = await service.createUser(
      { email: 'viewer@example.test', displayName: 'Viewer User', roles: ['viewer'] },
      actor,
      'user-create-key'
    );

    expect(user.roles).toEqual(['viewer']);
    expect(await service.listRoles()).toEqual({
      data: [
        { name: 'viewer', fixed: true },
        { name: 'analyst', fixed: true },
        { name: 'admin', fixed: true }
      ]
    });
    expect(() => service.rejectCustomRoleCreation()).toThrow(BadRequestException);
    expect((await service.listAuditLog({ page: 1, pageSize: 25 })).data.map((entry) => entry.action)).toContain(
      'role_change'
    );
  });

  it('returns paginated hash-chained audit entries', async () => {
    await service.createUser(
      { email: 'analyst@example.test', displayName: 'Analyst User', roles: ['analyst'] },
      actor,
      'audit-user-key'
    );
    await service.createCredential(
      {
        provider: 'gcp',
        accountId,
        displayName: 'GCP billing',
        vaultPath: 'kv/costalyx/gcp/prod'
      },
      actor,
      'audit-credential-key'
    );

    const audit = await service.listAuditLog({ page: 1, pageSize: 1 });
    expect(audit.meta).toEqual({ total: 2, page: 1, pageSize: 1 });
    expect(audit.data[0]).toEqual(
      expect.objectContaining({
        actorId: expect.any(String),
        hash: expect.any(String),
        prevHash: expect.any(String)
      })
    );
  });
});
