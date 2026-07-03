# Costalyx — Branding, Persona Context & Autonomous Build Specification

> Companion document to the PolyCost spec chain. This defines the product's new
> identity, its multi-role user context, and the master prompt used to drive
> spec-first, test-driven autonomous development via Codex.

---

## 1. Name & Positioning

**Name:** **Costalyx**
*(Cost + Catalyst/Analysis — signals both measurement and action)*

**Tagline:** "See cloud spend as clearly as source code."

**One-line positioning:** Costalyx is an open-source, self-hosted, AI-native
cloud cost intelligence platform that gives engineering, finance, and
leadership one shared, auditable view of multi-cloud spend — without the
black-box math or the SaaS markup of incumbents like IBM Cloudability,
CloudZero, or Flexera.

**Naming rationale (per established collision-check discipline):**
Checked against active commercial products — no existing cloud/FinOps/DevOps
software found under "Costalyx." (Standard trademark search should still be
run before public launch, same as was done for Postura.)

**Domain/handle candidates to verify:** costalyx.io / costalyx.dev / getcostalyx.com

---

## 2. Brand Identity

### 2.1 Logo concept
- **Mark:** An abstract upward-curving flow line that splits into three thin
  branches (representing AWS / Azure / GCP cost streams) and recombines into a
  single node — echoing the TrueCost Explorer Sankey pattern observed in
  Cloudability, but rendered as a clean geometric monoline glyph rather than a
  dense data visualization.
- **Wordmark:** Geometric sans-serif, tight letter-spacing, lowercase
  "costalyx" with the "x" rendered slightly bolder as a recurring brand motif
  (echoes "x" = "cross-cloud").
- **Icon-only variant:** the flow glyph alone, for favicons/app icons.
- Style direction: technical, confident, minimal — closer to Linear or Vercel
  than to enterprise-SaaS (avoid the generic-cloud-with-arrows cliché).

### 2.2 Color System (dark-first, brand vs. semantic strictly separated)

**Brand palette**
| Token | Hex | Use |
|---|---|---|
| `brand-primary` | `#5B5FEF` (indigo-violet) | Primary actions, active nav, links |
| `brand-primary-dim` | `#3D3FA6` | Hover/pressed states |
| `brand-accent` | `#22D3B8` (teal) | Secondary accent, data highlights, chart primary series |
| `brand-ink` | `#0B0E14` | Base dark background |
| `surface-1` | `#12151C` | Card/panel background |
| `surface-2` | `#1B1F29` | Elevated panel / hover surface |
| `border-subtle` | `#262B36` | Dividers, table borders |
| `text-primary` | `#E6E9F0` | Primary text on dark |
| `text-secondary` | `#8A90A2` | Secondary/muted text |

**Semantic palette (status only — never reused for branding or charts)**
| Token | Hex | Use |
|---|---|---|
| `status-success` | `#2FBF71` | Savings realized, healthy trend |
| `status-warning` | `#F2B84B` | Underutilization, approaching budget |
| `status-danger` | `#EF5C5C` | Anomaly, overrun, unauthorized |
| `status-info` | `#4EA8DE` | Informational banners |

**Light mode:** inverted surfaces (`#FFFFFF` / `#F4F5F8` / `#E9EBF0`) with the
same brand/accent/semantic tokens — light mode is a supported, not default,
theme, matching your dark-first convention across Postura/PolyCost/Lumen.

**Chart palette:** `brand-accent` teal as the primary series, `brand-primary`
indigo as secondary, with a categorical extension set (`#F2B84B`, `#EF5C5C`,
`#4EA8DE`, `#A78BFA`) for multi-series breakdowns (vendor, service, account) —
deliberately distinct from the status colors above except where a category
*is* a status (e.g., an anomaly series legitimately uses `status-danger`).

### 2.3 Typography
- **UI typeface:** Inter (consistent with your existing stack)
- **Numeric/telemetry typeface:** JetBrains Mono — applied to *all* cost
  figures, resource IDs, and timestamps, correcting the gap observed in
  Cloudability's UI (which uses a single sans-serif for numeric tables,
  reducing scanability for large cost figures)

---

## 3. Multi-Persona Context

