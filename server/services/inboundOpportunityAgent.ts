/**
 * INBOUND OPPORTUNITY AGENT
 * ==========================
 * Autonomous workflow for processing inbound shift requests:
 * 
 * Stage A: Email Ingestion - Monitor inbox, classify, extract shift details
 * Stage B: Auto-Staffing - Find qualified employees, rank matches, send offers
 * Stage C: Acceptance & AI Approval - Validate acceptance, AI approves match
 * Stage D: Contractor Notification - Close the loop with confirmation
 * 
 * Each stage follows the 7-step ExecutionPipeline pattern.
 */

import { NotificationDeliveryService } from './notificationDeliveryService';
import { db } from '../db';
import { createLogger } from '../lib/logger';
import { getAppBaseUrl } from '../utils/getAppBaseUrl';

const log = createLogger('InboundOpportunity');
import {
  employeeBehaviorScores,
  inboundEmails,
  stagedShifts,
  automatedShiftOffers,
  employees,
  knownContractors,
  contractorCommunications,
  users,
  type InsertInboundEmail,
  type InsertStagedShift,
  type InsertAutomatedShiftOffer,
  type InsertContractorCommunication,
} from '@shared/schema';
import { eq, and, desc, gte, isNull, inArray, sql } from 'drizzle-orm';
import { APPROVER_ROLES, MANAGER_ROLES } from '@shared/platformConfig';
import { executionPipeline, type PipelineContext } from './executionPipeline';
import { meteredGemini } from './billing/meteredGeminiClient';
import { creditManager } from './billing/creditManager';
import { emailService } from './emailService';
import { clientProspectService } from './clientProspectService';
import { staffingClaimService } from './staffingClaimService';

// ============================================================================
// TYPES
// ============================================================================

export interface ExtractedShiftDetails {
  location?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  payRate?: number;
  requirements?: {
    armed?: boolean;
    unarmed?: boolean;
    certifications?: string[];
    dressCode?: string;
    specialInstructions?: string;
  };
  clientName?: string;
  pocName?: string;
  pocPhone?: string;
  pocEmail?: string;
}

export interface EmployeeMatch {
  employeeId: string;
  employeeName: string;
  matchScore: number;
  matchReasons: string[];
  distance?: number;
  reliabilityScore?: number;
  acceptanceRate?: number;
}

export interface StageResult {
  success: boolean;
  message: string;
  data?: any;
}

// ============================================================================
// INBOUND OPPORTUNITY AGENT CLASS
// ============================================================================

export class InboundOpportunityAgent {
  private static instance: InboundOpportunityAgent;
  
  private constructor() {}
  
  static getInstance(): InboundOpportunityAgent {
    if (!InboundOpportunityAgent.instance) {
      InboundOpportunityAgent.instance = new InboundOpportunityAgent();
    }
    return InboundOpportunityAgent.instance;
  }
  
  // ==========================================================================
  // STAGE A: EMAIL INGESTION
  // ==========================================================================
  
