/**
 * UNIFIED LIFECYCLE MANAGER
 * =========================
 * Coordinates lifecycle events across all Trinity AI Brain components.
 * Connects memory persistence, event emission, and escalation handling.
 * 
 * Core Responsibilities:
 * - Lifecycle hook registration and invocation
 * - Memory context save/restore on session boundaries
 * - Unified event emission for all state transitions
 * - Integration with orchestration state machine
 * - Escalation routing with memory context
 * 
 * Lifecycle Events:
 * - session_start: New user session begins
 * - session_end: User session ends (memory checkpoint)
 * - task_start: Execution begins
 * - task_complete: Execution succeeds
 * - task_fail: Execution fails
 * - escalation: Human intervention required
 * - reflection_start: Self-reflection begins
 * - reflection_complete: Self-reflection ends
 */

import { platformEventBus, type PlatformEvent } from '../platformEventBus';
import { trinityMemoryService } from './trinityMemoryService';
import crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export type LifecycleEventType =
  | 'session_start'
  | 'session_end'
  | 'task_start'
  | 'task_complete'
  | 'task_fail'
  | 'escalation'
  | 'reflection_start'
  | 'reflection_complete'
  | 'rollback_initiated'
  | 'rollback_complete'
  | 'memory_checkpoint'
  | 'context_restored';

export interface LifecycleEvent {
  id: string;
  type: LifecycleEventType;
  timestamp: Date;
  workspaceId: string;
  userId: string;
  sessionId?: string;
  executionId?: string;
  context: LifecycleContext;
  metadata?: Record<string, any>;
}

export interface LifecycleContext {
  domain?: string;
  intent?: string;
  phase?: string;
  confidenceScore?: number;
  memorySnapshot?: MemorySnapshot;
  escalationInfo?: EscalationInfo;
  errorInfo?: ErrorInfo;
}

export interface MemorySnapshot {
  id: string;
  createdAt: Date;
  userProfile?: any;
  conversationContext?: any;
  toolUsageStats?: any;
  learningInsights?: any;
}

export interface EscalationInfo {
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  escalatedTo?: string;
  previousAttempts: number;
  contextSummary: string;
}

export interface ErrorInfo {
  code: string;
  message: string;
  stack?: string;
  recoverable: boolean;
  suggestedAction?: string;
}

export type LifecycleHookHandler = (event: LifecycleEvent) => Promise<void>;

export interface LifecycleHook {
  id: string;
  eventType: LifecycleEventType | '*';
  handler: LifecycleHookHandler;
  priority: number;
  name: string;
  enabled: boolean;
}

export interface SessionState {
  sessionId: string;
  userId: string;
  workspaceId: string;
  startedAt: Date;
  lastActivityAt: Date;
  executionCount: number;
  memoryCheckpoints: string[];
  isActive: boolean;
}

// ============================================================================
// UNIFIED LIFECYCLE MANAGER CLASS
// ============================================================================

class UnifiedLifecycleManager {
  private static instance: UnifiedLifecycleManager;
  private hooks: Map<string, LifecycleHook[]> = new Map();
  private activeSessions: Map<string, SessionState> = new Map();
  private eventHistory: LifecycleEvent[] = [];
  private readonly maxHistorySize = 1000;
  private initialized = false;

  private constructor() {
    console.log('[UnifiedLifecycleManager] Initializing lifecycle management...');
  }

  static getInstance(): UnifiedLifecycleManager {
    if (!UnifiedLifecycleManager.instance) {
      UnifiedLifecycleManager.instance = new UnifiedLifecycleManager();
    }
    return UnifiedLifecycleManager.instance;
  }

