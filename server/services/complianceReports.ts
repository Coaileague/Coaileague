import { db } from '../db';
import {
  shifts,
  employees,
  auditLogs,
  workspaces,
  scheduledBreaks,
  laborLawRules,
  complianceReports,
  employeeCertifications,
  type Shift,
  type ComplianceReport,
} from '@shared/schema';
import { eq, and, gte, lte, desc, sql, isNotNull, lt, count } from 'drizzle-orm';
import { addYears, format, startOfMonth, endOfMonth } from 'date-fns';
import { createLogger } from '../lib/logger';
const log = createLogger('complianceReports');


/**
 * MONOPOLISTIC FEATURE: Compliance Report Generation
 * 
 * Automatically generates audit-ready, non-editable compliance reports
 * that eliminate hundreds of hours of manual compilation and transfer liability
 * to the system's automated record-keeping.
 */

// ============================================================================
// LABOR LAW VIOLATION REPORT
// ============================================================================

interface LaborViolation {
  type: 'short_turnaround' | 'missed_break' | 'excessive_overtime' | 'unauthorized_shift';
  severity: 'critical' | 'high' | 'medium' | 'low';
  employeeId: string;
  employeeName: string;
  shiftId?: string;
  shiftDate?: Date;
  details: string;
  regulatoryReference?: string; // e.g., "FLSA §207", "DOL Meal Break Rule"
  potentialFineUsd?: string;
}

type ShiftWithEmployee = {
  shift: Shift;
  employee: Employee | null;
};

export async function generateLaborLawViolationReport(
  workspaceId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  reportTitle: string;
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  violations: LaborViolation[];
  summaryStats: {
    totalViolations: number;
    criticalViolations: number;
    potentialFinesTotal: string;
  };
}> {
  const violations: LaborViolation[] = [];

  // VIOLATION CHECK 1: Short Turnarounds (< 8 hours between shifts)
  const allShifts = await db
    .select({
      shift: shifts,
      employee: employees,
    })
    .from(shifts)
    .leftJoin(employees, eq(shifts.employeeId, employees.id))
    .where(
      and(
        eq(shifts.workspaceId, workspaceId),
        gte(shifts.startTime, startDate),
        lte(shifts.startTime, endDate)
      )
    )
    .orderBy(desc(shifts.startTime));

  // Group by employee and check turnaround times
  const shiftsByEmployee = new Map<string, ShiftWithEmployee[]>();
  allShifts.forEach(record => {
    const empId = record.shift.employeeId;
    if (!shiftsByEmployee.has(empId)) {
      shiftsByEmployee.set(empId, []);
    }
    shiftsByEmployee.get(empId)!.push(record);
  });

  // Iterate with Array.from for compatibility
  Array.from(shiftsByEmployee.entries()).forEach(([employeeId, empShifts]) => {
    // Sort by start time
    empShifts.sort((a: ShiftWithEmployee, b: ShiftWithEmployee) => 
      a.shift.startTime.getTime() - b.shift.startTime.getTime()
    );
    
    for (let i = 1; i < empShifts.length; i++) {
      const prevShift = empShifts[i - 1].shift;
      const currentShift = empShifts[i].shift;
      const employee = empShifts[i].employee;
      
      if (prevShift.endTime && currentShift.startTime) {
        const turnaroundHours = (currentShift.startTime.getTime() - prevShift.endTime.getTime()) / (1000 * 60 * 60);
        
        if (turnaroundHours < 8) {
          const employeeName = employee ? `${employee.firstName} ${employee.lastName}` : 'Unknown';
          violations.push({
            type: 'short_turnaround',
            severity: turnaroundHours < 6 ? 'critical' : 'high',
            employeeId: employeeId,
            employeeName,
            shiftId: currentShift.id,
            shiftDate: currentShift.startTime,
            details: `Only ${turnaroundHours.toFixed(1)} hours between shifts (minimum 8 hours required)`,
            regulatoryReference: 'FLSA Rest Period Guidelines',
            potentialFineUsd: turnaroundHours < 6 ? '1000.00' : '500.00',
          });
        }
      }
    }
  });

  // VIOLATION CHECK 2: Excessive Overtime (>12 hours in single shift without approval)
  const longShifts = allShifts.filter(record => {
    const shift = record.shift;
    if (shift.endTime && shift.startTime) {
      const durationHours = (shift.endTime.getTime() - shift.startTime.getTime()) / (1000 * 60 * 60);
      return durationHours > 12;
    }
    return false;
  });

  longShifts.forEach(record => {
    const shift = record.shift;
    const employee = record.employee;
    const durationHours = (shift.endTime!.getTime() - shift.startTime.getTime()) / (1000 * 60 * 60);
    const employeeName = employee ? `${employee.firstName} ${employee.lastName}` : 'Unknown';
    
    violations.push({
      type: 'excessive_overtime',
      severity: durationHours > 16 ? 'critical' : 'high',
      employeeId: shift.employeeId,
      employeeName,
      shiftId: shift.id,
      shiftDate: shift.startTime,
      details: `Shift duration: ${durationHours.toFixed(1)} hours (exceeds 12-hour limit without documented approval)`,
      regulatoryReference: 'OSHA Fatigue Prevention Standards',
      potentialFineUsd: durationHours > 16 ? '2000.00' : '750.00',
    });
  });

  // Calculate summary stats
  const criticalViolations = violations.filter(v => v.severity === 'critical').length;
  const potentialFinesTotal = violations
    .reduce((sum, v) => sum + parseFloat(v.potentialFineUsd || '0'), 0)
    .toFixed(2);

  return {
    reportTitle: 'Labor Law Compliance Violation Report',
    generatedAt: new Date(),
    periodStart: startDate,
    periodEnd: endDate,
    violations,
    summaryStats: {
      totalViolations: violations.length,
      criticalViolations,
      potentialFinesTotal,
    },
  };
}


