/**
 * SLA Escalation Service — Phase 10-5 (Trinity SLA Escalation Path)
 *
 * Monitors support tickets and determines when SLA-based escalation is needed.
 * Uses the canonical SLA bounds from slaService.ts (calendar hours) and maps
 * elapsed-time percentages to escalation levels and actions.
 *
 * Escalation Thresholds (% of SLA response window elapsed):
 *   0-79%   → Normal handling
 *   80-94%  → At risk  → escalate (priority-based action)
 *   95-99%  → Imminent → escalate (team notification)
 *   100%+   → Violated → escalate (emergency escalation)
 *
 * Priority names match the schema convention: urgent, high, normal, low
 *
 * COMPLIANCE:
 *  - Every query is workspace-scoped (§G tenant isolation)
 *  - All DB calls are awaited (§B NDS sole sender law)
 */

import { db } from '../../db';
import { eq, and, inArray } from 'drizzle-orm';
import { supportTickets, slaEscalations } from '@shared/schema';
import { computeSlaTargets } from './slaService';
import { createLogger } from '../../lib/logger';

const log = createLogger('SLAEscalationService');

// ── Types ────────────────────────────────────────────────────────────────────

export type EscalationLevel =
  | 'critical_violation'
  | 'critical_imminent'
  | 'violation'
  | 'imminent'
  | 'critical_at_risk'
  | 'at_risk'
  | 'normal';

export type EscalationAction =
  | 'page_on_call_engineer'
  | 'alert_team_lead'
  | 'notify_support_team'
  | 'assign_senior_support'
  | 'prioritize_queue'
  | 'normal_handling';

export interface EscalationTriggers {
  atRisk: boolean;
  imminent: boolean;
  violated: boolean;
}

export interface EscalationCheck {
  ticketId: string;
  workspaceId: string;
  priority: string;
  status: string;
  slaMinutes: number;
  ageMinutes: number;
  percentElapsed: number;
  triggers: EscalationTriggers;
  shouldEscalate: boolean;
  escalationLevel: EscalationLevel;
  action: EscalationAction;
}

// ── SLA response bounds in minutes (derived from slaService.ts hours) ────────

const SLA_RESPONSE_MINUTES: Record<string, number> = {
  urgent: 60,    // 1 hour
  high: 240,     // 4 hours
  normal: 1440,  // 24 hours
  low: 4320,     // 72 hours
};

// ── Escalation action map ────────────────────────────────────────────────────

const ESCALATION_ACTIONS: Record<EscalationLevel, EscalationAction> = {
  critical_violation: 'page_on_call_engineer',
  violation: 'page_on_call_engineer',
  critical_imminent: 'alert_team_lead',
  imminent: 'notify_support_team',
  critical_at_risk: 'assign_senior_support',
  at_risk: 'prioritize_queue',
  normal: 'normal_handling',
};

// ── Service ──────────────────────────────────────────────────────────────────

export class SLAEscalationService {
  /**
   * Check if a ticket needs SLA escalation based on elapsed response time.
   */
  checkEscalation(ticket: {
    id: string;
    workspaceId: string;
    priority: string | null;
    status: string | null;
    createdAt: Date | null;
    firstResponseAt: Date | null;
  }): EscalationCheck {
    const now = new Date();
    const priority = ticket.priority ?? 'normal';
    const status = ticket.status ?? 'open';
    const createdAt = ticket.createdAt ?? now;

    // If the ticket already has a first response, use resolution SLA instead
    const slaTargets = computeSlaTargets(priority, createdAt);
    const slaDeadline = ticket.firstResponseAt
      ? slaTargets.resolutionTimeTarget
      : slaTargets.responseTimeTarget;

    const totalSlaMs = slaDeadline.getTime() - createdAt.getTime();
    const slaMinutes = totalSlaMs / (1000 * 60);

    const ageMs = now.getTime() - createdAt.getTime();
    const ageMinutes = ageMs / (1000 * 60);

    const percentElapsed = slaMinutes > 0
      ? (ageMinutes / slaMinutes) * 100
      : 100;

    const triggers: EscalationTriggers = {
      atRisk: percentElapsed >= 80,
      imminent: percentElapsed >= 95,
      violated: percentElapsed >= 100,
    };

    const escalationLevel = this.determineLevel(triggers, priority);
    const action = this.getEscalationAction(escalationLevel);

    // Only escalate open/in-progress tickets that have crossed the at-risk threshold
    const shouldEscalate = triggers.atRisk
      && (status === 'open' || status === 'in_progress');

    return {
      ticketId: ticket.id,
      workspaceId: ticket.workspaceId,
      priority,
      status,
      slaMinutes: Math.round(slaMinutes),
      ageMinutes: Math.round(ageMinutes * 100) / 100,
      percentElapsed: Math.round(percentElapsed * 100) / 100,
      triggers,
      shouldEscalate,
      escalationLevel,
      action,
    };
  }

