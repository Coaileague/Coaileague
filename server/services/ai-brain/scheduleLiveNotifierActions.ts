/**
 * Schedule Live Notifier Actions for AI Brain Orchestration
 * 
 * Registers schedule notification actions with the Platform Action Hub
 * enabling Trinity and automation to trigger real-time schedule notifications.
 */

import { helpaiOrchestrator, type ActionRequest } from '../helpai/helpaiActionOrchestrator';
import {
  onShiftCreated,
  onShiftUpdated,
  onShiftDeleted,
  onSchedulePublished,
  onShiftSwap,
  onAutomationScheduleChange,
} from '../scheduleLiveNotifier';

export function registerScheduleLiveNotifierActions(): void {
  helpaiOrchestrator.registerAction({
    actionId: 'schedule.notify_shift_created',
    name: 'Notify Shift Created',
    description: 'Send real-time notification to employee when a new shift is assigned',
    category: 'scheduling',
    requiredRoles: ['staff', 'manager', 'admin', 'super_admin', 'support'],
    handler: async (request: ActionRequest) => {
      const startTime = Date.now();
      const { workspaceId, shiftId, employeeId, employeeName, shiftDate, shiftTime, createdBy, createdByRole } = request.payload || {};
      
      try {
        await onShiftCreated(
          {
            id: shiftId,
            workspaceId: workspaceId || request.workspaceId,
            employeeId: employeeId,
            startTime: new Date(shiftDate),
            endTime: new Date(shiftDate),
          },
          {
            userId: createdBy || request.userId,
            userRole: createdByRole || request.userRole,
            isTrinity: createdByRole === 'Trinity AI' || request.metadata?.source === 'trinity',
            isSupport: createdByRole === 'Support' || request.userRole === 'support',
          }
        );
        return {
          success: true,
          actionId: 'schedule.notify_shift_created',
          message: `Notified employee ${employeeName || employeeId} about new shift`,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: 'schedule.notify_shift_created',
          message: `Failed to notify shift created: ${error.message}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'schedule.notify_shift_updated',
    name: 'Notify Shift Updated',
    description: 'Send real-time notification to employee when their shift is modified',
    category: 'scheduling',
    requiredRoles: ['staff', 'manager', 'admin', 'super_admin', 'support'],
    handler: async (request: ActionRequest) => {
      const startTime = Date.now();
      const { workspaceId, shiftId, employeeId, shiftDate, changes, changedBy, changedByRole } = request.payload || {};
      
      try {
        await onShiftUpdated(
          {
            id: shiftId,
            workspaceId: workspaceId || request.workspaceId,
            employeeId: employeeId,
            startTime: new Date(shiftDate),
            endTime: new Date(shiftDate),
          },
          changes || 'Schedule updated',
          {
            userId: changedBy || request.userId,
            userRole: changedByRole || request.userRole,
            isTrinity: changedByRole === 'Trinity AI' || request.metadata?.source === 'trinity',
            isSupport: changedByRole === 'Support' || request.userRole === 'support',
          }
        );
        return {
          success: true,
          actionId: 'schedule.notify_shift_updated',
          message: `Notified employee about shift update: ${changes}`,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: 'schedule.notify_shift_updated',
          message: `Failed to notify shift updated: ${error.message}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'schedule.notify_shift_deleted',
    name: 'Notify Shift Deleted',
    description: 'Send real-time notification to employee when their shift is removed',
    category: 'scheduling',
    requiredRoles: ['staff', 'manager', 'admin', 'super_admin', 'support'],
    handler: async (request: ActionRequest) => {
      const startTime = Date.now();
      const { workspaceId, shiftId, employeeId, shiftDate, shiftTime, deletedBy, deletedByRole, reason } = request.payload || {};
      
      try {
        await onShiftDeleted(
          {
            id: shiftId,
            workspaceId: workspaceId || request.workspaceId,
            employeeId: employeeId,
            startTime: new Date(shiftDate),
            endTime: new Date(shiftDate),
          },
          {
            userId: deletedBy || request.userId,
            userRole: deletedByRole || request.userRole,
            isTrinity: deletedByRole === 'Trinity AI' || request.metadata?.source === 'trinity',
            isSupport: deletedByRole === 'Support' || request.userRole === 'support',
            reason: reason,
          }
        );
        return {
          success: true,
          actionId: 'schedule.notify_shift_deleted',
          message: `Notified employee about shift removal`,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: 'schedule.notify_shift_deleted',
          message: `Failed to notify shift deleted: ${error.message}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'schedule.notify_schedule_published',
    name: 'Notify Schedule Published',
    description: 'Send real-time notification to all affected employees when a schedule is published',
    category: 'scheduling',
    requiredRoles: ['manager', 'admin', 'super_admin', 'support'],
    handler: async (request: ActionRequest) => {
      const startTime = Date.now();
      const { workspaceId, weekStart, weekEnd, affectedEmployeeIds, publishedBy, publishedByRole, totalShifts } = request.payload || {};
      
      try {
        await onSchedulePublished({
          workspaceId: workspaceId || request.workspaceId,
          weekStart: weekStart,
          weekEnd: weekEnd,
          affectedEmployeeIds: affectedEmployeeIds || [],
          publishedBy: publishedBy || request.userId,
          publishedByRole: publishedByRole || request.userRole,
          totalShifts: totalShifts || 0,
        });
        return {
          success: true,
          actionId: 'schedule.notify_schedule_published',
          message: `Notified ${(affectedEmployeeIds || []).length} employees about published schedule`,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: 'schedule.notify_schedule_published',
          message: `Failed to notify schedule published: ${error.message}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'schedule.notify_shift_swap',
    name: 'Notify Shift Swap',
    description: 'Send real-time notification about shift swap request/approval/denial',
    category: 'scheduling',
    requiredRoles: ['staff', 'manager', 'admin', 'super_admin', 'support'],
    handler: async (request: ActionRequest) => {
      const startTime = Date.now();
      const { eventType, workspaceId, requesterId, targetEmployeeId, shiftId, shiftDate, actionBy, actionByRole, reason } = request.payload || {};
      
      try {
        await onShiftSwap(eventType as 'requested' | 'approved' | 'denied', {
          workspaceId: workspaceId || request.workspaceId,
          requesterId: requesterId,
          targetEmployeeId: targetEmployeeId,
          shiftId: shiftId,
          shiftDate: shiftDate,
          actionBy: actionBy || request.userId,
          actionByRole: actionByRole || request.userRole,
          reason: reason,
        });
        return {
          success: true,
          actionId: 'schedule.notify_shift_swap',
          message: `Notified about shift swap ${eventType}`,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: 'schedule.notify_shift_swap',
          message: `Failed to notify shift swap: ${error.message}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'schedule.notify_automation_change',
    name: 'Notify Automation Schedule Change',
    description: 'Send notification when Trinity or automation modifies schedules',
    category: 'scheduling',
    requiredRoles: ['manager', 'admin', 'super_admin', 'support'],
    handler: async (request: ActionRequest) => {
      const startTime = Date.now();
      const { workspaceId, actionType, affectedEmployeeIds, description, automationSource } = request.payload || {};
      
      try {
        await onAutomationScheduleChange({
          workspaceId: workspaceId || request.workspaceId,
          actionType: actionType as 'created' | 'updated' | 'deleted' | 'bulk_created',
          affectedEmployeeIds: affectedEmployeeIds || [],
          description: description || 'Schedule change by automation',
          automationSource: automationSource as 'trinity' | 'scheduler' | 'ai_brain' | 'support' || 'ai_brain',
        });
        return {
          success: true,
          actionId: 'schedule.notify_automation_change',
          message: `Automation schedule change notification sent`,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: 'schedule.notify_automation_change',
          message: `Failed to notify automation change: ${error.message}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  console.log(`[ScheduleLiveNotifier] Registered 6 AI Brain orchestration actions`);
}
