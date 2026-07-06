# 11-PRODUCTION-READINESS-CONTINUATION.md

## Purpose
This continuation pass starts after milestones A through G are complete. Its
job is to turn a feature-complete Costalyx checkout into a release candidate
with deployment, security, and operator-readiness evidence.

## Step 1 - Re-verify milestone evidence
- [ ] `npm test` passes with current counts recorded in `PROGRESS.md`
- [ ] `npm run ci:live-contract` passes against a live local backend
- [ ] Live Keycloak browser E2E passes when Docker/network are available
- [ ] Any skipped test is either opt-in by design or documented in
  `PROGRESS.md`

## Step 2 - Production hardening items
- [ ] `DUMMY-VALUES.md` enumerates every credential, endpoint, and fixture
  stand-in plus its production replacement location
- [ ] Backend startup fails on `CHANGE_ME_DEV_ONLY` outside local
  development
- [ ] Production Dockerfiles run as non-root users and include health checks
- [ ] `docker-compose.prod.yml` has no default plaintext secrets and requires
  operator-supplied production settings
- [ ] CI validates unit/integration/contract/build/audit gates on every
  feature branch and PR
- [ ] E2E remains available as an opt-in CI gate with the full compose stack
- [ ] Health and metrics endpoints exist and are documented for operators
- [ ] Rollback procedure is documented and uses immutable image tags
- [ ] Any missing Helm/Kubernetes artifact is either implemented or listed as
  blocked/exhausted with the exact remaining work

## Step 3 - Launch-readiness gate
Do not call Costalyx production-ready until every gate below is checked with
evidence in `PROGRESS.md`.

| Gate | Required evidence |
|---|---|
| Milestones A-G complete | `PROGRESS.md` milestone table has every row `Done (evidence linked)` |
| Full local suite green | Current `npm test` counts recorded |
| Live backend contract green | Current `npm run ci:live-contract` counts recorded |
| Live Keycloak E2E green | Current `npm run test:e2e:keycloak` result recorded |
| Dummy values controlled | `DUMMY-VALUES.md` complete and startup guard tests passing |
| Production compose path | `docker compose -f docker-compose.prod.yml config` passes with operator-provided env |
| Production image path | Backend and frontend production Dockerfiles exist, run as non-root, and expose health checks |
| CI gates aligned | GitHub Actions covers test, live contract, builds, audit, and opt-in E2E |
| Observability | `/healthz` and `/metrics` behavior documented |
| Security baseline | No real secrets committed; privileged endpoints enforce server-side RBAC |
| Rollback | Immutable image tag rollback documented |
| Remaining blockers | Every uncompleted item is in `PROGRESS.md` under Blocked or Known deviations |
