import { db } from '../db';
import { universalAuditTrail } from '@shared/schema';
import { eq, and, desc, gte, lte, sql, or } from 'drizzle-orm';
import { createLogger } from '../lib/logger';
const log = createLogger('universalAuditService');


export interface AuditEntry {
  workspaceId: string;
  actorId?: string | null;
  actorType: 'user' | 'bot' | 'system' | 'cron' | 'trinity';
  actorBot?: string | null;
  actorRole?: string | null;
  actorIp?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  entityName?: string | null;
  targetType?: string;
  data?: Record<string, any>;
  changeType: 'create' | 'update' | 'delete' | 'read' | 'action';
  changes?: Record<string, { old: any; new: any }> | null;
  metadata?: Record<string, any> | null;
  sourceRoute?: string | null;
  sourcePage?: string | null;
}

export const AUDIT_ACTIONS = {
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  USER_SESSION_EXPIRED: 'user.session_expired',
  USER_PASSWORD_CHANGED: 'user.password_changed',
  USER_ROLE_CHANGED: 'user.role_changed',

  EMPLOYEE_CREATED: 'employee.created',
  EMPLOYEE_UPDATED: 'employee.updated',
  EMPLOYEE_DEACTIVATED: 'employee.deactivated',
  EMPLOYEE_REACTIVATED: 'employee.reactivated',
  EMPLOYEE_SUSPENDED: 'employee.suspended',
  EMPLOYEE_TERMINATED: 'employee.terminated',
  EMPLOYEE_REHIRED: 'employee.rehired',
  EMPLOYEE_DELETED: 'employee.deleted',
  EMPLOYEE_PAY_RATE_CHANGED: 'employee.pay_rate_changed',
  EMPLOYEE_ROLE_CHANGED: 'employee.role_changed',
  EMPLOYEE_SITE_ASSIGNED: 'employee.site_assigned',
  EMPLOYEE_SITE_UNASSIGNED: 'employee.site_unassigned',
  EMPLOYEE_TIMESHEET_LOCKED: 'employee.timesheet_locked',
  EMPLOYEE_FINAL_PAYCHECK_STAGED: 'employee.final_paycheck_staged',
  CLIENT_OFFBOARDED: 'client.offboarded',
  CLIENT_FINAL_INVOICE_GENERATED: 'client.final_invoice_generated',
  CLIENT_DATA_EXPORTED: 'client.data_exported',

  SHIFT_CREATED: 'shift.created',
  SHIFT_UPDATED: 'shift.updated',
  SHIFT_DELETED: 'shift.deleted',
  SHIFT_ASSIGNED: 'shift.assigned',
  SHIFT_UNASSIGNED: 'shift.unassigned',
  SHIFT_PUBLISHED: 'shift.published',
  SHIFT_PICKED_UP: 'shift.picked_up',
  SHIFT_SWAPPED: 'shift.swapped',
  SHIFT_CONFLICT_DETECTED: 'shift.conflict_detected',
  SHIFT_CONFLICT_RESOLVED: 'shift.conflict_resolved',

  CLOCK_IN: 'clock.in',
  CLOCK_OUT: 'clock.out',
  CLOCK_FORCE_IN: 'clock.force_in',
  CLOCK_MANUAL_EDIT: 'clock.manual_edit',
  CLOCK_APPROVED: 'clock.approved',
  CLOCK_DISPUTED: 'clock.disputed',
  CHECKIN_COMPLETED: 'checkin.completed',
  CHECKIN_MISSED: 'checkin.missed',
  CHECKIN_EXCUSED: 'checkin.excused',

  INVOICE_CREATED: 'invoice.created',
  INVOICE_AUTO_GENERATED: 'invoice.auto_generated',
  INVOICE_UPDATED: 'invoice.updated',
  INVOICE_SENT: 'invoice.sent',
  INVOICE_PAID: 'invoice.paid',
  INVOICE_VOIDED: 'invoice.voided',
  INVOICE_OVERDUE: 'invoice.overdue',
  PAYROLL_RUN_STARTED: 'payroll.run_started',
  PAYROLL_RUN_COMPLETED: 'payroll.run_completed',
  PAYROLL_APPROVED: 'payroll.approved',
  EXPENSE_SUBMITTED: 'expense.submitted',
  EXPENSE_APPROVED: 'expense.approved',
  EXPENSE_REJECTED: 'expense.rejected',
  EXPENSE_REIMBURSED: 'expense.reimbursed',

  CREDITS_CONSUMED: 'credits.consumed',
  CREDITS_REFILLED: 'credits.refilled',
  CREDITS_PURCHASED: 'credits.purchased',
  CREDITS_EXPIRED: 'credits.expired',
  PLATFORM_BILL_GENERATED: 'platform_bill.generated',
  PLATFORM_BILL_PAID: 'platform_bill.paid',

  DOCUMENT_GENERATED: 'document.generated',
  DOCUMENT_UPLOADED: 'document.uploaded',
  DOCUMENT_SIGNATURE_REQUESTED: 'document.signature_requested',
  DOCUMENT_SIGNED: 'document.signed',
  DOCUMENT_COMPLETED: 'document.completed',
  DOCUMENT_VOIDED: 'document.voided',
  DOCUMENT_VAULT_STORED: 'document.vault_stored',

  INCIDENT_SUBMITTED: 'incident.submitted',
  INCIDENT_BOT_PROCESSED: 'incident.bot_processed',
  INCIDENT_REVIEWED: 'incident.reviewed',
  INCIDENT_APPROVED: 'incident.approved',
  INCIDENT_SENT_TO_CLIENT: 'incident.sent_to_client',
  DAILY_REPORT_SUBMITTED: 'daily_report.submitted',
  DAILY_REPORT_OPENED: 'daily_report.opened',
  DAILY_REPORT_DOWNLOADED: 'daily_report.downloaded',
  DAILY_REPORT_BOT_PROCESSED: 'daily_report.bot_processed',
  PROOF_OF_SERVICE_GENERATED: 'proof_of_service.generated',
  PROOF_OF_SERVICE_APPROVED: 'proof_of_service.approved',
  PROOF_OF_SERVICE_DELIVERED: 'proof_of_service.delivered',

  MESSAGE_SENT: 'message.sent',
  MESSAGE_PHOTO_UPLOADED: 'message.photo_uploaded',
  MESSAGE_BRIDGE_INBOUND: 'message.bridge_inbound',
  MESSAGE_BRIDGE_OUTBOUND: 'message.bridge_outbound',
  BROADCAST_SENT: 'broadcast.sent',
  SHIFT_ROOM_CREATED: 'shift_room.created',
  SHIFT_ROOM_ARCHIVED: 'shift_room.archived',

  TRINITY_SCHEDULE_GENERATED: 'trinity.schedule_generated',
  TRINITY_SHIFT_FILLED: 'trinity.shift_filled',
  BOT_JOINED_ROOM: 'bot.joined_room',
  BOT_ANALYSIS_COMPLETED: 'bot.analysis_completed',
  BOT_REPORT_GENERATED: 'bot.report_generated',
  BOT_ALERT_SENT: 'bot.alert_sent',
  BOT_FORCE_ACTION: 'bot.force_action',
  BOT_ACTION_FAILED: 'bot.action_failed',
  CREDITS_INSUFFICIENT: 'credits.insufficient',

  DEAL_CREATED: 'deal.created',
  DEAL_STAGE_CHANGED: 'deal.stage_changed',
  DEAL_RFP_GENERATED: 'deal.rfp_generated',
  DEAL_PROPOSAL_SENT: 'deal.proposal_sent',
  DEAL_WON: 'deal.won',
  DEAL_LOST: 'deal.lost',

  SETTINGS_UPDATED: 'settings.updated',
  SITE_CONFIG_UPDATED: 'site_config.updated',
  RBAC_PERMISSION_CHANGED: 'rbac.permission_changed',
  INTEGRATION_CONNECTED: 'integration.connected',
  INTEGRATION_DISCONNECTED: 'integration.disconnected',
  INTEGRATION_SYNC_COMPLETED: 'integration.sync_completed',
  INTEGRATION_SYNC_FAILED: 'integration.sync_failed',

  BRIDGE_CHANNEL_CREATED: 'bridge.channel_created',
  BRIDGE_CHANNEL_UPDATED: 'bridge.channel_updated',
  BRIDGE_CHANNEL_DELETED: 'bridge.channel_deleted',
  BRIDGE_CONVERSATION_CREATED: 'bridge.conversation_created',

  APPROVAL_REQUESTED: 'approval.requested',
  APPROVAL_GRANTED: 'approval.granted',
  APPROVAL_DENIED: 'approval.denied',
  PIPELINE_STAGE_CHANGED: 'pipeline.stage_changed',

  ONBOARDING_INITIALIZED: 'onboarding.initialized',
  ONBOARDING_STEP_COMPLETED: 'onboarding.step_completed',
  ONBOARDING_COMPLETED: 'onboarding.completed',
  ONBOARDING_STALLED: 'onboarding.stalled',
  ONBOARDING_ABANDONED: 'onboarding.abandoned',
  ONBOARDING_DEADLINE_WARNING: 'onboarding.deadline_warning',
  ONBOARDING_HELP_REQUESTED: 'onboarding.help_requested',

  ONBOARDING_PIPELINE_STATUS_CHANGED: 'onboarding.pipeline_status_changed',
  ONBOARDING_TASK_COMPLETED: 'onboarding.task_completed',
  ONBOARDING_TASK_SKIPPED: 'onboarding.task_skipped',
  ONBOARDING_TASK_PROGRESS_UPDATED: 'onboarding.task_progress_updated',
  ONBOARDING_REWARD_UNLOCKED: 'onboarding.reward_unlocked',
  ONBOARDING_REWARD_APPLIED: 'onboarding.reward_applied',
  ONBOARDING_TRIAL_STARTED: 'onboarding.trial_started',
  ONBOARDING_DYNAMIC_TASKS_GENERATED: 'onboarding.dynamic_tasks_generated',

  ONBOARDING_ORCHESTRATION_STARTED: 'onboarding.orchestration_started',
  ONBOARDING_ORCHESTRATION_COMPLETED: 'onboarding.orchestration_completed',
  ONBOARDING_DATA_MIGRATION_COMPLETED: 'onboarding.data_migration_completed',
  ONBOARDING_GAMIFICATION_ACTIVATED: 'onboarding.gamification_activated',
  ONBOARDING_COMPLIANCE_DEPLOYED: 'onboarding.compliance_deployed',
  ONBOARDING_INVITATION_ACCEPTED: 'onboarding.invitation_accepted',
  ONBOARDING_TRINITY_WELCOME_SENT: 'onboarding.trinity_welcome_sent',

  ONBOARDING_COGNITIVE_API_CONNECTED: 'onboarding.cognitive_api_connected',
  ONBOARDING_COGNITIVE_DATA_EXTRACTED: 'onboarding.cognitive_data_extracted',
  ONBOARDING_COGNITIVE_FIELD_MAPPED: 'onboarding.cognitive_field_mapped',
  ONBOARDING_COGNITIVE_SYNC_COMPLETED: 'onboarding.cognitive_sync_completed',
  ONBOARDING_SYSTEM_EVENT_PROCESSED: 'onboarding.system_event_processed',
} as const;

