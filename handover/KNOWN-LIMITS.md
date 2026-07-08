# Costalyx Known Limits

Generated: 2026-07-08 PKT

This file is intentionally blunt. Anything listed here is either still
`verified(mock)`, still environment-blocked, or still a deliberate roadmap gap.

## Verified(Mock) Boundaries

1. Real-cloud probes are not yet verified against customer-owned AWS, Azure,
   and GCP accounts.
2. Demo data is deterministic and presentable, but it is still demo data. It
   proves UI wiring and operator flow, not customer-cloud correctness.
3. Browser journey evidence in this repo is currently strongest in Chromium.
   Wider browser certification should happen in customer CI before formal
   launch.

## External Inputs Still Required

- `COSTALYX_TENANT_ID`
- AWS account ID, readonly role ARN, CUR location, and broker identity
- Azure billing scope, delegated principal, export storage reference, and
  broker identity
- GCP billing resource, Workload Identity Federation reference, BigQuery export
  reference, and broker identity

These are already surfaced by `npm run probe:live-readiness`.

## Environment Limits

- The local workstation has previously shown Docker/Colima instability during
  the broader app-tier browser path. The repo contains mitigations and render
  proofs, but a clean CI or customer staging run is still the preferred final
  execution environment.
- Lighthouse numbers from the broader production-readiness run remain the
  latest carried evidence. This handover pass focused on shell/system-page
  completeness and package quality rather than a fresh Lighthouse rerun.

## Accepted Product Gaps

- `GAP-045` Commitment management is not yet a mature RI/Savings Plan/CUD
  portfolio cockpit.
- `GAP-046` Unit economics is not yet a first-class configurable business-metric
  surface.
- `GAP-047` Formal FOCUS export is not yet shipped as a customer-facing export.

## Browser Support Matrix

Current local evidence:

- Chromium: strongest evidence, including Playwright journeys and responsive
  checks
- Firefox: not rerun in this handover pass
- WebKit/Safari: not rerun in this handover pass

Ship posture: acceptable for repository handover, not yet the final word for a
customer production acceptance matrix.
