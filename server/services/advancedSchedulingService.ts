/**
 * Advanced Scheduling Service - Phase 2B
 * Handles recurring shifts, shift swapping, and schedule management with database persistence
 * Integrates with AI Brain for intelligent scheduling suggestions
 */

import { db } from '../db';
import { 
  shifts, 
  employees, 
  recurringShiftPatterns, 
  shiftSwapRequests,
  type Shift,
  type RecurringShiftPattern,
  type ShiftSwapRequest,
  type InsertRecurringShiftPattern,
  type InsertShiftSwapRequest
} from '@shared/schema';
import { eq, and, gte, lte, desc, sql, or, isNull, inArray } from 'drizzle-orm';
import { addDays, addWeeks, addMonths, format, startOfWeek, endOfWeek, isSameDay, parseISO } from 'date-fns';
import { platformEventBus } from './platformEventBus';
import { createLogger } from '../lib/logger';
const log = createLogger('advancedSchedulingService');


// Human-readable titles and descriptions for scheduling events
// These are used as fallbacks when AI enrichment fails
const schedulingEventMessages: Record<string, { title: string; description: string }> = {
  recurring_pattern_created: {
    title: 'Recurring Schedule Created',
    description: 'A new recurring shift pattern has been set up. Shifts will automatically generate based on this pattern.',
  },
  recurring_pattern_deleted: {
    title: 'Recurring Schedule Removed',
    description: 'A recurring shift pattern has been removed. Future auto-generated shifts from this pattern have been cancelled.',
  },
  shifts_generated: {
    title: 'Shifts Auto-Generated',
    description: 'New shifts have been automatically created from your recurring schedule patterns.',
  },
  swap_requested: {
    title: 'Shift Swap Requested',
    description: 'An employee has requested to swap their shift with another team member.',
  },
  swap_approved: {
    title: 'Shift Swap Approved',
    description: 'A shift swap has been approved. The schedule has been updated with the new assignments.',
  },
  swap_rejected: {
    title: 'Shift Swap Declined',
    description: 'A shift swap request was declined. The original schedule remains in place.',
  },
  swap_cancelled: {
    title: 'Shift Swap Cancelled',
    description: 'A shift swap request was cancelled by the requester.',
  },
  shift_duplicated: {
    title: 'Shift Copied Successfully',
    description: 'A shift has been duplicated to a new date. Review the schedule to confirm the new assignment.',
  },
  week_duplicated: {
    title: 'Week Schedule Copied',
    description: 'An entire week of shifts has been copied to a new week. Check the schedule for the duplicated assignments.',
  },
  conflict_detected: {
    title: 'Schedule Conflict Found',
    description: 'I detected a potential scheduling conflict that may need your attention.',
  },
};

async function emitSchedulingEvent(
  eventType: 'recurring_pattern_created' | 'recurring_pattern_deleted' | 'shifts_generated' | 
             'swap_requested' | 'swap_approved' | 'swap_rejected' | 'swap_cancelled' |
             'shift_duplicated' | 'week_duplicated' | 'conflict_detected',
  workspaceId: string,
  metadata: Record<string, any>
): Promise<void> {
  try {
    // Use human-readable messages as fallbacks when AI enrichment fails
    const messages = schedulingEventMessages[eventType] || {
      title: `Schedule ${eventType.replace(/_/g, ' ')}`,
      description: `A scheduling action was completed: ${eventType.replace(/_/g, ' ')}.`,
    };
    
    await platformEventBus.publish({
      type: 'automation_completed',
      category: 'improvement',
      title: messages.title,
      description: messages.description,
      workspaceId,
      metadata: {
        ...metadata,
        eventType,
        service: 'advancedScheduling',
        timestamp: new Date().toISOString(),
        // Provide context for AI enrichment
        schedulingContext: {
          action: eventType,
          targetDate: metadata.targetDate,
          employeeId: metadata.employeeId,
        },
      },
      visibility: 'manager',
    });
  } catch (error) {
    log.error(`[AdvancedScheduling] Failed to emit event ${eventType}:`, error);
  }
}

export type RecurrencePattern = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type DayOfWeek = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';

