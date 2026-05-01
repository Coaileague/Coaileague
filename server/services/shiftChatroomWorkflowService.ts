/**
 * ShiftChatroomWorkflowService - GetSling-style Shift Chatroom Workflow
 * 
 * Features:
 * - Auto-create chatroom when employee starts shift
 * - Add shift employees to chatroom
 * - Handle photos, reports, and activity logging
 * - Auto-close chatroom after shift ends
 * - Generate DAR (Daily Activity Report)
 * - Send DAR to client after verification
 * - Meeting room recording with Trinity (premium)
 * 
 * Integrates with:
 * - UniversalStepLogger (7-step pattern)
 * - Trinity orchestration (unified agent — one personality across all backends)
 * - Audit integrity system
 */

import { db } from "../db";
import { platformEventBus } from "./platformEventBus";
import { 
  shiftChatrooms, 
  shiftChatroomMembers, 
  shiftChatroomMessages,
  shiftProofPhotos,
  darReports,
  trinityMeetingRecordings,
  shifts,
  employees,
  clients,
  sites,
  siteContacts,
  users,
  workspaces,
  timeEntries
} from "@shared/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { format } from "date-fns";
import crypto from "crypto";
import { universalStepLogger, type OrchestrationContext, type OrchestrationStep, type StepStatus } from "./orchestration/universalStepLogger";
import { createLogger } from '../lib/logger';
const log = createLogger('shiftChatroomWorkflowService');


export interface ShiftChatroomContext {
  workspaceId: string;
  shiftId: string;
  userId: string;
  employeeId?: string;
  clientId?: string;
  siteId?: string;
}

export interface DARGenerationResult {
  darId: string;
  status: 'draft' | 'pending_review' | 'verified' | 'sent';
  summary?: string;
  contentHash: string;
}

export interface ChatroomMessage {
  content: string;
  messageType: 'text' | 'photo' | 'report' | 'system';
  attachmentUrl?: string;
  attachmentType?: string;
  attachmentSize?: number;
  metadata?: Record<string, unknown>;
}

class ShiftChatroomWorkflowService {
  private static instance: ShiftChatroomWorkflowService;

  private constructor() {}

  public static getInstance(): ShiftChatroomWorkflowService {
    if (!ShiftChatroomWorkflowService.instance) {
      ShiftChatroomWorkflowService.instance = new ShiftChatroomWorkflowService();
    }
    return ShiftChatroomWorkflowService.instance;
  }

  /**
   * Create orchestration context for step logging
   */
  private createOrchestrationContext(
    actionName: string,
    workspaceId: string,
    userId?: string,
    triggeredBy: "user" | "cron" | "event" | "api" | "ai_brain" | "webhook" = "user"
  ): OrchestrationContext {
    return {
      orchestrationId: crypto.randomUUID(),
      domain: "scheduling",
      actionName,
      workspaceId,
      userId,
      triggeredBy,
    } as OrchestrationContext;
  }

  /**
   * Log orchestration step to UniversalStepLogger
   */
  private async logStep(
    context: OrchestrationContext,
    step: OrchestrationStep,
    status: StepStatus,
    inputPayload?: Record<string, unknown>,
    outputPayload?: Record<string, unknown>,
    error?: string
  ): Promise<void> {
    try {
      await universalStepLogger.logStep(context, step, status, inputPayload, outputPayload, error);
    } catch (e) {
      log.error("[ShiftChatroom] Failed to log step:", e);
    }
  }

  /**
   * Pre-provision a chatroom for a shift at creation time.
   * Status starts as 'pending' — activates when the officer clocks in
   * via startShift(). Idempotent: if a chatroom (pending OR active)
   * already exists for this shift, the existing ID is returned.
   *
   * Rationale: before this hook, a chatroom only existed after clock-in.
   * There was no room for manager-to-officer communication between
   * shift creation and clock-in. Now the manager can message the
   * assigned officer the moment the shift is on the schedule.
   */
  async provisionChatroom(params: {
    shiftId: string;
    workspaceId: string;
    siteId?: string;
    assignedEmployeeId?: string;
  }): Promise<{ chatroomId: string; alreadyExisted: boolean }> {
    const existing = await db
      .select({ id: shiftChatrooms.id })
      .from(shiftChatrooms)
      .where(and(
        eq(shiftChatrooms.shiftId, params.shiftId),
        eq(shiftChatrooms.workspaceId, params.workspaceId),
      ))
      .limit(1);

    if (existing.length > 0) {
      return { chatroomId: existing[0].id, alreadyExisted: true };
    }

    // Pull a minimal shift row for naming.
    const [shift] = await db
      .select()
      .from(shifts)
      .where(eq(shifts.id, params.shiftId))
      .limit(1);

    const name = shift
      ? `${shift.title || 'Shift'} — ${format(new Date(shift.startTime), 'MMM d, yyyy h:mm a')}`
      : 'Pending Shift Chatroom';

    const chatroomId = crypto.randomUUID();
    await db.insert(shiftChatrooms).values({
      id: chatroomId,
      workspaceId: params.workspaceId,
      shiftId: params.shiftId,
      name,
      description: 'Pre-provisioned chatroom — activates when officer clocks in.',
      status: 'pending',
      autoCloseTimeoutMinutes: 60,
      isAuditProtected: true,
      isMeetingRoom: false,
      trinityRecordingEnabled: false,
    });

    // Add the assigned employee as a member up front so they can see the room.
    if (params.assignedEmployeeId) {
      try {
        const [emp] = await db
          .select({ userId: employees.userId })
          .from(employees)
          .where(eq(employees.id, params.assignedEmployeeId))
          .limit(1);
        if (emp?.userId) {
          await db.insert(shiftChatroomMembers).values({
            id: crypto.randomUUID(),
            chatroomId,
            userId: emp.userId,
            employeeId: params.assignedEmployeeId,
            role: 'member',
            joinedAt: new Date(),
          });
        }
      } catch (memberErr: unknown) {
        log.warn('[ShiftChatroom] provisionChatroom: failed to pre-add member (non-fatal):', memberErr?.message);
      }
    }

    log.info(`[ShiftChatroom] Pre-provisioned pending chatroom ${chatroomId} for shift ${params.shiftId}`);
    return { chatroomId, alreadyExisted: false };
  }

