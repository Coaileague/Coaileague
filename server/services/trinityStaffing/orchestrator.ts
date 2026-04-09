/**
 * TRINITY STAFFING ORCHESTRATOR
 * ==============================
 * Main orchestration service for automated staffing workflow.
 * 
 * NOW USES 7-STEP PATTERN:
 * TRIGGER → FETCH → VALIDATE → PROCESS → MUTATE → CONFIRM → NOTIFY
 * 
 * Coordinates the complete flow:
 * 1. Email ingestion and classification
 * 2. Work request parsing
 * 3. Shift creation
 * 4. Employee matching and assignment
 * 5. Client confirmation
 * 6. Escalation management
 * 
 * ARCHITECTURE NOTE (Consolidation):
 * ===================================
 * This service uses IN-MEMORY storage for rapid iteration.
 * For database-persisted staffing workflows, use InboundOpportunityAgent
 * which is the CANONICAL path for:
 * - Email ingestion with DB persistence (inboundEmails table)
 * - Staged shift creation (stagedShifts table)
 * - Automated shift offers (automatedShiftOffers table)
 * 
 * TrinityStaffingOrchestrator is suited for:
 * - Quick prototyping and testing
 * - In-memory workflow state management
 * - Integration with Trinity AI chat interface
 * 
 * InboundOpportunityAgent is suited for:
 * - Production email processing with persistence
 * - Multi-stage workflow with audit trail
 * - Integration with ExecutionPipeline billing
 */

import crypto from 'crypto';
import { db } from '../../db';
import { shifts, employees, clients, workspaces } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { workRequestParser, type ParsedWorkRequest } from './workRequestParser';
import { escalationChainService, type EscalationState } from './escalationChainService';
import { clientConfirmationService, type ConfirmationEmailData } from './clientConfirmationService';
import { premiumFeatureGating } from '../premiumFeatureGating';
import { CREDIT_COSTS } from '../billing/creditManager';
import { emailService } from '../emailService';
import { universalStepLogger } from '../orchestration/universalStepLogger';
import { MANAGER_ROLES } from '@shared/platformConfig';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityStaffingOrchestrator');


export interface StaffingWorkflow {
  id: string;
  workspaceId: string;
  status: 'pending' | 'processing' | 'awaiting_assignment' | 'assigned' | 'confirmed' | 'escalated' | 'completed' | 'failed' | 'cancelled';
  emailId: string;
  parsedRequest?: ParsedWorkRequest;
  shiftId?: string;
  assignedEmployees: { id: string; name: string; phone: string; role?: string }[];
  confirmationNumber?: string;
  escalationState?: EscalationState;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  error?: string;
  notificationContext?: {
    referenceNumber: string;
    workspaceName: string;
    senderEmail: string;
    senderName?: string;
  };
}

export interface OrchestratorSettings {
  enabled: boolean;
  autoAssign: boolean;
  autoConfirm: boolean;
  defaultBillingTerms: 'normal' | 'due_on_receipt';
  maxAutoAssignAttempts: number;
  requireApprovalForNew: boolean;
  notifyOnNewRequest: boolean;
}

const DEFAULT_SETTINGS: OrchestratorSettings = {
  enabled: true,
  autoAssign: true,
  autoConfirm: true,
  defaultBillingTerms: 'normal',
  maxAutoAssignAttempts: 3,
  requireApprovalForNew: true,
  notifyOnNewRequest: true,
};

export interface WebhookConfig {
  workspaceId: string;
  webhookToken: string;
  webhookSecret?: string;
  systemUserId?: string;
  createdAt: Date;
}

/**
 * TrinityStaffingOrchestrator
 * 
 * Main orchestration service for automated staffing workflow.
 * 
 * NOTE: Current implementation uses in-memory storage for:
 * - Active workflows
 * - Workspace settings
 * - Webhook configurations (tokens/secrets)
 * 
 * This means data is ephemeral and will be lost on process restart.
 * For production deployment, these should be persisted to the database.
 * 
 * The in-memory approach is intentional for the initial MVP to:
 * 1. Reduce database schema complexity
 * 2. Enable rapid iteration and testing
 * 3. Provide fast access without database queries
 */
class TrinityStaffingOrchestrator {
  private workflows: Map<string, StaffingWorkflow> = new Map();
  private settings: Map<string, OrchestratorSettings> = new Map();
  private webhookConfigs: Map<string, WebhookConfig> = new Map();
  
