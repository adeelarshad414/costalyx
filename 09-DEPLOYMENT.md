# 09-DEPLOYMENT.md — Deployment & Operations

## Deployment targets
| Target | Method | Use case |
|---|---|---|
| Local dev | `docker-compose.yml` (Postgres, Keycloak, Vault/OpenBao, Redpanda, backend, frontend) | day-to-day development |
| Self-hosted single-node | `docker-compose.prod.yml` + `.env.production` | small orgs, evaluation |
| Kubernetes | Helm chart (`deploy/helm/costalyx`) | production, multi-node, horizontal scaling |

## docker-compose.yml (dev) — services
```yaml
services:
  postgres:      # primary datastore
  keycloak:      # OIDC, seeded with a dev realm + fixed roles on first boot
  vault:         # dev-mode Vault (NOT for production use)
  redpanda:      # single-broker dev mode
  backend:       # NestJS, hot-reload
  frontend:      # Vite dev server, proxies /api to backend
```
A `make dev-up` target brings the full stack up and seeds: a dev Keycloak
realm with the three fixed roles, a dev Vault instance with a placeholder
secrets path, and fixture cost data from `test/fixtures/` so the UI is never
empty on first run for a new contributor.

## Kubernetes / Helm (production)
- Separate Deployments for `backend` (horizontally scalable, stateless) and
  `frontend` (static build served via nginx or a CDN)
- Postgres and Vault are **not** bundled in the Helm chart by default —
  production deployments point at managed/externally-operated instances
  (RDS/Cloud SQL/self-managed HA Postgres, HashiCorp Vault cluster); the
  chart includes optional subchart references for self-hosters who want an
  in-cluster option, clearly labeled as non-HA
- HorizontalPodAutoscaler on the backend keyed to CPU + request queue depth
- Readiness probe checks DB connectivity + Vault reachability; liveness
  probe is a lightweight `/healthz` that does not depend on external services
  (so a transient Vault blip doesn't cause a restart storm)

## CI/CD pipeline (GitHub Actions, matching the feature-branch + PR workflow)
```
on: push (feature branches), pull_request (to main)

jobs:
  lint          → eslint, prettier check, no-hardcoded-color rule
  unit-tests    → backend + frontend unit suites, coverage gate enforced
  integration   → testcontainers Postgres, backend integration suite
  contract      → OpenAPI contract suite against a running backend
  migration-check → additive-only migration diff check
  e2e           → Playwright against a full docker-compose stack (on PR to main only)
  build         → backend + frontend production builds, Docker images pushed
                   to registry tagged with commit SHA (on merge to main only)
```
Merge to `main` is blocked unless lint, unit, integration, contract, and
migration-check all pass — E2E runs on PR-to-main and must pass before merge
completes, not just before deploy.

## Release process
1. Conventional commits accumulate on a feature branch
2. PR opened at run completion (per `00-BRANDING-PERSONAS-MASTER-PROMPT.md`
   orchestrator rules)
3. On merge: CI builds and tags Docker images, updates `CHANGELOG.md`
   (generated from conventional commit messages)
4. Tagged release (`vX.Y.Z`) triggers Helm chart version bump and a GitHub
   Release with the changelog excerpt

## Environments and secrets
- No secret ever committed to the repo, including in `docker-compose.yml`
  defaults — dev defaults use clearly-fake placeholder values
  (`CHANGE_ME_DEV_ONLY`) that fail a startup check if detected in a
  non-`local` environment
- Production secrets sourced exclusively from Vault at container startup

## Observability hook (future integration point with Lumen)
Backend exposes Prometheus-compatible `/metrics` and structured JSON logs
from day one, even before a Lumen integration is wired, so the two open
source projects can be connected without a retrofit.

## Rollback
Every deploy is a new immutable image tag; rollback = redeploy the previous
tag. Database migrations being additive-only (per `02-DATA-MODEL.md`) means
a code rollback never requires a destructive schema rollback in the common
case.
