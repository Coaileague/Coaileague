import { Router, Request, Response } from "express";
import { requireAuth } from '../auth';
import { hasPlatformWideAccess } from '../rbac';
import { db } from "../db";
import { storage } from "../storage";
import { dashboardLayouts } from "@shared/schema";
import { 
  invoices, timeEntries, shifts, employees, users 
} from "@shared/schema";
import { eq, and, gte, lte, count, sum, sql } from "drizzle-orm";
import { calculateGrossPay, formatCurrency } from '../services/financialCalculator';
import { createLogger } from '../lib/logger';
const log = createLogger('DashboardRoutes');


const router = Router();

// Root dashboard route - alias for /metrics
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const isPlatformAdmin = hasPlatformWideAccess(user?.platformRole);
    const workspaceId = (isPlatformAdmin && (req as any).query.workspaceId as string) || user?.currentWorkspaceId || (user as any)?.workspaceId || req.workspaceId;
    
    if (!workspaceId) {
      if (isPlatformAdmin) {
        return res.json({
          hoursThisWeek: 0,
          hoursTrend: 0,
          pendingInvoices: 0,
          invoiceTotal: 0,
          upcomingShifts: 0,
          shiftsToday: 0,
          activeEmployees: 0,
          totalHoursTracked: 0,
          message: 'No workspace context. Select a workspace or use ?workspaceId=<id> to view metrics.'
        });
      }
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // Return basic dashboard data
    res.json({
      success: true,
      workspaceId,
      message: "Dashboard root - use /metrics for detailed data"
    });
  } catch (error) {
    log.error('Dashboard root error:', error);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});


// Dashboard summary — canonical KPI endpoint (expected by semantic audit)
router.get("/summary", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const isPlatformAdmin = hasPlatformWideAccess(user?.platformRole);
    // SECURITY: query param workspaceId is only honoured for platform admins.
    // Non-admin users are always scoped to their session workspace to prevent
    // cross-tenant data leakage via query param injection.
    const workspaceId = (isPlatformAdmin && (req as any).query.workspaceId as string) || user?.currentWorkspaceId || (user as any)?.workspaceId || req.workspaceId;

    if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

    const now = new Date();
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0,0,0,0);

    const [activeOfficersRow] = await db.select({ count: count() }).from(employees)
      .where(and(eq(employees.workspaceId, workspaceId), sql`${employees.status} = 'active'`));

    const [openShiftsRow] = await db.select({ count: count() }).from(shifts)
      .where(and(eq(shifts.workspaceId, workspaceId), sql`${shifts.status} IN ('draft','published')`));

    const [pendingInvRow] = await db.select({ count: count(), total: sum(invoices.subtotal) })
      .from(invoices)
      .where(and(eq(invoices.workspaceId, workspaceId), sql`${invoices.status} IN ('draft','sent')`));

    const [revenueRow] = await db.select({ total: sum(invoices.subtotal) })
      .from(invoices)
      .where(and(eq(invoices.workspaceId, workspaceId), sql`${invoices.status} = 'paid'`, gte(invoices.issueDate, weekStart)));

    const complianceResp = await db.execute(sql`
      SELECT COUNT(*) FILTER (WHERE expiration_date < NOW()) AS expired,
             COUNT(*) FILTER (WHERE expiration_date BETWEEN NOW() AND NOW() + INTERVAL '30 days') AS expiring_soon,
             COUNT(*) AS total
      FROM employee_certifications
      WHERE workspace_id = ${workspaceId}
    `).catch(() => null);

    const expired = Number(complianceResp?.rows?.[0]?.expired || 0);
    const expiringSoon = Number(complianceResp?.rows?.[0]?.expiring_soon || 0);
    const totalLicenses = Number(complianceResp?.rows?.[0]?.total || 1);
    const complianceScore = Math.max(0, Math.round(100 - ((expired * 2 + expiringSoon) / totalLicenses) * 100));

    res.json({
      activeOfficers: Number(activeOfficersRow?.count || 0),
      openShifts: Number(openShiftsRow?.count || 0),
      pendingInvoices: Number(pendingInvRow?.count || 0),
      pendingInvoiceTotal: parseFloat(String(pendingInvRow?.total || '0')),
      complianceScore,
      weekRevenue: parseFloat(String(revenueRow?.total || '0')),
      todayRevenue: 0,
      workspaceId,
    });
  } catch (error) {
    log.error("[Dashboard] Summary error:", error);
    res.status(500).json({ error: "Failed to fetch dashboard summary" });
  }
});

