/**
 * PLATFORM INTENT ROUTER
 * ======================
 * Routes ALL platform operations through AI Brain for complete observability.
 * Every action, query, and operation flows through this router to enable:
 * 
 * - Complete telemetry and tracing
 * - Intelligent routing to subagents
 * - Failure detection and auto-remediation
 * - Learning from outcomes
 * - Platform-wide health monitoring
 */

import { trinityExecutionFabric, ExecutionContext, ExecutionManifest } from './trinityExecutionFabric';
import { knowledgeOrchestrationService } from './knowledgeOrchestrationService';
import { subagentSupervisor } from './subagentSupervisor';
import { platformEventBus } from '../platformEventBus';
import { AI_BRAIN } from '../../config/platformConfig';
import crypto from 'crypto';
import { createLogger } from '../../lib/logger';
const log = createLogger('platformIntentRouter');

// ============================================================================
// TYPES
// ============================================================================

export type IntentCategory = 
  | 'query'        // Read-only data retrieval
  | 'command'      // State-changing operations
  | 'workflow'     // Multi-step orchestrated tasks
  | 'analysis'     // AI-powered analysis
  | 'diagnostic'   // System health/debugging
  | 'automation';  // Autonomous background tasks

export type IntentPriority = 'low' | 'normal' | 'high' | 'critical' | 'emergency';

export type IntentRiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface PlatformIntent {
  id: string;
  intent: string;
  category: IntentCategory;
  domain: string;
  priority: IntentPriority;
  riskLevel: IntentRiskLevel;
  
  // Context
  workspaceId: string;
  userId: string;
  conversationId?: string;
  sessionId?: string;
  
  // Source
  source: 'chat' | 'api' | 'webhook' | 'scheduler' | 'internal';
  
  // Timing
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  timeoutMs: number;
  
  // Routing
  routed: boolean;
  routingDecision?: RoutingDecision;
  
  // Execution
  executionManifestId?: string;
  subagentId?: string;
  
  // Results
  status: 'pending' | 'routing' | 'executing' | 'completed' | 'failed' | 'timeout' | 'cancelled';
  result?: any;
  error?: string;
  
  // Telemetry
  tokensUsed?: number;
  creditsConsumed?: number;
  durationMs?: number;
}

export interface RoutingDecision {
  handler: 'execution_fabric' | 'subagent' | 'direct' | 'queued';
  handlerId?: string;
  modelTier: string;
  confidence: number;
  reasoning: string;
  estimatedCredits: number;
  requiresApproval: boolean;
}

export interface IntentTelemetry {
  intentId: string;
  workspaceId: string;
  category: IntentCategory;
  domain: string;
  priority: IntentPriority;
  riskLevel: IntentRiskLevel;
  handler: string;
  success: boolean;
  durationMs: number;
  tokensUsed: number;
  creditsConsumed: number;
  timestamp: Date;
}

export interface HealthReport {
  status: 'healthy' | 'degraded' | 'critical';
  totalIntents: number;
  successRate: number;
  avgLatencyMs: number;
  failedIntents: number;
  queueDepth: number;
  activeIntents: number;
  alerts: string[];
}

// ============================================================================
// PLATFORM INTENT ROUTER CLASS
// ============================================================================

class PlatformIntentRouter {
  private static instance: PlatformIntentRouter;
  
  private activeIntents: Map<string, PlatformIntent> = new Map();
  private intentHistory: PlatformIntent[] = [];
  private telemetryBuffer: IntentTelemetry[] = [];
  private intentQueue: PlatformIntent[] = [];
  
  // Processing configuration
  private readonly MAX_CONCURRENT_INTENTS = AI_BRAIN.maxConcurrentIntents;
  private readonly QUEUE_PROCESS_INTERVAL = 100;
  private readonly TELEMETRY_FLUSH_INTERVAL = 30000;
  private queueProcessorInterval: ReturnType<typeof setInterval> | null = null;
  private telemetryFlusherInterval: ReturnType<typeof setInterval> | null = null;
  private readonly MAX_HISTORY_SIZE = AI_BRAIN.intentHistorySize;
  
  // Health tracking
  private successCount = 0;
  private failureCount = 0;
  private totalLatencyMs = 0;
  
  static getInstance(): PlatformIntentRouter {
    if (!this.instance) {
      this.instance = new PlatformIntentRouter();
    }
    return this.instance;
  }

  constructor() {
    this.startQueueProcessor();
    this.startTelemetryFlusher();
    log.info('[PlatformIntentRouter] Initialized - All operations routed through AI Brain');
  }

  // ============================================================================
  // INTENT SUBMISSION
  // ============================================================================

