# Costalyx Theme Inventory

Generated for `docs/design/master-production-readiness-orchestrator-v2.md` P0
and `docs/design/universal-theme-audit-orchestrator.md`.

## Product And Brand

- Product: Costalyx.
- Brand registry decision: existing repo brand kit wins. Keep the Costalyx
  indigo-violet primary and teal accent as default; add v2's terracotta axis as
  an alternate accent mode.
- Current implementation after P1: system/dark/light theme preference exists
  through `data-theme-preference`, resolved dark/light theme exists through
  `data-theme`, default/terracotta accent exists through `data-accent`, and
  compact/comfortable density exists through `data-density`.

## Shell And Routes

Costalyx now uses path-routed product pages in `frontend/src/App.tsx` rather
than a single hash-navigated dashboard. Public auth routes are `/login`,
`/signin`, and `/signup`; authenticated product routes render one major feature
page at a time:

| Route | Component | Current Coverage |
| --- | --- | --- |
| `/login` | first-party auth page | `App.test.tsx` proves Keycloak login redirect with route return. |
| `/signin` | first-party auth page | `App.test.tsx` proves the sign-in alias uses the same Keycloak sign-in module with route return. |
| `/signup` | first-party auth page | `App.test.tsx` proves Keycloak registration action with email hint. |
| `/portfolio` | `CloudPortfolioConsole` | Component tests, live onboarding/copy E2E, full-stack walkthrough |
| `/costs` | `IngestionOverview` | Component tests, loading skeleton E2E, cost explorer fallback E2E |
| `/executive` | `ExecutiveConsole` | Component tests, CEO E2E route journey |
| `/insights` | `InsightsConsole` | Component tests, full-stack/persona E2E |
| `/optimization` | `OptimizationConsole` | Component tests, solution architect E2E |
| `/billing-agent` | `BillingAgentConsole` | Component tests, anomaly detail, statement detail, CFO, stakeholder E2E |
| `/reporting` | `ReportingConsole` | Component tests, reporting/persona E2E |
| `/allocation` | `AllocationConsole` | Component tests, FinOps/IT manager E2E |
| `/governance` | `GovernanceConsole` | Component tests, live cloud onboarding and readonly copy evidence |
| `/settings` | `SettingsConsole` | Component tests, settings preferences E2E |
| `/operator` | `OperatorReadinessConsole` | Component tests, operator readiness E2E; admin-only |

## Theme Assets

| Asset | Status | Notes |
| --- | --- | --- |
| `frontend/src/tokens.css` | compliant | Owns runtime color values for dark/light and default/terracotta accent tokens. |
| `frontend/src/styles.css` | compliant | Uses token references only; no raw frontend colors outside `tokens.css`. |
| `frontend/src/components/ThemeToggle.tsx` | compliant | Uses resolved dark/light mode as a quick shell override. |
| `frontend/src/preferences/UserPreferences.tsx` | compliant | Persists `system`/`dark`/`light`, resolved theme, accent, and density. |
| `frontend/src/features/settings/SettingsConsole.tsx` | compliant | Exposes Mode, Accent, and Density controls in Settings -> Appearance. |
| `.github/workflows/ci.yml` | compliant for P1 | Includes `feature/**` and runs the theme color guard. |

## Raw Color Findings

- Runtime color values now live in `frontend/src/tokens.css`.
- `scripts/check-no-raw-frontend-colors.mjs` blocks raw color values in
  `frontend/src` outside `tokens.css`.
- `npm run lint:theme-colors` passed and is part of the root `npm test` command
  plus CI verification.

## UI Checklist Coverage

| v1 Area | Current State |
| --- | --- |
| Layout shell | Path-routed authenticated pages with public login/signup routes and persistent product navigation. |
| Empty states | Shared `EmptyState` component and feature wiring exist. |
| Error states | Shared `ErrorState` and user-facing error sanitizer exist. |
| Loading states | Shared skeleton loading states exist with browser proof. |
| Keyboard/focus | Existing theme/accessibility E2E covers focus and reduced motion. |
| Dark/light parity | Existing axe E2E covers dark and light. |
| Terracotta variant | Implemented and covered by Settings E2E plus axe scan. |
| Desktop/tablet/mobile screenshots | Complete P2 archive generated for dark/light and default/terracotta. |
| Raw hex guard | Implemented for runtime frontend source. |
| Brand-token-only components | Verified by guard and focused tests. |

## Findings

| ID | Severity | Finding | Required Disposition |
| --- | --- | --- | --- |
| P0-DOCS-001 | major | v2 entry-point docs were committed at repo root instead of `docs/design/`. | Fixed in P0 by moving docs to requested paths. |
| P0-CI-001 | major | CI push trigger excludes `feature/**`, while v2 branch default is `feature/<product>-prod-ready-<date>`. | Fixed in P1 by adding `feature/**` to CI triggers. |
| P1-TOKEN-001 | major | Runtime hex tokens live in `frontend/src/styles.css`; v2 requires `tokens.css` and a green raw-hex grep guard. | Fixed in P1 with `frontend/src/tokens.css`, guard script, npm script, and CI step. |
| P1-PREF-001 | major | Settings Appearance lacks Mode: system/dark/light and Accent: default/terracotta. | Fixed in P1 with preference state, Settings controls, header toggle updates, focused component tests, and browser proof. |
| P2-SS-001 | major | No v2 screenshot index exists for default and terracotta across desktop/tablet/mobile. | Fixed in P2 with `SCREENSHOT-INDEX.md` and 12 screenshots under `artifacts/theme-audit/2026-07-07/`. |
| P2-PERF-001 | major | CEO E2E content passed but exceeded the 30s journey budget in the full regression floor. | Fixed in P2 by scoping the CEO spec to the executive journey. Focused rerun passed in 2.0s; broad browser floor passed with CEO at 8.6s. |

## Verification Baseline

- P1 `npm test`: passed backend 41 suites / 152 tests with 6 suites / 8 tests
  skipped, frontend 23 files / 66 tests, contract 13 files / 39 tests with 8
  files / 15 tests skipped, additive migration check for 13 files, and
  `lint:theme-colors`.
- P1 focused frontend proof passed 2 files / 2 tests for Settings and theme
  toggle.
- P1 focused browser proof passed 3 Chromium tests for Settings persistence and
  default/terracotta accessibility coverage.
- P2 broad browser floor passed 23 Chromium tests with 1 expected viewer-only
  skip in 43.1s.
- P2 screenshot capture produced 12 full-page artifacts covering dark/light,
  default/terracotta, and desktop/tablet/mobile.
- `npm run ci:live-contract`: passed 9 files / 20 tests.
- Backend and frontend builds: passed.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- Full browser floor: 22 passed, 1 skipped, 1 failed due to CEO performance
  budget. Treat this as an active finding.
- Route/auth update proof on 2026-07-07: focused auth/routing tests passed
  4 files / 16 tests; full frontend suite passed 24 files / 72 tests;
  frontend production build passed; `npm run lint:theme-colors` and
  `git diff --check` passed.