// ============================================================================
// HISTORICAL TIME ENTRY AUDIT LOG
// ============================================================================

interface AuditLogEntry {
  timestamp: Date;
  action: string;
  userId: string;
  userName: string;
  entityType: string;
  entityId: string;
  changes: any;
  ipAddress?: string;
  userAgent?: string;
}

export async function generateTimeEntryAuditLog(
  workspaceId: string,
  startDate: Date,
  endDate: Date,
  filterUserId?: string
): Promise<{
  reportTitle: string;
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  auditEntries: AuditLogEntry[];
  summaryStats: {
    totalAuditEvents: number;
    uniqueUsers: number;
    modificationsCount: number;
    deletionsCount: number;
  };
}> {
  // Query audit logs filtered by time entries
  const logs = await db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.workspaceId, workspaceId),
        eq(auditLogs.entityType, 'timeEntry'),
        gte(auditLogs.createdAt, startDate),
        lte(auditLogs.createdAt, endDate),
        filterUserId ? eq(auditLogs.userId, filterUserId) : sql`true`
      )
    )
    .orderBy(desc(auditLogs.createdAt));

  const auditEntries: AuditLogEntry[] = logs.map(log => ({
    timestamp: log.createdAt,
    action: log.action,
    userId: log.userId,
    userName: (log as any).metadata?.userName || 'Unknown',
    entityType: log.entityType,
    entityId: log.entityId,
    changes: log.changes,
    ipAddress: (log as any).metadata?.ipAddress || undefined,
    userAgent: (log as any).metadata?.userAgent || undefined,
  }));

  const uniqueUsers = new Set(auditEntries.map(e => e.userId)).size;
  const modificationsCount = auditEntries.filter(e => e.action === 'update').length;
  const deletionsCount = auditEntries.filter(e => e.action === 'delete').length;

  return {
    reportTitle: 'Time Entry Audit Log (7-Year Retention - IRS/DOL Compliance)',
    generatedAt: new Date(),
    periodStart: startDate,
    periodEnd: endDate,
    auditEntries,
    summaryStats: {
      totalAuditEvents: auditEntries.length,
      uniqueUsers,
      modificationsCount,
      deletionsCount,
    },
  };
}

// ============================================================================
// BREAK COMPLIANCE REPORT (State-Specific Meal/Rest Breaks)
// ============================================================================

interface BreakViolation {
  employeeId: string;
  employeeName: string;
  shiftId: string;
  shiftDate: Date;
  violationType: 'missed_meal' | 'late_meal' | 'missed_rest' | 'short_break';
  requiredBreakMinutes: number;
  actualBreakMinutes: number;
  jurisdiction: string;
  regulatoryReference: string;
  potentialFineUsd: string;
}

