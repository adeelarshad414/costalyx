# Costalyx Customer Handover Package

Generated: 2026-07-08 PKT

This directory is the handover set for a customer operator, SRE, security
reviewer, or implementation partner. It describes the product that exists in
this repository today: verified locally with deterministic demo data, not yet
proven against real customer AWS/Azure/GCP accounts.

| Artifact | Audience | Verification status |
|---|---|---|
| `OPERATIONS-RUNBOOK.md` | SRE/on-call/operator | Written and linked to Prometheus rules in `deploy/prometheus/costalyx-alerts.yml`. |
| `INSTALLATION-GUIDE.md` | Platform engineer | Compose and Helm commands documented; render checks are executable. Full clean app-tier Compose browser proof remains environment-blocked by local Colima per `PROGRESS.md`. |
| `ONBOARDING-CHECKLIST.md` | Customer admin / FinOps owner | References actual read-only cloud onboarding flow and DUMMY-VALUES swaps. |
| `SECURITY-OVERVIEW.md` | Security reviewer / customer procurement | References `CONFORMANCE.md`, RBAC, audit log, and secrets policy. |
| `SLO-AND-SUPPORT.md` | SRE / support lead | Defines SLOs, error budgets, escalation, and known limitations. |
| `DEMO-SCRIPT.md` | Sales engineer / customer success / evaluator | Uses `demo-seed-profile.json` and existing E2E/screenshot evidence. |
| `DESIGN-SYSTEM.md` | Product designer / frontend engineer | Captures the resolved tokens, shell anatomy, and shared component rules from the real UI layer. |
| `JOURNEYS.md` | Product owner / QA / solutions engineer | Maps the core end-to-end stories to concrete proof files. |
| `KNOWN-LIMITS.md` | Customer sponsor / technical reviewer | Keeps `verified(mock)` boundaries, browser limits, and external inputs explicit. |
| `SCREENSHOT-GALLERY.md` | Marketing / handover / sales engineering | Curates the best current dark/light desktop captures for reuse. |
| `demo-seed-profile.json` | Demo operator / QA | Guarded by `contract/handover-package.spec.ts`; seeded by `npm run seed:demo`. |
| `GO-LIVE-CHECKLIST.md` | Launch owner | Orders dummy-value swaps, live probes, TLS/domain, backup, and first-week monitoring. |

## Current Honest State

- Verified locally against dummy data and deterministic fixtures.
- Multi-tenant, multi-account AWS/Azure/GCP connection model exists.
- Customers share read-only references, not access keys.
- Real production cloud proof remains blocked until customer cloud references
  and Costalyx broker identities are supplied.
- Census/report companions for this handover layer live at the repo root:
  `HANDOVER-CENSUS.md` and `HANDOVER-EXCELLENCE-REPORT.md`.
