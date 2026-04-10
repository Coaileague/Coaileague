/**
 * Breaks Service - Labor Law Compliance & Automated Break Scheduling
 * Supports break requests, approvals, compliance monitoring, and auto-scheduling
 */

import { db } from "../db";
import { 
  timeEntries, 
  employees, 
  shifts, 
  laborLawRules, 
  scheduledBreaks,
  workspaces,
  timeEntryBreaks
} from "@shared/schema";
import { platformEventBus } from './platformEventBus';
import type { 
  LaborLawRule, 
  ScheduledBreak, 
  InsertScheduledBreak, 
  Shift,
  Workspace,
  TimeEntryBreak
} from "@shared/schema";
import { eq, and, desc, gte, lte, inArray, sql } from "drizzle-orm";
import { 
  US_LABOR_LAW_RULES, 
  getLaborLawRuleByJurisdiction, 
  getDefaultLaborLawRule,
  type LaborLawRuleConfig 
} from "@shared/config/laborLawConfig";

export interface BreakStatus {
  employeeId: string;
  employeeName: string;
  currentStatus: 'on-break' | 'not-on-break' | 'idle';
  breakStartedAt: Date | null;
  breakDuration: number;
  breakType: string;
  lastBreakEnd: Date | null;
  breaksTakenToday: number;
  totalBreakMinutesToday: number;
  complianceStatus: 'compliant' | 'at-risk' | 'non-compliant';
}

export interface CalculatedBreak {
  type: 'rest' | 'meal';
  suggestedStart: Date;
  suggestedEnd: Date;
  durationMinutes: number;
  isPaid: boolean;
  isRequired: boolean;
  description: string;
  legalReference?: string;
}

export interface BreakCalculationResult {
  shiftDurationHours: number;
  jurisdiction: string;
  jurisdictionName: string;
  requiredBreaks: CalculatedBreak[];
  optionalBreaks: CalculatedBreak[];
  totalRequiredBreakMinutes: number;
  totalPaidBreakMinutes: number;
  complianceNotes: string[];
  warnings: string[];
}

export interface ShiftComplianceResult {
  shiftId: string;
  employeeId: string;
  employeeName: string;
  shiftDate: string;
  shiftDurationHours: number;
  isCompliant: boolean;
  complianceScore: number;
  missingBreaks: CalculatedBreak[];
  scheduledBreaks: ScheduledBreak[];
  violations: string[];
  suggestions: string[];
}

/**
 * Get break status for an employee
 */
