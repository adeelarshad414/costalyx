CREATE TABLE IF NOT EXISTS cloud_connection_runs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  cloud_connection_id uuid NOT NULL REFERENCES cloud_connections(id),
  run_type text NOT NULL CHECK (run_type IN ('validation', 'ingestion')),
  status text NOT NULL CHECK (status IN ('succeeded', 'failed')),
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  evidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cloud_connection_runs_tenant_connection_completed_idx
  ON cloud_connection_runs (tenant_id, cloud_connection_id, completed_at DESC);
