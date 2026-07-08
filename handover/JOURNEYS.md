# Costalyx Core Journeys

Generated: 2026-07-08 PKT

These are the current handover-grade core journeys for Costalyx. They are
listed with honest verification language. Unless a row explicitly says
otherwise, the evidence is against deterministic local demo data and should be
read as `verified(mock)`.

## Journey Index

| Journey | Goal | Evidence | Status |
| --- | --- | --- | --- |
| Sign in and enter routed workspace | Prove the app is multi-page, identity-backed, and preserves deep links | `frontend/src/App.test.tsx`, `e2e/milestone-a-keycloak-login.spec.ts`, `e2e/auth-session-logout.spec.ts` | verified(mock) |
| Cloud onboarding and readonly artifacts | Show how a customer adds cloud accounts without sharing long-lived secrets | `e2e/cloud-onboarding-copy-artifacts.spec.ts`, portfolio tests, `handover/ONBOARDING-CHECKLIST.md` | verified(mock) |
| Executive summary and TCO | Give a buyer-grade first dashboard plus what-if comparison | `e2e/ceo-executive-summary.spec.ts`, `e2e/solution-architect-tco.spec.ts` | verified(mock) |
| Billing anomaly to stakeholder statement | Detect, review, explain, approve, and deliver a billing story | `e2e/anomaly-detail-story.spec.ts`, `e2e/external-stakeholder-statement-delivery.spec.ts`, `e2e/statement-detail-document.spec.ts` | verified(mock) |
| Allocation and governed access | Show dimension-driven showback plus restricted-role behavior | `e2e/it-manager-showback-scopes.spec.ts`, `e2e/insufficient-role-ux.spec.ts` | verified(mock) |
| Operator readiness before go-live | Surface blockers and explain what is still missing for real cloud verification | `e2e/operator-readiness.spec.ts`, `PROGRESS.md` | verified(mock) |

## Journey Notes

### 1. Sign in and enter routed workspace

The product now uses real path routing rather than a single long-page shell.
Protected route intent is preserved through sign-in. Unknown URLs resolve to a
dedicated 404 path instead of silently collapsing into the auth flow.

### 2. Cloud onboarding and readonly artifacts

The portfolio route is the first operational handoff moment for customers. It
surfaces provider-specific onboarding artifacts and copy controls for external
ID, trust policy, permissions policy, CloudFormation, and Terraform material.
That aligns with the intended operating model: customer accounts grant readonly
role access; Costalyx handles the rest.

### 3. Executive summary and TCO

This is the strongest buyer-facing first dashboard. It combines the executive
rollup, top movers, budget posture, and a what-if TCO calculator. This journey
is also the primary screenshot-quality proof surface for the product.

### 4. Billing anomaly to stakeholder statement

This is the most differentiated operational journey in the current repo. It
chains anomaly evidence, approval-gated statements, export/delivery actions,
and operator-safe confirmations. It is where the app feels least like a generic
admin shell and most like a purpose-built cloud cost product.

### 5. Allocation and governed access

Allocation, governance, and insufficient-role coverage together prove the
multi-tenant + least-privilege posture. The UI hides or blocks privileged
controls, but real enforcement still lives server-side.

### 6. Operator readiness before go-live

This is the honest bridge between a polished demo and a production deployment.
It highlights the remaining blocker for Milestone H: the customer-specific
readonly cloud references required to move from `verified(mock)` to verified.
