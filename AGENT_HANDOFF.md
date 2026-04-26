# ════════════════════════════════════════════════════════════════════════
# COAILEAGUE REFACTOR — MASTER AGENT HANDOFF
# Updated: 2026-04-26 | Agents: Claude (execute) + Jack/GPT (audit)
# ════════════════════════════════════════════════════════════════════════

## PLATFORM STATUS
- development: 63962de69 STABLE
- refactor/service-layer: 99a085dfb (active)
- Railway: deploying 63962de69

---

## CRASH RULES (READ EVERY TURN)

### CRASH 1 - Route mount prefix (not individual paths)
NEVER delete a route file based on individual path search alone.
Check MOUNT PREFIX first:
  grep -rn "/api/PREFIX" client/ | wc -l
  0 = safe to delete | >0 = keep file, trim dead handlers inside only
Individual handler: grep -rn "/api/PREFIX/path" client/ server/ | grep -v FILENAME.ts

### CRASH 2 - ESM require() crashes Railway
package.json has type:module. ALL require() at runtime = crash.
SCAN BEFORE EVERY COMMIT:
  grep -rn "require(" server/ --include="*.ts" | grep -v "node_modules|.d.ts|// |build.mjs|Binary"
  Must return 0 lines.
Fixed files: server/index.ts, rfpComplexityScorer.ts, seedRegulatoryRules.ts,
  migrateExistingRates.ts, integrations-status.ts

### CRASH 3 - Broken router prefixes
After handler deletion brace-matcher cuts variable names (outer., uter., ter., ncident...)
esbuild passes it. Runtime crashes. Old scanner missed 1-char truncations.
SCAN AFTER EVERY ROUTE DELETION (improved — catches any truncation length):
  python3 -c "
import subprocess, re, os
for f in os.popen('find server/routes -name *.ts').read().split():
    c = open(f).read()
    declared = set(re.findall(r'const (\w+Router) = .*Router\(\)', c))
    used = set(re.findall(r'^([a-z]\w+Router)\.(get|post|put|patch|delete)', c, re.MULTILINE))
    diff = used - declared
    if diff: print(f'BROKEN: {f}: {diff}')
  "
Must print nothing.

### CRASH 4 - Client file deletion breaks Vite build (ENOENT)
grep finds 0 import lines but Vite resolves through re-exports and barrel files.
use-mobile.tsx had 75+ importers invisible to grep.
RULE: Delete ONE file, run npx vite build, ENOENT = restore from git.
  npx vite build 2>&1 | grep -E "ENOENT|error during|built in"
  Never batch-delete client files without Vite verification.

---

## MANDATORY CHECKLIST (ALL AGENTS, EVERY COMMIT)

1. node build.mjs                                    # Must: Server build complete
2. grep -rn "require(" server/ --include="*.ts" ...  # Must: 0 lines
3. grep -rn "^outer.|^uter.|^ter." server/routes/   # Must: 0 lines (after route changes)
4. npx vite build                                    # Must: built in X.XXs (after client changes)
5. node dist/index.js 2>&1 | head -6                # Must: DATABASE_URL only

---

## REFACTOR PLAN (Front to Back, Simplify then Enhance)

### PHASE 1: Route Layer - COMPLETE (-24,335L merged to development)

### PHASE 2: Service Layer - IN PROGRESS (refactor/service-layer)

DONE:
  server/services/github/githubClient.ts          DELETED  -61L
  server/services/autonomy/migrateExistingRates.ts DELETED -226L
  server/services/ai-brain/aiOrchestraService.ts  DELETED  -766L
  server/services/ai-brain/codebaseAwareness.ts   DELETED  -670L
  server/services/ai-brain/autonomousWorkflowSvc  DELETED  -242L
  server/services/ai-brain/alertManager.ts        DELETED  -230L
  server/services/ai-brain/agentCache.ts          DELETED  -176L
  server/services/ai-brain/agentHealthMonitor.ts  DELETED  -160L
  server/routes/aiOrchestraRoutes.ts              DELETED  -576L (cascade)
  client/src/config/apiEndpoints.ts               TRIMMED  -28L (34 dead entries)
  TOTAL: -3,135L

JACK NEXT - AI Brain subdirectories (audit for dead files):
  server/services/ai-brain/skills/           scan all .ts files
  server/services/ai-brain/subagents/        scan all .ts files
  server/services/ai-brain/tools/            scan all .ts files
  server/services/ai-brain/streaming/        scan all .ts files
  server/services/ai-brain/agent/            scan all .ts files
  server/services/ai-brain/trinity-orch.../  scan all .ts files
  server/services/ai-brain/providers/        geminiClient.ts 3481L - verify alive

JACK NEXT - Standalone candidates:
  server/services/businessInsights/businessContextService.ts  551L  1 caller (verify chain)
  server/services/ai/tokenExtractor.ts                         51L  0 callers - DELETE
  server/services/advancedAnalyticsService.ts                 740L  2 callers - verify
  server/services/helposService/helposService.ts              709L  2 callers - verify

JACK NEXT - Large service domains (trim dead exported functions, not whole files):
  server/services/compliance/    9113L  14 files  - audit exported functions
  server/services/scheduling/    6156L  12 files  - audit exported functions
  server/services/payroll/       5244L  29 files  - audit exported functions
  server/services/training/      3147L   4 files  - low callers, check for deletion

Audit command for exported functions:
  grep -n "^export function\|^export const\|^export async" FILEPATH
  For each export: grep -rn "EXPORT_NAME" server/ client/ | grep -v FILEPATH | grep import
  0 callers = remove that function

### PHASE 3: Client Dead Code - PAUSED (Vite required per file)

Current surface: 337 pages, 456 components, 91 hooks (~340,000L total)
Correct process:
  1. Baseline: npx vite build (confirm green)
  2. Delete ONE file
  3. npx vite build - ENOENT = restore + skip
  4. Clean = commit
  5. Repeat one at a time

Priority targets (pages never in App.tsx lazy imports):
  grep the page component name in App.tsx - if absent, candidate for deletion

### PHASE 4: Database Schema - PENDING
  661 tables, audit for never-queried tables
  grep table/model name across server/ - 0 callers = drop candidate

### PHASE 5: Enhancement - PENDING (after cleanup complete)
  Trinity action registry (<100 target, currently 101)
  TypeScript any-cast reduction in route handlers
  Service interface contracts (typed I/O)
  Query optimization on high-traffic routes

---

## BRANCH RULES

development           = stable production ONLY
                        Crash fixes go here directly
                        NEVER push bulk deletions here directly

refactor/[domain]     = all cleanup work
                        PR -> Railway preview -> merge to development
                        Full 5-step checklist before every merge

CURRENT BRANCHES:
  development             63962de69  stable, Railway deploying
  refactor/service-layer  99a085dfb  active work

---

## HANDOFF PROTOCOL

Jack turn end:
  Commit file: AGENT_HANDOFF_JACK_YYYY-MM-DD_DOMAIN.md
  Include: files audited | caller counts | local commands for Claude | why no runtime patch

Claude turn end:
  Run full 5-step checklist
  Commit to refactor/service-layer with clear message
  Update THIS file with what was done + new totals
  Push so Jack sees it on next pull

Turn order: Jack audits -> Claude executes -> Jack audits -> ...
Target pace: full domain or half domain per turn, commit and finish before handoff
