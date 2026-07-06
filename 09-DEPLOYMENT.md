# 09-DEPLOYMENT.md — Deployment & Operations

## Deployment targets
| Target | Method | Use case |
|---|---|---|
| Local dev | `docker-compose.yml` (Postgres, Keycloak, Vault/OpenBao, Redpanda, backend, frontend) | day-to-day development |
| Self-hosted single-node | `docker-compose.prod.yml` + `.env.production` | small orgs, evaluation |
| Kubernetes | Helm chart (`deploy/helm/costalyx`) | production, multi-node, horizontal scaling |

## docker-compose.yml (dev) — services
```yaml
services:
  postgres:      # primary datastore
  keycloak:      # OIDC, seeded with a dev realm + fixed roles on first boot
  vault:         # dev-mode Vault (NOT for production use)
  redpanda:      # single-broker dev mode
  backend:       # NestJS, hot-reload
  frontend:      # Vite dev server, proxies /api to backend
```
A `make dev-up` target brings the full stack up and seeds: a dev Keycloak
realm with the three fixed roles, a dev Vault instance with a placeholder
secrets path, and fixture cost data from `test/fixtures/` so the UI is never
empty on first run for a new contributor.

## Kubernetes / Helm (production)
- Separate Deployments for `backend` (horizontally scalable, stateless) and
  `frontend` (static build served via nginx or a CDN)
- Postgres and Vault are **not** bundled in the Helm chart by default —
  production deployments point at managed/externally-operated instances
  (RDS/Cloud SQL/self-managed HA Postgres, HashiCorp Vault cluster); the
  chart includes optional subchart references for self-hosters who want an
  in-cluster option, clearly labeled as non-HA
