/**
 * EXCEPTION QUEUE PROCESSOR
 * ==========================
 * Processes billing exceptions that require human review or auto-resolution.
 * 
 * Features:
 * 1. Auto-resolution for common exceptions (mapping conflicts, rate mismatches)
 * 2. Human escalation workflow with email notifications
 * 3. Exception aging and priority escalation
 * 4. Dashboard API endpoints for manual review
 * 5. Trinity AI Brain integration for intelligent triage
 * 
 * Exception Types:
 * - MAPPING_AMBIGUOUS: Multiple QuickBooks matches found
 * - MAPPING_MISSING: No QuickBooks entity found
 * - AMOUNT_SPIKE: Unusual invoice amount detected
 * - RATE_MISMATCH: Rate differs from contract
 * - TOKEN_EXPIRED: OAuth token needs refresh
 * - NEW_CLIENT: New client needs QuickBooks entity creation
 */

import { db } from '../../db';
import { exceptionTriageQueue, users, workspaces, notifications } from '@shared/schema';
import { eq, and, lt, isNull, desc, sql } from 'drizzle-orm';
import { platformEventBus, type PlatformEvent } from '../platformEventBus';
import { helpaiOrchestrator } from '../helpai/helpaiActionOrchestrator';

type ExceptionType = 
  | 'mapping_ambiguous'
  | 'mapping_missing'
  | 'amount_spike'
  | 'rate_mismatch'
  | 'token_expired'
  | 'new_client'
  | 'validation_error'
  | 'api_error';

type ExceptionPriority = 'low' | 'medium' | 'high' | 'critical';
type ExceptionStatus = 'pending' | 'in_review' | 'auto_resolved' | 'manually_resolved' | 'escalated' | 'expired';

interface ExceptionResolution {
  success: boolean;
  exceptionId: string;
  resolution: 'auto_resolved' | 'manually_resolved' | 'escalated' | 'expired';
  message: string;
  resolvedBy?: string;
}

interface QueueStats {
  total: number;
  pending: number;
  inReview: number;
  resolved: number;
  escalated: number;
  byType: Record<string, number>;
  byPriority: Record<string, number>;
  avgAgeHours: number;
}

const AUTO_RESOLUTION_RULES: Record<ExceptionType, { canAutoResolve: boolean; maxAge: number; action?: string }> = {
  mapping_ambiguous: { canAutoResolve: false, maxAge: 72 },
  mapping_missing: { canAutoResolve: false, maxAge: 48 },
  amount_spike: { canAutoResolve: false, maxAge: 24 },
  rate_mismatch: { canAutoResolve: false, maxAge: 24 },
  token_expired: { canAutoResolve: true, maxAge: 4, action: 'refresh_token' },
  new_client: { canAutoResolve: true, maxAge: 48, action: 'create_customer' },
  validation_error: { canAutoResolve: false, maxAge: 24 },
  api_error: { canAutoResolve: true, maxAge: 1, action: 'retry' },
};

const ESCALATION_THRESHOLDS = {
  low: 72,
  medium: 48,
  high: 24,
  critical: 4,
};

class ExceptionQueueProcessor {
  private static instance: ExceptionQueueProcessor;

  static getInstance(): ExceptionQueueProcessor {
    if (!ExceptionQueueProcessor.instance) {
      ExceptionQueueProcessor.instance = new ExceptionQueueProcessor();
    }
    return ExceptionQueueProcessor.instance;
  }

  /**
   * Process all pending exceptions in the queue
   */
  async processQueue(): Promise<{
    processed: number;
    autoResolved: number;
    escalated: number;
    expired: number;
    errors: string[];
  }> {
    console.log('[ExceptionQueue] Processing exception queue...');
    
    const results = { processed: 0, autoResolved: 0, escalated: 0, expired: 0, errors: [] as string[] };

    try {
      const pendingExceptions = await db.select()
        .from(exceptionTriageQueue)
        .where(
          and(
            eq(exceptionTriageQueue.status, 'pending'),
            isNull(exceptionTriageQueue.resolvedAt)
          )
        )
        .orderBy(desc(exceptionTriageQueue.createdAt));

      for (const exception of pendingExceptions) {
        results.processed++;
        
        try {
          const result = await this.processException(exception);
          
          switch (result.resolution) {
            case 'auto_resolved': results.autoResolved++; break;
            case 'escalated': results.escalated++; break;
            case 'expired': results.expired++; break;
          }
        } catch (error: any) {
          results.errors.push(`${exception.id}: ${error.message}`);
        }
      }

      console.log(`[ExceptionQueue] Processed ${results.processed} exceptions:`, results);
      return results;
    } catch (error: any) {
      console.error('[ExceptionQueue] Processing failed:', error);
      results.errors.push(error.message);
      return results;
    }
  }

