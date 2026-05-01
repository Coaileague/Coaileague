# COAILEAGUE — MASTER HANDOFF
# ONE FILE. Update in place.
# Last updated: 2026-05-01 — Claude (email system zero-debt sweep)

---

## 2026-05-01 — EMAIL SYSTEM SESSION (Claude, branch claude/test-email-system-9n4d2)

Six sequential commits on `claude/test-email-system-9n4d2`:
  ae175ce → 148fbc2 → 3948432 → 7627ded → 396416e → (this commit)

Verifier: **165/166 PASS, 0 FAIL, 1 WARN** (RESEND_API_KEY optional)

### What was done

**Verifier + live-send tooling** — `scripts/verify-email-system.mjs`
(142/143 PASS, 1 WARN for optional `RESEND_API_KEY`) and
`scripts/send-one-email.mjs` (one-shot proof-of-life via Resend REST).

**Silent-failure fixes** (every send path now propagates real failures):
- `server/routes/email/emailRoutes.ts` `/api/email/send` — was writing
  `folder='sent'` even on Resend rejection. Now flips to `outbox`,
  returns 502, skips fair-use counter increment.
- `server/email.ts` `sendEmail` — returned `{success:false}` silently when
  Resend wasn't configured. Now propagates `error` reason; lazy-inits the
  Resend client so the very first call after boot can't silently skip.
- `server/routes/externalEmailRoutes.ts` `/external-emails/:id/send` — was
  writing `status='sent'` even when `sendEmail` returned `{success:false}`.
  Now inspects `result.success`, marks `status='failed'`, returns 502.

**Mobile rendering** — every customer-facing template now responsive:
- `server/services/emailTemplateBase.ts` — `emailLayout` now injects a
  `<style>@media (max-width:600px)` block. Added `cl-*` classes to
  `emailHeader/emailBody/emailFooter/infoCard/alertBox/ctaButton` so the
  rule collapses 600px container, scales h1 21px, stacks infoCard rows,
  full-width CTAs.
- `server/services/email/wrapInlineEmailHtml.ts` — NEW. Mobile wrapper for
  hand-rolled inline-HTML templates. Applied to:
  - All 12 inline `const html = \`...\`` blocks in `emailService.ts`
    (paystub, credit warning, compliance, invoice paid, payment receipt,
    subscription upgrade, weekly schedule, broadcast, callOff
    confirm/manager/replacement, plus Trinity greeting/onboarding/dropped).
  - `inboundEmailRoutes.ts` `buildForwardHtml` (every inbound forward).

**Forward-body fix** — `client/src/components/email/EmailHubCanvas.tsx`:
- Mapper hardcoded `bodyText: null` for every external email; now
  hydrates both `bodyText` and `bodyHtml` from the API row.
- Forward composer used `bodyText` only; now falls back to tag-stripped
  HTML and emits explicit notice if both empty. Adds From/Date/Subject/To
  header lines.

**Outbound send loop refactor**:
- New endpoint `POST /api/external-emails/send` — single-call insert +
  dispatch, no orphan-draft race. Compose UI now hits it directly.
- Legacy `POST /` then `POST /:id/send` retained for scheduled send /
  draft auto-save.

**Optimistic UI mutations** — archive / delete / star now snapshot both
inbox feeds in `onMutate`, apply local cache mutation, restore in
`onError`. Detail pane closes immediately on archive/delete; star icon
flips before round-trip. Server-failure rolls cache back so users never
see ghost-state.

**Undo toast (Gmail-style)** — 5-second window on archive/delete with an
`Undo` button that PATCHes the row back to `inbox`. Extended `useToast`
to forward `action: { label, onClick }` through to UniversalToast.

**Inbox error state** — queries throw on non-OK; `isLoadError` fires when
either feed errors (was previously requiring BOTH); dedicated error UI
with retry button + `role="alert"`. Skeleton has `aria-busy`.

**Accessibility + keyboard shortcuts**:
- `aria-label` on icon-only buttons (refresh, reply, forward, archive,
  delete, star, back, support-back, trinity-back).
- `aria-pressed` on the star toggle.
- Gmail-style keyboard shortcuts: `j`/`k` next/prev, `r` reply, `f`
  forward, `e` archive, `#` delete, `s` star, `c` compose, `/` search,
  `Esc` close detail/compose. Handler ignores keystrokes in inputs.

**Auth + retry queue routed through canonical wrapper**:
- `server/services/authService.ts` — 4 emails (verification, magic-link,
  email-change confirm, email-change security notice) now use
  `sendCanSpamCompliantEmail` with `skipUnsubscribeCheck: true`. Inherits
  hard-bounce suppression, 15s timeout, structured logging.
- `server/services/emailService.ts` retry queue — same migration; also
  drops hard-bounced retries instead of rescheduling them indefinitely.

**Workflow timing fix** — `sendEmailMutation` no longer adds 1.4s of fixed
`setTimeout(200)` artificial delays; each step is tied to real async
work.

