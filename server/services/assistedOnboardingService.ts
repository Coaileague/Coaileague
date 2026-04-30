/**
 * ASSISTED ONBOARDING SERVICE
 * ============================
 * Enables platform support staff to create and configure organizations on behalf of users
 * who cannot do so themselves (disability, time constraints, etc.)
 * 
 * Workflow:
 * 1. Support creates workspace with target user info
 * 2. Support uploads documents (employee rosters, schedules, etc.)
 * 3. Trinity AI extracts data from documents
 * 4. Support reviews and approves extracted data
 * 5. Support initiates handoff (sends email with secure token)
 * 6. Target user clicks link and claims workspace ownership
 */

import { db } from '../db';
import { workspaces, users, employees } from '@shared/schema';
import { eq, and, lt, isNull } from 'drizzle-orm';
import crypto from 'crypto';
import { sendAssistedOnboardingHandoff } from './emailService';
import { createLogger } from '../lib/logger';
const log = createLogger('assistedOnboardingService');


// Handoff token expiry: 72 hours
const HANDOFF_TOKEN_EXPIRY_HOURS = 72;

export type HandoffStatus = 'pending_setup' | 'ready_for_handoff' | 'handoff_sent' | 'handoff_complete' | 'handoff_expired';

export interface CreateAssistedWorkspaceInput {
  supportUserId: string;
  targetUserEmail: string;
  targetUserName: string;
  targetUserPhone?: string;
  workspaceName: string;
  notes?: string;
  industryData?: {
    sectorId?: string;
    industryGroupId?: string;
    subIndustryId?: string;
    customIndustryName?: string;
    customIndustryDescription?: string;
  };
}

export interface AssistedWorkspaceResult {
  success: boolean;
  workspaceId?: string;
  error?: string;
}

export interface HandoffResult {
  success: boolean;
  token?: string;
  expiresAt?: Date;
  error?: string;
}

export interface HandoffCompleteResult {
  success: boolean;
  workspaceId?: string;
  workspaceName?: string;
  error?: string;
}

export interface ExtractionResult {
  success: boolean;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  extractedData?: Record<string, any>;
  error?: string;
}

class AssistedOnboardingService {
  private static instance: AssistedOnboardingService;

  static getInstance(): AssistedOnboardingService {
    if (!AssistedOnboardingService.instance) {
      AssistedOnboardingService.instance = new AssistedOnboardingService();
    }
    return AssistedOnboardingService.instance;
  }

  /**
   * Generate secure handoff token
   */
  private generateHandoffToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Create a new workspace on behalf of a user
   * Called by support staff during assisted onboarding
   */
  async createAssistedWorkspace(input: CreateAssistedWorkspaceInput): Promise<AssistedWorkspaceResult> {
    const { 
      supportUserId, 
      targetUserEmail, 
      targetUserName, 
      targetUserPhone,
      workspaceName,
      notes,
      industryData 
    } = input;

    try {
      // Check if target email already has a workspace
      const existingWorkspace = await db.query.workspaces.findFirst({
        where: eq(workspaces.targetUserEmail, targetUserEmail),
      });

      if (existingWorkspace && existingWorkspace.handoffStatus !== 'handoff_expired') {
        return {
          success: false,
          error: 'A workspace is already being prepared for this email address',
        };
      }

      // Generate organization ID
      const orgId = `wfosupport-${Date.now()}${Math.floor(Math.random() * 1000)}`;

      // Create the workspace with support staff as temporary owner
      const [workspace] = await db.insert(workspaces).values({
        name: workspaceName,
        ownerId: supportUserId,
        organizationId: orgId,
        workspaceType: 'production',
        subscriptionTier: 'free',
        subscriptionStatus: 'active',
        
        // Assisted onboarding metadata
        assistedOnboardingBy: supportUserId,
        assistedOnboardingAt: new Date(),
        assistedOnboardingNotes: notes || null,
        
        // Target user info
        targetUserEmail,
        targetUserName,
        targetUserPhone: targetUserPhone || null,
        
        // Handoff status
        handoffStatus: 'pending_setup',
        
        // Document extraction status
        assistedDocsUploaded: 0,
        assistedDocsProcessed: 0,
        assistedExtractionStatus: 'pending',
        
        // Industry data if provided
        ...(industryData?.sectorId && { sectorId: industryData.sectorId }),
        ...(industryData?.industryGroupId && { industryGroupId: industryData.industryGroupId }),
        ...(industryData?.subIndustryId && { subIndustryId: industryData.subIndustryId }),
        ...(industryData?.customIndustryName && { customIndustryName: industryData.customIndustryName }),
        ...(industryData?.customIndustryDescription && { customIndustryDescription: industryData.customIndustryDescription }),
      }).returning();

      log.info(`[AssistedOnboarding] Created workspace ${workspace.id} for ${targetUserEmail} by support ${supportUserId}`);

      try {
        const { provisionWorkspace } = await import('./workspaceProvisioningService');
        await provisionWorkspace({ workspaceId: workspace.id, ownerId: supportUserId, workspaceName: (workspace as any).name });
      } catch (provError: unknown) {
        log.warn('[AssistedOnboarding] Workspace provisioning failed (non-blocking):', (provError as any)?.message);
      }

      // Auto-initialize onboarding pipeline for the new workspace
      try {
        const { onboardingPipelineService } = await import('./onboardingPipelineService');
        await onboardingPipelineService.initializeOnboarding(workspace.id);
        log.info(`[AssistedOnboarding] Initialized onboarding pipeline for workspace ${workspace.id}`);
      } catch (onboardingError) {
        log.warn(`[AssistedOnboarding] Failed to initialize onboarding pipeline:`, onboardingError);
        // Don't fail workspace creation if onboarding init fails
      }

      // Provision email addresses for the workspace
      try {
        const { emailProvisioningService } = await import('./email/emailProvisioningService');
        const emailSlug = (workspace as any).emailSlug || workspace.id.replace(/[^a-z0-9]/gi, '').slice(0, 20).toLowerCase();
        await emailProvisioningService.provisionWorkspaceAddresses(workspace.id, emailSlug);
        log.info(`[AssistedOnboarding] Email addresses provisioned for workspace ${workspace.id}`);
      } catch (emailError) {
        log.warn(`[AssistedOnboarding] Email provisioning failed (non-fatal):`, emailError);
      }

      return {
        success: true,
        workspaceId: workspace.id,
      };
    } catch (error: any) {
      log.error('[AssistedOnboarding] Failed to create workspace:', error);
      return {
        success: false,
        error: (error instanceof Error ? error.message : String(error)) || 'Failed to create workspace',
      };
    }
  }

