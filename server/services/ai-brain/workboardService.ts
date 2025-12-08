/**
 * AI Brain Workboard Service
 * 
 * Central orchestration hub for all AI work requests. Manages the lifecycle of tasks
 * from submission through completion, coordinating with SubagentSupervisor for
 * intelligent routing and execution.
 * 
 * Flow: Submit → Analyze → Assign → Execute → Complete → Notify
 */

import { db } from '../../db';
import { 
  aiWorkboardTasks, 
  InsertAiWorkboardTask, 
  AiWorkboardTask,
  trinityCredits,
  trinityCreditTransactions 
} from '@shared/schema';
import { eq, and, desc, asc, sql, inArray } from 'drizzle-orm';
import { subagentSupervisor } from './subagentSupervisor';
import { publishPlatformUpdate } from '../platformEventBus';

export interface WorkboardSubmission {
  workspaceId: string;
  userId: string;
  requestType: 'voice_command' | 'chat' | 'direct_api' | 'automation' | 'escalation' | 'system';
  requestContent: string;
  requestMetadata?: Record<string, any>;
  priority?: 'critical' | 'high' | 'normal' | 'low' | 'scheduled';
  notifyVia?: string[];
  parentTaskId?: string;
}

export interface WorkboardTaskResult {
  success: boolean;
  data?: any;
  summary?: string;
  error?: string;
}

export type TaskStatus = 'pending' | 'analyzing' | 'assigned' | 'in_progress' | 'awaiting_approval' | 'completed' | 'failed' | 'cancelled' | 'escalated';

class WorkboardService {
  private static instance: WorkboardService;
  private processingTasks: Set<string> = new Set();

  private constructor() {
    console.log('[WorkboardService] Initializing AI Brain Workboard...');
  }

  static getInstance(): WorkboardService {
    if (!WorkboardService.instance) {
      WorkboardService.instance = new WorkboardService();
    }
    return WorkboardService.instance;
  }

  /**
   * Submit a new work request to the workboard
   */
  async submitTask(submission: WorkboardSubmission): Promise<AiWorkboardTask> {
    console.log('[WorkboardService] Submitting new task:', {
      workspaceId: submission.workspaceId,
      userId: submission.userId,
      requestType: submission.requestType,
      contentLength: submission.requestContent.length
    });

    const taskData: InsertAiWorkboardTask = {
      workspaceId: submission.workspaceId,
      userId: submission.userId,
      requestType: submission.requestType,
      requestContent: submission.requestContent,
      requestMetadata: submission.requestMetadata || {},
      priority: submission.priority || 'normal',
      notifyVia: submission.notifyVia || ['trinity'],
      parentTaskId: submission.parentTaskId,
      status: 'pending',
      statusHistory: [{ 
        status: 'pending', 
        timestamp: new Date().toISOString(), 
        actor: 'system' 
      }]
    };

    const [task] = await db.insert(aiWorkboardTasks)
      .values(taskData)
      .returning();

    console.log('[WorkboardService] Task created:', task.id);

    // Process task asynchronously (don't await to allow immediate response)
    setImmediate(() => {
      this.processTask(task.id).catch(err => {
        console.error('[WorkboardService] Background processing error:', err);
      });
    });

    return task;
  }

