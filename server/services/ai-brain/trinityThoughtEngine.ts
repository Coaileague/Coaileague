/**
 * TRINITY THOUGHT ENGINE
 * ======================
 * Core metacognition service enabling Trinity to:
 * 1. Think thoughts (perception → deliberation → action → reflection pipeline)
 * 2. Track reasoning chains with confidence
 * 3. Detect confusion and uncertainty
 * 4. Learn from outcomes and calibrate confidence
 * 5. Be aware of platform changes and adapt
 * 
 * This is Trinity's "inner monologue" - the foundation of self-awareness.
 */

import { db } from '../../db';
import { AI_BRAIN } from '../../config/platformConfig';
import {
  trinityThoughtSignatures,
  platformChangeEvents,
  InsertPlatformChangeEvent,
  PlatformChangeEvent
} from '@shared/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { helpaiOrchestrator } from '../helpai/platformActionHub';
import { platformEventBus } from '../platformEventBus';
import { resilientAIGateway } from './providers/resilientAIGateway';
import { createLogger } from '../../lib/logger';
import { WorkspaceGovernancePolicy } from '@shared/schema';
const log = createLogger('trinityThoughtEngine');

// ============================================================================
// TYPES
// ============================================================================

export type ThoughtPhase = 'perception' | 'deliberation' | 'planning' | 'execution' | 'reflection' | 'mathVerification';
export type ThoughtType = 'observation' | 'hypothesis' | 'decision' | 'doubt' | 'insight' | 'correction' | 'math_check' | 'learned_pattern';

export interface ThoughtContext {
  workspaceId?: string;
  sessionId?: string;
  userId?: string;
  parentThoughtId?: string;
  triggeredBy?: string;
  relatedActionId?: string;
  relatedFindingId?: string;
}

export interface ThinkResult {
  thoughtId: string;
  phase: ThoughtPhase;
  content: string;
  confidence: number;
  wasConfused: boolean;
}

export interface ReflectionResult {
  reflectionId: string;
  performanceScore: number;
  lessonsLearned: string[];
  improvements: string[];
}

export interface ConfusionSignals {
  lowConfidence: boolean;
  multipleRetries: boolean;
  ambiguousInput: boolean;
  conflictingInformation: boolean;
  missingContext: boolean;
}

// ============================================================================
// TRINITY THOUGHT ENGINE
// ============================================================================

interface ReflectionLogEntry {
  targetId: string;
  confidenceCalibration?: number;
  outcome?: string;
}

class TrinityThoughtEngine {
  private activeSessions: Map<string, string> = new Map();
  private thoughtChains: Map<string, string[]> = new Map();
  private confusionThreshold = 0.6;
  private reflectionLog: ReflectionLogEntry[] = [];

  private getWorkspaceKey(workspaceId?: string): string {
    return workspaceId || '_global';
  }

  private get activeSession(): string | null {
    return this.activeSessions.get('_global') || null;
  }

  private set activeSession(value: string | null) {
    if (value) this.activeSessions.set('_global', value);
    else this.activeSessions.delete('_global');
  }

  private get thoughtChain(): string[] {
    return this.thoughtChains.get('_global') || [];
  }

  getActiveSession(workspaceId?: string): string | null {
    return this.activeSessions.get(this.getWorkspaceKey(workspaceId)) || null;
  }

  setActiveSession(workspaceId: string | undefined, sessionId: string): void {
    this.activeSessions.set(this.getWorkspaceKey(workspaceId), sessionId);
  }

  getThoughtChain(workspaceId?: string): string[] {
    const key = this.getWorkspaceKey(workspaceId);
    if (!this.thoughtChains.has(key)) {
      this.thoughtChains.set(key, []);
    }
    return this.thoughtChains.get(key)!;
  }

  pushThought(workspaceId: string | undefined, thoughtId: string): void {
    const chain = this.getThoughtChain(workspaceId);
    chain.push(thoughtId);
    if (chain.length > AI_BRAIN.thoughtChainCap) chain.shift();
  }

  clearThoughtChain(workspaceId?: string): void {
    this.thoughtChains.set(this.getWorkspaceKey(workspaceId), []);
  }

  constructor() {
    log.info('[TrinityThoughtEngine] Initializing metacognition system...');
  }

