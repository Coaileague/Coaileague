# CoAIleague — RBAC Matrix
# Role-Based Access Control · Single Source of Truth

> **Source:** `shared/lib/rbac/roleDefinitions.ts` + `server/rbac.ts`
> **Canonical import:** `import { WorkspaceRole } from '@shared/lib/rbac/roleDefinitions'`
> **Rule:** All workspace queries MUST include `workspace_id` scope.
>           Cross-tenant data access is `OrgIsolationError` → 403 FORBIDDEN.

---

## THE TWO ROLE PLANES

CoAIleague has two independent role planes that operate simultaneously:

```
PLATFORM PLANE (cross-tenant, CoAIleague staff + AI agents)
  root_admin (7) → deputy_admin (6) → sysop (5) → support_manager (4)
  → support_agent (3) → Trinity/system (4.5) → SARGE/helpai (2.5)
  → compliance_officer (2) → Bot (2.5)

WORKSPACE PLANE (tenant-scoped, your org only)
  org_owner (7) → co_owner (6) → org_admin (5) → org_manager (4)
  → manager (4) → department_manager (4) → supervisor (3)
  → employee (2) → staff (2) → auditor (1.5) → contractor (1) → client (0.5)
```

Platform roles with `PLATFORM_WIDE_ROLES` bypass workspace role checks
(root_admin, sysop, Trinity, SARGE — they can act across tenants).

---

## WORKSPACE ROLE HIERARCHY

| Numeric | Role | Description |
|---|---|---|
| 7 | `org_owner` | Full tenant control — owns billing, users, all data |
| 6 | `co_owner` | Deputy owner — full ops, no destructive platform ops |
| 5 | `org_admin` | Office administrator — manages users, not billing |
| 4 | `org_manager` | Org-wide manager |
| 4 | `manager` | Operations/shift manager |
| 4 | `department_manager` | Department-level manager |
| 3 | `supervisor` | Shift supervisor |
| 2 | `employee` | Security officer / field worker |
| 2 | `staff` | General staff (alias for employee) |
| 1.5 | `auditor` | Regulatory auditor — read-only compliance |
| 1 | `contractor` | Contract worker — limited access |
| 0.5 | `client` | Client org — own data only, no workspace membership |

---

## ROLE GUARD MIDDLEWARE MAP

| Middleware | Allows | Blocks |
|---|---|---|
| `requireOwner` | org_owner, co_owner | everyone else |
| `requireFinanceRole` | org_owner, co_owner | everyone else |
| `requireAdmin` | org_owner, co_owner, org_admin | below org_admin |
| `requireManager` | org_owner → supervisor (all ≥3) | employee, staff, auditor, contractor, client |
| `requireSupervisor` | same as requireManager | same as requireManager |
| `requireHRManager` | same as requireManager | same as requireManager |
| `requireEmployee` | org_owner → employee/staff | auditor, contractor, client |
| `requireAuditor` | org_owner → manager + auditor role | employee, staff, contractor, client |
| `requireContractor` | org_owner → contractor | auditor, client |
| `requireLeader` | same as requireManager | same as requireManager |

---

## PERMISSION MATRIX BY ROLE

### FIELD OFFICER (employee / staff / contractor)

**CAN READ:**
- Own schedule, own shifts, own time entries
- Own pay stubs (GET /api/payroll/pay-stubs — own records only)
- Own guard card status, own profile
- Post orders for shifts assigned to them
- Shift room ChatDock (own rooms)
- Own patrol scan history

**CAN WRITE:**
- Clock in/out on own shifts
- Submit own time entry corrections (pending approval)
- Report calloff via SARGE/SMS/voice
- Acknowledge shift via ChatDock
- Complete patrol checkpoint scans

**CANNOT:**
- View another officer's pay rate or pay stub
- View billing rates for any client
- Access payroll runs or period totals
- Approve/reject any request
- View other tenants' data (enforced at DB layer)
- Access billing or invoice endpoints
- Access DPS auditor portal (token-gated separately)

