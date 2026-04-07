import { db } from '../../db';
import {
  shifts,
  timeEntries,
  employees,
  clients,
  employeeSkills
} from '@shared/schema';
import { eq, and, gte, lte, sql, isNull, isNotNull } from 'drizzle-orm';

interface ConsecutiveDaysWarning {
  employeeId: string;
  employeeName: string;
  consecutiveDays: number;
  startDate: string;
  endDate: string;
  severity: 'warning' | 'block';
}

interface OvertimePrediction {
  employeeId: string;
  employeeName: string;
  actualHoursWorked: number;
  scheduledRemainingHours: number;
  projectedTotalHours: number;
  overtimeHours: number;
  risk: 'low' | 'medium' | 'high' | 'critical';
}

interface CertificationCheckResult {
  eligible: boolean;
  reasons: string[];
  expiringWithin30Days: string[];
  expired: string[];
  missing: string[];
}

class SchedulingEnhancementsService {
  private static instance: SchedulingEnhancementsService;

  static getInstance(): SchedulingEnhancementsService {
    if (!SchedulingEnhancementsService.instance) {
      SchedulingEnhancementsService.instance = new SchedulingEnhancementsService();
    }
    return SchedulingEnhancementsService.instance;
  }

  async checkConsecutiveDaysLimit(
    employeeId: string,
    workspaceId: string,
    targetDate: Date,
    maxConsecutiveDays: number = 7
  ): Promise<{ allowed: boolean; warning: ConsecutiveDaysWarning | null }> {
    const lookbackDays = maxConsecutiveDays + 1;
    const startLookback = new Date(targetDate);
    startLookback.setDate(startLookback.getDate() - lookbackDays);
    startLookback.setHours(0, 0, 0, 0);

    const endLookforward = new Date(targetDate);
    endLookforward.setDate(endLookforward.getDate() + lookbackDays);
    endLookforward.setHours(23, 59, 59, 999);

    const employeeShifts = await db.select({
      startTime: shifts.startTime,
    })
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        eq(shifts.employeeId, employeeId),
        gte(shifts.startTime, startLookback),
        lte(shifts.startTime, endLookforward)
      ));

    const workedDays = new Set<string>();
    for (const s of employeeShifts) {
      const d = new Date(s.startTime);
      workedDays.add(d.toISOString().slice(0, 10));
    }

    const targetDateStr = targetDate.toISOString().slice(0, 10);
    workedDays.add(targetDateStr);

    let maxStreak = 0;
    let currentStreak = 0;
    let streakStart = '';
    let streakEnd = '';
    let bestStreakStart = '';
    let bestStreakEnd = '';

    for (let i = -lookbackDays; i <= lookbackDays; i++) {
      const checkDate = new Date(targetDate);
      checkDate.setDate(checkDate.getDate() + i);
      const dateStr = checkDate.toISOString().slice(0, 10);

      if (workedDays.has(dateStr)) {
        if (currentStreak === 0) {
          streakStart = dateStr;
        }
        currentStreak++;
        streakEnd = dateStr;

        if (currentStreak > maxStreak) {
          maxStreak = currentStreak;
          bestStreakStart = streakStart;
          bestStreakEnd = streakEnd;
        }
      } else {
        currentStreak = 0;
      }
    }

    const emp = await db.select({
      firstName: employees.firstName,
      lastName: employees.lastName,
    })
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)))
      .limit(1);

    const employeeName = emp[0] ? `${emp[0].firstName} ${emp[0].lastName}` : 'Unknown';

    if (maxStreak > maxConsecutiveDays) {
      return {
        allowed: false,
        warning: {
          employeeId,
          employeeName,
          consecutiveDays: maxStreak,
          startDate: bestStreakStart,
          endDate: bestStreakEnd,
          severity: 'block',
        },
      };
    }

    if (maxStreak === maxConsecutiveDays) {
      return {
        allowed: false,
        warning: {
          employeeId,
          employeeName,
          consecutiveDays: maxStreak,
          startDate: bestStreakStart,
          endDate: bestStreakEnd,
          severity: 'warning',
        },
      };
    }

    return { allowed: true, warning: null };
  }

  async getConsecutiveDaysWarnings(
    workspaceId: string,
    maxConsecutiveDays: number = 7
  ): Promise<ConsecutiveDaysWarning[]> {
    const now = new Date();
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const allEmployees = await db.select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      workerType: employees.workerType,
      is1099Eligible: employees.is1099Eligible,
    })
      .from(employees)
      .where(and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.isActive, true)
      ));

    const lookbackStart = new Date(now);
    lookbackStart.setDate(lookbackStart.getDate() - maxConsecutiveDays - 1);
    lookbackStart.setHours(0, 0, 0, 0);

    const lookforwardEnd = new Date(weekEnd);
    lookforwardEnd.setDate(lookforwardEnd.getDate() + maxConsecutiveDays + 1);
    lookforwardEnd.setHours(23, 59, 59, 999);

    const allShifts = await db.select({
      employeeId: shifts.employeeId,
      startTime: shifts.startTime,
    })
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        isNotNull(shifts.employeeId),
        gte(shifts.startTime, lookbackStart),
        lte(shifts.startTime, lookforwardEnd)
      ));

    const shiftsByEmployee = new Map<string, Set<string>>();
    for (const s of allShifts) {
      if (!s.employeeId) continue;
      if (!shiftsByEmployee.has(s.employeeId)) {
        shiftsByEmployee.set(s.employeeId, new Set());
      }
      const d = new Date(s.startTime);
      shiftsByEmployee.get(s.employeeId)!.add(d.toISOString().slice(0, 10));
    }

    const warnings: ConsecutiveDaysWarning[] = [];

    for (const emp of allEmployees) {
      const workedDays = shiftsByEmployee.get(emp.id);
      if (!workedDays || workedDays.size < maxConsecutiveDays) continue;

      const sortedDays = [...workedDays].sort();
      let currentStreak = 1;
      let streakStart = sortedDays[0];
      let maxStreak = 1;
      let bestStreakStart = sortedDays[0];
      let bestStreakEnd = sortedDays[0];

      for (let i = 1; i < sortedDays.length; i++) {
        const prevDate = new Date(sortedDays[i - 1]);
        const currDate = new Date(sortedDays[i]);
        const diffDays = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);

        if (diffDays === 1) {
          currentStreak++;
          if (currentStreak > maxStreak) {
            maxStreak = currentStreak;
            bestStreakStart = streakStart;
            bestStreakEnd = sortedDays[i];
          }
        } else {
          currentStreak = 1;
          streakStart = sortedDays[i];
        }
      }

      if (maxStreak >= maxConsecutiveDays) {
        warnings.push({
          employeeId: emp.id,
          employeeName: `${emp.firstName} ${emp.lastName}`,
          consecutiveDays: maxStreak,
          startDate: bestStreakStart,
          endDate: bestStreakEnd,
          severity: maxStreak > maxConsecutiveDays ? 'block' : 'warning',
        });
      }
    }

    return warnings.sort((a, b) => b.consecutiveDays - a.consecutiveDays);
  }

  async predictOvertimeRisk(
    workspaceId: string,
    weekStartOverride?: Date
  ): Promise<OvertimePrediction[]> {
    const now = new Date();
    const weekStart = weekStartOverride || this.getWeekStart(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const allEmployees = await db.select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      workerType: employees.workerType,
      is1099Eligible: employees.is1099Eligible,
    })
      .from(employees)
      .where(and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.isActive, true)
      ));

    const actualEntries = await db.select({
      employeeId: timeEntries.employeeId,
      totalHours: timeEntries.totalHours,
      clockIn: timeEntries.clockIn,
      clockOut: timeEntries.clockOut,
    })
      .from(timeEntries)
      .where(and(
        eq(timeEntries.workspaceId, workspaceId),
        gte(timeEntries.clockIn, weekStart),
        lte(timeEntries.clockIn, weekEnd)
      ));

    const actualHoursByEmployee = new Map<string, number>();
    for (const entry of actualEntries) {
      const hours = entry.totalHours
        ? parseFloat(String(entry.totalHours))
        : entry.clockOut
          ? (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60)
          : 0;
      actualHoursByEmployee.set(
        entry.employeeId,
        (actualHoursByEmployee.get(entry.employeeId) || 0) + hours
      );
    }

    const remainingShifts = await db.select({
      employeeId: shifts.employeeId,
      startTime: shifts.startTime,
      endTime: shifts.endTime,
    })
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        isNotNull(shifts.employeeId),
        gte(shifts.startTime, now),
        lte(shifts.startTime, weekEnd)
      ));

    const scheduledRemainingByEmployee = new Map<string, number>();
    for (const s of remainingShifts) {
      if (!s.employeeId) continue;
      const hours = (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / (1000 * 60 * 60);
      scheduledRemainingByEmployee.set(
        s.employeeId,
        (scheduledRemainingByEmployee.get(s.employeeId) || 0) + hours
      );
    }

    const predictions: OvertimePrediction[] = [];
    const OT_THRESHOLD = 40;

    for (const emp of allEmployees) {
      // 1099 contractors are exempt from OT — skip them in OT predictions
      if (emp.workerType === 'contractor' || emp.is1099Eligible === true) continue;

      const actualHours = actualHoursByEmployee.get(emp.id) || 0;
      const scheduledRemaining = scheduledRemainingByEmployee.get(emp.id) || 0;
      const projectedTotal = actualHours + scheduledRemaining;
      const overtimeHours = Math.max(0, projectedTotal - OT_THRESHOLD);

      if (projectedTotal < OT_THRESHOLD * 0.8 && overtimeHours === 0) continue;

      let risk: 'low' | 'medium' | 'high' | 'critical' = 'low';
      if (overtimeHours > 10) risk = 'critical';
      else if (overtimeHours > 5) risk = 'high';
      else if (overtimeHours > 0) risk = 'medium';
      else if (projectedTotal >= OT_THRESHOLD * 0.9) risk = 'medium';

      predictions.push({
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        actualHoursWorked: Math.round(actualHours * 100) / 100,
        scheduledRemainingHours: Math.round(scheduledRemaining * 100) / 100,
        projectedTotalHours: Math.round(projectedTotal * 100) / 100,
        overtimeHours: Math.round(overtimeHours * 100) / 100,
        risk,
      });
    }

    return predictions.sort((a, b) => b.projectedTotalHours - a.projectedTotalHours);
  }

  async checkCertificationsForShift(
    employeeId: string,
    workspaceId: string,
    requiredCerts: string[]
  ): Promise<CertificationCheckResult> {
    if (!requiredCerts || requiredCerts.length === 0) {
      return { eligible: true, reasons: [], expiringWithin30Days: [], expired: [], missing: [] };
    }

    const empCerts = await db.select()
      .from(employeeCertifications)
      .where(and(
        eq(employeeCertifications.employeeId, employeeId),
        eq(employeeCertifications.workspaceId, workspaceId)
      ));

    const empSkills = await db.select()
      .from(employeeSkills)
      .where(and(
        eq(employeeSkills.employeeId, employeeId),
        eq(employeeSkills.workspaceId, workspaceId),
        eq(employeeSkills.skillCategory, 'certification')
      ));

    const now = new Date();
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const missing: string[] = [];
    const expired: string[] = [];
    const expiringWithin30Days: string[] = [];
    const reasons: string[] = [];

    for (const reqCert of requiredCerts) {
      const certLower = reqCert.toLowerCase();

      const matchedCert = empCerts.find(c =>
        c.certificationName.toLowerCase().includes(certLower) ||
        c.certificationType.toLowerCase().includes(certLower)
      );

      const matchedSkill = empSkills.find(s =>
        s.skillName.toLowerCase().includes(certLower)
      );

      if (!matchedCert && !matchedSkill) {
        missing.push(reqCert);
        reasons.push(`Missing required certification: ${reqCert}`);
        continue;
      }

      if (matchedCert) {
        if (matchedCert.status === 'expired') {
          expired.push(reqCert);
          reasons.push(`Certification expired: ${reqCert}`);
          continue;
        }

        if (matchedCert.expirationDate) {
          const expDate = new Date(matchedCert.expirationDate);
          if (expDate < now) {
            expired.push(reqCert);
            reasons.push(`Certification expired on ${expDate.toISOString().slice(0, 10)}: ${reqCert}`);
            continue;
          }
          if (expDate < thirtyDaysFromNow) {
            expiringWithin30Days.push(reqCert);
            reasons.push(`Certification expiring on ${expDate.toISOString().slice(0, 10)}: ${reqCert}`);
          }
        }
      }

      if (matchedSkill && !matchedCert) {
        if (matchedSkill.expiresAt) {
          const expDate = new Date(matchedSkill.expiresAt);
          if (expDate < now) {
            expired.push(reqCert);
            reasons.push(`Skill/certification expired on ${expDate.toISOString().slice(0, 10)}: ${reqCert}`);
            continue;
          }
          if (expDate < thirtyDaysFromNow) {
            expiringWithin30Days.push(reqCert);
            reasons.push(`Skill/certification expiring on ${expDate.toISOString().slice(0, 10)}: ${reqCert}`);
          }
        }
      }
    }

    const eligible = missing.length === 0 && expired.length === 0;

    return { eligible, reasons, expiringWithin30Days, expired, missing };
  }

  async checkCertificationsForShiftAssignment(
    employeeId: string,
    workspaceId: string,
    shift: any,
    client: any
  ): Promise<{ eligible: boolean; reasons: string[] }> {
    const requiredCerts: string[] = [];

    if (shift.requiredCertifications && Array.isArray(shift.requiredCertifications)) {
      requiredCerts.push(...shift.requiredCertifications);
    }

    if (client?.requiredCertifications && Array.isArray(client.requiredCertifications)) {
      for (const cert of client.requiredCertifications) {
        if (!requiredCerts.includes(cert)) {
          requiredCerts.push(cert);
        }
      }
    }

    if (requiredCerts.length === 0) {
      return { eligible: true, reasons: [] };
    }

    const result = await this.checkCertificationsForShift(employeeId, workspaceId, requiredCerts);
    return { eligible: result.eligible, reasons: result.reasons };
  }

  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}

export const schedulingEnhancementsService = SchedulingEnhancementsService.getInstance();