  /**
   * Process an incoming email for shift opportunities
   */
  async processInboundEmail(
    workspaceId: string,
    email: {
      messageId: string;
      fromEmail: string;
      fromName?: string;
      toEmail?: string;
      subject: string;
      bodyText: string;
      bodyHtml?: string;
      hasAttachments?: boolean;
      attachmentCount?: number;
      attachmentNames?: string[];
      hasContractAttachment?: boolean;
    }
  ): Promise<StageResult> {
    const result = await executionPipeline.execute(
      {
        workspaceId,
        operationType: 'inbound_opportunity',
        operationName: 'email_ingestion',
        initiator: 'inbound_email_webhook',
        initiatorType: 'webhook',
        payload: { messageId: email.messageId, fromEmail: email.fromEmail },
      },
      {
        // STEP 2: FETCH
        fetch: async (ctx) => {
          const emailDomain = email.fromEmail?.split('@')[1] || 'unknown';
          
          // Try to find known contractor (gracefully handle if table doesn't exist)
          let contractor = null;
          try {
            const [foundContractor] = await db.select()
              .from(knownContractors)
              .where(and(
                eq(knownContractors.workspaceId, workspaceId),
                eq(knownContractors.emailDomain, emailDomain)
              ))
              .limit(1);
            contractor = foundContractor;
          } catch (error: any) {
            // Table may not exist - continue without contractor lookup
            log.info(`Known contractors lookup skipped: ${(error instanceof Error ? error.message : String(error))?.includes('does not exist') ? 'table not created' : (error instanceof Error ? error.message : String(error))}`);
          }
          
          return {
            contractor,
            emailDomain,
            isKnownContractor: !!contractor,
          };
        },
        
        // STEP 3: VALIDATE
        validate: async (ctx, fetchedData) => {
          if (!email.subject && !email.bodyText) {
            return { valid: false, errors: ['Email has no subject or body content'] };
          }
          return { valid: true };
        },
        
        // STEP 4: PROCESS
        process: async (ctx, fetchedData) => {
          // Generate reference number early for tracking through entire pipeline
          const referenceNumber = `SR-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
          
          // Get workspace name for notification emails
          let workspaceName = 'Our Team';
          try {
            const { workspaces } = await import('@shared/schema');
            const [workspace] = await db.select({ name: workspaces.name })
              .from(workspaces)
              .where(eq(workspaces.id, workspaceId))
              .limit(1);
            if (workspace?.name) {
              workspaceName = workspace.name;
            }
          } catch (wsErr) {
            log.warn('Failed to get workspace name:', wsErr);
          }
          
          // Step 4a: Create or get client prospect with temp code
          let clientProspect = null;
          let tempCode = '';
          let statusPortalUrl = '';
          try {
            const firstShift = fetchedData.contractor ? null : null; // Will be populated after extraction
            const prospectResult = await clientProspectService.getOrCreateFromEmail({
              workspaceId,
              email: email.fromEmail,
              companyName: email.fromName?.includes('@') ? undefined : email.fromName,
              contactName: email.fromName,
              referenceNumber,
            });
            clientProspect = prospectResult.prospect;
            tempCode = prospectResult.tempCode;
            statusPortalUrl = clientProspectService.getStatusPortalUrl(tempCode);
            log.info(`Client prospect: ${tempCode} (new: ${prospectResult.isNew})`);
          } catch (prospectErr) {
            log.warn('Failed to create client prospect:', prospectErr);
          }
          
          // Step 4b: Classify if this is a shift request using Trinity
          const classificationResult = await this.classifyEmail(workspaceId, email.subject, email.bodyText);
          
          if (!classificationResult.isShiftRequest || classificationResult.confidence < 0.8) {
            return {
              isShiftRequest: false,
              classificationConfidence: classificationResult.confidence,
              classificationReason: classificationResult.reason,
              shouldRouteToHuman: true,
              referenceNumber,
              workspaceName,
              tempCode,
              statusPortalUrl,
              clientProspectId: clientProspect?.id,
            };
          }
          
          // Step 4c: Extract shift details using Trinity
          const extractedShifts = await this.extractShiftDetails(workspaceId, email.subject, email.bodyText);
          
          ctx.tokensConsumed = (classificationResult.tokensUsed || 0) + (extractedShifts.tokensUsed || 0);
          ctx.confidenceScore = classificationResult.confidence;
          
          // Step 4d: Detect contract attachments
          let contractDetected = false;
          let contractInfo: { type: string; action: string; message: string } | null = null;
          
          if (email.hasContractAttachment || email.hasAttachments) {
            const attachmentNames = email.attachmentNames || [];
            const contractPatterns = /contract|agreement|sow|terms|proposal|nda|msa/i;
            const hasContractFile = attachmentNames.some((name: string) => contractPatterns.test(name));
            
            if (hasContractFile || email.hasContractAttachment) {
              contractDetected = true;
              contractInfo = {
                type: 'contract_attachment',
                action: 'review_and_sign',
                message: `Contract document detected in attachments (${attachmentNames.join(', ')}). This document will be routed to the organization for review, signing, and filing. A copy will also be made available to the requester via their client portal.`,
              };
              log.info(`Contract detected in attachments: ${attachmentNames.join(', ')}`);
            }
          }
          
          return {
            isShiftRequest: true,
            classificationConfidence: classificationResult.confidence,
            classificationReason: classificationResult.reason,
            extractedShifts: extractedShifts.shifts,
            contractor: fetchedData.contractor,
            referenceNumber,
            workspaceName,
            senderEmail: email.fromEmail,
            senderName: email.fromName,
            tempCode,
            statusPortalUrl,
            clientProspectId: clientProspect?.id,
            contractDetected,
            contractInfo,
          };
        },
        
        // STEP 5: MUTATE
        mutate: async (ctx, processResult) => {
          let recordsChanged = 0;
          let emailRecordId: string | null = null;
          
          // Insert email record (gracefully handle if table doesn't exist)
          try {
            const [emailRecord] = await db.insert(inboundEmails).values({
              workspaceId,
              messageId: email.messageId,
              fromEmail: email.fromEmail,
              fromName: email.fromName,
              toEmail: email.toEmail,
              subject: email.subject,
              bodyText: email.bodyText,
              bodyHtml: email.bodyHtml,
              hasAttachments: email.hasAttachments,
              attachmentCount: email.attachmentCount,
              isShiftRequest: processResult.isShiftRequest,
              classificationConfidence: processResult.classificationConfidence?.toString(),
              classificationReason: processResult.classificationReason,
              status: processResult.isShiftRequest ? 'processed' : 'routed_to_human',
              processedAt: new Date(),
              routedToHumanAt: !processResult.isShiftRequest ? new Date() : undefined,
            }).returning();
            emailRecordId = emailRecord?.id;
            recordsChanged++;
          } catch (error: any) {
            log.info(`Email record insert skipped: ${(error instanceof Error ? error.message : String(error))?.includes('does not exist') ? 'table not created' : (error instanceof Error ? error.message : String(error))}`);
          }
          
          // Handle contract attachment if detected
          if (processResult.contractDetected && processResult.contractInfo && emailRecordId) {
            try {
              await db.insert(inboundEmails).values({
                workspaceId,
                messageId: `${email.messageId}-contract`,
                fromEmail: email.fromEmail,
                fromName: email.fromName,
                toEmail: email.toEmail,
                subject: `[CONTRACT] ${email.subject}`,
                bodyText: processResult.contractInfo.message,
                hasAttachments: true,
                attachmentCount: email.attachmentCount || 1,
                isShiftRequest: false,
                status: 'contract_pending_review',
                processedAt: new Date(),
              }).returning();
              recordsChanged++;
              log.info(`Contract record created for review`);
            } catch (contractErr: any) {
              log.info(`Contract record skipped: ${contractErr.message}`);
            }
          }
          
          // Insert staged shifts if extracted (gracefully handle if table doesn't exist)
          // @ts-expect-error — TS migration: fix in refactoring sprint
          if (processResult.extractedShifts?.length > 0) {
            // @ts-expect-error — TS migration: fix in refactoring sprint
            for (const shift of processResult.extractedShifts) {
              const needsReview = Object.values(shift).some(v => v === null || v === undefined);
              
              try {
                // Include notification context in extractedData for downstream processing
                // Build claim key so race-condition detection can work at acceptance time
                const claimKey = processResult.senderEmail && shift.location && shift.date
                  ? staffingClaimService.buildClaimKey(processResult.senderEmail, shift.location, shift.date)
                  : undefined;

                // Register this org's interest in the claim token
                if (claimKey && processResult.senderEmail) {
                  staffingClaimService.registerInterest({
                    workspaceId,
                    workspaceName: processResult.workspaceName || 'Our Team',
                    staffingEmail: email.toEmail || 'staffing@coaileague.com',
                    clientEmail: processResult.senderEmail,
                    location: shift.location || '',
                    shiftDate: shift.date || '',
                    shiftDescription: (shift as any).description || (shift as any).duties,
                  }).catch(err => log.warn('Claim registration failed (non-blocking):', (err instanceof Error ? err.message : String(err))));
                }

                const extractedDataWithContext = {
                  ...shift,
                  notificationContext: {
                    referenceNumber: processResult.referenceNumber,
                    workspaceName: processResult.workspaceName,
                    senderEmail: processResult.senderEmail,
                    senderName: processResult.senderName,
                    claimKey,
                  },
                };
                
                await db.insert(stagedShifts).values({
                  workspaceId,
                  contractorId: processResult.contractor?.id,
                  sourceType: 'email',
                  sourceEmailId: emailRecordId,
                  sourceEmailSubject: email.subject,
                  sourceEmailBody: email.bodyText,
                  location: shift.location,
                  shiftDate: shift.date,
                  startTime: shift.startTime,
                  endTime: shift.endTime,
                  payRate: shift.payRate?.toString(),
                  requirements: shift.requirements,
                  clientName: shift.clientName,
                  pocName: shift.pocName,
                  pocPhone: shift.pocPhone,
                  pocEmail: shift.pocEmail,
                  extractedData: extractedDataWithContext,
                  overallConfidence: processResult.classificationConfidence?.toString(),
                  status: needsReview ? 'pending_review' : 'ready_to_staff',
                  needsManualReview: needsReview,
                  manualReviewReason: needsReview ? 'Some fields could not be extracted' : undefined,
                  processedByAi: true,
                });
                recordsChanged++;
              } catch (error: any) {
                log.info(`Staged shift insert skipped: ${(error instanceof Error ? error.message : String(error))?.includes('does not exist') ? 'table not created' : (error instanceof Error ? error.message : String(error))}`);
              }
            }
          }
          
          return { 
            tables: ['inbound_emails', 'staged_shifts'], 
            recordsChanged,
            isShiftRequest: processResult.isShiftRequest,
            extractedShifts: processResult.extractedShifts,
          };
        },
        
        // STEP 7: NOTIFY
        // @ts-expect-error — TS migration: fix in refactoring sprint
        notify: async (ctx, processResult) => {
          const notifications: string[] = [];

          // Use reference number and workspace name from PROCESS step
          const referenceNumber = processResult.referenceNumber || `SR-${Date.now().toString(36).toUpperCase()}`;
          const workspaceName = processResult.workspaceName || 'Our Team';

          // Helper to check if we should send emails to this sender
          const shouldEmailSender = email.fromEmail && 
            !email.fromEmail.includes('noreply') && 
            !email.fromEmail.includes('no-reply');

          // STEP 1 NOTIFICATION: Email received acknowledgment
          if (shouldEmailSender) {
            try {
              await emailService.sendStaffingStatusUpdate({ // email-tracked
                workspaceId,
                senderEmail: email.fromEmail,
                senderName: email.fromName,
                referenceNumber,
                workspaceName,
                currentStep: 'received',
                stepNumber: 1,
                totalSteps: 7,
                stepDetails: 'Your email has been received and is being analyzed by our AI staffing system.',
                tempCode: processResult.tempCode,
                statusPortalUrl: processResult.statusPortalUrl,
              });
              log.info(`Step 1 notification sent to ${email.fromEmail}, ref: ${referenceNumber}`);
              notifications.push(`sender:step1_received:${referenceNumber}`);
            } catch (err) {
              log.error('Failed to send step 1 notification:', err);
            }
          }

          // STEP 2 NOTIFICATION: Classification result
          if (shouldEmailSender) {
            try {
              await emailService.sendStaffingStatusUpdate({ // email-tracked
                workspaceId,
                senderEmail: email.fromEmail,
                senderName: email.fromName,
                referenceNumber,
                workspaceName,
                currentStep: 'classifying',
                stepNumber: 2,
                totalSteps: 7,
                stepDetails: processResult.isShiftRequest 
                  ? `AI identified this as a staffing request with ${Math.round((processResult.classificationConfidence || 0) * 100)}% confidence.`
                  : 'Our team will review your request and respond shortly.',
                tempCode: processResult.tempCode,
                statusPortalUrl: processResult.statusPortalUrl,
              });
              notifications.push(`sender:step2_classified:${referenceNumber}`);
            } catch (err) {
              log.error('Failed to send step 2 notification:', err);
            }
          }

          // For shift requests, send extraction details
          // @ts-expect-error — TS migration: fix in refactoring sprint
          if (processResult.isShiftRequest && processResult.extractedShifts?.length > 0 && shouldEmailSender) {
            // @ts-expect-error — TS migration: fix in refactoring sprint
            const firstShift = processResult.extractedShifts[0] as ExtractedShiftDetails;
            
            // STEP 3 NOTIFICATION: Extraction complete with details
            try {
              await emailService.sendStaffingStatusUpdate({ // email-tracked
                workspaceId,
                senderEmail: email.fromEmail,
                senderName: email.fromName,
                referenceNumber,
                workspaceName,
                currentStep: 'extracting',
                stepNumber: 3,
                totalSteps: 7,
                // @ts-expect-error — TS migration: fix in refactoring sprint
                stepDetails: `We've extracted ${processResult.extractedShifts.length} shift(s) from your request. Now finding available qualified personnel.`,
                tempCode: processResult.tempCode,
                statusPortalUrl: processResult.statusPortalUrl,
                extractedInfo: {
                  location: firstShift.location,
                  date: firstShift.date,
                  time: firstShift.startTime && firstShift.endTime 
                    ? `${firstShift.startTime} - ${firstShift.endTime}` 
                    : undefined,
                  positionType: firstShift.requirements?.armed ? 'Armed Security' : 'Security Officer',
                },
              });
              notifications.push(`sender:step3_extracted:${referenceNumber}`);
            } catch (err) {
              log.error('Failed to send step 3 notification:', err);
            }

            // Store reference for later staffing stages
            ctx.referenceNumber = referenceNumber;
            ctx.workspaceName = workspaceName;
            ctx.senderEmail = email.fromEmail;
            ctx.senderName = email.fromName;
            (ctx as any).tempCode = processResult.tempCode;
            (ctx as any).statusPortalUrl = processResult.statusPortalUrl;
          }