  /**
   * Update document count when files are uploaded
   */
  async recordDocumentUpload(workspaceId: string, count: number = 1): Promise<boolean> {
    try {
      const workspace = await db.query.workspaces.findFirst({
        where: eq(workspaces.id, workspaceId),
      });

      if (!workspace) return false;

      await db.update(workspaces)
        .set({
          assistedDocsUploaded: (workspace.assistedDocsUploaded || 0) + count,
          updatedAt: new Date(),
        })
        .where(eq(workspaces.id, workspaceId));

      return true;
    } catch (error) {
      log.error('[AssistedOnboarding] Failed to record document upload:', error);
      return false;
    }
  }

  /**
   * Start AI extraction process on uploaded documents
   */
  async startExtraction(workspaceId: string): Promise<ExtractionResult> {
    try {
      await db.update(workspaces)
        .set({
          assistedExtractionStatus: 'processing',
          updatedAt: new Date(),
        })
        .where(eq(workspaces.id, workspaceId));

      return {
        success: true,
        status: 'processing',
      };
    } catch (error: any) {
      return {
        success: false,
        status: 'failed',
        error: (error instanceof Error ? error.message : String(error)),
      };
    }
  }

  /**
   * Store extracted data from AI processing
   */
  async storeExtractedData(
    workspaceId: string, 
    extractedData: Record<string, any>,
    processedCount: number = 1
  ): Promise<ExtractionResult> {
    try {
      const workspace = await db.query.workspaces.findFirst({
        where: eq(workspaces.id, workspaceId),
      });

      if (!workspace) {
        return { success: false, status: 'failed', error: 'Workspace not found' };
      }

      // Merge with existing extracted data
      const existingData = (workspace.assistedDataExtracted as Record<string, any>) || {};
      const mergedData = { ...existingData, ...extractedData };

      await db.update(workspaces)
        .set({
          assistedDataExtracted: mergedData,
          assistedDocsProcessed: (workspace.assistedDocsProcessed || 0) + processedCount,
          assistedExtractionStatus: 'complete',
          updatedAt: new Date(),
        })
        .where(eq(workspaces.id, workspaceId));

      return {
        success: true,
        status: 'complete',
        extractedData: mergedData,
      };
    } catch (error: any) {
      await db.update(workspaces)
        .set({ assistedExtractionStatus: 'failed' })
        .where(eq(workspaces.id, workspaceId));

      return {
        success: false,
        status: 'failed',
        error: (error instanceof Error ? error.message : String(error)),
      };
    }
  }

  /**
   * Mark workspace as ready for handoff
   */
  async markReadyForHandoff(workspaceId: string): Promise<boolean> {
    try {
      await db.update(workspaces)
        .set({
          handoffStatus: 'ready_for_handoff',
          updatedAt: new Date(),
        })
        .where(eq(workspaces.id, workspaceId));

      return true;
    } catch (error) {
      log.error('[AssistedOnboarding] Failed to mark ready for handoff:', error);
      return false;
    }
  }