  /**
   * Initialize lifecycle manager and connect to platform event bus
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Subscribe to platform events for AI Brain actions
    platformEventBus.subscribe('ai_brain_action', {
      name: 'UnifiedLifecycleManager',
      handler: async (event: PlatformEvent) => {
        await this.handlePlatformEvent(event);
      },
    });

    platformEventBus.subscribe('ai_escalation', {
      name: 'UnifiedLifecycleManager-Escalation',
      handler: async (event: PlatformEvent) => {
        await this.handleEscalationEvent(event);
      },
    });

    platformEventBus.subscribe('ai_error', {
      name: 'UnifiedLifecycleManager-Error',
      handler: async (event: PlatformEvent) => {
        await this.handleErrorEvent(event);
      },
    });

    this.initialized = true;
    console.log('[UnifiedLifecycleManager] Initialized and subscribed to platform events');
  }

  // ============================================================================
  // HOOK REGISTRATION
  // ============================================================================

  /**
   * Register a lifecycle hook for specific event types
   */
  registerHook(
    eventType: LifecycleEventType | '*',
    handler: LifecycleHookHandler,
    options: { name: string; priority?: number } = { name: 'anonymous' }
  ): string {
    const hookId = `hook-${crypto.randomUUID()}`;
    const hook: LifecycleHook = {
      id: hookId,
      eventType,
      handler,
      priority: options.priority ?? 100,
      name: options.name,
      enabled: true,
    };

    const key = eventType === '*' ? 'all' : eventType;
    if (!this.hooks.has(key)) {
      this.hooks.set(key, []);
    }
    
    const hooks = this.hooks.get(key)!;
    hooks.push(hook);
    hooks.sort((a, b) => a.priority - b.priority);

    console.log(`[UnifiedLifecycleManager] Hook '${options.name}' registered for '${eventType}'`);
    return hookId;
  }

  /**
   * Unregister a lifecycle hook
   */
  unregisterHook(hookId: string): boolean {
    for (const [key, hooks] of this.hooks.entries()) {
      const index = hooks.findIndex(h => h.id === hookId);
      if (index !== -1) {
        hooks.splice(index, 1);
        console.log(`[UnifiedLifecycleManager] Hook ${hookId} unregistered`);
        return true;
      }
    }
    return false;
  }

  /**
   * Enable/disable a hook without removing it
   */
  setHookEnabled(hookId: string, enabled: boolean): boolean {
    for (const hooks of this.hooks.values()) {
      const hook = hooks.find(h => h.id === hookId);
      if (hook) {
        hook.enabled = enabled;
        return true;
      }
    }
    return false;
  }

  // ============================================================================
  // LIFECYCLE EVENT EMISSION
  // ============================================================================

  /**
   * Emit a lifecycle event and invoke all registered hooks
   */
  async emitLifecycleEvent(
    type: LifecycleEventType,
    workspaceId: string,
    userId: string,
    context: LifecycleContext,
    options: { sessionId?: string; executionId?: string; metadata?: Record<string, any> } = {}
  ): Promise<LifecycleEvent> {
    const event: LifecycleEvent = {
      id: `lfe-${crypto.randomUUID()}`,
      type,
      timestamp: new Date(),
      workspaceId,
      userId,
      sessionId: options.sessionId,
      executionId: options.executionId,
      context,
      metadata: options.metadata,
    };

    // Store in history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }

    // Invoke hooks
    await this.invokeHooks(event);

    // Handle special lifecycle events
    await this.handleSpecialEvents(event);

    return event;
  }

  /**
   * Invoke all registered hooks for an event
   */
  private async invokeHooks(event: LifecycleEvent): Promise<void> {
    const allHooks = this.hooks.get('all') || [];
    const typeHooks = this.hooks.get(event.type) || [];
    const combinedHooks = [...allHooks, ...typeHooks]
      .filter(h => h.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const hook of combinedHooks) {
      try {
        await hook.handler(event);
      } catch (error: any) {
        console.error(`[UnifiedLifecycleManager] Hook '${hook.name}' failed:`, error.message);
      }
    }
  }

