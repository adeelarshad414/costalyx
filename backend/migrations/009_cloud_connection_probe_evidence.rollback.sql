DROP INDEX IF EXISTS cloud_connections_tenant_status_idx;

ALTER TABLE cloud_connections
  DROP COLUMN IF EXISTS last_validation_message,
  DROP COLUMN IF EXISTS last_validation_code,
  DROP COLUMN IF EXISTS last_validation_attempted_at;
