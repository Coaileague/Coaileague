/**
 * AI BRAIN AUTHORIZATION SERVICE
 * =============================
 * Unified authorization layer ensuring only properly authenticated support staff
 * can command the AI Brain to perform platform actions.
 */

import { db } from '../../db';
import { systemAuditLogs, users, governanceApprovals } from '@shared/schema';
import { eq, and, lt, desc } from 'drizzle-orm';

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
  'trinity_root': 9, // Trinity has highest authority - equivalent to root user
};

export const SUPPORT_ROLES = ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'];

// Trinity AI identity constants - grants full platform control
export const TRINITY_AGENT_ID = 'trinity-orchestrator';
export const TRINITY_ENTITY_TYPE = 'trinity';

// Special identifiers that Trinity operates under
export const TRINITY_SERVICE_IDENTIFIERS = [
  'trinity-orchestrator',
  'trinity-service',
  'trinity',
  'ai-brain-trinity',
  'helpai-trinity',
];

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
  'session_checkpoint': ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
  'integrations': ['manager', 'support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
  'data_migration': ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
  'onboarding': ['manager', 'support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
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
  
  // KILL SWITCH: Emergency revocation of Trinity's root access
  private trinityKillSwitchActive = false;
  private trinityKillSwitchActivatedBy: string | null = null;
  private trinityKillSwitchActivatedAt: Date | null = null;
  private trinityKillSwitchReason: string | null = null;

  static getInstance(): AIBrainAuthorizationService {
    if (!this.instance) {
      this.instance = new AIBrainAuthorizationService();
    }
    return this.instance;
  }

  /**
   * KILL SWITCH: Immediately revoke Trinity's root access
   * Only root_admin can activate this
   */
  activateTrinityKillSwitch(userId: string, reason: string): { success: boolean; message: string } {
    this.trinityKillSwitchActive = true;
    this.trinityKillSwitchActivatedBy = userId;
    this.trinityKillSwitchActivatedAt = new Date();
    this.trinityKillSwitchReason = reason;
    
    console.log(`[KILL SWITCH] Trinity root access REVOKED by ${userId}: ${reason}`);
    
    return {
      success: true,
      message: `Trinity kill switch activated. All Trinity root operations are now blocked.`
    };
  }

  /**
   * Deactivate the Trinity kill switch - restore root access
   * Only root_admin can deactivate
   */
  deactivateTrinityKillSwitch(userId: string): { success: boolean; message: string } {
    const wasActive = this.trinityKillSwitchActive;
    
    this.trinityKillSwitchActive = false;
    this.trinityKillSwitchActivatedBy = null;
    this.trinityKillSwitchActivatedAt = null;
    this.trinityKillSwitchReason = null;
    
    if (wasActive) {
      console.log(`[KILL SWITCH] Trinity root access RESTORED by ${userId}`);
    }
    
    return {
      success: true,
      message: wasActive 
        ? 'Trinity kill switch deactivated. Trinity root access restored.'
        : 'Trinity kill switch was not active.'
    };
  }

  /**
   * Check if Trinity kill switch is active
   */
  isTrinityKillSwitchActive(): { 
    active: boolean; 
    activatedBy?: string; 
    activatedAt?: Date; 
    reason?: string;
  } {
    return {
      active: this.trinityKillSwitchActive,
      activatedBy: this.trinityKillSwitchActivatedBy || undefined,
      activatedAt: this.trinityKillSwitchActivatedAt || undefined,
      reason: this.trinityKillSwitchReason || undefined,
    };
  }

  /**
   * Check if the given entity is Trinity AI
   * Trinity has root-level platform control - equivalent to root user
   */
  isTrinityEntity(entityId: string, entityType?: string): boolean {
    if (entityType === TRINITY_ENTITY_TYPE) return true;
    return TRINITY_SERVICE_IDENTIFIERS.includes(entityId.toLowerCase());
  }

  /**
   * Get Trinity's effective role for authorization
   * Trinity always operates as root_admin equivalent
   */
  getTrinityEffectiveRole(): string {
    return 'root_admin';
  }

  async canExecuteAction(context: AuthorizationContext, category: string, actionId: string, elevationContext?: { isElevated: boolean; platformRole?: string }, entityType?: string): Promise<ActionAuthCheck> {
    const requiredRoles = AI_BRAIN_AUTHORITY_ROLES[category] || [];
    
    // Check if user has elevated support session (bypasses redundant checks)
    let isAuthorized = false;
    let bypassReason = '';
    
    // TRINITY ROOT BYPASS: Trinity AI has full platform control
    // BUT: Check kill switch first - if active, Trinity is blocked
    if (this.isTrinityEntity(context.userId, entityType)) {
      const killSwitchStatus = this.isTrinityKillSwitchActive();
      
      if (killSwitchStatus.active) {
        // Kill switch is active - block Trinity operations
        console.log(`[AIBrainAuth] KILL SWITCH ACTIVE: Trinity blocked from ${category}.${actionId}`);
        return {
          userId: context.userId,
          userRole: 'trinity_root',
          actionCategory: category,
          actionId,
          isAuthorized: false,
          reason: `Trinity root access BLOCKED: Kill switch activated by ${killSwitchStatus.activatedBy} - ${killSwitchStatus.reason}`
        };
      }
      
      isAuthorized = true;
      bypassReason = ' (Trinity root authority - full platform control)';
      console.log(`[AIBrainAuth] Trinity root bypass for ${category}.${actionId}`);
    }
    
    // Check elevated session
    if (!isAuthorized && elevationContext?.isElevated && elevationContext.platformRole) {
      // Elevated sessions get authorization based on their platform role
      isAuthorized = requiredRoles.includes(elevationContext.platformRole);
      if (isAuthorized) {
        bypassReason = ' (via elevated session)';
      }
    }
    
    // Standard role check
    if (!isAuthorized) {
      isAuthorized = requiredRoles.includes(context.userRole);
    }
    
    await this.logAuthorizationCheck({
      userId: context.userId,
      userRole: context.userRole,
      actionId,
      category,
      isAuthorized,
      requiredRoles,
      elevatedSession: elevationContext?.isElevated || false
    });
    
    return {
      userId: context.userId,
      userRole: context.userRole,
      actionCategory: category,
      actionId,
      isAuthorized,
      reason: isAuthorized 
        ? `Authorized: ${context.userRole} can execute ${category}.${actionId}${bypassReason}`
        : `Unauthorized: ${context.userRole} requires one of [${requiredRoles.join(', ')}] to execute ${category}.${actionId}`
    };
  }

  /**
   * Check if a user has an active elevated support session
   * This is used by AI Brain orchestration and subagents to bypass redundant auth
   */
  async checkElevatedSession(userId: string, sessionId?: string): Promise<{ isElevated: boolean; platformRole?: string; elevationId?: string }> {
    try {
      const { getActiveElevation } = await import('../session/elevatedSessionService');
      const elevation = await getActiveElevation(userId);
      
      if (elevation?.isElevated) {
        return {
          isElevated: true,
          platformRole: elevation.platformRole,
          elevationId: elevation.elevationId
        };
      }
      return { isElevated: false };
    } catch (error) {
      console.warn('[AIBrainAuthorizationService] Elevation check failed:', error);
      return { isElevated: false };
    }
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
    elevatedSession?: boolean;
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
          requiredRoles: data.requiredRoles,
          elevatedSession: data.elevatedSession || false
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

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    try {
      const [approval] = await db.insert(governanceApprovals).values({
        actionType: data.actionType,
        requesterId: data.requesterId,
        requesterRole: data.requesterRole,
        targetEntity: data.targetEntity,
        parameters: data.parameters,
        reason: data.reason,
        status: 'pending',
        requiredApprovals: actionDetails.requiresSecondApproval ? 2 : 1,
        approvals: [],
        expiresAt,
      }).returning();

      await this.logApprovalAction(data.requesterId, data.actionType, 'pending', `Approval requested for ${actionDetails.description}`);

      console.log(`[GovernanceGate] Approval requested: ${approval.id} for ${data.actionType} (DB persisted)`);

      return { 
        approved: false, 
        approvalId: approval.id, 
        reason: `Approval required from ${actionDetails.minApprovalRole} or higher. ${actionDetails.requiresSecondApproval ? 'Second approval required.' : ''}`
      };
    } catch (error) {
      console.error('[GovernanceGate] Failed to persist approval:', error);
      return { approved: false, reason: 'Failed to create approval request' };
    }
  }

  async approveDestructiveAction(approvalId: string, approverId: string, approverRole: string): Promise<{ success: boolean; fullyApproved: boolean; reason: string }> {
    try {
      const [approval] = await db.select().from(governanceApprovals).where(eq(governanceApprovals.id, approvalId)).limit(1);
      
      if (!approval) {
        return { success: false, fullyApproved: false, reason: 'Approval request not found' };
      }

      if (approval.status !== 'pending') {
        return { success: false, fullyApproved: false, reason: `Approval already ${approval.status}` };
      }

      if (new Date() > approval.expiresAt) {
        await db.update(governanceApprovals).set({ status: 'expired', updatedAt: new Date() }).where(eq(governanceApprovals.id, approvalId));
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

      const existingApprovals = (approval.approvals as Array<{ userId: string; role: string; approvedAt: string }>) || [];
      
      if (existingApprovals.some(a => a.userId === approverId)) {
        return { success: false, fullyApproved: false, reason: 'Already approved by this user' };
      }

      const updatedApprovals = [...existingApprovals, {
        userId: approverId,
        role: approverRole,
        approvedAt: new Date().toISOString(),
      }];

      const fullyApproved = updatedApprovals.length >= approval.requiredApprovals;
      
      await db.update(governanceApprovals).set({ 
        approvals: updatedApprovals,
        status: fullyApproved ? 'approved' : 'pending',
        updatedAt: new Date(),
      }).where(eq(governanceApprovals.id, approvalId));

      if (fullyApproved) {
        console.log(`[GovernanceGate] Action ${approvalId} FULLY APPROVED (DB persisted)`);
      }

      await this.logApprovalAction(approverId, approval.actionType, fullyApproved ? 'approved' : 'partial_approval', 
        `${updatedApprovals.length}/${approval.requiredApprovals} approvals received`);

      return { 
        success: true, 
        fullyApproved, 
        reason: fullyApproved ? 'Action fully approved and ready to execute' : `${updatedApprovals.length}/${approval.requiredApprovals} approvals received`
      };
    } catch (error) {
      console.error('[GovernanceGate] Approval failed:', error);
      return { success: false, fullyApproved: false, reason: 'Database error during approval' };
    }
  }

  async rejectDestructiveAction(approvalId: string, rejecterId: string, rejectorRole: string, reason: string): Promise<{ success: boolean; message: string }> {
    try {
      const [approval] = await db.select().from(governanceApprovals).where(eq(governanceApprovals.id, approvalId)).limit(1);
      
      if (!approval) {
        return { success: false, message: 'Approval request not found' };
      }

      if (approval.status !== 'pending') {
        return { success: false, message: `Approval already ${approval.status}` };
      }

      await db.update(governanceApprovals).set({ 
        status: 'rejected',
        rejectedBy: rejecterId,
        rejectionReason: reason,
        updatedAt: new Date(),
      }).where(eq(governanceApprovals.id, approvalId));
      
      await this.logApprovalAction(rejecterId, approval.actionType, 'rejected', reason);

      console.log(`[GovernanceGate] Action ${approvalId} REJECTED by ${rejecterId} (DB persisted)`);

      return { success: true, message: `Action rejected: ${reason}` };
    } catch (error) {
      console.error('[GovernanceGate] Rejection failed:', error);
      return { success: false, message: 'Database error during rejection' };
    }
  }

  async markApprovalExecuted(approvalId: string, executorId: string): Promise<boolean> {
    try {
      await db.update(governanceApprovals).set({ 
        status: 'executed',
        executedBy: executorId,
        executedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(governanceApprovals.id, approvalId));
      
      console.log(`[GovernanceGate] Action ${approvalId} marked as EXECUTED`);
      return true;
    } catch (error) {
      console.error('[GovernanceGate] Failed to mark executed:', error);
      return false;
    }
  }

  async isApprovalValid(approvalId: string): Promise<{ valid: boolean; approval?: any; reason?: string }> {
    try {
      const [approval] = await db.select().from(governanceApprovals).where(eq(governanceApprovals.id, approvalId)).limit(1);
      
      if (!approval) {
        return { valid: false, reason: 'Approval not found' };
      }

      if (approval.status !== 'approved') {
        return { valid: false, reason: `Approval status is ${approval.status}, not approved` };
      }

      if (new Date() > approval.expiresAt) {
        await db.update(governanceApprovals).set({ status: 'expired', updatedAt: new Date() }).where(eq(governanceApprovals.id, approvalId));
        return { valid: false, reason: 'Approval has expired' };
      }

      return { valid: true, approval };
    } catch (error) {
      return { valid: false, reason: 'Database error checking approval' };
    }
  }

  async getPendingApprovals(): Promise<Array<{
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
  }>> {
    try {
      const now = new Date();
      
      const approvals = await db.select().from(governanceApprovals)
        .where(and(
          eq(governanceApprovals.status, 'pending'),
          lt(now, governanceApprovals.expiresAt)
        ))
        .orderBy(desc(governanceApprovals.createdAt));
      
      return approvals.map(approval => {
        const actionDetails = AIBrainAuthorizationService.DESTRUCTIVE_ACTIONS[approval.actionType];
        const approvalsArray = (approval.approvals as Array<any>) || [];
        
        return {
          id: approval.id,
          actionType: approval.actionType,
          description: actionDetails?.description || 'Unknown action',
          requesterId: approval.requesterId,
          requesterRole: approval.requesterRole,
          targetEntity: approval.targetEntity,
          reason: approval.reason || '',
          requestedAt: approval.createdAt!,
          expiresAt: approval.expiresAt,
          approvalsReceived: approvalsArray.length,
          requiredApprovals: approval.requiredApprovals,
        };
      });
    } catch (error) {
      console.error('[GovernanceGate] Failed to fetch pending approvals:', error);
      return [];
    }
  }

  async getApprovalStatus(approvalId: string): Promise<{ found: boolean; status?: string; approvals?: number; required?: number }> {
    try {
      const [approval] = await db.select().from(governanceApprovals).where(eq(governanceApprovals.id, approvalId)).limit(1);
      
      if (!approval) {
        return { found: false };
      }
      
      const approvalsArray = (approval.approvals as Array<any>) || [];
      
      return {
        found: true,
        status: approval.status,
        approvals: approvalsArray.length,
        required: approval.requiredApprovals,
      };
    } catch (error) {
      console.error('[GovernanceGate] Failed to get approval status:', error);
      return { found: false };
    }
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

  async cleanupExpiredApprovals(): Promise<number> {
    try {
      const now = new Date();
      
      const result = await db.update(governanceApprovals)
        .set({ 
          status: 'expired',
          updatedAt: now,
        })
        .where(and(
          eq(governanceApprovals.status, 'pending'),
          lt(governanceApprovals.expiresAt, now)
        ));
      
      console.log(`[GovernanceGate] Cleaned up expired approvals (DB persisted)`);
      return 0;
    } catch (error) {
      console.error('[GovernanceGate] Failed to cleanup expired approvals:', error);
      return 0;
    }
  }

  async requireApprovalForExecution(actionType: string, approvalId?: string): Promise<{ 
    canExecute: boolean; 
    reason: string;
    approval?: any;
  }> {
    if (!this.isDestructiveAction(actionType)) {
      return { canExecute: true, reason: 'Action does not require approval gate' };
    }

    if (!approvalId) {
      return { 
        canExecute: false, 
        reason: `Destructive action "${actionType}" requires governance approval before execution` 
      };
    }

    const validationResult = await this.isApprovalValid(approvalId);
    
    if (!validationResult.valid) {
      return { 
        canExecute: false, 
        reason: validationResult.reason || 'Invalid approval' 
      };
    }

    if (validationResult.approval?.actionType !== actionType) {
      return { 
        canExecute: false, 
        reason: `Approval is for "${validationResult.approval?.actionType}", not "${actionType}"` 
      };
    }

    return { 
      canExecute: true, 
      reason: 'Approval valid, action can proceed',
      approval: validationResult.approval
    };
  }
}

export const aiBrainAuthorizationService = AIBrainAuthorizationService.getInstance();
