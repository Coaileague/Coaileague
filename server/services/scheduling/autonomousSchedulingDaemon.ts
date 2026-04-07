/**
 * AUTONOMOUS SCHEDULING DAEMON - Background Scheduling Service
 * =============================================================
 * 
 * Runs periodically to:
 * 1. Detect and fill coverage gaps
 * 2. Apply recurring templates for upcoming weeks
 * 3. Send alerts for unfilled critical shifts
 * 4. Optimize existing schedules
 */

import { db } from '../../db';
import { shifts, workspaces } from '@shared/schema';
import { eq, and, gte, lte, isNull, sql } from 'drizzle-orm';
import { trinityAutonomousScheduler } from './trinityAutonomousScheduler';
import { recurringScheduleTemplates } from './recurringScheduleTemplates';
import { generateWeeklyShifts } from './trinityShiftGenerator';
import { broadcastToWorkspace } from '../../websocket';
import { auditLogger } from '../audit-logger';
import { automationOrchestration } from '../orchestration/automationOrchestration';
import { platformEventBus } from '../platformEventBus';
import { trinityActionReasoner } from '../ai-brain/trinityActionReasoner';
import { createLogger } from '../../lib/logger';
const log = createLogger('autonomousSchedulingDaemon');


interface DaemonConfig {
  runIntervalMinutes: number;
  autoFillEnabled: boolean;
  templateGenerationEnabled: boolean;
  alertsEnabled: boolean;
  maxShiftsPerRun: number;
}

/**
 * Shift windows map to real-world guard industry shift types.
 * Trinity uses this to understand which shift type is "upcoming" and
 * prioritize filling those windows first during each scan cycle.
 *
 *  Day / 1st shift:       06:00 – 14:00  (morning scan fires 05:00–07:00)
 *  Evening / 2nd shift:   14:00 – 22:00  (afternoon scan fires 13:00–15:00)
 *  Overnight / 3rd shift: 22:00 – 06:00  (night scan fires 21:00–23:00)
 *
 * The daemon runs every 30 minutes regardless, but the "primary scan window"
 * concept lets Trinity log intent and, in future, tune scheduler priority.
 */
type ShiftWindow = 'day' | 'evening' | 'overnight';

interface ShiftWindowContext {
  window: ShiftWindow;
  label: string;
  isPrimary: boolean;
  nextWindowStartHour: number;
}

function getShiftWindowContext(hour: number): ShiftWindowContext {
  if (hour >= 5 && hour < 14) {
    return {
      window: 'day',
      label: 'Day / 1st Shift',
      isPrimary: hour >= 5 && hour < 8,
      nextWindowStartHour: 14,
    };
  }
  if (hour >= 14 && hour < 22) {
    return {
      window: 'evening',
      label: 'Evening / 2nd Shift',
      isPrimary: hour >= 13 && hour < 16,
      nextWindowStartHour: 22,
    };
  }
  return {
    window: 'overnight',
    label: 'Overnight / 3rd Shift',
    isPrimary: hour >= 21 || hour < 1,
    nextWindowStartHour: 6,
  };
}

interface DaemonRunResult {
  runId: string;
  startTime: Date;
  endTime: Date;
  workspacesProcessed: number;
  shiftsAutoFilled: number;
  templatesApplied: number;
  alertsSent: number;
  errors: string[];
}

const DEFAULT_CONFIG: DaemonConfig = {
  runIntervalMinutes: 30,
  autoFillEnabled: true,
  templateGenerationEnabled: true,
  alertsEnabled: true,
  maxShiftsPerRun: 500,
};

class AutonomousSchedulingDaemonService {
  private static instance: AutonomousSchedulingDaemonService;
  private isRunning: boolean = false;
  private lastRunTime: Date | null = null;
  private runInterval: NodeJS.Timeout | null = null;
  private config: DaemonConfig = DEFAULT_CONFIG;
  private runHistory: DaemonRunResult[] = [];

