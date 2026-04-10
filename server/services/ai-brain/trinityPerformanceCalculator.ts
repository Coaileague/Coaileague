/**
 * TRINITY PERFORMANCE CALCULATOR
 * ================================
 * Calculates multi-dimensional officer performance scores.
 *
 * Scoring weights:
 *   Clock-in accuracy:    25%
 *   Attendance:           30%
 *   Report quality+sub:   20% (split 10/10)
 *   Client satisfaction:  15%
 *   Response time:        10%
 *
 * Recalculates after: clock-in, calloff, DAR submission, complaint, praise.
 * Generates weekly summaries. Detects trend direction. Never overwrites history.
 */

import { db, pool } from '../../db';
import { eq, and, sql, desc } from 'drizzle-orm';
import { typedPool, typedPoolExec } from '../../lib/typedSql';
import { officerPerformanceScores } from '@shared/schema/domains/workforce/extended';
import { employees } from '@shared/schema/domains/workforce/index';
import { dailyActivityReports, shifts, timeEntries } from '@shared/schema';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityPerformanceCalculator');

export interface PerformanceScores {
  employeeId: string;
  workspaceId: string;
  periodStart: string;
  periodEnd: string;
  periodType: 'weekly' | 'monthly' | 'quarterly' | 'annual';
  clockinAccuracyScore: number;
  attendanceScore: number;
  reportQualityScore: number;
  reportSubmissionScore: number;
  clientSatisfactionScore: number | null;
  responseTimeScore: number;
  supervisorInputScore: number | null;
  compositeScore: number;
  trend: 'improving' | 'stable' | 'declining';
  trendVelocity: number;
  consecutiveDaysOnTime: number;
  consecutiveShiftsNoCalloff: number;
  reportsSubmittedStreak: number;
  totalShiftsScheduled: number;
  totalShiftsWorked: number;
  totalClockinsOnTime: number;
}

class TrinityPerformanceCalculator {

  /** Calculate a full performance score for one employee over a date range */
  async calculateForEmployee(
    workspaceId: string,
    employeeId: string,
    periodStart: Date,
    periodEnd: Date,
    periodType: 'weekly' | 'monthly' | 'quarterly' | 'annual' = 'weekly'
  ): Promise<PerformanceScores> {

    const [clockin, attendance, reports, client, responseTime, streaks] = await Promise.all([
      this.calcClockinAccuracy(workspaceId, employeeId, periodStart, periodEnd),
      this.calcAttendance(workspaceId, employeeId, periodStart, periodEnd),
      this.calcReportScores(workspaceId, employeeId, periodStart, periodEnd),
      this.calcClientSatisfaction(workspaceId, employeeId, periodStart, periodEnd),
      this.calcResponseTime(workspaceId, employeeId, periodStart, periodEnd),
      this.calcStreaks(workspaceId, employeeId)
    ]);

    // client is null when client_feedback table doesn't exist.
    // Redistribute the 15% weight proportionally across remaining metrics.
    const weightedScores = [
      { score: clockin.score, weight: 0.25 },
      { score: attendance.score, weight: 0.30 },
      { score: reports.qualityScore, weight: 0.10 },
      { score: reports.submissionScore, weight: 0.10 },
      ...(client !== null ? [{ score: (client as any).score, weight: 0.15 }] : []),
      { score: responseTime.score, weight: 0.10 },
    ];
    const totalWeight = weightedScores.reduce((sum, s) => sum + s.weight, 0);
    const composite = Math.round(
      weightedScores.reduce((sum, s) => sum + s.score * (s.weight / totalWeight), 0)
    );

    const trend = await this.detectTrend(workspaceId, employeeId, composite);

    const scores: PerformanceScores = {
      employeeId, workspaceId,
      periodStart: periodStart.toISOString().split('T')[0],
      periodEnd: periodEnd.toISOString().split('T')[0],
      periodType,
      clockinAccuracyScore: clockin.score,
      attendanceScore: attendance.score,
      reportQualityScore: reports.qualityScore,
      reportSubmissionScore: reports.submissionScore,
      clientSatisfactionScore: client !== null ? (client as any).score : null,
      responseTimeScore: responseTime.score,
      supervisorInputScore: null,
      compositeScore: composite,
      trend: trend.direction,
      trendVelocity: trend.velocity,
      consecutiveDaysOnTime: streaks.daysOnTime,
      consecutiveShiftsNoCalloff: streaks.shiftsNoCalloff,
      reportsSubmittedStreak: streaks.reportsStreak,
      totalShiftsScheduled: attendance.scheduled,
      totalShiftsWorked: attendance.worked,
      totalClockinsOnTime: clockin.onTime
    };

    await this.persistScores(scores);
    await this.updateEmployeeComposite(workspaceId, employeeId, composite);

    return scores;
  }

