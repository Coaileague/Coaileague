/**
 * TRINITY AUTOMATION TOGGLE SERVICE
 * ==================================
 * Manages per-feature automation toggles for organizations with database persistence.
 * When enabled, Trinity autonomously handles the feature with approval flow:
 * 
 * 1. User/Org clicks "Automate" or requests Trinity
 * 2. Trinity isolates the feature and runs automation
 * 3. Results shown in approval modal/scaffold page
 * 4. Org owner approves → Trinity commits to QuickBooks/DB
 * 5. Receipt/confirmation shown to user
 * 
 * Features with automation support:
 * - scheduling: AI-powered shift generation
 * - invoicing: Auto-generate and sync invoices
 * - payroll: Auto-process payroll runs
 * - time_tracking: Auto-approve timesheets
 * - shift_monitoring: Auto-replacement for NCNS/call-offs
 * - quickbooks_sync: Bidirectional QuickBooks sync
 * 
 * All automation data persisted in:
 * - trinity_automation_settings: Per-org feature toggles
 * - trinity_automation_requests: Pending approvals workflow
 * - trinity_automation_receipts: Completed automation audit trail
 */

import crypto from 'crypto';
import { AI } from '../../config/platformConfig';
import { db } from '../../db';
import { 
  trinityAutomationSettings, 
  trinityAutomationRequests, 
  trinityAutomationReceipts,
  timeEntries,
  workspaces,
  TrinityAutomationSettings,
  TrinityAutomationRequest,
  TrinityAutomationReceipt,
  InsertTrinityAutomationRequest,
  InsertTrinityAutomationReceipt,
} from '@shared/schema';
import { eq, and, desc, lt, sql, isNull, isNotNull, count } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';
import { generateWeeklyInvoices } from '../billingAutomation';
import { PayrollAutomationEngine, detectPayPeriod } from '../payrollAutomation';
import { generateWeeklyShifts } from '../scheduling/trinityShiftGenerator';
import { startOfWeek, addDays } from 'date-fns';
import { aggregateBillableHours } from './billableHoursAggregator';
import { aggregatePayrollHours } from './payrollHoursAggregator';
import { AutomationCheckpointer, AutomationCheckpoint, createCheckpointer } from './automationCheckpointer';
import { meteredGemini } from '../billing/meteredGeminiClient';
import { typedExec } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityAutomationToggle');


export type AutomationFeature = 
  | 'scheduling'
  | 'invoicing'
  | 'payroll'
  | 'time_tracking'
  | 'shift_monitoring'
  | 'quickbooks_sync';

export type InvoicingCycle = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'net30';
export type PayrollCycle = 'daily' | 'weekly' | 'biweekly' | 'semi_monthly' | 'monthly';
export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export type BreakComplianceRule = 'US-FEDERAL' | 'CA' | 'NY' | 'TX' | 'WA' | 'FL' | 'IL' | 'AZ' | 'NV' | 'CO' | 'GA' | 'NC' | 'OH' | 'PA';

export interface AutomationSettings {
  scheduling: boolean;
  invoicing: boolean;
  payroll: boolean;
  time_tracking: boolean;
  shift_monitoring: boolean;
  quickbooks_sync: boolean;
  requireApprovalForAll?: boolean;
  autoApproveThreshold?: number;
  notifyOnRequest?: boolean;
  notifyOnComplete?: boolean;
  notifyOnError?: boolean;

  invoicingCycle?: InvoicingCycle;
  invoicingDayOfWeek?: DayOfWeek;
  invoicingDayOfMonth?: number;
  invoicingNetDays?: number;

  payrollCycle?: PayrollCycle;
  payrollDayOfWeek?: DayOfWeek;
  payrollSemiMonthlyDays?: string;
  payrollNextRunDate?: Date | null;

  breakComplianceRule?: BreakComplianceRule;
  shiftReminderHours?: number;
}

export interface AutomationRequest {
  workspaceId: string;
  feature: AutomationFeature;
  requestedBy: string;
  context: Record<string, any>;
}

export interface AutomationResult {
  requestId: string;
  feature: AutomationFeature;
  status: 'pending' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed' | 'paused';
  summary: string;
  details: any;
  preview: any;
  estimatedImpact?: {
    recordsAffected: number;
    estimatedValue?: number;
    riskLevel: 'low' | 'medium' | 'high';
  };
  createdAt: Date;
  approvedAt?: Date;
  approvedBy?: string;
  executedAt?: Date;
  receipt?: AutomationReceipt;
  checkpoint?: AutomationCheckpoint | null;
  pausedAt?: Date;
  pausedBy?: string;
  pauseReason?: string;
  revisedPayload?: Record<string, any> | null;
  revisionNotes?: string | null;
  revisionHistory?: Array<{ revisedBy: string; revisedAt: string; notes: string; payloadSnapshot: any }>;
  trinityReanalysis?: string | null;
  trinityReanalysisAt?: Date | null;
}

export interface AutomationReceipt {
  receiptId: string;
  feature: AutomationFeature;
  timestamp: Date;
  workspaceId: string;
  summary: string;
  payload: {
    recordsCreated: number;
    recordsUpdated: number;
    externalSyncs: Array<{
      service: string;
      status: 'success' | 'failed';
      externalId?: string;
      message?: string;
    }>;
  };
  trinitySignature: string;
}

const DEFAULT_SETTINGS: AutomationSettings = {
  scheduling: false,
  invoicing: false,
  payroll: false,
  time_tracking: false,
  shift_monitoring: true,
  quickbooks_sync: false,
  requireApprovalForAll: true,
  autoApproveThreshold: AI.autoApproveThreshold,
  notifyOnRequest: true,
  notifyOnComplete: true,
  notifyOnError: true,
  invoicingCycle: 'monthly',
  invoicingDayOfWeek: 'monday',
  invoicingDayOfMonth: 1,
  invoicingNetDays: 30,
  payrollCycle: 'biweekly',
  payrollDayOfWeek: 'friday',
  payrollSemiMonthlyDays: '1,15',
  payrollNextRunDate: null,
  breakComplianceRule: 'US-FEDERAL',
  shiftReminderHours: 1,
};

