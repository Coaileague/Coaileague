# COAILEAGUE DEEP ROUTE INDEX
*Jack: read this — never open a route file to audit it. Every route is pre-audited.*
*Updated: 2026-04-25*

**Workflow:** Read section → copy every DELETE row into your handoff → Claude deletes in one pass → done

---

# HOW TO USE THIS AS JACK

Each file section shows every handler with **ALIVE** or **DELETE** status.
- **ALIVE** = has frontend/server callers — keep it
- **DELETE** = zero callers found — safe to remove
- Caller count and first caller file shown for ALIVE routes

Your handoff only needs:
1. File name
2. List of DELETE paths
3. Claude does the rest

---

# HR DOMAIN

## ✅ employeeRoutes.ts — DONE
2,452 → 1,541 lines (-911L). 13 active handlers remain.

---

## hrInlineRoutes.ts — 1,795L | mount: `/api`

**13 alive / 17 dead → delete 17**

| Status | Method | Path | Caller |
|---|---|---|---|
| ALIVE(4) | GET | `/i9-records` | hr/I9Dashboard.tsx |
| ALIVE(3) | GET | `/i9-records/expiring` | hr/I9Dashboard.tsx |
| DELETE | GET | `/i9-records/:employeeId` | — |
| ALIVE(8) | POST | `/manager-assignments` | org/ManagerAssignDialog.tsx |
| DELETE | GET | `/manager-assignments/manager/:managerId` | — |
| DELETE | GET | `/manager-assignments/employee/:employeeId` | — |
| DELETE | DELETE | `/manager-assignments/:id` | — |
| ALIVE(5) | GET | `/organizations/managed` | pages/org-dashboard.tsx |
| DELETE | PATCH | `/organizations/:orgId/status` | — |
| DELETE | GET | `/organizations/:orgId/members` | — |
| ALIVE(1) | GET | `/employee/audit-record` | employee/AuditRecord.tsx |
| DELETE | GET | `/employee/disputeable-items` | — |
| DELETE | GET | `/employee-reputation/:employeeId` | — |
| ALIVE(1) | POST | `/invites/create` | onboarding/InviteFlow.tsx |
| ALIVE(1) | POST | `/invites/accept` | pages/accept-invite.tsx |
| ALIVE(3) | GET | `/invites` | pages/team-management.tsx |
| DELETE | DELETE | `/invites/:id` | — |
| DELETE | GET | `/hr/pto-balances` | — |
| DELETE | GET | `/hr/pto-balances/:employeeId` | — |
| ALIVE(1) | POST | `/hr/pto-accrual/run` | hr/PtoAccrual.tsx |
| DELETE | GET | `/hr/review-reminders/summary` | — |
| DELETE | GET | `/hr/review-reminders/overdue` | — |
| DELETE | GET | `/hr/review-reminders/upcoming` | — |
| DELETE | POST | `/organization-onboarding/start` | — |
| DELETE | PUT | `/organization-onboarding/:id` | — |
| DELETE | POST | `/organization-onboarding/:id/complete` | — |
| ALIVE(3) | GET | `/organization-onboarding/status` | pages/onboarding.tsx |
| ALIVE(3) | GET | `/experience/notification-preferences` | settings/Notifications.tsx |
| ALIVE(3) | POST | `/experience/notification-preferences` | settings/Notifications.tsx |
| ALIVE(1) | GET | `/manager/command-center` | pages/manager-dashboard.tsx |
| ALIVE(3) | GET | `/shift-actions/pending` | approvals/PendingApprovals.tsx |

**Jack's handoff: delete these 17 paths from hrInlineRoutes.ts**

---

## hrisRoutes.ts — run local audit
Mount: `/api/hris` — `grep -n "router\." server/routes/hrisRoutes.ts | grep -E "get|post|put|patch|delete"`
Then: `grep -rn "/api/hris/PATH" client/ server/ | grep -v hrisRoutes.ts`

## hiringRoutes.ts — run local audit
Mount: `/api/hiring`

## onboardingRoutes.ts — run local audit
Mount: `/api/onboarding`

## offboardingRoutes.ts — run local audit
Mount: `/api/offboarding`

## terminationRoutes.ts — run local audit
Mount: `/api/terminations`