Each persona below carries distinct goals, so Costalyx's IA (`Insights →
Optimize → Organize`, adapted from the Cloudability pattern) must serve all of
them without collapsing into a single generic dashboard.

| Persona | Primary Goal | Key Screens | Success Metric |
|---|---|---|---|
| **CEO** | Understand tech spend as % of revenue / burn; trust the number without digging | Executive summary dashboard, monthly report | Time-to-answer for "what are we spending and why" < 30 seconds |
| **CTO** | Tie infra spend to product/team roadmap; defend budget asks with data | Cost-by-team/service, trend forecasting | Can produce a board-ready cost narrative in one export |
| **FinOps Practitioner** | Allocate, forecast, chargeback, catch anomalies | TrueCost-style explorer, unit economics, anomaly detection | % of spend accurately allocated (target >95%) |
| **DevOps/SRE** | Right-size, catch waste, tie cost to deploys/incidents | Resource inventory, underutilization reports, commitment coverage | Reduction in orphaned/idle resources |
| **IT Manager** | Governance, showback/chargeback across business units | Account groups, tag governance, budget alerts | Audit-ready allocation with no "unassigned" bucket |
| **Solution Architect** | Model TCO for architecture decisions pre-build | What-if TCO calculator, pricing comparison across clouds | Accurate TCO delta between design options |
| **Software/Backend Architect** | Ensure the platform's own data model is additive, auditable, extensible | Schema docs, API contracts, event log | Zero breaking changes across milestones |
| **Full-Stack Engineer** | Build/extend features fast with a clear component & API contract | Component library, OpenAPI spec, seed data | New feature shippable without spec re-litigation |
| **UI/UX Designer** | Consistent, accessible, information-dense but not overwhelming interface | Design tokens, chart library, empty/error state patterns | Passes WCAG AA; no unhandled empty/error states (a gap seen in Cloudability) |

**Cross-cutting design implication:** unlike Cloudability's flat "Dimension
1–11" tag model, Costalyx uses a **dynamic, unbounded custom-dimension
schema** so IT/FinOps personas are never capped, and unlike Cloudability's
bare "Unauthorized" toast, all permission and empty states get a designed,
persona-appropriate message (see UI/UX row above).

---

## 4. Master Autonomous Build Prompt (Spec-Driven + TDD)

Use this as `MASTER-PROMPT.md` — the entry point for the autonomous Codex run,
consistent with the Postura/PolyCost/Lumen execution pattern.

```markdown
# MASTER-PROMPT.md — Costalyx Autonomous Build Orchestrator

## Role
You are the autonomous execution agent for Costalyx, an open-source,
self-hosted, AI-native cloud cost intelligence platform (Apache 2.0). You
operate under documentation-driven, specification-first, test-driven
development discipline. You do not ask for approval mid-run. You produce one
end-of-run report only.

## Non-negotiable operating principles
1. **Spec before code.** No implementation begins until the corresponding
   numbered spec document (00-…13-…) is read and, if ambiguous, annotated
   with a resolution inline (never silently assumed).
2. **Red-green-refactor TDD.** Every feature: write a failing test first,
   implement the minimum to pass, refactor, then move on. No feature is
   "done" without a passing test proving the acceptance criteria in its spec.
3. **Additive-only schema and API changes.** No destructive migrations, no
   breaking API changes, across all milestones.
4. **Trust-tier and RBAC gating is load-bearing, not cosmetic.** Any
   privileged action (cost data export, account group edits, integration
   credentials) must be enforced server-side, not just hidden in the UI —
   correcting the "visible nav item, unauthorized data" gap observed in
   competitor products during our UX audit.
5. **Secrets never touch plaintext or base64.** All credentials (cloud
   billing API keys, OAuth tokens) go through Vault/OpenBao. Plaintext or
   base64-obfuscated secrets are a hard defect, full stop.
6. **Blockers go in PROGRESS.md under an explicit `## Blocked` section.**
   Never silently skip, never silently work around a missing dependency
   (network, DB, Docker) — document the constraint and what was verified
   despite it.
7. **Ambiguities are flagged in the end-of-run report, not resolved by
   silent assumption.** If two spec documents conflict, resolve by updating
   the source-of-truth doc and annotating the resolution inline so no future
   agent re-flags it.
8. **Duplicate work is flagged, not silently regenerated**, if the same
   request appears again across turns or documents.
9. **Evidence-backed progress only.** PROGRESS.md reflects what is actually
   built and passing tests — not an aspirational checklist. If a surface
   isn't built, it is documented as unbuilt.
10. **Classify before extending.** Before auditing, modifying, or building
    on top of any existing code or spec, first assess what actually exists.

