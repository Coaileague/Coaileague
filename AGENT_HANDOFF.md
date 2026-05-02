# COAILEAGUE — MASTER AGENT HANDOFF
# ONE FILE — update in place.
# Last updated: 2026-05-02 — Claude (TS-debt reduction pass + full re-validation)

---

## TS-DEBT REDUCTION PASS — 2026-05-02 (third pass on branch)

### Pipelines Re-Run on Fresh Install
| Pipeline | Result |
|---|---|
| `npm install` | ✅ 1101 packages |
| `npm run build` | ✅ vite 4670 modules, server build complete |
| `npx vitest run` | ✅ **196/196 passed** (8 files / 55 tests skipped — need real DB/server) |
| `npx tsx tests/integration/platform.test.ts` | ✅ **31/31 passing** |
| `npx tsc --noEmit` | ⚠️ 23,954 errors (was 24,115 — **-161 fixed**) |

### TS-Error Reduction by Category
| Code | Before | After | Δ |
|---|---|---|---|
| TS2300 (duplicate identifier) | 124 | 12 | **-112** |
| TS2304 (cannot find name) | 550 | 373 | **-177** |
| TS18046 (X is unknown) | 7144 | 7152 | +8 |
| TS2339 (no such property) | 5028 | 5078 | +50 |
| TS2322 (not assignable) | 3053 | 3067 | +14 |
| Other shifts | — | — | smaller drift |
| **TOTAL** | **24,115** | **23,954** | **-161** |

### Mechanical Fixes Landed
| # | Pattern | Files | Impact |
|---|---|---|---|
| TS-1 | Add missing `EmployeeWithStatus` type import | 24 server files | -64 errors |
| TS-2 | Add local `ProcessResult` result-bag type to `inboundOpportunityAgent.ts` | 1 file | -45 errors |
| TS-3 | Rename stale `selectedClient` → `clientToEdit` in `clients-table.tsx` | 1 file | -24 errors |
| TS-4 | Replace stale `members` → `dbParticipants` ref in two ChatDock files | 2 files | ~-3 errors |
| TS-5 | Add `Workspace` type import to 3 server files | 3 files | -12 errors |
| TS-6 | Fix smashed-line declarations of `setLocation` in 3 dashboards | 3 files | -16 errors |
| TS-7 | Add `format` from `date-fns` import in 2 routes | 2 files | -6 errors |
| TS-8 | Add `createLogger` import in `tierGuards.ts` | 1 file | -1 error |
| TS-9 | Add `broadcastToWorkspace` import to `timeEntryRoutes.ts` | 1 file | -1 error |
| TS-10 | Add `User` type import in `adminSupport.ts` | 1 file | -5 errors |
| TS-11 | Strip duplicate `import React from 'react'` (44 files where `import * as React` already present) | 44 files | -88 errors (TS2300) |
| TS-12 | Strip 6 duplicate `AuthenticatedRequest` imports + 2 `requireAuth` + 2 `z` + others | 12 files | -12 errors (TS2300) |

### Files Touched
```
client/src/components/canvas-hub/{CanvasHubRegistry,LayerManager,ManagedDialog,
  MobileResponsiveSheet,TransitionLoader}.tsx
client/src/components/chatdock/{ChatDock,ConversationPane}.tsx
client/src/components/clients-table.tsx
client/src/components/ui/<all-44-shadcn-files>.tsx
client/src/pages/dashboards/{ContractorDashboard,OrgOwnerDashboard,SupervisorDashboard}.tsx
server/adminSupport.ts
server/routes/{shiftRoutes,time-entry-routes,timeEntryRoutes,authCoreRoutes,
  authRoutes,governanceInlineRoutes,hrInlineRoutes,mileageRoutes,
  schedulesRoutes,assisted-onboarding,migration,spsFormsRoutes,
  complianceReportsRoutes,featureStubRoutes}.ts
server/routes/domains/audit.ts
server/lib/businessRules.ts
server/rbac.ts
server/storage.ts
server/tierGuards.ts
server/services/ai-brain/{actionRegistry,aiBrainWorkflowExecutor,
  intelligentScheduler/skills/intelligentScheduler,
  trinityChangePropagationActions,trinityCommsProactiveActions,
  trinityComplianceIncidentActions,trinityEmergencyStaffingActions,
  trinityProactiveScanner,trinityShiftConfirmationActions,
  trinityTimesheetPayrollCycleActions}.ts
server/services/{autonomousScheduler,billing/exceptionQueueProcessor,
  billing/accountState,onboardingPipelineService,bots/reportBotPdfService,
  bots/shiftRoomBotOrchestrator,compliance/financialAuditService,
  developmentSeedCommunications,identityService,
  integrations/quickbooksLazySync,inboundOpportunityAgent,
  productionSeed,sandbox/sandboxQuickBooksSimulator,
  trinityStaffing/orchestrator}.ts
server/scripts/export-for-production.ts
server/utils/sensitiveFieldFilter.ts
```