export async function getBreakStatus(
  workspaceId: string,
  employeeId: string
): Promise<BreakStatus | null> {
  const [employee] = await db
    .select()
    .from(employees)
    .where(and(
      eq(employees.id, employeeId),
      eq(employees.workspaceId, workspaceId)
    ));

  if (!employee) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todaysEntries = await db
    .select()
    .from(timeEntries)
    .where(and(
      eq(timeEntries.employeeId, employeeId),
      eq(timeEntries.workspaceId, workspaceId),
      gte(timeEntries.clockIn, today)
    ))
    .orderBy(desc(timeEntries.clockIn));

  let breaksTaken = 0;
  let totalBreakMinutes = 0;
  let lastBreakEnd: Date | null = null;

  const breakEntries = await db
    .select()
    .from(timeEntryBreaks)
    .where(and(
      inArray(timeEntryBreaks.timeEntryId, todaysEntries.map(te => te.id))
    ));

  for (const entry of breakEntries) {
    breaksTaken++;
    if (entry.endTime && entry.startTime) {
      const duration = (new Date(entry.endTime).getTime() - new Date(entry.startTime).getTime()) / (1000 * 60);
      totalBreakMinutes += duration;
      lastBreakEnd = new Date(entry.endTime);
    }
  }

  let complianceStatus: 'compliant' | 'at-risk' | 'non-compliant' = 'compliant';
  
  const totalWorkedMinutes = todaysEntries.reduce((sum, te) => {
    if (te.clockOut && te.clockIn) {
      return sum + (new Date(te.clockOut).getTime() - new Date(te.clockIn).getTime()) / (1000 * 60);
    }
    return sum;
  }, 0);

  if (totalWorkedMinutes > 480) {
    if (totalBreakMinutes < 30) {
      complianceStatus = 'non-compliant';
    } else if (totalBreakMinutes < 40) {
      complianceStatus = 'at-risk';
    }
  }

  let currentStatus: 'on-break' | 'not-on-break' | 'idle' = 'not-on-break';
  let breakStartedAt: Date | null = null;
  let breakDuration = 0;
  let breakType = 'short';

  if (todaysEntries.length > 0) {
    const lastEntry = todaysEntries[0];
    const activeBreak = breakEntries.find(be => be.timeEntryId === lastEntry.id && !be.endTime);
    
    if (!lastEntry.clockOut && activeBreak) {
      currentStatus = 'on-break';
      breakStartedAt = new Date(activeBreak.startTime);
      breakDuration = Math.round((Date.now() - new Date(activeBreak.startTime).getTime()) / (1000 * 60));
      breakType = activeBreak.breakType || 'short';
    } else if (lastEntry.clockOut) {
      const timeSinceLastEntry = Date.now() - new Date(lastEntry.clockOut).getTime();
      const minSinceLastEntry = timeSinceLastEntry / (1000 * 60);
      
      if (minSinceLastEntry > 30) {
        currentStatus = 'idle';
      }
    }
  }

  return {
    employeeId,
    employeeName: `${employee.firstName} ${employee.lastName}`,
    currentStatus,
    breakStartedAt,
    breakDuration,
    breakType,
    lastBreakEnd,
    breaksTakenToday: breaksTaken,
    totalBreakMinutesToday: totalBreakMinutes,
    complianceStatus,
  };
}

/**
 * Get break status for all employees in workspace
 */
export async function getWorkspaceBreakStatus(
  workspaceId: string
): Promise<BreakStatus[]> {
  const allEmployees = await db
    .select()
    .from(employees)
    .where(eq(employees.workspaceId, workspaceId));

  const statuses: BreakStatus[] = [];
  for (const emp of allEmployees) {
    const status = await getBreakStatus(workspaceId, emp.id);
    if (status) statuses.push(status);
  }

  return statuses;
}

/**
 * Get compliance report for workspace
 */
export async function getBreakComplianceReport(
  workspaceId: string
): Promise<{
  compliant: number;
  atRisk: number;
  nonCompliant: number;
  totalEmployees: number;
}> {
  const statuses = await getWorkspaceBreakStatus(workspaceId);

  return {
    compliant: statuses.filter(s => s.complianceStatus === 'compliant').length,
    atRisk: statuses.filter(s => s.complianceStatus === 'at-risk').length,
    nonCompliant: statuses.filter(s => s.complianceStatus === 'non-compliant').length,
    totalEmployees: statuses.length,
  };
}

/**
 * Get labor law rules for a workspace's jurisdiction
 */
export async function getWorkspaceLaborLawRules(
  workspaceId: string
): Promise<LaborLawRuleConfig> {
  const [workspace] = await db
    .select({ laborLawJurisdiction: workspaces.laborLawJurisdiction })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));

  const jurisdiction = workspace?.laborLawJurisdiction || 'US-FEDERAL';
  
  const dbRule = await db
    .select()
    .from(laborLawRules)
    .where(eq(laborLawRules.jurisdiction, jurisdiction))
    .limit(1);

  if (dbRule.length > 0) {
    const rule = dbRule[0];
    return {
      jurisdiction: rule.jurisdiction,
      jurisdictionName: rule.jurisdictionName,
      country: rule.country || 'US',
      restBreakEnabled: rule.restBreakEnabled ?? true,
      restBreakMinShiftHours: rule.restBreakMinShiftHours?.toString() || '4.00',
      restBreakDurationMinutes: rule.restBreakDurationMinutes ?? 10,
      restBreakIsPaid: rule.restBreakIsPaid ?? true,
      restBreakFrequencyHours: rule.restBreakFrequencyHours?.toString() || '4.00',
      mealBreakEnabled: rule.mealBreakEnabled ?? true,
      mealBreakMinShiftHours: rule.mealBreakMinShiftHours?.toString() || '5.00',
      mealBreakDurationMinutes: rule.mealBreakDurationMinutes ?? 30,
      mealBreakIsPaid: rule.mealBreakIsPaid ?? false,
      mealBreakMaxDelayHours: rule.mealBreakMaxDelayHours?.toString() || '5.00',
      mealBreakSecondThresholdHours: rule.mealBreakSecondThresholdHours?.toString() || '10.00',
      mealBreakWaiverAllowed: rule.mealBreakWaiverAllowed ?? false,
      mealBreakWaiverMaxShiftHours: rule.mealBreakWaiverMaxShiftHours?.toString() || '6.00',
      breakViolationPenalty: rule.breakViolationPenalty || undefined,
      penaltyPerViolation: rule.penaltyPerViolation?.toString() || undefined,
      legalReference: rule.legalReference || undefined,
      notes: rule.notes || undefined,
      isDefault: rule.isDefault ?? false,
    };
  }

  return getLaborLawRuleByJurisdiction(jurisdiction) || getDefaultLaborLawRule();
}

