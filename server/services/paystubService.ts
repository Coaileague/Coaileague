/**
 * Paystub Generation Service
 * ==========================
 * Generates professional paystubs with PDF export and mobile-friendly views.
 */

import PDFDocument from 'pdfkit';
import { db } from "../db";
import { employees, timeEntries, payrollRuns, payrollEntries, workspaces } from "@shared/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { platformEventBus } from "./platformEventBus";
import {
  calculateGrossPay,
  calculateOvertimePay,
  calculateNetPay,
  sumFinancialValues,
  subtractFinancialValues,
  multiplyFinancialValues,
  toFinancialString,
  formatCurrency,
} from "./financialCalculator";
import { createLogger } from '../lib/logger';
import { saveToVault } from './documents/businessFormsVaultService';
const log = createLogger('paystubService');


interface PaystubData {
  employeeId: string;
  workspaceId: string;
  payPeriodStart: Date;
  payPeriodEnd: Date;
  payDate: Date;
  regularHours: number;
  overtimeHours: number;
  regularRate: number;
  overtimeRate: number;
  grossPay: number;
  deductions: {
    name: string;
    amount: number;
  }[];
  netPay: number;
  ytdGross?: number;
  ytdNet?: number;
  payrollRunId?: string;
  // Phase 30: AI-generated earnings summary (generated via withGpt / meteredGptClient)
  aiSummary?: string;
}

interface PaystubResult {
  success: boolean;
  paystubId?: string;
  pdfBuffer?: Buffer;
  data?: PaystubData;
  error?: string;
}

export class PaystubService {
  /**
   * RC4 (Phase 2): Round to 4 decimal places using Decimal.js (was Math.round * 100 / 100).
   * Decimal.js eliminates floating-point precision loss during accumulation.
   */
  private roundCurrency(amount: number): number {
    return parseFloat(toFinancialString(String(amount)));
  }

  /**
   * Validate date inputs
   */
  private validateDates(startDate: Date, endDate: Date): { valid: boolean; error?: string } {
    if (isNaN(startDate.getTime())) {
      return { valid: false, error: 'Invalid start date' };
    }
    if (isNaN(endDate.getTime())) {
      return { valid: false, error: 'Invalid end date' };
    }
    if (startDate > endDate) {
      return { valid: false, error: 'Start date must be before end date' };
    }
    const maxRange = 62 * 24 * 60 * 60 * 1000; // 62 days max
    if (endDate.getTime() - startDate.getTime() > maxRange) {
      return { valid: false, error: 'Date range exceeds maximum of 62 days' };
    }
    return { valid: true };
  }

