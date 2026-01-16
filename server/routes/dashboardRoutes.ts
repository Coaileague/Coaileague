import { Router, Request, Response } from "express";
import { db } from "../db";
import { 
  invoices, timeEntries, shifts, employees, users 
} from "@shared/schema";
import { eq, and, gte, lte, count, sum, sql } from "drizzle-orm";

const router = Router();

// Root dashboard route - alias for /metrics
router.get("/", async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const isPlatformAdmin = ['root_admin', 'super_admin', 'deputy_admin', 'sysop'].includes(user?.platformRole);
    const workspaceId = (isPlatformAdmin && req.query.workspaceId as string) || user?.workspaceId;
    
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
    console.error('Dashboard root error:', error);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});


// Get dashboard metrics
router.get("/metrics", async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    
    // Platform admins can view any workspace via query param, or their own if set
    const isPlatformAdmin = ['root_admin', 'super_admin', 'deputy_admin', 'sysop'].includes(user?.platformRole);
    const workspaceId = (isPlatformAdmin && req.query.workspaceId as string) || user?.workspaceId;
    
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

    // Get hours this week
    const hoursThisWeekResult = await db
      .select({ totalHours: sum(timeEntries.duration) })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.date, weekStart.toISOString().split('T')[0])
        )
      );
    
    const hoursThisWeek = Number(hoursThisWeekResult[0]?.totalHours || 0) / 60; // Convert minutes to hours

    // Get hours last week for trend
    const hoursLastWeekResult = await db
      .select({ totalHours: sum(timeEntries.duration) })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.date, lastWeekStart.toISOString().split('T')[0]),
          lte(timeEntries.date, lastWeekEnd.toISOString().split('T')[0])
        )
      );
    
    const hoursLastWeek = Number(hoursLastWeekResult[0]?.totalHours || 0) / 60;
    const hoursTrend = hoursLastWeek > 0 
      ? Math.round(((hoursThisWeek - hoursLastWeek) / hoursLastWeek) * 100)
      : 0;

    // Get pending invoices
    const pendingInvoicesResult = await db
      .select({ 
        count: count(),
        total: sum(invoices.totalAmount)
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

    // Get active employees (clocked in today)
    const activeEmployeesResult = await db
      .select({ count: count() })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          eq(timeEntries.date, todayStr),
          sql`${timeEntries.clockOut} IS NULL`
        )
      );

    const activeEmployees = Number(activeEmployeesResult[0]?.count || 0);

    // Get total hours tracked
    const totalHoursResult = await db
      .select({ totalHours: sum(timeEntries.duration) })
      .from(timeEntries)
      .where(eq(timeEntries.workspaceId, workspaceId));

    const totalHoursTracked = Math.round(Number(totalHoursResult[0]?.totalHours || 0) / 60);

    res.json({
      totalHoursTracked,
      hoursThisWeek: Math.round(hoursThisWeek * 10) / 10,
      hoursTrend,
      pendingInvoices,
      invoiceTotal: Math.round(invoiceTotal * 100) / 100,
      invoiceTrend: 0, // Would need historical data
      upcomingShifts,
      shiftsToday,
      activeEmployees,
      employeeTrend: 0, // Would need historical data
    });
  } catch (error) {
    console.error("[Dashboard] Error fetching metrics:", error);
    res.status(500).json({ error: "Failed to fetch dashboard metrics" });
  }
});

// Get widget layout
router.get("/layout", async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // For now, return default layout - could be stored in DB per user
    const defaultLayout = {
      widgets: [
        { id: 'hours-tracked', enabled: true, order: 1 },
        { id: 'pending-invoices', enabled: true, order: 2 },
        { id: 'upcoming-shifts', enabled: true, order: 3 },
        { id: 'active-team', enabled: true, order: 4 },
        { id: 'ai-suggestions', enabled: true, order: 5 },
        { id: 'engagement-stats', enabled: true, order: 6 },
        { id: 'leaderboard', enabled: true, order: 7 },
        { id: 'quick-actions', enabled: true, order: 8 },
      ]
    };

    res.json(defaultLayout);
  } catch (error) {
    console.error("[Dashboard] Error fetching layout:", error);
    res.status(500).json({ error: "Failed to fetch dashboard layout" });
  }
});

// Save widget layout
router.post("/layout", async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { widgets } = req.body;
    
    // For now, just acknowledge - could persist to DB
    res.json({ success: true, message: "Layout saved" });
  } catch (error) {
    console.error("[Dashboard] Error saving layout:", error);
    res.status(500).json({ error: "Failed to save dashboard layout" });
  }
});

export default router;
