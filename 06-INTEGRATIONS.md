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

## Keycloak (OIDC)
- Costalyx is registered as a confidential OIDC client — it is never its own
  identity provider
- Realm roles map 1:1 to the fixed roles in `05-RBAC-TRUST-TIERS.md`
- Token introspection cached with a short TTL (60s) to avoid a Keycloak
  round-trip on every request, while still catching revocations promptly

## Vault / OpenBao (secrets)
- All cloud billing credentials (AWS role ARNs + external ID, Azure service
  principal secrets, GCP service account keys) are stored exclusively in
  Vault, referenced by path from Postgres — **never stored, cached, or
  logged in plaintext or base64 anywhere in the application layer**
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
