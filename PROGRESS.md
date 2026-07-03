# PROGRESS.md — Costalyx Live Build Status

> This file is the live state-of-truth. It is updated continuously during
> the autonomous run. Every "Done" claim must reference actual passing test
> output or a verifiable artifact — not an aspirational checklist. If a
> surface isn't built, it is listed under Unbuilt, not omitted.

_Last updated: 2026-07-03 22:52:46 PKT_

## Milestone status

| Milestone | Status | Test evidence | Notes |
|---|---|---|---|
| A — Ingestion & Core Cost Model | Blocked | `npm test` passed with local-network permission: backend 10 suites / 28 tests, frontend 6 files / 12 tests, static contract 1 file / 2 tests, migration additive check passed. `npm run ci:live-contract` passed: live backend contract 1 file / 4 tests. GitHub Actions `verify` passed on both push and PR runs for checkpoint `010a9a0`; stale hung runs were cancelled. Live Postgres opt-in suite passed earlier: 2 suites / 3 tests. `npm --workspace backend run build` passed. `npm --workspace frontend run build` passed. `npm --workspace backend run test:coverage` passed service/guard/pricing gates. `npm run test:e2e` reported 1 skipped Keycloak login test because no live Keycloak credentials/stack were available. `docker compose config`, `git diff --check`, and `npm audit --audit-level=high` passed. | AWS/Azure/GCP adapters, golden fixtures, PostgreSQL persistence, idempotency, duplicate prevention, backend bearer-token RBAC, frontend Keycloak provider, bearer-token client wiring, `<PermissionGate>`, admin-only UI ingestion trigger with `Idempotency-Key`, strict issuer validation with Docker JWKS override, live-backend contract script, CI workflow, builds, coverage, compose validation, whitespace check, and dependency audit are verified locally. Still not `Done`: live browser E2E through Keycloak has not passed because the local Docker Keycloak image pull failed twice with registry TLS handshake timeouts. |
| B — RBAC & Trust Tiers | Blocked | `npm --workspace backend test -- --runTestsByPath test/governance/postgres-governance.repository.spec.ts test/governance/governance.service.spec.ts` passed 2 suites / 8 tests. `npm --workspace backend test -- --runTestsByPath test/security/milestone-b-privileged-actions.integration.spec.ts test/governance/governance.postgres.integration.spec.ts` passed 11 authorization tests with the opt-in Postgres API suite skipped when `RUN_POSTGRES_INTEGRATION` was unset. `RUN_POSTGRES_INTEGRATION=true DATABASE_URL=postgresql://costalyx:CHANGE_ME_DEV_ONLY@localhost:5432/costalyx_dev npm --workspace backend test -- --runTestsByPath test/governance/governance.postgres.integration.spec.ts test/cost-model/postgres-cost-model.pg.spec.ts test/ingestion/ingestion.postgres.integration.spec.ts` passed 3 suites / 4 tests against local Docker Postgres. `npm test` passed backend 13 suites / 47 tests with 3 opt-in suites skipped, frontend 7 files / 15 tests, contract 2 static files / 5 tests, additive migration check 4 files. `npm run ci:live-contract` passed 2 live files / 7 tests. Backend and frontend builds passed; backend coverage passed at 90.41% statements / 89.47% functions / 89.78% lines. `npm audit --audit-level=high`, `docker compose config`, `git diff --check`, and source/API governance secret-shaped scan passed. `npm run test:e2e` reported 1 skipped Keycloak login test. | Fixed roles, server-side guard enforcement, frontend admin gating, OpenAPI/client coverage, additive RBAC/audit migrations, durable governance PostgreSQL repository selection via `DATABASE_URL`, idempotent governance responses, and real Postgres persistence across Nest app instances are verified. Still not `Done`: live browser E2E through Keycloak remains skipped/blocked. |
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
- [x] Admin ingestion action wired end-to-end at the UI/client layer (`frontend/src/api/client.test.ts` proves `Idempotency-Key` + bearer auth; `frontend/src/features/ingestion/IngestionOverview.test.tsx` proves the button creates a batch and reloads records)
- [x] Loading / populated / empty / error states implemented (`npm test`: frontend 6 files / 12 tests passed)
- [ ] Auth/permission enforced + tested at both layers (backend bearer-token RBAC integration passed for Viewer→Admin `403`; frontend `<PermissionGate>` tests hide/admin-gate privileged UI; live browser Keycloak login remains skipped because Docker could not pull the Keycloak image in this environment)
- [x] Contract test passing locally and in CI (`npm test`: static contract 1 file / 2 tests passed; `npm run ci:live-contract`: live backend contract 1 file / 4 tests passed; GitHub Actions `verify` passed on push and PR runs for checkpoint `010a9a0`)