### Why Not More?
- **TS18046 (7,152 remaining)**: catch (e: unknown) → `e.message` patterns. Each call site needs context-specific handling (`(e as Error).message`, `String(e)`, `e instanceof Error ? e.message : String(e)`). Mass-sed is unsafe — would convert errors to runtime hazards.
- **TS2339 (5,078 remaining)**: deep Drizzle type-inference issues + `Record<string, unknown>` casts that lose property knowledge. Need per-file type modeling.
- **TS2322 / TS2345 / TS2769**: Drizzle ORM overload mismatches — typically inside `db.insert(table).values({...})` calls. Require schema refinement.
- **Remaining TS2304 (373)**: mostly references to schema tables that don't exist (`partnerApiUsageEvents`, `aiResponses`, `clientContractTemplates`, `aiBrainJobQueue`). Fixing requires either adding the tables or removing the dead code — both are architectural decisions outside this pass.

### What Did NOT Regress
- vitest: still 196/196 passing
- platform integration: still 31/31 passing
- vite + esbuild build: still 0 errors
- Frontend wiring (CoAuditorClaim, retry-keys, BANDAID-02, GC-01, WHY-01) — still in place

---

## FULL-STACK VALIDATION PASS — 2026-05-02

### Pipelines Run (all on freshly-installed deps)
| Pipeline | Result | Notes |
|---|---|---|
| `npm install` | ✅ 1101 packages, 27s | clean (after retry — first try hit a transient registry 404) |
| `npm run build` (vite + esbuild) | ✅ 4670 modules transformed, 23.99s | server + client bundles emitted |
| `npx vitest run` (full workspace) | ✅ **17 files passed / 0 failed**, 196 tests passed | 8 files + 55 tests skipped (require real DB / running HTTP server — `describe.skipIf(!serverAvailable)`) |
| `npx tsx tests/integration/platform.test.ts` (static-analysis) | ✅ **31/31 passing — ALL SYSTEMS GO** | was 28/31 before this pass |
| `npx tsc --noEmit` | ⚠️ 24,115 pre-existing errors in 4,211 files (debt) | my changes added **0** new errors; build still produces 0-error JS via esbuild's looser type stripping |

### Issues Found & Fixed This Pass
| # | File | Issue | Fix |
|---|---|---|---|
| F-1 | `client/src/App.tsx:331` | `CoAuditorClaim` aliased to `ComingSoon` while real page exists at `pages/co-auditor-claim.tsx` (posts to `/api/auditor/claim`, used by auditor invite emails). | Replaced alias with real lazy import |
| F-2 | `client/src/pages/support-command-console.tsx` | Orphan page (zero refs anywhere in `client/src/`) with broken import to non-existent `@/components/trinity-reasoning-panel`. | Deleted |
| F-3 | `client/src/hooks/useTrinityTasks.ts` | Two duplicate `retry` keys (silently overridden) in `approvalsQuery` + `complianceQuery`. | Removed redundant keys |
| F-4 | `tests/unit/trinity-workflows-17c.test.ts` | 5 tests failing because they assumed `aiBrainActionRegistry.initialize()` had been called, but `actionRegistry` no longer self-registers on import. | Added `beforeAll` that initializes the registry once for the suite. **All 30 tests now pass.** |
| F-5 | `client/src/pages/universal-schedule.tsx` (BANDAID-02) | Two raw `fetch()` calls (lines 447, 946) that bypass CSRF — should use `secureFetch`. | Switched both to `secureFetch` |
| F-6 | `server/services/scheduling/trinityAutonomousScheduler.ts` (GC-01) | No explicit `guardCardExpiryDate` / `guardCardStatus` hard-block in the auto-scheduler. Texas OC 1702 §1702.161 requires every officer to hold a current commission. | Added new check 0.a: refuses to auto-assign if `guardCardExpiryDate` lapsed or `guardCardStatus` not active/verified. Reasons recorded in `disqualifyReasons` with the OC §1702 citation. |
| F-7 | `server/services/scheduling/trinityAutonomousScheduler.ts` (WHY-01) | Trinity completion broadcast lacked `aiSummary` (plain English), `whyUnfilled` (per-shift reason), and `fillRate` percentage. | Added all three fields to the `trinity_scheduling_completed` WS payload. Added `failedShiftDetails` to `SchedulingSession.progress` and populated it on each skip. |
| F-8 | `vitest.workspace.ts` | `tests/security/**` and `tests/integration/**` weren't included in any project, so they silently never ran. | Added a new `security` project for `tests/security/**`. Excluded `tests/integration/platform.test.ts` from vitest (it's a stand-alone static-analysis script that calls `process.exit`) — runs via `npx tsx`. |