          // Contract notification to org managers
          if (processResult.contractDetected && processResult.contractInfo) {
            try {
              const managers = await db.select({
                email: employees.email,
                firstName: employees.firstName,
              })
              .from(employees)
              .where(and(
                eq(employees.workspaceId, workspaceId),
                eq(employees.isActive, true),
                // @ts-expect-error — TS migration: fix in refactoring sprint
                inArray(employees.workspaceRole, [...MANAGER_ROLES])
              ));
              
              const senderName = email.fromName || email.fromEmail;
              for (const manager of managers) {
                if (manager.email) {
                  NotificationDeliveryService.send({ type: 'contract_notification', workspaceId: workspaceId || 'system', recipientUserId: manager.email, channel: 'email', body: { to: manager.email, subject: `[Action Required] Contract Received from ${senderName}`, html: `<div style="font-family: Arial, sans-serif; max-width: 600px;"><h2 style="color: #1a1a1a;">Contract Document Received</h2><p>A contract document has been received along with a staffing request and requires your attention.</p><div style="background: #f0f7ff; padding: 16px; border-radius: 8px; margin: 16px 0;"><p><strong>From:</strong> ${senderName} &lt;${email.fromEmail}&gt;</p><p><strong>Subject:</strong> ${email.subject}</p><p><strong>Attachments:</strong> ${(email.attachmentNames || []).join(', ') || 'Contract document'}</p><p><strong>Action Required:</strong> ${processResult.contractInfo.action === 'review_and_sign' ? 'Review, sign, and return the contract' : 'Review the attached document'}</p></div><p style="color: #666; font-size: 13px;">This contract has been logged and will be available in your organization's document management section.</p></div>` } }).catch(err => {
                    log.error('[InboundOpportunityAgent] Failed to send contract notification:', err);
                  });
                  notifications.push(`manager:${manager.email}:contract_notification_sent`);
                }
              }
            } catch (contractNotifyErr) {
              log.error('[InboundOpportunityAgent] Failed to notify about contract:', contractNotifyErr);
            }

            // Also notify the sender about the contract
            if (shouldEmailSender) {
              try {
                await NotificationDeliveryService.send({ type: 'contract_notification', workspaceId: workspaceId || 'system', recipientUserId: email.fromEmail, channel: 'email', body: { to: email.fromEmail, subject: `Contract Received - ${processResult.referenceNumber || 'Reference Pending'}`, html: `<div style="font-family: Arial, sans-serif; max-width: 600px;"><h2 style="color: #1a1a1a;">Contract Document Acknowledged</h2><p>Dear ${email.fromName || 'Valued Client'},</p><p>We have received your contract document along with your staffing request (Ref: <strong>${processResult.referenceNumber || 'N/A'}</strong>).</p><div style="background: #f0fdf4; padding: 16px; border-radius: 8px; margin: 16px 0;"><p>Our team will review the contract and process it accordingly.</p></div>${processResult.statusPortalUrl ? `<p>Track status: <a href="${processResult.statusPortalUrl}">${processResult.statusPortalUrl}</a></p>` : ''}</div>` } }).catch(err => { log.error('[InboundOpportunityAgent] Failed to send contract acknowledgment:', err); });
                notifications.push(`sender:${email.fromEmail}:contract_acknowledged`);
              } catch (ackErr) {
                log.error('[InboundOpportunityAgent] Contract acknowledgment failed:', ackErr);
              }
            }
          }

          // Route non-shift requests to human review with actual manager notification
          if (!processResult.isShiftRequest) {
            notifications.push('ops_team:email_needs_review');
            
            try {
              const managers = await db.select({
                email: employees.email,
                firstName: employees.firstName,
              })
              .from(employees)
              .where(and(
                eq(employees.workspaceId, workspaceId),
                eq(employees.isActive, true),
                // @ts-expect-error — TS migration: fix in refactoring sprint
                inArray(employees.workspaceRole, [...APPROVER_ROLES])
              ));

              const senderName = email.fromName || email.fromEmail;
              const subjectLine = email.subject || '(no subject)';
              const preview = email.bodyText?.slice(0, 200) || 'No preview available';

              for (const manager of managers) {
                if (manager.email) {
                  NotificationDeliveryService.send({ type: 'non_shift_email_routing', workspaceId: workspaceId || 'system', recipientUserId: manager.email, channel: 'email', body: { to: manager.email, subject: `[Review Required] Non-staffing email from ${senderName}`, html: `<div style="font-family: Arial, sans-serif; max-width: 600px;"><h2 style="color: #1a1a1a;">Email Requires Human Review</h2><p>An inbound email was classified as <strong>not a staffing request</strong> and requires your attention.</p><div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;"><p><strong>From:</strong> ${senderName} &lt;${email.fromEmail}&gt;</p><p><strong>Subject:</strong> ${subjectLine}</p><p><strong>Classification:</strong> ${processResult.classificationReason || 'Not a shift request'}</p><p><strong>Confidence:</strong> ${Math.round((processResult.classificationConfidence || 0) * 100)}%</p></div><div style="background: #fafafa; padding: 12px; margin: 16px 0;"><p style="color: #666; font-size: 14px;">${preview}...</p></div><p style="color: #666; font-size: 13px;">Please review and respond to this email directly.</p></div>` } }).catch(err => {
                    log.error('[InboundOpportunityAgent] Failed to send non-shift routing email:', err);
                  });
                  notifications.push(`manager:${manager.email}:non_shift_routed`);
                }
              }
            } catch (routeErr) {
              log.error('[InboundOpportunityAgent] Failed to route non-shift email to managers:', routeErr);
            }
          // @ts-expect-error — TS migration: fix in refactoring sprint
          } else if (processResult.extractedShifts?.length > 0) {
            const autoStaffEnabled = processResult.contractor?.autoStaffingEnabled;
            if (autoStaffEnabled) {
              notifications.push('system:auto_staff_triggered');
            } else {
              notifications.push('ops_team:new_shift_opportunity');
            }

            // Send email notification to workspace managers
            try {
              const managers = await db.select({
                email: employees.email,
                firstName: employees.firstName,
              })
              .from(employees)
              .where(and(
                eq(employees.workspaceId, workspaceId),
                eq(employees.isActive, true),
                // @ts-expect-error — TS migration: fix in refactoring sprint
                inArray(employees.workspaceRole, [...APPROVER_ROLES])
              ));

              // @ts-expect-error — TS migration: fix in refactoring sprint
              const shiftCount = processResult.extractedShifts.length;
              const contractorName = processResult.contractor?.name || email.fromName || email.fromEmail;
              // @ts-expect-error — TS migration: fix in refactoring sprint
              const shiftDetails = processResult.extractedShifts.map((s: ExtractedShiftDetails) =>
                `- ${s.location || 'TBD'}: ${s.date || 'TBD'} ${s.startTime || ''}-${s.endTime || ''}`
              ).join('\n');

              for (const manager of managers) {
                if (manager.email) {
                  emailService.sendInboundOpportunityNotification({ // email-tracked
                    workspaceId,
                    managerEmail: manager.email,
                    managerName: manager.firstName || 'Manager',
                    contractorName,
                    shiftCount,
                    shiftDetails,
                  }).catch(err => {
                    log.error('[InboundOpportunityAgent] Failed to send manager notification:', err);
                  });
                }
              }
            } catch (notifyErr) {
              log.error('[InboundOpportunityAgent] Failed to notify managers:', notifyErr);
            }
          }

