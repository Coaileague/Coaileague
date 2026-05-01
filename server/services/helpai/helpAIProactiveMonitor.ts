/**
 * HelpAI Proactive Monitor — Phase 8
 * ====================================
 * Runs a lightweight monitoring loop per workspace on a configurable
 * interval (default: every 5 minutes). Fires outbound alerts for
 * operational conditions that need management attention.
 *
 * Anti-spam: same alert condition sends once and waits for acknowledgment
 * before sending again for the same condition.
 */

import { db, pool } from '../../db';
import { helpaiProactiveAlerts, shifts, timeEntries, complianceDocuments, chatMessages, organizationChatRooms, incidentReports, workspaceMembers, supportTickets } from '@shared/schema';
import { eq, and, gte, lte, lt, gt, isNull, desc, between, notInArray, sql, notExists, exists } from 'drizzle-orm';
import { universalNotificationEngine } from '../universalNotificationEngine';
import { trinityHelpaiCommandBus } from './trinityHelpaiCommandBus';
import { typedPool } from '../../lib/typedSql';
import { trinityResolutionFabric, IssueType } from '../ai-brain/trinityResolutionFabric';
import { promoteQualifiedFaqCandidates } from './faqLearningService';
import { createLogger } from '../../lib/logger';

const log = createLogger('HelpAIProactiveMonitor');

// Maps proactive alert types to Trinity issue types for autonomous resolution
const ALERT_TO_ISSUE_TYPE: Record<AlertType, IssueType> = {
  uncovered_shift_imminent: 'uncovered_shift_imminent',
  officer_late_clock_in: 'officer_late_clock_in',
  license_expiring_soon: 'license_expiring_soon',
  client_message_unread: 'client_message_unread',
  incident_report_incomplete: 'incident_report_incomplete',
  recurring_ticket_pattern: 'recurring_ticket_pattern',
  helpdesk_message_unanswered: 'helpdesk_message_unanswered',
  client_sentiment_threshold: 'client_sentiment_threshold',
};

const MONITOR_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

type AlertType =
  | 'uncovered_shift_imminent'
  | 'officer_late_clock_in'
  | 'client_message_unread'
  | 'incident_report_incomplete'
  | 'license_expiring_soon'
  | 'helpdesk_message_unanswered'
  | 'client_sentiment_threshold'
  | 'recurring_ticket_pattern';

interface ProactiveAlert {
  workspaceId: string;
  alertType: AlertType;
  description: string;
  priority: 'critical' | 'high' | 'normal' | 'low';
  sourceThread: string;
  deliveredTo?: string;
}

class HelpAIProactiveMonitor {
  private timer: NodeJS.Timeout | null = null;
  private runningWorkspaces = new Set<string>();

