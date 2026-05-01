# COAILEAGUE — MASTER HANDOFF
# ONE FILE. Update in place.
# Last updated: 2026-05-01 — Claude (architect, Phases 1-14 complete)

---

## CURRENT STATE

```
origin/development → 430a4336  (Railway STABLE GREEN ✅)
HEAD: 430a4336 refactor(phase14): dangerous any fixed + 41.3% total debt eliminated
```

---

## TURN TRACKER

```
ARCHITECT (this session): CLAUDE — Phases 1-14 complete
  Branch: development (pushing directly — no sub-lanes in use)
  Status: ACTIVE — TypeScript debt cleanup, route fixes, workflow hardening
  
ENHANCEMENT LANES (older sprint, now superseded by architect work):
  enhancement/lane-a-claude-phase3   → MERGED/SUPERSEDED (our work is ahead)
  enhancement/lane-a-claude-phase2   → MERGED/SUPERSEDED
  enhancement/lane-a-chatdock-durable → Redis adapter already in dev ✅
  enhancement/lane-a-portal-polish   → Zod fixes already exceeded ✅
  
  ⚠  DO NOT merge enhancement branches — they predate our phase work and
     would REGRESS TypeScript cleanup (they re-introduce 'as any' patterns
     we've already eliminated).
```

---

## DOMAIN OWNERSHIP (Phase 1-14 — ALL touched)

**ARCHITECT (this session) owns:**
  ALL server/routes/* — fixed routing, stubs, auth guards
  ALL server/services/* — TypeScript debt, any cleanup
  server/websocket.ts — WsPayload type, client: WebSocket
  server/storage.ts — interface types strengthened
  shared/types/domainExtensions.ts — NEW file (ShiftWithJoins, EmployeeWithStatus, etc.)
  client/src/components/notifications-popover.tsx — mobile sheet fixed
  client/src/components/swipe-to-delete.tsx — sensitivity tuned
  client/src/App.tsx — splash loop fixed
  client/index.html — arm animation CSS fix
  server/routes/featureStubRoutes.ts — 39→11 stubs, moved LAST in routes.ts
  server/routes.ts — stub mount order critical fix

**DO NOT OVERWRITE WITHOUT MERGE REVIEW:**
  server/routes.ts — featureStubRouter mount order is critical
  shared/types/domainExtensions.ts — new type file, don't duplicate
  server/routes/featureStubRoutes.ts — carefully curated list

---

## WHAT WAS DONE (Phases 1-14)

### Bug Fixes (user-visible)
- KI-011: Invite email CTA had no URL (inviteUrl/onboardingUrl mismatch)
- KI-012: APP_URL not used for invite link in Railway production
- KI-013: onboardingStatus never set to 'completed' on wizard finish
- KI-014: Mobile notification sheet showed wrong component (buttons dead)
- KI-015: Double splash screen / loop on reload
- KI-016: Employee list swipe fired during scroll
- NEW-4: AI brain status URL wrong
- NEW-5: Schedule import route missing
- NEW-6: TOS sign URL wrong (silently failed)
- WORKFLOW-1: Shift notifications only sent for array, not scalar employeeId
- CRITICAL: featureStubRouter was blocking 28 real routes (billing, ops, RMS, armory, etc.)

### TypeScript Debt Eliminated
| Metric | Baseline | Now |
|--------|----------|-----|
| catch(e: any) | 246 | 0 (-100%) |
| res: any handlers | 95 | 0 (-100%) |
| .values(as any) | 9 | 0 (-100%) |
| middleware as any | 183 | 0 (-100%) |
| pool params any[] | 175 | 0 (-100%) |
| Combined as/: any | 8,566 | 5028 (-41.3%) |

### Route Map Complete
- SYSTEM_MANIFEST.md: 1,847 lines (canonical route map, all 253 prefixes documented)
- All dead-end routes fixed (34 → 0)
- All unbuilt feature 404s replaced with 503 stubs (38 → 11 genuine)

---

## OPEN ITEMS (for next agent or next session)

| ID | Item | Priority |
|----|------|----------|
| KI-001 | ChatDock Redis pub/sub multi-replica | HIGH |
| KI-007 | FCM push notifications for offline workers | HIGH |
| KI-008 | Durable message store per-room sequence numbers | HIGH |
| TS-DEBT | Remaining 5,028 combined any (deep Trinity AI internals) | MEDIUM |
| UNBUILT | CAD Console, Audit Suite/audits, Accept Handoff, AI Sentiment | BACKLOG |

---

## MERGE PROTOCOL FOR INCOMING AGENTS

1. Read this file FIRST before any work
2. git pull origin development (get current base)
3. Check git log to see what phases have been done
4. DO NOT merge enhancement/lane-* branches (they're older and regressive)
5. DO NOT overwrite server/routes.ts or featureStubRoutes.ts without reading phase13 notes
6. Run esbuild sweep before committing: must be 0 server + 0 client errors
7. Run node build.mjs — must succeed
8. Update this AGENT_HANDOFF.md when done

---

## STANDARD (unchanged)

```
No raw money math. No raw scheduling hour math. No workspace IDOR.
No state transitions without expected-status guard. No stubs/placeholders.
Every button wired. Every endpoint real DB data.
Trinity = one individual. HelpAI = only bot field workers see.
One domain, one complete sweep, one coherent commit.
```
