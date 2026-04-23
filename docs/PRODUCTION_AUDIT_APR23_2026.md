# CoAIleague — Production Audit Report
**Date:** April 23, 2026  
**Auditor:** Claude (Anthropic) — Strategic Architect  
**Repo:** github.com/Coaileague/coaileague  
**Branch:** main @ 44eb18f  
**Files Scanned:** 5,729 total, ~3,000+ TypeScript source files  

---

## EXECUTIVE SUMMARY

The 19-phase hardening roadmap addressed schema parity, ORM conversion, financial precision, and notification idempotency. The latest PRs (#194–#198) cleaned loose equality and partial idempotency keys. However, **six systemic issues remain that are production-blocking or will cause data integrity failures under real load.**

---

## 🔴 CRITICAL — Fix Before Any Real Tenant Load (P0)

### C1 — `req as any` Bypasses AuthenticatedRequest on 447 Endpoints

**Risk:** Cross-tenant data leakage. Any route using `req as any` can access `req.user`, `req.workspace`, and `req.permissions` without TypeScript enforcement. A bug in one of these routes can expose another tenant's data.

**Count:** 447 instances across 30+ route files

**Top Offenders:**
| File | Count |
|------|-------|
| server/routes/automation.ts | 57 |
| server/routes/identityPinRoutes.ts | 23 |
| server/routes/subagentRoutes.ts | 22 |
| server/routes/schedulerRoutes.ts | 22 |
| server/routes/recruitmentRoutes.ts | 21 |
| server/routes/supportActionRoutes.ts | 18 |
| server/routes/mascot-routes.ts | 16 |
| server/routes/platformFormsRoutes.ts | 12 |
| server/auth.ts | 11 |
| server/routes/publicOnboardingRoutes.ts | 10 |

**Fix Pattern:**
```typescript
// WRONG — currently in 447 places:
const user = (req as any).user;
const workspaceId = (req as any).workspaceId;

// CORRECT — enforce everywhere:
import type { AuthenticatedRequest } from '../middleware/authMiddleware';
const req = request as AuthenticatedRequest;
const user = req.user;       // typed, safe
const workspaceId = req.workspaceId; // typed, safe
```

**Prompt for Claude Code / Copilot:**
```
CRITICAL: 447 instances of `req as any` across route files bypass AuthenticatedRequest 
type enforcement. This is a cross-tenant data leakage risk.

For each file in this list: [automation.ts, identityPinRoutes.ts, subagentRoutes.ts, 
schedulerRoutes.ts, recruitmentRoutes.ts, supportActionRoutes.ts, mascot-routes.ts, 
platformFormsRoutes.ts, auth.ts, publicOnboardingRoutes.ts] — and all remaining files:

1. Add: import type { AuthenticatedRequest } from '../middleware/authMiddleware' (adjust path)
2. Change handler signature from `async (req: Request, res: Response)` to 
   `async (req: AuthenticatedRequest, res: Response)`  
3. Remove all `(req as any).user`, `(req as any).workspaceId`, `(req as any).permissions`
4. Use req.user, req.workspaceId, req.permissions directly (now typed)

Work through all 30+ files. Do not stop until grep -rn "req as any" server/ returns 0 results.
```

---

### C2 — Financial Routes Missing db.transaction() — Naked Payroll Writes

**Risk:** Partial writes. If a payroll run creates entries but crashes before updating the run status, the database is in a corrupted half-state with no rollback.

**Evidence:** payrollRoutes.ts has 25 router endpoints but only 4 db.transaction() blocks. Multi-step writes including `db.delete(payrollRunLocks)` followed by `db.insert(payrollRunLocks)` run unprotected.

**Specific Unprotected Operations Found:**
- Line 74: `db.delete(payrollRunLocks)` — naked
- Line 81: `db.insert(payrollRunLocks)` — naked (2 operations, no transaction)
- Line 471: `db.update(payrollProposals)` — followed by audit log insert, no transaction
- Line 2019: `db.update(payrollEntries)` + line 2036: `db.update(payrollRuns)` — two tables, one transaction required
- Line 3497: `db.update(employeeBankAccounts).set({ isPrimary: false })` then insert of new primary — race condition

**Fix Pattern:**
```typescript
// WRONG — currently:
await db.delete(payrollRunLocks).where(...);
await db.insert(payrollRunLocks).values({...});
// if crash here: lock is deleted but new one not inserted

// CORRECT:
await db.transaction(async (tx) => {
  await tx.delete(payrollRunLocks).where(...);
  await tx.insert(payrollRunLocks).values({...});
});
```

**Prompt for Claude Code / Copilot:**
```
CRITICAL: payrollRoutes.ts has 25 endpoints but only 4 db.transaction() blocks.
Multi-table financial writes are running naked with no rollback protection.

Audit every route handler in payrollRoutes.ts, invoiceRoutes.ts, and billingRoutes.ts.
For every handler that contains 2+ db operations (insert, update, delete) against 
different tables — or against the same table in sequence — wrap the entire sequence 
in a db.transaction() block. 

Use `tx` inside the transaction, not `db`.
The transaction must wrap the COMPLETE logical unit — not just one of the operations.

Target: zero multi-table financial writes outside db.transaction().
```

---

### C3 — 233 createNotification Calls Missing idempotencyKey

**Risk:** Duplicate notifications to employees/clients under retry or concurrent request conditions. PR #198 added idempotency to some routes but 233 calls remain unprotected.

**Evidence:**
```bash
grep -rn "createNotification({" server/ | grep -v "idempotencyKey" | wc -l
# Returns: 233
```

**Fix Pattern:**
```typescript
import { randomUUID } from 'crypto';

// WRONG — missing idempotencyKey:
await createNotification({ workspaceId, userId, type: 'shift_assigned', ... });

// CORRECT:
await createNotification({
  workspaceId,
  userId,
  type: 'shift_assigned',
  idempotencyKey: `shift-assigned-${shiftId}-${userId}-${Date.now()}`,
  ...
});
```

**Prompt for Claude Code / Copilot:**
```
233 createNotification() calls are missing idempotencyKey.

Search: grep -rn "createNotification({" server/ --include="*.ts" | grep -v "idempotencyKey"

For each result:
1. Add idempotencyKey using a deterministic composite: 
   `${type}-${relatedEntityId}-${userId}-${Date.now()}`
   For time-sensitive: use relatedEntityId + userId only (makes it truly idempotent on retry)
2. Do not use Date.now() alone — not idempotent
3. Best pattern: `${notificationType}-${relatedEntityId}-${userId}` 
   (deduplicates retries for the same entity/user pair)

Work through all 233 instances.
```

---

## 🟠 HIGH — Fix Within 48 Hours (P1)

### H1 — 336 setInterval/setTimeout Without Paired clearInterval/clearTimeout

**Risk:** Memory leaks, zombie processes, timer accumulation causing server slowdown over time. Especially dangerous in WebSocket connection handlers where timers are created per-connection but never cleaned up when the connection closes.

**Evidence:** 336 setInterval/setTimeout calls found; clearInterval/clearTimeout found significantly less often.

**Prompt for Claude Code / Copilot:**
```
336 setInterval/setTimeout calls exist without guaranteed paired cleanup.

Search: grep -rn "setInterval\|setTimeout" server/ --include="*.ts" | grep -v "clearInterval\|clearTimeout\|node_modules"

For each one:
1. Store the timer reference: const timer = setInterval(...)
2. On route/connection/service cleanup: clearInterval(timer)
3. For WebSocket handlers: add cleanup in the 'close' event handler
4. For Express routes: avoid setInterval entirely — use a job queue instead
5. For service-level timers: expose a cleanup() method and call it on SIGTERM

The graceful shutdown handler (fixed in PR #198) must also clear all registered timers.
```

---

### H2 — 133 Floating .then() Without .catch() — Unhandled Promise Rejections

**Risk:** Unhandled promise rejections in Node.js cause `UnhandledPromiseRejection` warnings. In some deployments, they crash the process. These are silent production failures.

**Top Offenders:**
- `server/middleware/subscriptionGuard.ts` — lines 99, 154
- `server/middleware/idempotency.ts` — line 201
- `server/routes/timeOffRoutes.ts` — floating `.then(r => r[0])` chains
- `server/routes/clientRoutes.ts` — QuickBooks sync `.then()` without catch
- `server/routes/voiceRoutes.ts` — `validateTwilioSignature(req).then(valid =>` — no catch
- `server/routes/hrInlineRoutes.ts` — `Promise.resolve().then(async () =>` — fire and forget
- `server/routes/auditRoutes.ts` — `weeklyPlatformAudit.runFullAudit().then(report =>` — no catch

**Fix Pattern:**
```typescript
// WRONG:
validateTwilioSignature(req).then(valid => {
  // handle valid
});

// CORRECT:
validateTwilioSignature(req)
  .then(valid => {
    // handle valid
  })
  .catch(err => {
    log.error('Twilio signature validation failed:', err);
    res.status(500).json({ error: 'Signature validation error' });
  });

// Or just use async/await:
const valid = await validateTwilioSignature(req);
```

**Prompt for Claude Code / Copilot:**
```
133 .then() chains exist without .catch() handlers — unhandled promise rejections.

Search: grep -rn "\.then(" server/ --include="*.ts" | grep -v "\.catch\|return\.then\|await\|node_modules"

Priority files to fix first:
- server/middleware/subscriptionGuard.ts
- server/middleware/idempotency.ts
- server/routes/voiceRoutes.ts (Twilio signature)
- server/routes/hrInlineRoutes.ts (Promise.resolve().then fire-and-forget)
- server/routes/auditRoutes.ts (weekly audit runner)

For each: either add .catch(err => log.error(...)) or convert to async/await with try/catch.
```

---

### H3 — Workspace Isolation Gaps in supportRoutes.ts, timeOffRoutes.ts, salesRoutes.ts

**Risk:** A user from workspace A could potentially access records from workspace B if the only filter is `.where(eq(entity.id, id))` without also checking workspace_id.

**Confirmed Unprotected Queries:**
- `supportRoutes.ts` line 640: `where(eq(supportTickets.id, id))` — no workspace check
- `supportRoutes.ts` line 666, 709, 792, 837: same pattern
- `supportRoutes.ts` line 1030: `db.delete(performanceReviews).where(eq(performanceReviews.id, id))` — no workspace
- `timeOffRoutes.ts` lines 416, 531, 537, 538: shift queries by ID only
- `salesRoutes.ts` lines 28, 187: filtering by `user?.id` only, no workspace scope

**Fix Pattern:**
```typescript
// WRONG — ID-only lookup (cross-tenant risk):
const [ticket] = await db.select().from(supportTickets)
  .where(eq(supportTickets.id, id));

// CORRECT — always scope by workspace:
const workspaceId = req.workspaceId;
const [ticket] = await db.select().from(supportTickets)
  .where(and(
    eq(supportTickets.id, id),
    eq(supportTickets.workspaceId, workspaceId)
  ));
if (!ticket) return res.status(404).json({ error: 'Not found' });
```

**Prompt for Claude Code / Copilot:**
```
CRITICAL SECURITY: supportRoutes.ts, timeOffRoutes.ts, and salesRoutes.ts contain 
queries that filter by entity ID alone without workspace_id scoping.

This allows cross-tenant data access if IDs are guessable or leaked.

In each file:
1. Extract workspaceId from req.workspaceId (or AuthenticatedRequest)
2. Add eq(entity.workspaceId, workspaceId) to EVERY query that currently only has eq(entity.id, id)
3. If the entity table doesn't have workspace_id, document why (platform-level entity)

Files to fix: supportRoutes.ts, timeOffRoutes.ts, salesRoutes.ts
```

---

### H4 — Inbound Email `routed: false` — Trinity Not Processing Inbound Emails

**Context:** The webhook is receiving emails (200 OK, `received: true`) but `routed: false` is returned. Trinity auto-processing is wired in code but the workspace resolution from `to` email address fails because workspaces may not have `calloffs_email`, `support_email`, etc. columns populated.

**Root Cause Chain:**
1. Email arrives at `support@coaileague.com`
2. Webhook receives it → `received: true`
3. `trinityEmailProcessor.resolveWorkspaceFromEmail()` looks for workspace with matching `support_email` column
4. No workspace has that column populated → workspace = null → `routed: false`

**Fix:**
```typescript
// In trinityEmailProcessor.resolveWorkspaceFromEmail():
// Add fallback: if no workspace has matching email column, 
// check CANONICAL_PLATFORM_LOCALPARTS and route to PLATFORM_WORKSPACE_ID

const canonicalLocalParts = ['support', 'calloffs', 'incidents', 'docs', 'billing', 'trinity'];
const localPart = toEmail.split('@')[0].toLowerCase();

if (canonicalLocalParts.includes(localPart)) {
  return { id: PLATFORM_WORKSPACE_ID, /* platform workspace */ };
}
```

**Prompt for Claude Code / Copilot:**
```
Inbound email is received (200 OK) but returns routed:false.

Root cause: trinityEmailProcessor.resolveWorkspaceFromEmail() returns null for 
canonical addresses like support@coaileague.com because no workspace row has 
support_email populated.

Fix:
1. In trinityEmailProcessor.ts: in resolveWorkspaceFromEmail(), after failing 
   to find a workspace by email column match, check if the local part 
   (support, calloffs, incidents, docs, billing, trinity) matches 
   CANONICAL_PLATFORM_LOCALPARTS
2. If it does, return { id: PLATFORM_WORKSPACE_ID } from billingConstants
3. This routes platform-level email (support@, calloffs@) to the platform workspace
4. TrinityEmailProcessor.processInbound() then handles it via the correct address type

After this fix: emailing support@coaileague.com should return routed:true and 
Trinity should process it.
```

---

## 🟡 MEDIUM — Address in Next Sprint (P2)

### M1 — 3,231 parseFloat/parseInt/Number() Calls Bypassing FinancialCalculator

Financial drift risk. Every native JS number operation on money values can silently lose precision. The FinancialCalculator service exists but most of the codebase bypasses it.

**Prompt for Claude Code / Copilot:**
```
3,231 parseFloat/parseInt/Number() calls exist that bypass the FinancialCalculator service.

Search: grep -rn "parseFloat\|parseInt\|Number(" server/ --include="*.ts" | grep -v "node_modules"

Triage:
- If the value is a FINANCIAL value (pay rate, hours, invoice amount, tax, fee): 
  replace with FinancialCalculator.from(value) or Decimal(value)
- If the value is a NON-financial integer (pagination offset, status code, count): 
  parseInt() is acceptable, document with // non-financial
- If the value is a display-only format: parseFloat() acceptable, document with // display only

Priority: payrollRoutes.ts, invoiceRoutes.ts, billingRoutes.ts first.
```

---

### M2 — 4,548 Catch Blocks Without Logging — Silent Error Swallowing

Failures are happening in production with no visibility. Every catch block that does not log is a hidden incident.

**Prompt for Claude Code / Copilot:**
```
4,548 catch blocks do not log the error. Silent failures are happening in production.

Search: grep -rn "} catch" server/routes/ --include="*.ts" | grep -v "log\.\|logger\.\|console\."

For each:
1. If there's a res.status() call, also add: log.error('[RouteName] Operation failed:', err?.message)
2. If it re-throws, the caller must log it
3. If it's a truly expected error (validation), log at warn level
4. NEVER swallow an error silently with just: catch (err) { }

Add createLogger at the top of any route file missing it.
```

---

### M3 — 1,719 console.log/console.error Bypassing createLogger

Production logs are noisy and non-searchable because console.log doesn't include service name, correlation ID, or request ID. The createLogger factory exists but 1,719 calls bypass it.

**Prompt for Claude Code / Copilot:**
```
1,719 console.log/console.error calls bypass createLogger.

In production, logs need: service name, request ID, and structured format.

Search: grep -rn "console\.log\|console\.error" server/ --include="*.ts" | grep -v "node_modules"

For each file:
1. Add at top: const log = createLogger('ServiceOrRouteName');
2. Replace: console.log('msg', data) → log.info('msg', data)
3. Replace: console.error('msg', err) → log.error('msg', err?.message)
4. Replace: console.warn('msg') → log.warn('msg')

This is a P2 but do it file-by-file starting with financial and Trinity routes.
```

---

## 📊 ISSUE SUMMARY TABLE

| ID | Severity | Issue | Count | Risk |
|----|----------|-------|-------|------|
| C1 | 🔴 P0 | `req as any` bypassing AuthenticatedRequest | 447 | Cross-tenant data leak |
| C2 | 🔴 P0 | Financial writes without db.transaction() | 21+ naked writes | Corrupt payroll state |
| C3 | 🔴 P0 | createNotification missing idempotencyKey | 233 | Duplicate notifications |
| H1 | 🟠 P1 | setInterval without clearInterval | 336 | Memory leak / zombie timers |
| H2 | 🟠 P1 | .then() without .catch() | 133 | Silent process crashes |
| H3 | 🟠 P1 | Workspace isolation gaps | 20+ queries | Cross-tenant data access |
| H4 | 🟠 P1 | Inbound email routed:false | 100% of inbound | Trinity deaf to email |
| M1 | 🟡 P2 | parseFloat/Number() on financial values | 3,231 | Financial precision drift |
| M2 | 🟡 P2 | Catch blocks without logging | 4,548 | Silent production failures |
| M3 | 🟡 P2 | console.log bypassing createLogger | 1,719 | Unstructured logs |

---

## EXECUTION ORDER

**Day 1 (before any real tenant):**
1. C1 — req as any → AuthenticatedRequest (start with automation.ts, schedulerRoutes.ts)
2. C2 — Wrap naked financial writes in db.transaction() (payrollRoutes.ts first)
3. C3 — Add idempotencyKey to remaining 233 createNotification calls

**Day 2:**
4. H3 — Fix workspace isolation gaps in supportRoutes, timeOffRoutes, salesRoutes
5. H4 — Fix inbound email routing so Trinity processes support@, calloffs@, etc.
6. H2 — Add .catch() to 133 floating .then() chains (subscriptionGuard, voiceRoutes first)

**Week 2:**
7. H1 — Audit all 336 timers for cleanup
8. M1 — Triage financial parseFloat/Number() calls
9. M2+M3 — Logging sweep

---

## VERIFICATION COMMANDS

After fixes, run these to confirm clean:
```bash
# C1: should return 0
grep -rn "req as any\|req as Request" server/ --include="*.ts" | grep -v "node_modules" | wc -l

# C3: should return 0  
grep -rn "createNotification({" server/ --include="*.ts" | grep -v "idempotencyKey" | wc -l

# H2: should return 0
grep -rn "\.then(" server/ --include="*.ts" | grep -v "\.catch\|return\.then\|await\|node_modules" | wc -l

# H3: manual review of supportRoutes.ts, timeOffRoutes.ts, salesRoutes.ts
# Confirm every .where(eq(entity.id, id)) also has workspace_id filter
```

---

*Report generated by Claude (Anthropic) — April 23, 2026*  
*Repo analyzed: github.com/Coaileague/coaileague @ main (44eb18f)*  
*All findings based on static analysis of cloned repository*
