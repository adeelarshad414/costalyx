import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { BillingAgentRepository } from './billing-agent.repository';
import type {
  BillingAnomaly,
  BillingAnomalyCandidate,
  BillingAnomalyQuery,
  FalsePositiveReason,
  SuppressionInput
} from './billing-agent.types';

@Injectable()
export class InMemoryBillingAgentRepository implements BillingAgentRepository {
  private readonly anomalies = new Map<string, BillingAnomaly>();
  private readonly suppressions = new Map<string, Set<string>>();
  private readonly idempotency = new Map<string, BillingAnomaly>();

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
    const replay = this.idempotency.get(idempotencyScope);
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
}

function requireFalsePositiveReason(value: FalsePositiveReason | undefined): FalsePositiveReason {
  if (!value) {
    throw new BadRequestException('falsePositiveReason is required when marking an anomaly false_positive.');
  }
  return value;
}
