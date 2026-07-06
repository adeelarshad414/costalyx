import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { connect } from 'node:net';
import { CostModelService } from '../cost-model/cost-model.service';
import type { NormalizedCostRecord } from '../cost-model/cost-record.types';
import { formatDecimal, multiplyMoney, roundMoneyToCent } from '../cost-model/decimal';
import { stableId } from '../cost-model/stable-id';
import type { AuthenticatedUser } from '../security/token-verifier';
import {
  BILLING_AGENT_EVENT_PUBLISHER,
  BILLING_AGENT_EVENT_TOPIC,
  type BillingAgentEventPublisher
} from './billing-agent-event.publisher';
import { BILLING_AGENT_REPOSITORY, type BillingAgentRepository } from './billing-agent.repository';
import type {
  AnomalyEvidence,
  AnomalySeverity,
  AnomalyType,
  BillingScope,
  BillingScopeFilter,
  BillingAnomaly,
  BillingAnomalyCandidate,
  BillingAnomalyQuery,
  BillingStatement,
  BillingStatementDispute,
  BillingStatementGenerateInput,
  BillingStatementLineItem,
  BillingStatementQuery,
  BillingStatementReconciliation,
  BillingStatementScopeWarning,
  BillingStatementStatus,
  BillingStatementVarianceMover,
  BillingAnomalyScanResult,
  DetectionConfig,
  FalsePositiveReason
} from './billing-agent.types';
import { assertValidNumericClaims } from './numeric-claims';

const monthlyHours = 730;

const defaultConfig: DetectionConfig = {
  unitPriceChangePercent: 20,
  usageWindowDays: 28,
  usageMadThreshold: 3,
  newSpendFloorUsd: 25,
  commitmentCoverageFloor: 0.5
};

@Injectable()
export class BillingAgentService {
  constructor(
    private readonly costModel: CostModelService,
    @Inject(BILLING_AGENT_REPOSITORY) private readonly repository: BillingAgentRepository,
    @Inject(BILLING_AGENT_EVENT_PUBLISHER) private readonly events: BillingAgentEventPublisher
  ) {}

  async scanAnomalies(tenantId: string, config: Partial<DetectionConfig> = {}): Promise<BillingAnomalyScanResult> {
    const mergedConfig = { ...defaultConfig, ...config };
    const records = await this.loadTenantRecords(tenantId);
    const suppressed = await this.repository.listSuppressedFingerprints(tenantId);
    const candidates = [
      ...detectUnitPriceAnomalies(tenantId, records, mergedConfig),
      ...detectUsageAnomalies(tenantId, records, mergedConfig),
      ...detectNewSpendAnomalies(tenantId, records, mergedConfig),
      ...detectCoverageAnomalies(tenantId, records, mergedConfig)
    ].filter((candidate) => !suppressed.has(candidate.evidence.fingerprint));

    const saved = await this.repository.upsertAnomalyCandidates(tenantId, candidates);
    await Promise.all(
      saved.created.map((anomaly) =>
        this.events.publish(BILLING_AGENT_EVENT_TOPIC, {
          id: stableId(`billing-agent-event:${tenantId}:${anomaly.id}:detected`),
          tenantId,
          type: 'anomaly_detected',
          anomalyId: anomaly.id,
          anomalyType: anomaly.type,
          severity: anomaly.severity,
          occurredAt: anomaly.detectedAt
        })
      )
    );

    const open = await this.repository.listAnomalies({ tenantId, status: 'open', page: 1, pageSize: 1 });
    return { created: saved.created, totalOpen: open.meta.total };
  }

  listAnomalies(query: BillingAnomalyQuery) {
    return this.repository.listAnomalies(query);
  }

  createStatementStakeholder(
    input: {
      name: string;
      email: string;
      roleLabel: string;
      notificationChannel: 'email' | 'none';
    },
    actor: AuthenticatedUser,
    idempotencyKey: string
  ) {
    return this.repository.createStatementStakeholder({ ...input, tenantId: actor.tenantId, idempotencyKey }, actor);
  }

  listStatementStakeholders(tenantId: string) {
    return this.repository.listStatementStakeholders(tenantId);
  }

  createBillingScope(
    input: {
      stakeholderId: string;
      scopeType: BillingScope['scopeType'];
      scopeRef: string;
      label?: string;
      scopeFilter?: BillingScopeFilter;
    },
    actor: AuthenticatedUser,
    idempotencyKey: string
  ) {
    return this.repository.createBillingScope(
      {
        tenantId: actor.tenantId,
        stakeholderId: input.stakeholderId,
        scopeType: input.scopeType,
        scopeRef: input.scopeRef,
        label: input.label ?? input.scopeRef,
        scopeFilter: input.scopeFilter ?? {},
        idempotencyKey
      },
      actor
    );
  }

