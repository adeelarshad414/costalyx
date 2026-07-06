import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InMemoryAuditLogStore, type AuditLogStore } from '../audit/audit-log.store';
import { stableId } from '../cost-model/stable-id';
import type { AuthenticatedUser } from '../security/token-verifier';
import type { BillingAgentRepository } from './billing-agent.repository';
import type {
  AgentRun,
  AgentRunCreateInput,
  AgentRunQuery,
  BillingScope,
  BillingAnomaly,
  BillingAnomalyCandidate,
  BillingAnomalyQuery,
  BillingStatement,
  BillingStatementDispute,
  BillingStatementGenerateResult,
  BillingStatementQuery,
  BillingStatementStatus,
  FalsePositiveReason,
  StatementStakeholder,
  SuppressionInput
} from './billing-agent.types';

@Injectable()
export class InMemoryBillingAgentRepository implements BillingAgentRepository {
  private readonly anomalies = new Map<string, BillingAnomaly>();
  private readonly suppressions = new Map<string, Set<string>>();
  private readonly idempotency = new Map<string, unknown>();
  private readonly stakeholders = new Map<string, StatementStakeholder>();
  private readonly scopes = new Map<string, BillingScope>();
  private readonly statements = new Map<string, BillingStatement>();
  private readonly agentRuns = new Map<string, AgentRun>();

  constructor(private readonly auditLog: AuditLogStore = new InMemoryAuditLogStore()) {}

  async upsertAnomalyCandidates(
    tenantId: string,
    candidates: BillingAnomalyCandidate[]
  ): Promise<{ created: BillingAnomaly[]; all: BillingAnomaly[] }> {
    const created: BillingAnomaly[] = [];
    const all: BillingAnomaly[] = [];
    for (const candidate of candidates) {
      const existing = this.anomalies.get(candidate.id);
      if (existing) {
        if (existing.status === 'open') {
          const refreshed = { ...candidate, status: existing.status, assignedOwnerId: existing.assignedOwnerId };
          this.anomalies.set(candidate.id, refreshed);
          all.push(refreshed);
        } else {
          all.push(existing);
        }
        continue;
      }
      const anomaly: BillingAnomaly = {
        ...candidate,
        tenantId,
        status: 'open',
        assignedOwnerId: null
      };
      this.anomalies.set(anomaly.id, anomaly);
      created.push(anomaly);
      all.push(anomaly);
    }
    return { created, all };
  }

  async listAnomalies(query: BillingAnomalyQuery) {
    const items = [...this.anomalies.values()]
      .filter((anomaly) => anomaly.tenantId === query.tenantId)
      .filter((anomaly) => !query.type || anomaly.type === query.type)
      .filter((anomaly) => !query.status || anomaly.status === query.status)
      .sort((left, right) => right.detectedAt.localeCompare(left.detectedAt) || left.id.localeCompare(right.id));
    const start = (query.page - 1) * query.pageSize;
    return {
      data: items.slice(start, start + query.pageSize),
      meta: { total: items.length, page: query.page, pageSize: query.pageSize }
    };
  }

  async updateAnomalyStatus(input: {
    id: string;
    tenantId: string;
    status: BillingAnomaly['status'];
    falsePositiveReason?: FalsePositiveReason;
    falsePositiveNote?: string;
    idempotencyKey: string;
  }): Promise<BillingAnomaly> {
    const idempotencyScope = `${input.tenantId}:${input.idempotencyKey}`;
    const replay = this.idempotency.get(idempotencyScope) as BillingAnomaly | undefined;
    if (replay) {
      return replay;
    }
    const anomaly = this.anomalies.get(input.id);
    if (!anomaly || anomaly.tenantId !== input.tenantId) {
      throw new NotFoundException(`Anomaly ${input.id} was not found.`);
    }
    const falsePositiveReason =
      input.status === 'false_positive' ? requireFalsePositiveReason(input.falsePositiveReason) : null;
    const updated = { ...anomaly, status: input.status };
    this.anomalies.set(input.id, updated);
    if (input.status === 'false_positive') {
      await this.recordSuppression({
        anomaly: updated,
        reason: falsePositiveReason!,
        note: input.falsePositiveNote
      });
    }
    this.idempotency.set(idempotencyScope, updated);
    return updated;
  }