export interface RecurringShiftTemplate {
  workspaceId: string;
  employeeId?: string;
  clientId?: string;
  title: string;
  description?: string;
  category?: string;
  startTimeOfDay: string;
  endTimeOfDay: string;
  daysOfWeek: DayOfWeek[];
  recurrencePattern: RecurrencePattern;
  billableToClient?: boolean;
  hourlyRateOverride?: number;
}

export interface GenerateRecurringShiftsInput {
  template: RecurringShiftTemplate;
  startDate: Date;
  endDate: Date;
  skipDates?: Date[];
  patternId?: string;
}

const dayOfWeekMap: Record<DayOfWeek, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function parseTimeOfDay(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hours: hours || 0, minutes: minutes || 0 };
}

function setTimeOnDate(date: Date, timeStr: string): Date {
  const { hours, minutes } = parseTimeOfDay(timeStr);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

// ============================================================================
// RECURRING SHIFT PATTERNS
// ============================================================================

export async function createRecurringPattern(
  input: InsertRecurringShiftPattern & { createdBy?: string }
): Promise<RecurringShiftPattern> {
  const [pattern] = await db.insert(recurringShiftPatterns)
    .values({
      ...input,
      startDate: new Date(input.startDate),
      endDate: input.endDate ? new Date(input.endDate) : null,
    })
    .returning();
  
  log.info(`📅 [RecurringPattern] Created pattern ${pattern.id} for workspace ${pattern.workspaceId}`);
  
  await emitSchedulingEvent('recurring_pattern_created', pattern.workspaceId, {
    patternId: pattern.id,
    title: pattern.title,
    daysOfWeek: pattern.daysOfWeek,
    recurrencePattern: pattern.recurrencePattern,
    employeeId: pattern.employeeId,
  });
  
  return pattern;
}

export async function getRecurringPatterns(
  workspaceId: string,
  options?: { activeOnly?: boolean; employeeId?: string }
): Promise<RecurringShiftPattern[]> {
  const conditions = [eq(recurringShiftPatterns.workspaceId, workspaceId)];
  
  if (options?.activeOnly !== false) {
    conditions.push(eq(recurringShiftPatterns.isActive, true));
  }
  
  if (options?.employeeId) {
    conditions.push(eq(recurringShiftPatterns.employeeId, options.employeeId));
  }
  
  return db.query.recurringShiftPatterns.findMany({
    where: and(...conditions),
    orderBy: desc(recurringShiftPatterns.createdAt),
  });
}

export async function getRecurringPatternById(
  patternId: string,
  workspaceId: string
): Promise<RecurringShiftPattern | null> {
  const pattern = await db.query.recurringShiftPatterns.findFirst({
    where: and(
      eq(recurringShiftPatterns.id, patternId),
      eq(recurringShiftPatterns.workspaceId, workspaceId)
    ),
  });
  return pattern || null;
}

export async function deleteRecurringPattern(
  patternId: string,
  workspaceId: string,
  options?: { deleteFutureShifts?: boolean }
): Promise<{ deleted: boolean; shiftsDeleted: number }> {
  const pattern = await getRecurringPatternById(patternId, workspaceId);
  
  if (!pattern) {
    throw new Error('Pattern not found');
  }
  
  let shiftsDeleted = 0;

  await db.transaction(async (tx) => {
    if (options?.deleteFutureShifts) {
      const now = new Date();
      const result = await tx.delete(shifts)
        .where(and(
          eq(shifts.workspaceId, workspaceId),
          eq(shifts.title, pattern.title),
          gte(shifts.startTime, now)
        ))
        .returning();
      shiftsDeleted = result.length;
    }

    await tx.delete(recurringShiftPatterns)
      .where(eq(recurringShiftPatterns.id, patternId));
  });
  
  log.info(`📅 [RecurringPattern] Deleted pattern ${patternId}, ${shiftsDeleted} future shifts deleted`);
  
  await emitSchedulingEvent('recurring_pattern_deleted', workspaceId, {
    patternId,
    shiftsDeleted,
  });
  
  return { deleted: true, shiftsDeleted };
}

export async function updateRecurringPattern(
  patternId: string,
  workspaceId: string,
  updates: Partial<InsertRecurringShiftPattern>
): Promise<RecurringShiftPattern> {
  const [updated] = await db.update(recurringShiftPatterns)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(and(
      eq(recurringShiftPatterns.id, patternId),
      eq(recurringShiftPatterns.workspaceId, workspaceId)
    ))
    .returning();
  
  if (!updated) {
    throw new Error('Pattern not found');
  }
  
  return updated;
}

export async function generateRecurringShifts(input: GenerateRecurringShiftsInput): Promise<{
  createdShifts: Array<{ id: string; startTime: Date; endTime: Date; employeeId: string | null }>;
  skippedDates: Date[];
  summary: { total: number; skipped: number };
}> {
  const { template, startDate, endDate, skipDates = [], patternId } = input;
  
  const createdShifts: Array<{ id: string; startTime: Date; endTime: Date; employeeId: string | null }> = [];
  const skippedDates: Date[] = [];

  let currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay();
    const dayName = Object.entries(dayOfWeekMap).find(([_, num]) => num === dayOfWeek)?.[0] as DayOfWeek;

    if (template.daysOfWeek.includes(dayName)) {
      const shouldSkip = skipDates.some(sd => isSameDay(sd, currentDate));

      if (shouldSkip) {
        skippedDates.push(new Date(currentDate));
      } else {
        const shiftStartTime = setTimeOnDate(currentDate, template.startTimeOfDay);
        const shiftEndTime = setTimeOnDate(currentDate, template.endTimeOfDay);

        if (shiftEndTime < shiftStartTime) {
          shiftEndTime.setDate(shiftEndTime.getDate() + 1);
        }

        const [newShift] = await db.insert(shifts)
          .values({
            workspaceId: template.workspaceId,
            employeeId: template.employeeId || null,
            clientId: template.clientId || null,
            title: template.title,
            description: template.description || null,
            category: (template as any).category || 'general',
            startTime: shiftStartTime,
            endTime: shiftEndTime,
            billableToClient: template.billableToClient ?? true,
            hourlyRateOverride: template.hourlyRateOverride?.toString() || null,
            status: 'scheduled',
            aiGenerated: false,
          })
          .returning();

        createdShifts.push({
          id: newShift.id,
          startTime: newShift.startTime,
          endTime: newShift.endTime,
          employeeId: newShift.employeeId,
        });
      }
    }

    switch (template.recurrencePattern) {
      case 'daily':
        currentDate = addDays(currentDate, 1);
        break;
      case 'weekly':
        currentDate = addDays(currentDate, 1);
        break;
      case 'biweekly':
        if (dayOfWeek === 0) {
          currentDate = addWeeks(currentDate, 1);
        } else {
          currentDate = addDays(currentDate, 1);
        }
        break;
      case 'monthly':
        currentDate = addMonths(currentDate, 1);
        currentDate.setDate(startDate.getDate());
        break;
    }
  }

  if (patternId) {
    await db.update(recurringShiftPatterns)
      .set({
        lastGeneratedDate: new Date(),
        shiftsGenerated: sql`${recurringShiftPatterns.shiftsGenerated} + ${createdShifts.length}`,
        updatedAt: new Date(),
      })
      .where(eq(recurringShiftPatterns.id, patternId));
  }

  return {
    createdShifts,
    skippedDates,
    summary: {
      total: createdShifts.length,
      skipped: skippedDates.length,
    },
  };
}

