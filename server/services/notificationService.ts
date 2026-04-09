/**
 * Notification Service - Automated notification creation and delivery
 * Creates and sends notifications to users for various platform events
 * 
 * Enhanced with:
 * - Trinity AI welcome messages for new users
 * - Auto-cleanup: System messages limited to 3 max to avoid screen overload
 * - Onboarding digest: Last 3 What's New + system updates summarized
 */

import { NotificationDeliveryService } from './notificationDeliveryService';
import { db } from '../db';
import { notifications, users, platformUpdates, workspaces } from '@shared/schema';
import { eq, and, desc, isNull, inArray, sql, gte } from 'drizzle-orm';
import { broadcastNotificationToUser } from '../websocket';
import { PLATFORM } from '../config/platformConfig';
import { emailService } from './emailService';
import { createLogger } from '../lib/logger';
const log = createLogger('notificationService');


interface CreateNotificationParams {
  workspaceId: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  metadata?: Record<string, any>;
  createdBy?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  data?: Record<string, any>;
  category?: string;
}

// All notification_type enum values that exist in the DB.
// Any type NOT in this set is normalized to 'system' to prevent DB constraint violations.
// To add new types: ALTER TYPE notification_type ADD VALUE + add here + add to schema enum.
const VALID_NOTIFICATION_TYPES = new Set([
  'shift_assigned', 'shift_changed', 'shift_cancelled', 'shift_unassigned', 'shift_reminder',
  'shift_offer', 'pto_approved', 'pto_denied', 'timesheet_approved', 'timesheet_rejected',
  'pay_stub_available', 'document_uploaded', 'document_expiring', 'document_signature_request',
  'document_signed', 'document_fully_executed', 'document_signature_reminder', 'profile_updated',
  'form_assigned', 'officer_deactivated', 'clock_in_reminder', 'mention',
  'schedule_change', 'schedule_notification', 'coverage_offer', 'coverage_requested',
  'coverage_filled', 'coverage_expired', 'ai_schedule_ready',
  'payroll_processed', 'payroll_pending', 'payroll_payment_method',
  'invoice_generated', 'invoice_paid', 'invoice_overdue', 'invoice_auto_sent',
  'payment_received', 'payment_overdue', 'timesheet_submission_reminder',
  'credit_warning', 'compliance_alert', 'deadline_approaching', 'dispute_filed',
  'staffing_escalation', 'staffing_critical_escalation', 'critical_alert',
  'issue_detected', 'action_required', 'approval_required',
  'ai_approval_needed', 'ai_action_completed', 'trinity_autonomous_alert', 'trinity_welcome',
  'scheduler_job_failed', 'platform_maintenance', 'known_issue', 'service_down',
  'service_restored', 'platform_update', 'feature_release',
  'system', 'welcome_org', 'welcome_employee', 'support_escalation', 'bundled_notification',
  // Extended types added to DB via ALTER TYPE
  'error', 'compliance',
  'invoice_draft_ready', 'invoice_draft_reminder', 'invoice_refunded',
  'subscription_upgraded', 'subscription_downgraded', 'subscription_cancelled',
  'subscription_payment_failed', 'subscription_activated',
  'payroll_draft_ready', 'payroll_readiness_alert', 'payroll_tracking_error', 'payroll_auto_close',
  'form_1099_filing_required', 'compliance_action_required', 'license_expiring', 'certification_expiring',
  'timesheet_approval_reminder', 'timesheet_resubmission_required',
  'trinity_financial_briefing', 'milestone_alert',
  // Payroll (extended)
  'payroll_disbursed',
  // Internal comms & confirmation types
  'internal_email_received', 'shift_confirmation_required', 'shift_confirmed', 'dar_required',
  // Shift escalation alerts (unassigned shifts approaching start time)
  'shift_escalation_warning_72h', 'shift_escalation_urgent_24h', 'shift_escalation_critical_4h',
  // Shift confirmation flow
  'shift_confirmation', 'shift_declined_alert', 'unconfirmed_shifts_alert',
  // System / platform
  'system_update', 'system_alert',
  // Schedule lifecycle
  'schedule_published', 'calloff_alert',
  // Payroll transfer tracking
  'payroll_approved', 'payroll_initiated', 'payroll_transfer_settled', 'payroll_transfer_failed',
  'payroll_alert', 'plaid_transfer_updated',
  // Timesheet alias
  'timesheets_approved',
  // Billing / subscription extended
  'billing_alert', 'subscription_updated', 'stripe_payment_received', 'invoices_updated', 'payment_refunded',
  // Trial / reactivation lifecycle
  'trial_converted', 'trial_expiry_warning', 'trial_grace_period',
  'workspace_downgraded', 'workspace_suspended', 'workspace_reactivated', 'reactivation_failed',
  // Compliance / policy
  'compliance_violation', 'compliance_hold', 'employee_terminated',
  // Safety
  'panic_alert',
  // Task / delegation
  'task_delegation', 'task_escalation',
  // Operational
  'sla_breach', 'drug_test', 'settings_change_impact',
  // Attendance / clocking
  'missed_clock_in', 'missed_clock_in_alert',
  // Reporting / summaries
  'monthly_summary', 'alert',
  // Communications
  'scheduled_email',
  // Contracts / compliance
  'contract_executed', 'regulatory_violation',
  // Trinity AI brain / proactive actions
  'trinity_recognition', 'trinity_recognition_pending', 'trinity_fto_suggestion',
  'trinity_ootm_nomination', 'trinity_raise_suggestion', 'trinity_action_blocked',
  'helpai_proactive', 'cognitive_overload', 'social_graph_insight', 'disciplinary_pattern',
  'external_risk', 'bot_reply', 'mascot_orchestration',
  // Agent / orchestration
  'agent_escalation', 'schedule_escalation', 'orchestration_update', 'migration_complete',
  'ai_cost_alert', 'circuit_breaker_opened',
  // Compliance extended
  'compliance_approved', 'compliance_rejected', 'compliance_warning',
  'audit_report_uploaded', 'audit_access_request',
  // Client / onboarding
  'client_created', 'client_invited', 'client_data_incomplete',
  'onboarding', 'employee_hired',
  // Billing / payments extended
  'chargeback_received', 'stripe_payment_confirmed', 'subscription_payment_blocked',
  'invoice_created', 'invoice_overdue_alert', 'invoice_paid_confirmation',
  'payroll_disbursement_confirmed', 'payroll_run_voided', 'paystub_generated',
  'reconciliation_alert',
  // QuickBooks sync
  'qb_sync_failed', 'qb_payroll_sync_failed',
  // Operational extended
  'security_alert', 'maintenance_alert_created', 'emergency', 'incident',
  'coverage_gap_detected', 'geofence_override_required', 'document_bridged',
  'content_moderation_alert', 'shift_cancelled_alert',
  // Approvals / requests
  'approval_needed', 'request_approved', 'request_denied',
  // General purpose
  'announcement', 'info', 'internal', 'document',
  'new_staffing_inquiry', 'support_resolved',
  'pay_rate_change', 'pto_updated',
]);

