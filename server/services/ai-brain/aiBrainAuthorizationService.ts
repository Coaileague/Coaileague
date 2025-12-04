/**
 * AI BRAIN AUTHORIZATION SERVICE
 * =============================
 * Unified authorization layer ensuring only properly authenticated support staff
 * can command the AI Brain to perform platform actions.
 */

import { db } from '../../db';
import { systemAuditLogs, users } from '@shared/schema';
import { eq } from 'drizzle-orm';

export const ROLE_HIERARCHY: Record<string, number> = {
  'none': 0,
  'employee': 1,
  'manager': 2,
  'supervisor': 3,
  'support_agent': 4,
  'support_manager': 5,
  'sysop': 6,
  'deputy_admin': 7,
  'root_admin': 8,
};

export const SUPPORT_ROLES = ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'];

export const AI_BRAIN_AUTHORITY_ROLES: Record<string, string[]> = {
  'scheduling': ['manager', 'support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
  'payroll': ['sysop', 'deputy_admin', 'root_admin'],
  'invoicing': ['manager', 'support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
  'analytics': ['manager', 'support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
  'compliance': ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
  'notifications': ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
  'gamification': ['manager', 'support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
  'automation': ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
  'communication': ['manager', 'support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
  'health': ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
  'user_assistance': ['employee', 'manager', 'support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
  'system': ['sysop', 'deputy_admin', 'root_admin'],
};

export interface AuthorizationContext {
  userId: string;
  userRole: string;
  platformRole?: string;
  workspaceId?: string;
}

export interface ActionAuthCheck {
  userId: string;
  userRole: string;
  actionCategory: string;
  actionId: string;
  isAuthorized: boolean;
  reason?: string;
}

class AIBrainAuthorizationService {
  private static instance: AIBrainAuthorizationService;

  static getInstance(): AIBrainAuthorizationService {
    if (!this.instance) {
      this.instance = new AIBrainAuthorizationService();
    }
    return this.instance;
  }

  async canExecuteAction(context: AuthorizationContext, category: string, actionId: string): Promise<ActionAuthCheck> {
    const requiredRoles = AI_BRAIN_AUTHORITY_ROLES[category] || [];
    const isAuthorized = requiredRoles.includes(context.userRole);
    
    await this.logAuthorizationCheck({
      userId: context.userId,
      userRole: context.userRole,
      actionId,
      category,
      isAuthorized,
      requiredRoles
    });
    
    return {
      userId: context.userId,
      userRole: context.userRole,
      actionCategory: category,
      actionId,
      isAuthorized,
      reason: isAuthorized 
        ? `Authorized: ${context.userRole} can execute ${category}.${actionId}`
        : `Unauthorized: ${context.userRole} requires one of [${requiredRoles.join(', ')}] to execute ${category}.${actionId}`
    };
  }

  async validateSupportStaff(userId: string): Promise<{ valid: boolean; role?: string; reason?: string }> {
    try {
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      
      if (!user || user.length === 0) {
        return { valid: false, reason: 'User not found' };
      }

      const userRecord = user[0];
      const role = userRecord.platformRole as string;
      
      if (!SUPPORT_ROLES.includes(role)) {
        return {
          valid: false,
          role,
          reason: `User is ${role}, requires one of [${SUPPORT_ROLES.join(', ')}]`
        };
      }

      return { valid: true, role };
    } catch (error) {
      return { valid: false, reason: `Validation error: ${(error as any).message}` };
    }
  }

  requiresSupportRole(category: string): boolean {
    const requiredRoles = AI_BRAIN_AUTHORITY_ROLES[category] || [];
    return SUPPORT_ROLES.some(role => requiredRoles.includes(role));
  }

  getMinimumRequiredRole(category: string): string {
    const requiredRoles = AI_BRAIN_AUTHORITY_ROLES[category] || [];
    if (requiredRoles.length === 0) return 'employee';
    
    return requiredRoles.reduce((minRole, currentRole) => {
      const currentLevel = ROLE_HIERARCHY[currentRole] || 0;
      const minLevel = ROLE_HIERARCHY[minRole] || 0;
      return currentLevel < minLevel ? currentRole : minRole;
    });
  }

  getAccessibleCategories(userRole: string): string[] {
    const categories: string[] = [];
    for (const [category, requiredRoles] of Object.entries(AI_BRAIN_AUTHORITY_ROLES)) {
      if (requiredRoles.includes(userRole)) {
        categories.push(category);
      }
    }
    return categories;
  }

  private async logAuthorizationCheck(data: {
    userId: string;
    userRole: string;
    actionId: string;
    category: string;
    isAuthorized: boolean;
    requiredRoles: string[];
  }): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        userId: data.userId,
        action: 'ai_brain_authorization_check',
        entityType: 'ai_brain_orchestrator',
        entityId: data.actionId,
        changes: {
          category: data.category,
          authorized: data.isAuthorized,
          userRole: data.userRole,
          requiredRoles: data.requiredRoles
        }
      });
    } catch (error) {
      console.warn('[AIBrainAuthorizationService] Failed to log auth check:', error);
    }
  }

  async logCommandExecution(data: {
    userId: string;
    userRole: string;
    actionId: string;
    category: string;
    parameters?: Record<string, any>;
    result?: any;
    error?: string;
  }): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        userId: data.userId,
        action: 'ai_brain_command_execution',
        entityType: 'ai_brain_orchestrator',
        entityId: data.actionId,
        changes: {
          category: data.category,
          parameters: data.parameters,
          result: data.result ? 'success' : 'failed',
          error: data.error
        }
      });
    } catch (error) {
      console.warn('[AIBrainAuthorizationService] Failed to log execution:', error);
    }
  }

  getPermissionSummary(userRole: string): {
    role: string;
    level: number;
    accessible_categories: string[];
    is_support_staff: boolean;
  } {
    return {
      role: userRole,
      level: ROLE_HIERARCHY[userRole] || 0,
      accessible_categories: this.getAccessibleCategories(userRole),
      is_support_staff: SUPPORT_ROLES.includes(userRole)
    };
  }

  // ============================================================================
  // GOVERNANCE APPROVAL GATES FOR DESTRUCTIVE ACTIONS
  // ============================================================================

  private static readonly DESTRUCTIVE_ACTIONS: Record<string, { 
    description: string;
    minApprovalRole: string;
    requiresSecondApproval: boolean;
  }> = {
    'delete_workspace': { description: 'Delete entire workspace', minApprovalRole: 'root_admin', requiresSecondApproval: true },
    'delete_user': { description: 'Delete user account', minApprovalRole: 'deputy_admin', requiresSecondApproval: true },
    'bulk_delete': { description: 'Bulk delete records', minApprovalRole: 'sysop', requiresSecondApproval: true },
    'suspend_workspace': { description: 'Suspend workspace services', minApprovalRole: 'support_manager', requiresSecondApproval: false },
    'modify_payroll': { description: 'Modify payroll data', minApprovalRole: 'sysop', requiresSecondApproval: true },
    'modify_financial': { description: 'Modify financial records', minApprovalRole: 'sysop', requiresSecondApproval: true },
    'reset_credentials': { description: 'Reset user credentials', minApprovalRole: 'support_manager', requiresSecondApproval: false },
    'bypass_compliance': { description: 'Bypass compliance checks', minApprovalRole: 'root_admin', requiresSecondApproval: true },
    'export_all_data': { description: 'Export all workspace data', minApprovalRole: 'deputy_admin', requiresSecondApproval: true },
    'service_lockdown': { description: 'Emergency service lockdown', minApprovalRole: 'support_manager', requiresSecondApproval: false },
    'ai_brain_override': { description: 'Override AI Brain restrictions', minApprovalRole: 'root_admin', requiresSecondApproval: true },
  };

  private pendingApprovals: Map<string, {
    id: string;
    actionType: string;
    requesterId: string;
    requesterRole: string;
    targetEntity: string;
    parameters: Record<string, any>;
    reason: string;
    requestedAt: Date;
    expiresAt: Date;
    status: 'pending' | 'approved' | 'rejected' | 'expired';
    approvals: Array<{ userId: string; role: string; approvedAt: Date }>;
    requiredApprovals: number;
  }> = new Map();

  isDestructiveAction(actionType: string): boolean {
    return actionType in AIBrainAuthorizationService.DESTRUCTIVE_ACTIONS;
  }

  getDestructiveActionDetails(actionType: string): { description: string; minApprovalRole: string; requiresSecondApproval: boolean } | null {
    return AIBrainAuthorizationService.DESTRUCTIVE_ACTIONS[actionType] || null;
  }

  async requestApprovalForDestructiveAction(data: {
    actionType: string;
    requesterId: string;
    requesterRole: string;
    targetEntity: string;
    parameters: Record<string, any>;
    reason: string;
  }): Promise<{ approved: boolean; approvalId?: string; reason?: string }> {
    const actionDetails = AIBrainAuthorizationService.DESTRUCTIVE_ACTIONS[data.actionType];
    
    if (!actionDetails) {
      return { approved: true, reason: 'Action does not require approval' };
    }

    const requesterLevel = ROLE_HIERARCHY[data.requesterRole] || 0;
    const minApprovalLevel = ROLE_HIERARCHY[actionDetails.minApprovalRole] || 0;

    if (requesterLevel >= minApprovalLevel && !actionDetails.requiresSecondApproval) {
      await this.logApprovalAction(data.requesterId, data.actionType, 'auto_approved', 'Requester has sufficient authority');
      return { approved: true, reason: 'Auto-approved: Requester has sufficient authority' };
    }

    const approvalId = `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hour expiry

    this.pendingApprovals.set(approvalId, {
      id: approvalId,
      actionType: data.actionType,
      requesterId: data.requesterId,
      requesterRole: data.requesterRole,
      targetEntity: data.targetEntity,
      parameters: data.parameters,
      reason: data.reason,
      requestedAt: now,
      expiresAt,
      status: 'pending',
      approvals: [],
      requiredApprovals: actionDetails.requiresSecondApproval ? 2 : 1,
    });

    await this.logApprovalAction(data.requesterId, data.actionType, 'pending', `Approval requested for ${actionDetails.description}`);

    console.log(`[GovernanceGate] Approval requested: ${approvalId} for ${data.actionType}`);

    return { 
      approved: false, 
      approvalId, 
      reason: `Approval required from ${actionDetails.minApprovalRole} or higher. ${actionDetails.requiresSecondApproval ? 'Second approval required.' : ''}`
    };
  }

  async approveDestructiveAction(approvalId: string, approverId: string, approverRole: string): Promise<{ success: boolean; fullyApproved: boolean; reason: string }> {
    const approval = this.pendingApprovals.get(approvalId);
    
    if (!approval) {
      return { success: false, fullyApproved: false, reason: 'Approval request not found' };
    }

    if (approval.status !== 'pending') {
      return { success: false, fullyApproved: false, reason: `Approval already ${approval.status}` };
    }

    if (new Date() > approval.expiresAt) {
      approval.status = 'expired';
      return { success: false, fullyApproved: false, reason: 'Approval request has expired' };
    }

    if (approval.requesterId === approverId) {
      return { success: false, fullyApproved: false, reason: 'Cannot approve your own request' };
    }

    const actionDetails = AIBrainAuthorizationService.DESTRUCTIVE_ACTIONS[approval.actionType];
    const approverLevel = ROLE_HIERARCHY[approverRole] || 0;
    const minApprovalLevel = ROLE_HIERARCHY[actionDetails?.minApprovalRole || 'root_admin'] || 0;

    if (approverLevel < minApprovalLevel) {
      return { success: false, fullyApproved: false, reason: `Insufficient authority. Requires ${actionDetails?.minApprovalRole}` };
    }

    if (approval.approvals.some(a => a.userId === approverId)) {
      return { success: false, fullyApproved: false, reason: 'Already approved by this user' };
    }

    approval.approvals.push({
      userId: approverId,
      role: approverRole,
      approvedAt: new Date(),
    });

    const fullyApproved = approval.approvals.length >= approval.requiredApprovals;
    
    if (fullyApproved) {
      approval.status = 'approved';
      console.log(`[GovernanceGate] Action ${approvalId} FULLY APPROVED`);
    }

    await this.logApprovalAction(approverId, approval.actionType, fullyApproved ? 'approved' : 'partial_approval', 
      `${approval.approvals.length}/${approval.requiredApprovals} approvals received`);

    return { 
      success: true, 
      fullyApproved, 
      reason: fullyApproved ? 'Action fully approved and ready to execute' : `${approval.approvals.length}/${approval.requiredApprovals} approvals received`
    };
  }

  async rejectDestructiveAction(approvalId: string, rejecterId: string, rejectorRole: string, reason: string): Promise<{ success: boolean; message: string }> {
    const approval = this.pendingApprovals.get(approvalId);
    
    if (!approval) {
      return { success: false, message: 'Approval request not found' };
    }

    if (approval.status !== 'pending') {
      return { success: false, message: `Approval already ${approval.status}` };
    }

    approval.status = 'rejected';
    
    await this.logApprovalAction(rejecterId, approval.actionType, 'rejected', reason);

    console.log(`[GovernanceGate] Action ${approvalId} REJECTED by ${rejecterId}`);

    return { success: true, message: `Action rejected: ${reason}` };
  }

  getPendingApprovals(): Array<{
    id: string;
    actionType: string;
    description: string;
    requesterId: string;
    requesterRole: string;
    targetEntity: string;
    reason: string;
    requestedAt: Date;
    expiresAt: Date;
    approvalsReceived: number;
    requiredApprovals: number;
  }> {
    const pending: any[] = [];
    const now = new Date();
    
    this.pendingApprovals.forEach((approval, id) => {
      if (approval.status === 'pending' && now < approval.expiresAt) {
        const actionDetails = AIBrainAuthorizationService.DESTRUCTIVE_ACTIONS[approval.actionType];
        pending.push({
          id,
          actionType: approval.actionType,
          description: actionDetails?.description || 'Unknown action',
          requesterId: approval.requesterId,
          requesterRole: approval.requesterRole,
          targetEntity: approval.targetEntity,
          reason: approval.reason,
          requestedAt: approval.requestedAt,
          expiresAt: approval.expiresAt,
          approvalsReceived: approval.approvals.length,
          requiredApprovals: approval.requiredApprovals,
        });
      }
    });
    
    return pending;
  }

  getApprovalStatus(approvalId: string): { found: boolean; status?: string; approvals?: number; required?: number } {
    const approval = this.pendingApprovals.get(approvalId);
    if (!approval) {
      return { found: false };
    }
    return {
      found: true,
      status: approval.status,
      approvals: approval.approvals.length,
      required: approval.requiredApprovals,
    };
  }

  private async logApprovalAction(userId: string, actionType: string, status: string, details: string): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        userId,
        action: 'governance_approval_gate',
        entityType: 'destructive_action',
        entityId: actionType,
        changes: {
          status,
          details,
          timestamp: new Date().toISOString(),
        }
      });
    } catch (error) {
      console.warn('[AIBrainAuthorizationService] Failed to log approval action:', error);
    }
  }

  cleanupExpiredApprovals(): number {
    const now = new Date();
    let cleaned = 0;
    
    this.pendingApprovals.forEach((approval, id) => {
      if (approval.status === 'pending' && now > approval.expiresAt) {
        approval.status = 'expired';
        cleaned++;
      }
    });
    
    console.log(`[GovernanceGate] Cleaned up ${cleaned} expired approvals`);
    return cleaned;
  }
}

export const aiBrainAuthorizationService = AIBrainAuthorizationService.getInstance();