## performanceRoutes.ts — run local audit
Mount: `/api/performance`

## trainingRoutes.ts — run local audit
Mount: `/api/training`

## benefitRoutes.ts — run local audit
Mount: `/api/benefits`

---

# CLIENT DOMAIN

## clientRoutes.ts — 1,604L | mount: `/api/clients`

Run caller audit: `grep -n "router\." server/routes/clientRoutes.ts | grep -E "get|post|put|patch|delete"`
Then per path: `grep -rn "/api/clients/PATH" client/ server/ | grep -v clientRoutes.ts`

Known alive (confirmed): `GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`

## contractPipelineRoutes.ts — 786L | mount: `/api/contracts`
## proposalRoutes.ts — 236L | mount: `/api/proposals`
## rfpPipelineRoutes.ts — find mount: `grep -n "rfpPipeline" server/routes/domains/sales.ts`
## salesRoutes.ts — find mount: `grep -n "salesRouter" server/routes/domains/sales.ts`

---

# COMPLIANCE DOMAIN

## complianceRoutes.ts — 1,823L | mount: `/api/security-compliance` | 51 handlers
Large file — batch audit by group:
`grep -n "router\." server/routes/complianceRoutes.ts | grep -E "get|post" | head -20`

## licenseRoutes.ts — find mount: `grep -n "licenseRouter" server/routes/domains/compliance.ts`

---

# OPS DOMAIN

## incidentPipelineRoutes.ts — 402L | mount: `/api/incident-reports`
Uses `incidentPipelineRouter` — routes: `grep -n "incidentPipelineRouter\." server/routes/incidentPipelineRoutes.ts`

## cadRoutes.ts — 589L | mount: `/api/cad`
Uses `cadRouter` — routes: `grep -n "cadRouter\." server/routes/cadRoutes.ts`

## postOrderRoutes.ts — find mount: `grep -n "postOrder" server/routes/domains/ops.ts`
## gpsRoutes.ts — find mount: `grep -n "gpsRouter" server/routes/domains/ops.ts`

---

# BLOAT / HIGH VALUE TARGETS

## miscRoutes.ts — 2,776L | HIGH PRIORITY
Catch-all graveyard. Expected 60%+ dead. Strategy:
1. List: `grep -n "router\." server/routes/miscRoutes.ts | grep -E "get|post|put|patch|delete"`
2. Audit each path against `client/ server/`
3. Anything with zero callers → delete

## devRoutes.ts — 2,458L | STRIP FROM PRODUCTION
These routes should never run in production.
Option A: Add guard at top of file — `if (process.env.NODE_ENV === 'production') return;`
Option B: Delete the file entirely (preferred)
Confirm no production-critical routes hiding here first.

---

# ALREADY COMPLETED

| Domain | Removed |
|---|---|
| Payroll | -1,686L |
| Billing | -2,577L |
| Scheduling | -3,757L |
| Time | -1,621L |
| HR partial | -911L |
| **TOTAL** | **~10,552L** |

---

# CANONICAL SERVICES — ALWAYS USE THESE

| Operation | Import |
|---|---|
| Invoice CRUD | `import { invoiceService } from '../services/billing/invoice';` |
| Storage/DB abstraction | `import { storage } from '../storage';` |
| Event bus | `import { platformEventBus } from '../services/platformEventBus';` |
| Websocket broadcast | `import { broadcastToWorkspace } from '../websocket';` |
| Notifications | `import { universalNotificationEngine } from '../services/universalNotificationEngine';` |
| Audit log | `storage.createAuditLog({ workspaceId, userId, ... })` |
| Tier check | `import { getWorkspaceTier, hasTierAccess } from '../tierGuards';` |
| Billing gate | `import { requireBillingFeature } from '../middleware/billingEnforcement';` |
| Financial math | `import { calculateNetPay, addFinancialValues } from '../services/financialCalculator';` |

---

# JACK'S COMMIT TEMPLATE

```
refactor: FILENAME.ts -XL — N dead routes deleted

Dead routes deleted (N):
  METHOD /path (NL)
  ...

Active routes preserved (N):
  METHOD /path

FILENAME.ts: BEFORE → AFTER lines (-DIFF)
Build: TBD (Claude verifies)
```
