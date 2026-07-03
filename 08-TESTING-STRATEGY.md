# 08-TESTING-STRATEGY.md — Test-Driven Development Discipline

## Core rule
Red → Green → Refactor for every unit of work. A failing test is written
against the acceptance criteria in `01-SPEC.md` *before* implementation
code. No exceptions for "small" changes — small changes get small tests.

## Test layers

| Layer | Tool | Scope | Runs |
|---|---|---|---|
| Unit (backend) | Jest | Services, pure functions (pricing math, hash-chain, dimension mapping) | every commit |
| Unit (frontend) | Vitest + Testing Library | Components in isolation, mocked API client | every commit |
| Integration (backend) | Jest + Supertest + testcontainers Postgres | Full request→DB→response, real auth guard behavior | every commit |
| Contract | Custom suite against generated OpenAPI client | Backend ↔ spec conformance (see `07-FRONTEND-BACKEND-WIRING.md`) | every commit, blocks merge |
| End-to-end | Playwright | Real browser, real backend, real (test-realm) Keycloak login, full user journeys per persona | pre-merge to main, nightly full suite |
| Migration safety | Custom script | Every migration diffed against "additive-only" rule; fails CI if a `DROP`/type-narrowing statement is detected outside an explicitly reviewed exception | every commit touching `migrations/` |

## Coverage gates (CI-enforced, not aspirational)
- Backend: minimum 85% line coverage on `services/` and `guards/`
- Pricing/cost-computation modules: 100% branch coverage (this is the
  module class where the Postura JSON.stringify undefined-vs-null bug class
  lives — zero tolerance for untested branches here)
- Frontend: 100% of `<EmptyState>`/`<ErrorState>` render paths covered

## Golden fixtures
- A fixed AWS CUR sample, Azure export sample, and GCP billing export sample
  are checked into `test/fixtures/` with a hand-verified expected
  `cost_records` output. Any change to ingestion logic that alters the
  golden output without an explicit, reviewed fixture update fails CI.

## Per-persona acceptance tests (E2E)
Each of the nine personas in `00-BRANDING-PERSONAS-MASTER-PROMPT.md §3` has
at least one Playwright journey test named after the persona (e.g.
`e2e/ceo-executive-summary.spec.ts`) asserting their specific success metric
from that table is achievable end-to-end — not just that the page renders.

## Definition of Done (test-specific, feeds into PROGRESS.md)
A milestone is not "done" unless:
1. Every acceptance criterion in its `01-SPEC.md` section has a named,
   passing test (test file/name referenced in PROGRESS.md — not just "tests
   pass")
2. Coverage gates above are met
3. Contract suite passes
4. At least one E2E journey touching the milestone's primary persona passes
5. No `USE_MOCKS`-only feature is claimed as complete

## Handling sandbox constraints honestly
If the execution environment lacks network access, Docker, or a live
Postgres instance (as encountered during the Postura build), the agent:
- Documents this explicitly in PROGRESS.md's `## Blocked` section
- States precisely which test layers could and could not run
- Never claims a test "passed" if it could not actually execute — a
  described-but-unexecuted test is reported as unexecuted, not as evidence
  of correctness
