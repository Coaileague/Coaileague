/**
 * Advanced Scheduling API Routes - Phase 2B
 * Recurring shifts, shift swapping, and schedule management
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth';
import { requireManager, requireOwner } from '../rbac';
import { requireProfessional } from '../tierGuards';
import { softDelete } from '../lib/softDelete';

const recurringPatternSchema = z.object({
  employeeId: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional().nullable(),
  category: z.string().optional().default('general'),
  startTimeOfDay: z.string().min(1, 'Start time is required'),
  endTimeOfDay: z.string().min(1, 'End time is required'),
  daysOfWeek: z.array(z.number().min(0).max(6)).min(1, 'At least one day is required'),
  recurrencePattern: z.enum(['daily', 'weekly', 'biweekly', 'monthly']).optional().default('weekly'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().optional().nullable(),
  skipDates: z.array(z.string()).optional().nullable(),
  billableToClient: z.boolean().optional().default(true),
  hourlyRateOverride: z.union([z.string(), z.number()]).optional().nullable(),
  generateShifts: z.boolean().optional().default(true),
});

const swapRequestSchema = z.object({
  targetEmployeeId: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
});

const swapResponseSchema = z.object({
  approved: z.boolean(),
  targetEmployeeId: z.string().optional().nullable(),
  responseMessage: z.string().optional().nullable(),
});

const duplicateWeekSchema = z.object({
  sourceWeekStart: z.string().min(1, 'Source week start is required'),
  targetWeekStart: z.string().min(1, 'Target week start is required'),
  includeAssignments: z.boolean().optional().default(true),
});

const generateRecurringSchema = z.object({
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  skipDates: z.array(z.string()).optional().nullable(),
});
import { 
  generateRecurringShifts,
  createRecurringPattern,
  getRecurringPatterns,
  getRecurringPatternById,
  deleteRecurringPattern,
  updateRecurringPattern,
  requestShiftSwap,
  approveShiftSwap,
  rejectShiftSwap,
  cancelSwapRequest,
  getSwapRequests,
  getSwapRequestById,
  getAvailableEmployeesForSwap,
  getAISuggestedSwapEmployees,
  updateSwapRequestWithAISuggestions,
  duplicateShift,
  duplicateWeekSchedule,
  copyWeekSchedule,
  detectRecurringConflicts,
  RecurrencePattern,
  DayOfWeek
} from '../services/advancedSchedulingService';
import '../types';
import { db } from '../db';
import { employees, shifts, scheduleTemplates } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { broadcastShiftUpdate, broadcastToWorkspace } from '../websocket';
import { platformEventBus } from '../services/platformEventBus';
import { createLogger } from '../lib/logger';
const log = createLogger('AdvancedSchedulingRoutes');

export const advancedSchedulingRouter = Router();

// Advanced scheduling features (recurring shifts, shift swapping, templates) require
// at minimum a Professional tier subscription. Free/Trial/Starter workspaces are blocked.
advancedSchedulingRouter.use(requireProfessional);

async function getEmployeeId(userId: string, workspaceId: string): Promise<string | null> {
  const employee = await db.query.employees.findFirst({
    where: and(
      eq(employees.userId, userId),
      eq(employees.workspaceId, workspaceId)
    ),
  });
  return employee?.id || null;
}

// ============================================================================
// RECURRING SHIFT PATTERNS
// ============================================================================

advancedSchedulingRouter.post('/recurring/:patternId/generate', requireManager, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { patternId } = req.params;
    const genParse = generateRecurringSchema.partial().safeParse(req.body);
    if (!genParse.success) {
      return res.status(400).json({ error: 'Validation failed', details: genParse.error.flatten().fieldErrors });
    }
    const { startDate, endDate, skipDates } = genParse.data;

    const pattern = await getRecurringPatternById(patternId, workspaceId);
    if (!pattern) {
      return res.status(404).json({ error: 'Pattern not found' });
    }

    const result = await generateRecurringShifts({
      template: {
        workspaceId,
        employeeId: pattern.employeeId || undefined,
        clientId: pattern.clientId || undefined,
        title: pattern.title,
        description: pattern.description || undefined,
        category: pattern.category || 'general',
        startTimeOfDay: pattern.startTimeOfDay,
        endTimeOfDay: pattern.endTimeOfDay,
        daysOfWeek: pattern.daysOfWeek as DayOfWeek[],
        recurrencePattern: pattern.recurrencePattern as RecurrencePattern,
        billableToClient: pattern.billableToClient ?? true,
        hourlyRateOverride: pattern.hourlyRateOverride ? Number(pattern.hourlyRateOverride) : undefined,
      },
      startDate: new Date(startDate || pattern.startDate),
      endDate: new Date(endDate || pattern.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
      skipDates: skipDates ? skipDates.map((d: string) => new Date(d)) : undefined,
      patternId,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Generate shifts from pattern error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to generate shifts' });
  }
});

// Legacy route for backwards compatibility
// ============================================================================
// SHIFT SWAP REQUESTS
// ============================================================================


// POST /swap-requests — create a new shift swap request
// Body: { shiftId, targetEmployeeId, reason }
advancedSchedulingRouter.post('/swap-requests', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    const userId = user?.id;
    if (!workspaceId || !userId) return res.status(400).json({ error: 'No workspace context' });

    const { shiftId, targetEmployeeId, reason } = req.body;
    if (!shiftId) return res.status(400).json({ error: 'shiftId is required' });
    if (!targetEmployeeId) return res.status(400).json({ error: 'targetEmployeeId is required' });

    const { shiftSwapRequests, shifts, employees } = await import('@shared/schema');
    const { db } = await import('../db');
    const { eq, and } = await import('drizzle-orm');

    // Validate shift belongs to this workspace
    const [shift] = await db.select().from(shifts)
      .where(and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId))).limit(1);
    if (!shift) return res.status(404).json({ error: 'Shift not found' });

    // Validate requesting employee
    const [reqEmployee] = await db.select().from(employees)
      .where(and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId))).limit(1);
    if (!reqEmployee) return res.status(404).json({ error: 'Employee record not found' });

    const [created] = await db.insert(shiftSwapRequests).values({
      workspaceId,
      shiftId,
      requestedById: reqEmployee.id,
      targetEmployeeId,
      reason: reason || null,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).returning();

    res.status(201).json({ success: true, swapRequest: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create swap request' });
  }
});

advancedSchedulingRouter.get('/swap-requests', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    const userId = user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const status = req.query.status as 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired' | undefined;
    const employeeIdFilter = req.query.employeeId as string | undefined;
    
    const employeeId = await getEmployeeId(userId, workspaceId);

    const requests = await getSwapRequests(workspaceId, {
      employeeId: employeeIdFilter || undefined,
      status,
    });

    res.json({
      success: true,
      requests,
    });
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Get swap requests error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

advancedSchedulingRouter.post('/swap-requests/:swapId/cancel', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
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
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Cancel swap error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// Approve a swap request (manager action)
advancedSchedulingRouter.post('/swap-requests/:swapId/approve', requireAuth, async (req: Request, res: Response) => {
  try {
    const { swapId } = req.params;
    const workspaceId = req.workspaceId || (req.user as any)?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
    const { shiftSwapRequests } = await import('@shared/schema');
    const { db } = await import('../db');
    const { eq, and } = await import('drizzle-orm');
    const [updated] = await db.update(shiftSwapRequests)
      .set({ status: 'approved', updatedAt: new Date() } as any)
      .where(and(eq(shiftSwapRequests.id, swapId), (shiftSwapRequests as any).workspaceId ? eq((shiftSwapRequests as any).workspaceId, workspaceId) : undefined))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Swap request not found' });
    res.json({ success: true, swapRequest: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to approve swap request' });
  }
});

// Reject a swap request (manager action)
advancedSchedulingRouter.post('/swap-requests/:swapId/reject', requireAuth, async (req: Request, res: Response) => {
  try {
    const { swapId } = req.params;
    const { reason } = req.body;
    const workspaceId = req.workspaceId || (req.user as any)?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
    const { shiftSwapRequests } = await import('@shared/schema');
    const { db } = await import('../db');
    const { eq, and } = await import('drizzle-orm');
    const [updated] = await db.update(shiftSwapRequests)
      .set({ status: 'rejected', updatedAt: new Date(), ...(reason ? { rejectionReason: reason } : {}) } as any)
      .where(and(eq(shiftSwapRequests.id, swapId), (shiftSwapRequests as any).workspaceId ? eq((shiftSwapRequests as any).workspaceId, workspaceId) : undefined))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Swap request not found' });
    res.json({ success: true, swapRequest: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to reject swap request' });
  }
});


// Legacy swap routes for backwards compatibility
// ============================================================================
// SHIFT DUPLICATION
// ============================================================================

advancedSchedulingRouter.post('/duplicate-week', requireManager, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const weekParse = duplicateWeekSchema.safeParse(req.body);
    if (!weekParse.success) {
      return res.status(400).json({ error: 'Validation failed', details: weekParse.error.flatten().fieldErrors });
    }
    const { sourceWeekStart, targetWeekStart, includeAssignments } = weekParse.data;
    const { employeeId, skipExisting } = req.body;

    const result = await duplicateWeekSchedule(
      workspaceId,
      new Date(sourceWeekStart),
      new Date(targetWeekStart),
      { employeeId, skipExisting: skipExisting !== false }
    );

    res.json({
      success: true,
      ...result,
    });
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Duplicate week error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ============================================================================
// SCHEDULE TEMPLATES
// ============================================================================

advancedSchedulingRouter.delete('/templates/:templateId', requireManager, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { templateId } = req.params;

    // TRINITY.md Section R / Law P1 — soft delete (template history retained)
    const [existing] = await db.select({ id: scheduleTemplates.id })
      .from(scheduleTemplates)
      .where(and(
        eq(scheduleTemplates.id, templateId),
        eq(scheduleTemplates.workspaceId, workspaceId),
      ))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    await softDelete({
      table: scheduleTemplates,
      where: and(eq(scheduleTemplates.id, templateId), eq(scheduleTemplates.workspaceId, workspaceId))!,
      userId: user?.id ?? 'unknown',
      workspaceId,
      entityType: 'schedule_template',
      entityId: templateId,
    });

    res.json({
      success: true,
      message: 'Template deleted',
    });
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Delete template error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});


// POST /shifts/:shiftId/duplicate — clone a single shift (new date, draft status, no employee)
advancedSchedulingRouter.post('/shifts/:shiftId/duplicate', requireManager, async (req: Request, res: Response) => {
  try {
    const { shiftId } = req.params;
    const workspaceId = req.workspaceId || (req.user as any)?.currentWorkspaceId;
    const { targetDate, startTime: newStart, endTime: newEnd } = req.body;
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
    const { shifts } = await import('@shared/schema');
    const { db } = await import('../db');
    const { eq, and } = await import('drizzle-orm');
    const [original] = await db.select().from(shifts)
      .where(and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId))).limit(1);
    if (!original) return res.status(404).json({ error: 'Shift not found' });
    // Build duplicate — reset assignment/status, optionally move to new date
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = original as any;
    const created = await db.insert(shifts).values({
      ...rest,
      workspaceId,
      status: 'draft',
      employeeId: null,
      startTime: newStart ? new Date(newStart) : targetDate ? new Date(targetDate) : original.startTime,
      endTime: newEnd ? new Date(newEnd) : targetDate ? new Date(targetDate) : original.endTime,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).returning();
    res.json({ success: true, shift: created[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to duplicate shift' });
  }
});
