import { helpaiOrchestrator, type ActionHandler, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { db } from '../../db';
import { workspaces, employees, workspaceMembers, shifts, invoices, payrollRuns, employeeDocuments, clients, users, emailEvents, auditLogs } from '@shared/schema';
import { eq, and, gte, lte, lt, gt, sql, desc, isNull, ne, or, inArray } from 'drizzle-orm';
import { sendPushToUser, sendPushToWorkspace } from '../pushNotificationService';
import { broadcastService } from '../broadcastService';
import { createNotification } from '../notificationService';
import { trinityBusinessIntelligence } from './trinityBusinessIntelligence';
import { getWeeklyReport, getMonthlyReport } from '../timesheetReportService';
import { checkOverdueInvoices, getRevenueForecast } from '../timesheetInvoiceService';
import { NotificationDeliveryService } from '../notificationDeliveryService';
import { typedQuery } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityCommsProactiveActions');

function mkAction(actionId: string, fn: (params: any) => Promise<any>): ActionHandler {
  return {
    actionId,
    name: actionId,
    category: 'automation' as any,
    description: `Trinity action: ${actionId}`,
    handler: async (req: ActionRequest): Promise<ActionResult> => {
      try {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const data = await fn(req.params || {});
        // @ts-expect-error — TS migration: fix in refactoring sprint
        return { success: true, data };
      } catch (err: any) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        return { success: false, error: err?.message || 'Unknown error' };
      }
    }
  };
}