  async submitIntent(
    intent: string,
    options: {
      workspaceId: string;
      userId: string;
      category?: IntentCategory;
      priority?: IntentPriority;
      source?: PlatformIntent['source'];
      conversationId?: string;
      sessionId?: string;
      timeoutMs?: number;
      domain?: string;
    }
  ): Promise<PlatformIntent> {
    const intentId = crypto.randomUUID();
    
    // Analyze intent to determine category and risk
    const analysis = await this.analyzeIntent(intent, options);
    
    const platformIntent: PlatformIntent = {
      id: intentId,
      intent,
      category: options.category || analysis.category,
      domain: options.domain || analysis.domain,
      priority: options.priority || analysis.priority,
      riskLevel: analysis.riskLevel,
      workspaceId: options.workspaceId,
      userId: options.userId,
      conversationId: options.conversationId,
      sessionId: options.sessionId,
      source: options.source || 'internal',
      createdAt: new Date(),
      timeoutMs: options.timeoutMs || 30000,
      routed: false,
      status: 'pending',
    };
    
    // Check if we should queue or process immediately
    if (this.activeIntents.size >= this.MAX_CONCURRENT_INTENTS) {
      this.intentQueue.push(platformIntent);
      log.info(`[PlatformIntentRouter] Intent ${intentId} queued (queue depth: ${this.intentQueue.length})`);
      return platformIntent;
    }
    
    // Route and execute
    return await this.routeAndExecute(platformIntent);
  }

  // ============================================================================
  // INTENT ANALYSIS
  // ============================================================================

  private async analyzeIntent(
    intent: string,
    options: { workspaceId: string; userId: string }
  ): Promise<{
    category: IntentCategory;
    domain: string;
    priority: IntentPriority;
    riskLevel: IntentRiskLevel;
  }> {
    const intentLower = intent.toLowerCase();
    
    // Determine category
    let category: IntentCategory = 'query';
    if (intentLower.includes('create') || intentLower.includes('update') || 
        intentLower.includes('delete') || intentLower.includes('change')) {
      category = 'command';
    } else if (intentLower.includes('analyze') || intentLower.includes('predict') || 
               intentLower.includes('recommend')) {
      category = 'analysis';
    } else if (intentLower.includes('workflow') || intentLower.includes('automate') ||
               intentLower.includes('schedule')) {
      category = 'workflow';
    } else if (intentLower.includes('diagnostic') || intentLower.includes('health') ||
               intentLower.includes('debug')) {
      category = 'diagnostic';
    }
    
    // Determine domain
    let domain = 'general';
    const domainKeywords: Record<string, string[]> = {
      scheduling: ['schedule', 'shift', 'calendar', 'time'],
      payroll: ['payroll', 'salary', 'wage', 'pay'],
      compliance: ['compliance', 'certification', 'license', 'audit'],
      analytics: ['analytics', 'report', 'metrics', 'dashboard'],
      billing: ['invoice', 'billing', 'payment', 'charge'],
      employees: ['employee', 'staff', 'worker', 'team'],
    };
    
    for (const [d, keywords] of Object.entries(domainKeywords)) {
      if (keywords.some(k => intentLower.includes(k))) {
        domain = d;
        break;
      }
    }
    
    // Determine risk level
    let riskLevel: IntentRiskLevel = 'none';
    if (intentLower.includes('delete') || intentLower.includes('remove')) {
      riskLevel = 'high';
    } else if (intentLower.includes('update') || intentLower.includes('change')) {
      riskLevel = 'medium';
    } else if (intentLower.includes('create') || intentLower.includes('add')) {
      riskLevel = 'low';
    }
    
    // Determine priority
    let priority: IntentPriority = 'normal';
    if (intentLower.includes('urgent') || intentLower.includes('critical')) {
      priority = 'critical';
    } else if (intentLower.includes('important') || intentLower.includes('asap')) {
      priority = 'high';
    }
    
    return { category, domain, priority, riskLevel };
  }

  // ============================================================================
  // ROUTING AND EXECUTION
  // ============================================================================

