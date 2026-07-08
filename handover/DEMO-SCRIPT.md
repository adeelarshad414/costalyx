# Costalyx Demo Script

Duration: 15 minutes

Seed profile: `handover/demo-seed-profile.json`
Seed command: `npm run seed:demo`

## 1. Executive Moment

Route: `/executive`

Show:
- Multi-cloud executive rollup.
- Budget and trend signals.
- What-if TCO estimate.

Proof: `e2e/ceo-executive-summary.spec.ts` and
`e2e/solution-architect-tco.spec.ts`.

## 2. Portfolio Moment

Route: `/portfolio`

Show:
- AWS, Azure, and GCP connections.
- Separate account visibility and collective rollup.
- Ready-for-live-probe status in demo data.

Proof: `e2e/cloud-onboarding-copy-artifacts.spec.ts`.

## 3. Cost Explorer Moment

Route: `/costs`

Show:
- Provider/account/service filtering.
- Flow view and table fallback.
- Monetary values rendered from hourly rate and usage.

Proof: `e2e/cost-explorer-table-fallback.spec.ts`.

## 4. FinOps Anomaly Moment

Route: `/billing-agent`

Show:
- Anomaly queue.
- Review evidence story: what changed, since when, impact, evidence chain.
- False-positive confirmation pattern.

Proof: `e2e/anomaly-detail-story.spec.ts`.

## 5. Showback / Chargeback Moment

Route: `/billing-agent`

Show:
- Stakeholder statement.
- Forwardable statement document.
- Approval-gated send to Mailpit.

Proof: `e2e/statement-detail-document.spec.ts` and
`e2e/external-stakeholder-statement-delivery.spec.ts`.

## 6. IT Manager Moment

Route: `/allocation`

Show:
- Account groups.
- Allocation dimensions.
- Untagged spend and aggregate view.

Proof: `e2e/it-manager-showback-scopes.spec.ts`.

## 7. Operator Moment

Route: `/operator`

Show:
- Readiness checks.
- Live cloud probe blockers.
- Go-live actions remaining.

Proof: `e2e/operator-readiness.spec.ts` and `npm run probe:live-readiness`.

## Screenshot Archive

Use `SCREENSHOT-INDEX.md` and `artifacts/theme-audit/2026-07-07/` for current
desktop/tablet/mobile, light/dark, default/terracotta screenshots. Fresh demo
walkthrough screenshots require a running browser stack.

