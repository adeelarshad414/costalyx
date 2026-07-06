CREATE TABLE IF NOT EXISTS anomalies (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  type text NOT NULL CHECK (type IN ('unit_price', 'usage', 'new_spend', 'coverage')),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  status text NOT NULL CHECK (status IN ('open', 'acknowledged', 'resolved', 'false_positive')),
  detected_at timestamptz NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  evidence_json jsonb NOT NULL,
  explanation_md text NOT NULL,
  assigned_owner_id uuid,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS anomaly_suppressions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  anomaly_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('unit_price', 'usage', 'new_spend', 'coverage')),
  fingerprint text NOT NULL,
  reason_code text NOT NULL CHECK (reason_code IN ('seasonal', 'planned_change', 'known_migration', 'other')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, fingerprint)
);

CREATE TABLE IF NOT EXISTS billing_agent_idempotency (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  idempotency_key text NOT NULL,
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS anomalies_tenant_status_detected_idx
  ON anomalies (tenant_id, status, detected_at DESC);

CREATE INDEX IF NOT EXISTS anomalies_tenant_type_detected_idx
  ON anomalies (tenant_id, type, detected_at DESC);

CREATE INDEX IF NOT EXISTS anomaly_suppressions_tenant_type_idx
  ON anomaly_suppressions (tenant_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS billing_agent_idempotency_created_at_idx
  ON billing_agent_idempotency (created_at);
