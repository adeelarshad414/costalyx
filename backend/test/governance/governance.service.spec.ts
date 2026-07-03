import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GovernanceService } from '../../src/governance/governance.service';
import type { AuthenticatedUser } from '../../src/security/token-verifier';

const actor: AuthenticatedUser = { subject: 'admin-user', role: 'admin' };
const accountId = '11111111-1111-4111-8111-111111111111';

describe('GovernanceService', () => {
  let service: GovernanceService;

  beforeEach(() => {
    service = new GovernanceService();
  });

  it('creates account references without exposing Vault paths in list responses', () => {
    const account = service.createAccount(
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
    expect(service.listAccounts({ page: 1, pageSize: 25 }).data[0]).not.toHaveProperty('vaultCredentialPath');
  });

  it('creates, updates, deletes, and idempotently replays account groups', () => {
    const created = service.createAccountGroup(
      { name: 'Platform', accountIds: [accountId] },
      actor,
      'group-create-key'
    );
    expect(service.createAccountGroup({ name: 'Ignored', accountIds: [] }, actor, 'group-create-key')).toBe(created);

    const updated = service.updateAccountGroup(created.id, { name: 'Platform owners' }, actor, 'group-update-key');
    expect(updated).toMatchObject({ name: 'Platform owners', accountIds: [accountId] });

    service.deleteAccountGroup(created.id, actor, 'group-delete-key');
    expect(service.listAccountGroups({ page: 1, pageSize: 25 }).data).toEqual([]);
    expect(() => service.updateAccountGroup(created.id, { name: 'Missing' }, actor, 'group-missing-key')).toThrow(
      NotFoundException
    );
  });

  it('stores credential references only and records rotation audit evidence', () => {
    const credential = service.createCredential(
      {
        provider: 'aws',
        accountId,
        displayName: 'AWS billing',
        vaultPath: 'kv/costalyx/aws/prod'
      },
      actor,
      'credential-create-key'
    );
    const rotated = service.rotateCredential(
      credential.id,
      { vaultPath: 'kv/costalyx/aws/prod-v2' },
      actor,
      'credential-rotate-key'
    );

    expect(rotated.vaultPath).toBe('kv/costalyx/aws/prod-v2');
    expect(rotated.rotatedAt).toEqual(expect.any(String));
    expect(() => service.rotateCredential('22222222-2222-4222-8222-222222222222', { vaultPath: 'kv/missing' }, actor, 'missing')).toThrow(
      NotFoundException
    );
  });

  it('keeps Milestone B roles fixed while auditing user role changes', () => {
    const user = service.createUser(
      { email: 'viewer@example.test', displayName: 'Viewer User', roles: ['viewer'] },
      actor,
      'user-create-key'
    );

    expect(user.roles).toEqual(['viewer']);
    expect(service.listRoles()).toEqual({
      data: [
        { name: 'viewer', fixed: true },
        { name: 'analyst', fixed: true },
        { name: 'admin', fixed: true }
      ]
    });
    expect(() => service.rejectCustomRoleCreation()).toThrow(BadRequestException);
    expect(service.listAuditLog({ page: 1, pageSize: 25 }).data.map((entry) => entry.action)).toContain('role_change');
  });

  it('returns paginated hash-chained audit entries', () => {
    service.createUser(
      { email: 'analyst@example.test', displayName: 'Analyst User', roles: ['analyst'] },
      actor,
      'audit-user-key'
    );
    service.createCredential(
      {
        provider: 'gcp',
        accountId,
        displayName: 'GCP billing',
        vaultPath: 'kv/costalyx/gcp/prod'
      },
      actor,
      'audit-credential-key'
    );

    const audit = service.listAuditLog({ page: 1, pageSize: 1 });
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
