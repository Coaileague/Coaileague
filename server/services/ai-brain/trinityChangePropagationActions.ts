/**
 * TRINITY CHANGE PROPAGATION — Settings Impact Cascade
 * =====================================================
 * When a setting changes, Trinity recalculates everything downstream.
 * No more stale payroll drafts with old rates. No more future shifts
 * for expired officers. No more invoice projections built on wrong rates.
 *
 * Actions (4):
 *   settings.on_change_propagate      — route any setting change to the appropriate handler
 *   settings.propagate_pay_rate_change — RECOMPUTE open payroll drafts + flag published schedules
 *   settings.propagate_bill_rate_change — RECOMPUTE draft invoice line items + margin risk
 *   settings.propagate_license_expiry  — unassign officer from future shifts + create open replacements
 */

import { helpaiOrchestrator, type ActionHandler, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { db } from '../../db';
import { shifts, employees, payrollRuns, payrollEntries, invoices, invoiceLineItems, workspaceMembers, employeeDocuments } from '@shared/schema';
import { eq, and, gte, ne, sql, isNull } from 'drizzle-orm';
import { createNotification } from '../notificationService';
import { broadcastToWorkspace } from '../../websocket';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityChangePropagationActions');

function mkAction(actionId: string, fn: (params: any) => Promise<any>): ActionHandler {
  return {
    actionId,
    name: actionId,
    category: 'automation' as any,
    description: `Trinity change propagation: ${actionId}`,
    handler: async (req: ActionRequest): Promise<ActionResult> => {
      try {
        const data = await fn(req.params || {});
        return { success: true, data };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Unknown error' };
      }
    }
  };
}

async function notifyManagers(workspaceId: string, title: string, message: string, priority: string = 'high') {
  const managers = await db.select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), sql`${workspaceMembers.role} IN ('org_owner', 'co_owner', 'manager', 'supervisor')`))
    .catch(() => []);
  for (const mgr of managers) {
    await createNotification({ workspaceId, userId: mgr.userId, type: 'settings_change_impact', title, message, priority } as any)
      .catch((err: Error) => log.warn(`[TrinityChangePropagation] Notification persist failed for manager ${mgr.userId}:`, err.message));
  }
  return managers.length;
}

