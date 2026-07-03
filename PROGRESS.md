# PROGRESS.md — Costalyx Live Build Status

> This file is the live state-of-truth. It is updated continuously during
> the autonomous run. Every "Done" claim must reference actual passing test
> output or a verifiable artifact — not an aspirational checklist. If a
> surface isn't built, it is listed under Unbuilt, not omitted.

_Last updated: 2026-07-03 21:43:07 PKT_

## Milestone status

| Milestone | Status | Test evidence | Notes |
|---|---|---|---|
| A — Ingestion & Core Cost Model | Blocked | `npm test` passed with local-network permission: backend 10 suites passed / 27 tests passed / 2 opt-in Postgres suites skipped, frontend 3 files / 5 tests, contract 1 file / 2 tests, migration additive check passed. Live Postgres opt-in suite passed: 2 suites / 3 tests. `npm --workspace backend run build` passed. `npm --workspace frontend run build` passed. `npm --workspace backend run test:coverage` passed service/guard/pricing gates. `docker compose config` passed. `npm audit --audit-level=high` passed with 0 vulnerabilities. | AWS/Azure/GCP adapters, golden fixtures, PostgreSQL persistence, idempotency, duplicate prevention, backend bearer-token RBAC, builds, coverage, compose validation, and dependency audit are now verified. Still not `Done`: live Keycloak browser login/frontend auth wiring, E2E, and CI live-backend contract evidence remain unverified. |
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
- [x] Backend endpoint implemented + unit/integration tests (`npm test`: backend 10 suites / 27 tests passed with local-network permission; includes AWS CUR, Azure, and GCP adapter golden fixtures, idempotent ingestion replay, duplicate-row prevention, cost summary, OIDC claim extraction, and role guard tests)
- [x] OpenAPI spec updated + client regenerated (`npm run generate:client` completed and `contract/openapi.milestone-a.spec.ts` passed 2 tests)
- [x] Frontend wired to generated client (React ingestion overview uses the generated OpenAPI schema through `CostalyxClient`; no `USE_MOCKS` gate is required)
- [x] Loading / populated / empty / error states implemented (`npm test`: frontend 3 files / 5 tests passed)
- [ ] Auth/permission enforced + tested at both layers (backend bearer-token RBAC integration passed for Viewer→Admin 403; live Keycloak browser login and frontend permission gates remain unverified)
- [x] Contract test passing locally (`npm test`: contract 1 file / 2 tests passed; CI not configured yet)

## Blocked
_Explicit, never silently skipped or worked around. State exactly what was
and was not verifiable given the constraint._

- **Blocker:** Live browser E2E with frontend + backend + Keycloak auth stack
  was not executed, and frontend Keycloak login/permission gates are not yet
  implemented.
  **Impact:** Milestone A cannot move to `Done (evidence linked)` under
  `07-FRONTEND-BACKEND-WIRING.md` and `08-TESTING-STRATEGY.md`, even though
  backend bearer-token enforcement is now tested.
  **What was verified instead:** `backend/test/security/oidc-token-verifier.spec.ts`
  passed Keycloak-style role claim extraction; `backend/test/security/bearer-rbac.integration.spec.ts`
  passed Viewer bearer token → Admin endpoint `403`; React Testing Library
  coverage verified loading, populated, empty, and error states; `docker
  compose config` passed static compose validation.

- **Blocker:** Contract tests are not yet running in CI against a live backend
  instance.
  **Impact:** Local static contract assertions pass, but the `07-FRONTEND-BACKEND-WIRING.md`
  live-backend CI contract requirement is not satisfied.
  **What was verified instead:** `contract/openapi.milestone-a.spec.ts`
  passed 2 local tests, and backend integration tests verified the implemented
  ingestion routes.

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
  the incomplete frontend Keycloak/auth E2E and live-backend CI contract gates
  above.)
