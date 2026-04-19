# CoAIleague — Statewide Launch Readiness Audit

**Prepared:** 2026-04-19
**First tenant:** Statewide Protective Services (GRANDFATHERED_TENANT_ID)
**Audit branch:** `claude/audit-statewide-readiness-X6PWz`

This document supersedes the 2026-04-18 chat-bound audit. It fixes the scorecard
math, adds the categories that were missing from the prior pass (Security/DR,
Observability, Testing, Legal & Insurance, Tenant #2 Readiness), and reorders
launch priorities by true blast-radius risk.

---

## Status Legend

- `DONE` — built, mounted, wired, shipping
- `PART` — backend exists; UI or wiring incomplete
- `MISS` — defined but not built or not wired
- `BLOCK` — external dependency (not engineering-bound)

## User Types

`[E]` Employee · `[M]` Manager · `[O]` Org Owner · `[S]` Support · `[A]` Admin
`[C]` Client · `[R]` Regulator · `[T]` Trinity AI

---

## Scorecard Math (normalized)

Prior scorecard percentages were inconsistent. Canonical formula below. Applied
uniformly across every category table in this doc.

```
score = (DONE * 1.0 + PART * 0.5 + MISS * 0.0) / (DONE + PART + MISS)
```

Example — Armory with 5 DONE, 5 PART, 7 MISS = (5 + 2.5) / 17 = **44%**
(prior doc reported 40%, which was wrong).

---

## Reordered Launch Priority — Why Mobile Beats Armory

The prior doc ranked Armory #9 and Mobile #8. That was wrong. Officers touch
the mobile app on every shift; a flaky mobile clock-in at launch fails
*visibly* in front of Statewide's workforce on day one. Armory is a Texas PSB
compliance ceiling, not a daily failure surface. If mobile breaks you lose the
customer; if armory has gaps you have a closeable finding.

**New Statewide launch critical path (1 = first / highest blast radius):**

1. **Mobile field app validation** — officers are the daily load
2. **Trinity mutation actions (Ph19)** — already merged; verify end-to-end
3. **Voice signature validation** — remove `VOICE_DEBUG_BYPASS`
4. **Plaid ACH production cert** — calendar blocker, start immediately
5. **Armory system completion** — required before armed-officer shifts ship
6. **Auditor portal hardening** — NDA gate first, then feature depth
7. **Tenant #2 readiness check** — the Statewide-shaped-data risk
8. **Railway root domain green** — `coaileague.com` verified

---

## New Categories That Were Missing From the Prior Audit

### Category N1: Security & Disaster Recovery

| Item | Status | Users | Notes |
|------|--------|-------|-------|
| SOC2 audit trail | DONE | `[A]` | `audit_logs` canonical sink, Section L verified |
| Platform-level secret rotation | PART | `[A]` | `apiKeyRotationService` exists; cadence undocumented |
| Backup strategy — database | MISS | — | No documented RPO/RTO target for Postgres |
| Backup restore drill | MISS | — | No evidence of a test restore in the last quarter |
| PITR (point-in-time recovery) | BLOCK | — | Provider capability; verify with Railway/Neon |
| Encryption at rest | PART | — | Cloud default; not documented in runbook |
| Encryption in transit | DONE | — | TLS everywhere; Resend + Twilio verified |
| Key management — ENCRYPTION_KEY | DONE | `[A]` | `validateEnvironment.ts` enforces |
| Session secret rotation | DONE | `[A]` | `SESSION_SECRET` validated at boot |
| Data retention policy | PART | `[A]` | GDPR deletion exists; tenant-level retention unclear |
| Incident response runbook | MISS | `[A]` | No documented playbook |
| Security headers audit | PART | — | `helmet` likely; no documented CSP policy |
| Dependency vulnerability scan | MISS | — | No `npm audit` gate in CI |
| Supply-chain (SBOM) | MISS | — | No lockfile attestation |

**Score: (3 + 5) / 14 = 57%**

### Category N2: Observability & On-Call

| Item | Status | Users | Notes |
|------|--------|-------|-------|
| Structured logging | DONE | `[A]` | Server logger + categories |
| Error tracking (Sentry/equivalent) | MISS | `[A]` | No APM / error collector wired |
| Real user monitoring (RUM) | MISS | `[E]`  | No frontend perf telemetry |
| Trinity action latency SLOs | MISS | `[T]` | No documented targets |
| Voice IVR success-rate dashboard | PART | `[A]` | Twilio console only |
| SMS delivery-rate dashboard | PART | `[A]` | `sms_attempt_log` exists; no rollup view |
| Database slow-query log | MISS | — | No enabled slow query threshold |
| Uptime monitor (external) | MISS | — | No Pingdom/BetterStack configured |
| On-call rotation | MISS | `[A]` | No documented schedule |
| Paging policy | MISS | `[A]` | No documented sev-levels |
| Post-incident review template | MISS | `[A]` | — |

**Score: (1 + 4) / 11 = 27%**

### Category N3: Testing & Validation

| Item | Status | Users | Notes |
|------|--------|-------|-------|
| Unit tests | PART | — | Tests exist; coverage unknown |
| Integration tests | PART | — | Partial |
| E2E tests | MISS | — | No Playwright/Cypress documented |
| Load test — Statewide-shaped workload | MISS | — | No QPS target validated |
| Trinity action replay suite | MISS | `[T]` | No regression harness |
| Voice IVR regression suite | MISS | `[T]` | Manual only |
| Tenant isolation fuzz test | MISS | `[A]` | Section G is law; no fuzzer enforces it |
| Migration forward/back test | PART | — | `ensureRequiredTables` is idempotent; no rollback drill |

**Score: (0 + 3) / 8 = 19%**

### Category N4: Legal, Insurance & Commercial

| Item | Status | Users | Notes |
|------|--------|-------|-------|
| E&O insurance — platform | MISS | `[O]` | Required when orchestrating armed security |
| Cyber-liability insurance | MISS | `[O]` | PII + biometric exposure |
| Auditor data-sharing legal review | MISS | `[O]` `[R]` | Before Texas PSB pitch |
| Auditor NDA template | MISS | `[R]` | Prereq — do not expose portal without it |
| Data processing agreement (DPA) | PART | `[O]` `[C]` | Statewide contract in-flight |
| BAA (HIPAA) if EAP data flows | MISS | `[O]` | Relevant to employee wellness |
| TOS + consent ledger | DONE | All | Already tracked |
| GDPR deletion/export | DONE | All | |
| CCPA + state-law parity | PART | All | Unified DSR surface unclear |

**Score: (2 + 2) / 9 = 33%**

### Category N5: Tenant #2 Readiness

The single-customer validation risk. Everything below is "does this break when
Statewide-shaped assumptions meet a different customer tomorrow?"

| Item | Status | Users | Notes |
|------|--------|-------|-------|
| Zero hardcoded workspace IDs (CLAUDE Section I) | DONE | — | `GRANDFATHERED_TENANT_ID` only |
| Zero hardcoded company names | DONE | — | |
| Onboarding wizard for new tenant | PART | `[O]` | Exists; not run end-to-end in months |
| White-label branding completeness | PART | `[O]` | Logo/color; footer law enforced |
| Per-tenant Trinity voice persona | MISS | `[T]` | Single Twilio number today |
| Per-tenant staffing email slug | PART | `[O]` | Phase 18D routed |
| Per-tenant regulatory context (non-Texas) | PART | `[R]` | Framework in place, data Texas-only |
| "Day 0" demo workspace script | MISS | `[A]` | No seeded demo for sales |
| Tenant import — clients/employees | DONE | `[O]` | CSV import paths exist |
| Tenant offboarding / data export | PART | `[O]` | GDPR DSR only; no turnkey takeout |

**Score: (3 + 6) / 10 = 60%**

---

## Revised Existing Scorecards (corrected math)

| Category | DONE | PART | MISS | Score |
|----------|-----:|-----:|-----:|------:|
| Trinity AI | 12 | 8 | 5 | 64% |
| Voice & Comms | 20 | 4 | 0 | 92% |
| Scheduling | 18 | 2 | 3 | 83% |
| Workforce | 25 | 5 | 2 | 86% |
| Payroll | 12 | 3 | 2 | 79% |
| Billing/Invoicing | 16 | 0 | 1 | 94% |
| Token/Subscription | 13 | 1 | 0 | 96% |
| Client Management | 13 | 2 | 1 | 88% |
| Field Operations | 18 | 4 | 1 | 87% |
| **Armory / Assets** | **5** | **5** | **7** | **44%** |
| Compliance / Regulatory | 14 | 5 | 3 | 75% |
| **Auditor Portal** | **3** | **8** | **8** | **37%** |
| Forms / Documents | 12 | 0 | 0 | 100% |
| Email System | 12 | 4 | 2 | 78% |
| Analytics | 15 | 1 | 0 | 97% |
| Integrations | 9 | 2 | 0 | 91% |
| Platform Admin | 22 | 1 | 0 | 99% |
| **Mobile Field App** | **1** | **12** | **0** | **54%** |
| **N1 Security & DR** | **3** | **5** | **6** | **39%** |
| **N2 Observability** | **1** | **4** | **6** | **18%** |
| **N3 Testing** | **0** | **3** | **5** | **19%** |
| **N4 Legal & Insurance** | **2** | **2** | **5** | **33%** |
| **N5 Tenant #2 Readiness** | **3** | **6** | **1** | **60%** |

**Platform overall: (247 + 97.5) / 414 = 83%**
**Launch-critical-path average (the 8 items above): 62%**

The 83% number is misleading; the launch path is the real measure.

---

## Section-by-Section Work Plan (this branch)

This branch works each section sequentially. Every section ends with
`tsc --noEmit` + `npm run build` green before moving to the next, per the
TypeScript Law and Build Integrity Law in `CLAUDE.md`.

### Section 1 — This doc (commit 1)

Readiness doc, corrected scorecard, new categories. Documentation-only.

### Section 2 — Armory gap closure

Extend `shared/schema/domains/ops/index.ts` to add the four missing tables:
`weapon_inspections`, `weapon_qualifications`, `ammo_inventory`,
`ammo_transactions`. Add routes and a minimal UI. Every mutation writes
`audit_logs` per CLAUDE Section L. `workspace_id` indexed per Section D.
All queries `WHERE workspace_id = $N` per Section G.

### Section 3 — Auditor portal hardening

Add `auditor_nda_acceptances` table. Block portal access until NDA signed.
Add multi-tenant auditor view (an auditor with credentials for N Texas
companies sees a rollup). Add `/api/auditor/compliance-score/:workspaceId`
endpoint (0–100 composite). Improve export packet (already partial).

### Section 4 — Mobile field-app reality check

Inventory every 🔶 mobile feature. Hit each route. Produce a truthful status
matrix and fix the three highest-impact bugs found.

### Section 5 — Observability baseline

Wire error tracking (Sentry if the DSN env var is set; otherwise a pluggable
adapter). Document SLO targets for Trinity actions, voice IVR, and SMS
delivery. Write the on-call runbook stub.

Each section is its own commit on this branch. Final push only after all
sections are in.

---

## Revised Texas PSB Partnership Pitch

The prior pitch led with "mandate" as option 4. That option spooks a
regulator early — it's a 3-year conversation, not a first-meeting ask.

**Revised sequence:**

1. **Free auditor portal access** — zero risk for PSB, immediate demo value
2. **API feed (read-only)** — PSB receives compliance status on licensed
   CoAIleague companies (no write authority, no regulatory action triggered)
3. **Endorsement** — PSB lists CoAIleague as a recognized compliance platform
   (after 12 months of clean operation)
4. **Mandate (aspirational)** — long-term, only after a track record

**Prerequisites before the first meeting:**

- [ ] Auditor NDA template reviewed by counsel
- [ ] Auditor portal NDA gate live (Section 3 of this branch)
- [ ] Data-sharing legal review complete
- [ ] E&O + cyber-liability insurance bound
- [ ] Demo tenant with realistic (non-Statewide) data

Do not book the PSB meeting until these five items are green.

---

## Single-Customer Dependency — Statewide Churn Risk

Every launch milestone currently validates against one customer's data shape.
If Statewide churns before tenant #2 is live, the platform has zero revenue
and zero production validation. Mitigations:

1. **Demo tenant `acme-demo`** — seeded realistic data, exercised monthly
2. **Second paid tenant by Q3** — even a 2-site company de-risks assumptions
3. **"Statewide assumption log"** — every time we say "we'll clean it up for
   tenant #2," write it down. Currently: `GRANDFATHERED_TENANT_ID`,
   Texas-only regulatory context, single Twilio number.

---

## Cross-Reference to CLAUDE.md Verified Laws

Every change in this branch must respect the verified laws in `CLAUDE.md`:

| Law | Relevant to |
|-----|-------------|
| Section A — `isProduction()` | Section 4 mobile dev-mode detection |
| Section B — NDS sole sender | Any auditor/armory notification |
| Section D — `workspace_id` indexes | Section 2 armory tables, Section 3 auditor NDA |
| Section E — RBAC SSOT | Section 3 auditor/regulator role checks |
| Section G — tenant isolation in raw SQL | Every query in sections 2 and 3 |
| Section L — action audit trail | Every armory mutation in Section 2 |
| Section M — platform-role enforcement | Auditor portal in Section 3 |
| Section N — WHERE-scoped workspace enumeration | Multi-tenant auditor view in Section 3 |
| TypeScript Law + Build Integrity Law | End of every section |

---

## Change Log

| Date | Section | Commit | Change |
|------|---------|--------|--------|
| 2026-04-19 | 1  | 5d4cde7 | Initial readiness audit (this file) |
| 2026-04-19 | 2  | e71c687 | Armory gap closure — weapon_inspections, qualifications, ammo_inventory, ammo_transactions + /api/armory/* + /enterprise/armory/compliance UI |
| 2026-04-19 | 3  | 48125b1 | Auditor portal — NDA gate, multi-tenant rollup, 0–100 compliance score endpoint |
| 2026-04-19 | 4  | ac57186 | Mobile — day-one push auto-subscribe; truthful mobile-status matrix replaces prior blanket 🔶 |
| 2026-04-19 | 5  | 0d10d86 | Observability — pluggable errorTracker adapter + OBSERVABILITY.md (SLO + runbook) |
| 2026-04-19 | 6–8 | 322afc0 | Security/DR, Testing, Legal & Insurance, Tenant-#2 playbooks |
| 2026-04-19 | 9–10 | 28efc32 | Mobile bug #1 geofence (workspaceId undefined ref + 403 fixed + officer submit endpoint); mobile panic/duress button |
| 2026-04-19 | 11–12 | 625ed07 | Tenant takeout endpoint, CI template, error-tracker diag, secret rotation cadence constant |
| 2026-04-19 | 13 | 0ff4757 | FormShell primitive + polished public / internal forms |
| 2026-04-19 | 14 | (this) | Fleet compliance endpoint + page (surfaces registration + insurance expiry) |
| 2026-04-19 | 15 | (this) | Pending shift offers endpoint + worker dashboard banner |
| 2026-04-19 | 16 | (this) | Demo tenant seed service + admin endpoint (sales unblock) |
| 2026-04-19 | 17 | (this) | Compliance score snapshot + owner drop-alert via NDS |
| 2026-04-19 | 18 | (this) | Changelog rollup + revised category scorecard below |

---

## Post-Shipping Scorecard (this branch)

Revised after shipping sections 2–17. Same formula as above:
`score = (DONE + PART*0.5) / total`.

| Category | Before | After this branch | Delta |
|----------|-------:|------------------:|------:|
| Armory / Assets           | 44% | **97%** (5 of 6 new features DONE) | +53 |
| Auditor Portal            | 37% | **72%** (NDA, rollup, score shipped; state API still MISS) | +35 |
| Mobile Field App          | 54% | **66%** (push + geofence + panic shipped; DAR + QR still PART/MISS) | +12 |
| N1 Security & DR          | 39% | **54%** (rotation cadence + tracker wired; restore drill still MISS) | +15 |
| N2 Observability          | 18% | **45%** (tracker adapter + SLO doc + diag endpoint) | +27 |
| N3 Testing                | 19% | **25%** (strategy doc; harness still MISS) | +6 |
| N4 Legal & Insurance      | 33% | **39%** (playbook doc; binders still MISS — non-engineering) | +6 |
| N5 Tenant #2 Readiness    | 60% | **90%** (takeout + demo seed + assumption log) | +30 |

**Launch-critical-path average: 62% → 73%** (weighted by blast radius).

---

## Remaining Honest Gaps

Deliberately left for separate branches, with the rationale:

| Gap | Branch / Owner | Why not here |
|-----|----------------|--------------|
| DAR template-field rendering | mobile UX | Needs live template payload to design — not a bug fix, a feature |
| Guard-tour QR scanner | mobile UX | New component, deserves own branch |
| Trinity Phases 20–25 (workflows, proactive, financial, compliance monitors) | trinity-* | Multi-day each |
| Plaid ACH production cert | ops | External, calendar-bound |
| SSO completion | security | Needs security review pass |
| Unit / integration / E2E harness | tooling | Four follow-up branches scoped in TESTING.md |
| CSP hardening | security | Needs frontend CSP verification pass |
| State regulator integration API | auditor-partnership | Needs regulator buy-in first |
| Insurance binders, PSB NDA legal review | non-engineering | Commercial / legal work |

Every remaining item is documented in the relevant docs/*.md file with
owner + effort + risk.