/**
 * Create and send a notification to a user
 * Note: WebSocket broadcasting is handled automatically by the notification routes
 */
export async function createNotification(params: CreateNotificationParams) {
  try {
    // Normalize type — unknown types fall back to 'system' to prevent DB enum constraint violations
    const rawType = params.type;
    const safeType = VALID_NOTIFICATION_TYPES.has(rawType) ? rawType : 'system';
    if (rawType !== safeType) {
      log.warn(`[Notifications] Unknown type '${rawType}' → normalized to 'system'`);
    }

    const [notification] = await db
      .insert(notifications)
      .values({
        workspaceId: params.workspaceId,
        userId: params.userId,
        type: safeType as any,
        title: params.title,
        message: params.message,
        actionUrl: params.actionUrl,
        relatedEntityType: params.relatedEntityType,
        relatedEntityId: params.relatedEntityId,
        metadata: params.metadata,
        createdBy: params.createdBy,
        isRead: false,
      })
      .returning();

    log.info(`[Notifications] Created notification for user ${params.userId}: ${params.title}`);

    // CRITICAL: Broadcast via WebSocket for real-time delivery
    try {
      broadcastNotificationToUser(params.workspaceId, params.userId, {
        id: notification.id,
        type: safeType,
        title: params.title,
        message: params.message,
        isRead: false,
        actionUrl: params.actionUrl,
        createdAt: notification.createdAt,
        metadata: params.metadata,
      });
      log.info(`[Notifications] WebSocket broadcast sent for user ${params.userId}`);
    } catch (wsError) {
      log.warn('[Notifications] WebSocket broadcast failed (non-fatal):', wsError);
    }

    // Send email to user via emailService (includes audit trail, retry queue, CAN-SPAM compliance)
    try {
      const user = await db.query.users.findFirst({
        where: eq(users.id, params.userId),
      });

      if (user?.email) {
        const actionLink = params.actionUrl
          ? `<p style="margin-top:16px"><a href="${process.env.APP_URL || PLATFORM.appUrl}${params.actionUrl}" style="color:#0D9488">View Details</a></p>`
          : '';
        await NotificationDeliveryService.send({ type: 'system_alert', workspaceId: params.workspaceId || 'system', recipientUserId: user.id || user.email, channel: 'email', body: { to: user.email, subject: params.title, html: `<p>${params.message}</p>${actionLink}` } });
        log.info(`[Notifications] Notification email queued via NDS for ${user.email}: ${params.title}`);
      }
    } catch (emailError) {
      log.error('[Notifications] Failed to send notification email (non-fatal):', emailError);
    }

    return notification;
  } catch (error) {
    log.error('[Notifications] Error creating notification:', error);
    throw error;
  }
}

