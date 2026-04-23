/**
 * Universal Notification Engine
 * RBAC-aware, dynamic notification system for all workspace events
 * Sends notifications through multiple channels with role-based filtering
 * Now uses database persistence instead of in-memory storage
 * LIVE UPDATES: Broadcasts via WebSocket for real-time delivery
 * 
 * TRINITY AI ENRICHMENT: All notifications are enriched by Trinity AI to provide
 * contextual, meaningful content instead of generic templates. Every notification
 * gets a structured breakdown: Problem → Issue → Solution → Outcome
 */

import { db } from '../db';
import { notifications, users, employees, platformUpdates, platformRoles, workspaces, userNotificationPreferences } from '@shared/schema';
import { eq, and, desc, inArray, isNull, or, gte, sql } from 'drizzle-orm';
import { isNewWorkspace } from './notificationService';
import aiBrainConfig from "@shared/config/aiBrainGuardrails";
import { broadcastToWorkspace, broadcastNotificationToUser, broadcastPlatformUpdateGlobal } from '../websocket';
import { enrichNotificationWithAI } from './aiNotificationService';
import { eventBus } from './trinity/eventBus';
import { featureRegistryService } from './featureRegistryService';
import { sanitizeForEndUser } from '@shared/utils/humanFriendlyCopy';
import { createLogger } from '../lib/logger';
import { PLATFORM_WORKSPACE_ID } from './billing/billingConstants';
const log = createLogger('universalNotificationEngine');


async function deliverPushNotification(userId: string, title: string, body: string, options?: {
  type?: string;
  url?: string;
  tag?: string;
  severity?: string;
  workspaceId?: string;
}) {
  try {
    const { NotificationDeliveryService } = await import('./notificationDeliveryService');
    await NotificationDeliveryService.send({
      type: (options?.type as any) || 'system_alert',
      workspaceId: options?.workspaceId || 'system',
      recipientUserId: userId,
      channel: 'push',
      subject: title,
      body: {
        title,
        body,
        type: options?.type,
        url: options?.url,
        tag: options?.tag,
        severity: options?.severity,
      }
    });
  } catch (err) {
    // Push delivery is best-effort, never block notification flow
  }
}

/**
 * NOTIFICATION ROLE ROUTING MAP
 * ==============================
 * Defines which workspace roles receive each notification type when no
 * explicit `targetRoles` or `userId` is provided in the payload.
 *
 * Routing tiers:
 *   EXECUTIVE  — org_owner, co_owner only
 *   MANAGEMENT — managers + owners
 *   OPERATIONS — supervisors + managers + owners
 *   PERSONAL   — empty array (must be sent via userId)
 *   BROADCAST  — omit from map (all employees receive it)
 *
 * This prevents field-ops alerts from flooding owners and ensures
 * executive-level issues never get lost in staff notification feeds.
 */
export const NOTIFICATION_ROLE_ROUTING: Readonly<Record<string, string[]>> = {
  // ── EXECUTIVE (owners only) ───────────────────────────────────────────────
  critical_alert:                   ['org_owner', 'co_owner'],
  staffing_critical_escalation:     ['org_owner', 'co_owner'],
  payment_overdue:                  ['org_owner', 'co_owner'],

  // ── MANAGEMENT (managers + owners) ───────────────────────────────────────
  invoice_generated:                ['org_owner', 'co_owner', 'manager'],
  invoice_auto_sent:                ['org_owner', 'co_owner', 'manager'],
  invoice_paid:                     ['org_owner', 'co_owner', 'manager'],
  invoice_overdue:                  ['org_owner', 'co_owner', 'manager'],
  payment_received:                 ['org_owner', 'co_owner', 'manager'],
  payroll_processed:                ['org_owner', 'co_owner', 'manager'],
  payroll_pending:                  ['org_owner', 'co_owner', 'manager'],
  payroll_approved:                 ['org_owner', 'co_owner', 'manager'],
  payroll_initiated:                ['org_owner', 'co_owner', 'manager'],
  payroll_transfer_settled:         ['org_owner', 'co_owner', 'manager'],
  payroll_transfer_failed:          ['org_owner', 'co_owner', 'manager'],
  staffing_escalation:              ['org_owner', 'co_owner', 'manager'],
  approval_required:                ['org_owner', 'co_owner', 'manager'],
  ai_approval_needed:               ['org_owner', 'co_owner', 'manager'],
  ai_action_completed:              ['org_owner', 'co_owner', 'manager'],
  ai_schedule_ready:                ['org_owner', 'co_owner', 'manager'],
  dispute_filed:                    ['org_owner', 'co_owner', 'manager'],
  trinity_autonomous_alert:         ['org_owner', 'co_owner', 'manager'],
  scheduler_job_failed:             ['org_owner', 'co_owner', 'manager'],
  helpai_proactive:                 ['org_owner', 'co_owner', 'manager'],

  // ── OPERATIONS (supervisors + managers + owners) ─────────────────────────
  coverage_offer:                   ['org_owner', 'co_owner', 'manager', 'supervisor'],
  coverage_requested:               ['org_owner', 'co_owner', 'manager', 'supervisor'],
  coverage_filled:                  ['org_owner', 'co_owner', 'manager', 'supervisor'],
  coverage_expired:                 ['org_owner', 'co_owner', 'manager', 'supervisor'],
  shift_offer:                      ['org_owner', 'co_owner', 'manager', 'supervisor'],
  compliance_alert:                 ['org_owner', 'co_owner', 'manager', 'supervisor'],
  compliance_violation:             ['org_owner', 'co_owner', 'manager', 'supervisor'],
  schedule_published:               ['org_owner', 'co_owner', 'manager', 'supervisor'],
  clock_in_reminder:                ['manager', 'supervisor'],
  calloff_alert:                    ['org_owner', 'co_owner', 'manager', 'supervisor'],
  deadline_approaching:             ['org_owner', 'co_owner', 'manager', 'supervisor'],
  action_required:                  ['org_owner', 'co_owner', 'manager', 'supervisor'],
  issue_detected:                   ['org_owner', 'co_owner', 'manager', 'supervisor'],

  // ── CREDIT / BILLING (executive) ─────────────────────────────────────────
  credit_warning:                   ['org_owner', 'co_owner'],
  // GAP-50 FIX: billing_alert was missing from routing — overage notifications were
  // silently normalized to 'system' type instead of reaching org owners as 'billing_alert'.
  // Org owners would see a generic system notification instead of the overage alert,
  // losing the actionUrl, metadata, and type-based filtering in the notification feed.
  billing_alert:                    ['org_owner', 'co_owner'],

  // ── PERSONAL (must use userId — role routing not applicable) ─────────────
  // These are intentionally empty; callers MUST pass userId directly.
  shift_assigned:                   [],
  shift_changed:                    [],
  shift_cancelled:                  [],
  shift_unassigned:                 [],
  pto_approved:                     [],
  pto_denied:                       [],
  timesheet_approved:               [],
  timesheet_rejected:               [],
  pay_stub_available:               [],
  document_expiring:                [],
  document_uploaded:                [],
  document_signature_request:       [],
  document_signed:                  [],
  document_fully_executed:          [],
  document_signature_reminder:      [],
  shift_reminder:                   [],
  officer_deactivated:              [],
  profile_updated:                  [],
  form_assigned:                    [],

  // ── EXECUTIVE WELCOME ─────────────────────────────────────────────────────
  welcome_org:                      ['org_owner', 'co_owner'],

  // Absent from map = broadcast to all (platform_maintenance, platform_update,
  // feature_release, service_down, service_restored, welcome_employee, etc.)
};

