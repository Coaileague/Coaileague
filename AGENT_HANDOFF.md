# COAILEAGUE — MASTER HANDOFF
# ONE FILE. Update in place.
# Last updated: 2026-05-01 16:36 UTC — Claude (onboarding grade-A series + shift/Trinity action scan)

---

## ACTIVE CLAIM (Claude — 2026-05-01)

```
BRANCH: claude/setup-onboarding-workflow-uE8II  (4 commits ahead of main)
SCOPE:  Onboarding/registration/invite/Trinity-gating series
        + ongoing scan for shift CRUD / Trinity action / end-user action
          wiring, race conditions, TS errors, semantic logic bugs.
STATUS: Onboarding series shipped. Action-wiring scan launched in parallel.
DO NOT TOUCH while this claim is active:
  • client/src/components/onboarding/* (new banners)
  • client/src/pages/sub-orgs.tsx
  • client/src/pages/co-auditor-dashboard.tsx (auditor settings + NDA bump)
  • server/services/assistedOnboardingService.ts (token hashing + identity gate)
  • server/services/trinityEventSubscriptions.ts (TrinityOnboardingCompletionHandler)
  • server/services/settingsSyncBroadcaster.ts (new broadcast helper)
  • server/middleware/workspaceScope.ts (requireOnboardingComplete)
  • server/routes/workspace.ts (onboarding/progress|step|complete)
  • server/routes/auditorRoutes.ts (settings, nda/last-accepted)
  • server/routes/assisted-onboarding.ts (handoff identity gate)
  • shared/schema/domains/audit/index.ts (auditorSettings table)
  • migrations/0006_auditor_settings.sql

If you need to edit any of these, COMMENT in this file BEFORE touching.
```

---

## RECENT MERGES TO claude/setup-onboarding-workflow-uE8II

```
50f0da3  polish(onboarding): grade-A series — security, loop closure, UI surfaces, docs
56470a0  polish(onboarding): grade-A finish — WS sync, real completion gate, UIs, tests, docs
c1553f8  feat(onboarding): close remaining settings/sync/Trinity gating gaps
7a1174b  fix(onboarding): wire missing pipeline links across roles & tenants
```

Cumulative footprint: ~30 files, ~1,800 insertions. Both `tsc --noEmit -p
tsconfig.json` and `tsc --noEmit -p tsconfig.server.json` clean.

Key changes (so other agents don't re-do them):
- `workspace.handoff_completed`, `workspace.assisted_created`, `client.registered`,
  `onboarding_step.completed`, `onboarding.completed` audit_log actions are NEW —
  prefer adding to these rather than creating parallel actions.
- `requireOnboardingComplete` middleware exists — apply to new Trinity-gated
  routes via `import { requireOnboardingComplete } from '../middleware/workspaceScope'`.
- `broadcastSettingsUpdated()` is the canonical settings invalidation helper.
  All new settings PATCH endpoints should call it rather than rolling their own.
- `useSettingsSync` (mounted globally in App.tsx) auto-invalidates react-query
  keys on `settings_updated` WS events — register your scope in the
  SCOPE_TO_QUERY_KEYS map in `client/src/hooks/use-settings-sync.ts`.
- `OnboardingProgressBanner` is mounted globally and listens for
  `onboarding_completed`. Don't render a parallel celebration card.
- `auditorSettings` table replaces all per-auditor preferences;
  workspace-scoped writes require an active audit (auditorHasAuditForWorkspace).
- `currentNdaVersion()` controls auditor NDA gate — bump
  `process.env.AUDITOR_NDA_VERSION` to force re-acceptance.

---

## TURN TRACKER

```
PARALLEL LANES — ALL ACTIVE NOW:

  LANE A — CLAUDE
    Branch: enhancement/lane-a-claude
    Working on: A1 (Scheduling), A2 (Email), A3 (Zod Tier 1)

  LANE B — CODEX
    Branch: enhancement/lane-b-codex
    Working on: B1 (ChatDock durable), B2 (RBAC/IRC), B3 (large files), B4 (middleware)

  LANE C — COPILOT
    Branch: enhancement/lane-c-copilot
    Working on: C1 (ChatDock features), C2 (Zod sweep), C3 (document PDFs)

ARCHITECT: CLAUDE
  → Pulls all agent branches when submitted
  → Reviews diff, verifies correctness, runs build + boot test
  → Merges clean to development
  → Pushes to Railway
```

---

## CURRENT BASE

```
origin/development → 8e02aaf97  (Railway STABLE GREEN ✅)
```

---

## FULL PLAN

See: ENHANCEMENT_SPRINT_PLAN.md (same directory)
Contains: domain map, success criteria, merge protocol, agent assignments

---

## AGENT SUBMISSION FORMAT

When done with a domain, submit using this format:

```
AGENT: {Claude/Codex/Copilot}
BRANCH: enhancement/lane-{x}-{agent}
COMMIT: {sha}
DOMAIN: {what was worked on}
FILES CHANGED: {list — own domain only}
WHAT WAS DONE: {3-5 line summary}
CONFLICTS WITH: none / {list if any}
BOOT TEST: passed / failed
READY TO MERGE: yes
```

---

## DOMAIN OWNERSHIP (prevents conflicts)

**CLAUDE owns:** universal-schedule.tsx, EmailHubCanvas.tsx, inbox.tsx,
  schedulesRoutes, availabilityRoutes, engagementRoutes, uacpRoutes,
  reviewRoutes, mileageRoutes, hrInlineRoutes, permissionMatrixRoutes

**CODEX owns:** websocket.ts, storage.ts, ircEventRegistry.ts,
  chat-management.ts, chatParityService.ts, chatServer.ts,
  chat/broadcaster.ts (new), chat/shiftRoomManager.ts (new)

**COPILOT owns:** ChatDock.tsx and chatdock/ directory,
  chatInlineRoutes, commInlineRoutes, salesInlineRoutes, formBuilderRoutes,
  services/documents/ (PDF), all remaining un-Zodded routes

---

## ARCHITECT MERGE PROTOCOL (Claude executes)

```bash
git fetch origin {agent-branch}:refs/remotes/agent/{lane}
git diff development..agent/{lane} --name-only  # check ownership
git checkout development
git checkout agent/{lane} -- {owned-files-only}
node build.mjs 2>&1 | grep "✅ Server|ERROR"
# boot test
git add {files} && git commit -m "merge: {agent} {domain}"
git push origin development
```

---

## STANDARD: NO BANDAIDS

```
No raw money math. No raw scheduling hour math. No workspace IDOR.
No state transitions without expected-status guard. No stubs/placeholders.
Every button wired. Every endpoint real DB data.
Trinity = one individual. HelpAI = only bot field workers see.
One domain, one complete sweep, one coherent commit.
```
