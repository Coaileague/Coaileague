/**
 * LLM-AS-JUDGE EVALUATOR
 * ======================
 * Creates temporary internal Evaluation Subagents to judge the quality
 * of other subagents' outputs using structured criteria.
 * 
 * Capabilities:
 * - Quality Assessment: Judge outputs for correctness, completeness, tone
 * - Multi-Criteria Evaluation: Score against multiple dimensions
 * - Comparative Analysis: Compare multiple outputs and rank them
 * - Bias Detection: Check for biased or inappropriate content
 * - Consensus Voting: Multiple judges for high-stakes decisions
 * 
 * Fortune 500 Requirements:
 * - Separation of execution and evaluation
 * - Configurable evaluation criteria per domain
 * - Complete audit trail of judgments
 */

import { aiBrainService } from './aiBrainService';
import { platformEventBus } from '../platformEventBus';
import { db } from '../../db';
import { systemAuditLogs } from '@shared/schema';
import crypto from 'crypto';
import { createLogger } from '../../lib/logger';
const log = createLogger('llmJudgeEvaluator');

// ============================================================================
// TYPES
// ============================================================================

export interface EvaluationCriteria {
  name: string;
  description: string;
  weight: number;
  scoringGuide: string;
  minScore: number;
  maxScore: number;
  failThreshold?: number;
}

export interface EvaluationRequest {
  evaluationId?: string;
  workspaceId: string;
  userId: string;
  
  // What to evaluate
  content: any;
  contentType: 'text' | 'json' | 'code' | 'decision' | 'plan';
  context?: string;
  
  // How to evaluate
  criteria: EvaluationCriteria[];
  evaluatorPersona?: EvaluatorPersona;
  
  // Original request context
  originalIntent?: string;
  executionId?: string;
  subagentId?: string;
}

export interface EvaluatorPersona {
  name: string;
  expertise: string[];
  strictness: 'lenient' | 'moderate' | 'strict' | 'critical';
  focusAreas: string[];
}

export interface EvaluationResult {
  evaluationId: string;
  timestamp: Date;
  
  // Overall assessment
  overallScore: number;
  overallVerdict: 'excellent' | 'good' | 'acceptable' | 'needs_improvement' | 'rejected';
  passed: boolean;
  
  // Criteria scores
  criteriaScores: CriteriaScore[];
  
  // Detailed feedback
  summary: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  
  // Metadata
  evaluatorPersona: EvaluatorPersona;
  evaluationTimeMs: number;
  confidenceScore: number;
  
  // Audit
  auditTrail: EvaluationAuditEntry;
}

export interface CriteriaScore {
  criteriaName: string;
  score: number;
  maxScore: number;
  normalizedScore: number;
  rationale: string;
  passed: boolean;
}

export interface EvaluationAuditEntry {
  id: string;
  evaluationId: string;
  timestamp: Date;
  inputHash: string;
  outputHash: string;
  modelUsed: string;
  tokensUsed: number;
}

export interface ConsensusEvaluationResult {
  consensusScore: number;
  consensusVerdict: EvaluationResult['overallVerdict'];
  agreementLevel: number;
  individualResults: EvaluationResult[];
  dissent?: {
    evaluatorIndex: number;
    reason: string;
  };
}

