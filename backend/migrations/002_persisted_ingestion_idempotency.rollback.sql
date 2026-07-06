DROP INDEX IF EXISTS accounts_provider_external_account_id_idx;
DROP INDEX IF EXISTS ingestion_batches_idempotency_key_idx;
ALTER TABLE ingestion_batches
  DROP COLUMN IF EXISTS idempotency_key;
