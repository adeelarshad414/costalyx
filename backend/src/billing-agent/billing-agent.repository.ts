import type {
  BillingAnomaly,
  BillingAnomalyCandidate,
  BillingAnomalyQuery,
  FalsePositiveReason,
  SuppressionInput
} from './billing-agent.types';

export const BILLING_AGENT_REPOSITORY = Symbol('BILLING_AGENT_REPOSITORY');

export interface BillingAgentRepository {
  upsertAnomalyCandidates(
    tenantId: string,
    candidates: BillingAnomalyCandidate[]
  ): Promise<{ created: BillingAnomaly[]; all: BillingAnomaly[] }>;
  listAnomalies(query: BillingAnomalyQuery): Promise<{
    data: BillingAnomaly[];
    meta: { total: number; page: number; pageSize: number };
  }>;
  updateAnomalyStatus(input: {
    id: string;
    tenantId: string;
    status: BillingAnomaly['status'];
    falsePositiveReason?: FalsePositiveReason;
    falsePositiveNote?: string;
    idempotencyKey: string;
  }): Promise<BillingAnomaly>;
  listSuppressedFingerprints(tenantId: string): Promise<Set<string>>;
  recordSuppression(input: SuppressionInput): Promise<void>;
}