/**
 * CURATED WELCOME NOTIFICATION SYSTEM
 *
 * New users and new orgs receive exactly 5 targeted notifications —
 * one per major platform area. This replaces the old 3-notification bundle
 * and is the ONLY time automated notifications fire for brand-new accounts.
 *
 * New Workspace Grace Period: any workspace created within the last 24 hours
 * has automated UNE/platform-update notifications suppressed. Only welcome
 * bundle notifications (isWelcomeBundle: true) bypass this gate.
 */

const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000; // 24 hours

const newWorkspaceCache = new Map<string, { isNew: boolean; checkedAt: number }>();

/**
 * Returns true if the workspace was created within the last 24 hours.
 * Cached for 5 minutes to avoid repeated DB lookups.
 */
export async function isNewWorkspace(workspaceId: string): Promise<boolean> {
  const cached = newWorkspaceCache.get(workspaceId);
  if (cached && Date.now() - cached.checkedAt < 5 * 60 * 1000) {
    return cached.isNew;
  }
  try {
    const [ws] = await db
      .select({ createdAt: workspaces.createdAt })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    const isNew = ws ? Date.now() - new Date(ws.createdAt!).getTime() < GRACE_PERIOD_MS : false;
    newWorkspaceCache.set(workspaceId, { isNew, checkedAt: Date.now() });
    return isNew;
  } catch {
    return false;
  }
}

/** Clear the new-workspace cache entry once it has aged out or after bundle is sent */
export function invalidateNewWorkspaceCache(workspaceId: string) {
  newWorkspaceCache.delete(workspaceId);
}

// ── 5-notification welcome content ────────────────────────────────────────────

