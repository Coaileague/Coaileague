# Tenant #2 Readiness — Readiness Section 8 (addendum)

Complements `STATEWIDE_READINESS_AUDIT.md` category N5 (score 60%). This doc
enumerates the "Statewide-shaped assumption" risks — everywhere the platform
works for Statewide today but might not work for the next tenant. The list
is the result of walking the codebase and flagging every implicit
assumption.

The single-customer dependency is the most underrated business risk in the
whole plan. This doc exists so the risk is documented and reducible.

---

## 1. Hardcoded Identity / IDs

| Reference | Where | OK? |
|-----------|-------|:---:|
| `GRANDFATHERED_TENANT_ID` | `server/tierGuards.ts`, `server/lib/isProduction.ts` | ✅ Only legitimate hardcoded workspace ID |
| Dev seed workspaces (Acme, Anvil) | `server/services/development*.ts` | ✅ Gated by `isProduction()` per CLAUDE §A |
| Support org workspace ID | `server/services/billing/billingConstants.ts` (NON_BILLING_WORKSPACE_IDS) | ✅ Documented |
| Any other hardcoded workspace or employee ID | — | ❌ if you find one, it's a bug |

CLAUDE.md §I is the canonical law. A grep for hex UUIDs outside the allowed
files should return zero hits.

---

## 2. Regulatory Context

Texas is the only state fully seeded today. Multi-state framework is
stubbed.

| Artifact | Status |
|----------|:------:|
| Texas PSB TCOLE schema | DONE |
| California BSIS requirement set | MISS |
| Florida DOL/DBPR requirement set | MISS |
| Multi-state framework scaffold | PART — tables exist, data Texas-only |

**Action:** before accepting tenant #2 from a non-Texas state, seed that
state's requirement set. This is a data-entry task, not a schema change.

---

## 3. Voice / SMS Number Strategy

| Today | Problem for tenant #2 |
|-------|-----------------------|
| Single Twilio number: (866) 464-4151 | All tenants share one inbound number |
| IVR routes by caller identification | Tenant disambiguation happens mid-call |
| Staffing email uses per-tenant slug | ✅ works for email, same approach needed for voice |

**Action:** before tenant #2 launches, provision a tenant-scoped Twilio
sub-account OR a dedicated number per tenant. Trinity voice persona config
already supports per-tenant customization (Phase 18B); wiring it to a
tenant-specific number is the remaining step.

---

## 4. Branding / White Label

| Feature | Status |
|---------|:------:|
| Logo upload per workspace | DONE |
| Primary / secondary / accent color | DONE |
| Footer dark-by-default (CLAUDE §H) | DONE |
| Splash screen min-display (CLAUDE §H) | DONE |
| Custom domain (tenant.example.com) | MISS |
| White-label outbound email sender domain | PART — Resend wildcard MX works, needs per-tenant DKIM |
| Custom Trinity voice persona per tenant | PART — config surface exists, not exposed in UI |

---

## 5. Onboarding Wizard

`server/routes/onboardingPipelineRoutes.ts` exists (7-step Trinity-
orchestrated activation). It has not been run end-to-end against a
clean workspace in months.

**Action:** run it against a fresh workspace in staging before tenant #2.
Expect failures; fix them. Log them as "Statewide-shaped assumption"
findings.

---

## 6. Data Import

| Import | Status |
|--------|:------:|
| Clients CSV | DONE |
| Employees CSV | DONE |
| Shifts / schedule | PART |
| Historical timesheets | MISS |
| Historical invoices | MISS |
| Historical incidents | MISS |

Tenants with 100+ officers and multi-year history will not tolerate
re-entry. Historical import paths are required before mid-market tenants.

---

## 7. Offboarding / Tenant Export

GDPR DSR endpoints cover deletion-on-request but there is no turnkey
"give me my data and leave" export. Tenants will ask for this before
signing. Recommended surface:

- `POST /api/admin/export-workspace` — ZIP of every tenant-scoped table
  as CSV, signed URL expires in 7 days
- Audit log row per export request
- Role-gated to `org_owner` + `co_owner` only

Effort: M (~1 week). Not blocking for Statewide; blocking for enterprise.

---

## 8. Demo Tenant for Sales

Currently there's no seeded realistic demo workspace sales can show a
prospect without exposing Statewide's data. Build one:

- Name: `Demo Security Services` (generic, not "Acme")
- 40 officers, 6 clients, 12 months of history
- Realistic incident mix, scheduled shifts, invoices
- Refresh monthly (seed script idempotent)
- Gated so only internal staff can access

Prevents demo-to-prod accidents and makes Statewide's data stop being
the default sales asset.

Effort: S (1–2 days with existing dev seed infrastructure).

---

## 9. "Statewide Assumption Log"

Every time engineering says "we'll clean that up for tenant #2," write
the assumption here:

| Assumption | First seen | Clean-up plan |
|------------|:----------:|---------------|
| Texas-only regulatory context | 2026-04 | §2 |
| Single Twilio number | 2026-04 | §3 |
| GRANDFATHERED_TENANT_ID exemption | (design) | N/A — legitimate |
| Onboarding wizard not rehearsed | 2026-04 | §5 |
| No historical data import | 2026-04 | §6 |
| No tenant export | 2026-04 | §7 |
| No demo tenant | 2026-04 | §8 |

Grow this list every time a Statewide-specific shortcut is taken. A long
list is fine; a *hidden* list is a business-continuity risk.

---

## 10. Tenant #2 Acceptance Criteria

Before signing tenant #2:

- [ ] Their state's regulatory requirement set seeded (or Texas)
- [ ] Their voice persona configured (per-tenant Twilio number if possible)
- [ ] Their branding applied (logo + colors verified on mobile + desktop)
- [ ] Onboarding wizard run in staging against a fresh workspace ≤30d ago
- [ ] Demo tenant exists for sales conversations
- [ ] Historical data import path documented (even if manual)
- [ ] Tenant export endpoint documented in the MSA
- [ ] STATEWIDE_READINESS_AUDIT.md category N5 ≥ 90%

The point isn't perfection — the point is a known, documented gap list
with an owner per item.
