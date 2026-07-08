# COMPETITIVE-MATRIX.md - Costalyx Market Benchmark

Generated: 2026-07-08 PKT

Scope: public, verifiable product knowledge only. Competitor entries summarize
official public pages or documentation. Unclear claims are marked unverified
rather than inferred. Costalyx status is the only status that feeds the Gap
Register.

## Public Sources Used

- IBM Cloudability: https://www.apptio.com/products/cloudability/
- CloudZero docs and platform pages: https://docs.cloudzero.com/docs and
  https://www.cloudzero.com/platform
- Kubecost / IBM Kubecost: https://www.apptio.com/products/kubecost/
- Vantage: https://www.vantage.sh/ and https://docs.vantage.sh/
- Flexera One Cloud Cost Optimization:
  https://www.flexera.com/flexera-one/cloud-cost-optimization
- AWS Cost Management: https://docs.aws.amazon.com/cost-management/
- Azure Cost Management:
  https://learn.microsoft.com/en-us/azure/cost-management-billing/
- Google Cloud cost management: https://cloud.google.com/cost-management and
  https://cloud.google.com/billing/docs/how-to/reports

## Matrix

Legend for Costalyx: ahead = demonstrably stronger or more open than the
market baseline; parity = enough for handover-grade use; behind = accepted
roadmap gap; partial = implemented with documented boundary; non-goal =
intentionally outside current product.

| Capability | Costalyx | IBM Cloudability | CloudZero | Kubecost | Vantage | Flexera One | Native AWS/Azure/GCP tools |
|---|---|---|---|---|---|---|---|
| Ingestion breadth | Partial/parity: AWS CUR/S3, Azure Blob export, and GCP BigQuery export adapters exist; real provider probes remain blocked pending customer references. Evidence: `scripts/seed-demo-data.mjs`, `backend/src/ingestion/billing-source-reader.ts`, Milestone H in `PROGRESS.md`. | Ahead for mature enterprise cloud ingestion per official Cloudability positioning. | Ahead for mature SaaS ingestion breadth per platform/docs. | Behind outside Kubernetes focus; strong for Kubernetes cost telemetry. | Ahead for broad SaaS cloud account coverage. | Ahead for enterprise multi-cloud coverage. | Behind for cross-cloud rollup because each native tool is provider-local. |
| Allocation model | Ahead: unbounded dimensions, account groups, saved views, statement scopes, and tenant isolation. Evidence: `e2e/it-manager-showback-scopes.spec.ts`, allocation tests. | Parity: mature allocation/reporting is public product focus. | Parity/ahead: strong cost allocation and unit-cost orientation. | Parity for Kubernetes namespace/label allocation. | Parity for provider/account/tag-driven reports. | Parity for enterprise allocation and governance. | Partial: provider tags/labels and cost categories exist, but cross-cloud allocation is fragmented. |
| Tagging flexibility | Ahead: custom dimensions and resource tags are not hardcoded to a fixed business taxonomy. | Parity, official pages emphasize cloud cost allocation and accountability. | Parity/ahead, CloudZero dimensions are central to its model. | Parity for Kubernetes labels/namespaces. | Parity for tags/accounts/business dimensions where provider data exists. | Parity for enterprise tagging/governance. | Partial: provider tag models differ and do not become one portable taxonomy by default. |
| Anomaly detection | Ahead for evidence chaining: seeded anomalies include pricing/usage evidence, impact math, and UI story panels. Evidence: `e2e/anomaly-detail-story.spec.ts`. | Parity: Cloudability markets cloud cost management and optimization; specific anomaly details require deeper docs. | Parity/ahead: anomaly detection is a public CloudZero capability. | Partial: cost alerts exist around Kubernetes spend; general cloud anomaly breadth is not the core product. | Parity: Vantage publicly offers cost alerts/anomaly-style monitoring. | Parity: enterprise optimization platforms include spend visibility and governance. | Partial: AWS has Cost Anomaly Detection; Azure/GCP have cost alerts/budgets/reports, but cross-provider evidence chains are fragmented. |
| Commitment management | Behind: Costalyx surfaces reserved/spot pricing and optimization signals, but does not yet provide mature RI/Savings Plan/CUD purchase planning, coverage/expiration forecasting, or commitment portfolio workflows. Gap: GAP-045. | Ahead: enterprise FinOps platforms commonly include commitment optimization. | Ahead/parity: public CloudZero material covers commitment/savings management. | Partial: Kubernetes cost savings, not full cloud commitment portfolio. | Ahead/parity: commitment recommendations and reporting are market expectations. | Ahead: enterprise cloud cost optimization includes commitment management. | Parity within provider silos; no native cross-provider commitment cockpit. |
| Unit economics | Behind: statements and dimensions support showback, but configurable business metric ingestion and cost-per-unit KPIs are not first-class yet. Gap: GAP-046. | Parity: allocation supports business accountability, public unit-economics specificity varies. | Ahead: CloudZero explicitly positions unit economics as a core capability. | Partial: Kubernetes unit economics possible through labels but not business-metric native. | Partial/parity: reporting can model units externally. | Parity: enterprise reporting can map to business units. | Partial: native tools require external modeling for product/customer unit economics. |
| Showback / chargeback | Ahead: approval-gated stakeholder statements, line items, reconciliation, delivery, and audit trail exist. Evidence: `e2e/statement-detail-document.spec.ts`, `e2e/external-stakeholder-statement-delivery.spec.ts`. | Parity: enterprise showback/chargeback is a Cloudability market fit. | Parity: cost allocation supports showback. | Partial: Kubernetes cost allocation supports internal showback. | Parity: reports/budgets support stakeholder sharing. | Parity: enterprise ITFM/FinOps showback is core. | Partial: provider-specific exports and reports need external chargeback workflow. |
| Executive reporting | Parity/ahead: executive summary, TCO, portfolio rollup, and persona-specific E2E evidence exist. Evidence: `e2e/ceo-executive-summary.spec.ts`, `e2e/solution-architect-tco.spec.ts`. | Parity. | Parity. | Partial outside Kubernetes executives. | Parity. | Parity. | Partial: strong provider dashboards, weak multi-cloud executive rollup. |
| API / export | Parity: OpenAPI, generated client, CSV/PDF-style payloads, reports, and contract/live-contract tests exist. | Parity: enterprise product APIs depend on plan/docs. | Parity. | Parity for Kubernetes cost APIs. | Parity: public docs expose API workflows. | Parity. | Parity inside each provider; cross-cloud export normalization is customer-owned. |
| RBAC / multi-tenant | Ahead for self-hosted tenant-first posture: server-side RBAC penetration matrix, tenant-scoped connections, audit log, and Keycloak integration. | Parity for enterprise SaaS. | Parity for SaaS enterprise controls. | Partial for cluster/team boundaries. | Parity. | Parity. | Partial: strong IAM per provider, no unified cross-cloud tenant model. |
| Self-host / data residency | Ahead: Docker Compose and Helm self-host paths, local Vault/Keycloak/Postgres, and no required SaaS data egress. | Behind for customers requiring full self-host; primarily SaaS/enterprise managed. | Behind for full self-host needs. | Ahead/parity for self-hosted Kubernetes cost monitoring. | Behind for full self-host needs. | Behind for full self-host needs. | Ahead for provider-resident data, but not unified multi-cloud. |
| Pricing model | Ahead: Apache-2.0 self-hosted repo; no percentage-of-spend pricing in the product. | Behind for open-source/self-host pricing; commercial SaaS. | Behind for open-source/self-host pricing; commercial SaaS. | Parity/ahead if self-hosted/open Kubecost edition is sufficient. | Behind for open-source/self-host pricing; commercial SaaS. | Behind for open-source/self-host pricing; commercial SaaS. | Parity for included native tools, but full cross-cloud features require multiple provider surfaces. |

