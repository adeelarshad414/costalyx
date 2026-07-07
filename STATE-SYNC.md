# Costalyx State Sync - 2026-07-07

This file is the required pre-change continuation snapshot for
`master-production-readiness-orchestrator-v2.md` section 1. It was written
before touching application code, theme files, API schemas, tests, or docs other
than this state register.

## Product Detection

- Product: Costalyx.
- Evidence: repository remote is `adeelarshad414/costalyx`; docs and UI copy use
  Costalyx throughout; `PROGRESS.md` tracks Costalyx milestones A through I.
- Brand source of truth: existing Costalyx brand kit in
  `00-BRANDING-PERSONAS-MASTER-PROMPT.md` wins under v2 section 3.2 registry
  precedence. Current palette is indigo-violet primary, teal accent, dark-first
  surfaces, and semantic status tokens. The v2 terracotta accent axis still
  needs to be added as an alternate accent, not as a replacement.

## Repository And Remote State

- Local branch at sync start: `main`, clean, tracking `origin/main`.
- Production-readiness branch created after evidence gathering and before this
  file write: `feature/costalyx-prod-ready-2026-07-07`.
- Remote: `https://github.com/adeelarshad414/costalyx.git`.
- Open PRs: none returned by GitHub API.
- Latest GitHub Actions run for `main` commit
  `7721ab03fda684ddf0b513d9e8c3927da754e4ff` completed successfully:
  `docs: add production readiness orchestrators`.
- Stale local and remote `codex/*` branches exist, but they have no open PRs at
  this sync point.

## Entry Point Resolution

- Requested entry point path:
  `docs/design/master-production-readiness-orchestrator-v2.md`.
- Actual current path:
  `master-production-readiness-orchestrator-v2.md` at repository root.
- Companion docs are also at repository root:
  `universal-theme-audit-orchestrator.md` and `cpn-design-system.md`.
- Classification: in-progress P0 finding. The docs must be moved or copied into
  `docs/design/` after this state sync so the user-provided entry path exists.

## Reproduced Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Unit, integration, contract, migration safety | verified | `npm test`: backend 41 passed suites, 6 skipped suites, 152 passed tests, 8 skipped tests; frontend 23 files passed, 66 tests passed; contract 13 files passed, 8 skipped files, 39 passed tests, 15 skipped tests; additive migration check passed; `git diff --check` passed. |
| Live contracts | verified | `npm run ci:live-contract`: 9 files passed, 20 tests passed against Docker infra and host app tier assumptions. |
| Backend build | verified | `npm --workspace backend run build` passed. |
| Frontend build | verified | `npm --workspace frontend run build` passed; Vite built 1590 modules. |
| Dependency audit | verified | `npm audit --audit-level=high`: 0 vulnerabilities. |
| Docker compose syntax/topology | verified | `docker compose config` succeeded. |
| Demo seed data | verified(mock) | `npm run seed:demo` restored 2 tenants, 4 cloud connections, 12 cost records, 3 statements, and 3 agent runs. This is dummy data, not production evidence. |
| Real-cloud readiness doctor without customer cloud values | blocked as expected | `npm run probe:live-readiness` exited 2 with sanitized missing-value output for AWS, Azure, GCP, tenant ID, and broker identities. |
| Full browser regression floor | in-progress | `npm run test:e2e:keycloak -- ...` produced 22 passed, 1 skipped, 1 failed. The failing test was the CEO executive summary persona journey because the page met content expectations but exceeded the 30s budget at 44.721s. |

## Milestone Classification

