/**
 * AVAILABILITY SERVICE — CoAIleague Smart Scheduling Integration
 * 
 * Manages employee availability patterns, conflict detection, and team scheduling optimization.
 * Integrates with AI Brain for intelligent understaffing detection and schedule suggestions.
 */

import { db } from '../db';
import {
  employeeAvailability,
  timeOffRequests,
  employees,
  shifts,
  type EmployeeAvailability,
  type InsertEmployeeAvailability,
  type TimeOffRequest,
  type InsertTimeOffRequest,
} from '@shared/schema';
import { eq, and, or, gte, lte, desc, asc, sql, isNull, between } from 'drizzle-orm';
import { aiBrainService } from './ai-brain/aiBrainService';
import { createLogger } from '../lib/logger';
const log = createLogger('availabilityService');


export interface AvailabilitySlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  status?: 'available' | 'unavailable' | 'preferred' | 'limited';
  isRecurring?: boolean;
  effectiveFrom?: Date;
  effectiveUntil?: Date | null;
  notes?: string;
}

export interface ConflictResult {
  hasConflict: boolean;
  conflictType?: 'unavailable' | 'time_off' | 'outside_hours' | 'overlapping_shift';
  conflictDetails?: string;
  suggestedAlternatives?: AvailabilitySlot[];
}

export interface TeamAvailabilityOverview {
  employeeId: string;
  employeeName: string;
  availability: EmployeeAvailability[];
  timeOffRequests: TimeOffRequest[];
  totalAvailableHours: number;
}

export interface UnderstaffingAlert {
  dayOfWeek: number;
  date?: string;
  requiredStaff: number;
  availableStaff: number;
  gap: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  suggestions: string[];
}

class AvailabilityService {
  
  /**
   * Get employee's current availability
   */
  async getEmployeeAvailability(
    workspaceId: string,
    employeeId: string,
    includeExpired: boolean = false
  ): Promise<EmployeeAvailability[]> {
    const now = new Date();
    
    let query = db
      .select()
      .from(employeeAvailability)
      .where(
        and(
          eq(employeeAvailability.workspaceId, workspaceId),
          eq(employeeAvailability.employeeId, employeeId),
          includeExpired ? undefined : or(
            isNull(employeeAvailability.effectiveUntil),
            gte(employeeAvailability.effectiveUntil, now)
          )
        )
      )
      .orderBy(asc(employeeAvailability.dayOfWeek), asc(employeeAvailability.startTime));

    return await query;
  }

  /**
   * Create or update employee availability slots
   */
  async setEmployeeAvailability(
    workspaceId: string,
    employeeId: string,
    slots: AvailabilitySlot[]
  ): Promise<EmployeeAvailability[]> {
    // First, soft-expire existing availability (don't delete for audit trail)
    await db
      .update(employeeAvailability)
      .set({ effectiveUntil: new Date() })
      .where(
        and(
          eq(employeeAvailability.workspaceId, workspaceId),
          eq(employeeAvailability.employeeId, employeeId),
          isNull(employeeAvailability.effectiveUntil)
        )
      );

    // Insert new availability slots
    if (slots.length > 0) {
      const values = slots.map(slot => ({
        workspaceId,
        employeeId,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        status: slot.status || 'available',
        isRecurring: slot.isRecurring ?? true,
        notes: slot.notes || null,
        effectiveFrom: slot.effectiveFrom || new Date(),
        effectiveUntil: slot.effectiveUntil || null,
      }));

      await db.insert(employeeAvailability).values(values);
    }

    // Emit AI Brain event for availability change
    await this.emitAvailabilityChangeEvent(workspaceId, employeeId);

    return await this.getEmployeeAvailability(workspaceId, employeeId);
  }

  /**
   * Create a single availability slot
   */
  async createAvailabilitySlot(
    workspaceId: string,
    employeeId: string,
    slot: AvailabilitySlot
  ): Promise<EmployeeAvailability> {
    const [created] = await db
      .insert(employeeAvailability)
      .values({
        workspaceId,
        employeeId,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        status: slot.status || 'available',
        isRecurring: slot.isRecurring ?? true,
        notes: slot.notes || null,
        effectiveFrom: slot.effectiveFrom || new Date(),
        effectiveUntil: slot.effectiveUntil || null,
      })
      .returning();

    await this.emitAvailabilityChangeEvent(workspaceId, employeeId);

    return created;
  }

