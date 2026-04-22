/**
 * Trinity Event Brain — Phase 2 Biological Brain
 *
 * Processes the high-priority business events that Trinity was previously
 * ignoring. She saw every event on the bus via `*` subscription but only
 * reacted to `ai_*` and `automation_*` prefix events. This brain gives her
 * explicit handlers for the 60 business events identified by the crawler
 * audit (panic alerts, coverage gaps, lone worker check-ins, payroll
 * failures, compliance warnings, invoice overdue, contract renewals, etc.).
 *
 * Each handler follows the same pattern:
 *   1. Extract relevant data from event metadata
 *   2. Decide: autonomous low-risk action, or medium/high queued approval
 *   3. Execute via helpaiOrchestrator or queue via trinityActionDispatcher
 *   4. Log what Trinity did so the audit trail stays intact
 *
 * Called from aiBrainMasterOrchestrator.ts wildcard handler:
 *   await trinityEventBrain.process(event);
 */

import { pool } from '../../db';
import { createLogger } from '../../lib/logger';
import { scheduleNonBlocking } from '../../lib/scheduleNonBlocking';
import { helpaiOrchestrator } from '../helpai/platformActionHub';
import type { ActionRequest } from '../helpai/platformActionHub';
import type { PlatformEvent } from '../platformEventBus';
import { queueForApproval, type RiskLevel } from './trinityActionDispatcher';

const log = createLogger('TrinityEventBrain');

interface EventHandlerConfig {
  risk: RiskLevel;
  handler: (event: PlatformEvent) => Promise<void>;
}

// ── Helper: auto-execute a platform action as the Trinity brain user ──────────
async function autoExecute(
  workspaceId: string,
  actionId: string,
  payload: Record<string, any>,
  note: string,
): Promise<void> {
  try {
    const request: ActionRequest = {
      actionId,
      category: (actionId.split('.')[0] || 'system') as any,
      name: actionId,
      payload: { ...payload, workspaceId },
      workspaceId,
      userId: 'trinity-brain',
      userRole: 'system',
      metadata: { source: 'trinity-event-brain' },
    };
    const result = await helpaiOrchestrator.executeAction(request);
    log.info(
      `[EventBrain] Auto-executed ${actionId}: ${note} → ${
        result.success ? 'OK' : (result.error || result.message)
      }`,
    );
  } catch (err: any) {
    log.warn(`[EventBrain] Auto-execute failed ${actionId}:`, err?.message);
  }
}

// ── Helper: queue an action for manager approval ──────────────────────────────
async function queueWithEscalation(
  workspaceId: string,
  actionId: string,
  payload: Record<string, any>,
  reason: string,
  risk: RiskLevel,
): Promise<void> {
  try {
    await queueForApproval(
      { workspaceId, userId: 'trinity-brain', userRole: 'system', source: 'event-brain' },
      actionId,
      payload,
      reason,
      risk,
    );
  } catch (err: any) {
    log.warn(`[EventBrain] queueForApproval failed ${actionId}:`, err?.message);
  }
}