  listBillingScopes(tenantId: string) {
    return this.repository.listBillingScopes(tenantId);
  }

  async generateStatements(
    input: BillingStatementGenerateInput,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ) {
    const period = normalizePeriod(input);
    const [stakeholders, scopes, tenantRecords, openAnomalies] = await Promise.all([
      this.repository.listStatementStakeholders(actor.tenantId),
      this.repository.listBillingScopes(actor.tenantId),
      this.loadRecordsForQuery(actor.tenantId, period),
      this.repository.listAnomalies({ tenantId: actor.tenantId, status: 'open', page: 1, pageSize: 200 })
    ]);
    if (stakeholders.length === 0) {
      throw new BadRequestException('At least one statement stakeholder is required before generating statements.');
    }

    const recordCostCents = new Map(tenantRecords.map((record) => [record.id, costRecordCents(record)]));
    const assignmentCounts = new Map<string, { count: number; stakeholderIds: Set<string> }>();
    const generatedAt = new Date().toISOString();
    const statementsWithoutReconciliation: BillingStatement[] = [];

    for (const stakeholder of stakeholders) {
      const stakeholderScopes = scopes.filter((scope) => scope.stakeholderId === stakeholder.id);
      const assigned = new Map<string, NormalizedCostRecord>();
      const lineItems: BillingStatementLineItem[] = [];
      for (const scope of stakeholderScopes) {
        const records = await this.recordsForScope(actor.tenantId, period, scope, tenantRecords);
        const uniqueForScope = uniqueRecords(records);
        for (const record of uniqueForScope) {
          assigned.set(record.id, record);
        }
        const amountCents = sumCents(uniqueForScope.map(costRecordCents));
        lineItems.push({
          id: stableId(`statement-line:${actor.tenantId}:${stakeholder.id}:${scope.id}:cost`),
          tenantId: actor.tenantId,
          statementId: stableId(`billing-statement:${actor.tenantId}:${stakeholder.id}:${period.start}:${period.end}`),
          lineType: 'cost',
          description: `${scope.label} spend`,
          amountUsd: centsToMoney(amountCents),
          costRecordIds: uniqueForScope.map((record) => record.id),
          evidence: {
            scopeId: scope.id,
            scopeType: scope.scopeType,
            scopeRef: scope.scopeRef
          }
        });
      }

      for (const recordId of assigned.keys()) {
        const existing = assignmentCounts.get(recordId) ?? { count: 0, stakeholderIds: new Set<string>() };
        existing.count += 1;
        existing.stakeholderIds.add(stakeholder.id);
        assignmentCounts.set(recordId, existing);
      }

      const statementAnomalies = openAnomalies.data.filter((anomaly) =>
        anomalyOverlapsStatement(anomaly, period, new Set(assigned.keys()))
      );
      for (const anomaly of statementAnomalies) {
        lineItems.push({
          id: stableId(`statement-line:${actor.tenantId}:${stakeholder.id}:${anomaly.id}:anomaly`),
          tenantId: actor.tenantId,
          statementId: stableId(`billing-statement:${actor.tenantId}:${stakeholder.id}:${period.start}:${period.end}`),
          lineType: 'anomaly',
          description: anomaly.explanationMd,
          amountUsd: '0.00',
          costRecordIds: anomaly.evidence.costRecordIds,
          evidence: {
            anomalyId: anomaly.id,
            type: anomaly.type,
            severity: anomaly.severity
          }
        });
      }

      const assignedRecords = [...assigned.values()];
      const totalCents = sumCents(assignedRecords.map(costRecordCents));
      const varianceTopMovers = await this.calculateVarianceMovers(actor.tenantId, period, stakeholderScopes, assignedRecords);
      const statementId = stableId(`billing-statement:${actor.tenantId}:${stakeholder.id}:${period.start}:${period.end}`);
      statementsWithoutReconciliation.push({
        id: statementId,
        tenantId: actor.tenantId,
        stakeholderId: stakeholder.id,
        stakeholderName: stakeholder.name,
        stakeholderEmail: stakeholder.email,
        periodStart: period.start,
        periodEnd: period.end,
        status: 'pending_approval',
        totalUsd: centsToMoney(totalCents),
        generatedAt,
        approvedBy: null,
        sentAt: null,
        narrativeMd: buildStatementNarrative(stakeholder.name, centsToMoney(totalCents), period),
        openAnomalyCount: statementAnomalies.length,
        lineItems: lineItems.map((lineItem) => ({ ...lineItem, statementId })),
        reconciliation: emptyReconciliation(),
        scopeWarnings: [],
        varianceTopMovers,
        dispute: null,
        sendEvidence: null
      });
    }

    const reconciliation = buildReconciliation(tenantRecords, assignmentCounts, recordCostCents);
    const scopeWarnings = buildScopeWarnings(tenantRecords, assignmentCounts, recordCostCents, reconciliation.unallocatedUsd);
    const statements = statementsWithoutReconciliation.map((statement) => ({
      ...statement,
      reconciliation,
      scopeWarnings
    }));

    return this.repository.saveGeneratedStatements(
      {
        tenantId: actor.tenantId,
        periodStart: period.start,
        periodEnd: period.end,
        idempotencyKey,
        statements,
        reconciliation,
        scopeWarnings
      },
      actor
    );
  }

