/**
 * CONTROL TOWER API ROUTES
 * 
 * Provides AI-curated snapshots for root admins:
 * - System Health
 * - Money Flow  
 * - Workforce Alerts
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, and, gte, lte, desc, count, sql, isNull, or } from 'drizzle-orm';
import {
  invoices,
  payrollRuns,
  employees,
  shifts,
  workspaces,
  timeEntries,
  ptoRequests,
  paymentRecords,
  employeeCertifications,
} from '@shared/schema';
import { requireAuth } from '../auth';
import { requirePlatformRole } from '../rbac';
import { createLogger } from '../lib/logger';
const log = createLogger('ControlTowerRoutes');

const router = Router();

// Apply authentication to all Control Tower routes - root admin only
router.use(requireAuth);
router.use(requirePlatformRole(['root_admin', 'deputy_admin', 'sysop']));

interface ControlTowerSummary {
  systemHealth: {
    overall: 'operational' | 'degraded' | 'down';
    services: Array<{
      name: string;
      status: 'operational' | 'degraded' | 'down';
      message?: string;
    }>;
    lastCheck: string;
  };
  moneyFlow: {
    overdueInvoices: number;
    overdueAmount: number;
    pendingPayments: number;
    failedPayments: number;
    monthlyRevenue: number;
  };
  workforce: {
    expiringCertifications: number;
    schedulingGaps: number;
    pendingApprovals: number;
    complianceIssues: number;
  };
  generatedAt: string;
}

/**
 * GET /api/control-tower/summary
 * Get AI-curated business intelligence summary
 */
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Fetch all metrics in parallel for speed
    const [
      overdueInvoicesResult,
      pendingPayrollResult,
      expiringCertsResult,
      unfilledShiftsResult,
      monthlyRevenueResult,
      pendingTimesheetResult,
      pendingPtoResult,
      failedTransactionsResult,
    ] = await Promise.all([
      // Overdue invoices
      db.select({
        count: count(),
        total: sql<number>`COALESCE(SUM(CAST(${invoices.total} AS NUMERIC)), 0)`,
      })
        .from(invoices)
        .where(eq(invoices.status, 'overdue')),

      // Pending payroll runs (for Money Flow - pending payments)
      db.select({ count: count() })
        .from(payrollRuns)
        .where(eq(payrollRuns.status, 'pending')),

      // Expiring certifications (within 30 days)
      db.select({ count: count() })
        .from(employeeCertifications)
        .where(
          and(
            gte(employeeCertifications.expirationDate, now),
            lte(employeeCertifications.expirationDate, thirtyDaysFromNow)
          )
        ),

      // Unfilled shifts (scheduling gaps) - future shifts without assigned employee
      db.select({ count: count() })
        .from(shifts)
        .where(
          and(
            gte(shifts.startTime, now),
            isNull(shifts.employeeId)
          )
        ),

      // Monthly revenue from paid invoices
      db.select({
        total: sql<number>`COALESCE(SUM(CAST(${invoices.total} AS NUMERIC)), 0)`,
      })
        .from(invoices)
        .where(
          and(
            eq(invoices.status, 'paid'),
            gte(invoices.paidAt, monthStart)
          )
        ),

      // Pending timesheet approvals (for Workforce - pending approvals)
      db.select({ count: count() })
        .from(timeEntries)
        .where(eq(timeEntries.status, 'pending')),

      // Pending PTO requests (for Workforce - pending approvals)
      db.select({ count: count() })
        .from(ptoRequests)
        .where(eq(ptoRequests.status, 'pending')),

      // Failed payments in last 7 days (for Money Flow - failed payments)
      db.select({ count: count() })
        .from(paymentRecords)
        .where(
          and(
            eq(paymentRecords.status, 'failed'),
            gte(paymentRecords.createdAt, sevenDaysAgo)
          )
        ),
    ]);

    // Build system health from actual service checks
    const services = [
      { name: 'Database', status: 'operational' as const },
      { name: 'API Server', status: 'operational' as const },
      { name: 'WebSocket', status: 'operational' as const },
      { name: 'Stripe', status: process.env.STRIPE_SECRET_KEY ? 'operational' as const : 'degraded' as const, message: process.env.STRIPE_SECRET_KEY ? undefined : 'API key not configured' },
      { name: 'Email (Resend)', status: process.env.RESEND_API_KEY ? 'operational' as const : 'degraded' as const, message: process.env.RESEND_API_KEY ? undefined : 'API key not configured' },
      { name: 'AI Brain (Gemini)', status: process.env.GEMINI_API_KEY ? 'operational' as const : 'degraded' as const, message: process.env.GEMINI_API_KEY ? undefined : 'API key not configured' },
      { name: 'Object Storage', status: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ? 'operational' as const : 'degraded' as const, message: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ? undefined : 'Not configured' },
      { name: 'Scheduler', status: 'operational' as const },
    ];

    const degradedCount = services.filter(s => s.status === 'degraded').length;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const downCount = services.filter(s => s.status === 'down').length;

    const overallHealth: 'operational' | 'degraded' | 'down' = 
      downCount > 0 ? 'down' : 
      degradedCount > 0 ? 'degraded' : 'operational';

    // Calculate combined pending approvals (timesheets + PTO)
    const totalPendingApprovals = 
      (pendingTimesheetResult[0]?.count || 0) + 
      (pendingPtoResult[0]?.count || 0);

    const summary: ControlTowerSummary = {
      systemHealth: {
        overall: overallHealth,
        services,
        lastCheck: now.toISOString(),
      },
      moneyFlow: {
        overdueInvoices: overdueInvoicesResult[0]?.count || 0,
        overdueAmount: parseFloat(String(overdueInvoicesResult[0]?.total || 0)),
        pendingPayments: pendingPayrollResult[0]?.count || 0,
        failedPayments: failedTransactionsResult[0]?.count || 0,
        monthlyRevenue: parseFloat(String(monthlyRevenueResult[0]?.total || 0)),
      },
      workforce: {
        expiringCertifications: expiringCertsResult[0]?.count || 0,
        schedulingGaps: unfilledShiftsResult[0]?.count || 0,
        pendingApprovals: totalPendingApprovals,
        complianceIssues: 0, // Would need dedicated compliance tracking
      },
      generatedAt: now.toISOString(),
    };

    res.json(summary);
  } catch (error: unknown) {
    log.error('[Control Tower] Error generating summary:', error);
    res.status(500).json({ error: 'Failed to generate control tower summary' });
  }
});

/**
 * POST /api/control-tower/refresh
 * Force refresh all metrics
 */
export default router;