export function registerCommsProactiveActions() {

  helpaiOrchestrator.registerAction(mkAction('notify.push', async (params) => {
    const { userId, title, message, workspaceId, urgent } = params;
    if (!userId || !title || !message) return { error: 'userId, title, message required' };
    if (urgent) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const result = await sendPushToUser(userId, title, message, { workspaceId, urgent: true } as any);
      return { sent: true, userId, result };
    }
    const result = await createNotification({ workspaceId, userId, type: 'alert', title, message, priority: 'normal' } as any)
      .catch((err: Error) => { log.warn(`[TrinityComms] Push notification persist failed for user ${userId}:`, err.message); return null; });
    return { sent: true, userId };
  }));

  helpaiOrchestrator.registerAction(mkAction('notify.sms', async (params) => {
    const { phoneNumber, message, workspaceId } = params;
    if (!phoneNumber || !message) return { error: 'phoneNumber and message required' };
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const notifId = await NotificationDeliveryService.send({ type: 'sms_broadcast', workspaceId: workspaceId || 'system', recipientUserId: phoneNumber, channel: 'sms', body: { to: phoneNumber, body: message.substring(0, 1600) } });
    return { sent: true, phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'), messageId: notifId };
  }));

  helpaiOrchestrator.registerAction(mkAction('notify.email_officer', async (params) => {
    const { workspaceId, officerId, subject, message, priority } = params;
    if (!workspaceId || !officerId || !message) return { error: 'workspaceId, officerId, message required' };
    const emp = await db.query.employees?.findFirst({ where: eq(employees.id, officerId) } as any).catch(() => null);
    const userId = (emp as any)?.userId || officerId;
    await createNotification({ workspaceId, userId, type: 'scheduled_email', title: subject || 'Message from CoAIleague', message, priority: priority || 'normal' } as any)
      .catch((err: Error) => log.warn(`[TrinityComms] Officer email notification persist failed for user ${userId}:`, err.message));
    const emailAddr = (emp as any)?.email;
    if (emailAddr) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await NotificationDeliveryService.send({ type: 'ai_brain_email', workspaceId: workspaceId || 'system', recipientUserId: userId, channel: 'email', body: { to: emailAddr, subject: subject || 'Message from CoAIleague', html: `<p>${message}</p>` } }).catch(() => null);
    }
    return { sent: true, officerId, subject, emailSent: !!emailAddr };
  }));

  helpaiOrchestrator.registerAction(mkAction('notify.email_manager', async (params) => {
    const { workspaceId, message, subject, priority } = params;
    if (!workspaceId || !message) return { error: 'workspaceId and message required' };
    // Converted to Drizzle ORM: IN subquery → inArray()
    const managers = await db.select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(
        eq(workspaceMembers.workspaceId, workspaceId),
        inArray(workspaceMembers.role, ['org_owner', 'co_owner', 'manager', 'supervisor'])
      ));
    let sent = 0;
    let emailsSent = 0;
    for (const mgr of managers) {
      await createNotification({ workspaceId, userId: mgr.userId, type: 'scheduled_email', title: subject || 'Manager Alert from Trinity', message, priority: priority || 'normal' } as any)
        .catch((err: Error) => log.warn(`[TrinityComms] Manager email notification persist failed for user ${mgr.userId}:`, err.message));
      const mgrUser = await db.query.users?.findFirst({ where: eq(users.id, mgr.userId) } as any).catch(() => null);
      if ((mgrUser as any)?.email) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await NotificationDeliveryService.send({ type: 'ai_brain_email', workspaceId: workspaceId || 'system', recipientUserId: mgr.userId, channel: 'email', body: { to: (mgrUser as any).email, subject: subject || 'Manager Alert from Trinity', html: `<p>${message}</p>` } }).catch(() => null);
        emailsSent++;
      }
      sent++;
    }
    return { sent, managerCount: managers.length, emailsSent, subject };
  }));

  helpaiOrchestrator.registerAction(mkAction('notify.email_client', async (params) => {
    const { workspaceId, clientId, clientEmail, subject, message } = params;
    if (!workspaceId || !message) return { error: 'workspaceId and message required' };
    let toEmail = clientEmail;
    if (!toEmail && clientId) {
      const client = await db.query.clients?.findFirst({ where: eq(clients.id, clientId) } as any).catch(() => null);
      toEmail = (client as any)?.email || (client as any)?.billingEmail || (client as any)?.pocEmail;
    }
    if (!toEmail) return { sent: false, error: 'No email address found for client', clientId };
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const notifId = await NotificationDeliveryService.send({ type: 'ai_brain_email', workspaceId: workspaceId || 'system', recipientUserId: clientId || toEmail, channel: 'email', body: { to: toEmail, subject: subject || 'Update from CoAIleague', html: `<p>${message}</p>` } }).catch(() => null);
    return { sent: true, clientId, toEmail, subject, notifId };
  }));

  helpaiOrchestrator.registerAction(mkAction('notify.post_announcement', async (params) => {
    const { workspaceId, title, content, targetType, createdBy } = params;
    if (!workspaceId || !content) return { error: 'workspaceId and content required' };
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const broadcast = await broadcastService.createBroadcast({
      workspaceId,
      title: title || 'Announcement',
      content,
      targetType: targetType || 'org',
      createdBy: createdBy || 'trinity-ai',
      sendNow: true,
    } as any);
    if ((broadcast as any)?.id) {
      await broadcastService.deliverBroadcast((broadcast as any).id, workspaceId).catch(() => null);
    }
    return { posted: true, broadcastId: (broadcast as any)?.id, title };
  }));

  helpaiOrchestrator.registerAction(mkAction('report.executive_summary', async (params) => {
    const { workspaceId, periodStart, periodEnd } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const [overdue, forecast, weeklyReport] = await Promise.allSettled([
      checkOverdueInvoices(workspaceId),
      getRevenueForecast(workspaceId),
      getWeeklyReport(workspaceId),
    ]);
    const openShiftsToday = await db.select({ count: sql`COUNT(*)` })
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        isNull(shifts.employeeId),
        gte(shifts.startTime, new Date()),
        lte(shifts.startTime, new Date(Date.now() + 86400000)),
        ne(shifts.status, 'cancelled')
      ))
      .catch(() => [{ count: 0 }]);
    const expiringDocs = await db.select({ count: sql`COUNT(*)` })
      .from(employeeDocuments)
      .where(and(
        eq(employeeDocuments.workspaceId, workspaceId),
        lte(employeeDocuments.expirationDate, new Date(Date.now() + 7 * 86400000)),
        gte(employeeDocuments.expirationDate, new Date())
      ))
      .catch(() => [{ count: 0 }]);
    const pendingPayroll = await db.select({ count: sql`COUNT(*)` })
      .from(payrollRuns)
      .where(and(eq(payrollRuns.workspaceId, workspaceId), eq(payrollRuns.status as any, 'pending')))
      .catch(() => [{ count: 0 }]);
    return {
      generatedAt: new Date().toISOString(),
      workspaceId,
      openShiftsToday: parseInt(String((openShiftsToday[0] as any)?.count || 0)),
      expiringCertsNext7Days: parseInt(String((expiringDocs[0] as any)?.count || 0)),
      pendingPayrollApprovals: parseInt(String((pendingPayroll[0] as any)?.count || 0)),
      overdueInvoices: overdue.status === 'fulfilled' ? (overdue as any).value?.overdueCount || 0 : 'unavailable',
      revenueForecast: forecast.status === 'fulfilled' ? forecast.value : null,
      weeklyScheduleSummary: weeklyReport.status === 'fulfilled' ? weeklyReport.value : null,
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('report.client_billing_detail', async (params) => {
    const { workspaceId, clientId, periodStart, periodEnd } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const start = periodStart ? new Date(periodStart) : new Date(Date.now() - 30 * 86400000);
    const end = periodEnd ? new Date(periodEnd) : new Date();
    const whereClause = and(
      eq(invoices.workspaceId, workspaceId),
      gte(invoices.createdAt, start),
      lte(invoices.createdAt, end),
      ...(clientId ? [eq(invoices.clientId, clientId)] : [])
    );
    const invoiceList = await db.select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      clientId: invoices.clientId,
      amount: invoices.total,
      status: invoices.status,
      dueDate: invoices.dueDate,
      createdAt: invoices.createdAt,
    }).from(invoices).where(whereClause).orderBy(desc(invoices.createdAt));
    const total = invoiceList.reduce((acc, i) => acc + parseFloat(String(i.amount || 0)), 0);
    return { invoices: invoiceList, count: invoiceList.length, totalBilled: +total.toFixed(2), periodStart: start, periodEnd: end };
  }));

  helpaiOrchestrator.registerAction(mkAction('email.schedule_followup', async (params) => {
    const { workspaceId, recipientId, subject, message, sendAt } = params;
    if (!workspaceId || !message) return { error: 'workspaceId and message required' };
    const sendDate = sendAt ? new Date(sendAt) : new Date(Date.now() + 5 * 86400000);
    await createNotification({
      workspaceId,
      userId: recipientId || null,
      type: 'scheduled_email',
      title: subject || 'Scheduled Follow-Up',
      message,
      priority: 'normal',
      metadata: { scheduledFor: sendDate.toISOString() },
    } as any).catch(() => null);
    return { scheduled: true, sendAt: sendDate.toISOString(), subject };
  }));

  // H2 FIX: email.get_status previously returned invoice billing status ('sent'/'paid'/'draft')
  // which is NOT email delivery status. Delivery status lives in the emailEvents table (populated
  // by Resend webhooks). This fix queries the correct table for actual delivery telemetry.
  helpaiOrchestrator.registerAction(mkAction('email.get_status', async (params) => {
    const { workspaceId, invoiceId, userId, recipientEmail, limit = 10 } = params;
    if (!workspaceId && !invoiceId && !userId && !recipientEmail) {
      return { status: 'unknown', note: 'Provide workspaceId, invoiceId, userId, or recipientEmail to look up email delivery status' };
    }

    // If invoiceId provided: resolve the client's email so we can match emailEvents by recipient
    let resolvedRecipientEmail: string | null = recipientEmail || null;
    let invoiceBillingStatus: string | null = null;
    if (invoiceId) {
      const inv = await db.select({ status: invoices.status, clientId: invoices.clientId })
        .from(invoices).where(eq(invoices.id, invoiceId)).limit(1).catch(() => []);
      if (inv[0]) {
        invoiceBillingStatus = inv[0].status;
        if (inv[0].clientId) {
          const client = await db.select({ email: clients.email })
            .from(clients).where(eq(clients.id, inv[0].clientId)).limit(1).catch(() => []);
          resolvedRecipientEmail = client[0]?.email || null;
        }
      }
    }

    // Build the emailEvents query
    const conditions: any[] = [];
    if (workspaceId) conditions.push(eq(emailEvents.workspaceId, workspaceId));
    if (userId) conditions.push(eq(emailEvents.userId, userId));
    if (resolvedRecipientEmail) conditions.push(eq(emailEvents.recipientEmail, resolvedRecipientEmail));

    const events = conditions.length > 0
      ? await db.select({
          id: emailEvents.id,
          emailType: emailEvents.emailType,
          recipientEmail: emailEvents.recipientEmail,
          status: emailEvents.status,
          resendId: emailEvents.resendId,
          errorMessage: emailEvents.errorMessage,
          sentAt: emailEvents.sentAt,
          createdAt: emailEvents.createdAt,
        })
          .from(emailEvents)
          .where(and(...conditions))
          .orderBy(desc(emailEvents.createdAt))
          .limit(Number(limit))
          .catch(() => [])
      : [];

    const latestStatus = events[0]?.status || 'no_records';
    const statusSummary: Record<string, number> = {};
    for (const e of events) {
      statusSummary[e.status] = (statusSummary[e.status] || 0) + 1;
    }

    return {
      invoiceId: invoiceId || null,
      invoiceBillingStatus,
      recipientEmail: resolvedRecipientEmail,
      latestEmailStatus: latestStatus,
      statusBreakdown: statusSummary,
      totalEmailsFound: events.length,
      recentEvents: events.slice(0, 5),
      deliveryHealthy: latestStatus === 'sent' || latestStatus === 'delivered',
      note: events.length === 0
        ? 'No email delivery records found. Email may not have been sent yet, or Resend webhooks may not be configured.'
        : `Found ${events.length} email delivery record(s). Latest: ${latestStatus}`,
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('system.trinity_audit_log', async (params) => {
    const { workspaceId, action, trigger, parameters, result, modelUsed, tokensUsed, humanReviewRequired } = params;
    if (!action) return { error: 'action required' };
    // @ts-expect-error — TS migration: fix in refactoring sprint
    await db.insert(auditLogs).values({
      workspaceId: workspaceId || 'system',
      entityType: 'trinity_action',
      entityId: 'trinity',
      action,
      description: 'Trinity autonomous action: ' + action,
      metadata: { trigger, parameters, result, modelUsed, tokensUsed, humanReviewRequired },
    }).catch(() => null);
    return { logged: true, action, timestamp: new Date().toISOString() };
  }));

  helpaiOrchestrator.registerAction(mkAction('system.org_calendar', async (params) => {
    const { workspaceId } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const workspace = await db.query.workspaces?.findFirst({ where: eq(workspaces.id, workspaceId) } as any).catch(() => null);
    const today = new Date();
    const expiringCerts = await db.select({ expirationDate: employeeDocuments.expirationDate, documentType: employeeDocuments.documentType, employeeId: employeeDocuments.employeeId })
      .from(employeeDocuments)
      .where(and(
        eq(employeeDocuments.workspaceId, workspaceId),
        gte(employeeDocuments.expirationDate, today),
        lte(employeeDocuments.expirationDate, new Date(today.getTime() + 90 * 86400000))
      ))
      .orderBy(employeeDocuments.expirationDate)
      .limit(20)
      .catch(() => []);
    const payPeriodSchedule = (workspace as any)?.payrollSchedule || 'biweekly';
    const billingCycle = (workspace as any)?.invoiceSchedule || 'monthly';
    const nextPayDate = new Date(today);
    nextPayDate.setDate(nextPayDate.getDate() + (payPeriodSchedule === 'weekly' ? 7 : 14));
    const nextBillingDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return {
      workspaceId,
      payPeriodSchedule,
      billingCycle,
      nextEstimatedPayDate: nextPayDate.toISOString().split('T')[0],
      nextBillingDate: nextBillingDate.toISOString().split('T')[0],
      monthlyScheduleBuildDate: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-25`,
      upcomingCertExpiries: expiringCerts,
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('auth.get_workspace_users', async (params) => {
    const { workspaceId } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const { db } = await import('../../db');
    const { workspaceMembers } = await import('../../../shared/schema');
    const members = await db.query.workspaceMembers.findMany({
      where: (m, { eq }) => eq(m.workspaceId, workspaceId),
    }).catch(() => []);
    const { users } = await import('../../../shared/schema');
    const { eq: eqOp, inArray: inArrayOp } = await import('drizzle-orm');
    const userIds = members.map((m: any) => m.userId).filter(Boolean);
    const userRows = userIds.length > 0
      ? await db.query.users.findMany({
          where: (u, { inArray }) => inArray(u.id, userIds),
          columns: { id: true, email: true, firstName: true, lastName: true },
        }).catch(() => [])
      : [];
    const userMap = new Map(userRows.map((u: any) => [u.id, u]));
    return {
      workspaceId,
      member_count: members.length,
      members: members.slice(0, 10).map((m: any) => {
        const user = userMap.get(m.userId);
        return {
          userId: m.userId,
          role: m.role,
          email: user?.email,
          name: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim(),
        };
      }),
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('auth.get_user_roles', async (params) => {
    const { workspaceId } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const { db } = await import('../../db');
    const { workspaceMembers } = await import('../../../shared/schema');
    const members = await db.query.workspaceMembers.findMany({
      where: (m, { eq }) => eq(m.workspaceId, workspaceId),
    }).catch(() => []);
    const roleCounts: Record<string, number> = {};
    for (const m of members) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      roleCounts[m.role] = (roleCounts[m.role] || 0) + 1;
    }
    return { workspaceId, total_members: members.length, role_breakdown: roleCounts };
  }));

  helpaiOrchestrator.registerAction(mkAction('auth.check_pending_invites', async (params) => {
    const { workspaceId } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const { db } = await import('../../db');
    const { orgInvitations } = await import('../../../shared/schema');
    const { sql: sqlRaw, desc, eq, and } = await import('drizzle-orm');
    // Converted to Drizzle ORM: IN subquery → inArray()
    const invites = await db.select({
      id: orgInvitations.id,
      email: orgInvitations.email,
      contactName: orgInvitations.contactName,
      status: orgInvitations.status,
      sentAt: orgInvitations.sentAt,
      invitationTokenExpiry: orgInvitations.invitationTokenExpiry,
    })
      .from(orgInvitations)
      .where(and(
        eq(orgInvitations.workspaceId, workspaceId),
        eq(orgInvitations.status, 'pending')
      ))
      .orderBy(desc(orgInvitations.sentAt))
      .limit(20)
      .catch(() => []);
    return { workspaceId, pending_count: invites.length, invites };
  }));

  helpaiOrchestrator.registerAction(mkAction('auth.get_active_sessions', async (params) => {
    const { workspaceId } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const { db } = await import('../../db');
    const { workspaceMembers } = await import('../../../shared/schema');
    const members = await db.query.workspaceMembers.findMany({
      where: (m, { eq }) => eq(m.workspaceId, workspaceId),
    }).catch(() => []);
    return {
      workspaceId,
      active_member_count: members.length,
      note: 'Session details available via auth audit log',
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('auth.check_mfa_status', async (params) => {
    const { workspaceId } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const { db } = await import('../../db');
    const { workspaceMembers } = await import('../../../shared/schema');
    const members = await db.query.workspaceMembers.findMany({
      where: (m, { eq }) => eq(m.workspaceId, workspaceId),
    }).catch(() => []);
    const { users: usersTable } = await import('../../../shared/schema');
    const memberUserIds = members.map((m: any) => m.userId).filter(Boolean);
    const mfaUsers = memberUserIds.length > 0
      ? await db.query.users.findMany({
          where: (u, { inArray }) => inArray(u.id, memberUserIds),
          columns: { id: true, mfaEnabled: true },
        }).catch(() => [])
      : [];
    const mfaUserMap = new Map(mfaUsers.map((u: any) => [u.id, u]));
    const mfaEnabled = members.filter((m: any) => mfaUserMap.get(m.userId)?.mfaEnabled).length;
    const mfaDisabled = members.length - mfaEnabled;
    return {
      workspaceId,
      total_users: members.length,
      mfa_enabled: mfaEnabled,
      mfa_disabled: mfaDisabled,
      mfa_adoption_rate: members.length > 0 ? Math.round((mfaEnabled / members.length) * 100) : 0,
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('auth.get_access_events', async (params) => {
    const { workspaceId, limit = 20 } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const { db } = await import('../../db');
    const { auditLogs } = await import('../../../shared/schema');
    const { sql: sqlRaw, desc, inArray, eq, and } = await import('drizzle-orm');
    // Converted to Drizzle ORM: IN subquery → inArray()
    const events = await db.select({
      actionType: auditLogs.actorType,
      userId: auditLogs.userId,
      ipAddress: auditLogs.ipAddress,
      userAgent: auditLogs.userAgent,
      createdAt: auditLogs.createdAt,
    })
      .from(auditLogs)
      .where(and(
        eq(auditLogs.workspaceId, workspaceId),
        inArray(auditLogs.actorType, ['login', 'logout', 'password_reset', 'mfa_enabled', 'mfa_disabled', 'invitation_sent', 'invitation_accepted'])
      ))
      .orderBy(desc(auditLogs.createdAt))
      .limit(Number(limit))
      .catch(() => []);
    return { workspaceId, event_count: events.length, events };
  }));

  helpaiOrchestrator.registerAction(mkAction('auth.get_permission_summary', async (params) => {
    const { workspaceId } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const { db } = await import('../../db');
    const { workspaceMembers } = await import('../../../shared/schema');
    const members = await db.query.workspaceMembers.findMany({
      where: (m, { eq }) => eq(m.workspaceId, workspaceId),
    }).catch(() => []);
    const adminCount = members.filter((m: any) => m.role === 'admin' || m.role === 'owner').length;
    const managerCount = members.filter((m: any) => m.role === 'manager').length;
    const staffCount = members.filter((m: any) => !['admin', 'owner', 'manager'].includes(m.role)).length;
    return {
      workspaceId,
      admins: adminCount,
      managers: managerCount,
      staff: staffCount,
      total: members.length,
      elevated_access_pct: members.length > 0 ? Math.round(((adminCount + managerCount) / members.length) * 100) : 0,
    };
  }));

  log.info('[Trinity Comms+Proactive] Registered 10 comms, reporting, system audit, and workspace actions + 7 auth.* actions');
}
