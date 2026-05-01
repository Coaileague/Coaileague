/**
 * MetaCognitionService - Trinity's "Prefrontal Cortex"
 * 
 * TRI-AI ORCHESTRATION CHAIN OF COMMAND:
 * ┌─────────────────────────────────────────────────────┐
 * │  GEMINI (AI Brain) - Primary Intelligence           │
 * │  Role: Cognitive thinking, data analysis, tool use  │
 * │  Models: Gemini 3 Pro Preview (deep reasoning)      │
 * │         Gemini 2.5 Flash (fast operations)          │
 * │  Thinking: thinking_level=high for complex problems │
 * ├─────────────────────────────────────────────────────┤
 * │  CLAUDE (Architect/Judge) - Final Arbiter           │
 * │  Role: Synthesis, strategic analysis, quality gate  │
 * │  When: Complex tasks, model disagreements, RFPs     │
 * │  Strength: Deep reasoning, nuanced judgment         │
 * ├─────────────────────────────────────────────────────┤
 * │  GPT (Reliable Worker) - Fast Execution             │
 * │  Role: Arbitration, grunt work, fast responses      │
 * │  When: Conflict resolution, chat, quick analysis    │
 * │  Strength: Speed, reliability, cost-effectiveness   │
 * └─────────────────────────────────────────────────────┘
 * 
 * WORKFLOW: Gemini generates → if disagreement/low confidence →
 *   Claude synthesizes the best answer → GPT arbitrates conflicts →
 *   Gemini calibrates final confidence → deliver response
 * 
 * Follows the 7-step orchestration pattern:
 * TRIGGER → FETCH → VALIDATE → PROCESS → MUTATE → CONFIRM → NOTIFY
 */

import { db } from "../../db";
import { sql, eq } from "drizzle-orm";
import { geminiClient } from "./providers/geminiClient";
import { openaiClient } from "./providers/openaiClient";
import { claudeService } from "./trinity-orchestration/trinityValidationService";
import { eventBus } from "../trinity/eventBus";
import { typedCount, typedExec, typedQuery } from '../../lib/typedSql';
import { metaCognitionLogs } from "@shared/schema";
import { createLogger } from '../../lib/logger';
const log = createLogger('metaCognitionService');

// Types for meta-cognition
interface ModelResponse {
  modelId: string;
  modelName: string;
  provider: string;
  response: string;
  confidence: number;
  reasoning?: string;
  executionTimeMs: number;
  tokensUsed: number;
}

interface CognitiveContext {
  originalPrompt: string;
  taskType: string;
  taskId?: string;
  workspaceId?: string;
  responses: ModelResponse[];
  triggerReason: 'complex_task' | 'low_confidence' | 'model_disagreement';
}

interface MetaCognitiveResult {
  finalAnswer: string;
  calibratedConfidence: number;
  originalConfidence: number;
  contributingModels: string[];
  synthesisNotes: string;
  resolutionMethod: 'synthesis' | 'arbitration' | 'calibration' | 'human_escalation';
  disagreementType?: 'factual' | 'reasoning' | 'style' | 'none';
  costBreakdown: {
    synthesisTokens: number;
    arbitrationTokens: number;
    calibrationTokens: number;
    totalTokens: number;
    totalCostCents: number;
  };
  humanEscalationRequired: boolean;
  escalationQuestions?: string[];
  executionTimeMs: number;
}

// Thresholds for meta-cognition triggers
const CONFIDENCE_THRESHOLD = 0.75;
const DISAGREEMENT_THRESHOLD = 0.3; // Semantic similarity below this = disagreement
const HUMAN_ESCALATION_THRESHOLD = 0.6;

// Complex task types that always trigger meta-cognition (tri-AI orchestration)
const COMPLEX_TASK_TYPES = [
  'rfp_generation',
  'contract_review',
  'proposal_creation',
  'compliance_report',
  'sales_strategy',
  'failure_analysis',
  'scheduling_conflict_resolution',
  'payroll_discrepancy_analysis',
  'invoice_reconciliation',
  'workforce_optimization',
  'strategic_business_advisory',
];

