import type { CloudProvider } from '../cost-model/cost-record.types';
import type { Role } from '../security/roles';

export interface AccountReference {
  id: string;
  tenantId: string;
  provider: CloudProvider;
  cloudConnectionId: string | null;
  externalAccountId: string;
  displayName: string;
  vendor: string;
  createdAt: string;
  vaultCredentialPath?: string;
}

export interface AccountGroup {
  id: string;
  tenantId: string;
  name: string;
  accountIds: string[];
  createdAt: string;
}

export interface CloudCredentialReference {
  id: string;
  tenantId: string;
  provider: CloudProvider;
  accountId: string;
  displayName: string;
  vaultPath: string;
  createdAt: string;
  rotatedAt: string | null;
}

export interface UserRecord {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  roles: Role[];
}

export interface FixedRoleRecord {
  name: Role;
  fixed: true;
}

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  prevHash: string | null;
  hash: string;
  createdAt: string;
}

export interface ViewFilter {
  provider?: CloudProvider;
  accountId?: string;
  accountGroupId?: string;
  cloudConnectionId?: string;
  service?: string;
  dimension?: string;
  from?: string;
  to?: string;
}

export interface SavedView {
  id: string;
  orgId: string;
  name: string;
  filterJson: ViewFilter;
  ownerId: string;
  sharedRoleScope: Role[];
}

export interface CreateViewInput {
  name: string;
  filterJson: ViewFilter;
  sharedRoleScope?: Role[];
}

export interface PageQuery {
  page: number;
  pageSize: number;
}

export interface TenantRecord {
  id: string;
  name: string;
  slug: string;
  plan: 'starter' | 'business' | 'enterprise';
  createdAt: string;
}

export type CloudConnectionStatus = 'pending_validation' | 'ready_for_live_probe' | 'validated' | 'validation_failed';
export type CloudConnectionValidationCode =
  | 'shape_invalid'
  | 'provider_probe_not_implemented'
  | 'live_probes_disabled'
  | 'aws_billing_export_required'
  | 'aws_account_mismatch'
  | 'aws_billing_export_empty'
  | 'aws_probe_failed'
  | 'aws_probe_passed'
  | 'azure_billing_export_required'
  | 'azure_billing_export_empty'
  | 'azure_probe_failed'
  | 'azure_probe_passed'
  | 'gcp_billing_export_required'
  | 'gcp_billing_export_empty'
  | 'gcp_probe_failed'
  | 'gcp_probe_passed';

export interface CloudConnectionValidationResult {
  status: CloudConnectionStatus;
  code: CloudConnectionValidationCode;
  message: string;
  attemptedAt: string;
  validatedAt: string | null;
}

export type CloudConnectionOnboardingStatus =
  | 'ready'
  | 'broker_principal_missing'
  | 'broker_principal_invalid'
  | 'billing_export_missing'
  | 'provider_not_implemented';

export interface CloudConnectionOnboarding {
  provider: CloudProvider;
  connectionId: string;
  externalId: string;
  status: CloudConnectionOnboardingStatus;
  brokerPrincipalArn: string | null;
  billingExportUri: string | null;
  trustPolicy: Record<string, unknown> | null;
  permissionsPolicy: Record<string, unknown> | null;
  customerSteps: string[];
}

export interface CloudConnection {
  id: string;
  tenantId: string;
  externalId: string;
  provider: CloudProvider;
  displayName: string;
  externalTenantId: string;
  accessMode: 'aws_assume_role' | 'azure_delegated_app' | 'gcp_workload_identity';
  readOnlyPrincipal: string;
  billingExportUri: string | null;
  status: CloudConnectionStatus;
  lastValidatedAt: string | null;
  lastValidationAttemptedAt: string | null;
  lastValidationCode: CloudConnectionValidationCode | null;
  lastValidationMessage: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  data: T[];
  meta: { total: number; page: number; pageSize: number };
}