/**
 * Get labor law rules by jurisdiction code
 */
export async function getLaborLawRulesByJurisdiction(
  jurisdiction: string
): Promise<LaborLawRuleConfig | null> {
  const dbRule = await db
    .select()
    .from(laborLawRules)
    .where(eq(laborLawRules.jurisdiction, jurisdiction))
    .limit(1);

  if (dbRule.length > 0) {
    const rule = dbRule[0];
    return {
      jurisdiction: rule.jurisdiction,
      jurisdictionName: rule.jurisdictionName,
      country: rule.country || 'US',
      restBreakEnabled: rule.restBreakEnabled ?? true,
      restBreakMinShiftHours: rule.restBreakMinShiftHours?.toString() || '4.00',
      restBreakDurationMinutes: rule.restBreakDurationMinutes ?? 10,
      restBreakIsPaid: rule.restBreakIsPaid ?? true,
      restBreakFrequencyHours: rule.restBreakFrequencyHours?.toString() || '4.00',
      mealBreakEnabled: rule.mealBreakEnabled ?? true,
      mealBreakMinShiftHours: rule.mealBreakMinShiftHours?.toString() || '5.00',
      mealBreakDurationMinutes: rule.mealBreakDurationMinutes ?? 30,
      mealBreakIsPaid: rule.mealBreakIsPaid ?? false,
      mealBreakMaxDelayHours: rule.mealBreakMaxDelayHours?.toString() || '5.00',
      mealBreakSecondThresholdHours: rule.mealBreakSecondThresholdHours?.toString() || '10.00',
      mealBreakWaiverAllowed: rule.mealBreakWaiverAllowed ?? false,
      mealBreakWaiverMaxShiftHours: rule.mealBreakWaiverMaxShiftHours?.toString() || '6.00',
      breakViolationPenalty: rule.breakViolationPenalty || undefined,
      penaltyPerViolation: rule.penaltyPerViolation?.toString() || undefined,
      legalReference: rule.legalReference || undefined,
      notes: rule.notes || undefined,
      isDefault: rule.isDefault ?? false,
    };
  }

  return getLaborLawRuleByJurisdiction(jurisdiction) || null;
}

/**
 * Get all available labor law rules
 */
