/**
 * Support Actions Service
 * Handles all support-related actions (lock/unlock, reset, verify, etc.)
 * with proper role checks, audit logging, and Trinity integration
 *
 * HIERARCHY-AWARE APPROVAL SYSTEM:
 * Platform Role Hierarchy (from rbac.ts PLATFORM_ROLE_HIERARCHY):
 *   root_admin(7) > deputy_admin(6) > sysop(5) > support_manager(4) > support_agent(3) > compliance_officer(2) > Bot(1)
 *
 * Approval Rules:
 *   - Each action has a minLevelForDirectExecution (the minimum role level to execute without approval)
 *   - Each action has a minLevelToRequest (the minimum role level to even request this action)
 *   - If executor's level >= minLevelForDirectExecution: execute immediately, no approval needed
 *   - If executor's level >= minLevelToRequest but < minLevelForDirectExecution: needs approval from someone at minLevelForDirectExecution+
 *   - If executor's level < minLevelToRequest: denied entirely (too low in hierarchy)
 *   - root_admin (7) and deputy_admin (6) NEVER need approval - they ARE the approvers
 */

import { db } from '../db';
import { eq, and, sql } from 'drizzle-orm';
import { users, sessions, workspaces, platformRoles, auditLogs, employees } from '@shared/schema';
import { randomUUID } from 'crypto';
import { platformEventBus } from './platformEventBus';
import { hasPlatformWideAccess, PLATFORM_ROLE_HIERARCHY, getPlatformRoleLevel } from '../rbac';
import { emailService } from './emailService';
import type { MessageKind } from '@shared/commands';
import { typedExec } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
const log = createLogger('supportActionsService');


// =====================================================
// DESTRUCTIVE ACTION GUARDRAILS
// Rate limiting, abuse detection, and hierarchy-aware approval gates
// =====================================================

interface ActionRateLimit {
  maxPerHour: number;
  maxPerDay: number;
  alertThreshold: number;
  minLevelForDirectExecution: number;
  minLevelToRequest: number;
}

const DESTRUCTIVE_ACTION_LIMITS: Record<string, ActionRateLimit> = {
  lock_account: {
    maxPerHour: 10, maxPerDay: 50, alertThreshold: 5,
    minLevelForDirectExecution: 4,
    minLevelToRequest: 3,
  },
  unlock_account: {
    maxPerHour: 20, maxPerDay: 100, alertThreshold: 10,
    minLevelForDirectExecution: 3,
    minLevelToRequest: 3,
  },
  reset_password: {
    maxPerHour: 15, maxPerDay: 75, alertThreshold: 8,
    minLevelForDirectExecution: 4,
    minLevelToRequest: 3,
  },
  reset_email: {
    maxPerHour: 5, maxPerDay: 20, alertThreshold: 3,
    minLevelForDirectExecution: 6,
    minLevelToRequest: 5,
  },
  revoke_sessions: {
    maxPerHour: 10, maxPerDay: 50, alertThreshold: 5,
    minLevelForDirectExecution: 6,
    minLevelToRequest: 5,
  },
};

// Track actions per executor for rate limiting
interface ActionTracker {
  hourlyCount: Map<string, number>; // action -> count
  dailyCount: Map<string, number>;
  hourlyReset: Date;
  dailyReset: Date;
  pendingApprovals: Map<string, {
    action: string;
    targetUserId: string;
    requestedBy: string;
    requestedAt: Date;
    expiresAt: Date;
    reason?: string;
  }>;
}

// Support action types
export type SupportActionType = 
  | 'lock_account'
  | 'unlock_account'
  | 'reset_password'
  | 'reset_email'
  | 'verify_identity'
  | 'request_info'
  | 'view_user_info'
  | 'revoke_sessions'
  | 'escalate_ticket'
  | 'resolve_ticket'
  | 'mute_user'
  | 'unmute_user';

// Support action result
export interface SupportActionResult {
  success: boolean;
  action: SupportActionType;
  targetUserId?: string;
  message: string;
  messageKind: MessageKind;
  details?: Record<string, any>;
  requiresConfirmation?: boolean;
  confirmationToken?: string;
}

// Roles that can perform support actions - aligned with PLATFORM_WIDE_ROLES from rbac.ts
const SUPPORT_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'compliance_officer'];

// Minimum platform role level required to even access each action type
// Actions below an executor's level are fully denied (not just approval-gated)
const ACTION_MIN_ACCESS_LEVELS: Record<string, number> = {
  'view_user_info': 2,
  'request_info': 3,
  'verify_identity': 3,
  'unlock_account': 3,
  'lock_account': 3,
  'reset_password': 3,
  'mute_user': 3,
  'unmute_user': 3,
  'escalate_ticket': 3,
  'resolve_ticket': 3,
  'revoke_sessions': 5,
  'reset_email': 5,
};

// Actions that require confirmation before execution
const CONFIRMATION_REQUIRED: SupportActionType[] = ['lock_account', 'reset_password', 'reset_email', 'revoke_sessions'];

class SupportActionsService {
  private pendingConfirmations = new Map<string, {
    action: SupportActionType;
    params: any;
    executorId: string;
    expiresAt: Date;
  }>();

