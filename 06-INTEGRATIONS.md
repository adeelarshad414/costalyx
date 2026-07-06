# 06-INTEGRATIONS.md — External Integrations

## Cloud billing ingestion
| Provider | Source | Cadence | Adapter interface |
|---|---|---|---|
| AWS | Cost & Usage Report (CUR 2.0) via S3 | daily incremental + monthly final | `CostIngestionAdapter` |
| Azure | Cost Management Exports (via Storage Account) | daily | `CostIngestionAdapter` |
| GCP | Billing Export to BigQuery | daily | `CostIngestionAdapter` |

All three implement the same `CostIngestionAdapter` interface
(`parse(rawBatch) → NormalizedCostRecord[]`) so a fourth provider (e.g.
OCI) can be added without touching the core cost model — same
swappable-adapter principle as `RequirementParserService` in the PolyCost
lineage.

Each ingestion run writes to `ingestion_batches` first (status: pending →
processing → complete/failed), and only commits `cost_records` on success —
partial batches never leave `cost_records` in an inconsistent state.

## Customer cloud account onboarding
Customers should not share long-lived cloud secrets with Costalyx. The
default integration model is a read-only trust relationship created in the
customer cloud account, then registered in Costalyx as a `cloud_connection`.

| Provider | Customer grants | Costalyx stores |
|---|---|---|
| AWS | Read-only IAM role for billing/CUR access, assumable by the Costalyx-controlled principal with the Costalyx-generated external ID | Role ARN, payer/member account ID, CUR S3 URI |
| Azure | Reader/Cost Management Reader scope delegated to the Costalyx app registration or workload identity | Tenant/subscription ID, app/principal ID, optional export URI |
| GCP | Billing Account Viewer / BigQuery read role through Workload Identity Federation | Billing account/project ID, workload identity provider/principal, BigQuery export reference |

A tenant may register multiple AWS, Azure, and GCP connections. UI and API
reads can show each connection separately, by account group, or collectively
at the tenant level.

AWS onboarding is two-step by design: register the role ARN/account/CUR URI,
then configure the returned `externalId` (`costalyx:{tenant_id}:{connection_id}`)
in the customer IAM trust policy. When `COSTALYX_LIVE_CLOUD_PROBES=enabled`
and the Costalyx broker has AWS credentials, validation performs STS
`AssumeRole`, verifies the assumed AWS account ID, and lists the CUR S3
prefix before marking the connection `validated`.
The admin onboarding endpoint returns the trust policy and least-privilege
S3 read policy when `COSTALYX_AWS_BROKER_PRINCIPAL_ARN` is configured; no
customer secret or access key is accepted.
For Azure, the same endpoint returns Reader, Cost Management Reader, and
Storage Blob Data Reader role-assignment guidance for the registered delegated
app/workload identity. With live probes enabled, validation uses Azure
DefaultAzureCredential, performs a Cost Management query at the registered
scope, and lists the unsigned Blob export prefix before marking the connection
`validated`. For GCP, onboarding returns Workload Identity Federation
principal-set and IAM binding guidance for Billing Viewer, BigQuery Data
Viewer, and BigQuery Job User. With live probes enabled, validation uses
Application Default Credentials / Workload Identity Federation and reads one
row from the BigQuery billing export table before marking the connection
`validated`. Signed URLs, SAS tokens, service-account JSON, access keys,
client secrets, and base64 credential blobs are rejected at the
cloud-connection boundary.

Operators can run the same live validation paths before or during customer
launch with `npm run probe:aws-live`, `npm run probe:azure-live`, and
`npm run probe:gcp-live`. These commands accept provider references and rely
on Costalyx-controlled broker credentials from the normal cloud SDK runtime;
they do not accept customer secrets.
Every validation and ingestion attempt tied to a cloud connection writes a
tenant-scoped `cloud_connection_runs` evidence row. The API and portfolio UI
surface status, timestamps, validation codes/messages, ingestion batch IDs,
row counts, and duplicate counts without exposing credential material.
Production deployments run scheduled cloud maintenance through a separate
worker process, not through horizontally-scaled API pods. Set
`COSTALYX_CLOUD_SCHEDULER_ENABLED=enabled` only on that single worker. The
worker validates every registered connection on its configured interval and
optionally ingests the registered export URI when
`COSTALYX_CLOUD_SCHEDULER_INGESTION_ENABLED=enabled`; all scheduler work is
recorded through the same tenant-scoped run ledger.

## Keycloak (OIDC)
- Costalyx is registered as a confidential OIDC client — it is never its own
  identity provider
- Realm roles map 1:1 to the fixed roles in `05-RBAC-TRUST-TIERS.md`
- Token introspection cached with a short TTL (60s) to avoid a Keycloak
  round-trip on every request, while still catching revocations promptly

## Vault / OpenBao (secrets)
- Cloud access is federated/read-only by default. Postgres stores cloud
  connection references only. Vault stores Costalyx-owned broker credentials
  and any legacy static fallback secrets; customer access keys, client
  secrets, service-account keys, passwords, plaintext secrets, and base64
  credential blobs are never accepted through the normal onboarding API.
- Vault dynamic secrets used for the app's own DB credentials where
  supported, with a documented static-credential fallback for self-hosters
  who haven't set up Vault dynamic DB secrets yet

## Redpanda (event bus)
- Ingestion completion, recommendation-applied, and audit-log events are
  published to Redpanda topics (`costalyx.ingestion`, `costalyx.audit`,
  `costalyx.optimization`) so future consumers (Slack/webhook notifications,
  a future Lumen observability hookup) can subscribe without coupling to the
  core API

## Third-party notification integrations (future phase, scoped now)
Slack and email webhook delivery for budget-threshold and anomaly alerts —
specified here so the `notifications` table and event schema are additive
from day one, even though delivery channels ship in a later milestone.

## Definition of done for any integration
- Failure of the integration degrades gracefully (a stale-but-valid last
  ingestion is shown with a visible "last updated" timestamp) — it never
  presents silently-stale data as current, and never crashes the surrounding
  UI, per the empty/error-state requirement in `04-DESIGN-SYSTEM.md`
