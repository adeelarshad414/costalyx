# 05-RBAC-TRUST-TIERS.md — Roles, Permissions & Trust Tiers

## Milestone A: fixed roles (locked — do not re-litigate mid-milestone)
| Role | Can view cost data | Can edit tags/dimensions | Can manage accounts/users | Can export | Can apply recommendations |
|---|---|---|---|---|---|
| `viewer` | ✅ (scoped to assigned Views) | ❌ | ❌ | ✅ | ❌ |
| `analyst` | ✅ | ✅ | ❌ | ✅ | ✅ |
| `admin` | ✅ (all data) | ✅ | ✅ | ✅ | ✅ |

## Milestone B+: org-defined custom roles
Additive alongside the fixed three — a `custom_roles` table with a
permission-bitset column, layered on top of (never replacing) the fixed
roles, mirroring the exact fixed→custom sequencing already proven in Postura.

## Enforcement principle
**Every permission check happens server-side, in a NestJS guard, on every
controller method that touches privileged data or actions.** The frontend's
`<PermissionGate>` component (see `04-DESIGN-SYSTEM.md`) is a UX convenience
for hiding actions a user can't perform — it is never the actual security
boundary. A request that bypasses the UI (curl, Postman, another client)
must be rejected identically to one made through the app.

This directly corrects the failure mode observed in the Cloudability UI
audit: a nav item was visible and clickable, but the underlying data request
returned "Unauthorized" only after the click — meaning the boundary existed,
but was discovered late and presented as a raw toast rather than gated
gracefully up front. Costalyx's `<PermissionGate>` pre-checks the user's role
against the route's declared required-role (from the OpenAPI spec's
`x-required-role` extension) so unauthorized UI never renders in the first
place, while the server-side guard remains the actual enforcement.

## Trust tiers for automated actions (adapted from Postura's remediation
gating pattern)
Any Costalyx action that modifies cloud-provider state (e.g., a future
"auto-apply this rightsizing recommendation" feature) is gated by exactly
three trust tiers:
1. **Deterministic** — a fixed, previously-verified operation (e.g., delete
   a snapshot older than N days per an explicit user-set policy)
2. **Registry-checked** — an operation validated against a known-safe
   registry of provider API calls before execution
3. **Generated** — an AI-suggested remediation step, which always requires
   explicit human approval before execution; never auto-applied

v1 ships **read-only optimization** (recommendations only, no auto-apply) —
the trust-tier model is specified now so the schema and RBAC don't need a
breaking change when auto-apply ships in a later milestone.

## Audit requirement
Every role change, credential rotation, tag/dimension edit, and applied
recommendation writes an `audit_log` row (hash-chained, per
`02-DATA-MODEL.md`). Audit log is admin-read-only, append-only, and never
editable via the API, including by admins.
