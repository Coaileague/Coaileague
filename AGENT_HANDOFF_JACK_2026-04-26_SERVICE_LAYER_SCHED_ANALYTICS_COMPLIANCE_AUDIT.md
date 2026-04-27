# Jack/GPT Handoff — Service Layer Audit: Scheduling + Analytics + Compliance

Branch: `refactor/service-layer`
Date: 2026-04-26

## Notes Read

Jack read the latest `AGENT_HANDOFF.md` from `development` and `refactor/service-layer` context.

Current branch context:

```text
Phase 1 route layer cleanup: COMPLETE, merged to development, ~24,335L removed
Phase 2 service layer cleanup: IN PROGRESS on refactor/service-layer
```

Latest refactor/service-layer tip observed by Jack:

```text
f83739a70d4170091657c27bb12f00fabcf3df00
Merge branch 'development' into refactor/service-layer
```

Claude's notes say Phase 1 had 5 post-merge crashes, all fixed, with 41 routes smoke-tested against the real Railway DB. Treat Phase 1 as complete. Do **not** reopen route cleanup unless a crash fix requires it.

## Crash Lessons To Preserve

Before any merge to development:

```bash
node build.mjs
grep -rn "require(" server/ --include="*.ts" | grep -v "node_modules|.d.ts|//|build.mjs"
python3 <improved router-prefix scanner from AGENT_HANDOFF.md>
# full real-DB boot test from Crash Rule 5
```

For client file deletion:

```bash
npx vite build
```

Do not trust grep-only import checks for client files because Vite/barrels can still resolve deleted files.

---

# Audit Inputs Used

Jack read/fetched:

```text
AGENT_HANDOFF.md
server/services/scheduling/index.ts
server/services/analytics/index.ts
server/services/compliance/complianceService.ts
used_files.txt
imported_files.txt
```

Jack also searched for import/caller evidence for scheduling, analytics, and compliance service names.

Important limitation: GitHub connector search is noisy because generated files like `services.txt`, `all_server_files.txt`, `used_files.txt`, and docs dominate search results. Claude must verify locally with `rg` on the active branch.

---

# 1. Scheduling Services Audit

Directory target:

```text
server/services/scheduling/
```

Known files from inventory:

```text
server/services/scheduling/index.ts
server/services/scheduling/historicalScheduleImporter.ts
server/services/scheduling/schedulingEnhancementsService.ts
server/services/scheduling/officerDeactivationHandler.ts
server/services/scheduling/trinityShiftGenerator.ts
server/services/scheduling/trinityOrchestrationBridge.ts
server/services/scheduling/trinityAutonomousScheduler.ts
server/services/scheduling/onCallEnforcementService.ts
server/services/scheduling/recurringScheduleTemplates.ts
server/services/scheduling/autonomousSchedulingDaemon.ts
```

## Scheduling index findings

`server/services/scheduling/index.ts` is a barrel that re-exports:

```text
trinityAutonomousScheduler
historicalScheduleImporter
recurringScheduleTemplates
autonomousSchedulingDaemon
schedulingComplianceService
clientPreferenceService
trinitySchedulingAI
escalationChainService  # has @ts-expect-error in index
registerSchedulingWithOrchestration
checkSchedulingGovernance
getSchedulingOrchestrationStatus
```

The `@ts-expect-error` around `escalationChainService` is a smell. Claude should verify whether `trinityAutonomousScheduler.ts` actually exports it. If not used, remove the export from the barrel.

## Scheduling alive evidence

From `used_files.txt` / `imported_files.txt`, these appear alive or imported:

```text
server/services/scheduling/autonomousSchedulingDaemon.ts
server/services/scheduling/officerDeactivationHandler.ts
server/services/scheduling/trinityOrchestrationBridge.ts
server/services/advancedSchedulingService.ts  # root service, not scheduling directory
```

Additional search showed `trinityAutonomousScheduler` tied to:

```text
server/routes/autonomousSchedulingRoutes.ts
server/services/ai-brain/actionRegistry.ts
```

Treat `trinityAutonomousScheduler.ts` as alive until local exact checks prove otherwise.

## Scheduling delete candidates after local verification

Potential zero-caller files if only referenced by the barrel:

```text
server/services/scheduling/historicalScheduleImporter.ts
server/services/scheduling/schedulingEnhancementsService.ts
server/services/scheduling/trinityShiftGenerator.ts
server/services/scheduling/onCallEnforcementService.ts
server/services/scheduling/recurringScheduleTemplates.ts
```

