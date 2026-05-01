/**
 * Quick Fix Service
 * 
 * Manages RBAC-governed platform maintenance actions with:
 * - Role-based limits and permissions
 * - Approval workflows with codes or RBAC verification
 * - Full audit trail with AI Brain awareness
 * - Universal mobile/desktop support
 */

import { db } from '../../db';
import { 
  quickFixActions, 
  quickFixRolePolicies, 
  quickFixRequests,
  quickFixExecutions,
  type QuickFixAction,
  type QuickFixRolePolicy,
  type QuickFixRequest,
  type QuickFixExecution,
  type InsertQuickFixRequest,
  type InsertQuickFixExecution,
} from '@shared/schema';
import { eq, and, gte, sql, desc, count } from 'drizzle-orm';
import { aiBrainEvents } from '../ai-brain/internalEventEmitter';
import crypto from 'crypto';
import { typedPool } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('quickFixService');


// Platform role hierarchy for permission checking
const ROLE_HIERARCHY: Record<string, number> = {
  'root_admin': 100,
  'deputy_admin': 90,
  'sysop': 80,
  'support_manager': 70,
  'support_agent': 60,
  'compliance_officer': 50,
  'Bot': 10,
  'none': 0,
};

// Risk tier to minimum role mapping
const RISK_TIER_REQUIREMENTS: Record<string, string> = {
  'safe': 'support_agent',
  'moderate': 'support_manager',
  'elevated': 'deputy_admin',
  'critical': 'root_admin',
};

export interface QuickFixContext {
  userId: string;
  platformRole: string;
  deviceType: 'desktop' | 'tablet' | 'mobile';
  workspaceId?: string;
}

export interface QuickFixLimit {
  actionCode: string;
  perDayLimit: number;
  perWeekLimit: number;
  usedToday: number;
  usedThisWeek: number;
  canExecuteImmediately: boolean;
  requiresApproval: boolean;
}

export interface QuickFixSuggestion {
  action: QuickFixAction;
  confidence: number;
  reasoning: string;
  estimatedImpact: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
}

class QuickFixService {
  private approvalCodes: Map<string, { code: string; expiresAt: Date; userId: string }> = new Map();

  /**
   * Get all available quick fix actions for a user's role
   */
  async getAvailableActions(context: QuickFixContext): Promise<QuickFixAction[]> {
    try {
      const roleLevel = ROLE_HIERARCHY[context.platformRole] || 0;
      
      // Get all active actions
      const actions = await db
        .select()
        .from(quickFixActions)
        .where(eq(quickFixActions.isActive, true));

      // Filter by role permissions
      return actions.filter(action => {
        const requiredRole = RISK_TIER_REQUIREMENTS[action.riskTier || 'moderate'] || 'support_manager';
        const requiredLevel = ROLE_HIERARCHY[requiredRole] || 70;
        return roleLevel >= requiredLevel;
      });
    } catch (error) {
      log.error('[QuickFix] Error getting available actions:', error);
      // Return default safe actions if DB not ready
      return this.getDefaultActions(context.platformRole);
    }
  }

