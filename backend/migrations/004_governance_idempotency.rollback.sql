DROP INDEX IF EXISTS governance_idempotency_created_at_idx;
DROP TABLE IF EXISTS governance_idempotency;
ALTER TABLE accounts
  DROP COLUMN IF EXISTS vault_credential_path;
