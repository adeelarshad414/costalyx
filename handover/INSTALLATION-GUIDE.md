# Costalyx Installation Guide

## Prerequisites

- Node.js 22 compatible with the repo workspaces.
- Docker and Docker Compose for local/dev and single-node deployments.
- Helm 3 for Kubernetes render/deploy.
- PostgreSQL-compatible managed database for production.
- Keycloak or compatible OIDC provider.
- Vault/OpenBao or platform secret store.

## Tenant Sizing Guidance

| Profile | Expected use | Starting shape |
|---|---|---|
| Small | One tenant, up to 10 cloud accounts, daily ingestion | 2 API replicas, 1 worker, managed Postgres small tier, 2 vCPU/4 GB per app node. |
| Medium | Multiple tenants, 50-100 cloud accounts, scheduled ingestion | 3 API replicas, 1 scheduler worker, separate worker for ingestion, managed Postgres with PITR. |
| Large | Many tenants, high-volume CUR/BigQuery exports | Horizontally scaled API, sharded ingestion workers, managed Postgres HA, Redpanda HA, dedicated observability stack. |

## Compose Path

Local development:

```bash
npm install
npm run dev-up
npm run seed:demo
```

Production Compose render requires real environment values. Render check:

```bash
POSTGRES_PASSWORD=placeholder-postgres-password \
DATABASE_URL=postgresql://costalyx:placeholder-postgres-password@postgres:5432/costalyx \
KEYCLOAK_ISSUER_URL=https://auth.example.test/realms/costalyx \
KEYCLOAK_JWKS_URL=https://auth.example.test/realms/costalyx/protocol/openid-connect/certs \
COSTALYX_ALLOWED_ORIGINS=https://app.example.test,https://auth.example.test \
VAULT_ADDR=https://vault.example.test \
VAULT_TOKEN=placeholder-vault-token \
VITE_API_BASE_URL=https://app.example.test/api/v1 \
VITE_KEYCLOAK_URL=https://auth.example.test \
VITE_KEYCLOAK_REALM=costalyx \
VITE_KEYCLOAK_CLIENT_ID=costalyx-web \
docker compose -f docker-compose.prod.yml config
```

Verification status: config render is executable and previously passed in
`PRODUCTION-READINESS-REPORT.md`. Full app-tier browser proof from a clean
Compose stack remains environment-blocked on this workstation because Colima
stopped during the broad suite.

## Helm Path

Render and lint:

```bash
helm lint deploy/helm/costalyx
helm template costalyx deploy/helm/costalyx --namespace costalyx
helm template costalyx deploy/helm/costalyx \
  --namespace costalyx \
  --set worker.enabled=true \
  --set config.awsIngestionRegion=us-west-2 \
  --set config.gcpBigQueryLocation=US
```

Install or upgrade:

```bash
helm upgrade --install costalyx deploy/helm/costalyx \
  --namespace costalyx \
  --create-namespace \
  --values values.production.yaml
```

## Upgrade Procedure

1. Read `CHANGELOG.md` and migration notes.
2. Confirm migrations are additive with `npm run migration:check`.
3. Take and verify a database backup.
4. Deploy the new image tag through Compose or Helm.
5. Watch `/health/live`, `/health/ready`, and `deploy/prometheus/costalyx-alerts.yml` alerts.
6. Run smoke tests: login, dashboard, cloud portfolio, one report, one statement read.

## Rollback Procedure

Compose:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Helm:

```bash
helm history costalyx --namespace costalyx
helm rollback costalyx <REVISION> --namespace costalyx
helm status costalyx --namespace costalyx
```

Schema note: migrations are additive-only, so rollback normally means image-tag
rollback plus disabling newly introduced features until a forward fix ships.

