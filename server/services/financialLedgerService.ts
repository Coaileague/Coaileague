import { db } from '../db';
import { eq, and, gte, lte, desc, sql, sum, count, inArray } from 'drizzle-orm';
// RC4 (Phase 2): Decimal.js for AR aging outstanding subtraction — prevents float drift in reports.
import { subtractFinancialValues, toFinancialString, addFinancialValues, multiplyFinancialValues, divideFinancialValues } from './financialCalculator';
import {
  invoices,
  invoiceLineItems,
  payrollRuns,
  payrollEntries,
  expenses,
  clients,
  employees,
  timeEntries,
} from '@shared/schema';

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface ChartOfAccount {
  code: string;
  name: string;
  type: AccountType;
  category: string;
}

export interface JournalEntry {
  id: string;
  date: Date;
  description: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  reference?: string;
  sourceType: 'invoice' | 'payroll' | 'expense' | 'adjustment';
  sourceId: string;
}

export interface PLReport {
  periodStart: Date;
  periodEnd: Date;
  revenue: {
    securityServices: number;
    otherRevenue: number;
    totalRevenue: number;
  };
  costOfGoodsSold: {
    laborCosts: number;
    overtimeCosts: number;
    totalCOGS: number;
  };
  grossProfit: number;
  grossMarginPercent: number;
  operatingExpenses: {
    categories: Record<string, number>;
    totalOperatingExpenses: number;
  };
  netIncome: number;
  netMarginPercent: number;
}

export interface BalanceSheetData {
  asOf: Date;
  assets: {
    accountsReceivable: number;
    totalAssets: number;
  };
  liabilities: {
    accruedPayroll: number;
    taxesPayable: number;
    totalLiabilities: number;
  };
  equity: {
    retainedEarnings: number;
    totalEquity: number;
  };
}

export interface RevenuePerGuardHour {
  clientId: string;
  clientName: string;
  totalRevenue: number;
  totalHours: number;
  revenuePerHour: number;
}

export interface LaborCostRatio {
  totalRevenue: number;
  totalLaborCost: number;
  ratio: number;
  percentOfRevenue: number;
}

export interface ClientProfitMargin {
  clientId: string;
  clientName: string;
  revenue: number;
  laborCost: number;
  profit: number;
  marginPercent: number;
}

export interface ARAgingSummary {
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  over90: number;
  totalOutstanding: number;
}

const CHART_OF_ACCOUNTS: ChartOfAccount[] = [
  { code: '1000', name: 'Accounts Receivable', type: 'asset', category: 'Current Assets' },
  { code: '1010', name: 'Cash', type: 'asset', category: 'Current Assets' },
  { code: '2000', name: 'Accrued Payroll', type: 'liability', category: 'Current Liabilities' },
  { code: '2010', name: 'Taxes Payable', type: 'liability', category: 'Current Liabilities' },
  { code: '3000', name: 'Retained Earnings', type: 'equity', category: 'Equity' },
  { code: '4000', name: 'Security Service Revenue', type: 'revenue', category: 'Revenue' },
  { code: '4010', name: 'Other Revenue', type: 'revenue', category: 'Revenue' },
  { code: '5000', name: 'Labor Costs - Regular', type: 'expense', category: 'Cost of Goods Sold' },
  { code: '5010', name: 'Labor Costs - Overtime', type: 'expense', category: 'Cost of Goods Sold' },
  { code: '5020', name: 'Payroll Taxes', type: 'expense', category: 'Cost of Goods Sold' },
  { code: '6000', name: 'Office & Admin', type: 'expense', category: 'Operating Expenses' },
  { code: '6010', name: 'Equipment', type: 'expense', category: 'Operating Expenses' },
  { code: '6020', name: 'Insurance', type: 'expense', category: 'Operating Expenses' },
  { code: '6030', name: 'Training', type: 'expense', category: 'Operating Expenses' },
  { code: '6040', name: 'Travel & Mileage', type: 'expense', category: 'Operating Expenses' },
  { code: '6050', name: 'Other Expenses', type: 'expense', category: 'Operating Expenses' },
];

