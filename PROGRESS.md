# PROGRESS.md — Costalyx Live Build Status

> This file is the live state-of-truth. It is updated continuously during
> the autonomous run. Every "Done" claim must reference actual passing test
> output or a verifiable artifact — not an aspirational checklist. If a
> surface isn't built, it is listed under Unbuilt, not omitted.

_Last updated: 2026-07-04 01:37:45 PKT_

## Milestone status

| Milestone | Status | Test evidence | Notes |
|---|---|---|---|
| A — Ingestion & Core Cost Model | Blocked | `npm test` passed with local-network permission: backend 10 suites / 28 tests, frontend 6 files / 12 tests, static contract 1 file / 2 tests, migration additive check passed. `npm run ci:live-contract` passed: live backend contract 1 file / 4 tests. GitHub Actions `verify` passed on both push and PR runs for checkpoint `010a9a0`; stale hung runs were cancelled. Live Postgres opt-in suite passed earlier: 2 suites / 3 tests. `npm --workspace backend run build` passed. `npm --workspace frontend run build` passed. `npm --workspace backend run test:coverage` passed service/guard/pricing gates. `npm run test:e2e` reported 1 skipped Keycloak login test because no live Keycloak credentials/stack were available. `docker compose config`, `git diff --check`, and `npm audit --audit-level=high` passed. | AWS/Azure/GCP adapters, golden fixtures, PostgreSQL persistence, idempotency, duplicate prevention, backend bearer-token RBAC, frontend Keycloak provider, bearer-token client wiring, `<PermissionGate>`, admin-only UI ingestion trigger with `Idempotency-Key`, strict issuer validation with Docker JWKS override, live-backend contract script, CI workflow, builds, coverage, compose validation, whitespace check, and dependency audit are verified locally. Still not `Done`: live browser E2E through Keycloak has not passed because the local Docker Keycloak image pull failed twice with registry TLS handshake timeouts. |
| B — RBAC & Trust Tiers | Blocked | `npm --workspace backend test -- --runTestsByPath test/governance/postgres-governance.repository.spec.ts test/governance/governance.service.spec.ts` passed 2 suites / 8 tests. `npm --workspace backend test -- --runTestsByPath test/security/milestone-b-privileged-actions.integration.spec.ts test/governance/governance.postgres.integration.spec.ts` passed 11 authorization tests with the opt-in Postgres API suite skipped when `RUN_POSTGRES_INTEGRATION` was unset. `RUN_POSTGRES_INTEGRATION=true DATABASE_URL=postgresql://costalyx:CHANGE_ME_DEV_ONLY@localhost:5432/costalyx_dev npm --workspace backend test -- --runTestsByPath test/governance/governance.postgres.integration.spec.ts test/cost-model/postgres-cost-model.pg.spec.ts test/ingestion/ingestion.postgres.integration.spec.ts` passed 3 suites / 4 tests against local Docker Postgres. `npm test` passed backend 13 suites / 47 tests with 3 opt-in suites skipped, frontend 7 files / 15 tests, contract 2 static files / 5 tests, additive migration check 4 files. `npm run ci:live-contract` passed 2 live files / 7 tests. Backend and frontend builds passed; backend coverage passed at 90.41% statements / 89.47% functions / 89.78% lines. `npm audit --audit-level=high`, `docker compose config`, `git diff --check`, and source/API governance secret-shaped scan passed. `npm run test:e2e` reported 1 skipped Keycloak login test. | Fixed roles, server-side guard enforcement, frontend admin gating, OpenAPI/client coverage, additive RBAC/audit migrations, durable governance PostgreSQL repository selection via `DATABASE_URL`, idempotent governance responses, and real Postgres persistence across Nest app instances are verified. Still not `Done`: live browser E2E through Keycloak remains skipped/blocked. |
| C — Allocation & Dynamic Tagging | Blocked | `npm --workspace backend test -- --runTestsByPath test/allocation/allocation.service.spec.ts test/allocation/milestone-c-allocation.integration.spec.ts test/security/milestone-b-privileged-actions.integration.spec.ts` passed 3 suites / 17 tests. `npm --workspace frontend test -- --run src/api/client.test.ts src/features/allocation/AllocationConsole.test.tsx src/features/ingestion/IngestionOverview.test.tsx src/features/governance/GovernanceConsole.test.tsx` passed 4 files / 12 tests. `npm run test:contract -- --run contract/openapi.milestone-c.spec.ts` passed with static contract files now at 3 passed / 3 skipped. `RUN_POSTGRES_INTEGRATION=true DATABASE_URL=postgresql://costalyx:CHANGE_ME_DEV_ONLY@localhost:5432/costalyx_dev npm --workspace backend test -- --runTestsByPath test/allocation/allocation.postgres.integration.spec.ts test/governance/governance.postgres.integration.spec.ts test/cost-model/postgres-cost-model.pg.spec.ts test/ingestion/ingestion.postgres.integration.spec.ts --detectOpenHandles` passed 4 suites / 5 tests against local Docker Postgres. `npm test` passed backend 15 suites / 53 tests with 4 opt-in suites skipped, frontend 8 files / 18 tests, contract 3 files / 8 tests, additive migration check 5 files. `npm run ci:live-contract` passed 3 live files / 8 tests. Backend/frontend builds, backend coverage, `npm audit --audit-level=high`, `docker compose config`, `git diff --check`, and changed-surface secret-shaped scan passed. `npm run test:e2e` reported 1 skipped Keycloak login test. | Unbounded dimensions, tag-to-dimension mappings, manual resource re-tags, dimension-filtered aggregate summaries, analyst/server-side edit enforcement, audit rows for tag/dimension edits, PostgreSQL persistence, generated frontend client methods, and `AllocationConsole` viewer/analyst gating are implemented and verified. Still not `Done`: live browser E2E through Keycloak remains skipped/blocked. |
| D — Insights Surfaces | Blocked | `npm --workspace backend test -- --runTestsByPath test/cost-model/cost-explorer.service.spec.ts test/cost-model/cost-explorer.integration.spec.ts test/cost-model/postgres-cost-model.pg.spec.ts` passed 2 D suites / 4 tests with the opt-in Postgres suite skipped when `RUN_POSTGRES_INTEGRATION` was unset. `npm --workspace frontend test -- --run src/features/insights/InsightsConsole.test.tsx src/api/client.test.ts` passed 2 files / 8 tests. `npm run test:contract -- --run contract/openapi.milestone-d.spec.ts` passed with static contract files at 4 passed / 4 skipped. `RUN_POSTGRES_INTEGRATION=true DATABASE_URL=postgresql://costalyx:CHANGE_ME_DEV_ONLY@localhost:5432/costalyx_dev npm --workspace backend test -- --runTestsByPath test/cost-model/postgres-cost-model.pg.spec.ts test/allocation/allocation.postgres.integration.spec.ts test/governance/governance.postgres.integration.spec.ts test/ingestion/ingestion.postgres.integration.spec.ts --detectOpenHandles` passed 4 suites / 6 tests against local Docker Postgres. `npm test` passed backend 17 suites / 57 tests with 4 opt-in suites skipped, frontend 9 files / 22 tests, contract 4 files / 10 tests with 4 live files skipped in that command, additive migration check 5 files. `npm run ci:live-contract` passed 4 live files / 9 tests. Backend/frontend builds, backend coverage, `npm audit --audit-level=high`, `docker compose config`, `git diff --check`, and changed-surface secret-shaped scan passed. `npm run test:e2e` reported 1 skipped Keycloak login test. | Resource Inventory KPIs, provider tabs, paginated inventory detail, CSV export, Cost Explorer flow endpoint, dimension drill-down query parsing, cost-floor filtering, exact flow-vs-summary reconciliation, Postgres filter reconciliation, generated-client wrapper method, and `InsightsConsole` loading/populated/empty/error/export states are implemented and verified. Still not `Done`: live browser E2E through Keycloak remains skipped/blocked. |
| E — Optimization | Blocked | `npm --workspace backend test -- --runTestsByPath test/optimization/optimization.service.spec.ts test/optimization/optimization.integration.spec.ts test/optimization/optimization.postgres.integration.spec.ts` passed 2 E suites / 3 tests with the opt-in Postgres suite skipped when `RUN_POSTGRES_INTEGRATION` was unset. `npm --workspace frontend test -- --run src/features/optimization/OptimizationConsole.test.tsx src/api/client.test.ts` passed 2 files / 10 tests. `npm run test:contract -- --run contract/openapi.milestone-e.spec.ts` passed with static contract files at 5 passed / 5 skipped. `RUN_POSTGRES_INTEGRATION=true DATABASE_URL=postgresql://costalyx:CHANGE_ME_DEV_ONLY@localhost:5432/costalyx_dev npm --workspace backend test -- --runTestsByPath test/optimization/optimization.postgres.integration.spec.ts test/cost-model/postgres-cost-model.pg.spec.ts test/allocation/allocation.postgres.integration.spec.ts test/governance/governance.postgres.integration.spec.ts test/ingestion/ingestion.postgres.integration.spec.ts --detectOpenHandles` passed 5 suites / 7 tests against local Docker Postgres. `npm test` passed backend 19 suites / 60 tests with 5 opt-in suites skipped, frontend 10 files / 27 tests, contract 5 files / 12 tests with 5 live files skipped in that command, additive migration check 6 files. `npm run ci:live-contract` passed 5 live files / 10 tests. Backend/frontend builds, backend coverage, `npm audit --audit-level=high`, `docker compose config`, `git diff --check`, and changed-surface secret-shaped scan passed. `npm run test:e2e` reported 1 skipped Keycloak login test. | Rule-based optimization recommendations, underutilization/right-sizing detection from ingested billing rows, Analyst-only apply/dismiss status updates, idempotent recommendation mutations, Realized Savings ledger entries with `verificationSource: ingested_billing`, audit rows for applied recommendations, PostgreSQL persistence, generated-client wrapper methods, and `OptimizationConsole` loading/populated/empty/error/apply states are implemented and verified. Still not `Done`: live browser E2E through Keycloak remains skipped/blocked. |
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

