# 03-API-CONTRACTS.md — Costalyx API Contracts

## Conventions
- REST + JSON over HTTPS, versioned at the path root: `/api/v1/...`
- OpenAPI 3.1 spec is the source of truth (`openapi.yaml`, generated from
  NestJS decorators, checked into the repo, regenerated on every build — not
  hand-maintained in parallel)
- All list endpoints paginate (`?page`, `?pageSize`, default 25, max 200) and
  return `{ data: [], meta: { total, page, pageSize } }`
- All monetary values serialize as strings (not floats) to avoid
  floating-point drift in the client — `"1234.5600"` not `1234.56`
- Every mutating endpoint requires an `Idempotency-Key` header for retries
- Errors follow RFC 7807 `application/problem+json`: `{ type, title, status,
  detail, instance }` — never a bare `{ error: "..." }` string

## Auth
- OIDC via Keycloak; API validates bearer JWTs, no session cookies
- Tenant boundary comes from the validated OIDC token claim
  (`costalyx_tenant_id`, `tenant_id`, or `org_id`). Clients do not choose
  tenant scope by query string.
- `403` (not a filtered `200`) for any role-insufficient request — enforced
  by a NestJS guard on every controller, tested per `08-TESTING-STRATEGY.md`

## Core endpoint groups

### Ingestion
```
POST   /api/v1/ingestion/batches            trigger a manual ingestion run
GET    /api/v1/ingestion/batches/:id        batch status
GET    /api/v1/ingestion/batches/:id/errors row-level ingestion errors
```

### Cost data
```
GET  /api/v1/cost-records                   filterable by provider, account,
                                             accountGroupId,
                                             cloudConnectionId, service,
                                             date range, dimension
GET  /api/v1/cost-records/summary           pre-aggregated totals (used by
                                             Resource Inventory KPI cards)
GET  /api/v1/cost-records/export            authenticated CSV export
GET  /api/v1/cost-explorer/flow             Sankey-shaped response:
                                             { nodes: [], links: [] }
```

### Tenants & Cloud Connections
```
GET/POST /api/v1/tenants                    tenant membership/admin surface
GET/POST /api/v1/cloud-connections          read-only AWS/Azure/GCP
                                             connection references
POST     /api/v1/cloud-connections/:id/validation
GET      /api/v1/cloud-connections/:id/runs validation/ingestion run
                                             evidence for the connection
```

Cloud connection requests store only a read-only principal reference and an
optional billing export URI. No access keys, client secrets, passwords, or
base64 credential blobs are accepted.
Connection run evidence is tenant-scoped and contains sanitized operational
facts only, never cloud credentials or signed export URLs.

### Accounts & Groups
```
GET/POST     /api/v1/accounts
GET/POST     /api/v1/account-groups
PATCH/DELETE /api/v1/account-groups/:id
GET/POST     /api/v1/cloud-credentials      Vault/OpenBao path references only
PATCH        /api/v1/cloud-credentials/:id/rotation
```

### Dimensions & Tags
```
GET/POST     /api/v1/dimensions             unbounded — no fixed count
POST         /api/v1/dimensions/:id/mappings
GET          /api/v1/resource-tags?resourceId=
POST         /api/v1/resource-tags          upsert a manual/inferred tag
```

Milestone C manual resource re-tags are synchronously reflected on the next
`/api/v1/cost-records/summary?dimension=` read in v1. A future async
propagation pipeline must document its SLA before replacing this behavior.

### Optimization
```
GET   /api/v1/recommendations
PATCH /api/v1/recommendations/:id           status: applied | dismissed
GET   /api/v1/realized-savings
```

### Reporting
```
GET   /api/v1/reports                       canned report catalog
GET   /api/v1/reports/:id/run               filterable by provider, account,
                                             accountGroupId,
                                             cloudConnectionId, date range
GET/POST /api/v1/views
```

### What-if TCO
```
POST  /api/v1/tco/estimate                  { workloadSpec } →
                                             { aws, azure, gcp cost estimates }
                                             uses the SAME pricing engine as
                                             live ingestion, per 01-SPEC.md
```

### Admin
```
GET/POST /api/v1/users
GET/POST /api/v1/roles
GET      /api/v1/audit-log                  admin-only, paginated, immutable
```

**Milestone B resolution (2026-07-03):** `POST /api/v1/roles` exists only
as an admin-gated contract placeholder and returns a validation error for
custom roles in v1. `05-RBAC-TRUST-TIERS.md` is authoritative here: Milestone
B ships the fixed `viewer` / `analyst` / `admin` roles only, and org-defined
custom roles arrive additively in a later milestone.

## Versioning & deprecation policy
- Breaking changes require a new version path (`/api/v2/...`); `v1` stays
  live for a minimum deprecation window documented in the changelog — never
  silently removed
- Additive changes (new optional fields, new endpoints) ship without a
  version bump

## Frontend contract
The OpenAPI spec is the single source of truth for the generated TypeScript
client used by the frontend (see `07-FRONTEND-BACKEND-WIRING.md`) — the
frontend never hand-writes request/response types that could drift from the
backend contract.