  /**
   * Process a pending task through the orchestration pipeline
   */
  async processTask(taskId: string): Promise<void> {
    if (this.processingTasks.has(taskId)) {
      console.log('[WorkboardService] Task already being processed:', taskId);
      return;
    }

    this.processingTasks.add(taskId);

    try {
      const [task] = await db.select()
        .from(aiWorkboardTasks)
        .where(eq(aiWorkboardTasks.id, taskId))
        .limit(1);

      if (!task) {
        console.error('[WorkboardService] Task not found:', taskId);
        return;
      }

      if (task.status !== 'pending') {
        console.log('[WorkboardService] Task not in pending state:', taskId, task.status);
        return;
      }

      // Step 1: Update to analyzing
      await this.updateTaskStatus(taskId, 'analyzing', 'system');

      // Step 2: Analyze and route via SubagentSupervisor
      const routingResult = await subagentSupervisor.routeVoiceCommand({
        transcript: task.requestContent,
        userId: task.userId,
        workspaceId: task.workspaceId,
        context: {
          source: task.requestType,
          timestamp: task.createdAt?.toISOString() || new Date().toISOString(),
          platform: (task.requestMetadata as any)?.platform || 'web'
        }
      });

      // Step 3: Update with assignment
      await db.update(aiWorkboardTasks)
        .set({
          status: 'assigned',
          intent: routingResult.assignedAgent,
          category: this.getAgentCategory(routingResult.assignedAgent),
          confidence: String(routingResult.confidence),
          assignedAgentId: routingResult.assignedAgent,
          assignedAgentName: routingResult.assignedAgent,
          estimatedTokens: routingResult.estimatedTokens,
          statusHistory: sql`${aiWorkboardTasks.statusHistory} || ${JSON.stringify([{
            status: 'assigned',
            timestamp: new Date().toISOString(),
            actor: 'SubagentSupervisor',
            details: { agent: routingResult.assignedAgent }
          }])}::jsonb`,
          updatedAt: new Date()
        })
        .where(eq(aiWorkboardTasks.id, taskId));

      // Step 4: Deduct credits
      await this.deductCredits(task.workspaceId, task.userId, routingResult.estimatedTokens, taskId);

      // Step 5: Update to in_progress
      await this.updateTaskStatus(taskId, 'in_progress', routingResult.assignedAgent);

      // Step 6: Execute task (simulated for now - actual execution would call subagent)
      const result = await this.executeTask(task, routingResult);

      // Step 7: Complete task
      await db.update(aiWorkboardTasks)
        .set({
          status: result.success ? 'completed' : 'failed',
          result: result.data || {},
          resultSummary: result.summary,
          errorMessage: result.error,
          actualTokens: routingResult.estimatedTokens,
          completedAt: new Date(),
          statusHistory: sql`${aiWorkboardTasks.statusHistory} || ${JSON.stringify([{
            status: result.success ? 'completed' : 'failed',
            timestamp: new Date().toISOString(),
            actor: routingResult.assignedAgent
          }])}::jsonb`,
          updatedAt: new Date()
        })
        .where(eq(aiWorkboardTasks.id, taskId));

      // Step 8: Send notifications
      await this.sendCompletionNotification(taskId, result);

      console.log('[WorkboardService] Task completed:', taskId, result.success ? 'SUCCESS' : 'FAILED');

    } catch (error: any) {
      console.error('[WorkboardService] Error processing task:', taskId, error);
      
      await db.update(aiWorkboardTasks)
        .set({
          status: 'failed',
          errorMessage: error.message || 'Unknown error',
          statusHistory: sql`${aiWorkboardTasks.statusHistory} || ${JSON.stringify([{
            status: 'failed',
            timestamp: new Date().toISOString(),
            actor: 'system',
            error: error.message
          }])}::jsonb`,
          updatedAt: new Date()
        })
        .where(eq(aiWorkboardTasks.id, taskId));

    } finally {
      this.processingTasks.delete(taskId);
    }
  }

  /**
   * Execute the actual task via the assigned subagent
   */
  private async executeTask(
    task: AiWorkboardTask, 
    routing: { assignedAgent: string; estimatedTokens: number; confidence: number }
  ): Promise<WorkboardTaskResult> {
    // For now, return a simulated successful result
    // In a full implementation, this would dispatch to the actual subagent
    
    const agentResponses: Record<string, string> = {
      'SchedulingAgent': 'I can help you with scheduling. What would you like to schedule?',
      'PayrollAgent': 'I can assist with payroll-related tasks. What do you need?',
      'BillingAgent': 'I can help with billing and invoices. What would you like to do?',
      'HRAgent': 'I can help with HR and employee matters. How can I assist?',
      'AnalyticsAgent': 'I can generate reports and analytics. What data would you like to see?',
      'SupportAgent': 'I\'m here to help with any support questions. What can I help with?',
      'ComplianceAgent': 'I can assist with compliance and certifications. What do you need?',
      'TimeTrackingAgent': 'I can help with time tracking and timesheets. What would you like to do?',
      'GeneralAssistant': 'I\'m your general assistant. How can I help you today?'
    };

    return {
      success: true,
      data: {
        response: agentResponses[routing.assignedAgent] || agentResponses['GeneralAssistant'],
        agentId: routing.assignedAgent,
        processedAt: new Date().toISOString()
      },
      summary: `Task processed by ${routing.assignedAgent} with ${routing.confidence * 100}% confidence.`
    };
  }