// ============================================================================
// SHIFT SWAP REQUESTS - Database Persisted
// ============================================================================

export async function requestShiftSwap(
  workspaceId: string,
  shiftId: string,
  requesterId: string,
  targetEmployeeId?: string,
  reason?: string
): Promise<ShiftSwapRequest> {
  const shift = await db.query.shifts.findFirst({
    where: and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId)),
  });

  if (!shift) {
    throw new Error('Shift not found');
  }

  if (shift.employeeId !== requesterId) {
    throw new Error('Only the assigned employee can request a swap');
  }

  const existingPendingRequest = await db.query.shiftSwapRequests.findFirst({
    where: and(
      eq(shiftSwapRequests.shiftId, shiftId),
      eq(shiftSwapRequests.status, 'pending')
    ),
  });

  if (existingPendingRequest) {
    throw new Error('A pending swap request already exists for this shift');
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const [swapRequest] = await db.insert(shiftSwapRequests)
    .values({
      workspaceId,
      shiftId,
      requesterId,
      targetEmployeeId: targetEmployeeId || null,
      reason: reason || null,
      status: 'pending',
      expiresAt,
    })
    .returning();

  log.info(`🔄 [ShiftSwap] Request ${swapRequest.id} created for shift ${shiftId}`);

  await emitSchedulingEvent('swap_requested', workspaceId, {
    swapRequestId: swapRequest.id,
    shiftId,
    requesterId,
    targetEmployeeId: targetEmployeeId || null,
  });

  return swapRequest;
}

