# HOW-TO-USE.md - Costalyx Operator And Persona Guide

This guide describes what exists in the current app. Local data is seeded dummy
data until real AWS, Azure, and GCP read-only references are configured.

## Start The Local Demo

```bash
npm install
npm run dev-up
npm run seed:demo
```

Open the frontend at `http://localhost:5173`. The local Keycloak realm is
`costalyx-dev`; the E2E seeder creates `costalyx-e2e-admin` when browser tests
run. For repeatable browser verification in this workstation, keep Docker for
Postgres, Keycloak, Vault, Redpanda, and Mailpit, then run backend/frontend on
the host as documented in `DEPLOY-GUIDE.md`.

## Connect Cloud Accounts

Use the Cloud portfolio section as an admin.

1. Choose AWS, Azure, or GCP and enter the customer account, scope, or project
   reference.
2. Provide only read-only references:
   - AWS: customer account ID, read-only role ARN, unsigned CUR S3 URI.
   - Azure: billing scope, delegated principal ID, unsigned export Blob URI.
   - GCP: billing resource, Workload Identity Federation provider, BigQuery
     export URI.
3. Copy the generated onboarding artifacts. AWS includes external ID, trust
   policy, permissions policy, CloudFormation, and Terraform.
4. Run the readiness doctor, then the provider live probe once real broker
   identity values exist.

Costalyx rejects customer access keys, SAS URLs, service-account JSON, client
secrets, private keys, signed URLs, and base64 credential blobs before
persistence.

## Review Accounts Separately And Together

The Portfolio and Costs sections show each connected cloud account separately.
Account groups and allocation dimensions let teams view separate accounts,
provider totals, and collective multi-cloud spend in one model. Demo data
contains AWS, Azure, and GCP accounts for the default tenant.

## Allocate Spend

IT managers and FinOps users work in Allocation.

1. Review dimensions and resource tags.
2. Create or inspect ownership scopes.
3. Use showback aggregates to find untagged or misallocated spend.
4. Export/report the allocation view after tags and dimensions reconcile.

All money is computed from `hourly_rate_usd * usage_hours`; totals are not
stored as independent editable values.

## Triage An Anomaly

FinOps and DevOps/SRE users work in Billing Agent and Insights.

1. Open Billing Agent.
2. Select `Review evidence` for an anomaly.
3. Read the story panel: what changed, since when, affected resource, computed
   impact, evidence chain, and recommended action.
4. Mark false positives only after confirming the evidence. The UI requires a
   consequence confirmation for high-consequence actions.

## Approve And Send A Statement

CFOs and external stakeholders work in Billing Agent statements.

1. Generate or review a statement.
2. Open `Review statement` to view the forwardable document: narrative, line
   items, reconciliation, warnings, variance movers, stakeholder contact, and
   anomaly count.
3. Approve the statement.
4. Send only after approval. Local sends go to Mailpit at `http://localhost:8025`.

Production sends require a real SMTP provider configured from Vault-managed
secrets.

## Run A TCO Estimate

Solution architects use Executive / TCO controls.

1. Open the executive summary.
2. Enter or select the workload profile.
3. Run the TCO estimate.
4. Compare provider options and export the result for architecture review.

## Build A Report Or View

Analysts use Reporting and Cost Explorer.

1. Filter by provider, account group, service, period, or allocation dimension.
2. Toggle Cost Explorer between flow and table views when detailed inspection is
   easier in tabular form.
3. Save a view for repeatable analysis.
4. Use reports for stakeholder-ready summaries.

## Screenshots

The latest elevated UI screenshot index is `SCREENSHOT-INDEX.md`. It points to
desktop, tablet, and mobile screenshots for dark/light plus default/terracotta
appearance modes under `artifacts/theme-audit/2026-07-07/`.

## Production Boundary

Local demo evidence is `verified(mock)`. Real production cloud evidence starts
only when `npm run probe:live-readiness` passes and provider probes exit `0`
against real customer read-only cloud references.