  start(): void {
    if (this.timer) return;
    log.info('[HelpAIProactiveMonitor] Starting — 5 minute proactive monitoring loop with autonomous resolution');

    this.timer = setInterval(async () => {
      await this.runMonitoringCycle();
    }, MONITOR_INTERVAL_MS);

    // Run immediately on first start (after 30s delay to let app settle)
    setTimeout(() => this.runMonitoringCycle(), 30_000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runMonitoringCycle(): Promise<void> {
    try {
      // Phase 73: Skip trial_expired workspaces — they have no active subscription
      // workspace_state lives on the workspaces table (not in Drizzle schema), use raw SQL join
      const workspacesResult = await db.execute<{ workspace_id: string }>(
        sql`SELECT DISTINCT wm.workspace_id
            FROM workspace_members wm
            JOIN workspaces w ON w.id = wm.workspace_id
            WHERE wm.workspace_id IS NOT NULL
              AND (w.workspace_type IS NULL OR w.workspace_type != 'trial_expired')
              AND (w.subscription_status IS NULL OR w.subscription_status NOT IN ('cancelled', 'deleted'))
            LIMIT 50`
      );

      const workspaceIds = workspacesResult.rows.map(r => r.workspace_id).filter((id): id is string => !!id);

      await Promise.allSettled(
        workspaceIds.map(wsId => this.monitorWorkspace(wsId))
      );
    } catch (err: unknown) {
      // OBSERVABILITY (Phase 1 Domain 1 — 2026-04-08): previously this
      // logged `err` as a single opaque argument, which some logger
      // shims render as `[object Object]` and drop the message entirely.
      // Surface the full PG/error context so the root cause becomes
      // visible in Railway logs. No logic change.
      log.error('[HelpAIProactiveMonitor] Cycle error', {
        message: err instanceof Error ? err.message : String(err),
        code: err?.code,
        detail: err?.detail,
        column: err?.column,
        constraint: err?.constraint,
        table: err?.table,
        schema: err?.schema,
        where: err?.where,
        routine: err?.routine,
        stack: err?.stack?.split('\n').slice(0, 8).join(' | '),
      });
    }
  }

  private async monitorWorkspace(workspaceId: string): Promise<void> {
    if (this.runningWorkspaces.has(workspaceId)) return;
    this.runningWorkspaces.add(workspaceId);

    try {
      const alertResults = await Promise.allSettled([
        this.checkUncoveredShifts(workspaceId),
        this.checkLateClockIns(workspaceId),
        this.checkExpiringLicenses(workspaceId),
        this.checkUnreadClientMessages(workspaceId),
        this.checkIncompleteIncidentReports(workspaceId),
        this.checkRecurringTicketPattern(workspaceId),
      ]);

      const detected: ProactiveAlert[] = [];
      for (const result of alertResults) {
        if (result.status === 'fulfilled' && result.value) {
          detected.push(...result.value);
        }
      }

      if (detected.length === 0) return;

      // Trinity attempts autonomous resolution FIRST.
      // Only fire human-facing alerts for issues she cannot resolve.
      const issues = detected.map(alert => ({
        type: ALERT_TO_ISSUE_TYPE[alert.alertType] ?? alert.alertType as IssueType,
        workspaceId: alert.workspaceId,
        description: alert.description,
        priority: alert.priority,
        sourceSystem: 'proactive_monitor',
      }));

      const { resolved, escalated, results } = await trinityResolutionFabric.resolveAll(issues);

      // Only alert humans for unresolved issues
      const unresolved = detected.filter((alert, idx) => {
        const res = results[idx];
        return !res || !res.resolved;
      });

      log.info(
        `[HelpAIProactiveMonitor] ${workspaceId}: ` +
        `${detected.length} detected, ${resolved} auto-resolved by Trinity, ${unresolved.length} escalated to humans`
      );

      for (const alert of unresolved) {
        await this.fireAlert(alert);
      }
    } catch (err: unknown) {
      // OBSERVABILITY: surface full PG error context (see cycle-error block above).
      log.error(`[HelpAIProactiveMonitor] Workspace ${workspaceId} error`, {
        message: err instanceof Error ? err.message : String(err),
        code: err?.code,
        detail: err?.detail,
        column: err?.column,
        constraint: err?.constraint,
        table: err?.table,
        stack: err?.stack?.split('\n').slice(0, 8).join(' | '),
      });
    } finally {
      this.runningWorkspaces.delete(workspaceId);
    }
  }

  private async checkUncoveredShifts(workspaceId: string): Promise<ProactiveAlert[]> {
    try {
      // Converted to Drizzle ORM: NOT IN → notInArray()
      const result = await db.select({ count: sql`COUNT(*)` })
        .from(shifts)
        .where(and(
          eq(shifts.workspaceId, workspaceId),
          between(shifts.startTime, sql`NOW()`, sql`NOW() + INTERVAL '30 minutes'`),
          notInArray(shifts.status, ['filled', 'completed', 'cancelled']),
          isNull(shifts.assignedEmployeeId)
        ));

      const count = parseInt(String((result[0] as any)?.count || '0'));
      if (count === 0) return [];

      const alreadySent = await this.isAlertRecentlySent(workspaceId, 'uncovered_shift_imminent');
      if (alreadySent) return [];

      return [{
        workspaceId,
        alertType: 'uncovered_shift_imminent',
        description: `${count} shift(s) starting within 30 minutes have no assigned officer.`,
        priority: 'high',
        sourceThread: 'scheduling',
      }];
    } catch (_err) {
      return [];
    }
  }

  private async checkLateClockIns(workspaceId: string): Promise<ProactiveAlert[]> {
    try {
      // Converted to Drizzle ORM: EXISTS → notExists()
      const result = await db.select({ count: sql`COUNT(*)` })
        .from(shifts)
        .where(and(
          eq(shifts.workspaceId, workspaceId),
          lt(shifts.startTime, sql`NOW() - INTERVAL '20 minutes'`),
          gt(shifts.startTime, sql`NOW() - INTERVAL '4 hours'`),
          sql`${(shifts as any).assignedEmployeeId} IS NOT NULL`,
          eq(shifts.status, 'assigned'),
          notExists(
            db.select({ one: sql`1` })
              .from(timeEntries)
              .where(and(
                eq(timeEntries.employeeId, (shifts as any).assignedEmployeeId),
                eq(timeEntries.workspaceId, shifts.workspaceId),
                gte(timeEntries.clockInTime, sql`${shifts.startTime} - INTERVAL '30 minutes'`)
              ))
          )
        ));

      const count = parseInt(String((result[0] as any)?.count || '0'));
      if (count === 0) return [];

      const alreadySent = await this.isAlertRecentlySent(workspaceId, 'officer_late_clock_in');
      if (alreadySent) return [];

      return [{
        workspaceId,
        alertType: 'officer_late_clock_in',
        description: `${count} officer(s) have not clocked in — shift started 20+ minutes ago.`,
        priority: 'high',
        sourceThread: 'clock_data',
      }];
    } catch (_err) {
      return [];
    }
  }

  private async checkExpiringLicenses(workspaceId: string): Promise<ProactiveAlert[]> {
    try {
      // Converted to Drizzle ORM: NOT IN → notInArray()
      const result = await db.select({ count: sql`COUNT(*)` })
        .from(complianceDocuments)
        .where(and(
          eq(complianceDocuments.workspaceId, workspaceId),
          between(complianceDocuments.expirationDate, sql`NOW()`, sql`NOW() + INTERVAL '30 days'`),
          notInArray(complianceDocuments.status, ['expired', 'revoked'])
        ));

      const count = parseInt(String((result[0] as any)?.count || '0'));
      if (count === 0) return [];

      const alreadySent = await this.isAlertRecentlySent(workspaceId, 'license_expiring_soon');
      if (alreadySent) return [];

      return [{
        workspaceId,
        alertType: 'license_expiring_soon',
        description: `${count} officer license(s) expire within 30 days and need renewal.`,
        priority: 'normal',
        sourceThread: 'compliance',
      }];
    } catch (_err) {
      return [];
    }
  }

  private async checkUnreadClientMessages(workspaceId: string): Promise<ProactiveAlert[]> {
    try {
      // Converted to Drizzle ORM: JOIN
      const result = await db.select({ count: sql`COUNT(*)` })
        .from(chatMessages)
        .innerJoin(organizationChatRooms, eq(organizationChatRooms.id, (chatMessages as any).roomId))
        .where(and(
          eq(organizationChatRooms.workspaceId, workspaceId),
          eq(organizationChatRooms.channelType, 'client_portal'),
          lt(chatMessages.createdAt, sql`NOW() - INTERVAL '60 minutes'`),
          isNull(chatMessages.readAt),
          eq(chatMessages.senderType, 'client')
        ));

      const count = parseInt(String((result[0] as any)?.count || '0'));
      if (count === 0) return [];

      const alreadySent = await this.isAlertRecentlySent(workspaceId, 'client_message_unread');
      if (alreadySent) return [];

      return [{
        workspaceId,
        alertType: 'client_message_unread',
        description: `${count} client portal message(s) have been unread for over 60 minutes.`,
        priority: 'high',
        sourceThread: 'client_portal',
      }];
    } catch (_err) {
      return [];
    }
  }

  private async checkIncompleteIncidentReports(workspaceId: string): Promise<ProactiveAlert[]> {
    try {
      // Converted to Drizzle ORM
      const result = await db.select({ count: sql`COUNT(*)` })
        .from(incidentReports)
        .where(and(
          eq(incidentReports.workspaceId, workspaceId),
          eq(incidentReports.status, 'draft'),
          lt(sql`COALESCE(${incidentReports.occurredAt}, ${incidentReports.updatedAt})`, sql`NOW() - INTERVAL '2 hours'`)
        ));

      const count = parseInt(String((result[0] as any)?.count || '0'));
      if (count === 0) return [];

      const alreadySent = await this.isAlertRecentlySent(workspaceId, 'incident_report_incomplete');
      if (alreadySent) return [];

      return [{
        workspaceId,
        alertType: 'incident_report_incomplete',
        description: `${count} incident report(s) were started but not completed within 2 hours.`,
        priority: 'normal',
        sourceThread: 'incidents',
      }];
    } catch (_err) {
      return [];
    }
  }

  private async checkRecurringTicketPattern(workspaceId: string): Promise<ProactiveAlert[]> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const tickets = await db.select({
        emailCategory: supportTickets.emailCategory,
        type: supportTickets.type,
      }).from(supportTickets)
        .where(and(
          eq(supportTickets.workspaceId, workspaceId),
          gte(supportTickets.createdAt, thirtyDaysAgo),
        ));
      const categoryCount: Record<string, number> = {};
      for (const t of tickets) {
        const cat = t.emailCategory ?? t.type ?? 'general';
        categoryCount[cat] = (categoryCount[cat] ?? 0) + 1;
      }
      const recurring = Object.entries(categoryCount).filter(([, cnt]) => cnt >= 3);
      if (recurring.length === 0) return [];
      const alreadySent = await this.isAlertRecentlySent(workspaceId, 'recurring_ticket_pattern');
      if (alreadySent) return [];
      const top = recurring.sort((a, b) => b[1] - a[1]).slice(0, 3);
      const summary = top.map(([cat, cnt]) => `${cat} (${cnt}×)`).join(', ');
      return [{
        workspaceId,
        alertType: 'recurring_ticket_pattern',
        description: `Recurring support pattern detected in the last 30 days: ${summary}. Consider publishing a FAQ or proactive announcement.`,
        priority: 'normal',
        sourceThread: 'helpdesk',
      }];
    } catch (_err) {
      return [];
    }
  }

