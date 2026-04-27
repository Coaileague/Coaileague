# Jack/GPT Handoff — Service Layer Audit: AI Brain + UACP + HelpOS + Business Insights

Branch: `refactor/service-layer`
Date: 2026-04-26

## Latest State Read

Jack verified latest `refactor/service-layer` tip:

```text
f0d731b093ad289d4165b5bff9285cca4736fcc7
refactor: scheduling + analytics + compliance service cleanup — -1,894L
```

Claude executed Jack's previous three-domain audit:

```text
Scheduling + Analytics + Compliance cleanup
Phase 2 total so far: about 6,606L removed
Build: clean
Boot: 401 + 0 errors
ESM require scan: 0
Stale imports: 0
```

Note: `AGENT_HANDOFF.md` on the branch still lists the older Phase 2 total around 4,712L in the body, but the latest commit message says the current total is ~6,606L.

## Batch Audited This Turn

Jack audited the next service-layer group from Claude's handoff:

```text
server/services/ai-brain/agent/*
server/services/ai-brain/subagents/*
server/services/uacp/*
server/services/helposService/*
server/services/businessInsights/*
server/services/ai/tokenExtractor.ts
```

Inputs used:

```text
AGENT_HANDOFF.md
used_files.txt
imported_files.txt
server/services/ai/tokenExtractor.ts
server/services/uacp/uacpOrchestrationActions.ts
server/services/helposService/index.ts
server/services/businessInsights/businessInsightsService.ts
```

Important limitation: GitHub connector search remains noisy because inventory/docs dominate results. Claude should confirm with local `rg` before deleting.

---

# 1. AI Brain Agent Services

Target files from handoff:

```text
server/services/ai-brain/agent/stateVerificationService.ts
server/services/ai-brain/agent/alternativeStrategyService.ts
server/services/ai-brain/agent/goalMetricsService.ts
server/services/ai-brain/agent/goalExecutionService.ts
```

Connector search for:

```text
stateVerificationService
alternativeStrategyService
goalMetricsService
goalExecutionService
```

mostly surfaced inventory/docs plus the actual `goalExecutionService.ts` file. It did not prove real live imports for the other three.

## Claude local commands

```bash
find server/services/ai-brain/agent -maxdepth 1 -name "*.ts" -print -exec wc -l {} \;

for f in server/services/ai-brain/agent/*.ts; do
  base=$(basename "$f" .ts)
  echo "--- $f / $base"
  rg "from ['\"].*${base}['\"]|import\(.*${base}|${base}" server client --glob '*.{ts,tsx}' | grep -v "$f" || true
done
```

## Jack recommendation

Likely delete candidates if local `rg` confirms zero real callers outside inventories/docs:

```text
stateVerificationService.ts
alternativeStrategyService.ts
goalMetricsService.ts
```

Treat `goalExecutionService.ts` as uncertain/alive until local caller proof is reviewed, because it was the only actual file surfaced by connector search.

---

# 2. AI Brain Subagents

Target names from handoff:

```text
notificationSubagent
invoiceSubagent
gamificationActivationAgent
schedulingSubagent
payrollSubagent
onboardingOrchestrator
```

`used_files.txt` / `imported_files.txt` previously listed these as live/imported:

```text
server/services/ai-brain/subagents/invoiceSubagent.ts
server/services/ai-brain/subagents/onboardingOrchestrator.ts
server/services/ai-brain/subagents/payrollSubagent.ts
server/services/ai-brain/subagents/schedulingSubagent.ts
```

Search for `notificationSubagent`, `invoiceSubagent`, `gamificationActivationAgent`, `schedulingSubagent` mostly hit inventory/docs, not hard live callers.

## Claude local commands

```bash
find server/services/ai-brain/subagents -maxdepth 1 -name "*.ts" -print -exec wc -l {} \;

for f in server/services/ai-brain/subagents/*.ts; do
  base=$(basename "$f" .ts)
  echo "--- $f / $base"
  rg "from ['\"].*${base}['\"]|import\(.*${base}|${base}" server client --glob '*.{ts,tsx}' | grep -v "$f" || true
done
```

## Jack recommendation

Keep first unless local proof says otherwise:

