import { NotFoundException } from '@nestjs/common';
import { PostgresGovernanceRepository } from '../../src/governance/postgres-governance.repository';
import { DEFAULT_TENANT_ID, type AuthenticatedUser } from '../../src/security/token-verifier';

type QueryResult = { rows: unknown[]; rowCount?: number };

class FakePgClient {
  readonly queries: Array<{ sql: string; params: unknown[] }> = [];

  constructor(private readonly results: QueryResult[]) {}

  async query(sql: string, params: unknown[] = []) {
    this.queries.push({ sql, params });
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) {
      return { rows: [], rowCount: 0 };
    }
    return this.results.shift() ?? { rows: [], rowCount: 0 };
  }

  release = jest.fn();
}

class FakePool {
  readonly client: FakePgClient;

  constructor(results: QueryResult[]) {
    this.client = new FakePgClient(results);
  }

  connect = jest.fn(async () => this.client);
  query = jest.fn(async (sql: string, params: unknown[] = []) => this.client.query(sql, params));
}

const actor: AuthenticatedUser = { subject: 'admin-user', role: 'admin', tenantId: DEFAULT_TENANT_ID };
const credentialRow = {
  id: '11111111-1111-4111-8111-111111111111',
  tenant_id: DEFAULT_TENANT_ID,
  provider: 'aws',
  account_id: '22222222-2222-4222-8222-222222222222',
  display_name: 'AWS production billing',
  vault_path: 'kv/costalyx/aws/prod-billing',
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  rotated_at: null
};

describe('PostgresGovernanceRepository', () => {
  it('persists credential references with parameterized SQL and audit evidence', async () => {
    const pool = new FakePool([
      { rows: [], rowCount: 0 },
      { rows: [credentialRow], rowCount: 1 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 }
    ]);
    const repository = new PostgresGovernanceRepository(pool as never);

    const result = await repository.createCredential(
      {
        provider: 'aws',
        accountId: '22222222-2222-4222-8222-222222222222',
        displayName: 'AWS production billing',
        vaultPath: 'kv/costalyx/aws/prod-billing'
      },
      actor,
      'credential-idem-1'
    );

    const combinedSql = pool.client.queries.map((query) => query.sql).join('\n');
    expect(result).toMatchObject({ provider: 'aws', vaultPath: 'kv/costalyx/aws/prod-billing' });
    expect(combinedSql).toContain('INSERT INTO cloud_credentials');
    expect(combinedSql).toContain('INSERT INTO audit_log');
    expect(combinedSql).not.toContain('kv/costalyx/aws/prod-billing');
    expect(pool.client.queries.flatMap((query) => query.params)).toContain('kv/costalyx/aws/prod-billing');
    expect(pool.client.queries.at(-1)?.sql).toBe('COMMIT');
  });

  it('replays persisted idempotent governance responses without writing duplicate rows', async () => {
    const pool = new FakePool([
      {
        rows: [
          {
            response_json: credentialRow
          }
        ],
        rowCount: 1
      }
    ]);
    const repository = new PostgresGovernanceRepository(pool as never);

    const result = await repository.createCredential(
      {
        provider: 'aws',
        accountId: '22222222-2222-4222-8222-222222222222',
        displayName: 'Ignored replay body',
        vaultPath: 'kv/replayed'
      },
      actor,
      'credential-idem-1'
    );

    expect(result.id).toBe(credentialRow.id);
    expect(pool.client.queries.some((query) => query.sql.includes('INSERT INTO cloud_credentials'))).toBe(false);
    expect(pool.client.queries.at(-1)?.sql).toBe('COMMIT');
  });

  it('rolls back and throws NotFoundException when rotating a missing credential', async () => {
    const pool = new FakePool([
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 }
    ]);
    const repository = new PostgresGovernanceRepository(pool as never);

    await expect(
      repository.rotateCredential(
        '33333333-3333-4333-8333-333333333333',
        { vaultPath: 'kv/missing' },
        actor,
        'missing-rotate-idem'
      )
    ).rejects.toThrow(NotFoundException);

    expect(pool.client.queries.at(-1)?.sql).toBe('ROLLBACK');
  });
});
