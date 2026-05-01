import { Router } from "express";
import { db } from "../db";
import { storage } from "../storage";
import {
  invoices,
  timeEntries,
  payrollRuns,
  payrollEntries,
  clients,
  employees,
  sites,
  savedReports,
  insertSavedReportSchema,
  expenses,
} from "@shared/schema";
import { eq, and, gte, lte, sql, desc, asc, count } from "drizzle-orm";
import { z } from "zod";
import { hasManagerAccess, type AuthenticatedRequest } from "../rbac";
import { typedQuery } from '../lib/typedSql';
import { sumFinancialValues, subtractFinancialValues, divideFinancialValues, toFinancialString, formatCurrency } from '../services/financialCalculator';
import { createLogger } from '../lib/logger';
const log = createLogger('QbReportsRoutes');


    // CATEGORY C — Raw SQL retained: GROUP BY | Tables: time_entries | Verified: 2026-03-23
const router = Router();

const dateRangeSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

function parseDateRange(query: any): { startDate: Date; endDate: Date; error?: string } {
  const now = new Date();
  let startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  let endDate = now;

  if (query.startDate) {
    const parsed = new Date(query.startDate as string);
    if (isNaN(parsed.getTime())) return { startDate, endDate, error: "Invalid startDate format" };
    startDate = parsed;
  }
  if (query.endDate) {
    const parsed = new Date(query.endDate as string);
    if (isNaN(parsed.getTime())) return { startDate, endDate, error: "Invalid endDate format" };
    endDate = parsed;
  }
  if (startDate > endDate) return { startDate, endDate, error: "startDate must be before endDate" };
  return { startDate, endDate };
}

router.get("/client-profitability", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const { startDate, endDate, error: dateError } = parseDateRange(req.query);
    if (dateError) return res.status(400).json({ error: dateError });

    const clientList = await db
      .select()
      .from(clients)
      .where(eq(clients.workspaceId, workspaceId));

    const rows: any[] = [];

    for (const client of clientList) {
      const invoiceData = await db
        .select({
          totalRevenue: sql<string>`COALESCE(SUM(${invoices.total}::numeric), 0)`,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.workspaceId, workspaceId),
            eq(invoices.clientId, client.id),
            gte(invoices.createdAt, startDate),
            lte(invoices.createdAt, endDate)
          )
        );

      const timeData = await db
        .select({
          totalLaborCost: sql<string>`COALESCE(SUM(${timeEntries.payableAmount}::numeric), 0)`,
          totalHours: sql<string>`COALESCE(SUM(${timeEntries.totalHours}::numeric), 0)`,
        })
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.workspaceId, workspaceId),
            eq(timeEntries.clientId, client.id),
            gte(timeEntries.clockIn, startDate),
            lte(timeEntries.clockIn, endDate)
          )
        );

      const revenueStr = toFinancialString(invoiceData[0]?.totalRevenue || "0");
      const laborCostStr = toFinancialString(timeData[0]?.totalLaborCost || "0");
      const totalHours = parseFloat(timeData[0]?.totalHours || "0");
      const marginStr = subtractFinancialValues(revenueStr, laborCostStr);
      const revenueNum = parseFloat(revenueStr);
      const marginNum = parseFloat(marginStr);
      const marginPercent = revenueNum > 0 ? Math.round((marginNum / revenueNum) * 1000) / 10 : 0;

      rows.push({
        clientId: client.id,
        clientName: client.companyName || client.apContactName || "Unknown",
        revenue: revenueStr,
        laborCost: laborCostStr,
        totalHours: Math.round(totalHours * 100) / 100,
        margin: marginStr,
        marginPercent,
      });
    }

    rows.sort((a, b) => parseFloat(b.revenue) - parseFloat(a.revenue));

    const totalRevenueStr = sumFinancialValues(rows.map(r => r.revenue));
    const totalLaborCostStr = sumFinancialValues(rows.map(r => r.laborCost));
    const totalMarginStr = sumFinancialValues(rows.map(r => r.margin));
    const totalRevenueNum = parseFloat(totalRevenueStr);
    const totalMarginNum = parseFloat(totalMarginStr);

    res.json({
      rows,
      totals: {
        revenue: totalRevenueStr,
        laborCost: totalLaborCostStr,
        margin: totalMarginStr,
        marginPercent: totalRevenueNum > 0 ? Math.round((totalMarginNum / totalRevenueNum) * 1000) / 10 : 0,
      },
      period: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
    });
  } catch (error: unknown) {
    log.error("[QB Reports] Client profitability error:", error);
    res.status(500).json({ error: "Failed to generate client profitability report" });
  }
});

