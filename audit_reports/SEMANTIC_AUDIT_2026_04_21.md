# Semantic Verification Audit — Post-Merge Run
**Date:** 2026-04-21
**Branch:** `claude/continue-audit-plan-1V3hH`
**HEAD:** 54fa209 (Merge PR #153 — platform-audit-run-2)
**Method:** Static inspection of server routes, storage layer, services, and schema.

Legend: ✅ PASS · ❌ FAIL · ⚠️ PARTIAL

---

## Section 1 — Employee / Contractor Lifecycle

| # | Item | Status | Evidence |
|---|---|---|---|
| 1.1 | Adding an Employee | ⚠️ | Route + seat check wired; **employee_number NOT generated on direct POST**; client form missing isArmed / guard card / hire date inputs |
| 1.2 | Editing an Employee | ⚠️ | Routes exist; **`/me/contact-info` allows email edits (should block)**; phone does not sync to `users.phone` from `/me/contact-info` |
| 1.3 | Contractor vs W2 | ⚠️ | `payType=contractor` correctly sets `workerType` + `is1099Eligible`; QB vendor routing + payroll exclusion + 1099-NEC year-end not verified |
| 1.4 | Armed vs Unarmed | ⚠️ | Fields persisted; **no shift-creation validation that armed shifts require `isArmed=true`**; no guard-card-expiry alert |
| 1.5 | Manager Assignment | ✅ | `POST /api/manager-assignments` creates row; my-team reads from table |
| 1.6 | Deactivating (CRITICAL) | ❌ | `/access` sets `isActive=false` but **does NOT invalidate sessions** or set `documentAccessExpiresAt` — deactivated user retains active session + bypasses terminatedEmployeeGuard |
| 1.7 | Termination | ✅ | Full offboarding wired: shifts cleared, sessions killed, grace period set, equipment checklist generated |
| 1.8 | Multi-tenant Re-join | ❌ | `POST /api/auth/login` does not check per-workspace `is_active`; deactivated user in workspace A can still authenticate and switch into workspace B (intended) **but can also still access workspace A** because `terminatedEmployeeGuard` only blocks when `documentAccessExpiresAt` is set |

### Findings with file:line

- `server/routes/employeeRoutes.ts:773` (POST /) — passes `validatedData` directly to `storage.createEmployee` without computing `employeeNumber`. `genEmployeeExternalId` and `storage.generateEmployeeNumber` exist but are only used in `publicOnboardingRoutes.ts:97` and `onboardingInlineRoutes.ts:355`.
- `server/routes/employeeRoutes.ts:1399` — `allowedFields` on `/me/contact-info` includes `'email'`. Should exclude email.
- `server/routes/employeeRoutes.ts:1413` — `storage.updateEmployee` only writes `employees`; no `users.phone` mirror.
- `server/routes/employeeRoutes.ts:424–645` — `/access` handler: no `db.delete(sessions)`, no `documentAccessExpiresAt` set when `isActive=false`.
- `server/routes/terminationRoutes.ts:182–201` — correct session invalidation (baseline for what `/access` should do).
- `server/middleware/terminatedEmployeeGuard.ts:97–101` — fail-open when `documentAccessExpiresAt` is NULL ("legacy termination") allows deactivated-without-termination users through.
- `server/auth.ts:513` (`requireAuth`) — no `employees.isActive` check.
- `server/routes/authCoreRoutes.ts:350` (login) — no per-workspace `is_active` check.

---

## Section 2 — Document & Template Pipeline

| # | Item | Status | Evidence |
|---|---|---|---|
| 2.1 | Doc assignment to employees | ⚠️ | `signerRole/Name/Email` persisted; unique access token created; **`canSignerSign` does not bind token to signer email** — token holder can sign as any listed signer; employee's manager not notified on completion; doc lands in `orgDocuments` (client_contract) rather than per-employee file cabinet |
| 2.2 | Doc assignment to clients | ⚠️ | Public portal tokens accept unauthenticated sign; **QB customer ensured on execute, but invoice NOT auto-created**; doc visible via portal |
| 2.3 | Template categories | ❌ | Category filter exists but **no predefined types** (Employment Agreement, 1099 Agreement, Offer Letter, NDA, Client Service Agreement, Post Order, I-9); no I-9 → compliance state machine |

### Findings
- `server/routes/contractPipelineRoutes.ts:459–483` / `contractPipelineService.ts:1332–1366` — signer persistence OK.
- `server/services/contracts/contractPipelineService.ts:1212` — `validateAccessToken` checks expiry/revocation but not signer email.
- `server/services/contracts/contractPipelineService.ts:1372–1380` — `canSignerSign` returns true when `signerEmail not in list` (gap).
- `server/services/contracts/contractPipelineService.ts:1035–1055` — executed PDF to GCS (OK).
- `server/services/contracts/contractPipelineService.ts:1119–1137` — `ensureQuickBooksRecord('customer', …)` but no `createInvoice` call.

---

## Section 3 — Settings Persistence

| # | Item | Status | Evidence |
|---|---|---|---|
| 3.1 | Org code → email provisioning | ✅ | `PUT /api/workspace/org-code` updates `orgCode`, sets `orgCodeStatus=active`, calls `emailProvisioningService.provisionWorkspaceAddresses` (6 addresses) |
| 3.2 | Forwarding email saved | ⚠️ | Field saves via `workspaceInlineRoutes.ts:612`; inbound handler loads `inbound_email_forward_to` but actual forward-copy emission not observed in handler path |
| 3.3 | PIN set & verify | ✅ | `/me/pin/set` bcrypts + persists; `/pin/verify` uses constant-time `bcrypt.compare` |
| 3.4 | Phone sync both tables | ⚠️ | `PATCH /api/auth/profile` (authRoutes.ts:294–338) syncs both (shipped f48621c); **`PATCH /api/employees/me/contact-info` only writes employees** |

### Findings
- `server/routes/workspace.ts:561–640` — `PUT /org-code` + provisioning (PASS).
- `server/routes/workspaceInlineRoutes.ts:612` — `inboundEmailForwardTo` field mapped to DB column.
- `server/routes/inboundEmailRoutes.ts:601–604` — reads `inbound_email_forward_to` into `forwardTo` variable; actual copy-forward emission not traced.
- `server/routes/clockinPinRoutes.ts:218–255` — self-service PIN set OK.
- `server/routes/authRoutes.ts:294–338` — phone sync both ways.
- `server/routes/employeeRoutes.ts:1387–1424` — `/me/contact-info` does not mirror phone to `users.phone`.

---

## Section 4 — Access Control Matrix

| Action | Expected gate | Actual | Status |
|---|---|---|---|
| Add employee | manager+ | **No role guard on POST /api/employees** | ❌ |
| Edit own profile | all | `/:id` permits self-edit with financial guard | ✅ |
| Edit others' profile | manager+ | `canEditEmployeeByPosition` enforces authority | ✅ |
| Set armed/unarmed | manager+ | Falls under `/:id` position authority — no explicit isArmed guard | ⚠️ |
| Deactivate employee | owner + authority | `/access` checks `hasOwnerAccess` + `canEditEmployeeByPosition` | ✅ |
| Set org code | owner only | `org-code/claim` allows manager+ (too broad) | ⚠️ |
| Assign manager | manager+ | `requireOwner` enforced — stricter than spec (blocks managers) | ⚠️ |
| Send document | manager+ | **No role guard on POST /api/contracts/:id/send** | ❌ |
| View own pay stubs | all | `inArray(employeeId, ownEmployees)` | ✅ |
| View others' pay | owner/manager | `checkManagerRole` enforced | ✅ |

### Findings
- `server/routes/domains/workforce.ts:61` — POST employees mount uses `requireAuth + ensureWorkspaceAccess` only; no manager guard.
- `server/routes/workspace.ts:437` (`org-code/claim`) — allows `['org_owner','co_owner','org_admin','manager']`; spec says owner only.
- `server/routes/hrInlineRoutes.ts:96` — POST `/manager-assignments` wrapped in `requireOwner` (spec wanted manager+).
- `server/routes/domains/clients.ts:23` — contract pipeline mount uses `requireAuth + ensureWorkspaceAccess` only; `POST /:id/send` has no inline role check (`contractPipelineRoutes.ts:326`).

---

## Section 5 — End-to-End Flows

### Flow A — New Officer → First Shift (9 PASS · 2 FAIL · 1 PARTIAL)
- Steps 1, 2, 6, 7, 8, 9, 12 — ✅
- Step 3 (token → account creation on invite accept) — ⚠️ weak wiring
- Step 4 (I-9 upload → compliance tracking) — ❌ no trigger
- Step 5 (guard card upload → manager verifies) — ❌ no verification route
- Step 10 (clock-in → lone worker activation) — ⚠️ service exists, not auto-activated
- Step 11 (DAR review) — ⚠️ uses time-entry approval instead of dedicated DAR

### Flow B — Calloff → Coverage (5 PASS · 2 PARTIAL)
- Steps 1, 2, 4, 5, 6 — ✅
- Step 3 (proximity matching) — ⚠️ cert/availability present; proximity unclear
- Step 7 (SLA escalation to owner) — ⚠️ no timer/handler found

### Flow C — Client Contract → Invoicing (1 PASS · 4 PARTIAL)
- Step 1 — ✅
- Step 2 (invoice auto-creation on execute) — ⚠️ only customer ensured, no invoice
- Step 3 (Stripe invoice send) — ⚠️ no trigger from contract execution
- Step 4 (payment → QB sync) — ⚠️ weak coupling
- Step 5 (60+ day overdue reminder) — ⚠️ service exists, no threshold rule wired

---

## Critical Blockers for Statewide Go-Live

| # | Severity | Summary |
|---|---|---|
| S1 | 🔴 Critical | Deactivation via `/access` leaves active sessions valid and bypasses terminatedEmployeeGuard |
| S2 | 🔴 Critical | POST /api/employees from manager UI skips `employee_number` generation (orphan IDs) |
| S3 | 🔴 Critical | `/me/contact-info` allows unverified email changes (account takeover vector) |
| S4 | 🟠 High | Login does not consult per-workspace `is_active`; stale sessions persist cross-workspace |
| S5 | 🟠 High | POST /api/employees has no manager+ gate |
| S6 | 🟠 High | POST /api/contracts/:id/send has no manager+ gate |
| S7 | 🟠 High | Contract-token sign does not bind to signer email |
| S8 | 🟠 High | Armed shift scheduling does not validate `isArmed` on assignee |
| S9 | 🟡 Medium | Contract execution does not auto-create QB invoice |
| S10 | 🟡 Medium | I-9 upload + guard card verification not wired to compliance state |
| S11 | 🟡 Medium | `/me/contact-info` phone does not sync to `users.phone` |
| S12 | 🟡 Medium | org-code/claim too permissive; manager-assignments too restrictive |
| S13 | 🟡 Medium | Lone worker not auto-activated on clock-in |
| S14 | 🟡 Medium | Calloff SLA escalation timer missing |

Still outstanding from prior audit table:
- **Phase B:** 58 route files without transactions (D04)
- **Trespass registry** not written (D20)
- **CAD routes** 0 handlers (D21)
- **Armory** no workspace scoping (D24)
- **Thalamic log bypass** (D01)

---

## Fix Phase Prompts (post-merge)

### Phase S1 — Deactivation session invalidation
```
In server/routes/employeeRoutes.ts handler `PATCH /:employeeId/access`:
When transitioning to isActive=false, after the db.transaction commit, run the
same session invalidation block as terminationRoutes.ts:183–201:
  await db.delete(sessions).where(eq(sessions.userId, targetEmployee.userId))
Also set a bounded `documentAccessExpiresAt` (e.g., now + 14d) so
terminatedEmployeeGuard enforces grace-period restrictions instead of falling
into its legacy fail-open branch.
Test: PATCH /access isActive=false → prior session 401s on next request.
```

### Phase S2 — employee_number generation in POST
```
In server/routes/employeeRoutes.ts:885 transaction, before storage.createEmployee:
  const employeeNumber = await storage.generateEmployeeNumber(workspaceId)
  validatedData.employeeNumber = employeeNumber
Keep the onboarding-accept pathways as-is; this closes the direct-create gap.
```

### Phase S3 — Block email self-edit on /me/contact-info
```
server/routes/employeeRoutes.ts:1399 — remove 'email' from allowedFields.
Require email changes to go through the verified email-change flow
(POST /api/auth/email-change-request + /confirm).
Add explicit 403 if req.body.email present with guidance message.
```

### Phase S4 — Login per-workspace is_active check
```
In server/routes/authCoreRoutes.ts POST /api/auth/login after user validation:
  Resolve the target workspace (user.currentWorkspaceId).
  Look up employees row; if is_active === false AND documentAccessExpiresAt
  is past (or null and termination flag set) → 403 suspended_in_workspace.
Multi-tenant: when switching workspace in workspaceInlineRoutes:113, check
same condition and 403 if suspended in target workspace.
```

### Phase S5/S6 — Role guards on create-employee + contract-send
```
server/routes/domains/workforce.ts:61 — add requireWorkspaceRole(['manager','owner','co_owner']) to POST /api/employees mount.
server/routes/domains/clients.ts:23 — add requireManager guard to POST /:id/send on contract pipeline router.
```

### Phase S7 — Bind contract access token to signer email
```
server/services/contracts/contractPipelineService.ts validateAccessToken:
  Persist recipientEmail on clientContractAccessTokens (already stored).
  In canSignerSign: require tokenRecipientEmail === signerEmail (case-insensitive).
  Reject (403) if mismatch.
```

### Phase S8 — Armed shift validation
```
In shiftRoutes.ts POST /api/shifts, if shift.requiresArmed === true:
  Look up assignee: if !employee.isArmed || !employee.armedLicenseVerified →
    400 armed_assignment_unqualified.
Also add guard-card-expiry cron in complianceAlertService:
  SELECT employees WHERE guard_card_expiry_date < now() + 30d AND guard_card_verified=true
  → insert compliance alert + notify manager.
```

### Phase S9 — Auto-create QB invoice on contract execution
```
contractPipelineService.ts:1119 after ensureQuickBooksRecord customer:
  If contract has lineItems + totalAmount → call invoiceService.createFromContract(contractId)
  which posts to QB and emails the client via existing invoice delivery service.
```

### Phase S10 — I-9 + guard card verification wiring
```
On I-9 upload (documentRequestRoutes I-9 variant):
  After file saved, UPDATE employees SET i9_on_file = true WHERE id = :id
  Emit Trinity event 'i9_submitted' and enqueue compliance tracking row.
On guard card upload (employeeDocumentRoutes guard_card):
  Add PATCH /api/employees/:id/guard-card/verify (manager+ only) that sets
  guardCardVerified = true + guard_card_verified_by + guard_card_verified_at.
```

### Phase S11 — /me/contact-info phone sync to users
```
employeeRoutes.ts PATCH /me/contact-info after updateEmployee:
  if employee.userId && filteredData.phone:
    await storage.updateUser(employee.userId, { phone: filteredData.phone })
```

### Phase S12 — Role matrix corrections
```
workspace.ts:437 org-code/claim:
  allowedRoles = ['org_owner','co_owner'] (OWNER_ROLES only).
hrInlineRoutes.ts:96 POST /manager-assignments:
  Swap requireOwner → requireManager.
```

### Phase S13 — Lone worker auto-activation on clock-in
```
In timeEntryRoutes.ts POST /clock-in after successful insert:
  if employee.worksAlone || shift.site.requiresLoneWorker:
    loneWorkerService.start({ employeeId, shiftId, gpsPoint, ttlMinutes })
On clock-out: loneWorkerService.stop(employeeId).
```

### Phase S14 — Calloff SLA escalation
```
Add coverageEscalationJob (5-min cron):
  SELECT shifts WHERE calloff_opened_at < now() - INTERVAL '1 hour'
    AND replacement_employee_id IS NULL AND escalation_sent=false
  → notify org_owner + manager; set escalation_sent=true
Add SLA minutes to org settings, default 60.
```

---

## Post-Merge Gate Decision

**Not go-live ready for Statewide.** Four items (S1, S2, S3, S4) are blockers
for production identity + session integrity. S5–S7 are high-risk for data
tampering. Recommend fixing S1–S7 in a single hardening sprint before enabling
live operations, then scheduling S8–S14 + the outstanding audit table items
(Phase B transactions, trespass/CAD/armory/Thalamic gaps).
