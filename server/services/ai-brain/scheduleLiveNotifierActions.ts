/**
 * Schedule Live Notifier Actions for AI Brain Orchestration
 * 
 * Registers schedule notification actions with the HelpAI Orchestrator
 * enabling Trinity and automation to trigger real-time schedule notifications.
 */

import { helpaiOrchestrator, type HelpAIAction } from '../helpai/helpaiActionOrchestrator';
import {
  onShiftCreated,
  onShiftUpdated,
  onShiftDeleted,
  onSchedulePublished,
  onShiftSwap,
  onAutomationScheduleChange,
} from '../scheduleLiveNotifier';

export function registerScheduleLiveNotifierActions(): void {
  const actions: HelpAIAction[] = [
    {
      id: 'schedule.notify_shift_created',
      name: 'Notify Shift Created',
      description: 'Send real-time notification to employee when a new shift is assigned',
      category: 'scheduling',
      requiredRole: 'staff',
      parameters: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string', description: 'Workspace ID' },
          shiftId: { type: 'string', description: 'The created shift ID' },
          employeeId: { type: 'string', description: 'Employee to notify' },
          employeeName: { type: 'string', description: 'Employee name' },
          shiftDate: { type: 'string', description: 'Date of the shift' },
          shiftTime: { type: 'string', description: 'Time range of the shift' },
          createdBy: { type: 'string', description: 'User ID who created the shift' },
          createdByRole: { type: 'string', description: 'Role of the creator' },
        },
        required: ['workspaceId', 'shiftId', 'employeeId', 'shiftDate', 'shiftTime', 'createdBy', 'createdByRole'],
      },
      execute: async (params) => {
        await onShiftCreated(
          {
            id: params.shiftId,
            workspaceId: params.workspaceId,
            employeeId: params.employeeId,
            startTime: new Date(params.shiftDate),
            endTime: new Date(params.shiftDate),
          },
          {
            userId: params.createdBy,
            userRole: params.createdByRole,
            isTrinity: params.createdByRole === 'Trinity AI',
            isSupport: params.createdByRole === 'Support',
          }
        );
        return { success: true, message: `Notified employee ${params.employeeName} about new shift` };
      },
    },
    {
      id: 'schedule.notify_shift_updated',
      name: 'Notify Shift Updated',
      description: 'Send real-time notification to employee when their shift is modified',
      category: 'scheduling',
      requiredRole: 'staff',
      parameters: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string', description: 'Workspace ID' },
          shiftId: { type: 'string', description: 'The updated shift ID' },
          employeeId: { type: 'string', description: 'Employee to notify' },
          shiftDate: { type: 'string', description: 'Date of the shift' },
          shiftTime: { type: 'string', description: 'Time range of the shift' },
          changes: { type: 'string', description: 'Description of changes made' },
          changedBy: { type: 'string', description: 'User ID who made the change' },
          changedByRole: { type: 'string', description: 'Role of the changer' },
        },
        required: ['workspaceId', 'shiftId', 'employeeId', 'shiftDate', 'changes', 'changedBy', 'changedByRole'],
      },
      execute: async (params) => {
        await onShiftUpdated(
          {
            id: params.shiftId,
            workspaceId: params.workspaceId,
            employeeId: params.employeeId,
            startTime: new Date(params.shiftDate),
            endTime: new Date(params.shiftDate),
          },
          params.changes,
          {
            userId: params.changedBy,
            userRole: params.changedByRole,
            isTrinity: params.changedByRole === 'Trinity AI',
            isSupport: params.changedByRole === 'Support',
          }
        );
        return { success: true, message: `Notified employee about shift update: ${params.changes}` };
      },
    },
    {
      id: 'schedule.notify_shift_deleted',
      name: 'Notify Shift Deleted',
      description: 'Send real-time notification to employee when their shift is removed',
      category: 'scheduling',
      requiredRole: 'staff',
      parameters: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string', description: 'Workspace ID' },
          shiftId: { type: 'string', description: 'The deleted shift ID' },
          employeeId: { type: 'string', description: 'Employee to notify' },
          shiftDate: { type: 'string', description: 'Date of the shift' },
          shiftTime: { type: 'string', description: 'Time range of the shift' },
          deletedBy: { type: 'string', description: 'User ID who deleted the shift' },
          deletedByRole: { type: 'string', description: 'Role of the deleter' },
          reason: { type: 'string', description: 'Reason for deletion (optional)' },
        },
        required: ['workspaceId', 'shiftId', 'employeeId', 'shiftDate', 'shiftTime', 'deletedBy', 'deletedByRole'],
      },
      execute: async (params) => {
        await onShiftDeleted(
          {
            id: params.shiftId,
            workspaceId: params.workspaceId,
            employeeId: params.employeeId,
            startTime: new Date(params.shiftDate),
            endTime: new Date(params.shiftDate),
          },
          {
            userId: params.deletedBy,
            userRole: params.deletedByRole,
            isTrinity: params.deletedByRole === 'Trinity AI',
            isSupport: params.deletedByRole === 'Support',
            reason: params.reason,
          }
        );
        return { success: true, message: `Notified employee about shift removal` };
      },
    },
    {
      id: 'schedule.notify_schedule_published',
      name: 'Notify Schedule Published',
      description: 'Send real-time notification to all affected employees when a schedule is published',
      category: 'scheduling',
      requiredRole: 'manager',
      parameters: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string', description: 'Workspace ID' },
          weekStart: { type: 'string', description: 'Start of the week (ISO date)' },
          weekEnd: { type: 'string', description: 'End of the week (ISO date)' },
          affectedEmployeeIds: { type: 'array', items: { type: 'string' }, description: 'List of employee IDs to notify' },
          publishedBy: { type: 'string', description: 'User ID who published' },
          publishedByRole: { type: 'string', description: 'Role of the publisher' },
          totalShifts: { type: 'number', description: 'Total shifts in the schedule' },
        },
        required: ['workspaceId', 'weekStart', 'weekEnd', 'affectedEmployeeIds', 'publishedBy', 'publishedByRole', 'totalShifts'],
      },
      execute: async (params) => {
        await onSchedulePublished({
          workspaceId: params.workspaceId,
          weekStart: params.weekStart,
          weekEnd: params.weekEnd,
          affectedEmployeeIds: params.affectedEmployeeIds,
          publishedBy: params.publishedBy,
          publishedByRole: params.publishedByRole,
          totalShifts: params.totalShifts,
        });
        return { success: true, message: `Notified ${params.affectedEmployeeIds.length} employees about published schedule` };
      },
    },
    {
      id: 'schedule.notify_shift_swap',
      name: 'Notify Shift Swap',
      description: 'Send real-time notification about shift swap request/approval/denial',
      category: 'scheduling',
      requiredRole: 'staff',
      parameters: {
        type: 'object',
        properties: {
          eventType: { type: 'string', enum: ['requested', 'approved', 'denied'], description: 'Type of swap event' },
          workspaceId: { type: 'string', description: 'Workspace ID' },
          requesterId: { type: 'string', description: 'Employee who requested swap' },
          targetEmployeeId: { type: 'string', description: 'Employee to swap with (optional)' },
          shiftId: { type: 'string', description: 'Shift ID involved in swap' },
          shiftDate: { type: 'string', description: 'Date of the shift' },
          actionBy: { type: 'string', description: 'User ID who took action' },
          actionByRole: { type: 'string', description: 'Role of action taker' },
          reason: { type: 'string', description: 'Reason for swap (optional)' },
        },
        required: ['eventType', 'workspaceId', 'requesterId', 'shiftId', 'shiftDate', 'actionBy', 'actionByRole'],
      },
      execute: async (params) => {
        await onShiftSwap(params.eventType as 'requested' | 'approved' | 'denied', {
          workspaceId: params.workspaceId,
          requesterId: params.requesterId,
          targetEmployeeId: params.targetEmployeeId,
          shiftId: params.shiftId,
          shiftDate: params.shiftDate,
          actionBy: params.actionBy,
          actionByRole: params.actionByRole,
          reason: params.reason,
        });
        return { success: true, message: `Notified about shift swap ${params.eventType}` };
      },
    },
    {
      id: 'schedule.notify_automation_change',
      name: 'Notify Automation Schedule Change',
      description: 'Send notification when Trinity or automation modifies schedules',
      category: 'scheduling',
      requiredRole: 'system',
      parameters: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string', description: 'Workspace ID' },
          actionType: { type: 'string', enum: ['created', 'updated', 'deleted', 'bulk_created'], description: 'Type of action' },
          affectedEmployeeIds: { type: 'array', items: { type: 'string' }, description: 'List of affected employee IDs' },
          description: { type: 'string', description: 'Human-readable description of changes' },
          automationSource: { type: 'string', enum: ['trinity', 'scheduler', 'ai_brain', 'support'], description: 'Source of automation' },
        },
        required: ['workspaceId', 'actionType', 'affectedEmployeeIds', 'description', 'automationSource'],
      },
      execute: async (params) => {
        await onAutomationScheduleChange({
          workspaceId: params.workspaceId,
          actionType: params.actionType as 'created' | 'updated' | 'deleted' | 'bulk_created',
          affectedEmployeeIds: params.affectedEmployeeIds,
          description: params.description,
          automationSource: params.automationSource as 'trinity' | 'scheduler' | 'ai_brain' | 'support',
        });
        return { success: true, message: `Automation schedule change notification sent` };
      },
    },
  ];

  for (const action of actions) {
    helpaiOrchestrator.registerAction(action);
  }

  console.log(`[ScheduleLiveNotifier] Registered ${actions.length} AI Brain orchestration actions`);
}