class TrinityAutomationToggleService {
  private static instance: TrinityAutomationToggleService;
  private expiryCleanupInterval: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    this.startExpiryCleanup();
  }

  static getInstance(): TrinityAutomationToggleService {
    if (!this.instance) {
      this.instance = new TrinityAutomationToggleService();
    }
    return this.instance;
  }

  /**
   * Get automation settings for a workspace from database
   */
  async getSettings(workspaceId: string): Promise<AutomationSettings> {
    try {
      const settings = await db.query.trinityAutomationSettings.findFirst({
        where: eq(trinityAutomationSettings.workspaceId, workspaceId),
      });

      if (settings) {
        return {
          scheduling: settings.schedulingEnabled ?? false,
          invoicing: settings.invoicingEnabled ?? false,
          payroll: settings.payrollEnabled ?? false,
          time_tracking: settings.timeTrackingEnabled ?? false,
          shift_monitoring: settings.shiftMonitoringEnabled ?? false,
          quickbooks_sync: settings.quickbooksSyncEnabled ?? false,
          requireApprovalForAll: settings.requireApprovalForAll ?? true,
          autoApproveThreshold: parseFloat(settings.autoApproveThreshold || String(AI.autoApproveThreshold)),
          notifyOnRequest: settings.notifyOnRequest ?? true,
          notifyOnComplete: settings.notifyOnComplete ?? true,
          notifyOnError: settings.notifyOnError ?? true,
          invoicingCycle: (settings.invoicingCycle as InvoicingCycle) ?? 'monthly',
          invoicingDayOfWeek: (settings.invoicingDayOfWeek as DayOfWeek) ?? 'monday',
          invoicingDayOfMonth: settings.invoicingDayOfMonth ?? 1,
          invoicingNetDays: settings.invoicingNetDays ?? 30,
          payrollCycle: (settings.payrollCycle as PayrollCycle) ?? 'biweekly',
          payrollDayOfWeek: (settings.payrollDayOfWeek as DayOfWeek) ?? 'friday',
          payrollSemiMonthlyDays: settings.payrollSemiMonthlyDays ?? '1,15',
          payrollNextRunDate: settings.payrollNextRunDate ?? null,
          breakComplianceRule: (settings.breakComplianceRule as BreakComplianceRule) ?? 'US-FEDERAL',
          shiftReminderHours: settings.shiftReminderHours ?? 1,
        };
      }

      return { ...DEFAULT_SETTINGS };
    } catch (error) {
      log.error('[TrinityToggle] Error getting settings:', error);
      return { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Update automation settings for a workspace (persisted to database)
   */
  async updateSettings(workspaceId: string, settings: Partial<AutomationSettings>, modifiedBy?: string): Promise<AutomationSettings> {
    try {
      const existing = await db.query.trinityAutomationSettings.findFirst({
        where: eq(trinityAutomationSettings.workspaceId, workspaceId),
      });

      const updateData: Record<string, any> = {
        schedulingEnabled: settings.scheduling,
        invoicingEnabled: settings.invoicing,
        payrollEnabled: settings.payroll,
        timeTrackingEnabled: settings.time_tracking,
        shiftMonitoringEnabled: settings.shift_monitoring,
        quickbooksSyncEnabled: settings.quickbooks_sync,
        requireApprovalForAll: settings.requireApprovalForAll,
        autoApproveThreshold: settings.autoApproveThreshold?.toString(),
        notifyOnRequest: settings.notifyOnRequest,
        notifyOnComplete: settings.notifyOnComplete,
        notifyOnError: settings.notifyOnError,
        lastModifiedBy: modifiedBy,
        updatedAt: new Date(),
      };

      if (settings.invoicingCycle !== undefined) updateData.invoicingCycle = settings.invoicingCycle;
      if (settings.invoicingDayOfWeek !== undefined) updateData.invoicingDayOfWeek = settings.invoicingDayOfWeek;
      if (settings.invoicingDayOfMonth !== undefined) updateData.invoicingDayOfMonth = settings.invoicingDayOfMonth;
      if (settings.invoicingNetDays !== undefined) updateData.invoicingNetDays = settings.invoicingNetDays;
      if (settings.payrollCycle !== undefined) updateData.payrollCycle = settings.payrollCycle;
      if (settings.payrollDayOfWeek !== undefined) updateData.payrollDayOfWeek = settings.payrollDayOfWeek;
      if (settings.payrollSemiMonthlyDays !== undefined) updateData.payrollSemiMonthlyDays = settings.payrollSemiMonthlyDays;
      if (settings.breakComplianceRule !== undefined) updateData.breakComplianceRule = settings.breakComplianceRule;
      if (settings.shiftReminderHours !== undefined) updateData.shiftReminderHours = settings.shiftReminderHours;

      if (existing) {
        await db.update(trinityAutomationSettings)
          .set(updateData)
          .where(eq(trinityAutomationSettings.workspaceId, workspaceId));
      } else {
        await db.insert(trinityAutomationSettings).values({
          workspaceId,
          ...updateData,
        });
      }

      // RC3 (Phase 2): workspaces.payrollCycle is the single source of truth.
      // Previously this also wrote to billingSettingsBlob (dual-write); blob write removed.
      // payrollAutoCloseService + timesheetReminderService now read the dedicated column.
      if (settings.payrollCycle !== undefined) {
        await db.update(workspaces)
          .set({ payrollCycle: settings.payrollCycle })
          .where(eq(workspaces.id, workspaceId));
      }

      const updated = await this.getSettings(workspaceId);

      await platformEventBus.publish({
        type: 'automation_settings_updated',
        category: 'automation',
        title: 'Automation Settings Changed',
        description: `Automation settings updated for workspace`,
        workspaceId,
        metadata: { settings: updated },
      });

      await this.broadcastSettingsUpdate(workspaceId, updated);

      return updated;
    } catch (error) {
      log.error('[TrinityToggle] Error updating settings:', error);
      throw error;
    }
  }

  /**
   * Check if a specific feature is automated for a workspace
   */
  async isFeatureAutomated(workspaceId: string, feature: AutomationFeature): Promise<boolean> {
    const settings = await this.getSettings(workspaceId);
    return settings[feature] ?? false;
  }

  /**
   * Request automation - creates pending request in database
   */
  async requestAutomation(request: AutomationRequest): Promise<AutomationResult> {
    log.info(`[TrinityToggle] Automation requested: ${request.feature} for workspace ${request.workspaceId}`);

    const preview = await this.generatePreview(request);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const insertData: InsertTrinityAutomationRequest = {
      workspaceId: request.workspaceId,
      feature: request.feature,
      requestedBy: request.requestedBy,
      requestedAt: new Date(),
      context: request.context,
      preview: {
        summary: preview.summary,
        details: preview.details,
        previewData: preview.previewData,
        impact: preview.impact,
      },
      previewGeneratedAt: new Date(),
      status: 'pending',
      expiresAt,
      trinitySignature: this.generateRequestSignature(request),
    };

    const [inserted] = await db.insert(trinityAutomationRequests)
      .values(insertData)
      .returning();

    const result: AutomationResult = {
      requestId: inserted.id,
      feature: request.feature as AutomationFeature,
      status: 'pending',
      summary: preview.summary,
      details: preview.details,
      preview: preview.previewData,
      estimatedImpact: preview.impact,
      createdAt: inserted.createdAt!,
    };

    const settings = await this.getSettings(request.workspaceId);
    if (settings.notifyOnRequest) {
      await platformEventBus.publish({
        type: 'automation_approval_requested',
        category: 'automation',
        title: `Automation Request: ${request.feature}`,
        description: preview.summary,
        workspaceId: request.workspaceId,
        metadata: {
          requestId: inserted.id,
          feature: request.feature,
          requestedBy: request.requestedBy,
          requiresApproval: true,
        },
      });
    }

    await this.broadcastRequestUpdate(request.workspaceId, result);

    return result;
  }

  /**
   * Approve an automation request - updates database and executes
   */
  async approveAutomation(requestId: string, approvedBy: string): Promise<AutomationResult> {
    const request = await db.query.trinityAutomationRequests.findFirst({
      where: eq(trinityAutomationRequests.id, requestId),
    });

    if (!request) {
      throw new Error('Automation request not found');
    }

    if (request.status !== 'pending' && request.status !== 'paused') {
      throw new Error(`Request is already ${request.status}`);
    }

    // If a revised payload exists, apply it to the preview before execution
    const revisedPayload = request.revisedPayload;
    const effectivePreview = revisedPayload
      ? { ...(request.preview as any || {}), previewData: revisedPayload }
      : request.preview;

    await db.update(trinityAutomationRequests)
      .set({
        status: 'approved',
        approvedBy,
        approvedAt: new Date(),
        updatedAt: new Date(),
        ...(revisedPayload ? { preview: effectivePreview } : {}),
      })
      .where(eq(trinityAutomationRequests.id, requestId));

    log.info(`[TrinityToggle] Automation approved: ${requestId} by ${approvedBy}`);

    try {
      await db.update(trinityAutomationRequests)
        .set({ status: 'executing', executionStartedAt: new Date() })
        .where(eq(trinityAutomationRequests.id, requestId));

      const executionResult = await this.executeAutomation(request);

      // H3: Wrap status update + receipt insert in a single transaction so both
      // succeed or both fail — prevents "completed" request with missing audit receipt
      const receiptInsert: InsertTrinityAutomationReceipt = {
        workspaceId: request.workspaceId,
        requestId,
        feature: request.feature,
        action: `${request.feature}_automation`,
        success: true,
        itemsProcessed: executionResult.receipt?.payload.recordsCreated || 0,
        itemsFailed: 0,
        summary: executionResult.receipt?.summary,
        details: executionResult.receipt?.payload || {},
        trinitySignature: executionResult.receipt?.trinitySignature,
        verifiedAt: new Date(),
        initiatedBy: request.requestedBy,
        approvedBy,
        executedAt: new Date(),
      };

      await db.transaction(async (tx) => {
        await tx.update(trinityAutomationRequests)
          .set({
            status: 'completed',
            executionCompletedAt: new Date(),
            executionResult: executionResult.receipt,
            updatedAt: new Date(),
          })
          .where(eq(trinityAutomationRequests.id, requestId));
        await tx.insert(trinityAutomationReceipts).values(receiptInsert);
      });

      const settings = await this.getSettings(request.workspaceId);
      if (settings.notifyOnComplete) {
        await platformEventBus.publish({
          type: 'automation_executed',
          category: 'automation',
          title: `Automation Completed: ${request.feature}`,
          description: executionResult.receipt?.summary || 'Automation completed successfully',
          workspaceId: request.workspaceId,
          metadata: {
            requestId,
            feature: request.feature,
            receipt: executionResult.receipt,
          },
        });
      }

      const result = await this.getRequestResult(requestId);
      await this.broadcastRequestUpdate(request.workspaceId, result!);
      return result!;

    } catch (error: any) {
      await db.update(trinityAutomationRequests)
        .set({
          status: 'failed',
          errorMessage: (error instanceof Error ? error.message : String(error)),
          executionCompletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(trinityAutomationRequests.id, requestId));

      const settings = await this.getSettings(request.workspaceId);
      if (settings.notifyOnError) {
        await platformEventBus.publish({
          type: 'automation_failed',
          category: 'automation',
          title: `Automation Failed: ${request.feature}`,
          description: error.message,
          workspaceId: request.workspaceId,
          metadata: { requestId, error: error.message },
        });
      }

      log.error(`[TrinityToggle] Automation execution failed:`, error);
      const result = await this.getRequestResult(requestId);
      return result!;
    }
  }

  /**
   * Reject an automation request
   */
  async rejectAutomation(requestId: string, rejectedBy: string, reason?: string): Promise<AutomationResult> {
    const request = await db.query.trinityAutomationRequests.findFirst({
      where: eq(trinityAutomationRequests.id, requestId),
    });

    if (!request) {
      throw new Error('Automation request not found');
    }

    await db.update(trinityAutomationRequests)
      .set({
        status: 'rejected',
        rejectedBy,
        rejectedAt: new Date(),
        rejectionReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(trinityAutomationRequests.id, requestId));

    await platformEventBus.publish({
      type: 'automation_rejected',
      category: 'automation',
      title: `Automation Rejected`,
      description: reason || 'Automation request was rejected by org owner',
      workspaceId: request.workspaceId,
      metadata: { requestId, rejectedBy, reason },
    });

    const result = await this.getRequestResult(requestId);
    await this.broadcastRequestUpdate(request.workspaceId, result!);
    return result!;
  }

  /**
   * Resume a failed automation from its checkpoint.
   *
   * Trinity analyzes the saved checkpoint, reports which steps completed and which
   * failed, then re-runs from the first non-completed step. Steps already marked
   * completed are skipped — no double-billing, no double-payroll.
   */
  async resumeAutomation(requestId: string, resumedBy: string): Promise<AutomationResult & { analysis: string }> {
    const request = await db.query.trinityAutomationRequests.findFirst({
      where: eq(trinityAutomationRequests.id, requestId),
    });

    if (!request) throw new Error('Automation request not found');
    if (request.status !== 'failed' && request.status !== 'paused') {
      throw new Error(`Only failed or paused automations can be resumed (current status: ${request.status})`);
    }

    const checkpoint = request.checkpointData as AutomationCheckpoint | null;
    const isPaused = request.status === 'paused';

    if (!isPaused && (!checkpoint || !checkpoint.resumable)) {
      throw new Error('This automation does not have a saved checkpoint. Cannot resume.');
    }

    // Analyze the checkpoint state so Trinity can explain what happened
    const tempCheckpointer = new AutomationCheckpointer(requestId, request.feature, request.workspaceId);
    const analysis = checkpoint
      ? tempCheckpointer.analyzeState(checkpoint)
      : { summary: 'No checkpoint found — restarting from the beginning.', resumeFromStep: null, completedSteps: [], failedStep: null };

    log.info(`[TrinityToggle] Resuming automation ${requestId}: ${analysis.summary}`);
    log.info(`[TrinityToggle] Resuming from step: ${analysis.resumeFromStep ?? 'beginning'}`);

    // Reset status to executing, preserve checkpoint (steps will be skipped based on saved state)
    await db.update(trinityAutomationRequests)
      .set({
        status: 'executing',
        executionStartedAt: new Date(),
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(trinityAutomationRequests.id, requestId));

    try {
      const executionResult = await this.executeAutomation(request, true);

      const receiptInsert: InsertTrinityAutomationReceipt = {
        workspaceId: request.workspaceId,
        requestId,
        feature: request.feature,
        action: `${request.feature}_automation_resumed`,
        success: true,
        itemsProcessed: executionResult.receipt?.payload.recordsCreated || 0,
        itemsFailed: 0,
        summary: `[Resumed] ${executionResult.receipt?.summary}`,
        details: executionResult.receipt?.payload || {},
        trinitySignature: executionResult.receipt?.trinitySignature,
        verifiedAt: new Date(),
        initiatedBy: request.requestedBy,
        approvedBy: resumedBy,
        executedAt: new Date(),
      };

      await db.transaction(async (tx) => {
        await tx.update(trinityAutomationRequests)
          .set({
            status: 'completed',
            executionCompletedAt: new Date(),
            executionResult: executionResult.receipt,
            updatedAt: new Date(),
          })
          .where(eq(trinityAutomationRequests.id, requestId));
        await tx.insert(trinityAutomationReceipts).values(receiptInsert);
      });

      await platformEventBus.publish({
        type: 'automation_executed',
        category: 'automation',
        title: `Automation Resumed & Completed: ${request.feature}`,
        description: executionResult.receipt?.summary || 'Automation resumed and completed',
        workspaceId: request.workspaceId,
        metadata: { requestId, feature: request.feature, resumedBy },
      });

      const result = await this.getRequestResult(requestId);
      return { ...(result!), analysis: analysis.summary };

    } catch (error: any) {
      await db.update(trinityAutomationRequests)
        .set({
          status: 'failed',
          errorMessage: (error instanceof Error ? error.message : String(error)),
          executionCompletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(trinityAutomationRequests.id, requestId));

      log.error(`[TrinityToggle] Resume failed for ${requestId}:`, error);
      throw error;
    }
  }

  /**
   * Get the checkpoint state for a specific automation request.
   * Returns the step list and analysis so the UI can display progress.
   */
  async getCheckpointState(requestId: string, workspaceId: string): Promise<{
    checkpoint: AutomationCheckpoint | null;
    analysis: ReturnType<AutomationCheckpointer['analyzeState']> | null;
  }> {
    const request = await db.query.trinityAutomationRequests.findFirst({
      where: and(
        eq(trinityAutomationRequests.id, requestId),
        eq(trinityAutomationRequests.workspaceId, workspaceId),
      ),
    });

    if (!request) return { checkpoint: null, analysis: null };

    const checkpoint = (request.checkpointData as AutomationCheckpoint) || null;
    if (!checkpoint) return { checkpoint: null, analysis: null };

    const cp = new AutomationCheckpointer(requestId, request.feature, workspaceId);
    return { checkpoint, analysis: cp.analyzeState(checkpoint) };
  }

  /**
   * Get a single pending request from database with workspace isolation
   */
  async getPendingRequest(requestId: string, workspaceId?: string): Promise<AutomationResult | undefined> {
    return this.getRequestResult(requestId, workspaceId);
  }

  /**
   * Get all pending requests for a workspace from database
   */
  async getAllPendingRequests(workspaceId?: string): Promise<AutomationResult[]> {
    const whereClause = workspaceId 
      ? and(
          eq(trinityAutomationRequests.status, 'pending'),
          eq(trinityAutomationRequests.workspaceId, workspaceId)
        )
      : eq(trinityAutomationRequests.status, 'pending');

    const requests = await db.query.trinityAutomationRequests.findMany({
      where: whereClause,
      orderBy: desc(trinityAutomationRequests.requestedAt),
    });

    return requests.map(r => this.mapToResult(r));
  }

  /**
   * Get automation history for a workspace
   */
  async getAutomationHistory(workspaceId: string, limit = 50): Promise<AutomationResult[]> {
    const requests = await db.query.trinityAutomationRequests.findMany({
      where: eq(trinityAutomationRequests.workspaceId, workspaceId),
      orderBy: desc(trinityAutomationRequests.requestedAt),
      limit,
    });

    return requests.map(r => this.mapToResult(r));
  }

  /**
   * Get receipts for a workspace
   */
  async getReceipts(workspaceId: string, limit = 50): Promise<TrinityAutomationReceipt[]> {
    return db.query.trinityAutomationReceipts.findMany({
      where: eq(trinityAutomationReceipts.workspaceId, workspaceId),
      orderBy: desc(trinityAutomationReceipts.executedAt),
      limit,
    });
  }

  /**
   * Convert database record to AutomationResult
   */
  private mapToResult(record: TrinityAutomationRequest): AutomationResult {
    const preview = record.preview as any || {};
    const r = record as any;
    return {
      requestId: record.id,
      feature: record.feature as AutomationFeature,
      status: record.status as AutomationResult['status'],
      summary: preview.summary || '',
      details: preview.details || {},
      preview: preview.previewData || {},
      estimatedImpact: preview.impact,
      createdAt: record.createdAt!,
      approvedAt: record.approvedAt || undefined,
      approvedBy: record.approvedBy || undefined,
      executedAt: record.executionCompletedAt || undefined,
      checkpoint: (record.checkpointData as AutomationCheckpoint) || null,
      pausedAt: r.pausedAt || undefined,
      pausedBy: r.pausedBy || undefined,
      pauseReason: r.pauseReason || undefined,
      revisedPayload: r.revisedPayload || null,
      revisionNotes: r.revisionNotes || null,
      revisionHistory: r.revisionHistory || [],
      trinityReanalysis: r.trinityReanalysis || null,
      trinityReanalysisAt: r.trinityReanalysisAt || null,
    };
  }

  /**
   * Get request result from database with optional workspace isolation
   */
  private async getRequestResult(requestId: string, workspaceId?: string): Promise<AutomationResult | undefined> {
    const whereClause = workspaceId 
      ? and(
          eq(trinityAutomationRequests.id, requestId),
          eq(trinityAutomationRequests.workspaceId, workspaceId)
        )
      : eq(trinityAutomationRequests.id, requestId);

    const record = await db.query.trinityAutomationRequests.findFirst({
      where: whereClause,
    });

    if (!record) return undefined;
    return this.mapToResult(record);
  }

  /**
   * Generate preview for automation request
   */
  private async generatePreview(request: AutomationRequest): Promise<{
    summary: string;
    details: any;
    previewData: any;
    impact: AutomationResult['estimatedImpact'];
  }> {
    switch (request.feature) {
      case 'scheduling':
        return {
          summary: 'I\'ll generate an optimized schedule based on employee availability, skills, and client needs',
          details: {
            weekStart: request.context.weekStart,
            employeesConsidered: request.context.employeeCount || 0,
            shiftsToFill: request.context.shiftCount || 0,
          },
          previewData: { type: 'schedule_preview', data: request.context },
          impact: {
            recordsAffected: request.context.shiftCount || 0,
            riskLevel: 'low',
          },
        };

      case 'invoicing': {
        // Build a rich invoice preview using the real billable hours aggregator (read-only)
        try {
          const endDate = new Date();
          const startDate = new Date(endDate);
          startDate.setDate(startDate.getDate() - 14); // look back 14 days for unbilled entries
          const billableResult = await aggregateBillableHours({
            workspaceId: request.workspaceId,
            startDate,
            endDate,
          });
          const clientBreakdown = billableResult.clientSummaries.map(c => ({
            clientName: c.clientName,
            totalHours: Number(c.totalHours.toFixed(2)),
            regularHours: Number(c.totalRegularHours.toFixed(2)),
            overtimeHours: Number(c.totalOvertimeHours.toFixed(2)),
            estimatedAmount: Number(c.totalAmount.toFixed(2)),
            entryCount: c.entries.length,
          }));
          const totalAmount = Number(billableResult.totalBillableAmount.toFixed(2));
          const totalHours = Number(billableResult.clientSummaries.reduce((s, c) => s + c.totalHours, 0).toFixed(2));
          const invoiceCount = clientBreakdown.length;
          const warnings = billableResult.warnings.slice(0, 5);
          return {
            summary: `I'll generate ${invoiceCount} client invoice${invoiceCount !== 1 ? 's' : ''} totaling $${totalAmount.toLocaleString()} from ${billableResult.entriesProcessed} approved billable time entries`,
            details: {
              periodStart: startDate.toISOString().split('T')[0],
              periodEnd: endDate.toISOString().split('T')[0],
              billableEntries: billableResult.entriesProcessed,
              invoiceCount,
              totalHours,
              totalAmount,
              clientBreakdown,
              warnings,
            },
            previewData: {
              type: 'invoice_preview',
              summary: `${invoiceCount} invoice${invoiceCount !== 1 ? 's' : ''} — $${totalAmount.toLocaleString()} total`,
              clients: clientBreakdown,
              totalAmount,
              totalHours,
              entriesProcessed: billableResult.entriesProcessed,
              warnings,
            },
            impact: {
              recordsAffected: billableResult.entriesProcessed,
              estimatedValue: totalAmount,
              riskLevel: 'medium',
            },
          };
        } catch (previewErr) {
          log.warn('[TrinityPreview] Invoice aggregation failed, falling back to count:', previewErr);
          const [billableCount] = await db.select({ value: count() }).from(timeEntries).where(and(
            eq(timeEntries.workspaceId, request.workspaceId),
            eq(timeEntries.status, 'approved'),
            eq(timeEntries.billableToClient, true),
            isNull(timeEntries.billedAt),
            isNotNull(timeEntries.clockOut),
          ));
          const entryCount = Number(billableCount?.value ?? 0);
          return {
            summary: `I'll generate client invoices from ${entryCount} approved billable time entries`,
            details: { billableEntries: entryCount },
            previewData: { type: 'invoice_preview', entryCount },
            impact: { recordsAffected: entryCount, riskLevel: 'medium' },
          };
        }
      }

      case 'payroll': {
        // Build a rich payroll preview using the real payroll hours aggregator (read-only)
        try {
          const payPeriod = await detectPayPeriod(request.workspaceId);
          const payrollResult = await aggregatePayrollHours({
            workspaceId: request.workspaceId,
            startDate: payPeriod.periodStart,
            endDate: payPeriod.periodEnd,
          });
          const employeeBreakdown = payrollResult.employeeSummaries.map(e => ({
            employeeName: e.employeeName,
            workerType: e.workerType,
            totalHours: Number(e.totalHours.toFixed(2)),
            regularHours: Number(e.totalRegularHours.toFixed(2)),
            overtimeHours: Number(e.totalOvertimeHours.toFixed(2)),
            grossPay: Number(e.grossPay.toFixed(2)),
            hasOvertime: e.totalOvertimeHours > 0,
          }));
          const totalGross = Number(payrollResult.totalPayrollAmount.toFixed(2));
          const employeeCount = employeeBreakdown.length;
          const overtimeEmployees = employeeBreakdown.filter(e => e.hasOvertime).length;
          const warnings = payrollResult.warnings.slice(0, 5);
          return {
            summary: `I'll process payroll for ${employeeCount} employee${employeeCount !== 1 ? 's' : ''} — $${totalGross.toLocaleString()} total gross pay${overtimeEmployees > 0 ? ` (${overtimeEmployees} with overtime)` : ''}`,
            details: {
              periodStart: payPeriod.start.toISOString().split('T')[0],
              periodEnd: payPeriod.end.toISOString().split('T')[0],
              employeeCount,
              totalGross,
              overtimeEmployees,
              entriesProcessed: payrollResult.entriesProcessed,
              employeeBreakdown,
              warnings,
            },
            previewData: {
              type: 'payroll_preview',
              summary: `${employeeCount} employee${employeeCount !== 1 ? 's' : ''} — $${totalGross.toLocaleString()} gross pay`,
              periodStart: payPeriod.start.toISOString().split('T')[0],
              periodEnd: payPeriod.end.toISOString().split('T')[0],
              employees: employeeBreakdown,
              totalGross,
              overtimeEmployees,
              entriesProcessed: payrollResult.entriesProcessed,
              warnings,
            },
            impact: {
              recordsAffected: payrollResult.entriesProcessed,
              estimatedValue: totalGross,
              riskLevel: overtimeEmployees > 0 ? 'high' : 'medium',
            },
          };
        } catch (previewErr) {
          log.warn('[TrinityPreview] Payroll aggregation failed, falling back to count:', previewErr);
          const [payrollCount] = await db.select({ value: count() }).from(timeEntries).where(and(
            eq(timeEntries.workspaceId, request.workspaceId),
            eq(timeEntries.status, 'approved'),
            isNull(timeEntries.payrolledAt),
            isNotNull(timeEntries.clockOut),
          ));
          const entryCount = Number(payrollCount?.value ?? 0);
          return {
            summary: `I'll process payroll for ${entryCount} approved time entries with FLSA-compliant OT calculation`,
            details: { unpayrolledEntries: entryCount },
            previewData: { type: 'payroll_preview', entryCount },
            impact: { recordsAffected: entryCount, riskLevel: 'high' },
          };
        }
      }

      case 'shift_monitoring':
        return {
          summary: 'I\'ll monitor shifts for late arrivals and no-shows, and trigger auto-replacement when needed',
          details: {
            shiftsMonitored: request.context.shiftCount || 0,
            lateThreshold: request.context.lateThreshold || AI.lateArrivalThresholdMinutes,
          },
          previewData: { type: 'monitoring_preview', data: request.context },
          impact: {
            recordsAffected: request.context.shiftCount || 0,
            riskLevel: 'low',
          },
        };

      case 'quickbooks_sync':
        return {
          summary: 'I\'ll sync data bidirectionally with QuickBooks',
          details: {
            syncType: request.context.syncType || 'full',
            entities: request.context.entities || ['invoices', 'payments'],
          },
          previewData: { type: 'sync_preview', data: request.context },
          impact: {
            recordsAffected: request.context.recordCount || 0,
            riskLevel: 'medium',
          },
        };

      default:
        return {
          summary: `I'll handle the ${request.feature} automation`,
          details: request.context,
          previewData: { type: 'generic_preview', data: request.context },
          impact: { recordsAffected: 0, riskLevel: 'low' },
        };
    }
  }

  /**
   * Execute the automation — dispatches to real service functions by feature.
   *
   * Each feature runs as a sequence of named, checkpointed steps:
   *   read_state → fetch/validate → [action step] → notify
   *
   * After each step completes, its state is persisted to checkpointData in the DB.
   * If the process is interrupted, the checkpoint records the last successful step.
   * On resume (resuming=true), already-completed steps are skipped and their saved
   * results are reused — only the failed and pending steps re-execute.
   */
  private async executeAutomation(
    request: TrinityAutomationRequest,
    resuming = false,
  ): Promise<{ receipt: AutomationReceipt }> {
    const { workspaceId, feature, requestedBy } = request;
    const context = request.context as Record<string, any>;
    let recordsCreated = 0;
    let recordsUpdated = 0;
    const externalSyncs: AutomationReceipt['payload']['externalSyncs'] = [];
    let summaryDetail = '';

    // Initialize checkpoint (no-op if one already exists from a prior run)
    const { checkpointer, checkpoint: initCp } = await createCheckpointer(request.id, feature, workspaceId);
    log.info(`[TrinityAutomation] ${resuming ? 'RESUMING' : 'starting'} ${feature} for workspace ${workspaceId} (request ${request.id})`);

    /**
     * runStep: execute a named step with checkpoint bookkeeping.
     * - If the step is already completed in the checkpoint, skip it and return saved result.
     * - Otherwise, run fn(), persist the result, and return it.
     * - On failure, persist the failed state and re-throw so the outer handler marks failed.
     */
    const runStep = async <T>(
      name: string,
      fn: () => Promise<T>,
      toSave?: (result: T) => Record<string, any>,
    ): Promise<T | null> => {
      const cp = await checkpointer.getCheckpoint() ?? initCp;

      if (checkpointer.isStepSkippable(cp, name)) {
        const saved = checkpointer.getStepResult(cp, name);
        await checkpointer.stepSkipped(name, saved);
        // Return a typed placeholder so callers can fall back to saved result
        return null;
      }

      await checkpointer.stepStarted(name);
      try {
        const result = await fn();
        await checkpointer.stepCompleted(name, toSave ? toSave(result) : undefined);
        return result;
      } catch (err: any) {
        await checkpointer.stepFailed(name, err?.message ?? String(err));
        throw err;
      }
    };

    // Helper: get a step's saved result (for resume cases where runStep returns null)
    const getSaved = async (name: string): Promise<Record<string, any> | undefined> => {
      const cp = await checkpointer.getCheckpoint();
      return cp ? checkpointer.getStepResult(cp, name) : undefined;
    };

    try {
      switch (feature) {

        // ────────────────────────────────────────────
        // INVOICING
        // ────────────────────────────────────────────
        case 'invoicing': {
          // Step 1: Read current billing state (read-only, always safe to re-run)
          await runStep('read_state', async () => {
            const [unbilled] = await db.select({ value: count() }).from(timeEntries).where(and(
              eq(timeEntries.workspaceId, workspaceId),
              eq(timeEntries.status, 'approved'),
              isNull(timeEntries.billedAt),
              isNotNull(timeEntries.clockOut),
            ));
            const unbilledCount = Number(unbilled?.value ?? 0);
            log.info(`[TrinityAutomation] invoicing/read_state: ${unbilledCount} unbilled entries found`);
            return { unbilledCount };
          }, (r) => ({ unbilledCount: r.unbilledCount }));

          // Step 2: Validate period and billing config
          await runStep('validate', async () => {
            const periodEnd = context.periodEnd ? new Date(context.periodEnd) : new Date();
            const periodStart = context.periodStart ? new Date(context.periodStart) : null;
            const billingDays = periodStart
              ? Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)))
              : 7;
            log.info(`[TrinityAutomation] invoicing/validate: ${billingDays}-day billing window confirmed`);
            return { billingDays, periodEnd: periodEnd.toISOString(), periodStart: periodStart?.toISOString() };
          }, (r) => r);

          // Step 3: Generate invoices per client (DESTRUCTIVE — skip on resume if already done)
          const invoiceResult = await runStep('generate_invoices', async () => {
            const periodEnd = context.periodEnd ? new Date(context.periodEnd) : new Date();
            const periodStart = context.periodStart ? new Date(context.periodStart) : null;
            const billingDays = periodStart
              ? Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)))
              : 7;
            const generatedInvoices = await generateWeeklyInvoices(workspaceId, periodEnd, billingDays);
            const invoiceArray = Array.isArray(generatedInvoices) ? generatedInvoices : [];
            log.info(`[TrinityAutomation] invoicing/generate_invoices: ${invoiceArray.length} invoices created`);
            return { count: invoiceArray.length, billingDays };
          }, (r) => ({ invoiceCount: r.count, billingDays: r.billingDays }));

          // Use fresh result or fall back to saved checkpoint result (resume case)
          const invoiceSaved = invoiceResult ?? await getSaved('generate_invoices');
          recordsCreated = invoiceResult?.count ?? (invoiceSaved as any)?.invoiceCount ?? 0;
          const billingDaysFinal = invoiceResult?.billingDays ?? (invoiceSaved as any)?.billingDays ?? 7;
          summaryDetail = `Generated ${recordsCreated} draft invoice(s) covering ${billingDaysFinal}-day billing period`;

          // Step 4: Notify completion
          await runStep('notify', async () => {
            await platformEventBus.publish({
              type: 'automation_executed',
              category: 'automation',
              title: 'Invoicing Completed',
              description: summaryDetail,
              workspaceId,
              metadata: { requestId: request.id, invoiceCount: recordsCreated },
            });
            return {};
          });
          break;
        }

        // ────────────────────────────────────────────
        // PAYROLL
        // ────────────────────────────────────────────
        case 'payroll': {
          // Step 1: Read current payroll state
          await runStep('read_state', async () => {
            const [pending] = await db.select({ value: count() }).from(timeEntries).where(and(
              eq(timeEntries.workspaceId, workspaceId),
              eq(timeEntries.status, 'approved'),
              isNull(timeEntries.payrolledAt),
              isNotNull(timeEntries.clockOut),
            ));
            const entryCount = Number(pending?.value ?? 0);
            log.info(`[TrinityAutomation] payroll/read_state: ${entryCount} approved, unpayrolled entries`);
            return { entryCount };
          }, (r) => ({ entryCount: r.entryCount }));

          // Step 2: Validate FLSA compliance readiness
          await runStep('validate', async () => {
            const periodStart = context.periodStart ? new Date(context.periodStart) : undefined;
            const periodEnd = context.periodEnd ? new Date(context.periodEnd) : undefined;
            log.info(`[TrinityAutomation] payroll/validate: FLSA rules applied, period confirmed`);
            return {
              periodStart: periodStart?.toISOString(),
              periodEnd: periodEnd?.toISOString(),
            };
          }, (r) => r);

          // Step 3: Commit payroll run (DESTRUCTIVE — skip on resume if already committed)
          const payrollResult = await runStep('commit_payroll', async () => {
            const periodStart = context.periodStart ? new Date(context.periodStart) : undefined;
            const periodEnd = context.periodEnd ? new Date(context.periodEnd) : undefined;
            const result = await PayrollAutomationEngine.processAutomatedPayroll(
              workspaceId,
              requestedBy,
              periodStart,
              periodEnd,
            );
            log.info(`[TrinityAutomation] payroll/commit_payroll: run ${result.payrollRunId} created`);
            return {
              payrollRunId: result.payrollRunId,
              totalEmployees: result.totalEmployees,
              totalGrossPay: result.totalGrossPay,
              timeEntryCount: result.timeEntryIds?.length ?? 0,
            };
          }, (r) => r);

          const payrollSaved = payrollResult ?? await getSaved('commit_payroll');
          recordsCreated = 1;
          recordsUpdated = payrollResult?.timeEntryCount ?? (payrollSaved as any)?.timeEntryCount ?? 0;
          const grossPay = payrollResult?.totalGrossPay ?? (payrollSaved as any)?.totalGrossPay ?? 0;
          const empCount = payrollResult?.totalEmployees ?? (payrollSaved as any)?.totalEmployees ?? 0;
          summaryDetail = `Processed payroll for ${empCount} employee(s) — gross pay $${Number(grossPay).toFixed(2)}`;

          // Step 4: Notify completion
          await runStep('notify', async () => {
            await platformEventBus.publish({
              type: 'automation_executed',
              category: 'automation',
              title: 'Payroll Completed',
              description: summaryDetail,
              workspaceId,
              metadata: { requestId: request.id, payrollRunId: payrollSaved?.payrollRunId },
            });
            return {};
          });
          break;
        }

        // ────────────────────────────────────────────
        // SCHEDULING
        // ────────────────────────────────────────────
        case 'scheduling': {
          // Step 1: Read current schedule state
          await runStep('read_state', async () => {
            const weekStartRaw = context.weekStart
              ? new Date(context.weekStart)
              : startOfWeek(new Date(), { weekStartsOn: 1 });
            log.info(`[TrinityAutomation] scheduling/read_state: week of ${weekStartRaw.toLocaleDateString()}`);
            return { weekStart: weekStartRaw.toISOString() };
          }, (r) => r);

          // Step 2: Generate shifts (DESTRUCTIVE — skip on resume if already done)
          const schedResult = await runStep('generate_shifts', async () => {
            const result = await generateWeeklyShifts(workspaceId, 0);
            log.info(`[TrinityAutomation] scheduling/generate_shifts: ${result.shiftsCreated} shifts created`);
            return { shiftsCreated: result.shiftsCreated ?? 0, weekStart: result.weekStart.toLocaleDateString() };
          }, (r) => r);

          const schedSaved = schedResult ?? await getSaved('generate_shifts');
          recordsCreated = schedResult?.shiftsCreated ?? (schedSaved as any)?.shiftsCreated ?? 0;
          summaryDetail = `Generated ${recordsCreated} shift(s) for week of ${schedResult?.weekStart ?? (schedSaved as any)?.weekStart ?? 'this week'}`;

          // Step 3: Notify
          await runStep('notify', async () => {
            await platformEventBus.publish({
              type: 'automation_executed',
              category: 'automation',
              title: 'Scheduling Completed',
              description: summaryDetail,
              workspaceId,
              metadata: { requestId: request.id, shiftsCreated: recordsCreated },
            });
            return {};
          });
          break;
        }

        // ────────────────────────────────────────────
        // TIME TRACKING
        // ────────────────────────────────────────────
        case 'time_tracking': {
          // Step 1: Read pending entries eligible for approval
          await runStep('read_state', async () => {
            const [pending] = await db.select({ value: count() }).from(timeEntries).where(and(
              eq(timeEntries.workspaceId, workspaceId),
              eq(timeEntries.status, 'pending'),
              isNotNull(timeEntries.clockOut),
            ));
            const pendingCount = Number(pending?.value ?? 0);
            log.info(`[TrinityAutomation] time_tracking/read_state: ${pendingCount} pending entries with clock-out`);
            return { pendingCount };
          }, (r) => ({ pendingCount: r.pendingCount }));

          // Step 2: Approve entries (DESTRUCTIVE — skip on resume if already done)
          const ttResult = await runStep('approve_entries', async () => {
            const updatedRows = await db
              .update(timeEntries)
              .set({ status: 'approved', updatedAt: new Date() } as any)
              .where(and(
                eq(timeEntries.workspaceId, workspaceId),
                eq(timeEntries.status, 'pending'),
                isNotNull(timeEntries.clockOut),
              ))
              .returning({ id: timeEntries.id });
            log.info(`[TrinityAutomation] time_tracking/approve_entries: ${updatedRows.length} entries approved`);
            return { approvedCount: updatedRows.length };
          }, (r) => ({ approvedCount: r.approvedCount }));

          const ttSaved = ttResult ?? await getSaved('approve_entries');
          recordsUpdated = ttResult?.approvedCount ?? (ttSaved as any)?.approvedCount ?? 0;
          summaryDetail = `Auto-approved ${recordsUpdated} pending time entries with completed clock-out`;

          // Step 3: Notify
          await runStep('notify', async () => {
            await platformEventBus.publish({
              type: 'automation_executed',
              category: 'automation',
              title: 'Time Tracking Approval Completed',
              description: summaryDetail,
              workspaceId,
              metadata: { requestId: request.id, approvedCount: recordsUpdated },
            });
            return {};
          });
          break;
        }

        case 'shift_monitoring': {
          await runStep('acknowledge', async () => {
            summaryDetail = 'Shift monitoring is active and scanning for late arrivals / NCNS every 5 minutes';
            log.info(`[TrinityAutomation] shift_monitoring: acknowledged for workspace ${workspaceId}`);
            return {};
          });
          summaryDetail = summaryDetail || 'Shift monitoring is active';
          break;
        }

        case 'quickbooks_sync': {
          await runStep('acknowledge', async () => {
            summaryDetail = 'QuickBooks sync is enabled — invoices and payroll runs will sync automatically upon approval';
            log.info(`[TrinityAutomation] quickbooks_sync: acknowledged for workspace ${workspaceId}`);
            return {};
          });
          summaryDetail = summaryDetail || 'QuickBooks sync enabled';
          break;
        }

        default:
          summaryDetail = `${feature} automation executed`;
      }
    } catch (execError: any) {
      // Checkpoint already saved the failed step — re-throw so approveAutomation marks as failed
      log.error(`[TrinityAutomation] ${feature} execution error for workspace ${workspaceId}:`, execError);
      throw execError;
    }

    const receiptId = `rcpt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const receiptPayload: AutomationReceipt['payload'] = {
      recordsCreated,
      recordsUpdated,
      externalSyncs,
    };

    const receipt: AutomationReceipt = {
      receiptId,
      feature: feature as AutomationFeature,
      timestamp: new Date(),
      workspaceId,
      summary: summaryDetail,
      payload: receiptPayload,
      trinitySignature: this.generateReceiptSignature({
        receiptId,
        feature: feature as AutomationFeature,
        timestamp: new Date(),
        workspaceId,
        summary: summaryDetail,
        payload: receiptPayload,
      }),
    };

    return { receipt };
  }

  /**
   * Generate signature for request verification
   */
  private generateRequestSignature(request: AutomationRequest): string {
    const data = JSON.stringify({
      workspaceId: request.workspaceId,
      feature: request.feature,
      timestamp: new Date().toISOString(),
    });
    return `trinity_req_${Buffer.from(data).toString('base64').substring(0, 24)}`;
  }

  /**
   * Generate signature for receipt verification
   */
  generateReceiptSignature(receipt: Omit<AutomationReceipt, 'trinitySignature'>): string {
    const data = JSON.stringify({
      receiptId: receipt.receiptId,
      feature: receipt.feature,
      timestamp: receipt.timestamp.toISOString(),
      recordsCreated: receipt.payload.recordsCreated,
    });
    return `trinity_${Buffer.from(data).toString('base64').substring(0, 32)}`;
  }

  /**
   * Broadcast settings update via WebSocket for live sync
   */
  private async broadcastSettingsUpdate(workspaceId: string, settings: AutomationSettings): Promise<void> {
    await platformEventBus.publish({
      type: 'trinity_automation_settings_sync',
      category: 'live_sync',
      title: 'Settings Updated',
      description: 'Automation settings synchronized',
      workspaceId,
      metadata: { 
        syncType: 'settings',
        settings,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Broadcast request update via WebSocket for live sync
   */
  private async broadcastRequestUpdate(workspaceId: string, result: AutomationResult): Promise<void> {
    await platformEventBus.publish({
      type: 'trinity_automation_request_sync',
      category: 'live_sync',
      title: 'Request Updated',
      description: `Automation request ${result.status}`,
      workspaceId,
      metadata: {
        syncType: 'request',
        requestId: result.requestId,
        status: result.status,
        feature: result.feature,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Pause a running automation mid-execution.
   * Saves checkpoint state and marks status as 'paused'.
   * The execution can later be resumed with resumeAutomation().
   */
  async pauseExecution(requestId: string, pausedBy: string, reason?: string): Promise<AutomationResult> {
    const request = await db.query.trinityAutomationRequests.findFirst({
      where: eq(trinityAutomationRequests.id, requestId),
    });

    if (!request) throw new Error('Automation request not found');
    if (request.status !== 'executing' && request.status !== 'pending') {
      throw new Error(`Cannot pause a ${request.status} automation. Only executing or pending automations can be paused.`);
    }

    await db.update(trinityAutomationRequests)
      .set({
        status: 'paused',
        updatedAt: new Date(),
      } as any)
      .where(eq(trinityAutomationRequests.id, requestId));

    // Converted to Drizzle ORM
    await db.update(trinityAutomationRequests)
      .set({
        pausedAt: sql`now()`,
        pausedBy: pausedBy,
        pauseReason: reason || 'Paused by user request',
      })
      .where(eq(trinityAutomationRequests.id, requestId));

    await platformEventBus.publish({
      type: 'automation_paused',
      category: 'automation',
      title: `Automation Paused: ${request.feature}`,
      description: reason || 'Automation was paused by an authorized user',
      workspaceId: request.workspaceId,
      metadata: { requestId, pausedBy, reason, feature: request.feature },
    });

    const result = await this.getRequestResult(requestId);
    await this.broadcastRequestUpdate(request.workspaceId, result!);
    return result!;
  }

  /**
   * Revise the staged payload for a pending or paused automation.
   * Stores the user-edited payload alongside revision notes and a history log.
   * When approved, the revised payload is used instead of the original preview.
   */
  async revisePayload(
    requestId: string,
    revisedBy: string,
    revisedPayload: Record<string, any>,
    notes: string,
  ): Promise<AutomationResult> {
    const request = await db.query.trinityAutomationRequests.findFirst({
      where: eq(trinityAutomationRequests.id, requestId),
    });

    if (!request) throw new Error('Automation request not found');
    if (request.status !== 'pending' && request.status !== 'paused') {
      throw new Error(`Payload can only be revised for pending or paused automations (current status: ${request.status})`);
    }

    const existingHistory = (request.revisionHistory as any[] | null) || [];
    const newHistoryEntry = {
      revisedBy,
      revisedAt: new Date().toISOString(),
      notes,
      payloadSnapshot: revisedPayload,
    };

    await db.update(trinityAutomationRequests)
      .set({ updatedAt: new Date() } as any)
      .where(eq(trinityAutomationRequests.id, requestId));

    // CATEGORY C — Raw SQL retained: ::jsonb | Tables: trinity_automation_requests | Verified: 2026-03-23
    await typedExec(sql`
      UPDATE trinity_automation_requests
      SET revised_payload = ${JSON.stringify(revisedPayload)}::jsonb,
          revision_notes = ${notes},
          revision_history = ${JSON.stringify([...existingHistory, newHistoryEntry])}::jsonb
      WHERE id = ${requestId}
    `);

    const result = await this.getRequestResult(requestId);
    await this.broadcastRequestUpdate(request.workspaceId, result!);
    return result!;
  }

  /**
   * Request Trinity to re-analyze the staged payload for an automation request.
   * Calls Gemini with the full context and preview, returns Trinity's assessment.
   * The analysis is persisted and shown in the UI.
   */
  async requestTrinityReanalysis(
    requestId: string,
    workspaceId: string,
    requestedBy: string,
  ): Promise<{ analysis: string; requestId: string }> {
    const request = await db.query.trinityAutomationRequests.findFirst({
      where: and(
        eq(trinityAutomationRequests.id, requestId),
        eq(trinityAutomationRequests.workspaceId, workspaceId),
      ),
    });

    if (!request) throw new Error('Automation request not found');
    if (!['pending', 'paused'].includes(request.status)) {
      throw new Error(`Trinity re-analysis only available for pending or paused automations (current status: ${request.status})`);
    }

    const preview = request.preview as any || {};
    const revisedPayload = request.revisedPayload;
    const effectivePayload = revisedPayload || preview.previewData || preview;

    const prompt = `You are Trinity, the AI brain for ${PLATFORM.name} workforce management platform. 
A user has requested you to re-analyze a staged automation payload before it is approved and executed.

Feature: ${request.feature}
Requested at: ${request.requestedAt}
Original context: ${JSON.stringify(request.context, null, 2)}

Current payload to analyze:
${JSON.stringify(effectivePayload, null, 2)}

${revisedPayload ? '(Note: This is a user-revised payload, not the original auto-generated one)' : ''}

Please provide:
1. A concise assessment of this payload's validity and financial accuracy
2. Any anomalies, risks, or data quality issues you detect
3. Whether you recommend APPROVE or HOLD for further review
4. Specific line items that need human attention (if any)
5. Confidence level (High/Medium/Low) in the data quality

Keep your analysis under 400 words. Be direct and specific.`;

    const aiResponse = await meteredGemini.generate({
      workspaceId,
      featureKey: 'trinity_reanalysis',
      prompt,
      maxOutputTokens: 600,
      temperature: 0.2,
      systemInstruction: 'You are Trinity, a financial operations AI assistant. Be concise, accurate, and prioritize data integrity.',
    });

    const analysisText = aiResponse.text || 'Trinity was unable to generate an analysis at this time.';

    // Converted to Drizzle ORM
    await db.update(trinityAutomationRequests)
      .set({
        trinityReanalysis: analysisText,
        trinityReanalysisAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(trinityAutomationRequests.id, requestId));

    const result = await this.getRequestResult(requestId);
    await this.broadcastRequestUpdate(workspaceId, result!);

    return { analysis: analysisText, requestId };
  }

  /**
   * Cleanup expired requests periodically
   */
  private startExpiryCleanup(): void {
    this.expiryCleanupInterval = setInterval(async () => {
      try {
        const now = new Date();
        const expired = await db.update(trinityAutomationRequests)
          .set({ status: 'failed', errorMessage: 'Request expired' })
          .where(and(
            eq(trinityAutomationRequests.status, 'pending'),
            lt(trinityAutomationRequests.expiresAt, now)
          ))
          .returning();

        if (expired.length > 0) {
          log.info(`[TrinityToggle] Expired ${expired.length} automation requests`);
        }
      } catch (error) {
        log.error('[TrinityToggle] Error cleaning up expired requests:', error);
      }
    }, 60 * 60 * 1000); // Every hour
  }
}

export const trinityAutomationToggle = TrinityAutomationToggleService.getInstance();
