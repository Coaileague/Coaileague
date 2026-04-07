
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityClarificationService');
/**
 * TrinityClarificationService — Phase C of Cognitive Enhancement Sprint
 *
 * Formal ambiguity scoring before Trinity acts on complex or ambiguous requests.
 * Generates ONE best clarifying question when ambiguity score > 60 AND stakes are high.
 * Never asks more than one question. Never asks what can be inferred from context.
 */

export interface AmbiguityScore {
  total: number;              // 0-100
  multipleInterpretations: number;
  missingCriticalParam: number;
  contradictorySignals: number;
  highCostOfWrongAction: number;
  breakdown: string[];
}

export interface ClarificationDecision {
  shouldClarify: boolean;
  ambiguityScore: number;
  reason: string;
  question: string | null;
  assumptionIfSkipped: string | null;
}

// Patterns that signal missing critical parameters
const MISSING_PARAM_PATTERNS = [
  { pattern: /\b(schedule|add|assign)\s+(him|her|them|someone|an officer)\b/i, param: 'which officer' },
  { pattern: /\b(at|for|to)\s+(the site|that location|there)\b/i, param: 'which site' },
  { pattern: /\b(this|that|the)\s+(shift|post|position)\b/i, param: 'which shift specifically' },
  { pattern: /\bchange\s+(it|this|that)\b/i, param: 'what specifically to change' },
  { pattern: /\b(pay|rate|billing)\s+(them|him|her)\b/i, param: 'the specific amount' },
  { pattern: /\bsend\s+(a message|an email|notification)\b/i, param: 'to whom' },
  { pattern: /\b(terminate|fire|suspend)\s+(him|her|them)\b/i, param: 'which employee and reason' },
];

// High-stakes action patterns — wrong interpretation is costly
const HIGH_STAKES_ACTIONS = [
  /\b(terminate|fire|suspend|discipline)\b/i,
  /\b(pay|payment|invoice|refund|charge)\b/i,
  /\b(contract|agreement|rate change)\b/i,
  /\b(compliance|license|certification)\b/i,
  /\b(emergency|incident|critical)\b/i,
];

// Multiple interpretation indicators
const MULTI_INTERPRET_PATTERNS = [
  /\bor\b.*\bor\b/i,
  /\b(either|any|whichever|whoever)\b/i,
  /\ball\b.*\bsome\b|\bsome\b.*\ball\b/i,
];