  /**
   * Record a thought in Trinity's inner monologue
   */
  async think(
    phase: ThoughtPhase,
    thoughtType: ThoughtType,
    content: string,
    confidence: number = 0.8,
    context: ThoughtContext = {},
    alternatives?: string[]
  ): Promise<ThinkResult> {
    const wasConfused = this.detectConfusion(confidence, content);
    
    try {
      const wsKey = context.workspaceId;
      const wsChain = this.getThoughtChain(wsKey);
      const lastThought = wsChain.length > 0 ? wsChain[wsChain.length - 1] : null;

      const [thought] = await db.insert(trinityThoughtSignatures).values({
        workspaceId: context.workspaceId,
        sessionId: context.sessionId || this.getActiveSession(wsKey),
        thoughtType,
        content,
        confidence: Math.round(confidence * 100),
        context: {
          phase,
          reasoningDepth: wsChain.length + 1,
          alternativesConsidered: alternatives || null,
          triggeredBy: context.triggeredBy || null,
          relatedActionId: context.relatedActionId || null,
          relatedFindingId: context.relatedFindingId || null,
          parentThoughtId: context.parentThoughtId || lastThought || null,
          wasActedUpon: false,
        },
      }).returning();

      this.pushThought(wsKey, thought.id);
      
      platformEventBus.emit('trinity_thought', {
        thoughtId: thought.id,
        phase,
        thoughtType,
        content: content.substring(0, 200),
        confidence,
        wasConfused,
        timestamp: new Date(),
        workspaceId: context.workspaceId,
        sessionId: context.sessionId,
        userId: context.userId,
      });

      return {
        thoughtId: thought.id,
        phase,
        content,
        confidence,
        wasConfused,
      };
    } catch (error) {
      log.error('[TrinityThoughtEngine] Failed to record thought:', error);
      throw error;
    }
  }

  /**
   * Perception phase - observe and understand input
   */
  async perceive(observation: string, context: ThoughtContext = {}): Promise<ThinkResult> {
    return this.think('perception', 'observation', observation, 0.9, context);
  }

  /**
   * Deliberation phase - consider options and form hypotheses
   */
  async deliberate(
    hypothesis: string,
    alternatives: string[],
    confidence: number,
    context: ThoughtContext = {}
  ): Promise<ThinkResult> {
    return this.think('deliberation', 'hypothesis', hypothesis, confidence, context, alternatives);
  }

  /**
   * Planning phase - decide on action
   */
  async decide(
    decision: string,
    reasoning: string,
    confidence: number,
    context: ThoughtContext = {}
  ): Promise<ThinkResult> {
    const content = `DECISION: ${decision}\nREASONING: ${reasoning}`;
    return this.think('planning', 'decision', content, confidence, context);
  }

  /**
   * Express doubt or uncertainty
   */
  async doubt(
    uncertainty: string,
    confidence: number,
    context: ThoughtContext = {}
  ): Promise<ThinkResult> {
    return this.think('deliberation', 'doubt', uncertainty, confidence, context);
  }

  /**
   * Record an insight or learning
   */
  async insight(
    learning: string,
    confidence: number = 0.85,
    context: ThoughtContext = {}
  ): Promise<ThinkResult> {
    return this.think('reflection', 'insight', learning, confidence, context);
  }

  /**
   * Correct a previous thought or decision
   */
  async correct(
    correction: string,
    originalThoughtId: string,
    context: ThoughtContext = {}
  ): Promise<ThinkResult> {
    const content = `CORRECTION for thought ${originalThoughtId}: ${correction}`;
    return this.think('reflection', 'correction', content, 0.9, {
      ...context,
      parentThoughtId: originalThoughtId,
    });
  }

