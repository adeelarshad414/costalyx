# DUMMY-VALUES.md - Costalyx Go-Live Swap List

Costalyx uses clearly labeled local-development stand-ins so the full stack
can run without real cloud credentials. Before any non-local deployment,
replace every item below. The backend startup guard fails when
`CHANGE_ME_DEV_ONLY` appears in `APP_ENV != local` or `NODE_ENV=production`.

| Dummy value / stand-in | Current location(s) | Production replacement | Production home |
|---|---|---|---|
| `CHANGE_ME_DEV_ONLY` Postgres password | `docker-compose.yml` `POSTGRES_PASSWORD`; backend `DATABASE_URL`; local/opt-in test commands in `PROGRESS.md` | Strong per-environment database password or managed database IAM auth | `DATABASE_URL` injected at runtime from Vault path `secret/data/costalyx/postgres/app` or managed platform secret |
| `CHANGE_ME_DEV_ONLY` Keycloak admin password | `docker-compose.yml` `KC_BOOTSTRAP_ADMIN_PASSWORD`; `scripts/run-keycloak-e2e.mjs` local fallback | Operator-managed Keycloak bootstrap/admin secret, rotated after realm setup | Vault path `secret/data/costalyx/keycloak/admin`; CI/E2E-only secret for test realm seeding |
| `CHANGE_ME_DEV_ONLY` Vault dev root token | `docker-compose.yml` `VAULT_DEV_ROOT_TOKEN_ID`; backend `VAULT_TOKEN` local env | Non-root Vault auth using Kubernetes auth, AppRole, or managed workload identity | Runtime auth method; if static fallback is unavoidable, Vault path `secret/data/costalyx/runtime/vault-token` managed outside the repo |
| Local Postgres URL `postgresql://costalyx:CHANGE_ME_DEV_ONLY@postgres:5432/costalyx_dev` | `docker-compose.yml`; local evidence commands in `PROGRESS.md` | Production Postgres connection string with TLS and least-privilege app user | `DATABASE_URL` from Vault path `secret/data/costalyx/postgres/app` |
| Local Keycloak issuer `http://localhost:8080/realms/costalyx-dev` | `docker-compose.yml`; `backend/src/security` tests; `openapi.yaml` security docs | Public production realm issuer, for example `https://auth.costalyx.example.com/realms/costalyx` | `KEYCLOAK_ISSUER_URL`; OpenAPI production server/security docs |
| Local Keycloak JWKS `http://keycloak:8080/realms/costalyx-dev/protocol/openid-connect/certs` | `docker-compose.yml` backend env | Internal or public JWKS URL matching the production issuer | `KEYCLOAK_JWKS_URL` from deployment config |
| Local frontend/API URLs `http://localhost:5173`, `http://localhost:3000/api/v1`, `http://127.0.0.1:*` | `docker-compose.yml`; `openapi.yaml`; `playwright.config.ts`; E2E runner scripts; `README.md` | Production app and API origins with TLS | `VITE_API_BASE_URL`, ingress/CDN config, OpenAPI `servers`, Playwright environment variables |
| Local Keycloak client redirects/web origins `http://localhost:5173/*` and `http://localhost:5173` | `deploy/keycloak/costalyx-realm.json` | Production frontend callback and web origin URLs | Production Keycloak realm/client config managed by Terraform/Helm/operator runbook |
| Demo fixture source `backend/test/fixtures/aws-cur-sample.csv` | `frontend/src/features/ingestion/IngestionOverview.tsx` default `VITE_DEMO_INGESTION_SOURCE_URI` | Real provider export URI or upload/import path for the selected provider | `VITE_DEMO_INGESTION_SOURCE_URI` for demos only; production provider credentials/config in Vault under `secret/data/costalyx/providers/{aws,azure,gcp}` |
| Fixture-backed cloud billing data | `backend/test/fixtures/*`; local demo ingestion path | Real AWS CUR 2.0, Azure Cost Management export, and GCP BigQuery billing export feeds | Provider-specific Vault paths: `secret/data/costalyx/providers/aws`, `secret/data/costalyx/providers/azure`, `secret/data/costalyx/providers/gcp` |
| Test-only email domains `example.test` | Backend integration tests; Keycloak E2E seeding script | Real user emails from the production identity provider | Production Keycloak/IdP user directory; never hardcoded |
| `SEED_FIXTURE_DATA=true` | `docker-compose.yml` backend local env | Disabled unless explicitly running a demo/sandbox tenant | Deployment env `SEED_FIXTURE_DATA=false`; production seed jobs disabled |
| `USE_MOCKS=false` local assertion | `docker-compose.yml`; docs | Keep `false`; no production feature should require frontend mocks | Deployment env and CI check remain `USE_MOCKS=false` |

## Startup Guard Evidence

- Guard implementation: `backend/src/config/startup-secrets.ts`
- Startup wiring: `backend/src/main.ts`
- Test evidence: `npm --workspace backend test -- --runTestsByPath test/config/startup-secrets.spec.ts` passed 1 suite / 4 tests.
