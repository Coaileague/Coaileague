/**
 * Advanced Scheduling API Routes
 * Recurring shifts, shift swapping, and schedule management
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth';
import { requireWorkspaceRole, requireManager } from '../rbac';
import { 
  generateRecurringShifts,
  requestShiftSwap,
  respondToShiftSwap,
  getSwapRequests,
  cancelSwapRequest,
  getAvailableEmployeesForSwap,
  copyWeekSchedule,
  RecurrencePattern,
  DayOfWeek
} from '../services/advancedSchedulingService';
import { isFeatureEnabled } from '@shared/platformConfig';
import '../types';
import { db } from '../db';
import { employees } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

export const advancedSchedulingRouter = Router();

async function getEmployeeId(userId: string, workspaceId: string): Promise<string | null> {
  const employee = await db.query.employees.findFirst({
    where: and(
      eq(employees.userId, userId),
      eq(employees.workspaceId, workspaceId)
    ),
  });
  return employee?.id || null;
}

advancedSchedulingRouter.post('/recurring/generate', requireAuth, requireWorkspaceRole(['org_owner', 'org_admin']), async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const {
      employeeId,
      clientId,
      title,
      description,
      category,
      startTimeOfDay,
      endTimeOfDay,
      daysOfWeek,
      recurrencePattern,
      startDate,
      endDate,
      skipDates,
      billableToClient,
      hourlyRateOverride,
    } = req.body;

    if (!title || !startTimeOfDay || !endTimeOfDay || !daysOfWeek || !startDate || !endDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await generateRecurringShifts({
      template: {
        workspaceId,
        employeeId,
        clientId,
        title,
        description,
        category,
        startTimeOfDay,
        endTimeOfDay,
        daysOfWeek: daysOfWeek as DayOfWeek[],
        recurrencePattern: recurrencePattern as RecurrencePattern || 'weekly',
        billableToClient,
        hourlyRateOverride: hourlyRateOverride ? Number(hourlyRateOverride) : undefined,
      },
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      skipDates: skipDates ? skipDates.map((d: string) => new Date(d)) : undefined,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('[AdvancedScheduling] Generate recurring error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate shifts' });
  }
});

advancedSchedulingRouter.post('/swap/request', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;
    const userId = user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const employeeId = await getEmployeeId(userId, workspaceId);
    if (!employeeId) {
      return res.status(400).json({ error: 'No employee profile linked' });
    }

    const { shiftId, targetEmployeeId, reason } = req.body;

    if (!shiftId) {
      return res.status(400).json({ error: 'Shift ID is required' });
    }

    const swapRequest = await requestShiftSwap(
      workspaceId,
      shiftId,
      employeeId,
      targetEmployeeId,
      reason
    );

    res.json({
      success: true,
      swapRequest,
    });
  } catch (error: any) {
    console.error('[AdvancedScheduling] Request swap error:', error);
    res.status(500).json({ error: error.message });
  }
});

advancedSchedulingRouter.post('/swap/:swapId/respond', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;
    const userId = user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const employeeId = await getEmployeeId(userId, workspaceId);
    if (!employeeId) {
      return res.status(400).json({ error: 'No employee profile linked' });
    }

    const { swapId } = req.params;
    const { approved, responseMessage } = req.body;

    if (typeof approved !== 'boolean') {
      return res.status(400).json({ error: 'Approved status is required' });
    }

    const swapRequest = await respondToShiftSwap(
      workspaceId,
      swapId,
      employeeId,
      approved,
      responseMessage
    );

    res.json({
      success: true,
      swapRequest,
    });
  } catch (error: any) {
    console.error('[AdvancedScheduling] Respond swap error:', error);
    res.status(500).json({ error: error.message });
  }
});

advancedSchedulingRouter.get('/swap/requests', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;
    const userId = user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const employeeId = await getEmployeeId(userId, workspaceId);
    const status = req.query.status as string | undefined;

    const requests = await getSwapRequests(workspaceId, {
      employeeId: employeeId || undefined,
      status: status as any,
    });

    res.json({
      success: true,
      requests,
    });
  } catch (error: any) {
    console.error('[AdvancedScheduling] Get swap requests error:', error);
    res.status(500).json({ error: error.message });
  }
});

advancedSchedulingRouter.post('/swap/:swapId/cancel', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;
    const userId = user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const employeeId = await getEmployeeId(userId, workspaceId);
    if (!employeeId) {
      return res.status(400).json({ error: 'No employee profile linked' });
    }

    const { swapId } = req.params;

    const swapRequest = await cancelSwapRequest(workspaceId, swapId, employeeId);

    res.json({
      success: true,
      swapRequest,
    });
  } catch (error: any) {
    console.error('[AdvancedScheduling] Cancel swap error:', error);
    res.status(500).json({ error: error.message });
  }
});

advancedSchedulingRouter.get('/swap/:shiftId/available-employees', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { shiftId } = req.params;

    const employees = await getAvailableEmployeesForSwap(workspaceId, shiftId);

    res.json({
      success: true,
      employees,
    });
  } catch (error: any) {
    console.error('[AdvancedScheduling] Get available employees error:', error);
    res.status(500).json({ error: error.message });
  }
});

advancedSchedulingRouter.post('/copy-week', requireAuth, requireWorkspaceRole(['org_owner', 'org_admin']), async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { sourceWeekStart, targetWeekStart, employeeId } = req.body;

    if (!sourceWeekStart || !targetWeekStart) {
      return res.status(400).json({ error: 'Source and target week dates are required' });
    }

    const result = await copyWeekSchedule(
      workspaceId,
      new Date(sourceWeekStart),
      new Date(targetWeekStart),
      employeeId
    );

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('[AdvancedScheduling] Copy week error:', error);
    res.status(500).json({ error: error.message });
  }
});
