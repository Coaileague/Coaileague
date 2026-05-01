# COAILEAGUE — MASTER HANDOFF
# ONE FILE. Update in place.
# Last updated: 2026-05-01 — Claude (deep-layer audit + bandaid sweep)

---

## TURN TRACKER

```
LATEST WORK — claude/test-chatdock-integration-dOzPS branch:

  ✓ ChatDock universal-chat verification (35/35 runtime + 26/26 static)
  ✓ HelpAI ↔ Trinity brain inheritance (35/35 audit)
  ✓ Six commits implementing the full enhancement plan (E + A + B + C + D)
  ✓ Deep cross-codebase audit + bandaid sweep (this commit)

Branch HEAD: see `git log --oneline -5`
```

---

## DEEP-LAYER AUDIT — RESULTS (2026-05-01)

A new scanner — `scripts/audit/deep-audit.mjs` — runs across the whole
codebase looking for the classes of bug the master handoff explicitly
forbids: orphaned routes, missing lazy targets, no-op buttons, stub
placeholders, server routes that exist but never get registered,
frontend API calls that have no backend handler.

### Snapshot — before vs after this commit's fixes

| Class | Before | After |
|---|---|---|
| Lazy-import targets missing | 0 | 0 ✓ |
| No-op `onClick={() => {}}` buttons | 0 | 0 ✓ |
| TODO / FIXME / STUB markers | 1 | 1 (analytics-reports.tsx) |
| Unmounted server routers | 9 truly + 25 scanner-misses | **0 truly** + 25 scanner-misses |
| Ghost endpoints (FE call → BE 404) | 257 candidates | 253 candidates |

### Fixes applied this commit

**1. Nine unmounted routers — all real, all wired in.**
   `server/routes.ts` now mounts every router file that was authored,
   uses real Drizzle tables, applies proper auth, and matches a feature
   that's part of CoAIleague's stated scope:

   ```
   /api/compliance       → server/routes/complianceRoutes.ts       (5 routes)
   /api/training         → server/routes/trainingRoutes.ts         (4 routes)
   /api/gps              → server/routes/gpsRoutes.ts              (4 routes)
   /api/gamification     → server/routes/gamificationRoutes.ts     (4 routes)
   /api/holidays         → server/routes/holidayRoutes.ts          (6 routes)
   /api/scheduler        → server/routes/schedulerRoutes.ts        (4 routes)
   /api/tokens           → server/routes/tokenRoutes.ts            (4 routes)
   /api/workflow         → server/routes/workflowRoutes.ts         (4 routes)
   /api/workflow-config  → server/routes/workflowConfigRoutes.ts   (4 routes)
   ```

   Highest-impact two:
   - `/api/compliance` — 34 frontend callsites that were 404'ing
   - `/api/training`   — 53 frontend callsites that were 404'ing

   Lower-impact but still semantic to the platform's purpose:
   gps, gamification, holidays, scheduler, tokens, workflow, workflow-config
   all had zero current frontend callers but their tables ARE used by other
   parts of the system. Mounting them costs nothing (no DB writes happen
   until a route is hit) and makes the server-side surface honest about
   what it ships.

**2. `POST /api/ai-brain/chat` — real ghost endpoint.**
   ChatDock's @Trinity mention path (ConversationPane.tsx:1287) fires
   `fetch('/api/ai-brain/chat', { method: 'POST', ... })` and silently
   swallows the result with `.catch(() => null)`. The endpoint never
   existed. Now wired in `server/routes/ai-brain-routes.ts` to delegate
   through `trinityChatService.chat({...})` — the canonical Trinity
   entry-point the rest of the platform uses.

**3. `@Trinity` plain-text mention orchestration — universal.**
   Mirrors the @HelpAI handler I added previously. Any client (web,
   mobile, iOS PWA, native) that posts "@Trinity ..." now triggers a
   server-side Trinity reply broadcast over the WebSocket regardless
   of whether the client also fires the HTTP fallback. Implemented in
   `ChatServerHub.emitMessagePosted`. Shares the existing 30s dedup
   window with @HelpAI so a "@Trinity and @HelpAI" mention won't
   double-fire either bot.

**4. Trinity intake routes — redundant `/intake/` prefix removed.**
   `trinityIntakeRoutes.ts` was mounted at `/api/trinity/intake` AND
   declared each handler with a leading `/intake/...` — so the actual
   path was `/api/trinity/intake/intake/start`. The frontend has been
   calling `/api/trinity/intake/start`, which 404'd silently. Routes
   stripped to `/start`, `/:sessionId/respond`, `/:sessionId/abandon`,
   `/sessions` — they now line up with the mount.