Important: `recurringScheduleTemplates.ts` is re-exported from `index.ts`; local `rg` must check whether callers import it through the barrel.

## Claude scheduling commands

```bash
find server/services/scheduling -maxdepth 1 -name "*.ts" -print -exec wc -l {} \;

for f in server/services/scheduling/*.ts; do
  base=$(basename "$f" .ts)
  echo "--- $f / $base"
  rg "from ['\"].*${base}['\"]|import\(.*${base}" server client --glob '*.{ts,tsx}' | grep -v "$f" || true
done

rg "historicalScheduleImporter|schedulingEnhancementsService|trinityShiftGenerator|onCallEnforcementService|recurringScheduleTemplates" server client --glob '*.{ts,tsx}'
rg "trinityAutonomousScheduler|autonomousSchedulingDaemon|officerDeactivationHandler|trinityOrchestrationBridge" server client --glob '*.{ts,tsx}'
rg "escalationChainService|schedulingComplianceService|clientPreferenceService|trinitySchedulingAI" server/services/scheduling server/routes server/services --glob '*.ts'
```

Recommended action:

- Keep `trinityAutonomousScheduler.ts`, `autonomousSchedulingDaemon.ts`, `officerDeactivationHandler.ts`, `trinityOrchestrationBridge.ts` unless local evidence says otherwise.
- Delete the candidate files only if no caller remains outside `server/services/scheduling/index.ts`.
- If deleting candidates, clean `server/services/scheduling/index.ts` exports at the same time.

---

# 2. Analytics Services Audit

Primary file read:

```text
server/services/analytics/index.ts
```

The file is a compatibility barrel that re-exports and dynamically imports:

```text
analyticsDataService
advancedAnalyticsService
analyticsAIService
advancedUsageAnalyticsService
businessOwnerAnalyticsService
analyticsStats
roomAnalyticsService
```

It also exports `unifiedAnalytics` with dynamic import wrappers.

## Analytics findings

Connector search for direct imports of these services mostly surfaced:

```text
server/services/analytics/index.ts
docs / inventory files
```

This suggests the analytics barrel and/or several analytics services may be dead, but it is not safe to delete from connector evidence because analytics pages/routes may import methods dynamically or via service objects.

## Analytics delete candidates after local verification

Potential candidates if local `rg` confirms no caller outside the barrel/docs:

```text
server/services/analytics/index.ts
server/services/advancedAnalyticsService.ts
server/services/analyticsDataService.ts
server/services/analyticsAIService.ts
server/services/advancedUsageAnalyticsService.ts
server/services/businessOwnerAnalyticsService.ts
server/services/analyticsSnapshotService.ts
server/services/analyticsStats.ts
server/services/roomAnalyticsService.ts
server/services/businessOwnerAnalyticsService.ts
```

`server/services/advancedAnalyticsService.ts` was previously listed by handoff as `740L, 2 callers — verify`; do not delete until those 2 callers are proven docs/barrels only.

## Claude analytics commands

```bash
# Find real callers, excluding inventories/docs where possible
rg "advancedAnalyticsService|analyticsDataService|analyticsAIService|advancedUsageAnalyticsService|businessOwnerAnalyticsService|analyticsSnapshotService|getAnalyticsStats|roomAnalyticsService|unifiedAnalytics" \
  server client --glob '*.{ts,tsx}' \
  --glob '!services.txt' --glob '!all_server_files.txt' --glob '!used_files.txt' --glob '!imported_files.txt'

# Direct import paths
rg "from ['\"].*analytics|from ['\"].*advancedAnalyticsService|from ['\"].*analyticsDataService|from ['\"].*analyticsAIService|from ['\"].*businessOwnerAnalyticsService" \
  server client --glob '*.{ts,tsx}'

# Route/page surfaces that may need analytics services
rg "/api/analytics|analytics" server/routes client/src/pages client/src/components --glob '*.{ts,tsx}'
```

Recommended action:

- If `server/services/analytics/index.ts` has no real imports, delete the barrel first only if all dynamic dependencies are independently live or dead.
- Delete standalone analytics services only when they have zero real imports outside docs/inventories/barrels.
- If routes still use analytics endpoints but only return stubs, consider trimming exported methods, not necessarily whole files.

---

# 3. Compliance Services Audit

Directory target:

```text
server/services/compliance/
```

Known files from inventory:

```text
auditorService.ts
complianceService.ts
complianceScenarioRunner.ts
documentPipelineBridge.ts
stateRegulatoryKnowledgeBase.ts
financialAuditService.ts
stateComplianceConfig.ts
officerComplianceScoreService.ts
certificationTypes.ts
trinityComplianceEngine.ts
complianceEnforcementService.ts
complianceScoringBridge.ts
regulatoryViolationService.ts
```

