import { helpaiOrchestrator, type ActionHandler, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { db } from '../../db';
import { timeEntries, payrollRuns, payrollEntries, invoices, invoiceLineItems, employees, shifts, workspaces } from '@shared/schema';
import { eq, and, gte, lte, lt, gt, isNull, sql, desc, sum } from 'drizzle-orm';
import { getWeeklyReport, getMonthlyReport } from '../timesheetReportService';
import { checkOverdueInvoices, generateInvoiceFromHours } from '../timesheetInvoiceService';
import { createAutomatedPayrollRun } from '../payrollAutomation';
import { runWeeklyBillingCycle } from '../quickbooksClientBillingSync';
import { platformEventBus } from '../platformEventBus';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityTimesheetPayrollCycleActions');

function mkAction(actionId: string, fn: (params: any) => Promise<any>, category: string = 'automation'): ActionHandler {
  return {
    actionId,
    name: actionId,
    category: category as any,
    description: `Trinity action: ${actionId}`,
    requiredRoles: ['manager', 'owner', 'root_admin'],
    handler: async (req: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      try {
        const data = await fn(req.payload || {});
        return { success: true, actionId, message: `${actionId} completed`, data, executionTimeMs: Date.now() - start };
      } catch (err: any) {
        return { success: false, actionId, message: err?.message || 'Unknown error', executionTimeMs: Date.now() - start };
      }
    }
  };
}

function mkPayrollAction(actionId: string, fn: (params: any) => Promise<any>): ActionHandler {
  return mkAction(actionId, fn, 'payroll');
}

function mkInvoiceAction(actionId: string, fn: (params: any) => Promise<any>): ActionHandler {
  return mkAction(actionId, fn, 'invoicing');
}

export function registerTimesheetPayrollCycleActions() {

  helpaiOrchestrator.registerAction(mkAction('timesheet.generate_from_clockdata', async (params) => {
    const { workspaceId, employeeId, periodStart, periodEnd } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const startDate = periodStart ? new Date(periodStart) : (() => {
      const d = new Date();
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    })();
    const endDate = periodEnd ? new Date(periodEnd) : new Date();
    const whereClause = and(
      eq(timeEntries.workspaceId, workspaceId),
      gte(timeEntries.clockIn, startDate),
      lte(timeEntries.clockIn, endDate),
      ...(employeeId ? [eq(timeEntries.employeeId, employeeId)] : [])
    );
    const entries = await db.select({
      employeeId: timeEntries.employeeId,
      clockIn: timeEntries.clockIn,
      clockOut: timeEntries.clockOut,
      totalMinutes: (timeEntries as any).totalMinutes,
      status: timeEntries.status,
    }).from(timeEntries).where(whereClause).orderBy(timeEntries.clockIn);
    const byEmployee: Record<string, { totalMinutes: number; entries: number }> = {};
    for (const e of entries) {
      if (!byEmployee[e.employeeId]) byEmployee[e.employeeId] = { totalMinutes: 0, entries: 0 };
      byEmployee[e.employeeId].totalMinutes += e.totalMinutes || 0;
      byEmployee[e.employeeId].entries += 1;
    }
    return {
      generated: true,
      periodStart: startDate,
      periodEnd: endDate,
      employeeCount: Object.keys(byEmployee).length,
      totalEntries: entries.length,
      summary: byEmployee
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('timesheet.auto_approve_clean', async (params) => {
    const { workspaceId, periodStart, periodEnd } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const startDate = periodStart ? new Date(periodStart) : new Date(Date.now() - 14 * 86400000);
    const endDate = periodEnd ? new Date(periodEnd) : new Date();
    const cleanEntries = await db.select({ id: timeEntries.id })
      .from(timeEntries)
      .where(and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.status as any, 'pending'),
        gte(timeEntries.clockIn, startDate),
        lte(timeEntries.clockIn, endDate),
        gt(timeEntries.totalMinutes, 0),
        sql`${timeEntries.notes} NOT ILIKE '%flag%' AND ${timeEntries.notes} NOT ILIKE '%review%' AND ${timeEntries.notes} NOT ILIKE '%PHOTO_REVIEW%'`
      ));
    if (cleanEntries.length === 0) return { approved: 0, message: 'No clean pending timesheets found' };
    const ids = cleanEntries.map(e => e.id);
    await db.update(timeEntries)
      .set({ status: 'approved', updatedAt: new Date() } as any)
      .where(sql`${timeEntries.id} = ANY(${ids})`);
    await platformEventBus.publish({
      eventType: 'automation_completed',
      workspaceId,
      title: 'Timesheets Auto-Approved',
      description: `Trinity auto-approved ${ids.length} clean timesheet entries (no flags, no missing punches)`,
      data: { actionId: 'timesheet.auto_approve_clean', approvedCount: ids.length, periodStart, periodEnd },
    });
    return { approved: ids.length, note: 'Clean timesheets auto-approved (no flags, no missing punches)' };
  }));

  helpaiOrchestrator.registerAction(mkAction('timesheet.flag_exceptions', async (params) => {
    const { workspaceId, periodStart, periodEnd } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const startDate = periodStart ? new Date(periodStart) : new Date(Date.now() - 14 * 86400000);
    const endDate = periodEnd ? new Date(periodEnd) : new Date();
    const exceptions = await db.select({
      id: timeEntries.id,
      employeeId: timeEntries.employeeId,
      clockIn: timeEntries.clockIn,
      clockOut: timeEntries.clockOut,
      totalMinutes: (timeEntries as any).totalMinutes,
      status: timeEntries.status,
    }).from(timeEntries).where(and(
      eq(timeEntries.workspaceId, workspaceId),
      gte(timeEntries.clockIn, startDate),
      lte(timeEntries.clockIn, endDate),
      sql`(${timeEntries.clockOut} IS NULL OR ${(timeEntries as any).totalMinutes} > 600 OR ${(timeEntries as any).totalMinutes} < 0)`
    ));
    return {
      exceptions,
      count: exceptions.length,
      types: {
        missingPunch: exceptions.filter(e => !e.clockOut).length,
        longShift: exceptions.filter(e => (e.totalMinutes || 0) > 600).length,
        invalidDuration: exceptions.filter(e => (e.totalMinutes || 0) < 0).length,
      }
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('timesheet.submit_correction', async (params) => {
    const { workspaceId, timeEntryId, correctedClockIn, correctedClockOut, reason } = params;
    // GAP-20 FIX: workspaceId is now required and added to every WHERE clause so this action
    // cannot be aimed at a time entry in a foreign workspace.
    if (!timeEntryId || !workspaceId) return { error: 'timeEntryId and workspaceId required' };
    const updates: any = { status: 'correction_pending', updatedAt: new Date() };
    if (correctedClockIn) updates.clockIn = new Date(correctedClockIn);
    if (correctedClockOut) updates.clockOut = new Date(correctedClockOut);
    if (correctedClockIn && correctedClockOut) {
      updates.totalMinutes = Math.round((new Date(correctedClockOut).getTime() - new Date(correctedClockIn).getTime()) / 60000);
    }
    if (reason) updates.notes = `[CORRECTION] ${reason}`;
    await db.update(timeEntries).set(updates).where(and(eq(timeEntries.id, timeEntryId), eq(timeEntries.workspaceId, workspaceId)));
    await platformEventBus.publish({
      eventType: 'automation_completed',
      workspaceId: workspaceId || 'unknown',
      title: 'Timesheet Correction Submitted',
      description: `Trinity submitted a timesheet correction for entry ${timeEntryId}${reason ? `: ${reason}` : ''}`,
      data: { actionId: 'timesheet.submit_correction', timeEntryId, reason, correctedClockIn, correctedClockOut },
    });
    return { submitted: true, timeEntryId, reason };
  }));

  helpaiOrchestrator.registerAction(mkAction('timesheet.get_period_summary', async (params) => {
    const { workspaceId, date, employeeId } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const result = await getWeeklyReport(workspaceId, date ? new Date(date) : new Date(), employeeId);
    return result;
  }));

  helpaiOrchestrator.registerAction(mkPayrollAction('payroll.run_cycle', async (params) => {
    const { workspaceId, periodStart, periodEnd, createdBy } = params;
    if (!workspaceId || !periodStart || !periodEnd) return { error: 'workspaceId, periodStart, periodEnd required' };
    const run = await createAutomatedPayrollRun({
      workspaceId,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      createdBy: createdBy || 'trinity-ai',
    });
    return { success: true, payrollRun: run };
  }));

  helpaiOrchestrator.registerAction(mkPayrollAction('payroll.calculate_employee', async (params) => {
    const { workspaceId, employeeId, periodStart, periodEnd, hourlyRate } = params;
    if (!workspaceId || !employeeId) return { error: 'workspaceId and employeeId required' };
    const startDate = periodStart ? new Date(periodStart) : new Date(Date.now() - 14 * 86400000);
    const endDate = periodEnd ? new Date(periodEnd) : new Date();
    const entries = await db.select({ totalMinutes: (timeEntries as any).totalMinutes })
      .from(timeEntries)
      .where(and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.employeeId, employeeId),
        eq(timeEntries.status as any, 'approved'),
        gte(timeEntries.clockIn, startDate),
        lte(timeEntries.clockIn, endDate)
      ));
    const totalHours = entries.reduce((acc, e) => acc + (e.totalMinutes || 0) / 60, 0);
    const rate = hourlyRate || 18;
    const regularHours = Math.min(totalHours, 40);
    const otHours = Math.max(0, totalHours - 40);
    const regularPay = regularHours * rate;
    const otPay = otHours * rate * 1.5;
    const grossPay = regularPay + otPay;
    const ficaEmployer = grossPay * 0.0765;
    const futa = Math.min(grossPay, 7000) * 0.006;
    const totalCost = grossPay + ficaEmployer + futa;
    return {
      employeeId,
      periodStart: startDate,
      periodEnd: endDate,
      totalHours: +totalHours.toFixed(2),
      regularHours: +regularHours.toFixed(2),
      otHours: +otHours.toFixed(2),
      regularPay: +regularPay.toFixed(2),
      otPay: +otPay.toFixed(2),
      grossPay: +grossPay.toFixed(2),
      ficaEmployerShare: +ficaEmployer.toFixed(2),
      futaContribution: +futa.toFixed(2),
      totalCostToOrg: +totalCost.toFixed(2),
    };
  }));

  helpaiOrchestrator.registerAction(mkPayrollAction('payroll.validate_math', async (params) => {
    const { workspaceId, payrollRunId } = params;
    if (!payrollRunId) return { error: 'payrollRunId required' };
    const run = await db.query.payrollRuns?.findFirst({
      where: eq(payrollRuns.id, payrollRunId)
    } as any).catch(() => null);
    if (!run) return { valid: false, error: 'Payroll run not found' };
    const entries = await db.select({
      grossPay: payrollEntries.grossPay,
      netPay: payrollEntries.netPay,
    }).from(payrollEntries).where(eq(payrollEntries.payrollRunId, payrollRunId)).catch(() => []);
    const computedTotal = entries.reduce((acc, e) => acc + parseFloat(String(e.grossPay || 0)), 0);
    const storedTotal = parseFloat(String((run as any).totalGrossPay || 0));
    const variance = Math.abs(computedTotal - storedTotal);
    const negativeNet = entries.filter(e => parseFloat(String(e.netPay || 0)) < 0).length;
    return {
      valid: variance < 0.02 && negativeNet === 0,
      computedTotal: +computedTotal.toFixed(2),
      storedTotal: +storedTotal.toFixed(2),
      variance: +variance.toFixed(4),
      negativeNetCount: negativeNet,
      employeeCount: entries.length,
    };
  }));

  helpaiOrchestrator.registerAction(mkPayrollAction('payroll.submit_for_approval', async (params) => {
    const { payrollRunId, workspaceId } = params;
    // GAP-20 FIX: workspaceId added to WHERE so a Trinity action cannot submit a foreign workspace's run.
    if (!payrollRunId || !workspaceId) return { error: 'payrollRunId and workspaceId required' };
    await db.update(payrollRuns)
      .set({ status: 'pending' as 'pending', updatedAt: new Date() })
      .where(and(eq(payrollRuns.id, payrollRunId), eq(payrollRuns.workspaceId, workspaceId)));
    return { submitted: true, payrollRunId, status: 'pending' };
  }));

  helpaiOrchestrator.registerAction(mkPayrollAction('payroll.generate_paystub', async (params) => {
    const { workspaceId, payrollRunId, employeeId } = params;
    if (!payrollRunId || !employeeId) return { error: 'payrollRunId and employeeId required' };
    const entry = await db.select()
      .from(payrollEntries)
      .where(and(eq(payrollEntries.payrollRunId, payrollRunId), eq(payrollEntries.employeeId, employeeId)))
      .limit(1)
      .catch(() => []);
    if (!entry.length) return { error: 'No payroll entry found for this employee in this run' };
    const emp = await db.query.employees?.findFirst({ where: eq(employees.id, employeeId) } as any).catch(() => null);
    return {
      paystub: {
        employeeId,
        employeeName: emp ? `${(emp as any).firstName} ${(emp as any).lastName}` : 'Unknown',
        payrollRunId,
        grossPay: entry[0].grossPay,
        netPay: entry[0].netPay,
        deductions: (entry as any)[0]?.deductions,
        regularHours: entry[0].regularHours,
        overtimeHours: entry[0].overtimeHours,
        periodStart: (entry[0] as any).periodStart,
        periodEnd: (entry[0] as any).periodEnd,
      }
    };
  }));

  helpaiOrchestrator.registerAction(mkPayrollAction('payroll.export_for_accountant', async (params) => {
    const { workspaceId, payrollRunId } = params;
    if (!payrollRunId) return { error: 'payrollRunId required' };
    const entries = await db.select({
      employeeId: payrollEntries.employeeId,
      grossPay: payrollEntries.grossPay,
      netPay: payrollEntries.netPay,
      regularHours: payrollEntries.regularHours,
      overtimeHours: payrollEntries.overtimeHours,
      deductions: (payrollEntries as any).deductions,
    }).from(payrollEntries).where(eq(payrollEntries.payrollRunId, payrollRunId));
    const csv = ['EmployeeId,GrossPay,NetPay,RegularHours,OvertimeHours,Deductions',
      ...entries.map(e => `${e.employeeId},${e.grossPay},${e.netPay},${e.regularHours},${e.overtimeHours},${e.deductions}`)
    ].join('\n');
    return { csv, employeeCount: entries.length, payrollRunId };
  }));

  helpaiOrchestrator.registerAction(mkPayrollAction('payroll.push_to_qb', async (params) => {
    const { workspaceId, payrollRunId } = params;
    if (!workspaceId) return { error: 'workspaceId required' };

    if (payrollRunId) {
      const run = await db.select({
        id: payrollRuns.id,
        status: payrollRuns.status,
        periodStart: payrollRuns.periodStart,
        periodEnd: payrollRuns.periodEnd,
        totalGross: payrollRuns.totalGrossPay,
      }).from(payrollRuns)
        .where(and(eq(payrollRuns.id, payrollRunId), eq(payrollRuns.workspaceId, workspaceId)))
        .limit(1);

      if (!run.length) return { success: false, error: `Payroll run ${payrollRunId} not found` };

      const { status, periodStart, periodEnd, totalGross } = run[0];

      if (status === 'approved') {
        return {
          success: true,
          status,
          payrollRunId,
          totalGross,
          message: `Payroll run for ${periodStart?.toISOString?.()?.slice(0,10)} – ${periodEnd?.toISOString?.()?.slice(0,10)} is already approved. QuickBooks sync happens automatically after approval via the post-approval pipeline. If it has not yet appeared in QB, use the QB dashboard to verify connection and trigger a manual CDC poll from Finance settings.`,
        };
      }

      if (status === 'pending') {
        return {
          success: false,
          status,
          payrollRunId,
          action_needed: 'approve_first',
          message: `Payroll run ${payrollRunId} is pending approval. Use payroll.approve_run to approve it — QB sync happens automatically once approved.`,
        };
      }

      return {
        success: false,
        status,
        payrollRunId,
        action_needed: `finalize_run_first`,
        message: `Payroll run ${payrollRunId} has status '${status}'. Finalize and approve the run before it can be synced to QuickBooks.`,
      };
    }

    const pendingRuns = await db.select({
      id: payrollRuns.id,
      status: payrollRuns.status,
      periodStart: payrollRuns.periodStart,
      periodEnd: payrollRuns.periodEnd,
    }).from(payrollRuns)
      .where(and(eq(payrollRuns.workspaceId, workspaceId), eq(payrollRuns.status, 'approved')))
      .limit(5);

    return {
      success: true,
      approvedRunsCount: pendingRuns.length,
      approvedRuns: pendingRuns,
      message: pendingRuns.length > 0
        ? `Found ${pendingRuns.length} approved payroll run(s). QB sync is automatic post-approval. If not yet in QB, verify QuickBooks connection via finance.qb_status.`
        : 'No approved payroll runs found. Approve a payroll run first — QB sync happens automatically after approval.',
    };
  }));

  helpaiOrchestrator.registerAction(mkPayrollAction('qb.push_payroll', async (params) => {
    const { workspaceId, payrollRunId } = params;
    if (!workspaceId) return { error: 'workspaceId required' };

    if (payrollRunId) {
      const run = await db.select({
        id: payrollRuns.id,
        status: payrollRuns.status,
        periodStart: payrollRuns.periodStart,
        periodEnd: payrollRuns.periodEnd,
        totalGross: payrollRuns.totalGrossPay,
      }).from(payrollRuns)
        .where(and(eq(payrollRuns.id, payrollRunId), eq(payrollRuns.workspaceId, workspaceId)))
        .limit(1);

      if (!run.length) return { success: false, error: `Payroll run ${payrollRunId} not found` };
      const { status } = run[0];

      if (status === 'approved') {
        return {
          success: true,
          status,
          payrollRunId,
          message: 'Payroll run is approved. QuickBooks sync fires automatically via the post-approval pipeline. Check QB dashboard to confirm the entry, or use finance.qb_status to verify connection health.',
        };
      }

      return {
        success: false,
        status,
        payrollRunId,
        action_needed: status === 'pending' ? 'use payroll.approve_run first' : 'finalize run first',
        message: `Payroll run has status '${status}'. ${status === 'pending' ? 'Approve it first using payroll.approve_run — QB sync is automatic after approval.' : 'Finalize and approve the run before QuickBooks sync can occur.'}`,
      };
    }

    return {
      success: false,
      message: 'Provide payrollRunId to check its QuickBooks sync status. Alternatively, use payroll.list to find approved runs.',
    };
  }));

  helpaiOrchestrator.registerAction(mkInvoiceAction('billing.run_invoice_cycle', async (params) => {
    const { workspaceId } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    await runWeeklyBillingCycle(workspaceId);
    return { success: true, message: 'Invoice cycle triggered for workspace', workspaceId };
  }));

  helpaiOrchestrator.registerAction(mkInvoiceAction('billing.build_invoice_from_schedule', async (params) => {
    const { workspaceId, clientId, startDate, endDate } = params;
    if (!workspaceId || !clientId || !startDate || !endDate) return { error: 'workspaceId, clientId, startDate, endDate required' };
    const result = await generateInvoiceFromHours({ workspaceId, clientId, startDate, endDate });
    return result;
  }));

  helpaiOrchestrator.registerAction(mkInvoiceAction('billing.hold_invoice_for_approval', async (params) => {
    const { invoiceId, workspaceId } = params;
    // GAP-20 FIX: workspaceId added to WHERE so a Trinity action cannot hold a foreign workspace's invoice.
    if (!invoiceId || !workspaceId) return { error: 'invoiceId and workspaceId required' };
    await db.update(invoices)
      .set({ status: 'pending' as 'pending', updatedAt: new Date() })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)));
    await platformEventBus.publish({
      eventType: 'approval_granted',
      workspaceId: workspaceId || 'unknown',
      title: 'Invoice Held for Approval',
      description: `Trinity placed invoice ${invoiceId} on hold pending human approval`,
      data: { actionId: 'billing.hold_invoice_for_approval', invoiceId, status: 'pending' },
    });
    return { held: true, invoiceId, status: 'pending' };
  }));

  helpaiOrchestrator.registerAction(mkInvoiceAction('billing.void_and_reissue_invoice', async (params) => {
    const { invoiceId, workspaceId, reason } = params;
    // GAP-20 FIX: workspaceId added to WHERE so a Trinity action cannot void a foreign workspace's invoice.
    if (!invoiceId || !workspaceId) return { error: 'invoiceId and workspaceId required' };
    await db.update(invoices)
      .set({ status: 'void' as any, notes: `[VOIDED] ${reason || 'Trinity void and reissue'}`, updatedAt: new Date() } as any)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)));
    await platformEventBus.publish({
      eventType: 'invoice_voided',
      workspaceId: workspaceId || 'unknown',
      title: 'Invoice Voided by Trinity',
      description: `Trinity voided invoice ${invoiceId}${reason ? `: ${reason}` : ''}. Replacement invoice should be issued.`,
      data: { actionId: 'billing.void_and_reissue_invoice', invoiceId, reason },
    });
    return { voided: true, invoiceId, note: `Invoice voided. Create replacement via billing.build_invoice_from_schedule.` };
  }));

  helpaiOrchestrator.registerAction(mkInvoiceAction('billing.schedule_invoice_followup', async (params) => {
    const { invoiceId, workspaceId, followupDate, message } = params;
    // GAP-20 FIX: workspaceId added to WHERE so a Trinity action cannot annotate a foreign workspace's invoice.
    if (!invoiceId || !workspaceId) return { error: 'invoiceId and workspaceId required' };
    const followUp = followupDate ? new Date(followupDate) : new Date(Date.now() + 5 * 86400000);
    await db.update(invoices)
      .set({ notes: `[FOLLOWUP_SCHEDULED:${followUp.toISOString()}] ${message || 'Automated follow-up reminder'}`, updatedAt: new Date() } as any)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)));
    await platformEventBus.publish({
      eventType: 'automation_completed',
      workspaceId: workspaceId || 'unknown',
      title: 'Invoice Follow-Up Scheduled',
      description: `Trinity scheduled a follow-up for invoice ${invoiceId} on ${followUp.toISOString()}`,
      data: { actionId: 'billing.schedule_invoice_followup', invoiceId, followupDate: followUp.toISOString(), message },
    });
    return { scheduled: true, invoiceId, followupDate: followUp.toISOString() };
  }));

  // finance.aging_report removed — duplicate of billing.aging_report in platformActionHub.ts (uses billingAutomation service)

  log.info('[Trinity Timesheet+Payroll Cycle] Registered 17 timesheet, payroll, invoice cycle actions');
}
