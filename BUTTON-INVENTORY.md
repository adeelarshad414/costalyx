# Button Inventory

Audit date: 2026-07-08

Method:
- Searched `frontend/src` for native `<button>` usage outside the shared primitive implementation.
- Verified current action surfaces now route through shared button components.

Raw button audit result:
- Native `<button>` remains only inside `frontend/src/components/Button.tsx`.
- No feature screen renders ad-hoc raw buttons after this pass.

## Shared Button Primitives

| Primitive | Purpose | Status | Evidence |
| --- | --- | --- | --- |
| `Button` | Standard actions, segmented controls, export/copy commands, destructive actions | verified | `frontend/src/components/Button.tsx` |
| `ButtonLink` | Routed/auth-style link actions that should look like buttons | verified | `frontend/src/components/Button.tsx`, `frontend/src/App.tsx`, `frontend/src/auth/AuthPage.tsx` |
| `IconButton` | Compact icon-only controls with labels/tooltips | verified | `frontend/src/components/Button.tsx`, `frontend/src/components/Overlays.tsx`, `frontend/src/components/ThemeToggle.tsx` |
| `ProgressButton` | In-flight mutation buttons with width-stable labels | verified | `frontend/src/components/LoadingExperience.tsx` |
| `ConfirmAction` | Trigger button plus shared confirm dialog | verified | `frontend/src/components/ConfirmAction.tsx` |

## Rollout By Area

| Area | Shared button coverage | Status |
| --- | --- | --- |
| Auth shell | Sign in, sign up, auth retry, not-found return | verified |
| Global shell | Sign out, route escape links, theme toggle | verified |
| Settings | Theme, accent, density segmented controls | verified |
| Portfolio | Refresh, provider tabs, connection copy, onboarding artifact copy, progress actions | verified |
| Insights | Provider tabs, view toggles, export | verified |
| Billing agent | Review, export, approve/send/dispute/false-positive flows, drawer footer exports | verified |
| Optimization | Apply recommendation confirm path | verified |
| Governance | Export plus disabled future privileged actions rendered with shared styling | verified |
| Allocation / Executive / Reporting / Operator / Ingestion | Existing progress and retry actions routed through shared button system | verified |

## Variant Inventory

| Variant / form | Current usage |
| --- | --- |
| `primary` | Active segmented state, primary route links, confirm actions |
| `secondary` | Default in-panel actions, refresh/copy/review/export buttons |
| `ghost` | Low-emphasis toggles and dismiss actions |
| `destructive` | Final destructive confirmation submit |
| `destructive-quiet` | Destructive action trigger before confirmation |
| `link` | Inline auth/navigation links |
| `icon` | Theme toggle and overlay close controls |

## Notes

- Governance placeholder actions are now rendered as disabled shared buttons instead of live-looking dead buttons.
- Shared button loading states preserve label width and expose `aria-busy` through the primitive.
