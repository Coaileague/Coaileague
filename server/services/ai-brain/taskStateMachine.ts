/**
 * TASK STATE MACHINE SERVICE
 * ==========================
 * Enforces Plan→Act→Validate→Reflect lifecycle for Trinity tasks.
 * 
 * This service solves the "State Machine Governance" critical gap:
 * - Enforces valid phase transitions
 * - Persists status ledger to database
 * - Provides guard rails for illegal transitions
 * - Integrates with parity layer run loop
 * 
 * State Flow:
 * pending → planning → plan_ready → executing → validating → reflecting → completed
 *                                                          ↓
 *                                                    (retry loop)
 */

import { db } from '../../db';
import { eq, and } from 'drizzle-orm';
import {
  aiBrainTasks,
  type TrinityTask,
  type TrinityStateTransition,
  type InsertAiBrainTask,
  VALID_PHASE_TRANSITIONS,
  isValidPhaseTransition,
  getAllowedNextPhases,
  isTerminalPhase,
  systemAuditLogs,
} from '@shared/schema';
import { platformEventBus } from '../../platformEventBus';
import crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export type TaskStatus = 
  | 'pending' | 'planning' | 'plan_ready' | 'executing'
  | 'validating' | 'reflecting' | 'completed' | 'failed'
  | 'escalated' | 'cancelled';

export type TaskPhase = 
  | 'intake' | 'plan' | 'preflight' | 'act'
  | 'validate' | 'reflect' | 'commit' | 'report';

export interface TransitionRequest {
  taskId: string;
  toStatus: TaskStatus;
  toPhase?: TaskPhase;
  reason: string;
  triggeredBy: 'system' | 'user' | 'ai' | 'timeout' | 'error';
  metadata?: Record<string, any>;
}

export interface TransitionResult {
  success: boolean;
  previousStatus: TaskStatus;
  currentStatus: TaskStatus;
  previousPhase?: TaskPhase;
  currentPhase?: TaskPhase;
  error?: string;
  transition?: TrinityStateTransition;
}

// Status to Phase mapping (canonical relationship)
const STATUS_TO_PHASE: Record<TaskStatus, TaskPhase> = {
  'pending': 'intake',
  'planning': 'plan',
  'plan_ready': 'plan',
  'executing': 'act',
  'validating': 'validate',
  'reflecting': 'reflect',
  'completed': 'report',
  'failed': 'report',
  'escalated': 'report',
  'cancelled': 'report',
};

// Valid status transitions (status-level state machine)
const VALID_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  'pending': ['planning', 'failed', 'cancelled'],
  'planning': ['plan_ready', 'failed', 'escalated', 'cancelled'],
  'plan_ready': ['executing', 'cancelled', 'escalated'],
  'executing': ['validating', 'failed', 'escalated'],
  'validating': ['reflecting', 'executing', 'failed', 'escalated'], // Can retry
  'reflecting': ['completed', 'executing', 'failed', 'escalated'], // Can retry
  'completed': [], // Terminal
  'failed': ['escalated'], // Can only escalate from failed
  'escalated': [], // Terminal
  'cancelled': [], // Terminal
};

// ============================================================================
// TASK STATE MACHINE SERVICE
// ============================================================================

class TaskStateMachine {
  private static instance: TaskStateMachine;

  private constructor() {
    console.log('[TaskStateMachine] Initializing state machine service...');
  }

  static getInstance(): TaskStateMachine {
    if (!TaskStateMachine.instance) {
      TaskStateMachine.instance = new TaskStateMachine();
    }
    return TaskStateMachine.instance;
  }

  /**
   * Validate if a status transition is allowed
   */
  isValidStatusTransition(from: TaskStatus, to: TaskStatus): boolean {
    return VALID_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
  }

  /**
   * Get allowed next statuses from current status
   */
  getAllowedNextStatuses(current: TaskStatus): TaskStatus[] {
    return VALID_STATUS_TRANSITIONS[current] ?? [];
  }

  /**
   * Check if status is terminal
   */
  isTerminalStatus(status: TaskStatus): boolean {
    return (VALID_STATUS_TRANSITIONS[status]?.length ?? 0) === 0;
  }

  /**
   * Get the canonical phase for a status
   */
  getPhaseForStatus(status: TaskStatus): TaskPhase {
    return STATUS_TO_PHASE[status] || 'intake';
  }

