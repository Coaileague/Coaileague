# Round 5 Remediation — High-Risk Sx + Phase B Transactions
**Date:** 2026-04-21
**Branch:** `claude/continue-audit-plan-1V3hH`
**Base:** Round 4 commit (8f25f60)
**Scope:** Remaining Round-2 high/medium blockers (S5–S8, S12) + Phase B
transaction-integrity pass on the Phase-B top-10 file list + D01 supplement
confirmation.

---

## Results

| # | Summary | Files Touched | Status |
|---|---|---|---|
| S5 | Role guard on `POST /api/employees` | `employeeRoutes.ts` | ✅ |
| S6 | Role guard on `POST /contracts/:id/send` | `contractPipelineRoutes.ts` | ✅ |
| S7 | Contract access token ↔ signer email binding | `contractPipelineService.ts`, `contractPipelineRoutes.ts` | ✅ |
| S8 | Armed-shift `employees.is_armed` validation | `shiftRoutes.ts` | ✅ |
| S12 | Role matrix: org-code owner-only; manager-assignments allow manager | `workspace.ts`, `hrInlineRoutes.ts` | ✅ |
| D01 | Thalamic log supplement | `trinityEventSubscriptions.ts` | ✅ (completed Round 3; verified — 6 calls via helper + 1 legacy insert) |
| Phase B | 11 atomic multi-table writes wrapped in `db.transaction()` | 4 route files | ✅ |

TypeScript: 29 pre-existing errors (seed/test scripts). **0 new errors** in any
touched file.

---

## S5 — POST /api/employees role guard

**File:** `server/routes/employeeRoutes.ts`

Previously the only gates at the mount (`domains/workforce.ts:61`) were
`requireAuth` + `ensureWorkspaceAccess`. Any authenticated user — including
officer/supervisor — could create employees. Added an inline check at the
top of the handler:

```ts
if (!userId) return 401;
if (!isPlatformStaff && !hasManagerAccess(requesterEmployee?.workspaceRole)) {
  return 403 'Only managers and owners can create employees';
}
```

Platform staff still bypass via `platformRole` for support workflows.
The auth narrowing (`if (!userId) return`) also lets TypeScript prove
`userId` is `string` downstream, which allowed removal of a stale
`@ts-expect-error` directive.

---

## S6 — POST /contracts/:id/send role guard

**File:** `server/routes/contractPipelineRoutes.ts`

Inline guard at the start of the handler:

```ts
if (!hasManagerAccess(role)) {
  return 403 'Only managers and owners can send contracts for signature';
}
```

Sending a contract triggers downstream invoicing + signer-liability chains.
Manager+ is the correct floor.

---

## S7 — Contract access token ↔ signer email binding

**Files:** `server/services/contracts/contractPipelineService.ts`,
`server/routes/contractPipelineRoutes.ts`

**Before:** `validateAccessToken` returned `{valid, contract}` but did not
surface the token's `recipientEmail`. `canSignerSign` returned
`canSign: true` for any email not in the signer list — so an attacker with
a valid (but leaked/shared) access token could sign as a completely
different listed signer.

**Fix (service):**
- `validateAccessToken` now also returns `recipientEmail` from the token row.
- `canSignerSign` gained an optional 3rd parameter `tokenRecipientEmail`.
  When supplied, it must match the claimed `signerEmail` (case-insensitive)
  or `canSign: false` with reason 'Access token does not match the claimed
  signer email'.
- When the contract has a non-empty signer list and the claimed email is
  NOT on it, `canSign` is now `false` (`'Signer email is not on the
  contract signer list'`). Previously this path returned `true`, which was
  the exact bypass the audit flagged.

**Fix (route):**
- Public sign route now passes `result.recipientEmail` through to
  `canSignerSign`, binding token → signer.

Captures inside `captureSignature` (internal server-side calls) omit the
third param — those are already trusted (workspace staff flow). This means
external portal sign-ins enforce the binding; internal signature capture
remains permissive for legitimate system flows.

---

## S8 — Armed-shift employee flag validation

**File:** `server/routes/shiftRoutes.ts`

The existing Layer-3 cert check required the `armed` certification to be
on file. That's necessary but not sufficient — an officer can hold the
cert yet have `employees.is_armed = false` (opted out, policy restriction,
or pending manager verification).

Added an explicit per-employee check when `validated.isArmed === true`:
- `emp.isArmed` must be true
- `emp.armedLicenseVerified` must be true

Each failure appends a distinct line to the existing `ineligibleEmployees`
rejection list, so the 422 response clearly explains why each assignment
was blocked.

---

## S12 — Role matrix corrections

### `POST /org-code/claim` — now owner-only

**File:** `server/routes/workspace.ts:437`

Was `['org_owner','co_owner','org_admin','manager']`. The org code drives
email provisioning (`calloffs@/incidents@/...`) and is an org-identity
action. Restricted to `['org_owner','co_owner']` to match the RBAC matrix.

### `POST /manager-assignments` — now manager+, not owner-only

**File:** `server/routes/hrInlineRoutes.ts:96`

Was `requireOwner`. The RBAC matrix says managers should be able to
assign subordinates. Swapped to `requireManager`.

---

## D01 supplement — verified complete

