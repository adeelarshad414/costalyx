# 16-ULTIMATE-MASTER-RUN.md - One Prompt: Build, Test, Audit, Fix, Document, Ship

## When to use this
This is the single consolidated entry prompt that unifies the entire chain
(docs 00-15) into one aggressive, rigorous, goal-locked autonomous run. Use it
when you want to hand Codex exactly one thing. It supersedes 10/11/12/14/15 as
entry points; those documents remain in the repo as the detailed law it
enforces.

New in this prompt: a mandatory full documentation refresh: README, PROGRESS,
how-to-use guide, deployment guide, and every `.md` kept truthful against the
shipped reality.

```markdown
# Costalyx - Ultimate Master Run

## Mission (locked)
Take Costalyx from its current state to a production-ready application: every
feature in Milestones A-I built, wired, tested, audited, gap-fixed,
UI/UX-elevated, hardened, documented, and deployable, verified by evidence at
every step. You run autonomously, without approval pauses, until a stop
condition below is met. You are rigorous to the point of being adversarial
toward your own prior claims: nothing is true until you have re-proven it this
run.

## You are (all at once, every decision)
CTO, full-stack engineer, FinOps expert, cloud architect, DevOps engineer, SRE
architect, security engineer, QA lead, UI/UX expert, solution architect. Every
feature, fix, and doc change must survive review from each of these lenses
(pass questions per 14-MASTER-GOAL-PROMPT.md's board) plus the seven
consumer-persona E2E journeys: CEO, CFO, FinOps practitioner, DevOps consumer,
IT manager, solution architect, external stakeholder. A lens objection is a
blocking defect, not a note.

## Law of the run (binding documents - read all before acting)
01-SPEC.md + 13-BILLING-AGENT-SPEC.md (what to build, A-I), 02/03/04/05/06
(how: data, API, design, RBAC/trust tiers, integrations), 07 (what "wired"
means; its checklist is non-negotiable), 08 (test layers, coverage gates,
golden fixtures), 09 (deploy/CI), 11 Step 3 (the launch gate = the finish
line), 12 (dummy-values policy, never-print-secrets, stop-condition
discipline), 15 (walkthrough method, GAP-REGISTER.md format, UI/UX elevation
bar). Milestone H's real-cloud probe remains a standing human-action item:
never fabricate cloud evidence, never let other completions imply it done.

## The run - five gates, in order, no skipping

### Gate 1 - ADVERSARIAL AUDIT
Distrust PROGRESS.md. Bring the stack up (compose), run every suite, run every
persona journey, and manually drive every milestone A-I through the real UI per
doc 15 Phase 1. Every discrepancy between claim and reality is a regression row
in GAP-REGISTER.md. Every unmet acceptance criterion, unwired checklist line,
missing state, a11y/perf/docs defect is a gap row (type, severity, evidence,
proposed fix). No fixes during Gate 1; the complete register comes first.

### Gate 2 - BUILD & FIX EVERYTHING
Work the register plus any still-incomplete milestone, in order: regressions,
blockers, incomplete milestones A-I, majors, minors, systemic fixes before
point fixes. Discipline per feature/fix: failing test first, minimal
implementation, refactor, full lens review, wiring checklist complete (no
USE_MOCKS-gated "done"; fixture adapters behind real interfaces are wiring),
conventional commit. Contract suite and affected E2E re-run after every change;
a fix that breaks wiring is a new regression row, not progress.

### Gate 3 - HARDENING
Run doc 11 Security/Performance/Reliability/Observability/Accessibility in
full: dependency + git-history secret scans (reference findings by path/commit
only, never print values, flag for rotation), RBAC penetration suite (every
mutating route attempted with every insufficient role, 403 asserted), rate
limits, TLS-in-prod configs, input validation including `filter_json`, tag
values, and narrative-generation output, load test cost-records/explorer at
realistic volume, mid-batch ingestion failure leaves consistent state, probe
behavior under Vault/Keycloak outage, zero-downtime additive migration
verified, backup/restore documented and exercised, `/metrics` + structured logs
proven in the production image, audit-log completeness test for every audited
action, axe-core zero WCAG AA violations on every screen.

### Gate 4 - UI/UX ELEVATION
Beyond working: excellent. Unified spacing/radius/shadow scales, one
chart-theme module, tabular-nums right-aligned numerics in JetBrains Mono,
shape-matched skeletons, zero layout shift, confirm-with-consequence on
destructive actions, first-run/anomaly-detail/statement pages treated as
flagship moments, dark/light parity re-verified, before/after screenshot pairs
recorded for every elevation. Tokens only; extend 04-DESIGN-SYSTEM.md
additively if the pass demands new tokens.

### Gate 5 - DOCUMENTATION TRUTH PASS
Every `.md` in the repo is updated to match shipped reality, and verified by
execution where executable:

- README.md: current feature list A-I, architecture table, quick start rerun
  verbatim on a clean checkout and corrected until it works.
- PROGRESS.md: final milestone table with linked evidence; Blocked,
  Ambiguities, Regressions sections current; hardening + launch-gate
  checklists appended and filled.
- HOW-TO-USE.md: task-oriented guide per consumer persona: connect a cloud
  account with read-only references, allocate with dimensions/scopes, triage an
  anomaly, approve and send a statement, run a TCO estimate, build a
  report/view. Screenshots from the elevated UI.
- DEPLOYMENT: 09 plus concise DEPLOY-GUIDE.md if 09 has drifted. Compose prod
  path and Helm path both re-rendered/linted this run. Operator go-live section
  embeds the DUMMY-VALUES.md swap list and Milestone H live-probe procedure.
- DUMMY-VALUES.md: complete, accurate, one row per stand-in with production
  destination (Vault path/env var).
- GAP-REGISTER.md: every row fixed-with-evidence or accepted-as-minor with
  reasoning; append-only.
- CHANGELOG.md: regenerated from conventional commits.
- openapi.yaml: contract suite re-run as final proof it matches implementation.

Docs that describe what should exist are rewritten to describe what does
exist; aspirational language is a documentation defect.

### Convergence
After Gate 5, repeat Gate 1's walkthrough from scratch. New blocker/major rows
send you back to Gate 2. The run converges only when a full pass yields zero new
blocker/major gaps and zero regressions.

## Absolute constraints
Additive-only schema/API, server-side RBAC on every privileged route,
approval-gated statement sends and any cloud-mutating action, all narrative
numbers deterministically computed and validation-checked, dummy values only for
credentials/endpoints, registered, startup-blocked outside local, real secrets
never printed, design tokens only, evidence over assertion, unexecuted tests
reported as unexecuted, one end-of-run report, feature branch to single PR.

## Stop conditions
A. SHIPPED: convergence reached; doc 11 Step-3 launch gate fully checked with
evidence for A-I; all ten builder lenses signed off; all seven persona journeys
green; Gate 5 docs verified truthful; report states the operator's remaining
human actions: DUMMY-VALUES swaps, Milestone H live probes, final real-data
validation.

B. EXHAUSTED: every remaining item is genuinely environment- or human-blocked,
documented with attempt, constraint, and what was verified anyway. Not declared
production ready; exact remainder stated.

"Mostly done" does not exist. Optimistic self-assessment at the finish line is
the failure mode this prompt exists to prevent.

## End-of-run report
Launch-gate state, per-lens sign-off or standing objection, persona journey
results, Gap Register totals (found/fixed/accepted, by severity and type),
elevation before/after index, full test counts, docs-truth verification list,
DUMMY-VALUES go-live list, Milestone H restated, regression log, PR summary.
```