**5. Cleanup of dead code from the C2 lazy-split.**
   ConversationPane.tsx had `EmojiReactionBar`, `ChannelBadge`,
   `EMOTICON_MAP`, `applyEmoticonShortcuts`, `getChannelBadgeColor` —
   all dead, all pruned (committed earlier as 66b503d, 2,220 → 2,146
   lines).

### Scanner false-positive notes

The 253 remaining "ghost endpoint" candidates are mostly scanner
false-positives caused by Express mount patterns the scanner doesn't
fully model:

  • `app.use(prefix, ...middlewares, router)` with spread
  • `app.use(prefix, requireAuth, ensureWorkspaceAccess, router)`
  • Inline arrow handlers: `app.use(prefix, requireAuth, (req,res) => ...)`
  • `await import('./fooRoutes')` dynamic imports
  • Routes that include the full `/api/...` path inline rather than
    relying on the mount prefix

These are documented as "needs manual triage" rather than asserted as
bugs. The accurate-by-construction `chatdock-wiring-audit.mjs` and
`helpai-trinity-audit.mjs` continue to be the source of truth for chat
domain correctness (35/35 + 26/26 + 8 helpai checks).

### Verifiers — all green at HEAD

```
chatdock-wiring-audit:    26 endpoints + 5 universal + 8 helpai checks  ✓
helpai-trinity-audit:     35/35  ✓
chatdock-runtime-verify:  35/35  ✓
dockchat-smoke:           4/4    ✓
vite build:               ✓ (ConversationPane.tsx code-split chunk emitted)
```

---

## CURRENT BASE

```
origin/development → see latest develop branch
claude/test-chatdock-integration-dOzPS → all enhancement-plan + audit work
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

### What "no bandaids" looked like in this audit

- **Did not** add a wrapper that forwards `/api/ai-brain/chat` to
  `/api/trinity/chat/...`. Instead, added a real handler that calls the
  canonical `trinityChatService.chat()`.
- **Did not** patch the trinity intake mount to `/api/trinity` to absorb
  the redundant `/intake/` prefix. Instead, stripped the prefix from the
  route declarations so they match the existing mount.
- **Did not** delete the 9 unmounted routers as "dead code". Each was
  semantic to CoAIleague's purpose — they got mounted instead.
- **Did not** mark the scanner's 253 ghost candidates as fixed when
  most are scanner false-positives. Documented honestly as needing
  manual triage with the scanner's known coverage gaps.

---

## DOMAIN OWNERSHIP (prevents conflicts when parallel lanes resume)

**CLAUDE owns:** universal-schedule.tsx, EmailHubCanvas.tsx, inbox.tsx,
  schedulesRoutes, availabilityRoutes, engagementRoutes, uacpRoutes,
  reviewRoutes, mileageRoutes, hrInlineRoutes, permissionMatrixRoutes,
  scripts/audit/deep-audit.mjs (NEW)

**CODEX owns:** websocket.ts, storage.ts, ircEventRegistry.ts,
  chat-management.ts, chatParityService.ts, chatServer.ts,
  chat/broadcaster.ts, chat/shiftRoomManager.ts

**COPILOT owns:** ChatDock.tsx and chatdock/ directory,
  chatInlineRoutes, commInlineRoutes, salesInlineRoutes, formBuilderRoutes,
  services/documents/ (PDF), all remaining un-Zodded routes

---

## HOW TO RE-RUN THE AUDIT

```bash
# Static audits (fast, no DB)
node scripts/verify-chatdock/wiring-audit.mjs
node scripts/verify-chatdock/helpai-trinity-audit.mjs
node scripts/audit/deep-audit.mjs

# Runtime verifiers (need a sandbox Postgres)
sudo service postgresql start
DATABASE_URL='postgres://coai:coai_test@127.0.0.1:5432/coai_chatdock_sandbox' \
  SESSION_SECRET='test-only-secret-for-chatdock-sandbox-32chars' \
  NODE_ENV=development \
  npx tsx scripts/verify-chatdock/runtime-verify.ts

DATABASE_URL='postgres://coai:coai_test@127.0.0.1:5432/coai_chatdock_sandbox' \
  SESSION_SECRET='test-only-secret-for-chatdock-sandbox-32chars' \
  NODE_ENV=development \
  npx tsx scripts/verify-chatdock/dockchat-smoke.ts
```

Receipts written to `sim_output/`:
  - `deep-audit.{txt,json}`
  - `chatdock-runtime-verify.{txt,json}`
  - `chatdock-wiring-audit.txt`
  - `dockchat-smoke.txt`
  - `helpai-trinity-audit.{txt,json}`
  - `CHATDOCK_HELPAI_ENHANCEMENT_PLAN.md`
