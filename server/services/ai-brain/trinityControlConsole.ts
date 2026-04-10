/**
 * Trinity Control Console Service
 * ================================
 * Real-time streaming of Trinity AI Brain's cognitive process
 * 
 * Provides:
 * - Thought Signatures: Human-readable reasoning between tool calls
 * - Action Logs: Structured records of every tool execution
 * - Real-Time Streaming: WebSocket/SSE delivery of cognitive events
 * - Platform Awareness: Unified event capture from all data operations
 * 
 * Architecture:
 * Frontend → Trinity → This Console → Database → This Console → Frontend
 */

import crypto from 'crypto';
import { db } from '../../db';
import { 
  trinityThoughtSignatures,
  trinityActionLogs,
  InsertTrinityThoughtSignature,
  InsertTrinityActionLog
} from '@shared/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { aiBrainEvents } from './internalEventEmitter';
import { realTimeBridge } from './realTimeBridge';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityControlConsole');

// Types for Control Console
export type ThoughtType = 'reasoning' | 'planning' | 'diagnosis' | 'reflection' | 'decision' | 'observation';
export type ActionType = 'tool_call' | 'api_request' | 'database_query' | 'file_operation' | 'ai_generation' | 'notification' | 'workflow_step';
export type ActionStatus = 'started' | 'completed' | 'failed' | 'skipped';

export interface ThoughtSignaturePayload {
  id?: string;
  sessionId: string;
  workspaceId?: string;
  userId?: string;
  runId?: string;
  thoughtType: ThoughtType;
  content: string;
  context?: Record<string, any>;
  confidence?: number;
  timestamp: string;
}

export interface ActionLogPayload {
  id?: string;
  sessionId: string;
  workspaceId?: string;
  userId?: string;
  runId?: string;
  thoughtId?: string;
  actionType: ActionType;
  actionName: string;
  parameters?: Record<string, any>;
  result?: Record<string, any>;
  status: ActionStatus;
  durationMs?: number;
  errorMessage?: string;
  timestamp: string;
}

export interface TaskProgressPayload {
  current: number;
  total: number;
  taskName?: string;
  sessionId?: string;
  workspaceId?: string;
  timestamp: string;
}

export interface ConsoleStreamPayload {
  type: 'thought' | 'action' | 'awareness' | 'task_progress';
  data: ThoughtSignaturePayload | ActionLogPayload | PlatformAwarenessEvent | TaskProgressPayload;
  timestamp?: string;
}

export interface PlatformAwarenessEvent {
  eventType: string;
  source: string;
  resourceType: string;
  resourceId?: string;
  operation: 'create' | 'update' | 'delete' | 'read';
  timestamp: string;
  metadata?: Record<string, any>;
  routedThroughTrinity: boolean;
}

// Subscription with workspace scoping for multi-tenant security
interface StreamSubscription {
  callback: (payload: ConsoleStreamPayload) => void;
  workspaceId?: string; // If set, only receive events from this workspace
}

// Utility to sanitize any value for XSS prevention (deep recursive)
function sanitizeValue(value: any): any {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return value
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }
  if (Array.isArray(value)) {
    return value.map(item => sanitizeValue(item));
  }
  if (typeof value === 'object') {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = sanitizeValue(val);
    }
    return result;
  }
  // Numbers, booleans, etc. are safe
  return value;
}

// Sanitize entire payload structure
function sanitizePayload(payload: ConsoleStreamPayload): ConsoleStreamPayload {
  return {
    type: payload.type,
    data: sanitizeValue(payload.data),
  };
}

// Sanitize database query results for REST endpoints
export function sanitizeQueryResult<T>(data: T): T {
  return sanitizeValue(data) as T;
}

class TrinityControlConsoleService {
  private static instance: TrinityControlConsoleService;
  private activeStreams: Map<string, Set<StreamSubscription>> = new Map();
  private platformAwarenessBuffer: PlatformAwarenessEvent[] = [];
  private maxBufferSize = 1000;

  private constructor() {
    this.initializeEventListeners();
    log.info('[TrinityControlConsole] Initialized - Real-time cognitive streaming active');
  }

  static getInstance(): TrinityControlConsoleService {
    if (!TrinityControlConsoleService.instance) {
      TrinityControlConsoleService.instance = new TrinityControlConsoleService();
    }
    return TrinityControlConsoleService.instance;
  }