  /**
   * Start Shift Workflow
   * TRIGGER → FETCH → VALIDATE → PROCESS → MUTATE → CONFIRM → NOTIFY
   *
   * If a pending chatroom exists (provisioned at shift creation), it is
   * promoted to 'active' instead of creating a new one.
   */
  async startShift(context: ShiftChatroomContext): Promise<{
    success: boolean;
    chatroomId?: string;
    error?: string;
    steps: Array<{ step: string; status: string; duration: number }>;
  }> {
    const steps: Array<{ step: string; status: string; duration: number }> = [];
    const stepStart = Date.now();
    let currentStep = 'TRIGGER';

    // Create orchestration context for audit logging (outside try for catch access)
    const orchContext = this.createOrchestrationContext(
      'shift_start_workflow',
      context.workspaceId,
      context.userId
    );

    try {
      steps.push({ step: 'TRIGGER', status: 'started', duration: 0 });
      await this.logStep(orchContext, 'TRIGGER', 'started', { shiftId: context.shiftId, workspaceId: context.workspaceId });
      log.info(`[ShiftChatroom] Starting shift workflow for shift ${context.shiftId}`);

      currentStep = 'FETCH';
      const fetchStart = Date.now();
      
      const [shift] = await db.select().from(shifts).where(eq(shifts.id, context.shiftId));
      if (!shift) {
        throw new Error('Shift not found');
      }

      const [employee] = context.employeeId 
        ? await db.select().from(employees).where(eq(employees.id, context.employeeId))
        : [];

      steps.push({ step: 'FETCH', status: 'completed', duration: Date.now() - fetchStart });
      await this.logStep(orchContext, 'FETCH', 'completed', { shiftId: context.shiftId }, { shiftFound: !!shift, employeeFound: !!employee });

      currentStep = 'VALIDATE';
      const validateStart = Date.now();

      if (shift.status === 'completed') {
        throw new Error('Cannot start a completed shift');
      }

      // Look for either an active OR a pre-provisioned pending chatroom.
      const existingChatroom = await db.select()
        .from(shiftChatrooms)
        .where(eq(shiftChatrooms.shiftId, context.shiftId))
        .limit(1);

      if (existingChatroom.length > 0 && existingChatroom[0].status === 'active') {
        steps.push({ step: 'VALIDATE', status: 'completed', duration: Date.now() - validateStart });
        await this.logStep(orchContext, 'VALIDATE', 'completed', { shiftId: context.shiftId }, { existingChatroom: true, chatroomId: existingChatroom[0].id });
        await this.logStep(orchContext, 'PROCESS', 'skipped', { shiftId: context.shiftId }, { reason: 'existing_chatroom_found' });
        await this.logStep(orchContext, 'MUTATE', 'skipped', { shiftId: context.shiftId }, { reason: 'existing_chatroom_found' });
        await this.logStep(orchContext, 'CONFIRM', 'completed', { shiftId: context.shiftId, chatroomId: existingChatroom[0].id }, { reason: 'existing_chatroom_found' });
        await this.logStep(orchContext, 'NOTIFY', 'completed', { shiftId: context.shiftId, chatroomId: existingChatroom[0].id, workspaceId: context.workspaceId }, { workflowComplete: true, earlyReturn: true });
        return {
          success: true,
          chatroomId: existingChatroom[0].id,
          steps,
          error: undefined
        };
      }

      // Pre-provisioned pending chatroom → activate it in-place.
      if (existingChatroom.length > 0 && existingChatroom[0].status === 'pending') {
        const pendingId = existingChatroom[0].id;
        await db.transaction(async (tx) => {
          await tx.update(shiftChatrooms)
            .set({ status: 'active', updatedAt: new Date() })
            .where(eq(shiftChatrooms.id, pendingId));
          await tx.update(shifts)
            .set({ status: 'in_progress', updatedAt: new Date() })
            .where(eq(shifts.id, context.shiftId));
          // Ensure the starting user is a member (idempotent upsert-like guard).
          const existingMember = await tx.select({ id: shiftChatroomMembers.id })
            .from(shiftChatroomMembers)
            .where(and(
              eq(shiftChatroomMembers.chatroomId, pendingId),
              eq(shiftChatroomMembers.userId, context.userId),
            ))
            .limit(1);
          if (existingMember.length === 0) {
            await tx.insert(shiftChatroomMembers).values({
              id: crypto.randomUUID(),
              chatroomId: pendingId,
              userId: context.userId,
              employeeId: context.employeeId || null,
              role: 'member',
              joinedAt: new Date(),
            });
          }
        });
        await this.sendSystemMessage(pendingId, context.userId,
          `Shift started. Welcome to the shift chatroom! Share photos, reports, and updates here.`);
        steps.push({ step: 'VALIDATE', status: 'completed', duration: Date.now() - validateStart });
        await this.logStep(orchContext, 'VALIDATE', 'completed', { shiftId: context.shiftId }, { existingChatroom: true, pendingActivated: true, chatroomId: pendingId });
        await this.logStep(orchContext, 'PROCESS', 'skipped', { shiftId: context.shiftId }, { reason: 'pending_activated' });
        await this.logStep(orchContext, 'MUTATE', 'completed', { shiftId: context.shiftId, chatroomId: pendingId }, { chatroomActivated: true, shiftUpdated: true });
        await this.logStep(orchContext, 'CONFIRM', 'completed', { shiftId: context.shiftId, chatroomId: pendingId });
        await this.logStep(orchContext, 'NOTIFY', 'completed', { shiftId: context.shiftId, chatroomId: pendingId, workspaceId: context.workspaceId }, { workflowComplete: true, pendingActivated: true });
        return { success: true, chatroomId: pendingId, steps };
      }

      // No existing chatroom (neither active nor pending) — fresh-create path.
      steps.push({ step: 'VALIDATE', status: 'completed', duration: Date.now() - validateStart });
      await this.logStep(orchContext, 'VALIDATE', 'completed', { shiftId: context.shiftId }, { existingChatroom: false, shiftStatus: shift.status });

      currentStep = 'PROCESS';
      const processStart = Date.now();

      const chatroomName = this.generateChatroomName(shift, employee);
      const chatroomId = crypto.randomUUID();

      steps.push({ step: 'PROCESS', status: 'completed', duration: Date.now() - processStart });
      await this.logStep(orchContext, 'PROCESS', 'completed', { shiftId: context.shiftId }, { chatroomId, chatroomName });

      currentStep = 'MUTATE';
      const mutateStart = Date.now();

      await db.transaction(async (tx) => {
        await tx.insert(shiftChatrooms).values({
          id: chatroomId,
          workspaceId: context.workspaceId,
          shiftId: context.shiftId,
          name: chatroomName,
          description: `Shift chatroom for ${format(new Date(shift.startTime), 'MMM d, yyyy h:mm a')}`,
          status: 'active',
          autoCloseTimeoutMinutes: 60,
          isAuditProtected: true,
          isMeetingRoom: false,
          trinityRecordingEnabled: false,
        });
        await tx.insert(shiftChatroomMembers).values({
          id: crypto.randomUUID(),
          chatroomId,
          userId: context.userId,
          employeeId: context.employeeId || null,
          role: 'member',
          joinedAt: new Date(),
        });
        await tx.update(shifts)
          .set({ status: 'in_progress', updatedAt: new Date() })
          .where(eq(shifts.id, context.shiftId));
      });

      // 📡 REAL-TIME: Broadcast shift status change so Live Dashboard updates instantly
      try {
        const { broadcastToWorkspace } = await import('../websocket');
        broadcastToWorkspace(context.workspaceId, {
          type: 'shift_status_changed',
          shiftId: context.shiftId,
          status: 'in_progress',
          employeeId: context.employeeId,
          timestamp: new Date().toISOString(),
        });
      } catch (_wsErr) { log.warn('[ShiftChatroomWorkflow] WebSocket broadcast failed on shift start:', _wsErr instanceof Error ? _wsErr.message : String(_wsErr)); }

      // TRINITY: publish() so Trinity and field monitor subscribers fire
      platformEventBus.publish({
        type: 'shift_started',
        category: 'automation',
        title: 'Shift Started',
        description: `Shift ${context.shiftId} started — chatroom opened, field monitoring active`,
        workspaceId: context.workspaceId,
        metadata: { shiftId: context.shiftId, employeeId: context.employeeId, timestamp: new Date().toISOString() },
      }).catch((err: any) => log.warn('[ShiftChatroomWorkflow] publish shift_started failed:', err.message));

      await this.sendSystemMessage(chatroomId, context.userId,
        `Shift started. Welcome to the shift chatroom! Share photos, reports, and updates here.`);

      // ── ReportBot welcome message ────────────────────────────────────────
      (async () => {
        try {
          const { shiftChatroomBotProcessor } = await import('./bots/shiftChatroomBotProcessor');
          const clientName = (shift as any).clientName || (shift as any).siteName || 'Client';
          const siteAddress = (shift as any).siteAddress || (shift as any).jobSiteAddress || '';
          await shiftChatroomBotProcessor.sendWelcomeMessage(
            chatroomId,
            context.workspaceId,
            employee ? `${employee.firstName} ${employee.lastName || ''}`.trim() : 'Officer',
            clientName,
            siteAddress,
            new Date(shift.startTime),
            new Date(shift.endTime)
          );
        } catch (botErr: unknown) {
          log.warn('[ShiftChatroomWorkflow] ReportBot welcome failed (non-blocking):', botErr.message);
        }
      })();

      steps.push({ step: 'MUTATE', status: 'completed', duration: Date.now() - mutateStart });
      await this.logStep(orchContext, 'MUTATE', 'completed', { shiftId: context.shiftId, chatroomId }, { chatroomCreated: true, memberAdded: true, shiftUpdated: true });

      currentStep = 'CONFIRM';
      const confirmStart = Date.now();

      const [createdChatroom] = await db.select()
        .from(shiftChatrooms)
        .where(eq(shiftChatrooms.id, chatroomId));

      if (!createdChatroom) {
        throw new Error('Failed to create chatroom');
      }

      steps.push({ step: 'CONFIRM', status: 'completed', duration: Date.now() - confirmStart });
      await this.logStep(orchContext, 'CONFIRM', 'completed', { shiftId: context.shiftId, chatroomId }, { verified: true });

      currentStep = 'NOTIFY';
      const notifyStart = Date.now();

      log.info(`[ShiftChatroom] Shift ${context.shiftId} started, chatroom ${chatroomId} created`);

      steps.push({ step: 'NOTIFY', status: 'completed', duration: Date.now() - notifyStart });
      await this.logStep(orchContext, 'NOTIFY', 'completed', { shiftId: context.shiftId, chatroomId }, { workflowComplete: true });

      const totalDuration = Date.now() - stepStart;
      log.info(`[ShiftChatroom] Workflow completed in ${totalDuration}ms`);

      return {
        success: true,
        chatroomId,
        steps,
      };
    } catch (error: unknown) {
      log.error(`[ShiftChatroom] Error in step ${currentStep}:`, error);
      steps.push({ step: currentStep, status: 'failed', duration: Date.now() - stepStart });
      // Log error to UniversalStepLogger
      await this.logStep(orchContext, currentStep as OrchestrationStep, 'failed', { shiftId: context.shiftId }, undefined, (error instanceof Error ? error.message : String(error)));
      
      return {
        success: false,
        error: (error instanceof Error ? error.message : String(error)) || 'Unknown error',
        steps,
      };
    }
  }