  // Rate limiting tracker per executor
  private executorTrackers = new Map<string, ActionTracker>();

  // Pending approval requests requiring higher-up authorization
  private pendingApprovals = new Map<string, {
    id: string;
    action: SupportActionType;
    targetUserId: string;
    requestedBy: string;
    requestedAt: Date;
    expiresAt: Date;
    reason?: string;
    approvedBy?: string;
    approvedAt?: Date;
  }>();

  /**
   * Resolve a targetUserId that may be an employee ID to the actual user ID.
   * Falls back to the original ID if no employee→user mapping found.
   */
  private async resolveToUserId(targetId: string): Promise<string> {
    const existingUser = await db.query.users.findFirst({
      where: eq(users.id, targetId),
      columns: { id: true },
    });
    if (existingUser) return targetId;

    const emp = await db.query.employees.findFirst({
      where: eq(employees.id, targetId),
      columns: { userId: true },
    });
    if (emp?.userId) {
      log.info(`[SupportActions] Resolved employee ID ${targetId} → user ID ${emp.userId}`);
      return emp.userId;
    }

    return targetId;
  }

  /**
   * Get or create tracker for an executor
   */
  private getExecutorTracker(executorId: string): ActionTracker {
    const now = new Date();
    let tracker = this.executorTrackers.get(executorId);
    
    if (!tracker) {
      tracker = {
        hourlyCount: new Map(),
        dailyCount: new Map(),
        hourlyReset: new Date(now.getTime() + 3600000), // 1 hour
        dailyReset: new Date(now.getTime() + 86400000), // 24 hours
        pendingApprovals: new Map(),
      };
      this.executorTrackers.set(executorId, tracker);
    }

    // Reset counters if time has passed
    if (now >= tracker.hourlyReset) {
      tracker.hourlyCount = new Map();
      tracker.hourlyReset = new Date(now.getTime() + 3600000);
    }
    if (now >= tracker.dailyReset) {
      tracker.dailyCount = new Map();
      tracker.dailyReset = new Date(now.getTime() + 86400000);
    }

    return tracker;
  }

  /**
   * Check rate limits and abuse detection for destructive actions
   */
  async checkDestructiveActionLimits(
    executorId: string,
    action: SupportActionType,
    targetUserId?: string
  ): Promise<{ allowed: boolean; reason?: string; requiresApproval?: boolean; approvalId?: string }> {
    const limits = DESTRUCTIVE_ACTION_LIMITS[action];
    if (!limits) {
      return { allowed: true };
    }

    const tracker = this.getExecutorTracker(executorId);
    const hourlyCount = tracker.hourlyCount.get(action) || 0;
    const dailyCount = tracker.dailyCount.get(action) || 0;

    if (hourlyCount >= limits.maxPerHour) {
      await this.triggerAbuseAlert(executorId, action, 'hourly_limit_exceeded', hourlyCount);
      return {
        allowed: false,
        reason: `Rate limit exceeded: Maximum ${limits.maxPerHour} ${action} actions per hour. Please wait before trying again.`,
      };
    }

    if (dailyCount >= limits.maxPerDay) {
      await this.triggerAbuseAlert(executorId, action, 'daily_limit_exceeded', dailyCount);
      return {
        allowed: false,
        reason: `Rate limit exceeded: Maximum ${limits.maxPerDay} ${action} actions per day. Contact your supervisor if more are needed.`,
      };
    }

    if (hourlyCount >= limits.alertThreshold) {
      await this.triggerAbuseAlert(executorId, action, 'threshold_warning', hourlyCount);
    }

    // HIERARCHY-AWARE APPROVAL CHECK
    // Get executor's platform role level from the hierarchy
    const executorRoleRecord = await db.query.platformRoles.findFirst({
      where: eq(platformRoles.userId, executorId),
    });
    const executorLevel = getPlatformRoleLevel(executorRoleRecord?.role);

    // If executor's level >= minLevelForDirectExecution, they can execute directly (no approval)
    // root_admin(7) and deputy_admin(6) always meet this threshold for all actions
    if (executorLevel >= limits.minLevelForDirectExecution) {
      tracker.hourlyCount.set(action, hourlyCount + 1);
      tracker.dailyCount.set(action, dailyCount + 1);
      return { allowed: true };
    }

    // Executor has access (passed canExecuteSupportAction) but needs approval from a higher-up
    // Check if there's already an approved request for this exact action + target
    const pendingApproval = Array.from(this.pendingApprovals.entries()).find(
      ([_, p]) => p.requestedBy === executorId && 
                  p.action === action && 
                  p.targetUserId === targetUserId && 
                  p.approvedBy && 
                  new Date() < p.expiresAt
    );
    
    if (pendingApproval) {
      const [approvalId] = pendingApproval;
      this.pendingApprovals.delete(approvalId);
      
      await platformEventBus.publish({
        type: 'support_action_approval_consumed',
        payload: { approvalId, action, targetUserId, executorId },
        timestamp: new Date(),
        source: 'support-actions-guardrails',
      });
      
      tracker.hourlyCount.set(action, hourlyCount + 1);
      tracker.dailyCount.set(action, dailyCount + 1);
      return { allowed: true };
    }
    
    // No approval found - create a pending approval request
    const approvalId = randomUUID();
    const approverRoleNames = Object.entries(PLATFORM_ROLE_HIERARCHY)
      .filter(([_, level]) => level >= limits.minLevelForDirectExecution)
      .map(([name]) => name)
      .join(', ');

    this.pendingApprovals.set(approvalId, {
      id: approvalId,
      action,
      targetUserId: targetUserId || '',
      requestedBy: executorId,
      requestedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
    });

    return {
      allowed: false,
      requiresApproval: true,
      approvalId,
      reason: `This action requires approval from a higher-level role (${approverRoleNames}). Approval ID: ${approvalId.slice(0, 8)}...`,
    };
  }