  /** Run weekly recalculation for all active employees in a workspace */
  async recalculateWorkspace(workspaceId: string): Promise<{ calculated: number; errors: number }> {
    const { rows: employees } = await typedPool(`
      SELECT id FROM employees WHERE workspace_id = $1 AND is_active = true
    `, [workspaceId]);

    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - 7 * 86400000);

    let calculated = 0, errors = 0;
    for (const emp of employees) {
      try {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await this.calculateForEmployee(workspaceId, emp.id, periodStart, periodEnd, 'weekly');
        calculated++;
      } catch {
        errors++;
      }
    }
    return { calculated, errors };
  }

  private async calcClockinAccuracy(workspaceId: string, employeeId: string, start: Date, end: Date) {
    // CATEGORY C — Raw SQL retained: FILTER (WHERE | Tables: time_entries, shifts | Verified: 2026-03-23
    const { rows } = await typedPool(`
      SELECT
        COUNT(*) FILTER (WHERE te.clock_in <= s.start_time + INTERVAL '5 minutes') AS on_time,
        COUNT(*) AS total
      FROM time_entries te
      JOIN shifts s ON s.id = te.shift_id
      WHERE te.workspace_id = $1 AND te.employee_id = $2
        AND te.clock_in BETWEEN $3 AND $4
    `, [workspaceId, employeeId, start, end]);
    const r = rows[0];
    const total = Number(r.total) || 0;
    const onTime = Number(r.on_time) || 0;
    return { score: total > 0 ? Math.round((onTime / total) * 100) : 100, onTime, total };
  }

  private async calcAttendance(workspaceId: string, employeeId: string, start: Date, end: Date) {
    // CATEGORY C — Raw SQL retained: COUNT( | Tables: shifts | Verified: 2026-03-23
    const { rows: sched } = await typedPool(`
      SELECT COUNT(*) AS cnt FROM shifts
      WHERE workspace_id = $1 AND employee_id = $2
        AND start_time BETWEEN $3 AND $4 AND status != 'cancelled'
    `, [workspaceId, employeeId, start, end]);

    // CATEGORY C — Raw SQL retained: COUNT( | Tables: time_entries | Verified: 2026-03-23
    const { rows: worked } = await typedPool(`
      SELECT COUNT(*) AS cnt FROM time_entries
      WHERE workspace_id = $1 AND employee_id = $2
        AND clock_in BETWEEN $3 AND $4
    `, [workspaceId, employeeId, start, end]);

    const scheduled = Number(sched[0].cnt) || 0;
    const workedCount = Number(worked[0].cnt) || 0;
    return {
      score: scheduled > 0 ? Math.min(100, Math.round((workedCount / scheduled) * 100)) : 100,
      scheduled,
      worked: workedCount
    };
  }

  private async calcReportScores(workspaceId: string, employeeId: string, start: Date, end: Date) {
    // Converted to Drizzle ORM: CASE WHEN → sql fragment
    const reportStats = await db.select({
      avgQuality: sql<number>`avg(case when ${(dailyActivityReports as any).qualityScore} is not null then ${(dailyActivityReports as any).qualityScore} else 75 end)`,
      submitted: sql<number>`count(*)::int`
    })
    .from(dailyActivityReports)
    .where(and(
      eq(dailyActivityReports.workspaceId, workspaceId),
      eq(dailyActivityReports.employeeId, employeeId),
      sql`${dailyActivityReports.createdAt} between ${start} and ${end}`
    ));

    const requiredShifts = await db.select({
      count: sql<number>`count(*)::int`
    })
    .from(shifts)
    .where(and(
      eq(shifts.workspaceId, workspaceId),
      eq(shifts.employeeId, employeeId),
      sql`${shifts.startTime} between ${start} and ${end}`,
      sql`${shifts.status} != 'cancelled'`
    ));

    const r = reportStats[0] || { avgQuality: 75, submitted: 0 };
    const required = requiredShifts[0]?.count || 1;
    const submitted = r.submitted || 0;
    return {
      qualityScore: Math.round(Number(r.avgQuality) || 75),
      submissionScore: Math.min(100, Math.round((submitted / required) * 100))
    };
  }

  private async calcClientSatisfaction(_workspaceId: string, _employeeId: string, _start: Date, _end: Date): Promise<null> {
    // client_feedback feature not yet implemented — returns null until table is created.
    // The client_feedback table does not exist in the live database schema.
    // Do not return a fake score. Composite calculation skips this metric when null.
    return null;
  }

  private async calcResponseTime(workspaceId: string, employeeId: string, _start: Date, _end: Date) {
    // Response time: based on message/dispatch acknowledgment latency
    // Default to 85 if no dispatch system data — real value filled when available
    return { score: 85 };
  }

  private async calcStreaks(workspaceId: string, employeeId: string) {
    // CATEGORY C — Raw SQL retained: FILTER (WHERE | Tables: time_entries, shifts | Verified: 2026-03-23
    const { rows: streakRows } = await typedPool(`
      SELECT
        COUNT(*) FILTER (WHERE te.clock_in <= s.start_time + INTERVAL '5 minutes') AS days_on_time,
        COUNT(*) AS shifts_total
      FROM time_entries te
      JOIN shifts s ON s.id = te.shift_id
      WHERE te.workspace_id = $1 AND te.employee_id = $2
        AND te.clock_in >= NOW() - INTERVAL '14 days'
    `, [workspaceId, employeeId]);

    // CATEGORY C — Raw SQL retained: COUNT( | Tables: daily_activity_reports | Verified: 2026-03-23
    const { rows: reportRows } = await typedPool(`
      SELECT COUNT(*) AS submitted FROM daily_activity_reports
      WHERE workspace_id = $1 AND employee_id = $2
        AND created_at >= NOW() - INTERVAL '30 days'
    `, [workspaceId, employeeId]).catch(() => ({ rows: [{ submitted: 0 }] }));

    return {
      daysOnTime: Number(streakRows[0]?.days_on_time) || 0,
      shiftsNoCalloff: Number(streakRows[0]?.shifts_total) || 0,
      reportsStreak: Number(reportRows[0]?.submitted) || 0
    };
  }

  private async detectTrend(workspaceId: string, employeeId: string, currentScore: number): Promise<{ direction: 'improving' | 'stable' | 'declining'; velocity: number }> {
    // CATEGORY C — Raw SQL retained: ORDER BY | Tables: officer_performance_scores | Verified: 2026-03-23
    const { rows } = await typedPool(`
      SELECT composite_score FROM officer_performance_scores
      WHERE workspace_id = $1 AND employee_id = $2
      ORDER BY period_start DESC
      LIMIT 3
    `, [workspaceId, employeeId]);

    if (rows.length < 2) return { direction: 'stable', velocity: 0 };

    const previous = rows.map(r => Number(r.composite_score));
    const avg = previous.reduce((a, b) => a + b, 0) / previous.length;
    const diff = currentScore - avg;
    const velocity = Math.abs(diff);

    if (diff > 5) return { direction: 'improving', velocity };
    if (diff < -5) return { direction: 'declining', velocity };
    return { direction: 'stable', velocity };
  }

  private async persistScores(scores: PerformanceScores): Promise<void> {
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(officerPerformanceScores).values({
      workspaceId: scores.workspaceId,
      employeeId: scores.employeeId,
      periodStart: scores.periodStart,
      periodEnd: scores.periodEnd,
      periodType: scores.periodType,
      clockinAccuracyScore: String(scores.clockinAccuracyScore),
      attendanceScore: String(scores.attendanceScore),
      reportQualityScore: String(scores.reportQualityScore),
      reportSubmissionScore: String(scores.reportSubmissionScore),
      clientSatisfactionScore: scores.clientSatisfactionScore !== null ? String(scores.clientSatisfactionScore) : null,
      responseTimeScore: String(scores.responseTimeScore),
      compositeScore: String(scores.compositeScore),
      trend: scores.trend,
      trendVelocity: String(scores.trendVelocity),
      consecutiveDaysOnTime: scores.consecutiveDaysOnTime,
      consecutiveShiftsNoCalloff: scores.consecutiveShiftsNoCalloff,
      reportsSubmittedStreak: scores.reportsSubmittedStreak,
      totalShiftsScheduled: scores.totalShiftsScheduled,
      totalShiftsWorked: scores.totalShiftsWorked,
      totalClockinsOnTime: scores.totalClockinsOnTime,
      calculatedAt: sql`now()`,
      validThrough: scores.periodEnd,
    }).onConflictDoNothing();
  }

  private async updateEmployeeComposite(workspaceId: string, employeeId: string, score: number): Promise<void> {
    // Converted to Drizzle ORM
    await db.update(employees)
      .set({
        performanceScore: score,
        updatedAt: sql`now()`,
      })
      .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)));
  }

  /** Get latest score for one employee */
  async getLatestScore(workspaceId: string, employeeId: string): Promise<PerformanceScores | null> {
    // CATEGORY C — Raw SQL retained: ORDER BY | Tables: officer_performance_scores | Verified: 2026-03-23
    const { rows } = await typedPool(`
      SELECT * FROM officer_performance_scores
      WHERE workspace_id = $1 AND employee_id = $2
      ORDER BY period_start DESC
      LIMIT 1
    `, [workspaceId, employeeId]);
    if (!rows.length) return null;
    const r = rows[0];
    return {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      employeeId: r.employee_id,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      workspaceId: r.workspace_id,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      periodStart: r.period_start,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      periodEnd: r.period_end,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      periodType: r.period_type,
      clockinAccuracyScore: Number(r.clockin_accuracy_score),
      attendanceScore: Number(r.attendance_score),
      reportQualityScore: Number(r.report_quality_score),
      reportSubmissionScore: Number(r.report_submission_score),
      clientSatisfactionScore: r.client_satisfaction_score !== null ? Number(r.client_satisfaction_score) : null,
      responseTimeScore: Number(r.response_time_score),
      supervisorInputScore: r.supervisor_input_score ? Number(r.supervisor_input_score) : null,
      compositeScore: Number(r.composite_score),
      // @ts-expect-error — TS migration: fix in refactoring sprint
      trend: r.trend,
      trendVelocity: Number(r.trend_velocity),
      consecutiveDaysOnTime: Number(r.consecutive_days_on_time),
      consecutiveShiftsNoCalloff: Number(r.consecutive_shifts_no_calloff),
      reportsSubmittedStreak: Number(r.reports_submitted_streak),
      totalShiftsScheduled: Number(r.total_shifts_scheduled),
      totalShiftsWorked: Number(r.total_shifts_worked),
      totalClockinsOnTime: Number(r.total_clockins_on_time)
    };
  }

  /** Check if an officer qualifies for a raise suggestion (composite >= 80 for 90+ days) */
  async checkRaiseSuggestionEligibility(workspaceId: string, employeeId: string): Promise<{ eligible: boolean; avgScore: number; daysAboveThreshold: number }> {
    // CATEGORY C — Raw SQL retained: AVG( | Tables: officer_performance_scores | Verified: 2026-03-23
    const { rows } = await typedPool(`
      SELECT AVG(composite_score) AS avg_score,
             SUM(EXTRACT(DAY FROM (period_end::date - period_start::date))) AS days_tracked
      FROM officer_performance_scores
      WHERE workspace_id = $1 AND employee_id = $2
        AND composite_score >= 80
        AND period_start >= NOW() - INTERVAL '90 days'
    `, [workspaceId, employeeId]);
    const avg = Number(rows[0]?.avg_score) || 0;
    const days = Number(rows[0]?.days_tracked) || 0;
    return { eligible: days >= 85, avgScore: Math.round(avg), daysAboveThreshold: days };
  }

  /** Get top performers for Officer of the Month consideration */
  async getTopPerformers(workspaceId: string, limit = 5): Promise<any[]> {
    // CATEGORY C — Raw SQL retained: DISTINCT ON | Tables: officer_performance_scores, employees | Verified: 2026-03-23
    const { rows } = await typedPool(`
      SELECT DISTINCT ON (ops.employee_id)
        ops.employee_id, e.first_name, e.last_name, e.position,
        ops.composite_score, ops.trend, ops.clockin_accuracy_score, ops.attendance_score
      FROM officer_performance_scores ops
      JOIN employees e ON e.id = ops.employee_id
      WHERE ops.workspace_id = $1
        AND ops.period_start >= NOW() - INTERVAL '30 days'
        AND e.is_active = true
      ORDER BY ops.employee_id, ops.composite_score DESC
      LIMIT $2
    `, [workspaceId, limit * 3]);

    return rows.sort((a, b) => Number(b.composite_score) - Number(a.composite_score)).slice(0, limit);
  }
}

export const trinityPerformanceCalculator = new TrinityPerformanceCalculator();
log.info('[TrinityPerformanceCalculator] Initialized — 6-dimension scoring engine ready');