  private initializeEventListeners() {
    // Listen to all workflow events
    aiBrainEvents.on('*', ({ event, data }) => {
      this.captureAwareness({
        eventType: event,
        source: 'ai_brain_events',
        resourceType: this.inferResourceType(event),
        operation: this.inferOperation(event),
        timestamp: new Date().toISOString(),
        metadata: data,
        routedThroughTrinity: true,
      });
    });

    // Listen for database events posted to AI Brain
    aiBrainEvents.on('database_event', (data: any) => {
      this.captureAwareness({
        eventType: 'database_operation',
        source: data.source || 'api',
        resourceType: data.table || 'unknown',
        resourceId: data.recordId,
        operation: data.operation || 'update',
        timestamp: new Date().toISOString(),
        metadata: data,
        routedThroughTrinity: true,
      });
    });
  }

  private inferResourceType(event: string): string {
    if (event.includes('workflow')) return 'workflow';
    if (event.includes('schedule')) return 'schedule';
    if (event.includes('employee')) return 'employee';
    if (event.includes('notification')) return 'notification';
    if (event.includes('trinity')) return 'trinity';
    return 'system';
  }

  private inferOperation(event: string): 'create' | 'update' | 'delete' | 'read' {
    if (event.includes('created') || event.includes('create')) return 'create';
    if (event.includes('deleted') || event.includes('delete') || event.includes('remove')) return 'delete';
    if (event.includes('read') || event.includes('fetch') || event.includes('get')) return 'read';
    return 'update';
  }

  // ============================================================================
  // THOUGHT SIGNATURES - The "Why" between tool calls
  // ============================================================================

  async logThought(thought: Omit<InsertTrinityThoughtSignature, 'id' | 'createdAt'>): Promise<string> {
    try {
      const [inserted] = await db.insert(trinityThoughtSignatures).values(thought).returning();
      
      const payload: ThoughtSignaturePayload = {
        id: inserted.id,
        sessionId: thought.sessionId,
        workspaceId: thought.workspaceId || undefined,
        userId: thought.userId || undefined,
        runId: thought.runId || undefined,
        thoughtType: thought.thoughtType as ThoughtType,
        content: thought.content,
        context: thought.context as Record<string, any> | undefined,
        confidence: thought.confidence || undefined,
        timestamp: new Date().toISOString(),
      };

      // Stream to all subscribed clients
      this.broadcastToSession(thought.sessionId, { type: 'thought', data: payload });
      
      // Also emit via realTimeBridge for mascot reactions
      realTimeBridge.triggerMascotThought(thought.content, 5000);

      log.info(`[TrinityConsole] Thought: "${thought.content.substring(0, 60)}..."`);
      return inserted.id;
    } catch (error) {
      log.error('[TrinityConsole] Failed to log thought:', error);
      throw error;
    }
  }

  // Quick helper for inline thought logging
  async think(
    sessionId: string,
    content: string,
    options?: {
      type?: ThoughtType;
      workspaceId?: string;
      userId?: string;
      runId?: string;
      context?: Record<string, any>;
      confidence?: number;
    }
  ): Promise<string> {
    return this.logThought({
      sessionId,
      content,
      thoughtType: options?.type || 'reasoning',
      workspaceId: options?.workspaceId,
      userId: options?.userId,
      runId: options?.runId,
      context: options?.context,
      confidence: options?.confidence,
    });
  }

  // ============================================================================
  // ACTION LOGS - The "What" of every tool execution
  // ============================================================================

  async logAction(action: Omit<InsertTrinityActionLog, 'id' | 'createdAt'>): Promise<string> {
    try {
      const [inserted] = await db.insert(trinityActionLogs).values(action).returning();

      const payload: ActionLogPayload = {
        id: inserted.id,
        sessionId: action.sessionId,
        workspaceId: action.workspaceId || undefined,
        userId: action.userId || undefined,
        runId: action.runId || undefined,
        thoughtId: action.thoughtId || undefined,
        actionType: action.actionType as ActionType,
        actionName: action.actionName,
        parameters: action.parameters as Record<string, any> | undefined,
        result: action.result as Record<string, any> | undefined,
        status: action.status as ActionStatus,
        durationMs: action.durationMs || undefined,
        errorMessage: action.errorMessage || undefined,
        timestamp: new Date().toISOString(),
      };

      // Stream to all subscribed clients
      this.broadcastToSession(action.sessionId, { type: 'action', data: payload });

      log.info(`[TrinityConsole] Action: ${action.actionName} (${action.status})`);
      return inserted.id;
    } catch (error) {
      log.error('[TrinityConsole] Failed to log action:', error);
      throw error;
    }
  }

