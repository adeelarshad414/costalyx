CREATE TABLE IF NOT EXISTS stakeholders (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  email text NOT NULL,
  role_label text NOT NULL,
  notification_channel text NOT NULL CHECK (notification_channel IN ('email', 'none')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS billing_scopes (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  stakeholder_id uuid NOT NULL REFERENCES stakeholders(id),
  scope_type text NOT NULL CHECK (scope_type IN ('account_group', 'dimension', 'view')),
  scope_ref text NOT NULL,
  label text NOT NULL,
  scope_filter_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, stakeholder_id, scope_type, scope_ref)
);

CREATE TABLE IF NOT EXISTS statements (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  stakeholder_id uuid NOT NULL REFERENCES stakeholders(id),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'pending_approval', 'approved', 'sent', 'disputed', 'void')),
  total_usd numeric(18,2) NOT NULL,
  generated_at timestamptz NOT NULL,
  approved_by text,
  sent_at timestamptz,
  narrative_md text NOT NULL,
  open_anomaly_count integer NOT NULL DEFAULT 0,
  reconciliation_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  scope_warnings_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  variance_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  dispute_json jsonb,
  send_evidence_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, stakeholder_id, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS statement_line_items (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  statement_id uuid NOT NULL REFERENCES statements(id),
  line_type text NOT NULL CHECK (line_type IN ('cost', 'anomaly', 'variance', 'unallocated')),
  description text NOT NULL,
  amount_usd numeric(18,2) NOT NULL,
  cost_record_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  evidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stakeholders_tenant ON stakeholders (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_billing_scopes_tenant_stakeholder ON billing_scopes (tenant_id, stakeholder_id);
CREATE INDEX IF NOT EXISTS idx_statements_tenant_status_period ON statements (tenant_id, status, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_statement_line_items_statement ON statement_line_items (tenant_id, statement_id);
