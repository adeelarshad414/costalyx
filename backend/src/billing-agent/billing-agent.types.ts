import type { NormalizedCostRecord } from '../cost-model/cost-record.types';

export type AnomalyType = 'unit_price' | 'usage' | 'new_spend' | 'coverage';
export type AnomalySeverity = 'low' | 'medium' | 'high';
export type AnomalyStatus = 'open' | 'acknowledged' | 'resolved' | 'false_positive';
export type FalsePositiveReason = 'seasonal' | 'planned_change' | 'known_migration' | 'other';

export interface AnomalyEvidence {
  fingerprint: string;
  costRecordIds: string[];
  pricingRows: Array<{
    costRecordId: string;
    resourceId: string;
    hourlyRateUsd: string;
    usageHours: string;
    validFrom: string;
    validTo: string | null;
  }>;
  metrics: Record<string, string | number | boolean | null>;
}

export interface BillingAnomaly {
  id: string;
  tenantId: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  status: AnomalyStatus;
  detectedAt: string;
  windowStart: string;
  windowEnd: string;
  evidence: AnomalyEvidence;
  explanationMd: string;
  assignedOwnerId: string | null;
}

export interface BillingAnomalyCandidate extends Omit<BillingAnomaly, 'status' | 'assignedOwnerId'> {}

export interface BillingAnomalyQuery {
  tenantId: string;
  type?: AnomalyType;
  status?: AnomalyStatus;
  page: number;
  pageSize: number;
}

export interface BillingAnomalyScanResult {
  created: BillingAnomaly[];
  totalOpen: number;
}

export interface BillingAgentEvent {
  id: string;
  tenantId: string;
  type: 'anomaly_detected';
  anomalyId: string;
  anomalyType: AnomalyType;
  severity: AnomalySeverity;
  occurredAt: string;
}

export interface SuppressionInput {
  anomaly: BillingAnomaly;
  reason: FalsePositiveReason;
  note?: string;
}

export interface DetectionConfig {
  unitPriceChangePercent: number;
  usageWindowDays: number;
  usageMadThreshold: number;
  newSpendFloorUsd: number;
  commitmentCoverageFloor: number;
}

export type CostRecordWithTenant = NormalizedCostRecord & { tenantId?: string };