  /**
   * Reflect on an action or workflow outcome
   */
  async reflect(
    target: 'action' | 'decision' | 'workflow' | 'day_summary',
    targetId: string,
    whatHappened: string,
    outcome: { success: boolean; score: number },
    workspaceId?: string
  ): Promise<ReflectionResult> {
    const wasSuccessful = outcome.success;
    const performanceScore = outcome.score;
    
    // Determine what worked and what failed
    const whatWorked = wasSuccessful ? whatHappened : null;
    const whatFailed = !wasSuccessful ? whatHappened : null;
    
    // Generate lessons learned
    const lessonsLearned = await this.generateLessons(whatHappened, wasSuccessful);
    
    // Propose improvements
    const improvements = await this.proposeImprovements(whatHappened, wasSuccessful);
    
    // Calculate confidence calibration
    const calibration = await this.calculateConfidenceCalibration(targetId);
    
    try {
      const [reflection] = await db.insert(trinityThoughtSignatures).values({
        workspaceId,
        thoughtType: 'reflection',
        content: whatHappened,
        context: {
          reflectionTarget: target,
          targetId,
          whatWorked,
          whatFailed,
          lessonsLearned: lessonsLearned.join('\n'),
          performanceScore: performanceScore.toString(),
          confidenceCalibration: calibration.toString(),
          proposedImprovements: JSON.stringify(improvements),
          appliedToSelfAwareness: false,
        },
      }).returning();

      // Cache in memory for confidence calibration tracking (capped at 500 entries)
      this.reflectionLog.push({
        targetId,
        confidenceCalibration: calibration,
        outcome: performanceScore >= 0.7 ? 'success' : 'failure',
      });
      if (this.reflectionLog.length > 500) this.reflectionLog.shift();

      // Record reflection thought
      await this.think('reflection', 'insight', 
        `Reflected on ${target} ${targetId}: Score ${performanceScore}, Lessons: ${lessonsLearned.length}`,
        0.9,
        { workspaceId }
      );

      return {
        reflectionId: reflection.id,
        performanceScore,
        lessonsLearned,
        improvements,
      };
    } catch (error) {
      log.error('[TrinityThoughtEngine] Failed to record reflection:', error);
      throw error;
    }
  }

  /**
   * Record telemetry for a reasoning request
   */
  async recordTelemetry(
    requestId: string,
    domain: string,
    actionType: string,
    metrics: {
      geminiTier: string;
      inputTokens: number;
      outputTokens: number;
      responseTimeMs: number;
      reasoningSteps: number;
      initialConfidence: number;
      finalConfidence: number;
      wasSuccessful: boolean;
      errorType?: string;
    },
    confusionSignals?: ConfusionSignals
  ): Promise<void> {
    const wasConfused = confusionSignals 
      ? Object.values(confusionSignals).some(v => v)
      : metrics.finalConfidence < this.confusionThreshold;

    try {
      // If confused, record a doubt thought
      if (wasConfused) {
        await this.doubt(
          `Confusion detected in ${domain}/${actionType}: Low confidence (${metrics.finalConfidence})`,
          metrics.finalConfidence
        );
      }
    } catch (error) {
      log.error('[TrinityThoughtEngine] Failed to record telemetry:', error);
    }
  }

  /**
   * Record awareness of a platform change
   */
  async perceiveChange(
    changeType: 'code_deploy' | 'config_change' | 'migration' | 'schema_update' | 'service_restart',
    details: {
      commitHash?: string;
      branch?: string;
      affectedFiles?: string[];
      affectedServices?: string[];
      summary: string;
      deployedBy?: string;
    }
  ): Promise<PlatformChangeEvent> {
    try {
      const [event] = await db.insert(platformChangeEvents).values({
        changeType,
        sourceType: 'system',
        title: `${changeType}: ${details.summary.substring(0, 200)}`,
        summary: details.summary,
        affectedFiles: details.affectedFiles,
        affectedModules: details.affectedServices,
        sourceName: details.deployedBy,
        metadata: {
          commitHash: details.commitHash,
          branch: details.branch,
        },
      }).returning();

      // Record perception thought
      await this.perceive(
        `Platform change detected: ${changeType} - ${details.summary}`,
        { triggeredBy: 'platform_monitor' }
      );

      // Emit event for real-time awareness
      platformEventBus.emit('platform_change', {
        changeId: event.id,
        changeType,
        summary: details.summary,
        timestamp: new Date(),
      });

      return event;
    } catch (error) {
      log.error('[TrinityThoughtEngine] Failed to record platform change:', error);
      throw error;
    }
  }

  /**
   * Analyze and acknowledge a platform change
   */
  async acknowledgeChange(
    changeId: string,
    analysis: string,
    impactAssessment: { severity: string; affectedAreas: string[]; recommendations: string[] }
  ): Promise<void> {
    try {
      await db.update(platformChangeEvents)
        .set({
          metadata: {
            trinityAcknowledged: true,
            trinityAnalysis: analysis,
            impactAssessment: impactAssessment,
          },
          updatedAt: new Date(),
        })
        .where(eq(platformChangeEvents.id, changeId));

      // Record insight about the change
      await this.insight(
        `Analyzed platform change ${changeId}: ${analysis}. Impact: ${impactAssessment.severity}`,
        0.85
      );
    } catch (error) {
      log.error('[TrinityThoughtEngine] Failed to acknowledge change:', error);
    }
  }

