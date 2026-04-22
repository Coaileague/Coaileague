/**
 * TRINITY TRIAD ORCHESTRATOR
 * ===========================
 * Coordinates the three cognitive agents that compose Trinity's unified brain:
 *
 *   GPT (workhorse)   — initial response, factual recall, action execution
 *   Gemini (reasoner) — augments with deeper analysis, synthesis, org context
 *   Claude (judge)    — arbitrates conflicts, ethics check, final output quality
 *
 * Trinity is ONE personality. The triad is an implementation detail invisible
 * to the end user. RBAC context determines what knowledge domain leads, not
 * which "mode" is switched to — there is no switching.
 *
 * Flow per turn:
 *   1. Classify complexity (pre-flight, <50 tokens, cheapest model)
 *   2. Check budget → tier constraints
 *   3. Check agent health → degradation level
 *   4. Select tiers per agent based on complexity × budget × health
 *   5. Run agents with shared turn context (each sees prior agent output)
 *   6. Return final Trinity response
 *
 * Tier selection per agent:
 *   Complexity → GPT tier       → Gemini tier     → Claude tier
 *   low        → gpt4o_mini     → gemini_flash     → claude_haiku
 *   medium     → gpt4o          → gemini_pro        → claude_haiku
 *   high       → gpt4o          → gemini_pro        → claude_sonnet
 *
 * Token costs for premium tiers go against the tenant's monthly allotment.
 * At >90% cap: conservative mode caps all tiers at 'medium'.
 */

import { routeByRole, type ModelRouterRequest, type ModelName } from './providers/modelRouter';
import { classifyComplexity, type ClassificationResult } from './complexityClassifier';
import { getTriniityBudget, applyBudgetConstraint, type TrinityBudget } from './trinityBudgetGuard';
import {
  getTriadHealth, selectActiveAgents, forceHealthRefresh, type TriadHealth,
} from './agentHealthMonitor';
import { createLogger } from '../../lib/logger';

const log = createLogger('TrinityTriadOrchestrator');

// ─── Tier → model mapping per agent ──────────────────────────────────────────
const GPT_TIER_MODELS: Record<'low' | 'medium' | 'high', ModelName> = {
  low:    'gpt4o_mini',
  medium: 'gpt4o',
  high:   'gpt4o',
};

const GEMINI_TIER_MODELS: Record<'low' | 'medium' | 'high', ModelName> = {
  low:    'gemini_flash',
  medium: 'gemini_pro',
  high:   'gemini_pro',
};

const CLAUDE_TIER_MODELS: Record<'low' | 'medium' | 'high', ModelName> = {
  low:    'claude_haiku',
  medium: 'claude_haiku',
  high:   'claude_sonnet',
};

// ─── Shared turn context (in-memory, per conversation session) ────────────────
export interface TurnContext {
  sessionId: string;
  turnId: string;
  userMessage: string;
  systemPrompt: string;
  gptDraft?: string;         // workhorse output
  geminiAnalysis?: string;   // reasoner augmentation
  claudeJudgment?: string;   // judge arbitration + final output
  finalResponse: string;
  complexity: ClassificationResult;
  budget: TrinityBudget;
  health: TriadHealth;
  agentsUsed: string[];
  tiersUsed: Record<string, 'low' | 'medium' | 'high'>;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  latencyMs: number;
}

const turnContextCache = new Map<string, TurnContext>();
const TURN_CONTEXT_TTL_MS = 5 * 60 * 1000; // 5 min

function storeTurnContext(sessionId: string, ctx: TurnContext): void {
  turnContextCache.set(sessionId, ctx);
  setTimeout(() => turnContextCache.delete(sessionId), TURN_CONTEXT_TTL_MS);
}

export function getLastTurnContext(sessionId: string): TurnContext | undefined {
  return turnContextCache.get(sessionId);
}

// ─── Orchestration request ────────────────────────────────────────────────────
export interface TriadRequest {
  message: string;
  systemPrompt: string;
  workspaceId: string;
  userId?: string;
  sessionId: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  conversationTurnCount?: number;
  featureKey?: string;
  maxTokens?: number;
}