class TrinityClarificationService {
  /**
   * Score the ambiguity of a request and decide whether to ask a clarifying question.
   */
  evaluate(
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }> = [],
    workspaceContext?: any,
  ): ClarificationDecision {
    const score = this.scoreAmbiguity(userMessage, conversationHistory);

    // Low ambiguity OR low stakes → proceed with best interpretation
    if (score.total < 60) {
      return {
        shouldClarify: false,
        ambiguityScore: score.total,
        reason: 'Ambiguity below threshold — proceeding with best interpretation.',
        question: null,
        assumptionIfSkipped: this.inferBestAssumption(userMessage),
      };
    }

    // High ambiguity but low stakes → proceed with stated assumption
    const isHighStakes = HIGH_STAKES_ACTIONS.some(p => p.test(userMessage));
    if (!isHighStakes && score.total < 75) {
      const assumption = this.inferBestAssumption(userMessage);
      return {
        shouldClarify: false,
        ambiguityScore: score.total,
        reason: 'Ambiguous but low stakes — proceeding with stated assumption.',
        question: null,
        assumptionIfSkipped: assumption,
      };
    }

    // High ambiguity AND high stakes → ask one clarifying question
    const question = this.generateClarifyingQuestion(userMessage, score, workspaceContext);
    return {
      shouldClarify: true,
      ambiguityScore: score.total,
      reason: `Ambiguity score ${score.total}/100 with high-stakes action detected. ${score.breakdown.join(' ')}`,
      question,
      assumptionIfSkipped: null,
    };
  }

  /**
   * Score ambiguity on 4 dimensions as per blueprint spec.
   */
  private scoreAmbiguity(
    message: string,
    history: Array<{ role: string; content: string }>,
  ): AmbiguityScore {
    const breakdown: string[] = [];
    let multipleInterpretations = 0;
    let missingCriticalParam = 0;
    let contradictorySignals = 0;
    let highCostOfWrongAction = 0;

    // Check for multiple valid interpretations (+30)
    if (MULTI_INTERPRET_PATTERNS.some(p => p.test(message))) {
      multipleInterpretations = 30;
      breakdown.push('Multiple interpretations possible.');
    }

    // Check for missing critical parameter (+25)
    const missingParam = MISSING_PARAM_PATTERNS.find(mp => mp.pattern.test(message));
    if (missingParam && !this.isResolvedInHistory(missingParam.param, history)) {
      missingCriticalParam = 25;
      breakdown.push(`Missing critical parameter: ${missingParam.param}.`);
    }

    // Check for contradictory signals (+20)
    if (/\bbut\b.{0,30}\b(also|still|anyway)\b/i.test(message) ||
        /\b(urgent|asap|now)\b.{0,50}\b(when.*available|later|sometime)\b/i.test(message)) {
      contradictorySignals = 20;
      breakdown.push('Contradictory signals in request.');
    }

    // High cost of wrong action (+25)
    if (HIGH_STAKES_ACTIONS.some(p => p.test(message))) {
      highCostOfWrongAction = 25;
      breakdown.push('High cost of wrong action detected.');
    }

    const total = Math.min(100, multipleInterpretations + missingCriticalParam + contradictorySignals + highCostOfWrongAction);

    return {
      total,
      multipleInterpretations,
      missingCriticalParam,
      contradictorySignals,
      highCostOfWrongAction,
      breakdown,
    };
  }

  private generateClarifyingQuestion(
    message: string,
    score: AmbiguityScore,
    context?: any,
  ): string {
    // Priority: missing param → multiple interpretations → contradictory signals

    if (score.missingCriticalParam > 0) {
      const missing = MISSING_PARAM_PATTERNS.find(mp => mp.pattern.test(message));
      if (missing) {
        return `To make sure I do this correctly — could you confirm ${missing.param}?`;
      }
    }

    if (score.multipleInterpretations > 0) {
      // Extract the two most likely interpretations
      return `I want to make sure I help with the right thing — are you asking me to [do X] or [do Y]? (One sentence reply is fine.)`;
    }

    if (score.highCostOfWrongAction > 0) {
      const action = this.extractMainAction(message);
      return `Before I ${action}, can you confirm the specific ${this.extractTarget(message)} you're referring to?`;
    }

    return `I want to make sure I understand correctly — could you clarify what you mean by that?`;
  }

  private extractMainAction(message: string): string {
    const actionMatch = message.match(/\b(terminate|suspend|schedule|assign|pay|send|change|update|cancel|approve|reject)\b/i);
    return actionMatch ? actionMatch[1].toLowerCase() : 'proceed';
  }

  private extractTarget(message: string): string {
    if (/officer|employee|guard/.test(message.toLowerCase())) return 'employee';
    if (/site|location|post/.test(message.toLowerCase())) return 'site or location';
    if (/shift|schedule/.test(message.toLowerCase())) return 'shift';
    if (/invoice|contract/.test(message.toLowerCase())) return 'contract or invoice';
    return 'item';
  }

  private inferBestAssumption(message: string): string {
    // Return what Trinity will assume when proceeding without clarification
    const missingParam = MISSING_PARAM_PATTERNS.find(mp => mp.pattern.test(message));
    if (missingParam) {
      return `Proceeding with the most recently discussed ${missingParam.param} from context.`;
    }
    return 'Proceeding with the most likely interpretation based on recent conversation context.';
  }

  private isResolvedInHistory(
    param: string,
    history: Array<{ role: string; content: string }>,
  ): boolean {
    // Check if the recent conversation already established the missing parameter
    const recent = history.slice(-4).map(h => h.content).join(' ').toLowerCase();
    if (param === 'which officer') return /\b(officer|employee|guard)\s+\w+/.test(recent);
    if (param === 'which site') return /\b(site|location|at)\s+\w+/.test(recent);
    return false;
  }
}

export const trinityClarificationService = new TrinityClarificationService();