## Compliance alive evidence

From `used_files.txt` / `imported_files.txt`, only these were clearly listed as used/imported:

```text
server/services/compliance/complianceScoringBridge.ts
server/services/compliance/documentPipelineBridge.ts
```

`complianceService.ts` is small and was fetched by Jack. It exports `complianceService` with:

```text
createAlert()
getActiveAlerts()
```

It did **not** appear in the inventory evidence Jack read, so Claude should verify its real callers. It may be dead or may be dynamically referenced by Trinity actions.

## Compliance delete candidates after local verification

Potential zero-caller candidates if local `rg` confirms no real imports:

```text
server/services/compliance/auditorService.ts
server/services/compliance/complianceService.ts
server/services/compliance/complianceScenarioRunner.ts
server/services/compliance/stateRegulatoryKnowledgeBase.ts
server/services/compliance/financialAuditService.ts
server/services/compliance/stateComplianceConfig.ts
server/services/compliance/officerComplianceScoreService.ts
server/services/compliance/certificationTypes.ts
server/services/compliance/trinityComplianceEngine.ts
server/services/compliance/complianceEnforcementService.ts
server/services/compliance/regulatoryViolationService.ts
```

Keep/verify alive first:

```text
server/services/compliance/complianceScoringBridge.ts
server/services/compliance/documentPipelineBridge.ts
```

## Claude compliance commands

```bash
find server/services/compliance -maxdepth 1 -name "*.ts" -print -exec wc -l {} \;

for f in server/services/compliance/*.ts; do
  base=$(basename "$f" .ts)
  echo "--- $f / $base"
  rg "from ['\"].*${base}['\"]|import\(.*${base}" server client --glob '*.{ts,tsx}' | grep -v "$f" || true
done

rg "complianceService|auditorService|complianceScenarioRunner|stateRegulatoryKnowledgeBase|financialAuditService|stateComplianceConfig|officerComplianceScoreService|trinityComplianceEngine|complianceEnforcementService|regulatoryViolationService|complianceScoringBridge|documentPipelineBridge" \
  server client --glob '*.{ts,tsx}' \
  --glob '!services.txt' --glob '!all_server_files.txt' --glob '!used_files.txt' --glob '!imported_files.txt'
```

Recommended action:

- Keep `complianceScoringBridge.ts` and `documentPipelineBridge.ts` unless local proof says otherwise.
- Delete other compliance service files only if local import and dynamic import scans are clean.
- Be cautious with `stateRegulatoryKnowledgeBase.ts` and `stateComplianceConfig.ts` because old route-layer crashes involved stale state regulatory references; if removed, rerun stale-reference scan.

---

# Service-Layer Execution Checklist For Claude

Run before and after deletion batch:

```bash
node build.mjs
rg "require(" server/ --include="*.ts" | grep -v "node_modules|.d.ts|//|build.mjs" || true
python3 <improved router-prefix scanner from AGENT_HANDOFF.md>
rg "<<<<<<<|=======|>>>>>>>" .
```

After deletions, run real boot test before PR/merge:

```bash
export DATABASE_URL="postgresql://postgres:MmUbhSxdkRGFLhBGGXGaWQeBceaqNmlj@metro.proxy.rlwy.net:40051/railway"
export SESSION_SECRET="coaileague-dev-test-session-secret-32chars"
node dist/index.js > /tmp/boot_test.txt 2>&1 &
SERVER_PID=$!
sleep 18
curl -s http://localhost:5000/api/workspace/health
grep -E "ReferenceError|is not defined|CRITICAL.*Failed" /tmp/boot_test.txt | grep -v "GEMINI"
kill $SERVER_PID
```

# Recommended Claude Batch

One local batch can likely cover all three domains:

1. Scheduling: delete only files with zero callers outside `index.ts`.
2. Analytics: identify whether analytics barrel is dead; delete standalone analytics files with zero real imports.
3. Compliance: keep scoring/document bridges, delete zero-caller compliance services.
4. Clean barrel exports and stale imports.
5. Build + require scan + boot test.
6. Update `AGENT_HANDOFF.md` with new Phase 2 total.

## Why Jack Did Not Runtime Patch

This is a service-layer audit, not a route handler edit. GitHub connector search is noisy due to generated inventory/docs, and service deletion requires full local `rg`, build, and real-DB boot validation. Jack therefore committed this execution map for Claude rather than deleting files through the connector.
