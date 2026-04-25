/**
 * PAYROLL TAX CENTER SERVICE
 * ============================
 * Aggregation services for the tax center dashboard and pre-run checklist.
 * Extracted from inline handlers in payrollRoutes.ts.
 *
 * getTaxCenterData() — GET /tax-center
 *   Aggregates: W-2 vs 1099 roster classification, contractor $600+ threshold
 *   detection, generated form counts, filing deadlines, fee estimates.
 *
 * getPreRunChecklist() — GET /pre-run-checklist
 *   Aggregates: outstanding invoices for the current pay period, pending
 *   payroll obligations, recommendation for whether to proceed with payroll.
 *   Helps managers ensure cash is on the way before disbursing payroll.
 */

import { db } from '../../db';
import {
  employees,
  payrollEntries,
  payrollRuns,
  employeeTaxForms,
  invoices,
  clients,
} from '@shared/schema';
import { eq, and, gte, lte, sql, inArray } from 'drizzle-orm';
import { storage } from '../../storage';
import { taxFilingAssistanceService } from '../taxFilingAssistanceService';
import { getWorkspaceTier } from '../../tierGuards';
import { getMiddlewareFees } from '@shared/billingConfig';
import { PLATFORM } from '@shared/platformConfig';
import {
  startOfWeek, endOfWeek, subDays,
  startOfMonth, endOfMonth,
} from 'date-fns';
import { createLogger } from '../../lib/logger';

const log = createLogger('payrollTaxCenterService');

const FORM_1099_THRESHOLD = 600;

// ─── Tax Center ───────────────────────────────────────────────────────────────

export async function getTaxCenterData(workspaceId: string, taxYearOverride?: number) {
  const currentYear = new Date().getFullYear();
  const priorYear = currentYear - 1;
  const taxYear = taxYearOverride ?? priorYear;

  // 1. Classify employees (W-2 vs 1099) for the current roster
  const roster = await db.select({
    id: employees.id,
    workerType: employees.workerType,
    firstName: employees.firstName,
    lastName: employees.lastName,
  }).from(employees)
    .where(and(eq(employees.workspaceId, workspaceId), eq(employees.isActive, true)));

  const w2Employees    = roster.filter(e => (e.workerType || 'employee') !== 'contractor');
  const contractorRoster = roster.filter(e => (e.workerType || 'employee') === 'contractor');

  // 2. Scan prior-year payroll totals — find contractors paid $600+
  const yearStart = new Date(taxYear, 0, 1);
  const yearEnd   = new Date(taxYear, 11, 31, 23, 59, 59);

  let contractorsAbove600 = 0;
  const contractorDetails: Array<{
    employeeId: string;
    name: string;
    totalPaid: number;
    requiresFiling: boolean;
  }> = [];

  for (const contractor of contractorRoster) {
    try {
      const totals = await db.select({
        totalPaid: sql<string>`COALESCE(SUM(${payrollEntries.grossPay}), 0)`,
      }).from(payrollEntries)
        .innerJoin(payrollRuns, eq(payrollEntries.payrollRunId, payrollRuns.id))
        .where(and(
          eq(payrollEntries.employeeId, contractor.id),
          eq(payrollRuns.workspaceId, workspaceId),
          gte(payrollRuns.periodStart, yearStart),
          lte(payrollRuns.periodEnd, yearEnd),
        ));

      const totalPaid = parseFloat(totals[0]?.totalPaid || '0');
      const requiresFiling = totalPaid >= FORM_1099_THRESHOLD;
      if (requiresFiling) contractorsAbove600++;

      contractorDetails.push({
        employeeId: contractor.id,
        name: `${contractor.firstName || ''} ${contractor.lastName || ''}`.trim(),
        totalPaid,
        requiresFiling,
      });
    } catch (err) {
      log.warn('[TaxCenter] Contractor total calc failed', { employeeId: contractor.id });
    }
  }

  // 3. Count already-generated forms for this tax year
  const forms = await db.select().from(employeeTaxForms)
    .where(and(
      eq(employeeTaxForms.workspaceId, workspaceId),
      eq(employeeTaxForms.taxYear, taxYear),
    ));

  const w2sGenerated    = forms.filter(f => f.formType === 'w2').length;
  const form1099sGenerated = forms.filter(f => f.formType === '1099').length;

  // 4. Filing deadlines
  const deadlines = taxFilingAssistanceService.getFilingDeadlines(taxYear);

  // 5. Fee estimate for this workspace's tier
  const tierId = await getWorkspaceTier(workspaceId) as any;
  const fees   = getMiddlewareFees(tierId);
  const w2PerFormDollars       = fees.taxForms.w2PerFormCents / 100;
  const form1099PerFormDollars = fees.taxForms.form1099PerFormCents / 100;

  return {
    taxYear,
    employees: {
      w2Count: w2Employees.length,
      total1099Count: contractorRoster.length,
      contractorsAbove600,
      contractorDetails,
    },
    forms: {
      w2sGenerated,
      form1099sGenerated,
      w2sExpected: w2Employees.length,
      form1099sExpected: contractorsAbove600,
    },
    deadlines,
    filingGuides: {
      w2:       { url: 'https://www.ssa.gov/employer',               label: 'SSA Business Services Online' },
      form1099: { url: 'https://www.irs.gov/filing/e-file-providers', label: 'IRS FIRE System' },
      form941:  { url: 'https://www.eftps.gov',                      label: 'Electronic Federal Tax System (EFTPS)' },
      texasTWC: { url: 'https://apps.twc.state.tx.us',               label: 'Texas Workforce Commission' },
    },
    fees: {
      w2PerForm: w2PerFormDollars,
      form1099PerForm: form1099PerFormDollars,
      tierDiscountPercent: fees.tierDiscount,
      estimatedTotal: +(
        w2Employees.length * w2PerFormDollars +
        contractorsAbove600 * form1099PerFormDollars
      ).toFixed(2),
    },
    disclaimer: `${PLATFORM.name} is middleware — we generate and deliver tax forms but do not file them with the IRS, SSA, or state agencies. Verify all figures with your CPA or tax professional before filing.`,
  };
}

