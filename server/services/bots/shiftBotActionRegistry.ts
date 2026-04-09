/**
 * SHIFT BOT TRINITY ACTION REGISTRY
 * ===================================
 * Registers all ShiftRoom bot actions (ReportBot, ClockBot, MeetingBot,
 * HelpAI-in-shift-rooms) with the Trinity platform action hub so they
 * can be invoked from the Trinity AI co-pilot and automation layer.
 *
 * Pattern mirrors: server/services/billing/exceptionQueueProcessor.ts
 */

import { helpaiOrchestrator } from '../helpai/platformActionHub';
import { createLogger } from '../../lib/logger';

const log = createLogger('ShiftBotActionRegistry');

export function registerShiftBotActions(): void {
  // ─── ReportBot ─────────────────────────────────────────────────────────────

  helpaiOrchestrator.registerAction({
    actionId: 'shiftroom.create_room',
    name: 'Create Shift Room',
    category: 'workforce',
    description: 'Create a shift chat room with ReportBot + HelpAI auto-deployed for an assigned shift',
    requiredRoles: ['manager', 'supervisor', 'sysop', 'deputy_admin', 'root_admin'],
    handler: async (request) => {
      const { shiftId, workspaceId } = request.payload || {};
      if (!shiftId || !workspaceId) return { success: false, actionId: request.actionId, message: 'shiftId and workspaceId are required' };
      // Fetch shift data to pass correct params to orchestrator
      const { db } = await import('../../db');
      const { shifts, employees } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');
      const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftId));
      if (!shift) return { success: false, actionId: request.actionId, message: `Shift ${shiftId} not found` };
      if (!shift.employeeId) return { success: false, actionId: request.actionId, message: 'Shift has no assigned employee' };
      const [emp] = await db.select().from(employees).where(eq(employees.id, shift.employeeId));
      if (!emp || !emp.userId) return { success: false, actionId: request.actionId, message: 'Employee not found' };
      const officerName = [emp.firstName, emp.lastName].filter(Boolean).join(' ') || 'Officer';
      const { shiftRoomBotOrchestrator } = await import('./shiftRoomBotOrchestrator');
      const result = await shiftRoomBotOrchestrator.createShiftRoomOnAssignment({
        workspaceId,
        shiftId,
        shiftTitle: shift.title || 'Security Shift',
        siteName: shift.description || shift.title || 'Post',
        shiftStart: shift.startTime ? new Date(shift.startTime) : new Date(),
        shiftEnd: shift.endTime ? new Date(shift.endTime) : new Date(),
        officerUserId: emp.userId,
        officerEmployeeId: emp.id,
        officerName,
        createdBy: (request as any).context?.userId || 'trinity',
      });
      return { success: true, actionId: request.actionId, message: `Shift room ${result.created ? 'created' : 'already existed'} for shift ${shiftId}`, data: result };
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'reportbot.generate_report',
    name: 'Generate Shift Report PDF',
    category: 'workforce',
    description: 'Trigger end-of-shift PDF report generation for a shift chat room and save to Document Safe',
    requiredRoles: ['manager', 'supervisor', 'sysop', 'deputy_admin', 'root_admin'],
    handler: async (request) => {
      const { conversationId, workspaceId } = request.payload || {};
      if (!conversationId || !workspaceId) return { success: false, actionId: request.actionId, message: 'conversationId and workspaceId are required' };
      const { reportBotPdfService } = await import('./reportBotPdfService');
      const result = await reportBotPdfService.generateAndSaveShiftReport(conversationId, workspaceId);
      return { success: result.success, actionId: request.actionId, message: result.success ? `Report generated: ${result.documentId}` : result.error || 'Generation failed', data: result };
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'reportbot.run_hourly_checkin',
    name: 'Run ReportBot Hourly Check-In Scan',
    category: 'workforce',
    description: 'Manually trigger the hourly check-in reminder scan across all active shift rooms',
    requiredRoles: ['sysop', 'deputy_admin', 'root_admin'],
    handler: async (request) => {
      const { shiftRoomBotOrchestrator } = await import('./shiftRoomBotOrchestrator');
      await shiftRoomBotOrchestrator.runHourlyCheckInCron(request.payload?.workspaceId);
      return { success: true, actionId: request.actionId, message: 'Hourly check-in scan complete' };
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'reportbot.run_end_of_shift',
    name: 'Run End-of-Shift Detection Scan',
    category: 'workforce',
    description: 'Manually trigger end-of-shift report generation scan across all active shift rooms',
    requiredRoles: ['sysop', 'deputy_admin', 'root_admin'],
    handler: async (request) => {
      const { shiftRoomBotOrchestrator } = await import('./shiftRoomBotOrchestrator');
      await shiftRoomBotOrchestrator.runEndOfShiftCron(request.payload?.workspaceId);
      return { success: true, actionId: request.actionId, message: 'End-of-shift scan complete' };
    },
  });

  // ─── ClockBot ──────────────────────────────────────────────────────────────

  helpaiOrchestrator.registerAction({
    actionId: 'clockbot.supervisor_clock_in',
    name: 'ClockBot Supervisor Clock-In Override',
    category: 'timekeeping',
    description: 'Allow a supervisor to confirm a ClockBot-initiated clock-in for an officer via the shift room',
    requiredRoles: ['manager', 'supervisor', 'sysop', 'deputy_admin', 'root_admin'],
    handler: async (request) => {
      const { conversationId, workspaceId, officerName } = request.payload || {};
      if (!conversationId || !workspaceId) return { success: false, actionId: request.actionId, message: 'conversationId and workspaceId are required' };
      const { shiftRoomBotOrchestrator } = await import('./shiftRoomBotOrchestrator');
      // Trigger the clock-in confirm message in the room
      await shiftRoomBotOrchestrator.handleShiftRoomMessage({
        conversationId, workspaceId,
        senderId: (request as any).context?.userId || 'trinity',
        senderName: (request as any).context?.userName || 'Trinity',
        senderRole: 'supervisor',
        message: 'CONFIRM',
        messageType: 'text',
      });
      return { success: true, actionId: request.actionId, message: `ClockBot clock-in confirmed for ${officerName || 'officer'} in room ${conversationId}` };
    },
  });

  // ─── MeetingBot ────────────────────────────────────────────────────────────

  helpaiOrchestrator.registerAction({
    actionId: 'meetingbot.generate_summary',
    name: 'MeetingBot Generate Summary PDF',
    category: 'meetings',
    description: 'Generate a meeting summary PDF from a meeting conversation and save to Document Safe',
    requiredRoles: ['manager', 'supervisor', 'employee', 'sysop', 'deputy_admin', 'root_admin'],
    handler: async (request) => {
      const { conversationId, workspaceId, endedByName } = request.payload || {};
      if (!conversationId || !workspaceId) return { success: false, actionId: request.actionId, message: 'conversationId and workspaceId are required' };
      const { meetingBotPdfService } = await import('./meetingBotPdfService');
      const result = await meetingBotPdfService.generateAndSaveMeetingSummary(
        conversationId, workspaceId,
        (request as any).context?.userId || 'system',
        endedByName || (request as any).context?.userName || 'Trinity'
      );
      return { success: result.success, actionId: request.actionId, message: result.success ? `Meeting summary saved: ${result.documentId}` : result.error || 'Failed', data: result };
    },
  });

  // ─── HelpAI in Shift Rooms ─────────────────────────────────────────────────

  helpaiOrchestrator.registerAction({
    actionId: 'shiftroom.helpai_query',
    name: 'HelpAI Shift Room Query',
    category: 'workforce',
    description: 'Route a question from a shift room to HelpAI and return the answer as a bot message',
    requiredRoles: ['employee', 'manager', 'supervisor', 'sysop', 'deputy_admin', 'root_admin'],
    handler: async (request) => {
      const { conversationId, workspaceId, question, askerName } = request.payload || {};
      if (!conversationId || !workspaceId || !question) return { success: false, actionId: request.actionId, message: 'conversationId, workspaceId, and question are required' };
      const { shiftRoomBotOrchestrator } = await import('./shiftRoomBotOrchestrator');
      await shiftRoomBotOrchestrator.handleShiftRoomMessage({
        conversationId, workspaceId,
        senderId: (request as any).context?.userId || 'trinity',
        senderName: askerName || (request as any).context?.userName || 'Trinity',
        senderRole: 'employee',
        message: `@HelpAI ${question}`,
        messageType: 'text',
      });
      return { success: true, actionId: request.actionId, message: `HelpAI query routed in shift room ${conversationId}` };
    },
  });

  log.info('[ShiftBots] Registered 7 Trinity platform actions: shiftroom.*, reportbot.*, clockbot.*, meetingbot.*');
}
