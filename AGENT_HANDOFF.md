# COAILEAGUE — MASTER HANDOFF
# ONE FILE. Update in place.
# Last updated: 2026-05-01 — Claude (architect, Phases 1-14 + session merges complete)

---

## CURRENT STATE

```
origin/development → 48796f12  (Railway STABLE GREEN ✅)
HEAD: 48796f12 merge(sessions): cherry-pick 5 done sessions — 27 new files + tenant-iso
```

---

## TURN TRACKER

```
ARCHITECT (this session): CLAUDE — Phases 1-14 + all completed session merges done
  Branch: development (pushing directly)
  Status: MONITORING — waiting for notifications session to complete

SESSIONS STATUS:
  fix-trinity-notifications-EVDKv  🔄 STILL RUNNING — DO NOT MERGE YET
    Last: cd1a00ca fix(notifications): grade-A Trinity push UX — proper badge icon + dedup
    Watching for: handoff/close-out commit before merging
    Unique new: notification-badge.png, notification-badge-72.png, sw.js update
    Conflict risk: pushNotificationService.ts, universalNotificationEngine.ts (LOW — 2 files)

  setup-onboarding-workflow-uE8II  ✅ MERGED (handoff commit)
  test-chatdock-integration-dOzPS  ✅ MERGED (pre-merge boot test)
  test-email-system-9n4d2          ✅ MERGED (zero-debt complete)
  test-schedule-integration-0vxFL  ✅ MERGED (close-out memo)
  action-wiring-manifest-LjP5K     ✅ MERGED (tenant-iso SHA logged)

ENHANCEMENT LANES (older sprint — DO NOT MERGE):
  enhancement/lane-a-*   → Superseded by our Phase work. They re-introduce as any/ts-expect-error.
  copilot/merge-dev-into-codex-refactor → billing-api adds @ts-expect-error. REJECTED.
```

---

## WHAT WAS MERGED THIS SESSION

### Session merges (27 new files + targeted fixes)

**ChatDock session:** ConversationPane.tsx, chatdock-helpers.ts, useChatActions.ts,
  useChatViewState.ts, haptics.ts — typed action hooks + conversation pane split

**Email session:** emailTemplateBase.ts, templates/ directory (account, billing,
  onboarding, scheduling, support, index) — structured email template system

**Onboarding session:** employee-blocking-banner.tsx, onboarding-progress-banner.tsx,
  settings-sync-listener.tsx, use-settings-sync.ts, sub-orgs.tsx,
  settingsSyncBroadcaster.ts, inviteReaperService.ts — onboarding pipeline improvements

**Schedule session:** ScheduleGrid.tsx, availabilityRoutes.ts, calendarRoutes.ts,
  gamificationService.ts — schedule grid + availability routing

**Action-wiring session:** trinityAgentDashboardRoutes.ts + tenant-iso §G fixes:
  clockinPinRoutes.ts, equipmentRoutes.ts, emailRoutes.ts — workspace_id WHERE added

**Dashboard fix:** TrinityAnimatedLogo → TrinityArrowMark (codex crash fix applied)

### REJECTED (would regress TS cleanup)
  copilot billing-api: adds @ts-expect-error, tokenManager→creditManager refactor
  enhancement lanes: re-introduce data:any, shift?:any in websocket.ts
  copilot 18-TS-errors: uses @ts-expect-error workarounds

---

## DOMAIN OWNERSHIP & DO NOT OVERWRITE

**ARCHITECT (Phases 1-14) owns — critical files:**
  server/routes.ts — featureStubRouter mount order is CRITICAL (must stay LAST)
  server/routes/featureStubRoutes.ts — carefully curated 11 genuine stubs only
  shared/types/domainExtensions.ts — new type file (ShiftWithJoins, EmployeeWithStatus, etc.)
  server/websocket.ts — WsPayload type applied, do not re-introduce data:any

---

## PLATFORM METRICS

```
TypeScript debt: 8,566 → 5057 combined any (41.0% eliminated)
catch(e: any):    246 → 0    (-100%)
res: any:          95 → 0    (-100%)
.values(as any):    9 → 0    (-100%)
middleware as any: 183 → 0   (-100%)
Broken routes:     34 → 0
Silent 404s:       38 → 11 genuine stubs
All phase bugs:    12 → 0 fixed
```

---

## PENDING — WAITING FOR

| Session | Status | When done |
|---------|--------|-----------|
| fix-trinity-notifications-EVDKv | 🔄 Still running | Cherry-pick sw.js + badge icons only (2 new files, 2 conflict files) |

## OPEN ITEMS FOR NEXT PHASE

| ID | Item | Priority |
|----|------|----------|
| KI-001 | ChatDock Redis pub/sub (multi-replica) | HIGH |
| KI-007 | FCM push notifications | HIGH |
| KI-008 | Durable message store | HIGH |
| TS-DEBT | Remaining 5057 combined any | MEDIUM |
| UNBUILT | CAD Console, Audit Suite/audits, Accept Handoff | BACKLOG |

---

## MERGE PROTOCOL FOR NEXT AGENT

1. Read this file FIRST
2. git pull origin development — we are the canonical base
3. Check notifications session: git log --oneline origin/claude/fix-trinity-notifications-EVDKv ^development
   - If handoff/close commit seen: cherry-pick ONLY sw.js, notification-badge*.png
   - Do NOT touch pushNotificationService.ts or universalNotificationEngine.ts (our versions are better)
4. Run esbuild: must be 0 server + 0 client errors
5. Run node build.mjs: must succeed
6. Update this file

---

## STANDARD

```
No stubs/placeholders — real DB data or ACME simulation.
No as any unless it's a JOIN result (documented in domainExtensions.ts).
featureStubRouter MUST stay LAST in routes.ts.
Trinity = one individual. HelpAI = only bot field workers see.
```

---

## RAILWAY DEPLOYMENT LOG

### Failed Deploys (3) — All Fixed

| Fix | Root Cause | Status |
|-----|-----------|--------|
| integrations-status.ts missing default export | Old code had no `export default router` | ✅ Fixed (all phases) |
| Duplicate TrinityAnimatedLogo size attr | `<TrinityAnimatedLogo size={32}` + `size={config.logoSize}` | ✅ Fixed (all phases) |
| Wrong ErrorBoundary import path | `@/components/ui/error-boundary` → doesn't exist | ✅ Fixed (all phases) |
| **@capacitor/haptics bundling crash** | **haptics.ts imported native Capacitor module** | **✅ Fixed — PR #223 merged** |

**PR #223** (railway-app[bot]): externalize `@capacitor/haptics` in `vite.config.ts rollupOptions`
This was the ROOT CAUSE. haptics.ts (from chatdock session) imports @capacitor/haptics which
is a native Capacitor plugin, not a bundleable npm package. Vite fails at build time.
Fix: add to rollupOptions.external.

**Current HEAD:** `a288b308` — includes PR #223 + all session merges
**Build status:** 0 server + 0 client errors ✅
