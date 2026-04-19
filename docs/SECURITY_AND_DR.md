# Security Posture & Disaster Recovery — Readiness Section 6

Complements `STATEWIDE_READINESS_AUDIT.md` category N1 (Security & DR, score
39%). This document captures the current posture, lists the concrete gaps,
and prescribes the next 10 concrete actions in priority order.

Not in scope here: SOC2 Type II audit readiness — that's a separate
multi-month effort with an outside auditor.

---

## 1. What's Already In Place

| Control | Evidence |
|---------|----------|
| Structured audit trail | `audit_logs` canonical sink (CLAUDE.md §L), `logActionAudit()` helper |
| Tenant isolation enforced | CLAUDE.md §G — every raw-SQL query filters by `workspace_id` |
| RBAC SSOT | `shared/lib/rbac/roleDefinitions.ts` (CLAUDE.md §E) |
| TLS in transit | Cloud provider default + Resend + Twilio verified |
| Encryption key management | `ENCRYPTION_KEY` enforced at boot in `validateEnvironment.ts` |
| Session secret rotation | `SESSION_SECRET` validated at boot |
| Lazy SDK factories | CLAUDE.md §F — no boot-time crashes on missing secrets |
| Production detection canonical | CLAUDE.md §A — `isProduction()` helper |
| Error tracker adapter | Readiness §5 — `server/lib/errorTracker.ts` |
| Sensitive-key redaction | `actionAuditLogger.ts` redacts password/token/secret/ssn |
| GDPR DSR endpoints | `server/routes/privacyRoutes.ts` |
| Platform-role boundary | CLAUDE.md §M — auditor routes can't read `workspaceRole` |
| Cross-tenant enumeration blocked | CLAUDE.md §N — WHERE-scoped workspace lookups |

---

## 2. Current Gaps (what N1 flagged MISS)

| Gap | Priority | Effort |
|-----|:--------:|:------:|
| No documented RPO/RTO for Postgres | P0 | S |
| No backup restore drill evidence | P0 | M |
| No documented CSP policy / security headers audit | P1 | S |
| No npm audit / dependency-scan gate in CI | P1 | S |
| No SBOM / supply-chain attestation | P2 | M |
| No documented incident response runbook (beyond OBSERVABILITY.md skeleton) | P1 | M |
| Tenant retention policy not documented | P1 | S |
| Secret rotation cadence not documented | P2 | S |
| PITR capability not verified with provider | P0 | S |

---

## 3. Disaster Recovery Targets

Set these explicitly so ops has something to measure against:

| Metric | Target | Rationale |
|--------|:------:|-----------|
| RPO (data loss tolerated) | 15 min | Postgres PITR can meet this on Neon/Railway Postgres |
| RTO (time to recover) | 4 h | Sev-1 recovery; most of this is DNS + env rebuild, not DB restore |
| Backup frequency | every 15 min (PITR) + daily logical dump | PITR for granularity, dump for portability |
| Backup retention | 30 days PITR + 1 year dumps | Regulatory hold + long-tail disputes |
| Restore drill cadence | Quarterly | Rehearse or it doesn't work when needed |
| Cross-region secondary | Not required for MVP | Add post-GA if tenant contracts require it |

**Verify with provider (one task):** confirm PITR is enabled on the
production Postgres instance and the retention window matches the target
above.

---

## 4. Dependency Vulnerability Scan

Enable `npm audit` as a CI gate:

```yaml
# .github/workflows/security.yml  (create in a follow-up branch)
name: security
on: [pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm audit --audit-level=high
```

Note: this is a scaffold, not shipped. Some transitive dependencies
(glob@7, inflight@1) already warn in `npm install`; the gate should start
at `--audit-level=high` and tighten later.

---

## 5. Security Headers — Next 5 Lines

Verify `helmet` is mounted and the CSP is explicit:

```ts
// server/index.ts or server/middleware/security.ts
import helmet from 'helmet';
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "https://js.stripe.com"],  // allow only what you need
      connectSrc: ["'self'", "https://api.stripe.com", "wss:"],
      imgSrc:     ["'self'", "data:", "blob:", "https://*.twilio.com"],
    },
  },
}));
```

This belongs in a follow-up branch — touching headers requires a frontend
verification pass because CSP can silently break Stripe, Twilio embeds, or
map tiles.

---

## 6. Tenant Data Retention

GDPR DSR endpoints cover deletion-on-request. Retention beyond that is
undocumented. Proposed policy (adopt in MSA boilerplate):

- **Active tenant:** data retained indefinitely
- **Suspended tenant:** 90 days in place, then archival (S3 Glacier), 1 year
- **Cancelled tenant:** 30-day soft delete, then hard delete
- **Regulatory hold overrides everything** — if a regulator has an active
  audit window against the workspace, deletion is paused

Document this in the Master Services Agreement; codify it in a
`retentionPolicyService` that `workspaces.status` changes consult before
deletion.

---

## 7. Secret Rotation Cadence

Existing system: `server/services/infrastructure/apiKeyRotationService.ts`
handles rotation but cadence is undocumented. Proposal:

| Secret | Cadence | Owner |
|--------|:-------:|-------|
| `SESSION_SECRET` | 90 days | Platform admin |
| `ENCRYPTION_KEY` | never (rotating breaks old encrypted data; add versioning first) | — |
| Twilio auth token | 180 days | Platform admin |
| Resend API key | 180 days | Platform admin |
| Stripe restricted keys | 365 days | Billing lead |
| OpenAI API key | 180 days | AI lead |
| Trinity MCP tokens | per-session | automatic |

Commit this table to `server/services/infrastructure/apiKeyRotationService.ts`
as a constant so the service has a documented rotation calendar.

---

## 8. Next 10 Concrete Actions (priority order)

1. Verify PITR enabled on prod Postgres with provider (P0, 15 min)
2. Document RPO/RTO in the DPA template (P0, 30 min)
3. Run a backup restore drill in staging (P0, 2 h)
4. Add `npm audit --audit-level=high` to CI (P1, 30 min)
5. Verify helmet + CSP is mounted, tighten CSP (P1, 2 h)
6. Write tenant retention policy into MSA + codify in service (P1, 4 h)
7. Commit secret rotation table to `apiKeyRotationService.ts` (P2, 30 min)
8. Incident response runbook fleshed out past OBSERVABILITY.md skeleton (P1, 4 h)
9. SBOM generation in CI (P2, 1 h)
10. Cross-region Postgres replica (post-GA, sizing dependent)

Target: items 1–6 done before Statewide production go-live.