  /**
   * Request a state transition (with validation and persistence)
   */
  async requestTransition(request: TransitionRequest): Promise<TransitionResult> {
    const { taskId, toStatus, toPhase, reason, triggeredBy, metadata } = request;

    // Load current task state
    const [task] = await db.select()
      .from(aiBrainTasks)
      .where(eq(aiBrainTasks.id, taskId))
      .limit(1);

    if (!task) {
      return {
        success: false,
        previousStatus: 'pending',
        currentStatus: 'pending',
        error: `Task ${taskId} not found`,
      };
    }

    const fromStatus = task.status as TaskStatus;
    const fromPhase = task.phase as TaskPhase;
    const resolvedToPhase = toPhase || this.getPhaseForStatus(toStatus);

    // Validate transition
    if (!this.isValidStatusTransition(fromStatus, toStatus)) {
      const error = `Invalid transition: ${fromStatus} → ${toStatus}. Allowed: ${this.getAllowedNextStatuses(fromStatus).join(', ')}`;
      
      // Log illegal transition attempt
      await this.logTransitionAttempt(taskId, fromStatus, toStatus, false, error, triggeredBy);
      
      return {
        success: false,
        previousStatus: fromStatus,
        currentStatus: fromStatus,
        previousPhase: fromPhase,
        currentPhase: fromPhase,
        error,
      };
    }

    // Check terminal state
    if (this.isTerminalStatus(fromStatus)) {
      const error = `Cannot transition from terminal state: ${fromStatus}`;
      return {
        success: false,
        previousStatus: fromStatus,
        currentStatus: fromStatus,
        error,
      };
    }

    // Create transition record
    const transition: TrinityStateTransition = {
      fromStatus,
      toStatus,
      fromPhase,
      toPhase: resolvedToPhase,
      reason,
      triggeredBy,
      timestamp: new Date().toISOString(),
      metadata,
    };

    // Update state history
    const stateHistory = (task.stateHistory as TrinityStateTransition[]) || [];
    stateHistory.push(transition);

    // Persist to database
    try {
      await db.update(aiBrainTasks)
        .set({
          status: toStatus,
          phase: resolvedToPhase,
          stateHistory,
          ...(toStatus === 'executing' && !task.startedAt ? { startedAt: new Date() } : {}),
          ...(this.isTerminalStatus(toStatus) ? { completedAt: new Date() } : {}),
        })
        .where(eq(aiBrainTasks.id, taskId));

      // Log successful transition
      await this.logTransitionAttempt(taskId, fromStatus, toStatus, true, undefined, triggeredBy);

      // Publish event
      platformEventBus.publish('ai_brain_action', {
        action: 'task_state_transition',
        taskId,
        fromStatus,
        toStatus,
        fromPhase,
        toPhase: resolvedToPhase,
        reason,
        triggeredBy,
      });

      return {
        success: true,
        previousStatus: fromStatus,
        currentStatus: toStatus,
        previousPhase: fromPhase,
        currentPhase: resolvedToPhase,
        transition,
      };
    } catch (error: any) {
      return {
        success: false,
        previousStatus: fromStatus,
        currentStatus: fromStatus,
        error: `Database update failed: ${error.message}`,
      };
    }
  }

  /**
   * Create a new task with initial state
   */
  async createTask(params: {
    taskId?: string;
    workspaceId: string;
    userId: string;
    goal: string;
    domain?: string;
    primarySubagent?: string;
    timeoutMs?: number;
    estimatedCredits?: number;
  }): Promise<{ taskId: string; success: boolean; error?: string }> {
    const taskId = params.taskId || `task-${crypto.randomUUID()}`;
    const now = new Date();

    const initialTransition: TrinityStateTransition = {
      fromStatus: '',
      toStatus: 'pending',
      fromPhase: '',
      toPhase: 'intake',
      reason: 'Task created',
      triggeredBy: 'system',
      timestamp: now.toISOString(),
    };

    const insertData: InsertAiBrainTask = {
      id: taskId,
      workspaceId: params.workspaceId,
      userId: params.userId,
      intent: {
        rawInput: params.goal,
        parsedGoal: params.goal,
        domain: params.domain,
        confidence: 1,
      },
      status: 'pending',
      phase: 'intake',
      steps: [],
      currentStepIndex: 0,
      overallConfidence: 100,
      stepConfidences: {},
      reflections: [],
      maxReflectionCycles: 3,
      stateHistory: [initialTransition],
      timeoutMs: params.timeoutMs || 300000,
      primarySubagent: params.primarySubagent,
      involvedSubagents: params.primarySubagent ? [params.primarySubagent] : [],
      childTaskIds: [],
      actualCreditsUsed: 0,
      estimatedCredits: params.estimatedCredits,
      riskLevel: 'low',
      errorCount: 0,
    };

    try {
      await db.insert(aiBrainTasks).values(insertData);
      
      platformEventBus.publish('ai_brain_action', {
        action: 'task_created',
        taskId,
        workspaceId: params.workspaceId,
        userId: params.userId,
        goal: params.goal,
      });

      return { taskId, success: true };
    } catch (error: any) {
      return { taskId, success: false, error: error.message };
    }
  }

  /**
   * Get current task state
   */
  async getTaskState(taskId: string): Promise<{
    status: TaskStatus;
    phase: TaskPhase;
    allowedNextStatuses: TaskStatus[];
    isTerminal: boolean;
    stateHistory: TrinityStateTransition[];
  } | null> {
    const [task] = await db.select()
      .from(aiBrainTasks)
      .where(eq(aiBrainTasks.id, taskId))
      .limit(1);

    if (!task) return null;

    const status = task.status as TaskStatus;
    return {
      status,
      phase: task.phase as TaskPhase,
      allowedNextStatuses: this.getAllowedNextStatuses(status),
      isTerminal: this.isTerminalStatus(status),
      stateHistory: (task.stateHistory as TrinityStateTransition[]) || [],
    };
  }

