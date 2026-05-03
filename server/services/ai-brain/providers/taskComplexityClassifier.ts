/**
 * TaskComplexityClassifier — Wave 8.2.5
 * ─────────────────────────────────────────────────────────────────────────────
 * Trinity's brain for deciding WHICH model to use before spending tokens.
 *
 * PHILOSOPHY: Never hardcode a model in a route. Trinity observes the task,
 * scores its complexity, and routes to the cheapest model capable of handling
 * it. She escalates to heavier models only when complexity demands it, then
 * drops back to lighter models immediately afterward.
 *
 * Cost tiers (cheapest → most expensive):
 *   executor   → gemini_flash, gpt4o_mini, claude_haiku     (routine / high-volume)
 *   writer     → claude_sonnet, gpt4o, gemini_pro            (structured output / docs)
 *   analyzer   → claude_sonnet, gemini_pro, gpt4o            (reasoning / audit)
 *   orchestrator → gemini_pro, claude_sonnet, gpt4o          (multi-step coordination)
 *   judge      → claude_sonnet, gemini_pro, gpt4o            (critical decisions / finance)
 *
 * Trinity uses this service before every AI call so she ALWAYS uses the
 * lowest-cost model that can do the job. 100% margin on routine tasks.
 */

import type { ModelRole } from './modelRouter';
import { createLogger } from '../../../lib/logger';

const log = createLogger('TaskComplexityClassifier');

export interface TaskContext {
  /** What feature or action is triggering this AI call */
  actionType: string;
  /** The prompt or task description (used for keyword scoring) */
  prompt?: string;
  /** Approximate token count the caller expects to use */
  estimatedTokens?: number;
  /** Does this task involve financial data, payroll, or legal content? */
  isFinancial?: boolean;
  /** Does this task require multi-step reasoning or plan execution? */
  isMultiStep?: boolean;
  /** Is this a real-time streaming response to a user? */
  isRealtime?: boolean;
  /** Has a previous lighter model already failed on this task? */
  priorModelFailed?: boolean;
  /** Explicit override — caller knows what they need */
  forceRole?: ModelRole;
}

export interface ClassificationResult {
  role: ModelRole;
  rationale: string;
  estimatedCostTier: 'low' | 'medium' | 'high';
}

// ── Action type → role table ────────────────────────────────────────────────
// Populated from observed real-world task patterns.
// Low-cost actions run hundreds of times per shift — every cent matters.

const ACTION_ROLE_MAP: Record<string, ModelRole> = {
  // ── HelpAI / Support (high volume, conversational — always executor first) ──
  help_bot_greeting:        'executor',
  helpdesk_ai_greeting:     'executor',
  helpdesk_ai_question:     'executor',
  helpdesk_ai_embedding:    'executor',
  faq_semantic_search:      'executor',
  helpos_ai_question:       'executor',
  chat_response:            'executor',
  bot_reply:                'executor',
  bot_summon:               'executor',
  support_suggestion:       'executor',

  // ── Scheduling (medium complexity — executor for fills, orchestrator for full gen) ──
  schedule_shifts:          'executor',
  schedule_publish:         'executor',
  TRINITY_AUTONOMOUS_SCHEDULING: 'orchestrator',
  fill_gaps:                'executor',
  optimize:                 'analyzer',

  // ── Payroll & Finance (ALWAYS judge-tier — financial decisions need best reasoning) ──
  'payroll.process':        'judge',
  payroll_session_fee:      'judge',
  payroll_timesheet_approval: 'judge',
  'quickbooks.retry_sync':  'analyzer',
  financial_math_discrepancy_blocked: 'judge',
  COMPLIANCE_REPORT_GENERATED: 'analyzer',

  // ── Document generation (writer-tier — structured, professional output) ──
  field_intel_incident_analyzed: 'writer',
  'field_intel.incident_analyzed': 'writer',
  TRINITY_URGENT_ALERT:     'writer',
  empire_health_analysis:   'analyzer',
  empire_strategy_scan:     'analyzer',

  // ── Admin / platform operations (analyzer) ──
  premium_feature_use:      'analyzer',
  support_interventions:    'analyzer',
  claude_consultation_to_trinity: 'orchestrator',
  triad_summoned:           'orchestrator',
  trinity_task_completed:   'executor',
  fast_mode_task:           'executor',
};

// ── Complexity signal keywords ───────────────────────────────────────────────

