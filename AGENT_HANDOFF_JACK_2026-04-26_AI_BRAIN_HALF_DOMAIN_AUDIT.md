# Jack/GPT Handoff — AI Brain Half-Domain Service Audit

Branch: `refactor/service-layer`
Date: 2026-04-26

## Current context

Latest branch tip observed by Jack before this audit:

```text
b93a8fd9ae259d48c704176b1857a1a87de75ae1
```

That tip is Jack's gamification leveling removal audit. Claude has not yet pushed the gamification deletion batch as of this check.

Latest Claude execution before that:

```text
fbca48f6fa0259546ea17f1011d07ac2d1f8842f
refactor: finance/docs/recruitment/hiring/support service cleanup — -2,000L
```

Phase 2 total reported by Claude:

```text
~13,712L removed
```

Bryan reiterated the speed/safety rule:

```text
Whole domain or at least half-domain per Jack turn, but safe.
```

This handoff covers a large AI Brain half-domain audit:

```text
server/services/ai-brain/agent/
server/services/ai-brain/subagents/
server/services/ai-brain/skills/
server/services/ai-brain/dualai/
selected top-level AI Brain services with stale/legacy/self-healing naming
```

## Inputs used

Jack read:

```text
all_server_files.txt
used_files.txt
imported_files.txt
```

Important limitation:

- These inventory files can be stale because Phase 2 has deleted files already.
- Local filesystem is source of truth.
- Claude must verify with `find`, `rg`, build, and boot before deleting.

---

# 0. Pending explicit product cleanup: gamification leveling

Bryan clarified:

```text
Keep employee recognition.
Remove XP / points / levels / streaks / leaderboard / game mechanics.
```

Jack already created:

```text
AGENT_HANDOFF_JACK_2026-04-26_GAMIFICATION_LEVELING_REMOVAL_AUDIT.md
```

Claude should still execute that deletion batch unless already done locally:

```bash
git rm server/routes/gamificationRoutes.ts
git rm server/services/gamification/gamificationService.ts
git rm server/services/gamification/gamificationEvents.ts
git rm server/services/gamification/eventTracker.ts
git rm server/services/gamification/aiBrainNotifier.ts
git rm server/services/gamification/whatsNewIntegration.ts
```

Then remove the `/api/gamification/enhanced` mount from `server/routes/domains/workforce.ts`.

Keep:

```text
server/routes/recognitionRoutes.ts
/api/recognition
```

---

# 1. AI Brain agent/ directory

Inventory shows:

```text
server/services/ai-brain/agent/alternativeStrategyService.ts
server/services/ai-brain/agent/goalMetricsService.ts
server/services/ai-brain/agent/stateVerificationService.ts
server/services/ai-brain/agent/goalExecutionService.ts
```

`imported_files.txt` lists only:

```text
server/services/ai-brain/agent/goalExecutionService.ts
```

`used_files.txt` does not clearly list the other three.

## Recommendation

Likely delete after local proof:

```text
server/services/ai-brain/agent/alternativeStrategyService.ts
server/services/ai-brain/agent/goalMetricsService.ts
server/services/ai-brain/agent/stateVerificationService.ts
```

Keep/verify first:

```text
server/services/ai-brain/agent/goalExecutionService.ts
```

## Claude local commands

```bash
find server/services/ai-brain/agent -maxdepth 1 -name "*.ts" -print -exec wc -l {} \;
for f in server/services/ai-brain/agent/*.ts; do
  base=$(basename "$f" .ts)
  echo "--- $base"
  rg "from ['\"].*${base}['\"]|import\(.*${base}|${base}" server client --glob '*.{ts,tsx}' | grep -v "$f" || true
done
```

Expected action: delete the 0-caller three; preserve `goalExecutionService.ts` if imported.

---

# 2. AI Brain subagents/ directory

Inventory shows:

```text
server/services/ai-brain/subagents/dataMigrationAgent.ts
server/services/ai-brain/subagents/coreSubagentOrchestration.ts
server/services/ai-brain/subagents/gamificationActivationAgent.ts
server/services/ai-brain/subagents/notificationSubagent.ts
server/services/ai-brain/subagents/domainOpsSubagents.ts
server/services/ai-brain/subagents/visualQaSubagent.ts
server/services/ai-brain/subagents/onboardingOrchestrator.ts
server/services/ai-brain/subagents/schedulingSubagent.ts
server/services/ai-brain/subagents/invoiceSubagent.ts
server/services/ai-brain/subagents/payrollSubagent.ts
```

