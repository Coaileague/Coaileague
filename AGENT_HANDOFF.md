# COAILEAGUE REFACTOR - MASTER HANDOFF
# ONE FILE ONLY. Update in place. Never create new handoff files.
# Last updated: 2026-04-27 - Claude (Phase G complete, 3-agent protocol added)

---

## THREE-AGENT RELAY PROTOCOL

```
CODEX       — Audit/review lead on refactor/service-layer
              Documents exact risks, line numbers, fix instructions, validation
              Audits WHOLE domains — routes, services, jobs, webhooks, storage, events

CLAUDE      — Implementation lead on development
              Executes fixes for WHOLE domains, boot-tests, then syncs back
              One domain = one complete sweep = one coherent commit

COPILOT     — Acceleration helper (narrow scoped only)
              Narrow repeated patterns, test scaffolds, Zod boilerplate, helper replacements
              NO architecture calls, NO final safety decisions, NO independent merges
```

Speed rule: **One domain, one complete sweep, one coherent commit. Finish routes,
services, jobs, webhooks, storage, events, tests, and validation for that domain
before moving on.**

---

## TURN TRACKER

```text
Current turn: CODEX
  → Verify Phase G fixes on development (e9e0e20a2)
  → Determine: Phase H audit needed? Or signal AUDIT COMPLETE?
  → If Phase H: document full domain findings with line numbers, Claude + Copilot execute
  → If complete: mark AUDIT COMPLETE and note post-audit enhancement sprint start
```

---

## CURRENT COMMIT

```text
origin/development           -> e9e0e20a2  (Railway STABLE GREEN ✅)
origin/refactor/service-layer -> this commit (synced + 3-agent protocol)
```

Boot test:
```bash
export DATABASE_URL="postgresql://postgres:MmUbhSxdkRGFLhBGGXGaWQeBceaqNmlj@metro.proxy.rlwy.net:40051/railway"
export SESSION_SECRET="coaileague-dev-test-session-secret-32chars"
node build.mjs && node dist/index.js > /tmp/boot.txt 2>&1 &
sleep 18 && curl -s http://localhost:5000/api/workspace/health  # → {"message":"Unauthorized"}
grep -cE "ReferenceError|is not defined|CRITICAL.*Failed" /tmp/boot.txt  # → 0
kill %1
```

---

## STATUS SNAPSHOT

```text
Phases 1-6 broad refactor:             ✅ complete (~97k lines removed)
Phase A auth/session:                  ✅ complete
Phase B financial flows:               ✅ complete
Phase C scheduling/shift:              ✅ complete (Grade A)
Phase D Trinity action flows:          ✅ complete
Phase E documents/compliance:          ✅ complete (2 larger items queued)
Phase F notifications/broadcasting:    ✅ complete
Phase G integrations (QB/Stripe/Plaid): ✅ deployed — Codex to verify
Phase H (TBD):                         Codex decides after Phase G verification
```

---

## PHASE G — WHAT CLAUDE DID (Codex: verify)

**F residuals also closed in this commit:**
- F-RESIDUAL-P1: /api/notifications/send — Zod validation (uuid, channel enum, body)

**Phase G fixes:**
- G-P0-1: Plaid employee DD — self-or-manager guard on link-token + exchange
  Field employees can only link their own record (checks emp.userId === requester userId)
  Managers/owners have explicit payroll authority
- G-P0-2: Plaid ACH — Decimal-safe amount via toFinancialString(), idempotency check
  before Plaid API call (returns existing attempt on duplicate key), amount > 0 guard
- G-P1-1: QB manual-review IDOR — workspaceId passed into resolveManualReview()
- G-P1-2: QB invoice — string|number Zod transform at API boundary
- G-P1-3: QB webhook — DB insert-on-conflict dedupe replaces in-memory Set (survives restarts)
- G-P1-4: Plaid webhook — signature verified BEFORE 200 response
  Was: 200 sent first, verify async → Plaid saw success when verify failed
  Now: verify → 400 on bad sig (Plaid retries), 200 on success, process async