router.get("/payroll-summary", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const { startDate, endDate, error: dateError } = parseDateRange(req.query);
    if (dateError) return res.status(400).json({ error: dateError });

    const runs = await db
      .select()
      .from(payrollRuns)
      .where(
        and(
          eq(payrollRuns.workspaceId, workspaceId),
          gte(payrollRuns.periodStart, startDate),
          lte(payrollRuns.periodEnd, endDate)
        )
      )
      .orderBy(desc(payrollRuns.periodStart));

    const entries = await db
      .select({
        employeeId: payrollEntries.employeeId,
        totalGross: sql<string>`COALESCE(SUM(${payrollEntries.grossPay}::numeric), 0)`,
        totalNet: sql<string>`COALESCE(SUM(${payrollEntries.netPay}::numeric), 0)`,
        totalRegularHours: sql<string>`COALESCE(SUM(${payrollEntries.regularHours}::numeric), 0)`,
        totalOvertimeHours: sql<string>`COALESCE(SUM(${payrollEntries.overtimeHours}::numeric), 0)`,
      })
      .from(payrollEntries)
      .where(
        and(
          eq(payrollEntries.workspaceId, workspaceId),
          gte(payrollEntries.createdAt, startDate),
          lte(payrollEntries.createdAt, endDate)
        )
      )
      .groupBy(payrollEntries.employeeId)
      .orderBy(sql`SUM(${payrollEntries.grossPay}::numeric) DESC`)
      .limit(20);

    const topEarners = [];
    for (const entry of entries) {
      const emp = await db
        .select({ firstName: employees.firstName, lastName: employees.lastName })
        .from(employees)
        .where(eq(employees.id, entry.employeeId))
        .limit(1);

      topEarners.push({
        employeeId: entry.employeeId,
        name: emp[0] ? `${emp[0].firstName || ""} ${emp[0].lastName || ""}`.trim() : "Unknown",
        grossPay: parseFloat(entry.totalGross),
        netPay: parseFloat(entry.totalNet),
        regularHours: parseFloat(entry.totalRegularHours),
        overtimeHours: parseFloat(entry.totalOvertimeHours),
      });
    }

    const summary = {
      totalGrossPay: sumFinancialValues(runs.map(r => r.totalGrossPay || "0")),
      totalTaxes: sumFinancialValues(runs.map(r => r.totalTaxes || "0")),
      totalNetPay: sumFinancialValues(runs.map(r => r.totalNetPay || "0")),
      runCount: runs.length,
    };

    res.json({
      summary,
      runs: runs.map((r) => ({
        id: r.id,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        status: r.status,
        totalGrossPay: toFinancialString(r.totalGrossPay || "0"),
        totalTaxes: toFinancialString(r.totalTaxes || "0"),
        totalNetPay: toFinancialString(r.totalNetPay || "0"),
      })),
      topEarners,
      period: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
    });
  } catch (error: unknown) {
    log.error("[QB Reports] Payroll summary error:", error);
    res.status(500).json({ error: "Failed to generate payroll summary report" });
  }
});

