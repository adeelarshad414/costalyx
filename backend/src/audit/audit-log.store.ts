import { createHash, randomUUID } from 'node:crypto';
import { stableId } from '../cost-model/stable-id';
import type { PageQuery, Paginated, AuditLogEntry } from '../governance/governance.types';
import type { AuthenticatedUser } from '../security/token-verifier';

export const AUDIT_LOG_STORE = Symbol('AUDIT_LOG_STORE');

export interface AuditLogStore {
  append(actor: AuthenticatedUser, action: string, targetType: string, targetId: string): Promise<void>;
  list(query: PageQuery): Promise<Paginated<AuditLogEntry>>;
}

export class InMemoryAuditLogStore implements AuditLogStore {
  private readonly entries: AuditLogEntry[] = [];

  async append(actor: AuthenticatedUser, action: string, targetType: string, targetId: string): Promise<void> {
    const prevHash = this.entries[this.entries.length - 1]?.hash ?? null;
    const entryWithoutHash = {
      id: randomUUID(),
      actorId: stableId(`actor:${actor.subject}`),
      action,
      targetType,
      targetId,
      prevHash,
      createdAt: new Date().toISOString()
    };
    const hash = createHash('sha256').update(canonicalJson(entryWithoutHash)).digest('hex');
    this.entries.push({ ...entryWithoutHash, hash });
  }

  async list(query: PageQuery): Promise<Paginated<AuditLogEntry>> {
    const start = (query.page - 1) * query.pageSize;
    const items = [...this.entries].reverse();
    return {
      data: items.slice(start, start + query.pageSize),
      meta: { total: items.length, page: query.page, pageSize: query.pageSize }
    };
  }
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
}
