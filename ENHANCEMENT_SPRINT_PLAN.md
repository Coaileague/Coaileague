# COAILEAGUE — ENHANCEMENT SPRINT ARCHITECT PLAN
# Architect: Claude | Last updated: 2026-04-28
# Base: development → 8e02aaf97 (Railway GREEN ✅)

---

## ARCHITECT RULES

```
1. ALL agents work on named branches — NEVER directly on development
2. Claude reviews every diff before merge — no blind merges
3. Boot test required before every merge: health=401, errors=0
4. Build must be clean before merge
5. Agents commit whole domains — one coherent commit per domain
6. No duplicate UI services created — enhance what exists
7. No placeholder/stub code — every button wired, every endpoint real
```

---

## PARALLEL LANES — AGENT ASSIGNMENTS

### LANE A — CLAUDE (Architect + Scheduler + Email)
Branch: `enhancement/lane-a-claude`

**A1: Scheduling — Complete GetSling parity**
- [ ] Cross-day drag: drop on different day column → change shift.date
- [ ] Resize handle on right edge of shift card → extend duration
- [ ] Quick-add: tap empty cell → ShiftCreationModal prefilled with day+time
- [ ] Week summary bar: total hours, coverage %, OT cost, open shift count
- [ ] Color legend strip below header
- [ ] Mobile touch: swipe right on shift → quick actions (reassign, delete, details)

**A2: Email — Complete inbox polish**
- [ ] Operational channel tabs at top of inbox (Operations/Clients/HR/Billing)
- [ ] Inbox row tags: Urgent (red), Action Needed (purple), PDF (green)
- [ ] Smart views: "Needs Action" and "Client Mail" in sidebar
- [ ] Compose with Trinity: pre-draft button → Trinity generates contextual reply
- [ ] Sender avatar color coding: client=blue, employee=green, system=purple

**A3: Zod Tier 1 — Remaining 6 files**
- [ ] engagementRoutes.ts (12 raw body patterns)
- [ ] uacpRoutes.ts (8 raw body patterns)
- [ ] reviewRoutes.ts (3 patterns)
- [ ] permissionMatrixRoutes.ts (2 patterns)
- [ ] mileageRoutes.ts (3 patterns)
- [ ] hrInlineRoutes.ts (4 patterns)

---

### LANE B — CODEX (Backend hardening + large file refactor)
Branch: `enhancement/lane-b-codex`

**B1: ChatDock durable foundation (P0 from scanner)**
- [ ] Redis pub/sub adapter for broadcastToWorkspace (multi-replica safe)
- [ ] Durable message store with per-room sequence numbers
  - Replace 5-min in-memory buffer with DB-backed store
  - Table: chat_messages (already exists) — verify seq_num column
- [ ] Typed WebSocket events enum:
  ai_message_start, ai_token, ai_tool_call, ai_tool_result, ai_message_end, ai_error
- [ ] FCM push stub (interface ready, tokens stored — wire delivery)

**B2: RBAC/IRC consolidation (P0 from scanner)**
- [ ] Move all remaining IRC mode checks to RBAC helpers
  - ircEventRegistry.ts: Admin actions → RBAC gate
  - chat-management.ts:788: role check → isPlatformStaffRole()
  - chatParityService.ts:453: sub-org rooms → RBAC check
- [ ] Three room types enforced at route level: shift_room, team_channel, dm
- [ ] IRC internal routing stays — user-facing modes removed

**B3: Large file extraction (websocket.ts 8921L, storage.ts 9107L)**
- [ ] websocket.ts: extract ChatDockBroadcaster (300L), ShiftRoomManager (400L)
  into server/services/chat/broadcaster.ts and server/services/chat/shiftRoomManager.ts
- [ ] storage.ts: extract employeeStorage.ts, shiftStorage.ts, clientStorage.ts
  (each ~500L, domain-scoped, keeps existing function signatures)

