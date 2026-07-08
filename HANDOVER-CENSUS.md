# Costalyx Handover Census

Generated: 2026-07-08 PKT

This is the full-surface handover census for the current Costalyx repository.
It exists to replace sampling with a fixed audit list. Every row below has a
disposition: `implemented`, `partial`, `not built`, `dead`, or `orphan`.

Current summary:

- Routed frontend screens audited: 17
- Shared UI primitives audited: 14
- Overlay/loading/system surfaces audited: 11
- Silent dead UI found in this shell pass: 0
- Remaining honest boundary: real-cloud verification is still `verified(mock)`
  until customer AWS/Azure/GCP readonly references are supplied

## Route Census

| Surface | Path | States covered in UI | Primary API/data path | Disposition | Evidence |
| --- | --- | --- | --- | --- | --- |
| Login | `/login` | loading, unauthenticated, authenticated, initialization error | Keycloak redirect via `auth.login()` | implemented | `frontend/src/auth/AuthPage.tsx`, `frontend/src/App.test.tsx` |
| Sign in | `/signin` | loading, unauthenticated, authenticated, initialization error | Keycloak redirect with preserved `next` path | implemented | `frontend/src/auth/AuthPage.tsx`, `frontend/src/App.test.tsx` |
| Sign up | `/signup` | loading, unauthenticated, authenticated, initialization error | Keycloak registration via `auth.signup()` with email hint | implemented | `frontend/src/auth/AuthPage.tsx`, `frontend/src/App.test.tsx` |
| Cloud portfolio | `/portfolio` | boot loader, page loading, empty cloud connections, load error, success, scoped admin actions | `listTenants`, `listCloudConnections`, `listAccounts`, `listAccountGroups`, `getCostSummary` | implemented | `frontend/src/features/portfolio/CloudPortfolioConsole.tsx`, `e2e/cloud-onboarding-copy-artifacts.spec.ts` |
| Costs | `/costs` | boot loader, loading table skeleton, empty, load error, success, admin-only ingestion action | `listCostRecords`, `createIngestionBatch` | implemented | `frontend/src/features/ingestion/IngestionOverview.tsx`, `e2e/loading-skeleton-states.spec.ts` |
| Executive | `/executive` | boot loader, loading cards, empty summary, empty top movers, empty TCO, load error, success | `getExecutiveSummary`, `exportExecutiveSummaryPdf`, `estimateTco` | implemented | `frontend/src/features/executive/ExecutiveConsole.tsx`, `e2e/ceo-executive-summary.spec.ts`, `e2e/solution-architect-tco.spec.ts` |
| Insights | `/insights` | boot loader, table loading, filtered empty, flow empty, load error, success | `getCostSummary`, `listCostRecords`, `getCostExplorerFlow`, `exportCostRecords` | implemented | `frontend/src/features/insights/InsightsConsole.tsx`, `e2e/cost-explorer-table-fallback.spec.ts` |
| Optimization | `/optimization` | boot loader, loading list, empty recommendations, empty realized savings, load error, success, analyst confirm actions | `listRecommendations`, `listRealizedSavings`, `updateRecommendation` | implemented | `frontend/src/features/optimization/OptimizationConsole.tsx`, `frontend/src/components/ConfirmAction.tsx` |
| Billing Agent | `/billing-agent` | boot loader, loading list, anomalies empty, statements empty, agent-runs empty, load error, drawers, confirm actions, success | `listAnomalies`, `scanBillingAnomalies`, `updateAnomalyStatus`, `generateBillingStatements`, `approveBillingStatement`, `sendBillingStatement`, `disputeBillingStatement`, `exportBillingStatementCsv`, `exportBillingStatementPdf`, `listAgentRuns` | implemented | `frontend/src/features/billing-agent/BillingAgentConsole.tsx`, `e2e/anomaly-detail-story.spec.ts`, `e2e/external-stakeholder-statement-delivery.spec.ts` |
| Reporting | `/reporting` | boot loader, loading table, empty reports, empty views, load error, task queue, success | `listReports`, `listViews`, `createView`, `runReport` | implemented | `frontend/src/features/reporting/ReportingConsole.tsx` |
| Allocation | `/allocation` | boot loader, loading cards, empty dimensions, load error, success, analyst-only mutations | `listDimensions`, `getCostSummary`, `createDimension`, `createDimensionMapping`, `upsertResourceTag` | implemented | `frontend/src/features/allocation/AllocationConsole.tsx`, `e2e/it-manager-showback-scopes.spec.ts` |
| Governance | `/governance` | boot loader, loading list, load error, success, admin-only denied-by-hiding | `listRoles`, `exportCostRecords` | implemented | `frontend/src/features/governance/GovernanceConsole.tsx`, `e2e/insufficient-role-ux.spec.ts` |
| Settings | `/settings` | success, persisted theme/accent controls, role-scope banner interactions | browser preference store, no backend dependency | implemented | `frontend/src/features/settings/SettingsConsole.tsx`, `e2e/settings-preferences.spec.ts` |
| Operator readiness | `/operator` | boot loader, loading list, load error, success, admin-only route | `getOperatorReadiness` | implemented | `frontend/src/features/operator/OperatorReadinessConsole.tsx`, `e2e/operator-readiness.spec.ts` |
| Not found | unknown paths | direct 404 route, signed-in and signed-out recovery actions | no backend call | implemented | `frontend/src/App.tsx`, `frontend/src/App.test.tsx` |
| Maintenance | `/maintenance` | maintenance guidance with routed recovery actions | no backend call | implemented | `frontend/src/App.tsx` |
| Service issue | `/error` | recoverable issue guidance with routed recovery actions | no backend call | implemented | `frontend/src/App.tsx` |
| Protected-route sign-in fallback | any protected route while signed out | login module with preserved intent | Keycloak redirect URI handling | implemented | `frontend/src/App.tsx`, `frontend/src/App.test.tsx` |