  /**
   * Initiate handoff by generating token and sending email
   */
  async initiateHandoff(workspaceId: string): Promise<HandoffResult> {
    try {
      const workspace = await db.query.workspaces.findFirst({
        where: eq(workspaces.id, workspaceId),
      });

      if (!workspace) {
        return { success: false, error: 'Workspace not found' };
      }

      if (!workspace.targetUserEmail) {
        return { success: false, error: 'No target user email configured' };
      }

      // Generate secure token
      const token = this.generateHandoffToken();
      const expiresAt = new Date(Date.now() + HANDOFF_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

      // Store token and update status
      await db.update(workspaces)
        .set({
          handoffToken: token,
          handoffTokenExpiry: expiresAt,
          handoffStatus: 'handoff_sent',
          handoffSentAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(workspaces.id, workspaceId));

      // Send handoff email
      try {
        await sendAssistedOnboardingHandoff({
          toEmail: workspace.targetUserEmail,
          toName: workspace.targetUserName || 'there',
          workspaceName: workspace.name,
          handoffToken: token,
          expiresAt,
        });
      } catch (emailError: any) {
        log.error('[AssistedOnboarding] Failed to send handoff email:', emailError);
        // Rollback status if email fails
        await db.update(workspaces)
          .set({
            handoffToken: null,
            handoffTokenExpiry: null,
            handoffStatus: 'ready_for_handoff',
            handoffSentAt: null,
          })
          .where(eq(workspaces.id, workspaceId));

        return { 
          success: false, 
          error: `Failed to send handoff email: ${emailError.message}` 
        };
      }

      log.info(`[AssistedOnboarding] Handoff initiated for workspace ${workspaceId} to ${workspace.targetUserEmail}`);

      return {
        success: true,
        token,
        expiresAt,
      };
    } catch (error: any) {
      log.error('[AssistedOnboarding] Failed to initiate handoff:', error);
      return {
        success: false,
        error: (error instanceof Error ? error.message : String(error)) || 'Failed to initiate handoff',
      };
    }
  }

  /**
   * Complete handoff when target user claims the workspace
   * This transfers ownership from support staff to the actual user
   */
  async completeHandoff(token: string, userId: string): Promise<HandoffCompleteResult> {
    try {
      // Find workspace by token
      const workspace = await db.query.workspaces.findFirst({
        where: and(
          eq(workspaces.handoffToken, token),
          eq(workspaces.handoffStatus, 'handoff_sent'),
        ),
      });

      if (!workspace) {
        return { success: false, error: 'Invalid or expired handoff token' };
      }

      // Check token expiry
      if (workspace.handoffTokenExpiry && new Date() > workspace.handoffTokenExpiry) {
        // Mark as expired
        await db.update(workspaces)
          .set({
            handoffStatus: 'handoff_expired',
            updatedAt: new Date(),
          })
          .where(eq(workspaces.id, workspace.id));

        return { success: false, error: 'Handoff token has expired. Please contact support.' };
      }

      // Get user info
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Transfer ownership
      await db.update(workspaces)
        .set({
          ownerId: userId,
          handoffStatus: 'handoff_complete',
          handoffCompletedAt: new Date(),
          handoffCompletedBy: userId,
          handoffToken: null, // Clear token for security
          handoffTokenExpiry: null,
          updatedAt: new Date(),
        })
        .where(eq(workspaces.id, workspace.id));

      // Create employee record for new owner
      await db.insert(employees).values({
        userId,
        workspaceId: workspace.id,
        firstName: user.firstName || workspace.targetUserName?.split(' ')[0] || 'New',
        lastName: user.lastName || workspace.targetUserName?.split(' ').slice(1).join(' ') || 'Owner',
        email: user.email,
        workspaceRole: 'org_owner',
        payType: 'salary',
        isActive: true,
      }).onConflictDoNothing();

      // Update user's current workspace
      await db.update(users)
        .set({
          currentWorkspaceId: workspace.id,
          role: 'org_owner',
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      log.info(`[AssistedOnboarding] Handoff complete: workspace ${workspace.id} transferred to user ${userId}`);

      // Fire-and-forget: emit workspace.created event + welcome email + audit log (non-blocking)
      Promise.resolve().then(async () => {
        try {
          const { platformEventBus } = await import('./platformEventBus');
          platformEventBus.publish({
            type: 'workspace.created',
            workspaceId: workspace.id,
            metadata: {
              ownerId: userId,
              ownerEmail: user.email || undefined,
              workspaceName: workspace.name,
              source: 'assisted_onboarding_handoff',
            },
          }).catch(() => null);
        } catch (_) { /* non-blocking */ }
        try {
          const { emailService } = await import('./emailService');
          await emailService.send({
            to: user.email || '',
            subject: `Welcome to CoAIleague — ${workspace.name} is ready`,
            html: `<h2>Your workspace is ready, ${user.firstName || 'there'}!</h2>
<p>Your CoAIleague workspace <strong>${workspace.name}</strong> has been set up and is now yours to manage.</p>
<p>Here's what to do next:</p>
<ol>
  <li><strong>Add your team</strong> — Invite managers and officers from the Employee Portal.</li>
  <li><strong>Add your clients</strong> — Create client profiles and set billing rates.</li>
  <li><strong>Set up billing</strong> — Connect your bank account for payroll and configure invoicing.</li>
  <li><strong>Publish your first schedule</strong> — Trinity will auto-fill open shifts once clients and officers are added.</li>
</ol>
<p>Questions? Reply to this email or open a support ticket from your dashboard.</p>`,
          }).catch(() => null);
        } catch (_) { /* non-blocking */ }
        try {
          const { db: database } = await import('../db');
          const { auditLogs } = await import('@shared/schema');
          // @ts-expect-error — TS migration: fix in refactoring sprint
          await database.insert(auditLogs).values({
            workspaceId: workspace.id,
            entityType: 'workspace',
            entityId: workspace.id,
            action: 'workspace_claimed',
            description: `Workspace "${workspace.name}" claimed by ${user.firstName || ''} ${user.lastName || ''} (${user.email}) via assisted onboarding handoff`,
            metadata: JSON.stringify({ ownerId: userId, ownerEmail: user.email }),
            createdAt: new Date(),
          });
        } catch (_) { /* non-blocking */ }
      }).catch(() => null);

      return {
        success: true,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
      };
    } catch (error: any) {
      log.error('[AssistedOnboarding] Failed to complete handoff:', error);
      return {
        success: false,
        error: (error instanceof Error ? error.message : String(error)) || 'Failed to complete handoff',
      };
    }
  }

  /**
   * Get workspace by handoff token (for validation)
   */
  async getWorkspaceByToken(token: string): Promise<{
    valid: boolean;
    workspace?: {
      id: string;
      name: string;
      targetUserEmail: string;
      targetUserName: string;
      expired: boolean;
    };
    error?: string;
  }> {
    try {
      const workspace = await db.query.workspaces.findFirst({
        where: eq(workspaces.handoffToken, token),
      });

      if (!workspace) {
        return { valid: false, error: 'Invalid handoff token' };
      }

      const expired = workspace.handoffTokenExpiry 
        ? new Date() > workspace.handoffTokenExpiry 
        : false;

      if (expired || workspace.handoffStatus === 'handoff_complete') {
        return { 
          valid: false, 
          error: workspace.handoffStatus === 'handoff_complete' 
            ? 'This handoff has already been completed' 
            : 'Handoff token has expired' 
        };
      }

      return {
        valid: true,
        workspace: {
          id: workspace.id,
          name: workspace.name,
          targetUserEmail: workspace.targetUserEmail || '',
          targetUserName: workspace.targetUserName || '',
          expired,
        },
      };
    } catch (error: any) {
      return { valid: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  }

  /**
   * Get all assisted workspaces for a support user
   */
  async getAssistedWorkspaces(supportUserId: string): Promise<{
    id: string;
    name: string;
    targetUserEmail: string | null;
    targetUserName: string | null;
    handoffStatus: string | null;
    createdAt: Date | null;
    assistedDocsUploaded: number | null;
    assistedExtractionStatus: string | null;
  }[]> {
    try {
      const results = await db.query.workspaces.findMany({
        where: eq(workspaces.assistedOnboardingBy, supportUserId),
        columns: {
          id: true,
          name: true,
          targetUserEmail: true,
          targetUserName: true,
          handoffStatus: true,
          createdAt: true,
          assistedDocsUploaded: true,
          assistedExtractionStatus: true,
        },
      });

      return results;
    } catch (error) {
      log.error('[AssistedOnboarding] Failed to get assisted workspaces:', error);
      return [];
    }
  }

  /**
   * Expire old handoff tokens (for cron job)
   */
  async expireOldTokens(): Promise<number> {
    try {
      const result = await db.update(workspaces)
        .set({
          handoffStatus: 'handoff_expired',
          updatedAt: new Date(),
        })
        .where(and(
          eq(workspaces.handoffStatus, 'handoff_sent'),
          lt(workspaces.handoffTokenExpiry, new Date()),
        ))
        .returning({ id: workspaces.id });

      if (result.length > 0) {
        log.info(`[AssistedOnboarding] Expired ${result.length} handoff tokens`);
      }

      return result.length;
    } catch (error) {
      log.error('[AssistedOnboarding] Failed to expire tokens:', error);
      return 0;
    }
  }
}

export const assistedOnboardingService = AssistedOnboardingService.getInstance();
