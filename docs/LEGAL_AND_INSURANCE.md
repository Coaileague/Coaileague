# Legal, Insurance & Commercial Readiness — Readiness Section 8

Complements `STATEWIDE_READINESS_AUDIT.md` category N4 (score 33%). This
document is a checklist for the non-engineering work that blocks Statewide
go-live and the Texas PSB partnership.

---

## 1. Insurance

| Policy | Coverage target | Priority | Status |
|--------|----------------:|:--------:|:------:|
| Errors & Omissions (E&O) | $2M aggregate | P0 | MISS |
| Cyber liability | $5M aggregate (biometric + PII) | P0 | MISS |
| General liability | $1M per occurrence | P1 | unknown |
| D&O (directors & officers) | per investor requirement | P2 | — |

**Why E&O matters here:** CoAIleague orchestrates armed security
operations. If a mis-scheduled officer contributes to a negligent-security
claim against a tenant, the tenant's attorney will look upstream to the
platform. E&O is not optional for this market.

**Why Cyber matters here:** The platform holds SSN-equivalent data (TCOLE
numbers, insurance policies), biometric clock-in photos, GPS trails, and
employee PII. A breach exposure model without cyber coverage is
uninsurable risk.

Action: get binders from two carriers before the Statewide go-live. Both
policies should name CoAIleague LLC and (if applicable) a subsidiary.

---

## 2. Auditor / Regulator Legal Artifacts

Prerequisites for the Texas PSB pitch, in order:

1. **Auditor NDA template** — reviewed by counsel. Bind scope to "data
   accessed via the auditor portal for the purpose of a licensed audit."
   Retention, return, and breach-notice clauses.
2. **Auditor Portal Terms of Access** — clickwrap, shown at first login,
   acceptance recorded in `auditor_nda_acceptances` (already built in
   Section 3 of this branch).
3. **Data Sharing Legal Review** — outside counsel sign-off that
   providing compliance data to a state regulator under the workspace's
   own consent is permitted and does not require individual-officer
   consent (workspace is the data controller).
4. **Regulator Data Processing Addendum** — if PSB receives API feeds,
   document them as a processor under our DPA.
5. **Record of Processing Activities (RoPA)** — GDPR-style table even
   though PSB data is US-only; makes tenant-level DPA answers faster.

The code surface for #2 is live. The paper surface for #1, #3, #4, #5 is
outstanding — get counsel on these before booking the PSB meeting.

---

## 3. Tenant Contracts (MSA / DPA)

| Artifact | Status |
|----------|:------:|
| Master Services Agreement template | PART — draft exists, per-tenant clauses untracked |
| Data Processing Agreement | PART — draft exists |
| Statement of Work (Statewide specific) | unknown |
| Business Associate Agreement (HIPAA) | MISS — relevant if employee wellness / EAP data is added |
| Service Level Agreement | MISS — targets now documented in OBSERVABILITY.md, need to pull into MSA |

**Minimum SLA to include in Statewide MSA:**
- 99.5% monthly uptime
- RPO 15 min / RTO 4 h
- Sev-1 response within 1 hour, 24/7
- Audit-log retention 1 year
- Export-on-termination within 30 days

Pull these from `docs/OBSERVABILITY.md` §1 + `docs/SECURITY_AND_DR.md` §3.

---

## 4. Revised Texas PSB Pitch Sequence (from the readiness doc)

Prerequisites ordered:

1. Auditor NDA template reviewed by counsel ← §2.1
2. Auditor Portal Terms + NDA gate live ← done (this branch, Section 3)
3. Data-sharing legal review complete ← §2.3
4. E&O + cyber insurance bound ← §1
5. Demo tenant with realistic non-Statewide data ← Section 9 (below)

Do not book the PSB meeting until these five are green.

Recommended sequence at the meeting:
- **Step 1** — Offer free auditor portal access (zero risk for PSB)
- **Step 2** — Offer read-only API feed (no write authority)
- **Step 3** — Ask for endorsement after 12 months clean operation
- **Step 4** — *(aspirational, 3-year)* discuss a mandate framework

Mandate is not a first-meeting conversation. Leading with it spooks the
regulator.

---

## 5. Compliance Posture (for the MSA)

Pulled from `CLAUDE.md` verified laws + the readiness audit. These are
statements the MSA can reference:

- **Tenant data isolation** — CLAUDE §G; every query filters by workspace_id
- **Audit trail** — CLAUDE §L; every Trinity action writes an audit log
- **RBAC** — CLAUDE §E; roles defined once in `roleDefinitions.ts`
- **Data deletion** — GDPR DSR endpoints + policy in §2 above
- **Sub-processors** — list in the DPA: Neon/Railway (DB), Twilio (voice+SMS),
  Resend (email), Stripe (billing), Plaid (ACH), OpenAI + Anthropic + Google
  (Trinity LLMs)

---

## 6. Commercial Readiness Gaps

- [ ] Pricing tiers documented in a sales-facing deck (not just code)
- [ ] Trial / demo tenant — §9 below
- [ ] Security questionnaire pre-filled template (SIG Lite) — speeds up
      enterprise prospect conversations
- [ ] Public trust page (security.coaileague.com or similar)
- [ ] Uptime status page (post-observability baseline)

None of these block Statewide, but all are prerequisites for tenant #2
and the PSB partnership.