## Shared Component Census

| Component | Variants / modes | Main consumers | Disposition | Notes |
| --- | --- | --- | --- | --- |
| `Button` / `ButtonLink` / icon buttons | primary, secondary, ghost, link, icon, compact, loading | app shell + all feature modules | implemented | Shared action primitive across auth, shell, and feature panels |
| `ThemeToggle` | system, dark, light quick toggle | auth pages, top bar, settings | implemented | Appearance is also fully configurable in Settings |
| `LoadingState` | cards, table, list, form | auth + all major features | implemented | Shape-matched skeletons are part of the loading-spec run |
| `EmptyState` | title/detail/action | all major data surfaces | implemented | No product page is left with a blank success shell |
| `ErrorState` | retry/non-retry | auth + all major data surfaces | implemented | Sanitized user-facing copy path exists |
| `BootSplash` | app boot | top-level auth loading | implemented | Used before workspace initialization resolves |
| `SessionLoader` | phased progress + error mode | authenticated route warmup | implemented | Real route-preload steps are shown |
| `ProgressButton` | action-in-flight | portfolio, ingestion, executive, reporting, operator, billing | implemented | Keeps inline mutation feedback consistent |
| `TaskQueue` / `JobToast` | background work + recent completion | reporting, billing | implemented | Used for long-running report and billing actions |
| `ConfirmAction` | destructive/high-consequence dialog | optimization, billing | implemented | Confirm-before-mutate is enforced in UI |
| `Dialog` | confirm, form, rich | confirm flows | implemented | Focus trapping and Escape handling included |
| `Drawer` | default, wide | mobile navigation, billing detail drawers | implemented | Also used as the small-screen navigation shell |
| `PopoverSurface` | anchored lightweight overlay | notices, profile menu | implemented | Click-outside and Escape handling included |
| `Banner` / `RoleScopeNotice` | informational scope banner | product shell | implemented | Dismissed state is persisted in preferences |
| `PermissionGate` | hide, error | privileged feature controls | implemented | Server-side RBAC still remains the real enforcement layer |

## Breakpoint / Mode Census

| Area | 360 / mobile | 768 / tablet | 1440 / desktop | Disposition | Evidence |
| --- | --- | --- | --- | --- | --- |
| Shell navigation | off-canvas drawer | condensed shell | persistent sidebar | implemented | `frontend/src/App.tsx`, `SCREENSHOT-INDEX.md` |
| Top bar actions | menu + compact actions | compact | full launcher/profile/notices | implemented | `frontend/src/styles.css`, `frontend/src/App.test.tsx` |
| Feature tables | wrapped or scroll regions depending on module | responsive table layout | full table density | implemented | `e2e/table-density-polish.spec.ts`, `e2e/cost-explorer-table-fallback.spec.ts` |
| Theme / accent modes | dark, light, terracotta available | dark, light, terracotta available | dark, light, terracotta available | implemented | `SCREENSHOT-INDEX.md`, `e2e/uiux-accessibility-theme.spec.ts` |

## Wiring Census

Frontend shell audit found no silent button façades in the routes touched by the
handover pass. Shell controls resolve to real behavior:

- route navigation uses path links, not hash fragments
- sign in and sign up call the Keycloak adapter with preserved redirect intent
- command palette filters and routes to actual product paths
- notices and profile affordances are real overlays, not dead icons
- 404, maintenance, and service-issue pages now have explicit routes and
  recovery actions

Remaining boundaries are not silent façades; they are documented environment
limits:

- real AWS/Azure/GCP validation remains blocked pending customer readonly
  references and Costalyx broker identities
- demo seed flows remain `verified(mock)` and are isolated as such in
  `PROGRESS.md` and `handover/KNOWN-LIMITS.md`