  listStatements(query: BillingStatementQuery) {
    return this.repository.listStatements(query);
  }

  getStatement(id: string, tenantId: string) {
    return this.repository.getStatement(id, tenantId);
  }

  async approveStatement(id: string, actor: AuthenticatedUser, idempotencyKey: string) {
    const statement = await this.repository.getStatement(id, actor.tenantId);
    if (!['draft', 'pending_approval', 'disputed'].includes(statement.status)) {
      throw new BadRequestException(`Billing statement ${id} cannot be approved from ${statement.status}.`);
    }
    return this.repository.transitionStatement(
      {
        id,
        tenantId: actor.tenantId,
        status: 'approved',
        approvedBy: stableId(`actor:${actor.subject}`),
        idempotencyKey
      },
      actor
    );
  }

  async sendStatement(id: string, actor: AuthenticatedUser, idempotencyKey: string) {
    const statement = await this.repository.getStatement(id, actor.tenantId);
    if (statement.status !== 'approved' || !statement.approvedBy) {
      throw new BadRequestException('Billing statement must be approved before it can be sent.');
    }
    const sentAt = new Date().toISOString();
    const sendEvidence = await deliverStatement(statement, sentAt);
    return this.repository.transitionStatement(
      {
        id,
        tenantId: actor.tenantId,
        status: 'sent',
        sentAt,
        sendEvidence: { ...sendEvidence, approvedBy: statement.approvedBy },
        idempotencyKey
      },
      actor
    );
  }

  async disputeStatement(id: string, note: string, actor: AuthenticatedUser, idempotencyKey: string) {
    const statement = await this.repository.getStatement(id, actor.tenantId);
    const disputedAt = new Date().toISOString();
    const dispute: BillingStatementDispute = {
      previousStatus: statement.status,
      note,
      disputedAt,
      disputedBy: stableId(`actor:${actor.subject}`)
    };
    return this.repository.transitionStatement(
      {
        id,
        tenantId: actor.tenantId,
        status: 'disputed',
        dispute,
        idempotencyKey
      },
      actor
    );
  }

  async exportStatementCsv(id: string, tenantId: string): Promise<string> {
    return renderStatementCsv(await this.repository.getStatement(id, tenantId));
  }

  async exportStatementPdf(id: string, tenantId: string): Promise<Buffer> {
    return renderStatementPdf(await this.repository.getStatement(id, tenantId));
  }

  async updateAnomalyStatus(
    id: string,
    input: { status: BillingAnomaly['status']; falsePositiveReason?: FalsePositiveReason; falsePositiveNote?: string },
    actor: AuthenticatedUser,
    idempotencyKey: string
  ) {
    if (input.status === 'false_positive' && !input.falsePositiveReason) {
      throw new BadRequestException('falsePositiveReason is required when marking an anomaly false_positive.');
    }
    return this.repository.updateAnomalyStatus({ id, tenantId: actor.tenantId, idempotencyKey, ...input });
  }

  private async loadTenantRecords(tenantId: string): Promise<NormalizedCostRecord[]> {
    return this.loadRecordsForQuery(tenantId);
  }