  /**
   * Advance task through standard lifecycle
   * Convenience method for common progression
   */
  async advanceToNextPhase(
    taskId: string,
    reason: string,
    triggeredBy: 'system' | 'user' | 'ai' = 'system'
  ): Promise<TransitionResult> {
    const state = await this.getTaskState(taskId);
    if (!state) {
      return {
        success: false,
        previousStatus: 'pending',
        currentStatus: 'pending',
        error: 'Task not found',
      };
    }

    const nextStatuses = state.allowedNextStatuses;
    
    // Pick the "happy path" next status
    const happyPathOrder: TaskStatus[] = [
      'planning', 'plan_ready', 'executing', 'validating', 'reflecting', 'completed'
    ];
    
    const nextStatus = happyPathOrder.find(s => nextStatuses.includes(s));
    
    if (!nextStatus) {
      return {
        success: false,
        previousStatus: state.status,
        currentStatus: state.status,
        error: `No happy path transition from ${state.status}. Available: ${nextStatuses.join(', ')}`,
      };
    }

    return this.requestTransition({
      taskId,
      toStatus: nextStatus,
      reason,
      triggeredBy,
    });
  }

  /**
   * Mark task as failed
   */
  async markFailed(
    taskId: string,
    error: string,
    triggeredBy: 'system' | 'user' | 'ai' | 'timeout' | 'error' = 'error'
  ): Promise<TransitionResult> {
    // Update error info
    await db.update(aiBrainTasks)
      .set({ 
        lastError: error,
        errorCount: db.raw(`COALESCE(error_count, 0) + 1`) as any,
      })
      .where(eq(aiBrainTasks.id, taskId));

    return this.requestTransition({
      taskId,
      toStatus: 'failed',
      reason: error,
      triggeredBy,
    });
  }

  /**
   * Escalate task to human
   */
  async escalate(
    taskId: string,
    reason: string,
    escalateToUserId?: string
  ): Promise<TransitionResult> {
    if (escalateToUserId) {
      await db.update(aiBrainTasks)
        .set({
          escalatedAt: new Date(),
          escalationReason: reason,
          escalatedToUserId,
        })
        .where(eq(aiBrainTasks.id, taskId));
    }

    return this.requestTransition({
      taskId,
      toStatus: 'escalated',
      reason,
      triggeredBy: 'system',
      metadata: { escalatedToUserId },
    });
  }

  /**
   * Log transition attempt to audit log
   */
  private async logTransitionAttempt(
    taskId: string,
    fromStatus: string,
    toStatus: string,
    success: boolean,
    error?: string,
    triggeredBy?: string
  ): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        id: `audit-${crypto.randomUUID()}`,
        eventType: success ? 'state_machine_transition' : 'state_machine_violation',
        severity: success ? 'info' : 'warning',
        source: 'TaskStateMachine',
        message: success 
          ? `Task ${taskId}: ${fromStatus} → ${toStatus}`
          : `Task ${taskId}: BLOCKED ${fromStatus} → ${toStatus} (${error})`,
        metadata: {
          taskId,
          fromStatus,
          toStatus,
          success,
          error,
          triggeredBy,
        },
        createdAt: new Date(),
      });
    } catch (e) {
      console.error('[TaskStateMachine] Failed to log audit:', e);
    }
  }

  /**
   * Update task steps (for plan updates)
   */
  async updateTaskSteps(
    taskId: string,
    steps: any[],
    planId?: string,
    framework?: string
  ): Promise<boolean> {
    try {
      await db.update(aiBrainTasks)
        .set({
          steps,
          planId,
          framework,
        })
        .where(eq(aiBrainTasks.id, taskId));
      return true;
    } catch (error) {
      console.error('[TaskStateMachine] Failed to update steps:', error);
      return false;
    }
  }

  /**
   * Update task confidence
   */
  async updateConfidence(
    taskId: string,
    overallConfidence: number,
    stepConfidences?: Record<string, number>
  ): Promise<boolean> {
    try {
      await db.update(aiBrainTasks)
        .set({
          overallConfidence: Math.round(overallConfidence * 100),
          ...(stepConfidences ? { stepConfidences } : {}),
        })
        .where(eq(aiBrainTasks.id, taskId));
      return true;
    } catch (error) {
      console.error('[TaskStateMachine] Failed to update confidence:', error);
      return false;
    }
  }

  /**
   * Add reflection to task
   */
  async addReflection(taskId: string, reflection: any): Promise<boolean> {
    try {
      const [task] = await db.select()
        .from(aiBrainTasks)
        .where(eq(aiBrainTasks.id, taskId))
        .limit(1);

      if (!task) return false;

      const reflections = (task.reflections as any[]) || [];
      reflections.push(reflection);

      await db.update(aiBrainTasks)
        .set({ reflections })
        .where(eq(aiBrainTasks.id, taskId));
      return true;
    } catch (error) {
      console.error('[TaskStateMachine] Failed to add reflection:', error);
      return false;
    }
  }
}

export const taskStateMachine = TaskStateMachine.getInstance();
