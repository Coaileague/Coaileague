/**
 * Advanced Scheduling Service
 * Handles recurring shifts, shift swapping, and schedule management
 */

import { db } from '../db';
import { shifts, employees } from '@shared/schema';
import { eq, and, gte, lte, desc, sql, or, isNull } from 'drizzle-orm';
import { addDays, addWeeks, addMonths, format, startOfWeek, endOfWeek, isSameDay } from 'date-fns';

export type RecurrencePattern = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

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
}

export interface ShiftSwapRequest {
  id: string;
  shiftId: string;
  requesterId: string;
  requesterName: string;
  targetEmployeeId?: string;
  targetEmployeeName?: string;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  reason?: string;
  responseMessage?: string;
  createdAt: Date;
  respondedAt?: Date;
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

export async function generateRecurringShifts(input: GenerateRecurringShiftsInput): Promise<{
  createdShifts: Array<{ id: string; startTime: Date; endTime: Date; employeeId: string | null }>;
  skippedDates: Date[];
  summary: { total: number; skipped: number };
}> {
  const { template, startDate, endDate, skipDates = [] } = input;
  
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
            category: (template.category as any) || 'general',
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

  return {
    createdShifts,
    skippedDates,
    summary: {
      total: createdShifts.length,
      skipped: skippedDates.length,
    },
  };
}

const swapRequestsStore: Map<string, ShiftSwapRequest> = new Map();

export async function requestShiftSwap(
  workspaceId: string,
  shiftId: string,
  requesterId: string,
  targetEmployeeId?: string,
  reason?: string
): Promise<ShiftSwapRequest> {
  const shift = await db.query.shifts.findFirst({
    where: and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId)),
    with: { employee: true },
  });

  if (!shift) {
    throw new Error('Shift not found');
  }

  if (shift.employeeId !== requesterId) {
    throw new Error('Only the assigned employee can request a swap');
  }

  const requester = await db.query.employees.findFirst({
    where: eq(employees.id, requesterId),
  });

  let targetEmployee = null;
  if (targetEmployeeId) {
    targetEmployee = await db.query.employees.findFirst({
      where: eq(employees.id, targetEmployeeId),
    });
  }

  const swapRequest: ShiftSwapRequest = {
    id: `swap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    shiftId,
    requesterId,
    requesterName: requester ? `${requester.firstName} ${requester.lastName}` : 'Unknown',
    targetEmployeeId: targetEmployeeId || undefined,
    targetEmployeeName: targetEmployee ? `${targetEmployee.firstName} ${targetEmployee.lastName}` : undefined,
    status: 'pending',
    reason,
    createdAt: new Date(),
  };

  swapRequestsStore.set(swapRequest.id, swapRequest);

  return swapRequest;
}

export async function respondToShiftSwap(
  workspaceId: string,
  swapRequestId: string,
  responderId: string,
  approved: boolean,
  responseMessage?: string
): Promise<ShiftSwapRequest> {
  const swapRequest = swapRequestsStore.get(swapRequestId);

  if (!swapRequest) {
    throw new Error('Swap request not found');
  }

  if (swapRequest.status !== 'pending') {
    throw new Error('Swap request has already been processed');
  }

  const shift = await db.query.shifts.findFirst({
    where: eq(shifts.id, swapRequest.shiftId),
  });

  if (!shift || shift.workspaceId !== workspaceId) {
    throw new Error('Shift not found');
  }

  swapRequest.status = approved ? 'approved' : 'denied';
  swapRequest.responseMessage = responseMessage;
  swapRequest.respondedAt = new Date();

  if (approved && swapRequest.targetEmployeeId) {
    await db.update(shifts)
      .set({
        employeeId: swapRequest.targetEmployeeId,
        updatedAt: new Date(),
      })
      .where(eq(shifts.id, swapRequest.shiftId));
  }

  swapRequestsStore.set(swapRequestId, swapRequest);

  return swapRequest;
}

export async function getSwapRequests(
  workspaceId: string,
  filters?: {
    employeeId?: string;
    status?: ShiftSwapRequest['status'];
  }
): Promise<ShiftSwapRequest[]> {
  const requests = Array.from(swapRequestsStore.values());
  
  let filtered = requests;

  if (filters?.employeeId) {
    filtered = filtered.filter(r => 
      r.requesterId === filters.employeeId || 
      r.targetEmployeeId === filters.employeeId
    );
  }

  if (filters?.status) {
    filtered = filtered.filter(r => r.status === filters.status);
  }

  return filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function cancelSwapRequest(
  workspaceId: string,
  swapRequestId: string,
  requesterId: string
): Promise<ShiftSwapRequest> {
  const swapRequest = swapRequestsStore.get(swapRequestId);

  if (!swapRequest) {
    throw new Error('Swap request not found');
  }

  if (swapRequest.requesterId !== requesterId) {
    throw new Error('Only the requester can cancel this request');
  }

  if (swapRequest.status !== 'pending') {
    throw new Error('Only pending requests can be cancelled');
  }

  swapRequest.status = 'cancelled';
  swapRequestsStore.set(swapRequestId, swapRequest);

  return swapRequest;
}

export async function getAvailableEmployeesForSwap(
  workspaceId: string,
  shiftId: string
): Promise<Array<{ id: string; name: string; isAvailable: boolean }>> {
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
      gte(shifts.startTime, shift.startTime),
      lte(shifts.startTime, shift.endTime)
    ),
  });

  const busyEmployeeIds = new Set(conflictingShifts.map(s => s.employeeId).filter(Boolean));

  return allEmployees
    .filter(e => e.id !== shift.employeeId)
    .map(e => ({
      id: e.id,
      name: `${e.firstName} ${e.lastName}`,
      isAvailable: !busyEmployeeIds.has(e.id),
    }));
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
  const sourceStart = startOfWeek(sourceWeekStart, { weekStartsOn: 1 });
  const sourceEnd = endOfWeek(sourceWeekStart, { weekStartsOn: 1 });

  const conditions = [
    eq(shifts.workspaceId, workspaceId),
    gte(shifts.startTime, sourceStart),
    lte(shifts.startTime, sourceEnd),
  ];

  if (employeeId) {
    conditions.push(eq(shifts.employeeId, employeeId));
  }

  const sourceShifts = await db.query.shifts.findMany({
    where: and(...conditions),
  });

  let copiedShifts = 0;
  let skippedShifts = 0;

  const targetStart = startOfWeek(targetWeekStart, { weekStartsOn: 1 });
  const dayDiff = Math.floor((targetStart.getTime() - sourceStart.getTime()) / (24 * 60 * 60 * 1000));

  for (const sourceShift of sourceShifts) {
    try {
      const newStartTime = addDays(sourceShift.startTime, dayDiff);
      const newEndTime = addDays(sourceShift.endTime, dayDiff);

      await db.insert(shifts).values({
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
      });

      copiedShifts++;
    } catch (error) {
      skippedShifts++;
    }
  }

  return { copiedShifts, skippedShifts };
}