  private async isAlertRecentlySent(
    workspaceId: string,
    alertType: AlertType
  ): Promise<boolean> {
    try {
      const recent = await db
        .select()
        .from(helpaiProactiveAlerts)
        .where(
          and(
            eq(helpaiProactiveAlerts.workspaceId, workspaceId),
            eq(helpaiProactiveAlerts.alertType, alertType),
            eq(helpaiProactiveAlerts.acknowledged, false),
            gte(helpaiProactiveAlerts.createdAt, new Date(Date.now() - MONITOR_INTERVAL_MS * 2))
          )
        )
        .limit(1);

      return recent.length > 0;
    } catch (_err) {
      return false;
    }
  }

  private async fireAlert(alert: ProactiveAlert): Promise<void> {
    try {
      await db.insert(helpaiProactiveAlerts).values({
        workspaceId: alert.workspaceId,
        alertType: alert.alertType,
        alertSourceThread: alert.sourceThread,
        description: alert.description,
        priority: alert.priority,
        deliveredTo: 'workspace_management',
        acknowledged: false,
      });

      await universalNotificationEngine.sendNotification({
        workspaceId: alert.workspaceId,
        idempotencyKey: `notif-${Date.now()}`,
          type: 'helpai_proactive',
        title: `HelpAI Alert: ${alert.alertType.replace(/_/g, ' ')}`,
        message: alert.description,
        severity: alert.priority === 'critical' ? 'critical' : alert.priority === 'high' ? 'warning' : 'info',
        source: 'helpai_proactive_monitor',
      } as any);

      if (alert.priority === 'critical' || alert.priority === 'high') {
        await trinityHelpaiCommandBus.sendAlert({
          alert_idempotencyKey: `notif-${Date.now()}`,
          alert_type: 'proactive_signal',
          description: alert.description,
          severity: alert.priority === 'critical' ? 'immediate' : 'watch',
          source_thread: alert.sourceThread,
          workspace_id: alert.workspaceId,
        });
      }

      log.info(`[HelpAIProactiveMonitor] Alert fired (human escalation): ${alert.alertType} for ${alert.workspaceId}`);
    } catch (err) {
      log.error('[HelpAIProactiveMonitor] Failed to fire alert:', err);
    }
  }

  async acknowledgeAlert(alertId: string): Promise<void> {
    await db
      .update(helpaiProactiveAlerts)
      .set({ acknowledged: true, acknowledgedAt: new Date() })
      .where(eq(helpaiProactiveAlerts.id, alertId));
  }

  async getRecentAlerts(
    workspaceId: string,
    limit = 20
  ): Promise<typeof helpaiProactiveAlerts.$inferSelect[]> {
    return db
      .select()
      .from(helpaiProactiveAlerts)
      .where(eq(helpaiProactiveAlerts.workspaceId, workspaceId))
      .orderBy(desc(helpaiProactiveAlerts.createdAt))
      .limit(limit);
  }
}

export const helpAIProactiveMonitor = new HelpAIProactiveMonitor();
