DROP INDEX IF EXISTS optimization_idempotency_created_at_idx;
DROP INDEX IF EXISTS realized_savings_applied_at_idx;
DROP INDEX IF EXISTS recommendations_resource_id_idx;
DROP INDEX IF EXISTS recommendations_status_idx;
DROP TABLE IF EXISTS optimization_idempotency;
DROP TABLE IF EXISTS realized_savings;
DROP TABLE IF EXISTS recommendations;