export async function generateBreakComplianceReport(
  workspaceId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  reportTitle: string;
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  jurisdiction: string;
  violations: BreakViolation[];
  summaryStats: {
    totalShiftsAnalyzed: number;
    compliantShifts: number;
    violationCount: number;
    complianceRate: string;
    potentialFinesTotal: string;
  };
}> {
  const violations: BreakViolation[] = [];

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });
  const jurisdiction = workspace?.laborLawJurisdiction || 'US-FEDERAL';

  const laborRules = await db.query.laborLawRules.findFirst({
    where: eq(laborLawRules.jurisdiction, jurisdiction),
  });

  const allShifts = await db
    .select({
      shift: shifts,
      employee: employees,
    })
    .from(shifts)
    .leftJoin(employees, eq(shifts.employeeId, employees.id))
    .where(
      and(
        eq(shifts.workspaceId, workspaceId),
        gte(shifts.startTime, startDate),
        lte(shifts.startTime, endDate)
      )
    );

  for (const record of allShifts) {
    const shift = record.shift;
    const employee = record.employee;
    if (!shift.endTime) continue;

    const shiftDurationHours = (shift.endTime.getTime() - shift.startTime.getTime()) / (1000 * 60 * 60);
    const employeeName = employee ? `${employee.firstName} ${employee.lastName}` : 'Unknown';

    const breaks = await db.query.scheduledBreaks.findMany({
      where: eq(scheduledBreaks.shiftId, shift.id),
    });

    const mealBreaks = breaks.filter(b => b.breakType === 'meal');
    const restBreaks = breaks.filter(b => b.breakType === 'rest');

    const requiredMealBreakMinutes = (laborRules as any)?.mealBreakMinutes || 30;
    const requiredRestBreakMinutes = (laborRules as any)?.restBreakMinutes || 10;
    const mealBreakThresholdHours = (laborRules as any)?.mealBreakAfterHours ? parseFloat(laborRules.mealBreakAfterHours) : 5;

    if (shiftDurationHours >= mealBreakThresholdHours && mealBreaks.length === 0) {
      violations.push({
        employeeId: shift.employeeId,
        employeeName,
        shiftId: shift.id,
        shiftDate: shift.startTime,
        violationType: 'missed_meal',
        requiredBreakMinutes: requiredMealBreakMinutes,
        actualBreakMinutes: 0,
        jurisdiction,
        regulatoryReference: `${jurisdiction} Meal Break Law`,
        potentialFineUsd: '100.00',
      });
    }

    if (shiftDurationHours >= 4 && restBreaks.length === 0) {
      violations.push({
        employeeId: shift.employeeId,
        employeeName,
        shiftId: shift.id,
        shiftDate: shift.startTime,
        violationType: 'missed_rest',
        requiredBreakMinutes: requiredRestBreakMinutes,
        actualBreakMinutes: 0,
        jurisdiction,
        regulatoryReference: `${jurisdiction} Rest Break Law`,
        potentialFineUsd: '50.00',
      });
    }
  }

  const compliantShifts = allShifts.length - violations.length;
  const complianceRate = allShifts.length > 0 
    ? ((compliantShifts / allShifts.length) * 100).toFixed(1) 
    : '100.0';
  const potentialFinesTotal = violations
    .reduce((sum, v) => sum + parseFloat(v.potentialFineUsd), 0)
    .toFixed(2);

  return {
    reportTitle: `Break Compliance Report - ${jurisdiction}`,
    generatedAt: new Date(),
    periodStart: startDate,
    periodEnd: endDate,
    jurisdiction,
    violations,
    summaryStats: {
      totalShiftsAnalyzed: allShifts.length,
      compliantShifts,
      violationCount: violations.length,
      complianceRate: `${complianceRate}%`,
      potentialFinesTotal,
    },
  };
}

// ============================================================================
// OVERTIME SUMMARY REPORT (Weekly Hours Tracking)
// ============================================================================

interface OvertimeRecord {
  employeeId: string;
  employeeName: string;
  weekStarting: Date;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  totalHours: number;
  overtimePayDue: string;
}