### Feature: Milestone B — RBAC & Trust Tiers
- [x] Backend endpoint implemented + unit/integration tests (`backend/test/security/milestone-b-privileged-actions.integration.spec.ts`: 11 tests passed for Viewer 403 on direct privileged calls, Admin account-group/credential/user/audit workflows, fixed-role inventory, custom-role rejection, credential-secret rejection, and authenticated export; `backend/test/governance/governance.service.spec.ts` covers audit hash chaining and service behavior)
- [x] OpenAPI spec updated + client regenerated (`contract/openapi.milestone-b.spec.ts`: 3 tests passed; `npm run generate:client` regenerated `frontend/src/api/schema.ts`)
- [x] Frontend component consumes the generated client (`GovernanceConsole` uses `CostalyxClient.listRoles()` and `exportCostRecords()`, and `frontend/src/api/client.test.ts` proves bearer auth on both calls)
- [x] UI hides privileged actions for insufficient roles (`frontend/src/features/governance/GovernanceConsole.test.tsx` proves Viewer sees export but not admin credential/account/user actions)
- [x] Auth/permission enforced and tested at both layers (`milestone-b-privileged-actions.integration.spec.ts` proves Viewer direct API calls receive 403; frontend governance tests prove UI hiding)
- [x] Contract test passing locally against a real backend (`npm run ci:live-contract`: 2 live files / 7 tests passed)
- [x] Persistent governance repository wired to PostgreSQL (`backend/src/governance/postgres-governance.repository.ts` is selected by `GovernanceModule` when `DATABASE_URL` is set; `004_governance_idempotency.sql` adds durable idempotency storage; `RUN_POSTGRES_INTEGRATION=true DATABASE_URL=postgresql://costalyx:CHANGE_ME_DEV_ONLY@localhost:5432/costalyx_dev npm --workspace backend test -- --runTestsByPath test/governance/governance.postgres.integration.spec.ts test/cost-model/postgres-cost-model.pg.spec.ts test/ingestion/ingestion.postgres.integration.spec.ts` passed 3 suites / 4 tests against local Docker Postgres)
- [ ] Live browser Keycloak E2E completed (blocked by local Keycloak image pull TLS timeouts)
- [x] Remote GitHub Actions observed green for the B checkpoint after push (`verify` passed on push and PR runs for `d64d7aa`)

## Blocked
_Explicit, never silently skipped or worked around. State exactly what was
and was not verifiable given the constraint._

- **Blocker:** Live browser E2E with frontend + backend + Keycloak auth stack
  did not execute to completion. The browser test and runtime user-seeding
  script now exist, but local `docker compose up -d --build` failed twice
  while pulling `quay.io/keycloak/keycloak:26.2` with `net/http: TLS
  handshake timeout`.
  **Impact:** Milestone A cannot move to `Done (evidence linked)` under
  `07-FRONTEND-BACKEND-WIRING.md` and `08-TESTING-STRATEGY.md`, even though
  backend bearer-token enforcement and frontend permission gating are now
  tested.
  **What was verified instead:** `backend/test/security/oidc-token-verifier.spec.ts`
  passed Keycloak-style role claim extraction; `backend/test/security/bearer-rbac.integration.spec.ts`
  passed Viewer bearer token → Admin endpoint `403`; `frontend/src/auth/AuthProvider.test.tsx`
  passed Keycloak session role extraction and login redirect initiation;
  `frontend/src/auth/PermissionGate.test.tsx` passed insufficient-role UI
  gating; `scripts/run-keycloak-e2e.mjs` now provisions an E2E admin user
  without committing a credential value; `npm run test:e2e` discovered the
  Keycloak login test and reported it as skipped without a live Keycloak
  stack.

- **Blocker:** Milestone B live browser proof shares the same local Keycloak
  blocker as Milestone A.
  **Impact:** Backend/contract/frontend RBAC evidence and PostgreSQL
  governance persistence are verified, but the
  `07-FRONTEND-BACKEND-WIRING.md` live login requirement is still not
  satisfied for the auth milestone.
  **What was verified instead:** Direct API integration tests verify
  server-side `403` enforcement for Viewer calls to account groups,
  credential references, users, roles, audit log, and Admin-only mutation
  surfaces; frontend tests verify Viewer UI hiding and Admin role loading;
  `npm run ci:live-contract` verifies the same role behavior against a real
  Nest HTTP server with the test-role header fallback; `PostgresGovernanceRepository`
  tests verify parameterized SQL/idempotent replay/rollback; and the opt-in
  real Postgres suite verifies accounts, account groups, credential
  references, users, and audit evidence persist across Nest app instances.

- **Resolved blocker:** Remote GitHub Actions result for the live-backend
  contract workflow was observed green after patching the live-contract
  runner to terminate the full backend process group and adding workflow
  timeouts.
  **Impact:** The CI contract gate for Milestone A is satisfied for
  checkpoint `010a9a0`.
  **What was verified instead:** `.github/workflows/ci.yml` now runs
  `npm test`, `npm run ci:live-contract`, builds, and `npm audit
  --audit-level=high`; local `npm run ci:live-contract` passed 4 live-backend
  tests against a real Nest HTTP server after the cleanup patch; GitHub
  Actions `verify` passed on both the push and PR events for checkpoint
  `010a9a0`.

## Ambiguities flagged for human review
_Anything resolved by updating a source-of-truth doc gets annotated inline
in that doc AND logged here for visibility; anything still open is logged
here only._

- **Resolved:** `openapi.yaml` exposed `POST /roles` as if custom-role
  creation shipped in v1, while `01-SPEC.md` and `05-RBAC-TRUST-TIERS.md`
  say Milestone B ships fixed roles only. Resolved by updating
  `03-API-CONTRACTS.md` and `openapi.yaml`: `POST /roles` remains
  admin-gated but returns a validation error until the later additive
  custom-role milestone.

## Duplicate work flagged
_If the same request/feature appears again across turns or documents._

- (none yet)

## Known deviations from spec (with justification)
- (none yet — Milestones A and B are intentionally marked `Blocked`, not
  `Done`, for the incomplete live Keycloak browser E2E above.)