  /**
   * Approve a pending destructive action request
   * Approver must have a platform role level >= the action's minLevelForDirectExecution
   */
  async approveAction(
    approvalId: string,
    approverId: string
  ): Promise<{ success: boolean; message: string }> {
    const approval = this.pendingApprovals.get(approvalId);
    if (!approval) {
      return { success: false, message: 'Approval request not found or expired.' };
    }

    if (new Date() > approval.expiresAt) {
      this.pendingApprovals.delete(approvalId);
      return { success: false, message: 'Approval request has expired.' };
    }

    // Get approver's platform role level
    const approverRoleRecord = await db.query.platformRoles.findFirst({
      where: eq(platformRoles.userId, approverId),
    });
    const approverLevel = getPlatformRoleLevel(approverRoleRecord?.role);
    const limits = DESTRUCTIVE_ACTION_LIMITS[approval.action];
    const minLevel = limits?.minLevelForDirectExecution || 6;

    if (approverLevel < minLevel) {
      return { 
        success: false, 
        message: `Your role level (${approverLevel}) is insufficient to approve this action. Minimum level required: ${minLevel}.` 
      };
    }

    if (approverId === approval.requestedBy) {
      return { success: false, message: 'You cannot approve your own action request.' };
    }

    approval.approvedBy = approverId;
    approval.approvedAt = new Date();

    await platformEventBus.publish({
      type: 'support_action_approved',
      payload: {
        approvalId,
        action: approval.action,
        targetUserId: approval.targetUserId,
        requestedBy: approval.requestedBy,
        approvedBy: approverId,
        approverRole: approverRoleRecord?.role,
      },
      timestamp: new Date(),
      source: 'support-actions-guardrails',
    });

    await this.logAction(approval.action as SupportActionType, approverId, approval.targetUserId, {
      approvalId,
      approvedAction: approval.action,
      requestedBy: approval.requestedBy,
      approverRole: approverRoleRecord?.role,
    }, true);

    return { success: true, message: `Action approved by ${approverRoleRecord?.role || 'unknown'}. The requester can now proceed.` };
  }