  /**
   * Update an existing availability slot
   */
  async updateAvailabilitySlot(
    workspaceId: string,
    slotId: string,
    updates: Partial<AvailabilitySlot>
  ): Promise<EmployeeAvailability | null> {
    const [updated] = await db
      .update(employeeAvailability)
      .set({
        ...(updates.dayOfWeek !== undefined && { dayOfWeek: updates.dayOfWeek }),
        ...(updates.startTime && { startTime: updates.startTime }),
        ...(updates.endTime && { endTime: updates.endTime }),
        ...(updates.status && { status: updates.status }),
        ...(updates.isRecurring !== undefined && { isRecurring: updates.isRecurring }),
        ...(updates.notes !== undefined && { notes: updates.notes }),
        ...(updates.effectiveFrom && { effectiveFrom: updates.effectiveFrom }),
        ...(updates.effectiveUntil !== undefined && { effectiveUntil: updates.effectiveUntil }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(employeeAvailability.id, slotId),
          eq(employeeAvailability.workspaceId, workspaceId)
        )
      )
      .returning();

    if (updated) {
      await this.emitAvailabilityChangeEvent(workspaceId, updated.employeeId);
    }

    return updated || null;
  }

  /**
   * Delete an availability slot
   */
  async deleteAvailabilitySlot(
    workspaceId: string,
    slotId: string
  ): Promise<boolean> {
    const [deleted] = await db
      .delete(employeeAvailability)
      .where(
        and(
          eq(employeeAvailability.id, slotId),
          eq(employeeAvailability.workspaceId, workspaceId)
        )
      )
      .returning();

    if (deleted) {
      await this.emitAvailabilityChangeEvent(workspaceId, deleted.employeeId);
      return true;
    }
    return false;
  }

  /**
   * Get team availability overview for managers
   */
  async getTeamAvailability(
    workspaceId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      employeeIds?: string[];
    }
  ): Promise<TeamAvailabilityOverview[]> {
    // Get all employees in workspace
    let employeeQuery = db
      .select({
        id: employees.id,
        name: sql<string>`COALESCE(${employees.firstName} || ' ' || ${employees.lastName}, ${employees.firstName}, 'Unknown')`,
      })
      .from(employees)
      .where(
        and(
          eq(employees.workspaceId, workspaceId),
          eq(employees.isActive, true)
        )
      );

    const workspaceEmployees = await employeeQuery;

    // Get availability for each employee
    const result: TeamAvailabilityOverview[] = [];

    for (const emp of workspaceEmployees) {
      if (options?.employeeIds && !options.employeeIds.includes(emp.id)) {
        continue;
      }

      const availability = await this.getEmployeeAvailability(workspaceId, emp.id);
      
      // Get time-off requests
      let timeOffQuery = db
        .select()
        .from(timeOffRequests)
        .where(
          and(
            eq(timeOffRequests.workspaceId, workspaceId),
            eq(timeOffRequests.employeeId, emp.id),
            eq(timeOffRequests.status, 'approved')
          )
        );

      if (options?.startDate && options?.endDate) {
        timeOffQuery = db
          .select()
          .from(timeOffRequests)
          .where(
            and(
              eq(timeOffRequests.workspaceId, workspaceId),
              eq(timeOffRequests.employeeId, emp.id),
              eq(timeOffRequests.status, 'approved'),
              lte(timeOffRequests.startDate, options.endDate),
              gte(timeOffRequests.endDate, options.startDate)
            )
          );
      }

      const timeOff = await timeOffQuery;

      // Calculate total available hours
      const totalAvailableHours = availability.reduce((total, slot) => {
        const start = this.parseTime(slot.startTime);
        const end = this.parseTime(slot.endTime);
        return total + (end - start);
      }, 0);

      result.push({
        employeeId: emp.id,
        employeeName: emp.name,
        availability,
        timeOffRequests: timeOff,
        totalAvailableHours,
      });
    }

    return result;
  }