router.get("/ar-aging", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const { startDate: startDateParam, endDate: endDateParam } = req.query;
    const conditions = [
      eq(invoices.workspaceId, workspaceId),
      sql`${invoices.status} NOT IN ('paid', 'void')`
    ];
    if (startDateParam) {
      const parsed = new Date(startDateParam as string);
      if (isNaN(parsed.getTime())) return res.status(400).json({ error: "Invalid startDate format" });
      conditions.push(gte(invoices.issueDate!, parsed));
    }
    if (endDateParam) {
      const parsed = new Date(endDateParam as string);
      if (isNaN(parsed.getTime())) return res.status(400).json({ error: "Invalid endDate format" });
      conditions.push(lte(invoices.issueDate!, parsed));
    }

    const allInvoices = await db
      .select()
      .from(invoices)
      .where(and(...conditions));

    const now = new Date();
    const buckets = {
      current: { label: "Current", invoices: [] as any[], total: 0 },
      "1-30": { label: "1-30 Days", invoices: [] as any[], total: 0 },
      "31-60": { label: "31-60 Days", invoices: [] as any[], total: 0 },
      "61-90": { label: "61-90 Days", invoices: [] as any[], total: 0 },
      "90+": { label: "90+ Days", invoices: [] as any[], total: 0 },
    };

    for (const inv of allInvoices) {
      const dueDate = inv.dueDate ? new Date(inv.dueDate) : new Date(inv.createdAt!);
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const amount = parseFloat(inv.total?.toString() || "0") - parseFloat(inv.amountPaid?.toString() || "0");

      const invoiceInfo = {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        clientId: inv.clientId,
        total: parseFloat(inv.total?.toString() || "0"),
        amountPaid: parseFloat(inv.amountPaid?.toString() || "0"),
        outstanding: amount,
        dueDate: dueDate.toISOString(),
        daysOverdue: Math.max(0, daysOverdue),
        status: inv.status,
      };

      if (daysOverdue <= 0) {
        buckets.current.invoices.push(invoiceInfo);
        buckets.current.total += amount;
      } else if (daysOverdue <= 30) {
        buckets["1-30"].invoices.push(invoiceInfo);
        buckets["1-30"].total += amount;
      } else if (daysOverdue <= 60) {
        buckets["31-60"].invoices.push(invoiceInfo);
        buckets["31-60"].total += amount;
      } else if (daysOverdue <= 90) {
        buckets["61-90"].invoices.push(invoiceInfo);
        buckets["61-90"].total += amount;
      } else {
        buckets["90+"].invoices.push(invoiceInfo);
        buckets["90+"].total += amount;
      }
    }

    const totalOutstanding = Object.values(buckets).reduce((s, b) => s + b.total, 0);

    res.json({
      buckets,
      totalOutstanding: Math.round(totalOutstanding * 100) / 100,
      invoiceCount: allInvoices.length,
    });
  } catch (error: unknown) {
    log.error("[QB Reports] AR aging error:", error);
    res.status(500).json({ error: "Failed to generate AR aging report" });
  }
});

router.get("/revenue-trend", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const { startDate, endDate, error: dateError } = parseDateRange(req.query);
    if (dateError) return res.status(400).json({ error: dateError });

    const monthlyRevenue = await db
      .select({
        month: sql<string>`TO_CHAR(${invoices.createdAt}, 'YYYY-MM')`,
        revenue: sql<string>`COALESCE(SUM(${invoices.total}::numeric), 0)`,
        invoiceCount: sql<number>`COUNT(*)`,
        paidAmount: sql<string>`COALESCE(SUM(CASE WHEN ${invoices.status} = 'paid' THEN ${invoices.total}::numeric ELSE 0 END), 0)`,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.workspaceId, workspaceId),
          gte(invoices.createdAt, startDate),
          lte(invoices.createdAt, endDate)
        )
      )
      .groupBy(sql`TO_CHAR(${invoices.createdAt}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${invoices.createdAt}, 'YYYY-MM')`);

    const months = monthlyRevenue.map((m) => ({
      month: m.month,
      revenue: parseFloat(m.revenue),
      invoiceCount: Number(m.invoiceCount),
      paidAmount: parseFloat(m.paidAmount),
    }));

    const totalRevenue = months.reduce((s, m) => s + m.revenue, 0);
    const avgMonthlyRevenue = months.length > 0 ? totalRevenue / months.length : 0;

    res.json({
      months,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      avgMonthlyRevenue: Math.round(avgMonthlyRevenue * 100) / 100,
      period: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
    });
  } catch (error: unknown) {
    log.error("[QB Reports] Revenue trend error:", error);
    res.status(500).json({ error: "Failed to generate revenue trend report" });
  }
});

