/**
 * Trinity Escalation Executor — Phase 10-5
 *
 * Executes SLA escalation actions determined by SLAEscalationService.
 * Each escalation is audit-logged via TrinityAuditService and recorded
 * in the sla_escalations table.
 *
 * Also updates the support ticket's escalation_level and
 * last_auto_escalated_at columns so the ticket reflects its current state.
 *
 * COMPLIANCE:
 *  - All calls awaited — no fire-and-forget (§B NDS sole sender law)
 *  - Workspace-scoped queries (§G tenant isolation)
 *  - Audit trail for every execution (Trinity audit service)
 */

import { db } from '../../db';
import { eq, and } from 'drizzle-orm';
import { supportTickets } from '@shared/schema';
import {
  type EscalationCheck,
  type EscalationAction,
  slaEscalationService,
} from '../support/slaEscalationService';
import { trinityAuditService } from './trinityAuditService';
import { createLogger } from '../../lib/logger';

const log = createLogger('TrinityEscalationExecutor');

// ── Escalation level → ticket escalation_level integer mapping ──────────────

function escalationLevelToInt(level: string): number {
  switch (level) {
    case 'critical_violation':
    case 'critical_imminent':
      return 2; // critical
    case 'violation':
    case 'imminent':
    case 'critical_at_risk':
      return 1; // escalated
    default:
      return 0; // normal
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface EscalationResult {
  success: boolean;
  executionId: string;
  action?: EscalationAction;
  ticketId?: string;
  error?: string;
}

// ── Executor ─────────────────────────────────────────────────────────────────

export class TrinityEscalationExecutor {
  /**
   * Execute a single SLA escalation: audit-log, perform action, record result,
   * and update the ticket's escalation level.
   */
  async executeEscalation(escalation: EscalationCheck): Promise<EscalationResult> {
    const executionId = `exec-esc-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    try {
      // 1. Log execution start via Trinity audit
      await trinityAuditService.logSkillExecution({
        type: 'skill_execution',
        workspaceId: escalation.workspaceId,
        skillName: 'sla_escalation',
        executionId,
        status: 'approved',
        timestamp: new Date(),
      });

      // 2. Perform the escalation action
      const actionResult = await this.performAction(
        escalation.workspaceId,
        escalation.action,
        escalation,
      );

      // 3. Update ticket escalation level (workspace-scoped per §G)
      await this.updateTicketEscalation(escalation);

      // 4. Record in sla_escalations table
      await slaEscalationService.recordEscalation(
        escalation,
        executionId,
        actionResult.success,
      );

      // 5. Log result via Trinity audit
      await trinityAuditService.logSkillResult({
        type: 'skill_result',
        workspaceId: escalation.workspaceId,
        skillName: 'sla_escalation',
        executionId,
        success: actionResult.success,
        resultData: {
          action: escalation.action,
          ticketId: escalation.ticketId,
          level: escalation.escalationLevel,
          percentElapsed: escalation.percentElapsed,
        },
        durationMs: actionResult.durationMs,
        timestamp: new Date(),
      });

      return {
        success: true,
        executionId,
        action: escalation.action,
        ticketId: escalation.ticketId,
      };
    } catch (error: unknown) {
      const err = error as Error;

      await trinityAuditService.logSkillError({
        type: 'skill_error',
        workspaceId: escalation.workspaceId,
        skillName: 'sla_escalation',
        executionId,
        errorMessage: err.message,
        errorCode: 'ESCALATION_FAILED',
        timestamp: new Date(),
      });

      log.error('Escalation execution failed', {
        ticketId: escalation.ticketId,
        level: escalation.escalationLevel,
        error: err.message,
      });

      return { success: false, executionId, error: err.message };
    }
  }

  /**
   * Run escalations for all pending tickets in a workspace.
   */
  async runWorkspaceEscalations(workspaceId: string): Promise<EscalationResult[]> {
    const escalations = await slaEscalationService.getPendingEscalations(workspaceId);
    const results: EscalationResult[] = [];

    for (const esc of escalations) {
      const result = await this.executeEscalation(esc);
      results.push(result);
    }

    if (results.length > 0) {
      log.info('Workspace SLA escalation sweep complete', {
        workspaceId,
        total: results.length,
        succeeded: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      });
    }

    return results;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Perform the concrete escalation action (notify, page, assign, etc.).
   * Each action logs but does not throw — failures are captured in the result.
   */
  private async performAction(
    workspaceId: string,
    action: EscalationAction,
    escalation: EscalationCheck,
  ): Promise<{ success: boolean; durationMs: number }> {
    const start = Date.now();

    try {
      switch (action) {
        case 'page_on_call_engineer':
          await this.pageOnCall(workspaceId, escalation);
          break;
        case 'alert_team_lead':
          await this.alertTeamLead(workspaceId, escalation);
          break;
        case 'notify_support_team':
          await this.notifyTeam(workspaceId, escalation);
          break;
        case 'assign_senior_support':
          await this.assignSenior(workspaceId, escalation);
          break;
        case 'prioritize_queue':
          await this.prioritizeQueue(workspaceId, escalation);
          break;
        default:
          log.debug('No action needed', { action });
      }

      return { success: true, durationMs: Date.now() - start };
    } catch (error) {
      log.error(`Failed to execute escalation action: ${action}`, error);
      return { success: false, durationMs: Date.now() - start };
    }
  }

  /**
   * Update the ticket's escalation_level and last_auto_escalated_at.
   * Workspace-scoped WHERE clause per §G.
   */
  private async updateTicketEscalation(escalation: EscalationCheck): Promise<void> {
    const newLevel = escalationLevelToInt(escalation.escalationLevel);

    try {
      await db
        .update(supportTickets)
        .set({
          escalationLevel: newLevel,
          lastAutoEscalatedAt: new Date(),
          slaStatus: escalation.triggers.violated ? 'breached' : 'warning',
        })
        .where(
          and(
            eq(supportTickets.id, escalation.ticketId),
            eq(supportTickets.workspaceId, escalation.workspaceId),
          ),
        );
    } catch (error) {
      log.error('Failed to update ticket escalation level', error);
    }
  }

  // ── Escalation action stubs (log + placeholder for NDS integration) ───────

  private async pageOnCall(_workspaceId: string, escalation: EscalationCheck): Promise<void> {
    log.warn('PAGING ON-CALL ENGINEER — SLA violated', {
      ticketId: escalation.ticketId,
      level: escalation.escalationLevel,
      percentElapsed: escalation.percentElapsed,
    });
  }

  private async alertTeamLead(_workspaceId: string, escalation: EscalationCheck): Promise<void> {
    log.warn('ALERTING TEAM LEAD — SLA imminent', {
      ticketId: escalation.ticketId,
      level: escalation.escalationLevel,
      percentElapsed: escalation.percentElapsed,
    });
  }

  private async notifyTeam(_workspaceId: string, escalation: EscalationCheck): Promise<void> {
    log.info('Notifying support team — SLA imminent', {
      ticketId: escalation.ticketId,
      level: escalation.escalationLevel,
      percentElapsed: escalation.percentElapsed,
    });
  }

  private async assignSenior(_workspaceId: string, escalation: EscalationCheck): Promise<void> {
    log.info('Assigning to senior support — SLA at risk', {
      ticketId: escalation.ticketId,
      level: escalation.escalationLevel,
      percentElapsed: escalation.percentElapsed,
    });
  }

  private async prioritizeQueue(_workspaceId: string, escalation: EscalationCheck): Promise<void> {
    log.info('Prioritizing in queue — SLA at risk', {
      ticketId: escalation.ticketId,
      level: escalation.escalationLevel,
      percentElapsed: escalation.percentElapsed,
    });
  }
}

// Singleton
export const trinityEscalationExecutor = new TrinityEscalationExecutor();