  /**
   * Check for scheduling conflicts with employee availability
   */
  async checkConflict(
    workspaceId: string,
    employeeId: string,
    shiftDate: Date,
    shiftStartTime: string,
    shiftEndTime: string
  ): Promise<ConflictResult> {
    const dayOfWeek = shiftDate.getDay();

    // Get employee's availability for that day
    const availability = await db
      .select()
      .from(employeeAvailability)
      .where(
        and(
          eq(employeeAvailability.workspaceId, workspaceId),
          eq(employeeAvailability.employeeId, employeeId),
          eq(employeeAvailability.dayOfWeek, dayOfWeek),
          or(
            isNull(employeeAvailability.effectiveUntil),
            gte(employeeAvailability.effectiveUntil, shiftDate)
          ),
          lte(employeeAvailability.effectiveFrom, shiftDate)
        )
      );

    // Check if employee has marked as unavailable
    const unavailableSlots = availability.filter(a => a.status === 'unavailable');
    for (const slot of unavailableSlots) {
      if (this.timesOverlap(shiftStartTime, shiftEndTime, slot.startTime, slot.endTime)) {
        return {
          hasConflict: true,
          conflictType: 'unavailable',
          conflictDetails: `Employee marked unavailable from ${slot.startTime} to ${slot.endTime}`,
        };
      }
    }

    // Check if shift is within available hours
    const availableSlots = availability.filter(a => a.status === 'available' || a.status === 'preferred');
    if (availableSlots.length > 0) {
      const isWithinAvailability = availableSlots.some(slot =>
        this.isTimeWithin(shiftStartTime, shiftEndTime, slot.startTime, slot.endTime)
      );

      if (!isWithinAvailability) {
        return {
          hasConflict: true,
          conflictType: 'outside_hours',
          conflictDetails: 'Shift falls outside employee\'s available hours',
          suggestedAlternatives: availableSlots.map(s => ({
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            status: s.status as any,
          })),
        };
      }
    }

    // Check for time-off requests
    const timeOff = await db
      .select()
      .from(timeOffRequests)
      .where(
        and(
          eq(timeOffRequests.workspaceId, workspaceId),
          eq(timeOffRequests.employeeId, employeeId),
          eq(timeOffRequests.status, 'approved'),
          lte(timeOffRequests.startDate, shiftDate),
          gte(timeOffRequests.endDate, shiftDate)
        )
      );

    if (timeOff.length > 0) {
      return {
        hasConflict: true,
        conflictType: 'time_off',
        conflictDetails: `Employee has approved time off: ${timeOff[0].requestType}`,
      };
    }

    // Check for overlapping shifts
    const existingShifts = await db
      .select()
      .from(shifts)
      .where(
        and(
          eq(shifts.workspaceId, workspaceId),
          eq(shifts.employeeId, employeeId),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          eq(shifts.date, shiftDate)
        )
      );

    for (const existingShift of existingShifts) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      if (this.timesOverlap(shiftStartTime, shiftEndTime, existingShift.startTime, existingShift.endTime)) {
        return {
          hasConflict: true,
          conflictType: 'overlapping_shift',
          conflictDetails: `Overlaps with existing shift from ${existingShift.startTime} to ${existingShift.endTime}`,
        };
      }
    }

