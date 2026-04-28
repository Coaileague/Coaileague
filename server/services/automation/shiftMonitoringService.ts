/**
 * SHIFT MONITORING SERVICE - Trinity Autonomous Shift Oversight
 * ==============================================================
 * Background service that continuously monitors active shifts for:
 * - Late clock-ins (15+ min after shift start)
 * - No-call-no-show detection (1+ hour after shift start)
 * - Geofence violations during active shifts
 * - Auto-replacement triggers when employees fail to show
 * 
 * Integrates with:
 * - CoAIleague Smart Scheduling for auto-replacement
 * - Employee Scoring for point deductions
 * - Notification system for org owner alerts
 * - Trinity orchestration for awareness
 */

import { db } from '../../db';
import { pool } from '../../db';
import { shifts, timeEntries, employees, notifications } from '@shared/schema';
import { eq, and, gte, lte, isNull, or, ne, sql } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';
import { coaileagueScoringService } from './coaileagueScoringService';
import { universalNotificationEngine } from '../universalNotificationEngine';
import { coveragePipeline } from './coveragePipeline';
import { automationOrchestration } from '../orchestration/automationOrchestration';
import { typedPool, typedPoolExec, typedQuery } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('shiftMonitoringService');


export interface ShiftAlert {
  type: 'late_clock_in' | 'no_call_no_show' | 'geo_violation' | 'replacement_needed' | 'replacement_found' | 'replacement_failed';
  shiftId: string;
  employeeId: string;
  employeeName: string;
  workspaceId: string;
  severity: 'warning' | 'critical';
  message: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

interface MonitoringResult {
  shiftsChecked: number;
  lateAlerts: number;
  ncnsAlerts: number;
  replacementsTriggered: number;
  replacementsSuccessful: number;
  replacementsFailed: number;
}

const LATE_THRESHOLD_MINUTES = 5;
const NCNS_THRESHOLD_MINUTES = 60;
const MONITORING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

class ShiftMonitoringService {
  private static instance: ShiftMonitoringService;
  private isRunning = false;
  private cycleRunning = false; // G10 FIX: per-cycle re-entrant guard
  private intervalId: NodeJS.Timeout | null = null;
  private lastRunTime: Date | null = null;
  // G9 FIX: reminder dedup — maps "shiftId:reminderType" → expiry ms
  // Prevents duplicate notifications when a shift falls in two consecutive 5-min cycles
  private reminderSentCache = new Map<string, number>();
  private stats = {
    totalRuns: 0,
    totalAlertsGenerated: 0,
    totalReplacementsTriggered: 0,
  };

  private constructor() {}

  static getInstance(): ShiftMonitoringService {
    if (!this.instance) {
      this.instance = new ShiftMonitoringService();
    }
    return this.instance;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      log.info('[ShiftMonitor] Already running');
      return;
    }

    log.info('[ShiftMonitor] Starting autonomous shift monitoring...');
    this.isRunning = true;

    await this.runMonitoringCycle();

    this.intervalId = setInterval(async () => {
      try {
        await this.runMonitoringCycle();
      } catch (error: any) {
        this.cycleRunning = false; // G10 FIX: release lock if orchestration threw
        log.warn('[ShiftMonitor] Monitoring cycle failed (will retry):', error?.message || 'unknown');
      }
    }, MONITORING_INTERVAL_MS);

    log.info('[ShiftMonitor] Service started — monitoring active shifts');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    log.info('[ShiftMonitor] Stopped');
  }

  // @ts-expect-error — TS migration: fix in refactoring sprint
  getStatus(): { running: boolean; lastRun: Date | null; stats: typeof this.stats } {
    return {
      running: this.isRunning,
      lastRun: this.lastRunTime,
      stats: this.stats,
    };
  }