  /**
   * Trigger abuse alert for rate limiting violations
   */
  private async triggerAbuseAlert(
    executorId: string,
    action: SupportActionType,
    alertType: 'hourly_limit_exceeded' | 'daily_limit_exceeded' | 'threshold_warning',
    count: number
  ): Promise<void> {
    const severity = alertType === 'threshold_warning' ? 'warning' : 'critical';
    
    log.warn(`[SupportActions] ABUSE ALERT: ${alertType} for ${executorId} on ${action} (count: ${count})`);

    // Emit abuse alert event for monitoring
    await platformEventBus.publish({
      type: 'support_action_abuse_alert',
      payload: {
        executorId,
        action,
        alertType,
        count,
        severity,
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date(),
      source: 'support-actions-guardrails',
    });

    // Log to audit trail
    try {
      await db.insert(auditLogs).values({
        id: randomUUID(),
        entityType: 'abuse_detection',
        entityId: executorId,
        action: `${alertType}_${action}`,
        userId: 'system',
        metadata: {
          performedBy: 'system',
          executorId,
          action,
          alertType,
          count,
          severity,
        },
      });
    } catch (error) {
      log.error('[SupportActions] Failed to log abuse alert:', error);
    }
  }

  /**
   * Get rate limit status for an executor
   */
  getRateLimitStatus(executorId: string): {
    actions: Record<string, { hourly: number; daily: number; limits: ActionRateLimit }>;
    pendingApprovals: number;
  } {
    const tracker = this.getExecutorTracker(executorId);
    const actions: Record<string, { hourly: number; daily: number; limits: ActionRateLimit }> = {};

    for (const [action, limits] of Object.entries(DESTRUCTIVE_ACTION_LIMITS)) {
      actions[action] = {
        hourly: tracker.hourlyCount.get(action) || 0,
        daily: tracker.dailyCount.get(action) || 0,
        limits,
      };
    }

    const pendingApprovals = Array.from(this.pendingApprovals.values()).filter(
      p => p.requestedBy === executorId && !p.approvedBy && new Date() < p.expiresAt
    ).length;

    return { actions, pendingApprovals };
  }

  /**
   * Check if user has permission to execute support actions
   * Uses hierarchy-aware checks: verifies the executor's platform role level
   * meets the minimum access level for the requested action.
   * Does NOT check approval gates here - that's handled by checkDestructiveActionLimits.
   */
  async canExecuteSupportAction(
    executorId: string,
    action: SupportActionType
  ): Promise<{ allowed: boolean; reason?: string; executorRole?: string; executorLevel?: number }> {
    try {
      const roleRecord = await db.query.platformRoles.findFirst({
        where: eq(platformRoles.userId, executorId),
      });

      const executorRole = roleRecord?.role;

      if (!executorRole || !SUPPORT_ROLES.includes(executorRole)) {
        return { 
          allowed: false, 
          reason: 'You do not have permission to perform support actions.',
          executorRole,
          executorLevel: 0,
        };
      }

      const executorLevel = getPlatformRoleLevel(executorRole);
      const minAccessLevel = ACTION_MIN_ACCESS_LEVELS[action] || 3;

      if (executorLevel < minAccessLevel) {
        return {
          allowed: false,
          reason: `This action requires a higher platform role. Your role (${executorRole}, level ${executorLevel}) does not meet the minimum level (${minAccessLevel}) for ${action}.`,
          executorRole,
          executorLevel,
        };
      }

      return { allowed: true, executorRole, executorLevel };
    } catch (error) {
      log.error('[SupportActions] Permission check failed:', error);
      return { allowed: false, reason: 'Permission check failed.' };
    }
  }

  /**
   * Log support action to audit trail
   */
  private async logAction(
    action: SupportActionType,
    executorId: string,
    targetUserId: string | null,
    details: Record<string, any>,
    success: boolean
  ): Promise<void> {
    try {
      await db.insert(auditLogs).values({
        id: randomUUID(),
        entityType: 'support_action',
        entityId: targetUserId || executorId,
        action: action,
        userId: executorId,
        metadata: {
          performedBy: executorId,
          ...details,
          success,
          timestamp: new Date().toISOString(),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          severity: ELEVATED_ACTIONS.includes(action) ? 'critical' : 'info',
        },
      });

      // Also emit event for real-time notification
      await platformEventBus.publish({
        type: 'support_action',
        payload: {
          action,
          executorId,
          targetUserId,
          details,
          success,
        },
        timestamp: new Date(),
        source: 'support-actions-service',
      });
    } catch (error) {
      log.error('[SupportActions] Audit log failed:', error);
    }
  }

  /**
   * Lock a user account
   */
  async lockAccount(
    executorId: string,
    targetUserId: string,
    reason?: string
  ): Promise<SupportActionResult> {
    targetUserId = await this.resolveToUserId(targetUserId);
    const permCheck = await this.canExecuteSupportAction(executorId, 'lock_account');
    if (!permCheck.allowed) {
      return {
        success: false,
        action: 'lock_account',
        message: permCheck.reason || 'Permission denied',
        messageKind: 'system',
      };
    }

    // Check rate limits and guardrails
    const rateLimitCheck = await this.checkDestructiveActionLimits(executorId, 'lock_account', targetUserId);
    if (!rateLimitCheck.allowed) {
      return {
        success: false,
        action: 'lock_account',
        message: rateLimitCheck.reason || 'Rate limit exceeded',
        messageKind: 'system',
        requiresConfirmation: rateLimitCheck.requiresApproval,
        confirmationToken: rateLimitCheck.approvalId,
      };
    }

    try {
      // Get target user
      const targetUser = await db.query.users.findFirst({
        where: eq(users.id, targetUserId),
      });

      if (!targetUser) {
        return {
          success: false,
          action: 'lock_account',
          message: `User not found: ${targetUserId}`,
          messageKind: 'system',
        };
      }

      // Update user to locked status
      await db.update(users)
        .set({
          lockedUntil: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000),
          updatedAt: new Date(),
        })
        .where(eq(users.id, targetUserId));

      // Revoke all active sessions using parameterized JSONB query
      // CATEGORY C — Raw SQL retained: ::jsonb | Tables: sessions | Verified: 2026-03-23
      await typedExec(
        `DELETE FROM sessions WHERE sess::jsonb->>'userId' = $1`,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        [targetUserId]
      );

      await this.logAction('lock_account', executorId, targetUserId, { reason }, true);

      return {
        success: true,
        action: 'lock_account',
        targetUserId,
        message: `Account locked for ${targetUser.email || targetUserId}. ${reason ? `Reason: ${reason}` : ''}`,
        messageKind: 'action',
        details: { email: targetUser.email, reason },
      };
    } catch (error) {
      log.error('[SupportActions] Lock account failed:', error);
      await this.logAction('lock_account', executorId, targetUserId, { reason, error: String(error) }, false);
      return {
        success: false,
        action: 'lock_account',
        message: 'Failed to lock account. Please try again.',
        messageKind: 'system',
      };
    }
  }

