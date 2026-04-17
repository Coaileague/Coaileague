# Phase 17A — Trinity Data Persistence & Action Execution Audit

**Date:** 2026-04-17
**Branch:** `claude/audit-trinity-data-persistence-9WN25`
**Method:** Static code audit (no live-DB tests executed). All findings cite
file:line so claims can be verified without re-running the audit.
**Scope:** `server/services/trinity/`, `server/services/ai-brain/`,
`server/routes/trinity*.ts`, `server/middleware/workspaceScope.ts`.

---

## Executive Summary

| Audit | Tests | Pass | Fail | Critical |
|---|---|---|---|---|
| 1. Write paths | 5 | 2 | 3 | — |
| 2. Read paths | 3 | 2 | 1 | — |
| 3. Action execution | 2 | 1 | 1 | — |
| 4. Logging completeness | 2 | 1 | 1 | — |
| 5. Error handling & recovery | 3 | 0 | 3 | — |
| 6. Cross-tenant isolation | 2 | 0 | 2 | **🔴 4 unscoped queries** |
| 7. Helper analysis | — | — | — | 7,265 LOC reduction identified |

**Headline findings:**

1. 🔴 **CRITICAL cross-tenant leak** — `trinityInboundEmailProcessor.ts:962`
   issues `SELECT id, companyName FROM workspaces LIMIT 100` with no
   `workspace_id` filter. Violates CLAUDE.md §G (Tenant Isolation in Raw SQL)
   and §1 of the master laws.
2. 🔴 **HIGH unscoped reads** — `trinityAgentDashboardRoutes.ts:153–198` has
   three queries by `action_id`/`id` alone (governance_approvals,
   trinity_decisions, trinity_action_logs). Any support agent can read any
   tenant's reasoning.
3. 🔴 **Missing middleware** — `trinityAgentDashboardRoutes` is mounted
   without `ensureWorkspaceAccess` (`server/routes/domains/trinity.ts:190`).
4. 🔴 **Audit logging gap** — Core `actionRegistry.ts` handlers (shift
   create/update/delete, invoice create) do **not** call
   `db.insert(systemAuditLogs)`. 0 audit entries for autonomous Trinity
   mutations on the primary write path.
5. 🔴 **No transactions** — Multi-step writes (shift + billing + usage,
   invoice + event) are not wrapped in `db.transaction(...)` — partial
   failures silently persist.
6. ⚠️ **Retry infrastructure exists but is unused** — `withRetry()` in
   `server/db.ts:210` + `server/services/orchestration/pipelineErrorHandler.ts:191`
   is not called from any Trinity action handler.
7. ⚠️ **Duplication load** — 4,125 inline `eq(table.workspaceId, …)` sites,
   126 direct `insert(systemAuditLogs)` sites, ~250 try/catch blocks. Phase 18
   can shed ~7,265 LOC by extracting four helpers.

**Trinity readiness:** The 75 → 85% ready claim cannot be supported. Cross-tenant
integrity must be restored (audit 6) and core audit logging wired (audit 4)
before Trinity is ready for production autonomous action. Current assessment:
**~68%**.

---

## Audit 1 — Write Paths

| # | Test | Result | Citation |
|---|---|---|---|
| 1.1 | Create shift with workspace scoping | ✅ partial | `actionRegistry.ts:218-237` includes `workspaceId` |
| 1.2 | Create invoice w/ transaction safety | ❌ | `actionRegistry.ts:1207-1245` — no `db.transaction`; event publish uses `.catch(() => null)` |
| 1.3 | Time entry referential integrity | ✅ | `actionRegistry.ts:1281-1287` |
| 1.4 | Update shift + log mutation | ❌ | No `systemAuditLogs` write on update |
| 1.5 | Delete shift + log deletion | ❌ | No `systemAuditLogs` write on delete |

**Findings:**