  /**
   * End Shift Workflow
   * Closes chatroom and generates DAR
   */
  async endShift(
    context: ShiftChatroomContext,
    closureReason: 'manual' | 'auto_timeout' | 'shift_completed' = 'shift_completed'
  ): Promise<{
    success: boolean;
    darId?: string;
    error?: string;
    steps: Array<{ step: string; status: string; duration: number }>;
  }> {
    const steps: Array<{ step: string; status: string; duration: number }> = [];
    const stepStart = Date.now();
    let currentStep = 'TRIGGER';

    // Create orchestration context for audit logging (outside try for catch access)
    const orchContext = this.createOrchestrationContext(
      'shift_end_workflow',
      context.workspaceId,
      context.userId
    );

    try {
      steps.push({ step: 'TRIGGER', status: 'started', duration: 0 });
      await this.logStep(orchContext, 'TRIGGER', 'started', { shiftId: context.shiftId, workspaceId: context.workspaceId });

      currentStep = 'FETCH';
      const fetchStart = Date.now();

      const [chatroom] = await db.select()
        .from(shiftChatrooms)
        .where(and(
          eq(shiftChatrooms.shiftId, context.shiftId),
          eq(shiftChatrooms.status, 'active')
        ));

      if (!chatroom) {
        steps.push({ step: 'FETCH', status: 'completed', duration: Date.now() - fetchStart });
        await this.logStep(orchContext, 'FETCH', 'completed', { shiftId: context.shiftId }, { chatroomFound: false });
        await this.logStep(orchContext, 'VALIDATE', 'skipped', { shiftId: context.shiftId }, { reason: 'no_active_chatroom' });
        await this.logStep(orchContext, 'PROCESS', 'skipped', { shiftId: context.shiftId }, { reason: 'no_active_chatroom' });
        await this.logStep(orchContext, 'MUTATE', 'skipped', { shiftId: context.shiftId }, { reason: 'no_active_chatroom' });
        await this.logStep(orchContext, 'CONFIRM', 'completed', { shiftId: context.shiftId, workspaceId: context.workspaceId }, { reason: 'no_active_chatroom' });
        await this.logStep(orchContext, 'NOTIFY', 'completed', { shiftId: context.shiftId, workspaceId: context.workspaceId }, { workflowComplete: true, earlyReturn: true });
        return { success: true, steps, error: 'No active chatroom found' };
      }

      const [shift] = await db.select().from(shifts).where(eq(shifts.id, context.shiftId));
      const messages = await db.select()
        .from(shiftChatroomMessages)
        .where(eq(shiftChatroomMessages.chatroomId, chatroom.id))
        .orderBy(shiftChatroomMessages.createdAt);

      steps.push({ step: 'FETCH', status: 'completed', duration: Date.now() - fetchStart });
      await this.logStep(orchContext, 'FETCH', 'completed', { shiftId: context.shiftId, chatroomId: chatroom.id }, { chatroomFound: true, messageCount: messages.length });

      currentStep = 'VALIDATE';
      const validateStart = Date.now();

      steps.push({ step: 'VALIDATE', status: 'completed', duration: Date.now() - validateStart });
      await this.logStep(orchContext, 'VALIDATE', 'completed', { shiftId: context.shiftId, chatroomId: chatroom.id, closureReason }, { valid: true });

      currentStep = 'PROCESS';
      const processStart = Date.now();

      const darResult = await this.generateDAR(context, chatroom, shift, messages);

      steps.push({ step: 'PROCESS', status: 'completed', duration: Date.now() - processStart });
      await this.logStep(orchContext, 'PROCESS', 'completed', { shiftId: context.shiftId, chatroomId: chatroom.id }, { darId: darResult.darId, darGenerated: true });

      currentStep = 'MUTATE';
      const mutateStart = Date.now();

      await db.transaction(async (tx) => {
        await tx.update(shiftChatrooms)
          .set({
            status: 'closed',
            closedAt: new Date(),
            closedBy: context.userId,
            closureReason,
            darGenerated: true,
            darGeneratedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(shiftChatrooms.id, chatroom.id));
        await tx.update(shifts)
          .set({ status: 'completed', updatedAt: new Date() })
          .where(eq(shifts.id, context.shiftId));
      });

      // 📡 REAL-TIME: Broadcast completion so Live Dashboard and payroll triggers update
      try {
        const { broadcastToWorkspace } = await import('../websocket');
        broadcastToWorkspace(context.workspaceId, {
          type: 'shift_status_changed',
          shiftId: context.shiftId,
          status: 'completed',
          employeeId: context.employeeId,
          timestamp: new Date().toISOString(),
        });
      } catch (_wsErr) { log.warn('[ShiftChatroomWorkflow] WebSocket broadcast failed on shift complete:', _wsErr instanceof Error ? _wsErr.message : String(_wsErr)); }

      // TRINITY: publish() so Trinity payroll triggers and billing pipelines fire
      platformEventBus.publish({
        type: 'shift_completed',
        category: 'automation',
        title: 'Shift Completed',
        description: `Shift ${context.shiftId} completed — chatroom closed, DAR generated`,
        workspaceId: context.workspaceId,
        metadata: { shiftId: context.shiftId, employeeId: context.employeeId, closureReason, timestamp: new Date().toISOString() },
      }).catch((err: any) => log.warn('[ShiftChatroomWorkflow] publish shift_completed failed:', err.message));

      await this.sendSystemMessage(chatroom.id, context.userId,
        `Shift ended. Chatroom closed. DAR generated for client review.`);

      steps.push({ step: 'MUTATE', status: 'completed', duration: Date.now() - mutateStart });
      await this.logStep(orchContext, 'MUTATE', 'completed', { shiftId: context.shiftId, chatroomId: chatroom.id, darId: darResult.darId }, { chatroomClosed: true, shiftCompleted: true });

      currentStep = 'CONFIRM';
      steps.push({ step: 'CONFIRM', status: 'completed', duration: 0 });
      await this.logStep(orchContext, 'CONFIRM', 'completed', { shiftId: context.shiftId, chatroomId: chatroom.id, darId: darResult.darId }, { verified: true });

      currentStep = 'NOTIFY';

      if (darResult.darId) {
        try {
          const { generateShiftTransparencyPdf } = await import('./darPdfService');
          const pdfUrl = await generateShiftTransparencyPdf(darResult.darId, context.workspaceId);
          if (pdfUrl) {
            const { pool: dbPool } = await import('../db');
            await dbPool.query(
              `UPDATE dar_reports SET pdf_url=$1, pdf_generated_at=NOW(), status='pending_review', updated_at=NOW() WHERE id=$2`,
              [pdfUrl, darResult.darId]
            );
            log.info(`[ShiftChatroom] Auto-generated Shift Transparency PDF for DAR ${darResult.darId}`);
          }
        } catch (pdfErr: unknown) {
          log.error(`[ShiftChatroom] Auto PDF generation failed (non-blocking):`, pdfErr.message);
        }

        // CANONICAL: publish() so DarSubmittedHandler subscriber fires (not raw emit)
        platformEventBus.publish({
          type: 'dar_submitted',
          category: 'automation',
          title: 'DAR Auto-Generated',
          description: `Shift ${context.shiftId} ended — auto-generated DAR`,
          workspaceId: context.workspaceId,
          metadata: {
            darId: darResult.darId,
            shiftId: context.shiftId,
            autoGenerated: true,
          },
        }).catch((err: any) => log.warn('[ShiftChatroom] dar_submitted publish failed (non-blocking):', err.message));
      }

      log.info(`[ShiftChatroom] Shift ${context.shiftId} ended, DAR ${darResult.darId} generated`);
      steps.push({ step: 'NOTIFY', status: 'completed', duration: 0 });
      await this.logStep(orchContext, 'NOTIFY', 'completed', { shiftId: context.shiftId, chatroomId: chatroom.id, darId: darResult.darId, closureReason }, { workflowComplete: true });

      return {
        success: true,
        darId: darResult.darId,
        steps,
      };
    } catch (error: unknown) {
      log.error(`[ShiftChatroom] Error in step ${currentStep}:`, error);
      steps.push({ step: currentStep, status: 'failed', duration: Date.now() - stepStart });
      // Log error to UniversalStepLogger
      await this.logStep(orchContext, currentStep as OrchestrationStep, 'failed', { shiftId: context.shiftId }, undefined, (error instanceof Error ? error.message : String(error)));
      
      return {
        success: false,
        error: (error instanceof Error ? error.message : String(error)) || 'Unknown error',
        steps,
      };
    }
  }

  /**
   * Send message to chatroom
   */
  async sendMessage(
    chatroomId: string,
    userId: string,
    message: ChatroomMessage
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const [chatroom] = await db.select()
        .from(shiftChatrooms)
        .where(eq(shiftChatrooms.id, chatroomId));

      if (!chatroom || chatroom.status !== 'active') {
        return { success: false, error: 'Chatroom not active' };
      }

      const messageId = crypto.randomUUID();
      await db.transaction(async (tx) => {
        await tx.insert(shiftChatroomMessages).values({
          id: messageId,
          chatroomId,
          userId,
          content: message.content,
          messageType: message.messageType,
          attachmentUrl: message.attachmentUrl,
          attachmentType: message.attachmentType,
          attachmentSize: message.attachmentSize,
          metadata: message.metadata,
          isAuditProtected: message.messageType === 'photo' || message.messageType === 'report',
        });

        await tx.update(shiftChatroomMembers)
          .set({
            lastActiveAt: new Date(),
            messageCount: sql`${shiftChatroomMembers.messageCount} + 1`,
            photoCount: message.messageType === 'photo'
              ? sql`${shiftChatroomMembers.photoCount} + 1`
              : shiftChatroomMembers.photoCount,
          })
          .where(and(
            eq(shiftChatroomMembers.chatroomId, chatroomId),
            eq(shiftChatroomMembers.userId, userId)
          ));

        // Persist every GPS-tagged shift photo to shift_proof_photos so it
        // survives restarts and is available to transparency PDFs.
        if (message.messageType === 'photo' && chatroom.shiftId && message.attachmentUrl) {
          const rawGps = (message.metadata as any)?.gps ?? {};
          const latRaw = rawGps.lat ?? rawGps.latitude;
          const lngRaw = rawGps.lng ?? rawGps.longitude;
          const lat = latRaw !== undefined && latRaw !== null ? Number(latRaw) : NaN;
          const lng = lngRaw !== undefined && lngRaw !== null ? Number(lngRaw) : NaN;

          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            const [senderEmployee] = await tx.select({ id: employees.id })
              .from(employees)
              .where(and(
                eq(employees.userId, userId),
                eq(employees.workspaceId, chatroom.workspaceId),
              ))
              .limit(1);

            const [shiftAssignment] = await tx.select({ employeeId: shifts.employeeId })
              .from(shifts)
              .where(eq(shifts.id, chatroom.shiftId))
              .limit(1);

            // Precedence: sender employee mapping is most accurate for multi-officer rooms;
            // fallback to shift assignment when sender lookup is unavailable.
            const employeeIdForPhoto = senderEmployee?.id || shiftAssignment?.employeeId || null;
            if (employeeIdForPhoto) {
              const capturedAtRaw = (message.metadata as any)?.capturedAt;
              const capturedAt = capturedAtRaw ? new Date(capturedAtRaw) : new Date();
              const safeCapturedAt = Number.isNaN(capturedAt.getTime()) ? new Date() : capturedAt;
              const chainOfCustodyHash = crypto
                .createHash('sha256')
                .update(`${chatroom.shiftId}:${messageId}:${message.attachmentUrl}:${lat}:${lng}:${safeCapturedAt.toISOString()}`)
                .digest('hex');

              await tx.insert(shiftProofPhotos).values({
                id: crypto.randomUUID(),
                workspaceId: chatroom.workspaceId,
                shiftId: chatroom.shiftId,
                chatroomId,
                employeeId: employeeIdForPhoto,
                messageId,
                photoUrl: message.attachmentUrl,
                thumbnailUrl: null,
                gpsLat: String(lat),
                gpsLng: String(lng),
                gpsAddress: rawGps.address ?? null,
                gpsAccuracy: rawGps.accuracy !== undefined && rawGps.accuracy !== null ? String(rawGps.accuracy) : null,
                capturedAt: safeCapturedAt,
                deviceMeta: (message.metadata as any)?.deviceMeta ?? null,
                photoType: (message.metadata as any)?.photoType ?? 'hourly_proof',
                notes: message.content || null,
                isAuditProtected: true,
                chainOfCustodyHash,
              });
            }
          }
        }
      });

      // ── ReportBot: process officer message non-blocking ───────────────────
      if (message.messageType !== 'system' && userId !== 'reportbot') {
        (async () => {
          try {
            const { shiftChatroomBotProcessor } = await import('./bots/shiftChatroomBotProcessor');
            // Resolve sender name
            const [member] = await db
              .select({ firstName: employees.firstName, lastName: employees.lastName })
              .from(employees)
              .where(eq(employees.userId, userId))
              .limit(1);
            const senderName = member
              ? `${member.firstName} ${member.lastName || ''}`.trim()
              : 'Officer';
            await shiftChatroomBotProcessor.processMessage(
              chatroomId,
              chatroom.workspaceId,
              userId,
              senderName,
              message.content,
              chatroom.shiftId || null
            );
          } catch (botErr: unknown) {
            log.warn('[ShiftChatroomWorkflow] Bot processing failed (non-blocking):', botErr.message);
          }
        })();
      }

      return { success: true, messageId };
    } catch (error: unknown) {
      log.error('[ShiftChatroom] Error sending message:', error);
      return { success: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  }

  /**
   * Generate DAR (Daily Activity Report)
   */
  private async generateDAR(
    context: ShiftChatroomContext,
    chatroom: any,
    shift: any,
    messages: any[]
  ): Promise<DARGenerationResult> {
    const photoMessages = messages.filter(m => m.messageType === 'photo');
    const photoCount = photoMessages.length;
    const messageCount = messages.length;

    const darId = crypto.randomUUID();

    let employeeName = 'Unknown';
    let employee: any = null;
    if (shift.employeeId) {
      const [emp] = await db.select()
        .from(employees)
        .where(eq(employees.id, shift.employeeId));
      if (emp) {
        employee = emp;
        employeeName = `${emp.firstName} ${emp.lastName || ''}`.trim();
      }
    }

    const [timeEntry] = await db.select()
      .from(timeEntries)
      .where(eq(timeEntries.shiftId, shift.id))
      .orderBy(desc(timeEntries.createdAt))
      .limit(1);

    const photoManifest = messages
      .filter(m => m.messageType === 'photo' || (m.attachmentUrl && m.attachmentUrl.length > 0))
      .map(m => ({
        timestamp: new Date(m.createdAt).toISOString(),
        url: m.attachmentUrl || null,
        caption: m.content || 'Photo attachment',
        messageId: m.id,
        uploaderName: employeeName,
        attachmentType: m.attachmentType || 'image/jpeg',
        attachmentSize: m.attachmentSize || 0,
        gps: (m as any).metadata?.gps || null,
      }));

    // ── STEP 1: Compile raw content ─────────────────────────────────────────
    const rawContent = this.compileDARContent(shift, messages, employeeName);

    // ── STEP 2: AI Quality Review ───────────────────────────────────────────
    const qualityReview = await this.runDARQualityReview(rawContent, messages, employeeName, shift);

    // ── STEP 3: Professional language conversion ────────────────────────────
    let finalContent = rawContent;
    try {
      const { botAIService } = await import('../bots/botAIService');
      const aiResp = await botAIService.generate({
        botId: 'reportbot',
        workspaceId: context.workspaceId,
        action: 'cleanup',
        prompt:
          `You are a professional security report writer. Rewrite the following daily activity report in formal, professional language.\n` +
          `Rules:\n` +
          `- Preserve all facts, times, and names exactly as written\n` +
          `- Convert casual language to formal security report style (e.g., "ran into" → "encountered"; "kicked out" → "was removed from premises")\n` +
          `- Do NOT add or invent any information\n` +
          `- Maintain chronological order\n` +
          `- Keep the section headers and formatting structure\n\n` +
          `REPORT:\n${rawContent}\n\n` +
          `Return ONLY the rewritten report text.`,
        maxTokens: 2048,
      });
      if (aiResp.success && aiResp.text && aiResp.text.length > rawContent.length * 0.4) {
        finalContent = aiResp.text;
      }
    } catch { /* AI non-blocking — use raw content */ }

    const contentHash = crypto.createHash('sha256').update(finalContent).digest('hex');

    // ── STEP 4: Generate AI summary ─────────────────────────────────────────
    let aiSummary = this.generateDARSummary(shift, messages);
    try {
      const { botAIService } = await import('../bots/botAIService');
      const summaryResp = await botAIService.generate({
        botId: 'reportbot',
        workspaceId: context.workspaceId,
        action: 'summarize',
        prompt:
          `Write a professional 2-3 sentence executive summary for this security shift report. ` +
          `Include key activities, incidents, and overall shift status.\n\n` +
          `REPORT:\n${finalContent}\n\nSUMMARY:`,
        maxTokens: 256,
      });
      if (summaryResp.success && summaryResp.text && summaryResp.text.length > 20) {
        aiSummary = summaryResp.text.trim();
      }
    } catch { /* non-blocking */ }

    // ── STEP 5: Write to DB ─────────────────────────────────────────────────
    const statusToSet = qualityReview.forceUsed || qualityReview.flaggedForReview
      ? 'pending_review'
      : 'draft';

    await db.insert(darReports).values({
      id: darId,
      workspaceId: context.workspaceId,
      shiftId: context.shiftId,
      chatroomId: chatroom.id,
      clientId: shift.clientId,
      title: `Daily Activity Report — ${employeeName} — ${format(new Date(shift.startTime), 'MMM d, yyyy')}`,
      summary: aiSummary,
      content: finalContent,
      photoCount,
      messageCount,
      employeeId: shift.employeeId,
      employeeName,
      shiftStartTime: new Date(shift.startTime),
      shiftEndTime: new Date(shift.endTime),
      actualClockIn: timeEntry?.clockIn || null,
      actualClockOut: timeEntry?.clockOut || null,
      status: statusToSet,
      isAuditProtected: true,
      contentHash,
      photoManifest,
      flaggedForReview: qualityReview.flaggedForReview,
      forceUseDetected: qualityReview.forceUsed,
      reviewNotes: qualityReview.reviewNotes,
    } as any);

    // ── STEP 6: Publish dar_generated event ─────────────────────────────────
    platformEventBus.publish({
      type: 'dar_generated',
      category: 'automation',
      title: 'DAR Generated',
      description: `Daily Activity Report generated for ${employeeName}`,
      workspaceId: context.workspaceId,
      metadata: {
        darId,
        shiftId: context.shiftId,
        employeeId: shift.employeeId,
        employeeName,
        flaggedForReview: qualityReview.flaggedForReview,
        forceUsed: qualityReview.forceUsed,
        photoCount,
        messageCount,
        timestamp: new Date().toISOString(),
      },
    }).catch((err: any) => log.warn('[ShiftChatroomWorkflow] publish dar_generated failed:', err.message));

    return {
      darId,
      status: statusToSet,
      summary: aiSummary,
      contentHash,
    };
  }

  /**
   * DAR Quality Review — AI-powered pipeline
   * Checks for: use of force, 5W1H completeness, chronological order, flags
   */
  private async runDARQualityReview(
    content: string,
    messages: any[],
    employeeName: string,
    shift: any
  ): Promise<{
    flaggedForReview: boolean;
    forceUsed: boolean;
    reviewNotes: string;
    issues: string[];
  }> {
    const issues: string[] = [];
    let forceUsed = false;
    let flaggedForReview = false;

    const contentLower = content.toLowerCase();

    // ── Use of Force detection ──────────────────────────────────────────────
    const FORCE_MARKERS = [
      'use of force', 'restrain', 'restrained', 'handcuff', 'takedown', 'takeaway',
      'physical force', 'grabbed', 'tackled', 'pushed', 'shoved', 'pepper spray', 'taser',
      'weapon drawn', 'deploy', 'deployed', 'baton', 'force was used', 'physical contact'
    ];
    forceUsed = FORCE_MARKERS.some(marker => contentLower.includes(marker));
    if (forceUsed) {
      issues.push('USE OF FORCE DETECTED — Ensure officer name, time, reason, and outcome are fully documented.');
      flaggedForReview = true;
    }

    // ── 5W1H Completeness check ──────────────────────────────────────────────
    // Who, What, When, Where, Why, How
    const incidentMessages = messages.filter(m => {
      const meta = m.metadata as any;
      return meta?.botEvent === 'incident_report_complete';
    });

    for (const incMsg of incidentMessages) {
      const resp = incMsg.content || '';
      const respLower = resp.toLowerCase();
      // Check for missing key fields
      if (!/\b(\d{1,2}:\d{2}|\d{4}-\d{2}-\d{2}|am|pm)\b/.test(respLower)) {
        issues.push('Incident report may be missing an exact time — verify.');
      }
      if (!/\b(entrance|exit|parking|floor|section|gate|door|hall|room|area|location|site)\b/.test(respLower)) {
        issues.push('Incident report may be missing a specific location — verify.');
      }
    }

    // ── Chronological consistency check ────────────────────────────────────
    const timePattern = /\b(\d{1,2}):(\d{2})\s*(am|pm|hrs)?\b/gi;
    const timesFound: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = timePattern.exec(content)) !== null) {
      const h = parseInt(match[1]);
      const m = parseInt(match[2]);
      const isPm = /pm/i.test(match[3] || '');
      const isPm24 = h >= 13;
      const hour24 = isPm && h < 12 ? h + 12 : isPm24 ? h : h;
      timesFound.push(hour24 * 60 + m);
    }
    if (timesFound.length >= 3) {
      let outOfOrder = 0;
      for (let i = 1; i < timesFound.length; i++) {
        // Allow ±5 minutes tolerance for same-time entries
        if (timesFound[i] < timesFound[i - 1] - 5) outOfOrder++;
      }
      if (outOfOrder > 1) {
        issues.push('Possible chronological inconsistency detected — verify log entries are in correct time order.');
        flaggedForReview = true;
      }
    }

