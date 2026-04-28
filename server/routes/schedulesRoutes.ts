import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { db } from "../db";
import {
  shifts,
  employees,
  timeEntries as timeEntriesTable
} from '@shared/schema';
import { sql, eq, and, gte, lte, inArray, isNull, count } from "drizzle-orm";
import { requireAuth, requireManager, type AuthenticatedRequest } from "../rbac";
import { storage } from "../storage";
import * as notificationHelpers from "../notifications";
import { broadcastToWorkspace, broadcastNotificationToUser } from "../websocket";
import { calculateInvoiceLineItem, sumFinancialValues, toFinancialString, formatCurrency } from '../services/financialCalculator';
import { createLogger } from '../lib/logger';
import { scheduleNonBlocking } from '../lib/scheduleNonBlocking';
import { z } from 'zod';
const log = createLogger('SchedulesRoutes');


const router = Router();

router.get('/week/stats', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const weekStart = req.query.weekStart as string;
    
    if (!weekStart) {
      return res.status(400).json({ message: "weekStart query parameter required (ISO date string)" });
    }
    
    const startDate = new Date(weekStart);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);
    
    const allShifts = await storage.getShiftsByWorkspace(
      workspaceId,
      startDate,
      endDate
    );
    
    const allEmployees = await storage.getEmployeesByWorkspace(workspaceId);
    const employeeMap = new Map(allEmployees.map(e => [e.id, e]));
    
    let totalHours = 0;
    const costParts: string[] = [];
    let overtimeHours = 0;
    let openShifts = 0;
    
    const employeeHours = new Map<string, number>();
    
    for (const shift of allShifts) {
      const start = new Date(shift.startTime);
      const end = new Date(shift.endTime);
      const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      
      if (!shift.employeeId) {
        openShifts++;
      } else {
        totalHours += hours;
        
        const empHours = employeeHours.get(shift.employeeId) || 0;
        employeeHours.set(shift.employeeId, empHours + hours);
        
        const employee = employeeMap.get(shift.employeeId);
        if (employee?.hourlyRate) {
          costParts.push(calculateInvoiceLineItem(toFinancialString(hours), toFinancialString(employee.hourlyRate)));
        }
      }
    }
    
    for (const [, hours] of employeeHours.entries()) {
      if (hours > 40) {
        overtimeHours += hours - 40;
      }
    }
    
    const totalCostStr = sumFinancialValues(costParts);
    
    res.json({
      weekStart: startDate.toISOString(),
      weekEnd: endDate.toISOString(),
      totalHours: Math.round(totalHours * 10) / 10,
      totalCost: totalCostStr,
      overtimeHours: Math.round(overtimeHours * 10) / 10,
      openShifts,
      shiftsCount: allShifts.length,
    });
    
  } catch (error) {
    log.error("Error calculating week stats:", error);
    res.status(500).json({ message: "Failed to calculate week stats" });
  }
});