  static getInstance(): AutonomousSchedulingDaemonService {
    if (!AutonomousSchedulingDaemonService.instance) {
      AutonomousSchedulingDaemonService.instance = new AutonomousSchedulingDaemonService();
    }
    return AutonomousSchedulingDaemonService.instance;
  }

  /**
   * Start the daemon
   */
  start(config?: Partial<DaemonConfig>): void {
    if (this.runInterval) {
      log.info('[SchedulingDaemon] Already running');
      return;
    }

    if (config) {
      this.config = { ...this.config, ...config };
    }

    log.info(`[SchedulingDaemon] Starting with ${this.config.runIntervalMinutes} minute interval`);

    // Run immediately on start
    this.runCycle();

    // Schedule recurring runs
    this.runInterval = setInterval(
      () => this.runCycle(),
      this.config.runIntervalMinutes * 60 * 1000
    );
  }

  /**
   * Stop the daemon
   */
  stop(): void {
    if (this.runInterval) {
      clearInterval(this.runInterval);
      this.runInterval = null;
      log.info('[SchedulingDaemon] Stopped');
    }
  }

  /**
   * Run a single scheduling cycle with full 7-step orchestration
   */
  async runCycle(): Promise<DaemonRunResult> {
    if (this.isRunning) {
      log.info('[SchedulingDaemon] Skipping cycle - previous run still in progress');
      return this.getEmptyResult();
    }

    this.isRunning = true;
    const runId = `daemon-${Date.now()}`;
    const startTime = new Date();
    const windowCtx = getShiftWindowContext(startTime.getHours());
    
    log.info(`[SchedulingDaemon] Starting cycle ${runId} | Window: ${windowCtx.label}${windowCtx.isPrimary ? ' [PRIMARY SCAN]' : ''}`);

    const result: DaemonRunResult = {
      runId,
      startTime,
      endTime: new Date(),
      workspacesProcessed: 0,
      shiftsAutoFilled: 0,
      templatesApplied: 0,
      alertsSent: 0,
      errors: [],
    };

    try {
      const activeWorkspaces = await this.getActiveWorkspaces();
      log.info(`[SchedulingDaemon] Found ${activeWorkspaces.length} active workspaces`);

      for (const workspace of activeWorkspaces) {
        const orchestrationResult = await automationOrchestration.executeAutomation(
          {
            domain: 'scheduling',
            automationName: 'autonomous-scheduling-daemon',
            automationType: 'daemon',
            workspaceId: workspace.id,
            triggeredBy: 'cron',
            payload: {
              runId,
              config: this.config,
            },
            billable: false,
          },
          async (ctx) => {
            return await this.processWorkspace(workspace, windowCtx);
          },
          {
            fetch: async (ctx) => ({
              workspaceId: workspace.id,
              workspaceName: workspace.name,
              config: this.config,
              shiftWindow: windowCtx.window,
            }),
            validate: async (ctx) => {
              if (!workspace.id) {
                return { valid: false, errors: ['Invalid workspace ID'] };
              }
              return { valid: true };
            },
            notify: async (workspaceResult, ctx) => {
              if (workspaceResult.shiftsAutoFilled > 0 || workspaceResult.alertsSent > 0) {
                broadcastToWorkspace(workspace.id, {
                  type: 'scheduling_daemon_update',
                  payload: {
                    shiftsAutoFilled: workspaceResult.shiftsAutoFilled,
                    templatesApplied: workspaceResult.templatesApplied,
                    alertsSent: workspaceResult.alertsSent,
                    orchestrationId: ctx.orchestrationId,
                  },
                });
              }
            },
          }
        );

        if (orchestrationResult.success && orchestrationResult.data) {
          result.workspacesProcessed++;
          result.shiftsAutoFilled += orchestrationResult.data.shiftsAutoFilled;
          result.templatesApplied += orchestrationResult.data.templatesApplied;
          result.alertsSent += orchestrationResult.data.alertsSent;
        } else if (!orchestrationResult.success) {
          result.errors.push(`Workspace ${workspace.id}: ${orchestrationResult.error} (${orchestrationResult.errorCode})`);
          log.error(`[SchedulingDaemon] Orchestrated error for ${workspace.id}:`, orchestrationResult.error);
        }
      }

      result.endTime = new Date();
      this.lastRunTime = result.endTime;
      this.runHistory.push(result);

      if (this.runHistory.length > 100) {
        this.runHistory = this.runHistory.slice(-100);
      }

      log.info(`[SchedulingDaemon] Cycle completed: ${result.shiftsAutoFilled} shifts filled, ${result.templatesApplied} templates applied`);

    } catch (error: any) {
      result.errors.push(`Critical error: ${(error instanceof Error ? error.message : String(error))}`);
      log.error('[SchedulingDaemon] Critical error:', error);
    } finally {
      this.isRunning = false;
    }

    return result;
  }