router.get("/labor-cost", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const { startDate, endDate, error: dateError } = parseDateRange(req.query);
    if (dateError) return res.status(400).json({ error: dateError });

    const bySite = await db
      .select({
        siteId: timeEntries.siteId,
        totalHours: sql<string>`COALESCE(SUM(${timeEntries.totalHours}::numeric), 0)`,
        totalPayable: sql<string>`COALESCE(SUM(${timeEntries.payableAmount}::numeric), 0)`,
        totalBillable: sql<string>`COALESCE(SUM(${timeEntries.billableAmount}::numeric), 0)`,
        regularHours: sql<string>`COALESCE(SUM(${timeEntries.regularHours}::numeric), 0)`,
        overtimeHours: sql<string>`COALESCE(SUM(${timeEntries.overtimeHours}::numeric), 0)`,
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.clockIn, startDate),
          lte(timeEntries.clockIn, endDate)
        )
      )
      .groupBy(timeEntries.siteId);

    const siteRows = [];
    for (const row of bySite) {
      let siteName = "Unassigned";
      if (row.siteId) {
        const siteData = await db
          .select({ name: sites.name })
          .from(sites)
          .where(eq(sites.id, row.siteId))
          .limit(1);
        if (siteData[0]) siteName = siteData[0].name || "Unknown Site";
      }

      const totalHours = parseFloat(row.totalHours);
      const totalPayableStr = toFinancialString(row.totalPayable);
      const totalBillableStr = toFinancialString(row.totalBillable);
      const costPerHourStr = totalHours > 0 ? divideFinancialValues(totalPayableStr, toFinancialString(totalHours)) : '0';
      const spreadStr = subtractFinancialValues(totalBillableStr, totalPayableStr);

      siteRows.push({
        siteId: row.siteId,
        siteName,
        totalHours: Math.round(totalHours * 100) / 100,
        costPerHour: costPerHourStr,
        totalPayable: totalPayableStr,
        totalBillable: totalBillableStr,
        regularHours: Math.round(parseFloat(row.regularHours) * 100) / 100,
        overtimeHours: Math.round(parseFloat(row.overtimeHours) * 100) / 100,
        spread: spreadStr,
      });
    }

    const byEmployee = await db
      .select({
        employeeId: timeEntries.employeeId,
        regularHours: sql<string>`COALESCE(SUM(${timeEntries.regularHours}::numeric), 0)`,
        overtimeHours: sql<string>`COALESCE(SUM(${timeEntries.overtimeHours}::numeric), 0)`,
        totalHours: sql<string>`COALESCE(SUM(${timeEntries.totalHours}::numeric), 0)`,
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.clockIn, startDate),
          lte(timeEntries.clockIn, endDate)
        )
      )
      .groupBy(timeEntries.employeeId);

    const otByEmployee = [];
    for (const row of byEmployee) {
      const totalH = parseFloat(row.totalHours);
      const otH = parseFloat(row.overtimeHours);
      const otPercent = totalH > 0 ? (otH / totalH) * 100 : 0;

      const emp = await db
        .select({ firstName: employees.firstName, lastName: employees.lastName })
        .from(employees)
        .where(eq(employees.id, row.employeeId))
        .limit(1);

      otByEmployee.push({
        employeeId: row.employeeId,
        name: emp[0] ? `${emp[0].firstName || ""} ${emp[0].lastName || ""}`.trim() : "Unknown",
        regularHours: Math.round(parseFloat(row.regularHours) * 100) / 100,
        overtimeHours: Math.round(otH * 100) / 100,
        totalHours: Math.round(totalH * 100) / 100,
        otPercent: Math.round(otPercent * 10) / 10,
      });
    }

    otByEmployee.sort((a, b) => b.otPercent - a.otPercent);

    res.json({
      bySite: siteRows,
      overtimeByEmployee: otByEmployee,
      period: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
    });
  } catch (error: unknown) {
    log.error("[QB Reports] Labor cost error:", error);
    res.status(500).json({ error: "Failed to generate labor cost report" });
  }
});