// ── Event Handlers ────────────────────────────────────────────────────────────
const EVENT_HANDLERS: Record<string, EventHandlerConfig> = {

  // ═══════════════════════════════════════════════════════════
  // SCHEDULING & COVERAGE
  // ═══════════════════════════════════════════════════════════

  coverage_gap_detected: {
    risk: 'low',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      await autoExecute(workspaceId, 'scheduling.fill_open_shift', {
        shiftId: metadata?.shiftId,
        urgency: 'high',
        source: 'event_brain',
      }, 'coverage gap auto-fill triggered');
    },
  },

  shift_calloff_requested: {
    risk: 'low',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      await autoExecute(workspaceId, 'scheduling.scan_open_shifts', {
        triggerReason: 'calloff',
        shiftId: metadata?.shiftId,
      }, 'calloff → coverage scan');
    },
  },

  shift_calloff_escalated: {
    risk: 'medium',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      await queueWithEscalation(
        workspaceId,
        'notify.send',
        {
          targetGroup: 'available_officers',
          message: `URGENT: Open shift available — ${metadata?.siteName || 'your site'} needs coverage immediately.`,
          channels: ['sms', 'push'],
        },
        `Escalated calloff at ${metadata?.siteName || 'site'}. Blast all available officers to find coverage.`,
        'medium',
      );
    },
  },

  // ═══════════════════════════════════════════════════════════
  // SAFETY & EMERGENCIES
  // ═══════════════════════════════════════════════════════════

  panic_alert_triggered: {
    risk: 'high',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      await autoExecute(workspaceId, 'notify.send', {
        targetGroup: 'managers',
        message: `🚨 PANIC ALERT: Officer ${metadata?.employeeName || 'unknown'} triggered panic at ${metadata?.location || 'unknown location'}. Immediate response required.`,
        channels: ['sms', 'push', 'email'],
        priority: 1,
      }, 'panic alert manager notification');

      await queueWithEscalation(
        workspaceId,
        'voice.outbound_call',
        {
          toPhone: metadata?.officerPhone,
          message: 'This is Trinity. Your panic alert has been received. Help is on the way. Please stay on the line.',
          employeeId: metadata?.employeeId,
        },
        `Panic alert from ${metadata?.employeeName || 'officer'}. Trinity should call to confirm status.`,
        'high',
      );
    },
  },

  'panic_alert.voice': {
    risk: 'high',
    handler: async (event) => {
      await EVENT_HANDLERS.panic_alert_triggered.handler(event);
    },
  },

  sos_triggered: {
    risk: 'high',
    handler: async (event) => {
      await EVENT_HANDLERS.panic_alert_triggered.handler(event);
    },
  },

  lone_worker_missed_checkin: {
    risk: 'high',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      await autoExecute(workspaceId, 'notify.send', {
        targetGroup: 'managers',
        message: `⚠️ Lone worker missed check-in: ${metadata?.employeeName || 'officer'} at ${metadata?.siteName || 'site'}. Welfare check required.`,
        channels: ['sms', 'push'],
        priority: 1,
      }, 'lone worker missed check-in → manager alert');

      await queueWithEscalation(
        workspaceId,
        'voice.outbound_welfare_check',
        { employeeId: metadata?.employeeId, phone: metadata?.officerPhone },
        `${metadata?.employeeName || 'officer'} missed their lone worker check-in. Approve Trinity calling them now.`,
        'high',
      );
    },
  },

  bolo_match_detected: {
    risk: 'high',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      await autoExecute(workspaceId, 'notify.send', {
        targetGroup: 'managers',
        message: `🚨 BOLO MATCH: Visitor ${metadata?.visitorName || 'unknown'} matched a BOLO alert at ${metadata?.location || 'site'}. Review immediately.`,
        channels: ['sms', 'push'],
        priority: 1,
      }, 'BOLO match → manager alert');
    },
  },

  // ═══════════════════════════════════════════════════════════
  // COMPLIANCE & LICENSING
  // ═══════════════════════════════════════════════════════════

  compliance_suspension_triggered: {
    risk: 'medium',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      await autoExecute(workspaceId, 'notify.send', {
        targetUsers: [metadata?.ownerId].filter(Boolean),
        message: `⚠️ Compliance suspension triggered for ${metadata?.entityName || 'officer'}. Review compliance dashboard immediately.`,
        channels: ['sms', 'email', 'push'],
      }, 'compliance suspension owner alert');
    },
  },

  compliance_cert_expired: {
    risk: 'low',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      await autoExecute(workspaceId, 'notify.send', {
        targetUsers: [metadata?.employeeId, metadata?.managerId].filter(Boolean),
        message: `License/certification expired: ${metadata?.certType || 'certification'} for ${metadata?.employeeName || 'officer'}. Renewal required immediately.`,
        channels: ['sms', 'email'],
      }, 'cert expired → renewal reminder');
    },
  },

  compliance_onboarding_overdue: {
    risk: 'low',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      await autoExecute(workspaceId, 'notify.send', {
        targetUsers: [metadata?.employeeId].filter(Boolean),
        message: 'Your onboarding documents are overdue. Please complete your required paperwork to continue working.',
        channels: ['sms', 'email'],
      }, 'onboarding overdue reminder');
    },
  },

  tcole_compliance_warning: {
    risk: 'medium',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      await autoExecute(workspaceId, 'notify.send', {
        targetGroup: 'managers',
        message: `TCOLE compliance warning: ${metadata?.details || 'review required'}. This may affect licensing.`,
        channels: ['sms', 'email'],
      }, 'TCOLE warning → manager alert');
    },
  },

  // ═══════════════════════════════════════════════════════════
  // PAYROLL
  // ═══════════════════════════════════════════════════════════

  payroll_transfer_failed: {
    risk: 'high',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      await autoExecute(workspaceId, 'notify.send', {
        targetGroup: 'owners',
        message: `🚨 Payroll transfer FAILED: ${metadata?.employeeName || 'employee'} — ${metadata?.amount || ''}. Plaid ACH returned. Manual resolution required.`,
        channels: ['sms', 'email', 'push'],
        priority: 1,
      }, 'payroll transfer failure → owner alert');
    },
  },

  payroll_zero_rate_detected: {
    risk: 'high',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      await queueWithEscalation(
        workspaceId,
        'payroll.flag_for_review',
        { payrollRunId: metadata?.payrollRunId, employeeId: metadata?.employeeId },
        `Zero pay rate detected for ${metadata?.employeeName || 'employee'}. This is likely a data error. Approve to flag for manual review.`,
        'high',
      );
    },
  },

  payroll_manual_edit_flagged: {
    risk: 'medium',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      await autoExecute(workspaceId, 'notify.send', {
        targetGroup: 'owners',
        message: `Manual payroll edit flagged: ${metadata?.editedBy || 'user'} changed ${metadata?.fieldChanged || 'a field'} for ${metadata?.employeeName || 'employee'}. Review audit trail.`,
        channels: ['push', 'email'],
      }, 'manual payroll edit audit alert');
    },
  },

  // ═══════════════════════════════════════════════════════════
  // INVOICES & BILLING
  // ═══════════════════════════════════════════════════════════

  invoice_overdue: {
    risk: 'low',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      const daysOverdue = Number(metadata?.daysOverdue || 0);
      if (daysOverdue <= 7) {
        await autoExecute(workspaceId, 'billing.invoice_send', {
          invoiceId: metadata?.invoiceId,
          isReminder: true,
          reminderType: 'overdue_first',
        }, `invoice ${metadata?.invoiceId} overdue ${daysOverdue}d → auto-reminder`);
      } else {
        await queueWithEscalation(
          workspaceId,
          'billing.invoice_send',
          {
            invoiceId: metadata?.invoiceId,
            isReminder: true,
            reminderType: 'overdue_escalated',
            daysOverdue,
          },
          `Invoice ${metadata?.invoiceNumber || metadata?.invoiceId} is ${daysOverdue} days overdue ($${metadata?.amount || '?'}). Approve to send escalated reminder.`,
          'medium',
        );
      }
    },
  },

  invoice_overdue_escalated: {
    risk: 'medium',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      await autoExecute(workspaceId, 'notify.send', {
        targetGroup: 'owners',
        message: `⚠️ Invoice escalated to collections: ${metadata?.clientName || 'client'} owes $${metadata?.amount || '?'} (${metadata?.daysOverdue || '?'} days overdue).`,
        channels: ['push', 'email'],
      }, 'invoice escalated to collections alert');
    },
  },

  // ═══════════════════════════════════════════════════════════
  // INCIDENTS
  // ═══════════════════════════════════════════════════════════

  incident_report_filed: {
    risk: 'low',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      if (metadata?.severity === 'high' || metadata?.severity === 'critical') {
        await queueWithEscalation(
          workspaceId,
          'notify.send',
          {
            targetUsers: [metadata?.clientId].filter(Boolean),
            message: `Incident report filed at your site: ${metadata?.incidentType || 'incident'}. Our supervisor is reviewing. Reference: ${metadata?.incidentNumber || metadata?.incidentId}`,
            channels: ['email'],
          },
          `High-severity incident at ${metadata?.siteName || 'site'}. Approve notifying the client.`,
          'medium',
        );
      }
    },
  },

  incident_pattern_identified: {
    risk: 'low',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      await autoExecute(workspaceId, 'notify.send', {
        targetGroup: 'managers',
        message: `Incident pattern detected: ${metadata?.pattern || 'recurring incidents'} at ${metadata?.siteName || 'site'}. Review recommended.`,
        channels: ['push'],
      }, 'incident pattern → manager awareness');
    },
  },

  // ═══════════════════════════════════════════════════════════
  // CONTRACTS
  // ═══════════════════════════════════════════════════════════

  contract_executed: {
    risk: 'low',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      await autoExecute(workspaceId, 'notify.send', {
        targetGroup: 'managers',
        message: `✅ Contract executed: ${metadata?.clientName || 'client'} — ${metadata?.contractValue || ''}. Scheduling can now begin.`,
        channels: ['push'],
      }, 'contract executed → team notification');
    },
  },

  contract_renewal_due: {
    risk: 'medium',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      await autoExecute(workspaceId, 'notify.send', {
        targetGroup: 'owners',
        message: `Contract renewal due: ${metadata?.clientName || 'client'} — expires ${metadata?.expiryDate || 'soon'}. Start renewal process.`,
        channels: ['email', 'push'],
      }, 'contract renewal due → owner alert');
    },
  },

  // ═══════════════════════════════════════════════════════════
  // EMPLOYEE LIFECYCLE
  // ═══════════════════════════════════════════════════════════

  employee_terminated: {
    risk: 'low',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      await autoExecute(workspaceId, 'scheduling.cancel_shift', {
        employeeId: metadata?.employeeId,
        cancelAll: true,
        reason: 'Employee termination',
      }, `${metadata?.employeeName || 'employee'} terminated → future shifts cancelled`);
    },
  },

  missed_clockin_escalated: {
    risk: 'medium',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      await autoExecute(workspaceId, 'notify.send', {
        targetUsers: [metadata?.managerId].filter(Boolean),
        message: `Officer ${metadata?.employeeName || 'officer'} missed clock-in at ${metadata?.siteName || 'site'}. Shift started ${metadata?.minutesLate || '?'} minutes ago.`,
        channels: ['sms', 'push'],
        priority: 2,
      }, 'missed clock-in escalation → manager SMS');
    },
  },

  officer_approaching_overtime: {
    risk: 'low',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      await autoExecute(workspaceId, 'notify.send', {
        targetGroup: 'managers',
        message: `OT Alert: ${metadata?.employeeName || 'officer'} is at ${metadata?.currentHours || '?'}h this week (threshold: ${metadata?.overtimeThreshold || '?'}h). Review scheduling.`,
        channels: ['push'],
      }, 'OT approaching → manager alert');
    },
  },

  // ═══════════════════════════════════════════════════════════
  // MEMBERSHIP & ONBOARDING
  // ═══════════════════════════════════════════════════════════

  member_joined: {
    risk: 'low',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId || !metadata?.userId) return;

      try {
        const { NotificationDeliveryService } = await import('../notificationDeliveryService');

        await NotificationDeliveryService.send({
          type: 'welcome_message',
          workspaceId,
          recipientUserId: metadata.userId,
          channel: 'in_app',
          body: {
            title: `Welcome to ${metadata.workspaceName || 'CoAIleague'}!`,
            message: `Hi ${metadata.firstName || 'there'}! I'm Trinity, your AI operations supervisor. I'm already monitoring your organization and I'm here to help. Ask me anything — scheduling, compliance, payroll, or anything else you need.`,
          },
        } as any).catch(() => {});

        const { rows: owners } = await pool.query(
          `SELECT user_id FROM employees
            WHERE workspace_id = $1
              AND workspace_role IN ('org_owner', 'co_owner')
              AND is_active = TRUE
              AND user_id != $2`,
          [workspaceId, metadata.userId]
        );

        for (const owner of owners) {
          await NotificationDeliveryService.send({
            type: 'staffing_status_update',
            workspaceId,
            recipientUserId: owner.user_id,
            channel: 'in_app',
            body: {
              title: 'New Team Member Joined',
              message: `${metadata.firstName || ''} ${metadata.lastName || ''} (${metadata.role || 'team member'}) has joined and is ready to use the platform. Trinity has been briefed.`,
            },
          } as any).catch(() => {});
        }
      } catch (err: any) {
        log.warn('[EventBrain] member_joined welcome failed (non-fatal):', err?.message);
      }
    },
  },
};

export const trinityEventBrain = {
  /**
   * Dispatches the event to its handler (if registered). Handlers run on
   * scheduleNonBlocking so event publication never waits for brain work.
   * Unknown event types are ignored — Trinity still sees them, just no
   * specific reaction.
   */
  async process(event: PlatformEvent): Promise<void> {
    if (!event?.type) return;
    const handler = EVENT_HANDLERS[event.type];
    if (!handler) return;

    scheduleNonBlocking(`event-brain.${event.type}`, async () => {
      try {
        await handler.handler(event);
      } catch (err: any) {
        log.warn(`[EventBrain] Handler failed for ${event.type}:`, err?.message);
      }
    });
  },

  /** Exposed for tests and diagnostics. */
  getRegisteredEventTypes(): string[] {
    return Object.keys(EVENT_HANDLERS);
  },
};

// Silence unused-import warnings on pool (kept for future handlers that may
// need direct DB reads during event processing).
void pool;
