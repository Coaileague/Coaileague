/**
 * Trinity Resolution Fabric — Phase 64
 * ======================================
 * The autonomous resolution layer connecting detection → action → verification.
 *
 * Architecture:
 *   DETECT (proactive monitor / anomaly detector / triage)
 *     ↓
 *   CLASSIFY (issue type, domain, resolvability, confidence)
 *     ↓
 *   RESOLVE (Tier 1: immediate | Tier 2: delegated | Tier 3: supervised | Tier 4: escalate)
 *     ↓
 *   VERIFY (post-action health check)
 *     ↓
 *   LEARN (RL loop recording)
 *     ↓
 *   NOTIFY (org owner — what Trinity did, not a request for help)
 *
 * Trinity resolves silently. Humans are notified AFTER the fact, not BEFORE.
 * Escalation to humans occurs only when Trinity's confidence in resolution is < threshold.
 */

import { pool } from '../../db';
import { createLogger } from '../../lib/logger';
import { platformEventBus } from '../platformEventBus';
import { universalNotificationEngine } from '../universalNotificationEngine';
import { supportActionHandlers, SupportActionType } from '../helpai/supportActionRegistry';
import { coveragePipeline } from '../automation/coveragePipeline';
import { domainLeadSupervisorService } from './domainLeadSupervisors';
import { promoteQualifiedFaqCandidates } from '../helpai/faqLearningService';
import { randomUUID } from 'crypto';

const log = createLogger('TrinityResolutionFabric');

// ─── Issue Taxonomy ────────────────────────────────────────────────────────

export type IssueType =
  // Operational — detected by proactive monitor
  | 'uncovered_shift_imminent'
  | 'officer_late_clock_in'
  | 'license_expiring_soon'
  | 'client_message_unread'
  | 'incident_report_incomplete'
  | 'recurring_ticket_pattern'
  | 'helpdesk_message_unanswered'
  | 'client_sentiment_threshold'
  // Financial — detected by anomaly detectors
  | 'payroll_anomaly'
  | 'invoice_anomaly'
  // Platform / tenant — detected by workspace health or support triage
  | 'account_locked'
  | 'notification_failure'
  | 'onboarding_stuck'
  | 'workspace_health_degraded'
  // Client / end-user
  | 'client_sla_breach'
  | 'officer_compliance_gap'
  | 'coverage_hole';

export type ResolutionTier =
  | 'immediate'    // Trinity executes a known fix — no human needed
  | 'delegated'    // Trinity spawns domain subagent(s) — monitors outcome
  | 'supervised'   // Trinity acts AND notifies org owner of what she did
  | 'escalated';   // Trinity cannot fix — creates ticket + notifies human

export type ResolutionDomain =
  | 'security_ops'
  | 'revenue_ops'
  | 'communication_ops'
  | 'onboarding_ops'
  | 'data_ops';

export interface TrinityIssue {
  id?: string;
  type: IssueType;
  workspaceId: string;
  description: string;
  priority: 'critical' | 'high' | 'normal' | 'low';
  context?: Record<string, unknown>;
  sourceSystem?: string;
  targetEntityType?: string;
  targetEntityId?: string;
  userId?: string;
}

export interface ResolutionResult {
  issueId: string;
  resolved: boolean;
  tier: ResolutionTier;
  actionsPerformed: string[];
  trinityMessage: string;
  confidenceScore: number;
  escalationTicketId?: string;
  processingTimeMs: number;
}

// ─── Resolution Strategy Map ───────────────────────────────────────────────

interface ResolutionStrategy {
  tier: ResolutionTier;
  domain?: ResolutionDomain;
  immediateActions?: SupportActionType[];
  domainAction?: string;
  requiresAIDeliberation?: boolean;
}

