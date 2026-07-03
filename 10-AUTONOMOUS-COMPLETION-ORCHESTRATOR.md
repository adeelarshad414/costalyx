# 10-AUTONOMOUS-COMPLETION-ORCHESTRATOR.md

## Purpose
This is the capstone prompt — hand this to Codex to run the entire spec
chain (docs 00 through 09) as one continuous audit-fix-verify-wire loop,
mirroring the pattern used for Lumen's
`13-AUTONOMOUS-COMPLETION-ORCHESTRATOR.md`. It assumes all prior documents
in this repo have been read.

```markdown
# Costalyx — Autonomous Completion Orchestrator

You are running the full Costalyx build to production-ready status. Read,
in order: 00-BRANDING-PERSONAS-MASTER-PROMPT.md, 01-SPEC.md,
02-DATA-MODEL.md, 03-API-CONTRACTS.md, 04-DESIGN-SYSTEM.md,
05-RBAC-TRUST-TIERS.md, 06-INTEGRATIONS.md, 07-FRONTEND-BACKEND-WIRING.md,
08-TESTING-STRATEGY.md, 09-DEPLOYMENT.md, and the current PROGRESS.md.

## Loop (repeat until every milestone in 01-SPEC.md is Done in PROGRESS.md)

1. **Classify.** Inspect the current repo state against PROGRESS.md. Do not
   trust PROGRESS.md's claims blindly — verify by running the referenced
   tests. If PROGRESS.md claims something is Done but no test evidence
   exists or the test fails, downgrade its status and log the discrepancy
   under "Duplicate work flagged" or a new "Regression" note — do not
   silently re-accept the stale claim.

2. **Select the next incomplete milestone** (in the order listed in
   01-SPEC.md, A through G) and its corresponding acceptance criteria.

3. **Audit.** For the selected milestone, check whether backend, frontend,
   tests, and OpenAPI spec already exist. Partial implementations are
   common — identify exactly what's missing rather than rebuilding
   wholesale.

4. **Write failing tests first** for every acceptance criterion not yet
   covered, per 08-TESTING-STRATEGY.md's layer breakdown.

5. **Implement** the minimum backend + frontend code to pass those tests,
   following 02-DATA-MODEL.md, 03-API-CONTRACTS.md, 04-DESIGN-SYSTEM.md,
   05-RBAC-TRUST-TIERS.md, and 06-INTEGRATIONS.md exactly. Any point where
   two of these documents conflict: resolve by editing the source-of-truth
   doc, annotate the resolution inline in that doc, and log it under
   PROGRESS.md's "Ambiguities flagged" section.

6. **Wire.** Apply every item in 07-FRONTEND-BACKEND-WIRING.md's "fully
   wired" checklist for the feature. A feature is not complete until the
   checklist is fully checked with evidence — no exceptions for time
   pressure.

7. **Verify.** Run the full applicable test suite (unit, integration,
   contract, and — if the sandbox allows a live browser + backend + auth
   stack — E2E). Record actual pass/fail output.

8. **Update PROGRESS.md** with evidence (test names/output, not
   assertions), update the milestone status table, and fill in the
   per-feature wiring checklist.

9. **If blocked** (no network, no Docker, no live Postgres/Keycloak/Vault
   in the sandbox): document precisely what could and couldn't be verified
   under PROGRESS.md's `## Blocked` section. Continue with whatever CAN be
   verified in the sandbox (e.g., unit tests, static analysis, lint,
   migration-safety checks) rather than stopping entirely. Never claim an
   unexecuted test passed.

10. **Commit** using conventional commits, on the feature branch for this
    milestone. Do not squash away the audit trail of what was tried and
    what failed along the way.

11. **Return to step 1** for the next milestone.

## Stop condition
Stop and produce the single end-of-run report when either:
(a) every milestone in 01-SPEC.md's table is marked Done in PROGRESS.md
    with linked evidence, or
(b) every milestone has been attempted and any remaining incompleteness is
    fully explained under PROGRESS.md's Blocked/Ambiguities sections — i.e.,
    you've made a complete, honest pass, even if not everything could be
    finished or verified in this environment.

## End-of-run report (produced once, not per milestone)
Include: final milestone status table, full-stack wiring checklist
completion summary, test suite results (with counts, not just "passed"),
all Blocked entries, all Ambiguities and how they were resolved, all
Duplicate-work flags, and a diff/PR summary. Open the PR at this point, not
before.

## Hard constraints carried over from all prior docs (do not violate)
- Additive-only schema/API changes
- No plaintext or base64 secrets anywhere
- Server-side permission enforcement on every privileged endpoint
- Every screen has a real empty state and real error state
- No feature marked Done while gated behind USE_MOCKS
- Brand tokens only — no hardcoded hex colors in components
- All monetary figures rendered in JetBrains Mono, computed from
  hourly_rate_usd, never a separately cached total
```