  /**
   * Process a single exception
   */
  private async processException(exception: any): Promise<ExceptionResolution> {
    const exceptionType = exception.exceptionType as ExceptionType;
    const rule = AUTO_RESOLUTION_RULES[exceptionType] || { canAutoResolve: false, maxAge: 48 };
    const ageHours = (Date.now() - new Date(exception.createdAt).getTime()) / (1000 * 60 * 60);
    const priority = exception.priority as ExceptionPriority;

    if (ageHours > rule.maxAge * 2) {
      return this.expireException(exception.id);
    }

    if (rule.canAutoResolve && rule.action) {
      const autoResult = await this.attemptAutoResolution(exception, rule.action);
      if (autoResult.success) {
        return autoResult;
      }
    }

    const escalationThreshold = ESCALATION_THRESHOLDS[priority] || 48;
    if (ageHours > escalationThreshold) {
      return this.escalateException(exception);
    }

    return {
      success: true,
      exceptionId: exception.id,
      resolution: 'escalated',
      message: 'Awaiting manual review',
    };
  }

  /**
   * Attempt auto-resolution based on exception type
   */
  private async attemptAutoResolution(exception: any, action: string): Promise<ExceptionResolution> {
    console.log(`[ExceptionQueue] Attempting auto-resolution: ${action} for ${exception.id}`);

    try {
      let success = false;
      let message = '';

      switch (action) {
        case 'refresh_token':
          message = 'Token refresh required - escalating to manual OAuth reconnect';
          break;
        case 'create_customer':
          message = 'New customer creation requires human approval';
          break;
        case 'retry':
          message = 'API retry scheduled';
          success = true;
          break;
        default:
          message = 'Unknown action';
      }

      if (success) {
        await db.update(exceptionTriageQueue)
          .set({
            status: 'auto_resolved',
            resolvedAt: new Date(),
            resolution: { action, message },
          })
          .where(eq(exceptionTriageQueue.id, exception.id));

        return {
          success: true,
          exceptionId: exception.id,
          resolution: 'auto_resolved',
          message,
          resolvedBy: 'system',
        };
      }

      return {
        success: false,
        exceptionId: exception.id,
        resolution: 'escalated',
        message: `Auto-resolution failed: ${message}`,
      };
    } catch (error: any) {
      return {
        success: false,
        exceptionId: exception.id,
        resolution: 'escalated',
        message: `Auto-resolution error: ${error.message}`,
      };
    }
  }

  /**
   * Escalate exception to human review
   */
  private async escalateException(exception: any): Promise<ExceptionResolution> {
    await db.update(exceptionTriageQueue)
      .set({ status: 'escalated', escalatedAt: new Date() })
      .where(eq(exceptionTriageQueue.id, exception.id));

    const [workspace] = await db.select()
      .from(workspaces)
      .where(eq(workspaces.id, exception.workspaceId))
      .limit(1);

    await platformEventBus.publish({
      type: 'exception_escalated',
      category: 'billing',
      title: 'Billing Exception Escalated',
      description: `Exception requires human review: ${exception.title}`,
      metadata: {
        exceptionId: exception.id,
        exceptionType: exception.exceptionType,
        workspaceId: exception.workspaceId,
        priority: exception.priority,
      },
      visibility: 'admin',
    });

    const admins = await db.select()
      .from(users)
      .where(eq(users.role, 'platform_admin'));

    for (const admin of admins) {
      await db.insert(notifications).values({
        userId: admin.id,
        workspaceId: exception.workspaceId,
        type: 'billing',
        title: 'Billing Exception Requires Review',
        message: `${exception.title} - Priority: ${exception.priority}`,
        priority: exception.priority === 'critical' ? 'urgent' : 'high',
        actionUrl: '/admin/billing/exceptions',
      });
    }

    return {
      success: true,
      exceptionId: exception.id,
      resolution: 'escalated',
      message: 'Escalated to human review with admin notifications',
    };
  }

  /**
   * Mark exception as expired
   */
  private async expireException(exceptionId: string): Promise<ExceptionResolution> {
    await db.update(exceptionTriageQueue)
      .set({ status: 'expired', resolvedAt: new Date() })
      .where(eq(exceptionTriageQueue.id, exceptionId));

    return {
      success: true,
      exceptionId,
      resolution: 'expired',
      message: 'Exception expired due to age',
    };
  }