  /**
   * Unlock a user account
   */
  async unlockAccount(
    executorId: string,
    targetUserId: string
  ): Promise<SupportActionResult> {
    targetUserId = await this.resolveToUserId(targetUserId);
    const permCheck = await this.canExecuteSupportAction(executorId, 'unlock_account');
    if (!permCheck.allowed) {
      return {
        success: false,
        action: 'unlock_account',
        message: permCheck.reason || 'Permission denied',
        messageKind: 'system',
      };
    }

    try {
      const targetUser = await db.query.users.findFirst({
        where: eq(users.id, targetUserId),
      });

      if (!targetUser) {
        return {
          success: false,
          action: 'unlock_account',
          message: `User not found: ${targetUserId}`,
          messageKind: 'system',
        };
      }

      await db.update(users)
        .set({
          lockedUntil: null,
          loginAttempts: 0,
          updatedAt: new Date(),
        })
        .where(eq(users.id, targetUserId));

      await this.logAction('unlock_account', executorId, targetUserId, {}, true);

      return {
        success: true,
        action: 'unlock_account',
        targetUserId,
        message: `Account unlocked for ${targetUser.email || targetUserId}. User can now log in.`,
        messageKind: 'action',
        details: { email: targetUser.email },
      };
    } catch (error) {
      log.error('[SupportActions] Unlock account failed:', error);
      await this.logAction('unlock_account', executorId, targetUserId, { error: String(error) }, false);
      return {
        success: false,
        action: 'unlock_account',
        message: 'Failed to unlock account. Please try again.',
        messageKind: 'system',
      };
    }
  }

  /**
   * Get user information for support context
   */
  async getUserInfo(
    executorId: string,
    targetIdentifier: string
  ): Promise<SupportActionResult> {
    const permCheck = await this.canExecuteSupportAction(executorId, 'view_user_info');
    if (!permCheck.allowed) {
      return {
        success: false,
        action: 'view_user_info',
        message: permCheck.reason || 'Permission denied',
        messageKind: 'system',
      };
    }

    try {
      // Resolve employee ID → user ID if needed (non-email lookups)
      const resolvedId = targetIdentifier.includes('@') ? targetIdentifier : await this.resolveToUserId(targetIdentifier);
      // Search by ID or email
      const targetUser = await db.query.users.findFirst({
        where: eq(
          resolvedId.includes('@') ? users.email : users.id,
          resolvedId
        ),
      });

      if (!targetUser) {
        return {
          success: false,
          action: 'view_user_info',
          message: `User not found: ${targetIdentifier}`,
          messageKind: 'system',
        };
      }

      // Get workspace info
      const workspace = (targetUser as any).workspaceId
        ? await db.query.workspaces.findFirst({
            where: eq(workspaces.id, (targetUser as any).workspaceId),
          })
        : null;

      await this.logAction('view_user_info', executorId, targetUser.id, {}, true);

      const userInfo = {
        userId: targetUser.id,
        email: targetUser.email,
        name: `${targetUser.firstName || ''} ${targetUser.lastName || ''}`.trim() || 'N/A',
        isActive: (targetUser as any).isActive,
        lockedAt: (targetUser as any).lockedAt,
        lockReason: (targetUser as any).lockReason,
        workspaceId: (targetUser as any).workspaceId,
        workspaceName: workspace?.name || 'N/A',
        createdAt: targetUser.createdAt,
        lastLoginAt: targetUser.lastLoginAt,
        failedLoginAttempts: targetUser.loginAttempts || 0,
      };

      return {
        success: true,
        action: 'view_user_info',
        targetUserId: targetUser.id,
        message: `**User Info for ${userInfo.name}**\n` +
          `Email: ${userInfo.email}\n` +
          `Status: ${userInfo.isActive ? '✓ Active' : '✗ Locked'}\n` +
          `${userInfo.lockReason ? `Lock Reason: ${userInfo.lockReason}\n` : ''}` +
          `Workspace: ${userInfo.workspaceName}\n` +
          `Last Login: ${userInfo.lastLoginAt ? new Date(userInfo.lastLoginAt).toLocaleString() : 'Never'}\n` +
          `Failed Logins: ${userInfo.failedLoginAttempts}`,
        messageKind: 'action',
        details: userInfo,
      };
    } catch (error) {
      log.error('[SupportActions] Get user info failed:', error);
      return {
        success: false,
        action: 'view_user_info',
        message: 'Failed to retrieve user information.',
        messageKind: 'system',
      };
    }
  }

  /**
   * Request verification information from user
   */
  async requestInfo(
    executorId: string,
    targetUserId: string,
    infoType: string
  ): Promise<SupportActionResult> {
    const permCheck = await this.canExecuteSupportAction(executorId, 'request_info');
    if (!permCheck.allowed) {
      return {
        success: false,
        action: 'request_info',
        message: permCheck.reason || 'Permission denied',
        messageKind: 'system',
      };
    }

    const validInfoTypes = ['identity', 'address', 'phone', 'organization', 'billing'];
    if (!validInfoTypes.includes(infoType.toLowerCase())) {
      return {
        success: false,
        action: 'request_info',
        message: `Invalid info type. Valid types: ${validInfoTypes.join(', ')}`,
        messageKind: 'system',
      };
    }

    await this.logAction('request_info', executorId, targetUserId, { infoType }, true);

    // This returns a message that HelpAI will send to the user
    return {
      success: true,
      action: 'request_info',
      targetUserId,
      message: `For security verification, I need to confirm your ${infoType} information. Please provide the following:\n\n` +
        (infoType === 'identity' ? '• Last 4 digits of your phone number on file\n• Your date of birth' :
         infoType === 'address' ? '• Your current street address\n• City and ZIP code' :
         infoType === 'phone' ? '• The phone number associated with your account' :
         infoType === 'organization' ? '• Your company/organization name\n• Your role/title' :
         '• Last 4 digits of the card on file\n• Billing address ZIP code'),
      messageKind: 'private',
      details: { infoType },
    };
  }