**B4: Zod validateRequest middleware**
- [ ] Create server/middleware/validateRequest.ts
  export validateBody(schema), validateQuery(schema), validateParams(schema)
  Returns 400 with fromZodError() formatted message
- [ ] Replace remaining .parse()/.safeParse() boilerplate with middleware where safe

---

### LANE C — COPILOT (ChatDock features + Zod sweep)
Branch: `enhancement/lane-c-copilot`

**C1: ChatDock feature parity (WhatsApp/Messenger)**
- [ ] Polls: HelpAI drops coverage polls
  - POST /api/chat/manage/conversations/:id/poll
  - PollMessage component (options, vote, result bar)
- [ ] Full-text search: GET /api/chat/search?q=&roomId=&workspaceId=
  - Search modal with room/date filter chips
  - Highlight matching text in results
- [ ] Async voice messages:
  - Record button (hold to record, release to send)
  - Upload to storage → audio player in chat
  - Transcription via Whisper endpoint
- [ ] Per-conversation notification control (mute/unmute room)
- [ ] Message edit + soft delete UI polish (already in backend, wire UI)
- [ ] Shift room summary card at close:
  - Auto-generated when shift ends: officer, site, hours, incidents

**C2: Zod batch sweep (P1 from scanner — 63 remaining routes)**
Systematic sweep using the scanner output:
- [ ] All routes in server/routes/ with NO Zod and req.body mutations
  Focus: chatInlineRoutes (7), commInlineRoutes, salesInlineRoutes, formBuilderRoutes
- [ ] Standardize ZodError responses: fromZodError() everywhere
- [ ] Replace all `notif-${Date.now()}` with content-derived stable keys

**C3: Document PDF polish**
- [ ] Pay stub PDF: verify stampBrandedFrame is applied, test output
- [ ] Employment letter: verify PDF pipeline end-to-end
- [ ] Incident report PDF: auto-generated on close with officer+site+timeline
- [ ] Document status badges: draft/pending/signed/expired in doc list UI

---

## PHASE MAP — EXECUTION ORDER

```
Phase 1 (NOW — parallel):
  Lane A: A1 (scheduling) + A2 (email) + A3 (Zod Tier 1)
  Lane B: B1 (ChatDock durable) + B2 (RBAC/IRC)
  Lane C: C1 (ChatDock features) + C2 (Zod sweep)

Phase 2 (after Phase 1 merged):
  Lane A: Portal polish (client portal, auditor portal, workspace dashboard)
  Lane B: B3 (large file split) + B4 (validateRequest middleware)
  Lane C: C3 (document PDF) + Trinity brain wiring

Phase 3 (pre-go-live):
  ALL: Holistic UX audit (every button, form, workflow)
  ALL: Mobile offline-first (op-sqlite, optimistic sends)
  ALL: Seasonal theming restore
  ALL: Performance pass (virtual scrolling, lazy loading)
```

---

## ARCHITECT MERGE PROTOCOL

When any agent says "done":

```bash
# 1. Pull agent branch
git fetch origin {agent-branch}

# 2. Diff against development — check only agent's files
git diff development..{agent-branch} --name-only

# 3. Verify no conflicts with other active lanes
# (each lane owns separate domains — check the domain map below)

# 4. Apply agent files to development
git checkout development
git checkout {agent-branch} -- {files...}

# 5. Build
node build.mjs | grep "✅ Server\|ERROR"

# 6. Boot test
export DATABASE_URL=... && export SESSION_SECRET=...
node dist/index.js > /tmp/test.txt 2>&1 &
sleep 18 && curl -s http://localhost:5000/api/workspace/health
grep -cE "ReferenceError|is not defined|CRITICAL.*Failed" /tmp/test.txt
kill %1

# 7. Commit + push to development (Railway deploys)
git add {files...}
git commit -m "merge: {agent} {domain} — {what}"
git push origin development
```

---

## DOMAIN OWNERSHIP MAP (prevents file conflicts)