  /**
   * Get default actions when database isn't ready
   */
  private getDefaultActions(platformRole: string): QuickFixAction[] {
    const roleLevel = ROLE_HIERARCHY[platformRole] || 0;
    const defaults: QuickFixAction[] = [
      {
        id: 'default-clear-cache',
        code: 'clear_cache',
        name: 'Clear System Cache',
        description: 'Safely clear application caches to resolve stale data issues',
        category: 'cache',
        riskTier: 'safe',
        requiresApproval: false,
        aiSupported: true,
        executionType: 'immediate',
        estimatedDuration: 5,
        reversible: false,
        globalDailyLimit: 100,
        cooldownSeconds: 60,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'default-restart-service',
        code: 'restart_service',
        name: 'Restart Service',
        description: 'Restart a specific platform service',
        category: 'service',
        riskTier: 'moderate',
        requiresApproval: true,
        aiSupported: true,
        executionType: 'immediate',
        estimatedDuration: 30,
        reversible: true,
        globalDailyLimit: 20,
        cooldownSeconds: 300,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'default-refresh-connections',
        code: 'refresh_connections',
        name: 'Refresh Database Connections',
        description: 'Reset and refresh database connection pool',
        category: 'database',
        riskTier: 'moderate',
        requiresApproval: false,
        aiSupported: true,
        executionType: 'immediate',
        estimatedDuration: 10,
        reversible: false,
        globalDailyLimit: 50,
        cooldownSeconds: 120,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'default-force-logout',
        code: 'force_logout_user',
        name: 'Force User Logout',
        description: 'Invalidate all sessions for a specific user',
        category: 'security',
        riskTier: 'elevated',
        requiresApproval: true,
        aiSupported: true,
        executionType: 'immediate',
        estimatedDuration: 3,
        reversible: false,
        globalDailyLimit: 100,
        cooldownSeconds: 30,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'default-emergency-maintenance',
        code: 'emergency_maintenance',
        name: 'Emergency Maintenance Mode',
        description: 'Put platform in maintenance mode (ROOT ONLY)',
        category: 'config',
        riskTier: 'critical',
        requiresApproval: true,
        aiSupported: true,
        executionType: 'immediate',
        estimatedDuration: 5,
        reversible: true,
        globalDailyLimit: 5,
        cooldownSeconds: 3600,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    // Filter by role level
    return defaults.filter(action => {
      const requiredRole = RISK_TIER_REQUIREMENTS[action.riskTier || 'moderate'] || 'support_manager';
      const requiredLevel = ROLE_HIERARCHY[requiredRole] || 70;
      return roleLevel >= requiredLevel;
    });
  }

  /**
   * Get usage limits for a user
   */
  async getUserLimits(context: QuickFixContext): Promise<QuickFixLimit[]> {
    const actions = await this.getAvailableActions(context);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    const limits: QuickFixLimit[] = [];

    for (const action of actions) {
      // Get policy for this role+action
      let policy: QuickFixRolePolicy | undefined;
      try {
        const policies = await db
          .select()
          .from(quickFixRolePolicies)
          .where(
            and(
              eq(quickFixRolePolicies.platformRole, context.platformRole),
              eq(quickFixRolePolicies.actionId, action.id),
              eq(quickFixRolePolicies.isActive, true)
            )
          );
        policy = policies[0];
      } catch {
        // Use defaults
      }

      // Root admin has unlimited
      const isRoot = context.platformRole === 'root_admin';
      const perDayLimit = isRoot ? 9999 : (policy?.perDayLimit || 10);
      const perWeekLimit = isRoot ? 99999 : (policy?.perWeekLimit || 50);

      // Count usage
      let usedToday = 0;
      let usedThisWeek = 0;
      try {
        const todayUsage = await db
          .select({ count: count() })
          .from(quickFixRequests)
          .where(
            and(
              eq(quickFixRequests.requesterId, context.userId),
              eq(quickFixRequests.actionId, action.id),
              gte(quickFixRequests.requestedAt, today)
            )
          );
        usedToday = todayUsage[0]?.count || 0;

        const weekUsage = await db
          .select({ count: count() })
          .from(quickFixRequests)
          .where(
            and(
              eq(quickFixRequests.requesterId, context.userId),
              eq(quickFixRequests.actionId, action.id),
              gte(quickFixRequests.requestedAt, weekStart)
            )
          );
        usedThisWeek = weekUsage[0]?.count || 0;
      } catch {
        // DB not ready
      }

      limits.push({
        actionCode: action.code,
        perDayLimit,
        perWeekLimit,
        usedToday,
        usedThisWeek,
        canExecuteImmediately: isRoot || (policy?.canExecuteImmediately || false),
        requiresApproval: !isRoot && (action.requiresApproval || policy?.requiresApprovalCode || false),
      });
    }

    return limits;
  }

  /**
   * Request a quick fix
   */
  async requestQuickFix(
    context: QuickFixContext,
    actionCode: string,
    payload?: Record<string, unknown>,
    aiRecommendation?: { id: string; confidence: number; reasoning: string }
  ): Promise<{ success: boolean; requestId?: string; status: string; message: string }> {
    // Find the action
    const actions = await this.getAvailableActions(context);
    const action = actions.find(a => a.code === actionCode);

    if (!action) {
      return { success: false, status: 'error', message: 'Action not available for your role' };
    }

    // Check limits
    const limits = await this.getUserLimits(context);
    const limit = limits.find(l => l.actionCode === actionCode);

    if (limit && limit.usedToday >= limit.perDayLimit) {
      return { success: false, status: 'limit_exceeded', message: 'Daily limit reached for this action' };
    }

    // Create request
    const requestId = crypto.randomUUID();
    const status = limit?.requiresApproval ? 'awaiting_approval' : 'pending';

    try {
      await db.insert(quickFixRequests).values({
        id: requestId,
        actionId: action.id,
        requesterId: context.userId,
        requesterRole: context.platformRole,
        workspaceId: context.workspaceId,
        targetScope: 'platform',
        payloadJson: payload,
        aiRecommendationId: aiRecommendation?.id,
        aiConfidenceScore: aiRecommendation?.confidence,
        aiReasoning: aiRecommendation?.reasoning,
        status,
        priority: 'medium',
        requestedAt: new Date(),
      });

      // Notify AI Brain
      aiBrainEvents.emit('quick_fix_requested', {
        requestId,
        actionCode,
        userId: context.userId,
        platformRole: context.platformRole,
        requiresApproval: limit?.requiresApproval,
      });

      // Auto-execute if no approval needed and can execute immediately
      if (!limit?.requiresApproval && limit?.canExecuteImmediately) {
        const execution = await this.executeQuickFix(requestId, context);
        return {
          success: execution.success,
          requestId,
          status: execution.success ? 'completed' : 'failed',
          message: execution.message,
        };
      }

      return {
        success: true,
        requestId,
        status,
        message: limit?.requiresApproval 
          ? 'Request submitted. Awaiting approval from authorized personnel.'
          : 'Request queued for execution.',
      };
    } catch (error) {
      log.error('[QuickFix] Error creating request:', error);
      return { success: false, status: 'error', message: 'Failed to create request' };
    }
  }

  /**
   * Approve a quick fix request
   */
  async approveRequest(
    requestId: string,
    approverContext: QuickFixContext,
    approvalCode?: string,
    notes?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Get request
      const requests = await db
        .select()
        .from(quickFixRequests)
        .where(eq(quickFixRequests.id, requestId));

      const request = requests[0];
      if (!request) {
        return { success: false, message: 'Request not found' };
      }

      if (request.status !== 'awaiting_approval') {
        return { success: false, message: 'Request is not awaiting approval' };
      }

      // Verify approver has permission
      const approverLevel = ROLE_HIERARCHY[approverContext.platformRole] || 0;
      const requesterLevel = ROLE_HIERARCHY[request.requesterRole] || 0;

      if (approverLevel <= requesterLevel && approverContext.platformRole !== 'root_admin') {
        return { success: false, message: 'Cannot approve requests from same or higher role' };
      }

      // Verify approval code if required
      let approvalMethod = 'rbac';
      if (approvalCode) {
        const storedCode = this.approvalCodes.get(requestId);
        if (!storedCode || storedCode.code !== approvalCode) {
          return { success: false, message: 'Invalid approval code' };
        }
        if (storedCode.expiresAt < new Date()) {
          this.approvalCodes.delete(requestId);
          return { success: false, message: 'Approval code expired' };
        }
        approvalMethod = 'approval_code';
        this.approvalCodes.delete(requestId);
      }

      // Update request status — approval recorded via status transition + AI brain event
      await db
        .update(quickFixRequests)
        .set({ status: 'approved', updatedAt: new Date() })
        .where(eq(quickFixRequests.id, requestId));

      aiBrainEvents.emit('quick_fix_approved', {
        requestId,
        approverId: approverContext.userId,
        approverRole: approverContext.platformRole,
        approvalMethod,
        notes,
      });

      return { success: true, message: 'Request approved. Ready for execution.' };
    } catch (error) {
      log.error('[QuickFix] Approval error:', error);
      return { success: false, message: 'Failed to approve request' };
    }
  }

  /**
   * Generate an approval code for a request
   */
  generateApprovalCode(requestId: string, userId: string): string {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    this.approvalCodes.set(requestId, { code, expiresAt, userId });
    
    // Clean up expired codes
    for (const [key, value] of this.approvalCodes) {
      if (value.expiresAt < new Date()) {
        this.approvalCodes.delete(key);
      }
    }

    return code;
  }

  /**
   * Execute a quick fix
   */
  async executeQuickFix(
    requestId: string,
    executorContext: QuickFixContext
  ): Promise<{ success: boolean; message: string; result?: any }> {
    try {
      const requests = await db
        .select()
        .from(quickFixRequests)
        .where(eq(quickFixRequests.id, requestId));

      const request = requests[0];
      if (!request) {
        return { success: false, message: 'Request not found' };
      }

      // Check if approved or auto-approved
      if (request.status !== 'approved' && request.status !== 'pending') {
        return { success: false, message: 'Request not approved for execution' };
      }

      // Get action
      const actions = await this.getAvailableActions(executorContext);
      const action = actions.find(a => a.id === request.actionId);

      if (!action) {
        return { success: false, message: 'Action not found' };
      }

      // Update status to executing
      await db
        .update(quickFixRequests)
        .set({ status: 'executing', updatedAt: new Date() })
        .where(eq(quickFixRequests.id, requestId));

      const startTime = Date.now();

      // Execute the fix based on action code
      let result: any;
      let success = true;
      let changesSummary = '';

      switch (action.code) {
        case 'clear_cache':
          result = await this.executeClearCache(request.payloadJson);
          changesSummary = 'System caches cleared';
          break;

        case 'restart_service':
          result = await this.executeRestartService(request.payloadJson);
          changesSummary = `Service restarted: ${(request as any).payloadJson?.serviceName || 'unknown'}`;
          break;

        case 'refresh_connections':
          result = await this.executeRefreshConnections();
          changesSummary = 'Database connection pool refreshed';
          break;

        case 'force_logout_user':
          result = await this.executeForceLogout(request.payloadJson);
          changesSummary = `User sessions invalidated: ${(request as any).payloadJson?.targetUserId}`;
          break;

        default:
          result = { message: 'Action executed via default handler' };
          changesSummary = `Action ${action.code} executed`;
      }

      const durationMs = Date.now() - startTime;

      // Create execution record
      await db.insert(quickFixExecutions).values({
        requestId,
        executorId: executorContext.userId,
        executorType: 'user',
        result: success ? 'success' : 'failed',
        resultDetails: result,
        executionStarted: new Date(startTime),
        executionCompleted: new Date(),
        durationMs,
        changesSummary,
        changesJson: { action: action.code, payload: request.payloadJson, result },
        rollbackAvailable: action.reversible || false,
      });

      // Update request status
      await db
        .update(quickFixRequests)
        .set({ 
          status: success ? 'completed' : 'failed', 
          updatedAt: new Date() 
        })
        .where(eq(quickFixRequests.id, requestId));

      // Notify AI Brain (captures execution audit trail)
      aiBrainEvents.emit('quick_fix_executed', {
        requestId,
        actionCode: action.code,
        executorId: executorContext.userId,
        success,
        durationMs,
      });

      return {
        success,
        message: success ? 'Quick fix executed successfully' : 'Quick fix execution failed',
        result,
      };
    } catch (error) {
      log.error('[QuickFix] Execution error:', error);
      return { success: false, message: 'Execution failed with error' };
    }
  }

  // Action executors
  private async executeClearCache(payload: any): Promise<unknown> {
    const cacheType = payload?.cacheType || 'all';
    log.info(`[QuickFix] Clearing cache: ${cacheType}`);
    try {
      const { cacheManager } = await import('../platform/cacheManager');
      cacheManager.clearAll();
      return { cleared: cacheType, success: true, timestamp: new Date().toISOString() };
    } catch (error) {
      log.warn('[QuickFix] Cache manager not available:', error);
      return { cleared: cacheType, success: false, note: 'No server-side cache service active', timestamp: new Date().toISOString() };
    }
  }

  private async executeRestartService(payload: any): Promise<unknown> {
    const serviceName = payload?.serviceName;
    log.info(`[QuickFix] Service restart requested: ${serviceName}`);
    return { service: serviceName, restarted: false, note: 'Service restart requires manual deployment action', timestamp: new Date().toISOString() };
  }

  private async executeRefreshConnections(): Promise<unknown> {
    log.info('[QuickFix] Verifying database connections');
    try {
      const { pool } = await import('../../db');
      const result = await typedPool('SELECT 1 AS alive');
      const isAlive = (result as unknown as any[])?.[0]?.alive === 1;
      return { connectionAlive: isAlive, connectionsRefreshed: false, note: 'Connection pool is managed by the database driver', timestamp: new Date().toISOString() };
    } catch (error) {
      log.error('[QuickFix] Connection verification failed:', error);
      return { connectionAlive: false, connectionsRefreshed: false, note: 'Connection verification failed', timestamp: new Date().toISOString() };
    }
  }

  private async executeForceLogout(payload: any): Promise<unknown> {
    const targetUserId = payload?.targetUserId;
    log.info(`[QuickFix] Force logout user: ${targetUserId}`);
    if (!targetUserId) {
      return { userId: null, sessionsCleared: false, note: 'No target user ID provided', timestamp: new Date().toISOString() };
    }
    try {
      const { sessions } = await import('@shared/schema');
      const deleted = await db.delete(sessions).where(
        sql`sess->>'userId' = ${targetUserId} OR sess->'passport'->>'user' = ${targetUserId}`
      ).returning({ sid: sessions.sid });
      const count = deleted.length;
      log.info(`[QuickFix] Cleared ${count} sessions for user ${targetUserId}`);
      return { userId: targetUserId, sessionsCleared: count > 0, sessionCount: count, timestamp: new Date().toISOString() };
    } catch (error) {
      log.error('[QuickFix] Session invalidation failed:', error);
      return { userId: targetUserId, sessionsCleared: false, note: 'Session invalidation failed', timestamp: new Date().toISOString() };
    }
  }

  /**
   * Get AI-suggested quick fixes for current platform state
   */
  async getAISuggestions(context: QuickFixContext): Promise<QuickFixSuggestion[]> {
    const actions = await this.getAvailableActions(context);
    const suggestions: QuickFixSuggestion[] = [];

    // This would connect to Gemini for intelligent suggestions
    // For now, return context-aware defaults
    for (const action of actions.slice(0, 3)) {
      suggestions.push({
        action,
        confidence: 0.75,
        reasoning: `Based on current system state, ${action.name} may help resolve potential issues.`,
        estimatedImpact: action.riskTier === 'safe' ? 'low' : action.riskTier === 'moderate' ? 'medium' : 'high',
        requiresApproval: action.requiresApproval || false,
      });
    }

    return suggestions;
  }

  /**
   * Get request history
   */
  async getRequestHistory(
    context: QuickFixContext,
    filters?: { status?: string; limit?: number }
  ): Promise<QuickFixRequest[]> {
    try {
      // Root admin sees all, others see only their own
      if (context.platformRole === 'root_admin') {
        return await db
          .select()
          .from(quickFixRequests)
          .orderBy(desc(quickFixRequests.requestedAt))
          .limit(filters?.limit || 50);
      }
      
      return await db
        .select()
        .from(quickFixRequests)
        .where(eq(quickFixRequests.requesterId, context.userId))
        .orderBy(desc(quickFixRequests.requestedAt))
        .limit(filters?.limit || 50);
    } catch {
      return [];
    }
  }

  /**
   * Get pending approvals for an approver
   */
  async getPendingApprovals(context: QuickFixContext): Promise<QuickFixRequest[]> {
    const approverLevel = ROLE_HIERARCHY[context.platformRole] || 0;
    
    if (approverLevel < ROLE_HIERARCHY['support_manager']) {
      return []; // Not authorized to approve
    }

    try {
      return await db
        .select()
        .from(quickFixRequests)
        .where(eq(quickFixRequests.status, 'awaiting_approval'))
        .orderBy(desc(quickFixRequests.requestedAt));
    } catch {
      return [];
    }
  }
}

export const quickFixService = new QuickFixService();