  /**
   * Send password reset link
   */
  async resetPassword(
    executorId: string,
    targetEmail: string
  ): Promise<SupportActionResult> {
    const permCheck = await this.canExecuteSupportAction(executorId, 'reset_password');
    if (!permCheck.allowed) {
      return {
        success: false,
        action: 'reset_password',
        message: permCheck.reason || 'Permission denied',
        messageKind: 'system',
      };
    }

    // Check rate limits and guardrails
    const rateLimitCheck = await this.checkDestructiveActionLimits(executorId, 'reset_password', targetEmail);
    if (!rateLimitCheck.allowed) {
      return {
        success: false,
        action: 'reset_password',
        message: rateLimitCheck.reason || 'Rate limit exceeded',
        messageKind: 'system',
        requiresConfirmation: rateLimitCheck.requiresApproval,
        confirmationToken: rateLimitCheck.approvalId,
      };
    }

    try {
      const targetUser = await db.query.users.findFirst({
        where: eq(users.email, targetEmail),
      });

      if (!targetUser) {
        return {
          success: false,
          action: 'reset_password',
          message: `User not found with email: ${targetEmail}`,
          messageKind: 'system',
        };
      }

      const resetToken = randomUUID();
      
      await db.update(users)
        .set({
          resetToken: resetToken,
          resetTokenExpiry: new Date(Date.now() + 3600000), // 1 hour
          updatedAt: new Date(),
        })
        .where(eq(users.id, targetUser.id));

      let emailSent = false;
      let emailError: string | undefined;
      try {
        await emailService.sendPasswordResetEmail( // infra
          targetEmail,
          resetToken,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          targetUser.currentWorkspaceId || undefined
        );
        emailSent = true;
      } catch (emailErr: any) {
        emailError = emailErr?.message || 'Unknown email error';
        log.error('[SupportActions] Password reset email failed:', emailErr);
      }

      await this.logAction('reset_password', executorId, targetUser.id, { email: targetEmail, emailSent }, true);

      if (!emailSent) {
        return {
          success: true,
          action: 'reset_password',
          targetUserId: targetUser.id,
          message: `Password reset token generated for ${targetEmail}, but email delivery failed: ${emailError}. The token is valid for 1 hour.`,
          messageKind: 'action' as MessageKind,
          details: { email: targetEmail, emailSent: false, emailError },
        };
      }

      return {
        success: true,
        action: 'reset_password',
        targetUserId: targetUser.id,
        message: `Password reset link sent to ${targetEmail}. The link expires in 1 hour.`,
        messageKind: 'action',
        details: { email: targetEmail, emailSent: true },
      };
    } catch (error) {
      log.error('[SupportActions] Reset password failed:', error);
      return {
        success: false,
        action: 'reset_password',
        message: 'Failed to send password reset link.',
        messageKind: 'system',
      };
    }
  }

  /**
   * Escalate ticket to human support
   */
  async escalateTicket(
    sessionId: string,
    userId: string,
    priority: string = 'normal',
    reason?: string
  ): Promise<SupportActionResult> {
    try {
      await this.logAction('escalate_ticket', userId, null, { sessionId, priority, reason }, true);

      return {
        success: true,
        action: 'escalate_ticket',
        message: `Your request has been escalated to a human support agent. Priority: ${priority.toUpperCase()}. ${reason ? `Reason: ${reason}` : ''}\n\nA support agent will be with you shortly.`,
        messageKind: 'system',
        details: { sessionId, priority, reason },
      };
    } catch (error) {
      log.error('[SupportActions] Escalate ticket failed:', error);
      return {
        success: false,
        action: 'escalate_ticket',
        message: 'Failed to escalate ticket.',
        messageKind: 'system',
      };
    }
  }