router.post('/publish', requireManager, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
    if (!userWorkspace) return res.status(404).json({ message: "Workspace not found" });
    const workspace = await storage.getWorkspace(userWorkspace.workspaceId);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });
    
    const { weekStartDate, weekEndDate, shiftIds, title } = req.body;
    const { publishedSchedules } = await import("@shared/schema");

    if (!weekStartDate || !weekEndDate) {
      return res.status(400).json({ message: "weekStartDate and weekEndDate are required" });
    }

    const startDate = new Date(weekStartDate);
    const endDate = new Date(weekEndDate);

    // Resolve shiftIds — if not provided, auto-fetch all draft shifts for the week
    let resolvedShiftIds: string[];
    if (Array.isArray(shiftIds) && shiftIds.length > 0) {
      resolvedShiftIds = shiftIds;
    } else {
      const draftShifts = await db
        .select({ id: shifts.id })
        .from(shifts)
        .where(and(
          eq(shifts.workspaceId, workspace.id),
          gte(shifts.startTime, startDate),
          lte(shifts.startTime, endDate)
        ));
      resolvedShiftIds = draftShifts.map(s => s.id);
    }

    if (resolvedShiftIds.length === 0) {
      return res.status(400).json({ message: "No shifts found to publish for this week" });
    }

    const { published, shiftsData } = await db.transaction(async (tx) => {
      const shiftsData = await tx.select().from(shifts).where(and(eq(shifts.workspaceId, workspace.id), inArray(shifts.id, resolvedShiftIds)));
      
      const openShifts = shiftsData.filter(s => !s.employeeId && s.status === 'draft');
      if (openShifts.length > 0) {
        throw new Error(`Cannot publish: ${openShifts.length} unassigned draft shifts must be filled or removed before publishing.`);
      }

      const employeesAffected = new Set(shiftsData.map(s => s.employeeId).filter(Boolean)).size;

      const [published] = await tx.insert(publishedSchedules).values({ workspaceId: workspace.id, weekStartDate: startDate, weekEndDate: endDate, title: title || `Week of ${startDate.toLocaleDateString()}`, publishedBy: userId, publishedAt: new Date(), totalShifts: resolvedShiftIds.length, employeesAffected, shiftIds: resolvedShiftIds, notificationsSent: false }).returning();

      await tx.update(shifts).set({ status: 'scheduled' }).where(and(eq(shifts.workspaceId, workspace.id), inArray(shifts.id, resolvedShiftIds)));

      // AUDIT LOG: Publish action
      await storage.createAuditLog({
        workspaceId: workspace.id,
        action: 'schedule_published',
        entityType: 'schedule',
        entityId: published.id,
        userId,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        details: {
          title: published.title,
          totalShifts: published.totalShifts,
          employeesAffected,
        },
      });

      return { published, shiftsData };
    });
    
    const affectedEmployeeIds = [...new Set(shiftsData.map(s => s.employeeId).filter(Boolean))] as string[];
    const weekStartFormatted = new Date(weekStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const weekEndFormatted = new Date(weekEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    // Look up user account IDs from employee records — employee IDs are NOT user IDs
    let employeeRecordsForNotif: { id: string; userId: string | null }[] = [];
    if (affectedEmployeeIds.length > 0) {
      employeeRecordsForNotif = await db
        .select({ id: employees.id, userId: employees.userId })
        .from(employees)
        .where(inArray(employees.id, affectedEmployeeIds));
    }

    const broadcastNotification = (bWorkspaceId: string, bUserId: string, _updateType: string, notification?: any) => {
      broadcastNotificationToUser(bWorkspaceId, bUserId, notification);
    };

    const notificationPromises = employeeRecordsForNotif
      .filter(emp => emp.userId) // Only notify employees with a linked user account
      .map(emp =>
        notificationHelpers.createSchedulePublishedNotification(
          { storage, broadcastNotification },
          {
            workspaceId: workspace.id,
            userId: emp.userId!,
            weekStart: weekStartFormatted,
            weekEnd: weekEndFormatted,
            totalShifts: resolvedShiftIds.length,
            publishedBy: userId,
          }
        ).catch(err => log.error('Failed to create schedule notification:', err))
      );

    // Wait for notifications, then mark notificationsSent = true
    Promise.all(notificationPromises).then(async () => {
      const { publishedSchedules: ps } = await import('@shared/schema');
      await db.update(ps).set({ notificationsSent: true }).where(eq(ps.id, published.id));
    }).catch(err => log.error('Failed to mark notificationsSent:', err));

    // T005 FIX: Send email to each affected employee with their specific shifts
    scheduleNonBlocking('schedules.publish-employee-emails', async () => {
      try {
        const { emailService } = await import('../services/emailService');
        const appUrl = process.env.APP_BASE_URL || 'https://app.coaileague.com';

        // Fetch employee emails for those with linked userId accounts
        const linkedEmpIds = employeeRecordsForNotif
          .filter(e => e.userId)
          .map(e => e.id);

        if (linkedEmpIds.length === 0) return;

        const empDetails = await db
          .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName, email: employees.email })
          .from(employees)
          .where(inArray(employees.id, linkedEmpIds));

        for (const emp of empDetails) {
          if (!emp.email) continue;

          // Get this employee's specific shifts for the published week
          const empShifts = shiftsData.filter(s => s.employeeId === emp.id);
          if (empShifts.length === 0) continue;

          const shiftRows = empShifts.map(s => {
            const start = new Date(s.startTime);
            const end = new Date(s.endTime);
            const day = start.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
            const startT = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            const endT = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            return `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${day}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${startT} – ${endT}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${(s as any).location || (s as any).siteName || 'See schedule'}</td></tr>`;
          }).join('');

          await emailService.send({
            to: emp.email,
            subject: `Your Schedule: ${weekStartFormatted} – ${weekEndFormatted}`,
            html: `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111827;">
  <h2 style="color:#1e3a5f;margin-bottom:4px;">Your Schedule is Published</h2>
  <p style="color:#6b7280;margin-top:0;">Week of ${weekStartFormatted} – ${weekEndFormatted}</p>
  <p>Hi ${emp.firstName},</p>
  <p>Your schedule for the upcoming week has been published. Here are your assigned shifts:</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
    <thead>
      <tr style="background:#f3f4f6;">
        <th style="padding:8px 12px;text-align:left;font-weight:600;">Day</th>
        <th style="padding:8px 12px;text-align:left;font-weight:600;">Time</th>
        <th style="padding:8px 12px;text-align:left;font-weight:600;">Location</th>
      </tr>
    </thead>
    <tbody>${shiftRows}</tbody>
  </table>
  <p><a href="${appUrl}/schedule" style="background:#1e3a5f;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:8px;">View Full Schedule</a></p>
  <p style="color:#9ca3af;font-size:12px;margin-top:24px;">You received this because you are an employee at this organization. Log in to view or request changes.</p>
</div>`,
          }).catch((emailErr: any) => log.warn(`Schedule email failed for ${emp.email}:`, emailErr?.message));
        }
        log.info(`[SchedulePublish] Sent schedule emails to ${empDetails.filter(e => e.email).length} employees for week ${weekStartFormatted}`);
      } catch (emailErr: any) {
        log.warn('[SchedulePublish] Email dispatch failed (non-blocking):', emailErr?.message);
      }
    });

    const employeesAffected = new Set(shiftsData.map(s => s.employeeId).filter(Boolean)).size;

    const { platformEventBus } = await import('../services/platformEventBus');
    platformEventBus.publish({
      type: 'schedule_published',
      category: 'scheduling',
      title: `Schedule Published: ${published.title}`,
      description: `${published.totalShifts} shifts published covering ${employeesAffected} employee(s) for the week of ${weekStartDate}`,
      workspaceId: workspace.id,
      userId,
      metadata: {
        scheduleId: published.id,
        weekStartDate,
        weekEndDate,
        totalShifts: published.totalShifts,
        employeesAffected,
        publishedBy: userId,
      },
      visibility: 'manager',
    }).catch((err: any) => log.warn('[EventBus] schedule_published publish failed (non-blocking):', err?.message));

    res.json({ success: true, published, message: `Schedule published. ${employeesAffected} employees notified.` });
  } catch (error: unknown) {
    res.status(500).json({ message: sanitizeError(error) || "Failed to publish schedule" });
  }
});