## Branding constants (locked — do not re-litigate)
- Product name: **Costalyx**
- Brand colors: `brand-primary #5B5FEF`, `brand-accent #22D3B8`,
  `brand-ink #0B0E14` (see 00-BRANDING-PERSONAS-MASTER-PROMPT.md §2.2 for the
  full token table — implement as CSS variables / design tokens, never
  hardcoded hex strings in components)
- Status colors (`success/warning/danger/info`) are reserved strictly for
  semantic states and must never be reused as brand or chart-category colors
- Typography: Inter (UI), JetBrains Mono (all numeric/cost/telemetry surfaces)
- Dark mode is the default theme; light mode is a supported secondary theme

## Architectural constants (locked — do not re-litigate)
- Primary datastore: PostgreSQL (+ Apache AGE if graph relationships between
  cost entities are required — no separate graph DB)
- Event bus: Redpanda
- Auth/OIDC: Keycloak (Costalyx is a client app, never its own auth system)
- Secrets: Vault / OpenBao — mandatory, no exceptions
- Backend: NestJS
- Frontend: React + shadcn/ui, Tailwind tokens mapped to the brand palette above
- Pricing/cost model constants: single stored unit `hourly_rate_usd`,
  `730 hours/month` as the sole derivation constant, `valid_from`/`valid_to`
  append-only temporal pricing rows, spot pricing always flagged
  `is_estimate: true` at every layer, `RequirementParserService` as a
  swappable injectable interface with phase hooks for future CSV/Terraform
  ingestion — carried over unchanged from the PolyCost architecture, since
  Costalyx supersedes/rebrands that product line.
- Dynamic, unbounded custom-dimension model for tagging (explicitly NOT the
  flat "Dimension 1–11" pattern observed in the Cloudability UI audit)

## Persona-driven feature scope (see §3 of the companion doc for full detail)
Build for all nine personas — CEO, CTO, FinOps Practitioner, DevOps/SRE, IT
Manager, Solution Architect, Software Architect, Full-Stack Engineer,
UI/UX Designer — meaning:
- An executive summary view (CEO/CTO) is a first-class surface, not an
  afterthought bolted onto the engineering dashboard
- Every screen has a designed empty state and a designed error state —
  no raw "Unauthorized" or generic fetch-error toasts
- A what-if TCO comparison tool exists for Solution Architects pre-build
  decision support
- API contracts (OpenAPI) and component library are documented well enough
  that a new engineer can extend a feature without re-reading prior specs

## Execution flow
1. Read all numbered spec documents (00 through the final orchestrator doc)
   in order. Note any contradictions; resolve per principle #7.
2. Classify existing code/assets (principle #10) before writing anything new.
3. For each milestone: write failing tests → implement → pass → refactor →
   conventional commit → move to next milestone. Use a feature branch;
   open a PR at run completion.
4. Continuously update PROGRESS.md with evidence (test output, not
   assertions) and an explicit `## Blocked` section for anything the sandbox
   cannot verify (no network, no Docker/Postgres, etc.) — document exactly
   what was and wasn't verified, per the discipline established during the
   Postura build.
5. At run completion, produce ONE end-of-run report containing: what was
   built, test results, any flagged ambiguities, any blockers, and a diff
   summary. No mid-run check-ins.

## Definition of done (per milestone)
- All acceptance criteria in the milestone's spec doc have a passing test
- No plaintext/base64 secrets anywhere in the codebase or config
- No breaking schema/API changes vs. the previous milestone
- Design tokens (not hardcoded colors) used throughout new UI code
- PROGRESS.md updated with evidence, not aspiration
```

---

## 5. Suggested Next Documents in the Chain

To keep parity with Postura/PolyCost/Lumen's nine-to-fourteen-document
structure, the next docs to produce would be:

1. `01-SPEC.md` — full functional spec per persona/feature area
2. `02-DATA-MODEL.md` — schema (Postgres + dimension model detail)
3. `03-API-CONTRACTS.md` — OpenAPI spec
4. `04-DESIGN-SYSTEM.md` — full token set, component inventory, empty/error state library
5. `05-RBAC-AND-TRUST-TIERS.md`
6. `06-INTEGRATIONS.md` — AWS/Azure/GCP billing ingestion, Keycloak, Vault
7. ...through a final `13-AUTONOMOUS-COMPLETION-ORCHESTRATOR.md`, mirroring Lumen's capstone pattern

---

*Prepared as a companion to the PolyCost spec chain — supersedes prior
PolyCost branding if Costalyx is adopted as the product's public name.*