  /**
   * Resolve/close a support ticket with Trinity AI summary
   * Full flow: Generate summary → Close session → Disconnect user → Notify next in queue
   */
  async resolveTicket(
    executorId: string,
    sessionId: string,
    resolutionNotes?: string
  ): Promise<SupportActionResult> {
    const permCheck = await this.canExecuteSupportAction(executorId, 'resolve_ticket');
    if (!permCheck.allowed) {
      return {
        success: false,
        action: 'resolve_ticket',
        message: permCheck.reason || 'Permission denied',
        messageKind: 'system',
      };
    }

    try {
      // Import required services
      const { supportSessionService } = await import('./supportSessionService');
      const { aiBrainService } = await import('./ai-brain/aiBrainService');
      const { forceDisconnectFromSession } = await import('./ChatServerHub');

      // Get session details for summary
      const session = await supportSessionService.getSessionWithFallback(sessionId);
      let trinitySummary = resolutionNotes || 'Issue resolved by support agent.';

      // Generate Trinity AI summary of the conversation
      if (session && session.messages.length > 0) {
        try {
          const conversationText = session.messages
            .map(m => `${m.senderName}: ${m.content}`)
            .join('\n');

          const summaryResult = await aiBrainService.enqueueJob({
            workspaceId: session.workspaceId || 'platform',
            skill: 'trinity_summarize',
            input: {
              message: `Summarize this support conversation concisely (2-3 sentences). Focus on the issue and how it was resolved:\n\n${conversationText}`,
              maxWords: 100,
            },
            priority: 'high',
          });

          if (summaryResult.status === 'completed' && summaryResult.output?.response) {
            trinitySummary = summaryResult.output.response;
          }
        } catch (aiError) {
          log.warn('[SupportActions] Trinity summary generation failed:', aiError);
          // Continue with manual notes
        }
      }

      // Close the session via supportSessionService (updates DB, emits events)
      if (session) {
        await supportSessionService.resolveSession(sessionId, trinitySummary);
      }

      // Force disconnect user from helpdesk room
      if (session?.userId) {
        try {
          await forceDisconnectFromSession({
            sessionId,
            userId: session.userId,
            reason: 'Ticket resolved - Thank you for contacting support!',
            staffId: executorId,
          });
        } catch (disconnectError) {
          log.warn('[SupportActions] User disconnect failed:', disconnectError);
        }
      }

      // Log the action
      await this.logAction('resolve_ticket', executorId, session?.userId || null, {
        sessionId,
        resolutionNotes,
        trinitySummary,
        ticketNumber: session?.ticketNumber,
      }, true);

      // Emit event for queue management (next user notification)
      await platformEventBus.publish({
        type: 'support_ticket_resolved',
        payload: {
          sessionId,
          ticketNumber: session?.ticketNumber,
          resolvedBy: executorId,
          summary: trinitySummary,
          userId: session?.userId,
          workspaceId: session?.workspaceId,
        },
        timestamp: new Date(),
        source: 'support-actions-service',
      });

      const userMessage = `✅ **Issue Resolved**\n\n${trinitySummary}\n\nThank you for contacting support! Please take a moment to rate your experience.`;

      return {
        success: true,
        action: 'resolve_ticket',
        message: userMessage,
        messageKind: 'action',
        details: {
          sessionId,
          resolutionNotes,
          trinitySummary,
          ticketNumber: session?.ticketNumber,
        },
      };
    } catch (error) {
      log.error('[SupportActions] Resolve ticket failed:', error);
      return {
        success: false,
        action: 'resolve_ticket',
        message: 'Failed to resolve ticket.',
        messageKind: 'system',
      };
    }
  }

  /**
   * Revoke all user sessions (force logout)
   */
  async revokeSessions(
    executorId: string,
    targetUserId: string
  ): Promise<SupportActionResult> {
    targetUserId = await this.resolveToUserId(targetUserId);
    const permCheck = await this.canExecuteSupportAction(executorId, 'revoke_sessions');
    if (!permCheck.allowed) {
      return {
        success: false,
        action: 'revoke_sessions',
        message: permCheck.reason || 'Permission denied',
        messageKind: 'system',
      };
    }

    // Check rate limits and guardrails - requires approval for elevated actions
    const rateLimitCheck = await this.checkDestructiveActionLimits(executorId, 'revoke_sessions', targetUserId);
    if (!rateLimitCheck.allowed) {
      return {
        success: false,
        action: 'revoke_sessions',
        message: rateLimitCheck.reason || 'Rate limit exceeded or approval required',
        messageKind: 'system',
        requiresConfirmation: rateLimitCheck.requiresApproval,
        confirmationToken: rateLimitCheck.approvalId,
      };
    }

    try {
      const targetUser = await db.query.users.findFirst({
        where: eq(users.id, targetUserId),
      });

      if (!targetUser) {
        return {
          success: false,
          action: 'revoke_sessions',
          message: `User not found: ${targetUserId}`,
          messageKind: 'system',
        };
      }

      // Delete all sessions for this user - using proper SQL with parameterized query
      // Sessions table stores userId in sess JSONB field
      // CATEGORY C — Raw SQL retained: ::jsonb | Tables: sessions | Verified: 2026-03-23
      const result = await typedExec(
        `DELETE FROM sessions WHERE sess::jsonb->>'userId' = $1`,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        [targetUserId]
      );

      await this.logAction('revoke_sessions', executorId, targetUserId, { sessionsDeleted: true }, true);

      return {
        success: true,
        action: 'revoke_sessions',
        targetUserId,
        message: `All sessions revoked for ${targetUser.email || targetUserId}. User will need to log in again.`,
        messageKind: 'action',
        details: { email: targetUser.email },
      };
    } catch (error) {
      log.error('[SupportActions] Revoke sessions failed:', error);
      return {
        success: false,
        action: 'revoke_sessions',
        message: 'Failed to revoke sessions.',
        messageKind: 'system',
      };
    }
  }