function buildOwnerBundle(orgName: string) {
  return [
    {
      title: `Welcome to CoAIleague — Let's get ${orgName} set up`,
      message: `Your organization is live. Here's a quick orientation so you know exactly where to start.

Dashboard is your control center: real-time headcount, shift coverage, open alerts, and AI health score all in one view.

First actions:
1. Go to Team → Add your first employee (takes 60 seconds)
2. Go to Schedule → Let Trinity auto-fill your first week of shifts
3. Go to Settings → Connect your billing method to unlock payroll

Your free trial gives you full platform access for 14 days — no credit card needed until you're ready.`,
      actionUrl: '/dashboard',
      type: 'welcome_org',
      relatedEntityType: 'platform',
      relatedEntityId: 'onboarding',
    },
    {
      title: 'Team & Scheduling — How your workforce runs',
      message: `Adding and scheduling employees is the core of CoAIleague.

Team tab:
• Add employees individually or import via CSV
• Assign roles (guard, supervisor, manager) with custom pay rates
• Invite them via email — they get their own login and mobile access

Schedule tab:
• Drag-and-drop shift builder or let Trinity auto-generate based on your coverage requirements
• Set recurring shifts, manage swaps, and approve time-off requests
• AI Scheduler runs nightly and fills open shifts automatically

Shift Marketplace: employees can pick up open shifts themselves — less back-and-forth for you.`,
      actionUrl: '/schedule',
      type: 'welcome_org',
      relatedEntityType: 'scheduling',
      relatedEntityId: 'onboarding',
    },
    {
      title: 'Time Tracking & Payroll — From clock-in to payment',
      message: `Every hour worked flows automatically from clock-in → timesheet → payroll → invoice.

Clock-In/Out:
• GPS-verified from mobile — guards clock in at the job site, not the parking lot
• Offline mode queues punches and syncs when reconnected
• Real-time GPS dashboard shows who's on-site right now

Timesheets:
• Auto-generated from clock records — no manual entry needed
• Approve in bulk or review line by line
• AI flags anomalies (early clock-outs, missed breaks, overtime spikes)

Payroll:
• One-click payroll run after timesheet approval
• QuickBooks sync exports everything automatically
• Client invoices generated from the same data — no double entry`,
      actionUrl: '/time-tracking',
      type: 'welcome_org',
      relatedEntityType: 'payroll',
      relatedEntityId: 'onboarding',
    },
    {
      title: 'Compliance & Documents — Stay audit-ready',
      message: `CoAIleague tracks certifications, licenses, and compliance documents so nothing slips through.

Compliance Vault:
• Upload employee certifications (guard card, firearms, first aid, state licenses)
• Expiry alerts fire automatically 30, 14, and 7 days before expiration
• Employees blocked from scheduling if required documents are missing

Document Signing:
• Send documents for e-signature directly from the platform
• Completed documents stored in the WORM-protected vault
• Full audit trail for every signature

Post Orders & Guard Tours:
• Attach post orders to each client site
• Guard tours track scan points via GPS, QR, or NFC
• Missed scans trigger automatic alerts to supervisors`,
      actionUrl: '/compliance-scenarios',
      type: 'welcome_org',
      relatedEntityType: 'compliance',
      relatedEntityId: 'onboarding',
    },
    {
      title: 'Meet Trinity — Your AI that actually does things',
      message: `Trinity is your always-on AI assistant. Not a chatbot — an AI that takes real action on the platform.

What Trinity can do:
• Build and publish a full weekly schedule from your coverage requirements
• Answer "Why is overtime up this week?" with a real breakdown
• Scan your financials and give you a business health score with specific recommendations
• Flag compliance gaps before they become violations
• Generate custom reports on demand

How to reach Trinity:
• Click the Celtic knot icon in the bottom corner of any page
• Or go to Chat → Business Mode for operational queries
• Guru Mode for platform troubleshooting and configuration

Try: "Trinity, build me a schedule for next week" or "What's going on with my business?"

Trinity learns your operation over time and gets more useful the more you use the platform.`,
      actionUrl: '/chatrooms',
      type: 'system',
      relatedEntityType: 'trinity',
      relatedEntityId: 'onboarding',
    },
  ];
}