// ─── Pre-Run Checklist ────────────────────────────────────────────────────────

export async function getPreRunChecklist(workspaceId: string) {
  const workspace = await storage.getWorkspace(workspaceId);
  const blob  = (workspace?.billingSettingsBlob as any) || {};
  const cycle = blob.payrollCycle || 'bi-weekly';

  const now = new Date();
  let periodStart: Date;
  let periodEnd: Date;

  if (cycle === 'weekly') {
    periodStart = startOfWeek(now, { weekStartsOn: 0 });
    periodEnd   = endOfWeek(now, { weekStartsOn: 0 });
  } else if (cycle === 'monthly') {
    periodStart = startOfMonth(now);
    periodEnd   = endOfMonth(now);
  } else {
    // bi-weekly default
    const twoWeeksAgo = subDays(now, 13);
    // FIX [GAP-2 UTC REGRESSION]: Use setUTCHours to avoid timezone boundary issues
    twoWeeksAgo.setUTCHours(0, 0, 0, 0);
    periodStart = twoWeeksAgo;
    periodEnd   = now;
  }

  // Outstanding invoices for the period (draft or sent = uncollected)
  const outstandingInvoices = await db.select({
    id: invoices.id,
    invoiceNumber: invoices.invoiceNumber,
    clientId: invoices.clientId,
    total: invoices.total,
    status: invoices.status,
    dueDate: invoices.dueDate,
    createdAt: invoices.createdAt,
  }).from(invoices)
    .where(and(
      eq(invoices.workspaceId, workspaceId),
      sql`${invoices.status} IN ('draft', 'sent')`,
      sql`${invoices.createdAt} >= ${periodStart}`,
      sql`${invoices.createdAt} <= ${periodEnd}`,
    ));

  // Resolve client names
  const clientIds = [...new Set(outstandingInvoices.map(i => i.clientId).filter(Boolean))];
  const clientMap = new Map<string, string>();

  if (clientIds.length > 0) {
    const clientRows = await db.select({ id: clients.id, companyName: clients.companyName })
      .from(clients)
      .where(inArray(clients.id, clientIds as string[]));
    for (const c of clientRows) clientMap.set(c.id, c.companyName || 'Unknown');
  }

  const totalOutstanding = outstandingInvoices.reduce((s, i) => s + parseFloat(i.total), 0);
  const unsentDrafts     = outstandingInvoices.filter(i => i.status === 'draft');
  const sentUnpaid       = outstandingInvoices.filter(i => i.status === 'sent');

  // Pending payroll obligation
  const [payrollObligation] = await db.select({
    total: sql<string>`COALESCE(SUM(${payrollRuns.totalNetPay}), 0)`,
  }).from(payrollRuns)
    .where(and(
      eq(payrollRuns.workspaceId, workspaceId),
      sql`${payrollRuns.status} IN ('draft', 'pending')`,
    ));

  const recommendation = unsentDrafts.length > 0
    ? `You have ${unsentDrafts.length} unsent draft invoice${unsentDrafts.length === 1 ? '' : 's'} totaling $${unsentDrafts.reduce((s, i) => s + parseFloat(i.total), 0).toFixed(2)}. Consider sending them before approving payroll to ensure cash is on the way.`
    : totalOutstanding > 0
      ? `You have ${sentUnpaid.length} outstanding invoice${sentUnpaid.length === 1 ? '' : 's'} awaiting payment. Monitor collections before payroll disbursement.`
      : 'All invoices for this period are settled. You are clear to approve payroll.';

  return {
    payPeriod: { start: periodStart.toISOString(), end: periodEnd.toISOString(), cycle },
    payrollObligation: parseFloat(payrollObligation?.total || '0'),
    outstandingInvoices: outstandingInvoices.map(i => ({
      ...i,
      clientName: clientMap.get(i.clientId!) || 'Unknown',
      amount: parseFloat(i.total),
    })),
    summary: {
      totalOutstanding,
      unsentDrafts: unsentDrafts.length,
      sentUnpaid: sentUnpaid.length,
      totalCount: outstandingInvoices.length,
    },
    recommendation,
  };
}
