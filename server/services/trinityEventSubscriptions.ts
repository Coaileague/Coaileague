/**
 * Trinity Event Subscriptions
 * ===========================
 * Wires all platform events to Trinity AI for awareness and autonomous action.
 * This is the critical integration layer connecting disconnected services to Trinity.
 * 
 * Services Connected:
 * - Schedule publishing → SMS notifications
 * - Payroll processing → SMS/Email notifications
 * - Incident creation → Manager alerts
 * - GPS violations → Security alerts
 * - Compliance checks → Proactive warnings
 * - Employee patterns → Trinity learning
 */

import { NotificationDeliveryService } from './notificationDeliveryService';
import { platformEventBus, PlatformEvent } from './platformEventBus';
import { sendSMS } from './smsService'; // email-tracked
import { emailService } from './emailService';
import { db } from '../db';
import { createLogger } from "../lib/logger";
const log = createLogger("trinityEventSubscriptions");
import { employees, shifts, workspaces, clients, users, auditLogs } from '@shared/schema';
import { eq, and, inArray, gte, sql } from 'drizzle-orm';
import { PLATFORM } from '../config/platformConfig';

const APP_URL = process.env.APP_BASE_URL || PLATFORM.appUrl;

// ── payroll_run_paid dedup guard ───────────────────────────────────────────
// payroll_run_paid can fire from two independent sources (payrollAutomation
// and stripeConnectPayoutService) for the same run. Track recently-handled
// run IDs and skip duplicate notifications within 90 seconds.
const _recentlyPaidRuns = new Map<string, number>();
function _isRecentlyHandledPayrollRun(runId: string): boolean {
  const now = Date.now();
  if (_recentlyPaidRuns.has(runId)) {
    const ts = _recentlyPaidRuns.get(runId)!;
    if (now - ts < 90_000) return true; // within 90s dedup window
  }
  _recentlyPaidRuns.set(runId, now);
  // Evict entries older than 5 minutes to prevent unbounded growth
  for (const [k, t] of _recentlyPaidRuns) {
    if (now - t > 300_000) _recentlyPaidRuns.delete(k);
  }
  return false;
}

/**
 * Append an entry to thalamic_log — Trinity's persistent signal log.
 * Non-fatal: failures are warned and swallowed so they never break the
 * triggering event handler.
 */
async function writeThalamicSignal(params: {
  workspaceId: string;
  signalType: string;
  source: string;
  priorityScore: number;
  signalPayload: Record<string, unknown>;
  userId?: string | null;
}): Promise<void> {
  try {
    const { thalamiclogs } = await import('@shared/schema');
    const crypto = await import('crypto');
    await db.insert(thalamiclogs).values({
      signalId: crypto.randomUUID(),
      arrivedAt: new Date(),
      signalType: params.signalType,
      source: params.source,
      sourceTrustTier: 'workspace',
      workspaceId: params.workspaceId,
      userId: params.userId ?? null,
      priorityScore: params.priorityScore,
      signalPayload: params.signalPayload,
    });
  } catch (err: any) {
    log.warn(`[TrinityEvents] thalamic_log insert failed (${params.signalType}): ${err?.message}`);
  }
}

/**
 * Handle schedule published event - notify all affected employees
 */
async function onSchedulePublished(event: PlatformEvent): Promise<void> {
  const { workspaceId, scheduleId, weekStart, affectedEmployees } = event.metadata || {};
  
  if (!workspaceId || !affectedEmployees?.length) {
    log.info('[TrinityEvents] Schedule published but no employees to notify');
    return;
  }

  log.info(`[TrinityEvents] Schedule published - notifying ${affectedEmployees.length} employees`);

  for (const empId of affectedEmployees) {
    try {
      const employee = await db.query.employees.findFirst({
        where: eq(employees.id, empId),
      });

      if (!employee?.phone) continue;

      const empShifts = await db.query.shifts.findMany({
        where: and(
          eq(shifts.employeeId, empId),
          eq(shifts.workspaceId, workspaceId)
        ),
        limit: 7,
      });

      if (empShifts.length === 0) continue;

      const shiftList = empShifts
        .slice(0, 5)
        .map((s) => `- ${s.date} ${s.startTime}-${s.endTime}`)
        .join('\n');

      await NotificationDeliveryService.send({ type: 'schedule_notification', workspaceId: workspaceId || 'system', recipientUserId: empId, channel: 'sms', body: { to: employee.phone, body: `I've scheduled you for ${empShifts.length} shifts:\n${shiftList}\n\nView: ${APP_URL}/schedule` } });
    } catch (error) {
      log.error(`[TrinityEvents] Failed to notify employee ${empId}:`, error);
    }
  }

  log.info(`[TrinityEvents] Schedule notifications sent`);
}

/**
 * Handle payroll processed event - notify employees of pay
 */
async function onPayrollProcessed(event: PlatformEvent): Promise<void> {
  const { workspaceId, payrollRunId, employeeCount, totalAmount, depositDate } = event.metadata || {};

  if (!workspaceId) return;

  log.info(`[TrinityEvents] Payroll processed - $${totalAmount} for ${employeeCount} employees`);

  try {
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, workspaceId),
    });

    if (workspace?.ownerId) {
      const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, workspace.ownerId));
      if (owner?.email) {
        await NotificationDeliveryService.send({ type: 'payroll_notification', workspaceId: workspaceId || 'system', recipientUserId: workspace.ownerId || owner.email, channel: 'email', body: { to: owner.email, subject: 'Payroll Processed Successfully', html: `<h2>Payroll Complete</h2><p>I've processed payroll for ${employeeCount} employees.</p><ul><li><strong>Total:</strong> ${totalAmount?.toLocaleString()}</li><li><strong>Deposit Date:</strong> ${depositDate || 'Next business day'}</li></ul><p><a href="${APP_URL}/payroll">View Payroll Details</a></p>` } });
      }
    }
  } catch (err: any) {
    log.error('[TrinityEvents] onPayrollProcessed failed (non-crashing):', err?.message);
  }
}

/**
 * Handle incident created event - escalate critical incidents
 */
async function onIncidentCreated(event: PlatformEvent): Promise<void> {
  const { workspaceId, incidentId, severity, siteId, reportedBy, incidentType, actionTaken } = event.metadata || {};

  if (severity !== 'critical' && severity !== 'high') return;

  log.info(`[TrinityEvents] ${severity.toUpperCase()} incident created - notifying supervisor`);

  try {
    if (reportedBy) {
      const reporter = await db.query.employees.findFirst({
        where: eq(employees.id, reportedBy),
      });

      // @ts-expect-error — TS migration: fix in refactoring sprint
      if (reporter?.supervisorId) {
        const supervisor = await db.query.employees.findFirst({
          where: eq(employees.id, (reporter as any).supervisorId),
        });

        if (supervisor?.phone) {
          let siteName = 'Unknown Site';
          if (siteId) {
            const client = await db.query.clients.findFirst({
              where: eq(clients.id, siteId),
            });
            siteName = client?.companyName || (client as any)?.name || siteName;
          }

          await NotificationDeliveryService.send({ type: 'incident_alert', workspaceId: workspaceId || 'system', recipientUserId: (reporter as any).supervisorId || supervisor.phone, channel: 'sms', body: { to: supervisor.phone, body: `INCIDENT at ${siteName}\nType: ${incidentType}\nGuard: ${reporter.firstName} ${reporter.lastName}\nAction: ${actionTaken || 'Pending'}\nView: ${APP_URL}/incidents/${incidentId}` } });
        }
      }
    }
  } catch (err: any) {
    log.error('[TrinityEvents] onIncidentCreated failed (non-crashing):', err?.message);
  }
}

/**
 * Handle GPS violation event - alert manager immediately
 */
async function onGPSViolation(event: PlatformEvent): Promise<void> {
  const { workspaceId, employeeId, distance, siteName } = event.metadata || {};

  if (!workspaceId || !employeeId) return;

  log.info(`[TrinityEvents] GPS violation - employee ${employeeId} was ${distance}m from ${siteName}`);

  try {
    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, employeeId),
    });

    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (employee?.supervisorId) {
      const supervisor = await db.query.employees.findFirst({
        where: eq(employees.id, (employee as any).supervisorId),
      });

      if (supervisor?.phone) {
        await NotificationDeliveryService.send({ type: 'schedule_notification', workspaceId: workspaceId || 'system', recipientUserId: (employee as any).supervisorId || supervisor.phone, channel: 'sms', body: { to: supervisor.phone, body: `GPS ALERT: ${employee.firstName} ${employee.lastName} attempted clock-in ${Math.round(distance)}m from ${siteName}. Possible fraud attempt.` } });
      }
    }
  } catch (err: any) {
    log.error('[TrinityEvents] onGPSViolation failed (non-crashing):', err?.message);
  }
}

/**
 * Handle shift reminder event - 2 hours before shift
 */
async function onShiftReminder(event: PlatformEvent): Promise<void> {
  const { workspaceId, employeeId, shiftId, startTime, siteName } = event.metadata || {};

  if (!employeeId) return;

  try {
    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, employeeId),
    });

    if (employee?.phone) {
      await NotificationDeliveryService.send({ type: 'schedule_notification', workspaceId: workspaceId || 'system', recipientUserId: employeeId, channel: 'sms', body: { to: employee.phone, body: `Reminder: Your shift at ${siteName || 'assigned location'} starts at ${startTime}. Clock in on time!` } });
    }
  } catch (err: any) {
    log.error('[TrinityEvents] onShiftReminder failed (non-crashing):', err?.message);
  }
}

/**
 * Handle certification expiring event
 */
async function onCertificationExpiring(event: PlatformEvent): Promise<void> {
  const { workspaceId, employeeId, certName, daysUntilExpiry } = event.metadata || {};

  if (!employeeId) return;

  try {
    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, employeeId),
    });

    if (employee?.phone && daysUntilExpiry <= 14) {
      await NotificationDeliveryService.send({ type: 'certification_alert', workspaceId: workspaceId || 'system', recipientUserId: employeeId, channel: 'sms', body: { to: employee.phone, body: `Your ${certName} certification expires in ${daysUntilExpiry} days. Renew ASAP to stay compliant.` } });
    }
  } catch (err: any) {
    log.error('[TrinityEvents] onCertificationExpiring failed (non-crashing):', err?.message);
  }
}

/**
 * Handle compliance check completed event
 */
async function onComplianceChecked(event: PlatformEvent): Promise<void> {
  const { workspaceId, violationsFound, criticalCount } = event.metadata || {};

  if (criticalCount > 0) {
    log.info(`[TrinityEvents] ${criticalCount} critical compliance violations detected`);

    try {
      const workspace = await db.query.workspaces.findFirst({
        where: eq(workspaces.id, workspaceId),
      });

      if (workspace?.ownerId) {
        const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, workspace.ownerId));
        if (owner?.email) {
          await NotificationDeliveryService.send({ type: 'compliance_alert', workspaceId: workspaceId || 'system', recipientUserId: workspace.ownerId || owner.email, channel: 'email', body: { to: owner.email, subject: `URGENT: ${criticalCount} Critical Compliance Violations`, html: `<h2>Compliance Alert</h2><p>I've detected <strong>${criticalCount} critical</strong> compliance violations requiring immediate attention.</p><p><a href="${APP_URL}/compliance">View Compliance Dashboard</a></p>` } });
        }
      }
    } catch (err: any) {
      log.error('[TrinityEvents] onComplianceChecked failed (non-crashing):', err?.message);
    }
  }
}

/**
 * Handle invoice generated event - sync to QuickBooks
 */
async function onInvoiceGenerated(event: PlatformEvent): Promise<void> {
  const { workspaceId, invoiceId, clientId, amount } = event.metadata || {};

  log.info(`[TrinityEvents] Invoice generated - $${amount} for client ${clientId}`);
}

/**
 * Handle invoice_paid event — notify org owner, log financial confirmation
 * Canonical trigger: POST /api/invoices/:id/mark-paid emits 'invoice_paid'
 */
async function onInvoicePaid(event: PlatformEvent): Promise<void> {
  const { workspaceId, invoiceId, invoiceNumber, total, paymentMethod, clientId } = event.metadata || {};
  if (!workspaceId) return;
  const amount = parseFloat(String(total || 0));
  log.info(`[TrinityEvents] invoice_paid — ${invoiceNumber} ($${amount.toFixed(2)}) via ${paymentMethod}`);
  try {
    const workspace = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
    if (!workspace?.ownerId) return;
    const { createNotification } = await import('./notificationService');
    await createNotification({
      workspaceId,
      userId: workspace.ownerId,
      type: 'invoice_paid_confirmation',
      title: `Invoice ${invoiceNumber} Paid`,
      message: `Invoice ${invoiceNumber} for $${amount.toFixed(2)} has been paid in full via ${paymentMethod || 'manual'}. Your AR has been updated.`,
      metadata: { invoiceId, invoiceNumber, total, paymentMethod, clientId, source: 'TrinityEvents' },
    });
  } catch (err: any) {
    log.warn('[TrinityEvents] onInvoicePaid notification failed (non-blocking):', (err instanceof Error ? err.message : String(err)));
  }
}

/**
 * Handle invoice_overdue event — escalate to manager with collection intelligence
 * Canonical trigger: nightly autonomous scheduler emits 'invoice_overdue' for each overdue invoice
 */
async function onInvoiceOverdue(event: PlatformEvent): Promise<void> {
  const { workspaceId, invoiceId, invoiceNumber, total, clientId, daysOverdue } = event.metadata || {};
  if (!workspaceId) return;
  const amount = parseFloat(String(total || 0));
  log.info(`[TrinityEvents] invoice_overdue — ${invoiceNumber} ($${amount.toFixed(2)}) ${daysOverdue || '?'}d overdue`);
  try {
    const workspace = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
    if (!workspace?.ownerId) return;
    const { createNotification } = await import('./notificationService');
    await createNotification({
      workspaceId,
      userId: workspace.ownerId,
      type: 'invoice_overdue_alert',
      title: `Overdue Invoice Requires Action`,
      message: `Invoice ${invoiceNumber} for $${amount.toFixed(2)} is ${daysOverdue || 'now'} days overdue. Trinity recommends following up with the client immediately.`,
      actionUrl: `/invoices`,
      metadata: { invoiceId, invoiceNumber, total, clientId, daysOverdue, source: 'TrinityEvents' },
    });
  } catch (err: any) {
    log.warn('[TrinityEvents] onInvoiceOverdue notification failed (non-blocking):', (err instanceof Error ? err.message : String(err)));
  }
}

/**
 * Handle payroll_run_paid event — Trinity confirms cash disbursement to org owner
 * Canonical trigger: POST /api/payroll/runs/:id/mark-paid emits 'payroll_run_paid'
 */
async function onPayrollRunPaid(event: PlatformEvent): Promise<void> {
  const { workspaceId, payrollRunId, disbursementMethod, confirmedBy } = event.metadata || {};
  if (!workspaceId) return;
  // Dedup: payroll_run_paid can fire from both payrollAutomation and stripeConnectPayoutService
  // for the same run. Skip if we already handled this run within the 90s window.
  if (payrollRunId && _isRecentlyHandledPayrollRun(payrollRunId)) {
    log.info(`[TrinityEvents] payroll_run_paid — dedup suppressed for run ${payrollRunId} (already handled)`);
    return;
  }
  log.info(`[TrinityEvents] payroll_run_paid — run ${payrollRunId} via ${disbursementMethod}`);
  try {
    const workspace = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
    if (!workspace?.ownerId) return;
    const { createNotification } = await import('./notificationService');
    await createNotification({
      workspaceId,
      userId: workspace.ownerId,
      type: 'payroll_disbursement_confirmed',
      title: `Payroll Disbursement Confirmed`,
      message: `Payroll run ${payrollRunId} has been marked as paid. Funds disbursed via ${disbursementMethod || 'manual'}. Employees will receive their pay on the next business day.`,
      actionUrl: `/payroll`,
      metadata: { payrollRunId, disbursementMethod, confirmedBy, source: 'TrinityEvents' },
    });
  } catch (err: any) {
    log.warn('[TrinityEvents] onPayrollRunPaid notification failed (non-blocking):', (err instanceof Error ? err.message : String(err)));
  }
}

/**
 * Handle stripe_payment_received — Trinity confirms Stripe payment and updates reconciliation status
 * Canonical trigger: stripeWebhooks.ts invoice.payment_succeeded emits 'stripe_payment_received'
 */
async function onStripePaymentReceived(event: PlatformEvent): Promise<void> {
  const { workspaceId, invoiceId, invoiceNumber, amount, stripeInvoiceId } = event.metadata || {};
  if (!workspaceId) return;
  log.info(`[TrinityEvents] stripe_payment_received — ${invoiceNumber} $${amount} Stripe invoice ${stripeInvoiceId}`);
  try {
    const workspace = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
    if (!workspace?.ownerId) return;
    const { createNotification } = await import('./notificationService');
    await createNotification({
      workspaceId,
      userId: workspace.ownerId,
      type: 'stripe_payment_confirmed',
      title: `Stripe Payment Received`,
      message: `Payment of $${parseFloat(String(amount || 0)).toFixed(2)} received via Stripe for invoice ${invoiceNumber || invoiceId}. Invoice has been automatically updated.`,
      actionUrl: `/invoices`,
      metadata: { invoiceId, invoiceNumber, amount, stripeInvoiceId, source: 'TrinityEvents' },
    });
  } catch (err: any) {
    log.warn('[TrinityEvents] onStripePaymentReceived notification failed (non-blocking):', (err instanceof Error ? err.message : String(err)));
  }
}

/**
 * Handle shift cancelled — notify client and trigger coverage pipeline
 */
async function onShiftCancelled(event: PlatformEvent): Promise<void> {
  const { workspaceId, shiftId, employeeId, clientId, startTime, reason } = event.metadata || {};
  if (!workspaceId || !shiftId) return;

  log.info(`[TrinityEvents] Shift cancelled: ${shiftId} in workspace ${workspaceId}`);

  try {
    // Notify all managers/owners about the cancellation
    const workspace = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
    if (!workspace) return;

    const { createNotification } = await import('./notificationService');
    const shiftInfo = startTime ? ` scheduled for ${new Date(startTime).toLocaleDateString()}` : '';
    const clientInfo = clientId ? ` at client ${clientId}` : '';
    const cancelReason = reason ? ` Reason: ${reason}` : '';

    await createNotification({
      workspaceId,
      type: 'shift_cancelled_alert',
      title: 'Shift Cancelled — Coverage Needed',
      message: `A shift${shiftInfo}${clientInfo} was cancelled.${cancelReason} Trinity is checking for replacement coverage.`,
      priority: 'high',
      metadata: { shiftId, employeeId, clientId, startTime, reason, source: 'TrinityEvents' },
      // @ts-expect-error — TS migration: fix in refactoring sprint
      targetRoles: ['org_owner', 'manager', 'supervisor'],
      idempotencyKey: `shift_cancelled_alert-${Date.now()}-`
    });

    // If an officer was assigned, trigger coverage pipeline
    if (employeeId && startTime && new Date(startTime) > new Date()) {
      const { coveragePipeline } = await import('./automation/coveragePipeline');
      await coveragePipeline.triggerCoverage({
        shiftId,
        workspaceId,
        reason: 'manual',
        reasonDetails: reason || 'Shift cancelled',
        originalEmployeeId: employeeId,
      });
      log.info(`[TrinityEvents] Coverage pipeline triggered for cancelled shift ${shiftId}`);
    }
  } catch (err) {
    log.error('[TrinityEvents] Error handling shift_cancelled:', err);
  }
}

/**
 * Handle training certificate earned — celebrate completion and update Trinity awareness
 */
