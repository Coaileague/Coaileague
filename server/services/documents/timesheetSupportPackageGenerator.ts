import PDFDocument from 'pdfkit';
import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '../../db';
import { clients, employees, shifts, timeEntries, workspaces } from '@shared/schema';
import { saveToVault } from './businessFormsVaultService';
import { formatCurrency, multiplyFinancialValues, sumFinancialValues, toFinancialString } from '../financialCalculator';
import { createLogger } from '../../lib/logger';

const log = createLogger('TimesheetSupportPackageGenerator');

export interface GenerateTimesheetSupportPackageParams {
  workspaceId: string;
  periodStart: Date;
  periodEnd: Date;
  clientId?: string | null;
  generatedBy?: string | null;
  status?: string | null;
}

export interface TimesheetSupportPackageResult {
  success: boolean;
  pdfBuffer?: Buffer;
  vaultId?: string;
  documentNumber?: string;
  entryCount?: number;
  totalHours?: number;
  error?: string;
}

type JoinedTimesheetRow = {
  timeEntry: typeof timeEntries.$inferSelect;
  employee: typeof employees.$inferSelect | null;
  client: typeof clients.$inferSelect | null;
  shift: typeof shifts.$inferSelect | null;
};

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return 'N/A';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return 'N/A';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getEntryHours(entry: any): number {
  if (entry.totalHours != null) return numberValue(entry.totalHours);
  if (entry.totalMinutes != null) return numberValue(entry.totalMinutes) / 60;
  if (entry.clockIn && entry.clockOut) {
    return Math.max(0, (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / 36e5);
  }
  return 0;
}

function getBillableAmountValue(entry: any): string {
  if (entry.billableAmount != null) {
    return toFinancialString(entry.billableAmount);
  }

  const hours = toFinancialString(getEntryHours(entry));
  const rate = toFinancialString(entry.capturedBillRate ?? entry.hourlyRate ?? 0);
  return multiplyFinancialValues(hours, rate);
}

function getBillableAmountLabel(entry: any): string {
  return formatCurrency(getBillableAmountValue(entry));
}

function employeeName(employee: any, fallbackId: string): string {
  if (!employee) return fallbackId;
  const name = `${employee.firstName || ''} ${employee.lastName || ''}`.trim();
  return name || fallbackId;
}

function clientName(client: any, fallbackId?: string | null): string {
  if (!client) return fallbackId || 'Unassigned';
  return client.companyName || `${client.firstName || ''} ${client.lastName || ''}`.trim() || fallbackId || 'Client';
}

function buildPdf(builder: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: 'LETTER', margins: { top: 72, bottom: 72, left: 54, right: 54 } });
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    builder(doc);
    doc.end();
  });
}

function drawEntryTable(doc: PDFKit.PDFDocument, rows: JoinedTimesheetRow[]): void {
  const colX = [54, 122, 228, 330, 400, 464];
  const headers = ['Date', 'Employee', 'Client', 'Hours', 'Status', 'Billable'];

  doc.fontSize(8).font('Helvetica-Bold').fillColor('#111827');
  headers.forEach((header, index) => {
    doc.text(header, colX[index], doc.y, { width: index === 2 ? 96 : 64, continued: index < headers.length - 1 });
  });
  doc.moveDown(0.3);
  doc.moveTo(54, doc.y).lineTo(558, doc.y).strokeColor('#d1d5db').lineWidth(0.5).stroke();
  doc.moveDown(0.35);

  doc.fontSize(7).font('Helvetica').fillColor('#374151');

  rows.slice(0, 80).forEach((row) => {
    if (doc.y > 700) {
      doc.addPage();
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#111827');
      headers.forEach((header, index) => {
        doc.text(header, colX[index], doc.y, { width: index === 2 ? 96 : 64, continued: index < headers.length - 1 });
      });
      doc.moveDown(0.3);
      doc.moveTo(54, doc.y).lineTo(558, doc.y).strokeColor('#d1d5db').lineWidth(0.5).stroke();
      doc.moveDown(0.35);
      doc.fontSize(7).font('Helvetica').fillColor('#374151');
    }

    const entry = row.timeEntry as any;
    const y = doc.y;
    const hours = getEntryHours(entry).toFixed(2);
    const values = [
      formatDate(entry.clockIn),
      employeeName(row.employee, entry.employeeId),
      clientName(row.client, entry.clientId),
      hours,
      entry.status || 'unknown',
      getBillableAmountLabel(entry),
    ];

    values.forEach((value, index) => {
      doc.text(value, colX[index], y, { width: index === 2 ? 96 : 64 });
    });
    doc.moveDown(0.55);
  });

  if (rows.length > 80) {
    doc.moveDown(0.5).fontSize(8).fillColor('#6b7280')
      .text(`Showing first 80 of ${rows.length} time entries. Use CSV export for the complete detail set.`, { italic: true });
  }
}

