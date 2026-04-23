/**
 * Trinity Scheduler with SLA — Phase 10-2
 *
 * Wraps shift-scheduling intent through the SLA gate before allowing Trinity
 * to create or approve a shift. If the gate blocks the shift, the caller
 * receives conflict details and recommended alternative windows.
 */
import { SLAConfigService } from '../support/slaConfigService';
import { SchedulingGateService } from './schedulingGateService';
import type { TicketForGate, ShiftTimeWindow, SchedulingConflict } from './schedulingGateService';
import { createLogger } from '../../lib/logger';

const log = createLogger('TrinitySchedulerWithSLA');

export interface ScheduleShiftRequest {
  startTime: Date;
  endTime: Date;
  employeeId: string;
}

export interface ScheduleShiftResult {
  success: boolean;
  reason?: string;
  shift?: ScheduleShiftRequest;
  conflicts?: SchedulingConflict[];
  recommendations?: ShiftTimeWindow[];
}

export interface ClientSchedulingConstraints {
  numberOfGuards?: number | null;
  daysOfService?: string[] | null;
  currentlyScheduledGuards?: number;
}

export class TrinitySchedulerWithSLA {
  private slaService: SLAConfigService;
  private gateService: SchedulingGateService;

  constructor() {
    this.slaService = new SLAConfigService();
    this.gateService = new SchedulingGateService(this.slaService);
  }

  /**
   * Check a proposed shift against SLA constraints.
   *
   * Returns { success: true } when the shift is safe to create, or
   * { success: false, conflicts, recommendations } when it conflicts.
   */
  evaluateShift(
    workspaceId: string,
    proposedShift: ScheduleShiftRequest,
    openTickets: TicketForGate[],
    clientConstraints?: ClientSchedulingConstraints,
  ): ScheduleShiftResult {
    if (clientConstraints?.daysOfService?.length) {
      const shiftDay = proposedShift.startTime.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      const normalizedDays = clientConstraints.daysOfService.map((d) => String(d).toLowerCase());
      if (!normalizedDays.includes(shiftDay)) {
        return {
          success: false,
          reason: `Client day-of-service constraint blocks ${shiftDay}`,
          conflicts: [],
          recommendations: [],
        };
      }
    }

    if ((clientConstraints?.numberOfGuards ?? null) !== null) {
      const maxGuards = Number(clientConstraints?.numberOfGuards ?? 0);
      const currentlyScheduled = Number(clientConstraints?.currentlyScheduledGuards || 0);
      if (maxGuards > 0 && currentlyScheduled >= maxGuards) {
        return {
          success: false,
          reason: `Client number-of-guards constraint reached (${currentlyScheduled}/${maxGuards})`,
          conflicts: [],
          recommendations: [],
        };
      }
    }

    const window: ShiftTimeWindow = {
      startTime: proposedShift.startTime,
      endTime: proposedShift.endTime,
    };

    const gateResult = this.gateService.canScheduleShift(window, openTickets);

    if (!gateResult.canSchedule) {
      log.warn('Shift scheduling blocked by SLA constraints', {
        workspaceId,
        employeeId: proposedShift.employeeId,
        startTime: proposedShift.startTime.toISOString(),
        endTime: proposedShift.endTime.toISOString(),
        conflictCount: gateResult.conflicts.length,
      });

      return {
        success: false,
        reason: 'SLA conflict',
        conflicts: gateResult.conflicts,
        recommendations: this.gateService.getRecommendedShiftTimes(window, openTickets),
      };
    }

    log.info('Shift passed SLA gate', {
      workspaceId,
      employeeId: proposedShift.employeeId,
      startTime: proposedShift.startTime.toISOString(),
      endTime: proposedShift.endTime.toISOString(),
    });

    return {
      success: true,
      shift: proposedShift,
    };
  }
}

/** Singleton instance — safe to reuse (stateless beyond config). */
export const trinitySchedulerWithSLA = new TrinitySchedulerWithSLA();