  /**
   * Update task status with history tracking
   */
  private async updateTaskStatus(
    taskId: string, 
    status: TaskStatus, 
    actor: string
  ): Promise<void> {
    const updates: any = {
      status,
      statusHistory: sql`${aiWorkboardTasks.statusHistory} || ${JSON.stringify([{
        status,
        timestamp: new Date().toISOString(),
        actor
      }])}::jsonb`,
      updatedAt: new Date()
    };

    if (status === 'in_progress') {
      updates.startedAt = new Date();
    }

    await db.update(aiWorkboardTasks)
      .set(updates)
      .where(eq(aiWorkboardTasks.id, taskId));

    console.log('[WorkboardService] Status changed:', taskId, status, actor);
  }

  /**
   * Deduct credits for task execution
   */
  private async deductCredits(
    workspaceId: string, 
    userId: string, 
    tokens: number,
    taskId: string
  ): Promise<boolean> {
    try {
      const [credits] = await db.select()
        .from(trinityCredits)
        .where(eq(trinityCredits.workspaceId, workspaceId))
        .limit(1);

      if (!credits || credits.balance < tokens) {
        console.log('[WorkboardService] Insufficient credits:', workspaceId, credits?.balance, tokens);
        return false;
      }

      await db.update(trinityCredits)
        .set({
          balance: sql`${trinityCredits.balance} - ${tokens}`,
          lifetimeUsed: sql`${trinityCredits.lifetimeUsed} + ${tokens}`,
          updatedAt: new Date()
        })
        .where(eq(trinityCredits.workspaceId, workspaceId));

      await db.insert(trinityCreditTransactions).values({
        workspaceId,
        userId,
        type: 'deduction',
        amount: tokens,
        description: `Workboard task: ${taskId.substring(0, 8)}`,
        featureKey: 'workboard_task',
        metadata: { taskId }
      });

      // Mark credits deducted on task
      await db.update(aiWorkboardTasks)
        .set({ creditsDeducted: true })
        .where(eq(aiWorkboardTasks.id, taskId));

      return true;
    } catch (error) {
      console.error('[WorkboardService] Credit deduction error:', error);
      return false;
    }
  }

  /**
   * Send completion notifications via configured channels
   */
  private async sendCompletionNotification(taskId: string, result: WorkboardTaskResult): Promise<void> {
    const [task] = await db.select()
      .from(aiWorkboardTasks)
      .where(eq(aiWorkboardTasks.id, taskId))
      .limit(1);

    if (!task) return;

    const notifyChannels = task.notifyVia || ['trinity'];

    for (const channel of notifyChannels) {
      switch (channel) {
        case 'trinity':
          // Trinity mascot notification - log for now, integrate later
          console.log('[WorkboardService] Trinity notification:', {
            userId: task.userId,
            type: result.success ? 'task_completed' : 'task_failed',
            message: result.summary
          });
          break;

        case 'websocket':
          // Real-time WebSocket update - log for now
          console.log('[WorkboardService] WebSocket broadcast:', {
            taskId: task.id,
            status: task.status
          });
          break;

        case 'email':
          // Email notification - use platform notification
          await publishPlatformUpdate({
            type: 'automation_completed',
            category: 'improvement',
            title: result.success ? 'Task Completed' : 'Task Failed',
            description: result.summary || 'Your AI workboard task has been processed.',
            workspaceId: task.workspaceId,
            userId: task.userId,
            metadata: { taskId: task.id }
          });
          break;

        case 'push':
          // Push notification (future implementation)
          break;
      }
    }

    // Mark notification as sent
    await db.update(aiWorkboardTasks)
      .set({
        notificationSent: true,
        notifiedAt: new Date()
      })
      .where(eq(aiWorkboardTasks.id, taskId));
  }

  /**
   * Get agent category from agent name
   */
  private getAgentCategory(agentName: string): string {
    const categoryMap: Record<string, string> = {
      'SchedulingAgent': 'scheduling',
      'PayrollAgent': 'payroll',
      'BillingAgent': 'billing',
      'HRAgent': 'hr',
      'AnalyticsAgent': 'analytics',
      'SupportAgent': 'support',
      'ComplianceAgent': 'compliance',
      'TimeTrackingAgent': 'time_tracking',
      'GeneralAssistant': 'general'
    };
    return categoryMap[agentName] || 'general';
  }