  async listSuppressedFingerprints(tenantId: string): Promise<Set<string>> {
    return new Set(this.suppressions.get(tenantId) ?? []);
  }

  async recordSuppression(input: SuppressionInput): Promise<void> {
    const existing = this.suppressions.get(input.anomaly.tenantId) ?? new Set<string>();
    existing.add(input.anomaly.evidence.fingerprint);
    this.suppressions.set(input.anomaly.tenantId, existing);
  }

  async createStatementStakeholder(
    input: {
      tenantId: string;
      name: string;
      email: string;
      roleLabel: string;
      notificationChannel: StatementStakeholder['notificationChannel'];
      idempotencyKey: string;
    },
    actor: AuthenticatedUser
  ): Promise<StatementStakeholder> {
    return this.withIdempotency(input.tenantId, input.idempotencyKey, async () => {
      const stakeholder: StatementStakeholder = {
        id: stableId(`statement-stakeholder:${input.tenantId}:${input.email.toLowerCase()}`),
        tenantId: input.tenantId,
        name: input.name,
        email: input.email,
        roleLabel: input.roleLabel,
        notificationChannel: input.notificationChannel,
        createdAt: new Date().toISOString()
      };
      this.stakeholders.set(stakeholder.id, stakeholder);
      await this.auditLog.append(actor, 'statement_stakeholder_created', 'statement_stakeholder', stakeholder.id);
      return stakeholder;
    });
  }

  async listStatementStakeholders(tenantId: string): Promise<StatementStakeholder[]> {
    return [...this.stakeholders.values()]
      .filter((stakeholder) => stakeholder.tenantId === tenantId)
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  }

  async createBillingScope(
    input: {
      tenantId: string;
      stakeholderId: string;
      scopeType: BillingScope['scopeType'];
      scopeRef: string;
      label: string;
      scopeFilter: BillingScope['scopeFilter'];
      idempotencyKey: string;
    },
    actor: AuthenticatedUser
  ): Promise<BillingScope> {
    return this.withIdempotency(input.tenantId, input.idempotencyKey, async () => {
      const stakeholder = this.stakeholders.get(input.stakeholderId);
      if (!stakeholder || stakeholder.tenantId !== input.tenantId) {
        throw new NotFoundException(`Stakeholder ${input.stakeholderId} was not found.`);
      }
      const scope: BillingScope = {
        id: stableId(`billing-scope:${input.tenantId}:${input.stakeholderId}:${input.scopeType}:${input.scopeRef}`),
        tenantId: input.tenantId,
        stakeholderId: input.stakeholderId,
        scopeType: input.scopeType,
        scopeRef: input.scopeRef,
        label: input.label,
        scopeFilter: input.scopeFilter,
        createdAt: new Date().toISOString()
      };
      this.scopes.set(scope.id, scope);
      await this.auditLog.append(actor, 'billing_scope_created', 'billing_scope', scope.id);
      return scope;
    });
  }

