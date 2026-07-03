# 02-DATA-MODEL.md — Costalyx Data Model

## Datastore
PostgreSQL as the single datastore. Apache AGE extension enabled only if/when
graph-shaped queries (e.g., resource dependency chains) are needed — not
provisioned speculatively in Milestone A.

## Core tables (additive-only; every change is a new column/table, never a
destructive alter)

### `cost_records` (append-only, temporal)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `provider` | enum(aws, azure, gcp) | |
| `account_id` | fk → `accounts.id` | |
| `resource_id` | text | provider-native resource identifier |
| `service_name` | text | e.g. AWS RDS, Azure VM |
| `usage_family` | text | |
| `lease_type` | enum(on_demand, reserved, savings_plan, spot) | |
| `transaction_type` | text | usage / recurring_charge / credit / tax |
| `hourly_rate_usd` | numeric(18,8) | **sole stored pricing unit** |
| `usage_hours` | numeric(18,4) | |
| `is_estimate` | boolean | **mandatory true for all spot/preemptible rows** |
| `valid_from` | timestamptz | |
| `valid_to` | timestamptz | null = currently valid |
| `ingested_at` | timestamptz | |
| `source_batch_id` | fk → `ingestion_batches.id` | for idempotency/replay |

Derived `cost_total_usd` is **never stored** — always computed as
`hourly_rate_usd * usage_hours` (or `* 730` for monthly rollups) at query
time, so the single-source-of-truth pricing constant can't drift from a
cached total.

### `accounts`
`id, provider, external_account_id, display_name, vendor, created_at`

### `account_groups` / `account_group_members`
Many-to-many join table — mirrors the Cloudability "Account Groups" pattern
but implemented as a proper join table, not a denormalized array column.

### `dimensions` (unbounded, dynamic — NOT fixed-slot)
`id, org_id, name, created_by, created_at`
No hardcoded cap. This is the direct fix for the flat "Dimension 1–11" model
observed in the Cloudability UI audit.

### `dimension_tag_mappings`
`id, dimension_id, tag_key, tag_value_pattern (nullable)`
Many tag keys can map to one dimension.

### `resource_tags`
`resource_id, tag_key, tag_value, source (native | manual | inferred)`

### `recommendations`
`id, type (rightsizing | ri_purchase | idle | commitment_gap), resource_id,
estimated_savings_usd, status (open | applied | dismissed), created_at`

### `realized_savings`
`id, recommendation_id, applied_at, baseline_cost_usd, actual_cost_usd,
delta_usd, verification_source (ingested_billing)`
Delta must trace back to actual ingested `cost_records`, never a static
estimate carried forward.

### `views`
`id, org_id, name, filter_json, owner_id, shared_role_scope[]`

### `roles` / `user_roles`
Milestone A/B: fixed enum (`viewer`, `analyst`, `admin`). Milestone-later:
`custom_roles` table for org-defined roles, additive alongside the fixed
enum — never replacing it, per the same fixed→custom pattern used in Postura.

### `audit_log` (hash-chained, per Postura's proven pattern)
`id, actor_id, action, target_type, target_id, prev_hash, hash, created_at`
Hash computed over a canonicalized JSON representation of the row; reuse the
JSON.stringify undefined-vs-null normalization fix already proven in the
Postura reference implementation to avoid the same class of bug recurring
here.

## Indexing notes
- `cost_records`: composite index on `(account_id, valid_from, valid_to)` and
  `(provider, service_name)` for the Resource Inventory and Explorer queries
- `resource_tags`: index on `(tag_key, tag_value)` for dimension mapping joins

## Migration discipline
- Every migration is additive (new table/column/index) or a data backfill —
  never a drop or type-narrowing change against a column already in use
- Every migration ships with a corresponding rollback script even though
  rollback is expected to be rare, for operational safety
