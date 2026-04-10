import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { db } from "../db";
import {
  shifts,
  capacityAlerts,
} from "@shared/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { requireAuth, requireManager, type AuthenticatedRequest } from "../rbac";
import { schedulingEnhancementsService } from "../services/scheduling/schedulingEnhancementsService";
import { createLogger } from '../lib/logger';
const log = createLogger('SchedulingInlineRoutes');


const router = Router();

// NOTE: POST /duplicate-week and POST /shifts/:shiftId/duplicate are intentionally
// NOT registered here. They are owned exclusively by advancedSchedulingRouter
// (server/routes/advancedSchedulingRoutes.ts), which is mounted first at
// /api/scheduling. Canonical source: advancedSchedulingRoutes.ts.

router.post('/generate-alerts', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const nextWeekStart = new Date();
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    nextWeekStart.setHours(0, 0, 0, 0);

    const { employees } = await import('@shared/schema');

    const allEmployees = await db
      .select()
      .from(employees as any)
      .where(eq((employees as any).workspaceId, workspaceId));

    const alerts: any[] = [];

    for (const employee of allEmployees) {
      const nextWeekEnd = new Date(nextWeekStart);
      nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
      
      const employeeShifts = await db
        .select()
        .from(shifts)
        .where(
          and(
            eq(shifts.employeeId, employee.id),
            gte(shifts.date, nextWeekStart.toISOString().split('T')[0]),
            lte(shifts.date, nextWeekEnd.toISOString().split('T')[0])
          )
        );
      
      let scheduledHours = 0;
      for (const shift of employeeShifts) {
        if (shift.startTime && shift.endTime) {
          const start = new Date(`1970-01-01T${shift.startTime}`);
          const end = new Date(`1970-01-01T${shift.endTime}`);
          scheduledHours += (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        }
      }
      
      const availableHours = 40;
      const overageHours = Math.max(0, scheduledHours - availableHours);

      if (overageHours > 0) {
        const [alert] = await db
          .insert(capacityAlerts)
          // @ts-expect-error — TS migration: fix in refactoring sprint
          .values({
            workspaceId,
            employeeId: employee.id,
            managerId: userId,
            alertType: 'over_allocated',
            severity: overageHours > 10 ? 'critical' : overageHours > 5 ? 'high' : 'medium',
            weekStartDate: nextWeekStart,
            scheduledHours: scheduledHours.toString(),
            availableHours: availableHours.toString(),
            overageHours: overageHours.toString(),
            message: `${employee.firstName} ${employee.lastName} is over-allocated by ${overageHours} hours next week`,
            suggestedAction: `Consider redistributing ${overageHours} hours to other team members or adjusting deadlines`,
            isActive: true,
          })
          .returning();

        alerts.push(alert);
      }
    }

    res.json({ 
      message: `Generated ${alerts.length} capacity alerts`,
      alerts 
    });
  } catch (error: unknown) {
    log.error("Error generating capacity alerts:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get('/alerts', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { status = 'active' } = req.query;

    const alerts = await db
      .select()
      .from(capacityAlerts)
      .where(
        and(
          eq(capacityAlerts.workspaceId, workspaceId),
          eq(capacityAlerts.status, status as string)
        )
      )
      .orderBy(desc(capacityAlerts.createdAt));

    res.json(alerts);
  } catch (error: unknown) {
    log.error("Error fetching capacity alerts:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get('/overtime-predictions', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID required' });

    const weekStart = req.query.weekStart ? new Date(req.query.weekStart as string) : undefined;
    const predictions = await schedulingEnhancementsService.predictOvertimeRisk(workspaceId, weekStart);

    res.json({
      success: true,
      weekStart: weekStart?.toISOString() || new Date().toISOString(),
      totalEmployeesAtRisk: predictions.length,
      predictions,
    });
  } catch (error: unknown) {
    log.error('Error fetching overtime predictions:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to fetch overtime predictions' });
  }
});

router.get('/consecutive-days-warnings', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID required' });

    const maxDays = req.query.maxDays ? parseInt(req.query.maxDays as string, 10) : 7;
    const warnings = await schedulingEnhancementsService.getConsecutiveDaysWarnings(workspaceId, maxDays);

    res.json({
      success: true,
      maxConsecutiveDays: maxDays,
      totalWarnings: warnings.length,
      warnings,
    });
  } catch (error: unknown) {
    log.error('Error fetching consecutive days warnings:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to fetch consecutive days warnings' });
  }
});

export default router;