`writeThalamicSignal` helper + 6 call sites already shipped in Round 3
(`trinityEventSubscriptions.ts`): `lone_worker_missed_checkin`,
`panic_alert_resolved`, `compliance_cert_expired`,
`shift_calloff_escalated`, `subscription_canceled`,
`invoice_overdue_escalated`. Plus pre-existing `contract_executed` direct
insert. Total 7 thalamic_log writes. The Phase B D01 supplement asked for
the same 5 handlers — all present. No further edits needed this round.

---

## Phase B — transaction integrity

Applied surgical `db.transaction(async (tx) => { … })` wraps to 11 truly
atomic multi-table write groups. Investigation notes:
- `supportRoutes.ts` — no atomic multi-table groups. All mutations are
  single-table (`supportTickets`) or downstream notification sends.
- `salesInlineRoutes.ts` — no multi-table groups (all single-table
  inserts/updates).
- `endUserControlRoutes.ts` — no multi-table groups.
- `faq-routes.ts` — all mutations are single-table or independent
  bulk-import items each wrapped in their own try/catch. Wrapping would
  break the intended partial-success pattern.
- `miscRoutes.ts` — scanned; the few proximate inserts are if/else
  branches (employee OR client), never both.
- `workspace.ts POST /` — existing code has **intentional** per-section
  try/catch + `ON CONFLICT DO NOTHING` designed for graceful/idempotent
  init. Wrapping would break this contract (single secondary failure
  would roll back workspace creation). Left alone; documented rationale.

### Wraps applied (11 total)

| File | Handler | Tables |
|---|---|---|
| `chat-rooms.ts` | `POST /api/chat/rooms` | `chatConversations` + `organizationChatRooms` + `chatParticipants` (creator + invitees) |
| `chat-management.ts` | `POST /conversations/:id/leave` | `conversationUserState` + `chatParticipants` + `roomEvents` |
| `chat-management.ts` | `POST /rooms/:roomId/transfer-ownership` | `chatParticipants` (demote + promote) + `roomEvents` |
| `chat-management.ts` | `POST /rooms/:roomId/update-role` | `chatParticipants` + `roomEvents` |
| `chat-management.ts` | `POST /messages/:id/pin` | `chatMessages` + `roomEvents` |
| `chat-management.ts` | `POST /dm/close` | `chatConversations` + `chatMessages` (system msg) |
| `chat-management.ts` | `POST /dm/create` | `chatConversations` + `chatParticipants` (both sides) |
| `chat-management.ts` | `POST /rooms/create` | `chatConversations` + `chatParticipants` + `roomEvents` |
| `resendWebhooks.ts` | `email.bounced` handler | `emailEvents` + `notificationDeliveries` |
| `resendWebhooks.ts` | `email.complained` handler | `emailEvents` + `notificationDeliveries` |
| `sra/sraAuthRoutes.ts` | `POST /start-audit-session` | `sraAuditSessions` + `sraAccounts` (lastLoginAt) |

### Outside transactions (hoisted / left in place)
Notification sends, event-bus publishes, AI-model round-trips, and
best-effort audit logs all remain OUTSIDE the transactions so they don't
hold DB connections or cause rollbacks on non-critical side-effect
failures. Each transaction wrap is a pure DB-only unit.

### Read queries pre-computed

For room creation in `chat-rooms.ts` and `chat-management.ts`, the
SELECT that resolves invited participant user rows was moved BEFORE the
transaction (read-only operations don't belong in the write transaction
and would unnecessarily hold locks).

---

## Verification

```
npx tsc --noEmit → 29 errors (unchanged baseline; pre-existing in seed/test scripts)
                   0 new errors in any touched file

SEMANTIC GREP
  S5  REQUIRE MANAGER+ TO CREATE EMPLOYEES     → 1
  S6  REQUIRE MANAGER+ TO SEND CONTRACTS       → 1
  S7  tokenRecipientEmail / binding            → 3
  S8  ARMED-SHIFT EMPLOYEE FLAG CHECK          → 1
  S12 owner-only org-code + requireManager     → 1 / 13
  Phase B transactions:
    chat-rooms.ts                              → 1
    chat-management.ts                         → 7
    resendWebhooks.ts                          → 2
    sra/sraAuthRoutes.ts                       → 1
```

---

## Outstanding items (for next round)

From Round 2 audit, still open:
- **S9** QB invoice auto-create on contract execution
- **S10** I-9 upload + guard-card verification compliance wiring
- **S13** lone-worker auto-activation on time-entry clock-in
  (already wired — see Round 3 clarification)
- **S14** calloff SLA escalation timer

From Phase B: per-handler atomic review is complete for the top-10 files.
Remaining 46 "files with multi-table writes" per the original audit are
likely dominated by single-table or independent-batch patterns (per the
sampling done here). A targeted review is recommended only if real
partial-write incidents surface in prod.

---

## Go-live status

After this round:
- **All Round 2 "critical blockers" (S1–S4) and "high-risk" (S5–S8, S12) items are closed.**
- **D04 transaction integrity** now covers the highest-value atomic pairs.
- **D01 thalamic log** covers the 7 most operationally significant events.

Statewide go-live prerequisites from the master work order are materially
complete; remaining items are medium priority and can ship sequentially
without blocking launch.
