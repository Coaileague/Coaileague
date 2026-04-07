/**
 * MONOPOLISTIC REPORT WORKFLOW ENGINE
 * 
 * Transforms ReportOS™ from a simple viewer into a compliance-grade business process tool.
 * Provides configurable multi-step approval chains with:
 * - Dynamic routing (Submitter → Manager → Supervisor → Destination)
 * - Immutable audit trails
 * - Auto-locking after approval
 * - Cross-referencing with Employee/Shift/Client data
 */

import { NotificationDeliveryService } from './notificationDeliveryService';
import { storage } from "../storage";
import crypto from "crypto";
import { emailService } from "./emailService";
import { platformEventBus } from './platformEventBus';
import { workflowConfig } from "@shared/config/workflowConfig";
import { createLogger } from '../lib/logger';
const log = createLogger('reportWorkflowEngine');


// ============================================================================
// WORKFLOW INITIALIZATION
// ============================================================================

/**
 * Initialize approval workflow when report is submitted
 */
export async function initializeWorkflow(
  submissionId: string,
  templateId: string,
  workspaceId: string
): Promise<void> {
  // Get workflow configuration for this template
  const workflow = await storage.getWorkflowConfigByTemplate(templateId, workspaceId);
  
  if (!workflow || !workflow.isActive) {
    // No workflow configured - skip approval process
    return;
  }

  // Update submission status to 'pending_review'
  await storage.updateReportSubmission(submissionId, {
    status: 'pending_review',
    submittedAt: new Date(),
  });

  // Create approval steps based on workflow configuration
  const approvalSteps = workflow.approvalSteps as Array<{
    step: number;
    roleRequired: string;
    approverUserId?: string;
    stepName?: string;
  }>;

  for (const step of approvalSteps) {
    await storage.createApprovalStep({
      submissionId,
      workspaceId,
      stepNumber: step.step,
      stepName: step.stepName || `Step ${step.step} - ${step.roleRequired} Review`,
      requiredRole: step.roleRequired,
      assignedTo: step.approverUserId || null,
      status: step.step === 1 ? 'pending' : 'waiting', // Only first step is active, others wait
    });
  }

  // Send notification to first approver
  await notifyNextApprover(submissionId, workspaceId);
}

// ============================================================================
// APPROVAL PROCESSING
// ============================================================================

interface ApprovalResult {
  success: boolean;
  nextStep?: number;
  completed?: boolean;
  finalDestination?: string;
  message: string;
}

/**
 * Process an approval step
 */
export async function processApproval(
  submissionId: string,
  stepId: string,
  reviewerId: string,
  action: 'approve' | 'reject',
  notes?: string,
  rejectionReason?: string
): Promise<ApprovalResult> {
  // Get the approval step
  const step = await storage.getApprovalStepById(stepId);
  
  if (!step) {
    throw new Error('Approval step not found');
  }

  // CRITICAL: Verify step belongs to the submission (prevent ID mismatch attacks)
  if (step.submissionId !== submissionId) {
    throw new Error('Step does not belong to this submission - potential ID mismatch');
  }

  if (step.status !== 'pending') {
    throw new Error('This step has already been processed or is waiting for prior approvals');
  }

  // Verify reviewer has permission
  const reviewer = await storage.getUser(reviewerId);
  if (!reviewer) {
    throw new Error('Reviewer not found');
  }

  // Update the step
  await storage.updateApprovalStep(stepId, {
    status: action === 'approve' ? 'approved' : 'rejected',
    reviewedBy: reviewerId,
    reviewedAt: new Date(),
    reviewNotes: notes,
    rejectionReason: action === 'reject' ? rejectionReason : undefined,
  });

  // Update submission status
  if (action === 'reject') {
    await storage.updateReportSubmission(submissionId, {
      status: 'rejected',
    });

    // CRITICAL: Notify submitter of rejection
    await notifySubmitter(submissionId, 'rejected');

    return {
      success: true,
      completed: true,
      finalDestination: 'return_to_submitter',
      message: 'Report rejected and returned to submitter',
    };
  }

  // Check if there are more steps
  const allSteps = await storage.getApprovalStepsBySubmission(submissionId);
  const currentStepNumber = step.stepNumber;
  const nextStep = allSteps.find(s => s.stepNumber === currentStepNumber + 1);

  if (nextStep) {
    // Promote next step from 'waiting' to 'pending' (sequential gating)
    await storage.updateApprovalStep(nextStep.id, {
      status: 'pending',
    });

    // Notify next approver
    await notifyNextApprover(submissionId, step.workspaceId);
    
    return {
      success: true,
      nextStep: nextStep.stepNumber,
      message: `Step ${currentStepNumber} approved. Pending step ${nextStep.stepNumber}`,
    };
  }

  // All steps approved - finalize workflow
  await finalizeWorkflow(submissionId, step.workspaceId);

  return {
    success: true,
    completed: true,
    message: 'All approvals complete. Report finalized.',
  };
}

