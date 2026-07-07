import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { InMemoryAuditLogStore } from '../../src/audit/audit-log.store';
import { DEFAULT_TENANT_ID, type AuthenticatedUser } from '../../src/security/token-verifier';

const actor: AuthenticatedUser = { subject: 'audit-user', role: 'admin', tenantId: DEFAULT_TENANT_ID };

const auditMatrix = [
  ['tenant_created', 'tenant'],
  ['cloud_connection_created', 'cloud_connection'],
  ['cloud_connection_validated', 'cloud_connection'],
  ['cloud_connection_run_recorded', 'cloud_connection'],
  ['account_created', 'account'],
  ['account_group_created', 'account_group'],
  ['account_group_updated', 'account_group'],
  ['account_group_deleted', 'account_group'],
  ['credential_created', 'cloud_credential'],
  ['credential_rotated', 'cloud_credential'],
  ['role_change', 'user'],
  ['view_created', 'view'],
  ['dimension_created', 'dimension'],
  ['dimension_mapping_created', 'dimension_mapping'],
  ['resource_tag_upserted', 'resource_tag'],
  ['recommendation_applied', 'recommendation'],
  ['statement_stakeholder_created', 'statement_stakeholder'],
  ['billing_scope_created', 'billing_scope'],
  ['billing_statements_generated', 'billing_statement_period'],
  ['billing_statement_approved', 'billing_statement'],
  ['billing_statement_sent', 'billing_statement'],
  ['billing_statement_disputed', 'billing_statement'],
  ['billing_statement_voided', 'billing_statement'],
  ['billing_statement_updated', 'billing_statement'],
  ['agent_run_recorded', 'agent_run']
] as const;

describe('Audit log completeness matrix', () => {
  it('keeps direct source audit actions represented in the matrix', () => {
    const matrixActions = new Set(auditMatrix.map(([action]) => action));
    const sourceActions = extractDirectAuditActions(readBackendSource());

    expect(sourceActions.size).toBeGreaterThan(0);
    for (const action of sourceActions) {
      expect(matrixActions).toContain(action);
    }
  });

  it('records tenant, actor, action, target, outcome, timestamp, and hash-chain fields for every audited action', async () => {
    const store = new InMemoryAuditLogStore();

    for (const [action, targetType] of auditMatrix) {
      await store.append(actor, action, targetType, `${targetType}-1`);
    }

    const audit = await store.list({ page: 1, pageSize: auditMatrix.length }, actor.tenantId);
    expect(audit.meta.total).toBe(auditMatrix.length);
    expect(audit.data.every((entry) => entry.tenantId === actor.tenantId)).toBe(true);
    expect(audit.data.every((entry) => entry.actorId && entry.actorId !== actor.subject)).toBe(true);
    expect(audit.data.every((entry) => entry.outcome === 'succeeded')).toBe(true);
    expect(audit.data.every((entry) => entry.hash && entry.createdAt)).toBe(true);

    const byAction = new Map(audit.data.map((entry) => [entry.action, entry]));
    for (const [action, targetType] of auditMatrix) {
      expect(byAction.get(action)).toEqual(
        expect.objectContaining({
          action,
          targetType,
          targetId: `${targetType}-1`,
          outcome: 'succeeded'
        })
      );
    }
  });
});

function extractDirectAuditActions(source: string): Set<string> {
  const actions = new Set<string>();
  const pattern = /((?:appendAudit|auditLog\.append)\([\s\S]{0,220}?)['`]([a-z][a-z0-9_]+)['`]/g;
  for (const match of source.matchAll(pattern)) {
    if (match[1].includes('auditActionForStatementStatus')) {
      continue;
    }
    actions.add(match[2]);
  }
  return actions;
}

function readBackendSource(): string {
  return walk(join(process.cwd(), 'src'))
    .filter((file) => file.endsWith('.ts'))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
}

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
