# ════════════════════════════════════════════════════════════════════════
# COAILEAGUE REFACTOR — MASTER AGENT HANDOFF
# Updated: 2026-04-26 | Branch: refactor/service-layer
# ════════════════════════════════════════════════════════════════════════

## PLATFORM STATUS
- development:          34e110853  STABLE ✅ (Railway green)
- refactor/service-layer: active branch for Phase 2
- Real DB URL available for local testing (see Crash Rule 5)

---

## WHAT JUST HAPPENED — IMPORTANT CONTEXT FOR JACK

Phase 1 (route cleanup) is DONE and merged. But we had 5 deployment crashes
after merging because esbuild passes even when router variable names are
truncated. We found and fixed all of them:

  3f8fa625a  require('stripe') — ESM crash
  efb67b46a  ncidentPipelineRouter (1-char truncation)
  624ac4cf2  msRouter + stale stateRegulatoryRoutes import
  d9c9d498f  payrollTaxFormService broken import path
  6409ad5af  sRouter + complianceEnforcementRouter stale mount

All fixed. 41 routes smoke-tested against real Railway DB. Platform confirmed
stable. Phase 1 is truly complete.

---

## CRASH RULES (READ EVERY TURN — MANDATORY)

### CRASH 1 — Route mount prefix (not individual paths)
NEVER delete a route file based on individual path search alone.
Check MOUNT PREFIX first:
  grep -rn "/api/PREFIX" client/ | wc -l
  0 = safe to delete | >0 = keep file, trim dead handlers inside only

### CRASH 2 — ESM require() crashes Railway
package.json has type:module. ALL require() at runtime = crash.
SCAN BEFORE EVERY COMMIT:
  grep -rn "require(" server/ --include="*.ts" | grep -v "node_modules|.d.ts|//|build.mjs"
  Must return 0 lines.

### CRASH 3 — Broken router prefixes (IMPROVED SCANNER)
Brace-matcher cuts router names. esbuild passes it. Runtime crashes.
SCAN AFTER EVERY ROUTE/SERVICE DELETION:
  python3 -c "
import re, os
for root, dirs, files in os.walk('server/routes'):
  dirs[:] = [d for d in dirs if 'node_modules' not in d]
  for f in files:
    if not f.endswith('.ts'): continue
    c = open(os.path.join(root, f)).read()
    declared = set(re.findall(r'const (\w+Router)\s*=', c))
    declared |= set(re.findall(r'export const (\w+Router)', c))
    declared.add('router')
    used = set(re.findall(r'^([a-z]\w+Router)\.(get|post|put|patch|delete)', c, re.MULTILINE))
    diff = {v for v,_ in used} - declared
    if diff: print(f'BROKEN: {f}: {diff}')
  "
Must print nothing.

### CRASH 4 — Client file deletion breaks Vite build (ENOENT)
grep misses barrel exports and re-exports. Vite sees everything.
RULE: After any client file deletion, verify with:
  npx vite build 2>&1 | grep -E "ENOENT|error during|built in"
  ENOENT = restore from git immediately.
Never batch-delete client files without Vite verification first.

### CRASH 5 — Runtime crashes not caught by esbuild (MOST IMPORTANT)
esbuild bundles even broken router vars. Only full boot catches them.
MANDATORY BEFORE EVERY MERGE TO DEVELOPMENT:
  export DATABASE_URL="postgresql://postgres:MmUbhSxdkRGFLhBGGXGaWQeBceaqNmlj@metro.proxy.rlwy.net:40051/railway"
  export SESSION_SECRET="coaileague-dev-test-session-secret-32chars"
  node dist/index.js > /tmp/boot_test.txt 2>&1 &
  sleep 18
  curl -s http://localhost:5000/api/workspace/health   # must return {"message":"Unauthorized"}
  grep -E "ReferenceError|is not defined|CRITICAL.*Failed" /tmp/boot_test.txt | grep -v "GEMINI"
  # must return 0 lines

---

## MANDATORY PRE-MERGE CHECKLIST (ALL AGENTS, EVERY MERGE)

