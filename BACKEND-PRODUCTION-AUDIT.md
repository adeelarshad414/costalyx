# Costalyx Backend Production Audit

Generated during production-readiness v2 P3 on 2026-07-07.

## Section 6 Mapping

| Area | Status | Evidence |
| --- | --- | --- |
| Public liveness | verified | `/healthz` retained for compatibility and `/health/live` added. Backend integration test passed. |
| Public readiness | verified | `/health/ready` added with a sanitized repository check and OpenAPI schema. Backend integration and live-contract assertions passed. |
| Metrics | verified | `/metrics` remains admin-gated and emits sanitized Prometheus text. Viewer receives 403 and unauthenticated request receives 401. |
| Auth and RBAC | verified | Global `RolesGuard`, `@RequiredRole`, and contract/frontend role tests remain green in `npm test`. |
| Tenant isolation | verified | Tenant-scoped repositories and multi-tenant portfolio tests remain green; demo seed includes two tenants and separate cloud connections. |
| Error shape | verified | Global `ProblemDetailsFilter` remains wired; live contract verifies RFC 7807 validation output. |
| Input validation | verified | Global `ValidationPipe` keeps whitelist, forbid-non-whitelisted, and transform enabled. |
| CORS and browser headers | verified | `buildCorsOptions()` and `securityHeadersMiddleware` are wired at bootstrap; backend/frontend tests remain green. |
| Startup dummy-secret guard | verified | `assertNoDummyValuesInNonLocalEnvironment()` runs before Nest boot; startup guard tests remain green. |
| Structured logging | verified | `createRuntimeLogger()` remains wired for API bootstrap and existing logger tests pass. |
| OpenAPI sync | verified | `openapi.yaml` documents `/health/live` and `/health/ready`; `npm run generate:client` updated `frontend/src/api/schema.ts`; static contract suite passed. |
| Migration safety | verified | `npm test` ran additive migration check across 13 migration files. |
| Theme/source guard interaction | verified | Backend changes did not bypass the root `npm test` guard; `lint:theme-colors` passed. |

## P3 Finding Dispositions

| ID | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| P3-HEALTH-001 | major | v2 required explicit live/ready semantics, while the app only exposed `/healthz`. | Fixed additively with `/health/live` and `/health/ready`, OpenAPI docs, generated schema, backend integration coverage, and live-contract coverage. |

## Verification

- Targeted backend proof:
  `npm --workspace backend test -- --runTestsByPath test/health/health-metrics.integration.spec.ts`
  passed 1 suite / 2 tests.
- Static contract proof:
  `npm run test:contract -- --run contract/openapi.milestone-a.spec.ts`
  passed the contract suite with 13 files passed / 8 skipped, 39 tests passed /
  15 skipped.
- Full regression floor:
  `npm test` passed backend 41 suites / 152 tests with 6 suites / 8 tests
  skipped, frontend 23 files / 66 tests, contract 13 files / 39 tests with 8
  files / 15 tests skipped, additive migration check for 13 files, and
  `lint:theme-colors`.
- Builds:
  `npm --workspace backend run build` passed and
  `npm --workspace frontend run build` passed.
- Live contract:
  `npm run ci:live-contract` passed 9 live files / 20 tests.

## Remaining Backend Blockers

- Real AWS, Azure, and GCP customer-cloud probes are still blocked on real
  readonly customer role/principal/export references and Costalyx broker
  identities. Local dummy data and local live contracts do not make Milestone H
  production-ready.