export type AuditAction = typeof AUDIT_ACTIONS[keyof typeof AUDIT_ACTIONS];

class UniversalAuditService {
  async log(entry: AuditEntry): Promise<void> {
    try {
      await db.insert(universalAuditTrail).values({
        workspaceId: entry.workspaceId,
        actorId: entry.actorId || null,
        actorType: entry.actorType,
        actorBot: entry.actorBot || null,
        actorRole: entry.actorRole || null,
        actorIp: entry.actorIp || null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId || null,
        entityName: entry.entityName || null,
        changeType: entry.changeType,
        changes: entry.changes || null,
        metadata: entry.metadata || {},
        sourceRoute: entry.sourceRoute || null,
        sourcePage: entry.sourcePage || null,
      });
    } catch (error) {
      log.error('[UniversalAudit] Failed to log entry:', {
        action: entry.action,
        entityType: entry.entityType,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async logBatch(entries: AuditEntry[]): Promise<void> {
    if (entries.length === 0) return;
    try {
      await db.insert(universalAuditTrail).values(
        entries.map(entry => ({
          workspaceId: entry.workspaceId,
          actorId: entry.actorId || null,
          actorType: entry.actorType,
          actorBot: entry.actorBot || null,
          actorRole: entry.actorRole || null,
          actorIp: entry.actorIp || null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId || null,
          entityName: entry.entityName || null,
          changeType: entry.changeType,
          changes: entry.changes || null,
          metadata: entry.metadata || {},
          sourceRoute: entry.sourceRoute || null,
          sourcePage: entry.sourcePage || null,
        }))
      );
    } catch (error) {
      log.error('[UniversalAudit] Failed to log batch:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async getEntityHistory(entityType: string, entityId: string, workspaceId?: string, limit = 50) {
    const conditions = [
      eq(universalAuditTrail.entityType, entityType),
      eq(universalAuditTrail.entityId, entityId),
    ];
    if (workspaceId) {
      conditions.push(eq(universalAuditTrail.workspaceId, workspaceId));
    }
    return db.select().from(universalAuditTrail)
      .where(and(...conditions))
      .orderBy(desc(universalAuditTrail.createdAt))
      .limit(limit);
  }

  async getUserHistory(userId: string, workspaceId?: string, limit = 50) {
    const conditions = [eq(universalAuditTrail.actorId, userId)];
    if (workspaceId) {
      conditions.push(eq(universalAuditTrail.workspaceId, workspaceId));
    }
    return db.select().from(universalAuditTrail)
      .where(and(...conditions))
      .orderBy(desc(universalAuditTrail.createdAt))
      .limit(limit);
  }

  async getBotHistory(botName: string, workspaceId: string, limit = 50) {
    return db.select().from(universalAuditTrail)
      .where(and(
        eq(universalAuditTrail.actorBot, botName),
        eq(universalAuditTrail.workspaceId, workspaceId),
      ))
      .orderBy(desc(universalAuditTrail.createdAt))
      .limit(limit);
  }

  async getWorkspaceHistory(workspaceId: string, options?: {
    limit?: number;
    offset?: number;
    actionPrefix?: string;
    actorType?: string;
    entityType?: string;
    entityId?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const conditions = [eq(universalAuditTrail.workspaceId, workspaceId)];

    if (options?.actorType) {
      conditions.push(eq(universalAuditTrail.actorType, options.actorType));
    }
    if (options?.entityType) {
      conditions.push(eq(universalAuditTrail.entityType, options.entityType));
    }
    if (options?.entityId) {
      conditions.push(eq(universalAuditTrail.entityId, options.entityId));
    }
    if (options?.startDate) {
      conditions.push(gte(universalAuditTrail.createdAt, options.startDate));
    }
    if (options?.endDate) {
      conditions.push(lte(universalAuditTrail.createdAt, options.endDate));
    }
    if (options?.actionPrefix) {
      conditions.push(sql`${universalAuditTrail.action} LIKE ${options.actionPrefix + '%'}`);
    }

    const clampedLimit = Math.min(Math.max(options?.limit || 100, 1), 500);
    const clampedOffset = Math.max(options?.offset || 0, 0);

    return db.select().from(universalAuditTrail)
      .where(and(...conditions))
      .orderBy(desc(universalAuditTrail.createdAt))
      .limit(clampedLimit)
      .offset(clampedOffset);
  }

  async getWorkspaceSummary(workspaceId: string) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [totalCount] = await db.select({ count: sql<number>`count(*)` })
      .from(universalAuditTrail)
      .where(eq(universalAuditTrail.workspaceId, workspaceId));

    const [todayCount] = await db.select({ count: sql<number>`count(*)` })
      .from(universalAuditTrail)
      .where(and(
        eq(universalAuditTrail.workspaceId, workspaceId),
        gte(universalAuditTrail.createdAt, today),
      ));

    const [weekCount] = await db.select({ count: sql<number>`count(*)` })
      .from(universalAuditTrail)
      .where(and(
        eq(universalAuditTrail.workspaceId, workspaceId),
        gte(universalAuditTrail.createdAt, weekAgo),
      ));

    const actorBreakdown = await db.select({
      actorType: universalAuditTrail.actorType,
      count: sql<number>`count(*)`,
    })
      .from(universalAuditTrail)
      .where(and(
        eq(universalAuditTrail.workspaceId, workspaceId),
        gte(universalAuditTrail.createdAt, weekAgo),
      ))
      .groupBy(universalAuditTrail.actorType);

    const topActions = await db.select({
      action: universalAuditTrail.action,
      count: sql<number>`count(*)`,
    })
      .from(universalAuditTrail)
      .where(and(
        eq(universalAuditTrail.workspaceId, workspaceId),
        gte(universalAuditTrail.createdAt, weekAgo),
      ))
      .groupBy(universalAuditTrail.action)
      .orderBy(sql`count(*) DESC`)
      .limit(10);

    return {
      totalEntries: Number(totalCount?.count || 0),
      todayEntries: Number(todayCount?.count || 0),
      weekEntries: Number(weekCount?.count || 0),
      actorBreakdown: actorBreakdown.map(r => ({ type: r.actorType, count: Number(r.count) })),
      topActions: topActions.map(r => ({ action: r.action, count: Number(r.count) })),
    };
  }

  static diffChanges(
    oldRecord: Record<string, any>,
    newRecord: Record<string, any>
  ): Record<string, { old: any; new: any }> | null {
    const changes: Record<string, { old: any; new: any }> = {};
    const ignoreFields = ['updated_at', 'updated_by', 'updated_by_type'];

    for (const key of Object.keys(newRecord)) {
      if (ignoreFields.includes(key)) continue;
      if (JSON.stringify(oldRecord[key]) !== JSON.stringify(newRecord[key])) {
        changes[key] = { old: oldRecord[key], new: newRecord[key] };
      }
    }

    return Object.keys(changes).length > 0 ? changes : null;
  }
}

export const universalAudit = new UniversalAuditService();