  /**
   * Determine escalation level from triggers and priority.
   * "urgent" maps to "critical" escalation levels (highest severity).
   */
  private determineLevel(triggers: EscalationTriggers, priority: string): EscalationLevel {
    const isCritical = priority === 'urgent';

    if (triggers.violated && isCritical) return 'critical_violation';
    if (triggers.violated) return 'violation';
    if (triggers.imminent && isCritical) return 'critical_imminent';
    if (triggers.imminent) return 'imminent';
    if (triggers.atRisk && isCritical) return 'critical_at_risk';
    if (triggers.atRisk) return 'at_risk';
    return 'normal';
  }

  /**
   * Get the action to perform for a given escalation level.
   */
  getEscalationAction(level: EscalationLevel): EscalationAction {
    return ESCALATION_ACTIONS[level] ?? 'normal_handling';
  }

  /**
   * Get all open/in-progress tickets in a workspace that need escalation.
   * Workspace-scoped per §G tenant isolation.
   */
  async getPendingEscalations(workspaceId: string): Promise<EscalationCheck[]> {
    try {
      const tickets = await db
        .select()
        .from(supportTickets)
        .where(
          and(
            eq(supportTickets.workspaceId, workspaceId),
            inArray(supportTickets.status, ['open', 'in_progress']),
          ),
        );

      const escalations = tickets
        .map((t) => this.checkEscalation({
          id: t.id,
          workspaceId: t.workspaceId,
          priority: t.priority,
          status: t.status,
          createdAt: t.createdAt,
          firstResponseAt: t.firstResponseAt,
        }))
        .filter((e) => e.shouldEscalate);

      if (escalations.length > 0) {
        log.info('Pending SLA escalations identified', {
          workspaceId,
          count: escalations.length,
        });
      }

      return escalations;
    } catch (error) {
      log.error('Failed to get pending escalations', error);
      return [];
    }
  }

  /**
   * Record an escalation in the sla_escalations table.
   * Awaited per §B — no fire-and-forget.
   */
  async recordEscalation(
    escalation: EscalationCheck,
    executionId: string,
    success: boolean,
  ): Promise<void> {
    try {
      const now = new Date();
      await db.insert(slaEscalations).values({
        workspaceId: escalation.workspaceId,
        ticketId: escalation.ticketId,
        escalationLevel: escalation.escalationLevel,
        action: escalation.action,
        percentElapsed: Math.round(escalation.percentElapsed),
        slaMinutes: escalation.slaMinutes,
        ageMinutes: Math.round(escalation.ageMinutes),
        executionId,
        executedSuccessfully: success,
        triggeredAt: now,
        executedAt: now,
      });

      log.debug('SLA escalation recorded', {
        ticketId: escalation.ticketId,
        level: escalation.escalationLevel,
        executionId,
      });
    } catch (error) {
      log.error('Failed to record SLA escalation', error);
    }
  }
}

// Singleton
export const slaEscalationService = new SLAEscalationService();
