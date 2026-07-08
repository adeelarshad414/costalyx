# Overlay Audit Report

Audit date: 2026-07-08

## Summary

This pass standardized overlays and action surfaces around shared primitives:
- `Dialog`
- `Drawer`
- `PopoverSurface`
- `ToastViewport`
- `Banner`
- `Button` / `ButtonLink` / `IconButton`

The biggest cleanup was replacing improvised or inconsistent surfaces with explicit shared behavior:
- inline pseudo-confirm panels moved to a real modal dialog
- embedded billing detail panels moved to drawers
- role-scope messaging moved to a shared dismissible banner
- remaining feature-level raw buttons were replaced with the shared button system

## Findings And Dispositions

### `OVR-WRONG-SURFACE`
- Confirm flows were implemented through an inline alert-style block instead of a real shared modal.
  - Disposition: fixed by routing `ConfirmAction` through `Dialog`.
- Billing anomaly evidence and statement detail were embedded into page flow instead of opening in a contextual overlay.
  - Disposition: fixed by moving both to `Drawer`.

### `OVR-INCONSISTENT-ACTIONS`
- Portfolio, insights, governance, auth, and shell surfaces still had local button markup instead of the shared action system.
  - Disposition: fixed by routing remaining feature buttons through `Button`, `ButtonLink`, `IconButton`, or `ProgressButton`.

### `OVR-A11Y`
- Overlay lifecycle needed explicit focus placement, escape semantics, return-focus handling, and background inerting.
  - Disposition: fixed in `frontend/src/components/Overlays.tsx` and verified by automated interaction tests.
- Destructive confirm flows needed safer default focus and non-ambient dismissal.
  - Disposition: fixed; destructive dialogs focus the secondary action first and ignore `Escape`.

### `OVR-LEGACY`
- The role notice was a custom strip outside the shared overlay language.
  - Disposition: fixed by moving it to `Banner` with persisted dismissal via user preferences.
- Native blocking browser dialogs were a risk to audit for.
  - Disposition: verified absent; no `window.confirm`, `window.alert`, or `window.prompt` calls remain in `frontend/src`.

## Verification Evidence

Executed:
- `frontend`: `npm test -- --run`
  - Result: `24` test files passed, `75` tests passed.
- `frontend`: `npm run build`
  - Result: production build passed.
- repo root: `npm run lint:theme-colors`
  - Result: passed, no raw frontend colors outside `frontend/src/tokens.css`.

Relevant automated evidence:
- `frontend/src/components/ConfirmAction.test.tsx`
  - verifies confirm dialog rendering
  - verifies focus enters the dialog and returns to the trigger on close
  - verifies destructive dialogs focus the safe action first and stay open on `Escape`
- `frontend/src/features/billing-agent/BillingAgentConsole.test.tsx`
  - verifies anomaly evidence and statement detail review flows through shared drawers
  - verifies billing mutation confirms continue to gate approve/send/dispute/false-positive actions
- `frontend/src/auth/RoleScopeNotice.test.tsx`
  - verifies banner-based role guidance remains visible for viewer sessions and absent for admins

## Blocked

- No live Playwright/browser walkthrough was executed for this pass, so full keyboard-only smoke coverage across every overlay in an actual browser remains blocked.
- `PopoverSurface` exists as a shared primitive but does not yet have a routed product call site, so no live product-level popover behavior was verified.
- Manual screen-reader confirmation was not executed in this environment.

## Overall Status

- Shared overlay primitives: implemented
- Shared button primitives: implemented
- Raw feature-level button cleanup: complete
- Billing detail surface migration: complete
- Confirm dialog migration: complete
- Regression floor: green