export interface NotificationPayload {
  workspaceId: string;
  type: string;
  priority?: "low" | "medium" | "high" | "urgent";
  title: string;
  message: string;
  metadata?: Record<string, any>;
  severity?: "info" | "warning" | "error" | "critical";
  userId?: string;
  targetRoles?: string[];
  actionUrl?: string;
  recipientUserId?: string;
  recipientRole?: string;
  targetUserIds?: string[];
  source?: string;
  skipFeatureCheck?: boolean;
  pushTag?: string;
}

export class UniversalNotificationEngine {
  private recentNotifications = new Map<string, number>();
  private readonly DEDUP_WINDOW_MS = 10 * 60 * 1000;

  private isDuplicate(payload: NotificationPayload): boolean {
    const shiftId = payload.metadata?.shiftId || '';
    const source = payload.metadata?.source || '';
    const key = `${payload.workspaceId}:${payload.type}:${payload.title}:${shiftId}:${source}:${payload.userId || ''}`;
    const now = Date.now();
    const lastSent = this.recentNotifications.get(key);
    if (lastSent && now - lastSent < this.DEDUP_WINDOW_MS) {
      return true;
    }
    this.recentNotifications.set(key, now);
    if (this.recentNotifications.size > 500) {
      const cutoff = now - this.DEDUP_WINDOW_MS;
      for (const [k, ts] of this.recentNotifications) {
        if (ts < cutoff) this.recentNotifications.delete(k);
      }
    }
    return false;
  }

