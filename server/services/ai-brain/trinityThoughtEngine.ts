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
import {
  trinityThoughts,
  trinityReflections,
  trinityTelemetry,
  platformChangeEvents,
  workspaceGovernancePolicies,
  InsertTrinityThought,
  InsertTrinityReflection,
  InsertTrinityTelemetry,
  InsertPlatformChangeEvent,
  TrinityThought,
  TrinityReflectionRecord,
  TrinityTelemetryRecord,
  PlatformChangeEvent,
  WorkspaceGovernancePolicy,
} from '@shared/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { helpaiOrchestrator } from '../helpai/helpaiActionOrchestrator';
import { platformEventBus } from '../platformEventBus';

// ============================================================================
// TYPES
// ============================================================================

export type ThoughtPhase = 'perception' | 'deliberation' | 'planning' | 'execution' | 'reflection';
export type ThoughtType = 'observation' | 'hypothesis' | 'decision' | 'doubt' | 'insight' | 'correction';

export interface ThoughtContext {
  workspaceId?: string;
  sessionId?: string;
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

class TrinityThoughtEngine {
  private activeSession: string | null = null;
  private thoughtChain: string[] = [];
  private confusionThreshold = 0.6;

  constructor() {
    console.log('[TrinityThoughtEngine] Initializing metacognition system...');
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
      const [thought] = await db.insert(trinityThoughts).values({
        workspaceId: context.workspaceId,
        sessionId: context.sessionId || this.activeSession,
        parentThoughtId: context.parentThoughtId || this.getLastThought(),
        phase,
        thoughtType,
        content,
        confidence: confidence.toString(),
        reasoningDepth: this.thoughtChain.length + 1,
        alternativesConsidered: alternatives ? JSON.stringify(alternatives) : null,
        triggeredBy: context.triggeredBy,
        relatedActionId: context.relatedActionId,
        relatedFindingId: context.relatedFindingId,
        wasActedUpon: false,
      }).returning();

      this.thoughtChain.push(thought.id);
      
      // Emit thought event for real-time monitoring
      platformEventBus.emit({
        type: 'trinity_thought',
        payload: {
          thoughtId: thought.id,
          phase,
          thoughtType,
          content: content.substring(0, 200),
          confidence,
          wasConfused,
        },
        timestamp: new Date(),
      });

      return {
        thoughtId: thought.id,
        phase,
        content,
        confidence,
        wasConfused,
      };
    } catch (error) {
      console.error('[TrinityThoughtEngine] Failed to record thought:', error);
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
      const [reflection] = await db.insert(trinityReflections).values({
        workspaceId,
        reflectionTarget: target,
        targetId,
        whatHappened,
        whatWorked,
        whatFailed,
        lessonsLearned: lessonsLearned.join('\n'),
        performanceScore: performanceScore.toString(),
        confidenceCalibration: calibration.toString(),
        proposedImprovements: JSON.stringify(improvements),
        appliedToSelfAwareness: false,
      }).returning();

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
      console.error('[TrinityThoughtEngine] Failed to record reflection:', error);
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
      await db.insert(trinityTelemetry).values({
        requestId,
        domain,
        actionType,
        geminiTier: metrics.geminiTier,
        inputTokens: metrics.inputTokens,
        outputTokens: metrics.outputTokens,
        responseTimeMs: metrics.responseTimeMs,
        reasoningSteps: metrics.reasoningSteps,
        initialConfidence: metrics.initialConfidence.toString(),
        finalConfidence: metrics.finalConfidence.toString(),
        confidenceDelta: (metrics.finalConfidence - metrics.initialConfidence).toString(),
        confusionSignals: confusionSignals ? JSON.stringify(confusionSignals) : null,
        wasConfused,
        wasSuccessful: metrics.wasSuccessful,
        errorType: metrics.errorType,
      });

      // If confused, record a doubt thought
      if (wasConfused) {
        await this.doubt(
          `Confusion detected in ${domain}/${actionType}: Low confidence (${metrics.finalConfidence})`,
          metrics.finalConfidence
        );
      }
    } catch (error) {
      console.error('[TrinityThoughtEngine] Failed to record telemetry:', error);
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
        changeSource: 'system',
        commitHash: details.commitHash,
        branch: details.branch,
        affectedFiles: details.affectedFiles,
        affectedServices: details.affectedServices,
        summary: details.summary,
        trinityAcknowledged: false,
        deployedBy: details.deployedBy,
        deployedAt: new Date(),
      }).returning();