  /**
   * Handle special lifecycle events (memory checkpoints, session management)
   */
  private async handleSpecialEvents(event: LifecycleEvent): Promise<void> {
    switch (event.type) {
      case 'session_start':
        await this.handleSessionStart(event);
        break;
      case 'session_end':
        await this.handleSessionEnd(event);
        break;
      case 'task_complete':
      case 'task_fail':
        await this.handleTaskEnd(event);
        break;
      case 'escalation':
        await this.handleEscalation(event);
        break;
    }
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  /**
   * Start a new session
   */
  async startSession(workspaceId: string, userId: string): Promise<SessionState> {
    const sessionId = `session-${crypto.randomUUID()}`;
    
    const session: SessionState = {
      sessionId,
      userId,
      workspaceId,
      startedAt: new Date(),
      lastActivityAt: new Date(),
      executionCount: 0,
      memoryCheckpoints: [],
      isActive: true,
    };

    this.activeSessions.set(sessionId, session);

    // Emit session_start event
    await this.emitLifecycleEvent(
      'session_start',
      workspaceId,
      userId,
      { phase: 'initialization' },
      { sessionId }
    );

    // Restore memory context for user
    await this.restoreMemoryContext(session);

    return session;
  }

  /**
   * End a session
   */
  async endSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      console.warn(`[UnifiedLifecycleManager] Session ${sessionId} not found`);
      return;
    }

    session.isActive = false;

    // Save memory checkpoint before ending
    await this.saveMemoryCheckpoint(session);

    // Emit session_end event
    await this.emitLifecycleEvent(
      'session_end',
      session.workspaceId,
      session.userId,
      { 
        phase: 'cleanup',
        memorySnapshot: await this.createMemorySnapshot(session),
      },
      { sessionId }
    );

