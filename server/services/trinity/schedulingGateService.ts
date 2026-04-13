/**
 * Scheduling Gate Service — Phase 10-2 (Trinity SLA Scheduling)
 *
 * Checks proposed shift windows against open support-ticket SLA deadlines.
 * If a ticket is at SLA risk and its blackout window overlaps the proposed
 * shift, the gate blocks scheduling and returns conflict details +
 * recommended alternative times.
 */
import { SLAConfigService } from '../support/slaConfigService';
import type { SLARiskInfo } from '../support/slaConfigService';
import { createLogger } from '../../lib/logger';

const log = createLogger('SchedulingGateService');

export interface ShiftTimeWindow {
  startTime: Date;
  endTime: Date;
}

export interface SchedulingConflict {
  ticketId: string;
  priority: string;
  reason: string;
  deadline: Date;
  percentageRemaining: number;
}

export interface TicketForGate {
  id: string;
  priority: string;
  createdAt: Date;
  firstResponseAt?: Date | null;
}

export interface GateResult {
  canSchedule: boolean;
  conflicts: SchedulingConflict[];
}

export class SchedulingGateService {
  constructor(private slaService: SLAConfigService) {}

  /**
   * Determine whether a proposed shift can be scheduled given open tickets.
   */
  canScheduleShift(
    proposedShift: ShiftTimeWindow,
    openTickets: TicketForGate[],
  ): GateResult {
    const conflicts: SchedulingConflict[] = [];
    const blackoutMinutes = this.slaService.getSchedulingBlackoutMinutes();

    for (const ticket of openTickets) {
      const riskInfo = this.slaService.isAtSLARisk(ticket);

      // Block all shifts when an urgent ticket is at response-SLA risk
      if (ticket.priority === 'urgent' && riskInfo.responseAtRisk) {
        conflicts.push({
          ticketId: ticket.id,
          priority: ticket.priority,
          reason: 'Urgent ticket at SLA risk — all scheduling blocked',
          deadline: riskInfo.responseDeadline,
          percentageRemaining: riskInfo.percentageRemaining,
        });
        continue;
      }

      // For other priorities, block if the shift overlaps the blackout window
      if (riskInfo.responseAtRisk) {
        const blackoutWindow = this.buildBlackoutWindow(riskInfo.responseDeadline, blackoutMinutes);
        if (this.windowsOverlap(proposedShift, blackoutWindow)) {
          conflicts.push({
            ticketId: ticket.id,
            priority: ticket.priority,
            reason: 'SLA response at risk — blackout window overlap',
            deadline: riskInfo.responseDeadline,
            percentageRemaining: riskInfo.percentageRemaining,
          });
        }
      }

      if (riskInfo.resolutionAtRisk) {
        const blackoutWindow = this.buildBlackoutWindow(riskInfo.resolutionDeadline, blackoutMinutes);
        if (this.windowsOverlap(proposedShift, blackoutWindow)) {
          conflicts.push({
            ticketId: ticket.id,
            priority: ticket.priority,
            reason: 'SLA resolution at risk — blackout window overlap',
            deadline: riskInfo.resolutionDeadline,
            percentageRemaining: riskInfo.percentageRemaining,
          });
        }
      }
    }

    return { canSchedule: conflicts.length === 0, conflicts };
  }

  /**
   * Suggest alternative shift times that avoid all blackout windows.
   */
  getRecommendedShiftTimes(
    proposedShift: ShiftTimeWindow,
    openTickets: TicketForGate[],
  ): ShiftTimeWindow[] {
    const blackoutMinutes = this.slaService.getSchedulingBlackoutMinutes();
    const blockedPeriods: ShiftTimeWindow[] = [];

    for (const ticket of openTickets) {
      const riskInfo = this.slaService.isAtSLARisk(ticket);
      if (riskInfo.responseAtRisk) {
        blockedPeriods.push(this.buildBlackoutWindow(riskInfo.responseDeadline, blackoutMinutes));
      }
      if (riskInfo.resolutionAtRisk) {
        blockedPeriods.push(this.buildBlackoutWindow(riskInfo.resolutionDeadline, blackoutMinutes));
      }
    }

    const merged = this.mergeIntervals(blockedPeriods);
    const shiftDuration = proposedShift.endTime.getTime() - proposedShift.startTime.getTime();
    const recommendations: ShiftTimeWindow[] = [];

    for (const period of merged) {
      // Recommend a slot 30 minutes after each blocked period ends
      const afterStart = new Date(period.endTime.getTime() + 30 * 60_000);
      recommendations.push({
        startTime: afterStart,
        endTime: new Date(afterStart.getTime() + shiftDuration),
      });
    }

    return recommendations;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private buildBlackoutWindow(deadline: Date, blackoutMinutes: number): ShiftTimeWindow {
    return {
      startTime: new Date(deadline.getTime() - blackoutMinutes * 60_000),
      endTime: deadline,
    };
  }

  private windowsOverlap(a: ShiftTimeWindow, b: ShiftTimeWindow): boolean {
    return a.startTime < b.endTime && a.endTime > b.startTime;
  }

  private mergeIntervals(intervals: ShiftTimeWindow[]): ShiftTimeWindow[] {
    if (intervals.length === 0) return [];
    const sorted = [...intervals].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    const merged: ShiftTimeWindow[] = [{ ...sorted[0] }];

    for (let i = 1; i < sorted.length; i++) {
      const last = merged[merged.length - 1];
      if (sorted[i].startTime.getTime() <= last.endTime.getTime()) {
        last.endTime = new Date(Math.max(last.endTime.getTime(), sorted[i].endTime.getTime()));
      } else {
        merged.push({ ...sorted[i] });
      }
    }

    return merged;
  }
}
