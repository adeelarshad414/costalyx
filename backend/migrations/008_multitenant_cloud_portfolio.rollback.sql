DROP INDEX IF EXISTS audit_log_tenant_created_at_idx;
DROP INDEX IF EXISTS account_groups_tenant_created_at_idx;
DROP INDEX IF EXISTS cost_records_tenant_provider_service_idx;
DROP INDEX IF EXISTS ingestion_batches_tenant_created_at_idx;
DROP INDEX IF EXISTS cloud_connections_tenant_provider_idx;
DROP INDEX IF EXISTS realized_savings_tenant_recommendation_idx;
DROP INDEX IF EXISTS recommendations_tenant_id_idx;
DROP INDEX IF EXISTS cost_records_tenant_fingerprint_idx;
DROP INDEX IF EXISTS accounts_tenant_provider_external_account_id_idx;
DROP INDEX IF EXISTS users_tenant_email_idx;
DROP INDEX IF EXISTS ingestion_batches_tenant_idempotency_key_idx;

ALTER TABLE realized_savings
  DROP COLUMN IF EXISTS tenant_id;

ALTER TABLE recommendations
  DROP COLUMN IF EXISTS tenant_id;

ALTER TABLE optimization_idempotency
  DROP CONSTRAINT IF EXISTS optimization_idempotency_pkey,
  DROP COLUMN IF EXISTS tenant_id;

ALTER TABLE optimization_idempotency
  ADD PRIMARY KEY (idempotency_key);

ALTER TABLE governance_idempotency
  DROP CONSTRAINT IF EXISTS governance_idempotency_pkey,
  DROP COLUMN IF EXISTS tenant_id;

ALTER TABLE governance_idempotency
  ADD PRIMARY KEY (idempotency_key);

ALTER TABLE audit_log
  DROP COLUMN IF EXISTS tenant_id;

ALTER TABLE users
  DROP COLUMN IF EXISTS tenant_id;

ALTER TABLE cloud_credentials
  DROP COLUMN IF EXISTS tenant_id;

ALTER TABLE account_groups
  DROP COLUMN IF EXISTS tenant_id;

ALTER TABLE cost_records
  DROP COLUMN IF EXISTS cloud_connection_id,
  DROP COLUMN IF EXISTS tenant_id;

ALTER TABLE accounts
  DROP COLUMN IF EXISTS cloud_connection_id,
  DROP COLUMN IF EXISTS tenant_id;

ALTER TABLE ingestion_batches
  DROP COLUMN IF EXISTS cloud_connection_id,
  DROP COLUMN IF EXISTS tenant_id;

CREATE UNIQUE INDEX IF NOT EXISTS ingestion_batches_idempotency_key_idx
  ON ingestion_batches (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_provider_external_account_id_idx
  ON accounts (provider, external_account_id);

CREATE UNIQUE INDEX IF NOT EXISTS cost_records_fingerprint_idx
  ON cost_records (fingerprint);

DROP TABLE IF EXISTS cloud_connections;
DROP TABLE IF EXISTS tenants;