---

### SUPERVISOR (supervisor — level 3)

Everything employee can do, plus:

**CAN READ:**
- All shifts for their team
- Timesheet submissions for their officers
- Patrol coverage for assigned sites
- SARGE-delivered calloff alerts
- Compliance alerts for their team

**CAN WRITE:**
- Approve/reject timesheet entries for their officers
- Create shift swap offers
- Acknowledge compliance alerts
- Post to team channels in ChatDock

**CANNOT:**
- Access payroll runs or financial totals
- Modify billing rates
- View company-level billing dashboard
- Access Stripe billing management
- Approve payroll periods

---

### MANAGER (manager / department_manager / org_manager — level 4)

Everything supervisor can do, plus:

**CAN READ:**
- All scheduling data for workspace
- Schedule approval queue (`GET /api/schedule-approval/pending`)
- Pre-audit compliance report
- All employee records (not SSN/bank details)
- Invoices for their clients
- AI usage summary

**CAN WRITE:**
- Approve/reject AI-drafted schedules (`POST /api/schedule-approval/approve`)
- Create/modify shifts
- Generate verification links for officer licenses
- Create auditor portal links
- Trigger calloff coverage workflow
- Access `@Trinity` in ChatDock (`#trinity-command`)

**CANNOT:**
- Access payroll financial totals or run payroll
- Modify billing rates (read-only)
- Access Stripe subscription management
- Delete workspace data
- View cross-tenant data

---

### ORG_ADMIN (level 5)

Everything manager can do, plus:

**CAN READ:**
- Full employee list including sensitive HR fields (not financial)
- Compliance documents
- Training certifications

**CAN WRITE:**
- Manage workspace users (invite, deactivate)
- Configure notification preferences
- Manage room memberships
- Complete onboarding checklist steps

**CANNOT:**
- Access billing or Stripe (requireFinanceRole = owner only)
- Approve payroll periods
- Delete workspace or transfer ownership

---

### ORG_OWNER / CO_OWNER (levels 7 and 6)

**Full workspace control:**
- All billing: Stripe, subscription, addon management
- Run and approve payroll periods
- Set overage limits and spend caps
- View all financial data including pay rates and billing rates
- Delete employees, clients, data
- Transfer workspace ownership (org_owner only)
- Set up Plaid ACH direct deposit
- Generate DPS audit packets
- All features from every lower role

**CO_OWNER difference from ORG_OWNER:**
- Cannot delete the workspace itself
- Cannot remove org_owner role from another user
- Otherwise equivalent

---

### AUDITOR (level 1.5)

**READ-ONLY compliance access:**
- Compliance documents for their assigned workspace
- Guard card records (no financial data)
- Shift logs for audit purposes
- DPS auditor portal (via token link — no login required)
- Use of Force reports

**CANNOT write anything.** Auditor is read-only by design.
Route: `requireAuditor` allows org_owner through manager + auditor role.

---

### CLIENT (level 0.5)

**View own data only:**
- Their own invoices and service history
- Shifts scheduled for their site
- Incident reports for their site
- Client portal: `/client-portal/*` routes only
- Cannot access any other workspace data
- Cannot access employee records, pay rates, billing management

Client isolation: `client_portal_invite_tokens` gate — JWT scoped to clientId.
Every query in client portal routes adds `AND client_id = $clientId`.

---

## AI AGENT RBAC

### TRINITY (platform role: `system` / `trinity-brain` — level 4.5)

**WITHIN a workspace:** Operates at `org_owner` level (level 7 effective).
Trinity has full access to workspace data when acting on behalf of a tenant.

**ABSOLUTE RESTRICTIONS — Trinity CANNOT:**
1. **Bypass Stripe billing gate** to provision free workspaces
   - `workspaceProvisioningService` only fires on verified `subscription.created` event
   - Trinity cannot call provisionNewTenant() directly — only the Stripe webhook can
2. **Modify another tenant's data** — all Trinity actions include workspaceId scope
   - OrgIsolationError is thrown and logged if cross-tenant write is attempted
