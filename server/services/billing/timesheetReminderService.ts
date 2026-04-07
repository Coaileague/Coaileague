/**
 * Timesheet Reminder Service
 *
 * GAP FIX 4: Automated timesheet submission reminder to employees 24h before pay period close.
 * GAP FIX 5: Automated timesheet approval reminder to managers before payroll runs.
 *
 * Called daily from automationTriggerService.runDailyBillingCycle().
 *
 * Logic:
 *  1. For each active workspace, determine the current pay period end date.
 *  2. If period ends within the next 24 hours:
 *     - Find employees with NO approved time entries in the current period → send submission reminder.
 *     - Find managers with pending (submitted but not approved) time entries → send approval reminder.
 */

import { db } from '../../db';
import { workspaces, employees, timeEntries, users, notifications } from '@shared/schema';
import { eq, and, gte, lt, lte, isNull, not, inArray, count } from 'drizzle-orm';
import { createNotification } from '../../notifications';
import { createLogger } from '../../lib/logger';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays } from 'date-fns';

const log = createLogger('TimesheetReminderService');

type PayrollCycle = 'weekly' | 'bi-weekly' | 'semi-monthly' | 'monthly' | 'daily';

function getPayPeriodEnd(cycle: PayrollCycle, referenceDate: Date): Date {
  const now = new Date(referenceDate);
  switch (cycle) {
    case 'weekly': {
      const end = endOfWeek(now, { weekStartsOn: 0 });
      end.setHours(23, 59, 59, 999);
      return end;
    }
    case 'bi-weekly': {
      const weekStart = startOfWeek(now, { weekStartsOn: 0 });
      const weekNum = Math.floor(weekStart.getTime() / (7 * 24 * 60 * 60 * 1000));
      const isBiWeeklyEnd = weekNum % 2 === 1;
      if (isBiWeeklyEnd) {
        const end = endOfWeek(now, { weekStartsOn: 0 });
        end.setHours(23, 59, 59, 999);
        return end;
      } else {
        const nextWeekEnd = endOfWeek(addDays(weekStart, 7), { weekStartsOn: 0 });
        nextWeekEnd.setHours(23, 59, 59, 999);
        return nextWeekEnd;
      }
    }
    case 'monthly': {
      const end = endOfMonth(now);
      end.setHours(23, 59, 59, 999);
      return end;
    }
    case 'semi-monthly': {
      const day = now.getDate();
      if (day <= 15) {
        return new Date(now.getFullYear(), now.getMonth(), 15, 23, 59, 59, 999);
      } else {
        return endOfMonth(now);
      }
    }
    default:
      return endOfWeek(now, { weekStartsOn: 0 });
  }
}

function getPayPeriodStart(cycle: PayrollCycle, periodEnd: Date): Date {
  const end = new Date(periodEnd);
  switch (cycle) {
    case 'weekly':
      return startOfWeek(end, { weekStartsOn: 0 });
    case 'bi-weekly': {
      const start = new Date(end);
      start.setDate(start.getDate() - 13);
      start.setHours(0, 0, 0, 0);
      return start;
    }
    case 'monthly':
      return startOfMonth(end);
    case 'semi-monthly': {
      const day = end.getDate();
      if (day === 15) {
        return new Date(end.getFullYear(), end.getMonth(), 1, 0, 0, 0, 0);
      } else {
        return new Date(end.getFullYear(), end.getMonth(), 16, 0, 0, 0, 0);
      }
    }
    default:
      return startOfWeek(end, { weekStartsOn: 0 });
  }
}

