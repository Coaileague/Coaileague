# ═══════════════════════════════════════════════════════════
# AGENT SYNC BLOCK — CoAIleague Refactor
# Updated: 2026-04-26
# Branch: development (stable production)
# ═══════════════════════════════════════════════════════════

## CURRENT STATE ✅
- Platform: GREEN on Railway
- development tip: a57dbd0a6
- Active refactor branch: refactor/service-layer (96241b73c)

---

## ⚠️ CRASH HISTORY — READ BEFORE EVERY PASS ⚠️

These crashes have already happened. Every rule below is written in blood.

### CRASH 1 — Deleted route files with active frontend callers
**Cause:** Route audit checked individual handler paths (`/api/training/sessions`)
but missed mount prefix usage (`/api/training/courses`) in apiEndpoints.ts config.
**Fix:** Always check MOUNT PREFIX first, then individual paths.
```bash
grep -rn "/api/MOUNT_PREFIX" client/ | wc -l  # must be 0 to delete whole file
```

### CRASH 2 — `require is not defined in ES module scope`
**Cause:** Files using `require('fs')`, `require('path')`, `require('stripe')`,
`require.main === module` inside ESM context (package.json has `"type": "module"`).
**Files fixed so far:**
- server/index.ts — require('fs'), require('path')
- server/services/billing/rfpComplexityScorer.ts — require.main === module
- server/scripts/seedRegulatoryRules.ts — require.main === module
- server/services/autonomy/migrateExistingRates.ts — require.main === module
- server/routes/integrations-status.ts — require('stripe')
**Rule:** After ANY server-side deletion or edit, scan:
```bash
grep -rn "require(" server/ --include="*.ts" | grep -v "node_modules\|\.d\.ts\|// \|build\.mjs"
```
Zero results required before committing to development.

### CRASH 3 — Broken router prefixes after handler deletion
**Cause:** Brace-matcher cut into router variable names, leaving `outer.get(`,
`uter.post(`, `ter.delete(` etc. esbuild transpiles these without error but
they fail at runtime silently or corrupt the route registry.
**Rule:** After every route deletion batch:
```bash
grep -rn "^outer\.\|^uter\.\|^ter\.\|^er\." server/routes/ --include="*.ts" | grep -v "// "
# Must return 0 results
```

### CRASH 4 — Deleted client hooks with Vite ENOENT
**Cause:** grep-based caller audit found "0 import lines" for hooks, but Vite
resolves hooks through re-exports, barrel files, and dynamic patterns grep misses.
`use-mobile.tsx` was imported by 75+ files but our grep returned 0.
**Rule:** Client-side deletion (hooks, components, pages) REQUIRES Vite build:
```bash
# Delete the file, then immediately:
npx vite build 2>&1 | grep -E "ENOENT|error during|✓ built"
# If ENOENT → restore from git and mark ALIVE
# Only commit after ✓ built
```
**Never delete client files based on grep alone.**

---

## MANDATORY PRE-COMMIT CHECKLIST

Before ANY commit to development or any refactor branch merge:

```bash
# 1. Server build
node build.mjs
# Must show: ✅ Server build complete

# 2. ESM scan
grep -rn "require(" server/ --include="*.ts" | grep -v "node_modules\|\.d\.ts\|// \|build\.mjs"
# Must return 0 lines

# 3. Broken prefix scan (after route changes only)
grep -rn "^outer\.\|^uter\.\|^ter\.\|^er\." server/routes/ --include="*.ts" | grep -v "// "
# Must return 0 lines

# 4. Vite build (after ANY client-side deletion)
npx vite build 2>&1 | grep -E "ENOENT|error during|✓ built"
# Must show: ✓ built in X.XXs

# 5. Startup test
node dist/index.js 2>&1 | head -6 & sleep 6 && kill %1
# Must show only: DATABASE_URL must be set (no other errors)
```

---

## DOMAIN AUDIT METHODOLOGY

### Server routes (DONE ✅ — -24,335L)
1. Mount prefix check first: `grep -rn "/api/PREFIX" client/ | wc -l`
2. Only delete file if mount has 0 callers
3. Individual handler: `grep -rn "/api/PREFIX/path" client/ server/ | grep -v FILENAME`
4. Run broken-prefix scan after every batch
5. Build before commit

### Server services (IN PROGRESS)
1. `grep -rl "import.*BASENAME" server/ client/ | grep -v FILEPATH`
2. If 0 results → safe to delete
3. Build after deletion — esbuild catches missing imports correctly

### Client hooks/components/pages (REQUIRES VITE)
1. `grep -rn "HOOKNAME" client/ | grep -v FILEPATH | grep "import\|from"`
2. Even if 0 grep results → DELETE ONE FILE AT A TIME + `npx vite build`
3. If ENOENT → restore immediately + mark ALIVE
4. Never batch-delete client files without Vite verification

---

## WHAT'S DONE

### Route layer (-24,335L) ✅ MERGED TO DEVELOPMENT
- 10 route files deleted entirely
- 48 files trimmed, dead handlers removed
- All ESM fixes included
- HelpAI contract mismatches fixed

### Service layer (refactor/service-layer branch)
- server/services/github/ — DELETED (-61L)
- server/services/autonomy/migrateExistingRates.ts — DELETED (-226L)
- server/services/ai-brain/aiOrchestraService.ts — DELETED (-766L)
- server/services/ai-brain/codebaseAwareness.ts — DELETED (-670L)
- server/services/ai-brain/autonomousWorkflowService.ts — DELETED (-242L)
- server/services/ai-brain/alertManager.ts — DELETED (-230L)
- server/services/ai-brain/agentCache.ts — DELETED (-176L)
- server/services/ai-brain/agentHealthMonitor.ts — DELETED (-160L)
- server/routes/aiOrchestraRoutes.ts — DELETED (-576L, cascade)
- apiEndpoints.ts — 34 dead config entries removed (-28L)

### Client hooks — REVERTED (Vite build required before re-attempting)
Hooks appeared dead via grep but Vite build proved they were alive.
Do not re-attempt hook deletion without Vite build verification per file.

---

## NEXT DOMAINS (front-end to back-end, simplify → enhance)

### 1. Service layer continued (refactor/service-layer branch)
Jack: audit the following for dead import callers:
- `server/services/ai-brain/skills/` directory
- `server/services/ai-brain/subagents/` directory
- `server/services/ai-brain/tools/` directory
- `server/services/ai-brain/trinity-orchestration/` directory
- `server/services/scheduling/trinityAutonomousScheduler.ts` (3,199L)
- `server/services/businessInsights/businessContextService.ts` (552L)
- `server/services/advancedAnalyticsService.ts` (740L, 2 callers — verify)

For each: `grep -rl "import.*BASENAME" server/ client/ | grep -v FILEPATH`

### 2. Client dead code (VITE REQUIRED)
After service layer complete, return to client with correct process:
- Delete ONE file at a time
- Run `npx vite build` after each
- Commit only on clean Vite build
- Targets: unused pages, duplicate components, barrel re-exports

### 3. Schema audit (database)
- 661 tables, some never queried
- Same caller methodology applied to table/model names

---

## BRANCH RULES (NON-NEGOTIABLE)
- development = stable production — crash fixes only go here directly
- All refactor work on feature branch → PR → Railway preview → merge
- Never push bulk deletions directly to development