  /**
   * Send notification with RBAC filtering
   * Persists to database for all notifications
   * Now enriched by Trinity AI for contextual, meaningful content
   */
  async sendNotification(payload: NotificationPayload): Promise<{
    success: boolean;
    recipientCount: number;
    channels: string[];
    notificationIds: string[];
  }> {
    try {
      if (this.isDuplicate(payload)) {
        return { success: true, recipientCount: 0, channels: [], notificationIds: [] };
      }

      // Normalize notification type — prevents DB enum constraint violations on direct inserts.
      // Unknown types fall back to 'system'. Set mirrors the DB notification_type enum.
      if (payload.type) {
        const KNOWN_NOTIFICATION_TYPES = new Set([
          'shift_assigned','shift_changed','shift_cancelled','shift_unassigned','shift_reminder',
          'shift_offer','pto_approved','pto_denied','timesheet_approved','timesheet_rejected',
          'pay_stub_available','document_uploaded','document_expiring','document_signature_request',
          'document_signed','document_fully_executed','document_signature_reminder','profile_updated',
          'form_assigned','officer_deactivated','clock_in_reminder','mention',
          'schedule_change','schedule_notification','coverage_offer','coverage_requested',
          'coverage_filled','coverage_expired','ai_schedule_ready',
          'payroll_processed','payroll_pending','payroll_payment_method',
          'invoice_generated','invoice_paid','invoice_overdue','invoice_auto_sent',
          'payment_received','payment_overdue','timesheet_submission_reminder',
          'credit_warning','billing_alert','compliance_alert','deadline_approaching','dispute_filed',
          'staffing_escalation','staffing_critical_escalation','critical_alert',
          'issue_detected','action_required','approval_required',
          'ai_approval_needed','ai_action_completed','trinity_autonomous_alert','trinity_welcome',
          'scheduler_job_failed','platform_maintenance','known_issue','service_down',
          'service_restored','platform_update','feature_release',
          'system','welcome_org','welcome_employee','support_escalation','bundled_notification',
          'error','compliance',
          'invoice_draft_ready','invoice_draft_reminder','invoice_refunded',
          'subscription_upgraded','subscription_downgraded','subscription_cancelled',
          'subscription_payment_failed','subscription_activated',
          'payroll_draft_ready','payroll_readiness_alert','payroll_tracking_error','payroll_auto_close','payroll_disbursed',
          'form_1099_filing_required','compliance_action_required','license_expiring','certification_expiring',
          'timesheet_approval_reminder','timesheet_resubmission_required',
          'trinity_financial_briefing','milestone_alert',
          'internal_email_received','shift_confirmation_required','shift_confirmed','dar_required',
          'shift_escalation_warning_72h','shift_escalation_urgent_24h','shift_escalation_critical_4h',
          // Shift confirmation flow
          'shift_confirmation','shift_declined_alert','unconfirmed_shifts_alert',
          // System / platform
          'system_update','system_alert',
          // Schedule lifecycle
          'schedule_published','calloff_alert',
          // Payroll transfer tracking
          'payroll_approved','payroll_initiated','payroll_transfer_settled','payroll_transfer_failed',
          'payroll_alert','plaid_transfer_updated',
          // Timesheet alias
          'timesheets_approved',
          // Billing / subscription extended
          'billing_alert','subscription_updated','stripe_payment_received','invoices_updated','payment_refunded',
          // Trial / reactivation lifecycle
          'trial_converted','trial_expiry_warning','trial_grace_period',
          'workspace_downgraded','workspace_suspended','workspace_reactivated','reactivation_failed',
          // Compliance / policy
          'compliance_violation','compliance_hold','employee_terminated',
          // Safety
          'panic_alert',
          // Task / delegation
          'task_delegation','task_escalation',
          // Operational
          'sla_breach','drug_test','settings_change_impact',
          // Attendance / clocking
          'missed_clock_in','missed_clock_in_alert',
          // Reporting / summaries
          'monthly_summary','alert',
          // Communications
          'scheduled_email',
          // Contracts / compliance
          'contract_executed','regulatory_violation',
          // HelpAI proactive operational monitoring
          'helpai_proactive',
          'trinity_compliance',
          'ai_brain_email',
          'geo_fence_violation',
          'inbound_email_unmatched',
          'trinity_autonomous_action',
        ]);
        if (!KNOWN_NOTIFICATION_TYPES.has(payload.type)) {
          log.warn(`[UNE] Unknown notification type '${payload.type}' → normalizing to 'system'`);
          payload = { ...payload, type: 'system' };
        }
      }

      const notificationRule = aiBrainConfig.notificationRules.find(
        (r) => r.triggerType === payload.type
      );

      if (notificationRule && !notificationRule.enabled) {
        log.info(`[UniversalNotificationEngine] Notification type "${payload.type}" is explicitly disabled`);
        return { success: false, recipientCount: 0, channels: [], notificationIds: [] };
      }
      // If no DB rule found, fail-open to in-app delivery by design.
      // Any truly unknown types were already normalized to 'system' above, so no log needed here.

      const isWelcomeBundle = payload.metadata?.isWelcomeBundle === true;
      const isCriticalAlert = payload.priority === 'urgent' || payload.priority === 'high' ||
        payload.metadata?.severity === 'critical' || payload.metadata?.severity === 'high' ||
        payload.metadata?.bypassGracePeriod === true ||
        payload.type === 'billing_failure' || payload.type === 'security_alert' ||
        payload.type === 'panic_alert' || payload.type === 'system_error';
      if (!isWelcomeBundle && !isCriticalAlert && payload.workspaceId) {
        try {
          const newWorkspace = await isNewWorkspace(payload.workspaceId);
          if (newWorkspace) {
            log.info(`[UniversalNotificationEngine] Grace period active for new workspace ${payload.workspaceId} — suppressing automated notification: "${payload.title}"`);
            return { success: false, recipientCount: 0, channels: [], notificationIds: [] };
          }
        } catch {
        }
      }

      // TRINITY FEATURE VALIDATION: Pre-validate content before enrichment
      // Scoped ONLY to AI-generated/platform-announcement content (not operational/business events)
      // Operational notification types always bypass this gate — they are deterministic, not AI-drafted
      const OPERATIONAL_TYPES = new Set([
        'shift_assigned', 'shift_changed', 'shift_cancelled', 'shift_unassigned', 'shift_reminder',
        'shift_offer', 'coverage_offer', 'coverage_requested', 'coverage_filled', 'coverage_expired',
        'pto_approved', 'pto_denied', 'timesheet_approved', 'timesheet_rejected', 'pay_stub_available',
        'payroll_processed', 'payroll_pending', 'payroll_initiated',
        'invoice_generated', 'invoice_paid', 'invoice_overdue', 'payment_received', 'payment_overdue',
        'credit_warning', 'billing_failure', 'security_alert', 'panic_alert', 'system_error',
        'compliance_alert', 'compliance_violation', 'critical_alert', 'staffing_critical_escalation',
        'staffing_escalation', 'calloff_alert', 'deadline_approaching', 'action_required',
        'approval_required', 'ai_approval_needed', 'ai_action_completed', 'ai_schedule_ready',
        'dispute_filed', 'trinity_autonomous_alert', 'scheduler_job_failed',
        'document_expiring', 'document_uploaded', 'document_signature_request', 'document_signed',
        'document_fully_executed', 'document_signature_reminder', 'officer_deactivated',
        'profile_updated', 'form_assigned', 'clock_in_reminder', 'welcome_org', 'welcome_employee',
        'schedule_published', 'schedule_change', 'schedule_notification',
        // Field-operations events: shift monitoring, coverage, and watchdog alerts
        'issue_detected', 'coverage_gap_detected', 'geofence_violation', 'late_clock_in',
        'no_call_no_show', 'replacement_needed', 'replacement_found', 'replacement_failed',
        'gps_violation', 'attendance_alert', 'incident_alert', 'certification_expiring',
        'training_alert', 'shift_alert', 'watchdog_alert', 'platform_pool_alert',
        // HelpAI proactive monitor — deterministic operational alerts, not AI-drafted content
        'helpai_proactive',
          'trinity_compliance',
          'ai_brain_email',
          'geo_fence_violation',
          'inbound_email_unmatched',
          'trinity_autonomous_action',
      ]);
      const isOperationalType = OPERATIONAL_TYPES.has(payload.type);
      const skipFeatureCheck = payload.metadata?.skipFeatureCheck === true || isOperationalType;
      const blockCheck = featureRegistryService.shouldBlockNotification(payload.title, payload.message);
      if (blockCheck.block && !skipFeatureCheck) {
        log.info(`[UniversalNotificationEngine] BLOCKED - Validation failed: ${blockCheck.reason} | Type: ${payload.type} | Title: "${payload.title}" | Workspace: ${payload.workspaceId || 'none'}`);
        return { success: false, recipientCount: 0, channels: [], notificationIds: [] };
      }
      // Audit bypass — log whenever skipFeatureCheck overrides a block (production safety trail)
      if (blockCheck.block && skipFeatureCheck && !isOperationalType) {
        log.warn(`[UniversalNotificationEngine] BYPASS AUDIT — skipFeatureCheck overrode validation block | Reason: ${blockCheck.reason} | Title: "${payload.title}" | Workspace: ${payload.workspaceId || 'none'} | Type: ${payload.type} | Caller: ${payload.metadata?.callerService || 'unknown'}`);
      }

      // Pre-enrich with feature context for Trinity AI
      const preValidation = featureRegistryService.validateNotificationContent(
        payload.title,
        payload.message,
        payload.metadata
      );
      
      // Log validation warnings ONLY for non-operational AI-drafted content
      // Operational types (shift alerts, coverage, payroll, etc.) are deterministic
      // messages that intentionally skip the AI structure guidelines
      if (!skipFeatureCheck && preValidation.issues.length > 0) {
        const warnings = preValidation.issues.filter(i => i.severity === 'warning');
        if (warnings.length > 0) {
          log.info(`[UniversalNotificationEngine] Validation warnings:`, 
            warnings.map(w => `${w.type}: ${w.message}`).join('; '));
        }
      }

      // Fetch workspace name once for personalization context
      let workspaceName: string | undefined;
      if (payload.workspaceId) {
        try {
          const [ws] = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, payload.workspaceId)).limit(1);
          workspaceName = ws?.name || undefined;
        } catch { /* non-fatal */ }
      }