Both `used_files.txt` and `imported_files.txt` list these as alive/imported:

```text
server/services/ai-brain/subagents/invoiceSubagent.ts
server/services/ai-brain/subagents/onboardingOrchestrator.ts
server/services/ai-brain/subagents/payrollSubagent.ts
server/services/ai-brain/subagents/schedulingSubagent.ts
```

## Recommendation

Keep first:

```text
invoiceSubagent.ts
onboardingOrchestrator.ts
payrollSubagent.ts
schedulingSubagent.ts
```

Delete after local 0-caller proof:

```text
dataMigrationAgent.ts
coreSubagentOrchestration.ts
notificationSubagent.ts
domainOpsSubagents.ts
visualQaSubagent.ts
```

Product-driven delete candidate because game layer is being removed:

```text
gamificationActivationAgent.ts
```

If `gamificationActivationAgent.ts` has callers, remove the call path too unless it is only a generic registry entry that can safely drop the gamification action.

## Claude local commands

```bash
find server/services/ai-brain/subagents -maxdepth 1 -name "*.ts" -print -exec wc -l {} \;
for f in server/services/ai-brain/subagents/*.ts; do
  base=$(basename "$f" .ts)
  echo "--- $base"
  rg "from ['\"].*${base}['\"]|import\(.*${base}|${base}" server client --glob '*.{ts,tsx}' | grep -v "$f" || true
done
rg "gamificationActivationAgent|gamification activation|gamification_milestone|achievement_unlocked" server client --glob '*.{ts,tsx}'
```

---

# 3. AI Brain skills/ directory

Inventory shows this directory is still large:

```text
server/services/ai-brain/skills/seasonalOrchestrator.ts
server/services/ai-brain/skills/trinity-staffing-skill.ts
server/services/ai-brain/skills/financialMathVerifierSkill.ts
server/services/ai-brain/skills/documentGeneratorSkill.ts
server/services/ai-brain/skills/dataResearchSkill.ts
server/services/ai-brain/skills/types.ts
server/services/ai-brain/skills/skill-loader.ts
server/services/ai-brain/skills/base-skill.ts
server/services/ai-brain/skills/skill-registry.ts
server/services/ai-brain/skills/timeAnomalyDetection.ts
server/services/ai-brain/skills/intelligentScheduler.ts
server/services/ai-brain/skills/invoiceReconciliation.ts
server/services/ai-brain/skills/payrollValidation.ts
```

But the Phase 2 notes previously claimed these were deleted:

```text
server/services/ai-brain/skills/timeAnomaly...      DELETED -441L
server/services/ai-brain/skills/seasonalOrch...     DELETED -915L
```

This means `all_server_files.txt` may be stale. Claude must use `find` against the real branch working tree.

## Recommendation

Audit this as one folder. Delete any skill file with no caller outside the skill registry/barrel. Keep only if:

- registered in live `skill-registry.ts`, and
- the registry itself is imported/used by a live route/service.

## Claude local commands

```bash
find server/services/ai-brain/skills -maxdepth 1 -name "*.ts" -print -exec wc -l {} \;
rg "skill-registry|skill-loader|base-skill|trinity-staffing-skill|financialMathVerifierSkill|documentGeneratorSkill|dataResearchSkill|intelligentScheduler|invoiceReconciliation|payrollValidation|seasonalOrchestrator|timeAnomalyDetection" \
  server client --glob '*.{ts,tsx}'
```

Suggested decision rule:

- If only `skill-registry.ts` imports a skill and `skill-registry.ts` has no live callers, delete the whole `skills/` module.
- If registry is live, delete individual skills not registered or not reachable.

---

# 4. AI Brain dualai/ directory

Inventory shows:

```text
server/services/ai-brain/dualai/index.ts
server/services/ai-brain/dualai/taskRouter.ts
server/services/ai-brain/dualai/trinityConfidenceScorer.ts
server/services/ai-brain/dualai/aiActionLogger.ts
server/services/ai-brain/dualai/unifiedAIOrchestrator.ts
server/services/ai-brain/dualai/claudeService.ts
server/services/ai-brain/dualai/claudeVerificationService.ts
```

