# Claude → Jack Handoff — Phase 2 Complete, Phase 3 Planning

Date: 2026-04-26

## Branch Tips
- development:            ac57edcf1  STABLE ✅ (deployed to Railway)
- refactor/service-layer: 14bb1e0c3  merged into development

## Phase 2 Final Numbers
~22,931L removed across entire service layer

## Jack's AI Brain Audit (581e75460) — Result
All 33 Trinity action files verified ALIVE. Zero deletions.
The AI Brain is densely connected through actionRegistry.ts dynamic imports.
Not worth auditing further — everything live.

## Remaining Known Dead (already deleted or confirmed)
- agent/ chain (goalExecution + 3 deps) — DELETED ✅
- gamification system — DELETED ✅
- payroll (23 files) — DELETED ✅
- analytics barrel + 3 dead services — DELETED ✅
- partners/auth/oauth (4 files) — DELETED ✅

## Phase 3 — Client-Side Dead Code

This is Jack's next domain. The service layer is clean.
Client-side has significant dead code from scaffolded pages/components.

### Methodology for client files (CRITICAL — Crash Rule 4):
```bash
# Check if a client FILE is imported anywhere by path
base="ComponentName"
grep -rn "import.*${base}\b\|from.*${base}\b" client/src \
  --include="*.ts" --include="*.tsx" | grep -v "^client/src/pages/${base}.tsx:"
# 0 = safe, but MUST verify with Vite before deleting:
npx vite build 2>&1 | grep -E "ENOENT|error during|built in"
```

### High-value client targets for Jack to audit:

1. client/src/pages/ — scaffolded pages with no routes in App.tsx
   Key question: is the page imported in App.tsx or any router?
   Dead if: grep -rn "PageName" client/src/App.tsx returns 0

2. client/src/components/ — UI components with no callers
   Especially: ai-brain/, gamification-adjacent, empire/, mascot/

3. client/src/hooks/ — already 24 dead hooks identified (correct method)
   Safe to delete: use-notification-preferences, useSessionCheckpoint,
   use-force-refresh, use-smart-replies, useFastMode, use-role-theme,
   use-shift-websocket, use-device-settings, use-mascot-chat-observer,
   useLoginValidation, use-notification-state, use-mascot-task-generation,
   useLogoutValidation, use-haptic-feedback, useLoadingState,
   use-mascot-action-states, use-seasonal-theme, useCoAIleagueLoading,
   use-chat-sounds, use-route-transition, use-token-awareness, useFeatureFlags

4. client/src/config/ — apiEndpoints.ts already trimmed, check others

### Vite build verification (MANDATORY for every client deletion):
```bash
npx vite build 2>&1 | grep -E "ENOENT|error during|built in"
# Must show: built in X.XXs (no ENOENT)
```

### Phase 3 Process:
- Delete ONE file → npx vite build → ENOENT = restore immediately
- Server files: still use boot test with real DB
- Client hooks: correct scan = grep for file PATH not export name

## Boot Test DB (unchanged)
DATABASE_URL=postgresql://postgres:MmUbhSxdkRGFLhBGGXGaWQeBceaqNmlj@metro.proxy.rlwy.net:40051/railway
SESSION_SECRET=coaileague-dev-test-session-secret-32chars
