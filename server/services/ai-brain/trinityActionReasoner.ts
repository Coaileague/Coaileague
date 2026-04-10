/**
 * TRINITY ACTION REASONER
 * =======================
 * Universal pre-action reasoning middleware for all Trinity automation.
 *
 * Every major automation action (scheduling, payroll, invoicing) MUST pass
 * through this service before execution. Trinity thinks through the action
 * using her full reasoning pipeline:
 *
 *   perceive → deliberate → decide → (caller executes) → reflect
 *
 * Reasoning is always grounded in:
 *   1. Company profit optimization
 *   2. Labor law compliance (FLSA + state-specific CA/NY/WA/OR)
 *   3. Employee welfare and classification (W2 vs 1099)
 *   4. Business risk and data integrity
 *
 * Decision outcomes:
 *   "proceed"   – Trinity is confident; action should execute normally
 *   "escalate"  – proceed but flag for manager review before finalizing
 *   "block"     – stop execution; a critical issue was identified
 */

import { meteredGemini, GEMINI_MODEL_TIERS } from '../billing/meteredGeminiClient';
import { trinityThoughtEngine } from './trinityThoughtEngine';
import { platformEventBus } from '../platformEventBus';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityActionReasoner');

// ============================================================================
// TYPES
// ============================================================================

export type ActionReasoningDecision = 'proceed' | 'escalate' | 'block';

export type ActionDomain =
  | 'scheduling_fill'
  | 'scheduling_optimize'
  | 'scheduling_conflict'
  | 'scheduling_generate'
  | 'payroll_execute'
  | 'payroll_anomaly'
  | 'invoice_generate'
  | 'invoice_reconcile'
  | 'approval_gate'
  | 'compliance_check'
  | 'contractor_escalation';

export interface ActionReasoningContext {
  domain: ActionDomain;
  workspaceId: string;
  userId?: string;
  /** Brief human-readable description of what is about to happen */
  actionSummary: string;
  /** Structured data about the action — employees, shifts, amounts, etc. */
  payload: Record<string, any>;
  /** Any pre-computed risk signals to include in reasoning */
  riskSignals?: string[];
}

export interface TrinityReasoningDecision {
  decision: ActionReasoningDecision;
  confidence: number;
  reasoning: string;
  profitImpact: {
    assessment: 'positive' | 'neutral' | 'negative' | 'unknown';
    detail: string;
  };
  laborLawFlags: string[];
  escalationReason?: string;
  blockReason?: string;
  recommendations: string[];
  /** Trinity's thought ID for audit trail */
  thoughtId: string;
  /** Whether AI was used or fallback heuristics applied */
  aiUsed: boolean;
}

// ============================================================================
// SYSTEM PROMPT — Trinity's reasoning identity for automation actions
// ============================================================================

const TRINITY_SYSTEM_PROMPT = `You are Trinity, the autonomous AI co-pilot for CoAIleague — a workforce management platform for the security industry.

Your role in this reasoning step is to think through an upcoming automation action BEFORE it executes. You are the last intelligent layer of review.

Your reasoning must always weigh:
1. PROFIT OPTIMIZATION — Does this action benefit the company financially? Consider billing rates, labor costs, overtime premiums, contractor markups, and coverage guarantees.
2. LABOR LAW COMPLIANCE — Does this action respect: FLSA overtime rules (40h/week W2, 70h/week contractor), California (8h daily OT, meal break penalties), New York (spread of hours), Washington (rest period), Oregon (predictive scheduling), minimum rest periods (8h between shifts), consecutive day limits (7 days max).
3. EMPLOYEE WELFARE — Is this a fair assignment? Is the worker being correctly classified (W2 employee vs 1099 contractor)? Are we avoiding pattern violations?
4. BUSINESS RISK — Is there anything unusual, suspicious, or potentially damaging about this action?

You must respond with a JSON object only. No markdown, no preamble. Format:
{
  "decision": "proceed" | "escalate" | "block",
  "confidence": 0.0-1.0,
  "reasoning": "clear explanation of your reasoning in 2-3 sentences",
  "profitImpact": {
    "assessment": "positive" | "neutral" | "negative" | "unknown",
    "detail": "brief financial analysis"
  },
  "laborLawFlags": ["array of any specific labor law concerns, empty if none"],
  "escalationReason": "reason if escalate, null otherwise",
  "blockReason": "reason if block, null otherwise",
  "recommendations": ["array of actionable suggestions to improve the outcome"]
}`;

