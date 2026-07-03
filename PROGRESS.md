# PROGRESS.md — Costalyx Live Build Status

> This file is the live state-of-truth. It is updated continuously during
> the autonomous run. Every "Done" claim must reference actual passing test
> output or a verifiable artifact — not an aspirational checklist. If a
> surface isn't built, it is listed under Unbuilt, not omitted.

_Last updated: (autonomous agent fills in timestamp on each update)_

## Milestone status

| Milestone | Status | Test evidence | Notes |
|---|---|---|---|
| A — Ingestion & Core Cost Model | Not started | — | |
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
```
### Feature: <name>
- [ ] Backend endpoint implemented + unit/integration tests (link: )
- [ ] OpenAPI spec updated + client regenerated
- [ ] Frontend wired to generated client (no mocks required)
- [ ] Loading / populated / empty / error states implemented
- [ ] Auth/permission enforced + tested at both layers
- [ ] Contract test passing in CI
```

## Blocked
_Explicit, never silently skipped or worked around. State exactly what was
and was not verifiable given the constraint._

- (example format, remove once real entries exist)
  **Blocker:** No outbound network / no Docker in sandbox.
  **Impact:** Could not run `testcontainers`-based Postgres integration
  suite or a live Keycloak login flow.
  **What was verified instead:** Unit tests for pricing math and hash-chain
  logic ran against an in-memory fixture. Integration and E2E suites are
  written and committed but **unexecuted** — flagged here, not claimed as
  passing.

## Ambiguities flagged for human review
_Anything resolved by updating a source-of-truth doc gets annotated inline
in that doc AND logged here for visibility; anything still open is logged
here only._

- (none yet)

## Duplicate work flagged
_If the same request/feature appears again across turns or documents._

- (none yet)

## Known deviations from spec (with justification)
- (none yet — any deviation from `01-SPEC.md` requires an entry here plus an
  inline annotation in the spec doc itself)
