# 04-DESIGN-SYSTEM.md — Costalyx Design System

## Design tokens
All values below are implemented as CSS custom properties / Tailwind theme
extensions — **never hardcoded hex strings inside component files**. This is
enforced by a lint rule (`no-hardcoded-color`) checked in CI.

```css
:root[data-theme="dark"] {
  --brand-primary: #5B5FEF;
  --brand-primary-dim: #3D3FA6;
  --brand-accent: #22D3B8;
  --brand-ink: #0B0E14;
  --surface-1: #12151C;
  --surface-2: #1B1F29;
  --border-subtle: #262B36;
  --text-primary: #E6E9F0;
  --text-secondary: #8A90A2;
  --status-success: #2FBF71;
  --status-warning: #F2B84B;
  --status-danger: #EF5C5C;
  --status-info: #4EA8DE;
}
:root[data-theme="light"] {
  --brand-primary: #5B5FEF;
  --brand-accent: #1FAE96;
  --brand-ink: #FFFFFF;
  --surface-1: #F4F5F8;
  --surface-2: #E9EBF0;
  --border-subtle: #D8DBE3;
  --text-primary: #12151C;
  --text-secondary: #5B6070;
  /* status tokens unchanged across themes */
}
```

## Typography
- UI: Inter, weights 400/500/600/700
- Numeric/telemetry (all cost figures, timestamps, resource IDs): JetBrains
  Mono — applied via a `.font-mono-data` utility class, required on every
  component that renders a monetary or numeric-ID value

## Component inventory (shadcn/ui base + Costalyx extensions)
| Component | Notes |
|---|---|
| `<KpiCard>` | icon, label, value (mono), optional trend delta, optional tooltip |
| `<DataTable>` | sortable, filterable, paginated, CSV export action, sticky header |
| `<SankeyFlow>` | wraps d3-sankey; editable dimension chips above; cost-floor slider |
| `<TrendChart>` | recharts-based; brand-accent primary series, categorical extension set for multi-series |
| `<EmptyState>` | icon + message + primary action — **mandatory on every list/table view**, no view ships without one |
| `<ErrorState>` | persona-appropriate message + retry action — **replaces raw toast-only errors** seen in the competitive audit |
| `<PermissionGate>` | wraps privileged UI; renders `<ErrorState variant="unauthorized">` if a 403 is returned, never a blank panel |
| `<ReportCard>` | used in the Report Gallery grid |
| `<FilterChip>` | removable/reorderable, used across Explorer and Views |

## Empty & error state requirement (explicit, testable)
Every screen defined in `01-SPEC.md` must implement both:
1. An empty state (zero data, e.g., no Views created yet) with a clear
   primary action — not a bare heading and nothing else
2. An error state (API failure, 403, timeout) with a human-readable message
   and a retry path — not a generic toast with no in-page fallback

This is enforced as a checklist item in each milestone's Definition of Done
(see `06-INTEGRATIONS.md` and `08-TESTING-STRATEGY.md`), directly correcting
the two unhandled-state bugs observed in the Cloudability UI audit
(blank date-range fields, raw "Unauthorized"/fetch-error toasts).

## Accessibility
- WCAG AA minimum contrast for all text/background token pairs above
- All interactive elements keyboard-navigable; charts have a data-table
  fallback view for screen readers (`<SankeyFlow>` and `<TrendChart>` both
  expose a "View as table" toggle)

## Layout / IA
Sidebar IA mirrors the verb-based structure validated in the competitive
audit — `Insights → Optimize → Organize` — plus a `Home` (persona-specific
landing) and `Reports` top-level section, and an `Admin` section gated by
role.
