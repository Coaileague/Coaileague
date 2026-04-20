/**
 * ADAPTIVE SUPERVISION ROUTER
 * ===========================
 * Smart routing system that determines the appropriate level of supervision
 * based on task complexity, risk, and context.
 * 
 * Capabilities:
 * - Complexity Assessment: Classify tasks as simple/moderate/complex
 * - Adaptive Routing: Route simple tasks directly to subagents, complex to full orchestration
 * - Bidirectional Handoffs: Enable agent-to-agent communication
 * - Error Triggers & Fallback: Handle failures with model switching
 * - Load Balancing: Distribute tasks across available subagents
 * 
 * Fortune 500 Requirements:
 * - Minimize overhead for simple operations
 * - Full orchestration for high-stakes decisions
 * - Complete audit trail of routing decisions
 */

import { platformEventBus } from '../platformEventBus';
import { db } from '../../db';
import { systemAuditLogs, supervisorHandoffs } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { GeminiModelTier } from './providers/geminiClient';
import crypto from 'crypto';
import { createLogger } from '../../lib/logger';
const log = createLogger('adaptiveSupervisionRouter');

// ============================================================================
// TYPES
// ============================================================================

export interface RoutingRequest {
  requestId?: string;
  workspaceId: string;
  userId: string;
  
  // Task details
  intent: string;
  taskType: string;
  payload: Record<string, any>;
  
  // Context
  previousActions?: string[];
  sessionContext?: Record<string, any>;
  
  // Preferences
  preferredSubagent?: string;
  timeoutMs?: number;
  forceOrchestration?: boolean;
}

export interface RoutingDecision {
  requestId: string;
  
  // Routing decision
  routeType: 'direct' | 'orchestrated' | 'parallel' | 'queued';
  targetSubagent?: string;
  targetSubagents?: string[];
  
  // Complexity assessment
  complexity: ComplexityAssessment;
  
  // Model selection
  selectedTier: GeminiModelTier;
  fallbackTier?: GeminiModelTier;
  
  // Supervision level
  supervisionLevel: 'none' | 'minimal' | 'standard' | 'strict' | 'human_required';
  
  // Approval gates
  requiresPreApproval: boolean;
  requiresPostValidation: boolean;
  
  // Routing metadata
  routingTimeMs: number;
  confidenceScore: number;
  reasoning: string;
}

export interface ComplexityAssessment {
  level: 'simple' | 'moderate' | 'complex' | 'expert';
  score: number;
  factors: ComplexityFactor[];
  estimatedTokens: number;
  estimatedCredits: number;
}

export interface ComplexityFactor {
  factor: string;
  weight: number;
  score: number;
  description: string;
}

export interface HandoffRequest {
  handoffId?: string;
  sourceSubagent: string;
  targetSubagent: string;
  
  // Data to transfer
  context: Record<string, any>;
  request: Record<string, any>;
  
  // Handoff type
  type: 'sync' | 'async' | 'callback';
  
  // Return expectations
  expectsResponse: boolean;
  responseSchema?: Record<string, any>;
  
  // Metadata
  workspaceId: string;
  userId: string;
  parentExecutionId?: string;
}

export interface HandoffResult {
  handoffId: string;
  success: boolean;
  
  // Response
  response?: any;
  error?: string;
  
  // Metrics
  handoffTimeMs: number;
  targetProcessingTimeMs?: number;
  
  // Audit
  auditTrail: HandoffAuditEntry;
}

export interface HandoffAuditEntry {
  id: string;
  handoffId: string;
  timestamp: Date;
  sourceSubagent: string;
  targetSubagent: string;
  type: HandoffRequest['type'];
  success: boolean;
  durationMs: number;
}

export interface FallbackConfig {
  primaryTier: GeminiModelTier;
  fallbackTiers: GeminiModelTier[];
  retryDelayMs: number;
  maxRetries: number;
  triggerConditions: FallbackTrigger[];
}

export interface FallbackTrigger {
  type: 'rate_limit' | 'timeout' | 'error' | 'budget' | 'capacity';
  threshold: number;
  action: 'switch_model' | 'queue' | 'reject' | 'escalate';
}

