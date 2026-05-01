/**
 * AI Brain Workboard Service
 * 
 * Central orchestration hub for all AI work requests. Manages the lifecycle of tasks
 * from submission through completion, coordinating with SubagentSupervisor for
 * intelligent routing and execution.
 * 
 * Flow: Submit → Analyze → Assign → Execute → Complete → Notify
 */

import crypto from 'crypto';
import { db } from '../../db';
import { createLogger } from '../../lib/logger';
import { scheduleNonBlocking } from '../../lib/scheduleNonBlocking';
import { 
  InsertAiWorkboardTask, 
  AiWorkboardTask,
} from '@shared/schema';
import { tokenManager } from '../../services/billing/tokenManager';
import { eq, and, desc, asc, sql, inArray } from 'drizzle-orm';
import { subagentSupervisor } from './subagentSupervisor';
import { publishPlatformUpdate } from '../platformEventBus';
import { subagentBanker, type CreditQuote, type CreditReservation } from './subagentBanker';
import { aiWorkboardTasks } from '@shared/schema';

export interface WorkboardSubmission {
  workspaceId: string;
  userId: string;
  requestType: 'voice_command' | 'chat' | 'direct_api' | 'automation' | 'escalation' | 'system';
  requestContent: string;
  requestMetadata?: Record<string, unknown>;
  priority?: 'critical' | 'high' | 'normal' | 'low' | 'scheduled';
  notifyVia?: string[];
  parentTaskId?: string;
  executionMode?: 'normal' | 'trinity_fast';
  fastModeRequestedBy?: 'trinity' | 'voice' | 'api';
}

// Trinity Fast Mode configuration
const FAST_MODE_CONFIG = {
  creditMultiplier: 2.0,        // 2x credits for fast mode
  maxParallelTasks: 4,          // Max concurrent fast mode tasks per workspace
  priorityBoost: true,          // Fast mode tasks get priority processing
  minCreditsRequired: 10,       // Minimum credits to use fast mode
};

export interface WorkboardTaskResult {
  success: boolean;
  data?: any;
  summary?: string;
  error?: string;
}

export type TaskStatus = 'pending' | 'analyzing' | 'assigned' | 'in_progress' | 'awaiting_approval' | 'completed' | 'failed' | 'cancelled' | 'escalated';

const log = createLogger('WorkboardService');

class WorkboardService {
  private static instance: WorkboardService;
  private processingTasks: Set<string> = new Set();

  private constructor() {
    log.info('[WorkboardService] Initializing AI Brain Workboard...');
  }

  static getInstance(): WorkboardService {
    if (!WorkboardService.instance) {
      WorkboardService.instance = new WorkboardService();
    }
    return WorkboardService.instance;
  }

