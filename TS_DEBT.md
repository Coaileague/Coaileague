# TypeScript Debt — Out-of-Scope Sweep Tracker

**Owner:** assign during next refactoring sprint
**Created:** 2026-04-30, branch `claude/trinity-autonomous-sweep-FkZBB`
**Build impact:** none — production build uses `esbuild` (`build.mjs`) which strips types. `npm run check` (tsc) is the only consumer.

## Status snapshot

| | Before | After this branch |
|---|---|---|
| Total `tsc` errors (server) | 245 | 185 |
| In-scope (Trinity / billing / payroll / scheduling) | 60 | **0** |
| Out-of-scope (this file) | 185 | 185 |

The 60 errors closed on this branch lived in code paths the Trinity 30-day sweep touches: `payrollRoutes`, `billingEnforcement`, `taxFormGeneratorService`, `staffingBroadcastService`, `invoiceAdjustmentService`, `notifications`, `paystubService`, `payrollAutomation`, `time-entry-routes`, `timeEntryRoutes`, `payStubRoutes`, `achTransferService`, `payrollTimesheetRoutes`, `quickbooks-sync`, `schedulesRoutes`, `curePeriodTrackerService`, `payrollReadinessScanner`, `billing/invoice`, `quickbooksWebhookService`, `approvalGateEnforcement`, `trinitySchedulingOrchestrator`, `shiftStorage`.

The 185 errors below are pre-existing tech debt from in-flight refactor work in unrelated domains. They are tracked here so they don't get lost.

## Remaining out-of-scope errors (185 total, 42 files)

### High-density files (assign as cohesive units)

| File | Errors | Likely cause |
|---|---|---|
| `server/services/ai-brain/trinityDocumentActions.ts` | 28 | Refactor in progress |
| `server/routes/mascot-routes.ts` | 17 | Missing imports / refactor |
| `server/routes/authCoreRoutes.ts` | 13 | Auth refactor — high-touch, careful review |
| `server/services/ai-brain/subagents/onboardingOrchestrator.ts` | 11 | Subagent refactor |
| `server/services/documents/businessArtifactDiagnosticService.ts` | 10 | Document service refactor |
| `server/routes/chat-rooms.ts` | 9 | `chatRooms` import missing |
| `server/routes/salesRoutes.ts` | 7 | |
| `server/routes/engagementRoutes.ts` | 7 | |
| `server/routes/reviewRoutes.ts` | 6 | |
| `server/routes/calendarRoutes.ts` | 6 | |

### Medium-density files (4–5 errors each)

`twilioWebhooks.ts`, `recruitmentRoutes.ts`, `complianceReportsRoutes.ts`, `chat-management.ts`, `uacpRoutes.ts`, `platformRoutes.ts`, `emailEntityContextRoute.ts`.

### Long tail (1–3 errors each)

`complianceEnforcementStressTest.ts`, `shared/config/rbac.ts` (rbac role table is missing `client`/`system`/`automation`/`helpai`/`trinity-brain` levels), `employeeRoleSyncService.ts`, `autonomousScheduler.ts` (`gamificationService` reference, similar fix to time-entry-routes B5 pattern), `trinityTaxComplianceActions.ts`, `trinityACCService.ts`, `seed-stripe-products.ts`, `voiceRoutes.ts`, `privateMessageRoutes.ts`, `mileageRoutes.ts`, `hrInlineRoutes.ts`, `documentLibraryRoutes.ts`, plus 12 single-error files.

## Error distribution by TS code

| TS code | Count | Meaning |
|---|---|---|
| TS2304 | 83 | Cannot find name (missing import) — usually mechanical |
| TS2578 | 18 | Unused `@ts-expect-error` directive — safe to delete |
| TS2339 | 14 | Property doesn't exist on type — schema/type drift |
| TS2322 | 14 | Type assignment mismatch — needs domain context |
| TS7006 | 11 | Implicit `any` parameter — annotate |
| TS2345 | 6 | Argument type mismatch |
| TS2300 | 6 | Duplicate identifier — duplicate imports, fix per `staffingBroadcastService.ts` pattern |
| TS2769 | 5 | No overload matches — usually local `AuthenticatedRequest` interfaces drifting from canonical (`server/rbac.ts`). Fix pattern documented in `notifications.ts` and `quickbooks-sync.ts` |
| TS2307 | 5 | Cannot find module — verify path or create stub |
| TS2741 | 4 | Missing required property |