- G-P1-5: Stripe — centsToMoneyString(), calculateStripeAchFee(), calculateStripeCardFee()
  helpers replacing raw / 100 and fee arithmetic throughout stripeWebhooks.ts
- G-P2-1: QB sync-invoices — requireManager added alongside requireProfessional

**Codex verify questions:**
1. Does the Plaid self-or-manager guard look correct for the employee ownership flow?
2. Is the QB DB-backed dedupe (insert into quickbooks_processed_events) safe given
   the table may not exist yet? Should it fail open or hard on table-not-found?
3. Any Stripe raw math missed in stripeEventBridge.ts or billing-api.ts?

---

## PHASE H — SUGGESTED AUDIT TARGETS (Codex decides)

If Codex determines another pass is warranted, suggested domains:

```
1. Admin + internal API routes
   server/routes/adminRoutes.ts
   server/routes/platformAdminRoutes.ts
   server/routes/rootAdminRoutes.ts
   → Any endpoint returning cross-workspace data without platform-admin gate?
   → Any bulk operation without rate limit or audit trail?

2. Multi-tenant data isolation edge cases
   Anywhere workspaceId is optional in a query that should never be optional
   Any Trinity or HelpAI action that could bleed cross-tenant context

3. Storage + file handling
   server/routes/uploadRoutes.ts
   server/services/storageService.ts
   → Workspace-scoped uploads? Presigned URL expiry? Content-type validation?

4. Session + auth edge cases
   Any route that reads req.session directly without requireAuth guard
   Social auth / SSO callback paths
```

---

## STANDARD: NO BANDAIDS

```text
No raw money math. No raw scheduling duration math. No workspace IDOR.
No state transition without expected-status guard. No user-facing legacy branding.
Every generated document = real branded PDF saved to tenant vault.
Trinity action mutations = workspace scope + fail-closed gates + audit trail.
Trinity is one individual. No mode switching. HelpAI is the only bot field workers see.
One domain, one complete sweep, one coherent commit.
```

---

## QUEUED — POST-AUDIT ENHANCEMENT SPRINT

After Codex signals AUDIT COMPLETE:

### Priority 1 — Foundation
- RBAC + IRC mode consolidation (RBAC owns permissions, room type owns behavior)
- Action registry consolidation below 300 (currently ~561, warns at boot)
- E-P0-2: compliance report PDF service
- E-P1-5: compliance document vault intake service

### Priority 2 — ChatDock Enhancement
1. Durable message store + Redis pub/sub
2. FCM push + four-tier delivery (WS → FCM → RCS → SMS)
3. Typed WebSocket event protocol (Trinity/HelpAI streaming)
4. Read receipts + acknowledgment receipts (post orders)
5. Message replies, pins, polls, media gallery, archive, search
6. Presence tied to shift status (connected/offline/NCNS)
7. HelpAI scheduled messages + shift close summary cards
8. Content moderation + report queue + legal hold + evidence export
9. Live call/radio button (WebRTC already wired)
10. Async voice messages + Whisper transcription
KEEP: emoji reactions, emoticons, picker, Seen/Acknowledged/Reviewed
SKIP: stickers, games, themes, word effects

### Priority 3 — Holistic Audit
- All services as unified whole: ChatDock, email, forms, PDF, workflows, storage
- Login/logout/session persistence verification
- All action-triggering buttons/icons verified for correct workflow outcomes
- Auditor portal, client portal, workspace dashboards → Grade A

### Priority 4 — Trinity Brain + UI
- Gemini+Claude+GPT triad: genuine reasoning before Trinity speaks (not just routing)
- Seasonal/holiday theming restored on public pages
- Mobile offline-first (op-sqlite, optimistic sends)
- Update notification toast: Vivaldi-style minimal (icon + version + arrow)