export async function approveShiftSwap(
  workspaceId: string,
  swapRequestId: string,
  responderId: string,
  targetEmployeeId?: string,
  responseMessage?: string
): Promise<ShiftSwapRequest> {
  const updated = await db.transaction(async (tx) => {
    const [swapRequest] = await tx.select()
      .from(shiftSwapRequests)
      .where(and(
        eq(shiftSwapRequests.id, swapRequestId),
        eq(shiftSwapRequests.workspaceId, workspaceId)
      ))
      .for('update')
      .limit(1);

    if (!swapRequest) {
      throw new Error('Swap request not found');
    }

    if (swapRequest.status !== 'pending') {
      throw new Error('Swap request has already been processed');
    }

    const finalTargetEmployeeId = targetEmployeeId || swapRequest.targetEmployeeId;

    if (!finalTargetEmployeeId) {
      throw new Error('Target employee must be specified for approval');
    }

    await tx.update(shifts)
      .set({
        employeeId: finalTargetEmployeeId,
        updatedAt: new Date(),
      })
      .where(eq(shifts.id, swapRequest.shiftId));

    const [result] = await tx.update(shiftSwapRequests)
      .set({
        status: 'approved',
        targetEmployeeId: finalTargetEmployeeId,
        respondedBy: responderId,
        responseMessage: responseMessage || null,
        respondedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(shiftSwapRequests.id, swapRequestId),
        eq(shiftSwapRequests.status, 'pending')
      ))
      .returning();

    if (!result) {
      throw new Error('Swap request was already processed by another user');
    }

    return result;
  });

  log.info(`[ShiftSwap] Request ${swapRequestId} approved, shift reassigned to ${updated.targetEmployeeId}`);

  await emitSchedulingEvent('swap_approved', workspaceId, {
    swapRequestId,
    shiftId: updated.shiftId,
    originalEmployeeId: updated.requesterId,
    newEmployeeId: updated.targetEmployeeId!,
    respondedBy: responderId,
  });

  return updated;
}

