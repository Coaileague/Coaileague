/**
 * Employee Payment Method Notification Service — GAPS 8+9
 *
 * GAP 8: Ensures per-employee payment method (ACH direct deposit vs check)
 *        is respected and surfaced in the payroll processing flow.
 *
 * GAP 9: Notifies each employee about their upcoming payment with method-specific
 *        messaging (ACH processing timeline vs check mailing timeline).
 *
 * Called daily from automationTriggerService after payroll auto-close.
 * Scans for payroll runs in 'processing' or 'approved' status that haven't
 * yet had employee payment notifications sent.
 */

import { db } from '../../db';
import {
  workspaces,
  employees,
  payrollRuns,
  employeePayrollInfo,
} from '@shared/schema';
import { eq, and, sql, gte, inArray } from 'drizzle-orm';
import { createNotification } from '../../notifications';
import { createLogger } from '../../lib/logger';
import { format, subDays } from 'date-fns';

const log = createLogger('EmployeePaymentNotification');

const PAYMENT_METHOD_MESSAGES: Record<string, { title: string; methodNote: string; timeline: string }> = {
  direct_deposit: {
    title: 'Payroll — Direct Deposit Processing',
    methodNote: 'via ACH direct deposit',
    timeline: 'ACH direct deposit typically takes 1–2 business days to appear in your bank account.',
  },
  check: {
    title: 'Payroll — Paper Check',
    methodNote: 'via paper check',
    timeline: 'Your paper check will be mailed or distributed by your supervisor. Please confirm receipt with your manager.',
  },
  wire: {
    title: 'Payroll — Wire Transfer',
    methodNote: 'via wire transfer',
    timeline: 'Wire transfers are typically same-day or next-day. Confirm with your manager if you do not receive it within 1 business day.',
  },
  cash: {
    title: 'Payroll — Cash Distribution',
    methodNote: 'as a cash distribution',
    timeline: 'Cash payment will be distributed by your manager. Please sign the payment receipt.',
  },
};

const DEFAULT_METHOD_INFO = {
  title: 'Payroll Processing',
  methodNote: 'via your configured payment method',
  timeline: 'Contact your manager or HR for payment timeline details.',
};

export async function sendEmployeePaymentMethodNotifications(): Promise<{ notificationsSent: number }> {
  let notificationsSent = 0;

  try {
    // ── Find payroll runs approved/processing in the last 3 days ──────────────
    const recentRuns = await db
      .select()
      .from(payrollRuns)
      .where(
        and(
          sql`${payrollRuns.status} IN ('approved', 'processed', 'paid', 'completed')`,
          gte(payrollRuns.updatedAt, subDays(new Date(), 3)),
          // Only notify if workerTypeBreakdown does not have the notificationSent flag
          sql`(${payrollRuns.workerTypeBreakdown}->>'employeeNotificationsSent') IS NULL`
        )
      )
      .limit(20);

    for (const run of recentRuns) {
      try {
        const workspaceId = run.workspaceId;
        if (!workspaceId) continue;

        // Skip seed/audit/test payroll runs — they may lack valid period dates or amounts
        if (!run.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(run.id)) continue;

        const grossAmount = parseFloat((run.totalGrossPay || '0').toString());
        const netAmount = parseFloat((run.totalNetPay || '0').toString());

        let periodLabel = 'Pay Period';
        try {
          if (run.periodStart && run.periodEnd) {
            periodLabel = `${format(new Date(run.periodStart as any), 'MMM d')} – ${format(new Date(run.periodEnd as any), 'MMM d, yyyy')}`;
          }
        } catch { periodLabel = 'Pay Period'; }

        // ── Get all active employees in this workspace ────────────────────────
        const activeEmployeesResult = await db
          .select({
            id: employees.id,
            userId: employees.userId,
            firstName: employees.firstName,
            lastName: employees.lastName,
          })
          .from(employees)
          .where(
            and(
              eq(employees.workspaceId, workspaceId),
              eq(employees.isActive, true)
            )
          );

        const activeEmployees = Array.isArray(activeEmployeesResult) ? activeEmployeesResult : [];
        if (activeEmployees.length === 0) continue;

        // ── Get payroll info (payment method) for each employee ───────────────
        const payrollInfoRowsResult = await db
          .select({
            employeeId: employeePayrollInfo.employeeId,
            paymentMethod: employeePayrollInfo.preferredPayoutMethod,
            directDepositConsent: employeePayrollInfo.directDepositEnabled,
          })
          .from(employeePayrollInfo)
          .where(and(
            eq(employeePayrollInfo.workspaceId, workspaceId),
            inArray(employeePayrollInfo.employeeId, activeEmployees.map(e => e.id))
          ));

        const payrollInfoRows = Array.isArray(payrollInfoRowsResult) ? payrollInfoRowsResult : [];

        const payrollInfoByEmployee: Record<string, any> = {};
        for (const info of payrollInfoRows) {
          if (info?.employeeId) {
            payrollInfoByEmployee[info.employeeId] = info;
          }
        }

        // ── Notify each employee with their specific payment method ───────────
        for (const emp of activeEmployees) {
          if (!emp?.userId) continue;

          const payInfo = payrollInfoByEmployee[emp.id];
          const method = payInfo?.paymentMethod || 'direct_deposit';
          const methodInfo = PAYMENT_METHOD_MESSAGES[method] || DEFAULT_METHOD_INFO;

          // Validate: ACH requires directDepositConsent
          const achWarning = method === 'direct_deposit' && !payInfo?.directDepositConsent
            ? ' Note: Direct deposit consent not on file. Please complete your direct deposit authorization form.'
            : '';

          const empGross = grossAmount / Math.max(activeEmployees.length, 1);
          const empNet = netAmount / Math.max(activeEmployees.length, 1);

          await createNotification({
            workspaceId,
            userId: emp.userId,
            type: 'payroll_payment_method',
            title: `${methodInfo.title} — ${periodLabel}`,
            message:
              `Hello ${emp.firstName || 'there'}, your pay for ${periodLabel} is being processed ${methodInfo.methodNote}.\n\n` +
              `${methodInfo.timeline}${achWarning}\n\n` +
              `Approximate net pay: $${empNet.toFixed(2)} (actual amount on your paystub). ` +
              `Contact HR if you have questions about your payment method or need to update your banking details.`,
            metadata: {
              payrollRunId: run.id,
              paymentMethod: method,
              period: periodLabel,
            },
            actionUrl: '/payroll',
          });
          notificationsSent++;
        }

        // ── Mark this run as notified ──────────────────────────────────────────
        let currentBreakdown: Record<string, unknown> = {};
        try {
          const raw = run.workerTypeBreakdown;
          if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            currentBreakdown = { ...(raw as any) };
          }
        } catch { /* leave as {} */ }

        await db
          .update(payrollRuns)
          .set({
            workerTypeBreakdown: { ...currentBreakdown, employeeNotificationsSent: true },
            updatedAt: new Date(),
          })
          .where(eq(payrollRuns.id, run.id));

      } catch (runErr: unknown) {
        const msg = runErr instanceof Error ? runErr.message : String(runErr);
        const stack = runErr instanceof Error && runErr.stack ? runErr.stack.split('\n').slice(1, 6).join(' | ') : '';
        log.warn('Failed to notify employees for payroll run', { runId: run.id, error: msg, stack });
      }
    }
  } catch (err: any) {
    log.error('Employee payment notification scan failed', { error: (err instanceof Error ? err.message : String(err)) });
  }

  if (notificationsSent > 0) {
    log.info('Employee payment notifications sent', { notificationsSent });
  }
  return { notificationsSent };
}
