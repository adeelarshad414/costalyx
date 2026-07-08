# Costalyx Operations Runbook

## Alert: CostalyxMetricsStale

Symptom: Prometheus has not seen a fresh `costalyx_metrics_generated_timestamp_seconds`.

Diagnosis:
1. Check backend pod/container health through `/health/live`.
2. Check readiness through `/health/ready`.
3. Verify the metrics scrape target can authenticate as an admin because
   `/metrics` is role-gated.

Remediation:
1. Restart the backend deployment if liveness is failing.
2. Fix scrape credentials or network policy if health is green but metrics are stale.
3. Escalate to platform engineering if the database readiness check is failing.

## Alert: CostalyxSchedulerDisabled

Symptom: `costalyx_cloud_scheduler_enabled == 0` for 30 minutes.

Diagnosis:
1. Inspect worker deployment env for `COSTALYX_CLOUD_SCHEDULER_ENABLED=enabled`.
2. Confirm exactly one scheduler worker replica is intended to run.
3. Check recent deploy changes to worker Helm values or prod Compose env.

Remediation:
1. Re-enable the worker scheduler in Helm/Compose.
2. Roll out the worker deployment.
3. Watch `/metrics` for `costalyx_cloud_scheduler_enabled 1`.

## Alert: CostalyxIngestionSchedulerDisabled

Symptom: scheduler is running but ingestion scheduling is disabled.

Diagnosis:
1. Confirm the customer has approved scheduled ingestion.
2. Check `COSTALYX_CLOUD_SCHEDULER_INGESTION_ENABLED`.
3. Verify cloud connections have provider export references.

Remediation:
1. Enable ingestion scheduling only after live provider probes pass.
2. Roll the worker.
3. Confirm new `cloud_connection_runs` entries appear.

## Alert: CostalyxCloudValidationFailures

Symptom: at least one provider has connections in `validation_failed`.

Diagnosis:
1. Open the Cloud Portfolio UI and inspect the latest run evidence.
2. Run `npm run probe:live-readiness` in the target environment.
3. For the failing provider, rerun the provider live probe with sanitized logging.

Remediation:
1. AWS: check role trust policy, external ID, CUR S3 URI, and broker identity.
2. Azure: check billing scope, delegated principal, export Blob URI, and broker identity.
3. GCP: check billing resource, Workload Identity Federation provider, BigQuery export URI, and broker identity.

## Alert: CostalyxNoCloudConnections

Symptom: no tenant has a cloud connection.

Diagnosis:
1. Confirm whether this is a fresh install or data loss.
2. Check tenant onboarding status.
3. If unexpected, inspect recent migrations/restores.

Remediation:
1. For a fresh install, complete `ONBOARDING-CHECKLIST.md`.
2. For suspected data loss, pause writes and restore from the latest verified backup.

## Routine Operations

Backup and restore:
1. Take a managed snapshot or `pg_dump` before deploy.
2. Restore into staging before relying on the backup.
3. Local smoke command: `npm run ops:backup-restore-smoke`.

Certificate and domain rotation:
1. Update ingress/TLS secret outside the repo.
2. Update Keycloak frontend redirects and web origins.
3. Update `COSTALYX_ALLOWED_ORIGINS` and frontend `VITE_*` origins.
4. Smoke `/health/live`, `/health/ready`, login, and one API call.

Secret rotation:
1. Rotate in Vault or platform secret store.
2. Restart affected backend/worker/frontend pods.
3. Run `npm run probe:live-readiness`.
4. Confirm no `CHANGE_ME_DEV_ONLY` value exists outside local.

Keycloak realm management:
1. Registration is enabled for the local dev realm only.
2. Production role mapping must issue `viewer`, `analyst`, or `admin` roles.
3. Tenant claim must map to `costalyx_tenant_id`, `tenant_id`, or `org_id`.

Scaling guidance:
1. API pods can scale horizontally.
2. Run exactly one scheduler worker unless the scheduler is externally sharded.
3. Postgres requires managed backup, monitoring, and capacity alarms.
4. Redpanda should be sized for audit/event throughput before enabling high-volume agent automation.

## Incident Severity Matrix

| Severity | Example | Response |
|---|---|---|
| SEV1 | API unavailable or data integrity issue | Page primary on-call immediately; freeze deploys; start incident timeline. |
| SEV2 | Cloud ingestion stale for a production tenant | Triage within 30 minutes; preserve run evidence; notify customer owner. |
| SEV3 | Single screen degraded, workaround exists | Triage same business day; log support ticket. |
| SEV4 | Documentation, cosmetic, or accepted minor gap | Schedule in normal roadmap. |

