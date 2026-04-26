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

---

## ✅ hrInlineRoutes.ts — DONE
1,795 → 1,312 lines (-483L). 17 handlers deleted. 13 critical routes intact.

---

## hrisRoutes.ts — 248L | mount: `/api/hris`
**2 alive / 6 dead → delete 6**

| Status | Method | Path |
|---|---|---|
| DELETE | GET | `/employees` |
| ALIVE(3) | GET | `/providers` |
| ALIVE(7) | GET | `/connections` |
| DELETE | GET | `/auth/:provider` |
| DELETE | GET | `/callback/:provider` |
| DELETE | POST | `/sync/:provider` |
| DELETE | DELETE | `/disconnect/:provider` |
| DELETE | GET | `/sync-status/:provider` |

---

## hiringRoutes.ts — 416L | mount: `/api/hiring`
**3 alive / 8 dead → delete 8**

| Status | Method | Path |
|---|---|---|
| ALIVE(7) | GET | `/pipeline` |
| DELETE | GET | `/applicants/:id` |
| DELETE | PATCH | `/applicants/:id/stage` |
| DELETE | POST | `/applicants/:id/verify-license` |
| DELETE | POST | `/applicants/:id/score-interview` |
| DELETE | POST | `/applicants/:id/assess` |
| DELETE | GET | `/question-sets` |
| DELETE | GET | `/sessions/:id` |
| DELETE | POST | `/postings/:id/draft-approve` |
| ALIVE(1) | GET | `/training-pipeline` |
| ALIVE(1) | POST | `/seed` |

---

## onboardingRoutes.ts — 819L | mount: `/api/sps/onboarding`
Uses different router pattern — `grep -n "router\." server/routes/onboardingRoutes.ts` then audit each path against `/api/sps/onboarding/PATH`

## offboardingRoutes.ts — 235L | find mount: `grep -n "offboard" server/routes/domains/workforce.ts`
## terminationRoutes.ts — 572L | find mount: `grep -n "termination" server/routes/domains/workforce.ts`
## performanceRoutes.ts — 754L | mount: `/api/performance-notes`
## trainingRoutes.ts — 1,290L | mount: `/api/training-compliance` — 26 handlers, run full audit
## benefitRoutes.ts — 113L | mount: `/api/benefits` — small, run audit


---

# CLIENT DOMAIN

## clientRoutes.ts — 1,605L | mount: `/api/clients` | 16 alive / 12 dead

| Status | Method | Path | Caller |
|---|---|---|---|
| ALIVE(45) | GET | `/` | pages/clients.tsx |
| ALIVE(10) | GET | `/lookup` | components/client-search.tsx |
| ALIVE(45) | POST | `/` | pages/clients.tsx |
| ALIVE(4) | PATCH | `/:id` | components/client-edit.tsx |
| ALIVE(5) | GET | `/deactivated` | pages/clients.tsx |
| ALIVE(1) | POST | `/:id/deactivate` | components/client-actions.tsx |
| ALIVE(1) | POST | `/:id/reactivate` | components/client-actions.tsx |
| **DELETE** | POST | `/:id/collections/start` | — |
| **DELETE** | POST | `/:id/collections/decline` | — |
| **DELETE** | POST | `/:id/collections/resolve` | — |
| **DELETE** | POST | `/:id/collections/write-off` | — |
| **DELETE** | GET | `/:id/collections/log` | — |
| ALIVE(4) | DELETE | `/:id` | pages/clients.tsx |
| **DELETE** | GET | `/:clientId/payments` | — |
| ALIVE(1) | POST | `/dockchat/start` | components/dockchat.tsx |
| ALIVE(1) | POST | `/dockchat/message` | components/dockchat.tsx |
| ALIVE(1) | POST | `/dockchat/close` | components/dockchat.tsx |
| ALIVE(3) | GET | `/dockchat/reports` | components/dockchat.tsx |
| **DELETE** | GET | `/dockchat/reports/:reportId` | — |
| **DELETE** | POST | `/dockchat/reports/:reportId/acknowledge` | — |
| **DELETE** | POST | `/dockchat/reports/:reportId/resolve` | — |
| ALIVE(1) | GET | `/my-communications` | pages/client-comms.tsx |
| ALIVE(1) | POST | `/contract-renewal-request` | components/renewal.tsx |
| ALIVE(2) | POST | `/coi-request` | components/coi.tsx |
| **DELETE** | GET | `/:clientId/coverage-schedule` | — |
| **DELETE** | PATCH | `/:clientId/coverage-schedule` | — |
| **DELETE** | GET | `/:id/export` | — |
| ALIVE(1) | GET | `/my-portal-token` | components/portal.tsx |

**Jack: delete 12 handlers from clientRoutes.ts**

---

## contractPipelineRoutes.ts — 787L | mount: `/api/contracts` | 5 alive / 20 dead

| Status | Method | Path | Caller |
|---|---|---|---|
| **DELETE** | GET | `/templates` | — |
| **DELETE** | POST | `/templates` | — |
| **DELETE** | GET | `/templates/:id` | — |
| **DELETE** | PATCH | `/templates/:id` | — |
| **DELETE** | DELETE | `/templates/:id` | — |
| ALIVE(17) | GET | `/` | pages/contracts.tsx |
| ALIVE(17) | POST | `/` | pages/contracts.tsx |
| **DELETE** | GET | `/usage` | — |
| **DELETE** | GET | `/access` | — |
| ALIVE(2) | GET | `/stats` | components/contract-stats.tsx |
| ALIVE(1) | GET | `/:id` | pages/contract-detail.tsx |
| ALIVE(1) | PATCH | `/:id` | pages/contract-detail.tsx |
| **DELETE** | POST | `/:id/send` | — |
| **DELETE** | POST | `/:id/accept` | — |
| **DELETE** | POST | `/:id/request-changes` | — |
| **DELETE** | POST | `/:id/decline` | — |
| **DELETE** | GET | `/:id/signatures` | — |
| **DELETE** | POST | `/:id/sign` | — |
| **DELETE** | POST | `/:id/signers` | — |
| **DELETE** | GET | `/:id/signers` | — |
| **DELETE** | POST | `/:id/remind` | — |
| **DELETE** | PATCH | `/:id/signers/reorder` | — |
| **DELETE** | GET | `/:id/audit` | — |
| **DELETE** | GET | `/:id/evidence` | — |
| **DELETE** | GET | `/:id/verify` | — |

**Jack: delete 20 handlers from contractPipelineRoutes.ts**

---

## proposalRoutes.ts — 237L | mount: `/api/proposals` | 3 alive / 6 dead

| Status | Method | Path | Caller |
|---|---|---|---|
| ALIVE(2) | GET | `/templates` | components/proposal-templates.tsx |
| **DELETE** | GET | `/templates/:id` | — |
| ALIVE(5) | GET | `/` | pages/proposals.tsx |
| **DELETE** | GET | `/:id` | — |
| ALIVE(5) | POST | `/` | pages/proposals.tsx |
| **DELETE** | PATCH | `/:id` | — |
| **DELETE** | PATCH | `/:id/status` | — |
| **DELETE** | DELETE | `/:id` | — |
| **DELETE** | POST | `/:id/generate-pdf` | — |

**Jack: delete 6 handlers from proposalRoutes.ts**

---

## salesRoutes.ts — 393L
Find route pattern + mount: `grep -n "router\." server/routes/salesRoutes.ts | head -5` then `grep -n "salesRouter" server/routes/domains/sales.ts`