// Complexity scoring weights
const COMPLEXITY_WEIGHTS = {
  tokenEstimate: 0.2,
  domainCount: 0.15,
  dependencyDepth: 0.2,
  riskLevel: 0.25,
  dataVolume: 0.1,
  historicalComplexity: 0.1,
};

// Task type to complexity mapping
const TASK_COMPLEXITY_HINTS: Record<string, number> = {
  // Simple tasks (0.1-0.3)
  'status_check': 0.1,
  'simple_query': 0.15,
  'notification': 0.2,
  'lookup': 0.2,
  
  // Moderate tasks (0.4-0.6)
  'scheduling': 0.4,
  'report_generation': 0.45,
  'data_validation': 0.5,
  'template_processing': 0.5,
  
  // Complex tasks (0.7-0.85)
  'payroll_processing': 0.7,
  'compliance_check': 0.75,
  'multi_step_workflow': 0.8,
  'data_migration': 0.85,
  
  // Expert tasks (0.9-1.0)
  'financial_transaction': 0.9,
  'audit_response': 0.92,
  'system_recovery': 0.95,
  'crisis_management': 1.0,
};

// ============================================================================
// ADAPTIVE SUPERVISION ROUTER CLASS
// ============================================================================

class AdaptiveSupervisionRouter {
  private static instance: AdaptiveSupervisionRouter;
  private routingHistory: Map<string, RoutingDecision[]> = new Map();
  private activeHandoffs: Map<string, HandoffRequest> = new Map();
  private subagentLoad: Map<string, number> = new Map();

  private constructor() {
    log.info('[AdaptiveSupervisionRouter] Initializing smart routing system...');
  }

  static getInstance(): AdaptiveSupervisionRouter {
    if (!AdaptiveSupervisionRouter.instance) {
      AdaptiveSupervisionRouter.instance = new AdaptiveSupervisionRouter();
    }
    return AdaptiveSupervisionRouter.instance;
  }

  /**
   * Route a request to appropriate handler based on complexity
   */
  async route(request: RoutingRequest): Promise<RoutingDecision> {
    const requestId = request.requestId || `route-${crypto.randomUUID()}`;
    const startTime = Date.now();

    // Assess complexity
    const complexity = this.assessComplexity(request);
    
    // Determine routing type
    const routeType = this.determineRouteType(complexity, request);
    
    // Select model tier
    const { selectedTier, fallbackTier } = this.selectModelTier(complexity);
    
    // Determine supervision level
    const supervisionLevel = this.determineSupervsionLevel(complexity, request);
    
    // Find optimal subagent(s)
    const { targetSubagent, targetSubagents } = await this.selectSubagents(request, routeType);
    
    // Determine approval requirements
    const { requiresPreApproval, requiresPostValidation } = this.determineApprovalGates(complexity, supervisionLevel);
    
    const decision: RoutingDecision = {
      requestId,
      routeType,
      targetSubagent,
      targetSubagents,
      complexity,
      selectedTier,
      fallbackTier,
      supervisionLevel,
      requiresPreApproval,
      requiresPostValidation,
      routingTimeMs: Date.now() - startTime,
      confidenceScore: this.calculateRoutingConfidence(complexity),
      reasoning: this.generateRoutingReasoning(complexity, routeType, supervisionLevel),
    };

    // Store in history
    const history = this.routingHistory.get(request.workspaceId) || [];
    history.push(decision);
    if (history.length > 1000) history.shift();
    this.routingHistory.set(request.workspaceId, history);

    // Log routing decision
    await this.logRoutingDecision(request, decision);

    // Publish event
    // @ts-expect-error — TS migration: fix in refactoring sprint
    platformEventBus.publish('ai_brain_action', {
      action: 'adaptive_routing',
      requestId,
      routeType,
      complexityLevel: complexity.level,
      selectedTier,
      supervisionLevel,
    });

    return decision;
  }