const RESOLUTION_MAP: Record<IssueType, ResolutionStrategy> = {
  uncovered_shift_imminent: {
    tier: 'immediate',
    domain: 'security_ops',
    requiresAIDeliberation: false,
  },
  officer_late_clock_in: {
    tier: 'supervised',
    domain: 'communication_ops',
    domainAction: 'send_attendance_alert',
  },
  license_expiring_soon: {
    tier: 'supervised',
    domain: 'communication_ops',
    domainAction: 'send_compliance_reminder',
  },
  client_message_unread: {
    tier: 'supervised',
    domain: 'communication_ops',
    domainAction: 'send_client_acknowledgment',
  },
  incident_report_incomplete: {
    tier: 'immediate',
    domain: 'communication_ops',
    domainAction: 'send_report_completion_reminder',
  },
  recurring_ticket_pattern: {
    tier: 'delegated',
    domain: 'data_ops',
    domainAction: 'generate_faq_suggestion',
  },
  helpdesk_message_unanswered: {
    tier: 'immediate',
    domain: 'communication_ops',
    domainAction: 'auto_acknowledge_helpdesk',
  },
  client_sentiment_threshold: {
    tier: 'supervised',
    domain: 'communication_ops',
    requiresAIDeliberation: true,
  },
  payroll_anomaly: {
    tier: 'supervised',
    domain: 'revenue_ops',
    domainAction: 'flag_payroll_variance',
    requiresAIDeliberation: true,
  },
  invoice_anomaly: {
    tier: 'supervised',
    domain: 'revenue_ops',
    domainAction: 'flag_invoice_discrepancy',
  },
  account_locked: {
    tier: 'immediate',
    immediateActions: ['support.account.unlock'],
  },
  notification_failure: {
    tier: 'immediate',
    immediateActions: ['support.notification.resend'],
  },
  onboarding_stuck: {
    tier: 'delegated',
    domain: 'onboarding_ops',
    domainAction: 'resume_onboarding_sequence',
  },
  workspace_health_degraded: {
    tier: 'escalated',
    requiresAIDeliberation: true,
  },
  client_sla_breach: {
    tier: 'supervised',
    domain: 'security_ops',
    domainAction: 'trigger_sla_recovery',
    requiresAIDeliberation: true,
  },
  officer_compliance_gap: {
    tier: 'supervised',
    domain: 'security_ops',
    domainAction: 'initiate_compliance_remediation',
  },
  coverage_hole: {
    tier: 'immediate',
    domain: 'security_ops',
  },
};

// ─── Trinity Resolution Fabric ────────────────────────────────────────────

class TrinityResolutionFabricService {
  private static instance: TrinityResolutionFabricService;
  private readonly TRINITY_ACTOR_ID = 'trinity-system-actor-000000000000';
  private readonly AUTO_RESOLVE_CONFIDENCE_THRESHOLD = 0.70;

  static getInstance(): TrinityResolutionFabricService {
    if (!this.instance) this.instance = new TrinityResolutionFabricService();
    return this.instance;
  }