  /**
   * Submit a new work request to the workboard
   * Supports both normal and Trinity Fast Mode execution
   * Uses SubagentBanker for credit pre-authorization (simulate → quote → reserve)
   */
  async submitTask(submission: WorkboardSubmission): Promise<AiWorkboardTask> {
    const executionMode = submission.executionMode || 'normal';
    let isFastMode = executionMode === 'trinity_fast';

    log.info('[WorkboardService] Submitting new task:', {
      workspaceId: submission.workspaceId,
      userId: submission.userId,
      requestType: submission.requestType,
      contentLength: submission.requestContent.length,
      executionMode,
      fastModeRequestedBy: submission.fastModeRequestedBy
    });

    // Use SubagentBanker for credit pre-authorization
    let fastModeCredits = 0;
    let creditReservation: CreditReservation | undefined;
    
    // Simulate workload to estimate credits needed
    const simulation = await subagentBanker.simulateWorkload({
      taskType: submission.requestType === 'chat' ? 'chat' : 'automation',
      content: submission.requestContent,
      executionMode: isFastMode ? 'turbo' : 'normal',
      workspaceId: submission.workspaceId,
      userId: submission.userId
    });
    
    if (isFastMode) {
      // Generate quote and check if user can proceed
      const quote = await subagentBanker.generateQuote({
        workspaceId: submission.workspaceId,
        userId: submission.userId,
        simulation
      });
      
      if (!quote.canProceed) {
        log.info('[WorkboardService] Insufficient credits for fast mode, need', simulation.totalCredits, 'have', quote.currentBalance);
        submission.executionMode = 'normal';
        isFastMode = false;
      } else {
        // Reserve credits atomically
        const reserveResult = await subagentBanker.reserveCredits({ quoteId: quote.quoteId });
        if (reserveResult.success && reserveResult.reservation) {
          creditReservation = reserveResult.reservation;
          fastModeCredits = simulation.totalCredits;
          log.info('[WorkboardService] Fast mode credits reserved:', fastModeCredits, 'reservation:', creditReservation.reservationId);
        } else {
          log.info('[WorkboardService] Credit reservation failed:', reserveResult.error);
          submission.executionMode = 'normal';
          isFastMode = false;
        }
      }
    }

    // Fast mode gets priority boost
    const priority = isFastMode && FAST_MODE_CONFIG.priorityBoost 
      ? 'high' 
      : (submission.priority || 'normal');

    const taskData: InsertAiWorkboardTask = {
      workspaceId: submission.workspaceId,
      userId: submission.userId,
      requestType: submission.requestType,
      requestContent: submission.requestContent,
      requestMetadata: {
        ...submission.requestMetadata,
        executionMode: submission.executionMode || 'normal',
        creditReservationId: creditReservation?.reservationId,
        estimatedCredits: simulation.totalCredits,
      },
      priority,
      notifyVia: submission.notifyVia || ['trinity'],
      parentTaskId: submission.parentTaskId,
      status: 'pending',
      executionMode: submission.executionMode || 'normal',
      fastModeCredits: isFastMode ? fastModeCredits : 0,
      fastModeRequestedBy: submission.fastModeRequestedBy,
      statusHistory: [{ 
        status: 'pending', 
        timestamp: new Date().toISOString(), 
        actor: 'system',
        details: { executionMode: submission.executionMode || 'normal', reservationId: creditReservation?.reservationId }
      }]
    };

    const [task] = await db.insert(aiWorkboardTasks)
      .values(taskData)
      .returning();

    log.info('[WorkboardService] Task created:', task.id, 'mode:', executionMode);

    // Process task asynchronously - fast mode uses parallel processing
    if (isFastMode) {
      setImmediate(() => {
        this.processTaskFastMode(task.id).catch(err => {
          log.error('[WorkboardService] Fast mode processing error:', err);
        });
      });
    } else {
      setImmediate(() => {
        this.processTask(task.id).catch(err => {
          log.error('[WorkboardService] Background processing error:', err);
        });
      });
    }

    return task;
  }

  /**
   * Check if workspace has sufficient credits for fast mode
   */
  private async checkFastModeCredits(workspaceId: string, requiredCredits?: number): Promise<{ hasCredits: boolean; balance: number }> {
    try {
      const balance = await tokenManager.getBalance(workspaceId);
      const minRequired = requiredCredits ?? FAST_MODE_CONFIG.minCreditsRequired;
      const hasCredits = balance >= minRequired;

      log.info('[WorkboardService] Credit check:', { workspaceId, balance, required: minRequired, hasCredits });
      return { hasCredits, balance };
    } catch (error) {
      log.error('[WorkboardService] Credit check error:', error);
      return { hasCredits: false, balance: 0 };
    }
  }

