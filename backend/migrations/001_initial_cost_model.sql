CREATE TABLE IF NOT EXISTS ingestion_batches (
  id uuid PRIMARY KEY,
  provider text NOT NULL,
  status text NOT NULL,
  source_uri text NOT NULL,
  created_at timestamptz NOT NULL,
  completed_at timestamptz,
  ingested_rows integer NOT NULL DEFAULT 0,
  duplicate_rows integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY,
  provider text NOT NULL,
  external_account_id text NOT NULL,
  display_name text NOT NULL,
  vendor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cost_records (
  id uuid PRIMARY KEY,
  provider text NOT NULL,
  account_id uuid NOT NULL,
  resource_id text NOT NULL,
  service_name text NOT NULL,
  usage_family text NOT NULL,
  lease_type text NOT NULL,
  transaction_type text NOT NULL,
  hourly_rate_usd numeric(18,8) NOT NULL,
  usage_hours numeric(18,4) NOT NULL,
  is_estimate boolean NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  ingested_at timestamptz NOT NULL,
  source_batch_id uuid NOT NULL REFERENCES ingestion_batches(id),
  fingerprint text NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS cost_records_account_temporal_idx
  ON cost_records (account_id, valid_from, valid_to);

CREATE INDEX IF NOT EXISTS cost_records_provider_service_idx
  ON cost_records (provider, service_name);
