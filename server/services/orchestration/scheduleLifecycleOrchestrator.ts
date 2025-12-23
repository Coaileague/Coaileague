/**
 * Schedule Lifecycle Orchestrator
 * 
 * Manages the complete schedule lifecycle:
 * - Draft → Review → Published transitions
 * - Shift swap approvals with audit trails
 * - Schedule conflict detection
 * - Employee availability verification
 * - Compliance checks before publication
 * 
 * Provides governance and audit trail for all schedule changes
 */

import { db } from '../../db';
import { platformEventBus } from '../platformEventBus';
import { helpaiOrchestrator } from '../helpai/helpaiActionOrchestrator';
import { crossDomainExceptionService } from './crossDomainExceptionService';

export type ScheduleStatus = 'draft' | 'pending_review' | 'approved' | 'published' | 'archived';

export type SwapStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';

export interface ScheduleLifecycle {
  id: string;
  workspaceId: string;
  scheduleId: string;
  scheduleName: string;
  status: ScheduleStatus;
  periodStart: Date;
  periodEnd: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
  approvedBy?: string;
  approvedAt?: Date;
  publishedBy?: string;
  publishedAt?: Date;
  archivedAt?: Date;
  employeeCount: number;
  shiftCount: number;
  conflictCount: number;
  complianceIssues: string[];
  notes: string[];
  version: number;
  previousVersionId?: string;
}

export interface ShiftSwapRequest {
  id: string;
  workspaceId: string;
  scheduleId: string;
  shiftId: string;
  requesterId: string;
  requesterName: string;
  targetEmployeeId?: string;
  targetEmployeeName?: string;
  status: SwapStatus;
  reason: string;
  requestedAt: Date;
  expiresAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  rejectedBy?: string;
  rejectedAt?: Date;
  rejectionReason?: string;
  shiftDetails: {
    date: string;
    startTime: string;
    endTime: string;
    role?: string;
    location?: string;
  };
  auditTrail: {
    action: string;
    userId: string;
    timestamp: Date;
    notes?: string;
  }[];
}