export async function getAllLaborLawRules(): Promise<LaborLawRuleConfig[]> {
  const dbRules = await db
    .select()
    .from(laborLawRules)
    .where(eq(laborLawRules.isActive, true));

  if (dbRules.length > 0) {
    return dbRules.map(rule => ({
      jurisdiction: rule.jurisdiction,
      jurisdictionName: rule.jurisdictionName,
      country: rule.country || 'US',
      restBreakEnabled: rule.restBreakEnabled ?? true,
      restBreakMinShiftHours: rule.restBreakMinShiftHours?.toString() || '4.00',
      restBreakDurationMinutes: rule.restBreakDurationMinutes ?? 10,
      restBreakIsPaid: rule.restBreakIsPaid ?? true,
      restBreakFrequencyHours: rule.restBreakFrequencyHours?.toString() || '4.00',
      mealBreakEnabled: rule.mealBreakEnabled ?? true,
      mealBreakMinShiftHours: rule.mealBreakMinShiftHours?.toString() || '5.00',
      mealBreakDurationMinutes: rule.mealBreakDurationMinutes ?? 30,
      mealBreakIsPaid: rule.mealBreakIsPaid ?? false,
      mealBreakMaxDelayHours: rule.mealBreakMaxDelayHours?.toString() || '5.00',
      mealBreakSecondThresholdHours: rule.mealBreakSecondThresholdHours?.toString() || '10.00',
      mealBreakWaiverAllowed: rule.mealBreakWaiverAllowed ?? false,
      mealBreakWaiverMaxShiftHours: rule.mealBreakWaiverMaxShiftHours?.toString() || '6.00',
      breakViolationPenalty: rule.breakViolationPenalty || undefined,
      penaltyPerViolation: rule.penaltyPerViolation?.toString() || undefined,
      legalReference: rule.legalReference || undefined,
      notes: rule.notes || undefined,
      isDefault: rule.isDefault ?? false,
    }));
  }

  return US_LABOR_LAW_RULES;
}

/**
 * Calculate required breaks for a shift based on labor law rules
 */