  /**
   * Process task using Trinity Fast Mode (parallel execution)
   */
  private async processTaskFastMode(taskId: string): Promise<void> {
    if (this.processingTasks.has(taskId)) {
      log.info('[WorkboardService] Fast mode task already processing:', taskId);
      return;
    }

    this.processingTasks.add(taskId);
    log.info('[WorkboardService] Starting FAST MODE processing:', taskId);

    try {
      const [task] = await db.select()
        .from(aiWorkboardTasks)
        .where(eq(aiWorkboardTasks.id, taskId))
        .limit(1);

      if (!task) {
        log.error('[WorkboardService] Fast mode task not found:', taskId);
        return;
      }

      // Update status to analyzing
      await this.updateTaskStatus(taskId, 'analyzing', 'system');

      // Use SubagentSupervisor with parallel dispatch
      const analysisResult = await subagentSupervisor.analyzeRequest({
        content: (task as any).requestContent,
        type: (task as any).requestType,
        workspaceId: task.workspaceId,
        userId: (task as any).userId,
        executionMode: 'trinity_fast'
      });

      // Update task with analysis
      await db.update(aiWorkboardTasks)
        .set({
          intent: analysisResult.intent,
          category: analysisResult.category,
          confidence: String(analysisResult.confidence),
          assignedAgentId: analysisResult.agentId,
          assignedAgentName: analysisResult.agentName,
          estimatedTokens: analysisResult.estimatedTokens,
          status: 'assigned',
          statusHistory: sql`${(aiWorkboardTasks as any).statusHistory} || ${JSON.stringify([{
            status: 'assigned',
            timestamp: new Date().toISOString(),
            actor: 'system',
            details: { 
              agentId: analysisResult.agentId,
              executionMode: 'trinity_fast'
            }
          }])}::jsonb`,
          updatedAt: new Date()
        })
        .where(eq(aiWorkboardTasks.id, taskId));

      // Get credit reservation ID from task metadata
      const metadata = (task as any).requestMetadata as Record<string, any> || {};
      const reservationId = metadata.creditReservationId;
      const estimatedCredits = metadata.estimatedCredits || Math.ceil((analysisResult.estimatedTokens || 10) * FAST_MODE_CONFIG.creditMultiplier);

      // Execute using parallel dispatch
      await this.updateTaskStatus(taskId, 'in_progress', 'system');
      const startTime = Date.now();

      const result = await subagentSupervisor.executeFastModeParallel({
        agentId: analysisResult.agentId,
        taskId,
        content: (task as any).requestContent,
        workspaceId: task.workspaceId,
        userId: (task as any).userId,
        context: metadata
      });

      const executionTime = Date.now() - startTime;
      log.info('[WorkboardService] Fast mode execution completed in', executionTime, 'ms');

      // Consume reserved credits via SubagentBanker
      let creditsDeducted = 0;
      if (reservationId) {
        const consumeResult = await subagentBanker.consumeReservation({
          reservationId,
          actualCredits: estimatedCredits,
          taskId,
          success: result.success
        });
        
        if (consumeResult.success) {
          creditsDeducted = consumeResult.creditsDeducted;
          log.info('[WorkboardService] Credits consumed via SubagentBanker:', creditsDeducted);
        } else {
          log.warn('[WorkboardService] Credit consumption failed:', consumeResult.error);
        }
      } else {
        // Legacy tasks without reservation - use directDeduct with proper refund on failure
        const deductResult = await subagentBanker.directDeduct({
          workspaceId: task.workspaceId,
          userId: (task as any).userId,
          credits: estimatedCredits,
          actionType: 'fast_mode_task',
          actionId: taskId,
          description: `Fast mode task: ${taskId.substring(0, 8)}`
        });
        
        if (deductResult.success) {
          creditsDeducted = estimatedCredits;
          
          // Refund if task failed
          if (!result.success) {
            await subagentBanker.refillCredits({
              workspaceId: task.workspaceId,
              userId: (task as any).userId,
              credits: estimatedCredits,
              source: 'refund',
              description: `Refund for failed fast mode task: ${taskId.substring(0, 8)}`
            });
            creditsDeducted = 0;
            log.info('[WorkboardService] Refunded credits for failed legacy task');
          }
        }
      }

      // Update fast mode credits on task
      await db.update(aiWorkboardTasks)
        .set({ fastModeCredits: creditsDeducted, creditsDeducted: creditsDeducted > 0 })
        .where(eq(aiWorkboardTasks.id, taskId));

      // Complete task
      await db.update(aiWorkboardTasks)
        .set({
          status: result.success ? 'completed' : 'failed',
          result: result.data || {},
          resultSummary: result.summary,
          errorMessage: result.error || null,
          actualTokens: estimatedCredits,
          completedAt: new Date(),
          statusHistory: sql`${(aiWorkboardTasks as any).statusHistory} || ${JSON.stringify([{
            status: result.success ? 'completed' : 'failed',
            timestamp: new Date().toISOString(),
            actor: analysisResult.agentId,
            details: { 
              executionTime,
              executionMode: 'trinity_fast',
              creditsDeducted
            }
          }])}::jsonb`,
          updatedAt: new Date()
        })
        .where(eq(aiWorkboardTasks.id, taskId));

      // Send completion notification
      await this.sendCompletionNotification(taskId, result);

    } catch (error) {
      log.error('[WorkboardService] Fast mode processing error:', error);
      
      // Release reservation on error
      const [task] = await db.select()
        .from(aiWorkboardTasks)
        .where(eq(aiWorkboardTasks.id, taskId))
        .limit(1);
      
      if (task) {
        const metadata = (task as any).requestMetadata as Record<string, any> || {};
        const reservationId = metadata.creditReservationId;
        if (reservationId) {
          await subagentBanker.consumeReservation({
            reservationId,
            taskId,
            success: false
          });
          log.info('[WorkboardService] Released reservation on error:', reservationId);
        }
      }
      
      await this.updateTaskStatus(taskId, 'failed', 'system');
      await db.update(aiWorkboardTasks)
        .set({ errorMessage: String(error) })
        .where(eq(aiWorkboardTasks.id, taskId));
    } finally {
      this.processingTasks.delete(taskId);
    }
  }

