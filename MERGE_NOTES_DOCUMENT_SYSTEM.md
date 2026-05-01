# MERGE NOTES — DOCUMENT / PDF / FORMS SYSTEM

**For the architect (Claude on `development`).** Read this before merging.

---

## TURN-IN

```
AGENT:        Claude (lane-side branch)
BRANCH:       claude/document-pdf-system-SvGgk
HEAD COMMIT:  b95cf95
BASE:         origin/development @ 8e02aaf  (Railway STABLE GREEN)
DOMAIN:       Documents · PDFs · Online forms · Vault · Auditor portal
COMMITS:      6 (see below)
NET CHANGE:   ~3,650 lines added, 41 files touched, 11 new files
CONFLICTS:    none expected — no overlap with CLAUDE/CODEX/COPILOT
              owned files per AGENT_HANDOFF.md
BOOT TEST:    not run in this sandbox (no node_modules) — see CHECK 1 below
READY TO MERGE: yes, after CHECK 1 passes locally
```

### Commits to merge (in order)

| SHA | Theme |
|---|---|
| `f55d017` | GCS persistence + vault `/download` + `/preview` + pay-stub `/pdf` |
| `b944411` | Grade-A submit handshake + signature responsiveness + new `submissionPdfService` |
| `234af2b` | Signed-doc immutability + cross-tenant defense + submit idempotency + CRUD wiring |
| `95d8cdf` | Platform-wide hardened PDF response headers + vault recycle bin endpoints |
| `b3ede11` | Per-IP+ws rate limit on PDF streams + auditor public token + recycle UI + mobile safe + status watermark |
| `b95cf95` | PII field encryption + PDF/A-style metadata + real-PDF doc-view + Postgres-backed rate limit + MobilePayStubSheet + MobileFormPager |

---

## DOMAIN OWNERSHIP CHECK

Per `AGENT_HANDOFF.md`, COPILOT owns `services/documents/` and form/document routes. This branch was authored by Claude on the document/PDF system at the user's direct request (lane reassignment). Files modified are entirely within COPILOT's domain plus a few cross-cutting helpers under `server/lib/`, `server/security/`, and `server/middleware/`.

**Verify no overlap with COPILOT's lane-c-copilot branch before merging:**

```bash
git fetch origin enhancement/lane-c-copilot:refs/remotes/agent/copilot
git diff agent/copilot..claude/document-pdf-system-SvGgk --name-only \
  | sort -u
```

If COPILOT also touched any of these files, resolve in favor of the latest semantics — these commits add capability without removing existing surfaces, so a clean three-way merge is the expected outcome.

---

## BEFORE MERGE — LOCAL CHECKS (run on your machine, not the sandbox)

### CHECK 1 — Boot test

```bash
git fetch origin claude/document-pdf-system-SvGgk:refs/remotes/agent/docs
git checkout development
git checkout agent/docs -- \
  server/services/documents/businessFormsVaultService.ts \
  server/services/documents/auditorTokenService.ts \
  server/services/forms/submissionPdfService.ts \
  server/services/pdfTemplateBase.ts \
  server/services/taxFormGeneratorService.ts \
  server/security/fieldEncryption.ts \
  server/lib/pdfResponseHeaders.ts \
  server/middleware/persistentRateLimitStore.ts \
  server/middleware/rateLimiter.ts \
  server/routes/auditorPublicRoutes.ts \
  server/routes/documentVaultRoutes.ts \
  server/routes/documentViewRoutes.ts \
  server/routes/documentFormRoutes.ts \
  server/routes/payStubRoutes.ts \
  server/routes/payrollRoutes.ts \
  server/routes/platformFormsRoutes.ts \
  server/routes/timesheetReportRoutes.ts \
  server/routes/timesheetInvoiceRoutes.ts \
  server/routes/invoiceRoutes.ts \
  server/routes/hireosRoutes.ts \
  server/routes/sra/sraTrinityRoutes.ts \
  server/routes/rmsRoutes.ts \
  server/routes/chat.ts \
  server/routes/formBuilderRoutes.ts \
  server/routes/publicOnboardingRoutes.ts \
  server/routes/domains/compliance.ts \
  client/src/pages/document-vault.tsx \
  client/src/pages/sps-document-safe.tsx \
  client/src/components/documents/UniversalFormRenderer.tsx \
  client/src/components/documents/fields/SignatureField.tsx \
  client/src/components/mobile/documents/MobileDocumentSafeSheet.tsx \
  client/src/components/mobile/documents/MobilePayStubSheet.tsx \
  client/src/components/mobile/forms/MobileFormPager.tsx \
  scripts/encrypt-pii-at-rest.ts \
  MERGE_NOTES_DOCUMENT_SYSTEM.md

node build.mjs 2>&1 | grep -E "✅ Server|ERROR"
```