  private async loadRecordsForQuery(
    tenantId: string,
    period?: { start: string; end: string },
    filters: { accountGroupId?: string; dimension?: string } = {}
  ): Promise<NormalizedCostRecord[]> {
    const firstPage = await this.costModel.listRecords({
      tenantId,
      from: period?.start,
      to: period?.end,
      accountGroupId: filters.accountGroupId,
      dimension: filters.dimension,
      page: 1,
      pageSize: 200
    });
    if (firstPage.meta.total <= firstPage.data.length) {
      return firstPage.data;
    }
    const pages = Math.ceil(firstPage.meta.total / 200);
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, index) =>
        this.costModel.listRecords({
          tenantId,
          from: period?.start,
          to: period?.end,
          accountGroupId: filters.accountGroupId,
          dimension: filters.dimension,
          page: index + 2,
          pageSize: 200
        })
      )
    );
    return [...firstPage.data, ...rest.flatMap((page) => page.data)];
  }

  private async recordsForScope(
    tenantId: string,
    period: { start: string; end: string },
    scope: BillingScope,
    tenantRecords: NormalizedCostRecord[]
  ): Promise<NormalizedCostRecord[]> {
    if (hasScopeFilter(scope.scopeFilter)) {
      return tenantRecords.filter((record) => recordMatchesScopeFilter(record, scope.scopeFilter));
    }
    if (scope.scopeType === 'account_group') {
      return this.loadRecordsForQuery(tenantId, period, { accountGroupId: scope.scopeRef });
    }
    if (scope.scopeType === 'dimension') {
      return this.loadRecordsForQuery(tenantId, period, { dimension: scope.scopeRef });
    }
    return tenantRecords.filter((record) => recordMatchesScopeFilter(record, scope.scopeFilter));
  }

  private async calculateVarianceMovers(
    tenantId: string,
    period: { start: string; end: string },
    scopes: BillingScope[],
    currentRecords: NormalizedCostRecord[]
  ): Promise<BillingStatementVarianceMover[]> {
    const durationMs = Math.max(1, new Date(period.end).getTime() - new Date(period.start).getTime());
    const priorEnd = new Date(new Date(period.start).getTime() - 1).toISOString();
    const priorStart = new Date(new Date(period.start).getTime() - durationMs - 1).toISOString();
    const priorTenantRecords = await this.loadRecordsForQuery(tenantId, { start: priorStart, end: priorEnd });
    const priorRecords = scopes.length
      ? uniqueRecords(scopes.flatMap((scope) => priorTenantRecords.filter((record) => recordMatchesScopeFilter(record, scope.scopeFilter))))
      : priorTenantRecords;
    const currentByService = groupCostBy(currentRecords, (record) => record.serviceName);
    const priorByService = groupCostBy(priorRecords, (record) => record.serviceName);
    return [...new Set([...currentByService.keys(), ...priorByService.keys()])]
      .map((label) => {
        const current = currentByService.get(label) ?? 0n;
        const prior = priorByService.get(label) ?? 0n;
        return {
          label,
          currentUsd: centsToMoney(current),
          priorUsd: centsToMoney(prior),
          deltaUsd: centsToMoney(current - prior),
          deltaAbs: current > prior ? current - prior : prior - current
        };
      })
      .sort((left, right) => Number(right.deltaAbs - left.deltaAbs) || left.label.localeCompare(right.label))
      .slice(0, 5)
      .map(({ deltaAbs: _deltaAbs, ...mover }) => mover);
  }
}

function detectUnitPriceAnomalies(
  tenantId: string,
  records: NormalizedCostRecord[],
  config: DetectionConfig
): BillingAnomalyCandidate[] {
  return groupBy(records, (record) => `${record.provider}:${record.accountExternalId}:${record.resourceId}:${record.usageFamily}`)
    .flatMap((groupRecords) => {
      const sorted = groupRecords.sort(compareByStart);
      return sorted.slice(1).flatMap((current, index) => {
        const previous = sorted[index];
        const previousRate = Number(previous.hourlyRateUsd);
        const currentRate = Number(current.hourlyRateUsd);
        if (previousRate <= 0 || currentRate <= previousRate) {
          return [];
        }
        const changePercent = ((currentRate - previousRate) / previousRate) * 100;
        if (changePercent < config.unitPriceChangePercent) {
          return [];
        }
        const monthlyImpactUsd = formatDecimal((currentRate - previousRate) * monthlyHours, 8);
        return [
          buildCandidate({
            tenantId,
            type: 'unit_price',
            severity: severityFromPercent(changePercent),
            windowStart: previous.validFrom,
            windowEnd: current.validFrom,
            records: [previous, current],
            metrics: {
              previousHourlyRateUsd: previous.hourlyRateUsd,
              currentHourlyRateUsd: current.hourlyRateUsd,
              changePercent: formatDecimal(changePercent, 2),
              projectedMonthlyImpactUsd: monthlyImpactUsd
            },
            explanation: `Unit price anomaly: ${current.serviceName} on ${current.resourceId} increased by ${formatDecimal(
              changePercent,
              2
            )}% from $${previous.hourlyRateUsd} to $${current.hourlyRateUsd}. Projected monthly impact at 730 h/mo is $${monthlyImpactUsd}.`,
            expectedClaims: [
              `${formatDecimal(changePercent, 2)}%`,
              `$${previous.hourlyRateUsd}`,
              `$${current.hourlyRateUsd}`,
              `$${monthlyImpactUsd}`
            ]
          })
        ];
      });
    })
    .sort(compareCandidates);
}