  /**
   * Retry a failed task
   */
  async retryTask(taskId: string): Promise<boolean> {
    const [task] = await db.select()
      .from(aiWorkboardTasks)
      .where(eq(aiWorkboardTasks.id, taskId))
      .limit(1);

    if (!task) return false;

    if (task.retryCount >= (task.maxRetries || 3)) {
      console.log('[WorkboardService] Max retries exceeded:', taskId);
      await this.escalateTask(taskId, 'Max retries exceeded');
      return false;
    }

    await db.update(aiWorkboardTasks)
      .set({
        status: 'pending',
        retryCount: (task.retryCount || 0) + 1,
        errorMessage: null,
        statusHistory: sql`${aiWorkboardTasks.statusHistory} || ${JSON.stringify([{
          status: 'pending',
          timestamp: new Date().toISOString(),
          actor: 'system',
          details: { retry: (task.retryCount || 0) + 1 }
        }])}::jsonb`,
        updatedAt: new Date()
      })
      .where(eq(aiWorkboardTasks.id, taskId));

    await this.processTask(taskId);
    return true;
  }

  /**
   * Escalate a task to support
   */
  async escalateTask(taskId: string, reason: string): Promise<void> {
    await db.update(aiWorkboardTasks)
      .set({
        status: 'escalated',
        errorMessage: reason,
        statusHistory: sql`${aiWorkboardTasks.statusHistory} || ${JSON.stringify([{
          status: 'escalated',
          timestamp: new Date().toISOString(),
          actor: 'system',
          reason
        }])}::jsonb`,
        updatedAt: new Date()
      })
      .where(eq(aiWorkboardTasks.id, taskId));

    console.log('[WorkboardService] Task escalated:', taskId, reason);
  }

  /**
   * Get tasks for a user
   */
  async getUserTasks(
    userId: string, 
    workspaceId: string, 
    options?: { 
      status?: TaskStatus[]; 
      limit?: number; 
      offset?: number 
    }
  ): Promise<AiWorkboardTask[]> {
    let query = db.select()
      .from(aiWorkboardTasks)
      .where(
        and(
          eq(aiWorkboardTasks.userId, userId),
          eq(aiWorkboardTasks.workspaceId, workspaceId)
        )
      )
      .orderBy(desc(aiWorkboardTasks.createdAt));

    if (options?.status && options.status.length > 0) {
      query = query.where(inArray(aiWorkboardTasks.status, options.status)) as any;
    }

    if (options?.limit) {
      query = query.limit(options.limit) as any;
    }

    if (options?.offset) {
      query = query.offset(options.offset) as any;
    }

    return await query;
  }

  /**
   * Get a single task by ID
   */
  async getTask(taskId: string): Promise<AiWorkboardTask | null> {
    const [task] = await db.select()
      .from(aiWorkboardTasks)
      .where(eq(aiWorkboardTasks.id, taskId))
      .limit(1);
    
    return task || null;
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string, userId: string): Promise<boolean> {
    const [task] = await db.select()
      .from(aiWorkboardTasks)
      .where(eq(aiWorkboardTasks.id, taskId))
      .limit(1);

    if (!task) return false;

    // Only allow cancellation of pending/analyzing tasks
    if (!['pending', 'analyzing', 'assigned'].includes(task.status)) {
      return false;
    }

    await db.update(aiWorkboardTasks)
      .set({
        status: 'cancelled',
        statusHistory: sql`${aiWorkboardTasks.statusHistory} || ${JSON.stringify([{
          status: 'cancelled',
          timestamp: new Date().toISOString(),
          actor: userId
        }])}::jsonb`,
        completedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(aiWorkboardTasks.id, taskId));

    return true;
  }

  /**
   * Get workboard statistics for a workspace
   */
  async getWorkspaceStats(workspaceId: string): Promise<{
    pending: number;
    inProgress: number;
    completed: number;
    failed: number;
    totalTokens: number;
  }> {
    const tasks = await db.select()
      .from(aiWorkboardTasks)
      .where(eq(aiWorkboardTasks.workspaceId, workspaceId));

    const stats = {
      pending: 0,
      inProgress: 0,
      completed: 0,
      failed: 0,
      totalTokens: 0
    };

    for (const task of tasks) {
      if (task.status === 'pending' || task.status === 'analyzing' || task.status === 'assigned') {
        stats.pending++;
      } else if (task.status === 'in_progress') {
        stats.inProgress++;
      } else if (task.status === 'completed') {
        stats.completed++;
      } else if (task.status === 'failed' || task.status === 'escalated') {
        stats.failed++;
      }
      stats.totalTokens += task.actualTokens || task.estimatedTokens || 0;
    }

    return stats;
  }
}

export const workboardService = WorkboardService.getInstance();