  /**
   * Get workspaces with autonomous scheduling enabled
   */
  private async getActiveWorkspaces(): Promise<any[]> {
    // Get workspaces that have scheduling settings enabled
    try {
      const allWorkspaces = await db.select()
        .from(workspaces)
        .where(eq(workspaces.subscriptionStatus, 'active'));

      // For now, return all active workspaces
      // In production, filter by those with autonomous scheduling enabled
      return allWorkspaces;
    } catch (error) {
      log.error('[SchedulingDaemon] Error getting workspaces:', error);
      return [];
    }
  }

  /**
   * Process a single workspace
   */
  private async processWorkspace(workspace: any, windowCtx?: ShiftWindowContext): Promise<{
    shiftsAutoFilled: number;
    templatesApplied: number;
    alertsSent: number;
  }> {
    const ctx = windowCtx ?? getShiftWindowContext(new Date().getHours());
    let shiftsAutoFilled = 0;
    let templatesApplied = 0;
    let alertsSent = 0;

    // 1. Check for urgent unfilled shifts (starting within 4 hours)
    const urgentShifts = await this.getUrgentUnfilledShifts(workspace.id);
    
    if (urgentShifts.length > 0 && this.config.alertsEnabled) {
      // Send alerts for critical unfilled shifts
      await this.sendUrgentAlerts(workspace.id, urgentShifts);
      alertsSent += urgentShifts.length;
    }

    // 2. Auto-fill open shifts for the entire current week (Mon–Sun).
    // GAP-FIX: Previously only fetched today's shifts, abandoning all rest-of-week open slots.
    if (this.config.autoFillEnabled) {
      let openShifts = await this.getOpenShiftsForWeek(workspace.id);

      // GAP-1 FIX: If no open shifts exist, Trinity generates them from client contracts first.
      // Without this, the daemon returned immediately with nothing to do — making the entire
      // scheduling feature inert for any workspace that hasn't manually pre-seeded shifts.
      if (openShifts.length === 0) {
        try {
          const genResult = await generateWeeklyShifts(workspace.id, 0);
          if (genResult.shiftsCreated > 0) {
            log.info(`[SchedulingDaemon][${ctx.label}] Trinity generated ${genResult.shiftsCreated} open shifts for ${genResult.clientsScheduled} clients in workspace ${workspace.id}`);
            openShifts = await this.getOpenShiftsForWeek(workspace.id);
          } else {
            log.info(`[SchedulingDaemon] No shifts generated for ${workspace.id} (no clients with contract rates, or all slots already filled)`);
          }
        } catch (genErr: any) {
          log.error(`[SchedulingDaemon] Shift generation failed for ${workspace.id}:`, genErr.message);
        }
      }

      if (openShifts.length > 0) {
        try {
          log.info(`[SchedulingDaemon][${ctx.label}]${ctx.isPrimary ? ' [PRIMARY SCAN]' : ''} Auto-filling open shifts for workspace ${workspace.id}`);

          // === TRINITY PRE-CYCLE REASONING ===
          // Before triggering the autonomous scheduler, Trinity evaluates the
          // staffing situation and flags any labor law risks or profit concerns.
          const cyclReasoning = await trinityActionReasoner.reason({
            domain: 'scheduling_fill',
            workspaceId: workspace.id,
            actionSummary: `Daemon auto-fill: ${openShifts.length} open shifts in window "${ctx.label}"${ctx.isPrimary ? ' [PRIMARY SCAN]' : ''}`,
            payload: {
              openShifts: openShifts.length,
              shiftWindow: ctx.window,
              isPrimaryWindow: ctx.isPrimary,
              useContractorFallback: true,
              mode: 'current_day',
            },
          });

          if (cyclReasoning.decision === 'block') {
            log.warn(`[SchedulingDaemon] Trinity BLOCKED auto-fill for ${workspace.id}: ${cyclReasoning.blockReason}`);
            alertsSent++;
            return { shiftsAutoFilled: 0, templatesApplied, alertsSent };
          }

          if (cyclReasoning.decision === 'escalate') {
            log.warn(`[SchedulingDaemon] Trinity flagged escalation for ${workspace.id}: ${cyclReasoning.escalationReason}`);
          }

          if (cyclReasoning.laborLawFlags.length > 0) {
            log.warn(`[SchedulingDaemon] Labor law flags for ${workspace.id}:`, cyclReasoning.laborLawFlags);
          }
          // === END PRE-CYCLE REASONING ===

        const fillResult = await trinityAutonomousScheduler.executeAutonomousScheduling({
            workspaceId: workspace.id,
            userId: 'system-daemon',
            mode: 'current_day',
            prioritizeBy: 'urgency',
            useContractorFallback: true,
            maxShiftsPerEmployee: 0,
            respectAvailability: true,
          });

          shiftsAutoFilled = fillResult.summary.totalAssigned;

          // GAP-B FIX: Emit schedule_published so the invoice/payroll pipeline fires.
          // Without this the scheduling → time-tracking → invoice → payroll chain is broken.
          if (shiftsAutoFilled > 0) {
            platformEventBus.publish({
              type: 'schedule_published',
              workspaceId: workspace.id,
              payload: {
                shiftsAutoFilled,
                source: 'autonomous_scheduling_daemon',
                timestamp: new Date().toISOString(),
              },
              metadata: { source: 'AutonomousSchedulingDaemon' },
            }).catch((err: unknown) => {
              log.warn(`[SchedulingDaemon] schedule_published event publish failed for ${workspace.id}:`, err instanceof Error ? err.message : String(err));
            });
          }
        } catch (error: any) {
          log.error(`[SchedulingDaemon] Auto-fill error for ${workspace.id}:`, error);
          // Notify org owner that the scheduling daemon failed for this workspace
          import('../orchestration/pipelineErrorHandler').then(({ notifyWorkspaceFailure }) => {
            notifyWorkspaceFailure(
              workspace.id,
              'Autonomous Scheduling Failed',
              `The automatic shift scheduling could not complete for this cycle: ${error?.message || 'Unknown error'}`,
              {
                actionUrl: '/scheduling',
                pipelineName: 'autonomous-scheduling-daemon',
                stepName: 'auto-fill',
                remediationHints: [
                  'Review open shifts in the Scheduling dashboard.',
                  'Check that employee availability and certifications are up to date.',
                  'Manually assign open shifts if needed.',
                  'Contact support if auto-scheduling continues to fail.',
                ],
              }
            ).catch((notifErr: unknown) => {
              log.warn(`[SchedulingDaemon] notifyWorkspaceFailure failed for ${workspace.id}:`, notifErr instanceof Error ? notifErr.message : String(notifErr));
            });
          }).catch((importErr: unknown) => {
            log.warn(`[SchedulingDaemon] Failed to import pipelineErrorHandler for workspace ${workspace.id}:`, importErr instanceof Error ? importErr.message : String(importErr));
          });
        }
      }
    }

    // 3. Apply templates for next week (on Sundays)
    if (this.config.templateGenerationEnabled) {
      const today = new Date();
      if (today.getDay() === 0) { // Sunday
        try {
          const templateResult = await recurringScheduleTemplates.generateNextWeek(workspace.id);
          templatesApplied = templateResult.templatesApplied;
        } catch (error: any) {
          log.error(`[SchedulingDaemon] Template generation error for ${workspace.id}:`, error);
        }
      }
    }

    return { shiftsAutoFilled, templatesApplied, alertsSent };
  }