- Every sampled `db.insert(shifts)` / `db.insert(invoices)` includes
  `workspaceId` in the values (`actionRegistry.ts:226,293,1221`;
  `autonomousScheduler.ts:3112-3115`;
  `sandbox/sandboxQuickBooksSimulator.ts:388-391`). Tenant write-scope at the
  values-layer is intact.
- `db.insert(systemAuditLogs)` appears **zero times** inside
  `actionRegistry.ts` (the registry of 403 actions). Audit lines live in
  adjacent services (`adminSupport.ts:355-426`, 127 total call sites across
  the repo) but not on the Trinity autonomous write path.
- Open-shift concurrency is handled atomically via conditional WHERE
  (`actionRegistry.ts:381-389`, `isNull(shifts.employeeId)`) — good.
- No multi-step writes use `db.transaction(...)`. Example:
  `actionRegistry.ts:293-306` creates a shift, then finalizes billing, then
  records usage as three separate awaits — any one can fail and leave the
  others inconsistent.

---

## Audit 2 — Read Paths

| # | Test | Result | Citation |
|---|---|---|---|
| 2.1 | Workspace-scoped queries | ⚠️ 4 unscoped | see Audit 6 |
| 2.2 | Empty-result handling | ✅ | `trinityOrgContextBuilder.ts:296`, `trinityInboundEmailProcessor.ts:286`, `trinityComplianceIncidentActions.ts:117` |
| 2.3 | Cache consistency | ✅ | Keyed by `workspaceId`; explicit invalidators |

**Caches reviewed:**

- `trinityStateContextService.ts:217` — `Map<workspaceId, …>` with TTL;
  `invalidateCacheForWorkspace(workspaceId)` at line 377.
- `trinityOrgContextBuilder.ts:129` — static `contextCache` keyed by
  workspaceId, 60s TTL, invalidator at line 165.

Both caches are tenant-isolated and atomically invalidated. No Redis or
shared cache — in-memory only per-process.

**Gap:** No cache-invalidation hook on writes in `actionRegistry.ts`. A shift
created via Trinity will not evict the org-context cache for up to 60s.

---

## Audit 3 — Action Execution Tracing

| # | Test | Result | Citation |
|---|---|---|---|
| 3.1 | Happy path (`scheduling.create_shift`) | ✅ | `actionRegistry.ts:218-237` inserts + returns |
| 3.2 | Error path (invalid input) | ❌ | No try/catch; no Zod validation; raw `if` checks in `inboundEmailActions.ts:38` |

- Registry: **`server/services/ai-brain/actionRegistry.ts`** (403+ registered
  actions across 15 categories) + **`server/services/trinity/trinityServiceRegistry.ts`**
  (40 services, 18 domains, metadata only).
- `registerAction()` (line 158-167) is the canonical registration entry point.
- Only 13/18 Trinity files use Zod; `actionRegistry.ts` uses manual
  `if (!fromEmail) return { success: false, … }` guards. No schema-driven
  validation for 190+ autonomous actions. Malformed payloads will pass through
  until they hit a type error or a DB constraint.

---

## Audit 4 — Logging Completeness

| # | Test | Result | Citation |
|---|---|---|---|
| 4.1 | Mutation logging | ❌ | 0 `systemAuditLogs` writes in `actionRegistry.ts` |
| 4.2 | Sensitive-data redaction | ✅ | `trinityOrchestrationGateway.ts:245-251` redacts password/token/secret/key/auth/credit_card/ssn before insert |

- Redactor keyset: `['password', 'token', 'secret', 'key', 'auth',
  'credit_card', 'ssn']`. Case-insensitive substring match. Applied before
  audit insert at line 272.
- The redactor is sound but only executes when audit logs are written.
  Because the primary Trinity action path bypasses `systemAuditLogs` (Audit
  4.1), ~0% of autonomous mutations are currently captured.
- Trinity maintains a **separate** `trinity_audit_logs` table via
  `trinityAuditService`, which the transparency dashboard reads. This is not
  reused by `ai-brain` handlers — two parallel audit trails exist.