- HorizontalPodAutoscaler on the backend keyed to CPU + request queue depth
- Readiness probe checks DB connectivity + Vault reachability; liveness
  probe is a lightweight `/healthz` that does not depend on external services
  (so a transient Vault blip doesn't cause a restart storm)

## CI/CD pipeline (GitHub Actions, matching the feature-branch + PR workflow)
```
on: push (feature branches), pull_request (to main)

jobs:
  lint          → eslint, prettier check, no-hardcoded-color rule
  unit-tests    → backend + frontend unit suites, coverage gate enforced
  integration   → testcontainers Postgres, backend integration suite
  contract      → OpenAPI contract suite against a running backend
  migration-check → additive-only migration diff check
  e2e           → Playwright against a full docker-compose stack (on PR to main only)
  build         → backend + frontend production builds, Docker images pushed
                   to registry tagged with commit SHA (on merge to main only)
```
Merge to `main` is blocked unless lint, unit, integration, contract, and
migration-check all pass — E2E runs on PR-to-main and must pass before merge
completes, not just before deploy.

## Release process
1. Conventional commits accumulate on a feature branch
2. PR opened at run completion (per `00-BRANDING-PERSONAS-MASTER-PROMPT.md`
   orchestrator rules)
3. On merge: CI builds and tags Docker images, updates `CHANGELOG.md`
   (generated from conventional commit messages)
4. Tagged release (`vX.Y.Z`) triggers Helm chart version bump and a GitHub
   Release with the changelog excerpt

## Environments and secrets
- No secret ever committed to the repo, including in `docker-compose.yml`
  defaults — dev defaults use clearly-fake placeholder values
  (`CHANGE_ME_DEV_ONLY`) that fail a startup check if detected in a
  non-`local` environment
- Production secrets sourced exclusively from Vault at container startup

## Production cloud onboarding inputs
For a real customer launch, operators should collect read-only cloud access
references, not secret material.

| Provider | Required production input | Verification |
|---|---|---|
| AWS | Role ARN, Costalyx-generated external ID copied into the customer trust policy, payer/member account ID, CUR S3 URI; the admin onboarding endpoint can generate customer-side CloudFormation and Terraform for the role/policy | Assume role, verify account ID, list the CUR S3 prefix, ingest a small CUR export sample |
| Azure | Tenant ID, subscription or management-group scope, delegated app/workload identity principal, Cost Management export URI when used | Token acquisition, Reader/Cost Management Reader scope check, export read test |
| GCP | Billing account or project ID, Workload Identity Federation provider/principal, BigQuery billing export dataset/table | Federated token exchange, billing export read query with row limit |

Each connected account must be associated with the authenticated tenant and
may be grouped into account groups for separate and collective portfolio
views. Production validation must never require customer-owned long-lived
access keys.
For AWS, prefer the generated CloudFormation or Terraform artifact from
`GET /api/v1/cloud-connections/{id}/onboarding` after
`COSTALYX_AWS_BROKER_PRINCIPAL_ARN` is configured. The artifact is
connection-specific: it includes the generated external ID, Costalyx broker
principal, customer role name, CUR bucket, and CUR prefix, and it creates only
read-only STS/S3 permissions required by Costalyx.
Validation and ingestion attempts tied to a cloud connection are recorded in
`cloud_connection_runs`; production operators should use the portfolio UI or
`GET /api/v1/cloud-connections/{id}/runs` to inspect last success/failure
evidence without exposing cloud credential material.

Production scheduled validation and ingestion runs through a dedicated worker
process. Keep `COSTALYX_CLOUD_SCHEDULER_ENABLED` unset on API pods so
horizontal backend scaling does not duplicate scheduled work. Run exactly one
worker replica with `COSTALYX_CLOUD_SCHEDULER_ENABLED=enabled` and
`COSTALYX_CLOUD_SCHEDULER_INTERVAL_MS` set to the desired cadence; values
below 60000ms fall back to 900000ms. `COSTALYX_CLOUD_SCHEDULER_INGESTION_ENABLED`
is intentionally opt-in. When it is set to `enabled`, the worker ingests the
registered `billingExportUri` for each connection after validation. AWS CUR
ingestion reads CSV or CSV.GZ objects directly from S3 by assuming the
registered read-only role with the generated external ID; the requested
`s3://` source must remain inside the registered billing export prefix.
Azure Blob and GCP BigQuery scheduled export object readers remain future
hardening items. When scheduled ingestion is unset, the worker still records
validation evidence.

Compose starts the worker with
`npm --workspace backend run start:worker`. The Helm chart renders the worker
Deployment only when `worker.enabled=true`; `worker.replicaCount` is capped at
1 in the values schema because the scheduler is not a distributed lease-based
job yet.

To enable live AWS validation, the backend runtime must set
`COSTALYX_LIVE_CLOUD_PROBES=enabled` and run with AWS credentials for the
Costalyx-controlled broker principal. `COSTALYX_AWS_PROBE_REGION` may be set
to override the default probe region; otherwise `AWS_REGION`,
`AWS_DEFAULT_REGION`, or `us-east-1` is used. If live probes are not enabled,
valid AWS connections remain `ready_for_live_probe` and are not falsely
reported as `validated`.
`COSTALYX_AWS_INGESTION_REGION` may be set separately for S3 CUR object
reads; otherwise the ingestion path falls back to `COSTALYX_AWS_PROBE_REGION`,
`AWS_REGION`, `AWS_DEFAULT_REGION`, or `us-east-1`.

Before marking the first real AWS customer connection validated, run the
same STS/CUR path from the repo root with operator-provided references only:

```bash
export COSTALYX_TENANT_ID=tenant-id-from-oidc-or-provisioning
export COSTALYX_AWS_CUSTOMER_ACCOUNT_ID=123456789012
export COSTALYX_AWS_READONLY_ROLE_ARN=arn:aws:iam::123456789012:role/CostalyxReadOnlyBilling
export COSTALYX_AWS_CUR_S3_URI=s3://customer-cur-bucket/costalyx/
export AWS_PROFILE=costalyx-broker
npm run probe:aws-live
```

`COSTALYX_CLOUD_CONNECTION_ID` is optional. Set it when validating a
connection that already exists in the API; otherwise the preflight derives
the same tenant/provider/account connection ID used for a first-time
registration. The command prints the sanitized connection reference, the
generated external ID to place in the customer role trust policy, and a
validation result. It must exit `0` only after STS `AssumeRole`, account-ID
verification, and a CUR S3 prefix read all pass. It must not print AWS
secret access keys, session tokens, customer access keys, SAS tokens, or
service-account JSON.

To generate customer-ready AWS onboarding templates, set
`COSTALYX_AWS_BROKER_PRINCIPAL_ARN` to the IAM role/account principal that
will assume customer read-only roles. `GET /api/v1/cloud-connections/{id}/onboarding`
then returns the trust policy and least-privilege CUR S3 read policy. If the
variable is missing or malformed, the endpoint returns an explicit
configuration status instead of a placeholder policy.

The same onboarding endpoint returns Azure role-assignment guidance and GCP
IAM binding guidance from the registered principal references. Operators must
collect unsigned export locations only. Signed URLs, SAS query strings,
customer access keys, client secrets, service-account JSON, passwords, and
base64 credential blobs are rejected before persistence.

Azure live validation uses the Azure SDK `DefaultAzureCredential` chain from
the backend runtime. In production this should be a managed identity,
workload identity, or operator-approved federated credential for the
Costalyx-controlled broker principal. The customer grants that principal
Reader and Cost Management Reader on the subscription or management-group
scope, plus Storage Blob Data Reader on the export container when an export
URI is registered. No Azure client secret is accepted in the cloud-connection
payload.

Before marking the first real Azure customer connection validated, run the
same Cost Management / Blob export path from the repo root with
operator-provided references only:

```bash
export COSTALYX_TENANT_ID=tenant-id-from-oidc-or-provisioning
export COSTALYX_AZURE_BILLING_SCOPE_ID=33333333-3333-4333-8333-333333333333
export COSTALYX_AZURE_DELEGATED_PRINCIPAL_ID=44444444-4444-4444-8444-444444444444
export COSTALYX_AZURE_EXPORT_BLOB_URI=https://costalyxexports.blob.core.windows.net/billing/exports/
npm run probe:azure-live
```

`COSTALYX_CLOUD_CONNECTION_ID` is optional for existing API records.
`npm run probe:azure-live` exits `0` only after the Costalyx broker identity
can query Cost Management at the registered scope and list the unsigned Blob
export prefix. It must not print Azure client secrets, SAS tokens, or storage
account keys.

GCP live validation uses Google Application Default Credentials, normally a
Workload Identity Federation external-account configuration or managed
runtime identity. The customer grants the federated Costalyx principal
Billing Viewer on the billing resource and BigQuery Data Viewer / BigQuery
Job User for the export dataset/project. `COSTALYX_GCP_BIGQUERY_LOCATION`
may be set when the billing export dataset is regional. No service-account
JSON key is accepted in the cloud-connection payload.

Before marking the first real GCP customer connection validated, run the
same Workload Identity / BigQuery export path from the repo root with
operator-provided references only:

```bash
export COSTALYX_TENANT_ID=tenant-id-from-oidc-or-provisioning
export COSTALYX_GCP_BILLING_RESOURCE_ID=billingAccounts/123456-ABCDEF-123456
export COSTALYX_GCP_WORKLOAD_IDENTITY_PROVIDER=projects/123456789/locations/global/workloadIdentityPools/costalyx/providers/billing
export COSTALYX_GCP_BIGQUERY_EXPORT_URI=bigquery://billing-project.billing_export.gcp_billing_export_v1
export COSTALYX_GCP_BIGQUERY_LOCATION=us
npm run probe:gcp-live
```

`COSTALYX_GCP_BIGQUERY_LOCATION` is optional unless the export dataset needs
an explicit location. `COSTALYX_CLOUD_CONNECTION_ID` is optional for
existing API records. `npm run probe:gcp-live` exits `0` only after the
Costalyx broker identity can query one row from the billing export table. It
must not print service-account JSON, private keys, or OAuth tokens.

## Observability hook (future integration point with Lumen)
Backend exposes Prometheus-compatible `/metrics` and structured JSON logs
from day one, even before a Lumen integration is wired, so the two open
source projects can be connected without a retrofit.

## Rollback
Every deploy is a new immutable image tag; rollback = redeploy the previous
tag. Database migrations being additive-only (per `02-DATA-MODEL.md`) means
a code rollback never requires a destructive schema rollback in the common
case.

If the scheduler worker causes unexpected provider/API load, first disable or
scale down only the worker Deployment/service in Compose or Helm, verify API
health remains green, then redeploy the previous backend image tag if code
rollback is still required.
