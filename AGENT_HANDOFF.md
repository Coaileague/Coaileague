# ═══════════════════════════════════════════════════════════
# AGENT SYNC BLOCK
# Updated: 2026-04-25
# ═══════════════════════════════════════════════════════════

## STATUS: PLATFORM STABLE ✅

development branch = stable production (do not push route changes here)
refactor/route-cleanup branch = where all cleanup work happens

---

## ROOT CAUSE OF CRASH — FIXED

Our per-route caller audit missed frontend usage routed through:
  - apiEndpoints.ts config (shows as "1 caller" but used by many components)
  - Dynamic path construction in components

Files like trainingRoutes.ts, performanceRoutes.ts had "0 callers" per route
but 57 and 3 callers respectively under their MOUNT PREFIX.

**New rule: Check mount prefix callers, not just individual route paths.**

---

## CORRECT METHODOLOGY (going forward)

Before deleting ANY route file:
```bash
# Check the mount prefix — if ANY frontend caller exists, KEEP the file
grep -rn "/api/MOUNT_PREFIX" client/ | wc -l
# Only delete if result is 0
```

For trimming dead handlers WITHIN a file (safe, doesn't break mount):
```bash
# Check the specific full path
grep -rn "/api/MOUNT_PREFIX/specific-path" client/ server/ | grep -v FILENAME.ts
```

---

## CONFIRMED SAFE TO DELETE (zero mount-prefix callers)

Already deleted on refactor/route-cleanup branch:
  offboardingRoutes.ts (-236L) — /api/offboarding: 0 callers
  stateRegulatoryRoutes.ts (-408L) — /api/regulatory: 0 callers
  dispatch.ts (-350L) — /api/dispatch: 0 callers
  gpsRoutes.ts (-90L) — /api/gps: 0 callers

MUST KEEP (active frontend callers under mount prefix):
  trainingRoutes.ts — /api/training: 57 callers
  terminationRoutes.ts — /api/terminations: 5 callers
  performanceRoutes.ts — /api/performance-notes: 3 callers
  complianceRoutes.ts — /api/security-compliance: 39 callers
  schedulerRoutes.ts — /api/schedules: 20 callers

---

## NEXT WORK — ON refactor/route-cleanup BRANCH ONLY

Jack: checkout refactor/route-cleanup, do cleanup there.
Claude: verify on refactor branch, test build + startup before any merge.

Within-file handler trimming is safe (individual dead handlers in active files).
File deletion only when mount prefix = 0 frontend callers (confirmed above).

Total still achievable safely: significant line reduction within files.