      // Record perception thought
      await this.perceive(
        `Platform change detected: ${changeType} - ${details.summary}`,
        { triggeredBy: 'platform_monitor' }
      );

      // Emit event for real-time awareness
      platformEventBus.emit({
        type: 'platform_change',
        payload: { changeId: event.id, changeType, summary: details.summary },
        timestamp: new Date(),
      });

      return event;
    } catch (error) {
      console.error('[TrinityThoughtEngine] Failed to record platform change:', error);
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
          trinityAcknowledged: true,
          trinityAnalysis: analysis,
          impactAssessment: JSON.stringify(impactAssessment),
        })
        .where(eq(platformChangeEvents.id, changeId));

      // Record insight about the change
      await this.insight(
        `Analyzed platform change ${changeId}: ${analysis}. Impact: ${impactAssessment.severity}`,
        0.85
      );
    } catch (error) {
      console.error('[TrinityThoughtEngine] Failed to acknowledge change:', error);
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
  async getRecentThoughts(limit: number = 20, workspaceId?: string): Promise<TrinityThought[]> {
    const conditions = workspaceId 
      ? eq(trinityThoughts.workspaceId, workspaceId)
      : undefined;

    return db.select()
      .from(trinityThoughts)
      .where(conditions)
      .orderBy(desc(trinityThoughts.createdAt))
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
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const telemetry = await db.select()
      .from(trinityTelemetry)
      .where(gte(trinityTelemetry.createdAt, since));

    const totalRequests = telemetry.length;
    const confusedCount = telemetry.filter(t => t.wasConfused).length;
    const avgConfidence = telemetry.reduce((sum, t) => 
      sum + parseFloat(t.finalConfidence?.toString() || '0'), 0) / (totalRequests || 1);

    const byDomain: Record<string, { total: number; confused: number }> = {};
    for (const t of telemetry) {
      const domain = t.domain || 'unknown';
      if (!byDomain[domain]) {
        byDomain[domain] = { total: 0, confused: 0 };
      }
      byDomain[domain].total++;
      if (t.wasConfused) byDomain[domain].confused++;
    }

    return {
      totalRequests,
      confusedCount,
      confusionRate: totalRequests ? confusedCount / totalRequests : 0,
      avgConfidence,
      byDomain,
    };
  }

  /**
   * Start a new thinking session
   */
  startSession(sessionId: string): void {
    this.activeSession = sessionId;
    this.thoughtChain = [];
    console.log(`[TrinityThoughtEngine] Started session ${sessionId}`);
  }

  /**
   * End the current thinking session
   */
  endSession(): void {
    console.log(`[TrinityThoughtEngine] Ended session ${this.activeSession} with ${this.thoughtChain.length} thoughts`);
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
    // Low confidence
    if (confidence < this.confusionThreshold) return true;
    
    // Uncertainty markers in content
    const uncertaintyMarkers = [
      'not sure', 'uncertain', 'unclear', 'ambiguous', 'confused',
      'don\'t know', 'might be', 'possibly', 'maybe', 'hard to say'
    ];
    const lowerContent = content.toLowerCase();
    if (uncertaintyMarkers.some(m => lowerContent.includes(m))) return true;
    
    return false;
  }

  private async generateLessons(whatHappened: string, wasSuccessful: boolean): Promise<string[]> {
    // In a full implementation, this would use Gemini to analyze and extract lessons
    // For now, generate basic lessons based on outcome
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
    const improvements: string[] = [];
    
    if (!wasSuccessful) {
      improvements.push('Add additional validation steps');
      improvements.push('Increase confidence threshold for this action type');
      improvements.push('Request human review for similar cases');
    }
    
    return improvements;
  }

  private async calculateConfidenceCalibration(targetId: string): Promise<number> {
    // Compare predicted confidence vs actual outcome
    // Returns value between -1 (overconfident) and 1 (underconfident)
    // 0 means well-calibrated
    return 0; // Placeholder - would analyze historical predictions
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
      description: 'Get platform changes Trinity hasn\'t analyzed yet',
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
      requiredRoles: ['support', 'admin', 'super_admin'],
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

  console.log(`[TrinityThoughtEngine] Registered ${actions.length} metacognition actions`);
}