export class FinancialLedgerService {
  getChartOfAccounts(): ChartOfAccount[] {
    return CHART_OF_ACCOUNTS;
  }

  async generateJournalEntries(
    workspaceId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<JournalEntry[]> {
    const entries: JournalEntry[] = [];

    const invoiceRows = await db.select()
      .from(invoices)
      .where(
        and(
          eq(invoices.workspaceId, workspaceId),
          gte(invoices.issueDate, periodStart),
          lte(invoices.issueDate, periodEnd)
        )
      );

    for (const inv of invoiceRows) {
      const total = parseFloat(inv.total) || 0;
      if (total > 0) {
        entries.push({
          id: `inv-${inv.id}`,
          date: inv.issueDate || new Date(),
          description: `Invoice ${inv.invoiceNumber} issued`,
          debitAccount: '1000',
          creditAccount: '4000',
          amount: total,
          reference: inv.invoiceNumber,
          sourceType: 'invoice',
          sourceId: inv.id,
        });
      }

      if (inv.paidAt) {
        const paid = parseFloat(inv.amountPaid || '0') || total;
        entries.push({
          id: `inv-pay-${inv.id}`,
          date: inv.paidAt,
          description: `Payment received for ${inv.invoiceNumber}`,
          debitAccount: '1010',
          creditAccount: '1000',
          amount: paid,
          reference: inv.invoiceNumber,
          sourceType: 'invoice',
          sourceId: inv.id,
        });
      }
    }

    const payrollRunRows = await db.select()
      .from(payrollRuns)
      .where(
        and(
          eq(payrollRuns.workspaceId, workspaceId),
          gte(payrollRuns.periodStart, periodStart),
          lte(payrollRuns.periodEnd, periodEnd)
        )
      );

    for (const run of payrollRunRows) {
      const gross = parseFloat(run.totalGrossPay || '0') || 0;
      const taxes = parseFloat(run.totalTaxes || '0') || 0;
      const net = parseFloat(run.totalNetPay || '0') || 0;

      if (gross > 0) {
        entries.push({
          id: `pr-labor-${run.id}`,
          date: run.periodEnd,
          description: `Payroll run labor costs`,
          debitAccount: '5000',
          creditAccount: '2000',
          amount: gross,
          sourceType: 'payroll',
          sourceId: run.id,
        });
      }

      if (taxes > 0) {
        entries.push({
          id: `pr-tax-${run.id}`,
          date: run.periodEnd,
          description: `Payroll tax obligations`,
          debitAccount: '5020',
          creditAccount: '2010',
          amount: taxes,
          sourceType: 'payroll',
          sourceId: run.id,
        });
      }
    }

    const expenseRows = await db.select()
      .from(expenses)
      .where(
        and(
          eq(expenses.workspaceId, workspaceId),
          gte(expenses.expenseDate, periodStart),
          lte(expenses.expenseDate, periodEnd)
        )
      );

    for (const exp of expenseRows) {
      const amount = parseFloat(exp.amount || '0') || 0;
      if (amount > 0) {
        entries.push({
          id: `exp-${exp.id}`,
          date: exp.expenseDate || new Date(),
          description: exp.description || 'Expense',
          debitAccount: '6050',
          creditAccount: '1010',
          amount,
          sourceType: 'expense',
          sourceId: exp.id,
        });
      }
    }

    return entries.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  async generatePLReport(
    workspaceId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<PLReport> {
    const [revenueResult] = await db.select({
      total: sql<string>`COALESCE(SUM(CAST(${invoices.total} AS numeric)), 0)`,
    })
      .from(invoices)
      .where(
        and(
          eq(invoices.workspaceId, workspaceId),
          gte(invoices.issueDate, periodStart),
          lte(invoices.issueDate, periodEnd)
        )
      );

    const totalRevenue = parseFloat(revenueResult?.total || '0');

    const payrollData = await db.select({
      totalGross: sql<string>`COALESCE(SUM(CAST(${payrollEntries.grossPay} AS numeric)), 0)`,
      regularHours: sql<string>`COALESCE(SUM(CAST(${payrollEntries.regularHours} AS numeric)), 0)`,
      overtimeHours: sql<string>`COALESCE(SUM(CAST(${payrollEntries.overtimeHours} AS numeric)), 0)`,
      hourlyRate: sql<string>`COALESCE(AVG(CAST(${payrollEntries.hourlyRate} AS numeric)), 0)`,
    })
      .from(payrollEntries)
      .innerJoin(payrollRuns, eq(payrollEntries.payrollRunId, payrollRuns.id))
      .where(
        and(
          eq(payrollEntries.workspaceId, workspaceId),
          gte(payrollRuns.periodStart, periodStart),
          lte(payrollRuns.periodEnd, periodEnd)
        )
      );

    const totalGross = parseFloat(payrollData[0]?.totalGross || '0');
    const regularHrs = parseFloat(payrollData[0]?.regularHours || '0');
    const overtimeHrs = parseFloat(payrollData[0]?.overtimeHours || '0');
    const avgRate = parseFloat(payrollData[0]?.hourlyRate || '0');

    const regularLaborStr = multiplyFinancialValues(toFinancialString(String(regularHrs)), toFinancialString(String(avgRate)));
    const overtimeLaborStr = multiplyFinancialValues(toFinancialString(String(overtimeHrs)), multiplyFinancialValues(toFinancialString(String(avgRate)), '1.5'));
    const regularLabor = parseFloat(regularLaborStr);
    const overtimeLabor = parseFloat(overtimeLaborStr);
    const totalCOGS = totalGross || parseFloat(addFinancialValues(regularLaborStr, overtimeLaborStr));

    const [expenseResult] = await db.select({
      total: sql<string>`COALESCE(SUM(CAST(${expenses.amount} AS numeric)), 0)`,
    })
      .from(expenses)
      .where(
        and(
          eq(expenses.workspaceId, workspaceId),
          gte(expenses.expenseDate, periodStart),
          lte(expenses.expenseDate, periodEnd)
        )
      );

    const totalExpenses = parseFloat(expenseResult?.total || '0');
    const grossProfitStr = subtractFinancialValues(toFinancialString(String(totalRevenue)), toFinancialString(String(totalCOGS)));
    const netIncomeStr = subtractFinancialValues(grossProfitStr, toFinancialString(String(totalExpenses)));
    const grossProfit = parseFloat(grossProfitStr);
    const netIncome = parseFloat(netIncomeStr);

    return {
      periodStart,
      periodEnd,
      revenue: {
        securityServices: totalRevenue,
        otherRevenue: 0,
        totalRevenue,
      },
      costOfGoodsSold: {
        laborCosts: regularLabor || totalGross,
        overtimeCosts: overtimeLabor,
        totalCOGS,
      },
      grossProfit,
      grossMarginPercent: totalRevenue > 0 ? parseFloat(divideFinancialValues(multiplyFinancialValues(grossProfitStr, '100'), toFinancialString(String(totalRevenue)))) : 0,
      operatingExpenses: {
        categories: { general: totalExpenses },
        totalOperatingExpenses: totalExpenses,
      },
      netIncome,
      netMarginPercent: totalRevenue > 0 ? parseFloat(divideFinancialValues(multiplyFinancialValues(netIncomeStr, '100'), toFinancialString(String(totalRevenue)))) : 0,
    };
  }

  async generateBalanceSheet(
    workspaceId: string,
    asOf: Date
  ): Promise<BalanceSheetData> {
    const [arResult] = await db.select({
      outstanding: sql<string>`COALESCE(SUM(CAST(${invoices.total} AS numeric) - COALESCE(CAST(${invoices.amountPaid} AS numeric), 0)), 0)`,
    })
      .from(invoices)
      .where(
        and(
          eq(invoices.workspaceId, workspaceId),
          lte(invoices.issueDate, asOf),
          sql`${invoices.status} != 'paid'`
        )
      );

    const accountsReceivable = parseFloat(arResult?.outstanding || '0');

    const [payrollLiability] = await db.select({
      accrued: sql<string>`COALESCE(SUM(CAST(${payrollRuns.totalNetPay} AS numeric)), 0)`,
      taxes: sql<string>`COALESCE(SUM(CAST(${payrollRuns.totalTaxes} AS numeric)), 0)`,
    })
      .from(payrollRuns)
      .where(
        and(
          eq(payrollRuns.workspaceId, workspaceId),
          eq(payrollRuns.status, 'pending_review'),
          lte(payrollRuns.periodEnd, asOf)
        )
      );

    const accruedPayroll = parseFloat(payrollLiability?.accrued || '0');
    const taxesPayable = parseFloat(payrollLiability?.taxes || '0');
    const totalLiabilities = accruedPayroll + taxesPayable;
    const totalAssets = accountsReceivable;
    const retainedEarnings = totalAssets - totalLiabilities;

    return {
      asOf,
      assets: {
        accountsReceivable,
        totalAssets,
      },
      liabilities: {
        accruedPayroll,
        taxesPayable,
        totalLiabilities,
      },
      equity: {
        retainedEarnings,
        totalEquity: retainedEarnings,
      },
    };
  }

  async getRevenuePerGuardHour(
    workspaceId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<RevenuePerGuardHour[]> {
    const clientRevenue = await db.select({
      clientId: invoices.clientId,
      totalRevenue: sql<string>`COALESCE(SUM(CAST(${invoices.total} AS numeric)), 0)`,
    })
      .from(invoices)
      .where(
        and(
          eq(invoices.workspaceId, workspaceId),
          gte(invoices.issueDate, periodStart),
          lte(invoices.issueDate, periodEnd)
        )
      )
      .groupBy(invoices.clientId);

    const clientHours = await db.select({
      clientId: timeEntries.clientId,
      totalHours: sql<string>`COALESCE(SUM(CAST(${timeEntries.totalHours} AS numeric)), 0)`,
    })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.clockIn, periodStart),
          lte(timeEntries.clockIn, periodEnd)
        )
      )
      .groupBy(timeEntries.clientId);

    const hoursMap = new Map(clientHours.map(h => [h.clientId, parseFloat(h.totalHours || '0')]));

    const results: RevenuePerGuardHour[] = [];
    for (const rev of clientRevenue) {
      if (!rev.clientId) continue;
      const [client] = await db.select({ firstName: clients.firstName, lastName: clients.lastName, companyName: clients.companyName })
        .from(clients).where(eq(clients.id, rev.clientId)).limit(1);

      const revenue = parseFloat(rev.totalRevenue || '0');
      const hours = hoursMap.get(rev.clientId) || 0;
      const clientName = client?.companyName || `${client?.firstName || ''} ${client?.lastName || ''}`.trim() || 'Unknown';

      results.push({
        clientId: rev.clientId,
        clientName,
        totalRevenue: revenue,
        totalHours: hours,
        revenuePerHour: hours > 0 ? revenue / hours : 0,
      });
    }

    return results.sort((a, b) => b.revenuePerHour - a.revenuePerHour);
  }

  async getLaborCostRatio(
    workspaceId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<LaborCostRatio> {
    const [revenueResult] = await db.select({
      total: sql<string>`COALESCE(SUM(CAST(${invoices.total} AS numeric)), 0)`,
    })
      .from(invoices)
      .where(
        and(
          eq(invoices.workspaceId, workspaceId),
          gte(invoices.issueDate, periodStart),
          lte(invoices.issueDate, periodEnd)
        )
      );

    const [laborResult] = await db.select({
      total: sql<string>`COALESCE(SUM(CAST(${payrollRuns.totalGrossPay} AS numeric)), 0)`,
    })
      .from(payrollRuns)
      .where(
        and(
          eq(payrollRuns.workspaceId, workspaceId),
          gte(payrollRuns.periodStart, periodStart),
          lte(payrollRuns.periodEnd, periodEnd)
        )
      );

    const totalRevenue = parseFloat(revenueResult?.total || '0');
    const totalLaborCost = parseFloat(laborResult?.total || '0');

    return {
      totalRevenue,
      totalLaborCost,
      ratio: totalRevenue > 0 ? parseFloat(divideFinancialValues(toFinancialString(String(totalLaborCost)), toFinancialString(String(totalRevenue)))) : 0,
      percentOfRevenue: totalRevenue > 0 ? parseFloat(divideFinancialValues(multiplyFinancialValues(toFinancialString(String(totalLaborCost)), '100'), toFinancialString(String(totalRevenue)))) : 0,
    };
  }

  async getProfitMarginsByClient(
    workspaceId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<ClientProfitMargin[]> {
    const clientRevenue = await db.select({
      clientId: invoices.clientId,
      revenue: sql<string>`COALESCE(SUM(CAST(${invoices.total} AS numeric)), 0)`,
    })
      .from(invoices)
      .where(
        and(
          eq(invoices.workspaceId, workspaceId),
          gte(invoices.issueDate, periodStart),
          lte(invoices.issueDate, periodEnd)
        )
      )
      .groupBy(invoices.clientId);

    const clientLabor = await db.select({
      clientId: timeEntries.clientId,
      totalHours: sql<string>`COALESCE(SUM(CAST(${timeEntries.totalHours} AS numeric)), 0)`,
      avgRate: sql<string>`COALESCE(AVG(CAST(${timeEntries.hourlyRate} AS numeric)), 0)`,
    })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.clockIn, periodStart),
          lte(timeEntries.clockIn, periodEnd)
        )
      )
      .groupBy(timeEntries.clientId);

    const laborMap = new Map(clientLabor.map(l => [
      l.clientId,
      parseFloat(multiplyFinancialValues(toFinancialString(l.totalHours || '0'), toFinancialString(l.avgRate || '0')))
    ]));

    const results: ClientProfitMargin[] = [];
    for (const rev of clientRevenue) {
      if (!rev.clientId) continue;
      const [client] = await db.select({ firstName: clients.firstName, lastName: clients.lastName, companyName: clients.companyName })
        .from(clients).where(eq(clients.id, rev.clientId)).limit(1);

      const revenue = parseFloat(rev.revenue || '0');
      const laborCost = laborMap.get(rev.clientId) || 0;
      const profit = revenue - laborCost;
      const clientName = client?.companyName || `${client?.firstName || ''} ${client?.lastName || ''}`.trim() || 'Unknown';

      results.push({
        clientId: rev.clientId,
        clientName,
        revenue,
        laborCost,
        profit,
        marginPercent: revenue > 0 ? parseFloat(divideFinancialValues(multiplyFinancialValues(toFinancialString(String(profit)), '100'), toFinancialString(String(revenue)))) : 0,
      });
    }

    return results.sort((a, b) => b.marginPercent - a.marginPercent);
  }

