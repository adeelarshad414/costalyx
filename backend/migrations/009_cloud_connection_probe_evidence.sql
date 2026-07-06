ALTER TABLE cloud_connections
  ADD COLUMN IF NOT EXISTS last_validation_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_validation_code text,
  ADD COLUMN IF NOT EXISTS last_validation_message text;

CREATE INDEX IF NOT EXISTS cloud_connections_tenant_status_idx
  ON cloud_connections (tenant_id, status);