router.get("/tax-liability", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const { startDate, endDate, error: dateError } = parseDateRange(req.query);
    if (dateError) return res.status(400).json({ error: dateError });

    const taxData = await db
      .select({
        quarter: sql<string>`'Q' || EXTRACT(QUARTER FROM ${payrollRuns.periodEnd})::text || ' ' || EXTRACT(YEAR FROM ${payrollRuns.periodEnd})::text`,
        totalFederalTax: sql<string>`COALESCE(SUM(${payrollEntries.federalTax}::numeric), 0)`,
        totalStateTax: sql<string>`COALESCE(SUM(${payrollEntries.stateTax}::numeric), 0)`,
        totalSocialSecurity: sql<string>`COALESCE(SUM(${payrollEntries.socialSecurity}::numeric), 0)`,
        totalMedicare: sql<string>`COALESCE(SUM(${payrollEntries.medicare}::numeric), 0)`,
        totalGross: sql<string>`COALESCE(SUM(${payrollEntries.grossPay}::numeric), 0)`,
      })
      .from(payrollEntries)
      .innerJoin(payrollRuns, eq(payrollEntries.payrollRunId, payrollRuns.id))
      .where(
        and(
          eq(payrollEntries.workspaceId, workspaceId),
          gte(payrollRuns.periodStart, startDate),
          lte(payrollRuns.periodEnd, endDate)
        )
      )
      .groupBy(
        sql`EXTRACT(QUARTER FROM ${payrollRuns.periodEnd})`,
        sql`EXTRACT(YEAR FROM ${payrollRuns.periodEnd})`
      )
      .orderBy(
        sql`EXTRACT(YEAR FROM ${payrollRuns.periodEnd})`,
        sql`EXTRACT(QUARTER FROM ${payrollRuns.periodEnd})`
      );

    const quarters = taxData.map((q) => {
      const federalStr = toFinancialString(q.totalFederalTax);
      const stateStr = toFinancialString(q.totalStateTax);
      const ssStr = toFinancialString(q.totalSocialSecurity);
      const medStr = toFinancialString(q.totalMedicare);
      const totalWithholdingsStr = sumFinancialValues([federalStr, stateStr, ssStr, medStr]);
      return {
        quarter: q.quarter,
        federalTax: federalStr,
        stateTax: stateStr,
        socialSecurity: ssStr,
        medicare: medStr,
        totalWithholdings: totalWithholdingsStr,
        grossPayroll: toFinancialString(q.totalGross),
      };
    });

    const grandTotal = {
      federalTax: sumFinancialValues(quarters.map(q => q.federalTax)),
      stateTax: sumFinancialValues(quarters.map(q => q.stateTax)),
      socialSecurity: sumFinancialValues(quarters.map(q => q.socialSecurity)),
      medicare: sumFinancialValues(quarters.map(q => q.medicare)),
      totalWithholdings: sumFinancialValues(quarters.map(q => q.totalWithholdings)),
      grossPayroll: sumFinancialValues(quarters.map(q => q.grossPayroll)),
    };

    res.json({
      quarters,
      grandTotal,
      period: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
    });
  } catch (error: unknown) {
    log.error("[QB Reports] Tax liability error:", error);
    res.status(500).json({ error: "Failed to generate tax liability report" });
  }
});

