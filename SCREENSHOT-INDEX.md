# Costalyx Screenshot Index

Generated during the production-readiness v2 P2 frontend audit on
2026-07-07.

## Capture Command

`env E2E_BASE_URL=http://localhost:5173 E2E_KEYCLOAK_USERNAME=costalyx-e2e-admin E2E_KEYCLOAK_PASSWORD=CHANGE_ME_DEV_ONLY_E2E_SCREENSHOTS npm run capture:theme-screenshots`

Result: captured 12 screenshots into `artifacts/theme-audit/2026-07-07/`.

## Dual-Mode And Accent Matrix

| Mode | Accent | Viewport | Size | Artifact |
| --- | --- | --- | --- | --- |
| dark | default | desktop | 1440 x 1000 | `artifacts/theme-audit/2026-07-07/costalyx-dark-default-desktop.png` |
| dark | default | tablet | 768 x 1024 | `artifacts/theme-audit/2026-07-07/costalyx-dark-default-tablet.png` |
| dark | default | mobile | 390 x 844 | `artifacts/theme-audit/2026-07-07/costalyx-dark-default-mobile.png` |
| dark | terracotta | desktop | 1440 x 1000 | `artifacts/theme-audit/2026-07-07/costalyx-dark-terracotta-desktop.png` |
| dark | terracotta | tablet | 768 x 1024 | `artifacts/theme-audit/2026-07-07/costalyx-dark-terracotta-tablet.png` |
| dark | terracotta | mobile | 390 x 844 | `artifacts/theme-audit/2026-07-07/costalyx-dark-terracotta-mobile.png` |
| light | default | desktop | 1440 x 1000 | `artifacts/theme-audit/2026-07-07/costalyx-light-default-desktop.png` |
| light | default | tablet | 768 x 1024 | `artifacts/theme-audit/2026-07-07/costalyx-light-default-tablet.png` |
| light | default | mobile | 390 x 844 | `artifacts/theme-audit/2026-07-07/costalyx-light-default-mobile.png` |
| light | terracotta | desktop | 1440 x 1000 | `artifacts/theme-audit/2026-07-07/costalyx-light-terracotta-desktop.png` |
| light | terracotta | tablet | 768 x 1024 | `artifacts/theme-audit/2026-07-07/costalyx-light-terracotta-tablet.png` |
| light | terracotta | mobile | 390 x 844 | `artifacts/theme-audit/2026-07-07/costalyx-light-terracotta-mobile.png` |

Machine-readable index: `artifacts/theme-audit/2026-07-07/index.json`.

## Browser Evidence

- Focused P2 accessibility/theme proof:
  `npm run test:e2e:keycloak -- e2e/settings-preferences.spec.ts e2e/uiux-accessibility-theme.spec.ts`
  passed 3 Chromium tests in 19.2s.
- Broad P2 browser floor:
  `npm run test:e2e:keycloak -- e2e/milestone-a-keycloak-login.spec.ts e2e/auth-session-logout.spec.ts e2e/costalyx-full-stack-walkthrough.spec.ts e2e/app-shell-section-navigation.spec.ts e2e/operator-readiness.spec.ts e2e/cloud-onboarding-copy-artifacts.spec.ts e2e/settings-preferences.spec.ts e2e/ceo-executive-summary.spec.ts e2e/cfo-statement-narrative.spec.ts e2e/statement-detail-document.spec.ts e2e/anomaly-detail-story.spec.ts e2e/finops-anomaly-allocation.spec.ts e2e/devops-sre-waste-signals.spec.ts e2e/it-manager-showback-scopes.spec.ts e2e/solution-architect-tco.spec.ts e2e/external-stakeholder-statement-delivery.spec.ts e2e/uiux-accessibility-theme.spec.ts e2e/table-density-polish.spec.ts e2e/cost-explorer-table-fallback.spec.ts e2e/loading-skeleton-states.spec.ts e2e/insufficient-role-ux.spec.ts`
  passed 23 Chromium tests with 1 expected viewer-only skip in 43.1s.

## Visual Spot Check

- Dark terracotta desktop capture was inspected and showed the full
  authenticated shell, all feature sections, Settings Appearance, and Operator
  readiness without incoherent overlap.
- Light default mobile capture was inspected and showed long-form mobile
  content with wrapped controls and readable sections. It remains dense, but no
  clipped action text or broken layout was observed.
