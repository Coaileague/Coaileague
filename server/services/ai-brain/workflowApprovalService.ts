/**
 * WORKFLOW APPROVAL SERVICE - Trinity Autonomous Fix Approval System
 * ===================================================================
 * Manages the approval workflow for Trinity's autonomous fixes:
 * - Creates approval requests from gap findings
 * - Sends push prompts to support roles via UNS
 * - Tracks approval/rejection with audit trail
 * - Integrates with notification system for real-time alerts
 * 
 * Part of Trinity's Full Platform Awareness initiative.
 */

import { db } from '../../db';
import { 
  aiWorkflowApprovals, 
  aiGapFindings,
  users, 
  employees, 
  notifications,
  platformRoles,
  InsertAiWorkflowApproval,
  AiWorkflowApproval,
} from '@shared/schema';
import { eq, and, desc, sql, inArray, gte, isNull, or } from 'drizzle-orm';
import { APPROVER_ROLES, ROLES } from '@shared/platformConfig';
import { helpaiOrchestrator } from '../helpai/platformActionHub';
import { platformEventBus, PlatformEvent } from '../platformEventBus';
import { GapFinding } from './subagents/domainOpsSubagents';
import { trinityOrchestration } from '../trinity/trinityOrchestrationAdapter';
import { universalNotificationEngine } from '../universalNotificationEngine';

import { createLogger } from '../../lib/logger';
const log = createLogger('WorkflowApprovalService');

// ============================================================================
// CONFIGURATION
// ============================================================================

interface ApprovalConfig {
  defaultExpiryHours: number;
  highRiskExpiryHours: number;
  criticalExpiryHours: number;
  autoApproveConfidence: number;
  notifyOnCreate: boolean;
  notifyOnApproval: boolean;
  notifyOnExpiry: boolean;
}

const DEFAULT_CONFIG: ApprovalConfig = {
  defaultExpiryHours: 48,
  highRiskExpiryHours: 24,
  criticalExpiryHours: 4,
  autoApproveConfidence: 0.98,
  notifyOnCreate: true,
  notifyOnApproval: true,
  notifyOnExpiry: true,
};

// Role hierarchy for approval requirements (highest → lowest authority)
const SUPPORT_ROLES = [
  'root_admin',
  'deputy_admin',
  'sysop',
  'support_manager',
  'support_agent',
];

// Risk level to required role mapping (must match SUPPORT_ROLES values)
const RISK_ROLE_REQUIREMENTS: Record<string, string> = {
  low: 'support_agent',
  medium: 'support_agent',
  high: 'support_manager',
  critical: 'sysop',
};

// ============================================================================
// WORKFLOW APPROVAL SERVICE
// ============================================================================

class WorkflowApprovalService {
  private static instance: WorkflowApprovalService;
  private config: ApprovalConfig;