/**
 * Generate a tenant-facing timesheet support package for payroll/invoice reconciliation.
 *
 * This artifact answers the business question: "Which approved/period time entries
 * support this payroll, invoice, or client dispute?" It is not a replacement for
 * raw CSV export; it is the branded, vault-saved reconciliation packet.
 */
export async function generateTimesheetSupportPackage(
  params: GenerateTimesheetSupportPackageParams,
): Promise<TimesheetSupportPackageResult> {
  try {
    const { workspaceId, periodStart, periodEnd, clientId, generatedBy, status } = params;
    if (!workspaceId) return { success: false, error: 'workspaceId is required' };
    if (!periodStart || !periodEnd) return { success: false, error: 'periodStart and periodEnd are required' };

    const [workspace] = await db.select().from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    const conditions = [
      eq(timeEntries.workspaceId, workspaceId),
      gte(timeEntries.clockIn, periodStart),
      lte(timeEntries.clockIn, periodEnd),
      ...(clientId ? [eq(timeEntries.clientId, clientId)] : []),
      ...(status ? [eq(timeEntries.status, status as any)] : []),
    ];

    const rows = await db.select({
      timeEntry: timeEntries,
      employee: employees,
      client: clients,
      shift: shifts,
    })
      .from(timeEntries)
      .leftJoin(employees, eq(timeEntries.employeeId, employees.id))
      .leftJoin(clients, eq(timeEntries.clientId, clients.id))
      .leftJoin(shifts, eq(timeEntries.shiftId, shifts.id))
      .where(and(...conditions))
      .orderBy(timeEntries.clockIn);

    const totalHours = rows.reduce((sum, row) => sum + getEntryHours(row.timeEntry as any), 0);
    const totalBillable = formatCurrency(sumFinancialValues(rows.map(row => getBillableAmountValue(row.timeEntry as any))));
    const workspaceName = (workspace as any)?.companyName || (workspace as any)?.name || workspaceId;
    const periodLabel = `${formatDate(periodStart)} – ${formatDate(periodEnd)}`;

    const rawBuffer = await buildPdf((doc) => {
      doc.fontSize(16).font('Helvetica-Bold').fillColor('#111827')
        .text('Timesheet Support Package', { align: 'center' });
      doc.fontSize(10).font('Helvetica').fillColor('#6b7280')
        .text(`${workspaceName} · Reconciliation Detail`, { align: 'center' });
      doc.moveDown(1.5);

      const summaryRows: [string, string][] = [
        ['Reporting Period', periodLabel],
        ['Workspace', workspaceName],
        ['Client Filter', clientId || 'All clients'],
        ['Status Filter', status || 'All statuses'],
        ['Time Entries', String(rows.length)],
        ['Total Hours', totalHours.toFixed(2)],
        ['Estimated Billable Support', totalBillable],
        ['Generated At', formatDateTime(new Date())],
      ];

      doc.fontSize(9).fillColor('#111827');
      summaryRows.forEach(([label, value]) => {
        const y = doc.y;
        doc.font('Helvetica-Bold').text(`${label}:`, 72, y, { width: 160 });
        doc.font('Helvetica').text(value, 240, y, { width: 260 });
        doc.moveDown(0.55);
      });

      doc.moveDown(1);
      doc.fontSize(10).font('Helvetica-Bold').text('Support Detail');
      doc.moveDown(0.5);
      drawEntryTable(doc, rows as JoinedTimesheetRow[]);

      doc.moveDown(1);
      doc.fontSize(7).font('Helvetica').fillColor('#9ca3af')
        .text('This support package is generated from workspace-scoped time entries for payroll, invoice, audit, and dispute reconciliation. It should be reviewed by an authorized manager before external distribution.', { lineGap: 2 });
    });

    const vaultResult = await saveToVault({
      workspaceId,
      workspaceName,
      documentTitle: 'Timesheet Support Package',
      category: 'operations',
      period: periodLabel,
      relatedEntityType: clientId ? 'client' : 'workspace',
      relatedEntityId: clientId || workspaceId,
      generatedBy: generatedBy || 'trinity',
      rawBuffer,
    });

    if (!vaultResult.success) {
      log.warn('[TimesheetSupportPackage] Vault save failed:', vaultResult.error);
    }

    return {
      success: true,
      pdfBuffer: vaultResult.stampedBuffer || rawBuffer,
      vaultId: vaultResult.vault?.id,
      documentNumber: vaultResult.vault?.documentNumber,
      entryCount: rows.length,
      totalHours: Number(totalHours.toFixed(2)),
    };
  } catch (error: any) {
    log.error('[TimesheetSupportPackage] Generation failed:', error?.message);
    return { success: false, error: error?.message || 'Failed to generate timesheet support package' };
  }
}