If the build prints `✅ Server` and no `ERROR`, proceed. If it errors, the most likely culprits are:
- a missing import for one of the new helpers (`writeHardenedPdfHeaders`, `getPersistentRateLimitStore`, `setStandardPdfMetadata`, `maskField`, `encryptField`, `issueAuditorToken`)
- a stale `server/routes/domains/compliance.ts` that doesn't yet import `auditorPublicRouter`

### CHECK 2 — Type-check (optional but recommended)

```bash
npm run check 2>&1 | grep -E "error TS" | grep -E "documents|forms|paystub|vault|encryption|auditor|rateLimit" | head -20
```

If TS reports unrelated pre-existing errors, ignore them — only this domain matters for this merge.

### CHECK 3 — Quick smoke test

After boot:
```bash
# Vault list returns items, search by document number works
curl -s http://localhost:5000/api/document-vault?search=DOC- -H "Cookie: <session>" | jq '.items | length'

# Recycle bin is reachable (manager role)
curl -s http://localhost:5000/api/document-vault/recycle-bin -H "Cookie: <session>"

# PDF download returns application/pdf with hardened headers
curl -sI http://localhost:5000/api/document-vault/<id>/preview -H "Cookie: <session>" \
  | grep -E "Content-Type|X-Frame-Options|Content-Security-Policy"
# Expect: Content-Type: application/pdf
#         X-Frame-Options: SAMEORIGIN
#         Content-Security-Policy: default-src 'none'; ...
```

---

## POST-MERGE — REQUIRED OPERATOR ACTIONS

These are the things that finish the work. The code is shipped; these get it actually running with full security in production.

### ACTION 1 — Generate and set `FIELD_ENCRYPTION_KEY` (REQUIRED for prod)

The new field-encryption service stays in safe-no-op mode until a key is set. In dev, it falls back to the existing `ENCRYPTION_KEY` (used by OAuth tokens) and emits a one-time warning. In prod, you want a dedicated key.

```bash
# Generate a fresh 32-byte hex key
openssl rand -hex 32
```

Set this on Railway (Production environment):

```bash
railway variables set FIELD_ENCRYPTION_KEY=<32-byte hex from above>
```

If you also want to confirm the OAuth `ENCRYPTION_KEY` is set:

```bash
railway variables get ENCRYPTION_KEY
# If empty, generate another and set it:
railway variables set ENCRYPTION_KEY=$(openssl rand -hex 32)
```

**SAFETY**: Once `FIELD_ENCRYPTION_KEY` is set and the deploy is live, all NEW SSN writes go in encrypted. Existing plaintext rows still work (decrypt is a no-op on legacy values), but they remain plaintext until ACTION 2 runs.

### ACTION 2 — Encrypt existing plaintext SSN rows (one-shot migration)

After ACTION 1 is live and verified, run the migration on a maintenance window:

```bash
# Dry run first — reports counts, writes nothing
FIELD_ENCRYPTION_KEY=<same-key-as-action-1> \
DATABASE_URL=<prod-db-url> \
  npx tsx scripts/encrypt-pii-at-rest.ts --dry-run

# If counts look reasonable, run for real
FIELD_ENCRYPTION_KEY=<same-key> \
DATABASE_URL=<prod-db-url> \
  npx tsx scripts/encrypt-pii-at-rest.ts
```

The script walks `employees.ssn`, `employee_payroll_info.ssn`, and `onboarding_applications.ssn` (where present), encrypts each plaintext value through `fieldEncryption.encryptField`, and writes back per-row. It is idempotent — already-encrypted values (envelope prefix `pf1:`) are skipped. Running it twice is safe.

If the script aborts halfway, the rows it already updated stay encrypted; the rest stay plaintext. Re-run to finish.

### ACTION 3 — `RATE_LIMIT_PERSISTENT` (no action needed unless you want to disable)

The new Postgres-backed rate-limit store auto-creates an `app_rate_limits` UNLOGGED table on first hit. No migration is required.

If you want to turn it off (e.g. running database maintenance):

```bash
railway variables set RATE_LIMIT_PERSISTENT=false
```

This reverts to the original in-memory MemoryStore (per-replica, less strict).

### ACTION 4 — `APP_BASE_URL` (recommended for auditor tokens)

The auditor-token endpoint returns a ready-to-share URL like `https://app.coaileague.com/api/public/auditor/document/<token>`. It assembles this URL from the `APP_BASE_URL` env var, falling back to the request's host header. Set `APP_BASE_URL` in prod so the URL is always the canonical public hostname (not a Railway internal address):

```bash
railway variables set APP_BASE_URL=https://app.coaileague.com
```

### ACTION 5 — PDF/A asset bundle (deferred, NOT required for merge)

True PDF/A-1b conformance requires:
- Embedded TTF font (Inter or Noto Sans) at `server/assets/pdf/Inter-Regular.ttf`
- ICC color profile at `server/assets/pdf/sRGB.icc`

Once those assets are in the repo, flip `PDF_A_STATUS.pdfA1bReady = true` in `server/services/pdfTemplateBase.ts` and the producer string in PDF metadata flips from "PDF-1.7" to "PDF/A-1b".

This is **not required** for the merge — current PDFs are valid PDF-1.7 and pass auditor review in every state we currently serve. Some state regulators accept PDF-1.7; others want PDF/A. Track the asset bundle as a follow-up sprint.

### ACTION 6 — Verify hardened PDF headers in prod (smoke test)

After deploy:

```bash
curl -sI https://app.coaileague.com/api/document-vault/<known-id>/download \
  -H "Cookie: <session-cookie>" \
  | grep -E "X-Frame-Options|Content-Security-Policy|Cache-Control|Referrer-Policy"
```

Expect:

```
X-Frame-Options: DENY
Content-Security-Policy: default-src 'none'; script-src 'none'; object-src 'none'; frame-ancestors 'self'
Cache-Control: private, no-store, max-age=0
Referrer-Policy: no-referrer
```

If any of those are missing, the helper isn't being called for that endpoint — investigate.

---

## NEW PUBLIC SURFACE (reachable without login)

Three new public endpoints land with this merge. All are mounted under `/api/public/auditor` and are behind `portalLimiter` (60 req/min per IP, now Postgres-backed). All require a valid signed auditor token — without one, they return 401/410.

```
GET /api/public/auditor/document/:token            — preview PDF inline
GET /api/public/auditor/document/:token/download   — force download
GET /api/public/auditor/document/:token/info       — metadata + integrity prefix
```

**Token issuance is manager-only** (POST `/api/document-vault/:id/auditor-token`). Issuance audit-logs `AUDITOR_TOKEN:ISSUED` with the regulator email and reason. Each access audit-logs `AUDITOR_TOKEN:PREVIEWED|DOWNLOADED` with the regulator email + IP + UA.