### Audit Summary (sub-agent driven)
- **Pages**: 344 — orphan scan found 2 truly dead (only `co-auditor-claim` shadow + `support-command-console` orphan, both fixed)
- **Components**: 308 · **Hooks**: 68
- **Routes in `App.tsx`**: 594 — all resolve to importable, existent component constants
- **Mutations**: 917 scanned — all have `onError`/`onSuccess` paths
- **Forms**: 90+ `preventDefault` calls all paired with mutate calls
- **Stub onClick / unwired buttons**: 0 found
- **Dead navigation (`setLocation`/`Link to=`)**: 0 unmatched
- **Broken imports**: 1 found, fixed (F-2)

### Companion Map
- `SYSTEM_MAP_FRONT_TO_BACK.md` (new) — request lifecycle, layer-by-layer file inventory across `client/src/`, `shared/`, `server/`. Use it as the entry-point map when navigating any new task.

### What is NOT verified (still needs a human or staged env)
- **Browser smoke test** of `/co-auditor/claim?token=…` — needs a running server + browser
- **Full `tsc --noEmit` clean** — 24,115 pre-existing strict-type errors (debt), build is unaffected
- **Tests requiring real Postgres** — 55 tests skipped via `describe.skipIf(!serverAvailable)`; need a deployed env

---

## FRONTEND AUDIT — 2026-05-02 (claude/audit-frontend-ui-Aho9f)

### Surface
- Pages on disk: 344 · Components: 308 · Hooks: 68
- App.tsx: 308 lazy imports · 594 `<Route>` declarations
- esbuild client bundle: **0 errors, 0 warnings** after fixes (was 0 errors / 2 warnings)

### Audits Performed (parallel sub-agents)
| Audit | Result |
|---|---|
| Orphan pages (in pages/, not imported by App.tsx) | 27 candidates → only 2 truly dead after cross-codebase grep (rest are dashboard barrels, role-routers, ComingSoon aliases) |
| Stub onClick handlers (`() => {}`, console.log only, alert only) | 0 found across 344 pages + 308 components |
| `<form>` without onSubmit / preventDefault-only handlers | 0 found (90 preventDefault calls all paired with mutations) |
| `useMutation` missing onError/onSuccess | 0 found (917 mutations all wired) |
| Dead navigation (`setLocation` to unregistered route) | 0 found (all 90+ navigation calls map to a route in App.tsx) |
| Broken imports (`@/...` → non-existent file) | 1 broken import found + fixed |
| TS / esbuild duplicate-key warnings | 2 found + fixed |

### Issues Found & Fixed
| # | File | Issue | Fix |
|---|---|---|---|
| F-1 | `client/src/App.tsx:331` | `CoAuditorClaim` aliased to `ComingSoon` while real page existed at `pages/co-auditor-claim.tsx` (real form, posts to `/api/auditor/claim`). Auditor invite emails link to `/co-auditor/claim?token=` but were dead-ending on a placeholder. | Replaced alias with `lazy(() => import("@/pages/co-auditor-claim"))` |
| F-2 | `client/src/pages/support-command-console.tsx` | Page had broken import to non-existent `@/components/trinity-reasoning-panel`. Page was orphan — zero references anywhere in `client/src/`. | Deleted the orphan file (would have crashed on first lazy load if ever wired) |
| F-3 | `client/src/hooks/useTrinityTasks.ts` (approvalsQuery) | Duplicate `retry` keys — `retry: 1` then `retry: false` (silently overridden). | Removed `retry: 1`, kept `retry: false` to match peer queries |
| F-4 | `client/src/hooks/useTrinityTasks.ts` (complianceQuery) | Duplicate `retry: false` keys (pure copy-paste). | Removed redundant key |

### Remaining Indirect-Reachability Pages (Not Issues)
The following are imported via barrels/lazy-routers, NOT App.tsx — verified intentional:
- 13 role dashboards in `pages/dashboards/*` → routed through `pages/dashboard.tsx` lazy switch
- `pages/sra/SRAPortalLayout.tsx` → consumed by SRAPortalDashboard
- `pages/onboarding.tsx` → URL-pattern check in universal-header
- `pages/platform-users.tsx` → linked from quickActions data
- `pages/site-survey.tsx`, `pages/visitor-management.tsx` → intentional ComingSoon aliases