3. **Override the `isManuallyLocked` flag** on shifts
   - Shifts with `isManuallyLocked=true` cannot be modified by any AI action
4. **Execute payroll runs** — payroll period close requires `requireManager` human auth
   - Trinity can flag anomalies but cannot close a period or send ACH transfers
5. **Delete users or workspace** — destructive operations require human confirmation
6. **Bypass spend cap** — `maxOverageLimitCents` blocks AI calls regardless of Trinity's intent
7. **Access root_admin or sysop routes** — Trinity's platform level (4.5) is below sysop (5)
8. **Impersonate another user** — Trinity always acts as herself (userId='system')

**TRINITY CAN:**
- Read all workspace data (workspace-scoped)
- Trigger all 6 Phase 20 workflows via workflowOrchestrator
- Execute all registered actionRegistry actions
- Send SMS/email/push via notificationDeliveryService
- Create/modify shifts (unless isManuallyLocked=true)
- Generate PDFs and audit packets
- Search the web via Gemini grounding

---

### SARGE (platform role: `helpai` — level 2.5)

**Effective workspace access:** employee + supervisor level (can read team data).

**SARGE CANNOT:**
1. **Read another tenant's DARs, shifts, or employee records** — workspace scope enforced
2. **Access billing, payroll totals, or financial data** — FINANCE_ROLES = owner only
3. **Approve payroll periods or financial transactions** — human required
4. **Access Stripe management** — not in FINANCE_ROLES
5. **Override Trinity** — SARGE platform level (2.5) is below Trinity (4.5)
6. **Access `#trinity-command` without invitation** — private room, manager+ only
7. **Execute termination or suspension** — must deliberate with Trinity and await human confirmation

**SARGE CAN:**
- Read workspace schedules, shifts, officers (for operational context)
- Trigger calloff coverage workflow
- Send officer notifications (SMS, ChatDock)
- Generate officer license verification links
- Respond in all non-private ChatDock rooms
- Deliberate with Trinity for hard-escalation decisions

---

### AUDITOR PORTAL (token-gated, no login)

Auditor portal tokens are **not** linked to any workspace user role.
They are independent time-limited tokens (`auditor_links` table).

**Token can access:**
- `GET /api/regulatory/auditor-portal/:token/meta` — workspace name + state config
- `GET /api/regulatory/auditor-portal/:token/officers` — guard card status (redacted)
- `GET /api/regulatory/auditor-portal/:token/use-of-force` — UoF reports
- `GET /api/regulatory/auditor-portal/:token/armed-shifts` — shift logs

**Token CANNOT access:**
- Billing or financial data (redacted at middleware layer)
- SSN, bank account, pay rates (stripped by redaction middleware)
- Any write operation (all auditor portal routes are GET only)
- Any other workspace's data (token is workspace-scoped)

**Token expiry:** Set by manager at generation time. Revocable (`isRevoked` flag).

---

## CROSS-CUTTING SECURITY RULES

1. **workspace_id on every query** — `ensureWorkspaceAccess` middleware validates
   the `workspace_id` in the JWT matches the requested resource's workspace.
   Violation: `OrgIsolationError` → 403.

2. **Financial writes in transactions** — `db.transaction()` wraps all payroll,
   billing, and invoice mutations. Partial writes are impossible.

3. **Shift overlap constraint** — PostgreSQL `btree_gist` exclusion constraint
   prevents double-booking at the DB level. No application code needed.

4. **Armed post license validation** — `isArmedPost=true` shifts require officer
   `guardCardStatus='active'` and license type in `armedAllowed=true` set.
   Enforced in pre-audit engine and shift assignment logic.

5. **Spend cap hard block** — `aiMeteringService` checks `maxOverageLimitCents`
   before every AI call. 100% cap = 402 Payment Required. Never blocks panic/base.

6. **Production error sanitization** — `sanitizeError()` in production always
   returns the generic fallback. Stack traces and DB query text never reach clients.