// Default evaluation criteria templates
export const EVALUATION_TEMPLATES = {
  code_quality: [
    { name: 'correctness', description: 'Does the code do what it should?', weight: 0.3, scoringGuide: '1-5: Completely broken to perfectly correct', minScore: 1, maxScore: 5, failThreshold: 2 },
    { name: 'readability', description: 'Is the code easy to understand?', weight: 0.2, scoringGuide: '1-5: Unreadable to crystal clear', minScore: 1, maxScore: 5 },
    { name: 'efficiency', description: 'Is the code performant?', weight: 0.15, scoringGuide: '1-5: Very slow to highly optimized', minScore: 1, maxScore: 5 },
    { name: 'security', description: 'Does the code follow security best practices?', weight: 0.2, scoringGuide: '1-5: Vulnerable to bulletproof', minScore: 1, maxScore: 5, failThreshold: 2 },
    { name: 'maintainability', description: 'Can the code be easily maintained?', weight: 0.15, scoringGuide: '1-5: Nightmare to effortless', minScore: 1, maxScore: 5 },
  ] as EvaluationCriteria[],
  
  text_quality: [
    { name: 'clarity', description: 'Is the message clear and understandable?', weight: 0.25, scoringGuide: '1-5: Confusing to crystal clear', minScore: 1, maxScore: 5 },
    { name: 'completeness', description: 'Does it cover all necessary points?', weight: 0.25, scoringGuide: '1-5: Missing key info to comprehensive', minScore: 1, maxScore: 5 },
    { name: 'tone', description: 'Is the tone appropriate for the context?', weight: 0.2, scoringGuide: '1-5: Inappropriate to perfectly suited', minScore: 1, maxScore: 5, failThreshold: 2 },
    { name: 'accuracy', description: 'Is the information factually correct?', weight: 0.3, scoringGuide: '1-5: Incorrect to verified accurate', minScore: 1, maxScore: 5, failThreshold: 3 },
  ] as EvaluationCriteria[],
  
  decision_quality: [
    { name: 'reasoning', description: 'Is the reasoning sound and logical?', weight: 0.3, scoringGuide: '1-5: Illogical to impeccable reasoning', minScore: 1, maxScore: 5 },
    { name: 'risk_assessment', description: 'Are risks properly considered?', weight: 0.25, scoringGuide: '1-5: Ignores risks to thorough analysis', minScore: 1, maxScore: 5 },
    { name: 'alternatives', description: 'Were alternatives considered?', weight: 0.2, scoringGuide: '1-5: No alternatives to comprehensive options', minScore: 1, maxScore: 5 },
    { name: 'implementation_feasibility', description: 'Is the decision implementable?', weight: 0.25, scoringGuide: '1-5: Impractical to easily actionable', minScore: 1, maxScore: 5 },
  ] as EvaluationCriteria[],
  
  plan_quality: [
    { name: 'completeness', description: 'Does the plan cover all requirements?', weight: 0.25, scoringGuide: '1-5: Missing key steps to comprehensive', minScore: 1, maxScore: 5 },
    { name: 'sequencing', description: 'Are steps in the right order?', weight: 0.2, scoringGuide: '1-5: Wrong order to optimal sequence', minScore: 1, maxScore: 5 },
    { name: 'feasibility', description: 'Is the plan realistic?', weight: 0.25, scoringGuide: '1-5: Impossible to achievable', minScore: 1, maxScore: 5 },
    { name: 'contingency', description: 'Are fallback plans included?', weight: 0.15, scoringGuide: '1-5: No fallbacks to robust contingencies', minScore: 1, maxScore: 5 },
    { name: 'resource_estimation', description: 'Are resources properly estimated?', weight: 0.15, scoringGuide: '1-5: Wildly off to accurate', minScore: 1, maxScore: 5 },
  ] as EvaluationCriteria[],
};

// Default evaluator personas
const DEFAULT_PERSONAS: Record<string, EvaluatorPersona> = {
  senior_engineer: {
    name: 'Senior Software Engineer',
    expertise: ['code review', 'architecture', 'best practices'],
    strictness: 'strict',
    focusAreas: ['correctness', 'maintainability', 'security'],
  },
  compliance_officer: {
    name: 'Compliance Officer',
    expertise: ['regulations', 'risk management', 'audit'],
    strictness: 'critical',
    focusAreas: ['accuracy', 'completeness', 'risk'],
  },
  quality_analyst: {
    name: 'Quality Analyst',
    expertise: ['testing', 'edge cases', 'user experience'],
    strictness: 'moderate',
    focusAreas: ['completeness', 'edge cases', 'usability'],
  },
  business_analyst: {
    name: 'Business Analyst',
    expertise: ['requirements', 'stakeholder needs', 'value delivery'],
    strictness: 'moderate',
    focusAreas: ['requirements coverage', 'business value', 'clarity'],
  },
};

// ============================================================================
// LLM JUDGE EVALUATOR CLASS
// ============================================================================

class LLMJudgeEvaluator {
  private static instance: LLMJudgeEvaluator;
  private evaluationCache: Map<string, EvaluationResult> = new Map();

  private constructor() {
    log.info('[LLMJudgeEvaluator] Initializing evaluation subagent system...');
  }

  static getInstance(): LLMJudgeEvaluator {
    if (!LLMJudgeEvaluator.instance) {
      LLMJudgeEvaluator.instance = new LLMJudgeEvaluator();
    }
    return LLMJudgeEvaluator.instance;
  }