  /**
   * Process an inbound email through the staffing pipeline
   * Uses 7-step orchestration: TRIGGER → FETCH → VALIDATE → PROCESS → MUTATE → CONFIRM → NOTIFY
   */
  async processInboundEmail(
    workspaceId: string,
    userId: string,
    emailData: {
      id: string;
      from: string;
      subject: string;
      body: string;
      receivedAt: Date;
    }
  ): Promise<StaffingWorkflow> {
    const workflow = this.createWorkflow(workspaceId, emailData.id);
    let orchestrationId: string | null = null;
    
    try {
      // Start 7-step orchestration
      const orchestration = await universalStepLogger.startOrchestration({
        domain: 'scheduling',
        actionName: 'trinity_staffing_email_processing',
        actionId: workflow.id,
        workspaceId,
        userId,
        triggeredBy: 'webhook',
        triggerDetails: { emailId: emailData.id, from: emailData.from },
        requiredFeature: 'trinity_staffing',
      });
      orchestrationId = orchestration.orchestrationId;

      // STEP 1: TRIGGER - Register the operation
      await universalStepLogger.executeStep(orchestrationId, 'TRIGGER', async () => ({
        success: true,
        data: { workflowId: workflow.id, emailId: emailData.id },
      }));

      // STEP 2: FETCH - Check premium access and get workspace info
      const fetchResult = await universalStepLogger.executeStep(orchestrationId, 'FETCH', async () => {
        const accessResult = await premiumFeatureGating.checkAccess(
          workspaceId,
          'trinity_staffing',
          userId
        );
        
        // Get workspace name for notifications
        let workspaceName = 'Our Team';
        try {
          const [workspace] = await db.select({ name: workspaces.name })
            .from(workspaces)
            .where(eq(workspaces.id, workspaceId))
            .limit(1);
          if (workspace?.name) workspaceName = workspace.name;
        } catch (e) { /* ignore */ }
        
        return {
          success: accessResult.allowed,
          data: { accessResult, workspaceName },
          error: accessResult.allowed ? undefined : (accessResult.reason || 'Trinity Staffing not available'),
        };
      });

      if (!fetchResult.success) {
        await universalStepLogger.failOrchestration(orchestrationId, fetchResult.error || 'Access denied', 'PERMISSION_DENIED');
        throw new Error(fetchResult.error || 'Trinity Staffing not available');
      }

      const workspaceName = fetchResult.data?.workspaceName || 'Our Team';
      const referenceNumber = `SR-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
      
      // Set notification context
      workflow.notificationContext = {
        referenceNumber,
        workspaceName,
        senderEmail: emailData.from,
        senderName: undefined,
      };

      // STEP 3: VALIDATE - Classify email and check credits
      const validateResult = await universalStepLogger.executeStep(orchestrationId, 'VALIDATE', async () => {
        const classification = await workRequestParser.classifyEmail(
          emailData.subject,
          emailData.body,
          emailData.from
        );
        
        if (!classification.isWorkRequest) {
          return { success: true, data: { isWorkRequest: false, classification } };
        }
        
        // Check credits
        const deductResult = await premiumFeatureGating.deductCredits(
          workspaceId,
          'trinity_staffing_request_parse',
          userId,
          1,
          { emailId: emailData.id }
        );
        
        if (!deductResult.success) {
          return { success: false, error: `Insufficient credits: ${deductResult.error}`, errorCode: 'INSUFFICIENT_CREDITS' };
        }
        
        return { success: true, data: { isWorkRequest: true, classification, creditsDeducted: true } };
      }, { validateSubscription: true });

      if (!validateResult.success) {
        await universalStepLogger.failOrchestration(orchestrationId, validateResult.error || 'Validation failed', validateResult.errorCode || 'VALIDATION_FAILED');
        throw new Error(validateResult.error || 'Validation failed');
      }

      // If not a work request, complete early
      if (!validateResult.data?.isWorkRequest) {
        workflow.status = 'completed';
        workflow.completedAt = new Date();
        await universalStepLogger.completeOrchestration(orchestrationId, { notWorkRequest: true });
        return workflow;
      }

      workflow.status = 'processing';

      // STEP 4: PROCESS - Parse the work request and find matches
      const processResult = await universalStepLogger.executeStep(orchestrationId, 'PROCESS', async () => {
        const parsedRequest = await workRequestParser.parseWorkRequest(
          emailData.subject,
          emailData.body,
          emailData.from,
          emailData.receivedAt
        );
        
        return { success: true, data: { parsedRequest } };
      });

      if (!processResult.success) {
        await universalStepLogger.failOrchestration(orchestrationId, processResult.error || 'Processing failed', 'PROCESS_ERROR');
        throw new Error(processResult.error || 'Failed to parse work request');
      }

      workflow.parsedRequest = processResult.data?.parsedRequest;
      
      const settings = this.getSettings(workspaceId);

      // STEP 5: MUTATE - Auto-assign employees (database mutations)
      const mutateResult = await universalStepLogger.executeStep(orchestrationId, 'MUTATE', async () => {
        if (settings.autoAssign && workflow.parsedRequest) {
          await this.autoAssignEmployees(workflow, userId);
        }
        return { 
          success: true, 
          data: { 
            assignedCount: workflow.assignedEmployees.length,
            status: workflow.status,
          } 
        };
      }, { acquireLock: `staffing-${workflow.id}` });

      if (!mutateResult.success) {
        await universalStepLogger.failOrchestration(orchestrationId, mutateResult.error || 'Mutation failed', 'MUTATE_ERROR');
        throw new Error(mutateResult.error || 'Failed to assign employees');
      }

      // STEP 6: CONFIRM - Send confirmation to client
      await universalStepLogger.executeStep(orchestrationId, 'CONFIRM', async () => {
        if (settings.autoConfirm && workflow.assignedEmployees.length > 0) {
          await this.sendConfirmation(workflow, userId);
        }
        return { success: true, data: { confirmed: workflow.status === 'confirmed' } };
      });

      // STEP 7: NOTIFY - Final notifications already sent in sendConfirmation
      await universalStepLogger.executeStep(orchestrationId, 'NOTIFY', async () => {
        return { 
          success: true, 
          data: { 
            referenceNumber,
            confirmationNumber: workflow.confirmationNumber,
            notifiedSender: !!workflow.notificationContext?.senderEmail,
          } 
        };
      });

      // Complete orchestration
      await universalStepLogger.completeOrchestration(orchestrationId, {
        workflowId: workflow.id,
        status: workflow.status,
        assignedCount: workflow.assignedEmployees.length,
        confirmationNumber: workflow.confirmationNumber,
      });

      this.updateWorkflow(workflow);
      return workflow;
    } catch (error: any) {
      workflow.status = 'failed';
      workflow.error = (error instanceof Error ? error.message : String(error));
      this.updateWorkflow(workflow);
      
      // Fail orchestration if we have one
      if (orchestrationId) {
        try {
          await universalStepLogger.failOrchestration(orchestrationId, (error instanceof Error ? error.message : String(error)), 'UNKNOWN');
        } catch (e) { /* ignore logging failure */ }
      }
      
      throw error;
    }
  }
  
  /**
   * Auto-assign employees to a workflow
   * Sends step 4 (matching) and step 5 (assigning) notifications
   */
  private async autoAssignEmployees(
    workflow: StaffingWorkflow,
    userId: string
  ): Promise<void> {
    if (!workflow.parsedRequest) return;
    
    const ctx = workflow.notificationContext;
    
    // STEP 4: Matching - Send notification that we're finding staff
    if (ctx?.senderEmail) {
      try {
        const locationStr = typeof workflow.parsedRequest.location === 'string' 
          ? workflow.parsedRequest.location 
          : `${workflow.parsedRequest.location?.address || ''}, ${workflow.parsedRequest.location?.city || ''}, ${workflow.parsedRequest.location?.state || ''}`;
        const dateStr = workflow.parsedRequest.requestedDate instanceof Date 
          ? workflow.parsedRequest.requestedDate.toLocaleDateString() 
          : String(workflow.parsedRequest.requestedDate || '');
        
        await emailService.sendStaffingStatusUpdate({ // email-tracked
          workspaceId: workflow.workspaceId,
          senderEmail: ctx.senderEmail,
          senderName: ctx.senderName,
          referenceNumber: ctx.referenceNumber,
          workspaceName: ctx.workspaceName,
          currentStep: 'matching',
          stepNumber: 4,
          totalSteps: 7,
          stepDetails: `Searching for ${workflow.parsedRequest.guardsNeeded} qualified ${workflow.parsedRequest.positionType || 'security'} personnel in your area.`,
          extractedInfo: {
            location: locationStr,
            date: dateStr,
            time: `${workflow.parsedRequest.startTime} - ${workflow.parsedRequest.endTime}`,
            positionType: workflow.parsedRequest.positionType,
            guardsNeeded: workflow.parsedRequest.guardsNeeded,
          },
        });
        log.info(`[TrinityStaffing] Step 4 (matching) notification sent for ${ctx.referenceNumber}`);
      } catch (err) {
        log.error('[TrinityStaffing] Failed to send step 4 notification:', err);
      }
    }
    
    const deductResult = await premiumFeatureGating.deductCredits(
      workflow.workspaceId,
      'trinity_staffing_auto_assign',
      userId,
      1,
      { workflowId: workflow.id }
    );
    
    if (!deductResult.success) {
      log.warn(`[TrinityStaffing] Auto-assign skipped - insufficient credits`);
      return;
    }
    
    const eligibleEmployees = await db.select()
      .from(employees)
      .where(
        and(
          eq(employees.workspaceId, workflow.workspaceId),
          eq(employees.isActive, true)
        )
      )
      .limit(workflow.parsedRequest.guardsNeeded);
    
    workflow.assignedEmployees = eligibleEmployees.map(emp => ({
      id: emp.id,
      name: `${emp.firstName} ${emp.lastName}`,
      phone: emp.phone || '',
      role: workflow.parsedRequest?.positionType || 'Security Officer',
    }));

    // Send officer email offers + UNS push notifications (officers see their own pay rate only)
    if (eligibleEmployees.length > 0 && workflow.parsedRequest) {
      const req = workflow.parsedRequest;
      const locationStr = typeof req.location === 'string'
        ? req.location
        : `${req.location?.address || ''}, ${req.location?.city || ''}, ${req.location?.state || ''}`.trim();
      const fullAddress = typeof req.location === 'object'
        ? `${req.location?.address || ''}, ${req.location?.city || ''}, ${req.location?.state || ''}`.trim()
        : undefined;
      const dateStr = req.requestedDate instanceof Date
        ? req.requestedDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        : String(req.requestedDate || 'TBD');

      // Import notifications table for UNS push
      const { notifications } = await import('@shared/schema');

      for (const emp of eligibleEmployees) {
        const offerId = `OFFER-${workflow.id}-${emp.id.slice(0, 8)}`;

        // Email offer
        if (emp.email) {
          try {
            await emailService.sendOfficerShiftOffer({ // email-tracked
              workspaceId: workflow.workspaceId,
              officerEmail: emp.email,
              officerFirstName: emp.firstName || 'Officer',
              workspaceName: ctx?.workspaceName || 'Your Staffing Agency',
              offerId,
              referenceNumber: ctx?.referenceNumber || workflow.id,
              shiftDetails: {
                location: locationStr,
                address: fullAddress,
                date: dateStr,
                startTime: req.startTime || 'TBD',
                endTime: req.endTime || 'TBD',
                positionType: req.positionType || 'Security Officer',
                specialRequirements: req.specialRequirements,
              },
              officerPayRate: emp.hourlyRate ? parseFloat(emp.hourlyRate) : undefined,
              replyEmail: ctx?.senderEmail || `staffing@coaileague.com`,
            });
          } catch (offerErr: any) {
            log.error(`[TrinityStaffing] Failed to send offer email to ${emp.email}:`, offerErr.message);
          }
        }

        // SMS offer (if officer has a phone number and Twilio is configured)
        if (emp.phone) {
          try {
            const { sendShiftOfferSMS } = await import('../smsService');
            await sendShiftOfferSMS({
              phone: emp.phone,
              officerFirstName: emp.firstName || 'Officer',
              orgName: ctx?.workspaceName || 'Your Staffing Agency',
              location: locationStr,
              date: dateStr,
              startTime: req.startTime || 'TBD',
              endTime: req.endTime || 'TBD',
              officerPayRate: emp.hourlyRate ? parseFloat(emp.hourlyRate) : undefined,
              offerId,
            });
          } catch (smsErr: any) {
            log.warn(`[TrinityStaffing] SMS offer skipped for ${emp.id}:`, smsErr.message);
          }
        }

        // UNS push notification — coverage_offer type opens a dialog in-app
        try {
          const notifId = crypto.randomUUID();
          await db.insert(notifications).values({
            id: notifId,
            workspaceId: workflow.workspaceId,
            userId: emp.userId || emp.id,
            type: 'coverage_offer',
            title: `Shift Offer — ${req.positionType || 'Security Officer'}`,
            message: `${locationStr} on ${dateStr} (${req.startTime || 'TBD'} – ${req.endTime || 'TBD'}). Tap to view details and accept.`,
            isRead: false,
            actionUrl: `/shifts/offers/${offerId}`,
            relatedEntityType: 'shift_offer',
            relatedEntityId: offerId,
            metadata: {
              offerId,
              workflowId: workflow.id,
              location: locationStr,
              date: dateStr,
              startTime: req.startTime,
              endTime: req.endTime,
              positionType: req.positionType,
              officerPayRate: (emp as any).defaultHourlyRate,
            },
          });
        } catch (notifErr: any) {
          log.error(`[TrinityStaffing] Failed to insert UNS offer notification for ${emp.id}:`, notifErr.message);
        }
      }
    }
    
    // STEP 5: Assigning - Send notification with assigned staff
    if (ctx?.senderEmail && workflow.assignedEmployees.length > 0) {
      try {
        const assignedNames = workflow.assignedEmployees.map(e => e.name).join(', ');
        await emailService.sendStaffingStatusUpdate({ // email-tracked
          workspaceId: workflow.workspaceId,
          senderEmail: ctx.senderEmail,
          senderName: ctx.senderName,
          referenceNumber: ctx.referenceNumber,
          workspaceName: ctx.workspaceName,
          currentStep: 'assigning',
          stepNumber: 5,
          totalSteps: 7,
          stepDetails: `Successfully assigned ${workflow.assignedEmployees.length} personnel: ${assignedNames}. Preparing confirmation details.`,
        });
        log.info(`[TrinityStaffing] Step 5 (assigning) notification sent for ${ctx.referenceNumber}`);
      } catch (err) {
        log.error('[TrinityStaffing] Failed to send step 5 notification:', err);
      }
    }
    
    if (workflow.assignedEmployees.length >= workflow.parsedRequest.guardsNeeded) {
      workflow.status = 'assigned';
    } else {
      workflow.status = 'awaiting_assignment';
      await escalationChainService.startEscalation(
        workflow.id,
        workflow.workspaceId,
        workflow.parsedRequest.guardsNeeded - workflow.assignedEmployees.length
      );
      workflow.escalationState = escalationChainService.getEscalationState(workflow.id);
    }
  }
  
  /**
   * Send confirmation to client
   * Sends step 6 (confirming) and step 7 (completed) with full summary
   */
  private async sendConfirmation(
    workflow: StaffingWorkflow,
    userId: string
  ): Promise<void> {
    if (!workflow.parsedRequest) return;
    
    const ctx = workflow.notificationContext;
    
    // STEP 6: Confirming - Send notification that confirmation is being prepared
    if (ctx?.senderEmail) {
      try {
        await emailService.sendStaffingStatusUpdate({ // email-tracked
          workspaceId: workflow.workspaceId,
          senderEmail: ctx.senderEmail,
          senderName: ctx.senderName,
          referenceNumber: ctx.referenceNumber,
          workspaceName: ctx.workspaceName,
          currentStep: 'confirming',
          stepNumber: 6,
          totalSteps: 7,
          stepDetails: 'Generating your staffing confirmation with all details. Final summary coming shortly.',
        });
        log.info(`[TrinityStaffing] Step 6 (confirming) notification sent for ${ctx.referenceNumber}`);
      } catch (err) {
        log.error('[TrinityStaffing] Failed to send step 6 notification:', err);
      }
    }
    
    const deductResult = await premiumFeatureGating.deductCredits(
      workflow.workspaceId,
      'trinity_staffing_confirmation',
      userId,
      1,
      { workflowId: workflow.id }
    );
    
    if (!deductResult.success) {
      log.warn(`[TrinityStaffing] Confirmation skipped - insufficient credits`);
      return;
    }
    
    const settings = this.getSettings(workflow.workspaceId);
    const confirmationNumber = `TS-${Date.now().toString(36).toUpperCase()}`;
    
    // Format location for confirmation email
    const locationObj = workflow.parsedRequest.location;
    const confirmationLocation = typeof locationObj === 'string' 
      ? locationObj 
      : `${locationObj?.address || ''}, ${locationObj?.city || ''}, ${locationObj?.state || ''}`.trim();
    
    // Format date for confirmation
    const shiftDateStr = workflow.parsedRequest.requestedDate instanceof Date 
      ? workflow.parsedRequest.requestedDate.toLocaleDateString() 
      : String(workflow.parsedRequest.requestedDate || '');
    
    const confirmationData: ConfirmationEmailData = {
      clientEmail: workflow.parsedRequest.clientInfo.email,
      clientName: workflow.parsedRequest.clientInfo.name || 'Valued Client',
      shiftDate: shiftDateStr,
      startTime: workflow.parsedRequest.startTime,
      endTime: workflow.parsedRequest.endTime,
      location: confirmationLocation,
      positionType: workflow.parsedRequest.positionType,
      officers: workflow.assignedEmployees.map(emp => ({
        name: emp.name,
        phone: emp.phone,
        certifications: [],
      })),
      confirmationNumber,
      billingTerms: settings.defaultBillingTerms,
    };
    
    const result = await clientConfirmationService.sendConfirmation(confirmationData);
    
    workflow.confirmationNumber = result.confirmationNumber || confirmationNumber;
    workflow.status = 'confirmed';
    workflow.completedAt = new Date();
    
    // STEP 7: Completed - Send full who/what/where/why/how summary to sender
    if (ctx?.senderEmail) {
      try {
        const startHour = parseInt(workflow.parsedRequest.startTime?.split(':')[0] || '0');
        const endHour = parseInt(workflow.parsedRequest.endTime?.split(':')[0] || '0');
        const durationHours = endHour >= startHour ? endHour - startHour : (24 - startHour + endHour);
        
        // Format location properly
        const locationObj = workflow.parsedRequest.location;
        const locationStr = typeof locationObj === 'string' 
          ? locationObj 
          : `${locationObj?.address || ''}, ${locationObj?.city || ''}, ${locationObj?.state || ''}`.trim();
        const fullAddress = typeof locationObj === 'object' 
          ? `${locationObj?.address || ''}, ${locationObj?.city || ''}, ${locationObj?.state || ''} ${locationObj?.zipCode || ''}`.trim()
          : undefined;
        
        // Format date properly
        const dateStr = workflow.parsedRequest.requestedDate instanceof Date 
          ? workflow.parsedRequest.requestedDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
          : String(workflow.parsedRequest.requestedDate || '');
        
        await emailService.sendStaffingCompletionSummary({ // email-tracked
          workspaceId: workflow.workspaceId,
          senderEmail: ctx.senderEmail,
          senderName: ctx.senderName,
          referenceNumber: ctx.referenceNumber,
          workspaceName: ctx.workspaceName,
          confirmationNumber: workflow.confirmationNumber,
          summary: {
            who: {
              assignedStaff: workflow.assignedEmployees.map(emp => ({
                name: emp.name,
                phone: emp.phone,
                role: emp.role || workflow.parsedRequest?.positionType || 'Security Officer',
              })),
              totalStaffCount: workflow.assignedEmployees.length,
            },
            what: {
              positionType: workflow.parsedRequest.positionType || 'Security Officer',
              specialRequirements: workflow.parsedRequest.specialRequirements,
            },
            where: {
              location: locationStr,
              address: fullAddress,
              pocName: workflow.parsedRequest.clientInfo.name,
              pocPhone: workflow.parsedRequest.clientInfo.phone,
            },
            when: {
              date: dateStr,
              startTime: workflow.parsedRequest.startTime,
              endTime: workflow.parsedRequest.endTime,
              duration: `${durationHours} hour${durationHours !== 1 ? 's' : ''}`,
            },
            why: {
              requestSource: 'Email Request',
              clientName: workflow.parsedRequest.clientInfo.name || workflow.parsedRequest.clientInfo.companyName || 'Client',
            },
            how: {
              billingTerms: settings.defaultBillingTerms === 'due_on_receipt' 
                ? 'Due on Receipt' 
                : 'Net 30 Terms',
              invoiceWillFollow: true,
            },
          },
          nextSteps: [
            'Our assigned personnel will arrive at the specified time',
            'Site contact will be notified with officer details',
            'An invoice will be sent after service completion',
            'Contact us immediately if any changes are needed',
          ],
          specialInstructions: workflow.parsedRequest.notes || undefined,
        });
        log.info(`[TrinityStaffing] Step 7 (completion summary) sent for ${ctx.referenceNumber} -> ${workflow.confirmationNumber}`);
      } catch (err) {
        log.error('[TrinityStaffing] Failed to send completion summary:', err);
      }
    }

    // ====================================================================
    // CLIENT PORTAL INVITATION — auto-sent after shift is fully staffed
    // ====================================================================
    if (ctx?.senderEmail && workflow.parsedRequest) {
      try {
        const { clientProspectService } = await import('../clientProspectService');
        const { getAppBaseUrl } = await import('../../utils/getAppBaseUrl');
        const { prospect, tempCode } = await clientProspectService.getOrCreateFromEmail({
          workspaceId: workflow.workspaceId,
          email: ctx.senderEmail,
          companyName: workflow.parsedRequest.clientInfo?.companyName || workflow.parsedRequest.clientInfo?.name,
          contactName: workflow.parsedRequest.clientInfo?.name,
          phone: workflow.parsedRequest.clientInfo?.phone,
          referenceNumber: ctx.referenceNumber,
        });
        const baseUrl = getAppBaseUrl();
        await emailService.sendClientPortalInvitation({ // email-tracked
          workspaceId: workflow.workspaceId,
          clientEmail: ctx.senderEmail,
          clientName: workflow.parsedRequest.clientInfo?.name || ctx.senderName,
          workspaceName: ctx.workspaceName,
          portalUrl: `${baseUrl}/client-portal?code=${tempCode}`,
          signupUrl: `${baseUrl}/client-portal/signup?org=${workflow.workspaceId}&code=${tempCode}`,
          tempCode,
          shiftsFilled: workflow.assignedEmployees.length,
        });
        log.info(`[TrinityStaffing] Client portal invitation sent to ${ctx.senderEmail} (prospect: ${prospect.id}, code: ${tempCode})`);
      } catch (portalErr: any) {
        log.error('[TrinityStaffing] Failed to send client portal invitation:', portalErr.message);
      }
    }

    // ====================================================================
    // ORG OWNER + MANAGER INTERNAL EMAIL SUMMARY
    // ====================================================================
    try {
      const { inArray } = await import('drizzle-orm');
      const orgManagers = await db.select({
        email: employees.email,
        firstName: employees.firstName,
      })
        .from(employees)
        .where(
          and(
            eq(employees.workspaceId, workflow.workspaceId),
            eq(employees.isActive, true),
            inArray(employees.workspaceRole, [...MANAGER_ROLES])
          )
        )
        .limit(10);

      const managerEmails = orgManagers
        .filter(u => u.email)
        .map(u => u.email as string);

      if (managerEmails.length > 0 && workflow.parsedRequest) {
        const req = workflow.parsedRequest;
        const locationStr = typeof req.location === 'string'
          ? req.location
          : `${req.location?.address || ''}, ${req.location?.city || ''}, ${req.location?.state || ''}`.trim();
        const dateStr = req.requestedDate instanceof Date
          ? req.requestedDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
          : String(req.requestedDate || 'TBD');

        await emailService.sendStaffingCompletionOrgSummary({ // email-tracked
          workspaceId: workflow.workspaceId,
          recipients: managerEmails,
          workspaceName: ctx?.workspaceName || 'Your Organization',
          referenceNumber: ctx?.referenceNumber || workflow.id,
          confirmationNumber: workflow.confirmationNumber || 'N/A',
          clientName: req.clientInfo?.name || req.clientInfo?.companyName || ctx?.senderName || 'New Client',
          clientEmail: ctx?.senderEmail || req.clientInfo?.email || 'unknown',
          clientPhone: req.clientInfo?.phone,
          shiftDetails: {
            location: locationStr,
            date: dateStr,
            startTime: req.startTime || 'TBD',
            endTime: req.endTime || 'TBD',
            positionType: req.positionType || 'Security Officer',
            guardsNeeded: req.guardsNeeded || 1,
          },
          assignedOfficers: workflow.assignedEmployees.map(e => ({
            name: e.name,
            phone: e.phone,
            role: e.role,
          })),
          nextActions: [
            `Add ${req.clientInfo?.name || 'this client'} to your client list for invoicing`,
            'Create a QuickBooks customer entry for billing',
            'Review the staffing confirmation and verify all details are accurate',
            'Schedule a follow-up check-in 24 hours before the assignment',
          ],
        });
        log.info(`[TrinityStaffing] Org summary sent to ${managerEmails.length} manager(s)`);
      }
    } catch (orgSummaryErr: any) {
      log.error('[TrinityStaffing] Failed to send org summary:', orgSummaryErr.message);
    }
  }
  
  /**
   * Create a new workflow
   */
  private createWorkflow(workspaceId: string, emailId: string): StaffingWorkflow {
    const workflow: StaffingWorkflow = {
      id: `WORKFLOW-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
      workspaceId,
      status: 'pending',
      emailId,
      assignedEmployees: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.workflows.set(workflow.id, workflow);
    return workflow;
  }
  
  /**
   * Update workflow state
   */
  private updateWorkflow(workflow: StaffingWorkflow): void {
    workflow.updatedAt = new Date();
    this.workflows.set(workflow.id, workflow);
  }
  
  /**
   * Get workflow by ID
   */
  getWorkflow(workflowId: string): StaffingWorkflow | undefined {
    return this.workflows.get(workflowId);
  }
  
  /**
   * Get all workflows for a workspace
   */
  getWorkflowsByWorkspace(workspaceId: string): StaffingWorkflow[] {
    return Array.from(this.workflows.values())
      .filter(w => w.workspaceId === workspaceId);
  }
  
  /**
   * Get settings for a workspace
   */
  getSettings(workspaceId: string): OrchestratorSettings {
    return this.settings.get(workspaceId) || { ...DEFAULT_SETTINGS };
  }
  
  /**
   * Update settings for a workspace
   */
  updateSettings(workspaceId: string, settings: Partial<OrchestratorSettings>): OrchestratorSettings {
    const current = this.getSettings(workspaceId);
    const updated = { ...current, ...settings };
    this.settings.set(workspaceId, updated);
    return updated;
  }
  
  /**
   * Cancel a workflow
   */
  async cancelWorkflow(workflowId: string, reason: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (workflow) {
      workflow.status = 'cancelled';
      workflow.error = reason;
      workflow.completedAt = new Date();
      this.updateWorkflow(workflow);
      
      if (workflow.escalationState) {
        await escalationChainService.cancelEscalation(workflowId, reason);
      }
    }
  }
  
  /**
   * Get orchestrator status
   */
  getStatus(workspaceId: string): {
    enabled: boolean;
    activeWorkflows: number;
    pendingEscalations: number;
    todayStats: {
      processed: number;
      assigned: number;
      confirmed: number;
      failed: number;
    };
  } {
    const settings = this.getSettings(workspaceId);
    const workspaceWorkflows = this.getWorkflowsByWorkspace(workspaceId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayWorkflows = workspaceWorkflows.filter(w => w.createdAt >= today);
    
    return {
      enabled: settings.enabled,
      activeWorkflows: workspaceWorkflows.filter(w => 
        !['completed', 'cancelled', 'failed'].includes(w.status)
      ).length,
      pendingEscalations: workspaceWorkflows.filter(w => 
        w.status === 'escalated' || w.escalationState?.status === 'active'
      ).length,
      todayStats: {
        processed: todayWorkflows.length,
        assigned: todayWorkflows.filter(w => w.status === 'assigned' || w.status === 'confirmed').length,
        confirmed: todayWorkflows.filter(w => w.status === 'confirmed').length,
        failed: todayWorkflows.filter(w => w.status === 'failed').length,
      },
    };
  }
  
  /**
   * Get workspace config by webhook token (for public webhook validation)
   */
  getWorkspaceByWebhookToken(token: string): WebhookConfig | null {
    return this.webhookConfigs.get(token) || null;
  }
  
  /**
   * Register a webhook token for a workspace
   */
  registerWebhookToken(
    workspaceId: string,
    token: string,
    secret?: string,
    systemUserId?: string
  ): WebhookConfig {
    const config: WebhookConfig = {
      workspaceId,
      webhookToken: token,
      webhookSecret: secret,
      systemUserId,
      createdAt: new Date(),
    };
    this.webhookConfigs.set(token, config);
    return config;
  }
  
  /**
   * Generate a new webhook token for a workspace
   */
  generateWebhookToken(workspaceId: string, systemUserId?: string): WebhookConfig {
    const token = `wh_${workspaceId}_${Date.now()}_${crypto.randomUUID()}`;
    const secret = `whsec_${crypto.randomUUID()}`;
    return this.registerWebhookToken(workspaceId, token, secret, systemUserId);
  }
  
  /**
   * Revoke a webhook token
   */
  revokeWebhookToken(token: string): boolean {
    return this.webhookConfigs.delete(token);
  }
  
  /**
   * Get webhook config for workspace
   */
  getWebhookConfigForWorkspace(workspaceId: string): WebhookConfig | null {
    for (const config of this.webhookConfigs.values()) {
      if (config.workspaceId === workspaceId) {
        return config;
      }
    }
    return null;
  }
}

export const trinityStaffingOrchestrator = new TrinityStaffingOrchestrator();