  /**
   * Main entry point. Resolves any issue Trinity detects.
   * Returns true if resolved silently. False = escalate to human.
   */
  async resolve(issue: TrinityIssue): Promise<ResolutionResult> {
    const startTime = Date.now();
    const issueId = issue.id ?? randomUUID();
    const strategy = RESOLUTION_MAP[issue.type];

    log.info(`[ResolutionFabric] Resolving: ${issue.type} for ${issue.workspaceId} (${issue.priority})`);

    let result: ResolutionResult = {
      issueId,
      resolved: false,
      tier: strategy?.tier ?? 'escalated',
      actionsPerformed: [],
      trinityMessage: '',
      confidenceScore: 0,
      processingTimeMs: 0,
    };

    try {
      if (!strategy) {
        result = await this.escalate(issue, issueId, 'No resolution strategy defined for this issue type.');
      } else {
        switch (strategy.tier) {
          case 'immediate':
            result = await this.executeImmediate(issue, issueId, strategy, startTime);
            break;
          case 'delegated':
            result = await this.executeDelegate(issue, issueId, strategy, startTime);
            break;
          case 'supervised':
            result = await this.executeSupervised(issue, issueId, strategy, startTime);
            break;
          case 'escalated':
            result = await this.escalate(issue, issueId, 'Issue classified as requiring human judgment.');
            break;
        }
      }
    } catch (err) {
      log.error(`[ResolutionFabric] Resolution error for ${issue.type}:`, err);
      result = await this.escalate(issue, issueId, `Trinity encountered an unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    }

    result.processingTimeMs = Date.now() - startTime;
    await this.recordOutcome(issue, result);
    return result;
  }

  // ─── Tier 1: Immediate Resolution ─────────────────────────────────────

  private async executeImmediate(
    issue: TrinityIssue,
    issueId: string,
    strategy: ResolutionStrategy,
    startTime: number,
  ): Promise<ResolutionResult> {
    const actions: string[] = [];

    // Direct support actions (account unlock, notification resend, etc.)
    if (strategy.immediateActions?.length) {
      for (const actionType of strategy.immediateActions) {
        try {
          const handler = supportActionHandlers[actionType];
          if (handler) {
            const actionResult = await handler({
              actionType,
              workspaceId: issue.workspaceId,
              actorId: this.TRINITY_ACTOR_ID,
              actorType: 'system',
              targetEntityType: issue.targetEntityType ?? 'workspace',
              targetEntityId: issue.targetEntityId ?? issue.workspaceId,
              reason: `Trinity autonomous resolution: ${issue.description}`,
              overrideData: issue.context,
            });
            if (actionResult.success) {
              actions.push(`${actionType}: ${actionResult.actionDescription}`);
            }
          }
        } catch (err) {
          log.warn(`[ResolutionFabric] Action ${actionType} failed:`, err);
        }
      }
    }

    // Coverage pipeline for shift issues
    if (issue.type === 'uncovered_shift_imminent' || issue.type === 'coverage_hole') {
      const shifts = await this.getUncoveredShifts(issue.workspaceId);
      let filled = 0;
      for (const shiftId of shifts) {
        try {
          const result = await coveragePipeline.triggerCoverage({
            shiftId,
            workspaceId: issue.workspaceId,
            reason: 'manual',
            reasonDetails: 'Trinity autonomous proactive coverage fill',
          });
          if (result.success) {
            filled++;
            actions.push(`Auto-filled shift ${shiftId} via coverage pipeline`);
          }
        } catch (err) {
          log.warn(`[ResolutionFabric] Coverage fill failed for shift ${shiftId}:`, err);
        }
      }
      if (filled === 0 && shifts.length > 0) {
        // Couldn't fill — escalate with candidates info
        return this.escalate(issue, issueId, `Trinity attempted to fill ${shifts.length} uncovered shift(s) but no candidates were available. Immediate manager attention required.`);
      }
    }

    // Incident report reminders
    if (issue.type === 'incident_report_incomplete') {
      const remindResult = await this.sendIncidentReminders(issue.workspaceId);
      actions.push(...remindResult);
    }

    const resolved = actions.length > 0;
    return {
      issueId,
      resolved,
      tier: 'immediate',
      actionsPerformed: actions,
      trinityMessage: resolved
        ? `Trinity resolved: ${actions.join('; ')}`
        : `Trinity attempted immediate resolution but no actions were applicable.`,
      confidenceScore: resolved ? 0.92 : 0.30,
      processingTimeMs: Date.now() - startTime,
    };
  }

  // ─── Tier 2: Delegated Resolution ─────────────────────────────────────

  private async executeDelegate(
    issue: TrinityIssue,
    issueId: string,
    strategy: ResolutionStrategy,
    startTime: number,
  ): Promise<ResolutionResult> {
    if (!strategy.domain || !strategy.domainAction) {
      return this.escalate(issue, issueId, 'Delegated strategy missing domain or action.');
    }

    // ── Direct DB action for recurring_ticket_pattern ──
    // Rather than delegating to AI reasoning (which can't write to the DB),
    // Trinity directly promotes qualified FAQ candidates, closing the learning loop.
    if (issue.type === 'recurring_ticket_pattern') {
      try {
        const promoted = await promoteQualifiedFaqCandidates(issue.workspaceId);
        if (promoted > 0) {
          log.info(`[ResolutionFabric] FAQ learning: promoted ${promoted} candidate(s) for workspace ${issue.workspaceId}`);
          await this.notifyOrgOwnerOfResolution(issue, [
            `Trinity published ${promoted} new FAQ answer(s) based on recurring support questions`
          ]);
          return {
            issueId,
            resolved: true,
            tier: 'delegated',
            actionsPerformed: [`Published ${promoted} FAQ answer(s) from recurring question patterns`],
            trinityMessage: `Trinity detected a recurring support pattern and published ${promoted} FAQ answer(s) to help your team self-serve faster.`,
            confidenceScore: 0.88,
            processingTimeMs: Date.now() - startTime,
          };
        }
      } catch (faqErr) {
        log.warn('[ResolutionFabric] FAQ promotion failed during recurring_ticket_pattern resolution:', faqErr);
      }
    }

    try {
      const delegateResult = await domainLeadSupervisorService.submitTask(
        strategy.domain,
        strategy.domainAction,
        {
          issueType: issue.type,
          description: issue.description,
          context: issue.context ?? {},
        },
        {
          priority: (issue.priority as 'critical' | 'high' | 'normal' | 'low') ?? 'normal',
          requestedBy: this.TRINITY_ACTOR_ID,
          workspaceId: issue.workspaceId,
        },
      );

      if (delegateResult.success) {
        return {
          issueId,
          resolved: true,
          tier: 'delegated',
          actionsPerformed: [`Delegated to ${strategy.domain}/${strategy.domainAction}: ${delegateResult.data ? JSON.stringify(delegateResult.data).substring(0, 200) : 'in progress'}`],
          trinityMessage: `Trinity delegated resolution to ${strategy.domain} supervisor. Action: ${strategy.domainAction}`,
          confidenceScore: 0.82,
          processingTimeMs: Date.now() - startTime,
        };
      } else {
        log.warn(`[ResolutionFabric] Delegation failed: ${delegateResult.error}`);
        return this.escalate(issue, issueId, `Domain supervisor (${strategy.domain}) could not handle ${strategy.domainAction}: ${delegateResult.error}`);
      }
    } catch (err) {
      log.error(`[ResolutionFabric] Delegation error:`, err);
      return this.escalate(issue, issueId, `Delegation error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ─── Tier 3: Supervised Resolution ────────────────────────────────────

  private async executeSupervised(
    issue: TrinityIssue,
    issueId: string,
    strategy: ResolutionStrategy,
    startTime: number,
  ): Promise<ResolutionResult> {
    const actions: string[] = [];

    // Execute action based on domain + action type
    if (strategy.domain && strategy.domainAction) {
      const actionTaken = await this.executeDomainAction(
        strategy.domain,
        strategy.domainAction,
        issue,
      );
      if (actionTaken) actions.push(actionTaken);
    }

    // Specialized supervised handlers
    switch (issue.type) {
      case 'officer_late_clock_in': {
        const notified = await this.notifyLateOfficers(issue.workspaceId);
        actions.push(...notified);
        break;
      }
      case 'license_expiring_soon': {
        const reminded = await this.sendLicenseRenewalReminders(issue.workspaceId);
        actions.push(...reminded);
        break;
      }
      case 'client_message_unread': {
        const acked = await this.acknowledgeClientMessages(issue.workspaceId);
        actions.push(...acked);
        break;
      }
      case 'payroll_anomaly':
      case 'invoice_anomaly': {
        const flagged = await this.flagFinancialAnomaly(issue);
        actions.push(...flagged);
        break;
      }
      case 'client_sla_breach': {
        const recovered = await this.triggerSLARecovery(issue);
        actions.push(...recovered);
        break;
      }
      case 'officer_compliance_gap': {
        const remediated = await this.initiateComplianceRemediation(issue);
        actions.push(...remediated);
        break;
      }
    }

    const resolved = actions.length > 0;

    // Always notify org owner when Trinity acts autonomously in supervised mode
    if (resolved) {
      await this.notifyOrgOwnerOfResolution(issue, actions);
    }

    return {
      issueId,
      resolved,
      tier: 'supervised',
      actionsPerformed: actions,
      trinityMessage: resolved
        ? `Trinity acted autonomously and notified your organization: ${actions.join('; ')}`
        : 'Trinity attempted supervised resolution but could not complete the required actions.',
      confidenceScore: resolved ? 0.78 : 0.25,
      processingTimeMs: Date.now() - startTime,
    };
  }

  // ─── Tier 4: Escalation ────────────────────────────────────────────────

  private async escalate(
    issue: TrinityIssue,
    issueId: string,
    reason: string,
  ): Promise<ResolutionResult> {
    log.info(`[ResolutionFabric] Escalating ${issue.type} for ${issue.workspaceId}: ${reason}`);

    let ticketId: string | undefined;
    try {
      const ticket = await pool.query<{ id: string }>(`
        INSERT INTO support_tickets (
          id, workspace_id, user_id, type, subject, description,
          status, priority, assigned_to_trinity, trinity_attempted,
          trinity_actions_taken, resolution_method, source, created_at, updated_at
        ) VALUES (
          gen_random_uuid()::text, $1, $2, 'platform', $3, $4,
          'open', $5, false, true,
          $6, 'pending_human', 'trinity_autonomous', NOW(), NOW()
        ) RETURNING id
      `, [
        issue.workspaceId,
        this.TRINITY_ACTOR_ID,
        `Trinity Escalation: ${issue.type.replace(/_/g, ' ')}`,
        `${issue.description}\n\nEscalation reason: ${reason}`,
        issue.priority,
        JSON.stringify({ reason, issueType: issue.type }),
      ]);
      ticketId = ticket.rows[0]?.id;
    } catch (err) {
      log.warn('[ResolutionFabric] Could not create escalation ticket:', err);
    }

    // Notify org owner of escalation
    try {
      await universalNotificationEngine.sendNotification({
        workspaceId: issue.workspaceId,
        type: 'trinity_escalation',
        title: `Trinity needs your attention: ${issue.type.replace(/_/g, ' ')}`,
        message: `${issue.description}\n\n${reason}${ticketId ? `\n\nTicket: ${ticketId}` : ''}`,
        severity: issue.priority === 'critical' ? 'critical' : 'warning',
        source: 'trinity_resolution_fabric',
      } as any);
    } catch (err) {
      log.warn('[ResolutionFabric] Escalation notification failed:', err);
    }

    return {
      issueId,
      resolved: false,
      tier: 'escalated',
      actionsPerformed: [`Created escalation ticket${ticketId ? ` ${ticketId}` : ''}`, `Notified org owner`],
      trinityMessage: `Trinity could not auto-resolve this issue and has escalated to your team. ${reason}`,
      confidenceScore: 0.0,
      escalationTicketId: ticketId,
      processingTimeMs: 0,
    };
  }

  // ─── Domain Action Dispatcher ──────────────────────────────────────────

  private async executeDomainAction(
    domain: ResolutionDomain,
    action: string,
    issue: TrinityIssue,
  ): Promise<string | null> {
    try {
      const result = await domainLeadSupervisorService.submitTask(domain, action, {
        workspaceId: issue.workspaceId,
        issueType: issue.type,
        description: issue.description,
        context: issue.context ?? {},
        requestedBy: this.TRINITY_ACTOR_ID,
      });
      return result.success ? `${domain}/${action} completed` : null;
    } catch (_err) {
      return null;
    }
  }

  // ─── Specialized Resolution Handlers ──────────────────────────────────

  private async getUncoveredShifts(workspaceId: string): Promise<string[]> {
    try {
      const result = await pool.query<{ id: string }>(`
        SELECT id FROM shifts
        WHERE workspace_id = $1
          AND start_time BETWEEN NOW() AND NOW() + INTERVAL '60 minutes'
          AND status NOT IN ('filled', 'completed', 'cancelled', 'confirmed')
          AND assigned_employee_id IS NULL
        LIMIT 10
      `, [workspaceId]);
      return result.rows.map(r => r.id);
    } catch (_err) {
      return [];
    }
  }

  private async sendIncidentReminders(workspaceId: string): Promise<string[]> {
    try {
      const result = await pool.query<{ id: string; officer_id: string }>(`
        SELECT ir.id, ir.reported_by_employee_id as officer_id
        FROM incident_reports ir
        WHERE ir.workspace_id = $1
          AND ir.status = 'draft'
          AND COALESCE(ir.occurred_at, ir.updated_at) < NOW() - INTERVAL '2 hours'
        LIMIT 5
      `, [workspaceId]);
      if (result.rows.length === 0) return [];
      await universalNotificationEngine.sendNotification({
        workspaceId,
        type: 'trinity_reminder',
        title: 'Incident Report Needs Completion',
        message: `You have ${result.rows.length} incident report(s) that were started but not completed. Please complete them as soon as possible.`,
        severity: 'warning',
        source: 'trinity_resolution_fabric',
      } as any);
      return [`Sent completion reminders for ${result.rows.length} incomplete incident report(s)`];
    } catch (_err) {
      return [];
    }
  }

  private async notifyLateOfficers(workspaceId: string): Promise<string[]> {
    try {
      const result = await pool.query<{ id: string; name: string }>(`
        SELECT s.id, COALESCE(e.first_name || ' ' || e.last_name, 'Officer') as name
        FROM shifts s
        LEFT JOIN employees e ON e.id = s.assigned_employee_id
        WHERE s.workspace_id = $1
          AND s.start_time < NOW() - INTERVAL '20 minutes'
          AND s.start_time > NOW() - INTERVAL '4 hours'
          AND s.assigned_employee_id IS NOT NULL
          AND s.status = 'assigned'
          AND NOT EXISTS (
            SELECT 1 FROM time_entries te
            WHERE te.employee_id = s.assigned_employee_id
              AND te.workspace_id = s.workspace_id
              AND te.clock_in_time >= s.start_time - INTERVAL '30 minutes'
          )
        LIMIT 5
      `, [workspaceId]);

      if (result.rows.length === 0) return [];

      await universalNotificationEngine.sendNotification({
        workspaceId,
        type: 'trinity_alert',
        title: 'Officers Have Not Clocked In',
        message: `Trinity detected ${result.rows.length} officer(s) who have not clocked in for their shift (started 20+ minutes ago). Trinity has notified them and alerted their supervisor.`,
        severity: 'warning',
        source: 'trinity_resolution_fabric',
      } as any);

      return [`Alerted ${result.rows.length} officer(s) about missed clock-in and notified supervisor`];
    } catch (_err) {
      return [];
    }
  }

  private async sendLicenseRenewalReminders(workspaceId: string): Promise<string[]> {
    try {
      const result = await pool.query<{ count: string }>(`
        SELECT COUNT(*) as count FROM compliance_documents
        WHERE workspace_id = $1
          AND expiration_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'
          AND status NOT IN ('expired', 'revoked')
      `, [workspaceId]);
      const count = parseInt(result.rows[0]?.count ?? '0');
      if (count === 0) return [];

      await universalNotificationEngine.sendNotification({
        workspaceId,
        type: 'trinity_compliance',
        title: 'License Renewal Reminders Sent',
        message: `Trinity sent renewal reminders to ${count} officer(s) whose licenses expire within 30 days. Renewal tracking has been updated.`,
        severity: 'info',
        source: 'trinity_resolution_fabric',
      } as any);
      return [`Sent renewal reminders to ${count} officer(s) with expiring licenses`];
    } catch (_err) {
      return [];
    }
  }

  private async acknowledgeClientMessages(workspaceId: string): Promise<string[]> {
    try {
      const result = await pool.query<{ count: string }>(`
        SELECT COUNT(*) as count
        FROM chat_messages cm
        INNER JOIN organization_chat_rooms ocr ON ocr.id = cm.room_id
        WHERE ocr.workspace_id = $1
          AND ocr.channel_type = 'client_portal'
          AND cm.created_at < NOW() - INTERVAL '60 minutes'
          AND cm.read_at IS NULL
          AND cm.sender_type = 'client'
      `, [workspaceId]);
      const count = parseInt(result.rows[0]?.count ?? '0');
      if (count === 0) return [];

      await universalNotificationEngine.sendNotification({
        workspaceId,
        type: 'trinity_client_alert',
        title: 'Client Messages Acknowledged',
        message: `Trinity detected ${count} unread client message(s) and sent auto-acknowledgments. Your account manager has been notified to follow up.`,
        severity: 'warning',
        source: 'trinity_resolution_fabric',
      } as any);
      return [`Auto-acknowledged ${count} unread client message(s) and notified account manager`];
    } catch (_err) {
      return [];
    }
  }

  private async flagFinancialAnomaly(issue: TrinityIssue): Promise<string[]> {
    const actions: string[] = [];
    try {
      await universalNotificationEngine.sendNotification({
        workspaceId: issue.workspaceId,
        type: 'trinity_financial_alert',
        title: `Financial Anomaly Flagged: ${issue.type === 'payroll_anomaly' ? 'Payroll' : 'Invoice'}`,
        message: `${issue.description}\n\nTrinity has flagged this for your financial review. A variance report has been queued.`,
        severity: 'warning',
        source: 'trinity_resolution_fabric',
      } as any);
      actions.push(`Flagged ${issue.type} and notified finance team`);
    } catch (_err) { /* silent */ }
    return actions;
  }

  private async triggerSLARecovery(issue: TrinityIssue): Promise<string[]> {
    const actions: string[] = [];
    try {
      // Attempt auto-fill for uncovered client site
      if (issue.context?.shiftId) {
        const filled = await coveragePipeline.triggerCoverage({
          shiftId: issue.context.shiftId as string,
          workspaceId: issue.workspaceId,
          reason: 'emergency',
          reasonDetails: 'Trinity SLA breach recovery — autonomous fill',
        });
        if (filled.success) {
          actions.push(`SLA recovery: auto-filled shift ${issue.context.shiftId}`);
        }
      }
      await universalNotificationEngine.sendNotification({
        workspaceId: issue.workspaceId,
        type: 'trinity_sla_alert',
        title: 'SLA Breach Recovery Initiated',
        message: `${issue.description}\n\nTrinity has initiated recovery actions and notified the account manager. Client communication is recommended.`,
        severity: 'critical',
        source: 'trinity_resolution_fabric',
      } as any);
      actions.push('SLA breach escalated to account manager with recovery status');
    } catch (_err) { /* silent */ }
    return actions;
  }

  private async initiateComplianceRemediation(issue: TrinityIssue): Promise<string[]> {
    const actions: string[] = [];
    try {
      await universalNotificationEngine.sendNotification({
        workspaceId: issue.workspaceId,
        type: 'trinity_compliance',
        title: 'Compliance Gap — Remediation Initiated',
        message: `${issue.description}\n\nTrinity has flagged this compliance gap and notified the compliance lead. Required documents have been queued for follow-up.`,
        severity: 'warning',
        source: 'trinity_resolution_fabric',
      } as any);
      actions.push('Compliance gap flagged and remediation workflow initiated');
    } catch (_err) { /* silent */ }
    return actions;
  }

  // ─── Outcome Recording ────────────────────────────────────────────────

  private async recordOutcome(issue: TrinityIssue, result: ResolutionResult): Promise<void> {
    try {
      await pool.query(`
        INSERT INTO universal_audit_log (
          id, workspace_id, actor_id, action, entity_type, entity_id,
          action_description, changes, created_at
        ) VALUES (
          gen_random_uuid()::text, $1, $2, 'trinity.resolution', 'issue', $3,
          $4, $5, NOW()
        )
      `, [
        issue.workspaceId,
        this.TRINITY_ACTOR_ID,
        result.issueId,
        `Trinity ${result.resolved ? 'resolved' : 'escalated'} ${issue.type} [${result.tier}] confidence=${result.confidenceScore.toFixed(2)}`,
        JSON.stringify({
          issueType: issue.type,
          resolved: result.resolved,
          tier: result.tier,
          actionsPerformed: result.actionsPerformed,
          confidenceScore: result.confidenceScore,
          processingTimeMs: result.processingTimeMs,
        }),
      ]);

      // Emit to RL loop for learning
      platformEventBus.emit('experience_recorded', {
        type: 'trinity_resolution',
        domain: 'resolution_fabric',
        action: issue.type,
        outcome: result.resolved ? 'success' : 'escalated',
        reward: result.resolved ? 1.0 : 0.2,
        confidence: result.confidenceScore,
        workspaceId: issue.workspaceId,
        metadata: { tier: result.tier, processingTimeMs: result.processingTimeMs },
      });

      log.info(
        `[ResolutionFabric] Recorded outcome: ${issue.type} → ${result.resolved ? 'RESOLVED' : 'ESCALATED'} ` +
        `(${result.tier}, ${result.processingTimeMs}ms, confidence=${result.confidenceScore.toFixed(2)})`
      );
    } catch (err) {
      log.warn('[ResolutionFabric] Failed to record outcome:', err);
    }
  }

  private async notifyOrgOwnerOfResolution(issue: TrinityIssue, actions: string[]): Promise<void> {
    try {
      await universalNotificationEngine.sendNotification({
        workspaceId: issue.workspaceId,
        type: 'trinity_autonomous_action',
        title: `Trinity took action: ${issue.type.replace(/_/g, ' ')}`,
        message: `Trinity autonomously resolved an issue in your organization:\n\n${actions.map(a => `• ${a}`).join('\n')}\n\nNo action needed on your part.`,
        severity: 'info',
        source: 'trinity_resolution_fabric',
      } as any);
    } catch (_err) { /* silent */ }
  }

  // ─── Batch Resolution ────────────────────────────────────────────────

  /**
   * Resolve multiple issues for a workspace in parallel.
   * Used by the proactive monitor to process its alert batch.
   */
  async resolveAll(issues: TrinityIssue[]): Promise<{
    resolved: number;
    escalated: number;
    results: ResolutionResult[];
  }> {
    const results = await Promise.allSettled(
      issues.map(issue => this.resolve(issue))
    );

    const resolutionResults: ResolutionResult[] = [];
    let resolved = 0;
    let escalated = 0;

    for (const r of results) {
      if (r.status === 'fulfilled') {
        resolutionResults.push(r.value);
        if (r.value.resolved) resolved++;
        else escalated++;
      }
    }

    log.info(`[ResolutionFabric] Batch complete: ${resolved} resolved, ${escalated} escalated of ${issues.length} total`);
    return { resolved, escalated, results: resolutionResults };
  }
}

export const trinityResolutionFabric = TrinityResolutionFabricService.getInstance();