  /**
   * Reset user email address
   */
  async resetEmail(
    executorId: string,
    targetUserId: string,
    newEmail: string
  ): Promise<SupportActionResult> {
    targetUserId = await this.resolveToUserId(targetUserId);
    const permCheck = await this.canExecuteSupportAction(executorId, 'reset_email');
    if (!permCheck.allowed) {
      return {
        success: false,
        action: 'reset_email',
        message: permCheck.reason || 'Permission denied',
        messageKind: 'system',
      };
    }

    // Check rate limits and guardrails - requires approval for elevated actions
    const rateLimitCheck = await this.checkDestructiveActionLimits(executorId, 'reset_email', targetUserId);
    if (!rateLimitCheck.allowed) {
      return {
        success: false,
        action: 'reset_email',
        message: rateLimitCheck.reason || 'Rate limit exceeded or approval required',
        messageKind: 'system',
        requiresConfirmation: rateLimitCheck.requiresApproval,
        confirmationToken: rateLimitCheck.approvalId,
      };
    }

    try {
      const targetUser = await db.query.users.findFirst({
        where: eq(users.id, targetUserId),
      });

      if (!targetUser) {
        return {
          success: false,
          action: 'reset_email',
          message: `User not found: ${targetUserId}`,
          messageKind: 'system',
        };
      }

      // Check if new email is already in use
      const existingUser = await db.query.users.findFirst({
        where: eq(users.email, newEmail),
      });

      if (existingUser && existingUser.id !== targetUserId) {
        return {
          success: false,
          action: 'reset_email',
          message: 'Email address is already in use by another account.',
          messageKind: 'system',
        };
      }

      const oldEmail = targetUser.email;

      // Update user email
      await db.update(users)
        .set({
          email: newEmail,
          emailVerified: false,
          updatedAt: new Date(),
        })
        .where(eq(users.id, targetUserId));

      // Also update all employee records linked to this user so member lists show the new email
      await db.update(employees)
        .set({ email: newEmail })
        .where(eq(employees.userId, targetUserId));

      await this.logAction('reset_email', executorId, targetUserId, { oldEmail, newEmail }, true);

      return {
        success: true,
        action: 'reset_email',
        targetUserId,
        message: `Email updated for ${targetUser.firstName || targetUserId}.\n\nOld: ${oldEmail}\nNew: ${newEmail}\n\nUser must verify new email.`,
        messageKind: 'action',
        details: { oldEmail, newEmail },
      };
    } catch (error) {
      log.error('[SupportActions] Reset email failed:', error);
      await this.logAction('reset_email', executorId, targetUserId, { newEmail, error: String(error) }, false);
      return {
        success: false,
        action: 'reset_email',
        message: 'Failed to reset email.',
        messageKind: 'system',
      };
    }
  }

  /**
   * Log HelpAI/Trinity command for audit trail
   * Tracks: who commanded, why, for what action, to which target
   */
  async logAICommand(params: {
    commanderId: string;
    commanderRole: string;
    aiSystem: 'helpai' | 'trinity';
    action: string;
    targetUserId?: string;
    targetType?: string;
    reason?: string;
    conversationId?: string;
    confidence?: number;
    requiresConfirmation?: boolean;
    wasConfirmed?: boolean;
  }): Promise<void> {
    const {
      commanderId,
      commanderRole,
      aiSystem,
      action,
      targetUserId,
      targetType,
      reason,
      conversationId,
      confidence,
      requiresConfirmation,
      wasConfirmed,
    } = params;

    try {
      await db.insert(auditLogs).values({
        id: randomUUID(),
        entityType: 'ai_command',
        entityId: conversationId || commanderId,
        action: `${aiSystem}_${action}`,
        userId: commanderId,
        metadata: {
          performedBy: commanderId,
          aiSystem,
          action,
          commanderRole,
          targetUserId,
          targetType,
          reason,
          conversationId,
          confidence,
          requiresConfirmation,
          wasConfirmed,
          timestamp: new Date().toISOString(),
          severity: requiresConfirmation ? 'warning' : 'info',
        },
      });

      // Emit event for real-time monitoring
      await platformEventBus.publish({
        type: 'ai_command_logged',
        payload: {
          commanderId,
          commanderRole,
          aiSystem,
          action,
          targetUserId,
          targetType,
          reason,
          confidence,
          requiresConfirmation,
          wasConfirmed,
        },
        timestamp: new Date(),
        source: 'support-actions-ai-audit',
      });

      log.info(`[SupportActions] AI Command logged: ${aiSystem}/${action} by ${commanderId} -> ${targetUserId || 'N/A'}`);
    } catch (error) {
      log.error('[SupportActions] Failed to log AI command:', error);
    }
  }

  /**
   * Get pending approval requests for a supervisor
   */
  getPendingApprovals(): Array<{
    id: string;
    action: SupportActionType;
    targetUserId: string;
    requestedBy: string;
    requestedAt: Date;
    expiresAt: Date;
  }> {
    const now = new Date();
    return Array.from(this.pendingApprovals.values())
      .filter(p => !p.approvedBy && now < p.expiresAt)
      .map(({ id, action, targetUserId, requestedBy, requestedAt, expiresAt }) => ({
        id, action, targetUserId, requestedBy, requestedAt, expiresAt
      }));
  }
}

export const supportActionsService = new SupportActionsService();
