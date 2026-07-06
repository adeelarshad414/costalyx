CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'business',
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO tenants (id, name, slug, plan, created_at)
VALUES ('00000000-0000-4000-8000-000000000001', 'Default Tenant', 'default', 'business', '1970-01-01T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS cloud_connections (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  provider text NOT NULL,
  display_name text NOT NULL,
  external_tenant_id text NOT NULL,
  access_mode text NOT NULL,
  read_only_principal text NOT NULL,
  billing_export_uri text,
  status text NOT NULL DEFAULT 'pending_validation',
  last_validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, external_tenant_id)
);

ALTER TABLE ingestion_batches
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS cloud_connection_id uuid;

UPDATE ingestion_batches
SET tenant_id = '00000000-0000-4000-8000-000000000001'
WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ingestion_batches_tenant_idempotency_key_idx
  ON ingestion_batches (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS cloud_connection_id uuid;

UPDATE accounts
SET tenant_id = '00000000-0000-4000-8000-000000000001'
WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_tenant_provider_external_account_id_idx
  ON accounts (tenant_id, provider, external_account_id);

ALTER TABLE cost_records
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS cloud_connection_id uuid;

UPDATE cost_records cr
SET tenant_id = a.tenant_id,
    cloud_connection_id = a.cloud_connection_id
FROM accounts a
WHERE cr.account_id = a.id
  AND cr.tenant_id IS NULL;

UPDATE cost_records
SET tenant_id = '00000000-0000-4000-8000-000000000001'
WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cost_records_tenant_fingerprint_idx
  ON cost_records (tenant_id, fingerprint);

ALTER TABLE account_groups
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

UPDATE account_groups
SET tenant_id = '00000000-0000-4000-8000-000000000001'
WHERE tenant_id IS NULL;

ALTER TABLE cloud_credentials
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

UPDATE cloud_credentials
SET tenant_id = '00000000-0000-4000-8000-000000000001'
WHERE tenant_id IS NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

UPDATE users
SET tenant_id = '00000000-0000-4000-8000-000000000001'
WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_email_idx
  ON users (tenant_id, email);

ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

UPDATE audit_log
SET tenant_id = '00000000-0000-4000-8000-000000000001'
WHERE tenant_id IS NULL;

UPDATE views
SET org_id = '00000000-0000-4000-8000-000000000001';

UPDATE dimensions
SET org_id = '00000000-0000-4000-8000-000000000001';

ALTER TABLE governance_idempotency
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

UPDATE governance_idempotency
SET tenant_id = '00000000-0000-4000-8000-000000000001'
WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS governance_idempotency_tenant_key_idx
  ON governance_idempotency (tenant_id, idempotency_key);

ALTER TABLE optimization_idempotency
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

UPDATE optimization_idempotency
SET tenant_id = '00000000-0000-4000-8000-000000000001'
WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS optimization_idempotency_tenant_key_idx
  ON optimization_idempotency (tenant_id, idempotency_key);

ALTER TABLE recommendations
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

UPDATE recommendations
SET tenant_id = '00000000-0000-4000-8000-000000000001'
WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS recommendations_tenant_id_idx
  ON recommendations (tenant_id, id);

ALTER TABLE realized_savings
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

UPDATE realized_savings rs
SET tenant_id = r.tenant_id
FROM recommendations r
WHERE rs.recommendation_id = r.id
  AND rs.tenant_id IS NULL;

UPDATE realized_savings
SET tenant_id = '00000000-0000-4000-8000-000000000001'
WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS realized_savings_tenant_recommendation_idx
  ON realized_savings (tenant_id, recommendation_id);

CREATE INDEX IF NOT EXISTS cloud_connections_tenant_provider_idx
  ON cloud_connections (tenant_id, provider);

CREATE INDEX IF NOT EXISTS ingestion_batches_tenant_created_at_idx
  ON ingestion_batches (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS cost_records_tenant_provider_service_idx
  ON cost_records (tenant_id, provider, service_name);

CREATE INDEX IF NOT EXISTS account_groups_tenant_created_at_idx
  ON account_groups (tenant_id, created_at);

CREATE INDEX IF NOT EXISTS audit_log_tenant_created_at_idx
  ON audit_log (tenant_id, created_at DESC);