export function calculateRequiredBreaks(
  shiftStart: Date,
  shiftEnd: Date,
  rules: LaborLawRuleConfig
): BreakCalculationResult {
  const shiftDurationMs = shiftEnd.getTime() - shiftStart.getTime();
  const shiftDurationHours = shiftDurationMs / (1000 * 60 * 60);
  
  const requiredBreaks: CalculatedBreak[] = [];
  const optionalBreaks: CalculatedBreak[] = [];
  const complianceNotes: string[] = [];
  const warnings: string[] = [];

  const restBreakMinHours = parseFloat(rules.restBreakMinShiftHours) || 4;
  const restBreakFrequency = parseFloat(rules.restBreakFrequencyHours) || 4;
  const mealBreakMinHours = parseFloat(rules.mealBreakMinShiftHours) || 5;
  const mealBreakMaxDelay = parseFloat(rules.mealBreakMaxDelayHours) || 5;
  const secondMealThreshold = parseFloat(rules.mealBreakSecondThresholdHours) || 10;

  if (rules.mealBreakEnabled && shiftDurationHours >= mealBreakMinHours) {
    const mealBreakTime = Math.min(mealBreakMaxDelay, shiftDurationHours / 2);
    const mealBreakStart = new Date(shiftStart.getTime() + mealBreakTime * 60 * 60 * 1000);
    const mealBreakEnd = new Date(mealBreakStart.getTime() + rules.mealBreakDurationMinutes * 60 * 1000);

    requiredBreaks.push({
      type: 'meal',
      suggestedStart: mealBreakStart,
      suggestedEnd: mealBreakEnd,
      durationMinutes: rules.mealBreakDurationMinutes,
      isPaid: rules.mealBreakIsPaid,
      isRequired: true,
      description: `${rules.mealBreakDurationMinutes}-minute meal break`,
      legalReference: rules.legalReference,
    });

    complianceNotes.push(
      `Meal break required: ${rules.mealBreakDurationMinutes} minutes${rules.mealBreakIsPaid ? ' (paid)' : ' (unpaid)'}`
    );

    if (shiftDurationHours >= secondMealThreshold) {
      const secondMealTime = shiftDurationHours * 0.75;
      const secondMealStart = new Date(shiftStart.getTime() + secondMealTime * 60 * 60 * 1000);
      const secondMealEnd = new Date(secondMealStart.getTime() + rules.mealBreakDurationMinutes * 60 * 1000);

      requiredBreaks.push({
        type: 'meal',
        suggestedStart: secondMealStart,
        suggestedEnd: secondMealEnd,
        durationMinutes: rules.mealBreakDurationMinutes,
        isPaid: rules.mealBreakIsPaid,
        isRequired: true,
        description: `Second ${rules.mealBreakDurationMinutes}-minute meal break (shift over ${secondMealThreshold} hours)`,
        legalReference: rules.legalReference,
      });

      complianceNotes.push(`Second meal break required for shifts over ${secondMealThreshold} hours`);
    }
  }

  if (rules.restBreakEnabled && shiftDurationHours >= restBreakMinHours) {
    const numRestBreaks = Math.floor(shiftDurationHours / restBreakFrequency);
    
    for (let i = 0; i < numRestBreaks; i++) {
      const breakHour = (i + 1) * restBreakFrequency - 2;
      let restBreakStart = new Date(shiftStart.getTime() + breakHour * 60 * 60 * 1000);
      
      for (const mealBreak of requiredBreaks.filter(b => b.type === 'meal')) {
        const mealStart = mealBreak.suggestedStart.getTime();
        const mealEnd = mealBreak.suggestedEnd.getTime();
        const restStart = restBreakStart.getTime();
        const restEnd = restStart + rules.restBreakDurationMinutes * 60 * 1000;
        
        if ((restStart >= mealStart && restStart <= mealEnd) ||
            (restEnd >= mealStart && restEnd <= mealEnd)) {
          restBreakStart = new Date(mealEnd + 15 * 60 * 1000);
        }
      }
      
      const restBreakEnd = new Date(restBreakStart.getTime() + rules.restBreakDurationMinutes * 60 * 1000);

      if (restBreakEnd.getTime() <= shiftEnd.getTime()) {
        requiredBreaks.push({
          type: 'rest',
          suggestedStart: restBreakStart,
          suggestedEnd: restBreakEnd,
          durationMinutes: rules.restBreakDurationMinutes,
          isPaid: rules.restBreakIsPaid,
          isRequired: true,
          description: `${rules.restBreakDurationMinutes}-minute rest break`,
          legalReference: rules.legalReference,
        });
      }
    }

    if (numRestBreaks > 0) {
      complianceNotes.push(
        `Rest breaks: ${numRestBreaks} x ${rules.restBreakDurationMinutes} minutes${rules.restBreakIsPaid ? ' (paid)' : ' (unpaid)'}`
      );
    }
  }

  if (!rules.mealBreakEnabled && !rules.restBreakEnabled) {
    complianceNotes.push(`${rules.jurisdictionName} does not mandate breaks for adult employees`);
    
    if (shiftDurationHours >= 6) {
      const suggestedMealStart = new Date(shiftStart.getTime() + (shiftDurationHours / 2) * 60 * 60 * 1000);
      const suggestedMealEnd = new Date(suggestedMealStart.getTime() + 30 * 60 * 1000);
      
      optionalBreaks.push({
        type: 'meal',
        suggestedStart: suggestedMealStart,
        suggestedEnd: suggestedMealEnd,
        durationMinutes: 30,
        isPaid: false,
        isRequired: false,
        description: 'Recommended 30-minute meal break (not required by law)',
      });
    }
  }

  if (rules.breakViolationPenalty) {
    warnings.push(`Violation penalty: ${rules.breakViolationPenalty}`);
  }

  const totalRequiredBreakMinutes = requiredBreaks.reduce((sum, b) => sum + b.durationMinutes, 0);
  const totalPaidBreakMinutes = requiredBreaks
    .filter(b => b.isPaid)
    .reduce((sum, b) => sum + b.durationMinutes, 0);

  return {
    shiftDurationHours: Math.round(shiftDurationHours * 100) / 100,
    jurisdiction: rules.jurisdiction,
    jurisdictionName: rules.jurisdictionName,
    requiredBreaks,
    optionalBreaks,
    totalRequiredBreakMinutes,
    totalPaidBreakMinutes,
    complianceNotes,
    warnings,
  };
}

/**
 * Auto-schedule breaks for a shift and save to database
 */
