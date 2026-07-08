# CONFORMANCE.md - Costalyx Best-Practice Conformance

Generated: 2026-07-08 PKT

Status vocabulary: conforms, partial, gap, not-applicable. "Partial" and
"gap" items are linked to GAP-REGISTER rows or a documented blocked condition.

## Source References

- FinOps Foundation capabilities: https://www.finops.org/framework/capabilities/
- FOCUS: https://focus.finops.org/
- AWS Well-Architected cost optimization:
  https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/
- Azure Well-Architected cost optimization:
  https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/
- Google Cloud cost optimization framework:
  https://cloud.google.com/architecture/framework/cost-optimization
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- Twelve-Factor App: https://12factor.net/
- WCAG 2.1: https://www.w3.org/TR/WCAG21/
- Google SRE workbook SLOs:
  https://sre.google/workbook/implementing-slos/

## FinOps FOCUS Alignment

| Area | Status | Evidence |
|---|---|---|
| Provider and account identity | Conforms | `provider`, `account_id`, external tenant/account references, and tenant-scoped cloud connections are stored and exposed. |
| Service / SKU / resource identity | Conforms | Cost records include service, SKU, resource ID, usage category, and period boundaries. |
| Cost math | Conforms | Cost is computed from `hourly_rate_usd * usage_hours`; no separately edited total. |
| Pricing model | Conforms | `pricing_model` captures on-demand, spot, and reserved-like states with spot estimates flagged. |
| Tags / dimensions | Conforms | Resource tags and allocation dimensions support showback and reporting. |
| Formal FOCUS export | Gap | GAP-047: normalized data maps to FOCUS, but no FOCUS-formatted export endpoint exists yet. |

## FinOps Framework Capabilities

| Capability | Maturity | Status | Evidence |
|---|---|---|---|
| Allocation | Run | Conforms | Dimensions, account groups, saved views, showback statements, and IT manager E2E. |
| Anomaly management | Walk/run | Conforms | Billing Agent scans, anomaly evidence story, false-positive controls. |
| Forecasting basics | Crawl | Partial | Executive trend and TCO estimator exist; no full forecast engine or commitment forecast yet. |
| Chargeback/showback | Walk/run | Conforms | Statement generation, approval, send, line-item reconciliation, audit trail. |
| Commitment optimization | Crawl | Gap | GAP-045: commitment portfolio planning is roadmap. |
| Unit economics | Crawl | Gap | GAP-046: business metric ingestion and cost-per-unit KPIs are roadmap. |

## Cloud Well-Architected Cost Pillars

| Practice | Status | Costalyx mapping |
|---|---|---|
| Measure and attribute spend | Conforms | Ingestion, normalized records, dimensions, account groups, saved views. |
| Optimize resource usage | Conforms | Optimization recommendations and realized-savings evidence. |
| Use commitment/discount models | Partial | Pricing model distinguishes reserved/spot/on-demand, but commitment portfolio planning is GAP-045. |
| Monitor and alert on spend changes | Conforms | Anomaly detection, evidence stories, cloud validation metrics, alert rules in `deploy/prometheus/costalyx-alerts.yml`. |
| Govern with least privilege | Conforms | Customers provide read-only roles/federated identities; secret-shaped payloads are rejected. |
| Real provider verification | Blocked | Milestone H live probes require real customer references and broker identities. |

## SRE Conformance

| Item | Status | Evidence |
|---|---|---|
| API availability SLO | Conforms | Target: 99.9% monthly availability for `/health/live`, `/health/ready`, and authenticated API traffic. Error budget: 43.2 minutes per 30 days. |
| Ingestion freshness SLO | Conforms | Target: 95% of enabled cloud connections ingest within 24 hours of provider export availability; scheduler metrics expose enabled state. |
| Dashboard latency SLO | Partial | Target: p95 authenticated dashboard route usable within 3 seconds on seeded data; browser suite has timing evidence, but no production RUM yet. |
| Alert wiring | Conforms | Prometheus rules added in `deploy/prometheus/costalyx-alerts.yml`; runbooks live in `handover/OPERATIONS-RUNBOOK.md`. |
| Error budget policy | Conforms | `handover/SLO-AND-SUPPORT.md` defines burn responses and escalation. |

## DevSecOps / OWASP ASVS Level 2 Target

| Control family | Status | Evidence |
|---|---|---|
| Authentication | Conforms | Keycloak OIDC, login/signin/signup routes, OIDC outage tests. |
| Authorization | Conforms | Server-side role guards and mutating-route RBAC matrix covering lower-role denials. |
| Input validation | Conforms | DTO validation, problem-details responses, filter/tag/narrative validation coverage. |
| Secrets handling | Conforms | Startup guard, gitleaks gate, cloud credential rejection, Vault paths only for secrets. |
| Session and token handling | Conforms | Auth provider tests, logout/session recovery E2E, JWKS cache hardening. |
| CORS and headers | Conforms | CORS tests, security header middleware and tests. |
| Audit logging | Conforms | Audit-log outcome migration and completeness matrix. |
| Dependency hygiene | Conforms | `npm audit --audit-level=high` evidence in `PROGRESS.md`. |

## Twelve-Factor And Container Practices

| Factor / practice | Status | Evidence |
|---|---|---|
| Config via environment | Conforms | Compose, prod Compose, Helm values, and `DUMMY-VALUES.md`. |
| Backing services attached resources | Conforms | Postgres, Keycloak, Vault, Redpanda, Mailpit via Compose/Helm config. |
| Build/release/run separation | Partial | Dockerfiles and Helm exist; image publishing/release promotion is not yet wired to a registry. |
| Stateless app processes | Conforms | API/worker use Postgres/event bus for state; scheduler isolated to worker. |
| Disposability | Conforms | Health endpoints, readiness probes, production image smoke. |
| Dev/prod parity | Partial | Local and prod Compose/Helm render; full Compose app-tier browser proof remains Colima-blocked per PROGRESS. |
| Logs as event streams | Conforms | JSON logger and production image observability smoke. |

## Accessibility / WCAG 2.1 AA

| Area | Status | Evidence |
|---|---|---|
| Axe scans | Conforms locally | `e2e/uiux-accessibility-theme.spec.ts` covers default and terracotta accent scans. |
| Keyboard access | Conforms locally | App-shell navigation and settings preference E2E evidence. |
| Color contrast | Conforms locally | Theme token fixes and raw-color guard; screenshots under `artifacts/theme-audit/2026-07-07/`. |
| Production assistive-tech certification | Partial | Local automated evidence exists; customer UAT with target assistive technology remains a go-live action. |