  /**
   * Get unacknowledged platform changes
   */
  async getUnacknowledgedChanges(): Promise<PlatformChangeEvent[]> {
    return db.select()
      .from(platformChangeEvents)
      .where(eq(platformChangeEvents.trinityAcknowledged, false))
      .orderBy(desc(platformChangeEvents.createdAt))
      .limit(50);
  }

  /**
   * Get workspace governance policy (with fallback to defaults)
   */
  async getGovernancePolicy(workspaceId: string): Promise<WorkspaceGovernancePolicy | null> {
    const [policy] = await db.select()
      .from(workspaceGovernancePolicies)
      .where(eq(workspaceGovernancePolicies.workspaceId, workspaceId))
      .limit(1);
    
    return policy || null;
  }

  /**
   * Get recent thoughts for context
   */
  async getRecentThoughts(limit: number = AI_BRAIN.recentThoughtsDefault, workspaceId?: string): Promise<any[]> {
    const conditions = workspaceId
      ? eq(trinityThoughtSignatures.workspaceId, workspaceId)
      : undefined;

    return db.select()
      .from(trinityThoughtSignatures)
      .where(conditions)
      .orderBy(desc(trinityThoughtSignatures.createdAt))
      .limit(limit);
  }

  /**
   * Get confusion metrics for health monitoring
   */
  async getConfusionMetrics(hours: number = 24): Promise<{
    totalRequests: number;
    confusedCount: number;
    confusionRate: number;
    avgConfidence: number;
    byDomain: Record<string, { total: number; confused: number }>;
  }> {
    return {
      totalRequests: 0,
      confusedCount: 0,
      confusionRate: 0,
      avgConfidence: 0,
      byDomain: {},
    };
  }

  /**
   * Start a new thinking session
   */
  startSession(sessionId: string): void {
    this.activeSession = sessionId;
    this.thoughtChain = [];
    log.info(`[TrinityThoughtEngine] Started session ${sessionId}`);
  }

