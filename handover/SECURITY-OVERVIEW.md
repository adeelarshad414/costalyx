# Costalyx Security Overview

## Data Flow

1. Customer configures read-only cloud references.
2. Costalyx broker identity validates the reference and reads billing export data.
3. Billing rows are normalized into Postgres.
4. UI/API reads are scoped by tenant and server-side role enforcement.
5. Audit events record privileged changes and statement transitions.

In self-hosted mode, customer billing data stays inside the customer's
infrastructure. No Costalyx SaaS control plane is required by this repo.

## Secrets Handling

- Customer cloud secrets are not accepted in cloud connection payloads.
- Runtime secrets belong in Vault/OpenBao or the deployment secret store.
- `CHANGE_ME_DEV_ONLY` values are local-only and blocked outside local startup.
- Gitleaks is wired through `npm run security:secrets`.

## RBAC

Roles:
- `viewer`: read-only scoped visibility.
- `analyst`: analysis and lower-risk workflow actions.
- `admin`: cloud connection, tenant, user, operator, and privileged mutation paths.

Server-side role enforcement is tested through the mutating-route RBAC matrix.
Frontend permission gates are convenience only, not the source of truth.

## Audit Log Guarantees

Audit rows include actor, tenant, action, target, and outcome for privileged
actions. Statement approval/send/dispute transitions are audited. See
`CONFORMANCE.md` and `PROGRESS.md` for test evidence.

## Patch And CVE Policy

1. Run `npm audit --audit-level=high` before release.
2. Run `npm run security:secrets`.
3. Patch high and critical dependency findings before production release unless a
   documented non-exploitability exception is accepted by the security owner.
4. Rebuild and redeploy images after dependency or base-image updates.

## Conformance Reference

See `CONFORMANCE.md` for the OWASP ASVS Level 2 target mapping, 12-factor
status, and cloud-cost framework alignment.

