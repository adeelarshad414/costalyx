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

export type BillingScopeType = 'account_group' | 'dimension' | 'view';
export type BillingStatementStatus = 'draft' | 'pending_approval' | 'approved' | 'sent' | 'disputed' | 'void';
export type StakeholderNotificationChannel = 'email' | 'none';

export interface StatementStakeholder {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  roleLabel: string;
  notificationChannel: StakeholderNotificationChannel;
  createdAt: string;
}

export interface BillingScopeFilter {
  accountIds?: string[];
  accountExternalIds?: string[];
  resourceIds?: string[];
}

export interface BillingScope {
  id: string;
  tenantId: string;
  stakeholderId: string;
  scopeType: BillingScopeType;
  scopeRef: string;
  label: string;
  scopeFilter: BillingScopeFilter;
  createdAt: string;
}

export interface BillingStatementLineItem {
  id: string;
  tenantId: string;
  statementId: string;
  lineType: 'cost' | 'anomaly' | 'variance' | 'unallocated';
  description: string;
  amountUsd: string;
  costRecordIds: string[];
  evidence: Record<string, unknown>;
}

export interface BillingStatementDispute {
  previousStatus: BillingStatementStatus;
  note: string;
  disputedAt: string;
  disputedBy: string;
}

export interface BillingStatementReconciliation {
  tenantTotalUsd: string;
  allocatedUniqueUsd: string;
  unallocatedUsd: string;
  overlapUsd: string;
  reconcilesToTenantTotal: boolean;
}

export interface BillingStatementScopeWarning {
  code: 'overlap_detected' | 'unallocated_spend_detected';
  message: string;
  amountUsd: string;
  costRecordIds: string[];
}

export interface BillingStatementVarianceMover {
  label: string;
  currentUsd: string;
  priorUsd: string;
  deltaUsd: string;
}

export interface BillingStatement {
  id: string;
  tenantId: string;
  stakeholderId: string;
  stakeholderName: string;
  stakeholderEmail: string;
  periodStart: string;
  periodEnd: string;
  status: BillingStatementStatus;
  totalUsd: string;
  generatedAt: string;
  approvedBy: string | null;
  sentAt: string | null;
  narrativeMd: string;
  openAnomalyCount: number;
  lineItems: BillingStatementLineItem[];
  reconciliation: BillingStatementReconciliation;
  scopeWarnings: BillingStatementScopeWarning[];
  varianceTopMovers: BillingStatementVarianceMover[];
  dispute: BillingStatementDispute | null;
  sendEvidence: Record<string, unknown> | null;
}

export interface BillingStatementGenerateInput {
  periodStart: string;
  periodEnd: string;
}

export interface BillingStatementGenerateResult {
  statements: BillingStatement[];
  reconciliation: BillingStatementReconciliation;
  scopeWarnings: BillingStatementScopeWarning[];
}

export interface BillingStatementQuery {
  tenantId: string;
  status?: BillingStatementStatus;
  stakeholderId?: string;
  page: number;
  pageSize: number;
}