## Costalyx Gap Register Feed

| ID | Capability | Status | Reasoning |
|---|---|---|---|
| GAP-045 | Commitment management | Roadmap accepted | Costalyx currently explains pricing model and optimization signals, but mature RI/Savings Plan/CUD portfolio planning is a market differentiator not yet built. |
| GAP-046 | Unit economics | Roadmap accepted | Costalyx can allocate by dimensions and statements, but CloudZero-style configurable business metric ingestion and cost-per-unit KPIs are not first-class. |
| GAP-047 | Formal FOCUS export | Roadmap accepted | The normalized model maps cleanly to FOCUS concepts, but there is no FOCUS-conformant export endpoint or file generator yet. |

## Demonstrated Differentiators

| Claim | Proof pointer |
|---|---|
| Auditable pricing math | `contract/demo-seed.spec.ts` computes statement totals from `hourly_rate_usd * usage_hours`; `PROGRESS.md` records the invariant. |
| Unbounded dimensions | Allocation dimension/resource tag APIs and `e2e/it-manager-showback-scopes.spec.ts`. |
| Evidence-chained anomalies | `e2e/anomaly-detail-story.spec.ts` and Billing Agent UI tests. |
| Approval-gated agentic invoicing | `e2e/external-stakeholder-statement-delivery.spec.ts` and billing-agent service tests. |
| Full self-hosting path | `docker-compose.yml`, `docker-compose.prod.yml`, `deploy/helm/costalyx`, and `DEPLOY-GUIDE.md`. |
| Designed empty/error/loading states | Component tests for `EmptyState`, `ErrorState`, `LoadingState`; UI/UX evidence in `PROGRESS.md`. |