// Get dashboard metrics
router.get("/metrics", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    
    // Platform admins can view any workspace via query param, or their own if set
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const isPlatformAdmin = hasPlatformWideAccess(user?.platformRole);
    const workspaceId = (isPlatformAdmin && (req as any).query.workspaceId as string) || user?.currentWorkspaceId || (user as any)?.workspaceId || req.workspaceId;
    
    if (!workspaceId) {
      // For platform admins without a workspace context, return aggregate or empty data
      if (isPlatformAdmin) {
        return res.json({
          hoursThisWeek: 0,
          hoursTrend: 0,
          pendingInvoices: 0,
          invoiceTotal: 0,
          upcomingShifts: 0,
          shiftsToday: 0,
          activeEmployees: 0,
          totalHoursTracked: 0,
          message: 'No workspace context. Select a workspace or use ?workspaceId=<id> to view metrics.'
        });
      }
      return res.status(401).json({ error: "Unauthorized" });
    }
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(weekStart);
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);

    const hoursThisWeekResult = await db
      .select({ totalHours: sql<string>`COALESCE(SUM(CAST(${timeEntries.totalHours} AS float)), 0)` })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.clockIn, weekStart)
        )
      );
    
    const hoursThisWeek = parseFloat(String(hoursThisWeekResult[0]?.totalHours || '0'));

    const hoursLastWeekResult = await db
      .select({ totalHours: sql<string>`COALESCE(SUM(CAST(${timeEntries.totalHours} AS float)), 0)` })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.clockIn, lastWeekStart),
          lte(timeEntries.clockIn, lastWeekEnd)
        )
      );
    
    const hoursLastWeek = parseFloat(String(hoursLastWeekResult[0]?.totalHours || '0'));
    const hoursTrend = hoursLastWeek > 0 
      ? Math.round(((hoursThisWeek - hoursLastWeek) / hoursLastWeek) * 100)
      : 0;

    // Get pending invoices
    const pendingInvoicesResult = await db
      .select({ 
        count: count(),
        total: sum(invoices.total)
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.workspaceId, workspaceId),
          eq(invoices.status, 'pending')
        )
      );

    const pendingInvoices = Number(pendingInvoicesResult[0]?.count || 0);
    const invoiceTotal = Number(pendingInvoicesResult[0]?.total || 0);

    // Get upcoming shifts (next 7 days)
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    
    const upcomingShiftsResult = await db
      .select({ count: count() })
      .from(shifts)
      .where(
        and(
          eq(shifts.workspaceId, workspaceId),
          gte(shifts.date, now.toISOString().split('T')[0]),
          lte(shifts.date, nextWeek.toISOString().split('T')[0])
        )
      );

    const upcomingShifts = Number(upcomingShiftsResult[0]?.count || 0);

    // Get shifts today
    const todayStr = now.toISOString().split('T')[0];
    const shiftsTodayResult = await db
      .select({ count: count() })
      .from(shifts)
      .where(
        and(
          eq(shifts.workspaceId, workspaceId),
          eq(shifts.date, todayStr)
        )
      );

    const shiftsToday = Number(shiftsTodayResult[0]?.count || 0);

    const activeEmployeesResult = await db
      .select({ count: count() })
      .from(employees)
      .where(
        and(
          eq(employees.workspaceId, workspaceId),
          sql`${employees.status} = 'active'`
        )
      );

    const activeEmployees = Number(activeEmployeesResult[0]?.count || 0);

    const totalHoursResult = await db
      .select({ totalHours: sql<string>`COALESCE(SUM(CAST(${timeEntries.totalHours} AS float)), 0)` })
      .from(timeEntries)
      .where(eq(timeEntries.workspaceId, workspaceId));

    const totalHoursTracked = Math.round(parseFloat(String(totalHoursResult[0]?.totalHours || '0')));

    res.json({
      totalHoursTracked,
      hoursThisWeek: Math.round(hoursThisWeek * 10) / 10,
      hoursTrend,
      pendingInvoices,
      invoiceTotal: parseFloat(formatCurrency(String(invoiceTotal))),
      invoiceTrend: 0, // Would need historical data
      upcomingShifts,
      shiftsToday,
      activeEmployees,
      employeeTrend: 0, // Would need historical data
    });
  } catch (error) {
    log.error("[Dashboard] Error fetching metrics:", error);
    res.status(500).json({ error: "Failed to fetch dashboard metrics" });
  }
});

const DEFAULT_WIDGETS = [
  { id: 'hours-tracked',    enabled: true, order: 1 },
  { id: 'pending-invoices', enabled: true, order: 2 },
  { id: 'upcoming-shifts',  enabled: true, order: 3 },
  { id: 'active-team',      enabled: true, order: 4 },
  { id: 'ai-suggestions',   enabled: true, order: 5 },
  { id: 'engagement-stats', enabled: true, order: 6 },
  { id: 'leaderboard',      enabled: true, order: 7 },
  { id: 'quick-actions',    enabled: true, order: 8 },
];

// Get widget layout (DB-backed, falls back to defaults when no saved layout exists)
router.get("/layout", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

    const workspaceId = user.currentWorkspaceId || (user as any).workspaceId || req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "No workspace context" });

    const [saved] = await db
      .select()
      .from(dashboardLayouts)
      .where(and(eq(dashboardLayouts.workspaceId, workspaceId), eq(dashboardLayouts.userId, user.id)))
      .limit(1);

    const widgets = saved
      ? (saved.layoutConfig as any[])
      : DEFAULT_WIDGETS;

    res.json({ widgets });
  } catch (error) {
    log.error("[Dashboard] Error fetching layout:", error);
    res.status(500).json({ error: "Failed to fetch dashboard layout" });
  }
});