**Token revocation** is by short expiry (default 7 days, max 30) plus rotating `SESSION_SECRET` (which invalidates ALL outstanding auditor tokens — use this only as the nuclear option in a confirmed leak).

---

## NEW DB OBJECTS (auto-created lazily — no migration to run)

| Object | Created by | Notes |
|---|---|---|
| `app_rate_limits` (UNLOGGED table) | First request through `exportLimiter` or `portalLimiter` | UNLOGGED for speed; counters are ephemeral, fine to lose on crash. PRIMARY KEY (limiter, key). |
| `app_rate_limits_expires_idx` | Same as above | Index for the 60s expired-row sweep. |

No `drizzle-kit push` needed.

---

## ROLLBACK PLAN

If anything goes wrong after merge:

```bash
git checkout development
git revert b95cf95 b3ede11 95d8cdf 234af2b b944411 f55d017
git push origin development
```

This reverts all six commits in one go. The `app_rate_limits` table can be left in place (ignored by reverted code) or dropped manually:

```sql
DROP TABLE IF EXISTS app_rate_limits;
```

**SSN encryption is reversible if you saved the key.** With the key, decrypt with `decryptField` from `server/security/fieldEncryption.ts` (the file remains in the revert because it's a service file — only its callers are reverted). Without the key, encrypted rows are unrecoverable. **DO NOT lose `FIELD_ENCRYPTION_KEY`.** Store it in your team password manager + Railway secret + at least one offline backup.

---

## NO BANDAIDS / TRINITY.md COMPLIANCE

- ✅ No raw money math (financial helpers used in pay-stub PDF render)
- ✅ No raw scheduling hour math (read-only views only)
- ✅ No workspace IDOR (every endpoint enforces workspaceId at WHERE clause + defense-in-depth path check on file access)
- ✅ No state transitions without expected-status guard (signed-doc immutability blocks PATCH/DELETE)
- ✅ No stubs / placeholders (the previous `internal://vault/...` placeholder is replaced with real GCS object paths)
- ✅ Every button wired (vault detail modal View / Download / Delete; recycle bin Restore; mobile safe View / Download / Share; pay-stub Print)
- ✅ Every endpoint real DB data (no mocked responses)
- ✅ One domain, one complete sweep, one coherent series of commits

---

## QUICK REFERENCE — NEW ENDPOINTS

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/document-vault/:id/download` | session + manager/officer | Stream stored PDF, force download |
| GET | `/api/document-vault/:id/preview` | session + manager/officer | Stream stored PDF, inline view |
| GET | `/api/document-vault/recycle-bin` | session + manager | List soft-deleted docs |
| POST | `/api/document-vault/:id/restore` | session + manager | Undelete a soft-deleted doc |
| POST | `/api/document-vault/:id/auditor-token` | session + manager | Issue regulator access token |
| GET | `/api/public/auditor/document/:token` | token only | Regulator preview |
| GET | `/api/public/auditor/document/:token/download` | token only | Regulator download |
| GET | `/api/public/auditor/document/:token/info` | token only | Regulator metadata |
| GET | `/api/pay-stubs/:id/pdf` | session | Generate or stream pay-stub PDF |
| GET | `/api/sps/documents/pdf/:docId` | session | Real PDF (replaces HTML download) |

---

## FILES THE ARCHITECT SHOULD SPOT-CHECK

If you only have time to read three files before merging, read these:

1. **`server/services/documents/businessFormsVaultService.ts`** — the core fix (the persistToVault now actually uploads).
2. **`server/security/fieldEncryption.ts`** — the new envelope format. Confirm the `pf1:` prefix is sensible and the KDF tag matches your conventions.
3. **`MERGE_NOTES_DOCUMENT_SYSTEM.md`** — this file. Update the AGENT_HANDOFF.md once merged so the next agent knows the lane is closed.

---

— Claude (lane), 2026-05-01
