# COAILEAGUE REFACTOR — MASTER HANDOFF
# ONE FILE ONLY. Update in place. Never create new handoff files.
# Last updated: 2026-04-27 — Claude (post Phase A sync)

---

## HOW THIS HANDOFF WORKS

**This is a back-and-forth relay between Jack (GPT/Copilot) and Claude.**

- Jack audits on `refactor/service-layer` — flags issues, documents findings, commits AGENT_HANDOFF.md
- Claude pulls Jack's findings, executes fixes on `development`, then syncs back to `refactor/service-layer`
- Neither agent moves to the next phase until the current one is reviewed by both
- **"Go" from Bryan = one turn for whichever agent is up**

**Current turn: JACK ← you are up**

---

## ACTIVE BRANCH
```
refactor/service-layer  →  synced with development as of this commit
```
Both agents work here. Never push directly to development without a passing boot test.

## DEVELOPMENT (Railway)
```
origin/development  →  5c7aef271  (STABLE ✅ GREEN)
```

---

## PHASE STATUS

| Phase | Domain | Status | Agent |
|---|---|---|---|
| 1 | Server routes dead code | ✅ Complete ~24,335L | Claude |
| 2 | Server services dead code | ✅ Complete ~22,931L | Claude |
| 3 | Client components dead code | ✅ Complete ~43,663L | Claude |
| 4 | Client contexts/hooks/config | ✅ Complete ~3,352L | Claude |
| 5 | Client pages | ✅ Complete ~1,211L | Claude |
| 6 | Shared/ dead code | ✅ Complete ~1,842L | Claude |
| **Total removed** | | **~97,334L** | |
| A | Auth & Session audit | ✅ Fixed, deployed | Claude |
| B | Financial flows audit | 🔄 NOT STARTED | Next: Jack audits |

---

## PHASE A — WHAT CLAUDE DID (Jack: please review)

**Branch:** `development` commit `5c7aef271`
**File:** `audit(Phase A): auth & session layer — fix 11 null dereferences`

### Architecture verified ✅
- `requireWorkspaceRole()` enforces both auth AND workspace scope in one guard — correct pattern
- Domain files (`ops.ts`, `workforce.ts`) mount all sub-routers with `requireAuth + ensureWorkspaceAccess` — per-route files don't need their own guards
- 45 route files have router-level guards (entire file protected)
- `internalResetRoutes` — correctly gated by constant-time header token, 404s when env var not set
- `bootstrapRoutes` — correctly blocked by `isProduction()` in prod
- SRA routes — separate `sraAuth` middleware chain (correct)

### Fixes applied
11 `req.user.X` accesses without optional chaining — runtime crash risk if middleware fails:
```
assisted-onboarding.ts    supportUserId: req.user.id → req.user?.id
                          getAssistedWorkspaces(req.user → req.user?
authRoutes.ts             req.user.email → req.user?.email
expenseRoutes.ts          uploadedBy: req.user.id → req.user?.id
formBuilderRoutes.ts      signedBy: req.user.id → req.user?.id
reportsRoutes.ts          getWorkspaceByOwnerId(req.user.id) → req.user?.id
trainingCertification.ts  officerId = req.user.id (×2) → req.user?.id
email/emailRoutes.ts      userId = req.user.id (×2), firstName/lastName
```

### Jack — please verify:
1. Are there any auth patterns Claude missed in the route files?
2. Is the session destroy on logout correctly clearing all session fields?
3. Any workspace_id scoping issues you see at the service layer (not just routes)?

---

## PHASE B — NEXT (Jack audits first)

**Jack's job:** Audit the core financial files for:
1. **FinancialCalculator not used** — these files do calculations without it:
   - `payrollTimesheetRoutes.ts` — no FinancialCalculator, no decimal.js
   - `payStubRoutes.ts` — no FinancialCalculator, no decimal.js
   - `financeRoutes.ts` — no FinancialCalculator, no decimal.js
   - `financeInlineRoutes.ts` — no FinancialCalculator, no decimal.js
2. **Missing Zod validation** — same 4 files have no `.safeParse()` or `.parse()` at API boundaries
3. **Transaction gaps** — `payStubRoutes.ts`, `financeRoutes.ts`, `financeInlineRoutes.ts` have 0 transactions but write to DB

**Files to audit:**
```
server/routes/payrollRoutes.ts         (1718L) ✅ FinancialCalc ✅ Zod
server/routes/payrollTimesheetRoutes.ts  (640L) ❌ no calc      ❌ no Zod
server/routes/payStubRoutes.ts           (285L) ❌ no calc      ❌ no Zod
server/routes/financeRoutes.ts           (183L) ❌ no calc      ❌ no Zod
server/routes/financeInlineRoutes.ts     (192L) ❌ no calc      ❌ no Zod
server/routes/invoiceRoutes.ts          (2880L) ✅ FinancialCalc ✅ Zod
server/routes/plaidRoutes.ts             (420L) needs audit
server/routes/stripeInlineRoutes.ts      (923L) needs audit
server/routes/billing-api.ts            (1587L) needs audit
```

**Jack: look inside each flagged file and tell Claude:**
- Does it actually do math (multiply hours × rate, add totals, etc.)?
- If yes — is it using FinancialCalculator or raw JS arithmetic?
- Are DB writes wrapped in transactions where multiple tables are touched?
- Is there Zod validation on the request body before any DB write?

Claude will then execute the fixes.

---

## MANDATORY PRE-COMMIT CHECKLIST (deletions only)

```bash
python3 scripts/verify-client-deletions.py
# Must print: ✅ All checks passed
```

**Boot test before pushing to development:**
```bash
export DATABASE_URL="postgresql://postgres:MmUbhSxdkRGFLhBGGXGaWQeBceaqNmlj@metro.proxy.rlwy.net:40051/railway"
export SESSION_SECRET="coaileague-dev-test-session-secret-32chars"
node build.mjs && node dist/index.js > /tmp/boot.txt 2>&1 &
sleep 18 && curl -s http://localhost:5000/api/workspace/health   # → {"message":"Unauthorized"}
grep -cE "ReferenceError|is not defined|CRITICAL.*Failed" /tmp/boot.txt  # → 0
kill %1
```

---

## THE 6 DELETION FAILURE PATTERNS (permanent)

1. **STATIC IMPORT** — `from './DeletedFile'` still in source
2. **DYNAMIC IMPORT** — `import('./DeletedFile')` in lazy/Suspense
3. **BARREL EXPORT** — `index.ts` still exports a deleted file
4. **BARREL NAMED EXPORT** — file imports `{ X }` from barrel but X was deleted
5. **ORPHANED JSX BODY** — import removed, `<Component />` left in render
6. **ORPHANED JSX PROPS** — opening tag removed, props block left as raw text

---

## BRANCH RULES (permanent)

- Jack audits on `refactor/service-layer`, Claude executes on `development`
- Sync direction: `development` → `refactor/service-layer` after every Claude turn
- Never merge `refactor/service-layer` into `development` (wrong direction)
- Claude runs verify script before every delete commit
- **Neither agent skips to next phase without the other reviewing current phase**

---

## PROCESS RULES

- Read this file at start of every turn
- Update it at end of every turn — current phase status, what was done, what's next
- Never create separate handoff files — one file, updated in place
- After Claude executes: sync development → refactor/service-layer and push
- After Jack audits: push refactor/service-layer with findings in this file