function buildEmployeeBundle(orgName: string, employeeName: string) {
  return [
    {
      title: `Welcome to ${orgName} on CoAIleague`,
      message: `You've been added to ${orgName}'s workforce platform. Here's what you need to know to get started quickly.

Your Employee Portal gives you:
• Upcoming shifts and schedule
• Clock-in/out with GPS (works offline too)
• Time-off requests and shift swaps
• Your timesheets and earnings history
• Documents and certifications

First steps:
1. Check the Schedule tab for your upcoming shifts
2. Set up your profile and emergency contact
3. Review any documents assigned to you in the Compliance tab
4. Download the platform on mobile for GPS clock-in`,
      actionUrl: '/employee/portal',
      type: 'welcome_employee',
      relatedEntityType: 'employee',
      relatedEntityId: employeeName,
    },
    {
      title: 'Your Schedule — Shifts, time off, and swaps',
      message: `Everything about your work schedule lives in the Schedule tab.

Viewing shifts:
• Calendar view shows your upcoming shifts by day, week, or month
• Each shift shows location, start/end time, and your assigned role
• Tap a shift for full details including post orders and site instructions

Time off:
• Submit time-off requests directly from the app — your manager approves in-app
• You'll get a notification the moment it's approved or denied

Shift swaps:
• Request a swap with another employee from the shift card
• Both parties and your manager are notified automatically

Shift Marketplace:
• Open shifts posted by your org appear here — pick one up with a single tap`,
      actionUrl: '/schedule',
      type: 'welcome_employee',
      relatedEntityType: 'scheduling',
      relatedEntityId: 'onboarding',
    },
    {
      title: 'Clocking In & Out — GPS-verified timekeeping',
      message: `Your time is tracked automatically once you clock in. Here's how it works.

To clock in:
• Open CoAIleague on your phone at the job site
• Tap Clock In — your GPS location is captured automatically
• You'll see a confirmation with your clock-in time

Offline mode:
• No signal at the site? Clock in anyway — it queues offline
• Automatically syncs the moment you reconnect
• The timestamp recorded is when you actually clocked in, not when it synced

Breaks and meal periods:
• If your org tracks breaks, you'll see a Break button while clocked in
• Clock back in after your break to resume your shift

Timesheets:
• Your timesheet is auto-generated from your clock records
• Review it in the Time Tracking tab — flag any errors to your manager`,
      actionUrl: '/time-tracking',
      type: 'welcome_employee',
      relatedEntityType: 'time_tracking',
      relatedEntityId: 'onboarding',
    },
    {
      title: 'Documents & Certifications — Stay compliant',
      message: `Your employer tracks your certifications and required documents through CoAIleague.

What to expect:
• Any required certifications (guard card, license, first aid) will be listed in your Compliance tab
• Upload your documents directly — your manager reviews and approves them
• You'll get reminders 30, 14, and 7 days before anything expires

Document signing:
• Your employer may send documents for your e-signature (onboarding packet, policies, contracts)
• You'll receive a notification when something needs your signature
• Completed documents are stored securely and accessible anytime

Important: If required documents are missing or expired, you may be blocked from being scheduled. Keep your certifications up to date.`,
      actionUrl: '/compliance-scenarios',
      type: 'welcome_employee',
      relatedEntityType: 'compliance',
      relatedEntityId: 'onboarding',
    },
    {
      title: 'Need help? Trinity AI is here for you',
      message: `Trinity is the AI assistant built into CoAIleague. You can ask it anything about the platform or your work.

Things employees ask Trinity:
• "What shifts do I have this week?"
• "How do I request time off?"
• "Why was my timesheet flagged?"
• "How do I swap a shift with someone?"
• "Where do I upload my certifications?"

How to reach Trinity:
• Click the Celtic knot icon in the bottom corner of any page
• Or go to Chat from the main menu

Trinity speaks plainly — no manual, no support ticket, just ask. If something isn't working or you can't find a feature, Trinity will walk you through it step by step.`,
      actionUrl: '/chatrooms',
      type: 'system',
      relatedEntityType: 'trinity',
      relatedEntityId: 'onboarding',
    },
  ];
}

/**
 * Send exactly 5 curated welcome notifications to a new org owner.
 * Covers: Getting Started, Scheduling, Time/Payroll, Compliance, Trinity AI.
 * Marked isWelcomeBundle=true to bypass the new-workspace suppression gate.
 */
export async function sendWelcomeOrgNotification(workspaceId: string, ownerId: string, orgName: string) {
  const bundle = buildOwnerBundle(orgName);
  const results = [];

  for (const notif of bundle) {
    results.push(await createNotification({
      workspaceId,
      userId: ownerId,
      type: notif.type as any,
      title: notif.title,
      message: notif.message,
      actionUrl: notif.actionUrl,
      relatedEntityType: notif.relatedEntityType,
      relatedEntityId: notif.relatedEntityId,
      metadata: { notificationType: 'welcome_bundle', orgName, isWelcomeBundle: true },
    }));
  }

  log.info(`[Notifications] Sent 5-notification welcome bundle to org owner ${ownerId} (workspace: ${workspaceId})`);
  return results;
}

/**
 * Send exactly 5 curated welcome notifications to a new employee.
 * Covers: Platform Welcome, Schedule, Time Tracking, Compliance, Trinity AI.
 * Marked isWelcomeBundle=true to bypass the new-workspace suppression gate.
 */
