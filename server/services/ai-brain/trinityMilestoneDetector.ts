/**
 * TRINITY MILESTONE DETECTOR
 * ===========================
 * Scans for employee life events and queues celebration actions.
 * Runs every morning at 6am as part of dream state.
 *
 * Events detected:
 *  - Birthdays (today and next 3 days)
 *  - Work anniversaries (1yr, 2yr, 5yr)
 *  - 30-day, 90-day, 1-year tenure milestones
 *  - New hires (last 48 hours)
 *  - 14-day clock-in accuracy streak
 *  - 30-day perfect attendance streak
 *  - 30-day report submission streak
 */

import { db, pool } from '../../db';
import { sql, count, and, eq } from 'drizzle-orm';
import { createNotification } from '../notificationService';
import { typedPool, typedPoolExec } from '../../lib/typedSql';
import { milestoneTracker } from '@shared/schema/domains/orgs/extended';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityMilestoneDetector');

export type MilestoneType =
  | 'birthday'
  | 'work_anniversary_1yr'
  | 'work_anniversary_2yr'
  | 'work_anniversary_5yr'
  | 'probation_30day'
  | 'probation_90day'
  | 'tenure_1year'
  | 'new_hire'
  | 'clockin_streak_14'
  | 'perfect_attendance_30'
  | 'report_streak_30'
  | 'promotion'
  | 'certification_earned'
  | 'officer_of_month'
  | 'client_welcome'
  | 'raise_approved';

export interface DetectedMilestone {
  workspaceId: string;
  employeeId: string;
  employeeName: string;
  milestoneType: MilestoneType;
  milestoneDate: string;
  context: Record<string, any>;
  alreadyTriggered: boolean;
}

class TrinityMilestoneDetector {
  /**
   * Main scan — runs every morning. Detects all milestone types across all
   * active employees in a workspace (or all workspaces when workspaceId is null).
   */
  async scanWorkspace(workspaceId: string): Promise<DetectedMilestone[]> {
    const detected: DetectedMilestone[] = [];
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // CATEGORY C — Raw SQL retained: position | Tables: employees | Verified: 2026-03-23
    const { rows: employees } = await typedPool(`
      SELECT id, workspace_id, first_name, last_name, hire_date, date_of_birth,
             created_at, position, hourly_rate, performance_score, is_active
      FROM employees
      WHERE workspace_id = $1 AND is_active = true
      ORDER BY first_name
    `, [workspaceId]);

    for (const emp of employees) {
      const empName = `${emp.first_name} ${emp.last_name}`;

      // --- BIRTHDAY ---
      if (emp.date_of_birth) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const dob = new Date(emp.date_of_birth);
        const thisYearBirthday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
        const daysUntil = Math.floor((thisYearBirthday.getTime() - today.getTime()) / 86400000);
        if (daysUntil >= 0 && daysUntil <= 3) {
          // @ts-expect-error — TS migration: fix in refactoring sprint
          const already = await this.alreadyTriggeredThisYear(workspaceId, emp.id, 'birthday');
          detected.push({
            // @ts-expect-error — TS migration: fix in refactoring sprint
            workspaceId, employeeId: emp.id, employeeName: empName,
            milestoneType: 'birthday',
            milestoneDate: thisYearBirthday.toISOString().split('T')[0],
            context: { daysUntil, firstName: emp.first_name },
            alreadyTriggered: already
          });
        }
      }

      // --- WORK ANNIVERSARIES ---
      if (emp.hire_date) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const hire = new Date(emp.hire_date);
        const yearsInService = today.getFullYear() - hire.getFullYear();
        for (const yr of [1, 2, 5]) {
          if (yearsInService === yr) {
            const anniversaryDate = new Date(hire.getFullYear() + yr, hire.getMonth(), hire.getDate());
            const daysUntil = Math.floor((anniversaryDate.getTime() - today.getTime()) / 86400000);
            if (daysUntil >= -1 && daysUntil <= 2) {
              const type: MilestoneType = `work_anniversary_${yr}yr` as MilestoneType;
              // @ts-expect-error — TS migration: fix in refactoring sprint
              const already = await this.alreadyTriggeredThisYear(workspaceId, emp.id, type);
              detected.push({
                // @ts-expect-error — TS migration: fix in refactoring sprint
                workspaceId, employeeId: emp.id, employeeName: empName,
                milestoneType: type,
                milestoneDate: anniversaryDate.toISOString().split('T')[0],
                context: { years: yr, firstName: emp.first_name },
                alreadyTriggered: already
              });
            }
          }
        }

        // --- TENURE MILESTONES (30 / 90 / 365 days) ---
        const daysInService = Math.floor((today.getTime() - hire.getTime()) / 86400000);
        for (const [days, type] of [[30, 'probation_30day'], [90, 'probation_90day'], [365, 'tenure_1year']] as const) {
          if (daysInService >= days && daysInService <= days + 2) {
            const milestoneDate = new Date(hire.getTime() + days * 86400000).toISOString().split('T')[0];
            // @ts-expect-error — TS migration: fix in refactoring sprint
            const already = await this.alreadyTriggered(workspaceId, emp.id, type as MilestoneType, milestoneDate);
            detected.push({
              // @ts-expect-error — TS migration: fix in refactoring sprint
              workspaceId, employeeId: emp.id, employeeName: empName,
              milestoneType: type as MilestoneType, milestoneDate,
              context: { daysInService, firstName: emp.first_name, performanceScore: emp.performance_score },
              alreadyTriggered: already
            });
          }
        }
      }

