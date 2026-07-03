ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS vault_credential_path text;

CREATE TABLE IF NOT EXISTS governance_idempotency (
  idempotency_key text PRIMARY KEY,
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS governance_idempotency_created_at_idx
  ON governance_idempotency (created_at);
