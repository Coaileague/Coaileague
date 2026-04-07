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
import { emitGamificationEvent } from '../services/gamification/eventTracker';
import { isFeatureEnabled as isGamificationEnabled } from '@shared/platformConfig';

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

advancedSchedulingRouter.post('/recurring', requireManager, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const parseResult = recurringPatternSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten().fieldErrors });
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
      generateShifts,
    } = parseResult.data;

    const pattern = await createRecurringPattern({
      workspaceId,
      employeeId: employeeId || null,
      clientId: clientId || null,
      title,
      description: description || null,
      category: category || 'general',
      startTimeOfDay,
      endTimeOfDay,
      daysOfWeek: daysOfWeek as DayOfWeek[],
      recurrencePattern: (recurrencePattern as RecurrencePattern) || 'weekly',
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      skipDates: skipDates ? skipDates.map((d: string) => new Date(d)) : null,
      billableToClient: billableToClient ?? true,
      hourlyRateOverride: hourlyRateOverride ? hourlyRateOverride.toString() : null,
      createdBy: user?.id,
      isActive: true,
    });

    let generatedShifts = null;
    if (generateShifts !== false) {
      const generateEndDate = endDate ? new Date(endDate) : new Date();
      if (!endDate) {
        generateEndDate.setMonth(generateEndDate.getMonth() + 1);
      }
      
      generatedShifts = await generateRecurringShifts({
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
          recurrencePattern: (recurrencePattern as RecurrencePattern) || 'weekly',
          billableToClient,
          hourlyRateOverride: hourlyRateOverride ? Number(hourlyRateOverride) : undefined,
        },
        startDate: new Date(startDate),
        endDate: generateEndDate,
        skipDates: skipDates ? skipDates.map((d: string) => new Date(d)) : undefined,
        patternId: pattern.id,
      });
    }

    broadcastToWorkspace(workspaceId, { type: 'schedules_updated', action: 'recurring_pattern_created', workspaceId });

    res.json({
      success: true,
      pattern,
      generatedShifts,
    });
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Create recurring pattern error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to create recurring pattern' });
  }
});

advancedSchedulingRouter.get('/recurring', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const activeOnly = req.query.activeOnly !== 'false';
    const employeeId = req.query.employeeId as string | undefined;

    const patterns = await getRecurringPatterns(workspaceId, { activeOnly, employeeId });

    res.json({
      success: true,
      patterns,
    });
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Get recurring patterns error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to get patterns' });
  }
});

advancedSchedulingRouter.get('/recurring/:patternId', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { patternId } = req.params;
    const pattern = await getRecurringPatternById(patternId, workspaceId);

    if (!pattern) {
      return res.status(404).json({ error: 'Pattern not found' });
    }

    res.json({
      success: true,
      pattern,
    });
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Get recurring pattern error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to get pattern' });
  }
});

advancedSchedulingRouter.patch('/recurring/:patternId', requireManager, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { patternId } = req.params;
    const updateSchema = recurringPatternSchema.partial();
    const updateParse = updateSchema.safeParse(req.body);
    if (!updateParse.success) {
      return res.status(400).json({ error: 'Validation failed', details: updateParse.error.flatten().fieldErrors });
    }
    const updates = updateParse.data;

    const pattern = await updateRecurringPattern(patternId, workspaceId, updates);

    res.json({
      success: true,
      pattern,
    });
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Update recurring pattern error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to update pattern' });
  }
});

advancedSchedulingRouter.delete('/recurring/:patternId', requireManager, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { patternId } = req.params;
    const deleteFutureShifts = req.query.deleteFutureShifts === 'true';

    const result = await deleteRecurringPattern(patternId, workspaceId, { deleteFutureShifts });

    broadcastToWorkspace(workspaceId, { type: 'schedules_updated', action: 'recurring_pattern_deleted', workspaceId });

    res.json({
      success: true,
      ...result,
    });
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Delete recurring pattern error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to delete pattern' });
  }
});

advancedSchedulingRouter.post('/recurring/:patternId/generate', requireManager, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
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

advancedSchedulingRouter.get('/recurring/:patternId/conflicts', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { patternId } = req.params;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    const conflicts = await detectRecurringConflicts(
      workspaceId,
      patternId,
      startDate && endDate ? { start: startDate, end: endDate } : undefined
    );

    res.json({
      success: true,
      conflicts,
    });
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Detect conflicts error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to detect conflicts' });
  }
});

// Legacy route for backwards compatibility
advancedSchedulingRouter.post('/recurring/generate', requireOwner, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
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
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Generate recurring error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to generate shifts' });
  }
});

// ============================================================================
// SHIFT SWAP REQUESTS
// ============================================================================