  async getARAgingSummary(workspaceId: string): Promise<ARAgingSummary> {
    const now = new Date();
    const unpaidInvoices = await db.select({
      dueDate: invoices.dueDate,
      total: invoices.total,
      amountPaid: invoices.amountPaid,
    })
      .from(invoices)
      .where(
        and(
          eq(invoices.workspaceId, workspaceId),
          sql`${invoices.status} != 'paid'`
        )
      );

    const summary: ARAgingSummary = {
      current: 0,
      days1to30: 0,
      days31to60: 0,
      days61to90: 0,
      over90: 0,
      totalOutstanding: 0,
    };

    for (const inv of unpaidInvoices) {
      // RC4: Decimal.js subtraction for AR outstanding — no float drift on aging report.
      const outstanding = parseFloat(
        subtractFinancialValues(
          toFinancialString(String(inv.total || 0)),
          toFinancialString(String(inv.amountPaid || 0))
        )
      );
      if (outstanding <= 0) continue;

      summary.totalOutstanding += outstanding;

      if (!inv.dueDate) {
        summary.current += outstanding;
        continue;
      }

      const daysOverdue = Math.floor((now.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysOverdue <= 0) {
        summary.current += outstanding;
      } else if (daysOverdue <= 30) {
        summary.days1to30 += outstanding;
      } else if (daysOverdue <= 60) {
        summary.days31to60 += outstanding;
      } else if (daysOverdue <= 90) {
        summary.days61to90 += outstanding;
      } else {
        summary.over90 += outstanding;
      }
    }

    return summary;
  }

  async recordPayrollJournalEntries(
    workspaceId: string,
    payrollRunId: string,
    entries: Array<{
      employeeId: string;
      employeeName: string;
      grossPay: number;
      netPay: number;
      federalTax: number;
      stateTax: number;
      socialSecurity: number;
      medicare: number;
      employerSocialSecurity: number;
      employerMedicare: number;
      employerFUTA: number;
      employerSUTA: number;
    }>
  ): Promise<JournalEntry[]> {
    const journalEntries: JournalEntry[] = [];
    const now = new Date();

    let totalGross = 0;
    let totalNet = 0;
    let totalEmployeeTaxes = 0;
    let totalEmployerFICA = 0;
    let totalFUTA = 0;
    let totalSUTA = 0;

    for (const entry of entries) {
      totalGross += entry.grossPay;
      totalNet += entry.netPay;
      totalEmployeeTaxes += entry.federalTax + entry.stateTax + entry.socialSecurity + entry.medicare;
      totalEmployerFICA += entry.employerSocialSecurity + entry.employerMedicare;
      totalFUTA += entry.employerFUTA;
      totalSUTA += entry.employerSUTA;
    }

    if (totalGross > 0) {
      journalEntries.push({
        id: `pr-wages-${payrollRunId}`,
        date: now,
        description: `Payroll run ${payrollRunId} - Wages expense`,
        debitAccount: '5000',
        creditAccount: '1010',
        amount: totalNet,
        reference: payrollRunId,
        sourceType: 'payroll',
        sourceId: payrollRunId,
      });
    }

    if (totalEmployeeTaxes > 0) {
      journalEntries.push({
        id: `pr-emp-tax-${payrollRunId}`,
        date: now,
        description: `Payroll run ${payrollRunId} - Employee tax withholdings`,
        debitAccount: '5000',
        creditAccount: '2010',
        amount: totalEmployeeTaxes,
        reference: payrollRunId,
        sourceType: 'payroll',
        sourceId: payrollRunId,
      });
    }

    if (totalEmployerFICA > 0) {
      journalEntries.push({
        id: `pr-er-fica-${payrollRunId}`,
        date: now,
        description: `Payroll run ${payrollRunId} - Employer FICA match (SS + Medicare)`,
        debitAccount: '5020',
        creditAccount: '2010',
        amount: totalEmployerFICA,
        reference: payrollRunId,
        sourceType: 'payroll',
        sourceId: payrollRunId,
      });
    }

    if (totalFUTA > 0) {
      journalEntries.push({
        id: `pr-futa-${payrollRunId}`,
        date: now,
        description: `Payroll run ${payrollRunId} - FUTA tax liability`,
        debitAccount: '5020',
        creditAccount: '2010',
        amount: totalFUTA,
        reference: payrollRunId,
        sourceType: 'payroll',
        sourceId: payrollRunId,
      });
    }

    if (totalSUTA > 0) {
      journalEntries.push({
        id: `pr-suta-${payrollRunId}`,
        date: now,
        description: `Payroll run ${payrollRunId} - SUTA tax liability`,
        debitAccount: '5020',
        creditAccount: '2010',
        amount: totalSUTA,
        reference: payrollRunId,
        sourceType: 'payroll',
        sourceId: payrollRunId,
      });
    }

    return journalEntries;
  }

  async getEmployerTaxLiabilities(
    workspaceId: string,
    year?: number,
    quarter?: number
  ): Promise<{
    period: { year: number; quarter?: number };
    ficaEmployerMatch: { socialSecurity: number; medicare: number; total: number };
    futaLiability: number;
    sutaLiability: number;
    federalIncomeTaxWithheld: number;
    stateTaxWithheld: number;
    totalEmployerObligation: number;
    totalTrustFundLiability: number;
    quarterlyDeadlines: Array<{ quarter: number; deadline: string; estimated: number }>;
    employeeCount: number;
  }> {
    const targetYear = year || new Date().getFullYear();
    let periodStart: Date;
    let periodEnd: Date;

    if (quarter) {
      const qMonth = (quarter - 1) * 3;
      periodStart = new Date(targetYear, qMonth, 1);
      periodEnd = new Date(targetYear, qMonth + 3, 0, 23, 59, 59, 999);
    } else {
      periodStart = new Date(targetYear, 0, 1);
      periodEnd = new Date(targetYear, 11, 31, 23, 59, 59, 999);
    }

    const result = await db.select({
      totalGross: sql<string>`COALESCE(SUM(CAST(${payrollEntries.grossPay} AS NUMERIC)), 0)`,
      totalFederalTax: sql<string>`COALESCE(SUM(CAST(${payrollEntries.federalTax} AS NUMERIC)), 0)`,
      totalStateTax: sql<string>`COALESCE(SUM(CAST(${payrollEntries.stateTax} AS NUMERIC)), 0)`,
      totalSS: sql<string>`COALESCE(SUM(CAST(${payrollEntries.socialSecurity} AS NUMERIC)), 0)`,
      totalMedicare: sql<string>`COALESCE(SUM(CAST(${payrollEntries.medicare} AS NUMERIC)), 0)`,
      employeeCount: sql<string>`COUNT(DISTINCT ${payrollEntries.employeeId})`,
    })
      .from(payrollEntries)
      .innerJoin(payrollRuns, eq(payrollEntries.payrollRunId, payrollRuns.id))
      .where(
        and(
          eq(payrollEntries.workspaceId, workspaceId),
          gte(payrollRuns.periodStart, periodStart),
          lte(payrollRuns.periodEnd, periodEnd),
          inArray(payrollRuns.status, ['approved', 'processed', 'paid', 'completed'])
        )
      );

    const row = result[0];
    const totalGross = parseFloat(row?.totalGross || '0');
    const federalIncomeTaxWithheld = parseFloat(row?.totalFederalTax || '0');
    const stateTaxWithheld = parseFloat(row?.totalStateTax || '0');
    const employeeSS = parseFloat(row?.totalSS || '0');
    const employeeMedicare = parseFloat(row?.totalMedicare || '0');
    const employeeCount = parseInt(row?.employeeCount || '0');

    const employerSS = employeeSS;
    const employerMedicare = employeeMedicare;
    const ficaTotal = employerSS + employerMedicare;

    const futaWageBase = 7000;
    const futaRate = 0.006;
    const futaLiability = Math.min(employeeCount * futaWageBase, totalGross) * futaRate;

    const sutaRate = 0.027;
    const sutaWageBase = 9000;
    const sutaLiability = Math.min(employeeCount * sutaWageBase, totalGross) * sutaRate;

    const totalEmployerObligation = ficaTotal + futaLiability + sutaLiability;
    const totalTrustFundLiability = federalIncomeTaxWithheld + employeeSS + employeeMedicare + employerSS + employerMedicare;

    const quarterlyDeadlines = [
      { quarter: 1, deadline: `${targetYear}-04-30`, estimated: totalEmployerObligation / 4 },
      { quarter: 2, deadline: `${targetYear}-07-31`, estimated: totalEmployerObligation / 4 },
      { quarter: 3, deadline: `${targetYear}-10-31`, estimated: totalEmployerObligation / 4 },
      { quarter: 4, deadline: `${targetYear + 1}-01-31`, estimated: totalEmployerObligation / 4 },
    ];

    return {
      period: { year: targetYear, quarter },
      ficaEmployerMatch: { socialSecurity: employerSS, medicare: employerMedicare, total: ficaTotal },
      futaLiability,
      sutaLiability,
      federalIncomeTaxWithheld,
      stateTaxWithheld,
      totalEmployerObligation,
      totalTrustFundLiability,
      quarterlyDeadlines,
      employeeCount,
    };
  }
}

export const financialLedgerService = new FinancialLedgerService();