      const notificationIds: string[] = [];
      let recipientCount = 0;

      // AUTO-ROUTE: If no userId and no targetRoles, use NOTIFICATION_ROLE_ROUTING to
      // automatically target the right role tier. This prevents field-ops alerts from
      // going to owners and executive alerts from drowning in staff notification feeds.
      if (!payload.userId && (!payload.targetRoles || payload.targetRoles.length === 0)) {
        const autoRoles = NOTIFICATION_ROLE_ROUTING[payload.type];
        if (autoRoles !== undefined) {
          if (autoRoles.length > 0) {
            payload = { ...payload, targetRoles: autoRoles };
          } else {
            log.info(`[UniversalNotificationEngine] Skipping personal notification type="${payload.type}" — no userId provided`);
            return { success: false, recipientCount: 0, channels: [], notificationIds: [] };
          }
        }
      }

      // ── HELPER: build per-user enriched content ─────────────────────────────
      // For individual (userId) sends: enrich WITH the user's name + role (fully personalized).
      // For RBAC/broadcast sends: enrich ONCE with role context, then prepend "Hi [Name],"
      // per recipient — no extra AI call per user.
      const buildEnrichedMetadataBase = (enriched: Awaited<ReturnType<typeof enrichNotificationWithAI>>) => ({
        ...enriched.metadata,
        severity: payload.severity || 'info',
        featureReferences: preValidation.enrichedContent?.featureReferences || [],
        featureContext: preValidation.enrichedContent?.metadata?.featureContext || {},
        validatedAt: preValidation.enrichedContent?.metadata?.validatedAt,
      });

