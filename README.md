# Costalyx

**See cloud spend as clearly as source code.**

Costalyx is an open-source, self-hosted, AI-native multi-cloud cost
intelligence platform. It ingests AWS, Azure, and GCP billing data,
normalizes it into a single auditable cost model, allocates it to owners via
dynamic tagging, and surfaces waste, savings opportunities, and executive
reporting through one shared interface — built for engineering, finance, and
leadership alike, without the black-box math or per-percentage-of-spend
pricing of commercial incumbents.
The product is tenant-first: a customer can connect multiple AWS, Azure, and
GCP accounts with read-only roles/federated principals, inspect each
connection separately, group accounts for ownership views, and roll
everything up into one portfolio.
For AWS, Costalyx returns a tenant-scoped external ID that the customer
places in their IAM role trust policy; live validation then assumes the role
and checks the CUR S3 export before the connection is marked validated.
Operators can preflight real customer connections with `npm run probe:aws-live`,
`npm run probe:azure-live`, or `npm run probe:gcp-live` using only
tenant/account/principal/export references and Costalyx broker credentials.
Azure and GCP live validation use federated broker identities to check Cost
Management / Blob exports and BigQuery billing exports without accepting
customer secrets.
Each cloud connection also has tenant-scoped validation and ingestion run
evidence so admins and viewers can see the latest probe result, batch ID, row
counts, duplicate counts, and failure messages without exposing credentials.
Production deployments can run a single scheduler worker that periodically
validates every registered connection and, when enabled, ingests each
registered billing export into the same evidence ledger.

## Status
🚧 Pre-release. See [`PROGRESS.md`](./PROGRESS.md) for live build status —
nothing in this README should be taken as "done" unless PROGRESS.md confirms
it with linked test evidence.

## Why Costalyx
- **Fully open source (Apache 2.0)** — no crippled free tier, self-hostable,
  your billing data never leaves your infrastructure
- **Auditable pricing math** — a single stored pricing unit
  (`hourly_rate_usd`), append-only temporal pricing rows, and spot pricing
  always explicitly flagged as an estimate at every layer
- **Dynamic, unbounded tagging** — no fixed dimension cap
- **Designed for every state** — every screen has a real empty state and a
  real error state, not a raw "Unauthorized" toast
- **Built for nine personas**, not just FinOps: CEO, CTO, FinOps
  Practitioner, DevOps/SRE, IT Manager, Solution Architect, Software
  Architect, Full-Stack Engineer, and UI/UX Designer each have a
  first-class surface

## Architecture at a glance
| Layer | Technology |
|---|---|
| Datastore | PostgreSQL (+ Apache AGE if/when needed) |
| Event bus | Redpanda |
| Auth | Keycloak (OIDC) |
| Secrets | Vault / OpenBao |
| Cloud access | Customer read-only IAM roles / Azure delegated app or workload identity / GCP Workload Identity Federation |
| Backend | NestJS |
| Frontend | React + shadcn/ui + Tailwind |
| Typography | Inter (UI), JetBrains Mono (numeric/telemetry) |

Full architectural detail: [`02-DATA-MODEL.md`](./02-DATA-MODEL.md),
[`03-API-CONTRACTS.md`](./03-API-CONTRACTS.md).

## Quick start (local development)
```bash
git clone https://github.com/<org>/costalyx.git
cd costalyx
cp .env.example .env
make dev-up          # brings up Postgres, Keycloak, Vault, Redpanda, backend, frontend
```
This seeds a dev Keycloak realm with the three fixed roles (`viewer`,
`analyst`, `admin`) and loads fixture cost data so the UI is populated on
first run. Frontend: http://localhost:5173 · Backend API:
http://localhost:3000/api/v1 · API docs: http://localhost:3000/api/docs

Full environment matrix and production deployment: see
[`09-DEPLOYMENT.md`](./09-DEPLOYMENT.md).

## Documentation / spec chain
| Doc | Purpose |
|---|---|
| [`00-BRANDING-PERSONAS-MASTER-PROMPT.md`](./00-BRANDING-PERSONAS-MASTER-PROMPT.md) | Brand identity, persona context, autonomous orchestrator prompt |
| [`01-SPEC.md`](./01-SPEC.md) | Functional spec, milestones, acceptance criteria |
| [`02-DATA-MODEL.md`](./02-DATA-MODEL.md) | Schema, cost model, dimension model |
| [`03-API-CONTRACTS.md`](./03-API-CONTRACTS.md) | REST/OpenAPI contract |
| [`04-DESIGN-SYSTEM.md`](./04-DESIGN-SYSTEM.md) | Tokens, components, states |
| [`05-RBAC-TRUST-TIERS.md`](./05-RBAC-TRUST-TIERS.md) | Roles, permissions, trust tiers |
| [`06-INTEGRATIONS.md`](./06-INTEGRATIONS.md) | Cloud billing, Keycloak, Vault, Redpanda |
| [`07-FRONTEND-BACKEND-WIRING.md`](./07-FRONTEND-BACKEND-WIRING.md) | Full-stack integration contract |
| [`08-TESTING-STRATEGY.md`](./08-TESTING-STRATEGY.md) | TDD discipline, coverage gates |
| [`09-DEPLOYMENT.md`](./09-DEPLOYMENT.md) | CI/CD, environments, release process |
| [`12-MULTITENANT-CLOUD-PORTFOLIO.md`](./12-MULTITENANT-CLOUD-PORTFOLIO.md) | Tenant-first cloud account onboarding and portfolio architecture |
| [`PROGRESS.md`](./PROGRESS.md) | Live build status (source of truth over this README) |

## Contributing
Conventional commits, feature-branch workflow, PR required for `main`. Every
PR must pass lint, unit, integration, contract, and migration-safety checks
(see `09-DEPLOYMENT.md`). No feature is merge-ready without the full-stack
wiring checklist in `07-FRONTEND-BACKEND-WIRING.md` satisfied.

## License
Apache 2.0 — see [`LICENSE`](./LICENSE).