export async function rejectShiftSwap(
  workspaceId: string,
  swapRequestId: string,
  responderId: string,
  responseMessage?: string
): Promise<ShiftSwapRequest> {
  const swapRequest = await db.query.shiftSwapRequests.findFirst({
    where: and(
      eq(shiftSwapRequests.id, swapRequestId),
      eq(shiftSwapRequests.workspaceId, workspaceId)
    ),
  });

  if (!swapRequest) {
    throw new Error('Swap request not found');
  }

  if (swapRequest.status !== 'pending') {
    throw new Error('Swap request has already been processed');
  }

  const [updated] = await db.update(shiftSwapRequests)
    .set({
      status: 'rejected',
      respondedBy: responderId,
      responseMessage: responseMessage || null,
      respondedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(shiftSwapRequests.id, swapRequestId))
    .returning();

  log.info(`❌ [ShiftSwap] Request ${swapRequestId} rejected`);

  await emitSchedulingEvent('swap_rejected', workspaceId, {
    swapRequestId,
    shiftId: swapRequest.shiftId,
    requesterId: swapRequest.requesterId,
    respondedBy: responderId,
    responseMessage: responseMessage || null,
  });

  return updated;
}

export async function cancelSwapRequest(
  workspaceId: string,
  swapRequestId: string,
  requesterId: string
): Promise<ShiftSwapRequest> {
  const swapRequest = await db.query.shiftSwapRequests.findFirst({
    where: and(
      eq(shiftSwapRequests.id, swapRequestId),
      eq(shiftSwapRequests.workspaceId, workspaceId)
    ),
  });

  if (!swapRequest) {
    throw new Error('Swap request not found');
  }

  if (swapRequest.requesterId !== requesterId) {
    throw new Error('Only the requester can cancel this request');
  }

  if (swapRequest.status !== 'pending') {
    throw new Error('Only pending requests can be cancelled');
  }

  const [updated] = await db.update(shiftSwapRequests)
    .set({
      status: 'cancelled',
      updatedAt: new Date(),
    })
    .where(eq(shiftSwapRequests.id, swapRequestId))
    .returning();

  log.info(`🚫 [ShiftSwap] Request ${swapRequestId} cancelled by requester`);

  await emitSchedulingEvent('swap_cancelled', workspaceId, {
    swapRequestId,
    shiftId: swapRequest.shiftId,
    requesterId,
  });

  return updated;
}

export async function getSwapRequests(
  workspaceId: string,
  filters?: {
    employeeId?: string;
    status?: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';
    shiftId?: string;
  }
): Promise<Array<ShiftSwapRequest & { 
  shift?: Shift;
  requester?: { id: string; firstName: string | null; lastName: string | null };
  targetEmployee?: { id: string; firstName: string | null; lastName: string | null } | null;
}>> {
  const conditions = [eq(shiftSwapRequests.workspaceId, workspaceId)];

  if (filters?.status) {
    conditions.push(eq(shiftSwapRequests.status, filters.status));
  }

  if (filters?.employeeId) {
    conditions.push(
      or(
        eq(shiftSwapRequests.requesterId, filters.employeeId),
        eq(shiftSwapRequests.targetEmployeeId, filters.employeeId)
      )!
    );
  }

  if (filters?.shiftId) {
    conditions.push(eq(shiftSwapRequests.shiftId, filters.shiftId));
  }

  const requests = await db.query.shiftSwapRequests.findMany({
    where: and(...conditions),
    orderBy: desc(shiftSwapRequests.createdAt),
    with: {
      shift: true,
      requester: true,
      targetEmployee: true,
    },
  });

  return requests as any;
}

export async function getSwapRequestById(
  swapRequestId: string,
  workspaceId: string
): Promise<ShiftSwapRequest | null> {
  const request = await db.query.shiftSwapRequests.findFirst({
    where: and(
      eq(shiftSwapRequests.id, swapRequestId),
      eq(shiftSwapRequests.workspaceId, workspaceId)
    ),
  });
  return request || null;
}

export async function getAvailableEmployeesForSwap(
  workspaceId: string,
  shiftId: string
): Promise<Array<{ id: string; name: string; isAvailable: boolean; skills?: string[] }>> {
  const shift = await db.query.shifts.findFirst({
    where: and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId)),
  });

  if (!shift) {
    throw new Error('Shift not found');
  }

  const allEmployees = await db.query.employees.findMany({
    where: eq(employees.workspaceId, workspaceId),
  });

  const conflictingShifts = await db.query.shifts.findMany({
    where: and(
      eq(shifts.workspaceId, workspaceId),
      or(
        and(gte(shifts.startTime, shift.startTime), lte(shifts.startTime, shift.endTime)),
        and(gte(shifts.endTime, shift.startTime), lte(shifts.endTime, shift.endTime))
      )
    ),
  });

  const busyEmployeeIds = new Set(conflictingShifts.map(s => s.employeeId).filter(Boolean));

  return allEmployees
    .filter(e => e.id !== shift.employeeId)
    .map(e => ({
      id: e.id,
      name: `${e.firstName} ${e.lastName}`,
      isAvailable: !busyEmployeeIds.has(e.id),
      // @ts-expect-error — TS migration: fix in refactoring sprint
      skills: Array.isArray(e.skills) ? (e as any).skills : [],
    }));
}

// ============================================================================
// SHIFT DUPLICATION
// ============================================================================