  /**
   * Handle bidirectional handoff between subagents
   */
  async handoff(request: HandoffRequest): Promise<HandoffResult> {
    const handoffId = request.handoffId || `handoff-${crypto.randomUUID()}`;
    const startTime = Date.now();

    log.info(`[AdaptiveSupervisionRouter] Handoff: ${request.sourceSubagent} -> ${request.targetSubagent}`);

    // Store active handoff (in-memory for fast lookup)
    this.activeHandoffs.set(handoffId, request);

    // TRINITY.md Section R / Law P2: write-through to supervisor_handoffs so
    // an in-flight handoff that vanishes on restart leaves a row that
    // runStartupRecovery() can mark `interrupted`.
    try {
      await db.insert(supervisorHandoffs).values({
        id: handoffId,
        workspaceId: request.workspaceId,
        fromAgent: request.sourceSubagent,
        toAgent: request.targetSubagent,
        reason: request.type,
        payload: { context: request.context, request: request.request },
        status: 'active',
        createdAt: new Date(),
      });
    } catch (persistErr: any) {
      log.warn('[Handoff] Persist start failed (non-fatal):', persistErr?.message);
    }

    try {
      // Validate target subagent availability
      const isAvailable = await this.checkSubagentAvailability(request.targetSubagent);
      if (!isAvailable) {
        throw new Error(`Target subagent ${request.targetSubagent} is not available`);
      }

      // Execute handoff based on type
      let response: any;
      let targetProcessingTimeMs: number | undefined;

      switch (request.type) {
        case 'sync':
          const syncResult = await this.executeSyncHandoff(request);
          response = syncResult.response;
          targetProcessingTimeMs = syncResult.processingTimeMs;
          break;
          
        case 'async':
          response = await this.executeAsyncHandoff(request);
          break;
          
        case 'callback':
          response = await this.executeCallbackHandoff(request);
          break;
      }

      const result: HandoffResult = {
        handoffId,
        success: true,
        response,
        handoffTimeMs: Date.now() - startTime,
        targetProcessingTimeMs,
        auditTrail: this.createHandoffAudit(handoffId, request, true, Date.now() - startTime),
      };

      // Log successful handoff
      await this.logHandoff(request, result);

      return result;

    } catch (error: any) {
      const result: HandoffResult = {
        handoffId,
        success: false,
        error: (error instanceof Error ? error.message : String(error)),
        handoffTimeMs: Date.now() - startTime,
        auditTrail: this.createHandoffAudit(handoffId, request, false, Date.now() - startTime),
      };

      await this.logHandoff(request, result);

      return result;

    } finally {
      this.activeHandoffs.delete(handoffId);
      // Mark resolved in DB
      try {
        await db.update(supervisorHandoffs)
          .set({ status: 'resolved', resolvedAt: new Date() })
          .where(eq(supervisorHandoffs.id, handoffId));
      } catch (persistErr: any) {
        log.warn('[Handoff] Persist resolve failed (non-fatal):', persistErr?.message);
      }
    }
  }

  /**
   * Handle model fallback when primary tier fails
   */
  async executeFallback(
    originalTier: GeminiModelTier,
    error: Error,
    config: FallbackConfig
  ): Promise<{ tier: GeminiModelTier; shouldRetry: boolean; delay: number }> {
    log.info(`[AdaptiveSupervisionRouter] Executing fallback from ${originalTier}`);

    // Find applicable trigger
    const trigger = this.findApplicableTrigger(error, config.triggerConditions);
    
    if (!trigger) {
      return { tier: originalTier, shouldRetry: false, delay: 0 };
    }

    // Find next available tier
    const currentIndex = [originalTier, ...config.fallbackTiers].indexOf(originalTier);
    const nextTier = config.fallbackTiers[currentIndex] || config.fallbackTiers[0];

    switch (trigger.action) {
      case 'switch_model':
        return { 
          tier: nextTier, 
          shouldRetry: true, 
          delay: config.retryDelayMs 
        };
        
      case 'queue':
        return { 
          tier: originalTier, 
          shouldRetry: true, 
          delay: config.retryDelayMs * 2 
        };
        
      case 'escalate':
        // Escalate to human - use highest tier but flag for review
        return { 
          tier: 'BRAIN' as GeminiModelTier, 
          shouldRetry: true, 
          delay: 0 
        };
        
      case 'reject':
      default:
        return { tier: originalTier, shouldRetry: false, delay: 0 };
    }
  }