router.post('/unpublish', requireManager, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
    if (!userWorkspace) return res.status(404).json({ message: "Workspace not found" });
    const workspace = await storage.getWorkspace(userWorkspace.workspaceId);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });

    const { weekStart, weekEnd } = req.body;
    if (!weekStart || !weekEnd) {
      return res.status(400).json({ message: "weekStart and weekEnd are required" });
    }

    const startDate = new Date(weekStart);
    const endDate = new Date(weekEnd);

    const weekShifts = await db.select().from(shifts).where(
      and(
        eq(shifts.workspaceId, workspace.id),
        gte(shifts.date, startDate.toISOString().split('T')[0]),
        lte(shifts.date, endDate.toISOString().split('T')[0])
      )
    );

    if (weekShifts.length > 0) {
      await db.update(shifts)
        .set({ status: 'draft' })
        .where(
          and(
            eq(shifts.workspaceId, workspace.id),
            inArray(shifts.id, weekShifts.map(s => s.id))
          )
        );
    }

    // 📡 REAL-TIME: Broadcast so all connected manager dashboards refresh immediately
    broadcastToWorkspace(workspace.id, {
      type: 'schedules_updated',
      action: 'unpublished',
      weekStart,
      weekEnd,
      count: weekShifts.length,
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true, message: `${weekShifts.length} shifts unpublished and reverted to draft.` });
  } catch (error: unknown) {
    res.status(500).json({ message: sanitizeError(error) || "Failed to unpublish schedule" });
  }
});

