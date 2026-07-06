CREATE TABLE IF NOT EXISTS agent_runs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  run_type text NOT NULL CHECK (run_type IN ('anomaly_scan', 'statement_generation', 'statement_send')),
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  inputs_summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  actions_taken_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  actions_proposed_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  errors_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_runs_tenant_type_started_idx
  ON agent_runs (tenant_id, run_type, started_at DESC);

CREATE INDEX IF NOT EXISTS agent_runs_tenant_started_idx
  ON agent_runs (tenant_id, started_at DESC);
