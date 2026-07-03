# 07-FRONTEND-BACKEND-WIRING.md — Full-Stack Wiring Contract

## Purpose
This document exists to prevent the single most common failure mode in
autonomous multi-agent builds: a frontend that renders beautifully against
mock/fixture data while the backend implements different shapes, routes, or
auth semantics, with the mismatch discovered only at integration time (or
never, if no one checks). Every feature in `01-SPEC.md` is **not done** until
it is wired end-to-end and proven by an integration test — a passing
frontend unit test against mocked data does NOT satisfy this requirement.

## Wiring rules (non-negotiable)

1. **No hand-written duplicate types.** The frontend's API client and all
   request/response TypeScript types are generated from `openapi.yaml`
   (`03-API-CONTRACTS.md`) via `openapi-typescript` + a thin fetch wrapper.
   Regenerate on every backend contract change; never hand-edit the
   generated client.
2. **No mock data left wired into a "done" feature.** Mock/fixture data is
   permitted only behind an explicit `USE_MOCKS=true` env flag for local
   frontend-only development. A milestone cannot be marked complete in
   `PROGRESS.md` while `USE_MOCKS` is required for the feature to render.
3. **Every list/detail screen implements all four data states**, wired to
   real backend responses: loading (skeleton, not spinner-only), populated,
   empty (`<EmptyState>`), and error (`<ErrorState>`) — see
   `04-DESIGN-SYSTEM.md`. A screen that only handles the "happy path"
   populated state is not done.
4. **Auth token flow is real, not stubbed.** The frontend's Keycloak
   integration (via `keycloak-js` or NextAuth-OIDC) must perform an actual
   login redirect against a running Keycloak instance in the dev/staging
   environment — not a hardcoded fake JWT — before any milestone touching
   auth is marked complete.
5. **Every mutating UI action has a corresponding passing integration test**
   that exercises the real API route (against a test database), not just a
   frontend test that asserts a fetch mock was called with the right
   arguments.
6. **Pagination, filtering, and sorting parameters match exactly** between
   what the `<DataTable>` component sends and what the backend's OpenAPI
   spec declares — verified by a contract test, not by manual inspection.
7. **Idempotency-Key headers are actually sent** by the frontend on every
   mutating request (per `03-API-CONTRACTS.md`) and actually respected by
   the backend (duplicate key within the TTL window returns the original
   response, not a second write) — proven by an integration test that fires
   the same mutation twice.
8. **Permission gating is proven at both layers.** For every privileged
   action: (a) a frontend test proves `<PermissionGate>` hides/disables the
   action for an insufficient role, AND (b) a backend integration test
   proves the same action returns 403 if attempted directly against the API
   with an insufficient-role token. Neither alone satisfies this rule.

## Environments and how they wire together
| Environment | Frontend | Backend | DB | Auth | Purpose |
|---|---|---|---|---|---|
| `local` | Vite dev server | NestJS `--watch` | local Postgres (Docker) | local Keycloak (Docker) | day-to-day dev |
| `test` | headless (Playwright/Vitest) | NestJS test instance | ephemeral Postgres (testcontainers) | mocked OIDC issuer (test-only) | CI |
| `staging` | built + served via nginx | NestJS built | managed Postgres | staging Keycloak realm | pre-release validation |
| `production` | built + served via CDN/nginx | NestJS built, horizontally scaled | managed Postgres w/ replicas | production Keycloak realm | live |

## Contract test suite (required, per milestone)
A dedicated `contract/` test suite runs the generated OpenAPI client against
a live backend instance in CI and asserts: every documented endpoint exists,
every documented required field is enforced, every documented error shape
(RFC 7807) is actually returned on failure. This suite is what makes "wired"
a testable claim rather than an assertion in a report.

## Definition of "fully wired" for a feature (checklist used in PROGRESS.md)
- [ ] Backend endpoint implemented and covered by unit + integration tests
- [ ] OpenAPI spec updated and regenerated client committed
- [ ] Frontend component consumes the generated client (no hand-rolled fetch)
- [ ] All four data states implemented and screenshot-tested
- [ ] Auth/permission enforced and tested at both layers
- [ ] Contract test passes in CI against the real backend
- [ ] `USE_MOCKS` not required for the feature to function