    return { hasConflict: false };
  }

  /**
   * Create an availability exception (one-time unavailability)
   */
  async createException(
    workspaceId: string,
    employeeId: string,
    data: {
      startDate: Date;
      endDate: Date;
      requestType: 'vacation' | 'sick' | 'personal' | 'unpaid';
      reason?: string;
      notes?: string;
    }
  ): Promise<TimeOffRequest> {
    // Calculate total days
    const msPerDay = 24 * 60 * 60 * 1000;
    const totalDays = Math.ceil((data.endDate.getTime() - data.startDate.getTime()) / msPerDay) + 1;

    const [request] = await db
      .insert(timeOffRequests)
      .values({
        workspaceId,
        employeeId,
        startDate: data.startDate,
        endDate: data.endDate,
        requestType: data.requestType,
        totalDays,
        reason: data.reason || null,
        notes: data.notes || null,
        status: 'pending',
        affectsScheduling: true,
      })
      .returning();

    // Emit AI Brain event
    await this.emitTimeOffRequestEvent(workspaceId, employeeId, request);

    return request;
  }

  /**
   * Detect understaffing based on availability patterns
   */
  async detectUnderstaffing(
    workspaceId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      minimumStaffPerDay?: number;
    }
  ): Promise<UnderstaffingAlert[]> {
    const minStaff = options?.minimumStaffPerDay || 3;
    const alerts: UnderstaffingAlert[] = [];

    // Get team availability
    const teamAvailability = await this.getTeamAvailability(workspaceId, {
      startDate: options?.startDate,
      endDate: options?.endDate,
    });

    // Analyze availability by day of week
    const dayStats: Map<number, number> = new Map();
    for (let day = 0; day < 7; day++) {
      dayStats.set(day, 0);
    }

    for (const emp of teamAvailability) {
      for (const slot of emp.availability) {
        if (slot.status === 'available' || slot.status === 'preferred') {
          const current = dayStats.get(slot.dayOfWeek) || 0;
          dayStats.set(slot.dayOfWeek, current + 1);
        }
      }
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Generate alerts for understaffed days
    for (const [day, availableStaff] of dayStats) {
      if (availableStaff < minStaff) {
        const gap = minStaff - availableStaff;
        let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
        
        if (availableStaff === 0) severity = 'critical';
        else if (gap >= minStaff / 2) severity = 'high';
        else if (gap >= 2) severity = 'medium';

        const suggestions: string[] = [];
        if (availableStaff === 0) {
          suggestions.push('Consider closing or reducing hours on this day');
          suggestions.push('Reach out to employees to request additional availability');
        } else {
          suggestions.push(`Need ${gap} more employee(s) available on ${dayNames[day]}`);
          suggestions.push('Consider offering incentives for this day');
        }

        alerts.push({
          dayOfWeek: day,
          requiredStaff: minStaff,
          availableStaff,
          gap,
          severity,
          suggestions,
        });
      }
    }

    // Sort by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return alerts;
  }

  /**
   * Suggest optimal schedule based on availability
   */
  async suggestOptimalSchedule(
    workspaceId: string,
    options: {
      startDate: Date;
      endDate: Date;
      shiftsPerDay?: number;
      shiftDurationHours?: number;
    }
  ): Promise<any> {
    const teamAvailability = await this.getTeamAvailability(workspaceId, {
      startDate: options.startDate,
      endDate: options.endDate,
    });

    // Use AI Brain for intelligent scheduling suggestions
    try {
      const result = await aiBrainService.enqueueJob({
        workspaceId,
        skill: 'scheduleos_generation',
        input: {
          teamAvailability,
          startDate: options.startDate,
          endDate: options.endDate,
          shiftsPerDay: options.shiftsPerDay || 2,
          shiftDurationHours: options.shiftDurationHours || 8,
        },
        // @ts-expect-error — TS migration: fix in refactoring sprint
        priority: 'medium',
      });

      return result.output;
    } catch (error) {
      log.error('[AvailabilityService] Failed to get AI schedule suggestion:', error);
      
      // Fallback to basic availability-based schedule
      return this.generateBasicSchedule(teamAvailability, options);
    }
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private parseTime(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours + minutes / 60;
  }

  private timesOverlap(
    start1: string,
    end1: string,
    start2: string,
    end2: string
  ): boolean {
    const s1 = this.parseTime(start1);
    const e1 = this.parseTime(end1);
    const s2 = this.parseTime(start2);
    const e2 = this.parseTime(end2);

    return s1 < e2 && e1 > s2;
  }

  private isTimeWithin(
    shiftStart: string,
    shiftEnd: string,
    availStart: string,
    availEnd: string
  ): boolean {
    const ss = this.parseTime(shiftStart);
    const se = this.parseTime(shiftEnd);
    const as = this.parseTime(availStart);
    const ae = this.parseTime(availEnd);

    return ss >= as && se <= ae;
  }

  private async emitAvailabilityChangeEvent(
    workspaceId: string,
    employeeId: string
  ): Promise<void> {
    try {
      await aiBrainService.enqueueJob({
        workspaceId,
        skill: 'business_insight',
        input: {
          insightType: 'operations',
          focusArea: 'availability_change',
          employeeId,
          timestamp: new Date().toISOString(),
        },
        priority: 'low',
      });
    } catch (error) {
      log.error('[AvailabilityService] Failed to emit availability change event:', error);
    }
  }

  private async emitTimeOffRequestEvent(
    workspaceId: string,
    employeeId: string,
    request: TimeOffRequest
  ): Promise<void> {
    try {
      await aiBrainService.enqueueJob({
        workspaceId,
        skill: 'business_insight',
        input: {
          insightType: 'operations',
          focusArea: 'time_off_request',
          employeeId,
          requestType: request.requestType,
          startDate: request.startDate,
          endDate: request.endDate,
          timestamp: new Date().toISOString(),
        },
        // @ts-expect-error — TS migration: fix in refactoring sprint
        priority: 'medium',
      });
    } catch (error) {
      log.error('[AvailabilityService] Failed to emit time-off request event:', error);
    }
  }

  private generateBasicSchedule(
    teamAvailability: TeamAvailabilityOverview[],
    options: {
      startDate: Date;
      endDate: Date;
      shiftsPerDay?: number;
      shiftDurationHours?: number;
    }
  ): any {
    const schedule: any[] = [];
    const shiftsPerDay = options.shiftsPerDay || 2;
    
    const currentDate = new Date(options.startDate);
    while (currentDate <= options.endDate) {
      const dayOfWeek = currentDate.getDay();
      
      // Find available employees for this day
      const availableEmployees = teamAvailability.filter(emp =>
        emp.availability.some(a => 
          a.dayOfWeek === dayOfWeek && 
          (a.status === 'available' || a.status === 'preferred')
        )
      );

      // Assign shifts based on availability
      const daySchedule = {
        date: new Date(currentDate),
        shifts: availableEmployees.slice(0, shiftsPerDay).map(emp => ({
          employeeId: emp.employeeId,
          employeeName: emp.employeeName,
          availability: emp.availability.find(a => a.dayOfWeek === dayOfWeek),
        })),
      };

      schedule.push(daySchedule);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return schedule;
  }
}

export const availabilityService = new AvailabilityService();