## Recurring patterns (apply to all)

These three patterns account for the majority of remaining errors. The fix template is already in place from this branch:

### Pattern 1 — Local `AuthenticatedRequest` drift
Local interfaces redefine `req.user` with stricter types than the canonical `server/rbac.ts` export. Express overload matching fails with TS2769 at every `router.post(..., handler)` site.

**Fix template** (see commit on this branch — `notifications.ts`, `quickbooks-sync.ts`):
1. `import { type AuthenticatedRequest } from '../rbac';`
2. Delete the local `interface AuthenticatedRequest extends Request { ... }` block.
3. Remove any newly-orphan `// @ts-expect-error — TS migration: fix in refactoring sprint` directives.

Applies to: `fileDownload.ts`, `trinityControlConsoleRoutes.ts`, `contractPipelineRoutes.ts`, `privacyRoutes.ts`, plus any other route file declaring its own `AuthenticatedRequest`.

### Pattern 2 — `creditManager` references → `tokenManager`
`creditManager` is a stale alias for `tokenManager`. The module file does not exist; the actual implementation is `server/services/billing/tokenManager.ts` which exposes `tokenManager.recordUsage({ workspaceId, userId, featureKey, quantity?, description?, metadata? })` and `TOKEN_COSTS`.

**Fix template** (see commit on this branch — `payrollRoutes.ts`):
- Replace `creditManager.deductCredits({ ..., featureName, relatedEntityType, relatedEntityId, quantity })` with `tokenManager.recordUsage({ ..., quantity, metadata: { featureName, relatedEntityType, relatedEntityId } })`.
- Replace `CREDIT_COSTS[key]` with `TOKEN_COSTS[key]`.

Applies wherever `await import('../services/billing/creditManager')` appears.

### Pattern 3 — Unused `@ts-expect-error` directives after a root-cause fix
Once the underlying type is corrected (e.g. widening `workspaceId` to allow `null` in user object), every directive silencing the same error becomes unused (TS2578). They can be deleted in bulk per file once the root cause is fixed.

**Fix template**: collect line numbers from `tsc` output for the file, delete each `// @ts-expect-error — TS migration: fix in refactoring sprint` line. Verified on this branch using a single awk pass against `notifications.ts` (34 directives removed cleanly).

## What this branch deliberately did NOT touch

- Domains not on the Trinity 30-day sweep critical path (chat, mascot, sales, engagement, reviews, calendar, recruitment, mileage, expenses, voice, private messaging, HR doc requests, compliance reports).
- The `shared/config/rbac.ts` role-table mismatch — it requires alignment with `WorkspaceRole`/`PlatformRole` definitions in `shared/lib/rbac/roleDefinitions.ts` and may need a migration. Out of scope for a billing/scheduling fix.
- Pure infrastructure files where the failing import suggests a deleted helper (`mod` references in stress tests, `validatePendingMfaToken`, `getCurrentSeasonId`, `helpaiOrchestrator`, `mkAction`, `chatRooms`). Each needs a domain owner to confirm whether the helper should be restored or the call site removed.

## Suggested triage sequence for the next sprint

1. **First**: apply Pattern 1 to all remaining route files with local `AuthenticatedRequest` (fast win, removes ~30 errors).
2. **Second**: bulk-remove unused `@ts-expect-error` directives across the repo using the awk script pattern (fast win, removes ~18 errors).
3. **Third**: assign `trinityDocumentActions.ts` (28), `mascot-routes.ts` (17), `authCoreRoutes.ts` (13) to their domain owners as cohesive units. Each is a single PR.
4. **Fourth**: long-tail single-error files; mechanical to clear once the patterns above are documented in repo CONTRIBUTING.

After steps 1–2 the count should drop from 185 to under 140 with zero risk of masking real bugs.