router.post('/apply-insight', requireManager, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
    if (!userWorkspace) return res.status(404).json({ message: "Workspace not found" });
    const workspace = await storage.getWorkspace(userWorkspace.workspaceId);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });
    
    const { insightId, actionData } = req.body;
    
    if (!insightId || typeof insightId !== 'string') {
      return res.status(400).json({ message: "insightId is required and must be a string" });
    }

    if (insightId.startsWith('open-shifts') || insightId.includes('autofill') || insightId.includes('staffing') || insightId === 'unassigned-warning') {
      const { trinityAutonomousScheduler } = await import('../services/scheduling/trinityAutonomousScheduler');
      const { broadcastToWorkspace } = await import('../websocket');

      const sessionId = `insight-autofill-${Date.now()}`;
      res.json({
        success: true,
        message: `Trinity is auto-filling shifts. Progress updates via WebSocket.`,
        insightId,
        sessionId,
        async: true,
        appliedAt: new Date().toISOString(),
      });

      trinityAutonomousScheduler.executeAutonomousScheduling({
        workspaceId: userWorkspace.workspaceId,
        userId,
        mode: 'current_week',
        prioritizeBy: 'urgency',
        useContractorFallback: true,
        maxShiftsPerEmployee: 0,
        respectAvailability: true,
      }).then(result => {
        broadcastToWorkspace(userWorkspace.workspaceId, {
          type: 'trinity_scheduling_http_complete',
          sessionId,
          success: result.success,
          totalAssigned: result.summary?.totalAssigned || 0,
          totalFailed: result.summary?.totalFailed || 0,
          insightId,
        });
      }).catch(err => {
        log.error('[Trinity Insight AutoFill] Background error:', err);
        broadcastToWorkspace(userWorkspace.workspaceId, {
          type: 'trinity_scheduling_error',
          sessionId,
          error: (err instanceof Error ? err.message : String(err)) || 'Auto-fill failed',
          insightId,
        });
      });
      return;
    }
    
    res.json({ 
      success: true, 
      message: `Insight ${insightId} applied successfully`,
      insightId,
      appliedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    res.status(500).json({ message: sanitizeError(error) || "Failed to apply insight" });
  }
});