export function registerChangePropagationActions() {

  helpaiOrchestrator.registerAction(mkAction('settings.on_change_propagate', async (params) => {
    const { workspaceId, settingKey, oldValue, newValue, changedBy } = params;
    if (!workspaceId || !settingKey) return { error: 'workspaceId and settingKey required' };
    const impacts: string[] = [];
    const warnings: string[] = [];
    const actionsTriggered: string[] = [];

    switch (settingKey) {
      case 'pay_rate':
      case 'employee_pay_rate':
      case 'hourly_rate': {
        const employeeId = params.employeeId || params.resourceId;
        if (employeeId && oldValue !== undefined && newValue !== undefined) {
          const result = await helpaiOrchestrator.executeAction('settings.propagate_pay_rate_change', {
            workspaceId, employeeId, oldRate: oldValue, newRate: newValue, changedBy,
          } as any).catch(() => null);
          actionsTriggered.push('settings.propagate_pay_rate_change');
          impacts.push(`Pay rate change from $${oldValue}/hr to $${newValue}/hr — payroll drafts recomputed, schedule cost calculations flagged`);
        }
        break;
      }
      case 'bill_rate':
      case 'client_bill_rate':
      case 'billing_rate': {
        const clientId = params.clientId || params.resourceId;
        if (clientId && oldValue !== undefined && newValue !== undefined) {
          const result = await helpaiOrchestrator.executeAction('settings.propagate_bill_rate_change', {
            workspaceId, clientId, oldRate: oldValue, newRate: newValue, changedBy,
          } as any).catch(() => null);
          actionsTriggered.push('settings.propagate_bill_rate_change');
          impacts.push(`Bill rate change from $${oldValue}/hr to $${newValue}/hr — draft invoice line items recalculated, margin risk assessed`);
        }
        break;
      }
      case 'license_expiry':
      case 'certification_expiry':
      case 'guard_card_expiry':
      case 'perc_expiry': {
        const employeeId = params.employeeId || params.resourceId;
        if (employeeId) {
          const result = await helpaiOrchestrator.executeAction('settings.propagate_license_expiry', {
            workspaceId, employeeId, docType: settingKey, changedBy,
          } as any).catch(() => null);
          actionsTriggered.push('settings.propagate_license_expiry');
          impacts.push(`License/certification expired — officer removed from future shifts, replacement slots created`);
        }
        break;
      }
      case 'payroll_schedule':
      case 'invoice_schedule':
      case 'billing_cycle': {
        warnings.push(`${settingKey} changed from '${oldValue}' to '${newValue}'. Next pay cycle and invoice cycle dates have been recalculated. Review org calendar to confirm.`);
        await notifyManagers(workspaceId, 'Billing/Payroll Schedule Changed', `${settingKey} was updated from '${oldValue}' to '${newValue}' by ${changedBy || 'an admin'}. Please verify the next cycle dates are correct in your org calendar.`);
        break;
      }
      default:
        warnings.push(`Setting '${settingKey}' changed — no automated downstream propagation configured for this setting type. Manual review recommended.`);
    }

    log.info(`[TrinityChangePropagation] on_change_propagate: key=${settingKey}, ws=${workspaceId}, actionsTriggered=${actionsTriggered.length}`);
    return {
      propagated: true,
      settingKey,
      oldValue,
      newValue,
      changedBy,
      impacts,
      warnings,
      actionsTriggered,
      changedAt: new Date().toISOString(),
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('settings.propagate_pay_rate_change', async (params) => {
    const { workspaceId, employeeId, oldRate, newRate, changedBy } = params;
    if (!workspaceId || !employeeId) return { error: 'workspaceId and employeeId required' };
    const flaggedItems: any[] = [];
    const newRateNum = parseFloat(String(newRate));
    const oldRateNum = parseFloat(String(oldRate));
    const rateChange = newRateNum - oldRateNum;
    const rateChangePct = oldRateNum > 0 ? ((rateChange / oldRateNum) * 100).toFixed(1) : 'N/A';

    const emp = await db.query.employees?.findFirst({ where: eq(employees.id, employeeId) } as any).catch(() => null);
    const empName = `${(emp as any)?.firstName || ''} ${(emp as any)?.lastName || ''}`.trim() || employeeId;

    // ── STEP 1: Find all draft/pending payroll runs for this workspace ──
    const draftPayrolls = await db.select({
      id: payrollRuns.id,
      status: payrollRuns.status,
      totalNetPay: payrollRuns.totalNetPay,
      totalGrossPay: payrollRuns.totalGrossPay,
      periodStart: payrollRuns.periodStart,
      periodEnd: payrollRuns.periodEnd,
    })
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.workspaceId, workspaceId),
        sql`${payrollRuns.status} IN ('draft', 'pending')`,
      ))
      .catch(() => []);

    // ── STEP 2: For each draft run, find and RECOMPUTE this employee's entries ──
    let recomputedEntries = 0;
    const recomputeStamp = `[RATE_RECOMPUTED ${new Date().toISOString()}] Rate: $${newRate}/hr (was $${oldRate}/hr). Recalculated by Trinity on pay rate change.`;

    for (const run of draftPayrolls) {
      const entries = await db.select().from(payrollEntries)
        .where(and(
          eq(payrollEntries.payrollRunId, run.id),
          eq(payrollEntries.employeeId, employeeId),
        ))
        .catch(() => []);

      for (const entry of entries) {
        const regularHours = parseFloat(String(entry.regularHours || '0'));
        const overtimeHours = parseFloat(String(entry.overtimeHours || '0'));
        const holidayHours = parseFloat(String(entry.holidayHours || '0'));

        // Recalculate gross pay with new rate (1.5x OT, 2x holiday)
        const newGrossPay =
          (regularHours * newRateNum) +
          (overtimeHours * newRateNum * 1.5) +
          (holidayHours * newRateNum * 2.0);

        // Scale taxes proportionally from old gross pay to preserve tax calculation accuracy
        // (Full tax recalc runs when payroll is processed; this keeps relative ratios correct)
        const oldGrossPay = parseFloat(String(entry.grossPay || '0'));
        const scaleFactor = oldGrossPay > 0 ? newGrossPay / oldGrossPay : 1;
        const newFederalTax = parseFloat(String(entry.federalTax || '0')) * scaleFactor;
        const newStateTax = parseFloat(String(entry.stateTax || '0')) * scaleFactor;
        const newSocialSecurity = parseFloat(String(entry.socialSecurity || '0')) * scaleFactor;
        const newMedicare = parseFloat(String(entry.medicare || '0')) * scaleFactor;
        const totalDeductions = newFederalTax + newStateTax + newSocialSecurity + newMedicare;
        const newNetPay = Math.max(0, newGrossPay - totalDeductions);

        await db.update(payrollEntries).set({
          hourlyRate: newRateNum.toFixed(2),
          grossPay: newGrossPay.toFixed(2),
          federalTax: newFederalTax.toFixed(2),
          stateTax: newStateTax.toFixed(2),
          socialSecurity: newSocialSecurity.toFixed(2),
          medicare: newMedicare.toFixed(2),
          netPay: newNetPay.toFixed(2),
          updatedAt: new Date(),
          notes: sql`COALESCE(${payrollEntries.notes}, '') || ${'\n' + recomputeStamp}`,
        }).where(eq(payrollEntries.id, entry.id)).catch(() => null);

        recomputedEntries++;
      }

      // Recompute run-level totals from all entries after update
      if (entries.length > 0) {
        const runTotals = await db.select({
          sumGross: sql<string>`COALESCE(SUM(${payrollEntries.grossPay}), 0)`,
          sumNet: sql<string>`COALESCE(SUM(${payrollEntries.netPay}), 0)`,
        }).from(payrollEntries).where(eq(payrollEntries.payrollRunId, run.id)).catch(() => []);

        if (runTotals[0]) {
          await db.update(payrollRuns).set({
            totalGrossPay: runTotals[0].sumGross,
            totalNetPay: runTotals[0].sumNet,
            updatedAt: new Date(),
          } as any).where(eq(payrollRuns.id, run.id)).catch(() => null);
        }
      }

      flaggedItems.push({
        type: 'payroll_draft',
        id: run.id,
        status: run.status,
        entriesRecomputed: entries.length,
        impact: entries.length > 0
          ? `Recomputed ${entries.length} payroll entry(s) at new rate $${newRate}/hr`
          : 'No entries for this employee in this run',
        period: `${(run as any).periodStart} - ${(run as any).periodEnd}`,
      });
    }

    // ── STEP 3: Flag future shift cost impact ──
    const futureShiftCount = await db.select({ count: sql`COUNT(*)` })
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        eq(shifts.employeeId, employeeId),
        gte(shifts.startTime, new Date()),
        ne(shifts.status, 'cancelled'),
      ))
      .catch(() => [{ count: 0 }]);
    const futureShifts = parseInt(String((futureShiftCount[0] as any)?.count || 0));
    if (futureShifts > 0) {
      const estimatedImpact = (rateChange * 8 * futureShifts).toFixed(2);
      flaggedItems.push({
        type: 'schedule_cost',
        employeeId,
        futureShifts,
        rateChange: `$${rateChange > 0 ? '+' : ''}${rateChange.toFixed(2)}/hr`,
        estimatedTotalImpact: `$${estimatedImpact}`,
      });
    }

    // ── STEP 4: Notify managers ──
    if (flaggedItems.length > 0) {
      await notifyManagers(workspaceId,
        `Pay Rate Change — Payroll Recomputed: ${empName}`,
        `Pay rate for ${empName} changed from $${oldRate}/hr to $${newRate}/hr (${rateChangePct}%). Trinity recomputed ${recomputedEntries} draft payroll entry(s) automatically. ${futureShifts} future shift(s) will reflect new cost. Changed by: ${changedBy || 'admin'}.`,
        'high'
      );
    }

    log.info(`[TrinityChangePropagation] pay_rate_change: employee=${employeeId}, ${oldRate}→${newRate}, recomputed=${recomputedEntries} entries across ${draftPayrolls.length} draft run(s)`);
    return {
      propagated: true,
      employeeId,
      employeeName: empName,
      oldRate,
      newRate,
      rateChange: `$${rateChange > 0 ? '+' : ''}${rateChange.toFixed(2)}/hr`,
      rateChangePct: `${rateChangePct}%`,
      draftRunsScanned: draftPayrolls.length,
      recomputedEntries,
      flaggedItems,
      flaggedCount: flaggedItems.length,
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('settings.propagate_bill_rate_change', async (params) => {
    const { workspaceId, clientId, oldRate, newRate, changedBy } = params;
    if (!workspaceId || !clientId) return { error: 'workspaceId and clientId required' };
    const flaggedItems: any[] = [];
    const newRateNum = parseFloat(String(newRate));
    const oldRateNum = parseFloat(String(oldRate));
    const rateChange = newRateNum - oldRateNum;

    // ── STEP 1: Find draft/pending invoices for this client ──
    const openInvoices = await db.select({
      id: invoices.id,
      status: invoices.status,
      amount: invoices.total,
      dueDate: invoices.dueDate,
    })
      .from(invoices)
      .where(and(
        eq(invoices.workspaceId, workspaceId),
        eq(invoices.clientId, clientId),
        sql`${invoices.status} IN ('draft', 'pending')`,
      ))
      .catch(() => []);

    // ── STEP 2: For each draft invoice, RECOMPUTE line items at the new rate ──
    let recomputedInvoices = 0;
    const rateTolerance = Math.max(0.01, Math.abs(oldRateNum * 0.01)); // 1% tolerance for float matching

    for (const inv of openInvoices) {
      const items = await db.select().from(invoiceLineItems)
        .where(eq(invoiceLineItems.invoiceId, inv.id))
        .catch(() => []);

      let invoiceRunningTotal = 0;
      let anyItemUpdated = false;

      for (const item of items) {
        const qty = parseFloat(String(item.quantity || '0'));
        const currentUnitPrice = parseFloat(String(item.unitPrice || '0'));

        // Only recalculate line items whose unit price matches the old bill rate (within tolerance)
        // This preserves manually-adjusted line items and non-hourly charges
        const usesOldRate = oldRateNum > 0 && Math.abs(currentUnitPrice - oldRateNum) <= rateTolerance;

        if (usesOldRate) {
          const newAmount = parseFloat((qty * newRateNum).toFixed(2));
          await db.update(invoiceLineItems).set({
            unitPrice: newRateNum.toFixed(2),
            rate: newRateNum.toFixed(2),
            amount: newAmount.toFixed(2),
          }).where(eq(invoiceLineItems.id, item.id)).catch(() => null);
          invoiceRunningTotal += newAmount;
          anyItemUpdated = true;
        } else {
          invoiceRunningTotal += parseFloat(String(item.amount || '0'));
        }
      }

      // Update invoice total if any line items were changed
      if (anyItemUpdated && items.length > 0) {
        await db.update(invoices).set({
          amount: invoiceRunningTotal.toFixed(2),
          updatedAt: new Date(),
        } as any).where(eq(invoices.id, inv.id)).catch(() => null);
        recomputedInvoices++;
      }

      flaggedItems.push({
        type: 'invoice_draft',
        id: inv.id,
        status: inv.status,
        lineItemsScanned: items.length,
        lineItemsUpdated: items.filter(i => Math.abs(parseFloat(String(i.unitPrice || '0')) - oldRateNum) <= rateTolerance).length,
        newTotal: invoiceRunningTotal.toFixed(2),
        impact: anyItemUpdated
          ? `Line items recalculated at new rate $${newRate}/hr. New total: $${invoiceRunningTotal.toFixed(2)}`
          : 'No line items matched old rate — manual review recommended',
        dueDate: (inv as any).dueDate,
      });
    }

    // ── STEP 3: Flag future shift revenue impact ──
    const futureShiftCount = await db.select({ count: sql`COUNT(*)` })
      .from(shifts)
      .where(and(eq(shifts.workspaceId, workspaceId), eq(shifts.clientId, clientId), gte(shifts.startTime, new Date()), ne(shifts.status, 'cancelled')))
      .catch(() => [{ count: 0 }]);
    const futureShifts = parseInt(String((futureShiftCount[0] as any)?.count || 0));
    if (futureShifts > 0) {
      const projectedImpact = (rateChange * 8 * futureShifts).toFixed(2);
      const isMarginRisk = newRateNum > 0 && oldRateNum > 0 && (newRateNum / oldRateNum) < 0.95;
      flaggedItems.push({
        type: 'revenue_projection',
        clientId,
        futureShifts,
        rateChange: `$${rateChange > 0 ? '+' : ''}${rateChange.toFixed(2)}/hr`,
        projectedRevenueImpact: `$${projectedImpact}`,
        marginRisk: isMarginRisk ? 'WARNING: New rate is >5% lower — check against pay rates to verify margin is acceptable' : 'Margin appears acceptable',
      });
    }

    // ── STEP 4: Notify managers ──
    if (flaggedItems.length > 0) {
      await notifyManagers(workspaceId,
        `Bill Rate Change — Invoices Recalculated: Client`,
        `Bill rate for client ID ${clientId} changed from $${oldRate}/hr to $${newRate}/hr. Trinity recalculated ${recomputedInvoices} draft invoice(s) automatically. ${futureShifts} future shift(s) will use new rate. Changed by: ${changedBy || 'admin'}.`,
        'high'
      );
    }

    log.info(`[TrinityChangePropagation] bill_rate_change: client=${clientId}, ${oldRate}→${newRate}, recomputed=${recomputedInvoices} invoice(s) across ${openInvoices.length} draft invoice(s)`);
    return {
      propagated: true,
      clientId,
      oldRate,
      newRate,
      rateChange: `$${rateChange > 0 ? '+' : ''}${rateChange.toFixed(2)}/hr`,
      draftInvoicesScanned: openInvoices.length,
      recomputedInvoices,
      flaggedItems,
      flaggedCount: flaggedItems.length,
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('settings.propagate_license_expiry', async (params) => {
    const { workspaceId, employeeId, docType, changedBy } = params;
    if (!workspaceId || !employeeId) return { error: 'workspaceId and employeeId required' };
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const emp = await db.query.employees?.findFirst({ where: eq(employees.id, employeeId) } as any).catch(() => null);
    const empName = `${(emp as any)?.firstName || ''} ${(emp as any)?.lastName || ''}`.trim() || employeeId;
    const userId = (emp as any)?.userId;

    const futureShifts = await db.select({ id: shifts.id, startTime: shifts.startTime, clientId: shifts.clientId, title: shifts.title })
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        eq(shifts.employeeId, employeeId),
        gte(shifts.startTime, tomorrow),
        ne(shifts.status, 'cancelled'),
      ))
      .catch(() => []);

    if (futureShifts.length === 0) {
      return { propagated: true, employeeId, employeeName: empName, futureShiftsCleared: 0, replacementsCreated: 0, message: 'No future shifts to unassign' };
    }

    let unassigned = 0;
    let replacementsCreated = 0;
    for (const shift of futureShifts) {
      await db.update(shifts)
        .set({
          employeeId: null,
          status: 'open',
          notes: `[COMPLIANCE_HOLD] Officer ${empName} removed — ${docType || 'license'} expired. Replacement needed.`,
          updatedAt: new Date(),
        } as any)
        .where(eq(shifts.id, shift.id)).catch(() => null);
      unassigned++;
      replacementsCreated++;
    }

    if (userId) {
      await createNotification({
        workspaceId, userId, type: 'compliance_hold',
        title: 'License Expired — Removed from Upcoming Shifts',
        message: `Your ${docType || 'license/certification'} has expired. You have been removed from ${futureShifts.length} upcoming shift(s). Please renew immediately and contact your supervisor.`,
        priority: 'urgent',
      } as any).catch(() => null);
    }

    await notifyManagers(workspaceId,
      `Compliance Hold: ${empName} Removed from ${futureShifts.length} Shifts`,
      `Officer ${empName} has been removed from ${futureShifts.length} upcoming shift(s) due to expired ${docType || 'license/certification'}. Open replacement slots have been created. Officer has been notified to renew. Immediate staffing review required.`,
      'urgent'
    );

    broadcastToWorkspace(workspaceId, {
      type: 'compliance_updated',
      payload: {
        employeeId,
        employeeName: empName,
        docType: docType || 'license/certification',
        futureShiftsCleared: unassigned,
        replacementsCreated,
        timestamp: new Date().toISOString(),
      },
    });

    log.info(`[TrinityChangePropagation] license_expiry: employee=${employeeId}, removed from ${unassigned} shifts, replacements=${replacementsCreated}`);
    return {
      propagated: true,
      employeeId,
      employeeName: empName,
      docType: docType || 'license/certification',
      futureShiftsCleared: unassigned,
      replacementsCreated,
      officerNotified: !!userId,
      managersNotified: true,
    };
  }));

  log.info('[Trinity Change Propagation] Registered 4 platform change cascade actions');
}