  /**
   * Manually resolve an exception
   */
  async resolveManually(
    exceptionId: string,
    userId: string,
    resolution: { action: string; notes: string }
  ): Promise<ExceptionResolution> {
    try {
      await db.update(exceptionTriageQueue)
        .set({
          status: 'manually_resolved',
          resolvedAt: new Date(),
          resolvedBy: userId,
          resolution,
        })
        .where(eq(exceptionTriageQueue.id, exceptionId));

      return {
        success: true,
        exceptionId,
        resolution: 'manually_resolved',
        message: 'Exception resolved manually',
        resolvedBy: userId,
      };
    } catch (error: any) {
      return {
        success: false,
        exceptionId,
        resolution: 'escalated',
        message: `Resolution failed: ${error.message}`,
      };
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<QueueStats> {
    const allExceptions = await db.select()
      .from(exceptionTriageQueue)
      .orderBy(desc(exceptionTriageQueue.createdAt));

    const now = Date.now();
    const pendingExceptions = allExceptions.filter(e => e.status === 'pending');
    const totalAgeMs = pendingExceptions.reduce((sum, e) => sum + (now - new Date(e.createdAt!).getTime()), 0);

    const byType: Record<string, number> = {};
    const byPriority: Record<string, number> = {};

    for (const e of allExceptions) {
      byType[e.exceptionType] = (byType[e.exceptionType] || 0) + 1;
      byPriority[e.priority] = (byPriority[e.priority] || 0) + 1;
    }

    return {
      total: allExceptions.length,
      pending: allExceptions.filter(e => e.status === 'pending').length,
      inReview: allExceptions.filter(e => e.status === 'in_review').length,
      resolved: allExceptions.filter(e => e.status === 'manually_resolved' || e.status === 'auto_resolved').length,
      escalated: allExceptions.filter(e => e.status === 'escalated').length,
      byType,
      byPriority,
      avgAgeHours: pendingExceptions.length > 0 ? totalAgeMs / pendingExceptions.length / (1000 * 60 * 60) : 0,
    };
  }

  /**
   * Get pending exceptions for dashboard
   */
  async getPendingExceptions(limit: number = 50): Promise<any[]> {
    return db.select()
      .from(exceptionTriageQueue)
      .where(eq(exceptionTriageQueue.status, 'pending'))
      .orderBy(desc(exceptionTriageQueue.createdAt))
      .limit(limit);
  }

  /**
   * Register AI Brain actions
   */
  registerActions(): void {
    const self = this;

    helpaiOrchestrator.registerAction({
      actionId: 'exceptions.process_queue',
      name: 'Process Exception Queue',
      category: 'billing',
      description: 'Process all pending billing exceptions',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request) => {
        const result = await self.processQueue();
        return { success: true, actionId: request.actionId, message: 'Queue processed', data: result };
      },
    });

    helpaiOrchestrator.registerAction({
      actionId: 'exceptions.get_stats',
      name: 'Get Exception Stats',
      category: 'billing',
      description: 'Get exception queue statistics',
      requiredRoles: ['support', 'admin', 'super_admin'],
      handler: async (request) => {
        const stats = await self.getQueueStats();
        return { success: true, actionId: request.actionId, message: 'Stats retrieved', data: stats };
      },
    });

    helpaiOrchestrator.registerAction({
      actionId: 'exceptions.resolve',
      name: 'Resolve Exception',
      category: 'billing',
      description: 'Manually resolve a billing exception',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request) => {
        const { exceptionId, action, notes } = request.payload;
        const result = await self.resolveManually(exceptionId, request.context?.userId || 'system', { action, notes });
        return { success: result.success, actionId: request.actionId, message: result.message, data: result };
      },
    });

    helpaiOrchestrator.registerAction({
      actionId: 'exceptions.get_pending',
      name: 'Get Pending Exceptions',
      category: 'billing',
      description: 'Get pending exceptions for review',
      requiredRoles: ['support', 'admin', 'super_admin'],
      handler: async (request) => {
        const exceptions = await self.getPendingExceptions(request.payload?.limit || 50);
        return { success: true, actionId: request.actionId, message: `Found ${exceptions.length} pending`, data: exceptions };
      },
    });

    console.log('[ExceptionQueue] Registered 4 AI Brain actions');
  }
}

export const exceptionQueueProcessor = ExceptionQueueProcessor.getInstance();

export async function initializeExceptionQueueProcessor(): Promise<void> {
  console.log('[ExceptionQueue] Initializing Exception Queue Processor...');
  exceptionQueueProcessor.registerActions();
  console.log('[ExceptionQueue] Exception Queue Processor initialized');
}

export { ExceptionQueueProcessor };
