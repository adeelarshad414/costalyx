import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { CostModelService } from '../cost-model/cost-model.service';
import type { NormalizedCostRecord } from '../cost-model/cost-record.types';
import { formatDecimal } from '../cost-model/decimal';
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
  BillingAnomaly,
  BillingAnomalyCandidate,
  BillingAnomalyQuery,
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
    const firstPage = await this.costModel.listRecords({ tenantId, page: 1, pageSize: 200 });
    if (firstPage.meta.total <= firstPage.data.length) {
      return firstPage.data;
    }
    const pages = Math.ceil(firstPage.meta.total / 200);
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, index) =>
        this.costModel.listRecords({ tenantId, page: index + 2, pageSize: 200 })
      )
    );
    return [...firstPage.data, ...rest.flatMap((page) => page.data)];
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