  /**
   * Get urgent unfilled shifts (starting within 4 hours)
   */
  private async getUrgentUnfilledShifts(workspaceId: string): Promise<any[]> {
    const now = new Date();
    const fourHoursFromNow = new Date(now.getTime() + 4 * 60 * 60 * 1000);

    return db.select()
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        isNull(shifts.employeeId),
        gte(shifts.startTime, now),
        lte(shifts.startTime, fourHoursFromNow)
      ));
  }

  /**
   * Returns all unassigned open shifts for the entire current Mon–Sun week.
   * GAP-FIX: The old getOpenShiftsForToday only returned today's shifts,
   * so 6/7 of the week's open slots were never processed by the daemon.
   */
  private async getOpenShiftsForWeek(workspaceId: string): Promise<any[]> {
    const now = new Date();
    // Monday of current week at 00:00:00
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon … 6=Sat
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysFromMonday);
    weekStart.setHours(0, 0, 0, 0);

    // Sunday of current week at 23:59:59
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    return db.select()
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        isNull(shifts.employeeId),
        gte(shifts.startTime, weekStart),
        lte(shifts.startTime, weekEnd)
      ));
  }

  /** @deprecated Use getOpenShiftsForWeek — left for reference only */
  private async getOpenShiftsForToday(workspaceId: string): Promise<any[]> {
    return this.getOpenShiftsForWeek(workspaceId);
  }

  /**
   * Send urgent alerts for unfilled shifts
   */
  private async sendUrgentAlerts(workspaceId: string, urgentShifts: any[]): Promise<void> {
    // Broadcast alert to workspace
    broadcastToWorkspace(workspaceId, {
      type: 'trinity_urgent_alert',
      alertType: 'unfilled_shifts',
      message: `${urgentShifts.length} shift(s) starting within 4 hours are still unfilled!`,
      shifts: urgentShifts.map(s => ({
        id: s.id,
        title: s.title,
        startTime: s.startTime,
      })),
      timestamp: Date.now(),
    });

    // Log for audit
    await auditLogger.logSystemAction({
      actionType: 'TRINITY_URGENT_ALERT',
      targetEntityType: 'shift',
      targetEntityId: 'multiple',
      workspaceId,
      payload: {
        shiftCount: urgentShifts.length,
        shiftIds: urgentShifts.map(s => s.id),
        riskLevel: 'high',
        triggeredBy: 'system-daemon',
      },
    });
  }

  /**
   * Get daemon status
   */
  getStatus(): {
    isRunning: boolean;
    lastRunTime: Date | null;
    config: DaemonConfig;
    recentRuns: DaemonRunResult[];
  } {
    return {
      isRunning: this.isRunning,
      lastRunTime: this.lastRunTime,
      config: this.config,
      recentRuns: this.runHistory.slice(-10),
    };
  }

  /**
   * Trigger manual run for a specific workspace
   */
  async triggerManualRun(workspaceId: string, mode: 'current_day' | 'current_week' | 'next_week'): Promise<{
    success: boolean;
    result: any;
  }> {
    try {
      const result = await trinityAutonomousScheduler.executeAutonomousScheduling({
        workspaceId,
        userId: 'manual-trigger',
        mode,
        prioritizeBy: 'urgency',
        useContractorFallback: true,
        maxShiftsPerEmployee: 3,
        respectAvailability: true,
      });

      return { success: true, result };
    } catch (error: any) {
      return { success: false, result: { error: (error instanceof Error ? error.message : String(error)) } };
    }
  }

  /**
   * Get empty result for skipped runs
   */
  private getEmptyResult(): DaemonRunResult {
    return {
      runId: 'skipped',
      startTime: new Date(),
      endTime: new Date(),
      workspacesProcessed: 0,
      shiftsAutoFilled: 0,
      templatesApplied: 0,
      alertsSent: 0,
      errors: ['Skipped - previous run in progress'],
    };
  }
}

export const autonomousSchedulingDaemon = AutonomousSchedulingDaemonService.getInstance();