  async runMonitoringCycle(): Promise<MonitoringResult> {
    // G10 FIX: prevent concurrent cycles if previous cycle is still running (slow DB)
    if (this.cycleRunning) {
      log.warn('[ShiftMonitor] Previous cycle still running — skipping this tick to prevent overlap');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      return { shiftsChecked: 0, lateAlerts: 0, ncnsAlerts: 0, replacementsTriggered: 0 };
    }
    this.cycleRunning = true;

    // G9 FIX: prune expired reminder dedup entries
    const now = new Date();
    for (const [key, expiry] of this.reminderSentCache.entries()) {
      if (expiry < now.getTime()) this.reminderSentCache.delete(key);
    }

    this.lastRunTime = now;
    this.stats.totalRuns++;

    const orchestrationResult = await automationOrchestration.executeAutomation(
      {
        domain: 'time_tracking',
        automationName: 'shift-monitoring-cycle',
        automationType: 'daemon',
        triggeredBy: 'cron',
        payload: { timestamp: now.toISOString() },
        billable: false,
      },
      async (ctx) => {
        const result: MonitoringResult = {
          shiftsChecked: 0,
          lateAlerts: 0,
          ncnsAlerts: 0,
          replacementsTriggered: 0,
          replacementsSuccessful: 0,
          replacementsFailed: 0,
        };

        const today = now.toISOString().split('T')[0];
        const windowStart = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        const windowEnd = new Date(now.getTime() + 30 * 60 * 1000);

        const activeShifts = await db.select({
          shift: shifts,
          employee: employees,
        })
          .from(shifts)
          .innerJoin(employees, eq(shifts.employeeId, employees.id))
          .where(
            and(
              eq(shifts.date, today),
              gte(shifts.startTime, windowStart),
              lte(shifts.startTime, windowEnd),
              or(
                eq(shifts.status, 'scheduled'),
                eq(shifts.status, 'confirmed'),
                eq(shifts.status, 'pending')
              )
            )
          );

          result.shiftsChecked = activeShifts.length;

        for (const { shift, employee } of activeShifts) {
          if (!employee.isActive) continue;

          const shiftStart = new Date(shift.startTime);
          const minutesSinceStart = (now.getTime() - shiftStart.getTime()) / (1000 * 60);

          if (minutesSinceStart < 0) continue;

          const timeEntry = await db.query.timeEntries.findFirst({
            where: and(
              eq(timeEntries.employeeId, shift.employeeId!),
              eq(timeEntries.shiftId, shift.id)
            ),
          });

          const hasClockedIn = !!timeEntry;

          if (!hasClockedIn) {
            if (minutesSinceStart >= NCNS_THRESHOLD_MINUTES) {
              // DB-backed dedup: check both in-memory cache AND database before firing.
              // In-memory cache prevents repeated DB queries within the same session.
              // DB query prevents re-firing after a server restart (in-memory cache loss).
              const ncnsKey = `${shift.id}:ncns`;
              if (!this.reminderSentCache.has(ncnsKey)) {
                const ncnsCutoff = new Date(now.getTime() - 4 * 60 * 60 * 1000);
                // CATEGORY C — Raw SQL retained: LIMIT | Tables: notifications | Verified: 2026-03-23
                const ncnsExisting = await typedQuery(
                  sql`SELECT id FROM notifications
                      WHERE workspace_id = ${shift.workspaceId}
                        AND type = 'issue_detected'
                        AND metadata->>'shiftId' = ${shift.id}
                        AND metadata->>'alertType' = 'no_call_no_show'
                        AND created_at > ${ncnsCutoff.toISOString()}
                      LIMIT 1`
                );
                // Seed cache regardless — prevents repeated DB queries in future cycles
                this.reminderSentCache.set(ncnsKey, now.getTime() + 4 * 60 * 60 * 1000);

                const ncnsAlreadySent = (ncnsExisting as any[]).length > 0;
                if (!ncnsAlreadySent) {
                  result.ncnsAlerts++;
                  await this.handleNoCallNoShow(shift, employee, minutesSinceStart);

                  const replacementResult = await this.triggerAutoReplacement(shift, 'ncns');
                  result.replacementsTriggered++;
                  if (replacementResult.success) {
                    result.replacementsSuccessful++;
                  } else {
                    result.replacementsFailed++;
                  }
                }
              }
            } else if (minutesSinceStart >= LATE_THRESHOLD_MINUTES) {
              // DB-backed dedup for late_clock_in — prevents re-alerting every 5-min cycle
              // and survives server restarts.
              const lateKey = `${shift.id}:late`;
              if (!this.reminderSentCache.has(lateKey)) {
                const lateCutoff = new Date(now.getTime() - 90 * 60 * 1000);
                // CATEGORY C — Raw SQL retained: LIMIT | Tables: notifications | Verified: 2026-03-23
                const lateExisting = await typedQuery(
                  sql`SELECT id FROM notifications
                      WHERE workspace_id = ${shift.workspaceId}
                        AND type = 'issue_detected'
                        AND metadata->>'shiftId' = ${shift.id}
                        AND metadata->>'alertType' = 'late_clock_in'
                        AND created_at > ${lateCutoff.toISOString()}
                      LIMIT 1`
                );
                this.reminderSentCache.set(lateKey, now.getTime() + 90 * 60 * 1000);

                if ((lateExisting as any[]).length === 0) {
                  result.lateAlerts++;
                  await this.handleLateClockIn(shift, employee, minutesSinceStart);
                }
              }
            }
          }
        }

        if (result.lateAlerts > 0 || result.ncnsAlerts > 0) {
          log.info(`[ShiftMonitor] Cycle complete: ${result.shiftsChecked} shifts, ${result.lateAlerts} late, ${result.ncnsAlerts} NCNS`);
        }

        // PRE-SHIFT REMINDERS: Notify officers 25-35 min before shift start
        try {
          const reminderWindowStart = new Date(now.getTime() + 25 * 60 * 1000);
          const reminderWindowEnd = new Date(now.getTime() + 35 * 60 * 1000);

          const upcomingShifts = await db.select({
            shift: shifts,
            employee: employees,
          })
            .from(shifts)
            .innerJoin(employees, eq(shifts.employeeId, employees.id))
            .where(
              and(
                eq(shifts.date, today),
                gte(shifts.startTime, reminderWindowStart),
                lte(shifts.startTime, reminderWindowEnd),
                or(
                  eq(shifts.status, 'scheduled'),
                  eq(shifts.status, 'confirmed'),
                  eq(shifts.status, 'published')
                )
              )
            );

          for (const { shift: upShift, employee: upEmployee } of upcomingShifts) {
            if (!upEmployee.isActive || !upEmployee.userId) continue;

            // G9 FIX: dedup — skip if we already sent this reminder in a recent cycle.
            // The 10-min overlap window (25-35 min ahead) means a shift can appear in
            // 2 consecutive 5-min cycles; without dedup each guard gets 2 reminders.
            const reminderKey = `${upShift.id}:pre_shift_30min`;
            if (this.reminderSentCache.has(reminderKey)) continue;
            // Cache for 90 minutes (well past the shift start)
            this.reminderSentCache.set(reminderKey, now.getTime() + 90 * 60 * 1000);

            try {
              await universalNotificationEngine.sendNotification({
                workspaceId: upShift.workspaceId,
                userId: upEmployee.userId,
                idempotencyKey: `notif:shift:${upShift.id}:pre_shift_30min:${upEmployee.userId}`,
          type: 'issue_detected',
                title: 'Shift Reminder — 30 Minutes',
                message: `Your shift starts in approximately 30 minutes (${new Date(upShift.startTime).toLocaleTimeString()}). Please be on-site and ready to clock in on time.`,
                severity: 'info',
                metadata: { shiftId: upShift.id, startTime: upShift.startTime, reminderType: 'pre_shift_30min' },
              });
            } catch (notifyErr: any) {
              log.warn(`[ShiftMonitor] Pre-shift reminder failed for employee ${upEmployee.id}:`, notifyErr.message);
            }
          }

          if (upcomingShifts.length > 0) {
            log.info(`[ShiftMonitor] Pre-shift reminders sent: ${upcomingShifts.length} upcoming shifts`);
          }
        } catch (reminderErr: any) {
          log.error('[ShiftMonitor] Pre-shift reminder block failed (non-blocking):', reminderErr.message);
        }

        try {
          const overdueThresholdHours = 8;
          // Converted to Drizzle ORM: visitor overstay alert → INTERVAL
          const { visitorLogs } = await import('@shared/schema');
          const { and, eq, lt, sql: drizzleSql } = await import('drizzle-orm');

          const overdueVisitorsResult = await db
            .select({
              id: visitorLogs.id,
              workspaceId: visitorLogs.workspaceId,
              visitorName: visitorLogs.visitorName,
              siteName: visitorLogs.siteName,
              checkedInAt: visitorLogs.checkedInAt,
            })
            .from(visitorLogs)
            .where(and(
              isNull(visitorLogs.checkedOutAt),
              eq(visitorLogs.alertSent, false),
              lt(visitorLogs.checkedInAt, drizzleSql`NOW() - INTERVAL '${drizzleSql.raw(overdueThresholdHours.toString())} hours'`),
            ))
            .limit(50);

          for (const v of overdueVisitorsResult) {
            const hoursCheckedIn = Math.round((now.getTime() - new Date(v.checkedInAt!).getTime()) / (1000 * 60 * 60));
            platformEventBus.publish({
              type: 'coverage_gap_detected',
              category: 'automation',
              title: 'Visitor Overstay Alert',
              description: `${v.visitorName} has been checked in for ${hoursCheckedIn}h at ${v.siteName} without checking out`,
              workspaceId: v.workspaceId,
              metadata: {
                alertType: 'visitor_never_left',
                visitorLogId: v.id,
                visitorName: v.visitorName,
                siteName: v.siteName,
                hoursCheckedIn,
              },
            }).catch((err) => log.warn('[shiftMonitoringService] Fire-and-forget failed:', err));
            // Converted to Drizzle ORM: update visitor_logs alert_sent
            await db.update(visitorLogs)
              .set({ alertSent: true })
              .where(eq(visitorLogs.id, v.id));
          }
          if (overdueVisitorsResult.length > 0) {
            log.info(`[ShiftMonitor] Visitor alerts: ${overdueVisitorsResult.length} visitors never left`);
          }
        } catch (visitorErr: any) {
          log.error('[ShiftMonitor] Visitor monitoring error (non-blocking):', visitorErr.message);
        }

        return result;
      }
    );

    // G10 FIX: always release cycle lock after orchestration resolves
    this.cycleRunning = false;

    if (orchestrationResult.success && orchestrationResult.data) {
      this.stats.totalAlertsGenerated += orchestrationResult.data.lateAlerts + orchestrationResult.data.ncnsAlerts;
      this.stats.totalReplacementsTriggered += orchestrationResult.data.replacementsTriggered;
      return orchestrationResult.data;
    }

    return {
      shiftsChecked: 0,
      lateAlerts: 0,
      ncnsAlerts: 0,
      replacementsTriggered: 0,
      replacementsSuccessful: 0,
      replacementsFailed: 0,
    };
  }