  // Convenience wrapper for tool execution logging
  async executeWithLogging<T>(
    sessionId: string,
    actionName: string,
    actionType: ActionType,
    executor: () => Promise<T>,
    options?: {
      workspaceId?: string;
      userId?: string;
      runId?: string;
      thoughtId?: string;
      parameters?: Record<string, any>;
    }
  ): Promise<T> {
    const startTime = Date.now();
    
    // Log action start
    const actionId = await this.logAction({
      sessionId,
      actionName,
      actionType,
      status: 'started',
      workspaceId: options?.workspaceId,
      userId: options?.userId,
      runId: options?.runId,
      thoughtId: options?.thoughtId,
      parameters: options?.parameters,
    });

    try {
      const result = await executor();
      const durationMs = Date.now() - startTime;

      // Update action as completed
      await db.update(trinityActionLogs)
        .set({
          status: 'completed',
          durationMs,
          result: { success: true, data: result },
        })
        .where(eq(trinityActionLogs.id, actionId));

      // Broadcast completion
      this.broadcastToSession(sessionId, {
        type: 'action',
        data: {
          id: actionId,
          sessionId,
          actionType,
          actionName,
          status: 'completed',
          durationMs,
          result: { success: true },
          timestamp: new Date().toISOString(),
        } as ActionLogPayload,
      });

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Update action as failed
      await db.update(trinityActionLogs)
        .set({
          status: 'failed',
          durationMs,
          errorMessage,
        })
        .where(eq(trinityActionLogs.id, actionId));

      // Broadcast failure
      this.broadcastToSession(sessionId, {
        type: 'action',
        data: {
          id: actionId,
          sessionId,
          actionType,
          actionName,
          status: 'failed',
          durationMs,
          errorMessage,
          timestamp: new Date().toISOString(),
        } as ActionLogPayload,
      });

      throw error;
    }
  }

  // ============================================================================
  // TASK PROGRESS - Track and broadcast task progress like Replit Agent
  // ============================================================================

  /**
   * Broadcast task progress update (like Agent's "In progress tasks 6/6")
   */
  broadcastTaskProgress(
    sessionId: string,
    current: number,
    total: number,
    options?: {
      workspaceId?: string;
      taskName?: string;
    }
  ): void {
    const payload: TaskProgressPayload = {
      current,
      total,
      taskName: options?.taskName,
      sessionId,
      workspaceId: options?.workspaceId,
      timestamp: new Date().toISOString(),
    };

    this.broadcastToSession(sessionId, {
      type: 'task_progress',
      data: payload,
      timestamp: payload.timestamp,
    });

    log.info(`[TrinityConsole] Task progress: ${current}/${total}${options?.taskName ? ` - ${options.taskName}` : ''}`);
  }

  /**
   * Quick helper to broadcast an action similar to agent logs
   * (e.g., "Edited client/src/...", "Analyzed file...", "Restarted workflow...")
   */
  async logQuickAction(
    sessionId: string,
    actionName: string,
    actionType: ActionType = 'tool_call',
    status: ActionStatus = 'completed',
    options?: {
      workspaceId?: string;
      durationMs?: number;
    }
  ): Promise<void> {
    const payload: ActionLogPayload = {
      id: `quick-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`,
      sessionId,
      actionType,
      actionName,
      status,
      durationMs: options?.durationMs,
      workspaceId: options?.workspaceId,
      timestamp: new Date().toISOString(),
    };

    this.broadcastToSession(sessionId, { type: 'action', data: payload });
  }

  // ============================================================================
  // PLATFORM AWARENESS - Capture events Trinity needs to know about
  // ============================================================================

  captureAwareness(event: PlatformAwarenessEvent): void {
    // Buffer for querying
    this.platformAwarenessBuffer.push(event);
    if (this.platformAwarenessBuffer.length > this.maxBufferSize) {
      this.platformAwarenessBuffer.shift();
    }

    // Broadcast to all active sessions
    this.broadcastGlobal({ type: 'awareness', data: event });
  }

