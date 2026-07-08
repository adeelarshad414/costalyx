# Overlay Inventory

Audit date: 2026-07-08

Method:
- Searched `frontend/src` for all shared overlay primitives and any native blocking browser dialogs.
- Verified call sites against the current routed application screens.

Native blocking dialogs:
- `window.confirm`: not found
- `window.alert`: not found
- `window.prompt`: not found

## Shared Overlay Primitives

| Primitive | Purpose | Current call sites | Status | Evidence |
| --- | --- | --- | --- | --- |
| `Dialog` | Confirmation and short-form interruptive decisions | `frontend/src/components/ConfirmAction.tsx` | verified | `frontend/src/components/Overlays.tsx`, `frontend/src/components/ConfirmAction.tsx` |
| `Drawer` | Side-panel detail review without losing list context | Billing anomaly evidence, billing statement detail | verified | `frontend/src/features/billing-agent/BillingAgentConsole.tsx` |
| `PopoverSurface` | Anchored, lightweight contextual overlay | No live product call site yet | available, not deployed | `frontend/src/components/Overlays.tsx` |
| `ToastViewport` | Ephemeral background-job notifications | Shared through `JobToast` in billing and reporting flows | verified | `frontend/src/components/LoadingExperience.tsx`, `frontend/src/features/billing-agent/BillingAgentConsole.tsx`, `frontend/src/features/reporting/ReportingConsole.tsx` |
| `Banner` | Persistent inline notice with optional dismiss | Role scope notice for non-admin sessions | verified | `frontend/src/components/Overlays.tsx`, `frontend/src/auth/RoleScopeNotice.tsx` |

## Overlay Usage Map

| Screen / flow | Overlay | Trigger | Surface decision | Status |
| --- | --- | --- | --- | --- |
| Recommendation apply | `Dialog` via `ConfirmAction` | Analyst clicks `Apply recommendation` | Short confirm, keep list context | verified |
| Billing false positive | `Dialog` via `ConfirmAction` | Analyst clicks `False positive` | Confirm with explicit consequence | verified |
| Billing approve | `Dialog` via `ConfirmAction` | Admin clicks `Approve` | Confirm gated state transition | verified |
| Billing send | `Dialog` via `ConfirmAction` | Admin clicks `Send` | Confirm external delivery action | verified |
| Billing dispute | `Dialog` via `ConfirmAction` | Analyst clicks `Dispute` | Confirm state reversal / review path | verified |
| Billing anomaly evidence | `Drawer` | User clicks `Review evidence` | Rich inspection panel with evidence chain | verified |
| Billing statement detail | `Drawer` | User clicks `Review` | Rich forwardable statement review | verified |
| Role scope notice | `Banner` | Authenticated non-admin session | Persistent informational notice, dismissible | verified |
| Billing/reporting background progress | `ToastViewport` | Task queue mutations complete/fail | Non-blocking acknowledgement | verified |

## Focus / Dismiss Behavior

| Surface | Open focus | Escape behavior | Return focus | Status |
| --- | --- | --- | --- | --- |
| Standard `Dialog` | Primary action by default | closes when dismissible | returns to trigger | verified |
| Destructive `Dialog` | Secondary action first | does not close on `Escape` | returns on explicit close only | verified |
| `Drawer` | Drawer container | closes when dismissible | returns to trigger | verified by implementation and interaction tests |
| `Banner` | no focus grab | not applicable | not applicable | verified |
| `ToastViewport` | no focus grab | not applicable | not applicable | verified |

## Gaps / Blocked

- `PopoverSurface` is implemented but not yet used by a live screen.
- No live browser walkthrough was executed in this pass, so keyboard traversal across every overlay in a real browser remains blocked.