  private async handleLateClockIn(shift: any, employee: any, minutesLate: number): Promise<void> {
    const alert: ShiftAlert = {
      type: 'late_clock_in',
      shiftId: shift.id,
      employeeId: employee.id,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      workspaceId: shift.workspaceId,
      severity: 'warning',
      message: `${employee.firstName} ${employee.lastName} is ${Math.round(minutesLate)} minutes late for their shift`,
      timestamp: new Date(),
      metadata: { minutesLate, shiftStart: shift.startTime },
    };

    await this.emitAlert(alert);
    // Late clock-ins are a field management event — route to managers/supervisors only
    await this.notifyFieldManagers(shift.workspaceId, alert);
  }

  private async handleNoCallNoShow(shift: any, employee: any, minutesLate: number): Promise<void> {
    const alert: ShiftAlert = {
      type: 'no_call_no_show',
      shiftId: shift.id,
      employeeId: employee.id,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      workspaceId: shift.workspaceId,
      severity: 'critical',
      message: `NCNS: ${employee.firstName} ${employee.lastName} has not clocked in (${Math.round(minutesLate)} min late)`,
      timestamp: new Date(),
      metadata: { minutesLate, shiftStart: shift.startTime },
    };

    await this.emitAlert(alert);
    // NCNS is a field management event — route to managers/supervisors only
    await this.notifyFieldManagers(shift.workspaceId, alert);

    try {
      await coaileagueScoringService.processEvent(
        shift.workspaceId,
        employee.id,
        'shift_no_show',
        // @ts-expect-error — TS migration: fix in refactoring sprint
        { shiftId: shift.id }
      );
    } catch (err) {
      log.error('[ShiftMonitor] Failed to record NCNS scoring event:', err);
    }
  }

