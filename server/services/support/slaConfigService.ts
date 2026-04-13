/**
 * SLA Config Service — Phase 10-2 (Trinity SLA Scheduling)
 *
 * Extends the base SLA service with risk detection, escalation thresholds,
 * and scheduling blackout windows used by Trinity's scheduling gate.
 *
 * Priority names match the existing schema/slaService convention:
 *   urgent, high, normal, low
 */
import { computeSlaTargets } from './slaService';
import { createLogger } from '../../lib/logger';

const log = createLogger('SLAConfigService');

export interface SLAConfig {
  responseTimeMinutes: number;
  resolutionTimeMinutes: number;
  escalationThreshold: number; // 0-1, percentage of time elapsed before "at risk"
}

export interface SLARiskInfo {
  responseAtRisk: boolean;
  resolutionAtRisk: boolean;
  responseDeadline: Date;
  resolutionDeadline: Date;
  percentageRemaining: number;
}

/**
 * Escalation thresholds per priority — the fraction of elapsed time at which
 * the ticket is considered "at SLA risk" and scheduling should be blocked.
 */
const ESCALATION_THRESHOLDS: Record<string, number> = {
  urgent: 0.9,
  high: 0.9,
  normal: 0.85,
  low: 0.8,
};

/** Minutes before an SLA deadline during which shift scheduling is blocked. */
const SCHEDULING_BLACKOUT_MINUTES = 30;

export class SLAConfigService {
  /**
   * Get escalation threshold for a given priority.
   */
  getEscalationThreshold(priority: string): number {
    return ESCALATION_THRESHOLDS[priority] ?? ESCALATION_THRESHOLDS['normal'];
  }

  /**
   * Calculate SLA deadlines using the canonical computeSlaTargets helper.
   */
  calculateDeadlines(
    createdAt: Date,
    priority: string,
  ): { responseDeadline: Date; resolutionDeadline: Date } {
    const targets = computeSlaTargets(priority, createdAt);
    return {
      responseDeadline: targets.responseTimeTarget,
      resolutionDeadline: targets.resolutionTimeTarget,
    };
  }

  /**
   * Check whether a ticket is at SLA risk (response or resolution).
   *
   * A ticket is "at risk" when the fraction of its SLA window that has
   * already elapsed exceeds the escalation threshold for its priority.
   */
  isAtSLARisk(ticket: { id?: string; createdAt: Date; priority: string; firstResponseAt?: Date | null }): SLARiskInfo {
    const now = new Date();
    const { responseDeadline, resolutionDeadline } = this.calculateDeadlines(ticket.createdAt, ticket.priority);
    const threshold = this.getEscalationThreshold(ticket.priority);

    const createdMs = ticket.createdAt.getTime();

    // Response risk — only relevant if no first response yet
    const totalResponseMs = responseDeadline.getTime() - createdMs;
    const remainingResponseMs = responseDeadline.getTime() - now.getTime();
    const responseTimeRemaining = totalResponseMs > 0
      ? Math.max(0, remainingResponseMs / totalResponseMs)
      : 0;
    const responseElapsed = 1 - responseTimeRemaining;
    const responseAtRisk = !ticket.firstResponseAt
      && responseElapsed >= threshold
      && responseTimeRemaining > 0;

    // Resolution risk
    const totalResolutionMs = resolutionDeadline.getTime() - createdMs;
    const remainingResolutionMs = resolutionDeadline.getTime() - now.getTime();
    const resolutionTimeRemaining = totalResolutionMs > 0
      ? Math.max(0, remainingResolutionMs / totalResolutionMs)
      : 0;
    const resolutionElapsed = 1 - resolutionTimeRemaining;
    const resolutionAtRisk = resolutionElapsed >= threshold && resolutionTimeRemaining > 0;

    const percentageRemaining = Math.min(responseTimeRemaining, resolutionTimeRemaining);

    if (responseAtRisk || resolutionAtRisk) {
      log.debug('SLA risk detected', {
        ticketId: ticket.id,
        priority: ticket.priority,
        responseAtRisk,
        resolutionAtRisk,
        percentageRemaining: Math.round(percentageRemaining * 100),
      });
    }

    return {
      responseAtRisk,
      resolutionAtRisk,
      responseDeadline,
      resolutionDeadline,
      percentageRemaining,
    };
  }

  /**
   * Number of minutes before an SLA deadline during which scheduling is blocked.
   */
  getSchedulingBlackoutMinutes(): number {
    return SCHEDULING_BLACKOUT_MINUTES;
  }
}