export async function autoScheduleBreaks(
  workspaceId: string,
  shiftId: string,
  options?: {
    optimizeForCoverage?: boolean;
    otherShiftIds?: string[];
  }
): Promise<ScheduledBreak[]> {
  const [shift] = await db
    .select()
    .from(shifts)
    .where(and(
      eq(shifts.id, shiftId),
      eq(shifts.workspaceId, workspaceId)
    ));

  if (!shift || !shift.startTime || !shift.endTime) {
    throw new Error('Shift not found or missing start/end times');
  }

  const rules = await getWorkspaceLaborLawRules(workspaceId);
  const calculation = calculateRequiredBreaks(
    new Date(shift.startTime),
    new Date(shift.endTime),
    rules
  );

  const scheduledBreaksData: InsertScheduledBreak[] = calculation.requiredBreaks.map(brk => ({
    workspaceId,
    shiftId,
    employeeId: shift.employeeId || undefined,
    breakType: brk.type,
    scheduledStart: brk.suggestedStart,
    scheduledEnd: brk.suggestedEnd,
    durationMinutes: brk.durationMinutes,
    isPaid: brk.isPaid,
    jurisdiction: rules.jurisdiction,
    isRequired: brk.isRequired,
    complianceStatus: 'scheduled',
    aiOptimized: options?.optimizeForCoverage || false,
    notes: brk.description,
  }));

  const insertedBreaks: ScheduledBreak[] = [];
  for (const breakData of scheduledBreaksData) {
    const [inserted] = await db
      .insert(scheduledBreaks)
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .values(breakData)
      .returning();
    insertedBreaks.push(inserted);
  }

  return insertedBreaks;
}

/**
 * Get scheduled breaks for a shift
 */
export async function getScheduledBreaksForShift(
  workspaceId: string,
  shiftId: string
): Promise<ScheduledBreak[]> {
  return await db
    .select()
    .from(scheduledBreaks)
    .where(and(
      eq(scheduledBreaks.workspaceId, workspaceId),
      eq(scheduledBreaks.shiftId, shiftId)
    ))
    .orderBy(scheduledBreaks.scheduledStart);
}

/**
 * Check compliance of shifts in a date range
 */
export async function checkShiftCompliance(
  workspaceId: string,
  startDate: Date,
  endDate: Date
): Promise<ShiftComplianceResult[]> {
  const shiftsInRange = await db
    .select()
    .from(shifts)
    .where(and(
      eq(shifts.workspaceId, workspaceId),
      gte(shifts.startTime, startDate),
      lte(shifts.endTime, endDate)
    ));

  const rules = await getWorkspaceLaborLawRules(workspaceId);
  const results: ShiftComplianceResult[] = [];

  for (const shift of shiftsInRange) {
    if (!shift.startTime || !shift.endTime) continue;

    const shiftDurationMs = new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime();
    const shiftDurationHours = shiftDurationMs / (1000 * 60 * 60);

    const calculation = calculateRequiredBreaks(
      new Date(shift.startTime),
      new Date(shift.endTime),
      rules
    );

    const existingBreaks = await getScheduledBreaksForShift(workspaceId, shift.id);
    
    const violations: string[] = [];
    const missingBreaks: CalculatedBreak[] = [];
    const suggestions: string[] = [];

    for (const requiredBreak of calculation.requiredBreaks) {
      const matchingBreak = existingBreaks.find(eb => 
        eb.breakType === requiredBreak.type &&
        eb.durationMinutes >= requiredBreak.durationMinutes
      );

      if (!matchingBreak) {
        violations.push(`Missing required ${requiredBreak.type} break (${requiredBreak.durationMinutes} minutes)`);
        missingBreaks.push(requiredBreak);
      } else if (matchingBreak.complianceStatus === 'skipped') {
        violations.push(`${requiredBreak.type} break was skipped without waiver`);
      }
    }

    let employee = null;
    if (shift.employeeId) {
      [employee] = await db
        .select({ firstName: employees.firstName, lastName: employees.lastName })
        .from(employees)
        .where(eq(employees.id, shift.employeeId));
    }

    const isCompliant = violations.length === 0;
    const complianceScore = isCompliant ? 100 : Math.max(0, 100 - (violations.length * 25));

    if (!isCompliant) {
      suggestions.push('Auto-schedule breaks to ensure compliance');
      if (rules.mealBreakWaiverAllowed) {
        suggestions.push('Employee may sign a meal break waiver if eligible');
      }
    }

    results.push({
      shiftId: shift.id,
      employeeId: shift.employeeId || '',
      employeeName: employee ? `${employee.firstName} ${employee.lastName}` : 'Unassigned',
      shiftDate: new Date(shift.startTime).toISOString().split('T')[0],
      shiftDurationHours: Math.round(shiftDurationHours * 100) / 100,
      isCompliant,
      complianceScore,
      missingBreaks,
      scheduledBreaks: existingBreaks,
      violations,
      suggestions,
    });
  }

  const violationCount = results.filter(r => !r.isCompliant).length;
  if (violationCount > 0) {
    platformEventBus.publish({
      type: 'break_compliance_violations_detected',
      category: 'compliance',
      title: 'Break Compliance Violations Detected',
      description: `${violationCount} shift(s) have break compliance violations in workspace`,
      workspaceId,
      metadata: { totalShifts: results.length, violationCount, compliantShifts: results.length - violationCount },
    });
  }

  return results;
}