export async function sendWelcomeEmployeeNotification(
  workspaceId: string,
  userId: string,
  employeeName: string,
  orgName: string
) {
  const bundle = buildEmployeeBundle(orgName, employeeName);
  const results = [];

  for (const notif of bundle) {
    results.push(await createNotification({
      workspaceId,
      userId,
      type: notif.type as any,
      title: notif.title,
      message: notif.message,
      actionUrl: notif.actionUrl,
      relatedEntityType: notif.relatedEntityType,
      relatedEntityId: notif.relatedEntityId,
      metadata: { notificationType: 'welcome_bundle', orgName, employeeName, isWelcomeBundle: true },
    }));
  }

  log.info(`[Notifications] Sent 5-notification welcome bundle to employee ${userId} (workspace: ${workspaceId})`);
  return results;
}

/**
 * Send notification when AI Brain needs approval for a workflow
 */
export async function sendAIApprovalNeededNotification(
  workspaceId: string,
  userId: string,
  actionType: string,
  deadline: Date,
  details: string,
  actionUrl?: string
) {
  const daysUntilDeadline = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  
  return createNotification({
    workspaceId,
    userId,
    type: 'ai_approval_needed',
    title: 'AI Brain Approval Required',
    message: `${details} Please review and approve within ${daysUntilDeadline} days to avoid business disruption.`,
    actionUrl: actionUrl || '/dashboard',
    relatedEntityType: 'ai_workflow',
    relatedEntityId: workspaceId,
    metadata: { actionType, deadline: deadline.toISOString(), daysUntilDeadline },
  });
}

/**
 * Send notification when AI-generated schedule is ready for approval
 */
export async function sendAIScheduleReadyNotification(
  workspaceId: string,
  userId: string,
  scheduleId: string,
  period: string
) {
  return createNotification({
    workspaceId,
    userId,
    type: 'ai_schedule_ready',
    title: 'AI Schedule Ready for Approval',
    message: `Your AI-generated schedule for ${period} is ready for review. Approve it to publish to your team.`,
    actionUrl: `/schedule/${scheduleId}`,
    relatedEntityType: 'schedule',
    relatedEntityId: scheduleId,
    metadata: { period },
  });
}

/**
 * Send notification when invoice is generated
 */
export async function sendInvoiceGeneratedNotification(
  workspaceId: string,
  userId: string,
  invoiceId: string,
  clientName: string,
  amount: number
) {
  return createNotification({
    workspaceId,
    userId,
    type: 'invoice_generated',
    title: 'Invoice Generated',
    message: `Invoice for ${clientName} has been automatically generated by AI Brain. Amount: $${amount.toFixed(2)}`,
    actionUrl: `/invoices/${invoiceId}`,
    relatedEntityType: 'invoice',
    relatedEntityId: invoiceId,
    metadata: { clientName, amount },
  });
}

/**
 * Send notification when payment is received
 */
export async function sendPaymentReceivedNotification(
  workspaceId: string,
  userId: string,
  invoiceId: string,
  clientName: string,
  amount: number
) {
  return createNotification({
    workspaceId,
    userId,
    type: 'payment_received',
    title: 'Payment Received',
    message: `Payment of $${amount.toFixed(2)} received from ${clientName}.`,
    actionUrl: `/invoices/${invoiceId}`,
    relatedEntityType: 'payment',
    relatedEntityId: invoiceId,
    metadata: { clientName, amount },
  });
}

/**
 * Send notification when deadline is approaching
 */
export async function sendDeadlineApproachingNotification(
  workspaceId: string,
  userId: string,
  actionType: string,
  deadline: Date,
  actionUrl?: string
) {
  const hoursUntilDeadline = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60));
  
  return createNotification({
    workspaceId,
    userId,
    type: 'deadline_approaching',
    title: 'Deadline Approaching',
    message: `${actionType} deadline is approaching in ${hoursUntilDeadline} hours. Please take action to avoid business disruption.`,
    actionUrl: actionUrl || '/dashboard',
    relatedEntityType: 'deadline',
    relatedEntityId: workspaceId,
    metadata: { actionType, deadline: deadline.toISOString(), hoursUntilDeadline },
  });
}

/**
 * Send notification when AI Brain completes an automated action
 */