  async listBillingScopes(tenantId: string): Promise<BillingScope[]> {
    return [...this.scopes.values()]
      .filter((scope) => scope.tenantId === tenantId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  }

  async saveGeneratedStatements(
    input: BillingStatementGenerateResult & { tenantId: string; periodStart: string; periodEnd: string; idempotencyKey: string },
    actor: AuthenticatedUser
  ): Promise<BillingStatementGenerateResult> {
    return this.withIdempotency(input.tenantId, input.idempotencyKey, async () => {
      for (const statement of input.statements) {
        this.statements.set(statement.id, statement);
      }
      await this.auditLog.append(
        actor,
        'billing_statements_generated',
        'billing_statement_period',
        stableId(`billing-statement-period:${input.tenantId}:${input.periodStart}:${input.periodEnd}`)
      );
      return {
        statements: input.statements,
        reconciliation: input.reconciliation,
        scopeWarnings: input.scopeWarnings
      };
    });
  }

  async listStatements(query: BillingStatementQuery) {
    const items = [...this.statements.values()]
      .filter((statement) => statement.tenantId === query.tenantId)
      .filter((statement) => !query.status || statement.status === query.status)
      .filter((statement) => !query.stakeholderId || statement.stakeholderId === query.stakeholderId)
      .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt) || left.id.localeCompare(right.id));
    return paginate(items, query);
  }

  async getStatement(id: string, tenantId: string): Promise<BillingStatement> {
    const statement = this.statements.get(id);
    if (!statement || statement.tenantId !== tenantId) {
      throw new NotFoundException(`Billing statement ${id} was not found.`);
    }
    return statement;
  }

  async transitionStatement(
    input: {
      id: string;
      tenantId: string;
      status: BillingStatementStatus;
      idempotencyKey: string;
      approvedBy?: string;
      sentAt?: string;
      dispute?: BillingStatementDispute;
      sendEvidence?: Record<string, unknown>;
    },
    actor: AuthenticatedUser
  ): Promise<BillingStatement> {
    return this.withIdempotency(input.tenantId, input.idempotencyKey, async () => {
      const current = await this.getStatement(input.id, input.tenantId);
      const updated: BillingStatement = {
        ...current,
        status: input.status,
        approvedBy: input.approvedBy ?? current.approvedBy,
        sentAt: input.sentAt ?? current.sentAt,
        dispute: input.dispute ?? current.dispute,
        sendEvidence: input.sendEvidence ?? current.sendEvidence
      };
      this.statements.set(input.id, updated);
      await this.auditLog.append(actor, auditActionForStatementStatus(input.status), 'billing_statement', input.id);
      return updated;
    });
  }

  async createAgentRun(input: AgentRunCreateInput, actor: AuthenticatedUser): Promise<AgentRun> {
    this.agentRuns.set(input.id, input);
    await this.auditLog.append(actor, 'agent_run_recorded', 'agent_run', input.id);
    return input;
  }

  async listAgentRuns(query: AgentRunQuery) {
    const items = [...this.agentRuns.values()]
      .filter((run) => run.tenantId === query.tenantId)
      .filter((run) => !query.runType || run.runType === query.runType)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt) || left.id.localeCompare(right.id));
    return paginate(items, query);
  }

  private async withIdempotency<T>(tenantId: string, idempotencyKey: string, create: () => Promise<T>): Promise<T> {
    const scopedKey = `${tenantId}:${idempotencyKey}`;
    const replay = this.idempotency.get(scopedKey) as T | undefined;
    if (replay) {
      return replay;
    }
    const response = await create();
    this.idempotency.set(scopedKey, response);
    return response;
  }
}

function requireFalsePositiveReason(value: FalsePositiveReason | undefined): FalsePositiveReason {
  if (!value) {
    throw new BadRequestException('falsePositiveReason is required when marking an anomaly false_positive.');
  }
  return value;
}

function auditActionForStatementStatus(status: BillingStatementStatus): string {
  if (status === 'approved') {
    return 'billing_statement_approved';
  }
  if (status === 'sent') {
    return 'billing_statement_sent';
  }
  if (status === 'disputed') {
    return 'billing_statement_disputed';
  }
  if (status === 'void') {
    return 'billing_statement_voided';
  }
  return 'billing_statement_updated';
}

function paginate<T>(items: T[], query: { page: number; pageSize: number }) {
  const page = Number.isFinite(Number(query.page)) && Number(query.page) > 0 ? Number(query.page) : 1;
  const pageSize = Number.isFinite(Number(query.pageSize)) && Number(query.pageSize) > 0 ? Number(query.pageSize) : 25;
  const start = (page - 1) * pageSize;
  return {
    data: items.slice(start, start + pageSize),
    meta: { total: items.length, page, pageSize }
  };
}
