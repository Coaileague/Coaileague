/**
 * Daily Digest Email Service
 * Sends personalized daily summaries to employees with:
 * - Upcoming shifts for the day
 * - Key activities from previous day
 * - Pending approvals (for managers)
 * - Compliance alerts
 * - Time tracking summary
 */

import { db } from '../db';
import { 
  employees, shifts, timeEntries, notifications, 
  users, workspaces, shiftSwapRequests, timeOffRequests,
  employeeCertifications
} from '@shared/schema';
import { eq, and, gte, lte, sql, desc, or } from 'drizzle-orm';
import { getUncachableResendClient } from '../email';
import { format, startOfDay, endOfDay, addDays, subDays, isToday, isTomorrow } from 'date-fns';

interface DigestData {
  employee: {
    id: string;
    name: string;
    email: string;
    workspaceRole: string;
  };
  upcomingShifts: Array<{
    title: string;
    startTime: Date;
    endTime: Date;
    clientName?: string;
    location?: string;
  }>;
  yesterdayTimeEntries: Array<{
    duration: number;
    clientName?: string;
    notes?: string;
  }>;
  pendingApprovals: {
    swapRequests: number;
    timeOffRequests: number;
    timesheetApprovals: number;
  };
  complianceAlerts: Array<{
    type: string;
    message: string;
    daysUntilExpiry?: number;
  }>;
  weeklyHours: number;
  unreadNotifications: number;
}