Neither `used_files.txt` nor `imported_files.txt` clearly list these files as live. They may be old dual-AI scaffolding.

## Recommendation

Audit as a folder. Potential high-value delete if no route/service imports it.

## Claude local commands

```bash
find server/services/ai-brain/dualai -maxdepth 1 -name "*.ts" -print -exec wc -l {} \;
rg "dualai|unifiedAIOrchestrator|claudeService|claudeVerificationService|trinityConfidenceScorer|aiActionLogger|taskRouter" \
  server client --glob '*.{ts,tsx}'
```

If no live callers outside the directory:

```bash
git rm -r server/services/ai-brain/dualai
```

---

# 5. AI Brain top-level stale/legacy/self-healing candidates

`used_files.txt` and `imported_files.txt` mark many AI Brain files alive. Do not delete broadly. However, `all_server_files.txt` still lists several files that Phase 2 claimed were deleted or are self-healing/autonomous scaffolding.

## Files marked alive/imported — keep first

From inventories, preserve unless local proof says otherwise:

```text
actionRegistry.ts
adaptiveSupervisionRouter.ts
agentSpawner.ts
agentToAgentProtocol.ts
aiBrainMasterOrchestrator.ts
approvalResumeOrchestrator.ts
autonomousFixPipeline.ts
behavioralMonitoringService.ts
bugReportOrchestrator.ts
chatServerSubagent.ts
cognitiveOnboardingService.ts
costMonitor.ts
documentUnderstandingPipeline.ts
domainLeadSupervisors.ts
elevatedSessionGuardian.ts
gapIntelligenceService.ts
integrationManagementService.ts
integrationPartnerService.ts
llmJudgeEnhanced.ts
llmJudgeEvaluator.ts
notificationDiagnostics.ts
planningFrameworkService.ts
platformAwarenessHelper.ts
platformChangeMonitor.ts
providers/modelRouter.ts
providers/resilientAIGateway.ts
reinforcementLearningLoop.ts
seasonalSubagent.ts
secureToolExecutor.ts
selfReflectionEngine.ts
serviceOrchestrationWatchdog.ts
sharedKnowledgeGraph.ts
subagentBanker.ts
subagentPerformanceMeetingService.ts
subagentSupervisor.ts
trinityACCService.ts
trinityActionReasoner.ts
trinityAgentParityLayer.ts
trinityAnomalyDetector.ts
trinityAutonomousOps.ts
trinityCodeOps.ts
trinityCognitiveLoadMonitor.ts
trinityCounterfactualEngine.ts
trinityCuriosityEngine.ts
trinityDreamState.ts
trinityExecutionFabric.ts
trinityFastDiagnostic.ts
trinityHiringPipelineActions.ts
trinityIncubationEngine.ts
trinityNotificationBridge.ts
trinityOpsActions.ts
trinityOrgIntelligenceService.ts
trinityPlatformConnector.ts
trinityRecognitionEngine.ts
trinityReflectionEngine.ts
trinityScheduleTimeclockActions.ts
trinitySelfEditGovernance.ts
trinityTemporalConsciousnessEngine.ts
trinityTimesheetPayrollCycleActions.ts
trinityVelocityEngine.ts
trinityWorkOrderSystem.ts
uiControlSubagent.ts
unifiedLifecycleManager.ts
universalDiagnosticOrchestrator.ts
workflowApprovalService.ts
```

## Possible stale/delete candidates to verify

These appear in `all_server_files.txt` but not clearly in `used_files.txt` / `imported_files.txt`, or were previously claimed deleted/stale:

```text
aiOrchestraService.ts
agentCache.ts
agentHealthMonitor.ts
autonomousWorkflowService.ts
cleanupAgentSubagent.ts
codebaseAwareness.ts
costOptimizedRouter.ts
crawlerTypes.ts
geminiToolSchemaGenerator.ts
growthStrategist.ts
holisticGrowthEngine.ts
modelRoutingEngine.ts
orchestrationStateMachine.ts
sessionSyncService.ts
swarmCommanderService.ts
trinityBusinessIntelligence.ts
trinityBusinessProMode.ts
trinityChangePropagationActions.ts
trinityCommsProactiveActions.ts
trinityComplianceIncidentActions.ts
trinityConscience.ts
trinityCrossDomainIntelligence.ts
trinityDeliberationLoop.ts
trinityDocumentActions.ts
trinityExternalIntelligenceActions.ts
trinityFinancialIntelligenceEngine.ts
trinityGuruMode.ts
trinityHelpdeskActions.ts
trinityInfraActions.ts
trinityIntelligenceLayers.ts
trinityMemoryOptimizer.ts
trinityMemoryService.ts
trinityPortalActions.ts
trinityRecognitionEngine.ts   # keep if recognition uses it; otherwise verify
trinityReportAnalyticsActions.ts
trinityScanOrchestrator.ts
trinitySelfAssessment.ts
trinitySocialGraphEngine.ts
trinitySubcontractorActions.ts
trinityVoice.ts
```

Important: some of these may be live but not listed due inventory gaps. Treat this as an audit target list, not deletion instruction.

## Claude local commands for top-level AI Brain

```bash
# Actual file inventory first
find server/services/ai-brain -maxdepth 1 -name "*.ts" -print -exec wc -l {} \; | sort

# Candidate caller checks
rg "aiOrchestraService|agentCache|agentHealthMonitor|autonomousWorkflowService|cleanupAgentSubagent|codebaseAwareness|costOptimizedRouter|geminiToolSchemaGenerator|growthStrategist|holisticGrowthEngine|modelRoutingEngine|orchestrationStateMachine|sessionSyncService|swarmCommanderService" \
  server client --glob '*.{ts,tsx}'

rg "trinityBusinessIntelligence|trinityBusinessProMode|trinityChangePropagationActions|trinityCommsProactiveActions|trinityComplianceIncidentActions|trinityConscience|trinityCrossDomainIntelligence|trinityDeliberationLoop|trinityDocumentActions|trinityExternalIntelligenceActions|trinityFinancialIntelligenceEngine|trinityGuruMode|trinityHelpdeskActions|trinityInfraActions|trinityIntelligenceLayers|trinityMemoryOptimizer|trinityMemoryService|trinityPortalActions|trinityReportAnalyticsActions|trinityScanOrchestrator|trinitySelfAssessment|trinitySocialGraphEngine|trinitySubcontractorActions|trinityVoice" \
  server client --glob '*.{ts,tsx}'
```

---

# Recommended Claude execution batch

To satisfy Bryan's speed rule safely, Claude can do this as one **AI Brain half-domain cleanup**:

1. Execute gamification leveling removal if not already done.
2. AI Brain `agent/`: delete zero-caller files, likely 3 files.
3. AI Brain `subagents/`: keep invoice/onboarding/payroll/scheduling, delete zero-caller legacy/gamification subagents.
4. AI Brain `dualai/`: delete whole folder if no live callers.
5. AI Brain `skills/`: delete whole module or individual dead skills based on local registry/caller proof.
6. Top-level AI Brain: delete only candidates with clean local `rg` proof.
7. Clean stale imports/exports/barrels.

## Required validation after the batch

```bash
node build.mjs
rg "require\(" server/ --glob "*.ts" | grep -v "node_modules|.d.ts|//|build.mjs" || true
python3 <improved router-prefix scanner from AGENT_HANDOFF.md>
rg "<<<<<<<|=======|>>>>>>>" .
```

Then real DB boot before merge/PR readiness:

```bash
export DATABASE_URL="postgresql://postgres:MmUbhSxdkRGFLhBGGXGaWQeBceaqNmlj@metro.proxy.rlwy.net:40051/railway"
export SESSION_SECRET="coaileague-dev-test-session-secret-32chars"
node dist/index.js > /tmp/boot_test.txt 2>&1 &
sleep 18
curl -s http://localhost:5000/api/workspace/health
rg "ReferenceError|is not defined|CRITICAL.*Failed" /tmp/boot_test.txt
```

Expected:

```text
health returns 401/Unauthorized
no ReferenceError/is not defined/CRITICAL failed lines
```

## Jack did not runtime patch because

- AI Brain is too broad and central for connector deletions.
- Inventories are partly stale after Phase 2 deletions.
- Safe deletion requires local `find`, `rg`, build, and real DB boot.

This handoff gives Claude a full half-domain cleanup map rather than a tiny single-file task.