export async function generateOvertimeSummaryReport(
  workspaceId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  reportTitle: string;
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  records: OvertimeRecord[];
  summaryStats: {
    totalEmployees: number;
    employeesWithOvertime: number;
    totalOvertimeHours: string;
    totalOvertimePayDue: string;
  };
}> {
  const allShifts = await db
    .select({
      shift: shifts,
      employee: employees,
    })
    .from(shifts)
    .leftJoin(employees, eq(shifts.employeeId, employees.id))
    .where(
      and(
        eq(shifts.workspaceId, workspaceId),
        gte(shifts.startTime, startDate),
        lte(shifts.startTime, endDate)
      )
    );

  const employeeWeeklyHours = new Map<string, {
    employee: Employee | null;
    weeks: Map<string, number>;
  }>();

  for (const record of allShifts) {
    const shift = record.shift;
    const employee = record.employee;
    if (!shift.endTime) continue;

    const empId = shift.employeeId;
    const hours = (shift.endTime.getTime() - shift.startTime.getTime()) / (1000 * 60 * 60);
    
    const weekStart = new Date(shift.startTime);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekKey = format(weekStart, 'yyyy-MM-dd');

    if (!employeeWeeklyHours.has(empId)) {
      employeeWeeklyHours.set(empId, { employee, weeks: new Map() });
    }
    const empData = employeeWeeklyHours.get(empId)!;
    empData.weeks.set(weekKey, (empData.weeks.get(weekKey) || 0) + hours);
  }

  const records: OvertimeRecord[] = [];
  const defaultHourlyRate = 25;

  for (const [employeeId, data] of Array.from(employeeWeeklyHours.entries())) {
    const employeeName = data.employee 
      ? `${data.employee.firstName} ${data.employee.lastName}` 
      : 'Unknown';
    const hourlyRate = data.employee?.hourlyRate 
      ? parseFloat(data.employee.hourlyRate) 
      : defaultHourlyRate;

    for (const [weekKey, totalHours] of Array.from(data.weeks.entries())) {
      const regularHours = Math.min(totalHours, 40);
      const overtimeHours = Math.max(0, Math.min(totalHours - 40, 20));
      const doubleTimeHours = Math.max(0, totalHours - 60);
      
      const overtimePayDue = (overtimeHours * hourlyRate * 0.5) + (doubleTimeHours * hourlyRate);

      if (overtimeHours > 0 || doubleTimeHours > 0) {
        records.push({
          employeeId,
          employeeName,
          weekStarting: new Date(weekKey),
          regularHours,
          overtimeHours,
          doubleTimeHours,
          totalHours,
          overtimePayDue: overtimePayDue.toFixed(2),
        });
      }
    }
  }

  const employeesWithOvertime = new Set(records.map(r => r.employeeId)).size;
  const totalOvertimeHours = records.reduce((sum, r) => sum + r.overtimeHours + r.doubleTimeHours, 0);
  const totalOvertimePayDue = records.reduce((sum, r) => sum + parseFloat(r.overtimePayDue), 0);

  return {
    reportTitle: 'Weekly Overtime Summary Report (FLSA Compliance)',
    generatedAt: new Date(),
    periodStart: startDate,
    periodEnd: endDate,
    records,
    summaryStats: {
      totalEmployees: employeeWeeklyHours.size,
      employeesWithOvertime,
      totalOvertimeHours: totalOvertimeHours.toFixed(1),
      totalOvertimePayDue: totalOvertimePayDue.toFixed(2),
    },
  };
}

// ============================================================================
// CERTIFICATION EXPIRY REPORT
// ============================================================================

interface ExpiringCertification {
  employeeId: string;
  employeeName: string;
  certificationType: string;
  certificationName: string;
  expiresAt: Date;
  daysUntilExpiry: number;
  status: 'expired' | 'critical' | 'warning' | 'upcoming';
  renewalRequired: boolean;
}