**Template per-category split** — `emailService.ts` shrunk 3119→2464
lines. The 650-line inline `emailTemplates` const now lives in:
- `server/services/email/templates/account.ts`
- `server/services/email/templates/billing.ts`
- `server/services/email/templates/support.ts`
- `server/services/email/templates/onboarding.ts`
- `server/services/email/templates/scheduling.ts`
- `server/services/email/templates/index.ts` (barrel re-export)

Public API unchanged — every existing `emailTemplates.X(...)` call site
resolves to a defined template (verified by the verifier).

### Trinity staffing workflow — verified end-to-end
1. Inbound webhook (Svix HMAC verified, timing-safe compare)
2. Gemini job summary (English/Spanish auto-detect)
3. Trinity AI greeting via `emailService.sendTrinityAIGreeting`
4. `inboundOpportunityAgent.processInboundEmail` — claims a shift
5. **On win**: `sendStaffingOnboardingInvitation`
6. **On loss**: `staffingClaimService.sendDropNotifications`
7. Workspace owner notification via `universalNotificationEngine`
8. Calloff intent in "staffing" email reroutes to `processCalloff`

### Zero-debt sweep (2026-05-01, this commit) — every previously-deferred
### follow-up is now closed:

**Centralised mobile responsiveness**
- `sendCanSpamCompliantEmail` now auto-wraps any HTML fragment that
  doesn't start with `<!DOCTYPE` or `<html>` using `wrapInlineEmailHtml`.
  Effect: every email anywhere in the codebase that flows through the
  canonical wrapper (whether passed from `emailService._deliver`,
  `NotificationDeliveryService.send → sendCustomEmail`, ad-hoc inline
  HTML in route handlers, etc.) gets viewport meta + @media query for
  free. The 30+ inline-HTML callers no longer need individual migration.

**Canonical wrapper covers all outbound paths**
- `CanSpamEmailOptions` extended with `from?: string` and
  `extraHeaders?: Record<string, string>`. `extraHeaders` are merged
  BEFORE the CAN-SPAM List-Unsubscribe headers so compliance values
  always win.
- `notificationDeliveryService.sendEmailReply` (custom from + In-Reply-To
  threading headers) now flows through the wrapper.
- `resendWebhooks.ts` Trinity-marketing reply (Trinity@coaileague.com
  from-address) and platform-support auto-reply (Support@<domain>
  from-address) both flow through the wrapper.
- Net effect: the only legitimate direct `client.emails.send` calls left
  are inside `sendCanSpamCompliantEmail` itself (the implementation),
  `sendBilledEmail` (internal raw send used by sendCampaign — paired
  with its own metering), and the user-composed inbox send in
  `email/emailRoutes.ts` (which intentionally bypasses CAN-SPAM footer
  for platform inbox replies). Verifier asserts authService,
  notificationDeliveryService, and emailService have ZERO direct calls.

**Drizzle schema for the four platform-email tables**
- Added `platformEmailAddresses`, `emailRouting`, `platformEmails`,
  `platformEmailAttachments` to `shared/schema/domains/comms/index.ts`
  with full type exports (`PlatformEmail`, etc) and Zod insert schemas.
- Runtime `CREATE TABLE IF NOT EXISTS` in `inboundEmailRoutes.ts`
  remains authoritative for production migrations; the Drizzle
  definitions exist so query callers can opt into typed access.

**Route mount documentation + conflict guard**
- Added an "Email mount map" block in `server/routes.ts` listing every
  email-related mount, its owner router, its purpose, and its auth
  profile. Future devs adding a route now have a single source of truth.
- `comms.ts` annotates the singular-vs-plural distinction at the mount
  point and emits a boot-time disjoint guard that warns if the
  emailUnsubscribeRouter loses ownership of `/unsubscribe*`. Locked in
  by verifier so a future PR can't silently break it.

### Known follow-ups
None remaining for the email system.

### Files touched (Claude's domain — EmailHubCanvas + email backend)
```
client/src/components/email/EmailHubCanvas.tsx          (+800 lines)
client/src/hooks/use-toast.ts                           (action passthrough)
server/email.ts                                          (truthful sendEmail)
server/services/authService.ts                           (4 → wrapper)
server/services/emailService.ts                          (3119 → 2464, +wrap)
server/services/emailTemplateBase.ts                     (mobile @media)
server/services/email/templates/{account,billing,support,onboarding,scheduling,index}.ts  (NEW)
server/services/email/wrapInlineEmailHtml.ts             (NEW)
server/routes/email/emailRoutes.ts                       (silent-failure fix)
server/routes/externalEmailRoutes.ts                     (single-call send + result.success)
server/routes/inboundEmailRoutes.ts                      (forward wrapped)
scripts/verify-email-system.mjs                          (NEW, 143 checks)
scripts/send-one-email.mjs                               (NEW)
```

### Run the verifier
```
node scripts/verify-email-system.mjs                     # 142/143 PASS
RESEND_API_KEY=re_test_… node scripts/send-one-email.mjs # one real send
```

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