  private constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }

  static getInstance(): WorkflowApprovalService {
    if (!this.instance) {
      this.instance = new WorkflowApprovalService();
    }
    return this.instance;
  }

  // ==========================================================================
  // APPROVAL REQUEST CREATION
  // ==========================================================================

  /**
   * Create an approval request from a gap finding
   */
  async createApprovalFromFinding(
    finding: GapFinding & { id?: number },
    proposedFix: {
      affectedFiles: string[];
      changes: any;
      rollbackPlan?: string;
    }
  ): Promise<AiWorkflowApproval | null> {
    try {
      const riskLevel = this.assessRiskLevel(finding, proposedFix);
      const requiredRole = RISK_ROLE_REQUIREMENTS[riskLevel] || 'support_manager';
      const expiryHours = this.getExpiryHours(riskLevel);
      const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

      const endUserSummary = this.generateEndUserSummary(finding, proposedFix);

      const [approval] = await db
        .insert(aiWorkflowApprovals)
        .values({
          workspaceId: 'system',
          gapFindingId: finding.id?.toString(),
          title: `Fix: ${finding.title.substring(0, 250)}`,
          description: `${finding.description}\n\nProposed fix will modify ${proposedFix.affectedFiles.length} file(s).`,
          endUserSummary,
          affectedFiles: proposedFix.affectedFiles,
          proposedChanges: proposedFix.changes,
          rollbackPlan: proposedFix.rollbackPlan || 'Git revert to previous commit',
          riskLevel,
          impactScope: this.determineImpactScope(proposedFix.affectedFiles),
          requiredRole,
          requiredApprovers: riskLevel === 'critical' ? 2 : 1,
          expiresAt,
          status: 'pending',
        })
        .returning();

      log.info(`[WorkflowApproval] Created approval request ${approval.id} for finding ${finding.id}`);

      // Mark finding as in progress
      if (finding.id) {
        await db
          .update(aiGapFindings)
          .set({ 
            status: 'in_progress',
          })
          .where(eq(aiGapFindings.id, String(finding.id)));
      }

      // Send notifications
      if (this.config.notifyOnCreate) {
        await this.notifySupportRoles(approval, 'created');
      }

      // Emit platform event
      await this.emitApprovalEvent('approval_created', approval);

      return approval;
    } catch (error) {
      log.error('[WorkflowApproval] Error creating approval:', error);
      return null;
    }
  }

  /**
   * Create a direct approval request (not from a finding)
   */
  async createApprovalRequest(params: {
    title: string;
    description: string;
    affectedFiles: string[];
    proposedChanges: any;
    rollbackPlan?: string;
    riskLevel?: string;
    workOrderId?: string;
  }): Promise<AiWorkflowApproval | null> {
    try {
      const riskLevel = params.riskLevel || 'medium';
      const requiredRole = RISK_ROLE_REQUIREMENTS[riskLevel] || 'support_manager';
      const expiryHours = this.getExpiryHours(riskLevel);
      const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

      const [approval] = await db
        .insert(aiWorkflowApprovals)
        .values({
          workspaceId: 'system',
          workOrderId: params.workOrderId,
          title: params.title.substring(0, 300),
          description: params.description,
          endUserSummary: `Trinity needs approval to: ${params.title}`,
          affectedFiles: params.affectedFiles,
          proposedChanges: params.proposedChanges,
          rollbackPlan: params.rollbackPlan || 'Git revert to previous commit',
          riskLevel,
          impactScope: this.determineImpactScope(params.affectedFiles),
          requiredRole,
          requiredApprovers: riskLevel === 'critical' ? 2 : 1,
          expiresAt,
          status: 'pending',
        })
        .returning();

      log.info(`[WorkflowApproval] Created direct approval request ${approval.id}`);

      if (this.config.notifyOnCreate) {
        await this.notifySupportRoles(approval, 'created');
      }

      await this.emitApprovalEvent('approval_created', approval);

      return approval;
    } catch (error) {
      log.error('[WorkflowApproval] Error creating direct approval:', error);
      return null;
    }
  }

  // ==========================================================================
  // APPROVAL/REJECTION HANDLING
  // ==========================================================================

  /**
   * Approve a workflow request
   */
  async approveRequest(
    approvalId: string,
    approvedBy: string,
    notes?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const [existing] = await db
        .select()
        .from(aiWorkflowApprovals)
        .where(eq(aiWorkflowApprovals.id, approvalId));

      if (!existing) {
        return { success: false, message: 'Approval request not found' };
      }

      if (existing.status !== 'pending') {
        return { success: false, message: `Request is already ${existing.status}` };
      }

      if (existing.expiresAt && new Date(existing.expiresAt) < new Date()) {
        await this.expireRequest(approvalId);
        return { success: false, message: 'Approval request has expired' };
      }

      // Verify approver has required role
      const hasRole = await this.verifyApproverRole(approvedBy, existing.requiredRole || 'support_manager');
      if (!hasRole) {
        return { success: false, message: `Insufficient role. Requires: ${existing.requiredRole}` };
      }

      await db
        .update(aiWorkflowApprovals)
        .set({
          status: 'approved',
          approvedBy,
          approvedAt: new Date(),
          approvalNotes: notes,
          updatedAt: new Date(),
        })
        .where(eq(aiWorkflowApprovals.id, approvalId));

      log.info(`[WorkflowApproval] Request ${approvalId} approved by ${approvedBy}`);

      if (this.config.notifyOnApproval) {
        await this.emitApprovalEvent('approval_approved', { ...existing, approvedBy });
      }

      const durationMs = existing.createdAt 
        ? Date.now() - new Date(existing.createdAt).getTime() 
        : 0;
      void trinityOrchestration.workflow.stepCompleted(
        `workflow-approval-${existing.workspaceId || 'global'}`,
        `approval-${approvalId}`,
        'approval_review_granted',
        1,
        approvalId,
        durationMs
      );

      return { success: true, message: 'Approval granted. I\'ll proceed with the fix now.' };
    } catch (error) {
      log.error('[WorkflowApproval] Error approving request:', error);
      return { success: false, message: 'Failed to process approval' };
    }
  }

  /**
   * Reject a workflow request
   */
  async rejectRequest(
    approvalId: string,
    rejectedBy: string,
    reason: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const [existing] = await db
        .select()
        .from(aiWorkflowApprovals)
        .where(eq(aiWorkflowApprovals.id, approvalId));

      if (!existing) {
        return { success: false, message: 'Approval request not found' };
      }

      if (existing.status !== 'pending') {
        return { success: false, message: `Request is already ${existing.status}` };
      }

      await db
        .update(aiWorkflowApprovals)
        .set({
          status: 'rejected',
          approvedBy: rejectedBy,
          approvedAt: new Date(),
          approvalNotes: `REJECTED: ${reason}`,
          updatedAt: new Date(),
        })
        .where(eq(aiWorkflowApprovals.id, approvalId));

      // Mark associated finding as needs_review
      if (existing.gapFindingId) {
        await db
          .update(aiGapFindings)
          .set({ status: 'open' })
          .where(eq(aiGapFindings.id, existing.gapFindingId));
      }

      log.info(`[WorkflowApproval] Request ${approvalId} rejected by ${rejectedBy}`);

      await this.emitApprovalEvent('approval_rejected', { ...existing, rejectedBy, reason });

      void trinityOrchestration.workflow.stepFailed(
        `workflow-approval-${existing.workspaceId || 'global'}`,
        `approval-${approvalId}`,
        'approval_review_rejected',
        reason,
        approvalId
      );

      return { success: true, message: 'Request rejected. Finding will remain open for manual review.' };
    } catch (error) {
      log.error('[WorkflowApproval] Error rejecting request:', error);
      return { success: false, message: 'Failed to process rejection' };
    }
  }

  /**
   * Mark request as executed
   */
  async markExecuted(
    approvalId: string,
    executionDetails?: string
  ): Promise<boolean> {
    try {
      const [current] = await db
        .select({ status: aiWorkflowApprovals.status })
        .from(aiWorkflowApprovals)
        .where(eq(aiWorkflowApprovals.id, approvalId))
        .limit(1);

      if (!current) {
        log.warn(`[WorkflowApproval] markExecuted: request ${approvalId} not found`);
        return false;
      }

      if (current.status !== 'approved') {
        log.warn(`[WorkflowApproval] markExecuted: request ${approvalId} is '${current.status}', not 'approved' — skipping`);
        return false;
      }

      await db
        .update(aiWorkflowApprovals)
        .set({
          status: 'executed',
          approvalNotes: sql`COALESCE(${aiWorkflowApprovals.approvalNotes}, '') || ${executionDetails ? `\n\nExecution: ${executionDetails}` : '\n\nExecuted successfully.'}`,
          updatedAt: new Date(),
        })
        .where(eq(aiWorkflowApprovals.id, approvalId));

      log.info(`[WorkflowApproval] Request ${approvalId} marked as executed`);
      return true;
    } catch (error) {
      log.error('[WorkflowApproval] Error marking as executed:', error);
      return false;
    }
  }

  /**
   * Expire a pending request
   */
  private async expireRequest(approvalId: string): Promise<void> {
    await db
      .update(aiWorkflowApprovals)
      .set({
        status: 'expired',
        approvalNotes: 'Automatically expired - no response received',
        updatedAt: new Date(),
      })
      .where(eq(aiWorkflowApprovals.id, approvalId));
  }

  // ==========================================================================
  // NOTIFICATION INTEGRATION
  // ==========================================================================

  /**
   * Notify users with support roles about an approval request
   * Respects workspace scoping - only notifies users within the workspace
   * Platform-level approvals notify platform admins only
   */
  private async notifySupportRoles(
    approval: AiWorkflowApproval,
    action: 'created' | 'reminder'
  ): Promise<number> {
    try {
      const targetWorkspaceId = (approval as any).workspaceId || 'platform';
      
      // Get users with appropriate support roles scoped to workspace
      let supportUsers: { id: string; email: string | null; role: string | null; workspaceRole: string | null }[] = [];
      
      if (targetWorkspaceId === 'platform') {
        // Platform-level: query platformRoles table for active platform staff
        const roleRows = await db
          .select({ userId: platformRoles.userId, role: platformRoles.role })
          .from(platformRoles)
          .where(
            and(
              inArray(platformRoles.role, SUPPORT_ROLES as any),
              isNull(platformRoles.revokedAt),
              eq(platformRoles.isSuspended, false)
            )
          );
        const userIds = roleRows.map(r => r.userId);
        if (userIds.length > 0) {
          const userRows = await db
            .select({ id: users.id, email: users.email })
            .from(users)
            .where(inArray(users.id, userIds));
          supportUsers = userRows.map(u => ({
            ...u,
            role: roleRows.find(r => r.userId === u.id)?.role || null,
            workspaceRole: null,
          }));
        }
      } else {
        // Workspace-scoped: check employee workspace roles only
        supportUsers = await db
          .select({
            id: users.id,
            email: users.email,
            role: users.role,
            workspaceRole: employees.workspaceRole,
          })
          .from(users)
          .innerJoin(employees, eq(employees.userId, users.id))
          .where(and(
            eq(employees.workspaceId, targetWorkspaceId),
            inArray(employees.workspaceRole, [...APPROVER_ROLES, ROLES.SUPERVISOR])
          ));
      }

      if (supportUsers.length === 0) {
        log.warn(`[WorkflowApproval] No support users found for workspace ${targetWorkspaceId}`);
        // Escalate: emit event for monitoring
        await this.emitApprovalEvent('no_approvers_available', { 
          approvalId: approval.id, 
          workspaceId: targetWorkspaceId 
        });
        return 0;
      }

      const title = action === 'created' 
        ? 'Trinity Needs Approval'
        : 'Approval Reminder';
      
      const message = action === 'created'
        ? `${approval.endUserSummary || approval.title}. Risk: ${approval.riskLevel}. Expires in ${this.getExpiryHours(approval.riskLevel || 'medium')} hours.`
        : `Pending approval: ${approval.title}. Please review before expiry.`;

      // Filter users based on role hierarchy
      const eligibleUsers = supportUsers.filter(user => {
        const platformRoleIndex = SUPPORT_ROLES.indexOf(user.role || '');
        const requiredRoleIndex = SUPPORT_ROLES.indexOf(approval.requiredRole || 'support_manager');
        const hasWorkspaceAuthority = ['org_owner', 'co_owner', 'manager', 'supervisor'].includes(user.workspaceRole || '');
        
        // Allow if platform role is sufficient OR has workspace authority
        if (platformRoleIndex === -1 && !hasWorkspaceAuthority) {
          return false;
        }
        if (platformRoleIndex > requiredRoleIndex && !hasWorkspaceAuthority) {
          return false;
        }
        return true;
      });

      // Route through UNE for AI enrichment and unified handling
      let notified = 0;
      for (const user of eligibleUsers) {
        try {
          const result = await universalNotificationEngine.sendNotification({
            workspaceId: targetWorkspaceId,
            userId: user.id,
            type: 'ai_approval_needed',
            title,
            message,
            severity: approval.riskLevel === 'critical' ? 'error' : approval.riskLevel === 'high' ? 'warning' : 'info',
            actionUrl: `/admin/approvals/${approval.id}`,
            metadata: {
              approvalId: approval.id,
              riskLevel: approval.riskLevel,
              requiredRole: approval.requiredRole,
              expiresAt: approval.expiresAt,
              action,
              relatedEntityType: 'workflow_approval',
              relatedEntityId: approval.id,
              skipFeatureCheck: true, // AI approval notifications bypass feature validation
            },
          });
          if (result.success) notified++;
        } catch (notifyError) {
          log.error(`[WorkflowApproval] Failed to notify user ${user.id}:`, notifyError);
        }
      }

      log.info(`[WorkflowApproval] UNE notified ${notified} users in workspace ${targetWorkspaceId} about approval ${approval.id}`);
      return notified;
    } catch (error) {
      log.error('[WorkflowApproval] Error notifying support roles:', error);
      // Emit error event for monitoring instead of silent failure
      await this.emitApprovalEvent('notification_error', { 
        approvalId: approval.id, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return 0;
    }
  }

  // ==========================================================================
  // QUERY METHODS
  // ==========================================================================

  /**
   * Get pending approvals
   */
  async getPendingApprovals(limit: number = 50): Promise<AiWorkflowApproval[]> {
    return db
      .select()
      .from(aiWorkflowApprovals)
      .where(eq(aiWorkflowApprovals.status, 'pending'))
      .orderBy(desc(aiWorkflowApprovals.createdAt))
      .limit(limit);
  }

  /**
   * Get approvals by status
   */
  async getApprovalsByStatus(status: string, limit: number = 50): Promise<AiWorkflowApproval[]> {
    return db
      .select()
      .from(aiWorkflowApprovals)
      .where(eq(aiWorkflowApprovals.status, status as any))
      .orderBy(desc(aiWorkflowApprovals.createdAt))
      .limit(limit);
  }

  /**
   * Get approval by ID
   */
  async getApprovalById(id: string): Promise<AiWorkflowApproval | null> {
    const [approval] = await db
      .select()
      .from(aiWorkflowApprovals)
      .where(eq(aiWorkflowApprovals.id, id));
    return approval || null;
  }

  /**
   * Check for expired approvals and update status
   */
  async processExpiredApprovals(): Promise<number> {
    try {
      const result = await db
        .update(aiWorkflowApprovals)
        .set({
          status: 'expired',
          approvalNotes: 'Automatically expired - approval window closed',
          updatedAt: new Date(),
        })
        .where(and(
          eq(aiWorkflowApprovals.status, 'pending'),
          sql`${aiWorkflowApprovals.expiresAt} < NOW()`
        ))
        .returning({ id: aiWorkflowApprovals.id });

      if (result.length > 0) {
        log.info(`[WorkflowApproval] Expired ${result.length} approval requests`);
        
        for (const expired of result) {
          await this.emitApprovalEvent('approval_expired', { id: expired.id });
        }
      }

      return result.length;
    } catch (error) {
      log.error('[WorkflowApproval] Error processing expired approvals:', error);
      return 0;
    }
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private assessRiskLevel(
    finding: GapFinding,
    proposedFix: { affectedFiles: string[]; changes: any }
  ): string {
    // Base on severity
    if (finding.severity === 'critical' || finding.severity === 'blocker') {
      return 'critical';
    }
    
    // Check affected files
    const criticalPatterns = ['schema.ts', 'auth', 'payment', 'stripe', 'security'];
    const hasCriticalFile = proposedFix.affectedFiles.some(f => 
      criticalPatterns.some(p => f.toLowerCase().includes(p))
    );
    if (hasCriticalFile) {
      return 'high';
    }

    // Multiple files = higher risk
    if (proposedFix.affectedFiles.length > 5) {
      return 'high';
    }
    if (proposedFix.affectedFiles.length > 2) {
      return 'medium';
    }

    if (finding.severity === 'error') {
      return 'medium';
    }

    return 'low';
  }

  private getExpiryHours(riskLevel: string): number {
    switch (riskLevel) {
      case 'critical':
        return this.config.criticalExpiryHours;
      case 'high':
        return this.config.highRiskExpiryHours;
      default:
        return this.config.defaultExpiryHours;
    }
  }

  private determineImpactScope(affectedFiles: string[]): string {
    if (affectedFiles.length === 1) return 'single_file';
    if (affectedFiles.length <= 3) return 'feature';
    if (affectedFiles.length <= 10) return 'module';
    return 'platform_wide';
  }

  private generateEndUserSummary(
    finding: GapFinding,
    proposedFix: { affectedFiles: string[]; changes: any }
  ): string {
    const action = finding.gapType.includes('error') ? 'fix an error' : 'improve code';
    const scope = proposedFix.affectedFiles.length === 1 
      ? `in ${proposedFix.affectedFiles[0].split('/').pop()}`
      : `across ${proposedFix.affectedFiles.length} files`;
    
    return `Trinity wants to ${action} ${scope}. Issue: ${finding.title.substring(0, 100)}`;
  }

  private async verifyApproverRole(userId: string, requiredRole: string): Promise<boolean> {
    try {
      const [roleRow] = await db
        .select({ role: platformRoles.role })
        .from(platformRoles)
        .where(
          and(
            eq(platformRoles.userId, userId),
            isNull(platformRoles.revokedAt),
            eq(platformRoles.isSuspended, false)
          )
        )
        .limit(1);

      if (!roleRow) return false;

      const userRoleIndex = SUPPORT_ROLES.indexOf(roleRow.role);
      const requiredRoleIndex = SUPPORT_ROLES.indexOf(requiredRole);

      // Lower index = higher permission
      return userRoleIndex !== -1 && userRoleIndex <= requiredRoleIndex;
    } catch {
      return false;
    }
  }

  private async emitApprovalEvent(eventType: string, data: any): Promise<void> {
    // Map internal event types to valid PlatformEventType
    const eventTypeMap: Record<string, string> = {
      'approval_created': 'trinity_fix_proposed',
      'approval_approved': 'approval_approved',
      'approval_rejected': 'approval_rejected',
      'no_approvers_available': 'trinity_escalation_required',
    };
    
    const mappedType = eventTypeMap[eventType] || 'automation_completed';
    
    const event: PlatformEvent = {
      type: mappedType as PlatformEvent['type'],
      category: 'automation',
      title: `Workflow Approval: ${eventType.replace('approval_', '')}`,
      description: data.title || `Approval ${data.id}`,
      metadata: {
        approvalId: data.id,
        riskLevel: data.riskLevel,
        status: data.status,
        timestamp: new Date().toISOString(),
      },
      visibility: 'org_leadership',
    };

    try {
      await platformEventBus.publish(event);
    } catch (error) {
      log.error('[WorkflowApproval] Failed to emit event:', error);
    }
  }

  // ==========================================================================
  // AI BRAIN ACTIONS
  // ==========================================================================

  registerActions(): void {
    const self = this;
    const actions = [
      { id: 'workflow_approval.create', name: 'Create Approval', desc: 'Create a new workflow approval request', 
        fn: (p: any) => self.createApprovalRequest({ title: p.title, description: p.description, affectedFiles: p.affectedFiles || [], proposedChanges: p.proposedChanges || {}, rollbackPlan: p.rollbackPlan, riskLevel: p.riskLevel, workOrderId: p.workOrderId }) },
      { id: 'workflow_approval.approve', name: 'Approve Request', desc: 'Approve a pending workflow request', fn: (p: any) => self.approveRequest(p.approvalId, p.userId, p.notes) },
      { id: 'workflow_approval.reject', name: 'Reject Request', desc: 'Reject a pending workflow request', fn: (p: any) => self.rejectRequest(p.approvalId, p.userId, p.reason) },
      { id: 'workflow_approval.get_pending', name: 'Get Pending', desc: 'Get pending workflow approval requests', fn: (p: any) => self.getPendingApprovals(p?.limit || 50) },
      { id: 'workflow_approval.get_by_id', name: 'Get By ID', desc: 'Get a specific approval request by ID', fn: (p: any) => self.getApprovalById(p.approvalId) },
      { id: 'workflow_approval.process_expired', name: 'Process Expired', desc: 'Process and mark expired approval requests', fn: () => self.processExpiredApprovals() },
      { id: 'workflow_approval.mark_executed', name: 'Mark Executed', desc: 'Mark an approved request as executed', fn: (p: any) => self.markExecuted(p.approvalId, p.details) },
    ];

    for (const action of actions) {
      helpaiOrchestrator.registerAction({
        actionId: action.id,
        name: action.name,
        category: 'automation',
        description: action.desc,
        requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
        handler: async (request) => {
          const startTime = Date.now();
          const result = await action.fn(request.payload || {});
          return {
            success: true,
            actionId: request.actionId,
            message: `${action.name} completed`,
            data: result,
            executionTimeMs: Date.now() - startTime,
          };
        },
      });
    }

    log.info('[WorkflowApproval] Registered 7 AI Brain actions');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const workflowApprovalService = WorkflowApprovalService.getInstance();

export async function initializeWorkflowApproval(): Promise<void> {
  log.info('[WorkflowApproval] Initializing Workflow Approval Service...');
  workflowApprovalService.registerActions();
  log.info('[WorkflowApproval] Workflow Approval Service initialized');
}

export { WorkflowApprovalService };