function normalizePeriod(input: BillingStatementGenerateInput): { start: string; end: string } {
  const start = new Date(input.periodStart);
  const end = new Date(input.periodEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() < start.getTime()) {
    throw new BadRequestException('periodStart and periodEnd must be valid date-time values with periodEnd after periodStart.');
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

function costRecordCents(record: NormalizedCostRecord): bigint {
  return decimalMoneyToCents(roundMoneyToCent(multiplyMoney(record.hourlyRateUsd, record.usageHours)));
}

function decimalMoneyToCents(value: string): bigint {
  const normalized = value.trim();
  const sign = normalized.startsWith('-') ? -1n : 1n;
  const unsigned = normalized.replace('-', '');
  const [wholeRaw, fractionRaw = ''] = unsigned.split('.');
  const cents = `${fractionRaw}${'0'.repeat(2)}`.slice(0, 2);
  return sign * BigInt(`${wholeRaw || '0'}${cents}`);
}

function centsToMoney(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const raw = absolute.toString().padStart(3, '0');
  return `${sign}${raw.slice(0, -2)}.${raw.slice(-2)}`;
}

function sumCents(values: bigint[]): bigint {
  return values.reduce((sum, value) => sum + value, 0n);
}

function uniqueRecords(records: NormalizedCostRecord[]): NormalizedCostRecord[] {
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

function hasScopeFilter(filter: BillingScopeFilter): boolean {
  return Boolean(filter.accountIds?.length || filter.accountExternalIds?.length || filter.resourceIds?.length);
}

function recordMatchesScopeFilter(record: NormalizedCostRecord, filter: BillingScopeFilter): boolean {
  return (
    (!filter.accountIds?.length || filter.accountIds.includes(record.accountId)) &&
    (!filter.accountExternalIds?.length || filter.accountExternalIds.includes(record.accountExternalId)) &&
    (!filter.resourceIds?.length || filter.resourceIds.includes(record.resourceId))
  );
}

function anomalyOverlapsStatement(
  anomaly: BillingAnomaly,
  period: { start: string; end: string },
  assignedRecordIds: Set<string>
): boolean {
  const windowStart = new Date(anomaly.windowStart).getTime();
  const windowEnd = new Date(anomaly.windowEnd).getTime();
  const periodStart = new Date(period.start).getTime();
  const periodEnd = new Date(period.end).getTime();
  return (
    windowStart <= periodEnd &&
    windowEnd >= periodStart &&
    anomaly.evidence.costRecordIds.some((costRecordId) => assignedRecordIds.has(costRecordId))
  );
}

function emptyReconciliation(): BillingStatementReconciliation {
  return {
    tenantTotalUsd: '0.00',
    allocatedUniqueUsd: '0.00',
    unallocatedUsd: '0.00',
    overlapUsd: '0.00',
    reconcilesToTenantTotal: true
  };
}

function buildReconciliation(
  tenantRecords: NormalizedCostRecord[],
  assignmentCounts: Map<string, { count: number; stakeholderIds: Set<string> }>,
  recordCostCents: Map<string, bigint>
): BillingStatementReconciliation {
  const tenantTotal = sumCents(tenantRecords.map(costRecordCents));
  const allocatedUnique = sumCents(
    [...assignmentCounts.keys()].map((recordId) => recordCostCents.get(recordId) ?? 0n)
  );
  const overlap = sumCents(
    [...assignmentCounts.entries()]
      .filter(([, assignment]) => assignment.count > 1)
      .map(([recordId]) => recordCostCents.get(recordId) ?? 0n)
  );
  const unallocated = tenantTotal - allocatedUnique;
  return {
    tenantTotalUsd: centsToMoney(tenantTotal),
    allocatedUniqueUsd: centsToMoney(allocatedUnique),
    unallocatedUsd: centsToMoney(unallocated),
    overlapUsd: centsToMoney(overlap),
    reconcilesToTenantTotal: allocatedUnique + unallocated === tenantTotal
  };
}

function buildScopeWarnings(
  tenantRecords: NormalizedCostRecord[],
  assignmentCounts: Map<string, { count: number; stakeholderIds: Set<string> }>,
  recordCostCents: Map<string, bigint>,
  unallocatedUsd: string
): BillingStatementScopeWarning[] {
  const warnings: BillingStatementScopeWarning[] = [];
  const overlapIds = [...assignmentCounts.entries()]
    .filter(([, assignment]) => assignment.count > 1)
    .map(([recordId]) => recordId)
    .sort();
  if (overlapIds.length > 0) {
    warnings.push({
      code: 'overlap_detected',
      message: 'One or more cost records are included in multiple stakeholder scopes.',
      amountUsd: centsToMoney(sumCents(overlapIds.map((recordId) => recordCostCents.get(recordId) ?? 0n))),
      costRecordIds: overlapIds
    });
  }
  const unallocatedIds = tenantRecords
    .map((record) => record.id)
    .filter((recordId) => !assignmentCounts.has(recordId))
    .sort();
  if (unallocatedIds.length > 0) {
    warnings.push({
      code: 'unallocated_spend_detected',
      message: 'Some tenant spend is not covered by any stakeholder scope.',
      amountUsd: unallocatedUsd,
      costRecordIds: unallocatedIds
    });
  }
  return warnings;
}

function buildStatementNarrative(stakeholderName: string, totalUsd: string, period: { start: string; end: string }): string {
  return `${stakeholderName} is assigned $${totalUsd} for ${period.start.slice(0, 10)} through ${period.end.slice(
    0,
    10
  )}. Totals are computed from hourly_rate_usd multiplied by usage_hours.`;
}

function groupCostBy(records: NormalizedCostRecord[], keyForRecord: (record: NormalizedCostRecord) => string): Map<string, bigint> {
  const grouped = new Map<string, bigint>();
  for (const record of records) {
    const key = keyForRecord(record);
    grouped.set(key, (grouped.get(key) ?? 0n) + costRecordCents(record));
  }
  return grouped;
}

function renderStatementCsv(statement: BillingStatement): string {
  const lines = [
    'statement_id,stakeholder,status,period_start,period_end,line_type,description,amount_usd',
    ...statement.lineItems.map((lineItem) =>
      [
        csvCell(statement.id),
        csvCell(statement.stakeholderName),
        csvCell(statement.status),
        csvCell(statement.periodStart),
        csvCell(statement.periodEnd),
        csvCell(lineItem.lineType),
        csvCell(lineItem.description),
        csvCell(lineItem.amountUsd)
      ].join(',')
    )
  ];
  return `${lines.join('\n')}\n`;
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function renderStatementPdf(statement: BillingStatement): Buffer {
  const text = [
    `Costalyx Statement ${statement.id}`,
    `Stakeholder ${statement.stakeholderName}`,
    `Status ${statement.status}`,
    `Total USD ${statement.totalUsd}`,
    statement.narrativeMd
  ].join('\\n');
  const escaped = text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const stream = `BT /F1 11 Tf 72 760 Td (${escaped}) Tj ET`;
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj`
  ];
  const body = objects.join('\n');
  return Buffer.from(`%PDF-1.4\n${body}\ntrailer << /Root 1 0 R >>\n%%EOF\n`);
}

async function deliverStatement(statement: BillingStatement, sentAt: string): Promise<Record<string, unknown>> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 25);
  if (!host || statement.stakeholderEmail.length === 0) {
    return {
      channel: statement.stakeholderEmail ? 'email' : 'none',
      deliveryMode: 'audit_only',
      sentAt
    };
  }
  await sendSmtpMessage({
    host,
    port,
    from: process.env.SMTP_FROM ?? 'statements@costalyx.local',
    to: statement.stakeholderEmail,
    subject: `Costalyx statement ${statement.periodStart.slice(0, 10)} - ${statement.periodEnd.slice(0, 10)}`,
    body: `${statement.narrativeMd}\n\nTotal USD: ${statement.totalUsd}\nStatement ID: ${statement.id}`
  });
  return {
    channel: 'email',
    deliveryMode: host.includes('mailpit') ? 'mailpit' : 'smtp',
    smtpHost: host,
    smtpPort: port,
    sentAt
  };
}

function sendSmtpMessage(input: {
  host: string;
  port: number;
  from: string;
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  const data = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    input.body
  ].join('\r\n');
  const commands = [
    'EHLO costalyx.local',
    `MAIL FROM:<${input.from}>`,
    `RCPT TO:<${input.to}>`,
    'DATA',
    `${data}\r\n.`,
    'QUIT'
  ];

  return new Promise((resolve, reject) => {
    const socket = connect(input.port, input.host);
    let commandIndex = 0;
    let buffer = '';
    let settled = false;

    const fail = (error: Error) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        reject(error);
      }
    };

    socket.setEncoding('utf8');
    socket.setTimeout(5000, () => fail(new Error('SMTP relay timed out while sending billing statement.')));
    socket.on('error', (error) => fail(error));
    socket.on('data', (chunk) => {
      buffer += chunk;
      if (!buffer.includes('\n')) {
        return;
      }
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      buffer = '';
      const status = lines[lines.length - 1]?.slice(0, 3) ?? '';
      if (!/^[23]\d\d$/.test(status)) {
        fail(new Error('SMTP relay rejected the billing statement send request.'));
        return;
      }
      if (commandIndex >= commands.length) {
        if (!settled) {
          settled = true;
          socket.end();
          resolve();
        }
        return;
      }
      socket.write(`${commands[commandIndex]}\r\n`);
      commandIndex += 1;
    });
  });
}

function detectUsageAnomalies(
  tenantId: string,
  records: NormalizedCostRecord[],
  config: DetectionConfig
): BillingAnomalyCandidate[] {
  return groupBy(records, (record) => `${record.provider}:${record.accountExternalId}:${record.serviceName}:${record.usageFamily}`)
    .flatMap((groupRecords) => {
      const byDay = groupBy(groupRecords, (record) => dayKey(record.validFrom)).map((dayRecords) => ({
        day: dayKey(dayRecords[0].validFrom),
        records: dayRecords,
        usageHours: sum(dayRecords.map((record) => Number(record.usageHours)))
      }));
      const sorted = byDay.sort((left, right) => left.day.localeCompare(right.day));
      return sorted.flatMap((current, index) => {
        const window = sorted.slice(Math.max(0, index - config.usageWindowDays), index);
        if (window.length < 3) {
          return [];
        }
        const baseline = median(window.map((day) => day.usageHours));
        const mad = median(window.map((day) => Math.abs(day.usageHours - baseline)));
        const deviation = Math.abs(current.usageHours - baseline);
        const isAnomaly = mad === 0 ? deviation > 0 && current.usageHours > baseline : deviation / mad >= config.usageMadThreshold;
        if (!isAnomaly) {
          return [];
        }
        const ratio = baseline === 0 ? current.usageHours : current.usageHours / baseline;
        const ratioPercent = ratio * 100;
        return [
          buildCandidate({
            tenantId,
            type: 'usage',
            severity: ratio >= 4 ? 'high' : ratio >= 2 ? 'medium' : 'low',
            windowStart: window[0].day,
            windowEnd: current.day,
            records: current.records,
            metrics: {
              baselineUsageHours: formatDecimal(baseline, 4),
              currentUsageHours: formatDecimal(current.usageHours, 4),
              medianAbsoluteDeviation: formatDecimal(mad, 4),
              ratio: formatDecimal(ratio, 2),
              ratioPercent: formatDecimal(ratioPercent, 2)
            },
            explanation: `Usage anomaly: ${current.records[0].serviceName} ${current.records[0].usageFamily} usage reached ${formatDecimal(
              current.usageHours,
              4
            )} hours, ${formatDecimal(ratioPercent, 2)}% of the trailing median ${formatDecimal(baseline, 4)} hours.`,
            expectedClaims: [
              `${formatDecimal(current.usageHours, 4)} hours`,
              `${formatDecimal(ratioPercent, 2)}%`,
              `${formatDecimal(baseline, 4)} hours`
            ]
          })
        ];
      });
    })
    .sort(compareCandidates);
}

function detectNewSpendAnomalies(
  tenantId: string,
  records: NormalizedCostRecord[],
  config: DetectionConfig
): BillingAnomalyCandidate[] {
  const tenantStart = records.map((record) => new Date(record.validFrom).getTime()).sort((left, right) => left - right)[0];
  return groupBy(records, (record) => `${record.provider}:${record.accountExternalId}:${record.serviceName}`)
    .flatMap((groupRecords) => {
      const sorted = groupRecords.sort(compareByStart);
      const first = sorted[0];
      if (!first || new Date(first.validFrom).getTime() === tenantStart) {
        return [];
      }
      const firstDayRows = sorted.filter((record) => dayKey(record.validFrom) === dayKey(first.validFrom));
      const spend = sum(firstDayRows.map((record) => Number(record.costTotalUsd)));
      if (spend < config.newSpendFloorUsd) {
        return [];
      }
      return [
        buildCandidate({
          tenantId,
          type: 'new_spend',
          severity: spend >= config.newSpendFloorUsd * 4 ? 'high' : spend >= config.newSpendFloorUsd * 2 ? 'medium' : 'low',
          windowStart: first.validFrom,
          windowEnd: first.validFrom,
          records: firstDayRows,
          metrics: {
            firstSeenSpendUsd: formatDecimal(spend, 8),
            floorUsd: formatDecimal(config.newSpendFloorUsd, 8)
          },
          explanation: `New spend anomaly: ${first.serviceName} first appeared in account ${first.accountExternalId} with $${formatDecimal(
            spend,
            8
          )} in spend, above the $${formatDecimal(config.newSpendFloorUsd, 8)} floor.`,
          expectedClaims: [`$${formatDecimal(spend, 8)}`, `$${formatDecimal(config.newSpendFloorUsd, 8)}`]
        })
      ];
    })
    .sort(compareCandidates);
}

function detectCoverageAnomalies(
  tenantId: string,
  records: NormalizedCostRecord[],
  config: DetectionConfig
): BillingAnomalyCandidate[] {
  return groupBy(records, (record) => `${record.provider}:${record.accountExternalId}:${record.serviceName}`)
    .flatMap((groupRecords) => {
      const byDay = groupBy(groupRecords, (record) => dayKey(record.validFrom)).map((dayRecords) => {
        const totalHours = sum(dayRecords.map((record) => Number(record.usageHours)));
        const committedHours = sum(
          dayRecords
            .filter((record) => record.leaseType === 'reserved' || record.leaseType === 'savings_plan')
            .map((record) => Number(record.usageHours))
        );
        return {
          day: dayKey(dayRecords[0].validFrom),
          records: dayRecords,
          totalHours,
          committedHours,
          coverageRatio: totalHours === 0 ? 1 : committedHours / totalHours
        };
      });
      const sorted = byDay.sort((left, right) => left.day.localeCompare(right.day));
      return sorted.slice(1).flatMap((current, index) => {
        const previous = sorted[index];
        if (previous.coverageRatio < config.commitmentCoverageFloor || current.coverageRatio >= config.commitmentCoverageFloor) {
          return [];
        }
        const percent = current.coverageRatio * 100;
        const floor = config.commitmentCoverageFloor * 100;
        return [
          buildCandidate({
            tenantId,
            type: 'coverage',
            severity: current.coverageRatio < config.commitmentCoverageFloor / 2 ? 'high' : 'medium',
            windowStart: previous.day,
            windowEnd: current.day,
            records: current.records,
            metrics: {
              coveragePercent: formatDecimal(percent, 2),
              floorPercent: formatDecimal(floor, 2),
              committedHours: formatDecimal(current.committedHours, 4),
              totalHours: formatDecimal(current.totalHours, 4)
            },
            explanation: `Commitment coverage anomaly: ${current.records[0].serviceName} coverage dropped to ${formatDecimal(
              percent,
              2
            )}% below the ${formatDecimal(floor, 2)}% floor.`,
            expectedClaims: [`${formatDecimal(percent, 2)}%`, `${formatDecimal(floor, 2)}%`]
          })
        ];
      });
    })
    .sort(compareCandidates);
}

function buildCandidate(input: {
  tenantId: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  windowStart: string;
  windowEnd: string;
  records: NormalizedCostRecord[];
  metrics: Record<string, string | number | boolean | null>;
  explanation: string;
  expectedClaims: string[];
}): BillingAnomalyCandidate {
  assertValidNumericClaims(input.explanation, input.expectedClaims);
  const evidence = buildEvidence(input.type, input.records, input.metrics);
  return {
    id: stableId(`anomaly:${input.tenantId}:${input.type}:${evidence.fingerprint}:${input.windowEnd}`),
    tenantId: input.tenantId,
    type: input.type,
    severity: input.severity,
    detectedAt: new Date().toISOString(),
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    evidence,
    explanationMd: input.explanation
  };
}

function buildEvidence(
  type: AnomalyType,
  records: NormalizedCostRecord[],
  metrics: Record<string, string | number | boolean | null>
): AnomalyEvidence {
  const sorted = records.sort((left, right) => left.id.localeCompare(right.id));
  return {
    fingerprint: `${type}:${sorted.map((record) => record.id).join(':')}`,
    costRecordIds: sorted.map((record) => record.id),
    pricingRows: sorted.map((record) => ({
      costRecordId: record.id,
      resourceId: record.resourceId,
      hourlyRateUsd: record.hourlyRateUsd,
      usageHours: record.usageHours,
      validFrom: record.validFrom,
      validTo: record.validTo
    })),
    metrics
  };
}

function groupBy<T>(items: T[], key: (item: T) => string): T[][] {
  const grouped = new Map<string, T[]>();
  items.forEach((item) => grouped.set(key(item), [...(grouped.get(key(item)) ?? []), item]));
  return [...grouped.values()];
}

function compareByStart(left: NormalizedCostRecord, right: NormalizedCostRecord): number {
  return left.validFrom.localeCompare(right.validFrom) || left.id.localeCompare(right.id);
}

function compareCandidates(left: BillingAnomalyCandidate, right: BillingAnomalyCandidate): number {
  return left.type.localeCompare(right.type) || left.id.localeCompare(right.id);
}

function dayKey(value: string): string {
  return value.slice(0, 10);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[midpoint - 1] + sorted[midpoint]) / 2 : sorted[midpoint];
}

function severityFromPercent(percent: number): AnomalySeverity {
  if (percent >= 100) {
    return 'high';
  }
  if (percent >= 50) {
    return 'medium';
  }
  return 'low';
}
