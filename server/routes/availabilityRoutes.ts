import { sanitizeError } from '../middleware/errorHandler';
import { z } from 'zod';
import { Router } from "express";
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
        startTime: z.string(),
        endTime: z.string(),
      })).min(1),
    });
    const slotsParsed = slotsSchema.safeParse(req.body);
    if (!slotsParsed.success) return res.status(400).json({ error: 'Validation failed', details: slotsParsed.error.flatten() });
    const { slots } = slotsParsed.data;
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
    const availUpdateSchema = z.object({
      dayOfWeek: z.number().int().min(0).max(6).optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      isAvailable: z.boolean().optional(),
      notes: z.string().max(500).optional(),
    }).strip();
    const availUpdateParsed = availUpdateSchema.safeParse(req.body);
    if (!availUpdateParsed.success) return res.status(400).json({ error: 'Validation failed', details: availUpdateParsed.error.flatten() });
    const updates = availUpdateParsed.data;
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
    // requestType MUST match availabilityService.createException's contract
    // ('vacation' | 'sick' | 'personal' | 'unpaid'). The UI in
    // client/src/pages/availability.tsx sends 'vacation' as the default —
    // a previous schema here used a different enum and silently rejected
    // every submission.
    const reqSchema = z.object({
      startDate: z.string().min(1),
      endDate: z.string().min(1),
      requestType: z.enum(['vacation', 'sick', 'personal', 'unpaid']),
      reason: z.string().max(1000).optional(),
      notes: z.string().max(500).optional(),
    });
    const reqParsed = reqSchema.safeParse(req.body);
    if (!reqParsed.success) return res.status(400).json({ error: 'Validation failed', details: reqParsed.error.flatten() });
    const { startDate, endDate, requestType, reason, notes } = reqParsed.data;
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
    const { employeeId, shiftDate, startTime, endTime } = req.body;
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
    const genSchema = z.object({
      startDate: z.string().min(1),
      endDate: z.string().min(1),
      shiftsPerDay: z.number().int().min(1).max(24).default(1),
      shiftDurationHours: z.number().min(1).max(24).default(8),
    });
    const genParsed = genSchema.safeParse(req.body);
    if (!genParsed.success) return res.status(400).json({ error: 'Validation failed', details: genParsed.error.flatten() });
    const { startDate, endDate, shiftsPerDay, shiftDurationHours } = genParsed.data;
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
