/**
 * TRINITY COMPLEXITY CLASSIFIER
 * ==============================
 * Pre-flight request scoring that runs BEFORE dispatching to the triad.
 * Uses the cheapest available model (gemini_flash → gpt4o_mini → claude_haiku)
 * to classify complexity in <50 tokens so the triad can select appropriate tiers.
 *
 * Complexity levels drive tier selection:
 *   low    → single agent, lowest tier (flash/mini/haiku)
 *   medium → two agents, mid tier (pro/gpt4o/sonnet)
 *   high   → all three agents, top tier where needed
 */

import { modelRouter } from './providers/modelRouter';
import { createLogger } from '../../lib/logger';

const log = createLogger('ComplexityClassifier');

export type ComplexityLevel = 'low' | 'medium' | 'high';

export interface ComplexityDomain {
  domain:
    | 'conversational'   // simple Q&A, greetings
    | 'operational'      // schedules, timesheets, shifts
    | 'financial'        // invoices, payroll, billing
    | 'compliance'       // legal, safety, regulatory
    | 'strategic'        // analysis, planning, forecasting
    | 'technical';       // platform diagnostics, code, integrations
}

export interface ClassificationResult {
  complexity: ComplexityLevel;
  domain: ComplexityDomain['domain'];
  requiresJudge: boolean;  // true → Claude should arbitrate final output
  requiresReasoner: boolean; // true → Gemini should reason before final answer
  estimatedInputTokens: number; // rough estimate for budget pre-check
  classifierModel: string;
  classifierLatencyMs: number;
}

const CLASSIFIER_SYSTEM_PROMPT = `You are a request complexity classifier for an AI system.
Classify the user's message in JSON only. No explanation, no preamble.

Output exactly:
{"complexity":"low|medium|high","domain":"conversational|operational|financial|compliance|strategic|technical","requiresJudge":true|false,"requiresReasoner":true|false}

Rules:
- low: greetings, simple status questions, single-fact lookups ("what time is my shift?", "how many employees?")
- medium: multi-step questions, data comparisons, summaries ("compare this week's hours vs last", "summarize pending invoices")
- high: strategic analysis, compliance review, complex plans, anything with legal/financial risk ("help me plan Q4 hiring", "analyze our payroll compliance", "what should we do about the overdue client?")
- requiresJudge=true when: compliance risk, financial decisions, high complexity, or conflicting considerations
- requiresReasoner=true when: medium or high complexity, data synthesis needed, or domain is strategic/compliance/financial`;

const SIMPLE_PATTERNS: RegExp[] = [
  /^(hi|hello|hey|thanks|thank you|ok|okay|got it|sure|yes|no|bye|goodbye)\.?$/i,
  /^(what|who|when|where) is .{1,40}\?$/i,
  /^(how many|how much|what's the) .{1,50}\?$/i,
  /^(show me|list|tell me) .{1,50}$/i,
];

const HIGH_STAKES_PATTERNS: RegExp[] = [
  /\b(terminate|termination|lawsuit|legal|sue|compliance\s+violation|audit|penalty|fine|breach)\b/i,
  /\b(payroll\s+error|overpayment|underpayment|discrimination|harassment|injury|accident)\b/i,
  /\b(strategy|strategic|forecast|q[1-4]\s+plan|annual\s+plan|expansion|acquisition)\b/i,
  /\b(fire|layoff|restructur|reorganiz|budget\s+cut|cost\s+reduc)\b/i,
];

function quickHeuristicClassify(message: string): ClassificationResult | null {
  const trimmed = message.trim();

  if (trimmed.length < 80 && SIMPLE_PATTERNS.some(p => p.test(trimmed))) {
    return {
      complexity: 'low',
      domain: 'conversational',
      requiresJudge: false,
      requiresReasoner: false,
      estimatedInputTokens: 500,
      classifierModel: 'heuristic',
      classifierLatencyMs: 0,
    };
  }

  if (HIGH_STAKES_PATTERNS.some(p => p.test(trimmed))) {
    return {
      complexity: 'high',
      domain: /\b(strategy|strategic|forecast|plan|expansion)\b/i.test(trimmed) ? 'strategic'
        : /\b(lawsuit|legal|sue|compliance|audit|penalty|fine|discrimination|harassment)\b/i.test(trimmed) ? 'compliance'
        : /\b(payroll|overpayment|underpayment|invoice|billing)\b/i.test(trimmed) ? 'financial'
        : 'strategic',
      requiresJudge: true,
      requiresReasoner: true,
      estimatedInputTokens: 4000,
      classifierModel: 'heuristic',
      classifierLatencyMs: 0,
    };
  }

  return null; // needs LLM classification
}

export async function classifyComplexity(
  message: string,
  workspaceId: string,
  conversationTurnCount: number = 0,
): Promise<ClassificationResult> {
  const start = Date.now();

  // Fast path: heuristic classification for obvious cases (zero LLM cost)
  const heuristic = quickHeuristicClassify(message);
  if (heuristic) return heuristic;

  // LLM classification for ambiguous cases
  // Trim to 500 chars to keep classifier token cost minimal
  const truncated = message.length > 500 ? `${message.slice(0, 497)}...` : message;
  const contextNote = conversationTurnCount > 4
    ? ` (conversation has ${conversationTurnCount} prior turns — context depth is a factor)`
    : '';

  try {
    const result = await modelRouter.route({
      role: 'executor', // cheapest chain: gemini_flash → gpt4o_mini → claude_haiku
      systemPrompt: CLASSIFIER_SYSTEM_PROMPT,
      userPrompt: `Message: "${truncated}"${contextNote}\n\nClassify:`,
      workspaceId,
      featureKey: 'trinity_classify',
      maxTokens: 80,
    });

    const latencyMs = Date.now() - start;
    let raw = result.content.trim();

    // Strip markdown fences
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) raw = fenceMatch[1].trim();
    raw = raw.replace(/^`+|`+$/g, '').trim();

    const parsed = JSON.parse(raw);
    const complexity: ComplexityLevel = ['low', 'medium', 'high'].includes(parsed.complexity)
      ? parsed.complexity : 'medium';
    const domain: ComplexityDomain['domain'] = [
      'conversational', 'operational', 'financial', 'compliance', 'strategic', 'technical',
    ].includes(parsed.domain) ? parsed.domain : 'conversational';

    return {
      complexity,
      domain,
      requiresJudge: Boolean(parsed.requiresJudge),
      requiresReasoner: Boolean(parsed.requiresReasoner),
      estimatedInputTokens: complexity === 'low' ? 500 : complexity === 'medium' ? 2000 : 4000,
      classifierModel: result.modelUsed,
      classifierLatencyMs: latencyMs,
    };
  } catch (err) {
    log.warn('[ComplexityClassifier] LLM classification failed, defaulting to medium:', (err as Error).message);
    return {
      complexity: 'medium',
      domain: 'conversational',
      requiresJudge: false,
      requiresReasoner: true,
      estimatedInputTokens: 2000,
      classifierModel: 'fallback',
      classifierLatencyMs: Date.now() - start,
    };
  }
}