    this.activeSessions.delete(sessionId);
  }

  /**
   * Get active session for user
   */
  getActiveSession(userId: string, workspaceId: string): SessionState | undefined {
    for (const session of this.activeSessions.values()) {
      if (session.userId === userId && session.workspaceId === workspaceId && session.isActive) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Update session activity timestamp
   */
  touchSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.lastActivityAt = new Date();
    }
  }

  // ============================================================================
  // MEMORY CONTEXT MANAGEMENT
  // ============================================================================

  /**
   * Restore memory context when session starts
   */
  private async restoreMemoryContext(session: SessionState): Promise<void> {
    try {
      const profile = await trinityMemoryService.getUserMemoryProfile(
        session.userId,
        session.workspaceId
      );

      // Emit context restored event
      await this.emitLifecycleEvent(
        'context_restored',
        session.workspaceId,
        session.userId,
        {
          phase: 'memory_restore',
          memorySnapshot: {
            id: `snapshot-${Date.now()}`,
            createdAt: new Date(),
            userProfile: profile.preferences,
            toolUsageStats: profile.toolUsage.slice(0, 10),
            learningInsights: profile.learningInsights.slice(0, 5),
          },
        },
        { sessionId: session.sessionId }
      );

      console.log(`[UnifiedLifecycleManager] Memory context restored for user ${session.userId}`);
    } catch (error: any) {
      console.error(`[UnifiedLifecycleManager] Failed to restore memory context:`, error.message);
    }
  }

  /**
   * Save memory checkpoint during session
   */
  async saveMemoryCheckpoint(session: SessionState): Promise<string> {
    const checkpointId = `checkpoint-${crypto.randomUUID()}`;
    
    try {
      // Create snapshot and emit event
      const snapshot = await this.createMemorySnapshot(session);
      
      session.memoryCheckpoints.push(checkpointId);

      await this.emitLifecycleEvent(
        'memory_checkpoint',
        session.workspaceId,
        session.userId,
        {
          phase: 'checkpoint',
          memorySnapshot: snapshot,
        },
        { sessionId: session.sessionId, metadata: { checkpointId } }
      );

      console.log(`[UnifiedLifecycleManager] Memory checkpoint ${checkpointId} saved`);
      return checkpointId;
    } catch (error: any) {
      console.error(`[UnifiedLifecycleManager] Failed to save memory checkpoint:`, error.message);
      throw error;
    }
  }

  /**
   * Create a memory snapshot for the current session state
   */
  private async createMemorySnapshot(session: SessionState): Promise<MemorySnapshot> {
    const profile = await trinityMemoryService.getUserMemoryProfile(
      session.userId,
      session.workspaceId
    );

    return {
      id: `snapshot-${crypto.randomUUID()}`,
      createdAt: new Date(),
      userProfile: profile.preferences,
      conversationContext: {
        sessionId: session.sessionId,
        executionCount: session.executionCount,
        lastActivity: session.lastActivityAt,
      },
      toolUsageStats: profile.toolUsage,
      learningInsights: profile.learningInsights,
    };
  }

  // ============================================================================
  // TASK LIFECYCLE HELPERS
  // ============================================================================

  /**
   * Signal task start
   */
  async onTaskStart(params: {
    workspaceId: string;
    userId: string;
    executionId: string;
    intent: string;
    domain: string;
    sessionId?: string;
  }): Promise<LifecycleEvent> {
    const session = params.sessionId 
      ? this.activeSessions.get(params.sessionId)
      : this.getActiveSession(params.userId, params.workspaceId);

    if (session) {
      session.executionCount++;
      session.lastActivityAt = new Date();
    }

    return this.emitLifecycleEvent(
      'task_start',
      params.workspaceId,
      params.userId,
      {
        domain: params.domain,
        intent: params.intent,
        phase: 'starting',
      },
      { 
        sessionId: session?.sessionId,
        executionId: params.executionId,
      }
    );
  }

  /**
   * Signal task completion
   */
  async onTaskComplete(params: {
    workspaceId: string;
    userId: string;
    executionId: string;
    result?: any;
    confidenceScore?: number;
    sessionId?: string;
  }): Promise<LifecycleEvent> {
    return this.emitLifecycleEvent(
      'task_complete',
      params.workspaceId,
      params.userId,
      {
        phase: 'completed',
        confidenceScore: params.confidenceScore,
      },
      {
        sessionId: params.sessionId,
        executionId: params.executionId,
        metadata: { result: params.result },
      }
    );
  }

  /**
   * Signal task failure
   */
  async onTaskFail(params: {
    workspaceId: string;
    userId: string;
    executionId: string;
    error: Error | string;
    recoverable?: boolean;
    sessionId?: string;
  }): Promise<LifecycleEvent> {
    const errorMessage = params.error instanceof Error ? params.error.message : params.error;
    const errorStack = params.error instanceof Error ? params.error.stack : undefined;

    return this.emitLifecycleEvent(
      'task_fail',
      params.workspaceId,
      params.userId,
      {
        phase: 'failed',
        errorInfo: {
          code: 'TASK_FAILURE',
          message: errorMessage,
          stack: errorStack,
          recoverable: params.recoverable ?? false,
        },
      },
      {
        sessionId: params.sessionId,
        executionId: params.executionId,
      }
    );
  }

  /**
   * Signal escalation
   */
  async onEscalation(params: {
    workspaceId: string;
    userId: string;
    executionId?: string;
    reason: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    escalatedTo?: string;
    previousAttempts?: number;
    sessionId?: string;
  }): Promise<LifecycleEvent> {
    const session = params.sessionId
      ? this.activeSessions.get(params.sessionId)
      : this.getActiveSession(params.userId, params.workspaceId);

    // Create memory snapshot for escalation context
    let contextSummary = 'No session context available';
    if (session) {
      const snapshot = await this.createMemorySnapshot(session);
      contextSummary = `Session ${session.sessionId} with ${session.executionCount} executions`;
    }

    return this.emitLifecycleEvent(
      'escalation',
      params.workspaceId,
      params.userId,
      {
        phase: 'escalated',
        escalationInfo: {
          reason: params.reason,
          severity: params.severity,
          escalatedTo: params.escalatedTo,
          previousAttempts: params.previousAttempts ?? 0,
          contextSummary,
        },
      },
      {
        sessionId: session?.sessionId,
        executionId: params.executionId,
      }
    );
  }

  // ============================================================================
  // INTERNAL EVENT HANDLERS
  // ============================================================================

  private async handleSessionStart(event: LifecycleEvent): Promise<void> {
    console.log(`[UnifiedLifecycleManager] Session started: ${event.sessionId} for user ${event.userId}`);
  }

  private async handleSessionEnd(event: LifecycleEvent): Promise<void> {
    console.log(`[UnifiedLifecycleManager] Session ended: ${event.sessionId}`);
  }

  private async handleTaskEnd(event: LifecycleEvent): Promise<void> {
    // After task completion/failure, share insights with memory service
    if (event.type === 'task_complete' && event.context.confidenceScore) {
      try {
        await trinityMemoryService.shareInsight({
          sourceAgent: 'trinity',
          insightType: 'resolution',
          workspaceScope: event.workspaceId,
          title: `Task completed with ${(event.context.confidenceScore * 100).toFixed(0)}% confidence`,
          content: event.context.intent || 'Task execution',
          confidence: event.context.confidenceScore,
          applicableScenarios: [event.context.domain || 'general'],
        });
      } catch (error: any) {
        console.error(`[UnifiedLifecycleManager] Failed to share task insight:`, error.message);
      }
    }
  }

  private async handleEscalation(event: LifecycleEvent): Promise<void> {
    // Publish escalation to platform event bus for broader notification
    await platformEventBus.publish({
      type: 'ai_escalation',
      category: 'ai_brain',
      title: `Escalation: ${event.context.escalationInfo?.reason || 'Unknown'}`,
      description: event.context.escalationInfo?.contextSummary || 'Escalation triggered',
      workspaceId: event.workspaceId,
      userId: event.userId,
      metadata: {
        executionId: event.executionId,
        sessionId: event.sessionId,
        severity: event.context.escalationInfo?.severity,
        escalatedTo: event.context.escalationInfo?.escalatedTo,
      },
      priority: event.context.escalationInfo?.severity === 'critical' ? 1 : 2,
      visibility: 'manager',
    });
  }

  private async handlePlatformEvent(event: PlatformEvent): Promise<void> {
    // Convert platform events to lifecycle events when relevant
    if (event.metadata?.executionId) {
      console.log(`[UnifiedLifecycleManager] Platform event received: ${event.type}`);
    }
  }

  private async handleEscalationEvent(event: PlatformEvent): Promise<void> {
    console.log(`[UnifiedLifecycleManager] Escalation event: ${event.title}`);
  }

  private async handleErrorEvent(event: PlatformEvent): Promise<void> {
    console.log(`[UnifiedLifecycleManager] Error event: ${event.title}`);
  }

  // ============================================================================
  // DIAGNOSTICS AND MONITORING
  // ============================================================================

  /**
   * Get lifecycle manager diagnostics
   */
  getDiagnostics(): Record<string, any> {
    const hookCounts: Record<string, number> = {};
    for (const [key, hooks] of this.hooks.entries()) {
      hookCounts[key] = hooks.length;
    }

    return {
      initialized: this.initialized,
      activeSessions: this.activeSessions.size,
      registeredHooks: hookCounts,
      eventHistorySize: this.eventHistory.length,
      sessions: Array.from(this.activeSessions.values()).map(s => ({
        sessionId: s.sessionId,
        userId: s.userId,
        workspaceId: s.workspaceId,
        executionCount: s.executionCount,
        isActive: s.isActive,
        startedAt: s.startedAt,
        lastActivityAt: s.lastActivityAt,
      })),
    };
  }

  /**
   * Get recent lifecycle events
   */
  getRecentEvents(limit: number = 50): LifecycleEvent[] {
    return this.eventHistory.slice(-limit);
  }

  /**
   * Get events for a specific execution
   */
  getEventsForExecution(executionId: string): LifecycleEvent[] {
    return this.eventHistory.filter(e => e.executionId === executionId);
  }

  /**
   * Get events for a specific session
   */
  getEventsForSession(sessionId: string): LifecycleEvent[] {
    return this.eventHistory.filter(e => e.sessionId === sessionId);
  }

  /**
   * Cleanup inactive sessions
   */
  cleanupInactiveSessions(maxIdleMs: number = 30 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (now - session.lastActivityAt.getTime() > maxIdleMs) {
        this.activeSessions.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[UnifiedLifecycleManager] Cleaned up ${cleaned} inactive sessions`);
    }
    return cleaned;
  }

  /**
   * Shutdown the lifecycle manager
   */
  shutdown(): void {
    this.hooks.clear();
    this.activeSessions.clear();
    this.eventHistory = [];
    this.initialized = false;
    console.log('[UnifiedLifecycleManager] Shutdown complete');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const unifiedLifecycleManager = UnifiedLifecycleManager.getInstance();