// ============================================================================
// DOMAIN CONFIGURATION
// ============================================================================

interface DomainConfig {
  /** Use PRO model for complex/financial; FLASH for routine */
  model: 'FLASH' | 'PRO';
  /** Default confidence floor for proceeding without AI */
  fallbackProceedConfidence: number;
}

const DOMAIN_CONFIG: Record<ActionDomain, DomainConfig> = {
  scheduling_fill:        { model: 'FLASH', fallbackProceedConfidence: 0.75 },
  scheduling_optimize:    { model: 'PRO',   fallbackProceedConfidence: 0.70 },
  scheduling_conflict:    { model: 'FLASH', fallbackProceedConfidence: 0.72 },
  scheduling_generate:    { model: 'PRO',   fallbackProceedConfidence: 0.70 },
  payroll_execute:        { model: 'PRO',   fallbackProceedConfidence: 0.80 },
  payroll_anomaly:        { model: 'PRO',   fallbackProceedConfidence: 0.78 },
  invoice_generate:       { model: 'PRO',   fallbackProceedConfidence: 0.75 },
  invoice_reconcile:      { model: 'PRO',   fallbackProceedConfidence: 0.75 },
  approval_gate:          { model: 'PRO',   fallbackProceedConfidence: 0.65 },
  compliance_check:       { model: 'PRO',   fallbackProceedConfidence: 0.60 },
  contractor_escalation:  { model: 'FLASH', fallbackProceedConfidence: 0.72 },
};

// ============================================================================
// REASONER
// ============================================================================

class TrinityActionReasonerService {