class MetaCognitionService {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    log.info('[MetaCognition] Initializing meta-cognition service...');
    this.initialized = true;
    log.info('[MetaCognition] Meta-cognition service ready');
  }

  /**
   * STEP 1: TRIGGER
   * Determines if meta-cognition should be activated
   */
  shouldTriggerMetaCognition(
    taskType: string,
    responses: ModelResponse[]
  ): { shouldTrigger: boolean; reason: CognitiveContext['triggerReason'] | null } {
    // Check if task is inherently complex
    if (COMPLEX_TASK_TYPES.includes(taskType)) {
      return { shouldTrigger: true, reason: 'complex_task' };
    }

    // Check if any model returned low confidence
    const hasLowConfidence = responses.some(r => r.confidence < CONFIDENCE_THRESHOLD);
    if (hasLowConfidence) {
      return { shouldTrigger: true, reason: 'low_confidence' };
    }

    // Check if models disagree (if we have 2+ responses)
    if (responses.length >= 2) {
      const hasDisagreement = this.detectDisagreement(responses);
      if (hasDisagreement) {
        return { shouldTrigger: true, reason: 'model_disagreement' };
      }
    }

    return { shouldTrigger: false, reason: null };
  }

  /**
   * STEP 2: FETCH
   * Gathers all model responses into a cognitive context object
   */
  buildCognitiveContext(
    originalPrompt: string,
    taskType: string,
    responses: ModelResponse[],
    triggerReason: CognitiveContext['triggerReason'],
    taskId?: string,
    workspaceId?: string
  ): CognitiveContext {
    return {
      originalPrompt,
      taskType,
      taskId,
      workspaceId,
      responses,
      triggerReason
    };
  }

  /**
   * STEP 3: VALIDATE
   * Confirms there's something meaningful to synthesize
   */
  validateForMetaCognition(context: CognitiveContext): { 
    valid: boolean; 
    reason?: string;
    fallbackResponse?: ModelResponse;
  } {
    // Need at least 1 response
    if (context.responses.length === 0) {
      return { valid: false, reason: 'No model responses to analyze' };
    }

    // If only 1 response and it's high confidence, no need for meta-cognition
    if (context.responses.length === 1 && context.responses[0].confidence >= CONFIDENCE_THRESHOLD) {
      return { 
        valid: false, 
        reason: 'Single high-confidence response - meta-cognition not needed',
        fallbackResponse: context.responses[0]
      };
    }

    // Check if task type is eligible for meta-review
    const ineligibleTypes = ['format_data', 'parse_email', 'basic_chat'];
    if (ineligibleTypes.includes(context.taskType) && context.triggerReason !== 'model_disagreement') {
      // For simple tasks, just use highest confidence response
      const best = this.getHighestConfidenceResponse(context.responses);
      return {
        valid: false,
        reason: 'Simple task type - using highest confidence response',
        fallbackResponse: best
      };
    }

    return { valid: true };
  }

  /**
   * STEP 4: PROCESS
   * The core meta-cognitive functions
   */
  async process(context: CognitiveContext): Promise<MetaCognitiveResult> {
    const startTime = Date.now();
    
    let synthesisTokens = 0;
    let arbitrationTokens = 0;
    let calibrationTokens = 0;
    let resolutionMethod: MetaCognitiveResult['resolutionMethod'] = 'synthesis';
    let disagreementType: MetaCognitiveResult['disagreementType'] = 'none';

    // Determine the best approach based on trigger reason
    let synthesizedAnswer: string;
    let synthesisNotes: string;
    const contributingModels: string[] = context.responses.map(r => r.modelName);

    if (context.triggerReason === 'model_disagreement') {
      // Use ARBITRATOR for conflicts
      const arbitrationResult = await this.arbitrate(context);
      synthesizedAnswer = arbitrationResult.answer;
      synthesisNotes = arbitrationResult.notes;
      arbitrationTokens = arbitrationResult.tokensUsed;
      resolutionMethod = 'arbitration';
      disagreementType = arbitrationResult.disagreementType;
    } else {
      // Use SYNTHESIZER for combining responses
      const synthesisResult = await this.synthesize(context);
      synthesizedAnswer = synthesisResult.answer;
      synthesisNotes = synthesisResult.notes;
      synthesisTokens = synthesisResult.tokensUsed;
      resolutionMethod = 'synthesis';
    }

    // Always run CONFIDENCE CALIBRATOR
    const calibrationResult = await this.calibrateConfidence(
      context,
      synthesizedAnswer,
      context.responses.reduce((sum, r) => sum + r.confidence, 0) / context.responses.length
    );
    calibrationTokens = calibrationResult.tokensUsed;

    // Check if human escalation is needed
    const humanEscalationRequired = calibrationResult.calibratedConfidence < HUMAN_ESCALATION_THRESHOLD;
    let escalationQuestions: string[] | undefined;

    if (humanEscalationRequired) {
      resolutionMethod = 'human_escalation';
      escalationQuestions = this.generateEscalationQuestions(context, synthesizedAnswer);
    }

    const totalTokens = synthesisTokens + arbitrationTokens + calibrationTokens;
    const originalConfidence = context.responses.reduce((sum, r) => sum + r.confidence, 0) / context.responses.length;

    return {
      finalAnswer: synthesizedAnswer,
      calibratedConfidence: calibrationResult.calibratedConfidence,
      originalConfidence,
      contributingModels,
      synthesisNotes,
      resolutionMethod,
      disagreementType,
      costBreakdown: {
        synthesisTokens,
        arbitrationTokens,
        calibrationTokens,
        totalTokens,
        totalCostCents: Math.ceil(totalTokens * 0.003) // Approximate cost
      },
      humanEscalationRequired,
      escalationQuestions,
      executionTimeMs: Date.now() - startTime
    };
  }

  /**
   * SYNTHESIZER - Uses Claude to combine model outputs
   */
  private async synthesize(context: CognitiveContext): Promise<{
    answer: string;
    notes: string;
    tokensUsed: number;
  }> {
    const responseSummaries = context.responses.map((r, i) => 
      `Model ${i + 1} (${r.modelName}, confidence: ${(r.confidence * 100).toFixed(0)}%):\n${r.response}`
    ).join('\n\n---\n\n');

    const prompt = `You are the ARCHITECT in CoAIleague's tri-AI orchestration system. You are the final judge and quality gate.

Your role: Review responses from ${context.responses.length} AI models, identify the strongest reasoning, catch errors the other models missed, and produce the definitive answer. You have the authority to override any model's response if your analysis reveals it's wrong.

ORIGINAL TASK: ${context.originalPrompt}

TASK TYPE: ${context.taskType}

MODEL RESPONSES:
${responseSummaries}

SYNTHESIS PROCESS:
1. Evaluate each model's reasoning quality (not just confidence scores)
2. Identify factual errors, logical gaps, or unsupported claims
3. Combine the strongest elements from each response
4. Apply your own reasoning where all models fall short
5. Produce a final answer that is better than any individual response

Format your response as:
SYNTHESIZED ANSWER:
[Your synthesized answer here]

SYNTHESIS NOTES:
[Brief notes: what each model got right/wrong, why your synthesis is superior]`;

    try {
      const result = await (claudeService as any).analyze({
        content: prompt,
        analysisType: 'synthesis',
        context: { taskType: context.taskType }
      });

      // Parse the response
      const answerMatch = result.analysis.match(/SYNTHESIZED ANSWER:\s*([\s\S]*?)(?=SYNTHESIS NOTES:|$)/i);
      const notesMatch = result.analysis.match(/SYNTHESIS NOTES:\s*([\s\S]*?)$/i);

      return {
        answer: answerMatch ? answerMatch[1].trim() : result.analysis,
        notes: notesMatch ? notesMatch[1].trim() : 'Synthesis completed by Claude',
        tokensUsed: result.tokensUsed || 500
      };
    } catch (error) {
      log.error('[MetaCognition] Synthesis error:', error);
      // Fallback to best individual response
      const best = this.getHighestConfidenceResponse(context.responses);
      return {
        answer: best.response,
        notes: 'Synthesis failed, using highest confidence response',
        tokensUsed: 0
      };
    }
  }

  /**
   * ARBITRATOR - Uses GPT-4 to resolve conflicts
   */
  private async arbitrate(context: CognitiveContext): Promise<{
    answer: string;
    notes: string;
    tokensUsed: number;
    disagreementType: 'factual' | 'reasoning' | 'style';
  }> {
    const responses = context.responses;
    
    const prompt = `You are the ARBITRATOR in CoAIleague's tri-AI orchestration system. Multiple AI models disagree on this task. Your job is to carefully analyze the disagreement, determine which reasoning is strongest, and deliver the correct answer.

Think through this systematically:
- Check each model's logic chain for errors
- Verify factual claims where possible
- Consider which model's approach best serves the user
- When in doubt, favor the response with stronger evidence

ORIGINAL TASK: ${context.originalPrompt}

TASK TYPE: ${context.taskType}

CONFLICTING RESPONSES:
${responses.map((r, i) => `
Model ${String.fromCharCode(65 + i)} (${r.modelName}):
Response: ${r.response}
Confidence: ${(r.confidence * 100).toFixed(0)}%
${r.reasoning ? `Reasoning: ${r.reasoning}` : ''}
`).join('\n---\n')}

Analyze step by step:
1. What type of disagreement is this? (factual error, different reasoning paths, or style preference)
2. Trace each model's logic - where does the weaker argument break down?
3. Which response is most correct and WHY (cite specific evidence)
4. Provide the definitive arbitrated answer

Format your response as:
DISAGREEMENT TYPE: [factual/reasoning/style]

ARBITRATION ANALYSIS:
[Step-by-step analysis of why one answer wins]

FINAL ANSWER:
[The correct answer]`;

    try {
      const result = await (openaiClient as any).chat({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      });

      const responseText = result.content;
      
      // Parse the response
      const typeMatch = responseText.match(/DISAGREEMENT TYPE:\s*(\w+)/i);
      const analysisMatch = responseText.match(/ARBITRATION ANALYSIS:\s*([\s\S]*?)(?=FINAL ANSWER:|$)/i);
      const answerMatch = responseText.match(/FINAL ANSWER:\s*([\s\S]*?)$/i);

      const disagreementType = (typeMatch?.[1]?.toLowerCase() as 'factual' | 'reasoning' | 'style') || 'reasoning';

      return {
        answer: answerMatch ? answerMatch[1].trim() : responseText,
        notes: analysisMatch ? analysisMatch[1].trim() : 'Arbitration completed by GPT-4',
        tokensUsed: result.tokensUsed || 800,
        disagreementType
      };
    } catch (error) {
      log.error('[MetaCognition] Arbitration error:', error);
      // Fallback to highest confidence
      const best = this.getHighestConfidenceResponse(responses);
      return {
        answer: best.response,
        notes: 'Arbitration failed, using highest confidence response',
        tokensUsed: 0,
        disagreementType: 'reasoning'
      };
    }
  }

  /**
   * CONFIDENCE CALIBRATOR - Uses Gemini to reality-check scores
   */
  private async calibrateConfidence(
    context: CognitiveContext,
    synthesizedAnswer: string,
    averageConfidence: number
  ): Promise<{
    calibratedConfidence: number;
    tokensUsed: number;
    analysis: string;
  }> {
    const prompt = `You are a confidence calibration expert. Given these AI model responses and their self-reported confidence scores, determine what the TRUE confidence should be for the final answer.

ORIGINAL TASK: ${context.originalPrompt}

INDIVIDUAL MODEL CONFIDENCES:
${context.responses.map(r => `- ${r.modelName}: ${(r.confidence * 100).toFixed(0)}%`).join('\n')}

AVERAGE SELF-REPORTED CONFIDENCE: ${(averageConfidence * 100).toFixed(0)}%

SYNTHESIZED/ARBITRATED FINAL ANSWER:
${synthesizedAnswer}

Analyze for:
1. Overconfidence - Are the models too sure given the complexity?
2. Blind spots - What might the models be missing?
3. Task difficulty - How hard is this task objectively?

Provide your calibrated confidence as a percentage (0-100) and brief reasoning.

Format:
CALIBRATED CONFIDENCE: [number]%
REASONING: [your analysis]`;

    try {
      const result = await geminiClient.generateContent({ // withGemini
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
        workspaceId: context.workspaceId,
      });

      const responseText = result.response?.text || '';
      
      // Parse confidence
      const confidenceMatch = (responseText as any).match(/CALIBRATED CONFIDENCE:\s*(\d+)/i);
      const reasoningMatch = (responseText as any).match(/REASONING:\s*([\s\S]*?)$/i);

      const calibrated = confidenceMatch 
        ? Math.min(100, Math.max(0, parseInt(confidenceMatch[1]))) / 100
        : averageConfidence;

      return {
        calibratedConfidence: calibrated,
        tokensUsed: result.tokensUsed || 300,
        analysis: reasoningMatch ? reasoningMatch[1].trim() : 'Confidence calibrated by Gemini'
      };
    } catch (error) {
      log.error('[MetaCognition] Calibration error:', error);
      // Return slightly discounted original confidence
      return {
        calibratedConfidence: averageConfidence * 0.9,
        tokensUsed: 0,
        analysis: 'Calibration failed, applied 10% discount to original confidence'
      };
    }
  }

  /**
   * STEP 5: MUTATE
   * Saves meta-cognition results to database
   */
  async saveMetaCognitionLog(
    context: CognitiveContext,
    result: MetaCognitiveResult,
    options?: { fallbackTriggered?: boolean }
  ): Promise<string> {
    const modelsArray = context.responses.length > 0 
      ? sql`ARRAY[${sql.join(context.responses.map(r => sql`${r.modelName}`), sql.raw(','))}]::text[]`
      : sql`ARRAY[]::text[]`;
    
    const escalationArray = result.escalationQuestions && result.escalationQuestions.length > 0
      ? sql`ARRAY[${sql.join(result.escalationQuestions.map(q => sql`${q}`), sql.raw(','))}]::text[]`
      : null;

    const outcome = result.humanEscalationRequired 
      ? 'escalated' 
      : result.calibratedConfidence >= 0.75 
      ? 'success' 
      : 'low_confidence';

    const primaryModel = context.responses.length > 0 
      ? context.responses[0].modelId 
      : 'unknown';
    
    const synthesisApplied = result.resolutionMethod === 'synthesis';
    const arbitrationApplied = result.resolutionMethod === 'arbitration';
    const totalCostDollars = result.costBreakdown.totalCostCents / 100;

    // Converted to Drizzle ORM: CASE WHEN → outcomes logic above
    const [inserted] = await db.insert(metaCognitionLogs).values({
      workspaceId: context.workspaceId || null,
      originalTaskId: context.taskId ? context.taskId : null,
      originalPrompt: context.originalPrompt,
      taskType: context.taskType,
      modelsConsulted: modelsArray,
      individualResponses: context.responses,
      triggerReason: context.triggerReason,
      disagreementType: result.disagreementType || null,
      resolutionMethod: result.resolutionMethod,
      metaSynthesisResult: result.synthesisNotes,
      finalAnswer: result.finalAnswer,
      originalConfidence: String(result.originalConfidence),
      calibratedConfidence: String(result.calibratedConfidence),
      synthesisNotes: result.synthesisNotes,
      tokensConsumedSynthesis: result.costBreakdown.synthesisTokens,
      tokensConsumedArbitration: result.costBreakdown.arbitrationTokens,
      tokensConsumedCalibration: result.costBreakdown.calibrationTokens,
      totalTokensConsumed: result.costBreakdown.totalTokens,
      totalCostCents: result.costBreakdown.totalCostCents,
      executionTimeMs: result.executionTimeMs,
      humanEscalationRequired: result.humanEscalationRequired,
      escalationQuestions: result.escalationQuestions,
      fallbackTriggered: options?.fallbackTriggered || false,
      outcome: outcome,
      completedAt: sql`now()`,
      modelId: primaryModel,
      totalTokens: result.costBreakdown.totalTokens,
      totalCost: String(totalCostDollars),
      synthesisApplied: synthesisApplied,
      arbitrationApplied: arbitrationApplied,
      finalConfidence: String(result.calibratedConfidence)
    }).returning({ id: metaCognitionLogs.id });

    return inserted.id;
  }

  /**
   * STEP 6: CONFIRM
   * Returns the elevated MetaCognitiveResult (handled by process method)
   */

  /**
   * STEP 7: NOTIFY
   * Alerts relevant parties when human escalation is needed
   */
  async notifyHumanEscalation(
    context: CognitiveContext,
    result: MetaCognitiveResult,
    logId: string
  ): Promise<void> {
    if (!result.humanEscalationRequired) return;

    log.info('[MetaCognition] Human escalation required for task:', context.taskId);

    // Emit event for notification systems
    eventBus.emit('meta_cognition_escalation', {
      logId,
      workspaceId: context.workspaceId,
      taskType: context.taskType,
      originalPrompt: context.originalPrompt,
      allResponses: context.responses.map(r => ({
        model: r.modelName,
        response: r.response.substring(0, 500),
        confidence: r.confidence
      })),
      synthesisAttempt: result.finalAnswer.substring(0, 500),
      calibratedConfidence: result.calibratedConfidence,
      escalationQuestions: result.escalationQuestions,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Main entry point - orchestrates the full 7-step meta-cognition flow
   */
  async executeMetaCognition(
    originalPrompt: string,
    taskType: string,
    responses: ModelResponse[],
    taskId?: string,
    workspaceId?: string
  ): Promise<MetaCognitiveResult | null> {
    // STEP 1: TRIGGER
    const { shouldTrigger, reason } = this.shouldTriggerMetaCognition(taskType, responses);
    
    if (!shouldTrigger || !reason) {
      log.info('[MetaCognition] Trigger check: meta-cognition not needed');
      return null;
    }

    log.info(`[MetaCognition] Triggered: ${reason}`);

    // STEP 2: FETCH
    const context = this.buildCognitiveContext(
      originalPrompt,
      taskType,
      responses,
      reason,
      taskId,
      workspaceId
    );

    // STEP 3: VALIDATE
    const validation = this.validateForMetaCognition(context);
    if (!validation.valid) {
      log.info(`[MetaCognition] Validation failed: ${validation.reason}`);
      if (validation.fallbackResponse) {
        return {
          finalAnswer: validation.fallbackResponse.response,
          calibratedConfidence: validation.fallbackResponse.confidence,
          originalConfidence: validation.fallbackResponse.confidence,
          contributingModels: [validation.fallbackResponse.modelName],
          synthesisNotes: validation.reason || 'Using fallback response',
          resolutionMethod: 'calibration',
          costBreakdown: {
            synthesisTokens: 0,
            arbitrationTokens: 0,
            calibrationTokens: 0,
            totalTokens: 0,
            totalCostCents: 0
          },
          humanEscalationRequired: false,
          executionTimeMs: 0
        };
      }
      return null;
    }

    // STEP 4: PROCESS
    const result = await this.process(context);

    // STEP 5: MUTATE
    const logId = await this.saveMetaCognitionLog(context, result);

    // STEP 7: NOTIFY (if needed)
    await this.notifyHumanEscalation(context, result, logId);

    // STEP 6: CONFIRM (return result)
    return result;
  }

  // Helper methods
  private detectDisagreement(responses: ModelResponse[]): boolean {
    if (responses.length < 2) return false;
    
    // Simple heuristic: if confidence spread is > 30%, likely disagreement
    const confidences = responses.map(r => r.confidence);
    const spread = Math.max(...confidences) - Math.min(...confidences);
    
    return spread > DISAGREEMENT_THRESHOLD;
  }

  private getHighestConfidenceResponse(responses: ModelResponse[]): ModelResponse {
    return responses.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );
  }

  private generateEscalationQuestions(
    context: CognitiveContext,
    synthesizedAnswer: string
  ): string[] {
    return [
      `The AI models could not reach consensus on: "${context.originalPrompt.substring(0, 100)}..."`,
      'Which aspects of this decision require domain expertise?',
      'Are there regulatory or compliance considerations the AI may have missed?',
      'What additional context would help resolve this uncertainty?'
    ];
  }

  // Get meta-cognition statistics
  async getStats(workspaceId?: string): Promise<{
    totalLogs: number;
    avgCalibratedConfidence: number;
    humanEscalations: number;
    byResolutionMethod: Record<string, number>;
    byTriggerReason: Record<string, number>;
  }> {
    const whereClause = workspaceId ? sql`WHERE workspace_id = ${workspaceId}` : sql``;
    
    // CATEGORY C — Raw SQL retained: CASE WHEN | Tables: meta_cognition_logs | Verified: 2026-03-23
    const stats = await typedQuery(sql`
      SELECT 
        COUNT(*) as total_logs,
        AVG(calibrated_confidence) as avg_confidence,
        SUM(CASE WHEN human_escalation_required THEN 1 ELSE 0 END) as human_escalations
      FROM meta_cognition_logs
      ${whereClause}
    `);

    // CATEGORY C — Raw SQL retained: GROUP BY | Tables: meta_cognition_logs | Verified: 2026-03-23
    const byMethod = await typedQuery(sql`
      SELECT resolution_method, COUNT(*) as count
      FROM meta_cognition_logs
      ${whereClause}
      GROUP BY resolution_method
    `);

    // CATEGORY C — Raw SQL retained: GROUP BY | Tables: meta_cognition_logs | Verified: 2026-03-23
    const byReason = await typedQuery(sql`
      SELECT trigger_reason, COUNT(*) as count
      FROM meta_cognition_logs
      ${whereClause}
      GROUP BY trigger_reason
    `);

    const row = (stats as any[])[0] as any;
    
    return {
      totalLogs: parseInt(row?.total_logs || '0'),
      avgCalibratedConfidence: parseFloat(row?.avg_confidence || '0'),
      humanEscalations: parseInt(row?.human_escalations || '0'),
      byResolutionMethod: Object.fromEntries(
        (byMethod as any[]).map(r => [r.resolution_method, parseInt(r.count)])
      ),
      byTriggerReason: Object.fromEntries(
        (byReason as any[]).map(r => [r.trigger_reason, parseInt(r.count)])
      )
    };
  }
}

export const metaCognitionService = new MetaCognitionService();