export interface TriadResponse {
  response: string;
  model: string;           // primary model that produced final output
  agentsUsed: string[];
  complexity: 'low' | 'medium' | 'high';
  domain: string;
  tiersUsed: Record<string, 'low' | 'medium' | 'high'>;
  totalTokensUsed: number;
  latencyMs: number;
  degradationLevel: string;
  budget: {
    softCapPercent: number;
    isConservative: boolean;
    remaining: number;
  };
}

// ─── Main orchestration function ──────────────────────────────────────────────
export async function orchestrateTriad(req: TriadRequest): Promise<TriadResponse> {
  const start = Date.now();
  const turnId = `${req.sessionId}-${Date.now()}`;

  // Step 1: Classify complexity (cheap pre-flight call)
  const [complexity, budget, health] = await Promise.all([
    classifyComplexity(req.message, req.workspaceId, req.conversationTurnCount ?? 0),
    getTriniityBudget(req.workspaceId),
    Promise.resolve(getTriadHealth()),
  ]);

  log.info(
    `[Triad] session=${req.sessionId} complexity=${complexity.complexity} ` +
    `domain=${complexity.domain} health=${health.level} ` +
    `budget=${budget.softCapPercent}% conservative=${budget.isConservative}`,
  );

  // Step 2: Determine effective tier (budget may cap it)
  const effectiveTier = applyBudgetConstraint(complexity.complexity, budget);

  // Step 3: Select active agents based on health + complexity requirements
  const activeAgents = selectActiveAgents(
    health,
    complexity.requiresReasoner,
    complexity.requiresJudge,
  );

  if (activeAgents.length === 0) {
    log.error('[Triad] ALL agents DOWN — returning offline message');
    return {
      response: "I'm temporarily unavailable while our AI systems restore. I'll be back in a moment — please try again shortly.",
      model: 'none',
      agentsUsed: [],
      complexity: complexity.complexity,
      domain: complexity.domain,
      tiersUsed: {},
      totalTokensUsed: 0,
      latencyMs: Date.now() - start,
      degradationLevel: 'DOWN',
      budget: { softCapPercent: budget.softCapPercent, isConservative: budget.isConservative, remaining: budget.remaining },
    };
  }

  const turnCtx: TurnContext = {
    sessionId: req.sessionId,
    turnId,
    userMessage: req.message,
    systemPrompt: req.systemPrompt,
    complexity,
    budget,
    health,
    agentsUsed: [],
    tiersUsed: {},
    finalResponse: '',
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUsd: 0,
    latencyMs: 0,
  };

  // Build conversation history string for context passing
  const historyStr = req.conversationHistory && req.conversationHistory.length > 0
    ? req.conversationHistory.slice(-6).map(h => `${h.role === 'user' ? 'User' : 'Trinity'}: ${h.content}`).join('\n')
    : '';

  let finalResponse = '';
  let primaryModel = 'unknown';

  // ─── STEP 4: Run GPT (workhorse) ─────────────────────────────────────────
  if (activeAgents.includes('gpt')) {
    const tier = GPT_TIER_MODELS[effectiveTier];
    try {
      const gptSystemPrompt = buildWorkhorseSystemPrompt(req.systemPrompt, complexity.domain, historyStr);
      const gptResult = await routeByRole({
        role: 'executor',
        systemPrompt: gptSystemPrompt,
        userPrompt: req.message,
        workspaceId: req.workspaceId,
        userId: req.userId,
        featureKey: req.featureKey || 'trinity_chat',
        preferredModel: tier,
        maxTokens: req.maxTokens || 2048,
      });

      turnCtx.gptDraft = gptResult.content;
      turnCtx.agentsUsed.push('GPT');
      turnCtx.tiersUsed['gpt'] = effectiveTier;
      turnCtx.totalInputTokens += gptResult.inputTokens;
      turnCtx.totalOutputTokens += gptResult.outputTokens;
      turnCtx.totalCostUsd += gptResult.rawCostUsd;
      finalResponse = gptResult.content;
      primaryModel = gptResult.modelUsed;

      log.info(`[Triad] GPT complete — model=${gptResult.modelUsed} tier=${effectiveTier} tokens=${gptResult.outputTokens}`);
    } catch (err) {
      log.warn('[Triad] GPT workhorse failed (non-fatal, continuing with other agents):', (err as Error).message);
    }
  }

  // ─── STEP 5: Run Gemini (reasoner) — only if needed ──────────────────────
  if (activeAgents.includes('gemini') && (turnCtx.gptDraft || finalResponse)) {
    const tier = GEMINI_TIER_MODELS[effectiveTier];
    try {
      const geminiSystemPrompt = buildReasonerSystemPrompt(req.systemPrompt, complexity.domain);
      const geminiUserPrompt = buildReasonerUserPrompt(req.message, turnCtx.gptDraft || '', historyStr);

      const geminiResult = await routeByRole({
        role: 'analyzer',
        systemPrompt: geminiSystemPrompt,
        userPrompt: geminiUserPrompt,
        workspaceId: req.workspaceId,
        userId: req.userId,
        featureKey: req.featureKey || 'trinity_chat',
        preferredModel: tier,
        maxTokens: req.maxTokens || 2048,
      });

      turnCtx.geminiAnalysis = geminiResult.content;
      turnCtx.agentsUsed.push('Gemini');
      turnCtx.tiersUsed['gemini'] = effectiveTier;
      turnCtx.totalInputTokens += geminiResult.inputTokens;
      turnCtx.totalOutputTokens += geminiResult.outputTokens;
      turnCtx.totalCostUsd += geminiResult.rawCostUsd;

      // Gemini's analysis feeds into Claude's judgment
      if (!turnCtx.gptDraft) {
        // Gemini is acting as primary — use its output directly
        finalResponse = geminiResult.content;
        primaryModel = geminiResult.modelUsed;
      }

      log.info(`[Triad] Gemini complete — model=${geminiResult.modelUsed} tier=${effectiveTier} tokens=${geminiResult.outputTokens}`);
    } catch (err) {
      log.warn('[Triad] Gemini reasoner failed (non-fatal):', (err as Error).message);
    }
  }

  // ─── STEP 6: Run Claude (judge) — arbitrates and produces final output ────
  if (activeAgents.includes('claude') && (turnCtx.gptDraft || turnCtx.geminiAnalysis || finalResponse)) {
    const tier = CLAUDE_TIER_MODELS[effectiveTier];
    try {
      const claudeSystemPrompt = buildJudgeSystemPrompt(req.systemPrompt, complexity.domain, complexity.requiresJudge);
      const claudeUserPrompt = buildJudgeUserPrompt(
        req.message,
        turnCtx.gptDraft,
        turnCtx.geminiAnalysis,
        historyStr,
      );

      const claudeResult = await routeByRole({
        role: 'judge',
        systemPrompt: claudeSystemPrompt,
        userPrompt: claudeUserPrompt,
        workspaceId: req.workspaceId,
        userId: req.userId,
        featureKey: req.featureKey || 'trinity_chat',
        preferredModel: tier,
        maxTokens: req.maxTokens || 2048,
      });

      turnCtx.claudeJudgment = claudeResult.content;
      turnCtx.agentsUsed.push('Claude');
      turnCtx.tiersUsed['claude'] = effectiveTier;
      turnCtx.totalInputTokens += claudeResult.inputTokens;
      turnCtx.totalOutputTokens += claudeResult.outputTokens;
      turnCtx.totalCostUsd += claudeResult.rawCostUsd;
      finalResponse = claudeResult.content;
      primaryModel = claudeResult.modelUsed;

      log.info(`[Triad] Claude complete — model=${claudeResult.modelUsed} tier=${effectiveTier} tokens=${claudeResult.outputTokens}`);
    } catch (err) {
      log.warn('[Triad] Claude judge failed (non-fatal, using prior agent output):', (err as Error).message);
      // Fall through — finalResponse still has GPT or Gemini output
    }
  }

  // ─── Finalize ─────────────────────────────────────────────────────────────
  if (!finalResponse) {
    finalResponse = "I'm having trouble processing that right now. Could you try rephrasing?";
  }

  turnCtx.finalResponse = finalResponse;
  turnCtx.latencyMs = Date.now() - start;
  storeTurnContext(req.sessionId, turnCtx);

  log.info(
    `[Triad] Complete — agents=${turnCtx.agentsUsed.join('+')} ` +
    `latency=${turnCtx.latencyMs}ms tokens=${turnCtx.totalInputTokens + turnCtx.totalOutputTokens} ` +
    `cost=$${turnCtx.totalCostUsd.toFixed(6)}`,
  );

  return {
    response: finalResponse,
    model: primaryModel,
    agentsUsed: turnCtx.agentsUsed,
    complexity: complexity.complexity,
    domain: complexity.domain,
    tiersUsed: turnCtx.tiersUsed,
    totalTokensUsed: turnCtx.totalInputTokens + turnCtx.totalOutputTokens,
    latencyMs: turnCtx.latencyMs,
    degradationLevel: health.level,
    budget: {
      softCapPercent: budget.softCapPercent,
      isConservative: budget.isConservative,
      remaining: budget.remaining,
    },
  };
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function buildWorkhorseSystemPrompt(baseSystemPrompt: string, domain: string, historyStr: string): string {
  const domainNote = domain !== 'conversational'
    ? `\n\nFocus domain: ${domain}. Lead with the most relevant knowledge for this domain.`
    : '';
  const historyNote = historyStr
    ? `\n\nConversation context:\n${historyStr}`
    : '';
  return `${baseSystemPrompt}${domainNote}${historyNote}

You are Trinity's workhorse — provide a clear, direct, factual response. Be concise and accurate. Another agent will refine your output if needed.`;
}

function buildReasonerSystemPrompt(baseSystemPrompt: string, domain: string): string {
  return `${baseSystemPrompt}

You are Trinity's analytical reasoning layer. You receive a draft response and enhance it with deeper analysis, synthesis, and domain expertise.
Focus on: accuracy, completeness, nuance relevant to ${domain} domain.
Do NOT add unnecessary length. Produce a refined, authoritative response that incorporates the best of the draft while correcting any gaps.`;
}

function buildReasonerUserPrompt(userMessage: string, gptDraft: string, historyStr: string): string {
  const history = historyStr ? `Conversation context:\n${historyStr}\n\n` : '';
  const draft = gptDraft
    ? `Initial draft response:\n${gptDraft}\n\n`
    : '';
  return `${history}User asked: "${userMessage}"

${draft}Please provide a refined, analytically complete response. If the draft is accurate and complete, build on it. If there are gaps or errors, correct them.`;
}

function buildJudgeSystemPrompt(baseSystemPrompt: string, domain: string, isHardJudge: boolean): string {
  const judgeMode = isHardJudge
    ? 'CRITICAL JUDGE: Review carefully for accuracy, compliance risk, and completeness. Ensure the response is appropriate for the domain.'
    : 'QUALITY REVIEW: Synthesize the best response from the available agent outputs.';
  return `${baseSystemPrompt}

You are Trinity's final arbitration layer — Claude. ${judgeMode}
Domain: ${domain}.

Your output IS Trinity's response to the user. Make it complete, natural, and authoritative.
Do not reference other agents, do not say "based on the draft" or "the previous analysis".
Speak as Trinity — one coherent voice.`;
}

function buildJudgeUserPrompt(
  userMessage: string,
  gptDraft?: string,
  geminiAnalysis?: string,
  historyStr?: string,
): string {
  const parts: string[] = [];

  if (historyStr) parts.push(`Conversation context:\n${historyStr}`);
  parts.push(`User said: "${userMessage}"`);

  if (gptDraft && geminiAnalysis) {
    parts.push(`Initial draft:\n${gptDraft}`);
    parts.push(`Analytical augmentation:\n${geminiAnalysis}`);
    parts.push('Synthesize these into a single final response. Take the best of both.');
  } else if (geminiAnalysis) {
    parts.push(`Analysis:\n${geminiAnalysis}`);
    parts.push('Refine this into a final response.');
  } else if (gptDraft) {
    parts.push(`Draft:\n${gptDraft}`);
    parts.push('Review and deliver the final response.');
  }

  return parts.join('\n\n');
}