    // ── Short shift with no activities ──────────────────────────────────────
    const officerMessages = messages.filter(m => {
      const meta = m.metadata as any;
      return m.userId !== 'reportbot' && m.messageType !== 'system' && !meta?.isBot;
    });
    if (officerMessages.length === 0) {
      issues.push('No officer activity was logged during this shift. If the officer was present, this needs to be documented.');
      flaggedForReview = true;
    }

    const reviewNotes = issues.length > 0
      ? `AI Quality Review — ${issues.length} item(s) flagged:\n${issues.map((i, n) => `${n + 1}. ${i}`).join('\n')}`
      : 'AI Quality Review passed — no issues detected.';

    return { flaggedForReview, forceUsed, reviewNotes, issues };
  }

  /**
   * Compile DAR content from messages
   */
  private compileDARContent(shift: any, messages: any[], employeeName: string = 'Unknown'): string {
    const lines: string[] = [
      `# DAILY ACTIVITY REPORT`,
      ``,
      `**Officer:** ${employeeName}`,
      `**Date:** ${format(new Date(shift.startTime), 'MMMM d, yyyy')}`,
      `**Shift:** ${format(new Date(shift.startTime), 'h:mm a')} – ${format(new Date(shift.endTime), 'h:mm a')}`,
      `**Location:** ${(shift as any).siteName || (shift as any).jobSiteAddress || 'On file'}`,
      `**Client:** ${(shift as any).clientName || 'On file'}`,
      ``,
      `---`,
      ``,
      `## ACTIVITY LOG`,
      ``,
    ];

    const officerMessages = messages.filter(m => {
      const meta = m.metadata as any;
      return m.messageType !== 'system' && m.userId !== 'reportbot' && !meta?.isBot;
    });

    if (officerMessages.length === 0) {
      lines.push('No activity entries logged during this shift period.');
    } else {
      for (const msg of officerMessages) {
        const time = format(new Date(msg.createdAt), 'HH:mm');
        if (msg.messageType === 'photo') {
          const gps = (msg as any).metadata?.gps;
          const gpsNote = gps ? ` [GPS: ${gps.lat?.toFixed(5)}, ${gps.lng?.toFixed(5)}]` : '';
          lines.push(`**${time}** — [PHOTO DOCUMENTATION]${gpsNote} ${msg.content || ''}`.trim());
        } else if (msg.messageType === 'report') {
          lines.push(`**${time}** — [LOGGED REPORT] ${msg.content}`);
        } else {
          lines.push(`**${time}** — ${msg.content}`);
        }
      }
    }

    // ── Incident reports section ────────────────────────────────────────────
    const incidentMsgs = messages.filter(m => {
      const meta = m.metadata as any;
      return meta?.botEvent === 'incident_report_complete';
    });

    if (incidentMsgs.length > 0) {
      lines.push('', '---', '', '## INCIDENT REPORTS', '');
      for (const inc of incidentMsgs) {
        lines.push(inc.content || '');
        lines.push('');
      }
    }

    // ── Photo summary ───────────────────────────────────────────────────────
    const photoMsgs = messages.filter(m => m.messageType === 'photo');
    if (photoMsgs.length > 0) {
      lines.push('', '---', '', `## PHOTO DOCUMENTATION`, '');
      lines.push(`${photoMsgs.length} photo(s) documented during this shift.`);
    }

    lines.push('', '---', '', `*Report generated: ${format(new Date(), 'MMMM d, yyyy HH:mm')}*`);

    return lines.join('\n');
  }

  /**
   * Generate DAR summary
   */
  private generateDARSummary(shift: any, messages: any[]): string {
    const photoCount = messages.filter(m => m.messageType === 'photo').length;
    const activityCount = messages.filter(m => {
      const meta = m.metadata as any;
      return m.messageType !== 'system' && m.userId !== 'reportbot' && !meta?.isBot;
    }).length;
    const incidentCount = messages.filter(m => {
      const meta = m.metadata as any;
      return meta?.botEvent === 'incident_report_complete';
    }).length;

    let summary = `Shift completed. ${activityCount} activities logged`;
    if (photoCount > 0) summary += `, ${photoCount} photos documented`;
    if (incidentCount > 0) summary += `, ${incidentCount} incident report(s) filed`;
    summary += '.';
    return summary;
  }

  /**
   * Send system message to chatroom
   */
  private async sendSystemMessage(chatroomId: string, userId: string, content: string): Promise<void> {
    await db.insert(shiftChatroomMessages).values({
      id: crypto.randomUUID(),
      chatroomId,
      userId,
      content,
      messageType: 'system',
      isAuditProtected: false,
    });
  }

  /**
   * Generate chatroom name
   */
  private generateChatroomName(shift: any, employee?: any): string {
    const dateStr = format(new Date(shift.startTime), 'MMM d');
    const timeStr = format(new Date(shift.startTime), 'h:mma');
    
    if (employee) {
      return `${employee.firstName}'s Shift - ${dateStr} ${timeStr}`;
    }
    
    return `Shift Chatroom - ${dateStr} ${timeStr}`;
  }

  /**
   * Get site info for shift
   */
  async getSiteInfo(shiftId: string): Promise<{
    site: any | null;
    contacts: any[];
    address: string | null;
  }> {
    const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftId));
    if (!shift) {
      return { site: null, contacts: [], address: null };
    }

    let site = null;
    let contacts: any[] = [];
    let address: string | null = (shift as any).jobSiteAddress || null;

    if (shift.siteId) {
      const [siteResult] = await db.select().from(sites).where(eq(sites.id, shift.siteId));
      site = siteResult;

      if (site) {
        const parts = [site.addressLine1, site.addressLine2, site.city, site.state, site.zip].filter(Boolean);
        address = parts.length > 0 ? parts.join(', ') : address;

        contacts = await db.select().from(siteContacts).where(eq(siteContacts.siteId, site.id));
      }
    }

    if (!address && shift.clientId) {
      const [client] = await db.select().from(clients).where(eq(clients.id, shift.clientId));
      if (client?.address) {
        address = client.address;
      }
    }

    return { site, contacts, address };
  }

  /**
   * Verify DAR and mark as ready to send
   */
  async verifyDAR(darId: string, userId: string, notes?: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      await db.update(darReports)
        .set({
          status: 'verified',
          verifiedBy: userId,
          verifiedAt: new Date(),
          verificationNotes: notes,
          updatedAt: new Date(),
        })
        .where(eq(darReports.id, darId));

      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  }

  /**
   * Send DAR to client
   */
  async sendDARToClient(darId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const [dar] = await db.select().from(darReports).where(eq(darReports.id, darId));
      
      if (!dar) {
        return { success: false, error: 'DAR not found' };
      }

      if (dar.status !== 'verified') {
        return { success: false, error: 'DAR must be verified before sending' };
      }

      const clientAccessToken = crypto.randomBytes(32).toString('hex');

      await db.update(darReports)
        .set({
          status: 'sent',
          sentToClient: true,
          sentAt: new Date(),
          clientAccessToken,
          updatedAt: new Date(),
        })
        .where(eq(darReports.id, darId));

      log.info(`[ShiftChatroom] DAR ${darId} sent to client`);

      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  }

  /**
   * Auto-close stale chatrooms
   */
  async autoCloseStaleRooms(): Promise<{ closed: number }> {
    try {
      const now = new Date();
      
      const staleChatrooms = await db.select()
        .from(shiftChatrooms)
        .innerJoin(shifts, eq(shiftChatrooms.shiftId, shifts.id))
        .where(and(
          eq(shiftChatrooms.status, 'active'),
          lte(shifts.endTime, new Date(now.getTime() - 60 * 60 * 1000))
        ));

      let closed = 0;

      for (const { shift_chatrooms: chatroom, shifts: shift } of staleChatrooms) {
        await this.endShift(
          {
            workspaceId: chatroom.workspaceId,
            shiftId: chatroom.shiftId,
            userId: 'system',
          },
          'auto_timeout'
        );
        closed++;
      }

      if (closed > 0) {
        log.info(`[ShiftChatroom] Auto-closed ${closed} stale chatrooms`);
      }

      return { closed };
    } catch (error) {
      log.error('[ShiftChatroom] Error auto-closing rooms:', error);
      return { closed: 0 };
    }
  }

  /**
   * Check if data can be deleted (audit integrity system)
   */
  canDelete(entityType: 'message' | 'photo' | 'dar' | 'chatroom', entity: any): {
    allowed: boolean;
    reason: string;
  } {
    if (entity.isAuditProtected) {
      return {
        allowed: false,
        reason: 'This item is protected by the audit integrity system and cannot be deleted.'
      };
    }

    if (entityType === 'dar') {
      return {
        allowed: false,
        reason: 'Daily Activity Reports cannot be deleted for compliance purposes.'
      };
    }

    if (entityType === 'message' && entity.messageType === 'photo') {
      const ageInDays = (Date.now() - new Date(entity.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      if (ageInDays < 90) {
        return {
          allowed: false,
          reason: 'Photos must be retained for at least 90 days before deletion.'
        };
      }
    }

    return { allowed: true, reason: '' };
  }

  // =========================================================================
  // TRINITY MEETING ROOM RECORDING (PREMIUM FEATURE)
  // =========================================================================

  /**
   * Enable Trinity recording for a chatroom (Premium Feature)
   * Requires professional tier or credits
   */
  async enableTrinityRecording(
    chatroomId: string,
    workspaceId: string,
    userId: string
  ): Promise<{ success: boolean; error?: string; isPremium: boolean; creditCost?: number }> {
    try {
      // Import premium gating dynamically to avoid circular imports
      const { premiumFeatureGating } = await import('./premiumFeatureGating');
      
      // Check premium access
      const access = await premiumFeatureGating.checkAccess(workspaceId, 'trinity_meeting_recording', userId);
      
      if (!access.allowed) {
        return {
          success: false,
          error: access.reason,
          isPremium: true,
          creditCost: access.creditCost,
        };
      }

      // Update chatroom to enable recording
      await db.update(shiftChatrooms)
        .set({
          trinityRecordingEnabled: true,
          isMeetingRoom: true,
          updatedAt: new Date(),
        })
        .where(eq(shiftChatrooms.id, chatroomId));

      // Log system message
      await this.sendSystemMessage(chatroomId, userId,
        '[PREMIUM] Trinity AI recording enabled. All conversations will be transcribed and summarized.');

      log.info(`[ShiftChatroom] Trinity recording enabled for chatroom ${chatroomId}`);

      return {
        success: true,
        isPremium: true,
        creditCost: access.creditCost,
      };
    } catch (error: unknown) {
      log.error('[ShiftChatroom] Error enabling Trinity recording:', error);
      return {
        success: false,
        error: (error instanceof Error ? error.message : String(error)),
        isPremium: true,
      };
    }
  }

  /**
   * Generate meeting transcript and summary (Premium Feature)
   * Charges credits per minute of recording
   */
  async generateMeetingTranscript(
    chatroomId: string,
    workspaceId: string,
    userId: string
  ): Promise<{
    success: boolean;
    transcriptId?: string;
    summary?: string;
    actionItems?: string[];
    creditsUsed?: number;
    error?: string;
  }> {
    try {
      const { premiumFeatureGating } = await import('./premiumFeatureGating');
      
      // Get chatroom and messages
      const [chatroom] = await db.select()
        .from(shiftChatrooms)
        .where(eq(shiftChatrooms.id, chatroomId));

      if (!chatroom) {
        return { success: false, error: 'Chatroom not found' };
      }

      if (!chatroom.trinityRecordingEnabled) {
        return { success: false, error: 'Trinity recording is not enabled for this chatroom' };
      }

      const messages = await db.select()
        .from(shiftChatroomMessages)
        .where(eq(shiftChatroomMessages.chatroomId, chatroomId))
        .orderBy(shiftChatroomMessages.createdAt);

      // Calculate estimated recording minutes based on message count and timespan
      const firstMessage = messages[0];
      const lastMessage = messages[messages.length - 1];
      const timeSpanMinutes = firstMessage && lastMessage
        ? Math.ceil((new Date(lastMessage.createdAt!).getTime() - new Date(firstMessage.createdAt!).getTime()) / 60000)
        : 1;
      
      const estimatedMinutes = Math.max(1, Math.min(timeSpanMinutes, 120)); // Cap at 120 minutes

      // Check access with units (minutes) for proper per-minute billing validation
      const access = await premiumFeatureGating.checkAccess(
        workspaceId, 
        'trinity_meeting_recording', 
        userId,
        estimatedMinutes  // Pass minutes for credit/limit validation
      );
      
      if (!access.allowed) {
        return {
          success: false,
          error: access.reason,
        };
      }

      // Deduct credits for the minutes used
      const deduction = await premiumFeatureGating.recordUsage(
        workspaceId,
        'trinity_meeting_recording',
        estimatedMinutes,
        userId,
        { chatroomId, messageCount: messages.length }
      );

      if (!deduction.success) {
        return {
          success: false,
          error: deduction.error,
        };
      }

      // Generate transcript using AI
      const transcript = await this.generateAITranscript(chatroom, messages);

      // Get unique participant IDs
      const participantIds = [...new Set(messages.map(m => m.userId))];
      
      // Persist transcript to trinityMeetingRecordings for audit/billing
      const transcriptId = crypto.randomUUID();
      await db.insert(trinityMeetingRecordings).values({
        id: transcriptId,
        workspaceId,
        chatroomId,
        title: `Meeting Transcript - ${chatroom.name || 'Shift Chat'}`,
        startedAt: firstMessage?.createdAt || new Date(),
        endedAt: lastMessage?.createdAt || new Date(),
        durationMinutes: estimatedMinutes,
        transcription: messages
          .filter(m => m.messageType !== 'system')
          .map(m => `[${new Date(m.createdAt!).toLocaleTimeString()}] ${m.userId}: ${m.content}`)
          .join('\n'),
        aiSummary: transcript.summary,
        actionItems: transcript.actionItems,
        participantCount: participantIds.length,
        participantIds,
        isPremiumFeature: true,
        aiCreditsUsed: deduction.creditsDeducted,
        isAuditProtected: true,
        status: 'completed',
      });

      try {
        await db.update(shiftChatrooms)
          .set({
            updatedAt: new Date(),
          })
          .where(eq(shiftChatrooms.id, chatroomId));
      } catch (err: unknown) {
        log.error('[ShiftChatroom] Failed to update chatroom after transcript:', (err instanceof Error ? err.message : String(err)));
      }

      // Send system message
      await this.sendSystemMessage(chatroomId, userId,
        `[PREMIUM] Meeting transcript generated. ${messages.length} messages summarized. ${deduction.creditsDeducted} credits used.`);

      return {
        success: true,
        transcriptId,
        summary: transcript.summary,
        actionItems: transcript.actionItems,
        creditsUsed: deduction.creditsDeducted,
      };
    } catch (error: unknown) {
      log.error('[ShiftChatroom] Error generating transcript:', error);
      return {
        success: false,
        error: (error instanceof Error ? error.message : String(error)),
      };
    }
  }

  /**
   * Generate AI-powered transcript and summary
   */
  private async generateAITranscript(
    chatroom: any,
    messages: any[]
  ): Promise<{ summary: string; actionItems: string[]; keyTopics: string[] }> {
    try {
      // Format messages for AI processing
      const formattedMessages = messages
        .filter(m => m.messageType !== 'system')
        .map(m => `[${new Date(m.createdAt!).toLocaleTimeString()}] ${m.userId}: ${m.content}`)
        .join('\n');

      // For now, generate a simple summary (in production, this would use Trinity AI)
      const messageCount = messages.length;
      const participantCount = new Set(messages.map(m => m.userId)).size;
      const photoCount = messages.filter(m => m.messageType === 'photo').length;
      
      const summary = `Meeting summary for ${chatroom.name}:
- Duration: ${messages.length > 0 ? Math.ceil((new Date(messages[messages.length - 1].createdAt!).getTime() - new Date(messages[0].createdAt!).getTime()) / 60000) : 0} minutes
- ${messageCount} messages exchanged
- ${participantCount} participants
- ${photoCount} photos shared
- Key discussions covered shift operations and team coordination.`;

      const actionItems = [
        'Review shift completion status',
        'Follow up on any reported incidents',
        'Update client on service delivery',
      ];

      const keyTopics = ['Shift Status', 'Team Coordination', 'Client Updates'];

      return { summary, actionItems, keyTopics };
    } catch (error) {
      log.error('[ShiftChatroom] Error generating AI transcript:', error);
      return {
        summary: 'Unable to generate summary',
        actionItems: [],
        keyTopics: [],
      };
    }
  }

  /**
   * Get premium feature status for a chatroom
   */
  async getPremiumFeatureStatus(
    chatroomId: string,
    workspaceId: string
  ): Promise<{
    trinityRecording: { enabled: boolean; available: boolean; creditCost: number };
    aiDar: { enabled: boolean; available: boolean; creditCost: number };
  }> {
    try {
      const { premiumFeatureGating } = await import('./premiumFeatureGating');
      
      const [chatroom] = await db.select()
        .from(shiftChatrooms)
        .where(eq(shiftChatrooms.id, chatroomId));

      const recordingAccess = await premiumFeatureGating.checkAccess(workspaceId, 'trinity_meeting_recording');
      const darAccess = await premiumFeatureGating.checkAccess(workspaceId, 'ai_dar_generation');

      return {
        trinityRecording: {
          enabled: chatroom?.trinityRecordingEnabled || false,
          available: recordingAccess.allowed,
          creditCost: recordingAccess.creditCost || 5,
        },
        aiDar: {
          enabled: true, // DAR is always available if tier allows
          available: darAccess.allowed,
          creditCost: darAccess.creditCost || 2,
        },
      };
    } catch (error) {
      log.error('[ShiftChatroom] Error getting premium status:', error);
      return {
        trinityRecording: { enabled: false, available: false, creditCost: 5 },
        aiDar: { enabled: false, available: false, creditCost: 2 },
      };
    }
  }
}

export const shiftChatroomWorkflowService = ShiftChatroomWorkflowService.getInstance();