  async triggerAutoReplacement(shift: any, reason: 'ncns' | 'call_off'): Promise<{ success: boolean; replacementId?: string; error?: string }> {
    log.info(`[ShiftMonitor] Triggering coverage pipeline for shift ${shift.id} (reason: ${reason})`);

    // ─── STAY-LATE FIRST CHECK ───────────────────────────────────────────────
    // Real security ops: the most efficient coverage solution is asking the officer
    // already on-site (or finishing their shift at the same client location) to stay
    // late. Trinity checks this BEFORE broadcasting to the general pool.
    // This mirrors how actual security dispatch works — call the post first.
    try {
      const shiftStart = new Date(shift.startTime);
      const windowStart = new Date(shiftStart.getTime() - 60 * 60 * 1000); // 1h before new shift
      const windowEnd   = new Date(shiftStart.getTime() + 90 * 60 * 1000); // 1.5h after new shift

      const onSiteShifts = await db.select({
        id: shifts.id,
        employeeId: shifts.employeeId,
        endTime: shifts.endTime,
      })
        .from(shifts)
        .where(
          and(
            eq(shifts.workspaceId, shift.workspaceId),
            eq(shifts.clientId, shift.clientId),
            ne(shifts.id, shift.id),
            gte(shifts.endTime, windowStart),
            lte(shifts.endTime, windowEnd)
          )
        )
        .limit(5);

      for (const onSite of onSiteShifts) {
        if (!onSite.employeeId) continue;
        const officer = await db.query.employees.findFirst({
          where: and(
            eq(employees.id, onSite.employeeId),
            eq(employees.isActive, true)
          ),
        });
        if (!officer || (officer as any).overtimeEligible === false) continue;

        const gapHours = (shiftStart.getTime() - new Date(onSite.endTime).getTime()) / (1000 * 60 * 60);
        const stayLateNote = gapHours <= 0
          ? `${officer.firstName} is currently on-site — requesting they extend their shift to cover the gap.`
          : `${officer.firstName} finishes in ${gapHours.toFixed(1)}h — requesting they stay for the next shift.`;

        log.info(`[ShiftMonitor] STAY-LATE CHECK: ${stayLateNote}`);

        if (officer.userId) {
          await universalNotificationEngine.sendNotification({
            workspaceId: shift.workspaceId,
            userId: officer.userId,
            idempotencyKey: `notif:shift:${shift.id}:stay_late:${officer.userId}`,
          type: 'issue_detected',
            title: `Stay-Late Request — ${reason === 'ncns' ? 'No-Show Coverage Needed' : 'Call-Off Coverage Needed'}`,
            message: `Your post needs coverage. Can you stay late to cover the next shift (starting ${shiftStart.toLocaleTimeString()})? A co-worker ${reason === 'ncns' ? 'did not show up' : 'called off'}. Please respond ASAP or clock out normally if you cannot extend.`,
            severity: 'warning',
            metadata: {
              shiftId: shift.id,
              clientId: shift.clientId,
              reason,
              stayLateRequest: true,
              requestedAt: new Date().toISOString(),
            },
          });
        }

        log.info(`[ShiftMonitor] Stay-late notification sent to ${officer.firstName} ${officer.lastName} via UNE`);
        break; // Notify the single most relevant on-site officer — general pool follows below
      }
    } catch (stayLateErr: any) {
      log.warn(`[ShiftMonitor] Stay-late check failed (non-blocking): ${stayLateErr.message}`);
    }
    // ─────────────────────────────────────────────────────────────────────────

    try {
      // Broadcast to the general coverage pool regardless — first to accept wins
      const result = await coveragePipeline.triggerCoverage({
        shiftId: shift.id,
        workspaceId: shift.workspaceId,
        reason,
        reasonDetails: `Detected via shift monitoring at ${new Date().toISOString()}`,
        originalEmployeeId: shift.employeeId,
      });

      if (result.success) {
        const alert: ShiftAlert = {
          type: 'replacement_needed',
          shiftId: shift.id,
          employeeId: shift.employeeId || '',
          employeeName: 'N/A',
          workspaceId: shift.workspaceId,
          severity: 'warning',
          message: `I've sent coverage requests to ${result.candidatesInvited} available employees`,
          timestamp: new Date(),
          metadata: { 
            coverageRequestId: result.coverageRequestId,
            candidatesInvited: result.candidatesInvited,
            reason,
          },
        };

        await this.emitAlert(alert);
        this.stats.totalReplacementsTriggered++;
        
        return { 
          success: true, 
          replacementId: result.coverageRequestId,
        };
      }

      // PLATFORM POOL FALLBACK: Search cross-org licensed workers who opted in
      await this.searchPlatformPool(shift);
      await this.handleReplacementFailed(shift, reason, result.error || 'Coverage pipeline failed');
      return { success: false, error: result.error };

    } catch (error: any) {
      log.error('[ShiftMonitor] Coverage pipeline failed:', error);
      await this.searchPlatformPool(shift).catch((err) => log.warn('[shiftMonitoringService] Fire-and-forget failed:', err));
      await this.handleReplacementFailed(shift, reason, (error instanceof Error ? error.message : String(error)));
      return { success: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  }

  private async searchPlatformPool(shift: any): Promise<void> {
    try {
      const poolResult = await pool.query<{
        id: string; first_name: string; last_name: string;
        user_id: string | null; performance_score: number | null; workspace_id: string;
      }>(
        `SELECT id, first_name, last_name, user_id, performance_score, workspace_id
         FROM employees
         WHERE is_active = true
           AND platform_pool_opted_in = true
         ORDER BY performance_score DESC NULLS LAST
         LIMIT 20`
      );

      if (poolResult.rows.length === 0) {
        platformEventBus.publish({
          type: 'coverage_gap_detected',
          category: 'automation',
          title: 'No Coverage Found',
          description: 'No internal or platform pool coverage found. Manual intervention required.',
          workspaceId: shift.workspaceId,
          metadata: { shiftId: shift.id, employeeId: shift.employeeId },
        }).catch((err) => log.warn('[shiftMonitoringService] Fire-and-forget failed:', err));
        return;
      }

      const shiftStart = new Date(shift.startTime);
      const shiftEnd = new Date(shift.endTime);
      const available = [];

      for (const worker of poolResult.rows) {
        const conflict = await db.select({ id: shifts.id }).from(shifts)
          .where(
            and(
              eq(shifts.employeeId, worker.id),
              lte(shifts.startTime, shiftEnd),
              gte(shifts.endTime, shiftStart),
              or(eq(shifts.status, 'scheduled'), eq(shifts.status, 'confirmed'), eq(shifts.status, 'published'))
            )
          ).limit(1);
        if (!conflict.length) available.push(worker);
        if (available.length >= 5) break;
      }

      if (available.length === 0) {
        platformEventBus.publish({
          type: 'coverage_gap_detected',
          category: 'automation',
          title: 'No Available Pool Workers',
          description: 'No available platform pool workers for this shift window.',
          workspaceId: shift.workspaceId,
          metadata: { shiftId: shift.id, employeeId: shift.employeeId },
        }).catch((err) => log.warn('[shiftMonitoringService] Fire-and-forget failed:', err));
        return;
      }

      for (const worker of available) {
        if (!worker.user_id) continue;
        await universalNotificationEngine.sendNotification({
          workspaceId: shift.workspaceId,
          userId: worker.user_id,
          idempotencyKey: `notif:shift:${shift.id}:platform_pool:${worker.user_id}`,
          type: 'issue_detected',
          title: 'Platform Pool Shift Available',
          message: `Emergency coverage needed. A shift is available starting at ${shiftStart.toLocaleTimeString()}. Reply to claim this opportunity.`,
          severity: 'warning',
          metadata: {
            shiftId: shift.id,
            sourceWorkspaceId: shift.workspaceId,
            isPlatformPool: true,
            requestedAt: new Date().toISOString(),
          },
        });
      }

      log.info(`[ShiftMonitor] Platform pool: notified ${available.length} workers for shift ${shift.id}`);
    } catch (err: any) {
      log.error('[ShiftMonitor] Platform pool search failed (non-blocking):', (err instanceof Error ? err.message : String(err)));
    }
  }

  private async handleReplacementFailed(shift: any, reason: string, errorMessage: string): Promise<void> {
    const alert: ShiftAlert = {
      type: 'replacement_failed',
      shiftId: shift.id,
      employeeId: shift.employeeId || '',
      employeeName: 'N/A',
      workspaceId: shift.workspaceId,
      severity: 'critical',
      message: `AUTO-FILL FAILED: I couldn't find a replacement for this shift. Reason: ${errorMessage}`,
      timestamp: new Date(),
      metadata: { reason, errorMessage, shiftStart: shift.startTime, clientId: shift.clientId },
    };

    await this.emitAlert(alert);
    await this.notifyOrgOwner(shift.workspaceId, alert);
  }

  private async emitAlert(alert: ShiftAlert): Promise<void> {
    this.stats.totalAlertsGenerated++;
    log.info(`[ShiftMonitor] Alert: ${alert.type} for ${alert.employeeName} (${alert.severity})`);
  }

  /**
   * Notify field managers and supervisors about operational shift events.
   * ROUTING POLICY: Late arrivals, NCNS, and GPS issues go to managers/supervisors ONLY.
   * Owners (org_owner, co_owner) should NOT receive routine field operations alerts.
   */
  private async notifyFieldManagers(workspaceId: string, alert: ShiftAlert): Promise<void> {
    try {
      const managers = await db.select()
        .from(employees)
        .where(
          and(
            eq(employees.workspaceId, workspaceId),
            or(
              eq(employees.workspaceRole as any, 'manager'),
              eq(employees.workspaceRole as any, 'supervisor'),
              eq(employees.workspaceRole as any, 'department_manager'),
              eq(employees.workspaceRole as any, 'field_supervisor')
            )
          )
        );

      for (const mgr of managers) {
        if (!mgr.userId) continue;
        await universalNotificationEngine.sendNotification({
          workspaceId,
          userId: mgr.userId,
          idempotencyKey: `notif:shift:${alert.shiftId}:${alert.type}:mgr:${mgr.userId}`,
          type: 'issue_detected',
          title: `Shift Alert: ${alert.employeeName} - ${alert.type.replace(/_/g, ' ')}`,
          message: alert.message,
          severity: alert.severity === 'critical' ? 'critical' : 'warning',
          metadata: {
            alertType: alert.type,
            shiftId: alert.shiftId,
            employeeId: alert.employeeId,
            employeeName: alert.employeeName,
            source: 'shift_monitoring_service',
            ...alert.metadata,
          },
        });
      }
    } catch (error) {
      log.error('[ShiftMonitor] Failed to notify field managers:', error);
    }
  }

  /**
   * Notify owners about critical failures requiring executive action.
   * Only called for replacement_failed — a situation requiring owner intervention.
   * Routine field events (late arrivals, NCNS) use notifyFieldManagers instead.
   */
  private async notifyOrgOwner(workspaceId: string, alert: ShiftAlert): Promise<void> {
    try {
      const orgOwners = await db.select()
        .from(employees)
        .where(
          and(
            eq(employees.workspaceId, workspaceId),
            or(
              eq(employees.workspaceRole as any, 'org_owner'),
              eq(employees.workspaceRole as any, 'co_owner')
            )
          )
        );

      for (const owner of orgOwners) {
        if (owner.userId) {
          await universalNotificationEngine.sendNotification({
            workspaceId,
            userId: owner.userId,
            idempotencyKey: `notif:shift:${alert.shiftId}:${alert.type}:owner:${owner.userId}`,
          type: 'issue_detected',
            title: `Critical: ${alert.type.replace(/_/g, ' ')} — Action Required`,
            message: alert.message,
            severity: 'critical',
            metadata: {
              alertType: alert.type,
              shiftId: alert.shiftId,
              employeeId: alert.employeeId,
              employeeName: alert.employeeName,
              source: 'shift_monitoring_service',
              ...alert.metadata,
            },
          });
        }
      }
    } catch (error) {
      log.error('[ShiftMonitor] Failed to notify org owner:', error);
    }
  }
}

export const shiftMonitoringService = ShiftMonitoringService.getInstance();
