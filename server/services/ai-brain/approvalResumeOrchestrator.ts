/**
 * APPROVAL RESUME ORCHESTRATOR
 * ============================
 * Handles the resume-after-approval flow for paused automation jobs.
 * 
 * When governance pauses a job requiring human approval:
 * 1. Sends email notification to approvers
 * 2. Monitors approval status
 * 3. Resumes paused job when approved
 * 4. Handles rejection and expiry
 */

import { db } from '../../db';
import {
  aiWorkflowApprovals,
  idempotencyKeys,
  employees,
  users,
  workspaces,
} from '@shared/schema';
import { eq, and, inArray, isNotNull } from 'drizzle-orm';
import { OWNER_ROLES } from '@shared/platformConfig';
import { sendAutomationEmail } from '../emailService';
import { createNotification } from '../notificationService';
import { platformEventBus } from '../platformEventBus';
import { helpaiOrchestrator } from '../helpai/platformActionHub';
import { trinityThoughtEngine } from './trinityThoughtEngine';
import { createLogger } from '../../lib/logger';
const log = createLogger('approvalResumeOrchestrator');

// ============================================================================
// TYPES
// ============================================================================

export interface ApprovalRequest {
  approvalId: string;
  workspaceId: string;
  domain: 'scheduling' | 'payroll' | 'invoicing' | 'hotpatch';
  operationType: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  idempotencyKeyId?: string;
  estimatedImpact?: string;
  affectedRecords?: number;
}

export interface ApprovalDecisionResult {
  approved: boolean;
  approvedBy?: string;
  rejectionReason?: string;
  executedAt?: Date;
}

// ============================================================================
// APPROVAL RESUME ORCHESTRATOR
// ============================================================================

