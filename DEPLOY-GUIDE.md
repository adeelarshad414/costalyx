# DEPLOY-GUIDE.md - Costalyx Deployment Quick Guide

Use `09-DEPLOYMENT.md` as the detailed operations reference. This concise guide
captures the currently verified paths.

## Local Development

```bash
npm install
npm run dev-up
npm run seed:demo
```

Services:

| Surface | URL |
| --- | --- |
| Frontend | `http://localhost:5173` |
| Backend health | `http://localhost:3000/healthz` |
| Backend readiness | `http://localhost:3000/health/ready` |
| Backend API | `http://localhost:3000/api/v1` |
| Keycloak | `http://localhost:8080` |
| Mailpit | `http://localhost:8025` |

If repeated Playwright runs make the Compose app containers unstable, use the
verified host app-tier path:

```bash
docker compose up -d postgres keycloak redpanda vault mailpit
npm run seed:demo
NODE_ENV=development APP_ENV=local PORT=3000 \
  DATABASE_URL=postgresql://costalyx:CHANGE_ME_DEV_ONLY@localhost:5432/costalyx_dev \
  KEYCLOAK_ISSUER_URL=http://localhost:8080/realms/costalyx-dev \
  KEYCLOAK_JWKS_URL=http://localhost:8080/realms/costalyx-dev/protocol/openid-connect/certs \
  KEYCLOAK_CLIENT_ID=costalyx-web SMTP_HOST=localhost SMTP_PORT=1025 \
  USE_MOCKS=false SEED_FIXTURE_DATA=false npm --workspace backend run start:dev
```

In another shell:

```bash
VITE_API_BASE_URL=http://localhost:3000/api/v1 \
  VITE_KEYCLOAK_URL=http://localhost:8080 \
  VITE_KEYCLOAK_REALM=costalyx-dev \
  VITE_KEYCLOAK_CLIENT_ID=costalyx-web \
  npm --workspace frontend run dev -- --host 127.0.0.1
```

Browser proof then runs with:

```bash
E2E_BASE_URL=http://localhost:5173 \
  E2E_API_BASE_URL=http://localhost:3000/api/v1 \
  E2E_KEYCLOAK_URL=http://localhost:8080 \
  npm run test:e2e:keycloak
```

## Production Compose Render

The production Compose file requires real non-local values. A syntax/topology
render was verified with placeholder non-secret examples:

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

Replace every placeholder using `DUMMY-VALUES.md`; production secrets belong in
Vault or the deployment platform secret store, never in the repo.

## Helm Render

```bash
helm lint deploy/helm/costalyx
helm template costalyx deploy/helm/costalyx --namespace costalyx
helm template costalyx deploy/helm/costalyx \
  --namespace costalyx \
  --set worker.enabled=true \
  --set config.awsIngestionRegion=us-west-2 \
  --set config.gcpBigQueryLocation=US
```

The API liveness probe is `/health/live`; readiness is `/health/ready`.

## Go-Live Checklist

- `npm test`
- `npm run ci:live-contract`
- `npm --workspace backend run build`
- `npm --workspace frontend run build`
- `npm audit --audit-level=high`
- `npm run security:secrets`
- `npm run probe:live-readiness`
- Production Compose config render
- Helm lint and template render
- Provider live probes after customer read-only cloud references exist

## Real Cloud Probe Inputs

Costalyx needs references, not customer secrets.

| Provider | Customer provides | Costalyx operator provides |
| --- | --- | --- |
| AWS | Account ID, read-only role ARN, unsigned CUR S3 URI | Broker IAM principal and credentials capable of assume-role |
| Azure | Billing scope, delegated principal ID, unsigned export Blob URI | Managed/workload/federated identity for the Costalyx broker |
| GCP | Billing resource, WIF provider, BigQuery export URI | ADC/WIF or managed identity for the Costalyx broker |

Run `npm run probe:live-readiness` first. Then run `npm run probe:aws-live`,
`npm run probe:azure-live`, and `npm run probe:gcp-live` only after the
required real values are present. A dummy-data pass is never a production cloud
pass.

## Backup And Restore

Use managed Postgres snapshots in production. For self-hosted Postgres, take a
logical backup before deploy:

```bash
pg_dump "$DATABASE_URL" --format=custom --file=costalyx-predeploy.dump
```

Restore into a staging database before relying on the backup:

```bash
pg_restore --dbname "$STAGING_DATABASE_URL" --clean --if-exists costalyx-predeploy.dump
```

This repository still tracks the runnable backup/restore smoke as `GAP-040`
until it is exercised end-to-end in the target environment.