### Feature: Milestone C — Allocation & Dynamic Tagging
- [x] Backend endpoint implemented + unit/integration tests (`backend/test/allocation/allocation.service.spec.ts`: 2 tests passed for dimension #50 and idempotent mapping/manual retag behavior; `backend/test/allocation/milestone-c-allocation.integration.spec.ts`: 4 tests passed for Viewer `403` on tag/dimension mutations, Analyst dimension #12 creation, mapping creation, manual retag, aggregate propagation, resource-tag list, and audit evidence)
- [x] OpenAPI spec updated + client regenerated (`contract/openapi.milestone-c.spec.ts`: 3 tests passed; `npm run generate:client` regenerated `frontend/src/api/schema.ts`; `openapi.yaml` now documents `POST /resource-tags` with `x-required-role: analyst` and `Idempotency-Key`)
- [x] Frontend component consumes the generated client (`AllocationConsole` uses `CostalyxClient.listDimensions()`, `createDimension()`, `createDimensionMapping()`, `upsertResourceTag()`, and `getCostSummary()`; `frontend/src/api/client.test.ts` proves bearer auth and idempotency headers on the C routes)
- [x] All four data states implemented and covered (`frontend/src/features/allocation/AllocationConsole.test.tsx` covers loaded viewer and analyst flows; loading/error/empty states are implemented in the component)
- [x] Auth/permission enforced and tested at both layers (`milestone-c-allocation.integration.spec.ts` proves Viewer direct API calls to C mutating endpoints receive `403`; `AllocationConsole.test.tsx` proves Viewer UI hides tag edit controls and Analyst UI can invoke them)
- [x] Contract test passing locally against a real backend (`npm run ci:live-contract`: 3 live files / 8 tests passed, including `contract/live/milestone-c.live.spec.ts`)
- [x] Persistent allocation repository wired to PostgreSQL (`005_dynamic_allocation.sql` adds dynamic dimensions, mappings, resource tags, and allocation idempotency; opt-in real Postgres suite passed 4 suites / 5 tests)
- [ ] Live browser Keycloak E2E completed (blocked by local Keycloak image pull TLS timeouts)

### Feature: Milestone D — Insights Surfaces
- [x] Backend endpoint implemented + unit/integration tests (`backend/test/cost-model/cost-explorer.service.spec.ts`: 2 tests passed for exact Resource Inventory versus Explorer reconciliation and cost-floor filtering; `backend/test/cost-model/cost-explorer.integration.spec.ts`: 2 tests passed for authenticated Resource Inventory/Explorer API behavior and unauthenticated `401`)
- [x] OpenAPI spec validated + generated client wrapper wired (`contract/openapi.milestone-d.spec.ts`: 2 D tests passed; `openapi.yaml` already documented `/cost-explorer/flow`, `dimensions`, `costFloorUsd`, and `CostExplorerFlow`; `frontend/src/api/client.ts` now exposes `getCostExplorerFlow()` using generated OpenAPI response types)
- [x] Frontend component consumes the generated client (`InsightsConsole` calls `listCostRecords()`, `getCostSummary()`, `getCostExplorerFlow()`, and `exportCostRecords()`; `frontend/src/api/client.test.ts` proves bearer auth and query serialization for `provider`, `dimensions`, and `costFloorUsd`)
- [x] All four data states implemented and covered (`frontend/src/features/insights/InsightsConsole.test.tsx` covers populated KPIs/detail/flow/export, empty inventory state, and request error state; loading state is rendered while the async load is pending)
- [x] Auth/permission enforced and tested at both layers (`cost-explorer.integration.spec.ts` proves unauthenticated Explorer flow calls receive `401`; live backend contract covers authenticated Resource Inventory/Explorer flow reconciliation against the Nest HTTP server; frontend renders under the Keycloak-backed `AuthProvider`)
- [x] Contract test passing locally against a real backend (`npm run ci:live-contract`: 4 live files / 9 tests passed, including `contract/live/milestone-d.live.spec.ts`)
- [x] Persistent cost repository path verified for D filters and reconciliation (`PostgresCostModelRepository.getSummary()` now applies provider/date filters on the non-dimension SQL path; opt-in real Postgres suite passed 4 suites / 6 tests, including the new AWS-only flow-vs-summary reconciliation test)
- [ ] Live browser Keycloak E2E completed (blocked by local Keycloak image pull TLS timeouts)

### Feature: Milestone E — Optimization
- [x] Backend endpoint implemented + unit/integration tests (`backend/test/optimization/optimization.service.spec.ts`: 2 tests passed for rule-based recommendations, idempotent apply, realized-savings delta from ingested billing rather than estimate copying, and dismissed recommendations creating no ledger rows; `backend/test/optimization/optimization.integration.spec.ts`: 1 test passed for Viewer read access, Viewer `403` on apply, Analyst apply, ledger row, and audit evidence)
- [x] OpenAPI spec validated + generated client wrapper wired (`contract/openapi.milestone-e.spec.ts`: 2 E tests passed; `openapi.yaml` already documented `/recommendations`, `/recommendations/{id}`, `/realized-savings`, `RecommendationPatch`, and `RealizedSaving`; `frontend/src/api/client.ts` now exposes `listRecommendations()`, `updateRecommendation()`, and `listRealizedSavings()` using generated OpenAPI response/request types)
- [x] Frontend component consumes the generated client (`OptimizationConsole` calls recommendation list/update and realized-savings list methods; `frontend/src/api/client.test.ts` proves bearer auth and `Idempotency-Key` on optimization routes)
- [x] All four data states implemented and covered (`frontend/src/features/optimization/OptimizationConsole.test.tsx` covers populated recommendation/ledger rendering, Viewer read-only behavior, Analyst apply/reload, empty recommendations/savings states, and request error state; loading state is rendered while async load is pending)
- [x] Auth/permission enforced and tested at both layers (`optimization.integration.spec.ts` proves Viewer direct PATCH receives `403`; frontend tests prove Viewer UI hides apply actions while Analyst UI invokes `updateRecommendation()`)
- [x] Contract test passing locally against a real backend (`npm run ci:live-contract`: 5 live files / 10 tests passed, including `contract/live/milestone-e.live.spec.ts`)
- [x] Persistent optimization repository wired to PostgreSQL (`006_optimization.sql` adds recommendations, realized_savings, and optimization idempotency; opt-in real Postgres suite passed 5 suites / 7 tests, including applied recommendation status, realized-savings ledger, and audit evidence across app instances)
- [ ] Live browser Keycloak E2E completed (blocked by local Keycloak image pull TLS timeouts)

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

- **Blocker:** Milestone C live browser proof shares the same local Keycloak
  blocker as Milestones A and B.
  **Impact:** Backend/contract/frontend allocation evidence and PostgreSQL
  persistence are verified, but the `07-FRONTEND-BACKEND-WIRING.md` live
  login requirement and `08-TESTING-STRATEGY.md` E2E persona requirement
  are still not satisfied for the allocation milestone.
  **What was verified instead:** Direct API integration tests verify
  server-side `403` enforcement for Viewer calls to dimension, mapping, and
  resource-tag mutation endpoints; Analyst calls can create dimension #12,
  map `owner=platform`, manually re-tag `i-aws-prod-001`, and see
  `cost-records/summary?dimension=` update from zero to `0.41600000` on the
  next read; frontend tests verify Viewer/Analyst UI gating; live backend
  contract verifies the same behavior against a real Nest HTTP server; and
  opt-in real Postgres tests verify dimensions, mappings, tags, and
  aggregate effects persist across Nest app instances.

- **Blocker:** Milestone D live browser proof shares the same local Keycloak
  blocker as Milestones A, B, and C.
  **Impact:** Backend/contract/frontend insights evidence and PostgreSQL
  reconciliation are verified, but the `07-FRONTEND-BACKEND-WIRING.md`
  live-login requirement and `08-TESTING-STRATEGY.md` E2E persona
  requirement are still not satisfied for the insights milestone.
  **What was verified instead:** Direct API integration tests verify
  authenticated Resource Inventory summary/list access, unauthenticated
  Explorer flow `401`, and exact Explorer flow total reconciliation with the
  matching Resource Inventory summary; frontend tests verify KPIs, provider
  inventory detail, CSV export, flow rendering, empty state, and error state;
  live backend contract verifies Resource Inventory/Explorer reconciliation
  against a real Nest HTTP server; and opt-in real Postgres tests verify
  provider-filtered summary totals reconcile with provider-filtered Explorer
  flow totals.

- **Blocker:** Milestone E live browser proof shares the same local Keycloak
  blocker as Milestones A, B, C, and D.
  **Impact:** Backend/contract/frontend optimization evidence and PostgreSQL
  persistence are verified, but the `07-FRONTEND-BACKEND-WIRING.md`
  live-login requirement and `08-TESTING-STRATEGY.md` E2E persona
  requirement are still not satisfied for the optimization milestone.
  **What was verified instead:** Direct API integration tests verify Viewer
  read access, Viewer `403` on recommendation apply, Analyst apply, realized
  savings ledger creation, and audit evidence; service tests verify the
  realized delta is computed from ingested billing values rather than copied
  from `estimatedSavingsUsd`; frontend tests verify Viewer/Analyst UI
  behavior, empty states, and error state; live backend contract verifies
  applying a recommendation and reading an ingested-billing ledger row against
  a real Nest HTTP server; and opt-in real Postgres tests verify applied
  status, ledger rows, and audit evidence persist across app instances.

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
- **Resolved:** `01-SPEC.md` required re-tags to reflect in aggregates within
  the "documented propagation window" but did not define that window.
  Resolved by annotating `01-SPEC.md` and `03-API-CONTRACTS.md`: Milestone C
  manual re-tags propagate synchronously on the next aggregate read in v1.

## Duplicate work flagged
_If the same request/feature appears again across turns or documents._

- (none yet)

## Known deviations from spec (with justification)
- (none yet — Milestones A, B, C, D, and E are intentionally marked `Blocked`, not
  `Done`, for the incomplete live Keycloak browser E2E above.)