/**
 * Update workspace labor law jurisdiction
 */
export async function updateWorkspaceJurisdiction(
  workspaceId: string,
  jurisdiction: string,
  opts?: { autoBreakSchedulingEnabled?: boolean; breakComplianceAlerts?: boolean }
): Promise<Workspace> {
  const updates: Record<string, unknown> = {
    laborLawJurisdiction: jurisdiction,
    updatedAt: new Date(),
  };
  if (opts?.autoBreakSchedulingEnabled !== undefined) {
    updates.autoBreakSchedulingEnabled = opts.autoBreakSchedulingEnabled;
  }
  if (opts?.breakComplianceAlerts !== undefined) {
    updates.breakComplianceAlerts = opts.breakComplianceAlerts;
  }
  const [updated] = await db
    .update(workspaces)
    .set(updates as any)
    .where(eq(workspaces.id, workspaceId))
    .returning();

  return updated;
}

/**
 * Seed labor law rules from config to database
 */
export async function seedLaborLawRules(): Promise<number> {
  let seededCount = 0;

  for (const rule of US_LABOR_LAW_RULES) {
    const existing = await db
      .select({ id: laborLawRules.id })
      .from(laborLawRules)
      .where(eq(laborLawRules.jurisdiction, rule.jurisdiction))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(laborLawRules).values({
        jurisdiction: rule.jurisdiction,
        jurisdictionName: rule.jurisdictionName,
        country: rule.country,
        restBreakEnabled: rule.restBreakEnabled,
        restBreakMinShiftHours: rule.restBreakMinShiftHours,
        restBreakDurationMinutes: rule.restBreakDurationMinutes,
        restBreakIsPaid: rule.restBreakIsPaid,
        restBreakFrequencyHours: rule.restBreakFrequencyHours,
        mealBreakEnabled: rule.mealBreakEnabled,
        mealBreakMinShiftHours: rule.mealBreakMinShiftHours,
        mealBreakDurationMinutes: rule.mealBreakDurationMinutes,
        mealBreakIsPaid: rule.mealBreakIsPaid,
        mealBreakMaxDelayHours: rule.mealBreakMaxDelayHours,
        mealBreakSecondThresholdHours: rule.mealBreakSecondThresholdHours,
        mealBreakWaiverAllowed: rule.mealBreakWaiverAllowed,
        mealBreakWaiverMaxShiftHours: rule.mealBreakWaiverMaxShiftHours,
        breakViolationPenalty: rule.breakViolationPenalty,
        penaltyPerViolation: rule.penaltyPerViolation,
        legalReference: rule.legalReference,
        notes: rule.notes,
        isActive: true,
        isDefault: rule.isDefault,
      });
      seededCount++;
    }
  }

  return seededCount;
}

export const breaksService = {
  getBreakStatus,
  getWorkspaceBreakStatus,
  getBreakComplianceReport,
  getWorkspaceLaborLawRules,
  getLaborLawRulesByJurisdiction,
  getAllLaborLawRules,
  calculateRequiredBreaks,
  autoScheduleBreaks,
  getScheduledBreaksForShift,
  checkShiftCompliance,
  updateWorkspaceJurisdiction,
  seedLaborLawRules,
};