1. node build.mjs                          — Must: Server build complete
2. grep require( server/ ...               — Must: 0 lines
3. Python router scan                      — Must: 0 output
4. Boot test with real DB + curl health    — Must: 401 + 0 error lines
5. npx vite build (client changes only)    — Must: built in X.XXs

---

## JACK'S FINAL PASS — PHASE 1 COMPLETION SWEEP

Jack: before we move to Phase 2, run a final audit sweep on the
refactor/route-cleanup branch to confirm it matches development.

Branch tips:
  development:            34e110853
  refactor/service-layer: e3777a93f

### What Jack should audit on the current route layer:

1. Check if refactor/service-layer has absorbed all development fixes:
   git log --oneline development | head -10
   git log --oneline refactor/service-layer | head -10
   The service-layer branch needs to merge development to get the crash fixes.

2. Verify no remaining broken prefixes in server/routes/ using Crash Rule 3 scanner.

3. Verify no remaining stale imports of deleted route files:
   grep -rn "trainingRoutes|performanceRoutes|complianceRoutes|schedulerRoutes|workflowRoutes|workflowConfigRoutes|dispatchRouter|gpsRoutes|offboardingRoutes|stateRegulatoryRoutes|complianceEnforcementRouter|aiOrchestraRoutes" server/ --include="*.ts" | grep "import|require|app.use"

4. Verify no remaining require() calls:
   grep -rn "require(" server/ --include="*.ts" | grep -v "node_modules|.d.ts|//|build.mjs"

5. Run full boot test (Crash Rule 5) on the service-layer branch.

Once clean: open PR from refactor/service-layer → development.

---

## PHASE 2 — SERVICE LAYER REFACTOR (CURRENT BRANCH: refactor/service-layer)

### What's done on refactor/service-layer so far:
  server/services/github/githubClient.ts          DELETED  -61L
  server/services/autonomy/migrateExistingRates   DELETED  -226L
  server/services/ai-brain/aiOrchestraService.ts  DELETED  -766L
  server/services/ai-brain/codebaseAwareness.ts   DELETED  -670L
  server/services/ai-brain/autonomousWorkflow...  DELETED  -242L
  server/services/ai-brain/alertManager.ts        DELETED  -230L
  server/services/ai-brain/agentCache.ts          DELETED  -176L
  server/services/ai-brain/agentHealthMonitor.ts  DELETED  -160L
  server/services/ai-brain/skills/timeAnomaly...  DELETED  -441L
  server/services/ai-brain/skills/seasonalOrch... DELETED  -915L
  server/services/ai-brain/streaming/trinityWS... DELETED  -221L
  server/routes/aiOrchestraRoutes.ts              DELETED  -576L (cascade)
  client/src/config/apiEndpoints.ts               TRIMMED  -28L
  PHASE 2 TOTAL SO FAR: ~4,712L

### Jack's Phase 2 audit targets (service directories):

**METHODOLOGY — same as routes but for services:**
  # Check if a service FILE is imported anywhere
  base="serviceName"
  grep -rn "import.*${base}" server/ client/ --include="*.ts" --include="*.tsx" | grep -v "${base}.ts"
  # 0 results = safe to delete

**Priority targets for Jack to audit:**

1. server/services/ai-brain/ subdirectories (partially done):
   - agent/          (stateVerificationService, alternativeStrategyService, goalMetricsService, goalExecutionService)
   - subagents/      (notificationSubagent, invoiceSubagent, gamificationActivationAgent — 1 caller each)
   - tools/          (all have 2-5 callers — keep, but verify callers are real)
   - trinity-orchestration/  (scan all)

2. server/services/scheduling/
   - trinityAutonomousScheduler.ts (3,199L) — verify callers
   - advancedSchedulingService.ts  — verify callers

3. server/services/businessInsights/
   - businessContextService.ts (551L) — 1 caller in trinityChatService

4. server/services/gamification/   (1,512L) — 14 callers, but verify they are real routes

5. server/services/uacp/            (2,142L) — 6 callers, verify

6. server/services/helposService/   (708L) — 2 callers, verify

**Format Jack's audit should deliver:**
  For each service file:
    DEAD: server/services/X/Y.ts — 0 callers confirmed
    ALIVE: server/services/X/Y.ts — N callers at [list files]

---

## PROCESS RULES (UNCHANGED)
- All cleanup work on refactor/service-layer branch, NOT development
- PR → boot test with real DB → merge to development
- Commit after every domain, not after every file
- Build + boot test before every push

---

## DB ACCESS (Claude has this, share with context for Jack)
Real Railway DB for local testing:
  DATABASE_URL=postgresql://postgres:MmUbhSxdkRGFLhBGGXGaWQeBceaqNmlj@metro.proxy.rlwy.net:40051/railway
  SESSION_SECRET=coaileague-dev-test-session-secret-32chars
Use for boot test only — never commit to files.
