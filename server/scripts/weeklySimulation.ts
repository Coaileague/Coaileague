/**
 * Weekly Automation Simulation
 * 
 * Simulates a full weekly run of Trinity automations:
 * 1. Seeds realistic time entries for past week (approved, with clock-in/out)
 * 2. Runs invoice generation pipeline (billable hours → invoices)
 * 3. Runs payroll processing pipeline (payroll hours → paycheck calculations)
 * 4. Reports actual dollar amounts at each step
 * 5. Identifies gaps, errors, and missing data
 * 
 * This does NOT use idempotency/governance gates - it directly invokes the
 * core business logic to validate math and data flow.
 */

import { db } from '../db';
import { timeEntries, employees, clients, workspaces, invoices, invoiceLineItems, payrollRuns, payrollEntries, clientRates } from '@shared/schema';
import { eq, and, sql, gte, lte, isNull, inArray } from 'drizzle-orm';
import { subDays, startOfWeek, endOfWeek, addHours, format } from 'date-fns';
import { aggregateBillableHours } from '../services/automation/billableHoursAggregator';
import { aggregatePayrollHours } from '../services/automation/payrollHoursAggregator';
import { PayrollAutomationEngine } from '../services/payrollAutomation';
import { generateWeeklyInvoices } from '../services/billingAutomation';
import crypto from 'crypto';

export interface SimulationStep {
  step: number;
  name: string;
  status: 'success' | 'warning' | 'error' | 'skipped';
  durationMs: number;
  details: Record<string, any>;
  warnings: string[];
  errors: string[];
}

export interface WeeklySimulationReport {
  simulationId: string;
  workspaceId: string;
  workspaceName: string;
  startedAt: string;
  completedAt: string;
  totalDurationMs: number;
  periodStart: string;
  periodEnd: string;
  steps: SimulationStep[];
  summary: {
    timeEntriesSeeded: number;
    totalHoursSeeded: number;
    employeesWithHours: number;
    clientsBilled: number;
    invoicesGenerated: number;
    totalInvoiceAmount: number;
    weeklyBillableTotal: number;
    invoiceLineItemCount: number;
    payrollEmployeesProcessed: number;
    totalGrossPay: number;
    totalNetPay: number;
    totalFederalTax: number;
    totalStateTax: number;
    totalSocialSecurity: number;
    totalMedicare: number;
    totalDeductions: number;
    gapsIdentified: string[];
    criticalIssues: string[];
  };
  payrollDetails: Array<{
    employeeName: string;
    employeeId: string;
    regularHours: number;
    overtimeHours: number;
    holidayHours: number;
    hourlyRate: number;
    grossPay: number;
    federalTax: number;
    stateTax: number;
    socialSecurity: number;
    medicare: number;
    netPay: number;
  }>;
  invoiceDetails: Array<{
    invoiceNumber: string;
    clientName: string;
    totalAmount: number;
    lineItemCount: number;
    status: string;
  }>;
}

const WORKSPACE_ID = 'dev-acme-security-ws';