  /**
   * Assess task complexity
   */
  private assessComplexity(request: RoutingRequest): ComplexityAssessment {
    const factors: ComplexityFactor[] = [];
    
    // Token estimate factor
    const estimatedTokens = this.estimateTokens(request);
    const tokenScore = Math.min(1, estimatedTokens / 10000);
    factors.push({
      factor: 'tokenEstimate',
      weight: COMPLEXITY_WEIGHTS.tokenEstimate,
      score: tokenScore,
      description: `Estimated ${estimatedTokens} tokens`,
    });

    // Task type factor
    const taskTypeScore = TASK_COMPLEXITY_HINTS[request.taskType] || 0.5;
    factors.push({
      factor: 'taskType',
      weight: 0.2,
      score: taskTypeScore,
      description: `Task type: ${request.taskType}`,
    });

    // Dependency depth (from previous actions)
    const dependencyScore = Math.min(1, (request.previousActions?.length || 0) / 5);
    factors.push({
      factor: 'dependencyDepth',
      weight: COMPLEXITY_WEIGHTS.dependencyDepth,
      score: dependencyScore,
      description: `${request.previousActions?.length || 0} previous actions`,
    });

    // Data volume
    const payloadSize = JSON.stringify(request.payload).length;
    const dataScore = Math.min(1, payloadSize / 50000);
    factors.push({
      factor: 'dataVolume',
      weight: COMPLEXITY_WEIGHTS.dataVolume,
      score: dataScore,
      description: `Payload size: ${payloadSize} bytes`,
    });

    // Calculate overall score
    const totalScore = factors.reduce((sum, f) => sum + f.weight * f.score, 0);
    
    // Determine level
    let level: ComplexityAssessment['level'];
    if (totalScore <= 0.3) level = 'simple';
    else if (totalScore <= 0.6) level = 'moderate';
    else if (totalScore <= 0.85) level = 'complex';
    else level = 'expert';

    return {
      level,
      score: totalScore,
      factors,
      estimatedTokens,
      estimatedCredits: this.estimateCredits(level, estimatedTokens),
    };
  }

  /**
   * Estimate tokens for a request
   */
  private estimateTokens(request: RoutingRequest): number {
    const intentTokens = Math.ceil(request.intent.length / 4);
    const payloadTokens = Math.ceil(JSON.stringify(request.payload).length / 4);
    const contextTokens = request.sessionContext 
      ? Math.ceil(JSON.stringify(request.sessionContext).length / 4) 
      : 0;
    
    // Base overhead + response estimate
    const overhead = 500;
    const responseEstimate = Math.max(200, intentTokens * 2);
    
    return intentTokens + payloadTokens + contextTokens + overhead + responseEstimate;
  }

  /**
   * Estimate credits based on complexity
   */
  private estimateCredits(level: ComplexityAssessment['level'], tokens: number): number {
    const baseCredits = {
      simple: 2,
      moderate: 5,
      complex: 12,
      expert: 25,
    };
    
    const tokenMultiplier = Math.ceil(tokens / 5000);
    return baseCredits[level] * tokenMultiplier;
  }

  /**
   * Determine routing type based on complexity
   */
  private determineRouteType(
    complexity: ComplexityAssessment,
    request: RoutingRequest
  ): RoutingDecision['routeType'] {
    if (request.forceOrchestration) {
      return 'orchestrated';
    }

    switch (complexity.level) {
      case 'simple':
        return 'direct';
      case 'moderate':
        return request.previousActions?.length ? 'orchestrated' : 'direct';
      case 'complex':
        return 'orchestrated';
      case 'expert':
        return 'orchestrated';
      default:
        return 'orchestrated';
    }
  }

  /**
   * Select appropriate model tier
   */
  private selectModelTier(complexity: ComplexityAssessment): {
    selectedTier: GeminiModelTier;
    fallbackTier?: GeminiModelTier;
  } {
    switch (complexity.level) {
      case 'simple':
        // @ts-expect-error — TS migration: fix in refactoring sprint
        return { selectedTier: 'LITE', fallbackTier: 'FLASH' };
      case 'moderate':
        // @ts-expect-error — TS migration: fix in refactoring sprint
        return { selectedTier: 'FLASH', fallbackTier: 'PRO' };
      case 'complex':
        // @ts-expect-error — TS migration: fix in refactoring sprint
        return { selectedTier: 'PRO', fallbackTier: 'BRAIN' };
      case 'expert':
        // @ts-expect-error — TS migration: fix in refactoring sprint
        return { selectedTier: 'BRAIN', fallbackTier: 'PRO' };
      default:
        // @ts-expect-error — TS migration: fix in refactoring sprint
        return { selectedTier: 'FLASH', fallbackTier: 'PRO' };
    }
  }