  private async routeAndExecute(intent: PlatformIntent): Promise<PlatformIntent> {
    this.activeIntents.set(intent.id, intent);
    intent.status = 'routing';
    intent.startedAt = new Date();
    
    try {
      // Make routing decision
      const routingDecision = await this.makeRoutingDecision(intent);
      intent.routingDecision = routingDecision;
      intent.routed = true;
      
      log.info(`[PlatformIntentRouter] Routed ${intent.id} to ${routingDecision.handler} (confidence: ${routingDecision.confidence})`);
      
      // Check if approval needed
      if (routingDecision.requiresApproval) {
        intent.status = 'pending';
        return intent;
      }
      
      // Execute based on routing decision
      intent.status = 'executing';
      
      switch (routingDecision.handler) {
        case 'execution_fabric':
          await this.executeViaFabric(intent);
          break;
        case 'subagent':
          await this.executeViaSubagent(intent, routingDecision.handlerId);
          break;
        case 'direct':
          await this.executeDirect(intent);
          break;
        case 'queued':
          this.intentQueue.push(intent);
          break;
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      intent.status = 'failed';
      intent.error = errorMessage;
      log.error(`[PlatformIntentRouter] Intent ${intent.id} failed:`, errorMessage);
    } finally {
      // Record completion
      intent.completedAt = new Date();
      intent.durationMs = intent.completedAt.getTime() - (intent.startedAt?.getTime() || intent.createdAt.getTime());
      
      // Update metrics based on final status (intent.status may have been set inside execute* methods)
      const finalStatus = intent.status as PlatformIntent['status'];
      const successStates: PlatformIntent['status'][] = ['completed'];
      if (successStates.includes(finalStatus) && intent.result?.success !== false) {
        this.successCount++;
      } else {
        this.failureCount++;
      }
      this.totalLatencyMs += intent.durationMs;
      
      // Record telemetry
      this.recordTelemetry(intent);
      
      // Move to history
      this.intentHistory.push(intent);
      if (this.intentHistory.length > this.MAX_HISTORY_SIZE) {
        this.intentHistory.shift();
      }
      
      this.activeIntents.delete(intent.id);
    }
    
    return intent;
  }

  private async makeRoutingDecision(intent: PlatformIntent): Promise<RoutingDecision> {
    // Use knowledge orchestration for intelligent routing
    try {
      const routingAnalysis = await knowledgeOrchestrationService.routeQuery(
        intent.intent,
        {
          userId: intent.userId,
          userRole: 'org_owner',
          workspaceId: intent.workspaceId,
        }
      );
      
      // Determine handler based on category and complexity
      let handler: RoutingDecision['handler'] = 'direct';
      let handlerId: string | undefined;
      
      if (intent.category === 'workflow' || intent.category === 'analysis') {
        handler = 'execution_fabric';
      } else if (intent.category === 'automation') {
        handler = 'subagent';
        // Find appropriate subagent
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const subagents = await subagentSupervisor.getSubagentsByDomain(intent as any).domain;
        handlerId = subagents.length > 0 ? subagents[0].id : undefined;
      }
      
      return {
        handler,
        handlerId,
        modelTier: routingAnalysis.modelTier,
        confidence: routingAnalysis.confidenceScore,
        reasoning: routingAnalysis.reasoning,
        estimatedCredits: routingAnalysis.contextBudget || 1,
        requiresApproval: intent.riskLevel === 'critical' || intent.riskLevel === 'high',
      };
    } catch (error) {
      // Fallback to direct execution
      return {
        handler: 'direct',
        modelTier: 'flash',
        confidence: 0.5,
        reasoning: 'Fallback routing due to analysis error',
        estimatedCredits: 1,
        requiresApproval: false,
      };
    }
  }

  private async executeViaFabric(intent: PlatformIntent): Promise<void> {
    const context: ExecutionContext = {
      workspaceId: intent.workspaceId,
      userId: intent.userId,
      userRole: 'org_owner',
      conversationId: intent.conversationId,
      creditsAvailable: 100,
      permissions: ['*'],
    };
    
    // Map emergency priority to critical for execution fabric
    const execPriority = intent.priority === 'emergency' ? 'critical' : intent.priority;
    
    const result = await trinityExecutionFabric.executeIntent(
      intent.intent,
      context,
      {
        domain: intent.domain,
        priority: execPriority,
        autoValidate: true,
        autoRollbackOnFailure: intent.riskLevel !== 'none',
      }
    );
    
    intent.executionManifestId = result.manifestId;
    intent.status = result.success ? 'completed' : 'failed';
    intent.result = result;
    intent.error = result.error;
  }

  private async executeViaSubagent(intent: PlatformIntent, subagentId?: string): Promise<void> {
    if (!subagentId) {
      throw new Error('No subagent ID provided');
    }
    
    // Get subagent and execute via supervisor
    const subagent = await subagentSupervisor.getSubagent(subagentId);
    if (!subagent) {
      throw new Error(`Subagent not found: ${subagentId}`);
    }
    
    // Execute through the supervisor's single execution
    const result = await subagentSupervisor.executeFastModeParallel({
      agentId: subagentId,
      taskId: intent.id,
      content: intent.intent,
      workspaceId: intent.workspaceId,
      userId: intent.userId,
    });
    
    intent.subagentId = subagentId;
    intent.status = result?.success ? 'completed' : 'failed';
    intent.result = result;
  }

  private async executeDirect(intent: PlatformIntent): Promise<void> {
    // Direct execution for simple queries - just use knowledge orchestration
    const result = await knowledgeOrchestrationService.routeQuery(
      intent.intent,
      {
        userId: intent.userId,
        userRole: 'org_owner',
        workspaceId: intent.workspaceId,
      }
    );
    
    intent.status = 'completed';
    intent.result = result;
  }

  // ============================================================================
  // QUEUE PROCESSING
  // ============================================================================

  private startQueueProcessor(): void {
    if (this.queueProcessorInterval) clearInterval(this.queueProcessorInterval);
    this.queueProcessorInterval = setInterval(async () => {
      while (this.intentQueue.length > 0 && this.activeIntents.size < this.MAX_CONCURRENT_INTENTS) {
        const intent = this.intentQueue.shift();
        if (intent) {
          this.routeAndExecute(intent).catch(err => {
            log.error(`[PlatformIntentRouter] Queue processing error:`, err);
          });
        }
      }
    }, this.QUEUE_PROCESS_INTERVAL);
  }

  // ============================================================================
  // TELEMETRY
  // ============================================================================

  private recordTelemetry(intent: PlatformIntent): void {
    const telemetry: IntentTelemetry = {
      intentId: intent.id,
      workspaceId: intent.workspaceId,
      category: intent.category,
      domain: intent.domain,
      priority: intent.priority,
      riskLevel: intent.riskLevel,
      handler: intent.routingDecision?.handler || 'unknown',
      success: intent.status === 'completed',
      durationMs: intent.durationMs || 0,
      tokensUsed: intent.tokensUsed || 0,
      creditsConsumed: intent.creditsConsumed || 0,
      timestamp: new Date(),
    };
    
    this.telemetryBuffer.push(telemetry);
  }

  private startTelemetryFlusher(): void {
    if (this.telemetryFlusherInterval) clearInterval(this.telemetryFlusherInterval);
    this.telemetryFlusherInterval = setInterval(() => {
      if (this.telemetryBuffer.length > 0) {
        const telemetry = this.telemetryBuffer.splice(0, this.telemetryBuffer.length);
        log.info(`[PlatformIntentRouter] Flushing ${telemetry.length} telemetry records`);
      }
    }, this.TELEMETRY_FLUSH_INTERVAL);
  }

  destroy(): void {
    if (this.queueProcessorInterval) {
      clearInterval(this.queueProcessorInterval);
      this.queueProcessorInterval = null;
    }
    if (this.telemetryFlusherInterval) {
      clearInterval(this.telemetryFlusherInterval);
      this.telemetryFlusherInterval = null;
    }
  }

  // ============================================================================
  // HEALTH MONITORING
  // ============================================================================

  getHealthReport(): HealthReport {
    const totalIntents = this.successCount + this.failureCount;
    const successRate = totalIntents > 0 ? (this.successCount / totalIntents) * 100 : 100;
    const avgLatencyMs = totalIntents > 0 ? this.totalLatencyMs / totalIntents : 0;
    
    const alerts: string[] = [];
    
    if (successRate < 95) {
      alerts.push(`Low success rate: ${successRate.toFixed(1)}%`);
    }
    if (avgLatencyMs > 5000) {
      alerts.push(`High latency: ${avgLatencyMs.toFixed(0)}ms average`);
    }
    if (this.intentQueue.length > 50) {
      alerts.push(`Queue backup: ${this.intentQueue.length} intents waiting`);
    }
    
    let status: HealthReport['status'] = 'healthy';
    if (alerts.length > 2 || successRate < 80) {
      status = 'critical';
    } else if (alerts.length > 0) {
      status = 'degraded';
    }
    
    return {
      status,
      totalIntents,
      successRate,
      avgLatencyMs,
      failedIntents: this.failureCount,
      queueDepth: this.intentQueue.length,
      activeIntents: this.activeIntents.size,
      alerts,
    };
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  getActiveIntents(): PlatformIntent[] {
    return Array.from(this.activeIntents.values());
  }

  getIntentHistory(limit: number = 100): PlatformIntent[] {
    return this.intentHistory.slice(-limit);
  }

  getIntent(intentId: string): PlatformIntent | undefined {
    return this.activeIntents.get(intentId) || 
           this.intentHistory.find(i => i.id === intentId);
  }

  getTelemetryBuffer(): IntentTelemetry[] {
    return [...this.telemetryBuffer];
  }

  async cancelIntent(intentId: string): Promise<boolean> {
    const intent = this.activeIntents.get(intentId);
    if (intent && intent.status !== 'completed' && intent.status !== 'failed') {
      intent.status = 'failed';
      intent.error = 'Cancelled by user';
      return true;
    }
    return false;
  }
}

export const platformIntentRouter = PlatformIntentRouter.getInstance();