export async function runWeeklySimulation(): Promise<WeeklySimulationReport> {
  const simulationId = `sim-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const startedAt = new Date();
  const steps: SimulationStep[] = [];
  const gaps: string[] = [];
  const criticalIssues: string[] = [];

  console.log('==========================================================');
  console.log('  WEEKLY AUTOMATION SIMULATION - STARTING');
  console.log(`  Simulation ID: ${simulationId}`);
  console.log(`  Timestamp: ${startedAt.toISOString()}`);
  console.log('==========================================================\n');

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, WORKSPACE_ID),
  });

  if (!workspace) {
    throw new Error(`Workspace ${WORKSPACE_ID} not found`);
  }

  const periodEnd = new Date();
  periodEnd.setHours(23, 59, 59, 999);
  const periodStart = subDays(periodEnd, 7);
  periodStart.setHours(0, 0, 0, 0);

  console.log(`Workspace: ${workspace.name}`);
  console.log(`Period: ${format(periodStart, 'MMM dd, yyyy')} - ${format(periodEnd, 'MMM dd, yyyy')}\n`);

  // ================================================================
  // STEP 1: Validate Workspace Configuration
  // ================================================================
  const step1Start = Date.now();
  const step1Warnings: string[] = [];
  const step1Errors: string[] = [];

  console.log('STEP 1: Validating Workspace Configuration...');

  if (!workspace.defaultHourlyRate) {
    step1Warnings.push('No default hourly rate set - employees without rates will have $0 pay');
    gaps.push('Missing workspace default hourly rate');
  }
  if (!workspace.defaultBillableRate) {
    step1Warnings.push('No default billable rate set - time entries without client rates will use $0');
    gaps.push('Missing workspace default billable rate');
  }
  if (!workspace.autoInvoicingEnabled) {
    step1Warnings.push('Auto-invoicing is not enabled on this workspace');
  }
  if (!workspace.autoPayrollEnabled) {
    step1Warnings.push('Auto-payroll is not enabled on this workspace');
  }

  const activeEmployees = await db.select()
    .from(employees)
    .where(and(
      eq(employees.workspaceId, WORKSPACE_ID),
      eq(employees.isActive, true),
    ));

  const employeesWithRates = activeEmployees.filter(e => e.hourlyRate && parseFloat(e.hourlyRate) > 0);
  const employeesWithoutRates = activeEmployees.filter(e => !e.hourlyRate || parseFloat(e.hourlyRate) <= 0);

  if (employeesWithoutRates.length > 0) {
    step1Warnings.push(`${employeesWithoutRates.length} employees have no hourly rate set`);
    gaps.push(`${employeesWithoutRates.length} employees missing hourly rates`);
  }

  const workspaceClients = await db.select()
    .from(clients)
    .where(eq(clients.workspaceId, WORKSPACE_ID));

  const workspaceRates = await db.select()
    .from(clientRates)
    .where(and(
      eq(clientRates.workspaceId, WORKSPACE_ID),
      eq(clientRates.isActive, true),
    ));

  const clientsWithRates = new Set(workspaceRates.map(r => r.clientId));
  const clientsWithoutRates = workspaceClients.filter(c => !clientsWithRates.has(c.id));

  if (clientsWithoutRates.length > 0) {
    step1Warnings.push(`${clientsWithoutRates.length} clients have no billing rate configured`);
  }

  console.log(`  Active employees: ${activeEmployees.length} (${employeesWithRates.length} with rates)`);
  console.log(`  Clients: ${workspaceClients.length} (${clientsWithRates.size} with rates)`);
  step1Warnings.forEach(w => console.log(`  WARNING: ${w}`));

  steps.push({
    step: 1,
    name: 'Validate Workspace Configuration',
    status: step1Errors.length > 0 ? 'error' : step1Warnings.length > 0 ? 'warning' : 'success',
    durationMs: Date.now() - step1Start,
    details: {
      workspaceName: workspace.name,
      activeEmployees: activeEmployees.length,
      employeesWithRates: employeesWithRates.length,
      totalClients: workspaceClients.length,
      clientsWithRates: clientsWithRates.size,
      defaultHourlyRate: workspace.defaultHourlyRate,
      defaultBillableRate: workspace.defaultBillableRate,
      invoiceSchedule: workspace.invoiceSchedule,
      payrollSchedule: workspace.payrollSchedule,
    },
    warnings: step1Warnings,
    errors: step1Errors,
  });

  // ================================================================
  // STEP 2: Seed Simulated Time Entries
  // ================================================================
  const step2Start = Date.now();
  const step2Warnings: string[] = [];
  const step2Errors: string[] = [];
  let seededEntries = 0;
  let totalHoursSeeded = 0;

  console.log('\nSTEP 2: Seeding Simulated Time Entries...');

  const selectedEmployees = employeesWithRates.slice(0, 10);
  const selectedClients = workspaceClients.filter(c => c.id.startsWith('dev-client-')).slice(0, 5);

  if (selectedEmployees.length === 0) {
    step2Errors.push('No employees with hourly rates found - cannot seed time entries');
    criticalIssues.push('No employees have hourly rates configured');
  }

  if (selectedClients.length === 0) {
    step2Errors.push('No clients found to assign shifts');
    criticalIssues.push('No clients available for billing');
  }

  const seededEntryIds: string[] = [];

  if (selectedEmployees.length > 0 && selectedClients.length > 0) {
    const shiftPatterns = [
      { startHour: 6, endHour: 14, label: 'Day Shift (6AM-2PM)', hours: 8 },
      { startHour: 14, endHour: 22, label: 'Swing Shift (2PM-10PM)', hours: 8 },
      { startHour: 22, endHour: 6, label: 'Night Shift (10PM-6AM)', hours: 8 },
      { startHour: 8, endHour: 16, label: 'Standard (8AM-4PM)', hours: 8 },
      { startHour: 7, endHour: 19, label: 'Extended (7AM-7PM)', hours: 12 },
    ];

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const day = subDays(periodEnd, 7 - dayOffset);

      for (let empIdx = 0; empIdx < selectedEmployees.length; empIdx++) {
        const employee = selectedEmployees[empIdx];
        const client = selectedClients[empIdx % selectedClients.length];
        const pattern = shiftPatterns[empIdx % shiftPatterns.length];

        if (dayOffset >= 5 && empIdx > 6) continue;

        const clockIn = new Date(day);
        clockIn.setHours(pattern.startHour, 0, 0, 0);
        const clockOut = new Date(day);
        if (pattern.endHour <= pattern.startHour) {
          clockOut.setDate(clockOut.getDate() + 1);
        }
        clockOut.setHours(pattern.endHour, 0, 0, 0);

        const hours = pattern.hours;

        try {
          const entryId = `sim-${simulationId}-${dayOffset}-${empIdx}`;
          await db.insert(timeEntries).values({
            id: entryId,
            workspaceId: WORKSPACE_ID,
            employeeId: employee.id,
            clientId: client.id,
            clockIn: clockIn,
            clockOut: clockOut,
            totalHours: hours.toFixed(2),
            status: 'approved',
            billableToClient: true,
            approvedAt: new Date(),
            approvedBy: 'sim-approver',
          });
          seededEntryIds.push(entryId);
          seededEntries++;
          totalHoursSeeded += hours;
        } catch (err: any) {
          step2Warnings.push(`Failed to seed entry for ${employee.firstName} ${employee.lastName}: ${err.message}`);
        }
      }
    }
  }

  const employeesSeeded = new Set(selectedEmployees.map(e => e.id)).size;
  const clientsSeeded = new Set(selectedClients.map(c => c.id)).size;

  console.log(`  Seeded ${seededEntries} time entries (${totalHoursSeeded} total hours)`);
  console.log(`  Employees: ${employeesSeeded}, Clients: ${clientsSeeded}`);
  step2Warnings.forEach(w => console.log(`  WARNING: ${w}`));

  steps.push({
    step: 2,
    name: 'Seed Simulated Time Entries',
    status: step2Errors.length > 0 ? 'error' : step2Warnings.length > 0 ? 'warning' : 'success',
    durationMs: Date.now() - step2Start,
    details: {
      entriesSeeded: seededEntries,
      totalHoursSeeded,
      employeesSeeded,
      clientsSeeded,
      daysSimulated: 7,
      shiftPatternsUsed: 5,
    },
    warnings: step2Warnings,
    errors: step2Errors,
  });

  // ================================================================
  // STEP 3: Run Billable Hours Aggregation
  // ================================================================
  const step3Start = Date.now();
  const step3Warnings: string[] = [];
  const step3Errors: string[] = [];

  console.log('\nSTEP 3: Running Billable Hours Aggregation...');

  let billableResult: any = null;
  try {
    billableResult = await aggregateBillableHours({
      workspaceId: WORKSPACE_ID,
      startDate: periodStart,
      endDate: periodEnd,
    });

    console.log(`  Entries processed: ${billableResult.entriesProcessed}`);
    console.log(`  Client summaries: ${billableResult.clientSummaries.length}`);
    console.log(`  Total billable amount: $${billableResult.totalBillableAmount.toFixed(2)}`);

    if (billableResult.warnings.length > 0) {
      step3Warnings.push(...billableResult.warnings);
      billableResult.warnings.forEach((w: string) => console.log(`  WARNING: ${w}`));
    }

    if (billableResult.entriesProcessed === 0) {
      step3Warnings.push('No entries processed - check that entries have approved status and billable_to_client = true');
      gaps.push('Billable hours aggregation returned 0 entries');
    }

    if (billableResult.totalBillableAmount === 0 && billableResult.entriesProcessed > 0) {
      criticalIssues.push('Entries exist but total billable amount is $0 - missing billing rates');
    }
  } catch (err: any) {
    step3Errors.push(`Billable hours aggregation failed: ${err.message}`);
    criticalIssues.push(`Invoice pipeline broken: ${err.message}`);
    console.error(`  ERROR: ${err.message}`);
  }

  steps.push({
    step: 3,
    name: 'Billable Hours Aggregation',
    status: step3Errors.length > 0 ? 'error' : step3Warnings.length > 0 ? 'warning' : 'success',
    durationMs: Date.now() - step3Start,
    details: billableResult ? {
      entriesProcessed: billableResult.entriesProcessed,
      clientSummaries: billableResult.clientSummaries.length,
      totalBillableAmount: billableResult.totalBillableAmount,
      byClient: billableResult.clientSummaries.map((cs: any) => ({
        clientName: cs.clientName,
        totalHours: cs.totalHours,
        regularHours: cs.totalRegularHours,
        overtimeHours: cs.totalOvertimeHours,
        holidayHours: cs.totalHolidayHours,
        totalAmount: cs.totalAmount,
      })),
    } : { error: 'Aggregation failed' },
    warnings: step3Warnings,
    errors: step3Errors,
  });

  // ================================================================
  // STEP 4: Run Invoice Generation
  // ================================================================
  const step4Start = Date.now();
  const step4Warnings: string[] = [];
  const step4Errors: string[] = [];
  const invoiceDetailsList: WeeklySimulationReport['invoiceDetails'] = [];

  console.log('\nSTEP 4: Running Invoice Generation...');

  let generatedInvoices: any[] = [];
  try {
    const weeklyResult = await generateWeeklyInvoices(WORKSPACE_ID, periodEnd, 7);
    generatedInvoices = weeklyResult.invoices || [];

    console.log(`  Weekly invoices generated: ${weeklyResult.invoicesGenerated} (covering full 7-day period)`);
    console.log(`  Total invoiced: $${weeklyResult.totalInvoiced.toFixed(2)}`);
    console.log(`  Billable from aggregation: $${weeklyResult.totalBillableFromAggregation.toFixed(2)}`);
    console.log(`  Entries processed: ${weeklyResult.entriesProcessed}`);

    for (const detail of weeklyResult.invoiceDetails) {
      console.log(`  Invoice ${detail.invoiceNumber}: $${detail.total.toFixed(2)} (${detail.entriesCovered} entries) - ${detail.clientName}`);

      invoiceDetailsList.push({
        invoiceNumber: detail.invoiceNumber,
        clientName: detail.clientName,
        totalAmount: detail.total,
        lineItemCount: detail.lineItems,
        status: 'draft',
      });
    }

    if (weeklyResult.invoicesGenerated === 0 && billableResult?.entriesProcessed > 0) {
      step4Warnings.push('Billable entries exist but no invoices generated - entries may already be billed');
      gaps.push('Invoice generation produced 0 invoices despite billable hours existing');
    }

    const totalInvoiced = invoiceDetailsList.reduce((sum, i) => sum + i.totalAmount, 0);
    if (totalInvoiced === 0 && weeklyResult.invoicesGenerated > 0) {
      step4Warnings.push('Invoices generated but all amounts are $0 - check client billing rates');
      gaps.push('Invoice amounts are $0 - billing rates may not be configured');
    }

    if (weeklyResult.warnings.length > 0) {
      step4Warnings.push(...weeklyResult.warnings.slice(0, 5));
    }
  } catch (err: any) {
    step4Errors.push(`Invoice generation failed: ${err.message}`);
    criticalIssues.push(`Invoice generation broken: ${err.message}`);
    console.error(`  ERROR: ${err.message}`);
  }

  steps.push({
    step: 4,
    name: 'Invoice Generation',
    status: step4Errors.length > 0 ? 'error' : step4Warnings.length > 0 ? 'warning' : 'success',
    durationMs: Date.now() - step4Start,
    details: {
      invoicesGenerated: generatedInvoices.length,
      totalInvoiceAmount: invoiceDetailsList.reduce((sum, i) => sum + i.totalAmount, 0),
      invoices: invoiceDetailsList,
    },
    warnings: step4Warnings,
    errors: step4Errors,
  });

  // ================================================================
  // STEP 5: Run Payroll Hours Aggregation
  // ================================================================
  const step5Start = Date.now();
  const step5Warnings: string[] = [];
  const step5Errors: string[] = [];

  console.log('\nSTEP 5: Running Payroll Hours Aggregation...');

  let payrollAggResult: any = null;
  try {
    payrollAggResult = await aggregatePayrollHours({
      workspaceId: WORKSPACE_ID,
      startDate: periodStart,
      endDate: periodEnd,
    });

    console.log(`  Entries processed: ${payrollAggResult.entriesProcessed}`);
    console.log(`  Employee summaries: ${payrollAggResult.employeeSummaries.length}`);
    console.log(`  Total payroll amount: $${payrollAggResult.totalPayrollAmount.toFixed(2)}`);

    if (payrollAggResult.warnings.length > 0) {
      step5Warnings.push(...payrollAggResult.warnings);
      payrollAggResult.warnings.forEach((w: string) => console.log(`  WARNING: ${w}`));
    }

    if (payrollAggResult.entriesProcessed === 0) {
      step5Warnings.push('No entries processed for payroll - entries may already be payrolled or not approved');
      gaps.push('Payroll hours aggregation returned 0 entries');
    }
  } catch (err: any) {
    step5Errors.push(`Payroll hours aggregation failed: ${err.message}`);
    criticalIssues.push(`Payroll pipeline broken: ${err.message}`);
    console.error(`  ERROR: ${err.message}`);
  }

  steps.push({
    step: 5,
    name: 'Payroll Hours Aggregation',
    status: step5Errors.length > 0 ? 'error' : step5Warnings.length > 0 ? 'warning' : 'success',
    durationMs: Date.now() - step5Start,
    details: payrollAggResult ? {
      entriesProcessed: payrollAggResult.entriesProcessed,
      employeeSummaries: payrollAggResult.employeeSummaries.length,
      totalPayrollAmount: payrollAggResult.totalPayrollAmount,
      byEmployee: payrollAggResult.employeeSummaries.map((es: any) => ({
        employeeName: es.employeeName,
        totalHours: es.totalHours,
        regularHours: es.totalRegularHours,
        overtimeHours: es.totalOvertimeHours,
        holidayHours: es.totalHolidayHours,
        grossPay: es.grossPay,
      })),
    } : { error: 'Aggregation failed' },
    warnings: step5Warnings,
    errors: step5Errors,
  });

  // ================================================================
  // STEP 6: Calculate Full Payroll (taxes, deductions, net pay)
  // ================================================================
  const step6Start = Date.now();
  const step6Warnings: string[] = [];
  const step6Errors: string[] = [];
  const payrollDetailsList: WeeklySimulationReport['payrollDetails'] = [];
  let totalGrossPay = 0;
  let totalNetPay = 0;
  let totalFederalTax = 0;
  let totalStateTax = 0;
  let totalSocialSecurity = 0;
  let totalMedicare = 0;

  console.log('\nSTEP 6: Calculating Full Payroll (taxes, deductions, net pay)...');

  if (payrollAggResult && payrollAggResult.employeeSummaries.length > 0) {
    for (const empSummary of payrollAggResult.employeeSummaries) {
      const grossPay = empSummary.grossPay;
      const regularHours = empSummary.totalRegularHours;
      const overtimeHours = empSummary.totalOvertimeHours;
      const holidayHours = empSummary.totalHolidayHours;

      const equivalentHours = regularHours + (overtimeHours * 1.5) + (holidayHours * 2.0);
      const hourlyRate = equivalentHours > 0 ? grossPay / equivalentHours : 0;

      const federalTax = PayrollAutomationEngine.calculateFederalTax(grossPay, 'weekly');
      const stateTax = PayrollAutomationEngine.calculateStateTax(grossPay, 'TX', 'weekly');
      const socialSecurity = PayrollAutomationEngine.calculateSocialSecurity(grossPay);
      const medicare = PayrollAutomationEngine.calculateMedicare(grossPay);

      const totalDeductions = federalTax + stateTax + socialSecurity + medicare;
      const netPay = grossPay - totalDeductions;

      totalGrossPay += grossPay;
      totalNetPay += netPay;
      totalFederalTax += federalTax;
      totalStateTax += stateTax;
      totalSocialSecurity += socialSecurity;
      totalMedicare += medicare;

      console.log(`  ${empSummary.employeeName}: ${regularHours}h reg + ${overtimeHours}h OT = $${grossPay.toFixed(2)} gross → $${netPay.toFixed(2)} net`);

      payrollDetailsList.push({
        employeeName: empSummary.employeeName,
        employeeId: empSummary.employeeId,
        regularHours,
        overtimeHours,
        holidayHours,
        hourlyRate: parseFloat(hourlyRate.toFixed(2)),
        grossPay: parseFloat(grossPay.toFixed(2)),
        federalTax: parseFloat(federalTax.toFixed(2)),
        stateTax: parseFloat(stateTax.toFixed(2)),
        socialSecurity: parseFloat(socialSecurity.toFixed(2)),
        medicare: parseFloat(medicare.toFixed(2)),
        netPay: parseFloat(netPay.toFixed(2)),
      });
    }

    console.log(`\n  PAYROLL TOTALS:`);
    console.log(`  Total Gross Pay:      $${totalGrossPay.toFixed(2)}`);
    console.log(`  Total Federal Tax:    $${totalFederalTax.toFixed(2)}`);
    console.log(`  Total State Tax:      $${totalStateTax.toFixed(2)}`);
    console.log(`  Total Social Security:$${totalSocialSecurity.toFixed(2)}`);
    console.log(`  Total Medicare:       $${totalMedicare.toFixed(2)}`);
    console.log(`  Total Net Pay:        $${totalNetPay.toFixed(2)}`);

    if (totalGrossPay === 0) {
      criticalIssues.push('Payroll processed employees but total gross pay is $0 - missing pay rates');
    }
  } else {
    step6Warnings.push('No payroll data to calculate - payroll aggregation returned no employees');
  }

  steps.push({
    step: 6,
    name: 'Full Payroll Calculation',
    status: step6Errors.length > 0 ? 'error' : step6Warnings.length > 0 ? 'warning' : 'success',
    durationMs: Date.now() - step6Start,
    details: {
      employeesProcessed: payrollDetailsList.length,
      totalGrossPay: parseFloat(totalGrossPay.toFixed(2)),
      totalNetPay: parseFloat(totalNetPay.toFixed(2)),
      totalFederalTax: parseFloat(totalFederalTax.toFixed(2)),
      totalStateTax: parseFloat(totalStateTax.toFixed(2)),
      totalSocialSecurity: parseFloat(totalSocialSecurity.toFixed(2)),
      totalMedicare: parseFloat(totalMedicare.toFixed(2)),
      totalDeductions: parseFloat((totalFederalTax + totalStateTax + totalSocialSecurity + totalMedicare).toFixed(2)),
    },
    warnings: step6Warnings,
    errors: step6Errors,
  });

  // ================================================================
  // STEP 7: Cleanup Simulated Data
  // ================================================================
  const step7Start = Date.now();
  const step7Warnings: string[] = [];

  console.log('\nSTEP 7: Cleaning up simulation data...');

  try {
    if (seededEntryIds.length > 0) {
      await db.delete(timeEntries)
        .where(sql`${timeEntries.id} LIKE ${'sim-' + simulationId + '%'}`);
      console.log(`  Cleaned up ${seededEntryIds.length} simulated time entries`);
    }

    if (generatedInvoices.length > 0) {
      for (const inv of generatedInvoices) {
        await db.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, inv.id));
        await db.delete(invoices).where(eq(invoices.id, inv.id));
      }
      console.log(`  Cleaned up ${generatedInvoices.length} simulated invoices`);
    }
  } catch (err: any) {
    step7Warnings.push(`Cleanup partially failed: ${err.message}`);
    console.warn(`  WARNING: ${err.message}`);
  }

  steps.push({
    step: 7,
    name: 'Cleanup Simulation Data',
    status: step7Warnings.length > 0 ? 'warning' : 'success',
    durationMs: Date.now() - step7Start,
    details: {
      entriesCleaned: seededEntryIds.length,
      invoicesCleaned: generatedInvoices.length,
    },
    warnings: step7Warnings,
    errors: [],
  });

  // ================================================================
  // FINAL REPORT
  // ================================================================
  const completedAt = new Date();
  const totalDurationMs = completedAt.getTime() - startedAt.getTime();

  const allWarnings = steps.flatMap(s => s.warnings);
  if (allWarnings.length > 0 && !gaps.includes('Aggregation warnings detected')) {
    gaps.push(`${allWarnings.length} total warnings across pipeline`);
  }

  const report: WeeklySimulationReport = {
    simulationId,
    workspaceId: WORKSPACE_ID,
    workspaceName: workspace.name,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    totalDurationMs,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    steps,
    summary: {
      timeEntriesSeeded: seededEntries,
      totalHoursSeeded,
      employeesWithHours: payrollDetailsList.length,
      clientsBilled: invoiceDetailsList.length,
      invoicesGenerated: generatedInvoices.length,
      totalInvoiceAmount: parseFloat(invoiceDetailsList.reduce((sum, i) => sum + i.totalAmount, 0).toFixed(2)),
      weeklyBillableTotal: billableResult?.totalBillableAmount || 0,
      invoiceLineItemCount: invoiceDetailsList.reduce((sum, i) => sum + i.lineItemCount, 0),
      payrollEmployeesProcessed: payrollDetailsList.length,
      totalGrossPay: parseFloat(totalGrossPay.toFixed(2)),
      totalNetPay: parseFloat(totalNetPay.toFixed(2)),
      totalFederalTax: parseFloat(totalFederalTax.toFixed(2)),
      totalStateTax: parseFloat(totalStateTax.toFixed(2)),
      totalSocialSecurity: parseFloat(totalSocialSecurity.toFixed(2)),
      totalMedicare: parseFloat(totalMedicare.toFixed(2)),
      totalDeductions: parseFloat((totalFederalTax + totalStateTax + totalSocialSecurity + totalMedicare).toFixed(2)),
      gapsIdentified: gaps,
      criticalIssues,
    },
    payrollDetails: payrollDetailsList,
    invoiceDetails: invoiceDetailsList,
  };

  console.log('\n==========================================================');
  console.log('  WEEKLY AUTOMATION SIMULATION - COMPLETE');
  console.log(`  Duration: ${totalDurationMs}ms`);
  console.log(`  Invoices: ${generatedInvoices.length} ($${report.summary.totalInvoiceAmount.toFixed(2)})`);
  console.log(`  Payroll: ${payrollDetailsList.length} employees ($${totalGrossPay.toFixed(2)} gross / $${totalNetPay.toFixed(2)} net)`);
  console.log(`  Gaps: ${gaps.length}`);
  console.log(`  Critical Issues: ${criticalIssues.length}`);
  console.log('==========================================================');

  return report;
}