### Verification
- `npx esbuild --bundle client/src/App.tsx`: ✅ clean
- `npx esbuild --bundle client/src/main.tsx`: ✅ clean
- All 594 routes in App.tsx point to importable, existent component constants
- All 917 mutations have onError/onSuccess paths
- All form submissions wired to mutate calls with toast feedback

---

---

## CURRENT BASE

```
origin/development → 5c8f43b2  (🟢 GREEN — build clean, Railway auto-deploying)
TS debt: 8,566 → 2124 combined (-75.2% from baseline)
```

---

## SESSION MONITORING STATUS — ALL PASSES COMPLETE

### Branches Verified / Merged / Rejected

| Branch | Status | Unique Value | Action Taken |
|--------|--------|-------------|--------------|
| claude/test-chatdock-integration-dOzPS | ✅ DONE | ChatDock split + hooks | MERGED |
| claude/setup-onboarding-workflow-uE8II | ✅ DONE | 7 onboarding components | MERGED |
| claude/test-email-system-9n4d2 | ✅ DONE | Email template system | MERGED |
| claude/test-schedule-integration-0vxFL | ✅ DONE | Schedule + availability routes | MERGED |
| claude/action-wiring-manifest-LjP5K | ✅ DONE | Trinity agent routes + tenant-iso | MERGED |
| claude/fix-trinity-notifications-EVDKv | ✅ DONE | skillActionBridge.ts + badges | MERGED |
| claude/document-pdf-system-SvGgk | ✅ DONE (handoff) | 9 new files (PDF streaming, encryption, mobile UI) | MERGED |
| claude/unify-duplicate-services-7ZzYF | ✅ DONE (closed) | 14 dead services + 5 dead routes deleted | MERGED |
| copilot/verify-email-flow-forgot-password | ✅ DONE | CAN-SPAM password reset | MERGED |
| refactor/service-layer | ✅ DONE | ChatDock pub/sub, message store | MERGED |
| pr-195 / client-cleanup | ✅ | 53 missing imported components recovered | MERGED |
| claude/fix-ghost-routes-typescript-COkzh | ⏭ PARTIAL | businessArtifactCatalog.ts only | TS fix commit REJECTED (302 regressions) |
| enhancement/lane-a-* | ⏭ REJECTED | — | Re-introduce as any/ts-expect-error |
| copilot/merge-dev-into-codex-refactor | ⏭ REJECTED | — | billing-api @ts-expect-error |
| codex/fix-dashboard-crash-issue | ✅ ABSORBED | — | Already in dev |
| texas-licensing, trinity-texas, synapse-golive, fix-failed-deploys, fix-bell, acme-simulation | ✅ ABSORBED | — | No unique content |

---

## WHAT'S IN DEVELOPMENT NOW

### New Files Added (All Sessions Combined)
**ChatDock:** ConversationPane.tsx, useChatActions.ts, useChatViewState.ts, chatdock-helpers.ts,
  chatDockEventProtocol.ts, chatDockMessageStore.ts, chatDockPubSub.ts, haptics.ts

**Email:** templates/ (account, billing, onboarding, scheduling, support), wrapInlineEmailHtml.ts,
  emailTemplateBase.ts

**Onboarding:** employee-blocking-banner.tsx, onboarding-progress-banner.tsx,
  settings-sync-listener.tsx, use-settings-sync.ts, sub-orgs.tsx, settingsSyncBroadcaster.ts,
  inviteReaperService.ts

**Schedule:** ScheduleGrid.tsx, availabilityRoutes.ts, calendarRoutes.ts, gamificationService.ts

**Action-wiring:** trinityAgentDashboardRoutes.ts, skillActionBridge.ts

**Documents / PDF:** pdfResponseHeaders.ts, submissionPdfService.ts, auditorTokenService.ts,
  auditorPublicRoutes.ts, fieldEncryption.ts, persistentRateLimitStore.ts,
  MobileDocumentSafeSheet.tsx, MobilePayStubSheet.tsx, MobileFormPager.tsx,
  businessArtifactCatalog.ts

**Missing components recovered (53):** CustomFormRenderer, DocumentUpload, TrinityScorecard,
  ai-brain/index.ts, chat/index.ts, helpai/index.ts, SnowfallEngine, ScheduleToolbar,
  ShiftCard, navigation.ts, featureFlags.ts, stateRegulatoryRoutes.ts, + 41 more