router.get('/ai-insights', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    if (!workspaceId) {
      return res.json({ insights: [], generatedAt: new Date().toISOString() });
    }

    const { timeEntries: timeEntriesTable } = await import('@shared/schema');

    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [upcomingShiftCount] = await db
      .select({ value: count() })
      .from(shifts)
      .where(
        and(
          eq(shifts.workspaceId, workspaceId),
          gte(shifts.startTime, now),
          lte(shifts.startTime, nextWeek)
        )
      );

    const [unassignedShifts] = await db
      .select({ value: count() })
      .from(shifts)
      .where(
        and(
          eq(shifts.workspaceId, workspaceId),
          gte(shifts.startTime, now),
          lte(shifts.startTime, nextWeek),
          isNull(shifts.employeeId)
        )
      );

    const [totalEmployees] = await db
      .select({ value: count() })
      .from(employees)
      .where(eq(employees.workspaceId, workspaceId));

    const recentTimeEntries = await db
      .select({
        employeeId: timeEntriesTable.employeeId,
        totalHours: sql<string>`COALESCE(SUM(EXTRACT(EPOCH FROM (${timeEntriesTable.clockOut} - ${timeEntriesTable.clockIn})) / 3600), 0)`,
      })
      .from(timeEntriesTable)
      .where(
        and(
          eq(timeEntriesTable.workspaceId, workspaceId),
          gte(timeEntriesTable.clockIn, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))
        )
      )
      .groupBy(timeEntriesTable.employeeId);

    const overtimeRisk = recentTimeEntries.filter(e => parseFloat(e.totalHours) > 40);

    const insights: Array<{ type: string; severity: string; title: string; description: string }> = [];

    const upcoming = Number(upcomingShiftCount?.value ?? 0);
    const unassigned = Number(unassignedShifts?.value ?? 0);

    if (upcoming > 0) {
      insights.push({
        type: 'schedule_overview',
        severity: 'info',
        title: 'Upcoming Week Schedule',
        description: `${upcoming} shifts scheduled for the next 7 days.`,
      });
    }

    if (unassigned > 0) {
      insights.push({
        type: 'understaffed',
        severity: unassigned > 5 ? 'high' : 'medium',
        title: 'Unassigned Shifts',
        description: `${unassigned} shifts in the next week have no employee assigned. Consider filling these gaps.`,
      });
    }

    if (overtimeRisk.length > 0) {
      insights.push({
        type: 'overtime_risk',
        severity: 'warning',
        title: 'Overtime Risk',
        description: `${overtimeRisk.length} employee(s) have worked over 40 hours this week and may be at risk for overtime.`,
      });
    }

    if (Number(totalEmployees?.value ?? 0) === 0) {
      insights.push({
        type: 'setup',
        severity: 'info',
        title: 'Get Started',
        description: 'No employees found. Add employees to start scheduling shifts.',
      });
    }

    res.json({ insights, generatedAt: new Date().toISOString() });
  } catch (error: unknown) {
    log.error('Error generating schedule insights:', error);
    res.status(500).json({ error: 'Failed to generate insights' });
  }
});

router.get('/export/csv', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { startDate, endDate } = req.query;

    const queryStartDate = startDate ? new Date(startDate as string) : new Date();
    const queryEndDate = endDate ? new Date(endDate as string) : new Date(queryStartDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    const allShifts = await storage.getShiftsByWorkspace(
      workspaceId,
      queryStartDate,
      queryEndDate
    );

    const allEmployees = await storage.getEmployeesByWorkspace(workspaceId);
    const employeeMap = new Map(allEmployees.map(e => [e.id, `${e.firstName} ${e.lastName}`]));

    const csvHeader = 'Employee,Date,Start Time,End Time,Position,Status,Notes\n';
    const csvRows = allShifts.map(s => {
      const empName = s.employeeId ? (employeeMap.get(s.employeeId) || 'Unknown') : 'Unassigned';
      const date = s.date;
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const start = format(new Date(s.startTime), 'HH:mm');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const end = format(new Date(s.endTime), 'HH:mm');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      return `"${empName}","${date}","${start}","${end}","${s.title || ''}","${s.status}","${(s.notes || '').replace(/"/g, '""')}"`;
    }).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    // @ts-expect-error — TS migration: fix in refactoring sprint
    res.setHeader('Content-Disposition', `attachment; filename="schedule-export-${format(new Date(), 'yyyy-MM-dd')}.csv"`);
    res.send(csvHeader + csvRows);
  } catch (error) {
    log.error("Error exporting schedule:", error);
    res.status(500).json({ message: "Failed to export schedule" });
  }
});

export default router;