export async function runTimesheetReminderScan(): Promise<{
  submissionReminders: number;
  approvalReminders: number;
}> {
  const now = new Date();
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  let submissionReminders = 0;
  let approvalReminders = 0;

  try {
    // RC3 (Phase 2): Read payrollCycle from workspaces.payrollCycle (dedicated column,
    // single source of truth). billingSettingsBlob no longer authoritative for this field.
    const activeWorkspaces = await db
      .select({
        id: workspaces.id,
        ownerId: workspaces.ownerId,
        companyName: workspaces.companyName,
        payrollCycle: workspaces.payrollCycle,
      })
      .from(workspaces)
      .where(eq(workspaces.subscriptionStatus, 'active'));

    for (const ws of activeWorkspaces) {
      try {
        const cycle: PayrollCycle = (ws.payrollCycle as PayrollCycle) || 'bi-weekly';
        const periodEnd = getPayPeriodEnd(cycle, now);
        const periodStart = getPayPeriodStart(cycle, periodEnd);

        const closingSoon = periodEnd >= now && periodEnd <= in24Hours;
        if (!closingSoon) continue;

        log.info('Pay period closing within 24h', {
          workspaceId: ws.id,
          cycle,
          periodEnd: periodEnd.toISOString(),
        });

        const wsEmployees = await db
          .select({
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            userId: employees.userId,
            workspaceRole: employees.workspaceRole,
            isActive: employees.isActive,
          })
          .from(employees)
          .where(and(eq(employees.workspaceId, ws.id), eq(employees.isActive, true)));

        const staffEmployees = wsEmployees.filter(e => e.workspaceRole === 'staff');
        const managerEmployees = wsEmployees.filter(e =>
          ['manager', 'org_owner'].includes(e.workspaceRole || ''),
        );

        // Deduplication: load all submission reminders already sent this pay period in one query
        const existingSubmissionReminders = await db
          .select({ userId: notifications.userId })
          .from(notifications)
          .where(
            and(
              eq(notifications.workspaceId, ws.id),
              eq(notifications.type, 'timesheet_submission_reminder'),
              gte(notifications.createdAt as any, periodStart),
            ),
          )
          .catch(() => []);
        const alreadyNotifiedUserIds = new Set(existingSubmissionReminders.map(r => r.userId).filter(Boolean));

        for (const emp of staffEmployees) {
          if (!emp.userId) continue;
          if (alreadyNotifiedUserIds.has(emp.userId)) continue;
          try {
            const [hasEntries] = await db
              .select({ cnt: count() })
              .from(timeEntries)
              .where(
                and(
                  eq(timeEntries.workspaceId, ws.id),
                  eq(timeEntries.employeeId, emp.id),
                  gte(timeEntries.clockIn, periodStart),
                  lte(timeEntries.clockIn, periodEnd),
                ),
              );

            if ((hasEntries?.cnt ?? 0) === 0) {
              await createNotification({
                workspaceId: ws.id,
                userId: emp.userId,
                type: 'timesheet_submission_reminder',
                title: 'Submit your timesheet — pay period closes soon',
                message: `Your timesheet for this pay period (${cycle}) must be submitted before ${periodEnd.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}. Missing entries will not be paid this cycle.`,
                actionUrl: '/timesheets/pending',
              });
              submissionReminders++;
            }
          } catch (empErr: any) {
            log.warn('Failed to check/notify employee for timesheet', { employeeId: emp.id, error: empErr.message });
          }
        }

        const [pendingCount] = await db
          .select({ cnt: count() })
          .from(timeEntries)
          .where(
            and(
              eq(timeEntries.workspaceId, ws.id),
              eq(timeEntries.status, 'submitted'),
              isNull(timeEntries.approvedAt),
              gte(timeEntries.clockIn, periodStart),
              lte(timeEntries.clockIn, periodEnd),
            ),
          );

        const pending = pendingCount?.cnt ?? 0;
        if (pending > 0) {
          // Deduplication: load existing approval reminders for this pay period
          const existingApprovalReminders = await db
            .select({ userId: notifications.userId })
            .from(notifications)
            .where(
              and(
                eq(notifications.workspaceId, ws.id),
                eq(notifications.type, 'timesheet_approval_reminder'),
                gte(notifications.createdAt as any, periodStart),
              ),
            )
            .catch(() => []);
          const alreadyNotifiedManagerIds = new Set(existingApprovalReminders.map(r => r.userId).filter(Boolean));

          const managerTargets = managerEmployees.length > 0 ? managerEmployees : [{ userId: ws.ownerId }];
          for (const mgr of managerTargets) {
            if (!mgr.userId) continue;
            if (alreadyNotifiedManagerIds.has(mgr.userId)) continue;
            try {
              await createNotification({
                workspaceId: ws.id,
                userId: mgr.userId,
                type: 'timesheet_approval_reminder',
                title: `${pending} timesheet${pending === 1 ? '' : 's'} pending approval — payroll closes soon`,
                message: `There ${pending === 1 ? 'is' : 'are'} ${pending} submitted timesheet${pending === 1 ? '' : 's'} waiting for your approval. The pay period closes within 24 hours. Approve now to ensure employees are paid on time.`,
                actionUrl: '/timesheets/approvals',
              });
              approvalReminders++;
            } catch (mgrErr: any) {
              log.warn('Failed to notify manager for timesheet approval', { userId: mgr.userId, error: mgrErr.message });
            }
          }
        }
      } catch (wsErr: any) {
        log.warn('Timesheet reminder scan failed for workspace', { workspaceId: ws.id, error: wsErr.message });
      }
    }
  } catch (err: any) {
    log.error('Timesheet reminder scan failed', { error: (err instanceof Error ? err.message : String(err)) });
  }

  log.info('Timesheet reminder scan complete', { submissionReminders, approvalReminders });
  return { submissionReminders, approvalReminders };
}
