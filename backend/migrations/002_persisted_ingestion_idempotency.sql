ALTER TABLE ingestion_batches
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS ingestion_batches_idempotency_key_idx
  ON ingestion_batches (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_provider_external_account_id_idx
  ON accounts (provider, external_account_id);
