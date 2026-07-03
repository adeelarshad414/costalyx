# PROGRESS.md — Costalyx Live Build Status

> This file is the live state-of-truth. It is updated continuously during
> the autonomous run. Every "Done" claim must reference actual passing test
> output or a verifiable artifact — not an aspirational checklist. If a
> surface isn't built, it is listed under Unbuilt, not omitted.

_Last updated: 2026-07-03 22:01:52 PKT_

## Milestone status

| Milestone | Status | Test evidence | Notes |
|---|---|---|---|
| A — Ingestion & Core Cost Model | Blocked | `npm test` passed with local-network permission: backend 10 suites / 27 tests, frontend 6 files / 10 tests, static contract 1 file / 2 tests, migration additive check passed. `npm run ci:live-contract` passed: live backend contract 1 file / 4 tests. Live Postgres opt-in suite passed: 2 suites / 3 tests. `npm --workspace backend run build` passed. `npm --workspace frontend run build` passed. `npm --workspace backend run test:coverage` passed service/guard/pricing gates. `npm run test:e2e` reported 1 skipped Keycloak login test because credentials were not provided. `docker compose config`, `git diff --check`, and `npm audit --audit-level=high` passed. | AWS/Azure/GCP adapters, golden fixtures, PostgreSQL persistence, idempotency, duplicate prevention, backend bearer-token RBAC, frontend Keycloak provider, bearer-token client wiring, `<PermissionGate>`, live-backend contract script, CI workflow, builds, coverage, compose validation, whitespace check, and dependency audit are verified locally. Still not `Done`: live browser E2E through Keycloak has not passed, and remote GitHub Actions results are not yet observed green. |
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
- [x] OpenAPI live-backend contract added and passing locally (`npm run ci:live-contract`: live backend contract 1 file / 4 tests passed)
- [x] Frontend wired to generated client (React ingestion overview uses `CostalyxClient`; `createCostalyxClient` sends `Authorization: Bearer <token>` from the Keycloak session and no longer sends `x-costalyx-role`)
- [x] Loading / populated / empty / error states implemented (`npm test`: frontend 6 files / 10 tests passed)
- [ ] Auth/permission enforced + tested at both layers (backend bearer-token RBAC integration passed for Viewer→Admin `403`; frontend `<PermissionGate>` tests hide/admin-gate privileged UI; live browser Keycloak login remains skipped without external credentials)
- [x] Contract test passing locally (`npm test`: static contract 1 file / 2 tests passed; `npm run ci:live-contract`: live backend contract 1 file / 4 tests passed; GitHub Actions workflow added but remote run not yet observed)

## Blocked
_Explicit, never silently skipped or worked around. State exactly what was
and was not verifiable given the constraint._

- **Blocker:** Live browser E2E with frontend + backend + Keycloak auth stack
  did not execute to completion because no external Keycloak E2E username and
  password were provided.
  **Impact:** Milestone A cannot move to `Done (evidence linked)` under
  `07-FRONTEND-BACKEND-WIRING.md` and `08-TESTING-STRATEGY.md`, even though
  backend bearer-token enforcement and frontend permission gating are now
  tested.
  **What was verified instead:** `backend/test/security/oidc-token-verifier.spec.ts`
  passed Keycloak-style role claim extraction; `backend/test/security/bearer-rbac.integration.spec.ts`
  passed Viewer bearer token → Admin endpoint `403`; `frontend/src/auth/AuthProvider.test.tsx`
  passed Keycloak session role extraction and login redirect initiation;
  `frontend/src/auth/PermissionGate.test.tsx` passed insufficient-role UI
  gating; `npm run test:e2e` discovered the Keycloak login test and reported
  it as skipped due missing `E2E_KEYCLOAK_USERNAME`/`E2E_KEYCLOAK_PASSWORD`.

- **Blocker:** Remote GitHub Actions result for the new live-backend contract
  workflow has not yet been observed green on the PR.
  **Impact:** Local live-backend contract evidence exists, but the
  `07-FRONTEND-BACKEND-WIRING.md` CI requirement cannot be claimed complete
  until the PR checks run and pass remotely.
  **What was verified instead:** `.github/workflows/ci.yml` now runs
  `npm test`, `npm run ci:live-contract`, builds, and `npm audit
  --audit-level=high`; local `npm run ci:live-contract` passed 4 live-backend
  tests against a real Nest HTTP server.

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
  the incomplete live Keycloak browser E2E and unobserved remote CI gates
  above.)
