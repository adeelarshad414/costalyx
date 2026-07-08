# Costalyx Design System

Generated: 2026-07-08 PKT

This is the resolved in-repo design-system handover, based on the actual shared
frontend layer rather than an aspirational Figma-only description.

## Brand and Theme Rules

- Product name: `Costalyx`
- Shell posture: dark-first enterprise workspace with equivalent light mode
- Accent model: `default` plus `terracotta`
- Typography roles:
  - body and headings: Inter/system sans
  - monetary and tabular values: JetBrains Mono-style mono treatment via the
    app's `font-mono-data` usage
- Radius rule: 8px at the component edge unless the interaction is icon-sized
- Motion rule: restrained opacity/transform transitions; no decorative motion

## Token Families

The source of truth is `frontend/src/tokens.css`.

Core token families:

- brand: `--brand-primary`, `--brand-primary-dim`, `--brand-accent`
- surfaces: `--surface-1`, `--surface-2`
- borders: `--border-subtle`
- text: `--text-primary`, `--text-secondary`, `--text-on-primary`
- semantic states: `--status-success`, `--status-warning`, `--status-danger`,
  `--status-info`
- browser chrome integration: `--browser-theme-color`

Resolved modes:

| Mode | Accent | Intent |
| --- | --- | --- |
| dark | default | primary operating mode for dense cloud-finops work |
| dark | terracotta | alternate accent for handover/theme parity checks |
| light | default | customer-safe light mode with contrast-safe accent darkening |
| light | terracotta | alternate accent with the same semantic scale |

## Shared Primitives

| Primitive | Usage rule |
| --- | --- |
| `Button`, `ButtonLink`, icon buttons | All user-triggered actions run through the shared button system so states, icon spacing, and loading treatment remain consistent |
| `ThemeToggle` | Quick mode affordance in shell and auth; full control stays in Settings |
| `LoadingState` | Every route must use a shape-matched skeleton instead of blank spinners |
| `EmptyState` | Every surface that can have zero data gets a real title and next-step cue |
| `ErrorState` | Every recoverable data failure gets designed copy and a retry action when meaningful |
| `ConfirmAction` | Mutating actions with financial, delivery, or recommendation impact must confirm before execution |
| `Dialog`, `Drawer`, `PopoverSurface`, `Banner`, `ToastViewport` | Overlay and status surfaces come from one accessibility-aware implementation layer |
| `BootSplash`, `SessionLoader`, `TaskQueue`, `JobToast`, `ProgressButton` | Loading/progress behavior is productized, not ad hoc |

## Shell Anatomy

- Desktop: left sidebar navigation, right content pane, top bar, route hero,
  notices/profile overlays
- Tablet/mobile: sidebar becomes off-canvas drawer; top bar condenses; route
  content remains routed by page, not stacked as a one-page SPA
- Global utility surfaces: skip link, theme toggle, role scope banner, command
  palette, account menu, notices menu

## Content and Layout Rules

- Sentence case throughout user-visible copy
- No raw hex colors outside `tokens.css`
- Numbers and money align right in tables and use monospaced numerals
- Tables may scroll horizontally only when intentional; otherwise mobile
  layouts collapse or wrap explicitly
- Empty, loading, error, denied, and success states are part of the component
  contract, not optional extras

## Feature Surface Inventory

- Portfolio: tenant/account/cloud onboarding and readonly onboarding artifacts
- Costs: normalized cost records and ingestion trigger
- Executive: executive summary, top movers, what-if TCO, export
- Insights: inventory, explorer flow, provider-filtered records, CSV export
- Optimization: open recommendations, realized savings, apply flow
- Billing Agent: anomalies, statements, delivery, evidence drawers, agent runs
- Reporting: report catalog, saved views, report execution activity
- Allocation: dimensions, mappings, resource-tag workflows
- Governance: role inventory and export
- Settings: appearance, density, preference persistence
- Operator: readiness and launch blockers

## Accessibility / Interaction Rules

- Drawer and dialog flows trap focus and close on Escape
- Keyboard path exists for shell navigation, sign-in flows, and command palette
- Error copy is sanitized for users; raw stacks and credentials do not surface
- Theme, accent, and reduced-motion checks belong to the regression floor

## What To Extend Next

- Keep new screens on the same route-first shell model
- Add new colors only through `tokens.css`
- Reuse `ConfirmAction`, `LoadingState`, and `ErrorState` before inventing
  per-feature alternatives
- Keep system pages (`/error`, `/maintenance`, unknown routes) aligned with the
  same token and action language as auth and shell surfaces