  /**
   * Evaluate content using specified criteria
   */
  async evaluate(request: EvaluationRequest): Promise<EvaluationResult> {
    const evaluationId = request.evaluationId || `eval-${crypto.randomUUID()}`;
    const startTime = Date.now();

    // Get or create evaluator persona
    const persona = request.evaluatorPersona || this.selectPersonaForContent(request.contentType);
    
    // Build evaluation prompt
    const prompt = this.buildEvaluationPrompt(request, persona);
    
    try {
      // Call AI for evaluation
      const response = await (aiBrainService as any).query({
        prompt,
        systemPrompt: this.buildSystemPrompt(persona),
        featureId: 'llm_judge',
        workspaceId: request.workspaceId,
        userId: request.userId,
        responseFormat: 'json',
      });

      // Parse response
      const parsed = JSON.parse(response.response || '{}');
      
      // Calculate criteria scores
      const criteriaScores = this.calculateCriteriaScores(request.criteria, parsed.scores || {});
      
      // Calculate overall score
      const overallScore = this.calculateOverallScore(criteriaScores, request.criteria);
      
      // Determine verdict
      const overallVerdict = this.determineVerdict(overallScore, criteriaScores);
      const passed = overallVerdict !== 'rejected' && overallVerdict !== 'needs_improvement';

      // Create audit entry
      const auditTrail = this.createAuditEntry(evaluationId, request);

      const result: EvaluationResult = {
        evaluationId,
        timestamp: new Date(),
        overallScore,
        overallVerdict,
        passed,
        criteriaScores,
        summary: parsed.summary || 'Evaluation completed',
        strengths: parsed.strengths || [],
        weaknesses: parsed.weaknesses || [],
        suggestions: parsed.suggestions || [],
        evaluatorPersona: persona,
        evaluationTimeMs: Date.now() - startTime,
        confidenceScore: parsed.confidence || 0.8,
        auditTrail,
      };

      // Cache result
      this.evaluationCache.set(evaluationId, result);

      // Log to audit system
      await this.logEvaluation(request, result);

      // Publish event
      platformEventBus.publish('ai_brain_action', {
        action: 'llm_judge_evaluation',
        evaluationId,
        overallScore,
        verdict: overallVerdict,
        passed,
        evaluatorPersona: persona.name,
      });

      return result;

    } catch (error: any) {
      log.error('[LLMJudgeEvaluator] Evaluation failed:', error);
      
      // Return failed evaluation
      return {
        evaluationId,
        timestamp: new Date(),
        overallScore: 0,
        overallVerdict: 'rejected',
        passed: false,
        criteriaScores: request.criteria.map(c => ({
          criteriaName: c.name,
          score: 0,
          maxScore: c.maxScore,
          normalizedScore: 0,
          rationale: 'Evaluation failed',
          passed: false,
        })),
        summary: `Evaluation failed: ${error.message}`,
        strengths: [],
        weaknesses: ['Evaluation system error'],
        suggestions: ['Retry evaluation'],
        evaluatorPersona: persona,
        evaluationTimeMs: Date.now() - startTime,
        confidenceScore: 0,
        auditTrail: this.createAuditEntry(evaluationId, request),
      };
    }
  }

  /**
   * Run consensus evaluation with multiple judges
   */
  async evaluateWithConsensus(
    request: EvaluationRequest,
    judgeCount: number = 3
  ): Promise<ConsensusEvaluationResult> {
    const personas = this.selectMultiplePersonas(judgeCount, request.contentType);
    
    // Run evaluations in parallel
    const evaluationPromises = personas.map(persona => 
      this.evaluate({ ...request, evaluatorPersona: persona })
    );
    
    const results = await Promise.all(evaluationPromises);
    
    // Calculate consensus
    const scores = results.map(r => r.overallScore);
    const consensusScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    
    // Calculate agreement level (how close are the scores)
    const variance = this.calculateVariance(scores);
    const agreementLevel = Math.max(0, 1 - (variance / 25)); // Normalize variance
    
    // Determine consensus verdict
    const verdicts = results.map(r => r.overallVerdict);
    const verdictCounts = new Map<string, number>();
    verdicts.forEach(v => verdictCounts.set(v, (verdictCounts.get(v) || 0) + 1));
    const consensusVerdict = [...verdictCounts.entries()]
      .sort((a, b) => b[1] - a[1])[0][0] as EvaluationResult['overallVerdict'];
    
    // Check for dissent
    let dissent: ConsensusEvaluationResult['dissent'];
    const outlierIndex = this.findOutlier(scores);
    if (outlierIndex !== -1 && agreementLevel < 0.7) {
      dissent = {
        evaluatorIndex: outlierIndex,
        reason: `Score of ${scores[outlierIndex].toFixed(1)} deviates significantly from consensus`,
      };
    }

    return {
      consensusScore,
      consensusVerdict,
      agreementLevel,
      individualResults: results,
      dissent,
    };
  }

