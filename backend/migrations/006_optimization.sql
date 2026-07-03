CREATE TABLE IF NOT EXISTS recommendations (
  id uuid PRIMARY KEY,
  type text NOT NULL,
  resource_id text NOT NULL,
  estimated_savings_usd numeric(18,8) NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  baseline_cost_usd numeric(18,8) NOT NULL,
  actual_cost_usd numeric(18,8) NOT NULL,
  delta_usd numeric(18,8) NOT NULL,
  verification_source text NOT NULL DEFAULT 'ingested_billing'
);

CREATE TABLE IF NOT EXISTS realized_savings (
  id uuid PRIMARY KEY,
  recommendation_id uuid NOT NULL REFERENCES recommendations(id),
  applied_at timestamptz NOT NULL,
  baseline_cost_usd numeric(18,8) NOT NULL,
  actual_cost_usd numeric(18,8) NOT NULL,
  delta_usd numeric(18,8) NOT NULL,
  verification_source text NOT NULL DEFAULT 'ingested_billing',
  UNIQUE (recommendation_id)
);

CREATE TABLE IF NOT EXISTS optimization_idempotency (
  idempotency_key text PRIMARY KEY,
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recommendations_status_idx
  ON recommendations (status);

CREATE INDEX IF NOT EXISTS recommendations_resource_id_idx
  ON recommendations (resource_id);

CREATE INDEX IF NOT EXISTS realized_savings_applied_at_idx
  ON realized_savings (applied_at);

CREATE INDEX IF NOT EXISTS optimization_idempotency_created_at_idx
  ON optimization_idempotency (created_at);