export async function generateCertificationExpiryReport(
  workspaceId: string,
  lookAheadDays: number = 90
): Promise<{
  reportTitle: string;
  generatedAt: Date;
  lookAheadDays: number;
  certifications: ExpiringCertification[];
  summaryStats: {
    totalCertifications: number;
    expiredCount: number;
    criticalCount: number;
    warningCount: number;
    upcomingCount: number;
  };
}> {
  const lookAheadDate = new Date();
  lookAheadDate.setDate(lookAheadDate.getDate() + lookAheadDays);

  const expiringSoon = await db
    .select({
      cert: employeeCertifications,
      employee: employees,
    })
    .from(employeeCertifications)
    .innerJoin(employees, eq(employeeCertifications.employeeId, employees.id))
    .where(
      and(
        eq(employees.workspaceId, workspaceId),
        isNotNull(employeeCertifications.expirationDate),
        lt(employeeCertifications.expirationDate, lookAheadDate)
      )
    );

  const now = new Date();
  const certifications: ExpiringCertification[] = expiringSoon.map(record => {
    const cert = record.cert;
    const employee = record.employee;
    const expiresAt = cert.expirationDate!;
    const daysUntilExpiry = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    let status: ExpiringCertification['status'];
    if (daysUntilExpiry < 0) status = 'expired';
    else if (daysUntilExpiry <= 7) status = 'critical';
    else if (daysUntilExpiry <= 30) status = 'warning';
    else status = 'upcoming';

    return {
      employeeId: employee.id,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      certificationType: cert.certificationType,
      certificationName: cert.certificationName,
      expiresAt,
      daysUntilExpiry,
      status,
      renewalRequired: cert.status !== 'verified' || daysUntilExpiry <= 0,
    };
  });

  certifications.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

  const expiredCount = certifications.filter(c => c.status === 'expired').length;
  const criticalCount = certifications.filter(c => c.status === 'critical').length;
  const warningCount = certifications.filter(c => c.status === 'warning').length;
  const upcomingCount = certifications.filter(c => c.status === 'upcoming').length;

  return {
    reportTitle: 'Certification Expiry Report',
    generatedAt: new Date(),
    lookAheadDays,
    certifications,
    summaryStats: {
      totalCertifications: certifications.length,
      expiredCount,
      criticalCount,
      warningCount,
      upcomingCount,
    },
  };
}


// ============================================================================
// COMPREHENSIVE COMPLIANCE REPORT SERVICE
// ============================================================================

// Middleware-relevant compliance reports only (partners handle tax, payroll, I-9)
export type ComplianceReportType = 
  | 'labor_law_violations'
  | 'time_entry_audit'
  | 'break_compliance'
  | 'overtime_summary'
  | 'certification_expiry';

export interface GenerateReportOptions {
  workspaceId: string;
  reportType: ComplianceReportType;
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  automated?: boolean;
}

export async function generateComplianceReport(options: GenerateReportOptions): Promise<ComplianceReport> {
  const { workspaceId, reportType, userId, automated = false } = options;
  
  const now = new Date();
  const startDate = options.startDate || startOfMonth(now);
  const endDate = options.endDate || endOfMonth(now);

  const reportRecord = await db.insert(complianceReports).values({
    workspaceId,
    reportType,
    reportTitle: getReportTitle(reportType),
    description: getReportDescription(reportType),
    periodStart: startDate,
    periodEnd: endDate,
    status: 'generating',
    generatedBy: userId || null,
    automatedGeneration: automated,
    regulations: getRegulations(reportType),
    retentionYears: 7,
    expiresAt: addYears(now, 7),
  }).returning();

  const report = reportRecord[0];

  try {
    let reportData: any;
    let summaryStats: any;
    let hasViolations = false;
    let violationCount = 0;
    let criticalViolationCount = 0;
    let potentialFinesUsd = '0.00';

    switch (reportType) {
      case 'labor_law_violations': {
        const result = await generateLaborLawViolationReport(workspaceId, startDate, endDate);
        reportData = result;
        summaryStats = result.summaryStats;
        hasViolations = result.violations.length > 0;
        violationCount = result.violations.length;
        criticalViolationCount = result.summaryStats.criticalViolations;
        potentialFinesUsd = result.summaryStats.potentialFinesTotal;
        break;
      }
      case 'time_entry_audit': {
        const result = await generateTimeEntryAuditLog(workspaceId, startDate, endDate);
        reportData = result;
        summaryStats = result.summaryStats;
        hasViolations = result.summaryStats.deletionsCount > 0;
        violationCount = result.summaryStats.deletionsCount;
        break;
      }
      case 'break_compliance': {
        const result = await generateBreakComplianceReport(workspaceId, startDate, endDate);
        reportData = result;
        summaryStats = result.summaryStats;
        hasViolations = result.violations.length > 0;
        violationCount = result.violations.length;
        potentialFinesUsd = result.summaryStats.potentialFinesTotal;
        break;
      }
      case 'overtime_summary': {
        const result = await generateOvertimeSummaryReport(workspaceId, startDate, endDate);
        reportData = result;
        summaryStats = result.summaryStats;
        break;
      }
      case 'certification_expiry': {
        const result = await generateCertificationExpiryReport(workspaceId, 90);
        reportData = result;
        summaryStats = result.summaryStats;
        hasViolations = result.summaryStats.expiredCount > 0;
        violationCount = result.summaryStats.expiredCount;
        criticalViolationCount = result.summaryStats.criticalCount;
        break;
      }
    }

    const [updatedReport] = await db
      .update(complianceReports)
      .set({
        status: 'completed',
        generatedAt: new Date(),
        reportData,
        summaryStats,
        hasViolations,
        violationCount,
        criticalViolationCount,
        potentialFinesUsd,
        updatedAt: new Date(),
      })
      .where(eq(complianceReports.id, report.id))
      .returning();

    log.info(`[ComplianceReports] Generated ${reportType} report for workspace ${workspaceId}`);
    return updatedReport;

  } catch (error) {
    await db
      .update(complianceReports)
      .set({
        status: 'failed',
        updatedAt: new Date(),
      })
      .where(eq(complianceReports.id, report.id));

    log.error(`[ComplianceReports] Failed to generate ${reportType}:`, error);
    throw error;
  }
}

