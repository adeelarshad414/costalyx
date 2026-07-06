import type {
  BillingScope,
  BillingScopeFilter,
  AgentRun,
  AgentRunCreateInput,
  AgentRunQuery,
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
  StakeholderNotificationChannel,
  SuppressionInput
} from './billing-agent.types';
import type { AuthenticatedUser } from '../security/token-verifier';

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
  createStatementStakeholder(
    input: {
      tenantId: string;
      name: string;
      email: string;
      roleLabel: string;
      notificationChannel: StakeholderNotificationChannel;
      idempotencyKey: string;
    },
    actor: AuthenticatedUser
  ): Promise<StatementStakeholder>;
  listStatementStakeholders(tenantId: string): Promise<StatementStakeholder[]>;
  createBillingScope(
    input: {
      tenantId: string;
      stakeholderId: string;
      scopeType: BillingScope['scopeType'];
      scopeRef: string;
      label: string;
      scopeFilter: BillingScopeFilter;
      idempotencyKey: string;
    },
    actor: AuthenticatedUser
  ): Promise<BillingScope>;
  listBillingScopes(tenantId: string): Promise<BillingScope[]>;
  saveGeneratedStatements(
    input: BillingStatementGenerateResult & { tenantId: string; periodStart: string; periodEnd: string; idempotencyKey: string },
    actor: AuthenticatedUser
  ): Promise<BillingStatementGenerateResult>;
  listStatements(query: BillingStatementQuery): Promise<{
    data: BillingStatement[];
    meta: { total: number; page: number; pageSize: number };
  }>;
  getStatement(id: string, tenantId: string): Promise<BillingStatement>;
  transitionStatement(
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
  ): Promise<BillingStatement>;
  createAgentRun(input: AgentRunCreateInput, actor: AuthenticatedUser): Promise<AgentRun>;
  listAgentRuns(query: AgentRunQuery): Promise<{
    data: AgentRun[];
    meta: { total: number; page: number; pageSize: number };
  }>;
}