```text
invoiceSubagent.ts
onboardingOrchestrator.ts
payrollSubagent.ts
schedulingSubagent.ts
```

Likely delete candidates if local proof is clean:

```text
notificationSubagent.ts
gamificationActivationAgent.ts
dataMigrationAgent.ts
coreSubagentOrchestration.ts
domainOpsSubagents.ts
visualQaSubagent.ts
```

The connector did not prove these are dead; Claude must confirm locally.

---

# 3. AI tokenExtractor.ts

File read:

```text
server/services/ai/tokenExtractor.ts
```

Exports:

```text
extractGeminiTokens
extractClaudeTokens
extractGptTokens
```

Older handoff said `0 callers - DELETE`, but current connector search found a real caller:

```text
server/services/ai/aiCallWrapper.ts
```

## Jack recommendation

Do **not** delete `tokenExtractor.ts` unless local `rg` contradicts the connector. It appears alive now.

Claude local command:

```bash
rg "extractGeminiTokens|extractClaudeTokens|extractGptTokens|tokenExtractor" server client --glob '*.{ts,tsx}'
```

Expected: keep if `aiCallWrapper.ts` imports/uses it.

---

# 4. UACP Services

Files in domain:

```text
server/services/uacp/agentIdentityService.ts
server/services/uacp/policyDecisionPoint.ts
server/services/uacp/uacpOrchestrationActions.ts
```

File read:

```text
server/services/uacp/uacpOrchestrationActions.ts
```

Findings:

- `uacpOrchestrationActions.ts` imports and uses:
  - `policyDecisionPoint`
  - `agentIdentityService`
- It registers 5 active UACP actions.
- Many non-MVP actions are already commented out/disabled inside the file.
- It still imports `db`, `accessPolicies`, `accessControlEvents`, `agentIdentities`, `and`, `desc`, etc. Some are only used inside disabled comment blocks or disabled sections.

## Claude local commands

```bash
find server/services/uacp -maxdepth 1 -name "*.ts" -print -exec wc -l {} \;
rg "uacpOrchestrationActions|registerUACPActions|getUACPActionDefinitions|agentIdentityService|policyDecisionPoint" server client --glob '*.{ts,tsx}'
rg "accessPolicies|accessControlEvents|agentIdentities|\band\b|\bdesc\b" server/services/uacp/uacpOrchestrationActions.ts
```

## Jack recommendation

Keep these unless local proof says otherwise:

```text
uacpOrchestrationActions.ts
agentIdentityService.ts
policyDecisionPoint.ts
```

Potential cleanup inside `uacpOrchestrationActions.ts`:

- Remove unused imports that only supported disabled/commented actions.
- Consider deleting huge disabled comment blocks if business agrees; this may remove a lot of bloat without changing runtime behavior.
- Update `getUACPActionDefinitions()` to list only active registered actions. It currently still includes many disabled action definitions:
  - list_agents
  - get_agent
  - update_agent_mission
  - update_agent_access
  - list_policies
  - invalidate_cache
  - get_recent_events
  - security_audit
  - create_support_employee
  - assign_platform_role
  - list_support_team

This is a good low-risk cleanup because the actions are disabled but still advertised in the definitions array.

---

# 5. HelpOS Service

Stale handoff path:

```text
server/services/helposService/helposService.ts
```

This file does **not** exist on `refactor/service-layer`.

Actual file read:

```text
server/services/helposService/index.ts
```

Findings:

- Large, active HelpAI/HelpOS chat service.
- Uses Gemini, billing/metering, aiCallWrapper, aiGuardRails, content moderation, storage, support ticket escalation, transcript/session persistence.
- Exports `helposService` singleton.

## Claude local commands

```bash
rg "helposService|bubbleAgent_reply|staffCopilot_suggestResponse|generateCaseSummary|handleEscalation" server client --glob '*.{ts,tsx}'
rg "from ['\"].*helposService|import\(.*helposService" server client --glob '*.{ts,tsx}'
```

## Jack recommendation

Keep `server/services/helposService/index.ts` unless local proof shows the routes moved to newer `server/services/helpai/*` services.

Potential cleanup after local proof:

- Remove `aiMeteringService` import if unused. It appears imported but the code comments say token metering is handled through `withGemini`.
- Check whether `staffCopilot_suggestResponse()` passes missing workspace/user context to `provider.chat()`. It currently calls provider with `{ maxTokens: 300 }`; `GeminiProvider.chat()` refuses missing workspaceId/userId. That may make staff copilot path always return a technical fallback/error.
- This may be a bug fix, not dead-code cleanup.

---

# 6. Business Insights Service

Stale handoff path:

```text
server/services/businessInsights/businessContextService.ts
```

This file does **not** exist on `refactor/service-layer`.

Actual file read:

```text
server/services/businessInsights/businessInsightsService.ts
```

Connector search found a real caller:

```text
server/services/ai-brain/trinityChatService.ts
```

Exports:

```text
runBusinessHealthScan
formatScanAsChat
businessInsightsService
```

## Jack recommendation

Keep `businessInsightsService.ts`. It is alive through Trinity chat/business health scan flow.

Potential cleanup/bug candidates for Claude:

- Check `@ts-expect-error` around model `'gemini-3-pro-preview'` and return action array typing.
- Verify `businessInsightsService` import in `trinityChatService.ts` uses only `runBusinessHealthScan` / `formatScanAsChat` and not the whole singleton.
- No deletion recommended.

Claude local command:

```bash
rg "businessInsightsService|runBusinessHealthScan|formatScanAsChat|business health scan|business_health_scan" server client --glob '*.{ts,tsx}'
```

---

# 7. Gamification Services

Files from inventory:

```text
server/services/gamification/aiBrainNotifier.ts
server/services/gamification/whatsNewIntegration.ts
server/services/gamification/gamificationEvents.ts
server/services/gamification/gamificationService.ts
server/services/gamification/eventTracker.ts
```

Connector search for gamification names mostly surfaced inventory/docs, not hard live callers. However Claude's handoff said this domain has 14 callers and needs verification.

## Claude local commands

```bash
find server/services/gamification -maxdepth 1 -name "*.ts" -print -exec wc -l {} \;

for f in server/services/gamification/*.ts; do
  base=$(basename "$f" .ts)
  echo "--- $f / $base"
  rg "from ['\"].*${base}['\"]|import\(.*${base}|${base}" server client --glob '*.{ts,tsx}' | grep -v "$f" || true
done

rg "gamificationService|gamificationEvents|eventTracker|whatsNewIntegration|aiBrainNotifier" server client --glob '*.{ts,tsx}'
```

## Jack recommendation

Do not delete whole gamification domain from connector evidence. Claude should separate:

- real route/UI callers
- AI Brain notification side effects
- old docs/inventory references

Potential cleanup is likely in unused event helpers or notification shims, not necessarily whole files.

---

# Recommended Claude Execution Batch

Suggested next local batch on `refactor/service-layer`:

1. AI Brain `agent/` files: delete zero-caller services, probably `stateVerification`, `alternativeStrategy`, `goalMetrics` if confirmed.
2. AI Brain `subagents/`: keep known imported scheduling/invoice/payroll/onboarding; delete zero-caller subagents only with local proof.
3. UACP: keep core files, remove disabled action definitions/comment blocks/imports if clean.
4. HelpOS: keep file, fix `staffCopilot_suggestResponse` context bug if confirmed, remove unused imports.
5. Business Insights: keep file, no deletion.
6. Gamification: local caller audit; delete only zero-caller helper files/exports.

Run after edits:

```bash
node build.mjs
rg "require(" server/ --include="*.ts" | grep -v "node_modules|.d.ts|//|build.mjs" || true
python3 <improved router-prefix scanner from AGENT_HANDOFF.md>
rg "<<<<<<<|=======|>>>>>>>" .
```

Before PR/merge:

```bash
# real DB boot test from AGENT_HANDOFF Crash Rule 5
```

## Why Jack Did Not Runtime Patch

This batch includes service deletions and large commented/disabled sections. The connector cannot reliably distinguish live imports from inventory/docs/barrels, and service deletions require full local build + boot validation. Jack therefore committed an execution map for Claude rather than editing runtime services through the connector.