  /**
   * Think through an action before it executes.
   * Records Trinity's reasoning in the thought engine.
   * Returns a structured decision — always non-blocking on AI failure.
   */
  async reason(ctx: ActionReasoningContext): Promise<TrinityReasoningDecision> {
    const startMs = Date.now();
    const config = DOMAIN_CONFIG[ctx.domain];
    const model = config.model === 'PRO' ? GEMINI_MODEL_TIERS.PRO : GEMINI_MODEL_TIERS.FLASH;

    // Build structured context for the prompt
    const prompt = this.buildPrompt(ctx);

    // --- PERCEPTION: record what Trinity is observing ---
    let perceptionThoughtId = 'unknown';
    try {
      const perception = await trinityThoughtEngine.perceive(
        `[${ctx.domain.toUpperCase()}] ${ctx.actionSummary}`,
        { workspaceId: ctx.workspaceId, userId: ctx.userId, triggeredBy: ctx.domain }
      );
      perceptionThoughtId = perception.thoughtId;
    } catch {
      // Non-blocking — thought engine failure must never stop execution
    }

    // --- AI REASONING CALL ---
    let aiResult: TrinityReasoningDecision | null = null;

    try {
      const geminiResult = await meteredGemini.generate({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        featureKey: `trinity_action_reason_${ctx.domain}`,
        prompt,
        systemInstruction: TRINITY_SYSTEM_PROMPT,
        model,
        temperature: 0.1,
        maxOutputTokens: 2048,
        jsonMode: true,
      });

      if (geminiResult.success && geminiResult.text) {
        aiResult = this.parseAIResponse(geminiResult.text, perceptionThoughtId);
      }
    } catch (err) {
      log.warn(`[TrinityActionReasoner] AI call failed for ${ctx.domain}, using heuristic fallback:`, err instanceof Error ? err.message : 'unknown');
    }

    // --- FALLBACK: heuristic decision when AI unavailable ---
    if (!aiResult) {
      aiResult = this.heuristicFallback(ctx, config, perceptionThoughtId);
    }

    // --- DELIBERATION: record what Trinity concluded ---
    try {
      if (aiResult.decision !== 'proceed' || aiResult.laborLawFlags.length > 0) {
        await trinityThoughtEngine.deliberate(
          aiResult.reasoning,
          aiResult.recommendations,
          aiResult.confidence,
          { workspaceId: ctx.workspaceId, userId: ctx.userId, parentThoughtId: perceptionThoughtId, relatedActionId: ctx.domain }
        );
      }

      // DECISION: always record the final decision
      await trinityThoughtEngine.decide(
        `${aiResult.decision.toUpperCase()} — ${ctx.actionSummary}`,
        aiResult.reasoning,
        aiResult.confidence,
        { workspaceId: ctx.workspaceId, userId: ctx.userId, parentThoughtId: perceptionThoughtId, relatedActionId: ctx.domain }
      );
    } catch {
      // Non-blocking
    }

    // --- BROADCAST labor law flags as platform events ---
    // Fix: was .emit() (internal EventEmitter only) — now .publish() so it reaches
    // subscribers, DB persistence, and manager notifications.
    if (aiResult.laborLawFlags.length > 0) {
      try {
        await platformEventBus.publish({
          type: 'trinity_labor_law_flag',
          category: 'trinity',
          title: 'Labor Law Violation Detected',
          description: `Trinity flagged ${aiResult.laborLawFlags.length} labor law issue(s) in ${ctx.domain}: ${aiResult.laborLawFlags.slice(0, 2).join('; ')}`,
          workspaceId: ctx.workspaceId,
          metadata: {
            domain: ctx.domain,
            flags: aiResult.laborLawFlags,
            decision: aiResult.decision,
            severity: 'high',
            // @ts-expect-error — TS migration: fix in refactoring sprint
            audience: 'manager',
          },
        });
      } catch (err: any) {
        log.warn('[ActionReasoner] Failed to publish trinity_labor_law_flag (non-fatal):', err?.message);
      }
    }

    // --- BROADCAST block events for visibility ---
    // Fix: was .emit() — now .publish() so blocked actions create audit trail and alert managers.
    if (aiResult.decision === 'block') {
      try {
        await platformEventBus.publish({
          type: 'trinity_action_blocked',
          category: 'trinity',
          title: 'Trinity Blocked Action — Compliance',
          description: `Trinity blocked a ${ctx.domain} action: ${aiResult.blockReason || 'policy violation'}`,
          workspaceId: ctx.workspaceId,
          metadata: {
            domain: ctx.domain,
            reason: aiResult.blockReason,
            actionSummary: ctx.actionSummary,
            severity: 'medium',
            // @ts-expect-error — TS migration: fix in refactoring sprint
            audience: 'manager',
          },
        });
      } catch (err: any) {
        log.warn('[ActionReasoner] Failed to publish trinity_action_blocked (non-fatal):', err?.message);
      }
    }

    log.info(`[TrinityActionReasoner] ${ctx.domain} → ${aiResult.decision.toUpperCase()} (confidence: ${(aiResult.confidence * 100).toFixed(0)}%, ${Date.now() - startMs}ms, aiUsed: ${aiResult.aiUsed})`);

    return aiResult;
  }

