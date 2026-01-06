/**
 * Paystub Generation Service
 * ==========================
 * Generates professional paystubs with PDF export and mobile-friendly views.
 */

import PDFDocument from 'pdfkit';
import { db } from "../db";
import { employees, timeEntries, payrollRuns, payrollEntries, workspaces } from "@shared/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { platformEventBus } from "./platformEventBus";

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
   * Round to 2 decimal places for financial calculations
   */
  private roundCurrency(amount: number): number {
    return Math.round(amount * 100) / 100;
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
      console.error(`[Paystub] Date validation failed: ${dateValidation.error}`);
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

    const hourlyRate = this.roundCurrency(parseFloat(String(employee.payRate || 0)));
    const regularRate = hourlyRate;
    const overtimeRate = this.roundCurrency(hourlyRate * 1.5);

    const regularPay = this.roundCurrency(regularHours * regularRate);
    const overtimePay = this.roundCurrency(overtimeHours * overtimeRate);
    const grossPay = this.roundCurrency(regularPay + overtimePay);

    const deductions = this.calculateDeductions(grossPay, workspaceId);
    const totalDeductions = this.roundCurrency(deductions.reduce((sum, d) => sum + d.amount, 0));
    const netPay = this.roundCurrency(grossPay - totalDeductions);

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
   * Calculate standard deductions
   */
  calculateDeductions(grossPay: number, workspaceId: string): { name: string; amount: number }[] {
    const deductions: { name: string; amount: number }[] = [];

    const federalTax = grossPay * 0.12;
    if (federalTax > 0) {
      deductions.push({ name: 'Federal Income Tax', amount: Math.round(federalTax * 100) / 100 });
    }

    const socialSecurity = grossPay * 0.062;
    if (socialSecurity > 0) {
      deductions.push({ name: 'Social Security (6.2%)', amount: Math.round(socialSecurity * 100) / 100 });
    }

    const medicare = grossPay * 0.0145;
    if (medicare > 0) {
      deductions.push({ name: 'Medicare (1.45%)', amount: Math.round(medicare * 100) / 100 });
    }

    const stateTax = grossPay * 0.05;
    if (stateTax > 0) {
      deductions.push({ name: 'State Income Tax', amount: Math.round(stateTax * 100) / 100 });
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
      doc.text(`$${(data.regularHours * data.regularRate).toFixed(2)}`, 380, y);

      if (data.overtimeHours > 0) {
        y += 20;
        doc.text('Overtime Pay (1.5x)', 50, y);
        doc.text(data.overtimeHours.toFixed(2), 200, y);
        doc.text(`$${data.overtimeRate.toFixed(2)}`, 280, y);
        doc.text(`$${(data.overtimeHours * data.overtimeRate).toFixed(2)}`, 380, y);
      }

      y += 25;
      doc.fontSize(11).text('Gross Pay:', 280, y, { continued: true });
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

      const totalDeductions = data.deductions.reduce((sum, d) => sum + d.amount, 0);
      y += 10;
      doc.fontSize(11).text('Total Deductions:', 280, y, { continued: true });
      doc.text(`  -$${totalDeductions.toFixed(2)}`);

      doc.moveDown(2);
      doc.moveTo(50, doc.y).lineTo(450, doc.y).stroke();
      doc.moveDown();
      doc.fontSize(16).text(`NET PAY: $${data.netPay.toFixed(2)}`, { align: 'center', bold: true });

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

      return {
        success: true,
        paystubId: `PS-${Date.now()}`,
        pdfBuffer,
        data,
      };
    } catch (error) {
      console.error('[PaystubService] Generation failed:', error);
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
      totalHours: data.regularHours + data.overtimeHours,
    };
  }
}

export const paystubService = new PaystubService();