      // If specific userId provided, send to that user only — FULLY personalized
      if (payload.userId) {
        // Fetch the recipient's name and role for genuine personalization
        let recipientFirstName: string | undefined;
        let recipientRole: string | undefined;
        try {
          const [emp] = await db.select({ firstName: employees.firstName, workspaceRole: employees.workspaceRole })
            .from(employees)
            .where(and(eq(employees.userId, payload.userId), eq(employees.workspaceId, payload.workspaceId)))
            .limit(1);
          recipientFirstName = emp?.firstName || undefined;
          recipientRole = (emp?.workspaceRole as string) || undefined;
        } catch { /* non-fatal — enrichment works without it */ }

        // Operational types bypass AI enrichment — they are deterministic field-ops alerts
        // that don't benefit from AI rewriting and would waste credits on every shift alert
        const enriched = isOperationalType
          ? { title: payload.title, message: payload.message, metadata: payload.metadata || {} }
          : await enrichNotificationWithAI({
              title: payload.title,
              message: payload.message,
              type: payload.type,
              workspaceId: payload.workspaceId,
              metadata: payload.metadata,
              recipientFirstName,
              recipientRole,
              workspaceName,
            });

        const enrichedTitle = sanitizeForEndUser(enriched.title);
        const enrichedMessage = sanitizeForEndUser(enriched.message);
        const enrichedMetadata = buildEnrichedMetadataBase(enriched);

        const [notification] = await db
          .insert(notifications)
          .values({
            workspaceId: payload.workspaceId,
            userId: payload.userId,
            type: payload.type as any,
            title: enrichedTitle,
            message: enrichedMessage,
            actionUrl: payload.actionUrl,
            metadata: enrichedMetadata,
            isRead: false,
          })
          .returning();
        
        notificationIds.push(notification.id);
        recipientCount = 1;
        
        // Emit event for cross-device sync
        eventBus.emit('notification_created', {
          id: notification.id,
          workspaceId: payload.workspaceId,
          userId: payload.userId,
          type: payload.type,
          title: enrichedTitle,
          timestamp: new Date().toISOString(),
        });
        
        // LIVE UPDATE: Broadcast via WebSocket with enriched content AND metadata
        broadcastNotificationToUser(payload.workspaceId, payload.userId, {
          id: notification.id,
          type: payload.type,
          title: enrichedTitle,
          message: enrichedMessage,
          severity: payload.severity || 'info',
          actionUrl: payload.actionUrl,
          createdAt: notification.createdAt,
          metadata: enrichedMetadata,
        });
        
        // PUSH NOTIFICATION: Deliver to subscribed devices (non-blocking)
        deliverPushNotification(payload.userId, enrichedTitle, enrichedMessage, {
          type: payload.type,
          url: payload.actionUrl,
          severity: payload.severity,
          tag: payload.pushTag || `notif-${notification.id}`,
        });
      } else if (payload.targetRoles && payload.targetRoles.length > 0) {
        // RBAC: Send to all users with specified roles in workspace
        // Enrich ONCE using the primary target role as audience context.
        // No AI call per user — we prepend "Hi [Name]," per recipient at insert time.
        const primaryRole = payload.targetRoles[0];
        // Operational types skip AI enrichment — deterministic field-ops alerts use original content
        const rbacEnriched = isOperationalType
          ? { title: payload.title, message: payload.message, metadata: payload.metadata || {} }
          : await enrichNotificationWithAI({
              title: payload.title,
              message: payload.message,
              type: payload.type,
              workspaceId: payload.workspaceId,
              metadata: payload.metadata,
              recipientRole: primaryRole,
              workspaceName,
            });
        const rbacTitle = sanitizeForEndUser(rbacEnriched.title);
        const rbacBaseMessage = sanitizeForEndUser(rbacEnriched.message);
        const rbacMetadata = buildEnrichedMetadataBase(rbacEnriched);

        const workspaceEmployees = await db.query.employees.findMany({
          where: and(
            eq(employees.workspaceId, payload.workspaceId),
            eq(employees.isActive, true)
          ),
          columns: { userId: true, workspaceRole: true, firstName: true },
        });

        const filteredEmployees = workspaceEmployees.filter(
          emp => payload.targetRoles!.includes(emp.workspaceRole as string)
        );

        for (const emp of filteredEmployees) {
          if (emp.userId) {
            // Personalize message with first name greeting if the AI message doesn't already greet them
            const hasNameGreeting = emp.firstName && rbacBaseMessage.toLowerCase().includes(emp.firstName.toLowerCase());
            const personalMessage = emp.firstName && !hasNameGreeting
              ? `Hi ${emp.firstName} — ${rbacBaseMessage}`
              : rbacBaseMessage;

            const [notification] = await db
              .insert(notifications)
              .values({
                workspaceId: payload.workspaceId,
                userId: emp.userId,
                type: payload.type as any,
                title: rbacTitle,
                message: personalMessage,
                actionUrl: payload.actionUrl,
                metadata: rbacMetadata,
                isRead: false,
              })
              .returning();

            notificationIds.push(notification.id);
            recipientCount++;

            eventBus.emit('notification_created', {
              id: notification.id,
              workspaceId: payload.workspaceId,
              userId: emp.userId,
              type: payload.type,
              title: rbacTitle,
              timestamp: new Date().toISOString(),
            });

            broadcastNotificationToUser(payload.workspaceId, emp.userId, {
              id: notification.id,
              type: payload.type,
              title: rbacTitle,
              message: personalMessage,
              severity: payload.severity || 'info',
              actionUrl: payload.actionUrl,
              createdAt: notification.createdAt,
              metadata: rbacMetadata,
            });

            deliverPushNotification(emp.userId, rbacTitle, personalMessage, {
              type: payload.type,
              url: payload.actionUrl,
              severity: payload.severity,
              tag: `notif-${notification.id}`,
            });
          }
        }
      } else {
        // Broadcast to all active employees in workspace — enrich once with workspace context
        // Operational types skip AI enrichment — deterministic field-ops alerts use original content
        const broadcastEnriched = isOperationalType
          ? { title: payload.title, message: payload.message, metadata: payload.metadata || {} }
          : await enrichNotificationWithAI({
              title: payload.title,
              message: payload.message,
              type: payload.type,
              workspaceId: payload.workspaceId,
              metadata: payload.metadata,
              workspaceName,
            });
        const broadcastTitle = sanitizeForEndUser(broadcastEnriched.title);
        const broadcastBaseMessage = sanitizeForEndUser(broadcastEnriched.message);
        const broadcastMetadata = buildEnrichedMetadataBase(broadcastEnriched);

        const workspaceEmployees = await db.query.employees.findMany({
          where: and(
            eq(employees.workspaceId, payload.workspaceId),
            eq(employees.isActive, true)
          ),
          columns: { userId: true, firstName: true },
        });

        for (const emp of workspaceEmployees) {
          if (emp.userId) {
            const hasNameGreeting = emp.firstName && broadcastBaseMessage.toLowerCase().includes(emp.firstName.toLowerCase());
            const personalMessage = emp.firstName && !hasNameGreeting
              ? `Hi ${emp.firstName} — ${broadcastBaseMessage}`
              : broadcastBaseMessage;

            const [notification] = await db
              .insert(notifications)
              .values({
                workspaceId: payload.workspaceId,
                userId: emp.userId,
                type: payload.type as any,
                title: broadcastTitle,
                message: personalMessage,
                actionUrl: payload.actionUrl,
                metadata: broadcastMetadata,
                isRead: false,
              })
              .returning();

            notificationIds.push(notification.id);
            recipientCount++;

            eventBus.emit('notification_created', {
              id: notification.id,
              workspaceId: payload.workspaceId,
              userId: emp.userId,
              type: payload.type,
              title: broadcastTitle,
              timestamp: new Date().toISOString(),
            });

            broadcastNotificationToUser(payload.workspaceId, emp.userId, {
              id: notification.id,
              type: payload.type,
              title: broadcastTitle,
              message: personalMessage,
              severity: payload.severity || 'info',
              actionUrl: payload.actionUrl,
              createdAt: notification.createdAt,
              metadata: broadcastMetadata,
            });

            deliverPushNotification(emp.userId, broadcastTitle, personalMessage, {
              type: payload.type,
              url: payload.actionUrl,
              severity: payload.severity,
              tag: `notif-${notification.id}`,
            });
          }
        }
      }

      // Also broadcast workspace-wide notification event for UI refresh
      broadcastToWorkspace(payload.workspaceId, {
        type: 'notification_count_updated',
        action: 'new_notifications',
        count: recipientCount,
        title: payload.title,
        timestamp: new Date().toISOString(),
      });

      const deliveredChannels = notificationRule?.channels ?? ['in-app'];
      log.info(`[UniversalNotificationEngine] Notification sent: ${payload.title} to ${recipientCount} recipients (${deliveredChannels.join(", ")}) + WebSocket broadcast`);