advancedSchedulingRouter.post('/shifts/:shiftId/swap-request', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    const userId = user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const employeeId = await getEmployeeId(userId, workspaceId);
    if (!employeeId) {
      return res.status(400).json({ error: 'No employee profile linked' });
    }

    const { shiftId } = req.params;
    const swapParse = swapRequestSchema.safeParse(req.body);
    if (!swapParse.success) {
      return res.status(400).json({ error: 'Validation failed', details: swapParse.error.flatten().fieldErrors });
    }
    const { targetEmployeeId, reason } = swapParse.data;

    const swapRequest = await requestShiftSwap(
      workspaceId,
      shiftId,
      employeeId,
      targetEmployeeId,
      reason
    );

    const suggestionsUpdated = await updateSwapRequestWithAISuggestions(swapRequest.id, workspaceId);

    broadcastToWorkspace(workspaceId, { type: 'schedules_updated', action: 'shift_swap_requested', workspaceId });

    platformEventBus.publish({
      type: 'shift_swap_requested',
      category: 'schedule',
      title: 'Shift Swap Requested',
      description: `Employee requested shift swap`,
      workspaceId,
      metadata: { swapRequestId: swapRequest.id, shiftId, requesterId: employeeId, targetEmployeeId, reason },
      visibility: 'supervisor',
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    res.json({
      success: true,
      swapRequest: suggestionsUpdated,
    });
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Request swap error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

advancedSchedulingRouter.get('/swap-requests', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
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

advancedSchedulingRouter.get('/swap-requests/:swapId', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { swapId } = req.params;
    const swapRequest = await getSwapRequestById(swapId, workspaceId);

    if (!swapRequest) {
      return res.status(404).json({ error: 'Swap request not found' });
    }

    res.json({
      success: true,
      swapRequest,
    });
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Get swap request error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

advancedSchedulingRouter.post('/swap-requests/:swapId/approve', requireManager, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    const userId = user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { swapId } = req.params;
    const { targetEmployeeId, responseMessage } = req.body;

    const swapRequest = await approveShiftSwap(
      workspaceId,
      swapId,
      userId,
      targetEmployeeId,
      responseMessage
    );

    // Gamification: Award points for shift swap participation
    if (isGamificationEnabled('enableGamification') && swapRequest) {
      try {
        // Award points to both employees involved in the swap
        const requesterId = swapRequest.requestingEmployeeId;
        const accepterId = swapRequest.targetEmployeeId;
        
        if (requesterId) {
          emitGamificationEvent('shift_swapped', {
            workspaceId,
            employeeId: requesterId,
            swapId,
            swappedWith: accepterId || undefined,
          });
        }
      } catch (gamError) {
        log.error('[AdvancedScheduling] Gamification shift_swapped failed (non-blocking):', gamError);
      }
    }

    broadcastToWorkspace(workspaceId, { type: 'schedules_updated', action: 'shift_swap_approved', workspaceId });

    platformEventBus.publish({
      type: 'shift_swap_approved',
      category: 'schedule',
      title: 'Shift Swap Approved',
      description: 'Shift swap request approved by manager',
      workspaceId,
      metadata: { swapRequestId: swapId },
      visibility: 'supervisor',
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    res.json({
      success: true,
      swapRequest,
    });
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Approve swap error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

advancedSchedulingRouter.post('/swap-requests/:swapId/reject', requireManager, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    const userId = user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { swapId } = req.params;
    const { responseMessage } = req.body;

    const swapRequest = await rejectShiftSwap(
      workspaceId,
      swapId,
      userId,
      responseMessage
    );

    broadcastToWorkspace(workspaceId, { type: 'schedules_updated', action: 'shift_swap_rejected', workspaceId });

    platformEventBus.publish({
      type: 'shift_swap_denied',
      category: 'schedule',
      title: 'Shift Swap Denied',
      description: 'Shift swap request rejected by manager',
      workspaceId,
      metadata: { swapRequestId: swapId, responseMessage },
      visibility: 'supervisor',
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    res.json({
      success: true,
      swapRequest,
    });
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Reject swap error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

advancedSchedulingRouter.post('/swap-requests/:swapId/cancel', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
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

advancedSchedulingRouter.get('/shifts/:shiftId/available-employees', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { shiftId } = req.params;

    const availableEmployees = await getAvailableEmployeesForSwap(workspaceId, shiftId);

    res.json({
      success: true,
      employees: availableEmployees,
    });
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Get available employees error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

advancedSchedulingRouter.get('/shifts/:shiftId/ai-suggestions', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { shiftId } = req.params;

    const suggestions = await getAISuggestedSwapEmployees(workspaceId, shiftId);

    res.json({
      success: true,
      suggestions,
    });
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Get AI suggestions error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// Legacy swap routes for backwards compatibility
advancedSchedulingRouter.post('/swap/request', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
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
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Request swap error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

advancedSchedulingRouter.post('/swap/:swapId/respond', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    const userId = user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { swapId } = req.params;
    const { approved, responseMessage, targetEmployeeId } = req.body;

    if (typeof approved !== 'boolean') {
      return res.status(400).json({ error: 'Approved status is required' });
    }

    let swapRequest;
    if (approved) {
      swapRequest = await approveShiftSwap(workspaceId, swapId, userId, targetEmployeeId, responseMessage);
    } else {
      swapRequest = await rejectShiftSwap(workspaceId, swapId, userId, responseMessage);
    }

    res.json({
      success: true,
      swapRequest,
    });
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Respond swap error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

advancedSchedulingRouter.get('/swap/requests', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    const userId = user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const employeeId = await getEmployeeId(userId, workspaceId);
    const status = req.query.status as 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired' | undefined;

    const requests = await getSwapRequests(workspaceId, {
      employeeId: employeeId || undefined,
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

advancedSchedulingRouter.post('/swap/:swapId/cancel', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
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

advancedSchedulingRouter.get('/swap/:shiftId/available-employees', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { shiftId } = req.params;

    const availableEmployees = await getAvailableEmployeesForSwap(workspaceId, shiftId);

    res.json({
      success: true,
      employees: availableEmployees,
    });
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Get available employees error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ============================================================================
// SHIFT DUPLICATION
// ============================================================================

advancedSchedulingRouter.post('/shifts/:shiftId/duplicate', requireManager, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { shiftId } = req.params;
    const { targetDate, targetEmployeeId, copyNotes } = req.body;

    if (!targetDate) {
      return res.status(400).json({ error: 'Target date is required' });
    }

    const newShift = await duplicateShift(workspaceId, shiftId, {
      targetDate: new Date(targetDate),
      targetEmployeeId,
      copyNotes: copyNotes !== false,
    });

    res.json({
      success: true,
      shift: newShift,
    });
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Duplicate shift error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

advancedSchedulingRouter.post('/duplicate-week', requireManager, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
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

advancedSchedulingRouter.post('/copy-week', requireOwner, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
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
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Copy week error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ============================================================================
// SCHEDULE TEMPLATES
// ============================================================================

advancedSchedulingRouter.get('/templates', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const templates = await db.query.scheduleTemplates.findMany({
      where: eq(scheduleTemplates.workspaceId, workspaceId),
      orderBy: (scheduleTemplates, { desc }) => [desc(scheduleTemplates.createdAt)],
    });

    res.json(templates);
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Get templates error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

advancedSchedulingRouter.post('/templates', requireManager, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    const userId = user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { name, description, shifts } = req.body;

    if (!name || !shifts || !Array.isArray(shifts)) {
      return res.status(400).json({ error: 'Name and shifts array are required' });
    }

    const [template] = await db.insert(scheduleTemplates).values({
      workspaceId,
      name,
      description: description || null,
      shiftPatterns: shifts,
      createdBy: userId,
    }).returning();

    res.json({
      success: true,
      template,
    });
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Create template error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

advancedSchedulingRouter.get('/templates/:templateId', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { templateId } = req.params;

    const template = await db.query.scheduleTemplates.findFirst({
      where: and(
        eq(scheduleTemplates.id, templateId),
        eq(scheduleTemplates.workspaceId, workspaceId)
      ),
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({
      success: true,
      template,
    });
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Get template error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

advancedSchedulingRouter.delete('/templates/:templateId', requireManager, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { templateId } = req.params;

    const [deleted] = await db.delete(scheduleTemplates)
      .where(and(
        eq(scheduleTemplates.id, templateId),
        eq(scheduleTemplates.workspaceId, workspaceId)
      ))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({
      success: true,
      message: 'Template deleted',
    });
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Delete template error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

advancedSchedulingRouter.patch('/templates/:templateId', requireManager, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { templateId } = req.params;
    const { name, description, shifts } = req.body;

    const updates: any = { updatedAt: new Date() };
    if (name) updates.name = name;
    if (description !== undefined) updates.description = description || null;
    if (shifts) updates.shiftPatterns = shifts;

    const [updated] = await db.update(scheduleTemplates)
      .set(updates)
      .where(and(
        eq(scheduleTemplates.id, templateId),
        eq(scheduleTemplates.workspaceId, workspaceId)
      ))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({
      success: true,
      template: updated,
    });
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Update template error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

advancedSchedulingRouter.post('/templates/:templateId/apply', requireManager, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { templateId } = req.params;
    const { targetDate } = req.body;

    if (!targetDate) {
      return res.status(400).json({ error: 'Target date is required' });
    }

    const template = await db.query.scheduleTemplates.findFirst({
      where: and(
        eq(scheduleTemplates.id, templateId),
        eq(scheduleTemplates.workspaceId, workspaceId)
      ),
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Increment usage count
    await db.update(scheduleTemplates)
      .set({ usageCount: (template.usageCount || 0) + 1 })
      .where(eq(scheduleTemplates.id, templateId));

    res.json({
      success: true,
      template,
      message: 'Template applied - shifts should be created by the frontend',
    });
  } catch (error: unknown) {
    log.error('[AdvancedScheduling] Apply template error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});