| Milestone/Gate | Classification | Notes |
| --- | --- | --- |
| A - Local foundations and auth | verified-complete | Unit/integration/live-contract evidence reproduced; Keycloak login E2E passed in the full browser run. |
| B - Data ingestion and RBAC | verified-complete | Backend and contract suites reproduced; frontend walkthrough rendered normalized cost records with live auth. |
| C - Optimization and anomaly workflows | verified-complete | FinOps anomaly allocation, anomaly detail, and DevOps/SRE waste signal E2E checks passed in the full browser run. |
| D - Reporting and stakeholder workflows | verified-complete | CFO statement narrative, external stakeholder delivery, and statement detail E2E checks passed in the full browser run. |
| E - Allocation and governance | verified-complete | IT manager showback scopes and cross-app walkthrough evidence passed. |
| F - Executive summary | claimed-complete(unverified) | Static/unit coverage passes, but the current CEO browser journey failed the 30s performance acceptance. Must be fixed or reverified before Done can be accepted. |
| G - Production hardening | in-progress | Builds, audit, Docker config, and live contracts pass. Remaining v2 backend bar needs explicit P3 audit for health/readiness endpoints, correlation, observability, rate limits, OpenAPI sync, and migration safety register. |
| H - Multi-tenant cloud portfolio | blocked | Dummy and local live coverage pass, but production verification against real AWS/Azure/GCP readonly customer accounts is blocked until real role/principal/export values and broker identities are supplied. |
| I.1 - Agentic billing backend | verified-complete | Backend and contract coverage reproduced under `npm test` and live contract floor. |
| I.2 - Statement detail documents | verified-complete | Statement detail E2E passed in the current browser run. |
| I.3 - Agent findings integrated into explorer | verified-complete | Cost explorer fallback, anomaly, and persona E2E coverage passed; live contracts pass. |
| v2 P0 - Continuation and inventory | in-progress | `STATE-SYNC.md` now exists; `THEME-INVENTORY.md` still needs to be generated. |
| v2 P1 - Brand/theme injection | not-started | Existing theme support must be audited against token-only dual-mode and terracotta accent requirements. |
| v2 P2 - Frontend theme audit | not-started | v1 checklist must be executed twice: default and terracotta. |
| v2 P3 - Backend production bar | in-progress | Existing backend evidence is strong but not yet fully mapped to v2 section 6. |
| v2 P4 - Verification and screenshots | not-started | Need regression floor plus screenshot index for default/terracotta and desktop/tablet/mobile. |
| v2 P5 - Git/PR lifecycle | not-started | Branch exists; phase commits, pushes, PR status, and merge annotations still pending. |
| v2 P6 - Final report | not-started | `PRODUCTION-READINESS-REPORT.md` not yet generated. |

## Blocked

| ID | Area | Status | Required External Input |
| --- | --- | --- | --- |
| BLOCKED-001 | Real AWS verification | blocked | Customer AWS account ID, readonly role ARN, CUR S3 URI, and Costalyx broker identity configured for assume-role. |
| BLOCKED-002 | Real Azure verification | blocked | Customer billing scope ID, delegated principal ID, export Blob URI, and Costalyx broker identity configured for delegated readonly billing access. |
| BLOCKED-003 | Real GCP verification | blocked | Customer billing resource, Workload Identity Federation provider, BigQuery billing export URI, and Costalyx broker identity. |

## HUMAN_DECISION_GATE Register

| ID | Decision | Default Applied |
| --- | --- | --- |
| HDG-001 | Brand hue conflict between v2 examples and repo brand kit. | Use repo Costalyx brand kit per v2 section 3.2 registry rule; add terracotta only as alternate accent axis. |
| HDG-002 | Requested docs path absent while root copies exist. | Treat root copies as authoritative for this pre-change sync, then relocate into `docs/design/` during P0. |
| HDG-003 | Real customer cloud account verification unavailable. | Continue with dummy/local verified(mock) evidence and keep production readiness blocked for real probes. |
| HDG-004 | CI bypass policy. | No bypass needed at sync time because latest GitHub Actions run is green. Genuine test failures remain non-bypassable. |

## Immediate Next Actions

1. Finish P0 by placing the v2 and companion design docs under `docs/design/`.
2. Generate `THEME-INVENTORY.md` with raw color, token, component, route, and
   screenshot coverage findings.
3. Address the CEO E2E performance regression or update the test only if the
   30s acceptance budget is proven unrealistic and documented as a product
   decision.
4. Execute P1 through P6 in order, committing and pushing after each phase gate.
