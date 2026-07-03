# PROGRESS.md — Costalyx Live Build Status

> This file is the live state-of-truth. It is updated continuously during
> the autonomous run. Every "Done" claim must reference actual passing test
> output or a verifiable artifact — not an aspirational checklist. If a
> surface isn't built, it is listed under Unbuilt, not omitted.

_Last updated: 2026-07-03 20:21:26 PKT_

## Milestone status

| Milestone | Status | Test evidence | Notes |
|---|---|---|---|
| A — Ingestion & Core Cost Model | Blocked | `npm test` passed: backend 6 suites / 16 tests, frontend 3 files / 5 tests, contract 1 file / 2 tests, migration additive check passed. `npm --workspace backend run build` passed. `npm --workspace frontend run build` passed. `npm --workspace backend run test:coverage` passed for service/unit coverage gates. `docker compose config` passed. `npm audit --audit-level=high` failed. | Local ingestion slice implemented and wired, but not production-complete: app persistence is still in-memory, real Keycloak/OIDC validation is not wired, live E2E was not executed, and security audit has unresolved high/critical dependency findings. |
| B — RBAC & Trust Tiers | Not started | — | |
| C — Allocation & Dynamic Tagging | Not started | — | |
| D — Insights Surfaces | Not started | — | |
| E — Optimization | Not started | — | |
| F — Executive & Cross-Persona Surfaces | Not started | — | |
| G — Reporting & Governance | Not started | — | |

Status values: `Not started` / `In progress` / `Blocked` / `Done (evidence
linked)`. A milestone only moves to `Done` when every item in its
`07-FRONTEND-BACKEND-WIRING.md` checklist and `08-TESTING-STRATEGY.md`
Definition of Done is satisfied.

## Full-stack wiring checklist (per feature, filled in as work proceeds)
_Copy this block per feature; do not mark complete without linked evidence._

### Feature: Milestone A — Ingestion & Core Cost Model
- [x] Backend endpoint implemented + unit/integration tests (`npm test`: backend 6 suites / 16 tests passed; includes AWS CUR adapter golden fixture, idempotent ingestion replay, duplicate-row prevention, cost summary, and role guard tests)
- [x] OpenAPI spec updated + client regenerated (`npm run generate:client` completed and `contract/openapi.milestone-a.spec.ts` passed 2 tests)
- [x] Frontend wired to generated client (React ingestion overview uses the generated OpenAPI schema through `CostalyxClient`; no `USE_MOCKS` gate is required)
- [x] Loading / populated / empty / error states implemented (`npm test`: frontend 3 files / 5 tests passed)
- [ ] Auth/permission enforced + tested at both layers (server-side role guard has unit coverage; real Keycloak token validation and frontend permission gates remain unverified)
- [x] Contract test passing locally (`npm test`: contract 1 file / 2 tests passed; CI not configured yet)

## Blocked
_Explicit, never silently skipped or worked around. State exactly what was
and was not verifiable given the constraint._

- **Blocker:** Milestone A uses an in-memory cost repository rather than
  PostgreSQL-backed persistence.
  **Impact:** AWS CUR normalization, idempotency, duplicate prevention, and
  summaries are verified in process, but production durability and SQL
  read/write paths are not complete.
  **What was verified instead:** Additive SQL migration
  `backend/migrations/001_initial_cost_model.sql` exists and
  `npm run migration:check` passed.

- **Blocker:** Real Keycloak/OIDC validation is not wired into the backend or
  frontend permission gates yet.
  **Impact:** Privileged endpoints are protected by a local `x-costalyx-role`
  guard for testability, but end-to-end token validation cannot be claimed.
  **What was verified instead:** `backend/test/security/roles.guard.spec.ts`
  passed role hierarchy and denial checks.

- **Blocker:** Live browser E2E with backend + auth stack was not executed.
  **Impact:** Milestone A cannot move to `Done (evidence linked)` under
  `08-TESTING-STRATEGY.md`.
  **What was verified instead:** React Testing Library coverage verified
  loading, populated, empty, and error states; `docker compose config` passed
  static compose validation.

- **Blocker:** `npm audit --audit-level=high` failed after
  `npm audit fix` was attempted.
  **Impact:** The security gate is not green. Remaining fixes require breaking
  dependency upgrades, including Nest 11 and Vitest 4-related changes.
  **What was verified instead:** Non-breaking audit fix was attempted; the
  remaining reported inventory was 18 vulnerabilities
  (13 moderate, 4 high, 1 critical).

## Ambiguities flagged for human review
_Anything resolved by updating a source-of-truth doc gets annotated inline
in that doc AND logged here for visibility; anything still open is logged
here only._

- (none yet)

## Duplicate work flagged
_If the same request/feature appears again across turns or documents._

- (none yet)

## Known deviations from spec (with justification)
- (none yet — Milestone A is intentionally marked `Blocked`, not `Done`, for
  the incomplete production persistence/auth/E2E/security gates above.)