  /**
   * Quick pass/fail check with single criterion
   */
  async quickCheck(
    content: any,
    criterion: string,
    threshold: number,
    workspaceId: string,
    userId: string
  ): Promise<{ passed: boolean; score: number; reason: string }> {
    const result = await this.evaluate({
      workspaceId,
      userId,
      content,
      contentType: 'text',
      criteria: [{
        name: criterion,
        description: criterion,
        weight: 1,
        scoringGuide: '1-5 scale',
        minScore: 1,
        maxScore: 5,
      }],
    });

    return {
      passed: result.overallScore >= threshold,
      score: result.overallScore,
      reason: result.summary,
    };
  }

  /**
   * Build evaluation prompt
   */
  private buildEvaluationPrompt(request: EvaluationRequest, persona: EvaluatorPersona): string {
    const criteriaList = request.criteria.map((c, i) => 
      `${i + 1}. ${c.name}: ${c.description} (${c.minScore}-${c.maxScore} scale, weight: ${c.weight})\n   Scoring: ${c.scoringGuide}`
    ).join('\n');

    return `As a ${persona.name} with expertise in ${persona.expertise.join(', ')}, evaluate the following ${request.contentType}:

${request.context ? `CONTEXT: ${request.context}\n` : ''}
${request.originalIntent ? `ORIGINAL INTENT: ${request.originalIntent}\n` : ''}

CONTENT TO EVALUATE:
${typeof request.content === 'string' ? request.content : JSON.stringify(request.content, null, 2)}

EVALUATION CRITERIA:
${criteriaList}

Strictness Level: ${persona.strictness.toUpperCase()}
Focus Areas: ${persona.focusAreas.join(', ')}

Provide your evaluation as JSON:
{
  "scores": {
    "${request.criteria.map(c => c.name).join('": 1-5,\n    "')}": 1-5
  },
  "summary": "One paragraph overall assessment",
  "strengths": ["List of strong points"],
  "weaknesses": ["List of areas for improvement"],
  "suggestions": ["Actionable improvement suggestions"],
  "confidence": 0.0-1.0
}`;
  }

  /**
   * Build system prompt for evaluator persona
   */
  private buildSystemPrompt(persona: EvaluatorPersona): string {
    const strictnessGuide = {
      lenient: 'Give benefit of the doubt. Focus on what works.',
      moderate: 'Balance praise and criticism. Be fair but thorough.',
      strict: 'Hold to high standards. Point out all issues.',
      critical: 'Be very demanding. Only excellent work should score highly.',
    };

    return `You are an ${persona.name} acting as an evaluator. 
Your expertise: ${persona.expertise.join(', ')}
Your approach: ${strictnessGuide[persona.strictness]}
Always focus on: ${persona.focusAreas.join(', ')}

Provide honest, actionable feedback. Score based on the criteria provided.
Be consistent in your scoring across evaluations.`;
  }

  /**
   * Select appropriate persona for content type
   */
  private selectPersonaForContent(contentType: string): EvaluatorPersona {
    switch (contentType) {
      case 'code':
        return DEFAULT_PERSONAS.senior_engineer;
      case 'decision':
        return DEFAULT_PERSONAS.business_analyst;
      case 'plan':
        return DEFAULT_PERSONAS.quality_analyst;
      default:
        return DEFAULT_PERSONAS.quality_analyst;
    }
  }