          // Attach reference info to result for downstream processing
          return { 
            notifications,
            referenceNumber,
            workspaceName,
            senderEmail: email.fromEmail,
            senderName: email.fromName,
          };
        },
      }
    );
    
    if (result.success) {
      // If auto-staffing is enabled and shifts were extracted, trigger Stage B
      // @ts-expect-error — TS migration: fix in refactoring sprint
      if (result.result?.contractor?.autoStaffingEnabled && (result as any).result?.extractedShifts?.length > 0) {
        // Auto-trigger staffing (async, don't block)
        this.triggerAutoStaffing(workspaceId).catch((err: unknown) => log.warn('[InboundOpportunity] Auto-staffing trigger failed', err));
      }
      
      return {
        success: true,
        message: (result as any).result?.isShiftRequest 
          ? `Extracted ${(result as any).result.extractedShifts?.length || 0} shifts from email`
          : 'Email routed to human inbox for review',
        data: result.result,
      };
    }
    
    return {
      success: false,
      message: result.error?.message || 'Failed to process email',
    };
  }
  
  /**
   * Classify if an email is a shift request
   */
  private async classifyEmail(
    workspaceId: string,
    subject: string,
    body: string
  ): Promise<{ isShiftRequest: boolean; confidence: number; reason: string; tokensUsed?: number }> {
    try {
      // Use direct meteredGemini for simple, fast classification
      const prompt = `Classify this email for a security staffing company.
      
Email Subject: "${subject}"
Email Body: "${body.substring(0, 500)}"

Is this a staffing request (asking for security guards, shift coverage, event security)?

Reply with ONLY this JSON (no markdown, no explanation):
{"isShiftRequest": true, "confidence": 0.9, "reason": "why you classified it this way"}

If NOT a staffing request, use isShiftRequest: false.`;

      const result = await meteredGemini.generate({
        workspaceId,
        featureKey: 'ai_email_classification',
        prompt,
        temperature: 0.1,
        maxOutputTokens: 250,
      });
      
      log.info('[InboundOpportunityAgent] Gemini classification response:', result.text);
      
      // Extract JSON from response
      let cleanText = result.text
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
      
      // Find JSON object in response
      const jsonMatch = cleanText.match(/\{[^{}]*"isShiftRequest"[^{}]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          isShiftRequest: parsed.isShiftRequest === true,
          confidence: parsed.confidence || 0.8,
          reason: parsed.reason || 'AI classification',
          // @ts-expect-error — TS migration: fix in refactoring sprint
          tokensUsed: result.tokensUsed,
        };
      }
      
      // If no valid JSON, check for clear yes/no indicators
      const lowerText = cleanText.toLowerCase();
      if (lowerText.includes('"isshiftrequest": true') || lowerText.includes('"isshiftrequest":true')) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        return { isShiftRequest: true, confidence: 0.85, reason: 'AI indicated shift request', tokensUsed: result.tokensUsed };
      }
      if (lowerText.includes('"isshiftrequest": false') || lowerText.includes('"isshiftrequest":false')) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        return { isShiftRequest: false, confidence: 0.85, reason: 'AI indicated not a shift request', tokensUsed: result.tokensUsed };
      }
      
      throw new Error('Could not parse AI classification response');
    } catch (error) {
      log.error('[InboundOpportunityAgent] Email classification failed:', error);
      // Use keyword-based fallback for robustness
      const keywords = ['guard', 'security', 'shift', 'hours', 'pay', 'armed', 'unarmed', 'position', 'staffing'];
      const emailText = `${subject} ${body}`.toLowerCase();
      const matchCount = keywords.filter(kw => emailText.includes(kw)).length;
      const isShiftRequest = matchCount >= 2;
      log.info(`[InboundOpportunityAgent] Using keyword fallback: ${matchCount} keywords matched`);
      return {
        isShiftRequest,
        confidence: isShiftRequest ? 0.7 : 0.3,
        reason: isShiftRequest 
          ? `Keyword fallback (${matchCount} keywords found)` 
          : 'Classification failed - routing to human',
      };
    }
  }
  
  /**
   * Extract shift details from email content
   */
  private async extractShiftDetails(
    workspaceId: string,
    subject: string,
    body: string
  ): Promise<{ shifts: ExtractedShiftDetails[]; tokensUsed?: number }> {
    try {
      const prompt = `Extract all shift details from this email. Return JSON array.

Subject: ${subject}

Body: ${body}

For each shift found, extract:
{
  "location": "address or venue name",
  "date": "YYYY-MM-DD format",
  "startTime": "HH:MM format (24hr)",
  "endTime": "HH:MM format (24hr)",
  "payRate": number (hourly rate),
  "requirements": {
    "armed": true/false,
    "unarmed": true/false,
    "certifications": ["list of required certs"],
    "dressCode": "description",
    "specialInstructions": "any special notes"
  },
  "clientName": "client/venue name",
  "pocName": "point of contact name",
  "pocPhone": "phone number",
  "pocEmail": "email address"
}

If a field cannot be determined, use null. Return array even for single shift.
Return ONLY the JSON array, no markdown, no explanations.`;

      // Use meteredGemini for reliable shift extraction
      const result = await meteredGemini.generate({
        workspaceId,
        featureKey: 'ai_shift_extraction',
        prompt,
        temperature: 0.1,
        maxOutputTokens: 1500,
      });
      
      log.info('[InboundOpportunityAgent] Gemini shift extraction:', result.text);
      
      // Clean up AI response - remove markdown code blocks
      let cleanText = result.text
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
      
      // Try to extract JSON array or object
      const arrayMatch = cleanText.match(/\[[\s\S]*\]/);
      const objectMatch = cleanText.match(/\{[\s\S]*\}/);
      
      if (arrayMatch) {
        cleanText = arrayMatch[0];
      } else if (objectMatch) {
        cleanText = objectMatch[0];
      }
      
      log.info('[InboundOpportunityAgent] Raw shift extraction:', result.text);
      log.info('[InboundOpportunityAgent] Cleaned shift JSON:', cleanText);
      
      let parsed: any;
      try {
        parsed = JSON.parse(cleanText);
      } catch (parseErr) {
        log.warn('[InboundOpportunityAgent] Initial JSON parse failed, attempting truncation recovery...');
        parsed = this.repairTruncatedJsonArray(cleanText);
        if (!parsed) {
          throw parseErr;
        }
        log.info('[InboundOpportunityAgent] Truncation recovery succeeded, recovered', Array.isArray(parsed) ? parsed.length : 1, 'shift(s)');
      }
      const shifts = Array.isArray(parsed) ? parsed : [parsed];
      
      return {
        shifts,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        tokensUsed: result.tokensUsed,
      };
    } catch (error) {
      log.error('[InboundOpportunityAgent] Shift extraction failed:', error);
      return { shifts: [] };
    }
  }

  private repairTruncatedJsonArray(text: string): any[] | null {
    try {
      if (!text.startsWith('[')) return null;
      
      const completedObjects: any[] = [];
      let depth = 0;
      let objectStart = -1;
      let inString = false;
      let escaped = false;

      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          inString = !inString;
          continue;
        }
        if (inString) continue;

        if (ch === '{') {
          if (depth === 0) objectStart = i;
          depth++;
        } else if (ch === '}') {
          depth--;
          if (depth === 0 && objectStart >= 0) {
            const objStr = text.substring(objectStart, i + 1);
            try {
              completedObjects.push(JSON.parse(objStr));
            } catch {
            }
            objectStart = -1;
          }
        }
      }

      return completedObjects.length > 0 ? completedObjects : null;
    } catch {
      return null;
    }
  }
  
  // ==========================================================================
  // STAGE B: AUTO-STAFFING
  // ==========================================================================
  
  /**
   * Trigger auto-staffing for all ready shifts
   */
  async triggerAutoStaffing(workspaceId: string): Promise<StageResult[]> {
    const readyShifts = await db.select()
      .from(stagedShifts)
      .where(and(
        eq(stagedShifts.workspaceId, workspaceId),
        eq(stagedShifts.status, 'ready_to_staff')
      ));
    
    const results: StageResult[] = [];
    
    for (const shift of readyShifts) {
      const result = await this.staffSingleShift(workspaceId, shift.id);
      results.push(result);
    }
    
    return results;
  }
  
  /**
   * Staff a single staged shift
   */
  async staffSingleShift(workspaceId: string, stagedShiftId: string): Promise<StageResult> {
    const result = await executionPipeline.execute(
      {
        workspaceId,
        operationType: 'inbound_opportunity',
        operationName: 'auto_staffing',
        initiator: 'inbound_opportunity_agent',
        initiatorType: 'system',
        payload: { stagedShiftId },
      },
      {
        // STEP 2: FETCH
        fetch: async (ctx) => {
          const [shift] = await db.select()
            .from(stagedShifts)
            .where(eq(stagedShifts.id, stagedShiftId))
            .limit(1);
          
          if (!shift) {
            throw new Error('Staged shift not found');
          }
          
          // Extract notification context from extractedData (stored during email ingestion)
          const extractedData = shift.extractedData as Record<string, any> | null;
          const notificationContext = extractedData?.notificationContext as {
            referenceNumber?: string;
            workspaceName?: string;
            senderEmail?: string;
            senderName?: string;
          } | undefined;
          
          // Get available employees with behavior scores
          const availableEmployees = await db.select({
            employee: employees,
            behaviorScore: employeeBehaviorScores,
          })
          .from(employees)
          .leftJoin(employeeBehaviorScores, eq(employees.id, employeeBehaviorScores.employeeId))
          .where(and(
            eq(employees.workspaceId, workspaceId),
            eq(employees.isActive, true)
          ));
          
          return {
            shift,
            availableEmployees,
            notificationContext,
          };
        },
        
        // STEP 3: VALIDATE
        validate: async (ctx, fetchedData) => {
          if (fetchedData.availableEmployees.length === 0) {
            return { valid: false, errors: ['No qualified employees available'] };
          }
          return { valid: true };
        },
        
        // STEP 4: PROCESS
        process: async (ctx, fetchedData) => {
          // Use Trinity to rank employees
          const rankedEmployees = await this.rankEmployeesForShift(
            workspaceId,
            fetchedData.shift,
            fetchedData.availableEmployees
          );
          
          ctx.tokensConsumed = rankedEmployees.tokensUsed;
          
          return {
            shift: fetchedData.shift,
            rankedEmployees: rankedEmployees.matches.slice(0, 5), // Top 5
            notificationContext: fetchedData.notificationContext,
          };
        },
        
        // STEP 5: MUTATE
        mutate: async (ctx, processResult) => {
          let recordsChanged = 0;

          // Update shift status
          await db.update(stagedShifts)
            .set({ status: 'staffing_in_progress' })
            .where(eq(stagedShifts.id, stagedShiftId));
          recordsChanged++;

          // Create shift offers for top candidates and collect offer details
          const offerExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
          const createdOffers: Array<{
            offerId: string;
            employeeId: string;
            rank: number;
            matchScore: number;
            matchReasons: string[];
          }> = [];

          for (let i = 0; i < processResult.rankedEmployees.length; i++) {
            const employee = processResult.rankedEmployees[i];

            const [insertedOffer] = await db.insert(automatedShiftOffers).values({
              stagedShiftId,
              employeeId: employee.employeeId,
              workspaceId,
              offerRank: i + 1,
              matchScore: employee.matchScore.toString(),
              matchReasoning: employee.matchReasons.join('; '),
              status: 'pending_response',
              offerExpiresAt,
            }).returning({ id: automatedShiftOffers.id });

            createdOffers.push({
              offerId: insertedOffer.id,
              employeeId: employee.employeeId,
              rank: i + 1,
              matchScore: employee.matchScore,
              matchReasons: employee.matchReasons,
            });
            recordsChanged++;
          }

          // Add created offers and expiration to processResult for notify step
          (processResult as any).createdOffers = createdOffers;
          (processResult as any).offerExpiresAt = offerExpiresAt;

          return { tables: ['staged_shifts', 'automated_shift_offers'], recordsChanged };
        },

        // STEP 7: NOTIFY
        notify: async (ctx, processResult) => {
          const notifications: string[] = [];
          const createdOffers = (processResult as any).createdOffers || [];
          const offerExpiresAt = (processResult as any).offerExpiresAt || new Date(Date.now() + 2 * 60 * 60 * 1000);

          // Get employee emails for all offer recipients
          const employeeIds = createdOffers.map((o: any) => o.employeeId);
          if (employeeIds.length === 0) {
            notifications.push('dashboard:staffing_offers_sent');
            return notifications;
          }

          const employeeRecords = await db.select({
            id: employees.id,
            email: employees.email,
            firstName: employees.firstName,
            lastName: employees.lastName,
          })
          .from(employees)
          .where(inArray(employees.id, employeeIds));

          // Create lookup map for employee data
          const employeeMap = new Map(employeeRecords.map(e => [e.id, e]));

          // Send email notifications to each employee
          for (const offer of createdOffers) {
            const employee = employeeMap.get(offer.employeeId);

            if (!employee?.email) {
              log.warn(`[InboundOpportunityAgent] No email for employee ${offer.employeeId}, skipping notification`);
              notifications.push(`employee:${offer.employeeId}:shift_offer_no_email`);
              continue;
            }

            try {
              // Format shift date for display
              const shiftDateStr = processResult.shift.shiftDate
                ? new Date(processResult.shift.shiftDate).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : 'TBD';

              // Send the shift offer email
              const emailResult = await emailService.sendShiftOfferNotification({ // email-tracked
                workspaceId,
                employeeId: offer.employeeId,
                employeeEmail: employee.email,
                employeeName: `${employee.firstName} ${employee.lastName}`.trim() || 'Team Member',
                shiftData: {
                  clientName: processResult.shift.clientName || 'Client',
                  location: processResult.shift.location || 'See details in app',
                  shiftDate: shiftDateStr,
                  startTime: processResult.shift.startTime || 'TBD',
                  endTime: processResult.shift.endTime || 'TBD',
                  payRate: processResult.shift.payRate?.toString(),
                },
                matchData: {
                  rank: offer.rank,
                  score: offer.matchScore,
                  reasons: offer.matchReasons,
                },
                offerId: offer.offerId,
                expiresAt: offerExpiresAt,
              });

              if (emailResult.success) {
                // Mark email as sent in the database
                await db.update(automatedShiftOffers)
                  .set({ emailNotificationSent: true })
                  .where(eq(automatedShiftOffers.id, offer.offerId));

                notifications.push(`employee:${offer.employeeId}:shift_offer_email_sent`);
                log.info(`[InboundOpportunityAgent] Shift offer email sent to ${employee.email} (Offer ID: ${offer.offerId})`);
              } else {
                notifications.push(`employee:${offer.employeeId}:shift_offer_email_failed`);
                log.error(`[InboundOpportunityAgent] Failed to send shift offer email to ${employee.email}:`, emailResult.error);
              }
            } catch (emailError: any) {
              notifications.push(`employee:${offer.employeeId}:shift_offer_email_error`);
              log.error(`[InboundOpportunityAgent] Error sending shift offer email to ${employee.email}:`, emailError.message);
            }
          }

          notifications.push('dashboard:staffing_offers_sent');

          // Send status update to original email sender if context available
          const notifyCtx = processResult.notificationContext;
          if (notifyCtx?.senderEmail) {
            try {
              const assignedNames = createdOffers.map((o: any) => {
                const emp = employeeMap.get(o.employeeId);
                return emp ? `${emp.firstName} ${emp.lastName}` : 'Staff Member';
              }).join(', ');
              
              // Format shift date for display
              const senderShiftDateStr = processResult.shift.shiftDate
                ? new Date(processResult.shift.shiftDate).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : 'TBD';
              
              // Step 4: Matching notification
              await emailService.sendStaffingStatusUpdate({ // email-tracked
                workspaceId,
                senderEmail: notifyCtx.senderEmail,
                senderName: notifyCtx.senderName,
                referenceNumber: notifyCtx.referenceNumber || 'N/A',
                workspaceName: notifyCtx.workspaceName || 'Our Team',
                currentStep: 'matching',
                stepNumber: 4,
                totalSteps: 7,
                stepDetails: `Found ${createdOffers.length} qualified personnel for your request.`,
                tempCode: notifyCtx.tempCode,
                statusPortalUrl: notifyCtx.statusPortalUrl,
                extractedInfo: {
                  location: processResult.shift.location,
                  date: senderShiftDateStr,
                  time: `${processResult.shift.startTime || 'TBD'} - ${processResult.shift.endTime || 'TBD'}`,
                },
              });
              
              // Step 5: Assigning notification
              await emailService.sendStaffingStatusUpdate({ // email-tracked
                workspaceId,
                senderEmail: notifyCtx.senderEmail,
                senderName: notifyCtx.senderName,
                referenceNumber: notifyCtx.referenceNumber || 'N/A',
                workspaceName: notifyCtx.workspaceName || 'Our Team',
                currentStep: 'assigning',
                stepNumber: 5,
                totalSteps: 7,
                stepDetails: `Contacting personnel: ${assignedNames}. Awaiting their confirmation.`,
                tempCode: notifyCtx.tempCode,
                statusPortalUrl: notifyCtx.statusPortalUrl,
              });
              
              notifications.push(`sender:${notifyCtx.senderEmail}:status_updates_sent`);
              log.info(`[InboundOpportunityAgent] Staffing status updates sent to sender: ${notifyCtx.senderEmail}`);
            } catch (senderErr: any) {
              log.error('[InboundOpportunityAgent] Failed to send sender status update:', senderErr.message);
            }
          }

          return notifications;
        },
      }
    );
    
    if (result.success) {
      return {
        success: true,
        message: `Sent offers to ${result.result?.rankedEmployees?.length || 0} employees`,
        data: result.result,
      };
    }
    
    return {
      success: false,
      message: result.error?.message || 'Failed to staff shift',
    };
  }
  
  /**
   * Rank employees for a shift using Trinity AI
   */
  private async rankEmployeesForShift(
    workspaceId: string,
    shift: any,
    employees: any[]
  ): Promise<{ matches: EmployeeMatch[]; tokensUsed?: number }> {
    try {
      const employeeList = employees.map(e => ({
        id: e.employee.id,
        name: `${e.employee.firstName} ${e.employee.lastName}`,
        certifications: e.employee.certifications || [],
        reliabilityScore: e.behaviorScore?.reliabilityScore || 0.5,
        acceptanceRate: e.behaviorScore?.offerAcceptanceRate || 0.5,
        preferredLocations: e.behaviorScore?.preferredLocations || [],
      }));
      
      const prompt = `Rank these employees for a security shift. Return JSON array of top 5.

Shift Requirements:
- Location: ${shift.location}
- Date: ${shift.shiftDate}
- Time: ${shift.startTime} - ${shift.endTime}
- Pay Rate: $${shift.payRate}/hr
- Requirements: ${JSON.stringify(shift.requirements)}

Available Employees:
${JSON.stringify(employeeList, null, 2)}

Return array of:
{
  "employeeId": "id",
  "employeeName": "name",
  "matchScore": 0.0-1.0,
  "matchReasons": ["reason1", "reason2"]
}

Consider: qualifications match, reliability history, preference match, availability.`;

      const result = await meteredGemini.generate({
        workspaceId,
        featureKey: 'ai_inbound_shift_matching',
        prompt,
        maxOutputTokens: 800,
        temperature: 0.2,
      });
      
      const parsed = JSON.parse(result.text.replace(/```json\n?|\n?```/g, '').trim());
      
      return {
        matches: Array.isArray(parsed) ? parsed : [],
        // @ts-expect-error — TS migration: fix in refactoring sprint
        tokensUsed: result.tokensUsed,
      };
    } catch (error) {
      log.error('[InboundOpportunityAgent] Employee ranking failed:', error);
      
      // Fallback: return employees sorted by reliability score
      return {
        matches: employees
          .sort((a, b) => 
            (parseFloat(b.behaviorScore?.reliabilityScore || '0.5')) - 
            (parseFloat(a.behaviorScore?.reliabilityScore || '0.5'))
          )
          .slice(0, 5)
          .map((e, i) => ({
            employeeId: e.employee.id,
            employeeName: `${e.employee.firstName} ${e.employee.lastName}`,
            matchScore: 0.7 - (i * 0.1),
            matchReasons: ['Available', 'Meets basic requirements'],
          })),
      };
    }
  }
  
  // ==========================================================================
  // STAGE C: EMPLOYEE ACCEPTANCE & AI APPROVAL
  // ==========================================================================
  
  /**
   * Process employee acceptance of a shift offer
   */
  async processOfferAcceptance(
    workspaceId: string,
    offerId: string,
    employeeId: string
  ): Promise<StageResult> {
    const result = await executionPipeline.execute(
      {
        workspaceId,
        operationType: 'inbound_opportunity',
        operationName: 'offer_acceptance',
        initiator: employeeId,
        initiatorType: 'user',
        payload: { offerId },
      },
      {
        // STEP 2: FETCH
        fetch: async (ctx) => {
          const [offer] = await db.select()
            .from(automatedShiftOffers)
            .where(and(
              eq(automatedShiftOffers.id, offerId),
              eq(automatedShiftOffers.employeeId, employeeId)
            ))
            .limit(1);
          
          if (!offer) {
            throw new Error('Offer not found');
          }
          
          const [shift] = await db.select()
            .from(stagedShifts)
            .where(eq(stagedShifts.id, offer.stagedShiftId))
            .limit(1);
          
          const [employee] = await db.select()
            .from(employees)
            .where(eq(employees.id, employeeId))
            .limit(1);
          
          const [behaviorScore] = await db.select()
            .from(employeeBehaviorScores)
            .where(eq(employeeBehaviorScores.employeeId, employeeId))
            .limit(1);
          
          const extractedData = shift?.extractedData as Record<string, any> | null;
          const notificationContext = extractedData?.notificationContext as {
            referenceNumber?: string;
            workspaceName?: string;
            senderEmail?: string;
            senderName?: string;
            tempCode?: string;
            statusPortalUrl?: string;
            claimKey?: string;
          } | undefined;
          
          return { offer, shift, employee, behaviorScore, notificationContext };
        },
        
        // STEP 3: VALIDATE
        validate: async (ctx, fetchedData) => {
          const errors: string[] = [];
          
          if (fetchedData.offer.status !== 'pending_response') {
            errors.push('Offer is no longer available');
          }
          
          if (new Date(fetchedData.offer.offerExpiresAt) < new Date()) {
            errors.push('Offer has expired');
          }
          
          if (fetchedData.shift.status === 'assigned') {
            errors.push('Shift has already been filled');
          }
          
          return { valid: errors.length === 0, errors };
        },
        
        // STEP 4: PROCESS
        process: async (ctx, fetchedData) => {
          // AI approval check
          const approvalResult = await this.getAiApproval(
            workspaceId,
            fetchedData.employee,
            fetchedData.shift,
            fetchedData.behaviorScore
          );
          
          ctx.tokensConsumed = approvalResult.tokensUsed;
          ctx.confidenceScore = approvalResult.confidence;
          
          return {
            ...fetchedData,
            approval: approvalResult,
          };
        },
        
        // STEP 5: MUTATE
        mutate: async (ctx, processResult) => {
          let recordsChanged = 0;
          
          const approval = processResult.approval;
          
          // Update offer with AI approval
          await db.update(automatedShiftOffers)
            .set({
              status: approval.decision === 'APPROVE' ? 'accepted' : 'pending_review',
              respondedAt: new Date(),
              aiApprovalStatus: approval.decision,
              aiApprovalConfidence: approval.confidence.toString(),
              aiApprovalReasoning: approval.reasoning,
            })
            .where(eq(automatedShiftOffers.id, (processResult as any).offer.id));
          recordsChanged++;
          
          if (approval.decision === 'APPROVE') {
            // ── RACE CONDITION GUARD ────────────────────────────────────────
            // Attempt atomic claim before assigning. If another org already
            // claimed this shift, back off gracefully.
            const claimKey = (processResult as any).notificationContext?.claimKey;
            let claimWon = true;
            if (claimKey) {
              // @ts-expect-error — TS migration: fix in refactoring sprint
              const claimResult = await staffingClaimService.attemptClaim({
                workspaceId,
                claimKey,
              });
              claimWon = (claimResult as any).won;
              if (!claimWon) {
                await db.update(automatedShiftOffers)
                  .set({
                    status: 'withdrawn',
                    aiApprovalReasoning: 'Lost to competing provider (race condition — claim token held by another org)',
                  })
                  .where(eq(automatedShiftOffers.id, (processResult as any).offer.id));
                recordsChanged++;
                log.info(`[InboundOpportunityAgent] Claim LOST for key ${claimKey} — shift not assigned to this org`);
                return { tables: ['automated_shift_offers'], recordsChanged, claimWon: false, claimKey };
              }
            }
            // ── END RACE CONDITION GUARD ─────────────────────────────────────

            // Assign the shift
            await db.update(stagedShifts)
              .set({
                status: 'assigned',
                assignedEmployeeId: (processResult as any).employee.id,
                assignedAt: new Date(),
              })
              .where(eq(stagedShifts.id, (processResult as any).shift.id));
            recordsChanged++;
            
            // Withdraw other pending offers for this shift
            await db.update(automatedShiftOffers)
              .set({ status: 'withdrawn' })
              .where(and(
                eq(automatedShiftOffers.stagedShiftId, (processResult as any).shift.id),
                eq(automatedShiftOffers.status, 'pending_response')
              ));
            recordsChanged++;
            
            // Update employee behavior score
            // @ts-expect-error — TS migration: fix in refactoring sprint
            await this.updateEmployeeBehaviorOnAcceptance(processResult.employee.id, workspaceId);
            recordsChanged++;

            return { tables: ['automated_shift_offers', 'staged_shifts', 'employee_behavior_scores'], recordsChanged, claimWon: true, claimKey };
          }
          
          return { tables: ['automated_shift_offers', 'staged_shifts', 'employee_behavior_scores'], recordsChanged, claimWon: true };
        },
        
        // STEP 7: NOTIFY
        notify: async (ctx, processResult) => {
          const notifications: string[] = [];
          
          if (processResult.approval.decision === 'APPROVE') {
            notifications.push(`employee:${(processResult as any).employee.id}:shift_confirmed`);
            notifications.push('system:trigger_contractor_notification');
            
            // Send Step 6 "confirming" status to original email sender
            const notifyCtx = (processResult as any).notificationContext;
            if (notifyCtx?.senderEmail) {
              try {
                const employeeName = `${(processResult as any).employee.firstName} ${(processResult as any).employee.lastName}`.trim();
                await emailService.sendStaffingStatusUpdate({ // email-tracked
                  workspaceId,
                  senderEmail: notifyCtx.senderEmail,
                  senderName: notifyCtx.senderName,
                  referenceNumber: notifyCtx.referenceNumber || 'N/A',
                  workspaceName: notifyCtx.workspaceName || 'Our Team',
                  currentStep: 'confirming',
                  stepNumber: 6,
                  totalSteps: 7,
                  stepDetails: `${employeeName} has been confirmed for your shift. Preparing final confirmation details.`,
                  tempCode: notifyCtx.tempCode,
                  statusPortalUrl: notifyCtx.statusPortalUrl,
                });
                notifications.push(`sender:${notifyCtx.senderEmail}:step6_confirming_sent`);
                log.info(`[InboundOpportunityAgent] Step 6 confirming notification sent to sender: ${notifyCtx.senderEmail}`);
              } catch (senderErr: any) {
                log.error('[InboundOpportunityAgent] Failed to send step 6 sender notification:', senderErr.message);
              }
            }
            
            // ── ONBOARDING INVITATION (Email 2) ───────────────────────────
            // Send after claim is confirmed won. Fires even if claimKey is absent
            // (single-org path), because claimWon defaults to true.
            // @ts-expect-error — TS migration: fix in refactoring sprint
            if (processResult.claimWon !== false && notifyCtx?.senderEmail) {
              try {
                const shift = (processResult as any).shift;
                const shiftEd = shift?.extractedData as Record<string, any> | null;
                const confirmationNumber = `CONF-${Date.now().toString(36).toUpperCase()}`;
                const portalUrl = `${getAppBaseUrl()}/portal`;
                const signupUrl = `${getAppBaseUrl()}/signup`;

                await emailService.sendStaffingOnboardingInvitation({ // email-tracked
                  workspaceId,
                  clientEmail: notifyCtx.senderEmail,
                  clientName: notifyCtx.senderName,
                  workspaceName: notifyCtx.workspaceName || 'Our Team',
                  referenceNumber: notifyCtx.referenceNumber || 'N/A',
                  confirmationNumber,
                  portalUrl,
                  signupUrl,
                  shiftDetails: {
                    location: shift?.location || shiftEd?.location || 'TBD',
                    date: shift?.shiftDate
                      ? new Date(shift.shiftDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                      : shiftEd?.date || 'TBD',
                    startTime: shift?.startTime || shiftEd?.startTime || 'TBD',
                    endTime: shift?.endTime || shiftEd?.endTime || 'TBD',
                    positionType: shiftEd?.positionType || shiftEd?.guardType || 'Security Officer',
                  },
                  assignedOfficers: [{
                    name: `${(processResult as any).employee.firstName} ${(processResult as any).employee.lastName}`.trim(),
                    role: shiftEd?.positionType || 'Security Officer',
                    credentialStatus: 'Verified',
                  }],
                  nextSteps: {
                    contractReady: true,
                    dlUploadRequired: true,
                    postOrdersRequired: true,
                    providerDocsReady: true,
                  },
                });
                notifications.push(`sender:${notifyCtx.senderEmail}:onboarding_invitation_sent`);
                log.info(`[InboundOpportunityAgent] Onboarding invitation sent to ${notifyCtx.senderEmail} [${confirmationNumber}]`);
              } catch (onboardErr: any) {
                log.error('[InboundOpportunityAgent] Failed to send onboarding invitation:', onboardErr.message);
              }
            }

            // ── DROP NOTIFICATIONS for losing orgs ────────────────────────
            // Await per CLAUDE.md §B — no fire-and-forget for notifications.
            if ((processResult as any).claimKey) {
              try {
                await staffingClaimService.sendDropNotifications({
                  claimKey: (processResult as any).claimKey,
                  winnerWorkspaceId: workspaceId,
                  clientEmail: notifyCtx?.senderEmail || '',
                  clientName: notifyCtx?.senderName,
                  shiftDescription: (processResult as any).shift?.location || undefined,
                  referenceNumber: notifyCtx?.referenceNumber,
                });
                notifications.push(`system:drop_notifications_sent:${(processResult as any).claimKey}`);
              } catch (dropErr: any) {
                log.warn('[IOA] sendDropNotifications error (non-fatal):', dropErr?.message);
              }
            }

            // Trigger Stage D (contractor notification)
            setTimeout(() => {
              // @ts-expect-error — TS migration: fix in refactoring sprint
              this.notifyContractor(workspaceId, processResult.shift.id).catch((err: unknown) => log.warn('[InboundOpportunity] Contractor notification failed', err));
            }, 1000);
          } else {
            notifications.push(`employee:${(processResult as any).employee.id}:acceptance_under_review`);
            notifications.push('ops_team:acceptance_needs_review');
          }
          
          return notifications;
        },
      }
    );
    
    if (result.success) {
      return {
        success: true,
        message: result.result?.approval?.decision === 'APPROVE'
          ? 'Shift confirmed! You will receive details shortly.'
          : 'Your acceptance is under review.',
        data: result.result,
      };
    }
    
    return {
      success: false,
      message: result.error?.message || 'Failed to process acceptance',
    };
  }
  
  /**
   * Get AI approval for an employee-shift match
   */
  private async getAiApproval(
    workspaceId: string,
    employee: any,
    shift: any,
    behaviorScore: any
  ): Promise<{ decision: 'APPROVE' | 'REVIEW' | 'REJECT'; confidence: number; reasoning: string; tokensUsed?: number }> {
    try {
      const prompt = `Evaluate if this employee is a good match for this shift.

Employee:
- Name: ${employee.firstName} ${employee.lastName}
- Certifications: ${JSON.stringify(employee.certifications || [])}
- Reliability Score: ${behaviorScore?.reliabilityScore || 'Unknown'}
- On-Time Rate: ${behaviorScore?.onTimeArrivalRate || 'Unknown'}
- Acceptance Rate: ${behaviorScore?.offerAcceptanceRate || 'Unknown'}

Shift Requirements:
- Location: ${shift.location}
- Requirements: ${JSON.stringify(shift.requirements)}

Decision criteria:
- APPROVE if confidence > 0.85 and employee meets requirements
- REVIEW if confidence 0.6-0.85 or minor concerns
- REJECT if confidence < 0.6 or major issues

Return JSON:
{
  "decision": "APPROVE|REVIEW|REJECT",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

      const result = await meteredGemini.generate({
        workspaceId,
        featureKey: 'ai_match_approval',
        prompt,
        maxOutputTokens: 200,
        temperature: 0.1,
      });
      
      const parsed = JSON.parse(result.text.replace(/```json\n?|\n?```/g, '').trim());
      
      return {
        decision: parsed.decision || 'REVIEW',
        confidence: parsed.confidence || 0.7,
        reasoning: parsed.reasoning || 'AI evaluation completed',
        // @ts-expect-error — TS migration: fix in refactoring sprint
        tokensUsed: result.tokensUsed,
      };
    } catch (error) {
      log.error('[InboundOpportunityAgent] AI approval failed:', error);
      return {
        decision: 'REVIEW',
        confidence: 0.5,
        reasoning: 'AI approval failed - routing to human review',
      };
    }
  }
  
  /**
   * Update employee behavior score on acceptance
   */
  private async updateEmployeeBehaviorOnAcceptance(employeeId: string, workspaceId: string): Promise<void> {
    const [existing] = await db.select()
      .from(employeeBehaviorScores)
      .where(eq(employeeBehaviorScores.employeeId, employeeId))
      .limit(1);
    
    if (existing) {
      const newAccepted = (existing.totalOffersAccepted || 0) + 1;
      const newReceived = (existing.totalOffersReceived || 0) + 1;
      const newRate = newReceived > 0 ? (newAccepted / newReceived) : 0.5;
      
      await db.update(employeeBehaviorScores)
        .set({
          totalOffersAccepted: newAccepted,
          offerAcceptanceRate: newRate.toString(),
          updatedAt: new Date(),
        })
        .where(eq(employeeBehaviorScores.employeeId, employeeId));
    } else {
      await db.insert(employeeBehaviorScores).values({
        employeeId,
        workspaceId,
        totalOffersAccepted: 1,
        totalOffersReceived: 1,
        offerAcceptanceRate: '1.0',
      });
    }
  }
  
  // ==========================================================================
  // STAGE D: CONTRACTOR NOTIFICATION
  // ==========================================================================
  
  /**
   * Notify contractor that shift has been filled
   */
  async notifyContractor(workspaceId: string, stagedShiftId: string): Promise<StageResult> {
    const result = await executionPipeline.execute(
      {
        workspaceId,
        operationType: 'inbound_opportunity',
        operationName: 'contractor_notification',
        initiator: 'inbound_opportunity_agent',
        initiatorType: 'system',
        payload: { stagedShiftId },
      },
      {
        // STEP 2: FETCH
        fetch: async (ctx) => {
          const [shift] = await db.select()
            .from(stagedShifts)
            .where(eq(stagedShifts.id, stagedShiftId))
            .limit(1);
          
          if (!shift || !shift.assignedEmployeeId) {
            throw new Error('Shift not found or not assigned');
          }
          
          const [employee] = await db.select()
            .from(employees)
            .where(eq(employees.id, shift.assignedEmployeeId))
            .limit(1);
          
          let contractor = null;
          if (shift.contractorId) {
            const [c] = await db.select()
              .from(knownContractors)
              .where(eq(knownContractors.id, shift.contractorId))
              .limit(1);
            contractor = c;
          }
          
          const extractedData = shift?.extractedData as Record<string, any> | null;
          const notificationContext = extractedData?.notificationContext as {
            referenceNumber?: string;
            workspaceName?: string;
            senderEmail?: string;
            senderName?: string;
            tempCode?: string;
            statusPortalUrl?: string;
            claimKey?: string;
          } | undefined;
          
          return { shift, employee, contractor, notificationContext };
        },
        
        // STEP 3: VALIDATE
        validate: async (ctx, fetchedData) => {
          if (!fetchedData.employee) {
            return { valid: false, errors: ['Assigned employee not found'] };
          }
          
          const recipientEmail = fetchedData.contractor?.email || fetchedData.shift.pocEmail;
          if (!recipientEmail) {
            return { valid: false, errors: ['No contractor email available'] };
          }
          
          return { valid: true };
        },
        
        // STEP 4: PROCESS
        process: async (ctx, fetchedData) => {
          // Generate confirmation email using Trinity
          const emailContent = await this.generateContractorEmail(
            workspaceId,
            fetchedData.shift,
            fetchedData.employee,
            fetchedData.contractor
          );
          
          ctx.tokensConsumed = emailContent.tokensUsed;
          
          return {
            ...fetchedData,
            emailContent,
          };
        },
        
        // STEP 5: MUTATE
        mutate: async (ctx, processResult) => {
          const recipientEmail = (processResult as any).contractor?.email || (processResult as any).shift.pocEmail;
          const recipientName = (processResult as any).contractor?.contactName || (processResult as any).shift.pocName;
          
          // Create communication record
          await db.insert(contractorCommunications).values({
            workspaceId,
            contractorId: (processResult as any).contractor?.id,
            stagedShiftId,
            communicationType: 'email',
            subject: processResult.emailContent.subject,
            body: processResult.emailContent.body,
            recipientEmail,
            recipientName,
            employeeInfo: {
              name: `${(processResult as any).employee.firstName} ${(processResult as any).employee.lastName}`,
              phone: (processResult as any).employee.phone || '',
              qualifications: (processResult as any).employee.certifications || [],
            },
            shiftDetails: {
              location: (processResult as any).shift.location,
              date: (processResult as any).shift.shiftDate,
              startTime: (processResult as any).shift.startTime,
              endTime: (processResult as any).shift.endTime,
            },
            aiGenerated: true,
            status: 'pending',
          });
          
          // Update shift status
          await db.update(stagedShifts)
            .set({ status: 'contractor_notified' })
            .where(eq(stagedShifts.id, stagedShiftId));
          
          // Update contractor stats
          // @ts-expect-error — TS migration: fix in refactoring sprint
          if (processResult.contractor?.id) {
            await db.update(knownContractors)
              .set({
                totalShiftsFilled: sql`${knownContractors.totalShiftsFilled} + 1`,
                updatedAt: new Date(),
              })
              .where(eq(knownContractors.id, (processResult as any).contractor.id));
          }
          
          return { tables: ['contractor_communications', 'staged_shifts', 'known_contractors'], recordsChanged: 3 };
        },
        
        // STEP 7: NOTIFY
        notify: async (ctx, processResult) => {
          const notifications: string[] = [];
          const recipientEmail = (processResult as any).contractor?.email || (processResult as any).shift.pocEmail;

          // Actually send the contractor confirmation email via Resend
          if (recipientEmail && processResult.emailContent) {
            try {
              await NotificationDeliveryService.send({ type: 'contractor_confirmation', workspaceId: workspaceId || 'system', recipientUserId: recipientEmail, channel: 'email', body: { to: recipientEmail, subject: processResult.emailContent.subject, html: processResult.emailContent.body.replace(/\n/g, '<br>') } });
              notifications.push('email:contractor_confirmation_sent');
              log.info(`[InboundOpportunityAgent] Contractor confirmation sent to ${recipientEmail}`);
            } catch (emailError: any) {
              log.error('[InboundOpportunityAgent] Failed to send contractor email:', emailError);
              notifications.push('email:contractor_confirmation_failed');
            }
          }

          // Send Step 7 "completed" status to original email sender
          const notifyCtx = (processResult as any).notificationContext;
          if (notifyCtx?.senderEmail) {
            try {
              const employeeName = `${(processResult as any).employee.firstName} ${(processResult as any).employee.lastName}`.trim();
              const shiftDateStr = (processResult as any).shift.shiftDate
                // @ts-expect-error — TS migration: fix in refactoring sprint
                ? new Date(processResult.shift.shiftDate).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : 'TBD';

              await emailService.sendStaffingStatusUpdate({ // email-tracked
                workspaceId,
                senderEmail: notifyCtx.senderEmail,
                senderName: notifyCtx.senderName,
                referenceNumber: notifyCtx.referenceNumber || 'N/A',
                workspaceName: notifyCtx.workspaceName || 'Our Team',
                currentStep: 'completed',
                stepNumber: 7,
                totalSteps: 7,
                stepDetails: `Your staffing request is complete! ${employeeName} has been assigned and confirmed for ${shiftDateStr}. A confirmation email has been sent to your contact.`,
                tempCode: notifyCtx.tempCode,
                statusPortalUrl: notifyCtx.statusPortalUrl,
                extractedInfo: {
                  location: (processResult as any).shift.location,
                  date: shiftDateStr,
                  time: `${(processResult as any).shift.startTime || 'TBD'} - ${(processResult as any).shift.endTime || 'TBD'}`,
                },
              });
              notifications.push(`sender:${notifyCtx.senderEmail}:step7_completed_sent`);
              log.info(`[InboundOpportunityAgent] Step 7 completed notification sent to sender: ${notifyCtx.senderEmail}`);
            } catch (senderErr: any) {
              log.error('[InboundOpportunityAgent] Failed to send step 7 sender notification:', senderErr.message);
            }
          }

          notifications.push('ops_team:shift_auto_filled_complete');
          notifications.push('dashboard:shift_fully_processed');

          // Send client portal invitation if sender email is available (reuses notifyCtx from above)
          if (notifyCtx?.senderEmail) {
            try {
              const prospect = await clientProspectService.getByEmail(workspaceId, notifyCtx.senderEmail);
              if (prospect && !prospect.onboardingLinkSent) {
                await clientProspectService.incrementShiftsFilled(prospect.id);
                
                const portalUrl = clientProspectService.getStatusPortalUrl(prospect.tempCode);
                const signupUrl = clientProspectService.getSignupUrl(prospect.tempCode);
                
                await emailService.sendClientPortalInvitation({ // email-tracked
                  workspaceId,
                  clientEmail: notifyCtx.senderEmail,
                  clientName: notifyCtx.senderName || prospect.contactName || undefined,
                  workspaceName: notifyCtx.workspaceName || 'Our Team',
                  portalUrl,
                  signupUrl,
                  tempCode: prospect.tempCode,
                  shiftsFilled: (prospect.totalShiftsFilled || 0) + 1,
                });
                
                await clientProspectService.markOnboardingLinkSent(prospect.id);
                notifications.push(`sender:${notifyCtx.senderEmail}:portal_invitation_sent`);
                log.info(`[InboundOpportunityAgent] Client portal invitation sent to ${notifyCtx.senderEmail}`);
              } else if (prospect) {
                await clientProspectService.incrementShiftsFilled(prospect.id);
                notifications.push(`sender:${notifyCtx.senderEmail}:portal_already_invited`);
              }
            } catch (portalErr: any) {
              log.error('[InboundOpportunityAgent] Failed to send portal invitation:', portalErr.message);
            }
          }

          return notifications;
        },
      }
    );
    
    if (result.success) {
      return {
        success: true,
        message: 'Contractor notified successfully',
        data: result.result,
      };
    }
    
    return {
      success: false,
      message: result.error?.message || 'Failed to notify contractor',
    };
  }
  
  /**
   * Generate contractor confirmation email using Trinity AI
   */
  private async generateContractorEmail(
    workspaceId: string,
    shift: any,
    employee: any,
    contractor: any
  ): Promise<{ subject: string; body: string; tokensUsed?: number }> {
    try {
      const prompt = `Draft a professional email confirming shift coverage.

Recipient: ${contractor?.contactName || shift.pocName || 'Hiring Manager'}
Company: ${contractor?.companyName || shift.clientName || 'Client'}

Shift Details:
- Location: ${shift.location}
- Date: ${shift.shiftDate}
- Time: ${shift.startTime} - ${shift.endTime}

Assigned Guard:
- Name: ${employee.firstName} ${employee.lastName}
- Phone: ${employee.phone || 'Will be provided'}
- Qualifications: ${JSON.stringify(employee.certifications || [])}

Write a concise, professional email. Return JSON:
{
  "subject": "email subject line",
  "body": "full email body"
}`;

      const result = await meteredGemini.generate({
        workspaceId,
        featureKey: 'ai_contractor_email',
        prompt,
        maxOutputTokens: 500,
        temperature: 0.3,
      });
      
      const parsed = JSON.parse(result.text.replace(/```json\n?|\n?```/g, '').trim());
      
      return {
        subject: parsed.subject || `Shift Confirmation - ${shift.shiftDate}`,
        body: parsed.body || 'Your shift has been filled. Details will follow.',
        // @ts-expect-error — TS migration: fix in refactoring sprint
        tokensUsed: result.tokensUsed,
      };
    } catch (error) {
      log.error('[InboundOpportunityAgent] Email generation failed:', error);
      return {
        subject: `Shift Confirmation - ${shift.shiftDate}`,
        body: `Your shift request has been filled.\n\nAssigned: ${employee.firstName} ${employee.lastName}\nPhone: ${employee.phone || 'TBD'}\n\nPlease contact us if you have any questions.`,
      };
    }
  }
}

// Export singleton instance
export const inboundOpportunityAgent = InboundOpportunityAgent.getInstance();