export async function duplicateShift(
  workspaceId: string,
  shiftId: string,
  options: {
    targetDate: Date;
    targetEmployeeId?: string;
    copyNotes?: boolean;
  }
): Promise<Shift> {
  const sourceShift = await db.query.shifts.findFirst({
    where: and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId)),
  });

  if (!sourceShift) {
    throw new Error('Shift not found');
  }

  const sourceDate = new Date(sourceShift.startTime);
  const targetDate = new Date(options.targetDate);
  
  const daysDiff = Math.floor((targetDate.getTime() - sourceDate.getTime()) / (24 * 60 * 60 * 1000));
  
  const newStartTime = addDays(sourceShift.startTime, daysDiff);
  const newEndTime = addDays(sourceShift.endTime, daysDiff);

  const [newShift] = await db.insert(shifts)
    .values({
      workspaceId: sourceShift.workspaceId,
      employeeId: options.targetEmployeeId || sourceShift.employeeId,
      clientId: sourceShift.clientId,
      title: sourceShift.title,
      description: options.copyNotes ? sourceShift.description : null,
      category: sourceShift.category,
      startTime: newStartTime,
      endTime: newEndTime,
      billableToClient: sourceShift.billableToClient,
      hourlyRateOverride: sourceShift.hourlyRateOverride,
      status: 'scheduled',
      aiGenerated: false,
    })
    .returning();

  log.info(`📋 [ShiftDuplicate] Shift ${shiftId} duplicated to ${newShift.id} on ${format(newStartTime, 'yyyy-MM-dd')}`);

  await emitSchedulingEvent('shift_duplicated', workspaceId, {
    sourceShiftId: shiftId,
    newShiftId: newShift.id,
    targetDate: format(newStartTime, 'yyyy-MM-dd'),
    employeeId: newShift.employeeId,
  });

  return newShift;
}

export async function duplicateWeekSchedule(
  workspaceId: string,
  sourceWeekStart: Date,
  targetWeekStart: Date,
  options?: {
    employeeId?: string;
    skipExisting?: boolean;
  }
): Promise<{
  copiedShifts: number;
  skippedShifts: number;
  newShiftIds: string[];
}> {
  const sourceStart = startOfWeek(sourceWeekStart, { weekStartsOn: 1 });
  const sourceEnd = endOfWeek(sourceWeekStart, { weekStartsOn: 1 });

  const conditions = [
    eq(shifts.workspaceId, workspaceId),
    gte(shifts.startTime, sourceStart),
    lte(shifts.startTime, sourceEnd),
  ];

  if (options?.employeeId) {
    conditions.push(eq(shifts.employeeId, options.employeeId));
  }

  const sourceShifts = await db.query.shifts.findMany({
    where: and(...conditions),
  });

  let copiedShifts = 0;
  let skippedShifts = 0;
  const newShiftIds: string[] = [];

  const targetStart = startOfWeek(targetWeekStart, { weekStartsOn: 1 });
  const dayDiff = Math.floor((targetStart.getTime() - sourceStart.getTime()) / (24 * 60 * 60 * 1000));

  for (const sourceShift of sourceShifts) {
    try {
      const newStartTime = addDays(sourceShift.startTime, dayDiff);
      const newEndTime = addDays(sourceShift.endTime, dayDiff);

      if (options?.skipExisting) {
        const existingShift = await db.query.shifts.findFirst({
          where: and(
            eq(shifts.workspaceId, workspaceId),
            eq(shifts.employeeId, sourceShift.employeeId!),
            eq(shifts.startTime, newStartTime)
          ),
        });
        
        if (existingShift) {
          skippedShifts++;
          continue;
        }
      }

      const [newShift] = await db.insert(shifts).values({
        workspaceId: sourceShift.workspaceId,
        employeeId: sourceShift.employeeId,
        clientId: sourceShift.clientId,
        title: sourceShift.title,
        description: sourceShift.description,
        category: sourceShift.category,
        startTime: newStartTime,
        endTime: newEndTime,
        billableToClient: sourceShift.billableToClient,
        hourlyRateOverride: sourceShift.hourlyRateOverride,
        status: 'scheduled',
        aiGenerated: false,
      }).returning();

      newShiftIds.push(newShift.id);
      copiedShifts++;
    } catch (error) {
      skippedShifts++;
    }
  }

  log.info(`📅 [WeekDuplicate] Copied ${copiedShifts} shifts from ${format(sourceStart, 'yyyy-MM-dd')} to ${format(targetStart, 'yyyy-MM-dd')}`);

  await emitSchedulingEvent('week_duplicated', workspaceId, {
    sourceWeekStart: format(sourceStart, 'yyyy-MM-dd'),
    targetWeekStart: format(targetStart, 'yyyy-MM-dd'),
    copiedShifts,
    skippedShifts,
    employeeId: options?.employeeId || null,
  });

  return { copiedShifts, skippedShifts, newShiftIds };
}