  /**
   * Process a pending task through the orchestration pipeline
   */
  async processTask(taskId: string): Promise<void> {
    if (this.processingTasks.has(taskId)) {
      log.info('[WorkboardService] Task already being processed:', taskId);
      return;
    }

    this.processingTasks.add(taskId);

    try {
      const [task] = await db.select()
        .from(aiWorkboardTasks)
        .where(eq(aiWorkboardTasks.id, taskId))
        .limit(1);

      if (!task) {
        log.error('[WorkboardService] Task not found:', taskId);
        return;
      }

      if (task.status !== 'pending') {
        log.info('[WorkboardService] Task not in pending state:', taskId, task.status);
        return;
      }

      // Step 1: Update to analyzing
      await this.updateTaskStatus(taskId, 'analyzing', 'system');

      // Step 2: Analyze and route via SubagentSupervisor
      const routingResult = await subagentSupervisor.routeVoiceCommand({
        transcript: (task as any).requestContent,
        userId: (task as any).userId,
        workspaceId: task.workspaceId,
        context: {
          source: (task as any).requestType,
          timestamp: task.createdAt?.toISOString() || new Date().toISOString(),
          platform: (task as any).requestMetadata?.platform || 'web'
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
          statusHistory: sql`${(aiWorkboardTasks as any).statusHistory} || ${JSON.stringify([{
            status: 'assigned',
            timestamp: new Date().toISOString(),
            actor: 'SubagentSupervisor',
            details: { agent: routingResult.assignedAgent }
          }])}::jsonb`,
          updatedAt: new Date()
        })
        .where(eq(aiWorkboardTasks.id, taskId));

      // Step 4: Deduct credits
      await this.recordUsage(task.workspaceId, (task as any).userId, routingResult.estimatedTokens, taskId);

      // Step 5: Update to in_progress
      await this.updateTaskStatus(taskId, 'in_progress', routingResult.assignedAgent);

      // Step 6: Execute task via AI Brain
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
          statusHistory: sql`${(aiWorkboardTasks as any).statusHistory} || ${JSON.stringify([{
            status: result.success ? 'completed' : 'failed',
            timestamp: new Date().toISOString(),
            actor: routingResult.assignedAgent
          }])}::jsonb`,
          updatedAt: new Date()
        })
        .where(eq(aiWorkboardTasks.id, taskId));

      // Step 8: Send notifications
      await this.sendCompletionNotification(taskId, result);

      log.info('[WorkboardService] Task completed:', taskId, result.success ? 'SUCCESS' : 'FAILED');

    } catch (error: any) {
      log.error('[WorkboardService] Error processing task:', taskId, error);
      
      await db.update(aiWorkboardTasks)
        .set({
          status: 'failed',
          errorMessage: (error instanceof Error ? error.message : String(error)) || 'Unknown error',
          // @ts-expect-error — TS migration: fix in refactoring sprint
          statusHistory: sql`${(aiWorkboardTasks as any).statusHistory} || ${JSON.stringify([{
            status: 'failed',
            timestamp: new Date().toISOString(),
            actor: 'system',
            error: (error instanceof Error ? error.message : String(error))
          }])}::jsonb`,
          updatedAt: new Date()
        })
        .where(eq(aiWorkboardTasks.id, taskId));

    } finally {
      this.processingTasks.delete(taskId);
    }
  }

  /**
   * Execute the actual task via the assigned subagent using AI Brain
   */
  private async executeTask(
    task: AiWorkboardTask, 
    routing: { assignedAgent: string; estimatedTokens: number; confidence: number }
  ): Promise<WorkboardTaskResult> {
    try {
      const { geminiClient } = await import('./providers/geminiClient');
      
      // Build agent-specific system prompt
      const agentSystemPrompts: Record<string, string> = {
        'SchedulingAgent': 'You are a scheduling assistant for a workforce management platform. Help users create, modify, and manage employee schedules and shifts. Be concise and action-oriented.',
        'PayrollAgent': 'You are a payroll assistant for a workforce management platform. Help users with payroll calculations, pay runs, and compensation queries. Always be precise with numbers.',
        'BillingAgent': 'You are a billing assistant for a workforce management platform. Help users with invoices, payments, and client billing. Be clear about amounts and deadlines.',
        'HRAgent': 'You are an HR assistant for a workforce management platform. Help users with employee records, onboarding, and team management. Be helpful and professional.',
        'AnalyticsAgent': 'You are an analytics assistant for a workforce management platform. Help users understand workforce metrics, generate reports, and gain insights from data.',
        'SupportAgent': 'You are a support assistant for a workforce management platform. Help users troubleshoot issues and find answers to their questions.',
        'ComplianceAgent': 'You are a compliance assistant for a workforce management platform. Help users with certifications, labor law compliance, and regulatory requirements.',
        'TimeTrackingAgent': 'You are a time tracking assistant for a workforce management platform. Help users with clock-in/out, timesheets, and attendance records.',
        'GeneralAssistant': 'You are Trinity, an AI assistant for a workforce management platform called CoAIleague. Help users with any workforce management tasks. Be helpful, professional, and action-oriented.'
      };

      const systemPrompt = agentSystemPrompts[routing.assignedAgent] || agentSystemPrompts['GeneralAssistant'];
      
      // Get workspace context if available
      let contextInfo = '';
      if (task.workspaceId) {
        try {
          const { workspaces } = await import('@shared/schema');
          const [workspace] = await db.select()
            .from(workspaces)
            .where(eq(workspaces.id, task.workspaceId))
            .limit(1);
          if (workspace) {
            contextInfo = `\n\nWorkspace: ${workspace.name} (${workspace.businessCategory || 'general business'})`;
          }
        } catch (e) {
          // Context is optional, continue without it
        }
      }

      // Generate AI response
      const response = await geminiClient.generate({
        systemPrompt: `${systemPrompt}${contextInfo}\n\nRespond conversationally as if speaking to the user. Be concise (1-3 sentences). If you need more information to complete the task, ask a clarifying question. If you can provide a direct answer or take action, do so.`,
        userMessage: task.requestContent,
        temperature: 0.7,
        maxTokens: 300,
        workspaceId: task.workspaceId,
        featureKey: 'workboard_ai_response',
      });

      if (!(response as any).success || !response.text) {
        return {
          success: false,
          error: (response as any).error || 'Failed to generate AI response',
          data: {
            agentId: routing.assignedAgent,
            processedAt: new Date().toISOString()
          }
        };
      }

      log.info('[WorkboardService] AI response generated:', {
        agent: routing.assignedAgent,
        responseLength: response.text.length
      });

      return {
        success: true,
        data: {
          response: response.text,
          agentId: routing.assignedAgent,
          processedAt: new Date().toISOString(),
          tokensUsed: response.tokensUsed || routing.estimatedTokens
        },
        summary: `Task processed by ${routing.assignedAgent} with ${Math.round(routing.confidence * 100)}% confidence.`
      };

    } catch (error: any) {
      log.error('[WorkboardService] AI execution error:', error);
      
      // Fallback to basic response on error
      return {
        success: true,
        data: {
          response: `I received your request about "${task.requestContent.substring(0, 50)}..." but I'm having trouble processing it right now. Please try again or use the app directly.`,
          agentId: routing.assignedAgent,
          processedAt: new Date().toISOString(),
          fallback: true
        },
        summary: `Task processed with fallback response due to AI error.`
      };
    }
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
      statusHistory: sql`${(aiWorkboardTasks as any).statusHistory} || ${JSON.stringify([{
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

    log.info('[WorkboardService] Status changed:', taskId, status, actor);
  }

  /**
   * Record token usage for task execution.
   */
  private async recordUsage(
    workspaceId: string, 
    userId: string, 
    tokens: number,
    taskId: string
  ): Promise<boolean> {
    try {
      const result = await tokenManager.recordUsage({
        workspaceId,
        userId,
        featureKey: 'ai_general',
        featureName: 'Workboard Task',
        amountOverride: tokens,
        relatedEntityType: 'workboard_task',
        relatedEntityId: taskId,
        description: `Workboard task: ${taskId.substring(0, 8)}`,
      });

      if (!result.success) {
        log.info('[WorkboardService] Insufficient credits:', workspaceId, result.newBalance, tokens);
        return false;
      }

      // Mark credits deducted on task
      await db.update(aiWorkboardTasks)
        .set({ creditsDeducted: true })
        .where(eq(aiWorkboardTasks.id, taskId));

      return true;
    } catch (error) {
      log.error('[WorkboardService] Credit deduction error:', error);
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

    const notifyChannels = (task as any).notifyVia || ['trinity'];

    for (const channel of notifyChannels) {
      switch (channel) {
        case 'trinity':
          // Trinity mascot notification - log for now, integrate later
          log.info('[WorkboardService] Trinity notification:', {
            userId: (task as any).userId,
            type: result.success ? 'task_completed' : 'task_failed',
            message: result.summary
          });
          break;

        case 'websocket':
          // Real-time WebSocket update - log for now
          log.info('[WorkboardService] WebSocket broadcast:', {
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
            userId: (task as any).userId,
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

    if ((task.retryCount || 0) >= (task.maxRetries || 3)) {
      log.info('[WorkboardService] Max retries exceeded:', taskId);
      await this.escalateTask(taskId, 'Max retries exceeded');
      return false;
    }

    await db.update(aiWorkboardTasks)
      .set({
        status: 'pending',
        retryCount: (task.retryCount || 0) + 1,
        errorMessage: null,
        statusHistory: sql`${(aiWorkboardTasks as any).statusHistory} || ${JSON.stringify([{
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
        // @ts-expect-error — TS migration: fix in refactoring sprint
        statusHistory: sql`${(aiWorkboardTasks as any).statusHistory} || ${JSON.stringify([{
          status: 'escalated',
          timestamp: new Date().toISOString(),
          actor: 'system',
          reason
        }])}::jsonb`,
        updatedAt: new Date()
      })
      .where(eq(aiWorkboardTasks.id, taskId));

    log.info('[WorkboardService] Task escalated:', taskId, reason);
  }

  /**
   * Execute a voice command synchronously - Trinity ACTS immediately.
   * Uses credits because Trinity performs the action on behalf of the user.
   * Routes through proper Workboard pipeline for credit tracking and approvals.
   */
  async executeVoiceCommandSync(params: {
    transcript: string;
    userId: string;
    workspaceId?: string;
    executionMode?: 'normal' | 'trinity_fast';
  }): Promise<{
    success: boolean;
    taskId: string;
    response: string;
    assignedAgent: string;
    actionExecuted?: string;
    tokensUsed?: number;
    error?: string;
  }> {
    const { transcript, userId, workspaceId, executionMode = 'normal' } = params;
    
    if (!workspaceId) {
      log.warn('[WorkboardService] Voice command rejected — no workspaceId');
      return {
        success: false,
        taskId: crypto.randomUUID(),
        response: 'Workspace context is required to execute voice commands.',
        assignedAgent: 'none',
        error: 'Missing workspace context'
      };
    }

    log.info('[WorkboardService] Trinity executing voice command:', { userId, transcript: transcript.substring(0, 50) });

    const taskId = crypto.randomUUID();
    let taskCreated = false;

    try {
      const { subagentSupervisor } = await import('./subagentSupervisor');
      
      // Step 1: Route through subagent supervisor for proper agent selection + credit estimation
      const routingResult = await subagentSupervisor.routeVoiceCommand({
        transcript,
        userId,
        workspaceId,
        executionMode,
        context: { source: 'voice_sync', platform: 'mobile' }
      });

      // Step 2: Create task in database with proper agent assignment
      await db.insert(aiWorkboardTasks).values({
        id: taskId,
        workspaceId,
        userId,
        requestType: 'voice_command',
        requestContent: transcript,
        priority: executionMode === 'trinity_fast' ? 'high' : 'normal',
        status: 'in_progress',
        executionMode,
        assignedAgentId: routingResult.assignedAgent,
        estimatedTokens: routingResult.estimatedTokens,
        confidence: routingResult.confidence,
        requestMetadata: { 
          source: 'voice_sync', 
          platform: 'mobile', 
          inputMethod: 'voice',
          routedCategory: (routingResult as any).category
        },
        statusHistory: [{ status: 'in_progress', timestamp: new Date().toISOString(), actor: 'voice_command_sync' }],
        notifyVia: ['websocket'],
        createdAt: new Date(),
        updatedAt: new Date()
      });
      taskCreated = true;

      // Step 3: Deduct credits - Trinity uses credits for convenience
      const creditDeducted = await this.recordUsage(
        workspaceId, 
        userId, 
        routingResult.estimatedTokens, 
        taskId
      );

      if (!creditDeducted && workspaceId) {
        // Credit deduction failed - insufficient credits
        await db.update(aiWorkboardTasks)
          .set({
            status: 'failed',
            errorMessage: 'Insufficient credits for this action',
            // @ts-expect-error — TS migration: fix in refactoring sprint
            statusHistory: sql`${(aiWorkboardTasks as any).statusHistory} || ${JSON.stringify([{
              status: 'failed',
              timestamp: new Date().toISOString(),
              actor: 'credit_check',
              error: 'Insufficient credits'
            }])}::jsonb`,
            updatedAt: new Date()
          })
          .where(eq(aiWorkboardTasks.id, taskId));

        return {
          success: false,
          taskId,
          response: 'You don\'t have enough credits for this action. Please add more credits to continue.',
          assignedAgent: routingResult.assignedAgent,
          error: 'Insufficient credits'
        };
      }

      // Step 4: Execute task through proper pipeline
      const result = await this.executeTask(
        { 
          id: taskId, 
          workspaceId, 
          userId, 
          requestType: 'voice_command',
          requestContent: transcript,
          priority: executionMode === 'trinity_fast' ? 'high' : 'normal',
          executionMode,
          assignedAgent: routingResult.assignedAgent,
          estimatedTokens: routingResult.estimatedTokens,
          confidenceScore: routingResult.confidence
        } as any, 
        routingResult
      );

      // Step 4: Update task with result
      await db.update(aiWorkboardTasks)
        .set({
          status: result.success ? 'completed' : 'failed',
          result: result.data || {},
          resultSummary: result.summary,
          errorMessage: result.success ? null : result.error,
          actualTokens: result.data?.tokensUsed || routingResult.estimatedTokens,
          completedAt: new Date(),
          statusHistory: sql`${(aiWorkboardTasks as any).statusHistory} || ${JSON.stringify([{
            status: result.success ? 'completed' : 'failed',
            timestamp: new Date().toISOString(),
            actor: routingResult.assignedAgent
          }])}::jsonb`,
          updatedAt: new Date()
        })
        .where(eq(aiWorkboardTasks.id, taskId));

      const responseMessage = result.success 
        ? result.data?.response || result.summary || 'Done! I completed that for you.'
        : `I couldn't complete that: ${result.error || 'Unknown error'}`;

      log.info('[WorkboardService] Trinity action complete:', {
        taskId,
        agent: routingResult.assignedAgent,
        success: result.success
      });

      return {
        success: result.success,
        taskId,
        response: responseMessage,
        assignedAgent: routingResult.assignedAgent,
        actionExecuted: (routingResult as any).category,
        tokensUsed: result.data?.tokensUsed || routingResult.estimatedTokens,
        error: result.success ? undefined : result.error
      };

    } catch (error: any) {
      log.error('[WorkboardService] Trinity voice command error:', error);
      
      // Update task to failed if it was created
      if (taskCreated) {
        try {
          await db.update(aiWorkboardTasks)
            .set({
              status: 'failed',
              errorMessage: (error instanceof Error ? error.message : String(error)),
              // @ts-expect-error — TS migration: fix in refactoring sprint
              statusHistory: sql`${(aiWorkboardTasks as any).statusHistory} || ${JSON.stringify([{
                status: 'failed',
                timestamp: new Date().toISOString(),
                actor: 'voice_command_sync',
                error: (error instanceof Error ? error.message : String(error))
              }])}::jsonb`,
              updatedAt: new Date()
            })
            .where(eq(aiWorkboardTasks.id, taskId));
        } catch (dbError) {
          log.error('[WorkboardService] Failed to update task status:', dbError);
        }
      }

      return {
        success: false,
        taskId: taskCreated ? taskId : '',
        response: 'Sorry, I encountered an error executing your command. Please try again.',
        assignedAgent: 'GeneralAssistant',
        error: error.message
      };
    }
  }

  /**
   * Get tasks for a user with RBAC scope filtering
   * - scope 'admin': all workspace tasks
   * - scope 'manager': team tasks (same workspace)
   * - scope 'employee': own tasks only (default)
   */
  async getUserTasks(
    userId: string, 
    workspaceId: string, 
    options?: { 
      status?: TaskStatus[]; 
      priority?: string;
      limit?: number; 
      offset?: number;
      scope?: 'admin' | 'manager' | 'employee';
    }
  ): Promise<AiWorkboardTask[]> {
    const scope = options?.scope || 'employee';
    
    const conditions = [];
    
    if (scope === 'admin') {
      conditions.push(eq(aiWorkboardTasks.workspaceId, workspaceId));
    } else if (scope === 'manager') {
      conditions.push(eq(aiWorkboardTasks.workspaceId, workspaceId));
    } else {
      conditions.push(eq(aiWorkboardTasks.userId, userId));
      conditions.push(eq(aiWorkboardTasks.workspaceId, workspaceId));
    }
    
    if (options?.status && options.status.length > 0) {
      conditions.push(inArray(aiWorkboardTasks.status, options.status));
    }
    
    if (options?.priority) {
      conditions.push(eq(aiWorkboardTasks.priority, options.priority as any));
    }
    
    let query = db.select()
      .from(aiWorkboardTasks)
      .where(and(...conditions))
      .orderBy(desc(aiWorkboardTasks.createdAt));

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
        // @ts-expect-error — TS migration: fix in refactoring sprint
        statusHistory: sql`${(aiWorkboardTasks as any).statusHistory} || ${JSON.stringify([{
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
      stats.totalTokens += (task as any).actualTokens || (task as any).estimatedTokens || 0;
    }

    return stats;
  }
}

export const workboardService = WorkboardService.getInstance();

// ============================================================================
// AI BRAIN EVENT HELPER
// Helper for action endpoints to notify AI Brain of database changes
// This enables AI Brain to learn from platform operations and provide insights
// ============================================================================

export type DatabaseEventType = 
  | 'employee_created' | 'employee_updated' | 'employee_deleted'
  | 'shift_created' | 'shift_updated' | 'shift_deleted' | 'shift_assigned'
  | 'payroll_approved' | 'payroll_processed'
  | 'invoice_created' | 'invoice_approved' | 'invoice_sent'
  | 'timesheet_submitted' | 'timesheet_approved'
  | 'client_created' | 'client_updated'
  | 'workspace_settings_updated'
  | 'automation_triggered';

export interface DatabaseEvent {
  eventType: DatabaseEventType;
  workspaceId: string;
  userId: string;
  entityType: string;
  entityId: string;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Post a database event to AI Brain workboard for observability
 * This is a fire-and-forget operation - it logs the event asynchronously
 * and does not block the calling endpoint
 */
export async function postDatabaseEventToAIBrain(event: DatabaseEvent): Promise<void> {
  scheduleNonBlocking('ai-brain.db-event-log', async () => {
    await workboardService.submitTask({
      workspaceId: event.workspaceId,
      userId: event.userId,
      requestType: 'system',
      requestContent: `[DB_EVENT] ${event.eventType}: ${event.entityType}#${event.entityId}`,
      requestMetadata: {
        eventType: event.eventType,
        entityType: event.entityType,
        entityId: event.entityId,
        changes: event.changes,
        ...event.metadata,
        source: 'database_event',
        timestamp: new Date().toISOString(),
      },
      priority: 'low', // Background observability task
    });
    log.info(`[AIBrain] Database event logged: ${event.eventType} for ${event.entityType}#${event.entityId}`);
  });
}
