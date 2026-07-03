# 01-SPEC.md — Costalyx Functional Specification

## Purpose
Defines what Costalyx does, milestone by milestone, with acceptance criteria
testable under the TDD discipline in `08-TESTING-STRATEGY.md`. This is the
source of truth for scope. Any conflict with other docs is resolved here and
annotated inline in the losing document.

## Product summary
Costalyx is a self-hosted, open-source (Apache 2.0) multi-cloud cost
intelligence platform: ingest AWS/Azure/GCP billing data, normalize it into a
common cost model, allocate it to owners via dynamic tagging, surface waste
and savings opportunities, and present it to nine distinct personas
(see `00-BRANDING-PERSONAS-MASTER-PROMPT.md §3`) through one shared,
auditable UI.

## Milestone breakdown

### Milestone A — Ingestion & Core Cost Model
- Connect AWS Cost & Usage Report (CUR 2.0), Azure Cost Management export,
  and GCP Billing Export (BigQuery) as three independent, swappable ingestion
  adapters behind a common `CostIngestionAdapter` interface
- Normalize all three into the shared cost model: `hourly_rate_usd` as the
  only stored pricing unit, `730 hours/month` as the sole monthly-derivation
  constant, append-only `valid_from`/`valid_to` temporal pricing rows
- Spot/preemptible pricing always carries `is_estimate: true` at ingestion,
  storage, API, and UI layers — no layer may silently drop the flag
- **Acceptance:** ingesting a fixture CUR file produces cost rows matching a
  golden fixture to the cent; re-ingesting the same file twice is idempotent
  (no duplicate rows)

### Milestone B — RBAC & Trust Tiers
- Keycloak-backed auth; three fixed roles at launch (Viewer, Analyst, Admin)
  mirroring Postura's Milestone-A/B pattern — fixed roles first, org-defined
  custom roles in a later milestone
- Every privileged action (export, credential management, account-group
  edits) enforced server-side; UI hides but never solely relies on hiding
- **Acceptance:** an authenticated Viewer token hitting an Admin-only
  endpoint receives 403, not a filtered 200; this is asserted by an
  integration test, not a UI test

### Milestone C — Allocation & Dynamic Tagging
- Unbounded custom-dimension model (explicitly not a fixed slot count) with
  many-to-one tag→dimension mapping, additive schema only
- Account Groups: many-to-many grouping of billing accounts into
  business-meaningful units (business unit, environment, team)
- **Acceptance:** creating dimension #12 (or #50) requires no schema
  migration; a cost row can be re-tagged and the change is reflected in
  aggregate views within the documented propagation window

**Milestone C resolution (2026-07-03):** v1 manual resource re-tags
propagate synchronously on the next aggregate read. Future async tag
backfills may introduce a longer SLA, but must document it before shipping.

### Milestone D — Insights Surfaces
- Resource Inventory: per-cloud-provider tabbed view, KPI cards (total
  resources, untagged count, inactive count, cost total), paginated detail
  table, CSV export
- Cost Explorer (Sankey-based, the differentiated feature vs. Cloudability's
  TrueCost Explorer): editable dimension chips, cost-floor threshold slider,
  drill-down by lease type / service / transaction type / usage family
- **Acceptance:** Explorer totals reconcile exactly with Resource Inventory
  totals for the same date range and filter set (no silent double-counting
  across the two surfaces)

### Milestone E — Optimization
- Underutilization/idle-resource detection (rule-based at launch; ML-based
  anomaly detection is a stated future phase, not silently implied as done)
- Reserved Instance / Savings Plan coverage and expiry tracking
- Realized Savings ledger — every recommendation that is acted on gets an
  auditable before/after cost delta, not just a static suggestion list
- **Acceptance:** a recommendation marked "applied" produces a Realized
  Savings row with a verifiable cost delta from actual ingested billing data,
  not an estimated one

### Milestone F — Executive & Cross-Persona Surfaces
- Executive Summary dashboard (CEO/CTO): spend as % of a configurable
  revenue/budget baseline, trend, top movers, one-click PDF/export
- What-if TCO Calculator (Solution Architect persona): compare estimated
  cost of an architecture across AWS/Azure/GCP before it's built, using the
  same pricing model as live ingestion (not a separate estimation engine)
- **Acceptance:** What-if Calculator output for a fixture workload matches
  the live-ingested cost of that same workload once actually deployed,
  within a documented tolerance

### Milestone G — Reporting & Governance
- Report gallery (canned reports across Cost, Cost Summary, Invoices,
  Utilization, Underutilization categories — mirroring the content-first
  pattern observed in the competitive audit, ship with real pre-built
  reports, not an empty builder)
- Views: saved, shareable, permission-scoped global filters
- **Acceptance:** a View created by an Admin and shared with a Viewer role
  restricts that Viewer's *entire session* to the scoped data, verified at
  the API layer

## Explicit non-goals (v1)
- Kubernetes-cost-level granularity (Kubecost-equivalent) — future phase
- SaaS/license cost tracking beyond cloud infra — future phase
- ML-based forecasting (only linear/seasonal trend projection in v1)

## Cross-references
- Data model: `02-DATA-MODEL.md`
- API surface: `03-API-CONTRACTS.md`
- UI/component contract: `04-DESIGN-SYSTEM.md`, `07-FRONTEND-BACKEND-WIRING.md`
- RBAC detail: `05-RBAC-TRUST-TIERS.md`
- Test mapping: `08-TESTING-STRATEGY.md`
