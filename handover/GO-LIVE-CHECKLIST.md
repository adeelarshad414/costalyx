# Costalyx Go-Live Checklist

## 1. Replace Dummy Values

1. Review every row in `DUMMY-VALUES.md`.
2. Replace local Postgres, Keycloak, Vault, frontend/API origin, SMTP, and cloud
   broker placeholders.
3. Confirm no `CHANGE_ME_DEV_ONLY` value exists outside local.
4. Run `npm run security:secrets`.

## 2. Configure Identity And Domains

1. Configure production Keycloak/IdP realm.
2. Set role mappings for `viewer`, `analyst`, and `admin`.
3. Set production redirect URIs and web origins.
4. Configure TLS/domain/ingress.
5. Confirm CORS allowed origins match production app/auth domains.

## 3. Validate Deployment

1. Render Compose or Helm using production values.
2. Run migrations and `npm run migration:check`.
3. Confirm `/health/live` and `/health/ready`.
4. Configure Prometheus scrape with admin metrics auth.
5. Load `deploy/prometheus/costalyx-alerts.yml`.

## 4. Run Backup And Restore

1. Take a production backup before first tenant onboarding.
2. Restore into staging.
3. Record table counts and restore timestamp.

## 5. Run Milestone H Live Probes

1. Run `npm run probe:live-readiness`.
2. Run `npm run probe:aws-live`.
3. Run `npm run probe:azure-live`.
4. Run `npm run probe:gcp-live`.
5. Confirm no probe output prints secrets or raw customer credentials.

## 6. Onboard First Customer Tenant

1. Complete `handover/ONBOARDING-CHECKLIST.md`.
2. Validate first ingestion.
3. Map first allocation dimensions.
4. Invite users by role.
5. Generate first statement draft.

## 7. First-Week Monitoring

1. Watch API availability and readiness.
2. Watch ingestion freshness and validation failures.
3. Review audit log for privileged actions.
4. Review support tickets for onboarding friction.
5. Hold a first-week operations review with product, SRE, security, and FinOps owners.