  /**
   * Determine supervision level
   */
  private determineSupervsionLevel(
    complexity: ComplexityAssessment,
    request: RoutingRequest
  ): RoutingDecision['supervisionLevel'] {
    // High-stakes task types always need strict supervision
    const strictSupervisionTasks = [
      'financial_transaction',
      'payroll_processing',
      'data_deletion',
      'user_access_change',
    ];
    
    if (strictSupervisionTasks.includes(request.taskType)) {
      return complexity.level === 'expert' ? 'human_required' : 'strict';
    }

    switch (complexity.level) {
      case 'simple':
        return 'none';
      case 'moderate':
        return 'minimal';
      case 'complex':
        return 'standard';
      case 'expert':
        return 'strict';
      default:
        return 'minimal';
    }
  }

  /**
   * Select optimal subagent(s) for the request
   */
  private async selectSubagents(
    request: RoutingRequest,
    routeType: RoutingDecision['routeType']
  ): Promise<{ targetSubagent?: string; targetSubagents?: string[] }> {
    // Use preferred if specified
    if (request.preferredSubagent) {
      return { targetSubagent: request.preferredSubagent };
    }

    // Map task types to subagents
    const taskToSubagent: Record<string, string> = {
      'scheduling': 'scheduling_agent',
      'payroll_processing': 'payroll_agent',
      'compliance_check': 'compliance_agent',
      'notification': 'notification_agent',
      'report_generation': 'analytics_agent',
      'data_migration': 'data_migration_agent',
    };

    const targetSubagent = taskToSubagent[request.taskType] || 'general_agent';

    if (routeType === 'parallel') {
      // For parallel execution, find related subagents
      return {
        targetSubagents: [targetSubagent],
      };
    }

    return { targetSubagent };
  }

  /**
   * Determine approval gate requirements
   */
  private determineApprovalGates(
    complexity: ComplexityAssessment,
    supervisionLevel: RoutingDecision['supervisionLevel']
  ): { requiresPreApproval: boolean; requiresPostValidation: boolean } {
    switch (supervisionLevel) {
      case 'none':
        return { requiresPreApproval: false, requiresPostValidation: false };
      case 'minimal':
        return { requiresPreApproval: false, requiresPostValidation: true };
      case 'standard':
        return { requiresPreApproval: false, requiresPostValidation: true };
      case 'strict':
        return { requiresPreApproval: true, requiresPostValidation: true };
      case 'human_required':
        return { requiresPreApproval: true, requiresPostValidation: true };
      default:
        return { requiresPreApproval: false, requiresPostValidation: true };
    }
  }

  /**
   * Calculate routing confidence
   */
  private calculateRoutingConfidence(complexity: ComplexityAssessment): number {
    // Higher complexity = lower routing confidence
    return 1 - (complexity.score * 0.3);
  }

  /**
   * Generate human-readable routing reasoning
   */
  private generateRoutingReasoning(
    complexity: ComplexityAssessment,
    routeType: RoutingDecision['routeType'],
    supervisionLevel: RoutingDecision['supervisionLevel']
  ): string {
    const topFactors = complexity.factors
      .sort((a, b) => b.weight * b.score - a.weight * a.score)
      .slice(0, 2)
      .map(f => f.description);

    return `Task classified as ${complexity.level} complexity (${(complexity.score * 100).toFixed(0)}%) ` +
      `based on ${topFactors.join(' and ')}. ` +
      `Using ${routeType} routing with ${supervisionLevel} supervision.`;
  }

  /**
   * Check if subagent is available
   */
  private async checkSubagentAvailability(subagentId: string): Promise<boolean> {
    // Check load
    const currentLoad = this.subagentLoad.get(subagentId) || 0;
    return currentLoad < 10; // Max 10 concurrent tasks
  }