```
CLAUDE owns:
  client/src/pages/universal-schedule.tsx
  client/src/components/email/EmailHubCanvas.tsx
  client/src/pages/inbox.tsx
  server/routes/schedulesRoutes.ts
  server/routes/availabilityRoutes.ts
  server/routes/engagementRoutes.ts
  server/routes/uacpRoutes.ts
  server/routes/reviewRoutes.ts
  server/routes/mileageRoutes.ts
  server/routes/hrInlineRoutes.ts
  server/routes/permissionMatrixRoutes.ts

CODEX owns:
  server/websocket.ts
  server/services/chat/broadcaster.ts (NEW)
  server/services/chat/shiftRoomManager.ts (NEW)
  server/services/ircEventRegistry.ts
  server/routes/chat-management.ts
  server/storage.ts
  server/services/chatParityService.ts
  server/config/chatServer.ts
  server/services/billing/tokenManager.ts

COPILOT owns:
  client/src/components/chatdock/ChatDock.tsx
  client/src/components/chatdock/ (all files)
  server/routes/chatInlineRoutes.ts
  server/routes/commInlineRoutes.ts
  server/routes/salesInlineRoutes.ts
  server/routes/formBuilderRoutes.ts
  server/services/documents/ (PDF polish)
  All remaining un-Zodded route files not owned by Claude
```

---

## SUCCESS CRITERIA PER DOMAIN

**Scheduling ✅ when:**
- Drag shift from one employee to another → ghost fade + row indicator → "Publish N changes"
- Drag shift to different day column → shift.date updates
- Resize right edge → extends endTime
- Tap empty cell → ShiftCreationModal opens prefilled
- Week bar shows: total hours, OT cost, coverage %

**ChatDock ✅ when:**
- Real emoji reactions appear on long-press/hover
- @Trinity → sends to AI brain, response streams back
- @HelpAI → routes to HelpAI handler
- @User → highlights their name, notifies them
- Polls drop from HelpAI for coverage votes
- Voice: record, upload, play, transcription shown
- Search: find any message by keyword in current room

**Email ✅ when:**
- Operational tabs at top: Operations / Clients / HR / Billing
- Open email from client → entity panel shows live stats
- Trinity action buttons execute against /api/ai-brain/chat
- Inbox rows show: Urgent tag, Action Needed tag, PDF tag
- Compose → Trinity pre-drafts based on sender context

**Documents ✅ when:**
- Pay stub → real branded PDF with header/footer/page numbers
- Employment letter → real branded PDF → vault saved
- Incident report → auto-generated PDF on close
- All PDFs have doc ID, timestamp, workspace branding

**Portals ✅ when:**
- Client portal: officer check-in status, active shifts, incidents
- Auditor portal: Grade A, real PDFs, full audit trail
- Workspace dashboard: real-time data, Trinity insights panel

---

## HANDOFF FORMAT (agents use this when submitting)

```
AGENT: {Claude/Codex/Copilot}
BRANCH: enhancement/lane-{a/b/c}-{agent}
COMMIT: {sha}
DOMAIN: {what was worked on}
FILES CHANGED: {list}
WHAT WAS DONE: {summary}
CONFLICTS WITH: none / {list if any}
BOOT TEST: {passed/failed}
READY TO MERGE: yes/no
```

---

## CURRENT RAILWAY STATE

```
development → 8e02aaf97 ✅ STABLE
  ✅ Audit phases A-I complete
  ✅ Action registry: 143 handlers, 137 Trinity-visible, <300 cap
  ✅ RBAC centralized (Codex)
  ✅ 17 automation bug fixes (Copilot)
  ✅ Toast/dialog/sheet UI system upgraded
  ✅ Schedule shift colors + drag ghost effect
  ✅ ChatDock @mention + real emoji reactions
  ✅ Email entity context panel (live DB data)
  ✅ Trinity action buttons wired
  ✅ Demo account unlock (owner@acme-security.test / admin123)
  ✅ Zod: schedules + availability + clientSatisfaction endpoints
```
