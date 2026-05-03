/**
 * Financial Reports Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates AI-recreated-from-scratch financial document PDFs for tenants:
 *   - Account Statement (per client)
 *   - Balance Sheet (point-in-time)
 *   - Cash Flow Statement (period)
 *   - P&L Statement (period)
 *   - AR Aging Report
 *   - AP Aging Report (expenses-as-payables proxy)
 *   - Expense Report
 *   - Payment Receipt
 *
 * All PDFs use pdfTemplateBase — single design system, no form overlays.
 * Each function returns a Buffer the caller can stream or persist.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import PDFDocument from 'pdfkit';
import { db } from '../db';
import { format } from 'date-fns';
import { and, eq, gte, lte, sql, desc } from 'drizzle-orm';
import {
  invoices,
  invoicePayments,
  expenses,
  payrollRuns,
  clients,
  workspaces,
} from '@shared/schema';
import {
  PDF, PAGE,
  renderPdfHeader, renderPdfFooter,
  hlinePdf, sectionBar,
  loadTenantLogo,
} from './pdfTemplateBase';
import { createLogger } from '../lib/logger';

type PDFDocumentType = InstanceType<typeof PDFDocument>;
const log = createLogger('FinancialReportsService');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt$ = (n: number): string =>
  (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });

const num = (v: unknown): number => {
  if (v === null || v === undefined) return 0;
  const parsed = parseFloat(String(v));
  return isNaN(parsed) ? 0 : parsed;
};

interface WorkspaceMeta {
  id: string;
  name: string;
  companyName: string;
  address?: string | null;
  taxId?: string | null;
  logoBuffer: Buffer | null;
}

async function loadWorkspaceMeta(workspaceId: string): Promise<WorkspaceMeta> {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const logoBuffer = await loadTenantLogo(workspaceId);
  return {
    id: workspaceId,
    name: ws?.name || 'Workspace',
    companyName: ws?.companyName || ws?.name || 'Workspace',
    address: ws?.address ?? null,
    taxId: ws?.taxId ?? null,
    logoBuffer,
  };
}

function startDoc(opts: {
  title: string;
  subtitle?: string;
  refLabel?: string;
  ws: WorkspaceMeta;
}): PDFDocumentType {
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: PAGE.MT, bottom: PAGE.MB, left: PAGE.ML, right: PAGE.MR },
    bufferPages: true,
  });
  renderPdfHeader(doc, {
    title: opts.title,
    subtitle: opts.subtitle,
    workspaceName: opts.ws.companyName,
    tenantLogoBuffer: opts.ws.logoBuffer,
    refLabel: opts.refLabel,
    generatedLabel: `Generated ${format(new Date(), 'MMM d, yyyy h:mm a')}`,
  });
  return doc;
}

function endDoc(doc: PDFDocumentType, ws: WorkspaceMeta, docType: string, docId: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    renderPdfFooter(doc, {
      docId: docId.slice(0, 8).toUpperCase(),
      docType,
      workspaceName: ws.companyName,
    });
    doc.end();
  });
}

function renderTotalsBox(
  doc: PDFDocumentType,
  rows: Array<[label: string, value: string, emphasize?: boolean]>,
): void {
  if (doc.y > 660) doc.addPage();
  doc.moveDown(0.6);
  const boxX = PAGE.W - PAGE.MR - 240;
  const boxY = doc.y;
  const rowH = 18;
  const boxH = rows.length * rowH + 8;
  doc.rect(boxX, boxY, 240, boxH).fillAndStroke(PDF.offWhite, PDF.grayBorder);
  rows.forEach(([label, value, emphasize], i) => {
    const yy = boxY + 6 + i * rowH;
    doc.fontSize(emphasize ? 10 : 9)
      .font(emphasize ? 'Helvetica-Bold' : 'Helvetica')
      .fillColor(emphasize ? PDF.dark : PDF.gray)
      .text(label, boxX + 10, yy, { width: 130 });
    doc.fontSize(emphasize ? 10.5 : 9)
      .font(emphasize ? 'Helvetica-Bold' : 'Helvetica')
      .fillColor(emphasize ? PDF.navy : PDF.dark)
      .text(value, boxX + 140, yy, { width: 90, align: 'right' });
  });
  doc.y = boxY + boxH + 6;
}

function renderTable(
  doc: PDFDocumentType,
  headers: string[],
  rows: string[][],
  colWidths: number[],
  alignments: Array<'left' | 'right' | 'center'> = [],
): void {
  if (doc.y > 660) doc.addPage();
  let x = PAGE.ML;
  const headerY = doc.y;
  doc.rect(PAGE.ML, headerY, PAGE.CW, 18).fill(PDF.navyMid);
  headers.forEach((h, i) => {
    doc.fontSize(8).fillColor(PDF.white).font('Helvetica-Bold')
      .text(h.toUpperCase(), x + 6, headerY + 5, {
        width: colWidths[i] - 8,
        align: alignments[i] || 'left',
        characterSpacing: 0.3,
      });
    x += colWidths[i];
  });
  doc.y = headerY + 20;

  rows.forEach((row, idx) => {
    if (doc.y > 730) {
      doc.addPage();
      // Repeat header
      const ny = doc.y;
      doc.rect(PAGE.ML, ny, PAGE.CW, 18).fill(PDF.navyMid);
      let xx = PAGE.ML;
      headers.forEach((h, i) => {
        doc.fontSize(8).fillColor(PDF.white).font('Helvetica-Bold')
          .text(h.toUpperCase(), xx + 6, ny + 5, {
            width: colWidths[i] - 8,
            align: alignments[i] || 'left',
            characterSpacing: 0.3,
          });
        xx += colWidths[i];
      });
      doc.y = ny + 20;
    }
    const rowY = doc.y;
    if (idx % 2 === 1) {
      doc.rect(PAGE.ML, rowY, PAGE.CW, 16).fill(PDF.offWhite);
    }
    let cx = PAGE.ML;
    row.forEach((cell, i) => {
      doc.fontSize(9).fillColor(PDF.dark).font('Helvetica')
        .text(cell, cx + 6, rowY + 4, {
          width: colWidths[i] - 8,
          align: alignments[i] || 'left',
          ellipsis: true,
        });
      cx += colWidths[i];
    });
    doc.y = rowY + 16;
  });
  doc.moveDown(0.5);
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. ACCOUNT STATEMENT (per client)
// ═════════════════════════════════════════════════════════════════════════════

export async function generateAccountStatementPdf(opts: {
  workspaceId: string;
  clientId: string;
  startDate: Date;
  endDate: Date;
}): Promise<Buffer> {
  const { workspaceId, clientId, startDate, endDate } = opts;
  const ws = await loadWorkspaceMeta(workspaceId);

  const [client] = await db.select().from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId))).limit(1);

  if (!client) throw new Error('Client not found');

  // Opening balance: outstanding before startDate
  const priorInvoices = await db.select().from(invoices)
    .where(and(
      eq(invoices.workspaceId, workspaceId),
      eq(invoices.clientId, clientId),
      lte(invoices.issueDate, startDate),
    ));
  const openingBalance = priorInvoices.reduce((acc, inv) => {
    const total = num(inv.total);
    const paid = num(inv.amountPaid);
    if (inv.status === 'void' || inv.status === 'cancelled') return acc;
    return acc + (total - paid);
  }, 0);

  const periodInvoices = await db.select().from(invoices)
    .where(and(
      eq(invoices.workspaceId, workspaceId),
      eq(invoices.clientId, clientId),
      gte(invoices.issueDate, startDate),
      lte(invoices.issueDate, endDate),
    )).orderBy(invoices.issueDate);

  let runningBalance = openingBalance;
  const periodCharges = periodInvoices.reduce((s, i) => s + num(i.total), 0);
  const periodPayments = periodInvoices.reduce((s, i) => s + num(i.amountPaid), 0);
  const closingBalance = openingBalance + periodCharges - periodPayments;

  const doc = startDoc({
    title: 'ACCOUNT STATEMENT',
    subtitle: `${format(startDate, 'MMM d, yyyy')} — ${format(endDate, 'MMM d, yyyy')}`,
    refLabel: `Client: ${client.clientNumber || client.id.slice(0, 8).toUpperCase()}`,
    ws,
  });

  // Bill-to block
  doc.fontSize(8).fillColor(PDF.gray).font('Helvetica').text('STATEMENT FOR', PAGE.ML, doc.y);
  doc.moveDown(0.3);
  doc.fontSize(11).fillColor(PDF.dark).font('Helvetica-Bold')
    .text(client.companyName || `${client.firstName} ${client.lastName}`);
  if (client.address) doc.fontSize(9).font('Helvetica').fillColor(PDF.grayDark).text(client.address);
  if (client.email) doc.text(client.email);

  sectionBar(doc, 'Activity');
  const rows: string[][] = [];
  rows.push([
    format(startDate, 'MM/dd/yy'),
    'Opening balance',
    '',
    '',
    fmt$(openingBalance),
  ]);
  for (const inv of periodInvoices) {
    const charge = num(inv.total);
    const paid = num(inv.amountPaid);
    if (charge > 0) {
      runningBalance += charge;
      rows.push([
        inv.issueDate ? format(new Date(inv.issueDate), 'MM/dd/yy') : '',
        `Invoice ${inv.invoiceNumber}`,
        fmt$(charge),
        '',
        fmt$(runningBalance),
      ]);
    }
    if (paid > 0) {
      runningBalance -= paid;
      rows.push([
        inv.paidAt ? format(new Date(inv.paidAt), 'MM/dd/yy') : '',
        `Payment — ${inv.invoiceNumber}`,
        '',
        fmt$(paid),
        fmt$(runningBalance),
      ]);
    }
  }
  renderTable(
    doc,
    ['Date', 'Description', 'Charges', 'Payments', 'Balance'],
    rows,
    [70, 220, 80, 80, 62],
    ['left', 'left', 'right', 'right', 'right'],
  );

  renderTotalsBox(doc, [
    ['Opening balance', fmt$(openingBalance)],
    ['Charges this period', fmt$(periodCharges)],
    ['Payments this period', fmt$(periodPayments)],
    ['Closing balance', fmt$(closingBalance), true],
  ]);

  doc.moveDown(1);
  hlinePdf(doc, PDF.grayLight);
  doc.fontSize(8).fillColor(PDF.gray).font('Helvetica')
    .text(
      'Please remit closing balance by the due date shown on outstanding invoices. ' +
      'Questions? Contact your account manager.',
      { width: PAGE.CW, align: 'left' },
    );

  return endDoc(doc, ws, 'Statement', `${clientId}-${endDate.getTime()}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. BALANCE SHEET (point-in-time)
// ═════════════════════════════════════════════════════════════════════════════

export async function generateBalanceSheetPdf(opts: {
  workspaceId: string;
  asOf: Date;
}): Promise<Buffer> {
  const { workspaceId, asOf } = opts;
  const ws = await loadWorkspaceMeta(workspaceId);

  // Assets — accounts receivable (outstanding invoices)
  const arRows = await db.select().from(invoices)
    .where(and(
      eq(invoices.workspaceId, workspaceId),
      lte(invoices.issueDate, asOf),
    ));
  const accountsReceivable = arRows.reduce((acc, inv) => {
    if (inv.status === 'paid' || inv.status === 'void') return acc;
    return acc + (num(inv.total) - num(inv.amountPaid));
  }, 0);

  // Cash collected as proxy (period-to-date paid amounts) — best-effort
  const cashRows = await db.select({
    total: sql<string>`COALESCE(SUM(${invoicePayments.amount}::numeric), 0)`,
  }).from(invoicePayments).where(and(
    eq(invoicePayments.workspaceId, workspaceId),
    eq(invoicePayments.status, 'succeeded'),
    lte(invoicePayments.paidAt, asOf),
  ));
  const expensePaidRows = await db.select({
    total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)`,
  }).from(expenses).where(and(
    eq(expenses.workspaceId, workspaceId),
    lte(expenses.expenseDate, asOf),
  ));
  const payrollPaidRows = await db.select({
    total: sql<string>`COALESCE(SUM(${payrollRuns.totalNetPay}::numeric), 0)`,
  }).from(payrollRuns).where(and(
    eq(payrollRuns.workspaceId, workspaceId),
    lte(payrollRuns.processedAt, asOf),
  ));
  const cashIn = num(cashRows[0]?.total);
  const expenseOut = num(expensePaidRows[0]?.total);
  const payrollOut = num(payrollPaidRows[0]?.total);
  const cashEstimate = cashIn - expenseOut - payrollOut;

  // Liabilities — accounts payable proxy: unpaid expenses still in 'submitted'/'approved'
  const apRows = await db.select().from(expenses)
    .where(and(
      eq(expenses.workspaceId, workspaceId),
      lte(expenses.expenseDate, asOf),
    ));
  const accountsPayable = apRows.reduce((acc, e) => {
    if (e.status === 'paid' || e.status === 'rejected') return acc;
    return acc + num(e.amount);
  }, 0);

  const totalAssets = cashEstimate + accountsReceivable;
  const totalLiabilities = accountsPayable;
  const equity = totalAssets - totalLiabilities;

  const doc = startDoc({
    title: 'BALANCE SHEET',
    subtitle: `As of ${format(asOf, 'MMMM d, yyyy')}`,
    ws,
  });

  sectionBar(doc, 'Assets');
  renderTable(
    doc,
    ['', 'Amount'],
    [
      ['Cash (estimated)', fmt$(cashEstimate)],
      ['Accounts Receivable', fmt$(accountsReceivable)],
      ['Total Assets', fmt$(totalAssets)],
    ],
    [380, 132],
    ['left', 'right'],
  );

  sectionBar(doc, 'Liabilities');
  renderTable(
    doc,
    ['', 'Amount'],
    [
      ['Accounts Payable (unpaid expenses)', fmt$(accountsPayable)],
      ['Total Liabilities', fmt$(totalLiabilities)],
    ],
    [380, 132],
    ['left', 'right'],
  );

  sectionBar(doc, 'Equity');
  renderTotalsBox(doc, [
    ['Total Assets', fmt$(totalAssets)],
    ['Total Liabilities', fmt$(totalLiabilities)],
    ['Equity (book)', fmt$(equity), true],
  ]);

  doc.moveDown(0.6);
  doc.fontSize(7.5).fillColor(PDF.gray).font('Helvetica-Oblique')
    .text(
      'AI-generated from transactional records. Cash position is estimated from ' +
      'collected payments minus paid expenses and payroll. Verify against bank statements ' +
      'before relying on this report for tax, lending, or investor purposes.',
      { width: PAGE.CW },
    );

  return endDoc(doc, ws, 'Balance Sheet', `bs-${workspaceId}-${asOf.getTime()}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. CASH FLOW STATEMENT (period)
// ═════════════════════════════════════════════════════════════════════════════

export async function generateCashFlowPdf(opts: {
  workspaceId: string;
  startDate: Date;
  endDate: Date;
}): Promise<Buffer> {
  const { workspaceId, startDate, endDate } = opts;
  const ws = await loadWorkspaceMeta(workspaceId);

  const moneyIn = await db.select({
    month: sql<string>`TO_CHAR(${invoicePayments.paidAt}, 'YYYY-MM')`,
    amount: sql<string>`COALESCE(SUM(${invoicePayments.amount}::numeric), 0)`,
  }).from(invoicePayments).where(and(
    eq(invoicePayments.workspaceId, workspaceId),
    eq(invoicePayments.status, 'succeeded'),
    gte(invoicePayments.paidAt, startDate),
    lte(invoicePayments.paidAt, endDate),
  )).groupBy(sql`TO_CHAR(${invoicePayments.paidAt}, 'YYYY-MM')`);

  const payrollOut = await db.select({
    month: sql<string>`TO_CHAR(${payrollRuns.processedAt}, 'YYYY-MM')`,
    amount: sql<string>`COALESCE(SUM(${payrollRuns.totalNetPay}::numeric), 0)`,
  }).from(payrollRuns).where(and(
    eq(payrollRuns.workspaceId, workspaceId),
    gte(payrollRuns.processedAt, startDate),
    lte(payrollRuns.processedAt, endDate),
  )).groupBy(sql`TO_CHAR(${payrollRuns.processedAt}, 'YYYY-MM')`);

  const expenseOut = await db.select({
    month: sql<string>`TO_CHAR(${expenses.expenseDate}, 'YYYY-MM')`,
    amount: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)`,
  }).from(expenses).where(and(
    eq(expenses.workspaceId, workspaceId),
    gte(expenses.expenseDate, startDate),
    lte(expenses.expenseDate, endDate),
  )).groupBy(sql`TO_CHAR(${expenses.expenseDate}, 'YYYY-MM')`);

  const months = new Set<string>();
  moneyIn.forEach(r => r.month && months.add(r.month));
  payrollOut.forEach(r => r.month && months.add(r.month));
  expenseOut.forEach(r => r.month && months.add(r.month));
  const sortedMonths = Array.from(months).sort();

  const inMap = Object.fromEntries(moneyIn.map(r => [r.month, num(r.amount)]));
  const payMap = Object.fromEntries(payrollOut.map(r => [r.month, num(r.amount)]));
  const expMap = Object.fromEntries(expenseOut.map(r => [r.month, num(r.amount)]));

  let totalIn = 0, totalPay = 0, totalExp = 0;
  const tableRows = sortedMonths.map(m => {
    const i = inMap[m] || 0, p = payMap[m] || 0, e = expMap[m] || 0;
    totalIn += i; totalPay += p; totalExp += e;
    return [m, fmt$(i), fmt$(p), fmt$(e), fmt$(i - p - e)];
  });

  const doc = startDoc({
    title: 'CASH FLOW STATEMENT',
    subtitle: `${format(startDate, 'MMM d, yyyy')} — ${format(endDate, 'MMM d, yyyy')}`,
    ws,
  });

  sectionBar(doc, 'Monthly Cash Movement');
  renderTable(
    doc,
    ['Month', 'Cash In', 'Payroll Out', 'Expenses Out', 'Net'],
    tableRows.length > 0 ? tableRows : [['—', '$0.00', '$0.00', '$0.00', '$0.00']],
    [90, 110, 110, 110, 92],
    ['left', 'right', 'right', 'right', 'right'],
  );

  renderTotalsBox(doc, [
    ['Total cash in', fmt$(totalIn)],
    ['Total payroll out', fmt$(totalPay)],
    ['Total expenses out', fmt$(totalExp)],
    ['Net cash flow', fmt$(totalIn - totalPay - totalExp), true],
  ]);

  return endDoc(doc, ws, 'Cash Flow', `cf-${workspaceId}-${endDate.getTime()}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. P&L STATEMENT (period)
// ═════════════════════════════════════════════════════════════════════════════

export async function generateProfitLossPdf(opts: {
  workspaceId: string;
  startDate: Date;
  endDate: Date;
}): Promise<Buffer> {
  const { workspaceId, startDate, endDate } = opts;
  const ws = await loadWorkspaceMeta(workspaceId);

  const revenueRows = await db.select({
    total: sql<string>`COALESCE(SUM(${invoices.total}::numeric), 0)`,
  }).from(invoices).where(and(
    eq(invoices.workspaceId, workspaceId),
    gte(invoices.issueDate, startDate),
    lte(invoices.issueDate, endDate),
    sql`${invoices.status} NOT IN ('void', 'cancelled', 'draft')`,
  ));
  const grossRevenue = num(revenueRows[0]?.total);

  const payrollRows = await db.select({
    total: sql<string>`COALESCE(SUM(${payrollRuns.totalNetPay}::numeric), 0)`,
  }).from(payrollRuns).where(and(
    eq(payrollRuns.workspaceId, workspaceId),
    gte(payrollRuns.periodStart, startDate),
    lte(payrollRuns.periodEnd, endDate),
  ));
  const totalPayroll = num(payrollRows[0]?.total);

  const expenseRows = await db.select({
    total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)`,
  }).from(expenses).where(and(
    eq(expenses.workspaceId, workspaceId),
    gte(expenses.expenseDate, startDate),
    lte(expenses.expenseDate, endDate),
  ));
  const totalExpenses = num(expenseRows[0]?.total);

  const grossProfit = grossRevenue - totalPayroll;
  const netIncome = grossProfit - totalExpenses;
  const grossMarginPct = grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0;
  const netMarginPct = grossRevenue > 0 ? (netIncome / grossRevenue) * 100 : 0;

  const doc = startDoc({
    title: 'PROFIT & LOSS',
    subtitle: `${format(startDate, 'MMM d, yyyy')} — ${format(endDate, 'MMM d, yyyy')}`,
    ws,
  });

  sectionBar(doc, 'Income');
  renderTable(
    doc,
    ['Account', 'Amount'],
    [['Gross Revenue (invoices)', fmt$(grossRevenue)]],
    [380, 132],
    ['left', 'right'],
  );

  sectionBar(doc, 'Cost of Services');
  renderTable(
    doc,
    ['Account', 'Amount'],
    [
      ['Direct Labor (payroll)', fmt$(totalPayroll)],
      ['Gross Profit', fmt$(grossProfit)],
      [`Gross Margin`, `${grossMarginPct.toFixed(1)}%`],
    ],
    [380, 132],
    ['left', 'right'],
  );

  sectionBar(doc, 'Operating Expenses');
  renderTable(
    doc,
    ['Account', 'Amount'],
    [['Total Operating Expenses', fmt$(totalExpenses)]],
    [380, 132],
    ['left', 'right'],
  );

  renderTotalsBox(doc, [
    ['Revenue', fmt$(grossRevenue)],
    ['– Direct labor', fmt$(totalPayroll)],
    ['– Operating expenses', fmt$(totalExpenses)],
    ['Net Income', fmt$(netIncome), true],
    ['Net Margin', `${netMarginPct.toFixed(1)}%`, true],
  ]);

  return endDoc(doc, ws, 'P&L', `pl-${workspaceId}-${endDate.getTime()}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. AR AGING REPORT
// ═════════════════════════════════════════════════════════════════════════════

export async function generateArAgingPdf(opts: {
  workspaceId: string;
  asOf?: Date;
}): Promise<Buffer> {
  const { workspaceId, asOf = new Date() } = opts;
  const ws = await loadWorkspaceMeta(workspaceId);

  const open = await db.select().from(invoices).where(and(
    eq(invoices.workspaceId, workspaceId),
    sql`${invoices.status} NOT IN ('paid', 'void', 'cancelled')`,
  ));

  // Pre-load client map
  const clientList = await db.select().from(clients).where(eq(clients.workspaceId, workspaceId));
  const clientMap = new Map(clientList.map(c => [c.id, c]));

  type Bucket = '0-30' | '31-60' | '61-90' | '90+' | 'current';
  const buckets: Record<Bucket, { rows: string[][]; total: number }> = {
    current: { rows: [], total: 0 },
    '0-30': { rows: [], total: 0 },
    '31-60': { rows: [], total: 0 },
    '61-90': { rows: [], total: 0 },
    '90+': { rows: [], total: 0 },
  };

  for (const inv of open) {
    const due = inv.dueDate ? new Date(inv.dueDate) : (inv.issueDate ? new Date(inv.issueDate) : asOf);
    const daysLate = Math.floor((asOf.getTime() - due.getTime()) / 86_400_000);
    const outstanding = num(inv.total) - num(inv.amountPaid);
    if (outstanding <= 0) continue;
    const c = clientMap.get(inv.clientId);
    const clientName = c?.companyName || (c ? `${c.firstName} ${c.lastName}` : '—');
    const row = [
      inv.invoiceNumber,
      clientName,
      inv.dueDate ? format(due, 'MMM d, yyyy') : '—',
      String(Math.max(0, daysLate)),
      fmt$(outstanding),
    ];
    let key: Bucket;
    if (daysLate <= 0) key = 'current';
    else if (daysLate <= 30) key = '0-30';
    else if (daysLate <= 60) key = '31-60';
    else if (daysLate <= 90) key = '61-90';
    else key = '90+';
    buckets[key].rows.push(row);
    buckets[key].total += outstanding;
  }

  const doc = startDoc({
    title: 'AR AGING REPORT',
    subtitle: `As of ${format(asOf, 'MMMM d, yyyy')}`,
    ws,
  });

  const labels: Record<Bucket, string> = {
    current: 'Current (not yet due)',
    '0-30': '1–30 days overdue',
    '31-60': '31–60 days overdue',
    '61-90': '61–90 days overdue',
    '90+': '90+ days overdue',
  };

  let grandTotal = 0;
  (['current', '0-30', '31-60', '61-90', '90+'] as Bucket[]).forEach((k) => {
    if (buckets[k].rows.length === 0) return;
    sectionBar(doc, `${labels[k]} — ${fmt$(buckets[k].total)}`);
    renderTable(
      doc,
      ['Invoice', 'Client', 'Due', 'Days', 'Outstanding'],
      buckets[k].rows,
      [85, 195, 90, 50, 92],
      ['left', 'left', 'left', 'right', 'right'],
    );
    grandTotal += buckets[k].total;
  });

  if (grandTotal === 0) {
    doc.fontSize(11).fillColor(PDF.gray).font('Helvetica-Oblique')
      .text('No outstanding receivables. Every invoice is paid.', { align: 'center' });
  } else {
    renderTotalsBox(doc, [
      ['Current', fmt$(buckets.current.total)],
      ['1–30', fmt$(buckets['0-30'].total)],
      ['31–60', fmt$(buckets['31-60'].total)],
      ['61–90', fmt$(buckets['61-90'].total)],
      ['90+', fmt$(buckets['90+'].total)],
      ['Total Outstanding', fmt$(grandTotal), true],
    ]);
  }

  return endDoc(doc, ws, 'AR Aging', `ar-${workspaceId}-${asOf.getTime()}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. AP AGING REPORT (unpaid expenses as proxy)
// ═════════════════════════════════════════════════════════════════════════════

export async function generateApAgingPdf(opts: {
  workspaceId: string;
  asOf?: Date;
}): Promise<Buffer> {
  const { workspaceId, asOf = new Date() } = opts;
  const ws = await loadWorkspaceMeta(workspaceId);

  const open = await db.select().from(expenses).where(and(
    eq(expenses.workspaceId, workspaceId),
    sql`${expenses.status} NOT IN ('paid', 'rejected')`,
  )).orderBy(expenses.expenseDate);

  type Bucket = '0-30' | '31-60' | '61-90' | '90+';
  const buckets: Record<Bucket, { rows: string[][]; total: number }> = {
    '0-30': { rows: [], total: 0 },
    '31-60': { rows: [], total: 0 },
    '61-90': { rows: [], total: 0 },
    '90+': { rows: [], total: 0 },
  };

  for (const e of open) {
    const expDate = e.expenseDate ? new Date(e.expenseDate) : asOf;
    const days = Math.floor((asOf.getTime() - expDate.getTime()) / 86_400_000);
    const amt = num(e.amount);
    const row = [
      e.merchant || e.description.slice(0, 40),
      format(expDate, 'MMM d, yyyy'),
      e.status || '—',
      String(Math.max(0, days)),
      fmt$(amt),
    ];
    let key: Bucket;
    if (days <= 30) key = '0-30';
    else if (days <= 60) key = '31-60';
    else if (days <= 90) key = '61-90';
    else key = '90+';
    buckets[key].rows.push(row);
    buckets[key].total += amt;
  }

  const doc = startDoc({
    title: 'AP AGING REPORT',
    subtitle: `Unpaid expenses as of ${format(asOf, 'MMMM d, yyyy')}`,
    ws,
  });

  const labels: Record<Bucket, string> = {
    '0-30': '0–30 days',
    '31-60': '31–60 days',
    '61-90': '61–90 days',
    '90+': '90+ days',
  };

  let grandTotal = 0;
  (['0-30', '31-60', '61-90', '90+'] as Bucket[]).forEach((k) => {
    if (buckets[k].rows.length === 0) return;
    sectionBar(doc, `${labels[k]} — ${fmt$(buckets[k].total)}`);
    renderTable(
      doc,
      ['Vendor / Description', 'Date', 'Status', 'Days', 'Amount'],
      buckets[k].rows,
      [220, 90, 80, 50, 72],
      ['left', 'left', 'left', 'right', 'right'],
    );
    grandTotal += buckets[k].total;
  });

  if (grandTotal === 0) {
    doc.fontSize(11).fillColor(PDF.gray).font('Helvetica-Oblique')
      .text('No unpaid expenses on file.', { align: 'center' });
  } else {
    renderTotalsBox(doc, [
      ['0–30', fmt$(buckets['0-30'].total)],
      ['31–60', fmt$(buckets['31-60'].total)],
      ['61–90', fmt$(buckets['61-90'].total)],
      ['90+', fmt$(buckets['90+'].total)],
      ['Total Payable', fmt$(grandTotal), true],
    ]);
  }

  return endDoc(doc, ws, 'AP Aging', `ap-${workspaceId}-${asOf.getTime()}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. EXPENSE REPORT (period)
// ═════════════════════════════════════════════════════════════════════════════

export async function generateExpenseReportPdf(opts: {
  workspaceId: string;
  startDate: Date;
  endDate: Date;
}): Promise<Buffer> {
  const { workspaceId, startDate, endDate } = opts;
  const ws = await loadWorkspaceMeta(workspaceId);

  const rows = await db.select().from(expenses).where(and(
    eq(expenses.workspaceId, workspaceId),
    gte(expenses.expenseDate, startDate),
    lte(expenses.expenseDate, endDate),
  )).orderBy(desc(expenses.expenseDate));

  let total = 0;
  const tableRows = rows.map(e => {
    const amt = num(e.amount);
    total += amt;
    return [
      e.expenseDate ? format(new Date(e.expenseDate), 'MM/dd/yy') : '—',
      e.merchant || '—',
      (e.description || '').slice(0, 50),
      e.status || 'submitted',
      fmt$(amt),
    ];
  });

  const doc = startDoc({
    title: 'EXPENSE REPORT',
    subtitle: `${format(startDate, 'MMM d, yyyy')} — ${format(endDate, 'MMM d, yyyy')}`,
    ws,
  });

  sectionBar(doc, `${rows.length} expense(s)`);
  renderTable(
    doc,
    ['Date', 'Vendor', 'Description', 'Status', 'Amount'],
    tableRows.length > 0 ? tableRows : [['—', '—', 'No expenses', '—', '$0.00']],
    [70, 120, 200, 60, 62],
    ['left', 'left', 'left', 'left', 'right'],
  );

  renderTotalsBox(doc, [
    ['Expense count', String(rows.length)],
    ['Total spend', fmt$(total), true],
  ]);

  return endDoc(doc, ws, 'Expenses', `exp-${workspaceId}-${endDate.getTime()}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 8. PAYMENT RECEIPT (single payment)
// ═════════════════════════════════════════════════════════════════════════════

export async function generatePaymentReceiptPdf(opts: {
  workspaceId: string;
  paymentId: string;
}): Promise<Buffer> {
  const { workspaceId, paymentId } = opts;
  const ws = await loadWorkspaceMeta(workspaceId);

  const [pay] = await db.select().from(invoicePayments)
    .where(and(eq(invoicePayments.id, paymentId), eq(invoicePayments.workspaceId, workspaceId)))
    .limit(1);
  if (!pay) throw new Error('Payment not found');

  const [inv] = await db.select().from(invoices).where(eq(invoices.id, pay.invoiceId)).limit(1);
  const [client] = inv ? await db.select().from(clients).where(eq(clients.id, inv.clientId)).limit(1) : [null];

  const doc = startDoc({
    title: 'PAYMENT RECEIPT',
    subtitle: pay.paidAt ? format(new Date(pay.paidAt), 'MMMM d, yyyy') : '',
    refLabel: `Receipt: ${pay.id.slice(0, 8).toUpperCase()}`,
    ws,
  });

  // Receipt-for block
  if (client) {
    doc.fontSize(8).fillColor(PDF.gray).font('Helvetica').text('RECEIVED FROM', PAGE.ML, doc.y);
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor(PDF.dark).font('Helvetica-Bold')
      .text(client.companyName || `${client.firstName} ${client.lastName}`);
    if (client.email) doc.fontSize(9).font('Helvetica').fillColor(PDF.grayDark).text(client.email);
  }

  sectionBar(doc, 'Payment Details');
  renderTable(
    doc,
    ['Field', 'Value'],
    [
      ['Invoice #', inv?.invoiceNumber || '—'],
      ['Payment method', pay.paymentMethod || '—'],
      ['Card last 4', pay.last4 ? `•••• ${pay.last4}` : '—'],
      ['Paid at', pay.paidAt ? format(new Date(pay.paidAt), 'PPpp') : '—'],
      ['Status', pay.status || '—'],
    ],
    [200, 312],
    ['left', 'left'],
  );

  renderTotalsBox(doc, [
    ['Amount paid', fmt$(num(pay.amount)), true],
    ...(num(pay.refundedAmount) > 0
      ? ([['Refunded', fmt$(num(pay.refundedAmount))]] as Array<[string, string]>)
      : []),
  ]);

  doc.moveDown(0.8);
  doc.fontSize(9).fillColor(PDF.gray).font('Helvetica-Oblique')
    .text('Thank you for your payment. This receipt is your record of a completed transaction.', {
      align: 'center', width: PAGE.CW,
    });

  return endDoc(doc, ws, 'Receipt', `rcpt-${pay.id}`);
}