  /**
   * Execute synchronous handoff
   */
  private async executeSyncHandoff(request: HandoffRequest): Promise<{
    response: any;
    processingTimeMs: number;
  }> {
    const startTime = Date.now();
    
    // Increment target load
    const currentLoad = this.subagentLoad.get(request.targetSubagent) || 0;
    this.subagentLoad.set(request.targetSubagent, currentLoad + 1);

    try {
      // Simulate processing (actual implementation would call the subagent)
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return {
        response: { success: true, handoffCompleted: true },
        processingTimeMs: Date.now() - startTime,
      };
    } finally {
      // Decrement load
      this.subagentLoad.set(
        request.targetSubagent, 
        Math.max(0, (this.subagentLoad.get(request.targetSubagent) || 1) - 1)
      );
    }
  }

  /**
   * Execute asynchronous handoff
   */
  private async executeAsyncHandoff(request: HandoffRequest): Promise<{ queued: true; handoffId: string }> {
    return { queued: true, handoffId: request.handoffId || '' };
  }

  /**
   * Execute callback handoff
   */
  private async executeCallbackHandoff(request: HandoffRequest): Promise<{ callbackRegistered: true }> {
    return { callbackRegistered: true };
  }

  /**
   * Find applicable fallback trigger
   */
  private findApplicableTrigger(error: Error, triggers: FallbackTrigger[]): FallbackTrigger | null {
    const errorMessage = error.message.toLowerCase();
    
    if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
      return triggers.find(t => t.type === 'rate_limit') || null;
    }
    
    if (errorMessage.includes('timeout')) {
      return triggers.find(t => t.type === 'timeout') || null;
    }
    
    if (errorMessage.includes('budget') || errorMessage.includes('credit')) {
      return triggers.find(t => t.type === 'budget') || null;
    }
    
    return triggers.find(t => t.type === 'error') || null;
  }

  /**
   * Create handoff audit entry
   */
  private createHandoffAudit(
    handoffId: string,
    request: HandoffRequest,
    success: boolean,
    durationMs: number
  ): HandoffAuditEntry {
    return {
      id: crypto.randomUUID(),
      handoffId,
      timestamp: new Date(),
      sourceSubagent: request.sourceSubagent,
      targetSubagent: request.targetSubagent,
      type: request.type,
      success,
      durationMs,
    };
  }

  /**
   * Log routing decision
   */
  private async logRoutingDecision(request: RoutingRequest, decision: RoutingDecision): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        id: crypto.randomUUID(),
        entityType: 'routing_decision',
        entityId: decision.requestId,
        userId: request.userId,
        workspaceId: request.workspaceId,
        action: 'route',
        metadata: { eventType: 'adaptive_routing', severity: decision.supervisionLevel === 'human_required' ? 'high' : 'low', details: JSON.stringify({ routeType: decision.routeType, complexityLevel: decision.complexity.level, complexityScore: decision.complexity.score, selectedTier: decision.selectedTier, supervisionLevel: decision.supervisionLevel, targetSubagent: decision.targetSubagent, routingTimeMs: decision.routingTimeMs }) },
      });
    } catch (error) {
      log.error('[AdaptiveSupervisionRouter] Failed to log routing decision:', error);
    }
  }

  /**
   * Log handoff
   */
  private async logHandoff(request: HandoffRequest, result: HandoffResult): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        id: crypto.randomUUID(),
        entityType: 'handoff',
        entityId: result.handoffId,
        userId: request.userId,
        workspaceId: request.workspaceId,
        action: 'handoff',
        metadata: { eventType: 'subagent_handoff', severity: result.success ? 'low' : 'medium', details: JSON.stringify({ sourceSubagent: request.sourceSubagent, targetSubagent: request.targetSubagent, type: request.type, success: result.success, handoffTimeMs: result.handoffTimeMs, error: result.error }) },
      });
    } catch (error) {
      log.error('[AdaptiveSupervisionRouter] Failed to log handoff:', error);
    }
  }

  /**
   * Get routing history for a workspace
   */
  getRoutingHistory(workspaceId: string, limit: number = 50): RoutingDecision[] {
    const history = this.routingHistory.get(workspaceId) || [];
    return history.slice(-limit);
  }

  /**
   * Get subagent load information
   */
  getSubagentLoads(): Map<string, number> {
    return new Map(this.subagentLoad);
  }
}

export const adaptiveSupervisionRouter = AdaptiveSupervisionRouter.getInstance();