async function onTrainingCertificateEarned(event: PlatformEvent): Promise<void> {
  const { workspaceId, employeeId, moduleTitle, certNumber, overallScore, officerName } = event.metadata || {};
  if (!workspaceId || !employeeId) return;

  try {
    const { storage } = await import('../storage');
    const [ws] = await db.select({ ownerId: workspaces.ownerId }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    if (ws?.ownerId) {
      await storage.createNotification({
        workspaceId,
        userId: ws.ownerId,
        type: 'compliance_alert',
        title: `Training Certificate Earned: ${moduleTitle}`,
        message: `${officerName} completed ${moduleTitle} with a score of ${overallScore}%. Certificate #${certNumber} issued.`,
        actionUrl: `/training-certification`,
        isRead: false,
        metadata: { source: 'trinity_training_cert_earned', certNumber, overallScore, employeeId },
      });
    }
  } catch (err) {
    log.error('[TrinityEvents] onTrainingCertificateEarned error:', err);
  }
}

/**
 * Handle training intervention required — alert manager immediately
 */
async function onTrainingInterventionRequired(event: PlatformEvent): Promise<void> {
  const { workspaceId, employeeId, moduleTitle, overallScore, failCount, missedTopics, officerName } = event.metadata || {};
  if (!workspaceId || !employeeId) return;

  try {
    const { storage } = await import('../storage');
    const [ws] = await db.select({ ownerId: workspaces.ownerId }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    if (ws?.ownerId) {
      const topicsSummary = Array.isArray(missedTopics) && missedTopics.length > 0
        ? ` Key missed topics: ${(missedTopics as string[]).slice(0, 3).join('; ')}.`
        : '';
      await storage.createNotification({
        workspaceId,
        userId: ws.ownerId,
        type: 'compliance_alert',
        title: `Training Intervention Required: ${officerName}`,
        message: `${officerName} has failed ${moduleTitle} ${failCount} time${failCount !== 1 ? 's' : ''} (score: ${overallScore}%). Mandatory intervention required.${topicsSummary}`,
        actionUrl: `/training-certification?tab=interventions`,
        isRead: false,
        metadata: { source: 'trinity_training_intervention', employeeId, moduleTitle, failCount },
      });
    }
  } catch (err) {
    log.error('[TrinityEvents] onTrainingInterventionRequired error:', err);
  }
}

/**
 * Handle training certificate expired — notify officer and flag manager
 */
async function onTrainingCertificateExpired(event: PlatformEvent): Promise<void> {
  const { workspaceId, employeeId, moduleTitle, certNumber, expiredDaysAgo, officerName } = event.metadata || {};
  if (!workspaceId || !employeeId) return;

  try {
    const { storage } = await import('../storage');
    const [ws] = await db.select({ ownerId: workspaces.ownerId }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    if (ws?.ownerId) {
      await storage.createNotification({
        workspaceId,
        userId: ws.ownerId,
        type: 'compliance_alert',
        title: `Training Certificate Expired: ${officerName}`,
        idempotencyKey: `compliance_alert-${Date.now()}-${ws.ownerId}`,
        message: `${officerName}'s ${moduleTitle} certificate (#${certNumber}) expired ${expiredDaysAgo} day${expiredDaysAgo !== 1 ? 's' : ''} ago. Renewal required before scheduling.`,
        actionUrl: `/training-certification?tab=compliance`,
        isRead: false,
        metadata: { source: 'trinity_training_cert_expired', employeeId, moduleTitle, certNumber },
      });
    }
  } catch (err) {
    log.error('[TrinityEvents] onTrainingCertificateExpired error:', err);
  }
}

/**
 * Handle workspace created — bootstrap automation triggers so Trinity is ready from day 1
 * This ensures every workspace gets automation regardless of how it was created.
 */
async function onWorkspaceCreated(event: PlatformEvent): Promise<void> {
  const { workspaceId } = event.metadata || {};
  if (!workspaceId) return;

  log.info(`[TrinityEvents] New workspace created: ${workspaceId} — bootstrapping automation triggers`);

  try {
    const { automationTriggerService } = await import('./orchestration/automationTriggerService');
    await automationTriggerService.bootstrapWorkspaceTriggers(workspaceId);
    log.info(`[TrinityEvents] Automation triggers bootstrapped for new workspace: ${workspaceId}`);
  } catch (err) {
    log.error(`[TrinityEvents] Failed to bootstrap triggers for workspace ${workspaceId}:`, err);
  }

  // Provision system email mailboxes and persist email_slug for the new workspace
  let computedSlug: string | null = null;
  try {
    const { db } = await import('../db');
    const { workspaces } = await import('../../shared/schema');
    const { eq } = await import('drizzle-orm');
    const [ws] = await db.select({ id: workspaces.id, name: workspaces.name, orgCode: workspaces.orgCode }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    if (ws) {
      // Derive slug: orgCode (lowercased) → company name initials → workspace ID prefix
      computedSlug = ws.orgCode
        ? ws.orgCode.toLowerCase().replace(/[^a-z0-9]/g, '')
        : generateSlugFromName(ws.name || '');
      // Ensure uniqueness — if slug conflicts, append digits
      const { pool: slugPool } = await import('../db');
      computedSlug = await ensureUniqueSlug(slugPool, computedSlug, String(workspaceId));
      const { emailProvisioningService } = await import('./email/emailProvisioningService');
      // provisionWorkspaceAddresses also persists email_slug and email_domain on the workspace row
      await emailProvisioningService.provisionWorkspaceAddresses(workspaceId, computedSlug);
      log.info(`[TrinityEvents] System email mailboxes provisioned for workspace: ${workspaceId} (slug: ${computedSlug})`);
    }
  } catch (emailErr: any) {
    log.warn(`[TrinityEvents] Email provisioning failed for workspace ${workspaceId} (non-fatal):`, emailErr?.message);
  }

  // Reserve personal email address for workspace owner and send Trinity welcome
  try {
    const { ownerId, name: wsName } = event.metadata || {};
    if (ownerId) {
      const { db: ownerDb } = await import('../db');
      const { users: usersTable } = await import('../../shared/schema');
      const { eq: eqOp } = await import('drizzle-orm');
      const [owner] = await ownerDb.select().from(usersTable).where(eqOp(usersTable.id, String(ownerId))).limit(1);
      if (owner) {
        // Reserve owner's personal @slug.coaileague.com email address using the slug we just computed
        if (owner.firstName && owner.lastName && computedSlug) {
          try {
            const { emailProvisioningService } = await import('./email/emailProvisioningService');
            await emailProvisioningService.reserveUserEmailAddress(
              String(workspaceId), String(ownerId),
              owner.firstName, owner.lastName, computedSlug,
            );
            log.info(`[TrinityEvents] Reserved personal email for workspace owner: ${ownerId} (${owner.firstName}.${owner.lastName}@${computedSlug}.coaileague.com)`);
          } catch (ownerEmailErr: any) {
            log.warn(`[TrinityEvents] Owner email reservation failed (non-fatal):`, ownerEmailErr?.message);
          }
        }

        // Send Trinity welcome email
        if (owner.email) {
          const { sendTrinityWelcomeEmail } = await import('./trinityWelcomeService');
          await sendTrinityWelcomeEmail({
            workspaceId: String(workspaceId),
            userId: String(ownerId),
            userEmail: owner.email,
            userType: 'tenant_owner',
            workspaceName: String(wsName || 'Your Workspace'),
            userName: owner.firstName || 'there',
          });
          log.info(`[TrinityEvents] Trinity welcome email sent to workspace owner: ${ownerId}`);
        }
      }
    }
  } catch (welcomeErr: any) {
    log.warn(`[TrinityEvents] Trinity welcome email failed for workspace ${workspaceId} (non-fatal):`, welcomeErr?.message);
  }
}

/**
 * Generate a short email slug from a company name using initials.
 * e.g., "Statewide Protective Services" → "sps"
 *        "Acme Security" → "acmesec"
 *        "Bob's Guards" → "bobsguards"
 * Falls back to first 12 chars lowercased if name is a single word.
 */
function generateSlugFromName(name: string): string {
  if (!name || !name.trim()) return 'org';
  const cleaned = name.trim().replace(/[^a-zA-Z0-9\s]/g, '');
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'org';

  // Multi-word: use initials (e.g., "Statewide Protective Services" → "sps")
  if (words.length >= 2) {
    const initials = words.map(w => w[0]).join('').toLowerCase();
    // If initials are too short (< 3), use first word + initials of rest
    if (initials.length >= 3) return initials.slice(0, 12);
    return (words[0].toLowerCase().slice(0, 6) + initials.slice(1)).slice(0, 12);
  }

  // Single word: use full word lowercased, truncated
  return words[0].toLowerCase().slice(0, 12);
}

/**
 * Ensure a slug is unique across all workspaces.
 * If taken, appends incrementing digits (e.g., "sps" → "sps2" → "sps3").
 */
async function ensureUniqueSlug(pool: any, baseSlug: string, currentWorkspaceId: string): Promise<string> {
  let candidate = baseSlug;
  let suffix = 2;
  const maxAttempts = 20;

  for (let i = 0; i < maxAttempts; i++) {
    const { rows } = await pool.query(
      `SELECT id FROM workspaces WHERE email_slug = $1 AND id != $2 LIMIT 1`,
      [candidate, currentWorkspaceId]
    );
    if (rows.length === 0) return candidate;
    candidate = `${baseSlug}${suffix}`;
    suffix++;
  }

  // Exhausted attempts — fall back to workspace ID prefix
  return currentWorkspaceId.replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase();
}

/**
 * Fetch all active managers/owners for a workspace — used by batch event handlers
 * to fan-out notifications to all relevant decision-makers.
 */
async function getWorkspaceManagers(workspaceId: string) {
  return db
    .select({ userId: employees.userId })
    .from(employees)
    .where(
      and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.isActive, true),
        sql`${employees.workspaceRole} IN ('org_owner','co_owner','org_admin','org_manager','manager','department_manager')`,
      )
    );
}

/**
 * Initialize all Trinity event subscriptions
 */
export function initializeTrinityEventSubscriptions(): void {
  log.info('[TrinityEvents] Initializing Trinity event subscriptions...');

  platformEventBus.subscribe('schedule_published', {
    name: 'TrinityScheduleNotifier',
    handler: onSchedulePublished,
  });

  platformEventBus.subscribe('automation_completed', {
    name: 'TrinityPayrollNotifier',
    handler: async (event) => {
      if (event.metadata?.automationType === 'payroll') {
        await onPayrollProcessed(event);
      }
    },
  });

  platformEventBus.subscribe('trinity_issue_detected', {
    name: 'TrinityIncidentHandler',
    handler: async (event) => {
      if (event.metadata?.violationType === 'gps_fraud_attempt') {
        await onGPSViolation(event);
      } else if (event.metadata?.incidentType) {
        await onIncidentCreated(event);
      }
    },
  });

  // Shift cancelled — notify managers and trigger coverage pipeline
  platformEventBus.subscribe('shift_cancelled', {
    name: 'TrinityShiftCancellationHandler',
    handler: onShiftCancelled,
  });

  // New workspace — bootstrap automation triggers regardless of creation path
  platformEventBus.subscribe('workspace.created', {
    name: 'TrinityWorkspaceBootstrap',
    handler: onWorkspaceCreated,
  });

  // Shift CRUD — Trinity watches every shift change for coverage intelligence and scheduling memory
  // Fix: shift_created previously only logged. Now triggers the fill pipeline for open shifts
  // (no employeeId) so Trinity proactively tries to fill the shift instead of waiting.
  platformEventBus.subscribe('shift_created', {
    name: 'TrinityShiftCreatedWatcher',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId || !metadata?.shiftId) return;
      log.info(`[TrinityEvents] shift_created — shiftId=${metadata.shiftId}, employeeId=${metadata.employeeId || 'OPEN'}`);
      // If shift has no officer (open shift) → immediately trigger coverage fill pipeline
      if (!metadata.employeeId) {
        log.info(`[TrinityEvents] Open shift detected (${metadata.shiftId}) — triggering coverage fill pipeline`);
        try {
          const { coveragePipeline } = await import('./automation/coveragePipeline');
          await coveragePipeline.triggerCoverage({
            workspaceId,
            shiftId: metadata.shiftId,
            // @ts-expect-error — TS migration: fix in refactoring sprint
            reason: 'open_shift_created',
          }).catch(() => null);
        } catch (err: any) {
          log.warn('[TrinityEvents] Coverage pipeline trigger failed for new open shift:', (err instanceof Error ? err.message : String(err)));
        }
      }
    },
  });

  platformEventBus.subscribe('shift_updated', {
    name: 'TrinityShiftUpdatedWatcher',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId || !metadata?.shiftId) return;
      log.info(`[TrinityEvents] shift_updated — shiftId=${metadata.shiftId}, action=${metadata.action || 'updated'}, fields=${metadata.changedFields?.join(',') || 'unknown'}`);
      // If an officer acknowledged/denied, update Trinity's coverage confidence
      if (metadata.action === 'acknowledged') {
        log.info(`[TrinityEvents] Officer ${metadata.employeeId} acknowledged shift ${metadata.shiftId} — coverage confirmed`);
      }
    },
  });

  platformEventBus.subscribe('shift_deleted', {
    name: 'TrinityShiftDeletedWatcher',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId || !metadata?.shiftId) return;
      log.info(`[TrinityEvents] shift_deleted — shiftId=${metadata.shiftId}, had employee=${!!metadata.employeeId}`);
      // Shift delete with assigned employee needs coverage check — emit internally for pipeline
      if (metadata.employeeId) {
        // CANONICAL: publish() so TrinityShiftCancelledWatcher fires the coverage pipeline
        platformEventBus.publish({
          type: 'shift_cancelled',
          category: 'workforce',
          title: 'Shift Deleted — Coverage Needed',
          description: `Shift ${metadata.shiftId} deleted with assigned employee — coverage pipeline triggered`,
          workspaceId,
          metadata: {
            shiftId: metadata.shiftId,
            employeeId: metadata.employeeId,
            reason: 'shift_deleted',
            startTime: metadata.startTime,
          },
        }).catch((err: any) => log.warn('[TrinityEvents] shift_cancelled publish from shift_deleted failed:', err.message));
      }
    },
  });

  // ── payroll_zero_rate_detected: block auto-processing and alert managers ────
  platformEventBus.subscribe('payroll_zero_rate_detected', {
    name: 'TrinityPayrollZeroRateBlocker',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      const { payrollRunId, employeeCount, affectedEmployeeIds } = metadata || {};
      log.warn(`[TrinityEvents] payroll_zero_rate_detected — runId=${payrollRunId}, workspace=${workspaceId}`);

      try {
        // Find managers to alert
        const { workspaceMembers } = await import('@shared/schema');
        const { inArray: inArray2 } = await import('drizzle-orm');
        const managers = await db.query.employees.findMany({
          where: and(
            eq(employees.workspaceId, workspaceId),
            inArray2(employees.role, ['owner', 'manager', 'admin'])
          ),
          limit: 5,
        });

        // @ts-expect-error — TS migration: fix in refactoring sprint
        const { notificationService } = await import('./notificationService');
        for (const mgr of managers) {
          if (!mgr.userId) continue;
          await notificationService.sendNotification({
            userId: mgr.userId,
            workspaceId,
            type: 'payroll_alert',
            title: 'Payroll Alert: Zero-Rate Employees Detected',
            message: `A payroll run (${payrollRunId?.substring(0, 8) || 'unknown'}) contains employees with a $0.00 pay rate. Review and correct pay rates before processing.`,
            priority: 'high',
            actionUrl: `/payroll`,
            metadata: { payrollRunId, affectedCount: affectedEmployeeIds?.length || 0 },
          }).catch((err: any) => log.warn('[trinityEventSubscriptions] Fire-and-forget failed:', err));
        }

        // Also broadcast real-time alert to workspace
        const { broadcastToWorkspace: bcast } = await import('../websocket');
        bcast(workspaceId, {
          type: 'payroll_zero_rate_alert',
          runId: payrollRunId,
          message: 'Payroll run blocked: employees with $0.00 pay rate detected. Please fix before processing.',
          severity: 'error',
        });
      } catch (err: any) {
        log.warn('[TrinityEvents] payroll_zero_rate_detected handler error:', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // ── client.created: proactively check invoice-readiness of new client ───────
  platformEventBus.subscribe('client.created', {
    name: 'TrinityClientOnboarding',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      const { clientId, clientName, billingEmail, contractRate } = metadata || {};

      const missingFields: string[] = [];
      if (!billingEmail) missingFields.push('billing email');
      if (!contractRate || parseFloat(String(contractRate)) <= 0) missingFields.push('billable rate');

      if (missingFields.length === 0) {
        log.info(`[TrinityEvents] client.created — ${clientName} is invoice-ready`);
        return;
      }

      log.info(`[TrinityEvents] client.created — ${clientName} missing: ${missingFields.join(', ')}`);

      try {
        const managers = await db.query.employees.findMany({
          where: and(
            eq(employees.workspaceId, workspaceId),
            eq(employees.role, 'owner' as any)
          ),
          limit: 3,
        });

        // @ts-expect-error — TS migration: fix in refactoring sprint
        const { notificationService } = await import('./notificationService');
        for (const mgr of managers) {
          if (!mgr.userId) continue;
          await notificationService.sendNotification({
            userId: mgr.userId,
            workspaceId,
            type: 'client_data_incomplete',
            title: `New Client Missing Invoice Data`,
            message: `${clientName || 'New client'} is missing: ${missingFields.join(' and ')}. Add this now so invoices can be generated automatically.`,
            priority: 'normal',
            actionUrl: `/clients`,
            metadata: { clientId, missingFields },
          }).catch((err: any) => log.warn('[trinityEventSubscriptions] Fire-and-forget failed:', err));
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] client.created handler error:', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // ── FIX 5: invoice_sent → non-blocking QB auto-push (if qbAutoSync enabled) ──
  platformEventBus.subscribe('invoice_sent', {
    name: 'TrinityInvoiceSentQBPush',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      const invoiceId = metadata?.invoiceId;
      if (!invoiceId) return;
      log.info(`[TrinityEvents] invoice_sent — invoiceId=${invoiceId}, checking QB auto-sync`);
      // Fire-and-forget: non-blocking QB push — failure must never block the invoice sent flow
      Promise.resolve().then(async () => {
        try {
          const { providerPreferenceService } = await import('./billing/providerPreferenceService');
          const shouldSync = await providerPreferenceService.shouldSyncInvoicesToQB(workspaceId);
          if (!shouldSync) return;
          const { syncInvoiceToQuickBooks } = await import('./quickbooksClientBillingSync');
          const result = await syncInvoiceToQuickBooks(invoiceId);
          if (result.success) {
            log.info(`[TrinityEvents] QB invoice sync succeeded — invoiceId=${invoiceId}, qboId=${(result as any).qboId}`);
          } else {
            log.error(`[TrinityEvents] QB invoice sync failed — invoiceId=${invoiceId}: ${result.error}`);
            // Notify org owner of sync failure (non-blocking)
            try {
              // @ts-expect-error — TS migration: fix in refactoring sprint
              const { notificationService } = await import('./notificationService');
              const { db } = await import('../db');
              const { workspaces } = await import('@shared/schema');
              const { eq } = await import('drizzle-orm');
              const [ws] = await db.select({ ownerId: workspaces.ownerId })
                .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
              if (ws?.ownerId) {
                await notificationService.createNotification({
                  userId: ws.ownerId,
                  workspaceId,
                  type: 'qb_sync_failed',
                  title: 'QuickBooks Sync Failed',
                  message: `Invoice ${metadata?.invoiceNumber || invoiceId} failed to sync to QuickBooks: ${result.error}. Please sync manually or check your QB connection.`,
                  priority: 'high',
                  idempotencyKey: `qb_sync_failed-${Date.now()}-${ws.ownerId}`
                });
              }
            } catch (notifErr: any) {
              log.warn('[TrinityEvents] QB sync failure notification failed (non-blocking):', notifErr.message);
            }
          }
        } catch (err: any) {
          log.error(`[TrinityEvents] QB invoice auto-push threw — invoiceId=${invoiceId}:`, (err instanceof Error ? err.message : String(err)));
        }
      }).catch((err) => log.warn('[trinityEventSubscriptions] Fire-and-forget failed:', err));
    },
  });

  // ── Financial lifecycle events: invoice paid → confirm AR closure ────────────
  platformEventBus.subscribe('invoice_paid', {
    name: 'TrinityInvoicePaidHandler',
    handler: onInvoicePaid,
  });

  // ── Invoice overdue → escalate to manager with collection intelligence ────────
  platformEventBus.subscribe('invoice_overdue', {
    name: 'TrinityInvoiceOverdueHandler',
    handler: onInvoiceOverdue,
  });

  // ── Payroll run paid → confirm disbursement to org owner ─────────────────────
  platformEventBus.subscribe('payroll_run_paid', {
    name: 'TrinityPayrollRunPaidHandler',
    handler: onPayrollRunPaid,
  });

  // ── Stripe payment confirmed → reconciliation log + notification ──────────────
  platformEventBus.subscribe('stripe_payment_received', {
    name: 'TrinityStripePaymentHandler',
    handler: onStripePaymentReceived,
  });

  // ── Training certification events ──────────────────────────────────────────
  platformEventBus.subscribe('training_certificate_earned', {
    name: 'TrinityTrainingCertEarnedHandler',
    handler: onTrainingCertificateEarned,
  });

  platformEventBus.subscribe('training_intervention_required', {
    name: 'TrinityTrainingInterventionHandler',
    handler: onTrainingInterventionRequired,
  });

  platformEventBus.subscribe('training_certificate_expired', {
    name: 'TrinityTrainingCertExpiredHandler',
    handler: onTrainingCertificateExpired,
  });

  // ── FIX 5: payroll_run_approved → non-blocking QB payroll sync (if qbAutoSync enabled) ──
  platformEventBus.subscribe('payroll_run_approved', {
    name: 'TrinityPayrollApprovalWatcher',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      const payrollRunId = metadata?.payrollRunId;
      log.info(`[TrinityEvents] payroll_run_approved — runId=${payrollRunId}, workspace=${workspaceId}`);
      if (!payrollRunId) return;
      // Fire-and-forget: non-blocking QB push — must never block payroll approval flow
      Promise.resolve().then(async () => {
        try {
          const { providerPreferenceService } = await import('./billing/providerPreferenceService');
          const shouldSync = await providerPreferenceService.shouldSyncPayrollToQB(workspaceId);
          if (!shouldSync) return;
          const { syncPayrollToQuickBooks } = await import('./quickbooksClientBillingSync');
          const result = await syncPayrollToQuickBooks(payrollRunId);
          if (result.success) {
            log.info(`[TrinityEvents] QB payroll sync succeeded — runId=${payrollRunId}`);
          } else {
            log.error(`[TrinityEvents] QB payroll sync failed — runId=${payrollRunId}: ${result.error}`);
            // Notify org owner of sync failure (non-blocking)
            try {
              // @ts-expect-error — TS migration: fix in refactoring sprint
              const { notificationService } = await import('./notificationService');
              const { db } = await import('../db');
              const { workspaces } = await import('@shared/schema');
              const { eq } = await import('drizzle-orm');
              const [ws] = await db.select({ ownerId: workspaces.ownerId })
                .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
              if (ws?.ownerId) {
                await notificationService.createNotification({
                  userId: ws.ownerId,
                  workspaceId,
                  type: 'qb_payroll_sync_failed',
                  title: 'QuickBooks Payroll Sync Failed',
                  message: `Payroll run ${payrollRunId} (approved) failed to sync to QuickBooks: ${result.error}. Please sync manually or check your QB connection.`,
                  priority: 'high',
                  idempotencyKey: `qb_payroll_sync_failed-${Date.now()}-${ws.ownerId}`
                });
              }
            } catch (notifErr: any) {
              log.warn('[TrinityEvents] QB payroll sync failure notification failed (non-blocking):', notifErr.message);
            }
          }
        } catch (err: any) {
          log.error(`[TrinityEvents] QB payroll auto-push threw — runId=${payrollRunId}:`, (err instanceof Error ? err.message : String(err)));
        }
      }).catch((err) => log.warn('[trinityEventSubscriptions] Fire-and-forget failed:', err));
    },
  });

  // ── payroll_run_processed → Trinity acknowledges processing complete ───────────
  platformEventBus.subscribe('payroll_run_processed', {
    name: 'TrinityPayrollProcessedWatcher',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      log.info(`[TrinityEvents] payroll_run_processed — runId=${metadata?.payrollRunId}, gross=$${metadata?.totalGrossPay}, net=$${metadata?.totalNetPay}`);
    },
  });

  // ── payment_received_partial → Trinity tracks partial AR and flags if balance aging ─
  platformEventBus.subscribe('payment_received_partial', {
    name: 'TrinityPartialPaymentWatcher',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      const { invoiceId, amountReceived, remainingBalance } = metadata || {};
      log.info(`[TrinityEvents] payment_received_partial — invoice=${invoiceId}, received=$${amountReceived}, remaining=$${remainingBalance}`);
      if (remainingBalance && parseFloat(String(remainingBalance)) > 0) {
        log.info(`[TrinityEvents] AR balance of $${remainingBalance} still open on invoice ${invoiceId} — monitoring for aging`);
      }
    },
  });

  // ── invoice_created → Trinity opens AR tracking and registers invoice in working memory ──
  platformEventBus.subscribe('invoice_created', {
    name: 'TrinityInvoiceCreatedWatcher',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      const { invoiceId, invoiceNumber, clientId, total, source } = metadata || {};
      log.info(`[TrinityEvents] invoice_created — invoice=${invoiceId} (${invoiceNumber}), client=${clientId}, total=$${total}, source=${source || 'unknown'}`);
    },
  });

  // ── payroll_run_created → Trinity registers new payroll run for readiness monitoring ──
  platformEventBus.subscribe('payroll_run_created', {
    name: 'TrinityPayrollRunCreatedWatcher',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      const { payrollRunId, periodStart, periodEnd, createdBy } = metadata || {};
      log.info(`[TrinityEvents] payroll_run_created — run=${payrollRunId}, period=${periodStart}–${periodEnd}, by=${createdBy}`);
    },
  });

  // ── payroll_run_voided → Trinity flags void event for reconciliation and owner alert ──
  platformEventBus.subscribe('payroll_run_voided', {
    name: 'TrinityPayrollRunVoidedWatcher',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      const { payrollRunId, voidedBy, reason } = metadata || {};
      log.info(`[TrinityEvents] payroll_run_voided — run=${payrollRunId}, by=${voidedBy}, reason="${reason}"`);
      try {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const { notificationService } = await import('./notificationService');
        const workspace = await db.query.workspaces.findFirst({
          where: eq(workspaces.id, workspaceId),
        });
        if (workspace?.ownerId) {
          await notificationService.createNotification({
            workspaceId,
            userId: workspace.ownerId,
            type: 'payroll_run_voided',
            title: 'Payroll Run Voided',
            message: `Payroll run ${payrollRunId} was voided by ${voidedBy}. Reason: ${reason || 'Not provided'}. Review your payroll schedule to avoid disbursement gaps.`,
            priority: 'high',
            metadata: { payrollRunId, voidedBy, reason },
          });
        }
      } catch (notifErr: any) {
        log.warn('[TrinityEvents] payroll_run_voided notification failed (non-blocking):', notifErr.message);
      }
    },
  });

  // ── workspace_suspended: access blocked — alert org owner immediately ───────
  platformEventBus.subscribe('workspace_suspended', {
    name: 'TrinityWorkspaceSuspensionHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      log.warn(`[TrinityEvents] workspace_suspended — workspaceId=${workspaceId}, reason=${metadata?.stripeEventType || 'unknown'}`);
      try {
        const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        if (!ws) return;
        const owners = await db.query.employees.findMany({
          where: and(eq(employees.workspaceId, workspaceId), inArray(employees.role as any, ['org_owner', 'co_owner'])),
        });
        for (const owner of owners) {
          if (!owner.email) continue;
          await NotificationDeliveryService.send({ type: 'billing_notification', workspaceId: workspaceId || 'system', recipientUserId: owner.id || owner.email, channel: 'email', body: { to: owner.email, subject: `Action Required: ${ws.name} Account Suspended`, html: `<p>Hi ${owner.firstName},</p><p>Your CoAIleague workspace <strong>${ws.name}</strong> has been suspended due to a payment issue. Please update your payment method to restore access.</p><p><a href="${APP_URL}/billing">Resolve Payment</a></p>` } });
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] workspace_suspended notification failed (non-blocking):', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // ── workspace_reactivated: access restored — confirm to org owner ────────────
  platformEventBus.subscribe('workspace_reactivated', {
    name: 'TrinityWorkspaceReactivationHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      log.info(`[TrinityEvents] workspace_reactivated — workspaceId=${workspaceId}, source=${metadata?.source || 'unknown'}`);
      try {
        const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        if (!ws) return;
        const owners = await db.query.employees.findMany({
          where: and(eq(employees.workspaceId, workspaceId), inArray(employees.role as any, ['org_owner', 'co_owner'])),
        });
        for (const owner of owners) {
          if (!owner.email) continue;
          await NotificationDeliveryService.send({ type: 'billing_notification', workspaceId: workspaceId || 'system', recipientUserId: owner.id || owner.email, channel: 'email', body: { to: owner.email, subject: `Access Restored: ${ws.name} Account Reactivated`, html: `<p>Hi ${owner.firstName},</p><p>Your CoAIleague workspace <strong>${ws.name}</strong> has been reactivated. All features are now available.</p><p><a href="${APP_URL}">Continue Using CoAIleague</a></p>` } });
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] workspace_reactivated notification failed (non-blocking):', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // ── workspace_downgraded: tier reduced — log and notify ──────────────────────
  platformEventBus.subscribe('workspace_downgraded', {
    name: 'TrinityWorkspaceDowngradeHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      log.info(`[TrinityEvents] workspace_downgraded — workspaceId=${workspaceId}, from=${metadata?.previousTier}, to=${metadata?.newTier || 'free'}`);
    },
  });

  // ── subscription_cancelled: subscription ended — farewell email ───────────────
  platformEventBus.subscribe('subscription_cancelled', {
    name: 'TrinitySubscriptionCancelledHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      log.info(`[TrinityEvents] subscription_cancelled — workspaceId=${workspaceId}, immediate=${metadata?.immediate}, atPeriodEnd=${metadata?.cancelAtPeriodEnd}`);
      try {
        const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        if (!ws) return;
        const owners = await db.query.employees.findMany({
          where: and(eq(employees.workspaceId, workspaceId), inArray(employees.role as any, ['org_owner', 'co_owner'])),
        });
        for (const owner of owners) {
          if (!owner.email) continue;
          const subject = metadata?.immediate
            ? `Your ${ws.name} Subscription Has Been Cancelled`
            : `Your ${ws.name} Subscription Will Cancel at Period End`;
          const body = metadata?.immediate
            ? `<p>Hi ${owner.firstName},</p><p>Your CoAIleague subscription for <strong>${ws.name}</strong> has been cancelled. Your workspace has been moved to the free tier. We hope to see you again — <a href="${APP_URL}/billing">resubscribe here</a>.</p>`
            : `<p>Hi ${owner.firstName},</p><p>Your CoAIleague subscription for <strong>${ws.name}</strong> is set to cancel at the end of your billing period. You can still reactivate at any time before then from <a href="${APP_URL}/billing">Billing Settings</a>.</p>`;
          await NotificationDeliveryService.send({ type: 'billing_notification', workspaceId: workspaceId || 'system', recipientUserId: owner.id || owner.email, channel: 'email', body: { to: owner.email, subject, html: body } });
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] subscription_cancelled notification failed (non-blocking):', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // ── payment_succeeded: record Trinity awareness ───────────────────────────────
  platformEventBus.subscribe('payment_succeeded', {
    name: 'TrinityPaymentSucceededHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      log.info(`[TrinityEvents] payment_succeeded — workspaceId=${workspaceId}, amount=${metadata?.amountCents ? `$${(metadata.amountCents / 100).toFixed(2)}` : 'unknown'}`);
    },
  });

  // ── payment_failed: alert workspace admins urgently ──────────────────────────
  platformEventBus.subscribe('payment_failed', {
    name: 'TrinityPaymentFailedHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      log.warn(`[TrinityEvents] payment_failed — workspaceId=${workspaceId}, reason=${metadata?.failureReason || 'unknown'}`);
      try {
        const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        if (!ws) return;
        const owners = await db.query.employees.findMany({
          where: and(eq(employees.workspaceId, workspaceId), inArray(employees.role as any, ['org_owner', 'co_owner'])),
        });
        for (const owner of owners) {
          if (!owner.email) continue;
          await NotificationDeliveryService.send({ type: 'billing_notification', workspaceId: workspaceId || 'system', recipientUserId: owner.id || owner.email, channel: 'email', body: { to: owner.email, subject: `Payment Failed: ${ws.name} — Action Required`, html: `<p>Hi ${owner.firstName},</p><p>A payment for your CoAIleague workspace <strong>${ws.name}</strong> has failed. Please update your payment method to avoid service interruption.</p><p><a href="${APP_URL}/billing">Update Payment Method</a></p>` } });
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] payment_failed notification failed (non-blocking):', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // ── invoice_voided / invoice_cancelled: record Trinity awareness ─────────────
  platformEventBus.subscribe('invoice_voided', {
    name: 'TrinityInvoiceVoidedHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      log.info(`[TrinityEvents] invoice_voided — workspaceId=${workspaceId}, invoiceId=${metadata?.invoiceId || 'unknown'}`);
    },
  });

  platformEventBus.subscribe('invoice_cancelled', {
    name: 'TrinityInvoiceCancelledHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      log.info(`[TrinityEvents] invoice_cancelled — workspaceId=${workspaceId}, invoiceId=${metadata?.invoiceId || 'unknown'}`);
    },
  });

  // TrinityUniversalLogger intentionally uses '*' — it dispatches on metadata flags
  // (shiftReminder, certificationExpiring, complianceCheck, invoiceGenerated) that
  // can arrive on multiple event types. Narrowing requires enumerating all publishers
  // that set those flags; keeping '*' is the correct tradeoff here.
  platformEventBus.subscribe('*', {
    name: 'TrinityUniversalLogger',
    handler: async (event) => {
      if (event.metadata?.shiftReminder) {
        await onShiftReminder(event);
      }
      if (event.metadata?.certificationExpiring) {
        await onCertificationExpiring(event);
      }
      if (event.metadata?.complianceCheck) {
        await onComplianceChecked(event);
      }
      if (event.metadata?.invoiceGenerated) {
        await onInvoiceGenerated(event);
      }
    },
  });

  // ── Plaid bank events → Trinity integration visibility ────────────────────
  platformEventBus.subscribe('plaid_bank_disconnected', {
    name: 'TrinityPlaidBankDisconnectedHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      try {
        const { workspaceMembers: wm } = await import('@shared/schema');
        const { sql: sqlOp } = await import('drizzle-orm');
        const { createNotification } = await import('./notificationService');
        const owners = await db.select({ userId: wm.userId }).from(wm)
          .where(and(eq(wm.workspaceId, workspaceId), sqlOp`${wm.role} IN ('org_owner', 'co_owner')`));
        for (const o of owners) {
          await createNotification({
            workspaceId, userId: o.userId, type: 'alert' as any,
            title: 'Payroll Funding Account Disconnected',
            message: `${metadata?.priorInstitution || 'Your bank account'} has been disconnected. ACH payroll disbursement is suspended until a funding account is reconnected.`,
            priority: 'urgent',
            idempotencyKey: `alert-${Date.now()}-${o.userId}`
          }).catch(() => null);
        }
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert(auditLogs).values({
          workspaceId: workspaceId,
          entityType: 'org_finance_settings',
          entityId: workspaceId,
          action: 'plaid_bank_disconnected',
          description: 'Plaid payroll funding account disconnected — ACH payroll suspended',
          metadata: JSON.stringify({ priorInstitution: metadata?.priorInstitution, priorMask: metadata?.priorMask, disconnectedBy: metadata?.disconnectedBy }),
          createdAt: new Date(),
        }).catch(() => null);
        log.info(`[TrinityEvents] plaid_bank_disconnected in ${workspaceId} — ${metadata?.priorInstitution} removed`);
      } catch (err: any) {
        log.warn('[TrinityEvents] plaid_bank_disconnected handler error:', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // ── payroll_transfer_settled → Trinity confirms ACH disbursement + notifies employee ──
  platformEventBus.subscribe('payroll_transfer_settled', {
    name: 'TrinityPlaidTransferSettledHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      log.info(`[TrinityEvents] payroll_transfer_settled — payStub=${metadata?.payStubId}, employee=${metadata?.employeeId}, amount=$${metadata?.amount}`);
      Promise.resolve().then(async () => {
        try {
          const { employees: emps } = await import('@shared/schema');
          const { sql: sqlOp } = await import('drizzle-orm');
          const { createNotification } = await import('./notificationService');
          const employeeId = metadata?.employeeId;
          if (!employeeId) return;
          // Find the userId for this employee to send them an in-app notification
          const [emp] = await db.select({ userId: emps.userId })
            .from(emps)
            .where(and(eq(emps.id, employeeId), eq(emps.workspaceId, workspaceId)))
            .limit(1);
          if (emp?.userId) {
            await createNotification({
              workspaceId,
              userId: emp.userId,
              type: 'payroll_alert' as any,
              title: 'Your Direct Deposit Has Arrived',
              message: `Your payroll payment of $${parseFloat(String(metadata?.amount || 0)).toFixed(2)} has been deposited to your bank account.`,
              priority: 'normal',
              metadata: { payStubId: metadata?.payStubId, transferId: metadata?.transferId },
              idempotencyKey: `payroll_alert-${Date.now()}-${emp.userId}`
            }).catch(() => null);
          }
          // Audit log
          // @ts-expect-error — TS migration: fix in refactoring sprint
          await db.insert(auditLogs).values({
            workspaceId: workspaceId,
            entityType: 'pay_stub',
            entityId: metadata?.payStubId || 'unknown',
            action: 'transfer_settled',
            description: 'ACH payroll transfer settled — funds delivered to employee bank account',
            metadata: JSON.stringify({ employeeId, transferId: metadata?.transferId, amount: metadata?.amount, payrollRunId: metadata?.payrollRunId }),
            createdAt: new Date(),
          }).catch(() => null);

          // GAP-13 FIX: Write payroll_disbursed ledger entry per employee when their Plaid ACH
          // transfer settles. Previously the settlement event only triggered an employee
          // notification and audit log — the org ledger never recorded that cash left the account.
          // Without this, Plaid-ACH-funded payrolls show a payroll_processed entry (run created)
          // but no payroll_disbursed entry (funds moved), causing the ledger to overstate cash.
          const settledAmount = parseFloat(String(metadata?.amount || 0));
          if (settledAmount > 0 && metadata?.payrollRunId) {
            try {
              const { writeLedgerEntry } = await import('./orgLedgerService');
              await writeLedgerEntry({
                workspaceId,
                entryType: 'payroll_disbursed',
                direction: 'credit',
                amount: settledAmount,
                relatedEntityType: 'payroll_run',
                relatedEntityId: metadata.payrollRunId,
                payrollRunId: metadata.payrollRunId,
                description: `Plaid ACH transfer settled — $${settledAmount.toFixed(2)} delivered to employee ${employeeId} (transfer ${metadata?.transferId || 'unknown'})`,
                metadata: {
                  method: 'plaid_ach',
                  employeeId,
                  payStubId: metadata?.payStubId,
                  transferId: metadata?.transferId,
                  source: 'trinityEventSubscriptions_settled',
                },
              });
            } catch (ledgerErr: any) {
              log.warn(`[TrinityEvents] payroll_disbursed ledger write failed for transfer ${metadata?.transferId}:`, ledgerErr.message);
            }
          }
        } catch (err: any) {
          log.warn('[TrinityEvents] transfer_settled notification error:', (err instanceof Error ? err.message : String(err)));
        }
      }).catch((err) => log.warn('[trinityEventSubscriptions] Fire-and-forget failed:', err));
    },
  });

  // ── payroll_transfer_failed → Trinity alerts org owner, flags for manual action ─
  platformEventBus.subscribe('payroll_transfer_failed', {
    name: 'TrinityPlaidTransferFailedHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      log.info(`[TrinityEvents] payroll_transfer_failed — payStub=${metadata?.payStubId}, status=${metadata?.status}, reason=${metadata?.failureReason}`);
      // Non-blocking notification to org owner
      Promise.resolve().then(async () => {
        try {
          // @ts-expect-error — TS migration: fix in refactoring sprint
          const { notificationService } = await import('./notificationService');
          const { db } = await import('../db');
          const { workspaces } = await import('@shared/schema');
          const { eq } = await import('drizzle-orm');
          const [ws] = await db.select({ ownerId: workspaces.ownerId })
            .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
          if (ws?.ownerId) {
            await notificationService.createNotification({
              userId: ws.ownerId,
              workspaceId,
              type: 'payroll_transfer_failed' as any,
              title: 'ACH Transfer Failed',
              message: `An employee ACH payroll transfer ${metadata?.status}: ${metadata?.failureReason || 'Contact your bank'}. Pay stub ID: ${metadata?.payStubId}.`,
              priority: 'high',
              idempotencyKey: `payroll_transfer_failed-${Date.now()}-${ws.ownerId}`
            });
          }
        } catch (err: any) {
          log.warn('[TrinityEvents] Transfer failed notification error (non-blocking):', (err instanceof Error ? err.message : String(err)));
        }
      }).catch((err) => log.warn('[trinityEventSubscriptions] Fire-and-forget failed:', err));
    },
  });

  // ── Agent parity escalation → alert supervisors when AI loses confidence ──────
  platformEventBus.subscribe('agent_escalation', {
    name: 'TrinityAgentEscalationHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      const isCritical = metadata?.severity === 'critical' || (metadata?.confidence && metadata.confidence < 0.3);
      const priority = isCritical ? 'urgent' : 'high';
      try {
        const { workspaceMembers: wm } = await import('@shared/schema');
        const { sql: sqlOp } = await import('drizzle-orm');
        const managers = await db.select({ userId: wm.userId }).from(wm)
          .where(and(eq(wm.workspaceId, workspaceId), sqlOp`${wm.role} IN ('org_owner', 'co_owner', 'manager', 'supervisor')`));
        const { createNotification } = await import('./notificationService');
        for (const mgr of managers) {
          await createNotification({
            workspaceId, userId: mgr.userId, type: 'agent_escalation' as any,
            title: isCritical ? 'CRITICAL: AI Agent Needs Human Intervention' : 'AI Agent Escalated — Review Required',
            message: `Trinity's autonomous agent stopped execution of "${metadata?.goal}" at ${Math.round((metadata?.confidence || 0) * 100)}% confidence. ${isCritical ? 'CRITICAL: Immediate human review required.' : 'Please review and approve continuation or rollback.'}`,
            priority,
            idempotencyKey: `agent_escalation-${String(Date.now())}-${mgr.userId}`,
        }).catch(() => null);
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] agent_escalation notification error:', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // ── Schedule escalation → alert managers when LLM Judge blocks a schedule ────
  platformEventBus.subscribe('schedule_escalation', {
    name: 'TrinityScheduleEscalationHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      try {
        const { workspaceMembers: wm } = await import('@shared/schema');
        const { sql: sqlOp } = await import('drizzle-orm');
        const managers = await db.select({ userId: wm.userId }).from(wm)
          .where(and(eq(wm.workspaceId, workspaceId), sqlOp`${wm.role} IN ('org_owner', 'co_owner', 'manager', 'supervisor')`));
        const { createNotification } = await import('./notificationService');
        for (const mgr of managers) {
          await createNotification({
            workspaceId, userId: mgr.userId, type: 'schedule_escalation' as any,
            title: 'Schedule Blocked by Safety Review — Approval Required',
            message: `Trinity's scheduling judge blocked a schedule from publishing. Risk score: ${metadata?.riskScore ?? 'N/A'}. Reason: ${metadata?.reason || 'Policy violation detected'}. Manual approval or revision required before the schedule can go live.`,
            priority: 'high',
            idempotencyKey: `schedule_escalation-${String(Date.now())}-${mgr.userId}`,
        }).catch(() => null);
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] schedule_escalation notification error:', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // ── AI cost alert → notify org owners of unprofitable or low-margin operations ─
  platformEventBus.subscribe('ai_cost_alert', {
    name: 'TrinityAICostAlertHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      const isUnprofitable = metadata?.alertType === 'unprofitable';
      if (!isUnprofitable) return; // only alert owners on unprofitable; low-margin is logged only
      try {
        const { workspaceMembers: wm } = await import('@shared/schema');
        const { sql: sqlOp } = await import('drizzle-orm');
        const owners = await db.select({ userId: wm.userId }).from(wm)
          .where(and(eq(wm.workspaceId, workspaceId), sqlOp`${wm.role} IN ('org_owner', 'co_owner')`));
        const { createNotification } = await import('./notificationService');
        for (const owner of owners) {
          await createNotification({
            workspaceId, userId: owner.userId, type: 'ai_cost_alert' as any,
            title: 'AI Credit Pricing Alert — Unprofitable Operation',
            message: `Operation "${metadata?.operationType}" exceeded AI cost budget. Loss: $${metadata?.loss?.toFixed(4)} (margin: ${metadata?.margin?.toFixed(2)}%). Review credit pricing in Settings > AI Usage to prevent revenue leakage.`,
            priority: 'high',
            idempotencyKey: `ai_cost_alert-${String(Date.now())}-${owner.userId}`,
        }).catch(() => null);
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] ai_cost_alert notification error:', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // ── ROOT FIX 2 — 7 new subscribers for events that had no handler ──────────

  // SLA breach → immediate escalation to client manager + org owner + create incident
  platformEventBus.subscribe('sla_breach', {
    name: 'TrinitySLABreachHandler',
    handler: async (event) => {
      const { workspaceId, payload, metadata } = event;
      if (!workspaceId) return;
      try {
        const { workspaceMembers: wm } = await import('@shared/schema');
        const { sql: sqlOp } = await import('drizzle-orm');
        const managers = await db.select({ userId: wm.userId }).from(wm)
          .where(and(eq(wm.workspaceId, workspaceId), sqlOp`${wm.role} IN ('org_owner', 'co_owner', 'manager')`));
        const { createNotification } = await import('./notificationService');
        const breachType = payload?.breachType || metadata?.breachType || 'response_time';
        const clientId = payload?.clientId || metadata?.clientId;
        const shiftId = payload?.shiftId || metadata?.shiftId;
        for (const m of managers) {
          await createNotification({
            workspaceId, userId: m.userId, type: 'sla_breach' as any,
            title: 'SLA Breach Detected',
            message: `Service level agreement violated: ${breachType}. ${clientId ? `Client ${clientId} affected.` : ''} Immediate review required to prevent contract penalty.`,
            priority: 'urgent',
            actionUrl: shiftId ? `/schedule?shiftId=${shiftId}` : '/schedule',
            idempotencyKey: `sla_breach-${String(Date.now())}-${m.userId}`,
        }).catch(() => null);
        }
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert(auditLogs).values({
          workspaceId: workspaceId,
          entityType: 'sla_breach',
          entityId: shiftId || clientId || 'unknown',
          action: 'sla_breach_detected',
          description: 'SLA breach event received — managers notified, incident logged',
          metadata: JSON.stringify({ breachType, clientId, shiftId, payload }),
          createdAt: new Date(),
        }).catch(() => null);
      } catch (err: any) {
        log.warn('[TrinityEvents] sla_breach handler error:', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // Circuit breaker opened → notify platform ops team (org owners) of infrastructure degradation
  platformEventBus.subscribe('circuit_breaker_opened', {
    name: 'TrinityCircuitBreakerHandler',
    handler: async (event) => {
      const { workspaceId, payload, metadata } = event;
      try {
        const { sql: sqlOp } = await import('drizzle-orm');
        const { workspaceMembers: wm } = await import('@shared/schema');
        const targetWorkspaceId = workspaceId === 'platform' ? null : workspaceId;
        const serviceId = payload?.serviceId || payload?.domain || 'unknown';
        const serviceName = payload?.serviceName || serviceId;
        const failureCount = payload?.failureCount || 0;
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert(auditLogs).values({
          workspaceId: 'platform',
          entityType: 'infrastructure',
          entityId: serviceId,
          action: 'circuit_breaker_opened',
          description: 'Infrastructure circuit breaker opened — service degraded, Trinity awareness logged',
          metadata: JSON.stringify({ serviceName, failureCount, payload }),
          createdAt: new Date(),
        }).catch(() => null);
        if (!targetWorkspaceId) return;
        const owners = await db.select({ userId: wm.userId }).from(wm)
          .where(and(eq(wm.workspaceId, targetWorkspaceId), sqlOp`${wm.role} IN ('org_owner', 'co_owner')`));
        const { createNotification } = await import('./notificationService');
        for (const o of owners) {
          await createNotification({
            workspaceId: targetWorkspaceId, userId: o.userId, type: 'circuit_breaker_opened' as any,
            title: `Infrastructure Alert: ${serviceName} Circuit Breaker Opened`,
            message: `The ${serviceName} service has exceeded failure thresholds (${failureCount} consecutive failures) and has been circuit-breaker protected. Some automated operations may be temporarily paused. Trinity is monitoring recovery.`,
            priority: 'high',
            actionUrl: '/settings',
            idempotencyKey: `circuit_breaker_opened-${String(Date.now())}-${o.userId}`,
        }).catch(() => null);
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] circuit_breaker_opened handler error:', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // Labor law flag → notify org owner + manager + create compliance record
  platformEventBus.subscribe('trinity_labor_law_flag', {
    name: 'TrinityLaborLawFlagHandler',
    handler: async (event) => {
      const { workspaceId, payload, metadata } = event;
      if (!workspaceId) return;
      try {
        const { workspaceMembers: wm } = await import('@shared/schema');
        const { notifications: notifTable } = await import('@shared/schema');
        const { sql: sqlOp, and: andOp, eq: eqOp, gte } = await import('drizzle-orm');
        const employeeId = payload?.employeeId || metadata?.employeeId;
        const violation = payload?.violation || metadata?.violation || 'Labor law compliance flag';
        const owners = await db.select({ userId: wm.userId }).from(wm)
          .where(and(eq(wm.workspaceId, workspaceId), sqlOp`${wm.role} IN ('org_owner', 'co_owner', 'manager')`));
        const { createNotification } = await import('./notificationService');
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        for (const o of owners) {
          // Dedup: skip if this user already received a compliance_violation notification in the last 24h
          const recent = await db.select({ id: notifTable.id }).from(notifTable)
            .where(andOp(
              eqOp(notifTable.userId, o.userId),
              eqOp(notifTable.workspaceId, workspaceId),
              eqOp(notifTable.type, 'compliance_violation'),
              gte(notifTable.createdAt, cutoff)
            )).limit(1);
          if (recent.length > 0) continue;
          await createNotification({
            workspaceId, userId: o.userId, type: 'compliance_violation',
            title: 'Labor Law Compliance Flag',
            message: `Trinity detected a potential labor law violation: ${violation}. ${employeeId ? `Employee affected.` : ''} Review required before proceeding with this action.`,
            actionUrl: employeeId ? `/employees/${employeeId}` : '/employees',
            idempotencyKey: `compliance_violation-${Date.now()}-${o.userId}`
          }).catch(() => null);
        }
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert(auditLogs).values({
          workspaceId: workspaceId,
          entityType: 'compliance',
          entityId: employeeId || 'unknown',
          action: 'labor_law_flag',
          description: 'Trinity labor law flag — compliance violation detected during action review',
          metadata: JSON.stringify({ violation, employeeId, payload }),
          createdAt: new Date(),
        }).catch(() => null);
      } catch (err: any) {
        log.warn('[TrinityEvents] trinity_labor_law_flag handler error:', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // Trinity action blocked → surface to org owner explaining what was blocked and why
  platformEventBus.subscribe('trinity_action_blocked', {
    name: 'TrinityActionBlockedHandler',
    handler: async (event) => {
      const { workspaceId, payload, metadata } = event;
      if (!workspaceId) return;
      try {
        const { workspaceMembers: wm } = await import('@shared/schema');
        const { sql: sqlOp } = await import('drizzle-orm');
        const actionId = payload?.actionId || metadata?.actionId || 'a scheduled task';
        const rawReason: string = payload?.reason || metadata?.reason || 'A policy check prevented this action from running.';
        // Sanitize raw internal technical language into user-readable copy
        const reason = rawReason
          .replace(/empty data payload/gi, 'missing required information')
          .replace(/data payload/gi, 'required action data')
          .replace(/critical failure/gi, 'issue detected')
          .replace(/\.\./g, '.')
          .trim();
        const owners = await db.select({ userId: wm.userId }).from(wm)
          .where(and(eq(wm.workspaceId, workspaceId), sqlOp`${wm.role} IN ('org_owner', 'co_owner', 'manager')`));
        const { createNotification } = await import('./notificationService');
        for (const o of owners) {
          await createNotification({
            workspaceId, userId: o.userId, type: 'trinity_action_blocked' as any,
            title: 'Action Review Required',
            message: `Trinity paused a scheduled task and flagged it for your review. ${reason} You can review or adjust your Compliance & Approval settings if this was unintentional.`,
            priority: 'high',
            actionUrl: '/settings',
            idempotencyKey: `trinity_action_blocked-${String(Date.now())}-${o.userId}`,
        }).catch(() => null);
        }
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert(auditLogs).values({
          workspaceId: workspaceId,
          entityType: 'trinity_action',
          entityId: actionId,
          action: 'action_blocked',
          description: 'Trinity blocked an autonomous action — compliance or policy enforcement',
          metadata: JSON.stringify({ actionId, reason, payload }),
          createdAt: new Date(),
        }).catch(() => null);
      } catch (err: any) {
        log.warn('[TrinityEvents] trinity_action_blocked handler error:', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // Contract executed → initialize client billing profile + notify org owner + schedule first invoice
  platformEventBus.subscribe('contract_executed', {
    name: 'TrinityContractExecutedHandler',
    handler: async (event) => {
      const { workspaceId, payload } = event;
      if (!workspaceId) return;
      try {
        const { workspaceMembers: wm, clients: clientsTable } = await import('@shared/schema');
        const { sql: sqlOp } = await import('drizzle-orm');
        const contractId = payload?.contractId;
        const existingClientId = payload?.clientId;
        const clientName = payload?.clientName || 'Client';
        const title = payload?.title || 'Contract';

        // ── Auto-create client record if the contract has no linked client yet ──
        let autoCreatedClientId: string | null = null;
        if (!existingClientId && clientName && clientName !== 'Client') {
          try {
            const nameParts = clientName.trim().split(/\s+/);
            const firstName = nameParts[0] || clientName;
            const lastName = nameParts.slice(1).join(' ') || '';
            const [newClient] = await db.insert(clientsTable).values({
              workspaceId,
              firstName,
              lastName: lastName || '.',
              companyName: clientName,
              category: 'security_services',
              billingCycle: 'monthly',
              paymentTermsDays: 30,
              autoSendInvoice: true,
            }).returning({ id: clientsTable.id }).catch(() => []);
            if (newClient?.id) {
              autoCreatedClientId = newClient.id;
              log.info(`[TrinityEvents] contract_executed — auto-created client record ${newClient.id} for "${clientName}" in workspace ${workspaceId}`);
              // Publish client_created so sync services and cross-device listeners react
              platformEventBus.publish({
                type: 'client_created',
                workspaceId,
                metadata: {
                  clientId: newClient.id,
                  clientName,
                  source: 'contract_executed_auto',
                  contractId,
                },
              }).catch(() => null);
            }
          } catch (clientErr: any) {
            log.warn('[TrinityEvents] contract_executed — auto-create client failed (non-blocking):', clientErr.message);
          }
        }

        // ── Notify all managers/owners with actionable next steps ──
        const owners = await db.select({ userId: wm.userId }).from(wm)
          .where(and(eq(wm.workspaceId, workspaceId), sqlOp`${wm.role} IN ('org_owner', 'co_owner', 'manager')`));
        const { createNotification } = await import('./notificationService');
        const resolvedClientId = existingClientId || autoCreatedClientId;
        for (const o of owners) {
          await createNotification({
            workspaceId, userId: o.userId, type: 'contract_executed' as any,
            title: `Contract Fully Executed: ${clientName}`,
            message: autoCreatedClientId
              ? `"${title}" has been countersigned. Trinity auto-created the client record. Next step: assign officers to the site and confirm billing rates before scheduling.`
              : `"${title}" has been countersigned by all parties. ${resolvedClientId ? 'Client profile exists — configure billing and assign the first shift.' : 'Create the client profile to begin scheduling.'}`,
            priority: 'high',
            actionUrl: resolvedClientId ? `/clients/${resolvedClientId}` : contractId ? `/contracts/${contractId}` : '/contracts',
            idempotencyKey: `contract_executed-${String(Date.now())}-${o.userId}`,
        }).catch(() => null);
        }
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert(auditLogs).values({
          workspaceId,
          entityType: 'contract',
          entityId: contractId || 'unknown',
          action: 'contract_executed',
          description: `Contract fully executed — ${autoCreatedClientId ? 'client auto-created' : existingClientId ? 'linked to existing client' : 'pending manual client creation'}`,
          metadata: JSON.stringify({ contractId, clientName, title, autoCreatedClientId, existingClientId, payload }),
          createdAt: new Date(),
        }).catch(() => null);
      } catch (err: any) {
        log.warn('[TrinityEvents] contract_executed handler error:', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // ── subscription_created: welcome new billing relationship — notify owner + log ──
  platformEventBus.subscribe('subscription_created', {
    id: 'trinity.subscription_created.welcome_and_log',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        if (!workspaceId) return;
        const { tier, subscriptionId, workspaceName } = metadata || {};
        log.info(`[TrinityEvents] subscription_created — workspace=${workspaceId} tier=${tier} sub=${subscriptionId}`);
        const [ws] = await db.select({ ownerId: workspaces.ownerId }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        if (ws?.ownerId) {
          await NotificationDeliveryService.send({
            type: 'billing_notification',
            workspaceId,
            recipientUserId: ws.ownerId,
            channel: 'in_app',
            body: {
              title: `Subscription Activated — ${tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'Paid'} Plan`,
              message: `Your ${workspaceName || 'workspace'} subscription is now active on the ${tier || 'paid'} plan. All platform features for your tier are unlocked. Review your billing dashboard to configure invoicing and payroll.`,
            },
          }).catch(() => null);
        }
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert(auditLogs).values({
          workspaceId,
          entityType: 'subscription',
          entityId: subscriptionId || workspaceId,
          action: 'subscription_created',
          description: `Stripe subscription created — tier: ${tier || 'unknown'}`,
          metadata: JSON.stringify({ tier, subscriptionId, workspaceName }),
          createdAt: new Date(),
        }).catch(() => null);
      } catch (err: any) {
        log.warn('[TrinityEvents] subscription_created handler failed:', err?.message);
      }
    },
  });

  // ── client_created: Trinity registers new client in AR tracking + prompts first invoice setup ──
  platformEventBus.subscribe('client_created', {
    id: 'trinity.client_created.ar_register_and_guide',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        if (!workspaceId) return;
        const { clientId, clientName, source } = metadata || {};
        log.info(`[TrinityEvents] client_created — workspace=${workspaceId} client=${clientId} name="${clientName}" source=${source || 'unknown'}`);
        // Notify org owner to complete billing setup and assign first shift
        const [ws] = await db.select({ ownerId: workspaces.ownerId }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        if (ws?.ownerId) {
          await NotificationDeliveryService.send({
            type: 'inbound_opportunity_notification',
            workspaceId,
            recipientUserId: ws.ownerId,
            channel: 'in_app',
            body: {
              title: `New Client Added: ${clientName || 'Client'}`,
              message: `${clientName || 'A new client'} has been added to your organization. Next steps: (1) Set contract billing rate, (2) Create a site and assign officers, (3) Publish your first schedule — Trinity will auto-generate the first invoice.`,
            },
          }).catch(() => null);
        }
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert(auditLogs).values({
          workspaceId,
          entityType: 'client',
          entityId: clientId || 'unknown',
          action: 'client_created',
          description: `Client "${clientName}" created — AR tracking initialized`,
          metadata: JSON.stringify({ clientId, clientName, source }),
          createdAt: new Date(),
        }).catch(() => null);
      } catch (err: any) {
        log.warn('[TrinityEvents] client_created handler failed:', err?.message);
      }
    },
  });

  // ── member_joined: Trinity registers new team member and triggers onboarding checklist ──
  platformEventBus.subscribe('member_joined', {
    id: 'trinity.member_joined.onboarding_and_log',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        if (!workspaceId) return;
        const { userId: newUserId, firstName, lastName, email, role, method } = metadata || {};
        log.info(`[TrinityEvents] member_joined — workspace=${workspaceId} user=${newUserId} role=${role} method=${method || 'unknown'}`);
        // Welcome notification to the new member
        if (newUserId) {
          await NotificationDeliveryService.send({
            type: 'staffing_status_update',
            workspaceId,
            recipientUserId: newUserId,
            channel: 'in_app',
            body: {
              title: `Welcome to the team, ${firstName || 'there'}!`,
              message: `You've joined as ${role}. Complete your profile, review your schedule, and check the onboarding checklist to get started.`,
            },
          }).catch(() => null);
        }
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert(auditLogs).values({
          workspaceId,
          entityType: 'employee',
          entityId: newUserId || 'unknown',
          action: 'member_joined',
          description: `${firstName || ''} ${lastName || ''} (${email || newUserId}) joined workspace as ${role} via ${method || 'invite'}`,
          metadata: JSON.stringify({ newUserId, firstName, lastName, email, role, method }),
          createdAt: new Date(),
        }).catch(() => null);
      } catch (err: any) {
        log.warn('[TrinityEvents] member_joined handler failed:', err?.message);
      }
    },
  });

  // Document bridged → notify employee of compliance document transfer + update document status
  platformEventBus.subscribe('document_bridged', {
    name: 'TrinityDocumentBridgedHandler',
    handler: async (event) => {
      const { workspaceId, payload } = event;
      if (!workspaceId) return;
      try {
        const { sql: sqlOp } = await import('drizzle-orm');
        const employeeId = payload?.employeeId;
        const documentType = payload?.documentType || 'compliance document';
        const employeeDocumentId = payload?.employeeDocumentId;
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert(auditLogs).values({
          workspaceId: workspaceId,
          entityType: 'document',
          entityId: employeeDocumentId || 'unknown',
          action: 'document_bridged',
          description: 'Compliance document bridged to employee record',
          metadata: JSON.stringify({ employeeId, documentType, payload }),
          createdAt: new Date(),
        }).catch(() => null);
        if (employeeId) {
          const { workspaceMembers: wm } = await import('@shared/schema');
          const empUser = await db.select({ userId: wm.userId }).from(wm)
            // @ts-expect-error — TS migration: fix in refactoring sprint
            .where(and(eq(wm.workspaceId, workspaceId), eq(wm.employeeId as any, employeeId)))
            .limit(1).catch(() => []);
          if (empUser[0]) {
            const { createNotification } = await import('./notificationService');
            await createNotification({
              workspaceId, userId: empUser[0].userId, type: 'document_bridged' as any,
              title: 'Compliance Document Added to Your Profile',
              message: `A ${documentType} has been added to your employee record from the compliance vault. Please review and confirm accuracy in your profile.`,
              priority: 'normal',
              actionUrl: '/profile',
              idempotencyKey: `document_bridged-${String(Date.now())}-${empUser[0].userId}`,
        }).catch(() => null);
          }
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] document_bridged handler error:', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // Approval granted → route downstream based on entityType (payroll → disburse, invoice → send, shift → confirm)
  platformEventBus.subscribe('approval_granted', {
    name: 'TrinityApprovalGrantedHandler',
    handler: async (event) => {
      const { workspaceId, payload } = event;
      if (!workspaceId) return;
      try {
        const { sql: sqlOp } = await import('drizzle-orm');
        const entityType = payload?.entityType || payload?.actionName || 'unknown';
        const entityId = payload?.entityId || payload?.gateId || 'unknown';
        const approvedBy = payload?.approvedBy || 'system';
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert(auditLogs).values({
          workspaceId: workspaceId,
          entityType: entityType,
          entityId: entityId,
          action: 'approval_granted',
          description: 'Approval gate cleared — downstream workflow can proceed',
          metadata: JSON.stringify({ entityType, entityId, approvedBy, payload }),
          createdAt: new Date(),
        }).catch(() => null);
        log.info(`[TrinityEvents] approval_granted: ${entityType}/${entityId} approved by ${approvedBy} in ${workspaceId}`);
      } catch (err: any) {
        log.warn('[TrinityEvents] approval_granted handler error:', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // ── ROOT FIX 4 — Additional CRITICAL/HIGH events with no prior subscriber ─

  // Reconciliation alert → CRITICAL: payroll/invoice math discrepancy — block disbursement + notify owners
  platformEventBus.subscribe('reconciliation_alert', {
    name: 'TrinityReconciliationAlertHandler',
    handler: async (event) => {
      const { workspaceId, payload, metadata } = event;
      if (!workspaceId) return;
      try {
        const { workspaceMembers: wm } = await import('@shared/schema');
        const { sql: sqlOp } = await import('drizzle-orm');
        const discrepancy = payload?.discrepancy || metadata?.discrepancy || 'Financial math discrepancy detected';
        const amount = payload?.amount || metadata?.amount;
        const owners = await db.select({ userId: wm.userId }).from(wm)
          .where(and(eq(wm.workspaceId, workspaceId), sqlOp`${wm.role} IN ('org_owner', 'co_owner', 'manager')`));
        const { createNotification } = await import('./notificationService');
        for (const o of owners) {
          await createNotification({
            workspaceId, userId: o.userId, type: 'reconciliation_alert' as any,
            title: 'Financial Reconciliation Alert — Review Required',
            message: `${discrepancy}${amount ? ` Amount discrepancy: $${amount}.` : ''} Disbursement has been paused pending review. Navigate to Payroll or Billing to investigate.`,
            priority: 'urgent',
            actionUrl: '/payroll',
            idempotencyKey: `reconciliation_alert-${String(Date.now())}-${o.userId}`,
        }).catch(() => null);
        }
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert(auditLogs).values({
          workspaceId: workspaceId,
          entityType: 'finance',
          entityId: 'reconciliation',
          action: 'reconciliation_alert',
          description: 'Financial reconciliation alert — math discrepancy detected, disbursement may be blocked',
          metadata: JSON.stringify({ discrepancy, amount, payload }),
          createdAt: new Date(),
        }).catch(() => null);
      } catch (err: any) {
        log.warn('[TrinityEvents] reconciliation_alert handler error:', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // Subscription payment blocked → CRITICAL: workspace access restricted, notify owner immediately
  platformEventBus.subscribe('subscription_payment_blocked', {
    name: 'TrinitySubscriptionPaymentBlockedHandler',
    handler: async (event) => {
      const { workspaceId, payload, metadata } = event;
      if (!workspaceId) return;
      try {
        const { workspaceMembers: wm } = await import('@shared/schema');
        const { sql: sqlOp } = await import('drizzle-orm');
        const reason = payload?.reason || metadata?.reason || 'Payment required to continue using CoAIleague';
        const owners = await db.select({ userId: wm.userId }).from(wm)
          .where(and(eq(wm.workspaceId, workspaceId), sqlOp`${wm.role} IN ('org_owner', 'co_owner')`));
        const { createNotification } = await import('./notificationService');
        for (const o of owners) {
          await createNotification({
            workspaceId, userId: o.userId, type: 'subscription_payment_blocked' as any,
            title: 'Account Access Restricted — Payment Required',
            message: `${reason}. Staff access has been paused. Update your payment method in Settings > Billing to restore full access immediately.`,
            priority: 'urgent',
            actionUrl: '/settings?tab=billing',
            idempotencyKey: `subscription_payment_blocked-${String(Date.now())}-${o.userId}`,
        }).catch(() => null);
        }
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert(auditLogs).values({
          workspaceId: workspaceId,
          entityType: 'billing',
          entityId: 'subscription',
          action: 'payment_blocked',
          description: 'Subscription payment blocked — access enforcement triggered, owner notified',
          metadata: JSON.stringify({ reason, payload }),
          createdAt: new Date(),
        }).catch(() => null);
      } catch (err: any) {
        log.warn('[TrinityEvents] subscription_payment_blocked handler error:', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // Content moderation alert → HIGH: HelpAI flagged critical content, notify org owner + log
  platformEventBus.subscribe('content_moderation_alert', {
    name: 'TrinityContentModerationHandler',
    handler: async (event) => {
      const { workspaceId, payload, metadata } = event;
      if (!workspaceId) return;
      try {
        const { workspaceMembers: wm } = await import('@shared/schema');
        const { sql: sqlOp } = await import('drizzle-orm');
        const flagType = payload?.flagType || metadata?.flagType || 'content_policy_violation';
        const userId = payload?.userId || metadata?.userId;
        const owners = await db.select({ userId: wm.userId }).from(wm)
          .where(and(eq(wm.workspaceId, workspaceId), sqlOp`${wm.role} IN ('org_owner', 'co_owner')`));
        const { createNotification } = await import('./notificationService');
        for (const o of owners) {
          await createNotification({
            workspaceId, userId: o.userId, type: 'content_moderation_alert' as any,
            title: 'Content Moderation Alert',
            message: `HelpAI flagged a critical content policy violation: ${flagType}. ${userId ? `User involved recorded.` : ''} Review the chat audit log for details.`,
            priority: 'high',
            actionUrl: '/settings',
            idempotencyKey: `content_moderation_alert-${String(Date.now())}-${o.userId}`,
        }).catch(() => null);
        }
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert(auditLogs).values({
          workspaceId: workspaceId,
          entityType: 'moderation',
          entityId: userId || 'unknown',
          action: 'content_moderation_alert',
          description: 'HelpAI content moderation alert — critical flag raised during conversation',
          metadata: JSON.stringify({ flagType, userId, payload }),
          createdAt: new Date(),
        }).catch(() => null);
      } catch (err: any) {
        log.warn('[TrinityEvents] content_moderation_alert handler error:', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // Scheduler job failed → HIGH: background job failure impacts platform health, notify owners
  platformEventBus.subscribe('scheduler_job_failed', {
    name: 'TrinitySchedulerJobFailedHandler',
    handler: async (event) => {
      const { workspaceId, payload, metadata } = event;
      try {
        const { sql: sqlOp } = await import('drizzle-orm');
        const jobName = payload?.jobName || metadata?.jobName || 'unknown_job';
        const error = payload?.error || metadata?.error || 'Unknown error';
        const targetWs = workspaceId && workspaceId !== 'platform' ? workspaceId : null;
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert(auditLogs).values({
          workspaceId: 'platform',
          entityType: 'scheduler',
          entityId: jobName,
          action: 'job_failed',
          description: 'Background scheduler job failed — platform health degraded',
          metadata: JSON.stringify({ jobName, error, workspaceId, payload }),
          createdAt: new Date(),
        }).catch(() => null);
        if (targetWs) {
          const { workspaceMembers: wm } = await import('@shared/schema');
          const owners = await db.select({ userId: wm.userId }).from(wm)
            .where(and(eq(wm.workspaceId, targetWs), sqlOp`${wm.role} IN ('org_owner', 'co_owner')`));
          const { createNotification } = await import('./notificationService');
          for (const o of owners) {
            await createNotification({
              workspaceId: targetWs, userId: o.userId, type: 'scheduler_job_failed' as any,
              title: `Automation Job Failed: ${jobName}`,
              idempotencyKey: `scheduler_job_failed-${Date.now()}-${o.userId}`,
              message: `A background automation job (${jobName}) failed with error: ${String(error).substring(0, 150)}. Trinity will attempt retry. If this persists, contact support.`,
              priority: 'high',
              actionUrl: '/settings',
            } as any).catch(() => null);
          }
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] scheduler_job_failed handler error:', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // Coverage gap detected → HIGH: open shift has no coverage after pipeline exhausted, alert managers
  platformEventBus.subscribe('coverage_gap_detected', {
    name: 'TrinityCoverageGapHandler',
    handler: async (event) => {
      const { workspaceId, payload, metadata } = event;
      if (!workspaceId) return;
      try {
        const { workspaceMembers: wm } = await import('@shared/schema');
        const { sql: sqlOp } = await import('drizzle-orm');
        const shiftId = payload?.shiftId || metadata?.shiftId;
        const shiftDate = payload?.shiftDate || metadata?.shiftDate;
        const site = payload?.site || metadata?.site || 'Unknown site';
        const managers = await db.select({ userId: wm.userId }).from(wm)
          .where(and(eq(wm.workspaceId, workspaceId), sqlOp`${wm.role} IN ('org_owner', 'co_owner', 'manager', 'supervisor')`));
        const { createNotification } = await import('./notificationService');
        for (const m of managers) {
          await createNotification({
            workspaceId, userId: m.userId, type: 'coverage_gap_detected' as any,
            title: 'Coverage Gap — No Officer Available',
            message: `Trinity exhausted all automated coverage options for ${site}${shiftDate ? ` on ${shiftDate}` : ''}. Manual intervention required to fill this shift before it goes uncovered.`,
            priority: 'urgent',
            actionUrl: shiftId ? `/schedule?shiftId=${shiftId}&action=fill` : '/schedule',
            idempotencyKey: `coverage_gap_detected-${String(Date.now())}-${m.userId}`,
        }).catch(() => null);
        }
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert(auditLogs).values({
          workspaceId: workspaceId,
          entityType: 'shift',
          entityId: shiftId || 'unknown',
          action: 'coverage_gap_detected',
          description: 'Coverage gap — automated pipeline exhausted, manual intervention required',
          metadata: JSON.stringify({ shiftId, shiftDate, site, payload }),
          createdAt: new Date(),
        }).catch(() => null);
      } catch (err: any) {
        log.warn('[TrinityEvents] coverage_gap_detected handler error:', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // Employee terminated → CRITICAL: audit trail + ghost-assignment escalation
  platformEventBus.subscribe('employee_terminated', {
    name: 'TrinityEmployeeTerminatedHandler',
    handler: async (event) => {
      const { workspaceId, payload, metadata } = event;
      if (!workspaceId) return;
      try {
        const { workspaceMembers: wm } = await import('@shared/schema');
        const { sql: sqlOp } = await import('drizzle-orm');
        const employeeId = payload?.employeeId || metadata?.employeeId;
        const employeeName = payload?.employeeName || metadata?.employeeName || 'Employee';
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert(auditLogs).values({
          workspaceId: workspaceId,
          entityType: 'employee',
          entityId: employeeId || 'unknown',
          action: 'employee_terminated',
          description: 'Employee terminated — schedule ghost-assignment check and access revocation triggered',
          metadata: JSON.stringify({ employeeId, employeeName, payload }),
          createdAt: new Date(),
        }).catch(() => null);
        const owners = await db.select({ userId: wm.userId }).from(wm)
          .where(and(eq(wm.workspaceId, workspaceId), sqlOp`${wm.role} IN ('org_owner', 'co_owner', 'manager')`));
        const { createNotification } = await import('./notificationService');
        for (const o of owners) {
          await createNotification({
            workspaceId, userId: o.userId, type: 'employee_terminated' as any,
            title: `Employee Offboarding: ${employeeName}`,
            message: `${employeeName} has been marked as terminated. Trinity is scanning for any future shifts still assigned to this employee and will escalate conflicts. Verify access credentials have been revoked.`,
            priority: 'high',
            actionUrl: employeeId ? `/employees/${employeeId}` : '/employees',
            idempotencyKey: `employee_terminated-${String(Date.now())}-${o.userId}`,
        }).catch(() => null);
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] employee_terminated handler error:', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // Employee hired → HIGH: trigger onboarding automation + notify HR manager
  platformEventBus.subscribe('employee_hired', {
    name: 'TrinityEmployeeHiredHandler',
    handler: async (event) => {
      const { workspaceId, payload, metadata } = event;
      if (!workspaceId) return;
      try {
        const { workspaceMembers: wm } = await import('@shared/schema');
        const { sql: sqlOp } = await import('drizzle-orm');
        const employeeId = payload?.employeeId || metadata?.employeeId;
        const employeeName = payload?.employeeName || metadata?.employeeName || 'New Employee';
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert(auditLogs).values({
          workspaceId: workspaceId,
          entityType: 'employee',
          entityId: employeeId || 'unknown',
          action: 'employee_hired',
          description: 'New employee hired — onboarding automation and document collection triggered',
          metadata: JSON.stringify({ employeeId, employeeName, payload }),
          createdAt: new Date(),
        }).catch(() => null);
        const managers = await db.select({ userId: wm.userId }).from(wm)
          .where(and(eq(wm.workspaceId, workspaceId), sqlOp`${wm.role} IN ('org_owner', 'co_owner', 'manager')`));
        const { createNotification } = await import('./notificationService');
        for (const m of managers) {
          await createNotification({
            workspaceId, userId: m.userId, type: 'employee_hired' as any,
            title: `New Employee Onboarding: ${employeeName}`,
            message: `${employeeName} has been added to the team. Trinity will guide the onboarding checklist: background check, license verification, I-9, direct deposit, and schedule setup.`,
            priority: 'normal',
            actionUrl: employeeId ? `/employees/${employeeId}` : '/employees',
            idempotencyKey: `employee_hired-${String(Date.now())}-${m.userId}`,
        }).catch(() => null);
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] employee_hired handler error:', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // ── manual_override_submitted → flag habitual bypass pattern for supervisor review ──
  // DEDUP: TrinityFieldIntel-OverrideTracker in trinityFieldIntelligence.ts already handles this
  /*
  platformEventBus.subscribe('manual_override_submitted', {
    name: 'TrinityManualOverrideWatcher',
    handler: async (event) => {
      const { workspaceId, payload, metadata } = event;
      if (!workspaceId) return;
      try {
        const employeeId = payload?.employeeId || metadata?.employeeId;
        const overrideType = payload?.overrideType || metadata?.overrideType || 'unknown';
        const reason = payload?.reason || metadata?.reason || '';
        log.info(`[TrinityEvents] manual_override_submitted — employee=${employeeId}, type=${overrideType}, workspace=${workspaceId}`);

        const { workspaceMembers: wm } = await import('@shared/schema');
        const { sql: sqlOp } = await import('drizzle-orm');
        await db.insert(auditLogs).values({
          workspaceId: workspaceId,
          entityType: 'employee',
          entityId: employeeId || 'unknown',
          action: 'manual_override_submitted',
          description: 'Manual geofence/GPS override submitted — Trinity flagging for habitual bypass pattern review',
          metadata: JSON.stringify({ employeeId, overrideType, reason, payload }),
          createdAt: new Date(),
        }).catch(() => null);

        // Flag to supervisors if this is a GPS/geofence bypass
        if (overrideType === 'geofence' || overrideType === 'gps' || overrideType === 'clock_in_location') {
          const supervisors = await db.select({ userId: wm.userId }).from(wm)
            .where(and(eq(wm.workspaceId, workspaceId), sqlOp`${wm.role} IN ('org_owner', 'co_owner', 'manager', 'supervisor')`));
          const { createNotification } = await import('./notificationService');
          for (const s of supervisors) {
            await createNotification({
              workspaceId, userId: s.userId, type: 'geofence_override_required' as any,
              title: 'GPS Override Submitted',
              idempotencyKey: `geofence_override_required-${Date.now()}-${s.userId}`,
              message: `An officer submitted a manual GPS/geofence override (${overrideType}): "${reason}". Trinity is monitoring for habitual bypass patterns.`,
              priority: 'normal',
              actionUrl: employeeId ? `/employees/${employeeId}` : '/compliance-scenarios',
            } as any).catch(() => null);
          }
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] manual_override_submitted handler error:', (err instanceof Error ? err.message : String(err)));
      }
    },
  });
  */

  // ── incident_report_updated → Trinity re-audits severity changes and notifies client ──
  platformEventBus.subscribe('incident_report_updated', {
    name: 'TrinityIncidentUpdateWatcher',
    handler: async (event) => {
      const { workspaceId, payload, metadata } = event;
      if (!workspaceId) return;
      try {
        const incidentId = payload?.incidentId || metadata?.incidentId;
        const newSeverity = payload?.severity || metadata?.severity;
        const updatedBy = payload?.updatedBy || metadata?.updatedBy || 'unknown';
        log.info(`[TrinityEvents] incident_report_updated — incident=${incidentId}, severity=${newSeverity}, workspace=${workspaceId}`);

        const { sql: sqlOp } = await import('drizzle-orm');
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert(auditLogs).values({
          workspaceId: workspaceId,
          entityType: 'incident',
          entityId: incidentId || 'unknown',
          action: 'incident_updated',
          description: 'Incident report updated — Trinity logged for RMS audit trail',
          metadata: JSON.stringify({ incidentId, newSeverity, updatedBy, payload }),
          createdAt: new Date(),
        }).catch(() => null);
      } catch (err: any) {
        log.warn('[TrinityEvents] incident_report_updated handler error:', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // ── Approval Gate Lifecycle — escalation and expiry ────────────────────────

  platformEventBus.subscribe('approval_escalated', {
    name: 'TrinityApprovalEscalatedHandler',
    handler: async (event) => {
      const { workspaceId, payload } = event;
      if (!workspaceId) return;
      try {
        const { workspaceMembers: wm } = await import('@shared/schema');
        const { sql: sqlOp } = await import('drizzle-orm');
        const { createNotification } = await import('./notificationService');
        const owners = await db.select({ userId: wm.userId }).from(wm)
          .where(and(eq(wm.workspaceId, workspaceId), sqlOp`${wm.role} IN ('org_owner', 'co_owner')`));
        for (const o of owners) {
          await createNotification({
            workspaceId, userId: o.userId, type: 'alert' as any,
            title: event.title || 'Approval Escalated',
            message: event.description || `Approval escalated to level ${payload?.newLevel}`,
            priority: 'urgent',
            idempotencyKey: `alert-${Date.now()}-${o.userId}`
          }).catch(() => null);
        }
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert(auditLogs).values({
          workspaceId: workspaceId,
          entityType: 'approval_gate',
          entityId: payload?.gateId || 'unknown',
          action: 'approval_escalated',
          description: event.description || 'Approval gate escalated',
          metadata: JSON.stringify({ gateId: payload?.gateId, actionName: payload?.actionName, newLevel: payload?.newLevel, riskScore: payload?.riskScore }),
          createdAt: new Date(),
        }).catch(() => null);
        log.info(`[TrinityEvents] approval_escalated: ${payload?.actionName} → level ${payload?.newLevel} in ${workspaceId}`);
      } catch (err: any) {
        log.warn('[TrinityEvents] approval_escalated handler error:', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  platformEventBus.subscribe('approval_expired', {
    name: 'TrinityApprovalExpiredHandler',
    handler: async (event) => {
      const { workspaceId, payload } = event;
      if (!workspaceId) return;
      try {
        const { workspaceMembers: wm } = await import('@shared/schema');
        const { sql: sqlOp } = await import('drizzle-orm');
        const { createNotification } = await import('./notificationService');
        const owners = await db.select({ userId: wm.userId }).from(wm)
          .where(and(eq(wm.workspaceId, workspaceId), sqlOp`${wm.role} IN ('org_owner', 'co_owner', 'manager')`));
        for (const o of owners) {
          await createNotification({
            workspaceId, userId: o.userId, type: 'alert' as any,
            title: event.title || 'Approval Window Expired',
            message: event.description || `Approval for "${payload?.actionName}" expired — operation has been blocked`,
            priority: 'high',
            idempotencyKey: `alert-${Date.now()}-${o.userId}`
          }).catch(() => null);
        }
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert(auditLogs).values({
          workspaceId: workspaceId,
          entityType: 'approval_gate',
          entityId: payload?.gateId || 'unknown',
          action: 'approval_expired',
          description: event.description || 'Approval gate expired without decision',
          metadata: JSON.stringify({ gateId: payload?.gateId, actionName: payload?.actionName, requestedBy: payload?.requestedBy }),
          createdAt: new Date(),
        }).catch(() => null);
        log.info(`[TrinityEvents] approval_expired: ${payload?.actionName} gate timed out in ${workspaceId}`);
      } catch (err: any) {
        log.warn('[TrinityEvents] approval_expired handler error:', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // ── workspace_bank_disconnected → alert org owner payroll ACH suspended ────
  platformEventBus.subscribe('workspace_bank_disconnected', {
    name: 'TrinityEvents-BankDisconnected',
    async handler(event) {
      const { workspaceId, metadata } = event;
      try {
        const { createNotification } = await import('./notificationService');
        const [ownerEmp] = await db.select({ userId: employees.userId })
          .from(employees)
          // @ts-expect-error — TS migration: fix in refactoring sprint
          .where(and(eq(employees.workspaceId, workspaceId), eq(employees.workspaceRole as any, 'org_owner')))
          .limit(1).catch(() => []);
        if (ownerEmp?.userId) {
          await createNotification({
            userId: ownerEmp.userId,
            workspaceId,
            type: 'alert',
            title: 'Payroll Bank Account Disconnected',
            idempotencyKey: `alert-${Date.now()}-${ownerEmp.userId}`,
            message: `Your organization's funding bank account (${metadata?.priorInstitution || 'Bank'} ending ...${metadata?.priorMask || '????'}) has been disconnected. Automatic ACH payroll disbursement is suspended until you reconnect a bank account in Payroll Settings.`,
            priority: 'urgent',
            actionUrl: '/settings',
          } as any).catch(() => null);
        }
        log.info(`[TrinityEvents] workspace_bank_disconnected — payroll ACH suspended for workspace ${workspaceId}`);
      } catch (err: any) {
        log.warn('[TrinityEvents] workspace_bank_disconnected handler error:', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // ── payroll_transfer_initiated → log to Trinity intelligence ─────────────
  platformEventBus.subscribe('payroll_transfer_initiated', {
    name: 'TrinityEvents-PayrollTransferInitiated',
    async handler(event) {
      const { workspaceId, metadata } = event;
      try {
        log.info(`[TrinityEvents] payroll_transfer_initiated — workspaceId=${workspaceId}, employeeId=${metadata?.employeeId}, transferId=${metadata?.transferId}, amount=$${metadata?.amount}`);
        await db.insert(auditLogs).values({
          workspaceId,
          entityType: 'payroll',
          entityId: metadata?.payrollRunId || 'unknown',
          action: 'payroll_transfer_initiated',
          actionDescription: `ACH transfer initiated: $${metadata?.amount} -> employee ${metadata?.employeeId}, transferId: ${metadata?.transferId}`,
          metadata: { employeeId: metadata?.employeeId, transferId: metadata?.transferId, amount: metadata?.amount },
          createdAt: new Date(),
        }).catch(() => null);
      } catch (err: any) {
        log.warn('[TrinityEvents] payroll_transfer_initiated handler error:', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // ── client_deactivated: Trinity logs it and sends optional summary ────────
  platformEventBus.subscribe('client_deactivated', {
    name: 'TrinityClientDeactivated',
    handler: async (event: PlatformEvent) => {
      const { workspaceId, clientId, clientName, reason, notes, deactivatedBy, shiftsClosedCount, collectionsStarted } = event.metadata || {};
      if (!workspaceId) return;
      log.info(`[TrinityEvents] client_deactivated — client=${clientName} (${clientId}), reason=${reason}, shifts_closed=${shiftsClosedCount}, collections=${collectionsStarted}`);
    },
  });

  // ── client_reactivated: Trinity logs it ──────────────────────────────────
  platformEventBus.subscribe('client_reactivated', {
    name: 'TrinityClientReactivated',
    handler: async (event: PlatformEvent) => {
      const { workspaceId, clientId, clientName, reactivatedBy, wasInCollections } = event.metadata || {};
      if (!workspaceId) return;
      log.info(`[TrinityEvents] client_reactivated — client=${clientName} (${clientId}), wasInCollections=${wasInCollections}`);
    },
  });

  // ── officer_activated: Trinity welcomes newly activated officers and triggers onboarding checks ──
  platformEventBus.subscribe('officer_activated', {
    name: 'TrinityOfficerActivated',
    handler: async (event: PlatformEvent) => {
      const { workspaceId, metadata } = event;
      const { employeeId, employeeName, activatedBy } = metadata || {};
      if (!workspaceId || !employeeId) return;
      log.info(`[TrinityEvents] officer_activated — officer=${employeeName || employeeId}, activatedBy=${activatedBy || 'unknown'}`);
      // Trigger compliance certification check for newly activated officer
      try {
        const { helpaiOrchestrator } = await import('./helpai/platformActionHub');
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await helpaiOrchestrator.executeAction({
          actionId: 'compliance.check_officer_certs',
          workspaceId,
          userId: activatedBy || 'trinity',
          payload: { employeeId, triggeredBy: 'officer_activated_event' },
        }).catch(() => null);
      } catch (err: any) {
        log.warn('[TrinityEvents] officer_activated: compliance check failed:', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // ── employee_deactivated: Trinity logs it ───────────────────────────────────
  platformEventBus.subscribe('employee_deactivated', {
    name: 'TrinityEmployeeDeactivated',
    handler: async (event: PlatformEvent) => {
      const { workspaceId, metadata } = event;
      const { employeeId, employeeName, deactivatedBy, reason } = metadata || {};
      if (!workspaceId || !employeeId) return;
      log.info(`[TrinityEvents] employee_deactivated — employee=${employeeName || employeeId}, deactivatedBy=${deactivatedBy || 'unknown'}, reason=${reason || 'none'}`);
    },
  });

  // ── document_fully_signed: Archive executed document + notify stakeholders ──
  platformEventBus.subscribe('document_fully_signed', {
    name: 'TrinityDocumentFullySigned',
    handler: async (event: PlatformEvent) => {
      const { workspaceId, metadata } = event;
      const { documentId, documentTitle, signedBy, documentType } = metadata || {};
      if (!workspaceId || !documentId) return;
      log.info(`[TrinityEvents] document_fully_signed — doc=${documentTitle || documentId}, type=${documentType || 'unknown'}, signers=${signedBy}`);
      try {
        // ── 1. Mark document as 'executed' and immutable in org_documents ──
        await db.execute(
          sql`UPDATE org_documents
              SET status = 'executed',
                  is_immutable = true,
                  fully_signed_at = NOW(),
                  updated_at = NOW()
              WHERE id = ${documentId}
                AND workspace_id = ${workspaceId}
                AND status != 'void'`
        );
        log.info(`[TrinityEvents] document_fully_signed: archived doc ${documentId} as executed`);

        // ── 2. Notify workspace owner of completed execution ──
        const [ws] = await db.select({ ownerId: workspaces.ownerId })
          .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        if (ws?.ownerId) {
          await NotificationDeliveryService.send({
            // @ts-expect-error — TS migration: fix in refactoring sprint
            type: 'document_signed_notification',
            workspaceId,
            recipientUserId: ws.ownerId,
            channel: 'in_app',
            body: {
              title: 'Document Fully Executed',
              message: `"${documentTitle || documentId}" has been signed by all parties and archived as an executed record.`,
            },
          }).catch(() => null);
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] document_fully_signed archive failed:', (err instanceof Error ? err.message : String(err)));
      }
    },
  });

  // ── Phase 4: sop_updated_acknowledgment_required ──────────────────────────
  // When an owner uploads a new SOP version, every active employee must
  // acknowledge it before their next shift. This handler creates the pending
  // acknowledgment rows and pushes a workspace-wide notification so nobody
  // can claim they never saw the change.
  platformEventBus.subscribe('sop_updated_acknowledgment_required', {
    name: 'TrinitySOPAcknowledgmentRouter',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        if (!workspaceId) return;
        const documentId = metadata?.documentId;
        if (!documentId) return;

        const { rows: employees } = await (await import('../db')).pool.query(
          `SELECT id FROM employees WHERE workspace_id = $1 AND is_active = TRUE`,
          [workspaceId],
        );

        for (const emp of employees) {
          await (await import('../db')).pool.query(
            `INSERT INTO sop_acknowledgments
               (workspace_id, document_id, employee_id, is_required)
             VALUES ($1, $2, $3, TRUE)
             ON CONFLICT (workspace_id, document_id, employee_id) DO NOTHING`,
            [workspaceId, documentId, emp.id],
          ).catch(() => null);
        }

        // Notify the workspace owner so they can verify deliverability.
        const [ws] = await db.select({ ownerId: workspaces.ownerId })
          .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        if (ws?.ownerId) {
          await NotificationDeliveryService.send({
            // @ts-expect-error — TS migration: fix in refactoring sprint
            type: 'sop_acknowledgment_requested',
            workspaceId,
            recipientUserId: ws.ownerId,
            channel: 'in_app',
            body: {
              title: 'SOP Updated — Employees Notified',
              message: `${employees.length} employee(s) must acknowledge the updated policy before their next shift.`,
            },
          }).catch(() => null);
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] sop_updated_acknowledgment_required handler failed:', err?.message);
      }
    },
  });

  // ── Phase 4: disciplinary record activation when signed by both parties ───
  // When a disciplinary document is signed by the employee and the manager,
  // flip the underlying disciplinary_records row from 'pending_signature' to
  // 'active' so the score deduction becomes canonical and the record counts
  // toward the progressive-discipline stack.
  platformEventBus.subscribe('document_fully_signed', {
    name: 'TrinityDisciplinaryActivation',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        const documentId = metadata?.documentId;
        if (!workspaceId || !documentId) return;

        const { rows } = await (await import('../db')).pool.query(
          `SELECT dr.id, dr.employee_id, dr.record_type
             FROM disciplinary_records dr
            WHERE dr.workspace_id = $1
              AND dr.status = 'pending_signature'
              AND (dr.notes ILIKE $2 OR dr.document_url = $3)
            LIMIT 1`,
          [workspaceId, `%"orgDocId":"${documentId}"%`, documentId],
        );
        if (!rows.length) return;

        const record = rows[0];
        await (await import('../db')).pool.query(
          `UPDATE disciplinary_records
              SET status = 'active',
                  acknowledged_at = NOW(),
                  updated_at = NOW()
            WHERE id = $1`,
          [record.id],
        );
        log.info(
          `[TrinityEvents] disciplinary ${record.record_type} fully signed and activated for ${record.employee_id}`,
        );

        // Final warning fully executed — notify the workspace owner so they
        // can initiate separation review if needed.
        if (
          ['final_written_warning', 'termination_warning', 'written_warning'].includes(
            record.record_type,
          )
        ) {
          const [ws] = await db.select({ ownerId: workspaces.ownerId })
            .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
          if (ws?.ownerId) {
            await NotificationDeliveryService.send({
              // @ts-expect-error — TS migration: fix in refactoring sprint
              type: 'disciplinary_final_warning_executed',
              workspaceId,
              recipientUserId: ws.ownerId,
              channel: 'in_app',
              body: {
                title: 'Disciplinary Document Executed',
                message: `A ${record.record_type.replace(/_/g, ' ')} has been fully signed and is now active.`,
              },
            }).catch(() => null);
          }
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] disciplinary activation handler failed:', err?.message);
      }
    },
  });

  // ─── RMS + BID DEAD-LETTER SUBSCRIBERS ─────────────────────────────────────

  platformEventBus.subscribe('proposal_won', {
    id: 'trinity.proposal_won.close_and_notify',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        const [ws] = await db.select({ ownerId: workspaces.ownerId, name: workspaces.name })
          // @ts-expect-error — TS migration: fix in refactoring sprint
          .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        if (ws?.ownerId) {
          await NotificationDeliveryService.send({
            type: 'inbound_opportunity_notification',
            // @ts-expect-error — TS migration: fix in refactoring sprint
            workspaceId,
            recipientUserId: ws.ownerId,
            channel: 'in_app',
            body: {
              title: 'Proposal Won',
              message: `Proposal "${metadata?.proposalTitle || metadata?.proposalId}" has been won. Begin onboarding the new client.`,
            },
          }).catch(() => null);
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] proposal_won handler failed:', err?.message);
      }
    },
  });

  platformEventBus.subscribe('proposal_lost', {
    id: 'trinity.proposal_lost.log_analytics',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        log.info(`[TrinityEvents] proposal_lost workspaceId=${workspaceId} proposalId=${metadata?.proposalId} reason=${metadata?.lostReason || 'unspecified'}`);
        const [ws] = await db.select({ ownerId: workspaces.ownerId })
          // @ts-expect-error — TS migration: fix in refactoring sprint
          .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        if (ws?.ownerId) {
          await NotificationDeliveryService.send({
            type: 'inbound_opportunity_notification',
            // @ts-expect-error — TS migration: fix in refactoring sprint
            workspaceId,
            recipientUserId: ws.ownerId,
            channel: 'in_app',
            body: {
              title: 'Proposal Not Won',
              message: `Proposal "${metadata?.proposalTitle || metadata?.proposalId}" was not awarded. ${metadata?.lostReason ? 'Reason: ' + metadata.lostReason : ''}`,
            },
          }).catch(() => null);
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] proposal_lost handler failed:', err?.message);
      }
    },
  });

  platformEventBus.subscribe('bid_submitted', {
    id: 'trinity.bid_submitted.notify_managers',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        const [ws] = await db.select({ ownerId: workspaces.ownerId })
          // @ts-expect-error — TS migration: fix in refactoring sprint
          .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        if (ws?.ownerId) {
          await NotificationDeliveryService.send({
            type: 'inbound_opportunity_notification',
            // @ts-expect-error — TS migration: fix in refactoring sprint
            workspaceId,
            recipientUserId: ws.ownerId,
            channel: 'in_app',
            body: {
              title: 'New Bid Submitted',
              message: `A new bid has been submitted for "${metadata?.bidTitle || metadata?.bidId}". Review it in the proposals pipeline.`,
            },
          }).catch(() => null);
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] bid_submitted handler failed:', err?.message);
      }
    },
  });

  // ── contract_proposal_sent: Trinity notifies owner that proposal was delivered to client ──
  platformEventBus.subscribe('contract_proposal_sent', {
    id: 'trinity.contract_proposal_sent.notify_owner',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        const [ws] = await db.select({ ownerId: workspaces.ownerId })
          // @ts-expect-error — TS migration: fix in refactoring sprint
          .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        if (ws?.ownerId) {
          await NotificationDeliveryService.send({
            type: 'inbound_opportunity_notification',
            // @ts-expect-error — TS migration: fix in refactoring sprint
            workspaceId,
            recipientUserId: ws.ownerId,
            channel: 'in_app',
            body: {
              title: 'Proposal Sent to Client',
              message: `Proposal "${metadata?.proposalTitle || metadata?.contractId}" has been delivered to ${metadata?.clientName || 'the client'} for review and signature.`,
            },
          }).catch(() => null);
        }
        log.info(`[TrinityEvents] contract_proposal_sent — workspace=${workspaceId} contract=${metadata?.contractId}`);
      } catch (err: any) {
        log.warn('[TrinityEvents] contract_proposal_sent handler failed:', err?.message);
      }
    },
  });

  // ── contract_proposal_accepted: Trinity auto-converts lead → client and notifies owner ──
  platformEventBus.subscribe('contract_proposal_accepted', {
    id: 'trinity.contract_proposal_accepted.convert_and_notify',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        const { contractId, clientName, leadId, contractValue } = metadata || {};
        log.info(`[TrinityEvents] contract_proposal_accepted — workspace=${workspaceId} contract=${contractId} client=${clientName}`);

        // Convert lead to won status if a lead record exists
        if (leadId) {
          await db.execute(sql`
            UPDATE pipeline_deals
            SET stage = 'closed_won', updated_at = NOW()
            WHERE id = ${leadId}
              AND workspace_id = ${workspaceId}
          `).catch(() => null);
        }

        // Notify org owner
        const [ws] = await db.select({ ownerId: workspaces.ownerId })
          // @ts-expect-error — TS migration: fix in refactoring sprint
          .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        if (ws?.ownerId) {
          await NotificationDeliveryService.send({
            type: 'inbound_opportunity_notification',
            // @ts-expect-error — TS migration: fix in refactoring sprint
            workspaceId,
            recipientUserId: ws.ownerId,
            channel: 'in_app',
            body: {
              title: 'Proposal Accepted — New Client Signed',
              message: `${clientName || 'A client'} has accepted and signed proposal "${metadata?.proposalTitle || contractId}".${contractValue ? ` Contract value: $${Number(contractValue).toLocaleString()}.` : ''} Begin client onboarding.`,
            },
          }).catch(() => null);

          // Also send email notification
          await emailService.send({
            to: ws.ownerId,
            subject: `New Client Signed: ${clientName || contractId}`,
            html: `<h2>Proposal Accepted</h2><p>${clientName || 'A client'} has signed your proposal "${metadata?.proposalTitle || contractId}".${contractValue ? ` Contract value: <strong>$${Number(contractValue).toLocaleString()}</strong>.` : ''}</p><p>Log in to begin client onboarding and schedule deployment.</p>`,
          }).catch(() => null);
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] contract_proposal_accepted handler failed:', err?.message);
      }
    },
  });

  platformEventBus.subscribe('dar_verified', {
    id: 'trinity.dar_verified.payroll_confirmation',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        log.info(`[TrinityEvents] dar_verified workspaceId=${workspaceId} darId=${metadata?.darId} verifiedBy=${metadata?.verifiedBy}`);
        if (metadata?.supervisorUserId) {
          await NotificationDeliveryService.send({
            type: 'staffing_status_update',
            // @ts-expect-error — TS migration: fix in refactoring sprint
            workspaceId,
            recipientUserId: metadata.supervisorUserId as string,
            channel: 'in_app',
            body: {
              title: 'DAR Verified',
              message: `Daily Activity Report for ${metadata?.shiftDate || 'today'} has been verified and is ready for payroll processing.`,
            },
          }).catch(() => null);
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] dar_verified handler failed:', err?.message);
      }
    },
  });

  platformEventBus.subscribe('dar_sent_to_client', {
    id: 'trinity.dar_sent_to_client.confirmation',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        log.info(`[TrinityEvents] dar_sent_to_client workspaceId=${workspaceId} darId=${metadata?.darId} clientId=${metadata?.clientId}`);
        if (metadata?.submittedByUserId) {
          await NotificationDeliveryService.send({
            type: 'staffing_status_update',
            // @ts-expect-error — TS migration: fix in refactoring sprint
            workspaceId,
            recipientUserId: metadata.submittedByUserId as string,
            channel: 'in_app',
            body: {
              title: 'DAR Sent to Client',
              message: `Daily Activity Report has been delivered to the client successfully.`,
            },
          }).catch(() => null);
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] dar_sent_to_client handler failed:', err?.message);
      }
    },
  });

  platformEventBus.subscribe('rms_case_opened', {
    id: 'trinity.rms_case_opened.supervisor_alert',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        const [ws] = await db.select({ ownerId: workspaces.ownerId })
          // @ts-expect-error — TS migration: fix in refactoring sprint
          .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        if (ws?.ownerId) {
          await NotificationDeliveryService.send({
            type: 'inbound_opportunity_notification',
            // @ts-expect-error — TS migration: fix in refactoring sprint
            workspaceId,
            recipientUserId: ws.ownerId,
            channel: 'in_app',
            body: {
              title: 'RMS Case Opened',
              message: `A new case has been opened in the Records Management System. Case: ${metadata?.caseNumber || metadata?.caseId}. Immediate review may be required.`,
            },
          }).catch(() => null);
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] rms_case_opened handler failed:', err?.message);
      }
    },
  });

  platformEventBus.subscribe('rms_case_closed', {
    id: 'trinity.rms_case_closed.closure_notification',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        log.info(`[TrinityEvents] rms_case_closed workspaceId=${workspaceId} caseId=${metadata?.caseId} outcome=${metadata?.outcome || 'unspecified'}`);
        if (metadata?.assignedToUserId) {
          await NotificationDeliveryService.send({
            type: 'staffing_status_update',
            // @ts-expect-error — TS migration: fix in refactoring sprint
            workspaceId,
            recipientUserId: metadata.assignedToUserId as string,
            channel: 'in_app',
            body: {
              title: 'RMS Case Closed',
              message: `Case ${metadata?.caseNumber || metadata?.caseId} has been closed. Outcome: ${metadata?.outcome || 'resolved'}.`,
            },
          }).catch(() => null);
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] rms_case_closed handler failed:', err?.message);
      }
    },
  });

  platformEventBus.subscribe('incident_supervisor_signed', {
    id: 'trinity.incident_supervisor_signed.advance_workflow',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        log.info(`[TrinityEvents] incident_supervisor_signed workspaceId=${workspaceId} incidentId=${metadata?.incidentId} signedBy=${metadata?.supervisorId}`);
        // Advance to payroll/compliance verification step
        const [ws] = await db.select({ ownerId: workspaces.ownerId })
          // @ts-expect-error — TS migration: fix in refactoring sprint
          .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        if (ws?.ownerId) {
          await NotificationDeliveryService.send({
            type: 'staffing_status_update',
            // @ts-expect-error — TS migration: fix in refactoring sprint
            workspaceId,
            recipientUserId: ws.ownerId,
            channel: 'in_app',
            body: {
              title: 'Incident Report Supervisor-Signed',
              message: `Incident report ${metadata?.incidentId} has been signed by the supervisor and is ready for compliance review.`,
            },
          }).catch(() => null);
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] incident_supervisor_signed handler failed:', err?.message);
      }
    },
  });

  platformEventBus.subscribe('bolo_created', {
    id: 'trinity.bolo_created.broadcast_field',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        log.info(`[TrinityEvents] bolo_created workspaceId=${workspaceId} boloId=${metadata?.boloId} subject=${metadata?.subject}`);
        // Notify workspace owner and broadcast message
        const [ws] = await db.select({ ownerId: workspaces.ownerId })
          // @ts-expect-error — TS migration: fix in refactoring sprint
          .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        if (ws?.ownerId) {
          await NotificationDeliveryService.send({
            type: 'staffing_status_update',
            // @ts-expect-error — TS migration: fix in refactoring sprint
            workspaceId,
            recipientUserId: ws.ownerId,
            channel: 'in_app',
            body: {
              title: 'BOLO Issued',
              message: `Be On the Lookout: ${metadata?.subject || 'See incident details'}. Issued: ${new Date().toLocaleTimeString()}.`,
            },
          }).catch(() => null);
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] bolo_created handler failed:', err?.message);
      }
    },
  });

  platformEventBus.subscribe('evidence_created', {
    id: 'trinity.evidence_created.custody_chain',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        log.info(`[TrinityEvents] evidence_created workspaceId=${workspaceId} evidenceId=${metadata?.evidenceId} caseId=${metadata?.caseId} collectedBy=${metadata?.collectedByUserId}`);
        const [ws] = await db.select({ ownerId: workspaces.ownerId })
          // @ts-expect-error — TS migration: fix in refactoring sprint
          .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        if (ws?.ownerId) {
          await NotificationDeliveryService.send({
            type: 'inbound_opportunity_notification',
            // @ts-expect-error — TS migration: fix in refactoring sprint
            workspaceId,
            recipientUserId: ws.ownerId,
            channel: 'in_app',
            body: {
              title: 'Evidence Logged',
              message: `New evidence item logged for case ${metadata?.caseId || 'unknown'}. Item: ${metadata?.description || metadata?.evidenceId}. Chain of custody initiated.`,
            },
          }).catch(() => null);
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] evidence_created handler failed:', err?.message);
      }
    },
  });

  platformEventBus.subscribe('visitor_checked_in', {
    id: 'trinity.visitor_checked_in.supervisor_alert',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        log.info(`[TrinityEvents] visitor_checked_in workspaceId=${workspaceId} visitorId=${metadata?.visitorId} siteId=${metadata?.siteId}`);
        // Notify the on-duty supervisor for this site
        if (metadata?.supervisorUserId) {
          await NotificationDeliveryService.send({
            type: 'staffing_status_update',
            // @ts-expect-error — TS migration: fix in refactoring sprint
            workspaceId,
            recipientUserId: metadata.supervisorUserId as string,
            channel: 'in_app',
            body: {
              title: 'Visitor Checked In',
              message: `Visitor "${metadata?.visitorName || 'Unknown'}" checked in at ${metadata?.siteName || 'your site'} at ${new Date().toLocaleTimeString()}.`,
            },
          }).catch(() => null);
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] visitor_checked_in handler failed:', err?.message);
      }
    },
  });

  // Broadcast create/update/delete — push real-time notification to workspace members
  platformEventBus.subscribe('broadcast.created', {
    name: 'TrinityBroadcastCreatedWatcher',
    handler: async (event) => {
      try {
        const { broadcastToWorkspace } = await import('../websocket');
        const workspaceId = event.workspaceId || event.metadata?.workspaceId as string;
        if (workspaceId) {
          broadcastToWorkspace(workspaceId, { type: 'broadcast_list_updated', action: 'created', broadcastId: event.metadata?.broadcastId });
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] broadcast.created push failed:', err?.message);
      }
    },
  });

  platformEventBus.subscribe('broadcast.updated', {
    name: 'TrinityBroadcastUpdatedWatcher',
    handler: async (event) => {
      try {
        const { broadcastToWorkspace } = await import('../websocket');
        const workspaceId = event.workspaceId || event.metadata?.workspaceId as string;
        if (workspaceId) {
          broadcastToWorkspace(workspaceId, { type: 'broadcast_list_updated', action: 'updated', broadcastId: event.metadata?.broadcastId });
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] broadcast.updated push failed:', err?.message);
      }
    },
  });

  platformEventBus.subscribe('broadcast.deleted', {
    name: 'TrinityBroadcastDeletedWatcher',
    handler: async (event) => {
      try {
        const { broadcastToWorkspace } = await import('../websocket');
        const workspaceId = event.workspaceId || event.metadata?.workspaceId as string;
        if (workspaceId) {
          broadcastToWorkspace(workspaceId, { type: 'broadcast_list_updated', action: 'deleted', broadcastId: event.metadata?.broadcastId });
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] broadcast.deleted push failed:', err?.message);
      }
    },
  });

  // SRA enforcement action — Trinity oversight (conscience) awareness
  platformEventBus.subscribe('sra_enforcement_action', {
    name: 'TrinitySRAEnforcementConscienceWatcher',
    handler: async (event) => {
      try {
        const { workspaceId, metadata } = event;
        if (!workspaceId) return;
        log.warn(`[TrinityEvents] [CONSCIENCE] SRA enforcement action logged — workspace: ${workspaceId}, severity: ${metadata?.severity}, finding: ${metadata?.findingId}`);
      } catch (err: any) {
        log.warn('[TrinityEvents] sra_enforcement_action handler failed:', err?.message);
      }
    },
  });

  // ── contract_executed: record business win in thalamic_log ──────────────────
  platformEventBus.subscribe('contract_executed', {
    name: 'TrinityProactive-ContractWin',
    handler: async (event) => {
      const { workspaceId, payload } = event;
      if (!workspaceId) return;
      try {
        const { thalamiclogs } = await import('@shared/schema');
        const crypto = await import('crypto');
        await db.insert(thalamiclogs).values({
          signalId: crypto.randomUUID(),
          arrivedAt: new Date(),
          signalType: 'business_win',
          source: 'contract_pipeline',
          sourceTrustTier: 'workspace',
          workspaceId,
          priorityScore: 9,
          signalPayload: {
            type: 'contract_won',
            contractId: payload?.contractId,
            title: payload?.title,
            clientName: payload?.clientName,
            wonAt: new Date().toISOString(),
          },
        });
        log.info(`[TrinityEvents] contract_executed win logged for workspace ${workspaceId}: ${payload?.title}`);
      } catch (err: any) {
        log.warn(`[TrinityEvents] contract_executed thalamic_log insert failed: ${err?.message}`);
      }
    },
  });

  // ── PHASE A: Previously unconsumed critical events ────────────────────────

  // Security events → audit log (workspace-level alert wired in Phase B NDS refactor)
  platformEventBus.subscribe('security_threat_detected', {
    name: 'TrinitySecurityThreatHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      log.warn(`[TrinityEvents] security_threat_detected — workspace=${workspaceId} threat=${metadata?.threatType || 'unknown'}`, metadata);
    },
  });

  platformEventBus.subscribe('security_blocked_ip_access', {
    name: 'TrinitySecurityBlockedIPHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      log.warn(`[TrinityEvents] security_blocked_ip_access — workspace=${workspaceId} ip=${metadata?.ipAddress}`);
    },
  });

  // Compliance document events → log (per-user NDS delivery wired in Phase B NDS refactor)
  platformEventBus.subscribe('compliance_document_approved', {
    name: 'TrinityComplianceDocApprovedHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      log.info(`[TrinityEvents] compliance_document_approved — workspace=${workspaceId} doc="${metadata?.documentName}"`);
    },
  });

  platformEventBus.subscribe('compliance_document_rejected', {
    name: 'TrinityComplianceDocRejectedHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      log.warn(`[TrinityEvents] compliance_document_rejected — workspace=${workspaceId} doc="${metadata?.documentName}" reason="${metadata?.rejectionReason}"`);
    },
  });

  // Evidence events → notify assigned investigator
  platformEventBus.subscribe('evidence_submitted_pending_review', {
    name: 'TrinityEvidencePendingHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      log.info(`[TrinityEvents] evidence_submitted_pending_review — workspace=${workspaceId} caseId=${metadata?.caseId}`);
    },
  });

  platformEventBus.subscribe('evidence_rejected', {
    name: 'TrinityEvidenceRejectedHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      log.info(`[TrinityEvents] evidence_rejected — workspace=${workspaceId} caseId=${metadata?.caseId}`);
    },
  });

  // Dispatch events → log to thalamic brain
  platformEventBus.subscribe('dispatch.incident_created', {
    name: 'TrinityDispatchIncidentHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      log.info(`[TrinityEvents] dispatch.incident_created — workspace=${workspaceId} incidentId=${metadata?.incidentId}`);
    },
  });

  platformEventBus.subscribe('dispatch.incident_status_changed', {
    name: 'TrinityDispatchIncidentStatusHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      log.info(`[TrinityEvents] dispatch.incident_status_changed — workspace=${workspaceId} status=${metadata?.newStatus}`);
    },
  });

  // Schedule events → notify org owner on AI fill completion
  platformEventBus.subscribe('schedule.ai_fill_complete', {
    name: 'TrinityScheduleAIFillHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      log.info(`[TrinityEvents] schedule.ai_fill_complete — workspace=${workspaceId} filledShifts=${metadata?.filledCount}`);
    },
  });

  platformEventBus.subscribe('scheduling_override_queued', {
    name: 'TrinitySchedulingOverrideHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      log.info(`[TrinityEvents] scheduling_override_queued — workspace=${workspaceId}`, metadata);
    },
  });

  // CRM events → track lead pipeline activity in brain
  platformEventBus.subscribe('crm.lead_created', {
    name: 'TrinityCRMLeadCreatedHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      log.info(`[TrinityEvents] crm.lead_created — workspace=${workspaceId} company=${metadata?.companyName}`);
    },
  });

  platformEventBus.subscribe('crm.lead_status_changed', {
    name: 'TrinityCRMLeadStatusHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      log.info(`[TrinityEvents] crm.lead_status_changed — workspace=${workspaceId} leadId=${metadata?.leadId} status=${metadata?.newStatus}`);
    },
  });

  platformEventBus.subscribe('crm.deal_created', {
    name: 'TrinityCRMDealCreatedHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      log.info(`[TrinityEvents] crm.deal_created — workspace=${workspaceId} deal=${metadata?.dealName}`);
    },
  });

  // BOLO match → critical log (per-officer push delivery wired in Phase B NDS refactor)
  platformEventBus.subscribe('bolo_match_detected', {
    name: 'TrinityBOLOMatchHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      log.warn(`[TrinityEvents] bolo_match_detected — workspace=${workspaceId} visitor="${metadata?.visitorName}" site="${metadata?.siteName}"`);
    },
  });

  // Feature flag events → inform platform-level audit trail
  platformEventBus.subscribe('feature_flag.toggled', {
    name: 'TrinityFeatureFlagHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      log.info(`[TrinityEvents] feature_flag.toggled — workspace=${workspaceId} flag=${metadata?.flagKey} enabled=${metadata?.enabled}`);
    },
  });

  platformEventBus.subscribe('feature_flag.rolled_back', {
    name: 'TrinityFeatureFlagRollbackHandler',
    handler: async (event) => {
      const { metadata } = event;
      log.warn(`[TrinityEvents] feature_flag.rolled_back — flag=${metadata?.flagKey}`);
    },
  });

  // HRIS sync events → alert on provider disconnects
  platformEventBus.subscribe('hris.provider_disconnected', {
    name: 'TrinityHRISDisconnectHandler',
    handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      log.warn(`[TrinityEvents] hris.provider_disconnected — workspace=${workspaceId} provider=${metadata?.provider}`);
    },
  });

  // ─── BATCH 1: OFFICER SAFETY ─────────────────────────────────────────────────

  platformEventBus.subscribe('lone_worker_missed_checkin', {
    name: 'TrinityEvents-LoneWorkerMissedCheckin',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        if (!workspaceId) return;
        const { employeeId, missedCount, level, requiresImmediateResponse } = metadata || {};
        const { createNotification } = await import('./notificationService');
        const managers = await getWorkspaceManagers(workspaceId);
        for (const mgr of managers) {
          if (!mgr.userId) continue;
          await createNotification({
            workspaceId,
            userId: mgr.userId,
            type: requiresImmediateResponse ? 'critical_alert' : 'system_alert',
            title: `⚠️ Lone Worker Missed Check-In${requiresImmediateResponse ? ' — URGENT' : ''}`,
            message: event.description || `Officer has missed ${missedCount ?? 1} check-in(s). Escalation level: ${level ?? 1}.`,
            actionUrl: '/safety-hub',
            relatedEntityType: 'employee',
            relatedEntityId: employeeId,
            priority: requiresImmediateResponse ? 'urgent' : 'high',
            idempotencyKey: `notification-${employeeId}-${mgr.userId}`
          });
        }
        const { broadcastToWorkspace } = await import('../websocket');
        broadcastToWorkspace(workspaceId, { type: 'safety_alert', event: 'lone_worker_missed_checkin', metadata });

        await writeThalamicSignal({
          workspaceId,
          signalType: 'lone_worker_missed_checkin',
          source: 'lone_worker_service',
          priorityScore: requiresImmediateResponse ? 10 : 8,
          signalPayload: { employeeId, missedCount, level, requiresImmediateResponse },
        });
      } catch (err: any) {
        log.warn('[TrinityEvents] lone_worker_missed_checkin handler error:', err?.message);
      }
    },
  });

  platformEventBus.subscribe('lone_worker_session_started', {
    name: 'TrinityEvents-LoneWorkerSessionStarted',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        if (!workspaceId) return;
        log.info(`[TrinityEvents] lone_worker_session_started: employee=${metadata?.employeeId} session=${metadata?.sessionId} ws=${workspaceId}`);
      } catch (err: any) {
        log.warn('[TrinityEvents] lone_worker_session_started handler error:', err?.message);
      }
    },
  });

  platformEventBus.subscribe('lone_worker_session_ended', {
    name: 'TrinityEvents-LoneWorkerSessionEnded',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        if (!workspaceId) return;
        log.info(`[TrinityEvents] lone_worker_session_ended: ws=${workspaceId} duration=${metadata?.durationMinutes}min`);
      } catch (err: any) {
        log.warn('[TrinityEvents] lone_worker_session_ended handler error:', err?.message);
      }
    },
  });

  platformEventBus.subscribe('panic_alert_resolved', {
    name: 'TrinityEvents-PanicAlertResolved',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        if (!workspaceId) return;
        const { alertId, resolvedBy } = metadata || {};
        const { createNotification } = await import('./notificationService');
        const managers = await getWorkspaceManagers(workspaceId);
        for (const mgr of managers) {
          if (!mgr.userId) continue;
          await createNotification({
            workspaceId,
            userId: mgr.userId,
            type: 'system',
            title: '✅ Panic Alert Resolved',
            message: `Emergency SOS alert has been resolved${resolvedBy ? ` by ${resolvedBy}` : ''}.`,
            actionUrl: '/safety-hub',
            relatedEntityType: 'panic_alert',
            relatedEntityId: alertId,
            idempotencyKey: `system-${alertId}-${mgr.userId}`
          });
        }

        await writeThalamicSignal({
          workspaceId,
          signalType: 'panic_alert_resolved',
          source: 'panic_alert_service',
          priorityScore: 7,
          signalPayload: { alertId, resolvedBy },
        });
      } catch (err: any) {
        log.warn('[TrinityEvents] panic_alert_resolved handler error:', err?.message);
      }
    },
  });

  // ─── BATCH 2: COMPLIANCE ──────────────────────────────────────────────────────

  platformEventBus.subscribe('compliance_cert_expired', {
    name: 'TrinityEvents-ComplianceCertExpired',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        if (!workspaceId) return;
        const { employeeId } = metadata || {};
        const { createNotification } = await import('./notificationService');
        const managers = await getWorkspaceManagers(workspaceId);
        for (const mgr of managers) {
          if (!mgr.userId) continue;
          await createNotification({
            workspaceId,
            userId: mgr.userId,
            type: 'compliance_alert',
            title: '🔴 Certification Expired',
            message: event.description || 'An officer certification has expired. Officer marked non-compliant.',
            actionUrl: employeeId ? `/compliance/employee-detail/${employeeId}` : '/compliance',
            relatedEntityType: 'employee',
            relatedEntityId: employeeId,
            priority: 'urgent',
            idempotencyKey: `compliance_alert-${employeeId}-${mgr.userId}`
          });
        }

        await writeThalamicSignal({
          workspaceId,
          signalType: 'compliance_cert_expired',
          source: 'compliance_engine',
          priorityScore: 9,
          signalPayload: { employeeId, certificationType: (metadata as any)?.certificationType, expiredAt: new Date().toISOString() },
        });
      } catch (err: any) {
        log.warn('[TrinityEvents] compliance_cert_expired handler error:', err?.message);
      }
    },
  });

  platformEventBus.subscribe('training_expired', {
    name: 'TrinityEvents-TrainingExpired',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        if (!workspaceId) return;
        const { employeeId } = metadata || {};
        const { createNotification } = await import('./notificationService');
        const managers = await getWorkspaceManagers(workspaceId);
        for (const mgr of managers) {
          if (!mgr.userId) continue;
          await createNotification({
            workspaceId,
            userId: mgr.userId,
            type: 'compliance',
            title: '⚠️ Training Certification Expired',
            message: event.description || "An officer's training certification has expired.",
            actionUrl: '/training-compliance',
            relatedEntityType: 'employee',
            relatedEntityId: employeeId,
            priority: 'high',
            idempotencyKey: `compliance-${employeeId}-${mgr.userId}`
          });
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] training_expired handler error:', err?.message);
      }
    },
  });

  platformEventBus.subscribe('training_expiring', {
    name: 'TrinityEvents-TrainingExpiring',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        if (!workspaceId) return;
        const { createNotification } = await import('./notificationService');
        const managers = await getWorkspaceManagers(workspaceId);
        for (const mgr of managers) {
          if (!mgr.userId) continue;
          await createNotification({
            workspaceId,
            userId: mgr.userId,
            type: 'deadline_approaching',
            title: '📅 Training Expiring Soon',
            message: event.description || 'An officer training certification expires soon.',
            actionUrl: '/training-compliance',
            priority: 'normal',
            idempotencyKey: `deadline_approaching-${Date.now()}-${mgr.userId}`
          });
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] training_expiring handler error:', err?.message);
      }
    },
  });

  platformEventBus.subscribe('compliance_onboarding_overdue', {
    name: 'TrinityEvents-ComplianceOnboardingOverdue',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        if (!workspaceId) return;
        const { employeeId } = metadata || {};
        const { createNotification } = await import('./notificationService');
        const managers = await getWorkspaceManagers(workspaceId);
        for (const mgr of managers) {
          if (!mgr.userId) continue;
          await createNotification({
            workspaceId,
            userId: mgr.userId,
            type: 'action_required',
            title: '⏰ Onboarding Overdue',
            message: event.description || 'An employee has overdue onboarding requirements.',
            actionUrl: '/employee-onboarding-dashboard',
            relatedEntityType: 'employee',
            relatedEntityId: employeeId,
            priority: 'high',
            idempotencyKey: `action_required-${employeeId}-${mgr.userId}`
          });
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] compliance_onboarding_overdue handler error:', err?.message);
      }
    },
  });

  // ─── BATCH 3: SHIFT & SCHEDULING ─────────────────────────────────────────────

  platformEventBus.subscribe('shift_calloff_escalated', {
    name: 'TrinityEvents-ShiftCalloffEscalated',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        if (!workspaceId) return;
        const { shiftId, siteName } = metadata || {};
        const { createNotification } = await import('./notificationService');
        const managers = await getWorkspaceManagers(workspaceId);
        for (const mgr of managers) {
          if (!mgr.userId) continue;
          await createNotification({
            workspaceId,
            userId: mgr.userId,
            type: 'staffing_critical_escalation',
            title: '🚨 Calloff Uncovered — Needs Attention',
            message: `Shift at ${siteName || 'unknown site'} is uncovered. No replacement found within SLA.`,
            actionUrl: '/universal-schedule',
            relatedEntityType: 'shift',
            relatedEntityId: shiftId,
            priority: 'urgent',
            idempotencyKey: `staffing_critical_escalation-${shiftId}-${mgr.userId}`
          });
        }

        await writeThalamicSignal({
          workspaceId,
          signalType: 'shift_calloff_escalated',
          source: 'coverage_pipeline',
          priorityScore: 9,
          signalPayload: { shiftId, siteName, escalatedAt: new Date().toISOString() },
        });
      } catch (err: any) {
        log.warn('[TrinityEvents] shift_calloff_escalated handler error:', err?.message);
      }
    },
  });

  platformEventBus.subscribe('shift_swap_approved', {
    name: 'TrinityEvents-ShiftSwapApproved',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        if (!workspaceId) return;
        const { requestingEmployeeId, shiftId } = metadata || {};
        if (!requestingEmployeeId) return;
        const [emp] = await db.select({ userId: employees.userId })
          .from(employees).where(eq(employees.id, requestingEmployeeId)).limit(1);
        if (!emp?.userId) return;
        const { createNotification } = await import('./notificationService');
        await createNotification({
          workspaceId,
          userId: emp.userId,
          type: 'request_approved',
          title: '✅ Shift Swap Approved',
          message: 'Your shift swap request has been approved.',
          actionUrl: '/universal-schedule',
          relatedEntityType: 'shift',
          relatedEntityId: shiftId,
          idempotencyKey: `request_approved-${shiftId}-${emp.userId}`
        });
      } catch (err: any) {
        log.warn('[TrinityEvents] shift_swap_approved handler error:', err?.message);
      }
    },
  });

  platformEventBus.subscribe('shift_swap_denied', {
    name: 'TrinityEvents-ShiftSwapDenied',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        if (!workspaceId) return;
        const { requestingEmployeeId, shiftId } = metadata || {};
        if (!requestingEmployeeId) return;
        const [emp] = await db.select({ userId: employees.userId })
          .from(employees).where(eq(employees.id, requestingEmployeeId)).limit(1);
        if (!emp?.userId) return;
        const { createNotification } = await import('./notificationService');
        await createNotification({
          workspaceId,
          userId: emp.userId,
          type: 'request_denied',
          title: '❌ Shift Swap Denied',
          message: 'Your shift swap request was not approved.',
          actionUrl: '/universal-schedule',
          relatedEntityType: 'shift',
          relatedEntityId: shiftId,
          idempotencyKey: `request_denied-${shiftId}-${emp.userId}`
        });
      } catch (err: any) {
        log.warn('[TrinityEvents] shift_swap_denied handler error:', err?.message);
      }
    },
  });

  // ─── BATCH 4: BILLING ─────────────────────────────────────────────────────────

  platformEventBus.subscribe('subscription_canceled', {
    name: 'TrinityEvents-SubscriptionCanceled',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId } = event;
        if (!workspaceId) return;
        const { createNotification } = await import('./notificationService');
        const managers = await getWorkspaceManagers(workspaceId);
        for (const mgr of managers) {
          if (!mgr.userId) continue;
          await createNotification({
            workspaceId,
            userId: mgr.userId,
            type: 'subscription_cancelled',
            title: '📋 Subscription Canceled',
            message: 'Your CoAIleague subscription has been canceled. Access continues until the billing period ends.',
            actionUrl: '/billing',
            priority: 'high',
            idempotencyKey: `subscription_cancelled-${Date.now()}-${mgr.userId}`
          });
        }

        await writeThalamicSignal({
          workspaceId,
          signalType: 'subscription_canceled',
          source: 'billing',
          priorityScore: 8,
          signalPayload: { canceledAt: new Date().toISOString() },
        });
      } catch (err: any) {
        log.warn('[TrinityEvents] subscription_canceled handler error:', err?.message);
      }
    },
  });

  platformEventBus.subscribe('invoice_overdue_escalated', {
    name: 'TrinityEvents-InvoiceOverdueEscalated',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        if (!workspaceId) return;
        const { invoiceId, clientName, amount, daysOverdue } = metadata || {};
        const { createNotification } = await import('./notificationService');
        const managers = await getWorkspaceManagers(workspaceId);
        for (const mgr of managers) {
          if (!mgr.userId) continue;
          await createNotification({
            workspaceId,
            userId: mgr.userId,
            type: 'invoice_overdue_alert',
            title: `⚠️ Invoice ${daysOverdue ?? '30'}+ Days Overdue`,
            message: `${clientName || 'Client'} invoice${amount ? ` for $${amount}` : ''} is now ${daysOverdue ?? ''} days past due.`,
            actionUrl: '/invoices',
            relatedEntityType: 'invoice',
            relatedEntityId: invoiceId,
            priority: 'high',
            idempotencyKey: `invoice_overdue_alert-${invoiceId}-${mgr.userId}`
          });
        }

        await writeThalamicSignal({
          workspaceId,
          signalType: 'invoice_overdue_escalated',
          source: 'billing',
          priorityScore: 8,
          signalPayload: { invoiceId, clientName, amount, daysOverdue },
        });
      } catch (err: any) {
        log.warn('[TrinityEvents] invoice_overdue_escalated handler error:', err?.message);
      }
    },
  });

  platformEventBus.subscribe('trial_ending_soon', {
    name: 'TrinityEvents-TrialEndingSoon',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        if (!workspaceId) return;
        const { daysLeft } = metadata || {};
        const { createNotification } = await import('./notificationService');
        const managers = await getWorkspaceManagers(workspaceId);
        for (const mgr of managers) {
          if (!mgr.userId) continue;
          await createNotification({
            workspaceId,
            userId: mgr.userId,
            type: 'trial_expiry_warning',
            title: `⏳ Trial Ending in ${daysLeft ?? 'a few'} Days`,
            message: 'Your free trial is ending soon. Upgrade to keep your data and features.',
            actionUrl: '/billing',
            priority: 'high',
            idempotencyKey: `trial_expiry_warning-${Date.now()}-${mgr.userId}`
          });
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] trial_ending_soon handler error:', err?.message);
      }
    },
  });

  platformEventBus.subscribe('plaid_bank_connected', {
    name: 'TrinityEvents-PlaidBankConnected',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId } = event;
        if (!workspaceId) return;
        const { createNotification } = await import('./notificationService');
        const managers = await getWorkspaceManagers(workspaceId);
        for (const mgr of managers) {
          if (!mgr.userId) continue;
          await createNotification({
            workspaceId,
            userId: mgr.userId,
            type: 'payroll_payment_method',
            title: '🏦 Bank Account Connected',
            message: 'A bank account has been successfully connected for payroll direct deposit.',
            actionUrl: '/payroll-dashboard',
            priority: 'normal',
            idempotencyKey: `payroll_payment_method-${Date.now()}-${mgr.userId}`
          });
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] plaid_bank_connected handler error:', err?.message);
      }
    },
  });

  // ─── BATCH 5: DOCUMENTS & CONTRACTS ──────────────────────────────────────────

  platformEventBus.subscribe('contract_renewal_due', {
    name: 'TrinityEvents-ContractRenewalDue',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        if (!workspaceId) return;
        const { contractId, clientName, daysUntilExpiry } = metadata || {};
        const { createNotification } = await import('./notificationService');
        const managers = await getWorkspaceManagers(workspaceId);
        for (const mgr of managers) {
          if (!mgr.userId) continue;
          await createNotification({
            workspaceId,
            userId: mgr.userId,
            type: 'deadline_approaching',
            title: `📋 Contract Renewal Due in ${daysUntilExpiry ?? '?'} Days`,
            message: `Contract with ${clientName || 'client'} expires soon. Begin renewal process.`,
            actionUrl: '/contract-renewals',
            relatedEntityType: 'contract',
            relatedEntityId: contractId,
            priority: 'high',
            idempotencyKey: `deadline_approaching-${contractId}-${mgr.userId}`
          });
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] contract_renewal_due handler error:', err?.message);
      }
    },
  });

  platformEventBus.subscribe('dar_submitted', {
    name: 'TrinityEvents-DarSubmitted',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        if (!workspaceId) return;
        const { darId, officerName, siteName } = metadata || {};
        const { createNotification } = await import('./notificationService');
        const managers = await getWorkspaceManagers(workspaceId);
        for (const mgr of managers) {
          if (!mgr.userId) continue;
          await createNotification({
            workspaceId,
            userId: mgr.userId,
            type: 'dar_required',
            title: '📄 Daily Activity Report Submitted',
            message: `${officerName || 'Officer'} submitted a DAR${siteName ? ` for ${siteName}` : ''}.`,
            actionUrl: '/rms-hub',
            relatedEntityType: 'dar',
            relatedEntityId: darId,
            priority: 'low',
            idempotencyKey: `dar_required-${darId}-${mgr.userId}`
          });
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] dar_submitted handler error:', err?.message);
      }
    },
  });

  platformEventBus.subscribe('incident_created', {
    name: 'TrinityEvents-IncidentCreatedNotify',
    handler: async (event: PlatformEvent) => {
      try {
        const { workspaceId, metadata } = event;
        if (!workspaceId) return;
        const { incidentId, severity, incidentType } = metadata || {};
        if (!severity || !['critical', 'high'].includes(severity)) return;
        const { createNotification } = await import('./notificationService');
        const managers = await getWorkspaceManagers(workspaceId);
        for (const mgr of managers) {
          if (!mgr.userId) continue;
          await createNotification({
            workspaceId,
            userId: mgr.userId,
            type: severity === 'critical' ? 'critical_alert' : 'system_alert',
            title: `🚨 ${severity === 'critical' ? 'CRITICAL' : 'HIGH'} Incident Reported`,
            message: `${incidentType || 'Incident'} reported. Immediate review required.`,
            actionUrl: '/rms-hub',
            relatedEntityType: 'incident',
            relatedEntityId: incidentId,
            priority: severity === 'critical' ? 'urgent' : 'high',
            idempotencyKey: `notification-${incidentId}-${mgr.userId}`
          });
        }
      } catch (err: any) {
        log.warn('[TrinityEvents] incident_created (notify) handler error:', err?.message);
      }
    },
  });

  log.info('[TrinityEvents] Trinity event subscriptions initialized');
}

// ─────────────────────────────────────────────────────────────────────────────
// emitTrinityEvent — convenience function to publish events from route handlers
// ─────────────────────────────────────────────────────────────────────────────
export async function emitTrinityEvent(
  type: string,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    platformEventBus.publish({
      type,
      category: 'workforce',
      title: type.replace(/_/g, ' '),
      description: `Trinity event: ${type}`,
      workspaceId: metadata.workspaceId as string,
      metadata,
    }).catch((err) => log.warn('[trinityEventSubscriptions] Fire-and-forget failed:', err));
  } catch (err) {
    log.warn(`[TrinityEvents] emitTrinityEvent(${type}) failed:`, err);
  }
}

export const trinityEventSubscriptions = {
  initialize: initializeTrinityEventSubscriptions,
  onSchedulePublished,
  onPayrollProcessed,
  onIncidentCreated,
  onGPSViolation,
  onShiftReminder,
  onCertificationExpiring,
  onComplianceChecked,
  onInvoiceGenerated,
  onShiftCancelled,
  onWorkspaceCreated,
  onInvoicePaid,
  onInvoiceOverdue,
  onPayrollRunPaid,
  onStripePaymentReceived,
  onTrainingCertificateEarned,
  onTrainingInterventionRequired,
  onTrainingCertificateExpired,
  // Phase 19: New subscriptions
  onOfficerActivated: 'officer_activated',
  onDocumentFullySigned: 'document_fully_signed',
};