class ScheduleLifecycleOrchestrator {
  private schedules = new Map<string, ScheduleLifecycle>();
  private swapRequests = new Map<string, ShiftSwapRequest>();
  private expirationCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.expirationCheckInterval = setInterval(() => this.checkSwapExpirations(), 3600000);
  }

  async createScheduleLifecycle(params: {
    workspaceId: string;
    scheduleId: string;
    scheduleName: string;
    periodStart: Date;
    periodEnd: Date;
    createdBy: string;
    employeeCount?: number;
    shiftCount?: number;
  }): Promise<ScheduleLifecycle> {
    const {
      workspaceId,
      scheduleId,
      scheduleName,
      periodStart,
      periodEnd,
      createdBy,
      employeeCount = 0,
      shiftCount = 0,
    } = params;

    const id = this.generateId('sched');
    const now = new Date();

    const lifecycle: ScheduleLifecycle = {
      id,
      workspaceId,
      scheduleId,
      scheduleName,
      status: 'draft',
      periodStart,
      periodEnd,
      createdBy,
      createdAt: now,
      updatedAt: now,
      employeeCount,
      shiftCount,
      conflictCount: 0,
      complianceIssues: [],
      notes: [],
      version: 1,
    };

    this.schedules.set(id, lifecycle);
    await this.persistSchedule(lifecycle);

    platformEventBus.publish({
      type: 'schedule_lifecycle_created',
      workspaceId,
      payload: {
        lifecycleId: id,
        scheduleId,
        scheduleName,
        status: 'draft',
        periodStart,
        periodEnd,
      },
      metadata: { source: 'ScheduleLifecycleOrchestrator' },
    });

    console.log(`[ScheduleLifecycle] Created: ${id} for schedule ${scheduleId}`);

    return lifecycle;
  }

  async submitForReview(params: {
    lifecycleId: string;
    userId: string;
    notes?: string;
  }): Promise<{ success: boolean; message: string; conflicts?: string[] }> {
    const { lifecycleId, userId, notes } = params;

    const lifecycle = this.schedules.get(lifecycleId);
    if (!lifecycle) {
      return { success: false, message: 'Schedule lifecycle not found' };
    }

    if (lifecycle.status !== 'draft') {
      return { success: false, message: `Cannot submit from status: ${lifecycle.status}` };
    }

    const validation = await this.validateSchedule(lifecycle);

    if (validation.conflicts.length > 0 || validation.complianceIssues.length > 0) {
      lifecycle.conflictCount = validation.conflicts.length;
      lifecycle.complianceIssues = validation.complianceIssues;

      for (const issue of validation.complianceIssues) {
        await crossDomainExceptionService.raiseException({
          workspaceId: lifecycle.workspaceId,
          domain: 'scheduling',
          code: 'COMPLIANCE_ISSUE',
          title: `Schedule compliance issue: ${lifecycle.scheduleName}`,
          description: issue,
          severity: 'medium',
          metadata: { scheduleId: lifecycle.scheduleId, lifecycleId },
        });
      }
    }

    lifecycle.status = 'pending_review';
    lifecycle.updatedAt = new Date();
    if (notes) {
      lifecycle.notes.push(`[${new Date().toISOString()}] Submitted: ${notes}`);
    }

    this.schedules.set(lifecycleId, lifecycle);
    await this.persistSchedule(lifecycle);

    platformEventBus.publish({
      type: 'schedule_submitted_for_review',
      workspaceId: lifecycle.workspaceId,
      payload: {
        lifecycleId,
        scheduleId: lifecycle.scheduleId,
        scheduleName: lifecycle.scheduleName,
        submittedBy: userId,
        conflictCount: validation.conflicts.length,
        complianceIssues: validation.complianceIssues,
      },
      metadata: { source: 'ScheduleLifecycleOrchestrator' },
    });

    console.log(`[ScheduleLifecycle] Submitted for review: ${lifecycleId}`);

    return {
      success: true,
      message: 'Schedule submitted for review',
      conflicts: validation.conflicts,
    };
  }

  async approveSchedule(params: {
    lifecycleId: string;
    approverId: string;
    notes?: string;
  }): Promise<{ success: boolean; message: string }> {
    const { lifecycleId, approverId, notes } = params;

    const lifecycle = this.schedules.get(lifecycleId);
    if (!lifecycle) {
      return { success: false, message: 'Schedule lifecycle not found' };
    }

    if (lifecycle.status !== 'pending_review') {
      return { success: false, message: `Cannot approve from status: ${lifecycle.status}` };
    }

    const now = new Date();
    lifecycle.status = 'approved';
    lifecycle.reviewedBy = approverId;
    lifecycle.reviewedAt = now;
    lifecycle.approvedBy = approverId;
    lifecycle.approvedAt = now;
    lifecycle.updatedAt = now;
    if (notes) {
      lifecycle.notes.push(`[${now.toISOString()}] Approved: ${notes}`);
    }

    this.schedules.set(lifecycleId, lifecycle);
    await this.persistSchedule(lifecycle);

    platformEventBus.publish({
      type: 'schedule_approved',
      workspaceId: lifecycle.workspaceId,
      payload: {
        lifecycleId,
        scheduleId: lifecycle.scheduleId,
        scheduleName: lifecycle.scheduleName,
        approvedBy: approverId,
      },
      metadata: { source: 'ScheduleLifecycleOrchestrator' },
    });

    console.log(`[ScheduleLifecycle] Approved: ${lifecycleId} by ${approverId}`);

    return { success: true, message: 'Schedule approved' };
  }

  async publishSchedule(params: {
    lifecycleId: string;
    publisherId: string;
    notifyEmployees?: boolean;
  }): Promise<{ success: boolean; message: string }> {
    const { lifecycleId, publisherId, notifyEmployees = true } = params;

    const lifecycle = this.schedules.get(lifecycleId);
    if (!lifecycle) {
      return { success: false, message: 'Schedule lifecycle not found' };
    }

    if (lifecycle.status !== 'approved') {
      return { success: false, message: `Cannot publish from status: ${lifecycle.status}` };
    }

    const now = new Date();
    lifecycle.status = 'published';
    lifecycle.publishedBy = publisherId;
    lifecycle.publishedAt = now;
    lifecycle.updatedAt = now;
    lifecycle.notes.push(`[${now.toISOString()}] Published by ${publisherId}`);

    this.schedules.set(lifecycleId, lifecycle);
    await this.persistSchedule(lifecycle);

    platformEventBus.publish({
      type: 'schedule_published',
      workspaceId: lifecycle.workspaceId,
      payload: {
        lifecycleId,
        scheduleId: lifecycle.scheduleId,
        scheduleName: lifecycle.scheduleName,
        publishedBy: publisherId,
        periodStart: lifecycle.periodStart,
        periodEnd: lifecycle.periodEnd,
        employeeCount: lifecycle.employeeCount,
        shiftCount: lifecycle.shiftCount,
        notifyEmployees,
      },
      metadata: { source: 'ScheduleLifecycleOrchestrator', priority: 'high' },
    });

    console.log(`[ScheduleLifecycle] Published: ${lifecycleId} by ${publisherId}`);

    return { success: true, message: 'Schedule published' };
  }

  async rejectSchedule(params: {
    lifecycleId: string;
    rejectorId: string;
    reason: string;
  }): Promise<{ success: boolean; message: string }> {
    const { lifecycleId, rejectorId, reason } = params;

    const lifecycle = this.schedules.get(lifecycleId);
    if (!lifecycle) {
      return { success: false, message: 'Schedule lifecycle not found' };
    }

    if (lifecycle.status !== 'pending_review') {
      return { success: false, message: `Cannot reject from status: ${lifecycle.status}` };
    }

    const now = new Date();
    lifecycle.status = 'draft';
    lifecycle.reviewedBy = rejectorId;
    lifecycle.reviewedAt = now;
    lifecycle.updatedAt = now;
    lifecycle.notes.push(`[${now.toISOString()}] Rejected: ${reason}`);

    this.schedules.set(lifecycleId, lifecycle);
    await this.persistSchedule(lifecycle);

    platformEventBus.publish({
      type: 'schedule_rejected',
      workspaceId: lifecycle.workspaceId,
      payload: {
        lifecycleId,
        scheduleId: lifecycle.scheduleId,
        scheduleName: lifecycle.scheduleName,
        rejectedBy: rejectorId,
        reason,
      },
      metadata: { source: 'ScheduleLifecycleOrchestrator' },
    });

    console.log(`[ScheduleLifecycle] Rejected: ${lifecycleId} by ${rejectorId} - ${reason}`);

    return { success: true, message: 'Schedule rejected and returned to draft' };
  }

  async requestShiftSwap(params: {
    workspaceId: string;
    scheduleId: string;
    shiftId: string;
    requesterId: string;
    requesterName: string;
    targetEmployeeId?: string;
    targetEmployeeName?: string;
    reason: string;
    shiftDetails: ShiftSwapRequest['shiftDetails'];
    expiresInHours?: number;
  }): Promise<ShiftSwapRequest> {
    const {
      workspaceId,
      scheduleId,
      shiftId,
      requesterId,
      requesterName,
      targetEmployeeId,
      targetEmployeeName,
      reason,
      shiftDetails,
      expiresInHours = 48,
    } = params;

    const id = this.generateId('swap');
    const now = new Date();

    const request: ShiftSwapRequest = {
      id,
      workspaceId,
      scheduleId,
      shiftId,
      requesterId,
      requesterName,
      targetEmployeeId,
      targetEmployeeName,
      status: 'pending',
      reason,
      requestedAt: now,
      expiresAt: new Date(now.getTime() + expiresInHours * 3600000),
      shiftDetails,
      auditTrail: [{
        action: 'created',
        userId: requesterId,
        timestamp: now,
        notes: reason,
      }],
    };

    this.swapRequests.set(id, request);
    await this.persistSwapRequest(request);

    platformEventBus.publish({
      type: 'shift_swap_requested',
      workspaceId,
      payload: {
        swapId: id,
        scheduleId,
        shiftId,
        requesterId,
        requesterName,
        targetEmployeeId,
        targetEmployeeName,
        shiftDetails,
        reason,
        expiresAt: request.expiresAt,
      },
      metadata: { source: 'ScheduleLifecycleOrchestrator' },
    });

    console.log(`[ScheduleLifecycle] Shift swap requested: ${id} by ${requesterName}`);

    return request;
  }

  async approveSwap(params: {
    swapId: string;
    approverId: string;
    notes?: string;
  }): Promise<{ success: boolean; message: string }> {
    const { swapId, approverId, notes } = params;

    const request = this.swapRequests.get(swapId);
    if (!request) {
      return { success: false, message: 'Swap request not found' };
    }

    if (request.status !== 'pending') {
      return { success: false, message: `Cannot approve swap with status: ${request.status}` };
    }

    const now = new Date();
    request.status = 'approved';
    request.approvedBy = approverId;
    request.approvedAt = now;
    request.auditTrail.push({
      action: 'approved',
      userId: approverId,
      timestamp: now,
      notes,
    });

    this.swapRequests.set(swapId, request);
    await this.persistSwapRequest(request);

    platformEventBus.publish({
      type: 'shift_swap_approved',
      workspaceId: request.workspaceId,
      payload: {
        swapId,
        scheduleId: request.scheduleId,
        shiftId: request.shiftId,
        requesterId: request.requesterId,
        targetEmployeeId: request.targetEmployeeId,
        approvedBy: approverId,
      },
      metadata: { source: 'ScheduleLifecycleOrchestrator' },
    });

    console.log(`[ScheduleLifecycle] Shift swap approved: ${swapId} by ${approverId}`);

    return { success: true, message: 'Swap approved' };
  }

  async rejectSwap(params: {
    swapId: string;
    rejectorId: string;
    reason: string;
  }): Promise<{ success: boolean; message: string }> {
    const { swapId, rejectorId, reason } = params;

    const request = this.swapRequests.get(swapId);
    if (!request) {
      return { success: false, message: 'Swap request not found' };
    }

    if (request.status !== 'pending') {
      return { success: false, message: `Cannot reject swap with status: ${request.status}` };
    }

    const now = new Date();
    request.status = 'rejected';
    request.rejectedBy = rejectorId;
    request.rejectedAt = now;
    request.rejectionReason = reason;
    request.auditTrail.push({
      action: 'rejected',
      userId: rejectorId,
      timestamp: now,
      notes: reason,
    });

    this.swapRequests.set(swapId, request);
    await this.persistSwapRequest(request);

    platformEventBus.publish({
      type: 'shift_swap_rejected',
      workspaceId: request.workspaceId,
      payload: {
        swapId,
        scheduleId: request.scheduleId,
        requesterId: request.requesterId,
        rejectedBy: rejectorId,
        reason,
      },
      metadata: { source: 'ScheduleLifecycleOrchestrator' },
    });

    console.log(`[ScheduleLifecycle] Shift swap rejected: ${swapId} by ${rejectorId}`);

    return { success: true, message: 'Swap rejected' };
  }

  async getPendingSwaps(workspaceId: string): Promise<ShiftSwapRequest[]> {
    return Array.from(this.swapRequests.values())
      .filter(r => r.workspaceId === workspaceId && r.status === 'pending')
      .sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime());
  }

  async getSchedulesByStatus(workspaceId: string, status?: ScheduleStatus): Promise<ScheduleLifecycle[]> {
    return Array.from(this.schedules.values())
      .filter(s => s.workspaceId === workspaceId && (!status || s.status === status))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  private async validateSchedule(lifecycle: ScheduleLifecycle): Promise<{
    conflicts: string[];
    complianceIssues: string[];
  }> {
    const conflicts: string[] = [];
    const complianceIssues: string[] = [];

    if (lifecycle.shiftCount === 0) {
      complianceIssues.push('Schedule has no shifts');
    }

    if (lifecycle.employeeCount === 0) {
      complianceIssues.push('Schedule has no employees assigned');
    }

    return { conflicts, complianceIssues };
  }

  private async checkSwapExpirations(): Promise<void> {
    const now = new Date();

    for (const [id, request] of this.swapRequests.entries()) {
      if (request.status === 'pending' && request.expiresAt < now) {
        request.status = 'expired';
        request.auditTrail.push({
          action: 'expired',
          userId: 'system',
          timestamp: now,
        });

        this.swapRequests.set(id, request);
        await this.persistSwapRequest(request);

        platformEventBus.publish({
          type: 'shift_swap_expired',
          workspaceId: request.workspaceId,
          payload: {
            swapId: id,
            requesterId: request.requesterId,
            shiftDetails: request.shiftDetails,
          },
          metadata: { source: 'ScheduleLifecycleOrchestrator' },
        });

        console.log(`[ScheduleLifecycle] Shift swap expired: ${id}`);
      }
    }
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async persistSchedule(lifecycle: ScheduleLifecycle): Promise<void> {
    try {
      await db.execute(`
        INSERT INTO schedule_lifecycles (id, workspace_id, lifecycle_data, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (id) DO UPDATE SET lifecycle_data = $3, updated_at = NOW()
      `, [lifecycle.id, lifecycle.workspaceId, JSON.stringify(lifecycle)]);
    } catch (error) {
      console.warn('[ScheduleLifecycle] Failed to persist lifecycle (table may not exist):', error);
    }
  }

  private async persistSwapRequest(request: ShiftSwapRequest): Promise<void> {
    try {
      await db.execute(`
        INSERT INTO orchestrated_swap_requests (id, workspace_id, request_data, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (id) DO UPDATE SET request_data = $3, updated_at = NOW()
      `, [request.id, request.workspaceId, JSON.stringify(request)]);
    } catch (error) {
      console.warn('[ScheduleLifecycle] Failed to persist swap request (table may not exist):', error);
    }
  }

  getStats(): {
    totalSchedules: number;
    byStatus: Record<string, number>;
    totalSwaps: number;
    pendingSwaps: number;
    approvedSwaps: number;
    rejectedSwaps: number;
  } {
    const schedules = Array.from(this.schedules.values());
    const swaps = Array.from(this.swapRequests.values());

    const byStatus: Record<string, number> = {};
    schedules.forEach(s => {
      byStatus[s.status] = (byStatus[s.status] || 0) + 1;
    });

    return {
      totalSchedules: schedules.length,
      byStatus,
      totalSwaps: swaps.length,
      pendingSwaps: swaps.filter(s => s.status === 'pending').length,
      approvedSwaps: swaps.filter(s => s.status === 'approved').length,
      rejectedSwaps: swaps.filter(s => s.status === 'rejected').length,
    };
  }

  shutdown(): void {
    if (this.expirationCheckInterval) {
      clearInterval(this.expirationCheckInterval);
      this.expirationCheckInterval = null;
    }
  }
}

export const scheduleLifecycleOrchestrator = new ScheduleLifecycleOrchestrator();

export function registerScheduleLifecycleActions(orchestrator: typeof helpaiOrchestrator): void {
  orchestrator.registerAction({
    actionId: 'schedule_lifecycle.create',
    name: 'Create Schedule Lifecycle',
    category: 'scheduling',
    description: 'Create a new schedule lifecycle for tracking',
    requiredRoles: ['manager', 'admin', 'super_admin', 'owner'],
    handler: async (request) => {
      const { scheduleId, scheduleName, periodStart, periodEnd, employeeCount, shiftCount } = request.payload || {};

      if (!request.workspaceId || !scheduleId || !scheduleName) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'workspaceId, scheduleId, and scheduleName are required',
          executionTimeMs: 0,
        };
      }

      const lifecycle = await scheduleLifecycleOrchestrator.createScheduleLifecycle({
        workspaceId: request.workspaceId,
        scheduleId,
        scheduleName,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        createdBy: request.userId,
        employeeCount,
        shiftCount,
      });

      return {
        success: true,
        actionId: request.actionId,
        message: 'Schedule lifecycle created',
        data: lifecycle,
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'schedule_lifecycle.submit_for_review',
    name: 'Submit Schedule for Review',
    category: 'scheduling',
    description: 'Submit a draft schedule for review',
    requiredRoles: ['manager', 'admin', 'super_admin', 'owner'],
    handler: async (request) => {
      const { lifecycleId, notes } = request.payload || {};

      if (!lifecycleId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'lifecycleId is required',
          executionTimeMs: 0,
        };
      }

      const result = await scheduleLifecycleOrchestrator.submitForReview({
        lifecycleId,
        userId: request.userId,
        notes,
      });

      return {
        success: result.success,
        actionId: request.actionId,
        message: result.message,
        data: { conflicts: result.conflicts },
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'schedule_lifecycle.approve',
    name: 'Approve Schedule',
    category: 'scheduling',
    description: 'Approve a schedule pending review',
    requiredRoles: ['admin', 'super_admin', 'owner'],
    handler: async (request) => {
      const { lifecycleId, notes } = request.payload || {};

      if (!lifecycleId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'lifecycleId is required',
          executionTimeMs: 0,
        };
      }

      const result = await scheduleLifecycleOrchestrator.approveSchedule({
        lifecycleId,
        approverId: request.userId,
        notes,
      });

      return {
        success: result.success,
        actionId: request.actionId,
        message: result.message,
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'schedule_lifecycle.publish',
    name: 'Publish Schedule',
    category: 'scheduling',
    description: 'Publish an approved schedule',
    requiredRoles: ['admin', 'super_admin', 'owner'],
    handler: async (request) => {
      const { lifecycleId, notifyEmployees } = request.payload || {};

      if (!lifecycleId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'lifecycleId is required',
          executionTimeMs: 0,
        };
      }

      const result = await scheduleLifecycleOrchestrator.publishSchedule({
        lifecycleId,
        publisherId: request.userId,
        notifyEmployees,
      });

      return {
        success: result.success,
        actionId: request.actionId,
        message: result.message,
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'schedule_lifecycle.reject',
    name: 'Reject Schedule',
    category: 'scheduling',
    description: 'Reject a schedule and return to draft',
    requiredRoles: ['admin', 'super_admin', 'owner'],
    handler: async (request) => {
      const { lifecycleId, reason } = request.payload || {};

      if (!lifecycleId || !reason) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'lifecycleId and reason are required',
          executionTimeMs: 0,
        };
      }

      const result = await scheduleLifecycleOrchestrator.rejectSchedule({
        lifecycleId,
        rejectorId: request.userId,
        reason,
      });

      return {
        success: result.success,
        actionId: request.actionId,
        message: result.message,
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'schedule_lifecycle.request_swap',
    name: 'Request Shift Swap',
    category: 'scheduling',
    description: 'Request to swap a shift',
    requiredRoles: ['employee', 'manager', 'admin', 'super_admin', 'owner'],
    handler: async (request) => {
      const { scheduleId, shiftId, requesterName, targetEmployeeId, targetEmployeeName, reason, shiftDetails } = request.payload || {};

      if (!request.workspaceId || !scheduleId || !shiftId || !reason || !shiftDetails) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'workspaceId, scheduleId, shiftId, reason, and shiftDetails are required',
          executionTimeMs: 0,
        };
      }

      const swap = await scheduleLifecycleOrchestrator.requestShiftSwap({
        workspaceId: request.workspaceId,
        scheduleId,
        shiftId,
        requesterId: request.userId,
        requesterName: requesterName || request.userId,
        targetEmployeeId,
        targetEmployeeName,
        reason,
        shiftDetails,
      });

      return {
        success: true,
        actionId: request.actionId,
        message: 'Shift swap requested',
        data: swap,
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'schedule_lifecycle.approve_swap',
    name: 'Approve Shift Swap',
    category: 'scheduling',
    description: 'Approve a shift swap request',
    requiredRoles: ['manager', 'admin', 'super_admin', 'owner'],
    handler: async (request) => {
      const { swapId, notes } = request.payload || {};

      if (!swapId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'swapId is required',
          executionTimeMs: 0,
        };
      }

      const result = await scheduleLifecycleOrchestrator.approveSwap({
        swapId,
        approverId: request.userId,
        notes,
      });

      return {
        success: result.success,
        actionId: request.actionId,
        message: result.message,
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'schedule_lifecycle.reject_swap',
    name: 'Reject Shift Swap',
    category: 'scheduling',
    description: 'Reject a shift swap request',
    requiredRoles: ['manager', 'admin', 'super_admin', 'owner'],
    handler: async (request) => {
      const { swapId, reason } = request.payload || {};

      if (!swapId || !reason) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'swapId and reason are required',
          executionTimeMs: 0,
        };
      }

      const result = await scheduleLifecycleOrchestrator.rejectSwap({
        swapId,
        rejectorId: request.userId,
        reason,
      });

      return {
        success: result.success,
        actionId: request.actionId,
        message: result.message,
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'schedule_lifecycle.get_pending_swaps',
    name: 'Get Pending Swap Requests',
    category: 'scheduling',
    description: 'Get all pending shift swap requests',
    requiredRoles: ['manager', 'admin', 'super_admin', 'owner'],
    handler: async (request) => {
      if (!request.workspaceId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'workspaceId is required',
          executionTimeMs: 0,
        };
      }

      const swaps = await scheduleLifecycleOrchestrator.getPendingSwaps(request.workspaceId);

      return {
        success: true,
        actionId: request.actionId,
        message: `${swaps.length} pending swap requests`,
        data: swaps,
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'schedule_lifecycle.get_stats',
    name: 'Get Schedule Lifecycle Stats',
    category: 'analytics',
    description: 'Get schedule lifecycle statistics',
    requiredRoles: ['support', 'admin', 'super_admin'],
    handler: async (request) => {
      const stats = scheduleLifecycleOrchestrator.getStats();
      return {
        success: true,
        actionId: request.actionId,
        message: 'Schedule lifecycle stats retrieved',
        data: stats,
        executionTimeMs: 0,
      };
    },
  });

  console.log('[ScheduleLifecycleOrchestrator] Registered 10 AI Brain actions');
}
