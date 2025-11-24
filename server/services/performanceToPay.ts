/**
 * TALENTOS™ - PERFORMANCE-TO-PAY LOOP
 * 
 * Auto-generates data-driven compensation recommendations.
 * Pulls metrics from Unified Data Nexus (ClockOS™, ReportOS™, AI Scheduling™).
 */

import { storage } from "../storage";
import { db } from "../db";
import { trainingCertifications } from "@shared/schema";
import { and, eq, gte, lte } from "drizzle-orm";

// ============================================================================
// PERFORMANCE METRICS CALCULATION
// ============================================================================

/**
 * Calculate comprehensive performance metrics for employee
 */
export async function calculatePerformanceMetrics(
  employeeId: string,
  workspaceId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<{
  attendance: any;
  workQuality: any;
  compliance: any;
  compositeScore: number;
  performanceTier: string;
}> {
  // Calculate attendance metrics from ClockOS™
  const attendance = await calculateAttendanceMetrics(
    employeeId,
    workspaceId,
    periodStart,
    periodEnd
  );

  // Calculate work quality metrics from ReportOS™
  const workQuality = await calculateWorkQualityMetrics(
    employeeId,
    workspaceId,
    periodStart,
    periodEnd
  );

  // Calculate compliance metrics
  const compliance = await calculateComplianceMetrics(
    employeeId,
    workspaceId,
    periodStart,
    periodEnd
  );

  // Calculate weighted composite score
  const compositeScore = calculateCompositeScore(attendance, workQuality, compliance);
  const performanceTier = getPerformanceTier(compositeScore);

  return {
    attendance,
    workQuality,
    compliance,
    compositeScore,
    performanceTier,
  };
}

/**
 * Calculate attendance metrics from time entries
 */
async function calculateAttendanceMetrics(
  employeeId: string,
  workspaceId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<{
  shiftsCompletedOnTime: number;
  totalShiftsAssigned: number;
  attendanceRate: number;
  averageHoursPerWeek: number;
  overtimeHours: number;
}> {
  // Get all shifts assigned to employee
  const shifts = await storage.getShiftsByEmployeeAndDateRange(
    workspaceId,
    employeeId,
    periodStart,
    periodEnd
  );

  // Get all time entries
  const timeEntries = await storage.getTimeEntriesByEmployeeAndDateRange(
    workspaceId,
    employeeId,
    periodStart,
    periodEnd
  );

  const totalShiftsAssigned = shifts.length;
  const shiftsCompletedOnTime = calculateOnTimeShifts(shifts, timeEntries);
  const attendanceRate = totalShiftsAssigned > 0
    ? (shiftsCompletedOnTime / totalShiftsAssigned) * 100
    : 100;

  // Calculate total hours and overtime
  const totalHours = timeEntries.reduce((sum, entry) => {
    const hours = parseFloat(entry.hoursWorked?.toString() || '0');
    return sum + hours;
  }, 0);

  const overtimeHours = timeEntries.reduce((sum, entry) => {
    const hours = parseFloat(entry.overtimeHours?.toString() || '0');
    return sum + hours;
  }, 0);

  const weeksBetween = Math.max(
    (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24 * 7),
    1
  );
  const averageHoursPerWeek = totalHours / weeksBetween;

  return {
    shiftsCompletedOnTime,
    totalShiftsAssigned,
    attendanceRate,
    averageHoursPerWeek,
    overtimeHours,
  };
}

/**
 * Calculate on-time shift completion
 */
function calculateOnTimeShifts(shifts: any[], timeEntries: any[]): number {
  let onTimeCount = 0;

  for (const shift of shifts) {
    const shiftTime = new Date(shift.startTime);
    const clockIn = timeEntries.find(entry => {
      const entryTime = new Date(entry.clockInTime);
      const timeDiff = Math.abs(entryTime.getTime() - shiftTime.getTime());
      return timeDiff < 15 * 60 * 1000; // Within 15 minutes
    });

    if (clockIn) {
      const entryTime = new Date(clockIn.clockInTime);
      const lateMinutes = (entryTime.getTime() - shiftTime.getTime()) / (1000 * 60);
      
      if (lateMinutes <= 5) { // On-time threshold: 5 minutes
        onTimeCount++;
      }
    }
  }

  return onTimeCount;
}

/**
 * Calculate work quality metrics from ReportOS™
 */
async function calculateWorkQualityMetrics(
  employeeId: string,
  workspaceId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<{
  reportsSubmitted: number;
  reportsApproved: number;
  reportsRejected: number;
  reportQualityScore: number;
}> {
  const submissions = await storage.getReportSubmissionsByEmployee(
    workspaceId,
    employeeId,
    periodStart,
    periodEnd
  );

  const reportsSubmitted = submissions.length;
  const reportsApproved = submissions.filter(s => s.status === 'approved').length;
  const reportsRejected = submissions.filter(s => s.status === 'rejected').length;

  // Quality score: (approved / total) * 100, with bonus for zero rejections
  let reportQualityScore = reportsSubmitted > 0
    ? (reportsApproved / reportsSubmitted) * 100
    : 100;

  // Bonus for perfect record
  if (reportsRejected === 0 && reportsSubmitted > 0) {
    reportQualityScore = Math.min(reportQualityScore + 5, 100);
  }

  return {
    reportsSubmitted,
    reportsApproved,
    reportsRejected,
    reportQualityScore,
  };
}

/**
 * Calculate compliance metrics
 */
async function calculateComplianceMetrics(
  employeeId: string,
  workspaceId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<{
  complianceViolations: number;
  safetyIncidents: number;
  trainingCompletionRate: number;
}> {
  // Get discrepancies (geo-compliance violations)
  const discrepancies = await storage.getTimeEntryDiscrepancies(workspaceId, {
    employeeId,
    startDate: periodStart,
    endDate: periodEnd,
  });

  const complianceViolations = discrepancies.filter(d =>
    d.severity === 'high' || d.severity === 'critical'
  ).length;

  // Count safety incidents from reports
  const incidentReports = await storage.getReportSubmissionsByEmployee(
    workspaceId,
    employeeId,
    periodStart,
    periodEnd
  );

  const safetyIncidents = incidentReports.filter(r =>
    r.reportTemplate?.toLowerCase().includes('incident') ||
    r.reportTemplate?.toLowerCase().includes('safety')
  ).length;

  // Training completion - Pull from actual training records
  const trainingRecords = await db.select()
    .from(trainingCertifications)
    .where(and(
      eq(trainingCertifications.employeeId, employeeId),
      eq(trainingCertifications.workspaceId, workspaceId),
      gte(trainingCertifications.completedDate, periodStart),
      lte(trainingCertifications.completedDate, periodEnd)
    ));
  
  const totalRequired = 12; // Dynamic: configurable per workspace in future settings
  const trainingCompletionRate = trainingRecords.length > 0 
    ? Math.min((trainingRecords.length / totalRequired) * 100, 100)
    : 0;

  return {
    complianceViolations,
    safetyIncidents,
    trainingCompletionRate,
  };
}

/**
 * Calculate weighted composite score
 */
function calculateCompositeScore(
  attendance: any,
  workQuality: any,
  compliance: any
): number {
  // Weighted formula:
  // 40% Attendance Rate
  // 30% Report Quality
  // 20% Training Completion
  // 10% Compliance (deductions for violations)

  const attendanceScore = attendance.attendanceRate * 0.4;
  const qualityScore = workQuality.reportQualityScore * 0.3;
  const trainingScore = compliance.trainingCompletionRate * 0.2;
  
  // Compliance: Start at 10, deduct 2 points per violation
  const complianceScore = Math.max(0, 10 - (compliance.complianceViolations * 2));

  const composite = attendanceScore + qualityScore + trainingScore + complianceScore;
  return Math.min(100, Math.max(0, composite));
}

/**
 * Determine performance tier based on score
 */
function getPerformanceTier(score: number): string {
  if (score >= 90) return 'exceptional';
  if (score >= 80) return 'exceeds';
  if (score >= 70) return 'meets';
  if (score >= 60) return 'needs_improvement';
  return 'unsatisfactory';
}

// ============================================================================
// PAY INCREASE CALCULATION
// ============================================================================

/**
 * Calculate suggested pay increase based on performance
 */
export async function calculatePayIncrease(
  employeeId: string,
  workspaceId: string,
  compositeScore: number,
  attendance: any,
  workQuality: any
): Promise<{
  suggestedIncrease: number;
  suggestedPercentage: number;
  formula: string;
  justification: string;
}> {
  const employee = await storage.getEmployeeById(employeeId);
  if (!employee) {
    throw new Error('Employee not found');
  }

  const currentRate = parseFloat(employee.hourlyRate?.toString() || '15.00');

  // Base increase by performance tier
  let basePercentage = 0;
  if (compositeScore >= 90) basePercentage = 5.0; // 5% for exceptional
  else if (compositeScore >= 80) basePercentage = 3.5; // 3.5% for exceeds
  else if (compositeScore >= 70) basePercentage = 2.0; // 2% for meets
  else if (compositeScore >= 60) basePercentage = 1.0; // 1% for needs improvement
  else basePercentage = 0; // No increase for unsatisfactory

  // Bonus adjustments
  let bonusPercentage = 0;
  const bonusReasons: string[] = [];

  // Perfect attendance bonus
  if (attendance.attendanceRate >= 98) {
    bonusPercentage += 0.5;
    bonusReasons.push('Perfect attendance (98%+)');
  }

  // Quality work bonus
  if (workQuality.reportQualityScore >= 95) {
    bonusPercentage += 1.0;
    bonusReasons.push('Exceptional work quality (95%+)');
  }

  // Zero rejections bonus
  if (workQuality.reportsRejected === 0 && workQuality.reportsSubmitted >= 5) {
    bonusPercentage += 0.5;
    bonusReasons.push('Zero report rejections');
  }

  const totalPercentage = basePercentage + bonusPercentage;
  const suggestedIncrease = currentRate * (totalPercentage / 100);
  const suggestedPercentage = totalPercentage;

  // Build formula explanation
  const formula = `Base ${basePercentage.toFixed(1)}% (${getPerformanceTier(compositeScore)})${
    bonusPercentage > 0 ? ` + ${bonusPercentage.toFixed(1)}% bonuses` : ''
  } = ${totalPercentage.toFixed(1)}% total`;

  // Build justification
  let justification = `Based on composite performance score of ${compositeScore.toFixed(1)}/100 (${getPerformanceTier(compositeScore)}).`;
  
  if (bonusReasons.length > 0) {
    justification += ` Additional bonuses for: ${bonusReasons.join(', ')}.`;
  }

  justification += ` Current rate: $${currentRate.toFixed(2)}/hr → Suggested rate: $${(currentRate + suggestedIncrease).toFixed(2)}/hr.`;

  return {
    suggestedIncrease,
    suggestedPercentage,
    formula,
    justification,
  };
}

// ============================================================================
// PERFORMANCE REVIEW GENERATION
// ============================================================================

/**
 * Auto-generate performance review with pay recommendation
 */
export async function generatePerformanceReview(
  employeeId: string,
  workspaceId: string,
  reviewType: 'annual' | 'quarterly' | 'probation' | 'promotion',
  reviewPeriodStart: Date,
  reviewPeriodEnd: Date,
  managerInput?: {
    qualityOfWorkRating?: number;
    teamworkRating?: number;
    communicationRating?: number;
    initiativeRating?: number;
    managerComments?: string;
  }
): Promise<any> {
  // Calculate all metrics
  const metrics = await calculatePerformanceMetrics(
    employeeId,
    workspaceId,
    reviewPeriodStart,
    reviewPeriodEnd
  );

  // Calculate pay increase
  const employee = await storage.getEmployeeById(employeeId);
  const currentRate = parseFloat(employee?.hourlyRate?.toString() || '15.00');
  
  const payIncrease = await calculatePayIncrease(
    employeeId,
    workspaceId,
    metrics.compositeScore,
    metrics.attendance,
    metrics.workQuality
  );

  // Create performance review
  const review = await storage.createPerformanceReview({
    workspaceId,
    employeeId,
    reviewPeriodStart,
    reviewPeriodEnd,
    reviewType,
    
    // Attendance metrics
    shiftsCompletedOnTime: metrics.attendance.shiftsCompletedOnTime,
    totalShiftsAssigned: metrics.attendance.totalShiftsAssigned,
    attendanceRate: metrics.attendance.attendanceRate.toFixed(2),
    averageHoursWorkedPerWeek: metrics.attendance.averageHoursPerWeek.toFixed(2),
    overtimeHours: metrics.attendance.overtimeHours.toFixed(2),
    
    // Work quality metrics
    reportsSubmitted: metrics.workQuality.reportsSubmitted,
    reportsApproved: metrics.workQuality.reportsApproved,
    reportsRejected: metrics.workQuality.reportsRejected,
    reportQualityScore: metrics.workQuality.reportQualityScore.toFixed(2),
    
    // Compliance metrics
    complianceViolations: metrics.compliance.complianceViolations,
    safetyIncidents: metrics.compliance.safetyIncidents,
    trainingCompletionRate: metrics.compliance.trainingCompletionRate.toFixed(2),
    
    // Manager ratings
    qualityOfWorkRating: managerInput?.qualityOfWorkRating,
    teamworkRating: managerInput?.teamworkRating,
    communicationRating: managerInput?.communicationRating,
    initiativeRating: managerInput?.initiativeRating,
    
    // Composite scoring
    compositeScore: metrics.compositeScore.toFixed(2),
    performanceTier: metrics.performanceTier,
    
    // Pay increase recommendation
    currentHourlyRate: currentRate.toFixed(2),
    suggestedPayIncrease: payIncrease.suggestedIncrease.toFixed(2),
    suggestedPayIncreasePercentage: payIncrease.suggestedPercentage.toFixed(2),
    payIncreaseFormula: payIncrease.formula,
    payIncreaseJustification: payIncrease.justification,
    
    // Manager comments
    managerComments: managerInput?.managerComments,
    
    status: 'draft',
  });

  return review;
}
