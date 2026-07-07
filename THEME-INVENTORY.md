# Costalyx Theme Inventory

Generated for `docs/design/master-production-readiness-orchestrator-v2.md` P0
and `docs/design/universal-theme-audit-orchestrator.md`.

## Product And Brand

- Product: Costalyx.
- Brand registry decision: existing repo brand kit wins. Keep the Costalyx
  indigo-violet primary and teal accent as default; add v2's terracotta axis as
  an alternate accent mode.
- Current implementation: dark/light theme support exists through
  `data-theme`; compact/comfortable density exists through `data-density`.
- Required v2 delta: add system theme preference and default/terracotta accent
  preference in Settings -> Appearance.

## Shell And Routes

Costalyx is currently a single authenticated shell in `frontend/src/App.tsx`.
The shell mounts all major feature sections at once and navigates by hash links:

| Section | Component | Current Coverage |
| --- | --- | --- |
| Cloud portfolio | `CloudPortfolioConsole` | Component tests, live onboarding/copy E2E, full-stack walkthrough |
| Costs | `IngestionOverview` | Component tests, loading skeleton E2E, cost explorer fallback E2E |
| Executive | `ExecutiveConsole` | Component tests, CEO E2E currently fails performance budget |
| Insights | `InsightsConsole` | Component tests, full-stack/persona E2E |
| Optimization | `OptimizationConsole` | Component tests, solution architect E2E |
| Billing Agent | `BillingAgentConsole` | Component tests, anomaly detail, statement detail, CFO, stakeholder E2E |
| Reporting | `ReportingConsole` | Component tests, reporting/persona E2E |
| Allocation | `AllocationConsole` | Component tests, FinOps/IT manager E2E |
| Governance | `GovernanceConsole` | Component tests, live cloud onboarding and readonly copy evidence |
| Settings | `SettingsConsole` | Component tests, settings preferences E2E |
| Operator | `OperatorReadinessConsole` | Component tests, operator readiness E2E; admin-only |

## Theme Assets

| Asset | Status | Notes |
| --- | --- | --- |
| `frontend/src/styles.css` | partially compliant | Contains theme variables and all app styling in one file. Hex literals are currently here, but v2 requires a dedicated `tokens.css`. |
| `frontend/src/components/ThemeToggle.tsx` | partially compliant | Supports dark/light toggle only. Needs system mode support. |
| `frontend/src/preferences/UserPreferences.tsx` | partially compliant | Persists `dark`/`light` and density only. Needs `system` and accent preference. |
| `frontend/src/features/settings/SettingsConsole.tsx` | partially compliant | Has Theme and Density controls. Needs Mode: system/dark/light plus Accent: default/terracotta. |
| `.github/workflows/ci.yml` | partial | Runs tests/build/audit on `main` and `codex/**`. Needs feature branch coverage or PR-only reliance plus raw-hex guard. |

## Raw Color Findings

- `frontend/src/styles.css` currently contains all runtime hex literals for
  tokens. These should move to `frontend/src/tokens.css` during P1.
- Product docs and progress/audit docs also contain historical hex literals.
  The P1 CI guard needs a practical allowlist for `frontend/src/tokens.css` and
  source-of-truth design docs, while blocking component/source raw colors.
- No raw color literals were found in React component files under
  `frontend/src` outside the stylesheet.

## UI Checklist Coverage

| v1 Area | Current State |
| --- | --- |
| Layout shell | Single dense authenticated shell; functional but not CPN-style sidebar/chrome. |
| Empty states | Shared `EmptyState` component and feature wiring exist. |
| Error states | Shared `ErrorState` and user-facing error sanitizer exist. |
| Loading states | Shared skeleton loading states exist with browser proof. |
| Keyboard/focus | Existing theme/accessibility E2E covers focus and reduced motion. |
| Dark/light parity | Existing axe E2E covers dark and light. |
| Terracotta variant | Missing. |
| Desktop/tablet/mobile screenshots | Partial E2E coverage exists; v2 screenshot index not yet generated. |
| Raw hex guard | Missing. |
| Brand-token-only components | Mostly true in React components; stylesheet must be split into token/source layers. |

## Findings

| ID | Severity | Finding | Required Disposition |
| --- | --- | --- | --- |
| P0-DOCS-001 | major | v2 entry-point docs were committed at repo root instead of `docs/design/`. | Fixed in P0 by moving docs to requested paths. |
| P0-CI-001 | major | CI push trigger excludes `feature/**`, while v2 branch default is `feature/<product>-prod-ready-<date>`. | Update CI trigger or rely only on PR CI with documentation. |
| P1-TOKEN-001 | major | Runtime hex tokens live in `frontend/src/styles.css`; v2 requires `tokens.css` and a green raw-hex grep guard. | Create `frontend/src/tokens.css`, import it, and add guard script/CI step. |
| P1-PREF-001 | major | Settings Appearance lacks Mode: system/dark/light and Accent: default/terracotta. | Extend preferences model, settings controls, header toggle behavior, tests, and CSS variables. |
| P2-SS-001 | major | No v2 screenshot index exists for default and terracotta across desktop/tablet/mobile. | Capture and index screenshots after P1/P2 fixes. |
| P2-PERF-001 | major | CEO E2E content passed but exceeded the 30s journey budget in the full regression floor. | Investigate shell fan-out/performance and re-run browser floor. |

## Verification Baseline

- `npm test`: passed local backend, frontend, contract, and migration checks.
- `npm run ci:live-contract`: passed 9 files / 20 tests.
- Backend and frontend builds: passed.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- Full browser floor: 22 passed, 1 skipped, 1 failed due to CEO performance
  budget. Treat this as an active finding.