  /**
   * Select multiple different personas
   */
  private selectMultiplePersonas(count: number, contentType: string): EvaluatorPersona[] {
    const allPersonas = Object.values(DEFAULT_PERSONAS);
    const primary = this.selectPersonaForContent(contentType);
    const others = allPersonas.filter(p => p.name !== primary.name);
    
    return [primary, ...others.slice(0, count - 1)];
  }

  /**
   * Calculate criteria scores from raw scores
   */
  private calculateCriteriaScores(
    criteria: EvaluationCriteria[],
    rawScores: Record<string, number>
  ): CriteriaScore[] {
    return criteria.map(c => {
      const score = rawScores[c.name] || 0;
      const normalizedScore = (score - c.minScore) / (c.maxScore - c.minScore);
      const passed = !c.failThreshold || score >= c.failThreshold;
      
      return {
        criteriaName: c.name,
        score,
        maxScore: c.maxScore,
        normalizedScore,
        rationale: passed ? 'Meets threshold' : 'Below threshold',
        passed,
      };
    });
  }

  /**
   * Calculate weighted overall score
   */
  private calculateOverallScore(
    criteriaScores: CriteriaScore[],
    criteria: EvaluationCriteria[]
  ): number {
    let weightedSum = 0;
    let totalWeight = 0;

    for (let i = 0; i < criteriaScores.length; i++) {
      weightedSum += criteriaScores[i].normalizedScore * criteria[i].weight;
      totalWeight += criteria[i].weight;
    }

    return (weightedSum / totalWeight) * 5; // Scale to 1-5
  }

  /**
   * Determine verdict based on scores
   */
  private determineVerdict(
    overallScore: number,
    criteriaScores: CriteriaScore[]
  ): EvaluationResult['overallVerdict'] {
    // Check for any failed criteria
    const hasFailedCriteria = criteriaScores.some(s => !s.passed);
    
    if (hasFailedCriteria) {
      return 'rejected';
    }
    
    if (overallScore >= 4.5) return 'excellent';
    if (overallScore >= 3.5) return 'good';
    if (overallScore >= 2.5) return 'acceptable';
    if (overallScore >= 1.5) return 'needs_improvement';
    return 'rejected';
  }

  /**
   * Create audit entry
   */
  private createAuditEntry(evaluationId: string, request: EvaluationRequest): EvaluationAuditEntry {
    const inputHash = crypto.createHash('sha256')
      .update(JSON.stringify(request.content))
      .digest('hex');

    return {
      id: crypto.randomUUID(),
      evaluationId,
      timestamp: new Date(),
      inputHash,
      outputHash: '', // Set after evaluation
      modelUsed: 'gemini-2.5-flash',
      tokensUsed: 0,
    };
  }

  /**
   * Calculate variance of scores
   */
  private calculateVariance(scores: number[]): number {
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const squaredDiffs = scores.map(s => Math.pow(s - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / scores.length;
  }

  /**
   * Find outlier score index
   */
  private findOutlier(scores: number[]): number {
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const stdDev = Math.sqrt(this.calculateVariance(scores));
    
    for (let i = 0; i < scores.length; i++) {
      if (Math.abs(scores[i] - mean) > 1.5 * stdDev) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Log evaluation to audit system
   */
  private async logEvaluation(request: EvaluationRequest, result: EvaluationResult): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        id: crypto.randomUUID(),
        entityType: 'evaluation',
        entityId: result.evaluationId,
        userId: request.userId,
        workspaceId: request.workspaceId,
        action: 'evaluate',
        metadata: { eventType: 'llm_judge_evaluation', severity: result.passed ? 'low' : 'medium', details: JSON.stringify({ contentType: request.contentType, overallScore: result.overallScore, verdict: result.overallVerdict, passed: result.passed, evaluatorPersona: result.evaluatorPersona.name, criteriaCount: result.criteriaScores.length, evaluationTimeMs: result.evaluationTimeMs }) },
      });
    } catch (error) {
      log.error('[LLMJudgeEvaluator] Failed to log evaluation:', error);
    }
  }

  /**
   * Get cached evaluation result
   */
  getCachedResult(evaluationId: string): EvaluationResult | undefined {
    return this.evaluationCache.get(evaluationId);
  }

  /**
   * Get evaluation templates
   */
  getTemplates(): typeof EVALUATION_TEMPLATES {
    return EVALUATION_TEMPLATES;
  }
}

export const llmJudgeEvaluator = LLMJudgeEvaluator.getInstance();