      return {
        success: true,
        recipientCount,
        channels: deliveredChannels,
        notificationIds,
      };
    } catch (error: any) {
      log.error("[UniversalNotificationEngine] Error:", error);
      return { success: false, recipientCount: 0, channels: [], notificationIds: [] };
    }
  }

  /**
   * Send platform-wide notification to all admins across all workspaces
   * Now enriched by Trinity AI for contextual, meaningful content
   */
  async sendPlatformNotification(payload: {
    type: string;
    title: string;
    message: string;
    metadata?: Record<string, any>;
    severity?: "info" | "warning" | "error" | "critical";
    actionUrl?: string;
    targetRoles?: string[];
  }): Promise<{
    success: boolean;
    recipientCount: number;
  }> {
    try {
      const targetRoles = payload.targetRoles || ['org_owner', 'co_owner'];
      
      // TRINITY AI ENRICHMENT: Generate contextual content for platform notifications
      const enriched = await enrichNotificationWithAI({
        title: payload.title,
        message: payload.message,
        type: payload.type,
        metadata: payload.metadata,
      });
      
      const enrichedTitle = enriched.title;
      const enrichedMessage = enriched.message;
      const enrichedMetadata = {
        ...enriched.metadata,
        severity: payload.severity || 'info',
        platformNotification: true,
      };
      
      // Get all active admins across all workspaces
      const allEmployees = await db.query.employees.findMany({
        where: eq(employees.isActive, true),
        columns: { userId: true, workspaceId: true, workspaceRole: true },
      });
      
      // Filter by target roles
      const admins = allEmployees.filter(
        emp => targetRoles.includes(emp.workspaceRole as string)
      );

      let recipientCount = 0;
      const workspacesNotified = new Set<string>();
      
      for (const admin of admins) {
        if (admin.userId && admin.workspaceId) {
          const [notification] = await db.insert(notifications).values({
            workspaceId: admin.workspaceId,
            userId: admin.userId,
            type: 'system' as any,
            title: enrichedTitle,
            message: enrichedMessage,
            actionUrl: payload.actionUrl || '/updates',
            metadata: enrichedMetadata,
            isRead: false,
          }).returning();
          
          recipientCount++;
          
          // LIVE UPDATE: Broadcast with enriched content AND metadata
          broadcastNotificationToUser(admin.workspaceId, admin.userId, {
            id: notification.id,
            type: 'platform_update',
            title: enrichedTitle,
            message: enrichedMessage,
            severity: payload.severity || 'info',
            actionUrl: payload.actionUrl || '/updates',
            createdAt: notification.createdAt,
            metadata: enrichedMetadata,
          });
          
          workspacesNotified.add(admin.workspaceId);
        }
      }
      
      // Broadcast count update to all affected workspaces
      for (const wsId of workspacesNotified) {
        broadcastToWorkspace(wsId, {
          type: 'notification_count_updated',
          action: 'platform_notification',
          title: enrichedTitle,
          timestamp: new Date().toISOString(),
        });
      }

      log.info(`[UniversalNotificationEngine] Platform notification sent to ${recipientCount} admins across ${workspacesNotified.size} workspaces + WebSocket broadcast`);

      return {
        success: true,
        recipientCount,
      };
    } catch (error: any) {
      log.error("[UniversalNotificationEngine] Platform notification error:", error);
      return { success: false, recipientCount: 0 };
    }
  }

  /**
   * Get workspace notifications from database
   */
  async getWorkspaceNotifications(
    workspaceId: string,
    options?: { unreadOnly?: boolean; limit?: number; offset?: number }
  ) {
    try {
      const limit = options?.limit || 50;
      const offset = options?.offset || 0;

      const conditions = [eq(notifications.workspaceId, workspaceId)];
      if (options?.unreadOnly) {
        conditions.push(eq(notifications.isRead, false));
      }

      const results = await db.query.notifications.findMany({
        where: and(...conditions),
        orderBy: [desc(notifications.createdAt)],
        limit,
        offset,
      });

      return results;
    } catch (error: any) {
      log.error("[UniversalNotificationEngine] Error fetching notifications:", error);
      return [];
    }
  }

  /**
   * Get user notifications with filtering
   */
  async getUserNotifications(
    workspaceId: string,
    userId: string,
    options?: { unreadOnly?: boolean; limit?: number; offset?: number }
  ) {
    try {
      const limit = options?.limit || 50;
      const offset = options?.offset || 0;

      const conditions = [
        eq(notifications.workspaceId, workspaceId),
        eq(notifications.userId, userId),
      ];
      
      if (options?.unreadOnly) {
        conditions.push(eq(notifications.isRead, false));
      }

      const results = await db.query.notifications.findMany({
        where: and(...conditions),
        orderBy: [desc(notifications.createdAt)],
        limit,
        offset,
      });

      return results;
    } catch (error: any) {
      log.error("[UniversalNotificationEngine] Error fetching user notifications:", error);
      return [];
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<boolean> {
    try {
      await db
        .update(notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(eq(notifications.id, notificationId));
      return true;
    } catch (error: any) {
      log.error("[UniversalNotificationEngine] Error marking as read:", error);
      return false;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(workspaceId: string, userId: string): Promise<number> {
    try {
      const result = await db
        .update(notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(
          and(
            eq(notifications.workspaceId, workspaceId),
            eq(notifications.userId, userId),
            eq(notifications.isRead, false)
          )
        );
      return 1; // Return count affected
    } catch (error: any) {
      log.error("[UniversalNotificationEngine] Error marking all as read:", error);
      return 0;
    }
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(workspaceId: string, userId: string): Promise<number> {
    try {
      const unread = await db.query.notifications.findMany({
        where: and(
          eq(notifications.workspaceId, workspaceId),
          eq(notifications.userId, userId),
          eq(notifications.isRead, false)
        ),
        columns: { id: true },
      });
      return unread.length;
    } catch (error: any) {
      log.error("[UniversalNotificationEngine] Error getting unread count:", error);
      return 0;
    }
  }

  /**
   * Sentinel workspace IDs used in AI billing/routing that are NOT real FK-valid workspace IDs.
   * Convert to null before any DB insert that references the workspaces table.
   */
  private static readonly SYSTEM_SENTINELS = new Set(['platform', 'system', 'trinity', 'none', '']);

  private sanitizeWorkspaceId(id: string | undefined | null): string | null {
    if (!id || UniversalNotificationEngine.SYSTEM_SENTINELS.has(id)) return null;
    return id;
  }

  // All values that exist in the platform_update_category DB enum
  private static readonly VALID_UPDATE_CATEGORIES = new Set([
    'feature', 'improvement', 'bugfix', 'security', 'announcement', 'maintenance',
    'diagnostic', 'support', 'ai_brain', 'error', 'fix', 'hotpatch', 'deprecation',
    'system', 'incident', 'outage', 'recovery', 'maintenance_update', 'maintenance_postmortem',
    'automation', 'scheduling', 'schedule', 'trinity', 'payroll', 'coverage', 'staffing',
    'billing', 'live_sync', 'operations', 'integration', 'ai_action',
    'analytics', 'user_assistance', 'invoicing', 'workforce', 'compliance',
    'field_operations', 'safety', 'training', 'time_tracking', 'hr',
    'notifications', 'health', 'integrations', 'performance', 'documents',
    'platform_service',
  ]);

  async sendPlatformUpdate(payload: {
    title: string;
    description: string;
    category?: string;
    workspaceId?: string;
    priority?: number;
    learnMoreUrl?: string;
    metadata?: Record<string, any>;
  }): Promise<{ success: boolean; id?: string; isDuplicate?: boolean }> {
    try {
      // Validate title - reject empty or undefined titles
      if (!payload.title || payload.title.trim().length < 3) {
        log.warn(`[UniversalNotificationEngine] Rejected platform update with empty/invalid title: "${payload.title}"`);
        return { success: false };
      }

      // Sanitize workspace ID — sentinel values like 'platform' are not real FK-valid workspace IDs
      const safeWorkspaceId = this.sanitizeWorkspaceId(payload.workspaceId);

      // Normalize category — reject unknown values so DB enum constraint is never violated
      const rawCategory = payload.category || 'announcement';
      const safeCategory = UniversalNotificationEngine.VALID_UPDATE_CATEGORIES.has(rawCategory)
        ? rawCategory
        : 'announcement';
      if (rawCategory !== safeCategory) {
        log.warn(`[UniversalNotificationEngine] Unknown category '${rawCategory}' → normalized to 'announcement'`);
      }

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const maintenanceCategories = ['announcement', 'improvement'];
      if (maintenanceCategories.includes(safeCategory)) {
        const recentSameCategory = await db.select({ id: platformUpdates.id, title: platformUpdates.title })
          .from(platformUpdates)
          .where(
            and(
              sql`${platformUpdates.category} IN ('announcement', 'improvement')`,
              safeWorkspaceId
                ? eq(platformUpdates.workspaceId, safeWorkspaceId)
                : isNull(platformUpdates.workspaceId),
              gte(platformUpdates.createdAt, twoHoursAgo)
            )
          )
          .limit(1);

        if (recentSameCategory.length > 0) {
          log.info(`[UniversalNotificationEngine] Category-based dedup (2h): skipping "${payload.title}" — recent "${recentSameCategory[0].title}" already exists`);
          return { success: true, id: recentSameCategory[0].id, isDuplicate: true };
        }
      }

      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const existingByTitle = await db.select({ id: platformUpdates.id })
        .from(platformUpdates)
        .where(
          and(
            or(
              eq(platformUpdates.title, payload.title),
              sql`${platformUpdates.metadata}->>'originalTitle' = ${payload.title}`
            ),
            safeWorkspaceId
              ? eq(platformUpdates.workspaceId, safeWorkspaceId)
              : isNull(platformUpdates.workspaceId),
            gte(platformUpdates.createdAt, oneDayAgo)
          )
        )
        .limit(1);
      
      if (existingByTitle.length > 0) {
        log.info(`[UniversalNotificationEngine] Duplicate platform update (24h), skipping: ${payload.title}`);
        return { success: true, id: existingByTitle[0].id, isDuplicate: true };
      }

      const skipAIEnrichment = payload.metadata?.skipAIEnrichment === true;
      
      let finalTitle: string;
      let finalDescription: string;
      let enrichedMetadata: Record<string, any>;

      if (skipAIEnrichment) {
        finalTitle = sanitizeForEndUser(payload.title);
        finalDescription = sanitizeForEndUser(payload.description);
        enrichedMetadata = {
          ...payload.metadata,
          originalTitle: payload.title,
          generatedAt: new Date().toISOString(),
          aiEnriched: false,
          preEnriched: true,
        };
        log.info(`[UniversalNotificationEngine] Skipping AI enrichment (pre-enriched content): ${finalTitle}`);
      } else {
        const enriched = await enrichNotificationWithAI({
          title: payload.title,
          message: payload.description,
          type: 'platform_update',
          category: safeCategory,
          workspaceId: payload.workspaceId,
          metadata: payload.metadata,
        });

        finalTitle = sanitizeForEndUser(enriched.title);
        finalDescription = sanitizeForEndUser(enriched.message);
        enrichedMetadata = {
          ...payload.metadata,
          originalTitle: payload.title,
          generatedAt: new Date().toISOString(),
          aiEnriched: true,
          ...enriched.metadata,
        };
      }

      const updateId = `trinity-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      // Guard: description column is NOT NULL — AI enrichment may return null/empty string.
      // Fall back to the original payload description, then to the title as last resort.
      const safeDescription = (finalDescription && finalDescription.trim())
        ? finalDescription
        : (payload.description && payload.description.trim())
          ? payload.description
          : finalTitle;
      // Insert with ON CONFLICT DO NOTHING — same-millisecond bursts
      // (multiple platform updates emitted in the same tick) can collide
      // on the deterministic id. The duplicate-by-title check above
      // handles 24h dedupe; this guards against the millisecond race.
      const inserted = await db.insert(platformUpdates).values({
        id: updateId,
        title: finalTitle,
        description: safeDescription,
        category: safeCategory as any,
        workspaceId: safeWorkspaceId || PLATFORM_WORKSPACE_ID,
        priority: payload.priority || 1,
        isNew: true,
        visibility: 'all',
        learnMoreUrl: payload.learnMoreUrl,
        metadata: enrichedMetadata,
      }).onConflictDoNothing({ target: platformUpdates.id })
        .returning({ id: platformUpdates.id });

      // If onConflictDoNothing skipped the insert, returning() yields []
      if (inserted.length === 0) {
        log.info(`[UniversalNotificationEngine] Platform update id collision (idempotent skip): ${updateId}`);
        return { success: true, id: updateId, isDuplicate: true };
      }
      const update = inserted[0];

      log.info(`[UniversalNotificationEngine] Platform update stored in What's New: ${finalTitle}`);
      // NOTE: Platform updates go to the What's New feed (/whats-new page) ONLY.
      // They are NOT inserted into the notifications inbox (notifications table).
      // Inbox notifications are reserved for personal, actionable events:
      //   shift_assigned, payroll_processed, document_expiring, compliance alerts, etc.
      // New users receive 5 curated welcome notifications when their account is created
      // via sendWelcomeOrgNotification / sendWelcomeEmployeeNotification — not here.

      eventBus.emit('platform_update_created', {
        id: update.id,
        title: finalTitle,
        description: finalDescription,
        category: safeCategory,
        workspaceId: payload.workspaceId,
        timestamp: new Date().toISOString(),
      });

      broadcastPlatformUpdateGlobal({
        id: update.id,
        title: finalTitle,
        description: finalDescription,
        category: safeCategory,
        priority: payload.priority || 1,
        learnMoreUrl: payload.learnMoreUrl,
        metadata: enrichedMetadata,
        workspaceId: payload.workspaceId,
        visibility: 'all',
      });

      return { success: true, id: update.id };
    } catch (error: any) {
      // Detailed Postgres error logging — expose code/detail/column/
      // constraint so we can diagnose ON CONFLICT failures, NOT NULL
      // violations, FK constraint failures, etc. The previous one-liner
      // hid the real cause.
      log.error("[UniversalNotificationEngine] Error creating platform update:", {
        message: error?.message,
        code: error?.code,
        detail: error?.detail,
        column: error?.column,
        constraint: error?.constraint,
        table: error?.table,
        schema: error?.schema,
        hint: error?.hint,
      });
      return { success: false };
    }
  }

  /**
   * Check if a user is currently in quiet hours
   */
  private async isInQuietHours(userId: string): Promise<boolean> {
    try {
      const prefs = await db.query.userNotificationPreferences.findFirst({
        where: eq(userNotificationPreferences.userId, userId),
        columns: { quietHoursStart: true, quietHoursEnd: true },
      });

      if (!prefs || prefs.quietHoursStart === null || prefs.quietHoursEnd === null) {
        return false;
      }

      const currentHour = new Date().getHours();
      const start = prefs.quietHoursStart;
      const end = prefs.quietHoursEnd;

      if (start < end) {
        return currentHour >= start && currentHour < end;
      } else {
        return currentHour >= start || currentHour < end;
      }
    } catch {
      return false;
    }
  }

  /**
   * Check if a user has push notifications enabled
   */
  private async isPushEnabled(userId: string): Promise<boolean> {
    try {
      const prefs = await db.query.userNotificationPreferences.findFirst({
        where: eq(userNotificationPreferences.userId, userId),
        columns: { enablePush: true },
      });

      return prefs?.enablePush !== false;
    } catch {
      return true;
    }
  }

  /**
   * Send push + in-app notification when an internal email is received
   * Respects user notification preferences (quiet hours, channel preferences)
   */
  async sendInternalEmailNotification(payload: {
    recipientUserId: string;
    workspaceId: string;
    senderName: string;
    subject: string;
    emailId: string;
    preview?: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
  }): Promise<{ success: boolean; channels: string[] }> {
    try {
      const channels: string[] = [];

      if (await this.isInQuietHours(payload.recipientUserId)) {
        log.info(`[UniversalNotificationEngine] User ${payload.recipientUserId} is in quiet hours — skipping email push notification`);
        return { success: true, channels: [] };
      }

      const title = `New email from ${payload.senderName}`;
      const message = payload.subject || '(No subject)';
      const actionUrl = `/email?id=${payload.emailId}`;

      const [notification] = await db
        .insert(notifications)
        .values({
          workspaceId: payload.workspaceId,
          userId: payload.recipientUserId,
          type: 'system' as any,
          title,
          message,
          actionUrl,
          metadata: {
            severity: 'info',
            notificationType: 'internal_email_received',
            emailId: payload.emailId,
            senderName: payload.senderName,
            subject: payload.subject,
            preview: payload.preview,
            priority: payload.priority || 'normal',
          },
          isRead: false,
        })
        .returning();

      channels.push('in-app');

      broadcastNotificationToUser(payload.workspaceId, payload.recipientUserId, {
        id: notification.id,
        type: 'internal_email_received',
        title,
        message,
        severity: payload.priority === 'urgent' || payload.priority === 'high' ? 'warning' : 'info',
        actionUrl,
        createdAt: notification.createdAt,
        metadata: {
          notificationType: 'internal_email_received',
          emailId: payload.emailId,
          senderName: payload.senderName,
        },
      });
      channels.push('websocket');

      if (await this.isPushEnabled(payload.recipientUserId)) {
        deliverPushNotification(payload.recipientUserId, title, message, {
          type: 'internal_email_received',
          url: actionUrl,
          tag: `email-${payload.emailId}`,
          severity: payload.priority === 'urgent' ? 'critical' : undefined,
        });
        channels.push('push');
      }

      log.info(`[UniversalNotificationEngine] Internal email notification sent to ${payload.recipientUserId} via ${channels.join(', ')}`);
      return { success: true, channels };
    } catch (error: any) {
      log.error('[UniversalNotificationEngine] Error sending internal email notification:', error);
      return { success: false, channels: [] };
    }
  }
}

// Singleton instance
export const universalNotificationEngine = new UniversalNotificationEngine();

// Backward compatibility alias
export const notificationEngine = universalNotificationEngine;