class ApprovalResumeOrchestrator {
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    log.info('[ApprovalResumeOrchestrator] Initializing...');
  }

  /**
   * Request approval and send email notifications
   */
  async requestApproval(request: ApprovalRequest): Promise<string> {
    const { approvalId, workspaceId, domain, operationType, description, riskLevel } = request;

    // Get workspace info
    const [workspace] = await db.select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    const workspaceName = workspace?.name || 'Unknown Workspace';

    // Get approvers (org_owner and co_owner)
    const approvers = await db.select({
      userId: employees.userId,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
    })
      .from(employees)
      .innerJoin(users, eq(employees.userId, users.id))
      .where(
        and(
          eq(employees.workspaceId, workspaceId),
          inArray(employees.workspaceRole, [...OWNER_ROLES])
        )
      );

    if (approvers.length === 0) {
      log.warn(`[ApprovalResumeOrchestrator] No approvers found for workspace ${workspaceId}`);
      return approvalId;
    }

    // Create approval record if not exists
    const existingApproval = await db.select()
      .from(aiWorkflowApprovals)
      .where(eq(aiWorkflowApprovals.id, approvalId))
      .limit(1);

    if (existingApproval.length === 0) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await db.insert(aiWorkflowApprovals).values({
        workspaceId: 'system',
        id: approvalId,
        title: `${domain.toUpperCase()} Automation Approval Required`,
        description,
        endUserSummary: `Automated ${domain} operation for ${workspaceName} requires your approval.`,
        riskLevel,
        impactScope: request.estimatedImpact || 'workspace',
        status: 'pending',
        requiredRole: 'co_owner',
        requiredApprovers: 1,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      });
    }

    // Send email notifications to all approvers
    const approvalUrl = `/approvals/${approvalId}`;
    
    for (const approver of approvers) {
      if (approver.email) {
        try {
          // @ts-expect-error — TS migration: fix in refactoring sprint
          await sendAutomationEmail('approval_required', approver.email, {
            userName: approver.firstName || 'Admin',
            automationType: domain,
            workspaceName,
            description,
            riskLevel,
            approvalUrl,
            expiresIn: '24 hours',
          });
          
          log.info(`[ApprovalResumeOrchestrator] Sent approval email to ${approver.email}`);
        } catch (error) {
          log.error(`[ApprovalResumeOrchestrator] Failed to send email to ${approver.email}:`, error);
        }
      }

      // Also create in-app notification
      if (approver.userId) {
        await createNotification({
          workspaceId,
          userId: approver.userId,
          type: 'approval_required' as any,
          title: `Approval Required: ${domain} Automation`,
          message: description,
          actionUrl: approvalUrl,
          relatedEntityType: 'approval',
          relatedEntityId: approvalId,
          metadata: { domain, riskLevel, operationType },
          createdBy: 'system-trinity',
          idempotencyKey: `approval_required-${approvalId}-${approver.userId}`
        });
      }
    }

    // Record Trinity thought about requesting approval
    await trinityThoughtEngine.think(
      'execution',
      'decision',
      `Requested human approval for ${domain} automation in ${workspaceName}. Risk level: ${riskLevel}. Notified ${approvers.length} approver(s).`,
      0.95,
      { workspaceId, relatedActionId: approvalId }
    );

    log.info(`[ApprovalResumeOrchestrator] Approval requested: ${approvalId}, notified ${approvers.length} approvers`);
    return approvalId;
  }

  /**
   * Process an approval decision
   */
  async processDecision(
    approvalId: string,
    approved: boolean,
    userId: string,
    notes?: string
  ): Promise<ApprovalDecisionResult> {
    const [approval] = await db.select()
      .from(aiWorkflowApprovals)
      .where(eq(aiWorkflowApprovals.id, approvalId))
      .limit(1);

    if (!approval) {
      throw new Error(`Approval ${approvalId} not found`);
    }

    if (approval.status !== 'pending') {
      throw new Error(`Approval ${approvalId} is no longer pending (status: ${approval.status})`);
    }

    const now = new Date();

    if (approved) {
      // Update approval as approved
      await db.update(aiWorkflowApprovals)
        .set({
          status: 'approved',
          approvedBy: userId,
          approvedAt: now,
          approvalNotes: notes,
          updatedAt: now,
        })
        .where(eq(aiWorkflowApprovals.id, approvalId));

      // Resume the paused job
      await this.resumePausedJob(approvalId);

      // Record Trinity thought
      await trinityThoughtEngine.think(
        'execution',
        'observation',
        `Approval ${approvalId} granted by user ${userId}. Resuming paused automation.`,
        0.9,
        { relatedActionId: approvalId }
      );

      // Fix: was .emit() — approval_granted never reached subscribers (autonomousFixPipeline subscribes
      // to 'approval_approved' not 'approval_granted', and emit() doesn't reach subscribe() handlers anyway).
      // Now publish() with correct type 'approval_approved' so the fix pipeline resumes paused jobs.
      platformEventBus.publish({
        type: 'approval_approved',
        category: 'automation',
        title: 'Approval Granted — Resuming Workflow',
        description: `Approval ${approvalId} granted by user ${userId}. Queued jobs will now resume.`,
        metadata: {
          approvalId,
          approvedBy: userId,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          audience: 'manager',
        },
      }).catch((err: any) => log.warn('[ApprovalResumeOrchestrator] Failed to publish approval_approved:', err.message));

      return { approved: true, approvedBy: userId, executedAt: now };
    } else {
      // Update approval as rejected
      await db.update(aiWorkflowApprovals)
        .set({
          status: 'rejected',
          rejectedBy: userId,
          rejectedAt: now,
          rejectionReason: notes || 'Rejected by administrator',
          updatedAt: now,
        })
        .where(eq(aiWorkflowApprovals.id, approvalId));

      // Mark idempotency key as rejected (if exists)
      await this.markJobRejected(approvalId, notes || 'Rejected by administrator');

      // Record Trinity thought
      await trinityThoughtEngine.think(
        'execution',
        'observation',
        `Approval ${approvalId} rejected by user ${userId}. Reason: ${notes || 'Not specified'}`,
        0.9,
        { relatedActionId: approvalId }
      );

      return { approved: false, rejectionReason: notes };
    }
  }

  /**
   * Resume a paused job after approval
   */
  private async resumePausedJob(approvalId: string): Promise<void> {
    // Find idempotency keys with this approval ID
    const pausedKeys = await db.select()
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.status, 'pending_approval'),
          isNotNull(idempotencyKeys.resultMetadata)
        )
      );

    for (const key of pausedKeys) {
      const metadata = key.resultMetadata as any;
      if (metadata?.governanceApprovalId === approvalId) {
        // Update status to allow retry
        await db.update(idempotencyKeys)
          .set({
            // @ts-expect-error — TS migration: fix in refactoring sprint
            status: 'retry_approved',
            resultMetadata: {
              ...metadata,
              approvedAt: new Date().toISOString(),
              resumedFromApproval: approvalId,
            },
          })
          .where(eq(idempotencyKeys.id, key.id));

        log.info(`[ApprovalResumeOrchestrator] Marked job ${key.id} for retry after approval`);

        // Fix: was .emit() — job_resume_approved never reached any scheduler subscriber.
        // Now .publish() so the approval_approved pipeline picks up the retry job.
        platformEventBus.publish({
          type: 'job_resume_approved',
          category: 'automation',
          title: 'Paused Job Cleared for Retry',
          description: `Job ${key.id} (${key.operationType}) approved for retry after approval gate ${approvalId}`,
          workspaceId: key.workspaceId || undefined,
          metadata: {
            idempotencyKeyId: key.id,
            operationType: key.operationType,
            approvalId,
            // @ts-expect-error — TS migration: fix in refactoring sprint
            audience: 'manager',
          },
        }).catch((err: any) => log.warn('[ApprovalResumeOrchestrator] Failed to publish job_resume_approved:', err.message));
      }
    }
  }

  /**
   * Mark a job as rejected
   */
  private async markJobRejected(approvalId: string, reason: string): Promise<void> {
    const pausedKeys = await db.select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.status, 'pending_approval'));

    for (const key of pausedKeys) {
      const metadata = key.resultMetadata as any;
      if (metadata?.governanceApprovalId === approvalId) {
        await db.update(idempotencyKeys)
          .set({
            // @ts-expect-error — TS migration: fix in refactoring sprint
            status: 'rejected',
            errorMessage: reason,
            resultMetadata: {
              ...metadata,
              rejectedAt: new Date().toISOString(),
              rejectionReason: reason,
            },
          })
          .where(eq(idempotencyKeys.id, key.id));

        log.info(`[ApprovalResumeOrchestrator] Marked job ${key.id} as rejected`);
      }
    }
  }

  /**
   * Check for expired approvals
   */
  async checkExpiredApprovals(): Promise<void> {
    const now = new Date();
    
    const expiredApprovals = await db.select()
      .from(aiWorkflowApprovals)
      .where(
        and(
          eq(aiWorkflowApprovals.status, 'pending'),
          isNotNull(aiWorkflowApprovals.expiresAt)
        )
      );

    for (const approval of expiredApprovals) {
      if (approval.expiresAt && new Date(approval.expiresAt) < now) {
        await db.update(aiWorkflowApprovals)
          .set({
            status: 'expired',
            updatedAt: now,
          })
          .where(eq(aiWorkflowApprovals.id, approval.id));

        await this.markJobRejected(approval.id, 'Approval expired');

        log.info(`[ApprovalResumeOrchestrator] Approval ${approval.id} expired`);
      }
    }
  }

  /**
   * Get pending approvals for a workspace
   */
  async getPendingApprovals(workspaceId?: string): Promise<any[]> {
    const conditions = workspaceId
      ? and(
          eq(aiWorkflowApprovals.status, 'pending'),
          // Would need to join with related workspace
        )
      : eq(aiWorkflowApprovals.status, 'pending');

    return db.select()
      .from(aiWorkflowApprovals)
      .where(eq(aiWorkflowApprovals.status, 'pending'))
      .orderBy(aiWorkflowApprovals.createdAt);
  }

  /**
   * Start the approval monitoring loop
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.checkInterval = setInterval(async () => {
      try {
        const { isDbCircuitOpen } = await import('../../db');
        if (isDbCircuitOpen()) return;
      } catch { /* ignore */ }
      this.checkExpiredApprovals().catch(err => {
        log.warn('[ApprovalResumeOrchestrator] Check cycle failed (will retry next interval):', err?.message || err);
      });
    }, 60000);

    log.info('[ApprovalResumeOrchestrator] Started monitoring approvals');
  }

  /**
   * Stop the monitoring loop
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    log.info('[ApprovalResumeOrchestrator] Stopped monitoring');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const approvalResumeOrchestrator = new ApprovalResumeOrchestrator();

// ============================================================================
// AI BRAIN ACTION REGISTRATION
// ============================================================================

export function registerApprovalResumeActions() {
  const actions = [
    {
      id: 'resume_approval.request',
      name: 'Request Resume Approval',
      description: 'Request human approval for resuming an interrupted automation workflow',
      handler: async (params: any) => {
        return approvalResumeOrchestrator.requestApproval(params);
      },
    },
    {
      id: 'resume_approval.decide',
      name: 'Process Resume Decision',
      description: 'Process an approval or rejection decision for workflow resumption',
      handler: async (params: any) => {
        return approvalResumeOrchestrator.processDecision(
          params.approvalId,
          params.approved,
          params.userId,
          params.notes
        );
      },
    },
    {
      id: 'resume_approval.get_pending',
      name: 'Get Pending Resume Approvals',
      description: 'Get list of pending workflow resume approvals',
      handler: async (params: any) => {
        return approvalResumeOrchestrator.getPendingApprovals(params.workspaceId);
      },
    },
    {
      id: 'resume_approval.check_expired',
      name: 'Check Expired Resume Approvals',
      description: 'Check and expire old pending resume approvals',
      handler: async () => {
        await approvalResumeOrchestrator.checkExpiredApprovals();
        return { checked: true };
      },
    },
  ];

  for (const action of actions) {
    helpaiOrchestrator.registerAction({
      actionId: action.id,
      name: action.name,
      category: 'automation',
      description: action.description,
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request) => {
        const startTime = Date.now();
        const result = await action.handler(request.payload || {});
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

  log.info(`[ApprovalResumeOrchestrator] Registered ${actions.length} resume_approval.* actions`);
}