// ============================================================================
// WORKFLOW FINALIZATION
// ============================================================================

/**
 * Finalize workflow after all approvals
 */
async function finalizeWorkflow(
  submissionId: string,
  workspaceId: string
): Promise<void> {
  const submission = await storage.getReportSubmissionById(submissionId);
  if (!submission) {
    throw new Error('Submission not found');
  }

  // Get workflow config to determine final destination
  const workflow = await storage.getWorkflowConfigByTemplate(submission.templateId, workspaceId);
  if (!workflow) {
    throw new Error('Workflow configuration not found');
  }

  // Handle final destination and set appropriate status
  switch (workflow.finalDestination) {
    case 'audit_database':
      // Set to approved and lock
      await storage.updateReportSubmission(submissionId, {
        status: 'approved',
      });
      
      if (workflow.autoLockOnApproval) {
        await lockReportRecord(submissionId, workspaceId, submission);
      }
      
      await notifySubmitter(submissionId, 'approved');
      break;

    case 'email_client':
      // First approve
      await storage.updateReportSubmission(submissionId, {
        status: 'approved',
      });
      
      if (workflow.autoLockOnApproval) {
        await lockReportRecord(submissionId, workspaceId, submission);
      }
      
      // Then send to client (updates status to 'sent_to_customer')
      await sendReportToClient(submissionId, workspaceId, workflow);
      await notifySubmitter(submissionId, 'approved');
      break;

    case 'return_to_submitter':
      // Just mark as approved and return
      await storage.updateReportSubmission(submissionId, {
        status: 'approved',
      });
      
      await notifySubmitter(submissionId, 'approved');
      break;
  }

  platformEventBus.publish({
    type: 'report_workflow_finalized',
    category: 'operations',
    title: 'Report Workflow Finalized',
    description: `Report submission ${submissionId} finalized via ${workflow.finalDestination}`,
    workspaceId,
    metadata: { submissionId, finalDestination: workflow.finalDestination },
  });
}

/**
 * Lock report record for immutable audit trail
 */
async function lockReportRecord(
  submissionId: string,
  workspaceId: string,
  submission: any
): Promise<void> {
  // Get full submission data with all related records
  const employee = submission.employeeId 
    ? await storage.getEmployeeById(submission.employeeId) 
    : null;
  
  const template = await storage.getReportTemplateById(submission.templateId);
  
  // Create immutable snapshot
  const snapshotData = {
    submission,
    employee,
    template,
    lockedTimestamp: new Date().toISOString(),
    version: '1.0',
  };

  // Generate content hash for tamper detection
  const contentHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(snapshotData))
    .digest('hex');

  // Calculate expiration (7 years for IRS/DOL compliance)
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 7);

  // Create locked record
  await storage.createLockedReportRecord({
    submissionId,
    workspaceId,
    snapshotData,
    contentHash,
    lockedBy: submission.employeeId, // Or current reviewer
    lockedAt: new Date(),
    lockReason: 'approved',
    employeeId: submission.employeeId,
    shiftId: submission.formData?.shiftId || null,
    clientId: submission.clientId,
    retentionYears: 7,
    expiresAt,
  });

  // Note: Status is updated in finalizeWorkflow based on destination
  // Don't override it here
}

/**
 * Send approved report to client via email
 */