  /**
   * Calculate pay for a pay period with proper financial rounding
   */
  async calculatePayPeriod(
    employeeId: string,
    workspaceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<PaystubData | null> {
    const dateValidation = this.validateDates(startDate, endDate);
    if (!dateValidation.valid) {
      log.error(`[Paystub] Date validation failed: ${dateValidation.error}`);
      return null;
    }

    const employee = await db.query.employees.findFirst({
      where: and(
        eq(employees.id, employeeId),
        eq(employees.workspaceId, workspaceId)
      ),
    });

    if (!employee) return null;

    const entries = await db.query.timeEntries.findMany({
      where: and(
        eq(timeEntries.employeeId, employeeId),
        eq(timeEntries.workspaceId, workspaceId),
        gte(timeEntries.clockIn, startDate),
        lte(timeEntries.clockIn, endDate)
      ),
    });

    let totalMinutes = 0;
    for (const entry of entries) {
      if (entry.clockIn && entry.clockOut) {
        const start = new Date(entry.clockIn).getTime();
        const end = new Date(entry.clockOut).getTime();
        totalMinutes += (end - start) / (1000 * 60);
      }
    }

    const totalHours = this.roundCurrency(totalMinutes / 60);
    const regularHours = this.roundCurrency(Math.min(totalHours, 40));
    const overtimeHours = this.roundCurrency(Math.max(0, totalHours - 40));

    // RC4 (Phase 2): All pay arithmetic via FinancialCalculator (Decimal.js).
    const rateStr = toFinancialString(String((employee as any).hourlyRate || (employee as any).payRate || '0'));
    const regularRateStr = rateStr;
    const overtimeRateStr = multiplyFinancialValues(rateStr, '1.5');

    const regularPayStr = calculateGrossPay(toFinancialString(String(regularHours)), regularRateStr, 'hourly');
    const overtimePayStr = calculateOvertimePay(toFinancialString(String(overtimeHours)), rateStr);
    const grossPayStr = sumFinancialValues([regularPayStr, overtimePayStr]);
    const grossPay = parseFloat(grossPayStr);

    const hourlyRate = parseFloat(rateStr);
    const regularRate = hourlyRate;
    const overtimeRate = parseFloat(overtimeRateStr);

    const deductions = this.calculateDeductions(grossPay, workspaceId);
    const totalDeductionsStr = sumFinancialValues(deductions.map(d => toFinancialString(String(d.amount))));
    const totalDeductions = parseFloat(totalDeductionsStr);
    const netPay = parseFloat(subtractFinancialValues(grossPayStr, totalDeductionsStr));

    return {
      employeeId,
      workspaceId,
      payPeriodStart: startDate,
      payPeriodEnd: endDate,
      payDate: new Date(),
      regularHours,
      overtimeHours,
      regularRate,
      overtimeRate,
      grossPay,
      deductions,
      netPay,
    };
  }

  /**
   * Calculate standard deductions.
   * RC4 (Phase 2): Uses Decimal.js via FinancialCalculator — no native multiplication/rounding.
   */
  calculateDeductions(grossPay: number, workspaceId: string): { name: string; amount: number }[] {
    const deductions: { name: string; amount: number }[] = [];
    const grossStr = toFinancialString(String(grossPay));

    const federalTax = parseFloat(multiplyFinancialValues(grossStr, '0.12'));
    if (federalTax > 0) {
      deductions.push({ name: 'Federal Income Tax', amount: federalTax });
    }

    const socialSecurity = parseFloat(multiplyFinancialValues(grossStr, '0.062'));
    if (socialSecurity > 0) {
      deductions.push({ name: 'Social Security (6.2%)', amount: socialSecurity });
    }

    const medicare = parseFloat(multiplyFinancialValues(grossStr, '0.0145'));
    if (medicare > 0) {
      deductions.push({ name: 'Medicare (1.45%)', amount: medicare });
    }

    const stateTax = parseFloat(multiplyFinancialValues(grossStr, '0.05'));
    if (stateTax > 0) {
      deductions.push({ name: 'State Income Tax', amount: stateTax });
    }

    return deductions;
  }

  /**
   * Generate PDF paystub
   */
  async generatePDF(data: PaystubData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).text('EARNINGS STATEMENT', { align: 'center' });
      doc.moveDown();

      doc.fontSize(12);
      doc.text(`Pay Period: ${data.payPeriodStart.toLocaleDateString()} - ${data.payPeriodEnd.toLocaleDateString()}`);
      doc.text(`Pay Date: ${data.payDate.toLocaleDateString()}`);
      doc.moveDown();

      doc.fontSize(14).text('EARNINGS', { underline: true });
      doc.fontSize(10);
      const earningsY = doc.y + 10;
      
      doc.text('Description', 50, earningsY);
      doc.text('Hours', 200, earningsY);
      doc.text('Rate', 280, earningsY);
      doc.text('Amount', 380, earningsY);

      doc.moveTo(50, earningsY + 15).lineTo(450, earningsY + 15).stroke();

      let y = earningsY + 25;
      doc.text('Regular Pay', 50, y);
      doc.text(data.regularHours.toFixed(2), 200, y);
      doc.text(`$${data.regularRate.toFixed(2)}`, 280, y);
      doc.text(`$${parseFloat(multiplyFinancialValues(toFinancialString(String(data.regularHours)), toFinancialString(String(data.regularRate)))).toFixed(2)}`, 380, y);

      if (data.overtimeHours > 0) {
        y += 20;
        doc.text('Overtime Pay (1.5x)', 50, y);
        doc.text(data.overtimeHours.toFixed(2), 200, y);
        doc.text(`$${data.overtimeRate.toFixed(2)}`, 280, y);
        doc.text(`$${parseFloat(multiplyFinancialValues(toFinancialString(String(data.overtimeHours)), toFinancialString(String(data.overtimeRate)))).toFixed(2)}`, 380, y);
      }

      y += 25;
      doc.fontSize(11).text('Gross Pay:', 280, y, { continued: true });
      // @ts-expect-error — TS migration: fix in refactoring sprint
      doc.text(`  $${data.grossPay.toFixed(2)}`, { bold: true });

      doc.moveDown(2);
      doc.fontSize(14).text('DEDUCTIONS', { underline: true });
      doc.fontSize(10);

      y = doc.y + 10;
      for (const deduction of data.deductions) {
        doc.text(deduction.name, 50, y);
        doc.text(`-$${deduction.amount.toFixed(2)}`, 380, y);
        y += 18;
      }

      const totalDeductions = parseFloat(data.deductions.reduce((sum, d) => addFinancialValues(sum, toFinancialString(String(d.amount))), '0'));
      y += 10;
      doc.fontSize(11).text('Total Deductions:', 280, y, { continued: true });
      doc.text(`  -$${totalDeductions.toFixed(2)}`);

      doc.moveDown(2);
      doc.moveTo(50, doc.y).lineTo(450, doc.y).stroke();
      doc.moveDown();
      // @ts-expect-error — TS migration: fix in refactoring sprint
      doc.fontSize(16).text(`NET PAY: $${data.netPay.toFixed(2)}`, { align: 'center', bold: true });

      // Phase 30: Render AI-generated earnings summary if provided
      if (data.aiSummary) {
        doc.moveDown(2);
        doc.fontSize(9).fillColor('#444');
        doc.text('Earnings Summary:', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(8).fillColor('#666');
        doc.text(data.aiSummary, { width: 400, align: 'left' });
      }

      doc.moveDown(3);
      doc.fontSize(8).fillColor('gray');
      doc.text('This is a computer-generated document. Please retain for your records.', { align: 'center' });
      doc.text(`Generated by CoAIleague on ${new Date().toLocaleString()}`, { align: 'center' });

      doc.end();
    });
  }

  /**
   * Generate and store paystub
   */
  async generatePaystub(
    employeeId: string,
    workspaceId: string,
    startDate: Date,
    endDate: Date,
    sendNotification: boolean = true
  ): Promise<PaystubResult> {
    try {
      const data = await this.calculatePayPeriod(employeeId, workspaceId, startDate, endDate);
      
      if (!data) {
        return { success: false, error: 'Employee not found' };
      }

      if (data.grossPay === 0) {
        return { success: false, error: 'No hours worked in this period' };
      }

      const pdfBuffer = await this.generatePDF(data);

      if (sendNotification) {
        const employee = await db.query.employees.findFirst({
          where: eq(employees.id, employeeId),
        });

        if (employee?.userId) {
          await platformEventBus.publish({
            type: 'paystub_generated',
            workspaceId,
            metadata: {
              employeeId,
              payPeriodStart: startDate.toISOString(),
              payPeriodEnd: endDate.toISOString(),
              netPay: data.netPay,
            },
          });
        }
      }

      // Resolve workspace name for branded header
      const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });

      // Stamp branded header/footer and save to tenant vault
      const periodLabel = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      const vaultResult = await saveToVault({
        workspaceId,
        workspaceName: (ws as any)?.name || workspaceId,
        documentTitle: 'Employee Pay Stub',
        category: 'payroll',
        period: periodLabel,
        relatedEntityType: 'employee',
        relatedEntityId: employeeId,
        generatedBy: 'trinity',
        rawBuffer: pdfBuffer,
      });
      if (!vaultResult.success) {
        log.warn('[PaystubService] Vault save failed (non-blocking):', vaultResult.error);
      }

      return {
        success: true,
        paystubId: vaultResult.vault?.documentNumber || `PS-${Date.now()}`,
        pdfBuffer: vaultResult.stampedBuffer || pdfBuffer,
        vaultId: vaultResult.vault?.id,
        documentNumber: vaultResult.vault?.documentNumber,
        data,
      };
    } catch (error) {
      log.error('[PaystubService] Generation failed:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Get mobile-friendly paystub data (JSON for app rendering)
   */
  async getMobilePaystub(
    employeeId: string,
    workspaceId: string,
    startDate: Date,
    endDate: Date
  ) {
    const data = await this.calculatePayPeriod(employeeId, workspaceId, startDate, endDate);
    
    if (!data) return null;

    return {
      ...data,
      payPeriodStart: data.payPeriodStart.toISOString(),
      payPeriodEnd: data.payPeriodEnd.toISOString(),
      payDate: data.payDate.toISOString(),
      formattedGrossPay: `$${data.grossPay.toFixed(2)}`,
      formattedNetPay: `$${data.netPay.toFixed(2)}`,
      formattedDeductions: data.deductions.map(d => ({
        ...d,
        formattedAmount: `-$${d.amount.toFixed(2)}`,
      })),
      totalHours: parseFloat(addFinancialValues(toFinancialString(String(data.regularHours)), toFinancialString(String(data.overtimeHours)))),
    };
  }

  async getYTDEarnings(
    employeeId: string,
    workspaceId: string
  ): Promise<{
    taxYear: number;
    grossPay: number;
    netPay: number;
    federalTax: number;
    stateTax: number;
    socialSecurity: number;
    medicare: number;
    totalDeductions: number;
    totalHours: number;
    regularHours: number;
    overtimeHours: number;
    payPeriodCount: number;
  } | null> {
    const now = new Date();
    const taxYear = now.getFullYear();
    const yearStart = new Date(taxYear, 0, 1);
    const yearEnd = new Date(taxYear, 11, 31, 23, 59, 59, 999);

    const result = await db
      .select({
        grossPay: sql<string>`COALESCE(SUM(CAST(${payrollEntries.grossPay} AS NUMERIC)), 0)`,
        netPay: sql<string>`COALESCE(SUM(CAST(${payrollEntries.netPay} AS NUMERIC)), 0)`,
        federalTax: sql<string>`COALESCE(SUM(CAST(${payrollEntries.federalTax} AS NUMERIC)), 0)`,
        stateTax: sql<string>`COALESCE(SUM(CAST(${payrollEntries.stateTax} AS NUMERIC)), 0)`,
        socialSecurity: sql<string>`COALESCE(SUM(CAST(${payrollEntries.socialSecurity} AS NUMERIC)), 0)`,
        medicare: sql<string>`COALESCE(SUM(CAST(${payrollEntries.medicare} AS NUMERIC)), 0)`,
        regularHours: sql<string>`COALESCE(SUM(CAST(${payrollEntries.regularHours} AS NUMERIC)), 0)`,
        overtimeHours: sql<string>`COALESCE(SUM(CAST(${payrollEntries.overtimeHours} AS NUMERIC)), 0)`,
        payPeriodCount: sql<string>`COUNT(DISTINCT ${payrollEntries.payrollRunId})`,
      })
      .from(payrollEntries)
      .innerJoin(payrollRuns, eq(payrollEntries.payrollRunId, payrollRuns.id))
      .where(
        and(
          eq(payrollEntries.employeeId, employeeId),
          eq(payrollEntries.workspaceId, workspaceId),
          gte(payrollRuns.periodEnd, yearStart),
          lte(payrollRuns.periodEnd, yearEnd),
          sql`${payrollRuns.status} IN ('approved', 'processed', 'paid', 'completed')`
        )
      );

    const row = result[0];
    if (!row) return null;

    // RC4 (Phase 2): Use sumFinancialValues (Decimal.js) for YTD accumulation.
    // DB SUM() aggregates already return precise numeric strings — parse once, accumulate via Decimal.
    const totalDeductionsStr = sumFinancialValues([
      row.federalTax || '0',
      row.stateTax || '0',
      row.socialSecurity || '0',
      row.medicare || '0',
    ]);
    const totalHoursStr = sumFinancialValues([row.regularHours || '0', row.overtimeHours || '0']);

    return {
      taxYear,
      grossPay: parseFloat(toFinancialString(row.grossPay || '0')),
      netPay: parseFloat(toFinancialString(row.netPay || '0')),
      federalTax: parseFloat(toFinancialString(row.federalTax || '0')),
      stateTax: parseFloat(toFinancialString(row.stateTax || '0')),
      socialSecurity: parseFloat(toFinancialString(row.socialSecurity || '0')),
      medicare: parseFloat(toFinancialString(row.medicare || '0')),
      totalDeductions: parseFloat(totalDeductionsStr),
      totalHours: parseFloat(totalHoursStr),
      regularHours: parseFloat(toFinancialString(row.regularHours || '0')),
      overtimeHours: parseFloat(toFinancialString(row.overtimeHours || '0')),
      payPeriodCount: parseInt(row.payPeriodCount),
    };
  }
}

export const paystubService = new PaystubService();