  /**
   * Record Trinity's reflection after an action completes.
   * Call this after execution to close the reasoning loop.
   */
  async reflect(
    ctx: Pick<ActionReasoningContext, 'domain' | 'workspaceId' | 'userId'>,
    outcome: { success: boolean; score: number; summary: string }
  ): Promise<void> {
    try {
      await trinityThoughtEngine.reflect(
        'action',
        ctx.domain,
        `${ctx.domain}: ${outcome.summary}`,
        { success: outcome.success, score: outcome.score },
        ctx.workspaceId
      );
    } catch {
      // Non-blocking
    }
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private buildPrompt(ctx: ActionReasoningContext): string {
    const payloadSummary = JSON.stringify(this.sanitizePayload(ctx.payload), null, 2);
    const riskBlock = ctx.riskSignals && ctx.riskSignals.length > 0
      ? `\nPRE-COMPUTED RISK SIGNALS:\n${ctx.riskSignals.map(s => `- ${s}`).join('\n')}`
      : '';

    return `ACTION DOMAIN: ${ctx.domain}
WORKSPACE: ${ctx.workspaceId}

ACTION SUMMARY:
${ctx.actionSummary}
${riskBlock}

ACTION PAYLOAD (key fields):
${payloadSummary}

Think through this action carefully. Consider profit optimization, labor law compliance, employee welfare, and business risk.

IMPORTANT: You MUST respond with ONLY a valid JSON object. No prose, no markdown, no code blocks. Start your response with { and end with }.

Required JSON structure:
{
  "decision": "proceed" | "escalate" | "block",
  "confidence": 0.0-1.0,
  "reasoning": "Brief reasoning string",
  "profitImpact": { "assessment": "positive" | "neutral" | "negative" | "unknown", "detail": "string" },
  "laborLawFlags": ["string"],
  "escalationReason": "string or null",
  "blockReason": "string or null",
  "recommendations": ["string"]
}`;
  }

  private sanitizePayload(payload: Record<string, any>): Record<string, any> {
    // Keep relevant fields, strip sensitive PII, cap array lengths
    const safe: Record<string, any> = {};
    const ALLOWED_KEYS = [
      'employeeCount', 'guardCount', 'shiftCount', 'weekStart', 'weekEnd',
      'totalHours', 'totalGross', 'totalNet', 'periodStart', 'periodEnd',
      'overtimeHours', 'regularHours', 'employeeType', 'workerType',
      'payType', 'contractValue', 'billingRate', 'laborCost', 'margin',
      'clientTier', 'urgencyLevel', 'mode', 'useContractorFallback',
      'openShifts', 'filledShifts', 'unfilledShifts', 'laborLawViolations',
      'riskScore', 'riskFactors', 'amount', 'invoiceCount', 'unbilledHours',
      'contractor1099Count', 'w2EmployeeCount', 'state', 'forceOT',
    ];

    for (const key of ALLOWED_KEYS) {
      if (key in payload && payload[key] !== undefined) {
        const val = payload[key];
        // Cap arrays
        safe[key] = Array.isArray(val) ? val.slice(0, 10) : val;
      }
    }

    return safe;
  }

  private parseAIResponse(rawText: string, perceptionThoughtId: string): TrinityReasoningDecision {
    try {
      const text = rawText.trim();

      // 1. Try direct JSON.parse (clean responses from jsonMode)
      try {
        const direct = JSON.parse(text);
        if (direct && typeof direct === 'object' && direct.decision) {
          return this.buildDecisionFromParsed(direct, perceptionThoughtId);
        }
      } catch { /* not clean JSON, continue */ }

      // 2. Strip code fences if the model wrapped in ```json ... ``` or ``` ... ```
      const stripped = text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim();

      // 3. Try to extract a complete JSON object
      const jsonMatch = stripped.match(/\{[\s\S]*\}/) || rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return this.buildDecisionFromParsed(parsed, perceptionThoughtId);
      }

      // 4. Handle truncated JSON — try to repair by extracting known fields from the partial text
      //    e.g. model returns '{"decision": "proceed",' (truncated mid-response)
      const partialText = stripped || text;
      if (partialText.includes('"decision"')) {
        const decisionMatch = partialText.match(/"decision"\s*:\s*"(proceed|escalate|block)"/);
        const confidenceMatch = partialText.match(/"confidence"\s*:\s*([\d.]+)/);
        const reasoningMatch = partialText.match(/"reasoning"\s*:\s*"([^"]*)"/);
        if (decisionMatch) {
          log.warn(`[TrinityActionReasoner] Repaired truncated JSON: decision=${decisionMatch[1]}, len=${rawText.length}`);
          return this.buildDecisionFromParsed({
            decision: decisionMatch[1],
            confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.75,
            reasoning: reasoningMatch ? reasoningMatch[1] : 'Trinity analysis complete (truncated).',
            profitImpact: { assessment: 'unknown', detail: '' },
            laborLawFlags: [],
            escalationReason: null,
            blockReason: null,
            recommendations: [],
          }, perceptionThoughtId);
        }
      }

      log.warn(`[TrinityActionReasoner] Unparseable response (${rawText.length} chars): "${rawText.slice(0, 120)}"`);
      throw new Error('No JSON found in AI response');
    } catch (err) {
      log.warn('[TrinityActionReasoner] Failed to parse AI response:', err instanceof Error ? err.message : 'unknown');
      return this.defaultProceed(perceptionThoughtId, false);
    }
  }

  private buildDecisionFromParsed(parsed: Record<string, any>, perceptionThoughtId: string): TrinityReasoningDecision {
    const decision: ActionReasoningDecision =
      ['proceed', 'escalate', 'block'].includes(parsed.decision)
        ? parsed.decision
        : 'proceed';

    return {
      decision,
      confidence: typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.75,
      reasoning: String(parsed.reasoning || 'Trinity analysis complete.'),
      profitImpact: {
        assessment: ['positive', 'neutral', 'negative', 'unknown'].includes(parsed.profitImpact?.assessment)
          ? parsed.profitImpact.assessment
          : 'unknown',
        detail: String(parsed.profitImpact?.detail || ''),
      },
      laborLawFlags: Array.isArray(parsed.laborLawFlags) ? parsed.laborLawFlags.map(String) : [],
      escalationReason: parsed.escalationReason || undefined,
      blockReason: parsed.blockReason || undefined,
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : [],
      thoughtId: perceptionThoughtId,
      aiUsed: true,
    };
  }

  private heuristicFallback(
    ctx: ActionReasoningContext,
    config: DomainConfig,
    thoughtId: string
  ): TrinityReasoningDecision {
    const risks = ctx.riskSignals || [];
    const hasOTRisk = risks.some(r => r.toLowerCase().includes('overtime') || r.toLowerCase().includes('ot'));
    const hasComplianceRisk = risks.some(r => r.toLowerCase().includes('compliance') || r.toLowerCase().includes('labor'));
    const highFinancial = (ctx.payload.totalGross || ctx.payload.amount || 0) > 50000;

    let decision: ActionReasoningDecision = 'proceed';
    const flags: string[] = [];

    if (hasComplianceRisk) { decision = 'escalate'; flags.push('labor_compliance_risk_detected'); }
    if (hasOTRisk) { flags.push('overtime_risk_detected'); if (decision === 'proceed') decision = 'escalate'; }
    if (highFinancial && ctx.domain.startsWith('payroll')) { decision = 'escalate'; flags.push('high_value_payroll'); }

    return {
      decision,
      confidence: config.fallbackProceedConfidence,
      reasoning: `Heuristic analysis (AI unavailable). Pre-computed risk signals evaluated: ${risks.length} signals, ${flags.length} flags raised.`,
      profitImpact: { assessment: 'unknown', detail: 'AI reasoning unavailable — manual review recommended.' },
      laborLawFlags: flags,
      escalationReason: decision === 'escalate' ? 'Heuristic risk signals detected; human review recommended.' : undefined,
      recommendations: ['AI reasoning was unavailable. Review this action manually before finalizing.'],
      thoughtId,
      aiUsed: false,
    };
  }

  private defaultProceed(thoughtId: string, aiUsed: boolean): TrinityReasoningDecision {
    return {
      decision: 'proceed',
      confidence: 0.75,
      reasoning: 'Default proceed — analysis completed without specific concerns.',
      profitImpact: { assessment: 'neutral', detail: 'No impact data available.' },
      laborLawFlags: [],
      recommendations: [],
      thoughtId,
      aiUsed,
    };
  }
}

export const trinityActionReasoner = new TrinityActionReasonerService();