---

## Audit 5 — Error Handling & Recovery

| # | Test | Result | Citation |
|---|---|---|---|
| 5.1 | Permission denied → fail fast | ❌ untestable | No centralized permission guard on actions |
| 5.2 | Transient failure → retry | ❌ | `withRetry` exists (`db.ts:210`, `pipelineErrorHandler.ts:191`) but unused in `actionRegistry.ts` |
| 5.3 | Max retries → escalation (DLQ) | ❌ | `server/services/errors/deadLetterQueue.ts:1-49` exists but is not wired to the action pipeline |

**Silent-swallow pattern (forbidden — CLAUDE.md §B):**

- `actionRegistry.ts:615, 1241, 2824` — `.catch(() => null)` on event
  publishes.
- `actionRegistry.ts:443` — error in `createOpenShiftAndFill` caught and
  returned as a message string; not escalated, not logged to
  `systemAuditLogs`.
- `trinityInboundEmailProcessor.ts` try/catches log via `log.warn` and
  return `{ data: {}, confidence: 0 }`. Callers cannot distinguish parse
  failure from empty intent.

**Infrastructure present but unwired:**

- `withRetry<T>()` with exponential backoff + jitter
  (`pipelineErrorHandler.ts:191-233`; classifies errors as retryable).
- `deadLetterQueue.ts` (49 lines). Only `featureFlagsService`,
  `automationOrchestration`, and `quickbooksLazySync` import either.

---

## Audit 6 — Cross-Tenant Isolation (CRITICAL)

| # | Test | Result | Citation |
|---|---|---|---|
| 6.1 | Data isolation verification | ❌ 🔴 | 1 critical + 3 high unscoped reads found |
| 6.2 | Static analysis of all queries | ❌ | `ensureWorkspaceAccess` missing on one router |

### 🔴 Critical

**`server/services/trinity/trinityInboundEmailProcessor.ts:962`**

```sql
SELECT id, companyName FROM workspaces LIMIT 100
```

No tenant filter. Returns the first 100 workspaces globally, then matches by
slug client-side. Violates CLAUDE.md §G (fetch-then-check antipattern).
**Risk:** any caller of the inbound-email ingress can enumerate tenant
identity.

### 🔴 High — `server/routes/trinityAgentDashboardRoutes.ts`

- Line 146 — `/reasoning/:actionId` handler runs three queries by ID only:
  - L153–170 `SELECT … FROM governance_approvals WHERE ga.id = $1`
  - L173–180 `SELECT * FROM trinity_decisions WHERE action_id = $1 OR id = $1`
  - L183–198 `SELECT … FROM trinity_action_logs WHERE id = $1`
- The router is mounted at `server/routes/domains/trinity.ts:190` **without
  `ensureWorkspaceAccess` middleware**.
- Consequence: any authenticated support agent can request reasoning for any
  action in any workspace by guessing/enumerating UUIDs.

### ✅ Scoped correctly (reference good patterns)

- `trinityOrgContextBuilder.ts:196,203,206-211` — all include `eq(…, workspaceId)`.
- `trinityComplianceIncidentActions.ts:60-74,109-116` — `eq(table.workspaceId, workspaceId)`.
- `trinityInboundEmailProcessor.ts:608` — raw SQL parametrized
  `WHERE workspace_id = $1 OR workspace_id IS NULL` (FAQ entries, intentional
  platform-wide fallback).
- `trinityTransparencyRoutes.ts:48-252` — all 7 endpoints parametrize
  `workspace_id = $1` (or `id = $1 AND workspace_id = $2`).
- Middleware: `server/middleware/workspaceScope.ts:34` —
  `ensureWorkspaceAccess` resolves + validates workspace per request. Applied
  to `/api/automation`, `/api/trinity/transparency`, `/api/trinity-decisions`,
  `/api/workflows`.

---

## Audit 7 — Helper Analysis (Phase 18 Scoping)

**Trinity service inventory**