// Save widget layout — upserts per (workspaceId, userId)
router.post("/layout", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

    const workspaceId = user.currentWorkspaceId || (user as any).workspaceId || req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "No workspace context" });

    const { widgets } = req.body;
    if (!Array.isArray(widgets)) return res.status(400).json({ error: "widgets must be an array" });

    await db
      .insert(dashboardLayouts)
      .values({ workspaceId, userId: user.id, layoutConfig: widgets, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [dashboardLayouts.workspaceId, dashboardLayouts.userId],
        set: { layoutConfig: widgets, updatedAt: new Date() },
      });

    res.json({ success: true, message: "Layout saved" });
  } catch (error) {
    log.error("[Dashboard] Error saving layout:", error);
    res.status(500).json({ error: "Failed to save dashboard layout" });
  }
});

// Worker earnings summary for employee dashboard widget
router.get("/worker-earnings", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    // currentWorkspaceId is the canonical field on the DB user object (set by real login);
    // workspaceId is set on the x-test-key dev bypass user object.
    // req.workspaceId is set by ensureWorkspaceAccess when mounted at /api/dashboard.
    const workspaceId = user?.currentWorkspaceId || (user as any)?.workspaceId || req.workspaceId;
    const userId = user?.id;

    if (!userId || !workspaceId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const employee = await storage.getEmployeeByUserId(userId, workspaceId);
    if (!employee) {
      return res.json({
        payPeriodStart: null,
        payPeriodEnd: null,
        hoursWorked: 0,
        scheduledHours: 0,
        hourlyRate: 0,
        earnings: 0,
        projectedEarnings: 0,
      });
    }

    // Biweekly pay period anchored to 2024-01-01 (Monday)
    const anchor = new Date('2024-01-01T00:00:00Z');
    const now = new Date();
    const msSinceAnchor = now.getTime() - anchor.getTime();
    const periodIndex = Math.floor(msSinceAnchor / (14 * 86400000));
    const payPeriodStart = new Date(anchor.getTime() + periodIndex * 14 * 86400000);
    const payPeriodEnd = new Date(payPeriodStart.getTime() + 14 * 86400000);

    // Use ISO string sliced to 'YYYY-MM-DD HH:MM:SS' — avoids Drizzle Date→timestamp
    // serialization quirks when comparing against a timestamp-without-timezone column.
    const periodStartStr = payPeriodStart.toISOString().slice(0, 19).replace('T', ' ');
    const periodEndStr = payPeriodEnd.toISOString().slice(0, 19).replace('T', ' ');

    log.info(`[WorkerEarnings] userId=${userId} empId=${employee.id} period=${periodStartStr}→${periodEndStr} rate=${employee.hourlyRate}`);

    // Sum hours worked from time entries using totalHours field
    const hoursResult = await db
      .select({ total: sql<string>`COALESCE(SUM(CAST(${timeEntries.totalHours} AS float)), 0)` })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.employeeId, employee.id),
          eq(timeEntries.workspaceId, workspaceId),
          sql`${timeEntries.clockIn} >= ${periodStartStr}::timestamp`,
          sql`${timeEntries.clockIn} <= ${periodEndStr}::timestamp`
        )
      );

    const hoursWorked = Math.round(parseFloat(String(hoursResult[0]?.total || '0')) * 100) / 100;

    // Sum scheduled hours from shifts
    const shiftsResult = await db
      .select({
        totalMins: sql<string>`
          COALESCE(SUM(
            EXTRACT(EPOCH FROM (${shifts.endTime} - ${shifts.startTime})) / 60
          ), 0)
        `
      })
      .from(shifts)
      .where(
        and(
          eq(shifts.employeeId, employee.id),
          eq(shifts.workspaceId, workspaceId),
          gte(shifts.startTime, payPeriodStart),
          lte(shifts.startTime, payPeriodEnd)
        )
      );

    const scheduledMinutes = parseFloat(String(shiftsResult[0]?.totalMins || '0'));
    const scheduledHours = Math.round((scheduledMinutes / 60) * 100) / 100;

    const hourlyRateStr = String(employee.hourlyRate || '0');
    const hourlyRate = parseFloat(hourlyRateStr);
    // Use FinancialCalculator — no native arithmetic on financial values
    const earnings = parseFloat(formatCurrency(calculateGrossPay(String(hoursWorked), hourlyRateStr, 'hourly')));
    const projectedEarnings = parseFloat(formatCurrency(calculateGrossPay(String(scheduledHours), hourlyRateStr, 'hourly')));

    res.json({
      payPeriodStart: payPeriodStart.toISOString(),
      payPeriodEnd: payPeriodEnd.toISOString(),
      hoursWorked,
      scheduledHours,
      hourlyRate,
      earnings,
      projectedEarnings,
    });
  } catch (error) {
    log.error("[Dashboard] Error fetching worker earnings:", error);
    res.status(500).json({ error: "Failed to fetch earnings data" });
  }
});

export default router;