function getReportTitle(reportType: ComplianceReportType): string {
  const titles: Record<ComplianceReportType, string> = {
    labor_law_violations: 'Labor Law Compliance Violation Report',
    time_entry_audit: 'Time Entry Audit Log',
    break_compliance: 'Break Compliance Report',
    overtime_summary: 'Weekly Overtime Summary Report',
    certification_expiry: 'Certification Expiry Report',
  };
  return titles[reportType];
}

function getReportDescription(reportType: ComplianceReportType): string {
  const descriptions: Record<ComplianceReportType, string> = {
    labor_law_violations: 'Identifies potential FLSA and DOL labor law violations including overtime, rest periods, and unauthorized scheduling.',
    time_entry_audit: 'Complete audit trail of all time entry modifications for 7-year DOL retention compliance.',
    break_compliance: 'Analyzes meal and rest break scheduling against state-specific labor laws.',
    overtime_summary: 'Weekly breakdown of regular, overtime, and double-time hours for FLSA compliance.',
    certification_expiry: 'Tracks expiring employee certifications and licenses requiring renewal.',
  };
  return descriptions[reportType];
}

function getRegulations(reportType: ComplianceReportType): string[] {
  const regulations: Record<ComplianceReportType, string[]> = {
    labor_law_violations: ['FLSA §207', 'DOL Wage & Hour', 'OSHA Fatigue Prevention'],
    time_entry_audit: ['IRS 7-Year Retention', 'DOL Record Keeping'],
    break_compliance: ['State Meal Break Laws', 'State Rest Break Laws'],
    overtime_summary: ['FLSA §207 Overtime', 'State Overtime Laws'],
    certification_expiry: ['Industry Licensing Requirements', 'Professional Certification Standards'],
  };
  return regulations[reportType];
}

export async function listComplianceReports(
  workspaceId: string,
  options: {
    reportType?: ComplianceReportType;
    status?: 'generating' | 'completed' | 'failed' | 'archived';
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ reports: ComplianceReport[]; total: number }> {
  const { reportType, status, limit = 20, offset = 0 } = options;

  const conditions = [eq(complianceReports.workspaceId, workspaceId)];
  if (reportType) conditions.push(eq(complianceReports.reportType, reportType));
  if (status) conditions.push(eq(complianceReports.status, status));

  const reports = await db
    .select()
    .from(complianceReports)
    .where(and(...conditions))
    .orderBy(desc(complianceReports.createdAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: count() })
    .from(complianceReports)
    .where(and(...conditions));

  return {
    reports,
    total: countResult?.count || 0,
  };
}

export async function getComplianceReport(reportId: string): Promise<ComplianceReport | null> {
  const report = await db.query.complianceReports.findFirst({
    where: eq(complianceReports.id, reportId),
  });
  return report || null;
}