async function getEmployeeDigestData(
  employee: any,
  workspace: any
): Promise<DigestData | null> {
  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);
  const tomorrowEnd = endOfDay(addDays(today, 1));
  const yesterdayStart = startOfDay(subDays(today, 1));
  const yesterdayEnd = endOfDay(subDays(today, 1));
  const weekStart = subDays(today, 7);

  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, employee.userId)
    });

    if (!user?.email) return null;

    const upcomingShiftsData = await db.query.shifts.findMany({
      where: and(
        eq(shifts.employeeId, employee.id),
        gte(shifts.startTime, todayStart),
        lte(shifts.startTime, tomorrowEnd)
      ),
      orderBy: [shifts.startTime]
    });

    const yesterdayEntries = await db.query.timeEntries.findMany({
      where: and(
        eq(timeEntries.employeeId, employee.id),
        gte(timeEntries.clockIn, yesterdayStart),
        lte(timeEntries.clockIn, yesterdayEnd)
      )
    });

    let pendingApprovals = { swapRequests: 0, timeOffRequests: 0, timesheetApprovals: 0 };
    
    if (['org_owner', 'org_admin', 'manager'].includes(employee.workspaceRole)) {
      const pendingSwaps = await db.select({ count: sql<number>`count(*)::int` })
        .from(shiftSwapRequests)
        .where(and(
          eq(shiftSwapRequests.workspaceId, workspace.id),
          eq(shiftSwapRequests.status, 'pending')
        ));
      
      const pendingTimeOff = await db.select({ count: sql<number>`count(*)::int` })
        .from(timeOffRequests)
        .where(and(
          eq(timeOffRequests.workspaceId, workspace.id),
          eq(timeOffRequests.status, 'pending')
        ));

      const pendingTimesheets = await db.select({ count: sql<number>`count(*)::int` })
        .from(timeEntries)
        .where(and(
          eq(timeEntries.workspaceId, workspace.id),
          eq(timeEntries.status, 'pending_approval')
        ));

      pendingApprovals = {
        swapRequests: pendingSwaps[0]?.count || 0,
        timeOffRequests: pendingTimeOff[0]?.count || 0,
        timesheetApprovals: pendingTimesheets[0]?.count || 0
      };
    }

    const expiringCerts = await db.query.employeeCertifications.findMany({
      where: and(
        eq(employeeCertifications.employeeId, employee.id),
        lte(employeeCertifications.expirationDate, addDays(today, 30)),
        gte(employeeCertifications.expirationDate, today)
      )
    });

    const complianceAlerts = expiringCerts.map(cert => ({
      type: 'certification_expiring',
      message: `${cert.certificationName} expires on ${format(new Date(cert.expirationDate!), 'MMM d, yyyy')}`,
      daysUntilExpiry: Math.ceil((new Date(cert.expirationDate!).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    }));

    const weekEntries = await db.query.timeEntries.findMany({
      where: and(
        eq(timeEntries.employeeId, employee.id),
        gte(timeEntries.clockIn, weekStart),
        sql`${timeEntries.clockOut} IS NOT NULL`
      )
    });

    const weeklyHours = weekEntries.reduce((total, entry) => {
      if (entry.clockOut && entry.clockIn) {
        const hours = (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60);
        return total + hours;
      }
      return total;
    }, 0);

    const unreadNotificationsCount = await db.select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(
        eq(notifications.userId, employee.userId),
        eq(notifications.isRead, false)
      ));

    return {
      employee: {
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`,
        email: user.email,
        workspaceRole: employee.workspaceRole
      },
      upcomingShifts: upcomingShiftsData.map(s => ({
        title: s.title || 'Untitled Shift',
        startTime: new Date(s.startTime),
        endTime: new Date(s.endTime),
        clientName: undefined,
        location: undefined
      })),
      yesterdayTimeEntries: yesterdayEntries.map(e => ({
        duration: e.clockOut ? (new Date(e.clockOut).getTime() - new Date(e.clockIn).getTime()) / (1000 * 60 * 60) : 0,
        clientName: undefined,
        notes: e.notes || undefined
      })),
      pendingApprovals,
      complianceAlerts,
      weeklyHours: Math.round(weeklyHours * 10) / 10,
      unreadNotifications: unreadNotificationsCount[0]?.count || 0
    };
  } catch (error) {
    console.error(`[DailyDigest] Error getting digest data for employee ${employee.id}:`, error);
    return null;
  }
}

function generateDigestEmailHtml(data: DigestData, workspaceName: string): string {
  const todayDate = format(new Date(), 'EEEE, MMMM d, yyyy');
  
  const shiftsHtml = data.upcomingShifts.length > 0
    ? data.upcomingShifts.map(shift => `
        <div style="background: #f8fafc; padding: 12px; border-radius: 8px; margin-bottom: 8px; border-left: 4px solid #3b82f6;">
          <strong style="color: #1e40af;">${shift.title}</strong>
          <div style="color: #64748b; font-size: 14px; margin-top: 4px;">
            ${format(shift.startTime, 'h:mm a')} - ${format(shift.endTime, 'h:mm a')}
            ${shift.location ? `<br/>📍 ${shift.location}` : ''}
          </div>
        </div>
      `).join('')
    : '<p style="color: #64748b;">No shifts scheduled for today or tomorrow.</p>';

  const approvalsHtml = (data.pendingApprovals.swapRequests + data.pendingApprovals.timeOffRequests + data.pendingApprovals.timesheetApprovals) > 0
    ? `
      <div style="background: #fef3c7; padding: 12px; border-radius: 8px; border-left: 4px solid #f59e0b;">
        <strong style="color: #92400e;">Pending Approvals</strong>
        <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #78350f;">
          ${data.pendingApprovals.swapRequests > 0 ? `<li>${data.pendingApprovals.swapRequests} shift swap request(s)</li>` : ''}
          ${data.pendingApprovals.timeOffRequests > 0 ? `<li>${data.pendingApprovals.timeOffRequests} time-off request(s)</li>` : ''}
          ${data.pendingApprovals.timesheetApprovals > 0 ? `<li>${data.pendingApprovals.timesheetApprovals} timesheet(s) awaiting approval</li>` : ''}
        </ul>
      </div>
    `
    : '';

  const complianceHtml = data.complianceAlerts.length > 0
    ? data.complianceAlerts.map(alert => `
        <div style="background: #fef2f2; padding: 12px; border-radius: 8px; margin-bottom: 8px; border-left: 4px solid #ef4444;">
          <strong style="color: #991b1b;">⚠️ ${alert.message}</strong>
          ${alert.daysUntilExpiry ? `<div style="color: #7f1d1d; font-size: 14px;">${alert.daysUntilExpiry} days remaining</div>` : ''}
        </div>
      `).join('')
    : '';

  const yesterdayHours = data.yesterdayTimeEntries.reduce((t, e) => t + e.duration, 0);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f1f5f9; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Good Morning, ${data.employee.name.split(' ')[0]}!</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">${todayDate}</p>
        </div>

        <!-- Content -->
        <div style="padding: 24px;">
          
          <!-- Quick Stats -->
          <div style="display: flex; gap: 12px; margin-bottom: 24px;">
            <div style="flex: 1; background: #f0fdf4; padding: 16px; border-radius: 12px; text-align: center;">
              <div style="font-size: 28px; font-weight: bold; color: #16a34a;">${data.weeklyHours}</div>
              <div style="font-size: 12px; color: #15803d;">Hours This Week</div>
            </div>
            <div style="flex: 1; background: #eff6ff; padding: 16px; border-radius: 12px; text-align: center;">
              <div style="font-size: 28px; font-weight: bold; color: #2563eb;">${data.upcomingShifts.length}</div>
              <div style="font-size: 12px; color: #1d4ed8;">Upcoming Shifts</div>
            </div>
            <div style="flex: 1; background: #faf5ff; padding: 16px; border-radius: 12px; text-align: center;">
              <div style="font-size: 28px; font-weight: bold; color: #9333ea;">${data.unreadNotifications}</div>
              <div style="font-size: 12px; color: #7e22ce;">Unread Alerts</div>
            </div>
          </div>

          <!-- Upcoming Shifts -->
          <div style="margin-bottom: 24px;">
            <h2 style="font-size: 18px; color: #1e293b; margin: 0 0 12px 0;">📅 Today's Schedule</h2>
            ${shiftsHtml}
          </div>

          ${approvalsHtml ? `
            <div style="margin-bottom: 24px;">
              <h2 style="font-size: 18px; color: #1e293b; margin: 0 0 12px 0;">📋 Action Required</h2>
              ${approvalsHtml}
            </div>
          ` : ''}

          ${complianceHtml ? `
            <div style="margin-bottom: 24px;">
              <h2 style="font-size: 18px; color: #1e293b; margin: 0 0 12px 0;">🔔 Compliance Alerts</h2>
              ${complianceHtml}
            </div>
          ` : ''}

          ${yesterdayHours > 0 ? `
            <div style="margin-bottom: 24px;">
              <h2 style="font-size: 18px; color: #1e293b; margin: 0 0 12px 0;">⏱️ Yesterday's Summary</h2>
              <p style="color: #64748b;">You logged <strong>${Math.round(yesterdayHours * 10) / 10} hours</strong> across ${data.yesterdayTimeEntries.length} time entries.</p>
            </div>
          ` : ''}

          <!-- CTA -->
          <div style="text-align: center; margin-top: 32px;">
            <a href="${process.env.REPLIT_DEV_DOMAIN || 'https://coaileague.ai'}/dashboard" 
               style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600;">
              Open Dashboard
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div style="background: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">
            This is an automated daily digest from ${workspaceName} via CoAIleague™
          </p>
          <p style="color: #94a3b8; font-size: 12px; margin: 8px 0 0 0;">
            <a href="${process.env.REPLIT_DEV_DOMAIN || 'https://coaileague.ai'}/settings/notifications" style="color: #64748b;">Manage notification preferences</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export async function sendDailyDigest(employeeId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, employeeId)
    });

    if (!employee) {
      return { success: false, error: 'Employee not found' };
    }

    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, employee.workspaceId)
    });

    if (!workspace) {
      return { success: false, error: 'Workspace not found' };
    }

    const digestData = await getEmployeeDigestData(employee, workspace);
    if (!digestData) {
      return { success: false, error: 'Could not generate digest data' };
    }

    const emailHtml = generateDigestEmailHtml(digestData, workspace.name);
    const { client, fromEmail } = await getUncachableResendClient();

    await client.emails.send({
      from: fromEmail,
      to: digestData.employee.email,
      subject: `☀️ Your Daily Digest - ${format(new Date(), 'MMM d, yyyy')}`,
      html: emailHtml
    });

    console.log(`[DailyDigest] ✅ Sent digest to ${digestData.employee.email}`);
    return { success: true };
  } catch (error: any) {
    console.error(`[DailyDigest] ❌ Error sending digest:`, error);
    return { success: false, error: error.message };
  }
}

export async function runDailyDigestJob(): Promise<{ sent: number; failed: number; skipped: number }> {
  console.log(`📧 [DAILY DIGEST] Starting daily digest job at ${new Date().toISOString()}`);
  
  const stats = { sent: 0, failed: 0, skipped: 0 };

  try {
    const activeWorkspaces = await db.select().from(workspaces).where(
      and(
        eq(workspaces.isSuspended, false),
        eq(workspaces.isFrozen, false)
      )
    );

    for (const workspace of activeWorkspaces) {
      const workspaceEmployees = await db.query.employees.findMany({
        where: and(
          eq(employees.workspaceId, workspace.id),
          eq(employees.employmentStatus, 'active')
        )
      });

      for (const employee of workspaceEmployees) {
        try {
          const employeeUserId = employee.userId;
          if (!employeeUserId) {
            stats.skipped++;
            continue;
          }
          
          const user = await db.query.users.findFirst({
            where: eq(users.id, employeeUserId)
          });

          if (!user?.email) {
            stats.skipped++;
            continue;
          }

          const result = await sendDailyDigest(employee.id);
          if (result.success) {
            stats.sent++;
          } else {
            stats.failed++;
          }

          await new Promise(r => setTimeout(r, 100));
        } catch (err) {
          console.error(`[DailyDigest] Error processing employee ${employee.id}:`, err);
          stats.failed++;
        }
      }
    }

    console.log(`📧 [DAILY DIGEST] Complete: ${stats.sent} sent, ${stats.failed} failed, ${stats.skipped} skipped`);
    return stats;
  } catch (error) {
    console.error('[DailyDigest] Job error:', error);
    throw error;
  }
}

export const dailyDigestService = {
  sendDailyDigest,
  runDailyDigestJob,
  getEmployeeDigestData
};
