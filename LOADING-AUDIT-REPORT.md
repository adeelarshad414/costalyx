# Loading Audit Report

Audit date: 2026-07-08

## Summary

This run replaced the repo's ad-hoc loading states with a shared loading system:
- `BootSplash`
- `SessionLoader`
- `ProgressButton`
- `TaskQueue`
- `JobToast`
- exported `Skeleton` variants through `LoadingState`
- a small bootstrap cache so route warm data is consumed by the destination screen instead of showing a second wait immediately after the session loader

The product now has an intentional treatment for boot, protected-route warmup, region fetches, and the main user-facing mutations across portfolio, cost ingestion, executive, insights, billing, reporting, allocation, governance, and operator views.

## Findings And Dispositions

### `LD-MISSING`
- Missing first-party boot/session experience on protected routes.
  - Disposition: fixed with two-stage boot in `frontend/src/App.tsx` and shared primitives in `frontend/src/components/LoadingExperience.tsx`.
- Missing shared background activity surface for long-running billing/reporting actions.
  - Disposition: fixed with `TaskQueue` + `JobToast`, wired into billing and reporting.

### `LD-WRONG-TIER`
- Region fetches were falling back to generic page waits or double-loading after auth.
  - Disposition: fixed with route warm caches consumed by each console on first render.
- Several mutations were plain buttons with disabled states but no explicit progress treatment.
  - Disposition: fixed with `ProgressButton` and `ConfirmAction` in-flight state across ingestion, portfolio connection flows, executive exports, insights export, reporting, allocation, governance, and operator refresh.

### `LD-DISHONEST`
- Protected routes risked paying for the same data twice: once in workspace setup, then again in the screen-level skeleton.
  - Disposition: fixed with `frontend/src/bootstrapCache.ts` and route-level cache consumption in warmed consoles.
- Checklist/progress copy needed to map to real awaited work.
  - Disposition: fixed by binding workspace steps to actual awaited operations in `useWorkspaceBoot()`.

### `LD-TOKEN`
- New loader surfaces had to prove token discipline.
  - Disposition: fixed; `npm run lint:theme-colors` passes and the new styles use semantic tokens only.

### `LD-A11Y`
- Loading regions needed explicit busy/progress/live semantics and reduced-motion compatibility.
  - Disposition: fixed in shared primitives and styles. Full manual SR and live-browser validation remain blocked in this environment.

### `LD-COPY`
- Generic loader copy was replaced with present-progressive, state-specific copy.
  - Disposition: fixed in shared boot/session components and progress buttons.

## Verification Evidence

Executed:
- `frontend`: `npm test -- --run`
  - Result: `24` test files passed, `73` tests passed.
- `frontend`: `npm run build`
  - Result: production build passed.
- repo root: `npm run lint:theme-colors`
  - Result: passed, no raw frontend colors outside `frontend/src/tokens.css`.

Relevant automated evidence:
- `frontend/src/App.test.tsx`
  - verifies routed auth screens
  - verifies path-based protected routes
  - verifies staged workspace loader during delayed route warm
- `frontend/src/components/LoadingState.test.tsx`
  - verifies busy skeleton semantics
- existing feature-console suites
  - continue to pass after route warm caching and progress-button adoption

## Component Rollout

Shared primitives:
- `frontend/src/components/LoadingExperience.tsx`
- `frontend/src/components/LoadingState.tsx`
- `frontend/src/bootstrapCache.ts`

Shell wiring:
- `frontend/src/App.tsx`

Feature wiring:
- `frontend/src/features/portfolio/CloudPortfolioConsole.tsx`
- `frontend/src/features/ingestion/IngestionOverview.tsx`
- `frontend/src/features/executive/ExecutiveConsole.tsx`
- `frontend/src/features/insights/InsightsConsole.tsx`
- `frontend/src/features/optimization/OptimizationConsole.tsx`
- `frontend/src/features/billing-agent/BillingAgentConsole.tsx`
- `frontend/src/features/reporting/ReportingConsole.tsx`
- `frontend/src/features/allocation/AllocationConsole.tsx`
- `frontend/src/features/governance/GovernanceConsole.tsx`
- `frontend/src/features/operator/OperatorReadinessConsole.tsx`

## Blocked

- Live browser throttle validation, authenticated Playwright evidence, and dual-mode screenshot capture were not executed in this run.
  - Reason: this environment did not have a prepared authenticated browser session or Keycloak E2E credentials attached to a running local stack for the audit pass.
- Manual screen-reader spot checks and full axe/browser accessibility sweeps were not executed.
  - Reason: no live browser automation session was used in this run.
- Durable cross-route recovery for in-flight background jobs is only partially solved.
  - Current state: billing and reporting jobs surface immediately in-page through `TaskQueue` and `JobToast`.
  - Remaining gap: the backend does not currently expose durable job resources / polling endpoints that would let the UI recover the same in-flight job after a full document navigation.
- No current product route exposes a real streaming/log surface.
  - Current state: `LiveTail` exists in the shared library.
  - Remaining gap: no active screen in this repo currently provides a stream endpoint to wire it to.

## HUMAN_DECISION_GATE Register

| Item | Default used in this run | Follow-up |
| --- | --- | --- |
| Trust-cue copy on the session loader | Kept generic as `SECURE SESSION`, shown only when `window.location.protocol === 'https:'` and the user is authenticated | Security/product can rename the copy if they want a stronger assertion language |
| Background job continuity across full route reloads | Treated as session-local UI evidence until the backend exposes durable job IDs / status endpoints | Add backend job resources before claiming full cross-route continuity |

## Definition Of Done Check

- [x] Inventory written for the current application waits
- [x] Two-stage boot implemented with real step bindings and failure path
- [x] Shared loading primitives added and reused across the app
- [x] No raw frontend colors outside tokens
- [x] Frontend regression floor executed and green
- [ ] Live-browser throttle screenshots, manual SR pass, and authenticated E2E evidence
  - blocked as documented above