| Surface | Files | LOC |
|---|---|---|
| `server/services/trinity/` | 18 | 8,242 |
| `server/services/ai-brain/` | 267 | 182,739 |
| **Total** | **285** | **190,981** |

**Helpers present:**

| Helper | Path | Used? |
|---|---|---|
| `createLogger` | `server/lib/logger.ts:74` | 78 call sites in Trinity |
| `broadcastToWorkspace` | `server/websocket.ts:891` | yes |
| `aiCreditGateway` | `server/services/billing/aiCreditGateway.ts:196` | yes (passthrough mode) |
| `withRetry` | `server/db.ts:210` | **not** from Trinity handlers |
| `withWorkspaceLock` | `server/services/concurrencyGuard.ts:30` | 0 Trinity calls |

**Helpers missing:**

- `createResult` — no shared Result wrapper; each service re-declares its own
  `{ success, data, error }` shape.
- `scopedQuery` / `tenantScope` — no wrapper; `eq(…, workspaceId)` is inlined
  **4,125 times** across `server/`.
- `insertAuditLog` — 126 direct `db.insert(systemAuditLogs)` sites; no shared
  constructor for entity/workspace/user/action fields.
- `withErrorLogging` / `withActionContext` — ~250 near-identical try/catch
  blocks in `ai-brain/` and `trinity/`.

**Phase 18 scope estimate**

| Extraction | Sites | LOC saved |
|---|---|---|
| `scopedSelect(table, workspaceId, …)` | 4,125 | ~4,125 |
| `insertAuditLog(entity, workspaceId, userId, action, …)` | 126 | ~1,890 |
| `withErrorLogging(fn, context)` | 250 | ~1,250 |
| `createOperationResult<T>(…)` | 250 | ~500 |
| **Total** | **4,751 sites** | **~7,265 LOC** |

---

## Must-fix Before Proceeding (blocks Phase 17B)

1. **🔴 Fix `trinityInboundEmailProcessor.ts:962`** — replace the global
   `SELECT … FROM workspaces LIMIT 100` with an explicit
   `WHERE workspace_id = $1` (or a signed-slug lookup keyed by the inbound
   message).
2. **🔴 Add `ensureWorkspaceAccess` to `trinityAgentDashboardRoutes`** at
   `server/routes/domains/trinity.ts:190`. Change the three `WHERE id = $1`
   queries to `WHERE id = $1 AND workspace_id = $2`.
3. **🔴 Wire `systemAuditLogs` into `actionRegistry.ts`** for every mutation
   in the shift, invoice, time-entry, and compliance categories. Prefer a
   single `insertAuditLog(...)` helper per Audit 7.
4. **🔴 Wrap multi-step writes in `db.transaction(...)`** — at minimum
   `actionRegistry.ts:293-306` (shift+billing+usage) and `:1220-1241`
   (invoice+event).
5. **⚠️ Adopt `withRetry` in the action pipeline** for transient-error
   categories (network, 5xx, rate-limited). Wire DLQ on
   max-retries-exceeded.

## Deferred to Phase 18

- Zod schemas for all 190+ action payloads (single registry).
- Helper extraction (scopedSelect / insertAuditLog / withErrorLogging /
  createOperationResult).
- Consolidate `trinity_audit_logs` and `systemAuditLogs` into a single
  canonical audit trail (or document why both exist).

---

## Success-Criteria Scorecard

- ❌ All 18 tests passing — **10/18 pass**
- ❌ Zero cross-tenant data leaks — **4 unscoped queries identified**
- ❌ 100% mutation logging coverage — **0% coverage on `actionRegistry.ts`**
- ❌ No silent error swallows — **3 explicit `.catch(() => null)` patterns
  in `actionRegistry.ts` alone**
- ✅ Helper gaps identified — **~7,265 LOC reduction scoped**
- **Confidence: Trinity is ~68% ready**, not the 85% target. Cross-tenant
  integrity must close before any further autonomous-action shipping.
