import { sanitizeError } from '../middleware/errorHandler';
import { formatZodIssues } from '../middleware/validateRequest';
import { Router } from "express";
import { z } from 'zod';
import { db } from "../db";
import { employees } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireManager, type AuthenticatedRequest } from "../rbac";
import { createLogger } from '../lib/logger';
const log = createLogger('AvailabilityRoutes');


const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { includeExpired } = req.query;
    const { availabilityService } = await import("../services/availabilityService");

    const employee = await db
      .select()
      .from(employees)
      .where(and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.userId, userId)
      ))
      .limit(1);

    if (employee.length === 0) {
      return res.status(404).json({ message: 'Employee record not found' });
    }

    const availability = await availabilityService.getEmployeeAvailability(
      workspaceId,
      employee[0].id,
      includeExpired === 'true'
    );

    res.json(availability);
  } catch (error: unknown) {
    log.error('Error getting availability:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to get availability' });
  }
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const slotsSchema = z.object({
      slots: z.array(z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startTime: z.string().min(1),
        endTime: z.string().min(1),
        isAvailable: z.boolean().optional(),
      })).optional().default([]),
    });
    const parsed = slotsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request body', details: formatZodIssues(parsed.error) });
    const { slots } = parsed.data;
    const { availabilityService } = await import("../services/availabilityService");

    const employee = await db
      .select()
      .from(employees)
      .where(and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.userId, userId)
      ))
      .limit(1);

    if (employee.length === 0) {
      return res.status(404).json({ message: 'Employee record not found' });
    }

    const updated = await availabilityService.setEmployeeAvailability(
      workspaceId,
      employee[0].id,
      slots || []
    );

    res.json(updated);
  } catch (error: unknown) {
    log.error('Error submitting availability:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to submit availability' });
  }
});

router.put('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id } = req.params;
    const updateSlotSchema = z.object({
      dayOfWeek: z.number().int().min(0).max(6).optional(),
      startTime: z.string().min(1).optional(),
      endTime: z.string().min(1).optional(),
      isAvailable: z.boolean().optional(),
      notes: z.string().optional(),
    }).strict();
    const parsed = updateSlotSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request body', details: formatZodIssues(parsed.error) });
    const updates = parsed.data;
    const { availabilityService } = await import("../services/availabilityService");

    const updated = await availabilityService.updateAvailabilitySlot(workspaceId, id, updates);

    if (!updated) {
      return res.status(404).json({ message: 'Availability slot not found' });
    }

    res.json(updated);
  } catch (error: unknown) {
    log.error('Error updating availability:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to update availability' });
  }
});

router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id } = req.params;
    const { availabilityService } = await import("../services/availabilityService");

    const deleted = await availabilityService.deleteAvailabilitySlot(workspaceId, id);

    if (!deleted) {
      return res.status(404).json({ message: 'Availability slot not found' });
    }

    res.json({ success: true });
  } catch (error: unknown) {
    log.error('Error deleting availability:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to delete availability' });
  }
});

router.get('/team', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { startDate, endDate, employeeIds } = req.query;
    const { availabilityService } = await import("../services/availabilityService");

    const teamAvailability = await availabilityService.getTeamAvailability(workspaceId, {
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      employeeIds: employeeIds ? (employeeIds as string).split(',') : undefined,
    });

    res.json(teamAvailability);
  } catch (error: unknown) {
    log.error('Error getting team availability:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to get team availability' });
  }
});

router.post('/exception', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const exceptionSchema = z.object({
      startDate: z.string().min(1, 'startDate is required'),
      endDate: z.string().min(1, 'endDate is required'),
      requestType: z.enum(['time_off', 'unavailable', 'partial', 'preferred']).optional(),
      reason: z.string().optional(),
      notes: z.string().optional(),
    });
    const parsed = exceptionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request body', details: formatZodIssues(parsed.error) });
    const { startDate, endDate, requestType, reason, notes } = parsed.data;
    const { availabilityService } = await import("../services/availabilityService");

    const employee = await db
      .select()
      .from(employees)
      .where(and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.userId, userId)
      ))
      .limit(1);

    if (employee.length === 0) {
      return res.status(404).json({ message: 'Employee record not found' });
    }

    const exception = await availabilityService.createException(
      workspaceId,
      employee[0].id,
      {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        requestType,
        reason,
        notes,
      }
    );

    res.json(exception);
  } catch (error: unknown) {
    log.error('Error creating availability exception:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to create availability exception' });
  }
});

router.post('/check-conflict', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const conflictSchema = z.object({
      employeeId: z.string().min(1, 'employeeId is required'),
      shiftDate: z.string().min(1, 'shiftDate is required'),
      startTime: z.string().min(1, 'startTime is required'),
      endTime: z.string().min(1, 'endTime is required'),
    });
    const parsed = conflictSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request body', details: formatZodIssues(parsed.error) });
    const { employeeId, shiftDate, startTime, endTime } = parsed.data;
    const { availabilityService } = await import("../services/availabilityService");

    const conflict = await availabilityService.checkConflict(
      workspaceId,
      employeeId,
      new Date(shiftDate),
      startTime,
      endTime
    );

    res.json(conflict);
  } catch (error: unknown) {
    log.error('Error checking availability conflict:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to check conflict' });
  }
});

router.get('/understaffing', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { startDate, endDate, minimumStaff } = req.query;
    const { availabilityService } = await import("../services/availabilityService");

    const alerts = await availabilityService.detectUnderstaffing(workspaceId, {
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      minimumStaffPerDay: minimumStaff ? parseInt(minimumStaff as string) : undefined,
    });

    res.json(alerts);
  } catch (error: unknown) {
    log.error('Error detecting understaffing:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to detect understaffing' });
  }
});

router.post('/suggest-schedule', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const suggestSchema = z.object({
      startDate: z.string().min(1, 'startDate is required'),
      endDate: z.string().min(1, 'endDate is required'),
      shiftsPerDay: z.number().int().min(1).max(24).optional(),
      shiftDurationHours: z.number().min(0.5).max(24).optional(),
    });
    const parsed = suggestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request body', details: formatZodIssues(parsed.error) });
    const { startDate, endDate, shiftsPerDay, shiftDurationHours } = parsed.data;
    const { availabilityService } = await import("../services/availabilityService");

    const suggestion = await availabilityService.suggestOptimalSchedule(workspaceId, {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      shiftsPerDay,
      shiftDurationHours,
    });

    res.json(suggestion);
  } catch (error: unknown) {
    log.error('Error suggesting schedule:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to suggest schedule' });
  }
});

export default router;
