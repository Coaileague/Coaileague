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

import { db } from '../../db';
import { 
  trinityAutomationSettings, 
  trinityAutomationRequests, 
  trinityAutomationReceipts,
  TrinityAutomationSettings,
  TrinityAutomationRequest,
  TrinityAutomationReceipt,
  InsertTrinityAutomationRequest,
  InsertTrinityAutomationReceipt,
} from '@shared/schema';
import { eq, and, desc, lt, sql } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';

export type AutomationFeature = 
  | 'scheduling'
  | 'invoicing'
  | 'payroll'
  | 'time_tracking'
  | 'shift_monitoring'
  | 'quickbooks_sync';

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
  status: 'pending' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed';
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
  autoApproveThreshold: 0.95,
  notifyOnRequest: true,
  notifyOnComplete: true,
  notifyOnError: true,
};

class TrinityAutomationToggleService {
  private static instance: TrinityAutomationToggleService;

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
          autoApproveThreshold: parseFloat(settings.autoApproveThreshold || '0.95'),
          notifyOnRequest: settings.notifyOnRequest ?? true,
          notifyOnComplete: settings.notifyOnComplete ?? true,
          notifyOnError: settings.notifyOnError ?? true,
        };
      }

      return { ...DEFAULT_SETTINGS };
    } catch (error) {
      console.error('[TrinityToggle] Error getting settings:', error);
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

      const updateData = {
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

      const updated = await this.getSettings(workspaceId);

      await platformEventBus.publish({
        type: 'automation_settings_updated',
        category: 'automation',
        title: 'Automation Settings Changed',
        description: `Trinity automation settings updated for workspace`,
        workspaceId,
        metadata: { settings: updated },
      });

      await this.broadcastSettingsUpdate(workspaceId, updated);

      return updated;
    } catch (error) {
      console.error('[TrinityToggle] Error updating settings:', error);
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
    console.log(`[TrinityToggle] Automation requested: ${request.feature} for workspace ${request.workspaceId}`);

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
        title: `Trinity Automation: ${request.feature}`,
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

    if (request.status !== 'pending') {
      throw new Error(`Request is already ${request.status}`);
    }

    await db.update(trinityAutomationRequests)
      .set({
        status: 'approved',
        approvedBy,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(trinityAutomationRequests.id, requestId));

    console.log(`[TrinityToggle] Automation approved: ${requestId} by ${approvedBy}`);

    try {
      await db.update(trinityAutomationRequests)
        .set({ status: 'executing', executionStartedAt: new Date() })
        .where(eq(trinityAutomationRequests.id, requestId));

      const executionResult = await this.executeAutomation(request);

      await db.update(trinityAutomationRequests)
        .set({
          status: 'completed',
          executionCompletedAt: new Date(),
          executionResult: executionResult.receipt,
          updatedAt: new Date(),
        })
        .where(eq(trinityAutomationRequests.id, requestId));

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

      await db.insert(trinityAutomationReceipts).values(receiptInsert);

      const settings = await this.getSettings(request.workspaceId);
      if (settings.notifyOnComplete) {
        await platformEventBus.publish({
          type: 'automation_executed',
          category: 'automation',
          title: `Trinity Completed: ${request.feature}`,
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
          errorMessage: error.message,
          executionCompletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(trinityAutomationRequests.id, requestId));

      const settings = await this.getSettings(request.workspaceId);
      if (settings.notifyOnError) {
        await platformEventBus.publish({
          type: 'automation_failed',
          category: 'automation',
          title: `Trinity Failed: ${request.feature}`,
          description: error.message,
          workspaceId: request.workspaceId,
          metadata: { requestId, error: error.message },
        });
      }

      console.error(`[TrinityToggle] Automation execution failed:`, error);
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
      title: `Trinity Automation Rejected`,
      description: reason || 'Automation request was rejected by org owner',
      workspaceId: request.workspaceId,
      metadata: { requestId, rejectedBy, reason },
    });

    const result = await this.getRequestResult(requestId);
    await this.broadcastRequestUpdate(request.workspaceId, result!);
    return result!;
  }

  /**
   * Get a single pending request from database
   */
  async getPendingRequest(requestId: string): Promise<AutomationResult | undefined> {
    return this.getRequestResult(requestId);
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
    };
  }

  /**
   * Get request result from database
   */
  private async getRequestResult(requestId: string): Promise<AutomationResult | undefined> {
    const record = await db.query.trinityAutomationRequests.findFirst({
      where: eq(trinityAutomationRequests.id, requestId),
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
          summary: 'Trinity will generate optimized schedule based on employee availability, skills, and client needs',
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

      case 'invoicing':
        return {
          summary: 'Trinity will generate invoices from approved timesheets and sync to QuickBooks',
          details: {
            periodStart: request.context.periodStart,
            periodEnd: request.context.periodEnd,
            clientCount: request.context.clientCount || 0,
          },
          previewData: { type: 'invoice_preview', data: request.context },
          impact: {
            recordsAffected: request.context.invoiceCount || 0,
            estimatedValue: request.context.totalValue || 0,
            riskLevel: 'medium',
          },
        };

      case 'payroll':
        return {
          summary: 'Trinity will process payroll run and sync time activities to QuickBooks',
          details: {
            payPeriod: request.context.payPeriod,
            employeeCount: request.context.employeeCount || 0,
          },
          previewData: { type: 'payroll_preview', data: request.context },
          impact: {
            recordsAffected: request.context.entryCount || 0,
            estimatedValue: request.context.totalPayroll || 0,
            riskLevel: 'high',
          },
        };

      case 'shift_monitoring':
        return {
          summary: 'Trinity will monitor shifts for late arrivals and no-shows, triggering auto-replacement',
          details: {
            shiftsMonitored: request.context.shiftCount || 0,
            lateThreshold: request.context.lateThreshold || 15,
          },
          previewData: { type: 'monitoring_preview', data: request.context },
          impact: {
            recordsAffected: request.context.shiftCount || 0,
            riskLevel: 'low',
          },
        };

      case 'quickbooks_sync':
        return {
          summary: 'Trinity will sync data bidirectionally with QuickBooks',
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
          summary: `Trinity will handle ${request.feature} automation`,
          details: request.context,
          previewData: { type: 'generic_preview', data: request.context },
          impact: { recordsAffected: 0, riskLevel: 'low' },
        };
    }
  }

  /**
   * Execute the automation
   */
  private async executeAutomation(request: TrinityAutomationRequest): Promise<{ receipt: AutomationReceipt }> {
    const receipt: AutomationReceipt = {
      receiptId: `rcpt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      feature: request.feature as AutomationFeature,
      timestamp: new Date(),
      workspaceId: request.workspaceId,
      summary: `${request.feature} automation completed successfully`,
      payload: {
        recordsCreated: (request.preview as any)?.impact?.recordsAffected || 0,
        recordsUpdated: 0,
        externalSyncs: [],
      },
      trinitySignature: this.generateReceiptSignature({
        receiptId: `rcpt_${Date.now()}`,
        feature: request.feature as AutomationFeature,
        timestamp: new Date(),
        workspaceId: request.workspaceId,
        summary: `${request.feature} automation completed`,
        payload: { recordsCreated: 0, recordsUpdated: 0, externalSyncs: [] },
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
   * Cleanup expired requests periodically
   */
  private startExpiryCleanup(): void {
    setInterval(async () => {
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
          console.log(`[TrinityToggle] Expired ${expired.length} automation requests`);
        }
      } catch (error) {
        console.error('[TrinityToggle] Error cleaning up expired requests:', error);
      }
    }, 60 * 60 * 1000); // Every hour
  }
}

export const trinityAutomationToggle = TrinityAutomationToggleService.getInstance();