  // Register a database operation for Trinity awareness (fire-and-forget pattern)
  registerDatabaseEvent(
    table: string,
    operation: 'create' | 'update' | 'delete',
    recordId: string,
    source: string,
    metadata?: Record<string, any>
  ): void {
    setImmediate(() => {
      try {
        aiBrainEvents.emit('database_event', {
          table,
          operation,
          recordId,
          source,
          metadata,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        log.error('[TrinityConsole] Failed to register database event:', error);
      }
    });
  }

  // Get awareness gaps - what Trinity might have missed
  getAwarenessGaps(): {
    unmonitoredEndpoints: string[];
    missingEventTypes: string[];
    recommendations: string[];
  } {
    const knownEventTypes = new Set(this.platformAwarenessBuffer.map(e => e.eventType));
    
    const criticalEvents = [
      'employee_created', 'employee_updated', 'employee_deleted',
      'shift_created', 'shift_updated', 'shift_deleted',
      'timeentry_created', 'timeentry_updated',
      'invoice_created', 'invoice_sent',
      'payroll_processed', 'payroll_approved',
      'notification_sent', 'notification_read',
    ];

    const missingEventTypes = criticalEvents.filter(e => !knownEventTypes.has(e));

    return {
      unmonitoredEndpoints: [
        '/api/hr/employees/* (partial coverage)',
        '/api/shifts/* (partial coverage)',
        '/api/invoices/* (needs integration)',
      ],
      missingEventTypes,
      recommendations: [
        'Add postDatabaseEventToAIBrain hook to all CRUD endpoints',
        'Ensure new features register with platformFeatureRegistry',
        'Route state changes through internalEventEmitter',
      ],
    };
  }

  // ============================================================================
  // REAL-TIME STREAMING - WebSocket/SSE delivery
  // ============================================================================

  /**
   * Subscribe to console events with optional workspace scoping
   * @param sessionId - The session to subscribe to
   * @param callback - The callback to receive events
   * @param workspaceId - Optional workspace ID for multi-tenant filtering
   */
  subscribe(
    sessionId: string, 
    callback: (payload: ConsoleStreamPayload) => void,
    workspaceId?: string
  ): () => void {
    if (!this.activeStreams.has(sessionId)) {
      this.activeStreams.set(sessionId, new Set());
    }
    
    const subscription: StreamSubscription = { callback, workspaceId };
    this.activeStreams.get(sessionId)!.add(subscription);

    log.info(`[TrinityConsole] Stream subscribed for session ${sessionId}${workspaceId ? ` (workspace: ${workspaceId})` : ''}`);

    return () => {
      this.activeStreams.get(sessionId)?.delete(subscription);
      if (this.activeStreams.get(sessionId)?.size === 0) {
        this.activeStreams.delete(sessionId);
      }
      log.info(`[TrinityConsole] Stream unsubscribed for session ${sessionId}`);
    };
  }

  private broadcastToSession(sessionId: string, payload: ConsoleStreamPayload): void {
    const subscribers = this.activeStreams.get(sessionId);
    if (subscribers) {
      // Sanitize payload before broadcasting
      const safePayload = sanitizePayload(payload);
      const payloadWorkspaceId = 'workspaceId' in payload.data ? payload.data.workspaceId : undefined;
      
      subscribers.forEach(subscription => {
        try {
          // Strict workspace scoping for multi-tenant security:
          // - If subscriber has workspace filter:
          //   - Only deliver events that match their workspace exactly
          //   - Skip events without workspaceId (those are platform-wide, not for tenant subscribers)
          // - If subscriber has no workspace filter (platform admin): deliver all events
          if (subscription.workspaceId) {
            if (!payloadWorkspaceId || subscription.workspaceId !== payloadWorkspaceId) {
              return; // Skip - either no workspace on payload or workspace mismatch
            }
          }
          subscription.callback(safePayload);
        } catch (error) {
          log.error('[TrinityConsole] Subscriber error:', error);
        }
      });
    }
  }

  private broadcastGlobal(payload: ConsoleStreamPayload): void {
    // Sanitize payload before broadcasting
    const safePayload = sanitizePayload(payload);
    const payloadWorkspaceId = 'workspaceId' in payload.data 
      ? (payload as any).data.workspaceId 
      : undefined;
    
    this.activeStreams.forEach((subscribers) => {
      subscribers.forEach(subscription => {
        try {
          // Strict workspace scoping for multi-tenant security:
          // - If subscriber has workspace filter:
          //   - Only deliver events that match their workspace exactly
          //   - Skip events without workspaceId (those are platform-wide, not for tenant subscribers)
          // - If subscriber has no workspace filter (platform admin): deliver all events
          if (subscription.workspaceId) {
            if (!payloadWorkspaceId || subscription.workspaceId !== payloadWorkspaceId) {
              return; // Skip - either no workspace on payload or workspace mismatch
            }
          }
          subscription.callback(safePayload);
        } catch (error) {
          log.error('[TrinityConsole] Global broadcast error:', error);
        }
      });
    });
  }

  // ============================================================================
  // QUERY METHODS - Historical data retrieval
  // ============================================================================

  async getRecentThoughts(options?: {
    sessionId?: string;
    workspaceId?: string;
    runId?: string;
    limit?: number;
    since?: Date;
  }): Promise<any[]> {
    const conditions = [];
    
    if (options?.sessionId) {
      conditions.push(eq(trinityThoughtSignatures.sessionId, options.sessionId));
    }
    if (options?.workspaceId) {
      conditions.push(eq(trinityThoughtSignatures.workspaceId, options.workspaceId));
    }
    if (options?.runId) {
      conditions.push(eq(trinityThoughtSignatures.runId, options.runId));
    }
    if (options?.since) {
      conditions.push(gte(trinityThoughtSignatures.createdAt, options.since));
    }

    return db.select()
      .from(trinityThoughtSignatures)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(trinityThoughtSignatures.createdAt))
      .limit(options?.limit || 50);
  }

  async getRecentActions(options?: {
    sessionId?: string;
    workspaceId?: string;
    runId?: string;
    limit?: number;
    since?: Date;
  }): Promise<any[]> {
    const conditions = [];
    
    if (options?.sessionId) {
      conditions.push(eq(trinityActionLogs.sessionId, options.sessionId));
    }
    if (options?.workspaceId) {
      conditions.push(eq(trinityActionLogs.workspaceId, options.workspaceId));
    }
    if (options?.runId) {
      conditions.push(eq(trinityActionLogs.runId, options.runId));
    }
    if (options?.since) {
      conditions.push(gte(trinityActionLogs.createdAt, options.since));
    }

    return db.select()
      .from(trinityActionLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(trinityActionLogs.createdAt))
      .limit(options?.limit || 100);
  }

  async getSessionTimeline(sessionId: string): Promise<Array<{
    type: 'thought' | 'action';
    timestamp: Date;
    data: any;
  }>> {
    const [thoughts, actions] = await Promise.all([
      this.getRecentThoughts({ sessionId, limit: 100 }),
      this.getRecentActions({ sessionId, limit: 200 }),
    ]);

    const timeline = [
      ...thoughts.map(t => ({ type: 'thought' as const, timestamp: t.createdAt, data: t })),
      ...actions.map(a => ({ type: 'action' as const, timestamp: a.createdAt, data: a })),
    ];

    return timeline.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  // Get platform awareness summary
  getAwarenessSummary(): {
    totalEventsCapture: number;
    eventsByType: Record<string, number>;
    eventsBySource: Record<string, number>;
    routedThroughTrinity: number;
    bypassedTrinity: number;
  } {
    const eventsByType: Record<string, number> = {};
    const eventsBySource: Record<string, number> = {};
    let routedThroughTrinity = 0;
    let bypassedTrinity = 0;

    this.platformAwarenessBuffer.forEach(event => {
      eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
      eventsBySource[event.source] = (eventsBySource[event.source] || 0) + 1;
      if (event.routedThroughTrinity) {
        routedThroughTrinity++;
      } else {
        bypassedTrinity++;
      }
    });

    return {
      totalEventsCapture: this.platformAwarenessBuffer.length,
      eventsByType,
      eventsBySource,
      routedThroughTrinity,
      bypassedTrinity,
    };
  }

  // Active stream count for monitoring
  getActiveStreamCount(): number {
    let count = 0;
    this.activeStreams.forEach(set => count += set.size);
    return count;
  }
}

export const trinityControlConsole = TrinityControlConsoleService.getInstance();