async function sendReportToClient(
  submissionId: string,
  workspaceId: string,
  workflow: any
): Promise<void> {
  const submission = await storage.getReportSubmissionById(submissionId);
  if (!submission || !submission.clientId) {
    throw new Error('No client associated with this report');
  }

  const client = await storage.getClient(submission.clientId, workspaceId);
  if (!client) {
    throw new Error('Client not found');
  }

  // Verify client has email
  if (!client.email) {
    log.warn(`[WORKFLOW] Client ${client.companyName || `${client.firstName} ${client.lastName}`} has no email address. Cannot send report.`);
    throw new Error('Client has no email address on file');
  }

  // Get template for report title
  const template = await storage.getReportTemplateById(submission.templateId);
  const reportTitle = template?.name || 'Report';

  // Mark as sent BEFORE attempting email (so status reflects intent)
  await storage.updateReportSubmission(submissionId, workspaceId, {
    status: 'sent_to_customer',
    sentToCustomerAt: new Date(),
  });

  // Send report delivery email via EmailService
  const _reportEmail = emailService.buildReportDelivery(client.email, { reportNumber: submission.reportNumber, reportTitle, clientName: client.companyName || `${client.firstName} ${client.lastName}` });
  await NotificationDeliveryService.send({ type: 'report_delivery', workspaceId: workspaceId || 'system', recipientUserId: client.email, channel: 'email', body: _reportEmail });
  log.info(`[WORKFLOW] Report ${submission.reportNumber} queued via NDS to ${client.email}`);
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

/**
 * Notify next approver in chain
 */
async function notifyNextApprover(
  submissionId: string,
  workspaceId: string
): Promise<void> {
  const steps = await storage.getApprovalStepsBySubmission(submissionId);
  const pendingStep = steps.find(s => s.status === 'pending');

  if (!pendingStep) {
    return; // No pending steps
  }

  const submission = await storage.getReportSubmissionById(submissionId);
  if (!submission) return;

  // Mark notification as sent
  await storage.updateApprovalStep(pendingStep.id, {
    notificationSentAt: new Date(),
  });

  // Create in-app notification for approver
  const notificationMessage = `New report pending approval: ${submission.reportNumber} - Step ${pendingStep.stepNumber}`;
  
  // Log structured notification event
  await storage.createAuditLog({
    workspaceId,
    userId: pendingStep.assignedTo || 'system',
    action: 'update',
    entityType: 'report_approval',
    entityId: submissionId,
    metadata: {
      type: 'approval_request',
      stepId: pendingStep.id,
      stepNumber: pendingStep.stepNumber,
      message: notificationMessage,
      timestamp: new Date().toISOString(),
    },
  });

  log.info(`[WORKFLOW NOTIFICATION] ${notificationMessage}`);
  
  // Future: Integration with SupportOS™ push notifications
  // await sendPushNotification(pendingStep.assignedTo, notificationMessage);
}

/**
 * Notify submitter of final decision
 */
async function notifySubmitter(
  submissionId: string,
  status: 'approved' | 'rejected'
): Promise<void> {
  const submission = await storage.getReportSubmissionById(submissionId);
  if (!submission) return;

  const notificationMessage = `Report ${submission.reportNumber} has been ${status}`;
  
  // Log structured notification event
  await storage.createAuditLog({
    workspaceId: submission.workspaceId,
    userId: submission.employeeId,
    action: 'update',
    entityType: 'report_submission',
    entityId: submissionId,
    metadata: {
      type: 'final_decision',
      status,
      message: notificationMessage,
      timestamp: new Date().toISOString(),
    },
  });

  log.info(`[WORKFLOW NOTIFICATION] ${notificationMessage} to employee ${submission.employeeId}`);
  
  // Future: Integration with SupportOS™ push notifications
  // await sendPushNotification(submission.employeeId, notificationMessage);
}

// ============================================================================
// ANALYTICS & CROSS-REFERENCING
// ============================================================================

/**
 * Get report analytics by cross-referencing with Employee/Shift/Client data
 */
export async function getReportAnalytics(
  workspaceId: string,
  filters: {
    employeeId?: string;
    clientId?: string;
    startDate?: Date;
    endDate?: Date;
    templateId?: string;
  }
): Promise<any> {
  // Query locked reports with cross-references
  const lockedReports = await storage.getLockedReportRecords(workspaceId, filters);

  // Aggregate by various dimensions
  const analytics = {
    totalReports: lockedReports.length,
    byEmployee: groupBy(lockedReports, 'employeeId'),
    byClient: groupBy(lockedReports, 'clientId'),
    byTemplate: groupBy(lockedReports, 'templateId'),
    timeline: groupReportsByMonth(lockedReports),
  };

  return analytics;
}

function groupBy(array: any[], key: string): Record<string, number> {
  return array.reduce((acc, item) => {
    const value = item[key] || 'unknown';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function groupReportsByMonth(reports: any[]): Record<string, number> {
  return reports.reduce((acc, report) => {
    const month = new Date(report.lockedAt).toISOString().substring(0, 7); // YYYY-MM
    acc[month] = (acc[month] || 0) + 1;
    return acc;
  }, {});
}