router.get("/cash-flow", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const { startDate, endDate, error: dateError } = parseDateRange(req.query);
    if (dateError) return res.status(400).json({ error: dateError });

    const moneyIn = await db
      .select({
        month: sql<string>`TO_CHAR(${invoices.paidAt}, 'YYYY-MM')`,
        amount: sql<string>`COALESCE(SUM(${invoices.amountPaid}::numeric), 0)`,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.workspaceId, workspaceId),
          eq(invoices.status, "paid"),
          gte(invoices.paidAt, startDate),
          lte(invoices.paidAt, endDate)
        )
      )
      .groupBy(sql`TO_CHAR(${invoices.paidAt}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${invoices.paidAt}, 'YYYY-MM')`);

    const moneyOut = await db
      .select({
        month: sql<string>`TO_CHAR(${payrollRuns.processedAt}, 'YYYY-MM')`,
        amount: sql<string>`COALESCE(SUM(${payrollRuns.totalNetPay}::numeric), 0)`,
      })
      .from(payrollRuns)
      .where(
        and(
          eq(payrollRuns.workspaceId, workspaceId),
          gte(payrollRuns.processedAt, startDate),
          lte(payrollRuns.processedAt, endDate)
        )
      )
      .groupBy(sql`TO_CHAR(${payrollRuns.processedAt}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${payrollRuns.processedAt}, 'YYYY-MM')`);

    let expenseOut: any[] = [];
    try {
      expenseOut = await db
        .select({
          month: sql<string>`TO_CHAR(${expenses.createdAt}, 'YYYY-MM')`,
          amount: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)`,
        })
        .from(expenses)
        .where(
          and(
            eq(expenses.workspaceId, workspaceId),
            gte(expenses.createdAt, startDate),
            lte(expenses.createdAt, endDate)
          )
        )
        .groupBy(sql`TO_CHAR(${expenses.createdAt}, 'YYYY-MM')`)
        .orderBy(sql`TO_CHAR(${expenses.createdAt}, 'YYYY-MM')`);
    } catch {
    }

    const allMonths = new Set<string>();
    moneyIn.forEach((r) => r.month && allMonths.add(r.month));
    moneyOut.forEach((r) => r.month && allMonths.add(r.month));
    expenseOut.forEach((r) => r.month && allMonths.add(r.month));

    const inMap = Object.fromEntries(moneyIn.map((r) => [r.month, parseFloat(r.amount)]));
    const outMap = Object.fromEntries(moneyOut.map((r) => [r.month, parseFloat(r.amount)]));
    const expMap = Object.fromEntries(expenseOut.map((r) => [r.month, parseFloat(r.amount)]));

    const sortedMonths = Array.from(allMonths).sort();
    const months = sortedMonths.map((month) => {
      const inAmt = inMap[month] || 0;
      const payrollAmt = outMap[month] || 0;
      const expenseAmt = expMap[month] || 0;
      const totalOut = payrollAmt + expenseAmt;
      return {
        month,
        moneyIn: Math.round(inAmt * 100) / 100,
        payrollOut: Math.round(payrollAmt * 100) / 100,
        expensesOut: Math.round(expenseAmt * 100) / 100,
        totalOut: Math.round(totalOut * 100) / 100,
        net: Math.round((inAmt - totalOut) * 100) / 100,
      };
    });

    const totals = months.reduce(
      (acc, m) => ({
        moneyIn: acc.moneyIn + m.moneyIn,
        totalOut: acc.totalOut + m.totalOut,
        net: acc.net + m.net,
      }),
      { moneyIn: 0, totalOut: 0, net: 0 }
    );

    res.json({
      months,
      totals,
      period: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
    });
  } catch (error: unknown) {
    log.error("[QB Reports] Cash flow error:", error);
    res.status(500).json({ error: "Failed to generate cash flow report" });
  }
});

router.get("/workers-comp", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const { startDate, endDate, error: dateError } = parseDateRange(req.query);
    if (dateError) return res.status(400).json({ error: dateError });

    // CATEGORY C — Raw SQL retained: GROUP BY + SUM aggregates + ::numeric casts + COALESCE | Tables: time_entries | Verified: 2026-03-23
    const wcResult = await typedQuery(sql`
      SELECT
        employee_id AS "employeeId",
        COALESCE(SUM(total_hours::numeric), 0) AS "totalHours",
        COALESCE(SUM(regular_hours::numeric), 0) AS "regularHours",
        COALESCE(SUM(overtime_hours::numeric), 0) AS "overtimeHours"
      FROM time_entries
      WHERE workspace_id = ${workspaceId}
        AND clock_in >= ${startDate}
        AND clock_in <= ${endDate}
      GROUP BY employee_id
    `);
    const hoursByEmployee = (wcResult as any).rows as Array<{ employeeId: string; totalHours: string; regularHours: string; overtimeHours: string }>;

    const rows = [];
    for (const row of hoursByEmployee) {
      const emp = await db
        .select({
          firstName: employees.firstName,
          lastName: employees.lastName,
          position: employees.position,
        })
        .from(employees)
        .where(eq(employees.id, row.employeeId))
        .limit(1);

      const classCode = emp[0]?.position || "General";

      rows.push({
        employeeId: row.employeeId,
        name: emp[0] ? `${emp[0].firstName || ""} ${emp[0].lastName || ""}`.trim() : "Unknown",
        classificationCode: classCode,
        employmentType: "full_time",
        totalHours: Math.round(parseFloat(row.totalHours) * 100) / 100,
        regularHours: Math.round(parseFloat(row.regularHours) * 100) / 100,
        overtimeHours: Math.round(parseFloat(row.overtimeHours) * 100) / 100,
      });
    }

    const byClassification: Record<string, { totalHours: number; employeeCount: number; regularHours: number; overtimeHours: number }> = {};
    for (const row of rows) {
      const code = row.classificationCode;
      if (!byClassification[code]) {
        byClassification[code] = { totalHours: 0, employeeCount: 0, regularHours: 0, overtimeHours: 0 };
      }
      byClassification[code].totalHours += row.totalHours;
      byClassification[code].employeeCount += 1;
      byClassification[code].regularHours += row.regularHours;
      byClassification[code].overtimeHours += row.overtimeHours;
    }

    const classifications = Object.entries(byClassification).map(([code, data]) => ({
      classificationCode: code,
      ...data,
      totalHours: Math.round(data.totalHours * 100) / 100,
      regularHours: Math.round(data.regularHours * 100) / 100,
      overtimeHours: Math.round(data.overtimeHours * 100) / 100,
    }));

    const totalHours = rows.reduce((s, r) => s + r.totalHours, 0);

    res.json({
      employees: rows,
      classifications,
      totalHours: Math.round(totalHours * 100) / 100,
      totalEmployees: rows.length,
      period: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
    });
  } catch (error: unknown) {
    log.error("[QB Reports] Workers comp error:", error);
    res.status(500).json({ error: "Failed to generate workers comp report" });
  }
});

router.get("/saved", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const reports = await db
      .select()
      .from(savedReports)
      .where(eq(savedReports.workspaceId, workspaceId))
      .orderBy(desc(savedReports.createdAt));

    res.json(reports);
  } catch (error: unknown) {
    log.error("[QB Reports] Fetch saved reports error:", error);
    res.status(500).json({ error: "Failed to fetch saved reports" });
  }
});

router.post("/saved", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const parsed = insertSavedReportSchema.safeParse({
      ...req.body,
      workspaceId,
      createdBy: req.user?.id,
    });

    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const [report] = await db.insert(savedReports).values(parsed.data).returning();
    res.status(201).json(report);
  } catch (error: unknown) {
    log.error("[QB Reports] Save report error:", error);
    res.status(500).json({ error: "Failed to save report" });
  }
});

router.patch("/saved/:id", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required to update saved reports" });
    }
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const { id } = req.params;
    const allowedFields = ['name', 'filters', 'schedule', 'scheduleRecipients', 'lastGeneratedAt'] as const;
    const safeUpdates: Record<string, unknown> = { updatedAt: new Date() };
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        safeUpdates[field] = req.body[field];
      }
    }

    const [updated] = await db
      .update(savedReports)
      .set(safeUpdates)
      .where(and(eq(savedReports.id, id), eq(savedReports.workspaceId, workspaceId)))
      .returning();

    if (!updated) return res.status(404).json({ error: "Saved report not found" });
    res.json(updated);
  } catch (error: unknown) {
    log.error("[QB Reports] Update saved report error:", error);
    res.status(500).json({ error: "Failed to update saved report" });
  }
});

router.delete("/saved/:id", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required to delete saved reports" });
    }
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const { id } = req.params;
    const [deleted] = await db
      .delete(savedReports)
      .where(and(eq(savedReports.id, id), eq(savedReports.workspaceId, workspaceId)))
      .returning();

    if (!deleted) return res.status(404).json({ error: "Saved report not found" });
    res.json({ success: true });
  } catch (error: unknown) {
    log.error("[QB Reports] Delete saved report error:", error);
    res.status(500).json({ error: "Failed to delete saved report" });
  }
});

export default router;