export async function sendAIActionCompletedNotification(
  workspaceId: string,
  userId: string,
  actionType: string,
  details: string,
  actionUrl?: string
) {
  return createNotification({
    workspaceId,
    userId,
    type: 'ai_action_completed',
    title: 'AI Brain Action Completed',
    message: `${details}`,
    actionUrl: actionUrl || '/dashboard',
    relatedEntityType: 'ai_action',
    relatedEntityId: workspaceId,
    metadata: { actionType },
  });
}

/**
 * Send notification for schedule changes
 */
export async function sendScheduleChangeNotification(
  workspaceId: string,
  userId: string,
  details: string,
  scheduleId?: string
) {
  return createNotification({
    workspaceId,
    userId,
    type: 'schedule_change',
    title: 'Schedule Updated',
    message: details,
    actionUrl: scheduleId ? `/schedule/${scheduleId}` : '/schedule',
    relatedEntityType: 'schedule',
    relatedEntityId: scheduleId,
    metadata: { details },
  });
}

/**
 * Send notification for payroll processing
 */
export async function sendPayrollProcessedNotification(
  workspaceId: string,
  userId: string,
  period: string,
  amount: number
) {
  return createNotification({
    workspaceId,
    userId,
    type: 'payroll_processed',
    title: 'Payroll Processed',
    message: `Your payroll for ${period} has been processed. Amount: $${amount.toFixed(2)}`,
    actionUrl: '/employee/portal',
    relatedEntityType: 'payroll',
    relatedEntityId: userId,
    metadata: { period, amount },
  });
}

// ============================================================================
// TRINITY WELCOME & ONBOARDING SYSTEM
// ============================================================================

/**
 * Trinity welcome message templates - AI-generated feel without API cost
 * Each message is crafted to feel personal and helpful
 */
const TRINITY_WELCOME_MESSAGES = [
  {
    greeting: "Welcome aboard!",
    message: "I'm Trinity, your AI assistant here at CoAIleague. I've been looking forward to meeting you! Together, we'll make managing your workforce feel effortless. I can help with scheduling, approvals, analytics, and so much more. Just look for my mascot in the corner whenever you need guidance!",
    tip: "Pro tip: Try clicking on me anytime to ask questions or get quick insights about your dashboard.",
  },
  {
    greeting: "Hello, new friend!",
    message: "I'm Trinity, your dedicated AI companion at CoAIleague. Think of me as your intelligent co-pilot for workforce management. I learn from your preferences and can automate repetitive tasks, catch scheduling conflicts, and even predict potential issues before they happen.",
    tip: "Getting started: Head to your Dashboard to see an overview of your workspace, or explore the Schedule page to set up your first shifts.",
  },
  {
    greeting: "Welcome to CoAIleague!",
    message: "Hi there! I'm Trinity, the AI brain powering your workforce experience. My job is to make your job easier. From intelligent scheduling to real-time insights, I'm here to help you work smarter, not harder. The best teams use AI to amplify their capabilities - and that's exactly what we'll do together!",
    tip: "Quick start: Check out the Onboarding Wizard in the sidebar to set up your team step-by-step.",
  },
];

/**
 * Get a random Trinity welcome message for variety
 */
function getTrinityWelcomeContent() {
  const index = Math.floor(Math.random() * TRINITY_WELCOME_MESSAGES.length);
  return TRINITY_WELCOME_MESSAGES[index];
}

/**
 * Send personalized Trinity welcome notification to new users
 * This creates a warm, AI-driven welcome experience
 */
export async function sendTrinityWelcomeNotification(
  workspaceId: string,
  userId: string,
  userName?: string
) {
  const content = getTrinityWelcomeContent();
  const personalGreeting = userName ? `${content.greeting} ${userName}!` : `${content.greeting}`;
  
  return createNotification({
    workspaceId,
    userId,
    type: 'trinity_welcome',
    title: personalGreeting,
    message: content.message,
    actionUrl: '/dashboard',
    relatedEntityType: 'onboarding',
    relatedEntityId: 'trinity_welcome',
    metadata: { 
      isTrinityMessage: true,
      tip: content.tip,
      userName,
      welcomeType: 'new_user',
    },
  });
}

/**
 * Get onboarding digest for new users
 * Returns last 3 What's New items + last 3 system updates summarized
 */