### Dead Code Removed (All Sessions)
**Services (14):** automationMetrics, communicationFallbackService, expansionSeed,
  fileStorageIsolationService, redisPubSubAdapter, sentimentAnalysis, timeEntryDisputeService,
  trainingRateService, notificationThrottleService, trinityOrchestrationBridge,
  aiSchedulingTriggerService, documentDeliveryService, notificationRuleEngine,
  scheduleRollbackService

**Routes (5):** gamificationRoutes, gpsRoutes, tokenRoutes, trainingRoutes, workflowRoutes

---

## CRITICAL ARCHITECTURE RULES (unchanged)

```
server/routes.ts → featureStubRouter MUST stay LAST (after all domain mounts)
server/routes/featureStubRoutes.ts → 11 genuine stubs only
shared/types/domainExtensions.ts → new types (ShiftWithJoins, EmployeeWithStatus, etc.)
server/websocket.ts → WsPayload type — do NOT re-introduce data:any or shift?:any
Trinity = ONE unified individual — no mode toggles
HelpAI = only bot field workers see
```

---

## OPEN ITEMS (carry forward)

| ID | Item | Priority |
|----|------|----------|
| KI-001 | ChatDock Redis pub/sub multi-replica (chatDockPubSub.ts ready, needs wiring) | HIGH |
| KI-007 | FCM push notifications offline workers | HIGH |
| KI-008 | Durable per-room message sequencing (chatDockMessageStore.ts ready) | HIGH |
| ENV | FIELD_ENCRYPTION_KEY must be set before PII encryption activates | HIGH |
| ENV | APP_BASE_URL must be set for auditor token URL composition | MEDIUM |
| TS-DEBT | Remaining 2124 combined any (deep Trinity AI + Drizzle internals) | LOW |

---

## PLATFORM METRICS — FINAL

```
TS combined any: 8,566 → 2124 (-75.2%)
catch(e: any):       246 → 0   (-100%) ✅
res: any handlers:    95 → 0   (-100%) ✅
.values(as any):       9 → 0   (-100%) ✅
middleware as any:   183 → 0   (-100%) ✅
@ts-expect-error:    142 → 4   (-97%)  ✅
Broken routes:        34 → 0           ✅
Dead services removed: 14              ✅
Dead routes removed:    5              ✅
Build: 0 server + 0 client errors      ✅
```

---

## MERGE PROTOCOL FOR NEXT AGENT

1. Read this file FIRST
2. git pull origin development (this IS the canonical base)
3. git fetch origin — check for new branches with commits ahead of development
4. For each: find truly unique code (diff --diff-filter=A vs ANCESTOR 438cca2d)
5. Check TS regressions before applying — reject if adds > removes
6. Compile: esbuild sweep must stay at 0 errors
7. Build: node build.mjs must succeed
8. Update this file with what you did

---

## DEPLOYMENT VERIFICATION (2026-05-01 — Final)

### ALL PREVIOUS FAILURE CAUSES — CONFIRMED FIXED

| # | Failure | Fix | Status |
|---|---------|-----|--------|
| 1 | @capacitor/haptics build crash (ROOT CAUSE) | vite.config.ts rollupOptions.external | ✅ In HEAD |
| 2 | integrations-status.ts missing default export | `export default router` added | ✅ In HEAD |
| 3 | Wrong ErrorBoundary import path (4 pages) | `@/components/ErrorBoundary` corrected | ✅ In HEAD |
| 4 | Dashboard crash (TrinityAnimatedLogo failing) | TrinityArrowMark in LoadingSpinner | ✅ In HEAD |
| 5 | GeoCompliance runtime crash (ReferenceError) | Import added to timeEntryRoutes.ts | ✅ In HEAD |
| 6 | Dead route files still in DOMAIN_CONTRACT | Stale string entries removed | ✅ In HEAD |

### Build Verification
- `npm run build` = `vite build && node build.mjs`
- esbuild: **0 server errors, 0 client errors**
- `node build.mjs`: ✅ Server build complete
- `dist/index.js`: 24.6 MB ✅
- `dist/public/`: 453 files, 402 JS bundles ✅
- `railway.toml` build command: `npm run build` → `npm run start` ✅
- `nixpacks.toml` NODE_OPTIONS: `--max-old-space-size=4096` (prevents OOM) ✅

### Current HEAD
```
5c8f43b2 merge(session-watch-2): unify phase5 dead routes + continuous green baseline
```

### TS Debt — Final State
- **Baseline:** 8,566
- **Current:** ~2,127 (75.1% eliminated)
- **Zero error categories:** catch(e:any), res:any, .values(as any), middleware as any
- **esbuild:** 0 errors — platform will run cleanly