export async function copyWeekSchedule(
  workspaceId: string,
  sourceWeekStart: Date,
  targetWeekStart: Date,
  employeeId?: string
): Promise<{
  copiedShifts: number;
  skippedShifts: number;
}> {
  const result = await duplicateWeekSchedule(workspaceId, sourceWeekStart, targetWeekStart, { employeeId });
  return {
    copiedShifts: result.copiedShifts,
    skippedShifts: result.skippedShifts,
  };
}

// ============================================================================
// AI-POWERED SWAP SUGGESTIONS
// ============================================================================

export async function getAISuggestedSwapEmployees(
  workspaceId: string,
  shiftId: string
): Promise<Array<{
  employeeId: string;
  employeeName: string;
  score: number;
  reasons: string[];
}>> {
  const availableEmployees = await getAvailableEmployeesForSwap(workspaceId, shiftId);
  
  const shift = await db.query.shifts.findFirst({
    where: eq(shifts.id, shiftId),
  });

  if (!shift) {
    return [];
  }

  return availableEmployees
    .filter(emp => emp.isAvailable)
    .map(emp => {
      const reasons: string[] = [];
      let score = 50;

      if (emp.isAvailable) {
        score += 20;
        reasons.push('Available during shift time');
      }

      if (emp.skills && emp.skills.length > 0) {
        score += 15;
        reasons.push(`Has ${emp.skills.length} relevant skills`);
      }

      score = Math.min(100, score);

      return {
        employeeId: emp.id,
        employeeName: emp.name,
        score,
        reasons,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export async function updateSwapRequestWithAISuggestions(
  swapRequestId: string,
  workspaceId: string
): Promise<ShiftSwapRequest> {
  const swapRequest = await getSwapRequestById(swapRequestId, workspaceId);
  
  if (!swapRequest) {
    throw new Error('Swap request not found');
  }

  const suggestions = await getAISuggestedSwapEmployees(workspaceId, swapRequest.shiftId);

  const [updated] = await db.update(shiftSwapRequests)
    .set({
      aiSuggestedEmployees: suggestions,
      aiProcessedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(shiftSwapRequests.id, swapRequestId))
    .returning();

  return updated;
}

// ============================================================================
// CONFLICT DETECTION
// ============================================================================

export async function detectRecurringConflicts(
  workspaceId: string,
  patternId: string,
  checkRange?: { start: Date; end: Date }
): Promise<Array<{
  date: Date;
  conflictingShiftId: string;
  conflictingEmployeeId: string;
  conflictType: 'overlap' | 'double_booking';
}>> {
  const pattern = await getRecurringPatternById(patternId, workspaceId);
  
  if (!pattern || !pattern.employeeId) {
    return [];
  }

  const start = checkRange?.start || new Date();
  const end = checkRange?.end || addMonths(new Date(), 1);

  const existingShifts = await db.query.shifts.findMany({
    where: and(
      eq(shifts.workspaceId, workspaceId),
      eq(shifts.employeeId, pattern.employeeId),
      gte(shifts.startTime, start),
      lte(shifts.startTime, end)
    ),
  });

  const conflicts: Array<{
    date: Date;
    conflictingShiftId: string;
    conflictingEmployeeId: string;
    conflictType: 'overlap' | 'double_booking';
  }> = [];

  let currentDate = new Date(start);
  while (currentDate <= end) {
    const dayOfWeek = currentDate.getDay();
    const dayName = Object.entries(dayOfWeekMap).find(([_, num]) => num === dayOfWeek)?.[0];
    
    if (pattern.daysOfWeek.includes(dayName as string)) {
      const patternStart = setTimeOnDate(currentDate, pattern.startTimeOfDay);
      const patternEnd = setTimeOnDate(currentDate, pattern.endTimeOfDay);
      
      for (const shift of existingShifts) {
        const shiftStart = new Date(shift.startTime);
        const shiftEnd = new Date(shift.endTime);
        
        if (
          (patternStart >= shiftStart && patternStart < shiftEnd) ||
          (patternEnd > shiftStart && patternEnd <= shiftEnd) ||
          (patternStart <= shiftStart && patternEnd >= shiftEnd)
        ) {
          if (isSameDay(patternStart, shiftStart)) {
            conflicts.push({
              date: currentDate,
              conflictingShiftId: shift.id,
              conflictingEmployeeId: shift.employeeId!,
              conflictType: 'overlap',
            });
          }
        }
      }
    }
    
    currentDate = addDays(currentDate, 1);
  }

  return conflicts;
}