export async function getOnboardingDigest(userId: string): Promise<{
  trinityWelcome: {
    greeting: string;
    message: string;
    tip: string;
  };
  recentWhatsNew: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    createdAt: Date | null;
  }>;
  recentSystemUpdates: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    createdAt: Date | null;
  }>;
  isFirstLogin: boolean;
}> {
  // Get Trinity welcome content
  const trinityWelcome = getTrinityWelcomeContent();
  
  // Get last 3 What's New items (features, improvements)
  // Using valid enum values: feature, improvement
  const whatsNewCategories = ['feature', 'improvement'] as const;
  const recentWhatsNew = await db
    .select({
      id: platformUpdates.id,
      title: platformUpdates.title,
      description: platformUpdates.description,
      category: platformUpdates.category,
      createdAt: platformUpdates.createdAt,
    })
    .from(platformUpdates)
    .where(inArray(platformUpdates.category, [...whatsNewCategories]))
    .orderBy(desc(platformUpdates.createdAt))
    .limit(3);
  
  // Get last 3 system updates (security, bugfix, maintenance)
  // Using valid enum values: security, bugfix, maintenance
  const systemCategories = ['security', 'bugfix', 'maintenance'] as const;
  const recentSystemUpdates = await db
    .select({
      id: platformUpdates.id,
      title: platformUpdates.title,
      description: platformUpdates.description,
      category: platformUpdates.category,
      createdAt: platformUpdates.createdAt,
    })
    .from(platformUpdates)
    .where(inArray(platformUpdates.category, [...systemCategories]))
    .orderBy(desc(platformUpdates.createdAt))
    .limit(3);
  
  // Check if this is user's first login (no read notifications)
  const existingNotifications = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .limit(1);
  
  const isFirstLogin = existingNotifications.length === 0;
  
  return {
    trinityWelcome,
    recentWhatsNew,
    recentSystemUpdates,
    isFirstLogin,
  };
}

/**
 * Auto-cleanup system notifications
 * Limits visible system messages to 3 per user to avoid screen overload
 * Marks excess as cleared (auto-dismissed)
 */
export async function autoCleanupSystemNotifications(userId: string, maxVisible: number = 3): Promise<number> {
  try {
    // Get all uncleared system-type notifications for user, ordered by newest first
    const systemTypes = ['system_update', 'platform_update', 'maintenance', 'security_patch'];
    
    const allSystemNotifications = await db
      .select({ id: notifications.id, createdAt: notifications.createdAt })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          isNull(notifications.clearedAt)
        )
      )
      .orderBy(desc(notifications.createdAt));
    
    // If more than maxVisible, mark older ones as cleared
    if (allSystemNotifications.length > maxVisible) {
      const toClean = allSystemNotifications.slice(maxVisible);
      const idsToClean = toClean.map(n => n.id);
      
      await db
        .update(notifications)
        .set({ clearedAt: new Date() })
        .where(inArray(notifications.id, idsToClean));
      
      log.info(`[NotificationCleanup] Auto-cleared ${idsToClean.length} old notifications for user ${userId}`);
      return idsToClean.length;
    }
    
    return 0;
  } catch (error) {
    log.error('[NotificationCleanup] Error during auto-cleanup:', error);
    return 0;
  }
}

/**
 * Clear old system notifications for all users (scheduled job)
 * Keeps only last 3 system notifications per user
 */
export async function cleanupAllUsersSystemNotifications(maxVisiblePerUser: number = 3): Promise<number> {
  try {
    // Get distinct user IDs with uncleared notifications
    const usersWithNotifications = await db
      .selectDistinct({ userId: notifications.userId })
      .from(notifications)
      .where(isNull(notifications.clearedAt));
    
    let totalCleaned = 0;
    for (const { userId } of usersWithNotifications) {
      const cleaned = await autoCleanupSystemNotifications(userId, maxVisiblePerUser);
      totalCleaned += cleaned;
    }
    
    if (totalCleaned > 0) {
      log.info(`[NotificationCleanup] Scheduled cleanup: cleared ${totalCleaned} notifications across ${usersWithNotifications.length} users`);
    }
    
    return totalCleaned;
  } catch (error) {
    log.error('[NotificationCleanup] Scheduled cleanup error:', error);
    return 0;
  }
}