  /**
   * End the current thinking session
   */
  endSession(): void {
    log.info(`[TrinityThoughtEngine] Ended session ${this.activeSession} with ${this.thoughtChain.length} thoughts`);
    this.activeSession = null;
    this.thoughtChain = [];
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private getLastThought(): string | undefined {
    return this.thoughtChain.length > 0 
      ? this.thoughtChain[this.thoughtChain.length - 1] 
      : undefined;
  }

  private detectConfusion(confidence: number, content: string): boolean {
    if (confidence < this.confusionThreshold) return true;
    
    const uncertaintyMarkers = [
      'not sure', 'uncertain', 'unclear', 'ambiguous', 'confused',
      'don\'t know', 'might be', 'possibly', 'maybe', 'hard to say'
    ];
    const financialUncertaintyMarkers = [
      'rounding error', 'precision issue', 'overflow', 'mismatch',
      'discrepancy', 'does not balance', 'unreconciled', 'variance detected',
      'negative balance', 'exceeds limit', 'calculation differs'
    ];
    const lowerContent = content.toLowerCase();
    if (uncertaintyMarkers.some(m => lowerContent.includes(m))) return true;
    if (financialUncertaintyMarkers.some(m => lowerContent.includes(m))) return true;
    
    return false;
  }

  private async generateLessons(whatHappened: string, wasSuccessful: boolean): Promise<string[]> {
    try {
      const recentPatterns = this.reflectionLog.slice(-20);
      const successRate = recentPatterns.filter(r => r.outcome === 'success').length / (recentPatterns.length || 1);

      const response = await resilientAIGateway.callWithFallback({
        prompt: `Analyze this AI action outcome and extract 2-3 concise lessons learned (one sentence each).

Action: ${whatHappened.substring(0, 500)}
Outcome: ${wasSuccessful ? 'SUCCESS' : 'FAILURE'}
Recent success rate: ${(successRate * 100).toFixed(0)}%
Recent pattern count: ${recentPatterns.length}

Return ONLY a JSON array of lesson strings. No markdown, no explanation.
Example: ["Lesson one here", "Lesson two here"]`,
        context: { role: 'metacognition', type: 'lesson_extraction' },
        domain: 'internal_reflection',
      });

      try {
        const parsed = JSON.parse(response.content.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(String).slice(0, 5);
      } catch (parseErr) {
        log.warn('[TrinityThoughtEngine] Failed to parse AI response:', parseErr);
      }
    } catch (e) {
      log.warn('[TrinityThoughtEngine] AI lesson generation failed, using heuristic fallback');
    }

    const lessons: string[] = [];
    if (wasSuccessful) {
      lessons.push('Approach was effective and should be reinforced');
      lessons.push('Similar patterns can be applied to related problems');
    } else {
      lessons.push('Need to gather more context before acting');
      lessons.push('Consider alternative approaches next time');
      lessons.push('Escalate earlier when uncertainty is high');
    }
    return lessons;
  }

  private async proposeImprovements(whatHappened: string, wasSuccessful: boolean): Promise<string[]> {
    try {
      const response = await resilientAIGateway.callWithFallback({
        prompt: `Based on this AI action outcome, propose 1-3 specific, actionable improvements (one sentence each).

Action: ${whatHappened.substring(0, 500)}
Outcome: ${wasSuccessful ? 'SUCCESS' : 'FAILURE'}

Return ONLY a JSON array of improvement strings. No markdown, no explanation.
Example: ["Improvement one here", "Improvement two here"]`,
        context: { role: 'metacognition', type: 'improvement_proposal' },
        domain: 'internal_reflection',
      });

      try {
        const parsed = JSON.parse(response.content.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(String).slice(0, 5);
      } catch (parseErr) {
        log.warn('[TrinityThoughtEngine] Failed to parse AI response:', parseErr);
      }
    } catch (e) {
      log.warn('[TrinityThoughtEngine] AI improvement proposal failed, using heuristic fallback');
    }

    const improvements: string[] = [];
    if (!wasSuccessful) {
      improvements.push('Add additional validation steps');
      improvements.push('Increase confidence threshold for this action type');
      improvements.push('Request human review for similar cases');
    }
    return improvements;
  }

  async verifyMath(
    description: string,
    inputs: Record<string, number>,
    expectedOutput: number,
    computedOutput: number,
    context: ThoughtContext = {}
  ): Promise<ThinkResult & { mathValid: boolean; discrepancy: number }> {
    const discrepancy = Math.abs(expectedOutput - computedOutput);
    const tolerance = 0.005;
    const mathValid = discrepancy <= tolerance;

    const content = mathValid
      ? `MATH VERIFIED: ${description} — computed ${computedOutput}, expected ${expectedOutput}, discrepancy ${discrepancy.toFixed(4)} within tolerance`
      : `MATH DISCREPANCY: ${description} — computed ${computedOutput}, expected ${expectedOutput}, discrepancy ${discrepancy.toFixed(4)} EXCEEDS tolerance ${tolerance}. Inputs: ${JSON.stringify(inputs)}`;

    const confidence = mathValid ? 0.99 : 0.3;
    const result = await this.think('mathVerification', 'math_check', content, confidence, context);

    if (!mathValid) {
      platformEventBus.emit('trinity_math_discrepancy', {
        description,
        inputs,
        expectedOutput,
        computedOutput,
        discrepancy,
        timestamp: new Date(),
        workspaceId: context.workspaceId,
      });
    }

    return { ...result, mathValid, discrepancy };
  }

  async contextRecall(workspaceId: string, domain?: string, limit: number = 10): Promise<{
    recentThoughts: Array<{ content: string; confidence: number; phase: string; createdAt: Date }>;
    recentLessons: string[];
    successRate: number;
  }> {
    const thoughts = await this.getRecentThoughts(limit, workspaceId);

    const recentReflections = await db.select()
      .from(trinityThoughtSignatures)
      .where(
        workspaceId
          ? and(eq(trinityThoughtSignatures.workspaceId, workspaceId), eq(trinityThoughtSignatures.thoughtType, 'reflection'))
          : eq(trinityThoughtSignatures.thoughtType, 'reflection')
      )
      .orderBy(desc(trinityThoughtSignatures.createdAt))
      .limit(limit);

    const recentLessons = recentReflections
      .map(r => (r as any).context?.lessonsLearned)
      .filter(Boolean)
      .flatMap((l: string) => l.split('\n'))
      .filter((l: string) => l.trim().length > 0)
      .slice(0, 10);

    const scores = recentReflections
      .map(r => parseFloat((r as any).context?.performanceScore?.toString() || '0'))
      .filter(s => s > 0);
    const successRate = scores.length > 0
      ? scores.filter(s => s >= 0.7).length / scores.length
      : 0;

    return {
      recentThoughts: thoughts.map(t => ({
        content: t.content,
        confidence: parseFloat(t.confidence?.toString() || '0'),
        phase: t.phase,
        createdAt: t.createdAt!,
      })),
      recentLessons,
      successRate,
    };
  }

  async learnFromOutcome(
    pattern: string,
    outcome: 'success' | 'failure',
    domain: string,
    context: ThoughtContext = {}
  ): Promise<ThinkResult> {
    const content = outcome === 'success'
      ? `LEARNED PATTERN (${domain}): "${pattern}" — reinforcing this approach for future similar tasks`
      : `LEARNED ANTI-PATTERN (${domain}): "${pattern}" — flagging for avoidance in future similar tasks`;

    const result = await this.think('reflection', 'learned_pattern', content, 0.85, context);

    this.reflectionLog.push({
      targetId: `pattern_${domain}_${Date.now()}`,
      confidenceCalibration: outcome === 'success' ? 0.9 : 0.3,
      outcome,
    });
    if (this.reflectionLog.length > 500) this.reflectionLog.shift();

    return result;
  }

  private async calculateConfidenceCalibration(targetId: string): Promise<number> {
    // Compare predicted confidence vs actual outcome
    // Returns value between -1 (overconfident) and 1 (underconfident)
    // 0 means well-calibrated
    
    // Analyze recent reflections to calculate calibration score
    const recentReflections = this.reflectionLog
      .filter(r => r.targetId === targetId)
      .slice(-10); // Last 10 reflections for this target
    
    if (recentReflections.length === 0) {
      return 0; // No data - assume well-calibrated
    }
    
    // Calculate average deviation between predicted confidence and outcome
    let calibrationSum = 0;
    for (const reflection of recentReflections) {
      const predictedSuccess = (reflection.confidenceCalibration || 0) > 0.5;
      const actualSuccess = reflection.outcome === 'success';
      
      if (predictedSuccess && !actualSuccess) {
        calibrationSum -= 0.2; // Overconfident
      } else if (!predictedSuccess && actualSuccess) {
        calibrationSum += 0.2; // Underconfident
      }
    }
    
    // Normalize to -1 to 1 range
    return Math.max(-1, Math.min(1, calibrationSum / recentReflections.length));
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const trinityThoughtEngine = new TrinityThoughtEngine();

// ============================================================================
// AI BRAIN ACTION REGISTRATION
// ============================================================================

export function registerThoughtEngineActions() {
  const actions = [
    {
      id: 'metacognition.think',
      name: 'Record Thought',
      description: 'Record a thought in Trinity\'s inner monologue',
      handler: async (params: any) => {
        return trinityThoughtEngine.think(
          params.phase,
          params.thoughtType,
          params.content,
          params.confidence,
          params.context
        );
      },
    },
    {
      id: 'metacognition.reflect',
      name: 'Reflect on Outcome',
      description: 'Analyze and learn from an action outcome',
      handler: async (params: any) => {
        return trinityThoughtEngine.reflect(
          params.target,
          params.targetId,
          params.whatHappened,
          params.outcome,
          params.workspaceId
        );
      },
    },
    {
      id: 'metacognition.perceive_change',
      name: 'Perceive Platform Change',
      description: 'Record awareness of a platform change',
      handler: async (params: any) => {
        return trinityThoughtEngine.perceiveChange(
          params.changeType,
          params.details
        );
      },
    },
    {
      id: 'metacognition.get_unacknowledged_changes',
      name: 'Get Unacknowledged Changes',
      description: 'Get platform changes I haven\'t analyzed yet',
      handler: async () => {
        return trinityThoughtEngine.getUnacknowledgedChanges();
      },
    },
    {
      id: 'metacognition.get_confusion_metrics',
      name: 'Get Confusion Metrics',
      description: 'Get Trinity\'s confusion and confidence metrics',
      handler: async (params: any) => {
        return trinityThoughtEngine.getConfusionMetrics(params.hours || 24);
      },
    },
    {
      id: 'metacognition.get_recent_thoughts',
      name: 'Get Recent Thoughts',
      description: 'Get Trinity\'s recent thoughts for context',
      handler: async (params: any) => {
        return trinityThoughtEngine.getRecentThoughts(
          params.limit || 20,
          params.workspaceId
        );
      },
    },
  ];

  for (const action of actions) {
    helpaiOrchestrator.registerAction({
      actionId: action.id,
      name: action.name,
      category: 'metacognition',
      description: action.description,
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request) => {
        const startTime = Date.now();
        const result = await action.handler(request.payload || {});
        return {
          success: true,
          actionId: request.actionId,
          message: `${action.name} completed`,
          data: result,
          executionTimeMs: Date.now() - startTime,
        };
      },
    });
  }

  log.info(`[TrinityThoughtEngine] Registered ${actions.length} metacognition actions`);
}