const HEAVY_SIGNALS = [
  'payroll', 'w-2', '1099', '941', 'irs', 'tax', 'withholding', 'audit',
  'contract', 'legal', 'compliance', 'regulatory', 'financial', 'invoice',
  'disciplinary', 'termination', 'incident report', 'analyze', 'strategy',
  'explain why', 'compare', 'evaluate', 'recommend', 'multi-step', 'plan',
];

const LIGHT_SIGNALS = [
  'hello', 'hi', 'status', 'check', 'clock in', 'clock out', 'greeting',
  'notify', 'remind', 'list', 'count', 'how many', 'when is', 'confirm',
  'yes', 'no', 'ok', 'done', 'thanks', 'acknowledge',
];

/**
 * classify() — Trinity's routing brain.
 * Returns the optimal ModelRole for a given task without making the AI call.
 */
export function classify(ctx: TaskContext): ClassificationResult {
  // Explicit override always wins
  if (ctx.forceRole) {
    return {
      role: ctx.forceRole,
      rationale: 'Explicit role override by caller',
      estimatedCostTier: roleToCostTier(ctx.forceRole),
    };
  }

  // Prior model failed → escalate one tier
  if (ctx.priorModelFailed) {
    const escalated = escalate(ctx);
    log.info(`[Classifier] Escalating due to prior model failure → ${escalated}`);
    return {
      role: escalated,
      rationale: 'Prior model failed — escalating to heavier tier',
      estimatedCostTier: roleToCostTier(escalated),
    };
  }

  // Financial tasks → always judge tier (never cheap out on money)
  if (ctx.isFinancial) {
    return { role: 'judge', rationale: 'Financial task — judge tier required', estimatedCostTier: 'high' };
  }

  // Known action type → look up directly
  const mappedRole = ACTION_ROLE_MAP[ctx.actionType];
  if (mappedRole) {
    return {
      role: mappedRole,
      rationale: `Mapped from actionType: ${ctx.actionType}`,
      estimatedCostTier: roleToCostTier(mappedRole),
    };
  }

  // Score the prompt text for complexity signals
  const promptLower = (ctx.prompt || '').toLowerCase();
  let score = 0;

  for (const signal of HEAVY_SIGNALS) {
    if (promptLower.includes(signal)) score += 2;
  }
  for (const signal of LIGHT_SIGNALS) {
    if (promptLower.includes(signal)) score -= 1;
  }

  if (ctx.isMultiStep) score += 3;
  if (ctx.isRealtime) score -= 1; // prefer fast/cheap for real-time
  if ((ctx.estimatedTokens || 0) > 4000) score += 2; // large context needs smart model

  // Score → role
  let role: ModelRole;
  if (score >= 6)       role = 'judge';
  else if (score >= 4)  role = 'orchestrator';
  else if (score >= 2)  role = 'analyzer';
  else if (score >= 0)  role = 'writer';
  else                  role = 'executor';

  log.debug(`[Classifier] actionType=${ctx.actionType} score=${score} → ${role}`);

  return {
    role,
    rationale: `Signal score ${score} (heavy:${HEAVY_SIGNALS.filter(s => promptLower.includes(s)).length} light:${LIGHT_SIGNALS.filter(s => promptLower.includes(s)).length})`,
    estimatedCostTier: roleToCostTier(role),
  };
}

function roleToCostTier(role: ModelRole): 'low' | 'medium' | 'high' {
  if (role === 'executor') return 'low';
  if (role === 'writer' || role === 'analyzer') return 'medium';
  return 'high'; // orchestrator, judge
}

function escalate(ctx: TaskContext): ModelRole {
  const mapped = ACTION_ROLE_MAP[ctx.actionType] || 'executor';
  const tiers: ModelRole[] = ['executor', 'writer', 'analyzer', 'orchestrator', 'judge'];
  const current = tiers.indexOf(mapped);
  return tiers[Math.min(current + 1, tiers.length - 1)];
}

/**
 * classifyAndRoute() — convenience wrapper for callers.
 * Returns the ModelRole Trinity should use for this task.
 *
 * Usage:
 *   import { classifyAndRoute } from './providers/taskComplexityClassifier';
 *   const role = classifyAndRoute({ actionType: 'chat_response', prompt: userMessage });
 *   const result = await modelRouter.route({ role, systemPrompt, userPrompt });
 */
export function classifyAndRoute(ctx: TaskContext): ModelRole {
  const result = classify(ctx);
  log.debug(`[Classifier] ${ctx.actionType} → ${result.role} (${result.estimatedCostTier} cost) — ${result.rationale}`);
  return result.role;
}