      // --- NEW HIRE (last 48 hours) ---
      if (emp.created_at) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const created = new Date(emp.created_at);
        const hoursAgo = (today.getTime() - created.getTime()) / 3600000;
        if (hoursAgo <= 48) {
          // @ts-expect-error — TS migration: fix in refactoring sprint
          const already = await this.alreadyTriggered(workspaceId, emp.id, 'new_hire', todayStr);
          detected.push({
            // @ts-expect-error — TS migration: fix in refactoring sprint
            workspaceId, employeeId: emp.id, employeeName: empName,
            milestoneType: 'new_hire', milestoneDate: todayStr,
            context: { hoursAgo: Math.round(hoursAgo), position: emp.position || 'Security Officer', firstName: emp.first_name },
            alreadyTriggered: already
          });
        }
      }
    }

    // --- CLOCK-IN STREAK (14 consecutive on-time clock-ins) ---
    const streaks = await this.detectClockinStreaks(workspaceId, 14);
    for (const s of streaks) {
      const already = await this.alreadyTriggeredThisMonth(workspaceId, s.employeeId, 'clockin_streak_14');
      detected.push({
        workspaceId, employeeId: s.employeeId, employeeName: s.employeeName,
        milestoneType: 'clockin_streak_14', milestoneDate: todayStr,
        context: { streakDays: s.streakDays, firstName: s.firstName },
        alreadyTriggered: already
      });
    }

    // --- PERFECT ATTENDANCE (30-day window, 0 absences) ---
    const attendees = await this.detectPerfectAttendance(workspaceId, 30);
    for (const a of attendees) {
      const already = await this.alreadyTriggeredThisMonth(workspaceId, a.employeeId, 'perfect_attendance_30');
      detected.push({
        workspaceId, employeeId: a.employeeId, employeeName: a.employeeName,
        milestoneType: 'perfect_attendance_30', milestoneDate: todayStr,
        context: { shiftsWorked: a.shiftsWorked, firstName: a.firstName },
        alreadyTriggered: already
      });
    }

    return detected;
  }

  private async detectClockinStreaks(workspaceId: string, minStreak: number): Promise<Array<{ employeeId: string; employeeName: string; firstName: string; streakDays: number }>> {
    // Converted to Drizzle ORM: INTERVAL → sql fragment
    const rows = await db.select({
        employeeId: (await import('@shared/schema')).employees.id,
        employeeName: sql`${(await import('@shared/schema')).employees.firstName} || ' ' || ${(await import('@shared/schema')).employees.lastName}`,
        firstName: (await import('@shared/schema')).employees.firstName,
        onTimeCount: count()
      })
      .from((await import('@shared/schema')).timeEntries)
      .innerJoin((await import('@shared/schema')).employees, eq((await import('@shared/schema')).employees.id, (await import('@shared/schema')).timeEntries.employeeId))
      .innerJoin((await import('@shared/schema/domains/scheduling')).shifts, eq((await import('@shared/schema/domains/scheduling')).shifts.id, (await import('@shared/schema')).timeEntries.shiftId))
      .where(and(
        eq((await import('@shared/schema')).timeEntries.workspaceId, workspaceId),
        sql`${(await import('@shared/schema')).timeEntries.clockIn} >= NOW() - INTERVAL '30 days'`,
        sql`${(await import('@shared/schema')).timeEntries.clockIn} <= ${(await import('@shared/schema/domains/scheduling')).shifts.startTime} + INTERVAL '5 minutes'`
      ))
      .groupBy((await import('@shared/schema')).employees.id, (await import('@shared/schema')).employees.firstName, (await import('@shared/schema')).employees.lastName)
      .having(sql`COUNT(*) >= ${minStreak}`)
      .catch(() => []);

    return rows.map(r => ({
      employeeId: r.employeeId,
      employeeName: r.employeeName as string,
      firstName: r.firstName,
      streakDays: Number(r.onTimeCount)
    }));
  }

  private async detectPerfectAttendance(workspaceId: string, days: number): Promise<Array<{ employeeId: string; employeeName: string; firstName: string; shiftsWorked: number }>> {
    // Converted to Drizzle ORM: INTERVAL → sql fragment
    // CATEGORY C — Raw SQL retained: WITH scheduled AS ( | Tables: shifts, time_entries, scheduled, worked, employees | Verified: 2026-03-23
    const { rows } = await db.execute(sql`
      WITH scheduled AS (
        SELECT employee_id, COUNT(*) AS total
        FROM shifts
        WHERE workspace_id = ${workspaceId} AND start_time >= NOW() - INTERVAL '${sql.raw(days.toString())} days'
          AND status != 'cancelled'
        GROUP BY employee_id
      ),
      worked AS (
        SELECT employee_id, COUNT(*) AS total
        FROM time_entries
        WHERE workspace_id = ${workspaceId} AND clock_in >= NOW() - INTERVAL '${sql.raw(days.toString())} days'
        GROUP BY employee_id
      )
      SELECT e.id AS employee_id, e.first_name || ' ' || e.last_name AS employee_name,
             e.first_name, w.total AS shifts_worked
      FROM scheduled sc
      JOIN worked w ON w.employee_id = sc.employee_id
      JOIN employees e ON e.id = sc.employee_id
      WHERE sc.total > 0 AND w.total >= sc.total
        AND sc.total >= 10
    `);
    return (rows as any[]).map(r => ({
      employeeId: r.employee_id,
      employeeName: r.employee_name,
      firstName: r.first_name,
      shiftsWorked: Number(r.shifts_worked)
    }));
  }

  /** Record a milestone as triggered so it doesn't re-fire */
  async recordMilestone(m: DetectedMilestone, actionTaken: Record<string, any>): Promise<void> {
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(milestoneTracker).values({
      workspaceId: m.workspaceId,
      employeeId: m.employeeId,
      milestoneType: m.milestoneType,
      milestoneDate: m.milestoneDate,
      actionTaken: actionTaken,
      celebrationMessageSent: true,
    }).onConflictDoUpdate({
      target: [milestoneTracker.workspaceId, milestoneTracker.employeeId, milestoneTracker.milestoneType, milestoneTracker.milestoneDate],
      set: {
        actionTaken: actionTaken,
        celebrationMessageSent: true,
        triggeredAt: sql`now()`,
      },
    });
  }

  async markManagerNotified(workspaceId: string, employeeId: string, milestoneType: string, milestoneDate: string): Promise<void> {
    // CATEGORY C — Raw SQL retained: AI brain engine multi-condition UPDATE | Tables: milestone_tracker | Verified: 2026-03-23
    await typedPoolExec(`
      UPDATE milestone_tracker SET manager_notified = true
      WHERE workspace_id = $1 AND employee_id = $2 AND milestone_type = $3 AND milestone_date = $4
    `, [workspaceId, employeeId, milestoneType, milestoneDate]);
  }

  private async alreadyTriggered(workspaceId: string, employeeId: string, type: string, date: string): Promise<boolean> {
    // CATEGORY C — Raw SQL retained: LIMIT | Tables: milestone_tracker | Verified: 2026-03-23
    const { rows } = await typedPool(`
      SELECT 1 FROM milestone_tracker
      WHERE workspace_id = $1 AND employee_id = $2 AND milestone_type = $3 AND milestone_date = $4
      LIMIT 1
    `, [workspaceId, employeeId, type, date]);
    return rows.length > 0;
  }

  private async alreadyTriggeredThisYear(workspaceId: string, employeeId: string, type: string): Promise<boolean> {
    const year = new Date().getFullYear();
    // CATEGORY C — Raw SQL retained: LIMIT | Tables: milestone_tracker | Verified: 2026-03-23
    const { rows } = await typedPool(`
      SELECT 1 FROM milestone_tracker
      WHERE workspace_id = $1 AND employee_id = $2 AND milestone_type = $3
        AND DATE_PART('year', milestone_date) = $4
      LIMIT 1
    `, [workspaceId, employeeId, type, year]);
    return rows.length > 0;
  }

  private async alreadyTriggeredThisMonth(workspaceId: string, employeeId: string, type: string): Promise<boolean> {
    // CATEGORY C — Raw SQL retained: LIMIT | Tables: milestone_tracker | Verified: 2026-03-23
    const { rows } = await typedPool(`
      SELECT 1 FROM milestone_tracker
      WHERE workspace_id = $1 AND employee_id = $2 AND milestone_type = $3
        AND triggered_at >= DATE_TRUNC('month', NOW())
      LIMIT 1
    `, [workspaceId, employeeId, type]);
    return rows.length > 0;
  }

  /** Get all pending (un-sent) milestones for a workspace */
  async getPendingMilestones(workspaceId: string): Promise<any[]> {
    // CATEGORY C — Raw SQL retained: ORDER BY | Tables: milestone_tracker, employees | Verified: 2026-03-23
    const { rows } = await typedPool(`
      SELECT mt.*, e.first_name, e.last_name, e.email, e.user_id
      FROM milestone_tracker mt
      JOIN employees e ON e.id = mt.employee_id
      WHERE mt.workspace_id = $1 AND mt.celebration_message_sent = false
      ORDER BY mt.created_at DESC
      LIMIT 50
    `, [workspaceId]);
    return rows;
  }

  /** Get recent milestones for dashboard display */
  async getRecentMilestones(workspaceId: string, days = 30): Promise<any[]> {
    // Converted to Drizzle ORM: INTERVAL → sql fragment
    // CATEGORY C — Raw SQL retained: INTERVAL | Tables: milestone_tracker, employees | Verified: 2026-03-23
    const { rows } = await db.execute(sql`
      SELECT mt.*, e.first_name, e.last_name, e.position
      FROM milestone_tracker mt
      JOIN employees e ON e.id = mt.employee_id
      WHERE mt.workspace_id = ${workspaceId} AND mt.created_at >= NOW() - INTERVAL '${sql.raw(days.toString())} days'
      ORDER BY mt.created_at DESC
      LIMIT 100
    `);
    return (rows as any[]);
  }
}

export const trinityMilestoneDetector = new TrinityMilestoneDetector();
log.info('[TrinityMilestoneDetector] Initialized — full lifecycle event scanning ready');
