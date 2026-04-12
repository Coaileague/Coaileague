/**
 * Revenue Recognition & ASC 606 Routes
 * ======================================
 * Endpoints:
 *   GET  /api/finance/recognition/summary        — Recognized/deferred/pending amounts
 *   GET  /api/finance/recognition/schedules      — List all schedules (workspace-scoped)
 *   POST /api/finance/recognition/schedules      — Manually create a recognition schedule
 *   POST /api/finance/recognition/run            — Manually trigger monthly recognition job
 *   GET  /api/finance/asc-606/report             — Full ASC 606 compliance report
 *   GET  /api/finance/forecast                   — 3-month revenue forecast
 *   GET  /api/finance/pl/detail                  — Line-by-line P&L detail
 *   GET  /api/finance/pl/history                 — 12-month P&L history
 *   POST /api/finance/contracts/:id/map-revenue  — Map a contract to revenue recognition
 *
 * Access: Manager+ only.
 * Per CLAUDE.md §G: All queries workspace-scoped.
 */

import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db';
import {
  revenueRecognitionSchedule,
  deferredRevenue,
  processedRevenueEvents,
  contractRevenueMapping,
  invoices,
  expenses,
  auditLogs,
} from '@shared/schema';
import { eq, and, gte, lte, desc, sql, inArray } from 'drizzle-orm';
import { requireAuth } from '../../auth';
import { hasManagerAccess, resolveWorkspaceForUser, getUserPlatformRole, hasPlatformWideAccess } from '../../rbac';
import { revenueRecognitionService, generateMonthlySchedule } from '../../services/billing/revenueRecognitionService';
import { asc606Tracker } from '../../services/financial/asc606Tracker';
import { revenueForecasting } from '../../services/financial/revenueForecasting';
import { contractRevenueMapper } from '../../services/financial/contractRevenueMapper';
import { registerLegacyBootstrap } from '../../services/legacyBootstrapRegistry';
import { createLogger } from '../../lib/logger';
import type { AuthenticatedRequest } from '../../rbac';

const log = createLogger('RevenueRecognitionRoutes');

// Bootstrap the 4 new revenue recognition tables at first import
registerLegacyBootstrap('revenue_recognition_tables', async (pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS revenue_recognition_schedule (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id VARCHAR NOT NULL,
      invoice_id VARCHAR NOT NULL,
      client_id VARCHAR NOT NULL,
      contract_id VARCHAR,
      total_amount NUMERIC(12,2) NOT NULL,
      recognized_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
      remaining_amount NUMERIC(12,2) NOT NULL,
      recognition_method VARCHAR(20) NOT NULL DEFAULT 'cash',
      scheduled_dates JSONB NOT NULL DEFAULT '[]',
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      recognized_at TIMESTAMPTZ,
      last_processed_at TIMESTAMPTZ,
      audit_log JSONB NOT NULL DEFAULT '[]',
      period_start DATE,
      period_end DATE,
      created_by VARCHAR,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS deferred_revenue (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id VARCHAR NOT NULL,
      invoice_id VARCHAR NOT NULL,
      schedule_id VARCHAR,
      amount NUMERIC(12,2) NOT NULL,
      deferral_reason VARCHAR(200),
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      recognized_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
      status VARCHAR(20) NOT NULL DEFAULT 'deferred',
      recognized_at TIMESTAMPTZ,
      created_by VARCHAR,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS processed_revenue_events (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      idempotency_key VARCHAR UNIQUE NOT NULL,
      workspace_id VARCHAR NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      schedules_processed INTEGER DEFAULT 0,
      amount_recognized NUMERIC(14,2) DEFAULT 0.00,
      processed_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contract_revenue_mapping (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id VARCHAR NOT NULL,
      contract_id VARCHAR NOT NULL,
      invoice_id VARCHAR,
      schedule_id VARCHAR,
      contract_value NUMERIC(12,2),
      monthly_value NUMERIC(12,2),
      recognition_start_date DATE,
      recognition_end_date DATE,
      term_months INTEGER,
      recognition_method VARCHAR(20) DEFAULT 'accrual',
      status VARCHAR(20) DEFAULT 'active',
      recognized_to_date NUMERIC(12,2) DEFAULT 0.00,
      created_by VARCHAR,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  // Add recognition_method column to invoices if missing (idempotent)
  await pool.query(`
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recognition_method VARCHAR(20) DEFAULT 'cash'
  `);
});

const router = Router();

// Auth middleware applied by billing domain mount — but double-check workspace
async function resolveWorkspace(req: AuthenticatedRequest): Promise<{ ok: boolean; workspaceId?: string; status?: number; error?: string }> {
  // @ts-expect-error — TS migration: fix in refactoring sprint
  const userId = req.user?.id || (req.user)?.claims?.sub;
  if (!userId) return { ok: false, status: 401, error: 'Unauthorized' };

  if (req.workspaceId) return { ok: true, workspaceId: req.workspaceId };

  const platformRole = await getUserPlatformRole(userId);
  if (hasPlatformWideAccess(platformRole)) {
    const wsId = req.query?.workspaceId as string ?? req.body?.workspaceId as string;
    if (!wsId) return { ok: false, status: 400, error: 'workspaceId required for platform admin' };
    return { ok: true, workspaceId: wsId };
  }

  const resolved = await resolveWorkspaceForUser(userId, req.query?.workspaceId as string | undefined);
  if (!resolved.workspaceId || !resolved.role) {
    return { ok: false, status: 403, error: resolved.error || 'Workspace not found' };
  }
  if (!hasManagerAccess(resolved.role)) {
    return { ok: false, status: 403, error: 'Requires manager access or higher' };
  }
  return { ok: true, workspaceId: resolved.workspaceId };
}

// ============================================================================
// GET /api/finance/recognition/summary
// ============================================================================
router.get('/recognition/summary', async (req: any, res: any) => {
  try {
    const ctx = await resolveWorkspace(req);
    if (!ctx.ok) return res.status(ctx.status!).json({ error: ctx.error });
    const workspaceId = ctx.workspaceId!;

    const summary = await revenueRecognitionService.getRevenueRecognitionSummary(workspaceId);
    return res.json({ success: true, data: summary });
  } catch (err: any) {
    log.error('[RevenueRoutes] summary error', { error: err?.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// GET /api/finance/recognition/schedules
// ============================================================================
router.get('/recognition/schedules', async (req: any, res: any) => {
  try {
    const ctx = await resolveWorkspace(req);
    if (!ctx.ok) return res.status(ctx.status!).json({ error: ctx.error });
    const workspaceId = ctx.workspaceId!;

    const { status, method, limit = '50', offset = '0' } = req.query as Record<string, string>;
    const conditions = [eq(revenueRecognitionSchedule.workspaceId, workspaceId)];
    if (status) conditions.push(eq(revenueRecognitionSchedule.status, status));
    if (method) conditions.push(eq(revenueRecognitionSchedule.recognitionMethod, method));

    const schedules = await db
      .select()
      .from(revenueRecognitionSchedule)
      .where(and(...conditions))
      .orderBy(desc(revenueRecognitionSchedule.createdAt))
      .limit(Math.min(parseInt(limit) || 50, 200))
      .offset(parseInt(offset) || 0);

    return res.json({ success: true, data: schedules });
  } catch (err: any) {
    log.error('[RevenueRoutes] schedules list error', { error: err?.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// POST /api/finance/recognition/schedules — Manual schedule creation
// ============================================================================
const createScheduleBodySchema = z.object({
  invoiceId: z.string().uuid(),
  clientId: z.string(),
  totalAmount: z.number().positive(),
  recognitionMethod: z.enum(['accrual', 'cash']).default('cash'),
  periodMonths: z.number().int().min(1).max(120).optional().default(1),
  startDate: z.string().optional(),
});

router.post('/recognition/schedules', async (req: any, res: any) => {
  try {
    const ctx = await resolveWorkspace(req);
    if (!ctx.ok) return res.status(ctx.status!).json({ error: ctx.error });
    const workspaceId = ctx.workspaceId!;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userId = req.user?.id || (req.user)?.claims?.sub;

    const body = createScheduleBodySchema.parse(req.body);

    let scheduleId: string | null = null;
    await db.transaction(async (tx) => {
      scheduleId = await revenueRecognitionService.createScheduleForInvoice(tx, {
        workspaceId,
        invoiceId: body.invoiceId,
        clientId: body.clientId,
        totalAmount: body.totalAmount,
        recognitionMethod: body.recognitionMethod,
        periodMonths: body.periodMonths,
        startDate: body.startDate ? new Date(body.startDate) : new Date(),
        createdBy: userId,
      });
    });

    // Audit
    try {
      await db.insert(auditLogs).values({
        workspaceId,
        userId,
        action: 'revenue_schedule_created',
        entityType: 'revenue_recognition_schedule',
        entityId: scheduleId ?? body.invoiceId,
        actionDescription: `Manual recognition schedule: $${body.totalAmount} (${body.recognitionMethod})`,
        changes: { invoiceId: body.invoiceId, totalAmount: body.totalAmount, method: body.recognitionMethod },
        isSensitiveData: true,
        source: 'general',
      });
    } catch (_) {}

    return res.status(201).json({ success: true, data: { scheduleId } });
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.errors });
    log.error('[RevenueRoutes] create schedule error', { error: err?.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// POST /api/finance/recognition/run — Manually trigger monthly recognition job
// ============================================================================
router.post('/recognition/run', async (req: any, res: any) => {
  try {
    const ctx = await resolveWorkspace(req);
    if (!ctx.ok) return res.status(ctx.status!).json({ error: ctx.error });
    const workspaceId = ctx.workspaceId!;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userId = req.user?.id || (req.user)?.claims?.sub;

    const now = new Date();
    const year = req.body?.year ?? now.getFullYear();
    const month = req.body?.month ?? now.getMonth() + 1;

    if (typeof year !== 'number' || typeof month !== 'number' || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Invalid year/month' });
    }

    const result = await revenueRecognitionService.runMonthlyRecognitionForWorkspace(
      workspaceId,
      year,
      month,
    );

    // Audit
    try {
      await db.insert(auditLogs).values({
        workspaceId,
        userId,
        action: 'revenue_recognition_run',
        entityType: 'workspace',
        entityId: workspaceId,
        actionDescription: `Manual recognition run for ${year}-${String(month).padStart(2, '0')}: ${result.schedulesProcessed} schedules, $${result.amountRecognized.toFixed(2)}`,
        changes: result,
        isSensitiveData: true,
        source: 'general',
      });
    } catch (_) {}

    return res.json({ success: true, data: result });
  } catch (err: any) {
    log.error('[RevenueRoutes] run error', { error: err?.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// GET /api/finance/asc-606/report
// ============================================================================
router.get('/asc-606/report', async (req: any, res: any) => {
  try {
    const ctx = await resolveWorkspace(req);
    if (!ctx.ok) return res.status(ctx.status!).json({ error: ctx.error });
    const workspaceId = ctx.workspaceId!;

    const report = await asc606Tracker.generateAsc606Report(workspaceId);
    return res.json({ success: true, data: report });
  } catch (err: any) {
    log.error('[RevenueRoutes] asc-606 report error', { error: err?.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// GET /api/finance/forecast
// ============================================================================
router.get('/forecast', async (req: any, res: any) => {
  try {
    const ctx = await resolveWorkspace(req);
    if (!ctx.ok) return res.status(ctx.status!).json({ error: ctx.error });
    const workspaceId = ctx.workspaceId!;

    const months = Math.min(parseInt(req.query?.months as string) || 3, 12);
    const forecast = await revenueForecasting.generateRevenueForecast(workspaceId, months);
    return res.json({ success: true, data: forecast });
  } catch (err: any) {
    log.error('[RevenueRoutes] forecast error', { error: err?.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// GET /api/finance/pl/detail — Line-by-line P&L breakdown
// ============================================================================
router.get('/pl/detail', async (req: any, res: any) => {
  try {
    const ctx = await resolveWorkspace(req);
    if (!ctx.ok) return res.status(ctx.status!).json({ error: ctx.error });
    const workspaceId = ctx.workspaceId!;

    const now = new Date();
    const startParam = req.query?.start as string;
    const endParam = req.query?.end as string;
    const start = startParam ? new Date(startParam) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endParam ? new Date(endParam) : now;

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date parameters' });
    }

    // Revenue line items from invoices (workspace-scoped)
    const invoiceRows = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        clientId: invoices.clientId,
        total: invoices.total,
        status: invoices.status,
        issueDate: invoices.issueDate,
        paidAt: invoices.paidAt,
        recognitionMethod: invoices.recognitionMethod,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.workspaceId, workspaceId),
          gte(invoices.issueDate, start),
          lte(invoices.issueDate, end),
        ),
      )
      .orderBy(desc(invoices.issueDate));

    // Recognition schedules for the period
    const recognitionRows = await db
      .select()
      .from(revenueRecognitionSchedule)
      .where(
        and(
          eq(revenueRecognitionSchedule.workspaceId, workspaceId),
          gte(revenueRecognitionSchedule.createdAt, start),
          lte(revenueRecognitionSchedule.createdAt, end),
        ),
      )
      .orderBy(desc(revenueRecognitionSchedule.createdAt));

    // Expense line items (workspace-scoped)
    const expenseRows = await db
      .select({
        id: expenses.id,
        description: expenses.description,
        amount: expenses.amount,
        categoryId: expenses.categoryId,
        expenseDate: expenses.expenseDate,
        status: expenses.status,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.workspaceId, workspaceId),
          gte(expenses.expenseDate, start),
          lte(expenses.expenseDate, end),
        ),
      )
      .orderBy(desc(expenses.expenseDate));

    const totalRevenue = invoiceRows.reduce((s, i) => s + parseFloat(String(i.total ?? 0)), 0);
    const totalRecognized = recognitionRows.reduce(
      (s, r) => s + parseFloat(String(r.recognizedAmount ?? 0)),
      0,
    );
    const totalDeferred = recognitionRows
      .filter((r) => ['pending', 'in_progress'].includes(r.status ?? ''))
      .reduce((s, r) => s + parseFloat(String(r.remainingAmount ?? 0)), 0);
    const totalExpenses = expenseRows.reduce((s, e) => s + parseFloat(String(e.amount ?? 0)), 0);
    const netProfit = totalRevenue - totalExpenses;

    return res.json({
      success: true,
      data: {
        period: { start: start.toISOString(), end: end.toISOString() },
        summary: {
          totalRevenue,
          totalRecognized,
          totalDeferred,
          totalExpenses,
          netProfit,
          grossMarginPercent: totalRevenue > 0 ? parseFloat(((netProfit / totalRevenue) * 100).toFixed(1)) : 0,
        },
        lineItems: {
          invoices: invoiceRows.map((i) => ({
            id: i.id,
            invoiceNumber: i.invoiceNumber,
            clientId: i.clientId,
            amount: parseFloat(String(i.total ?? 0)),
            status: i.status,
            issueDate: i.issueDate,
            paidAt: i.paidAt,
            recognitionMethod: i.recognitionMethod ?? 'cash',
            category: 'revenue',
          })),
          recognitionSchedules: recognitionRows.map((r) => ({
            id: r.id,
            invoiceId: r.invoiceId,
            recognizedAmount: parseFloat(String(r.recognizedAmount ?? 0)),
            remainingAmount: parseFloat(String(r.remainingAmount ?? 0)),
            status: r.status,
            method: r.recognitionMethod,
            category: 'recognized_revenue',
          })),
          expenses: expenseRows.map((e) => ({
            id: e.id,
            description: e.description,
            amount: parseFloat(String(e.amount ?? 0)),
            category: e.categoryId ?? e.category ?? 'operating',
            date: e.expenseDate ?? e.date,
            status: e.status,
          })),
        },
      },
    });
  } catch (err: any) {
    log.error('[RevenueRoutes] pl/detail error', { error: err?.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// GET /api/finance/pl/history — 12-month P&L history
// ============================================================================
router.get('/pl/history', async (req: any, res: any) => {
  try {
    const ctx = await resolveWorkspace(req);
    if (!ctx.ok) return res.status(ctx.status!).json({ error: ctx.error });
    const workspaceId = ctx.workspaceId!;

    const periodsParam = Math.min(parseInt(req.query?.periods as string) || 12, 24);
    const now = new Date();
    const history: Array<{
      month: string;
      revenue: number;
      expenses: number;
      netProfit: number;
      marginPercent: number;
      recognized: number;
      deferred: number;
    }> = [];

    for (let i = periodsParam - 1; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const monthKey = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`;

      const [invResult] = await db
        .select({
          total: sql<string>`coalesce(sum(${invoices.total}::numeric), 0)`,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.workspaceId, workspaceId),
            gte(invoices.issueDate, monthStart),
            lte(invoices.issueDate, monthEnd),
          ),
        );

      const [expResult] = await db
        .select({
          total: sql<string>`coalesce(sum(${expenses.amount}::numeric), 0)`,
        })
        .from(expenses)
        .where(
          and(
            eq(expenses.workspaceId, workspaceId),
            gte(expenses.expenseDate, monthStart),
            lte(expenses.expenseDate, monthEnd),
          ),
        );

      const [recogResult] = await db
        .select({
          recognized: sql<string>`coalesce(sum(${revenueRecognitionSchedule.recognizedAmount}::numeric), 0)`,
          deferred: sql<string>`coalesce(sum(${revenueRecognitionSchedule.remainingAmount}::numeric), 0)`,
        })
        .from(revenueRecognitionSchedule)
        .where(
          and(
            eq(revenueRecognitionSchedule.workspaceId, workspaceId),
            gte(revenueRecognitionSchedule.createdAt, monthStart),
            lte(revenueRecognitionSchedule.createdAt, monthEnd),
          ),
        );

      const revenue = parseFloat(String(invResult?.total ?? 0));
      const expTotal = parseFloat(String(expResult?.total ?? 0));
      const netProfit = revenue - expTotal;
      const marginPercent = revenue > 0 ? parseFloat(((netProfit / revenue) * 100).toFixed(1)) : 0;

      history.push({
        month: monthKey,
        revenue,
        expenses: expTotal,
        netProfit,
        marginPercent,
        recognized: parseFloat(String(recogResult?.recognized ?? 0)),
        deferred: parseFloat(String(recogResult?.deferred ?? 0)),
      });
    }

    return res.json({ success: true, data: { periods: periodsParam, history } });
  } catch (err: any) {
    log.error('[RevenueRoutes] pl/history error', { error: err?.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// POST /api/finance/contracts/:contractId/map-revenue
// ============================================================================
router.post('/contracts/:contractId/map-revenue', async (req: any, res: any) => {
  try {
    const ctx = await resolveWorkspace(req);
    if (!ctx.ok) return res.status(ctx.status!).json({ error: ctx.error });
    const workspaceId = ctx.workspaceId!;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userId = req.user?.id || (req.user)?.claims?.sub;
    const { contractId } = req.params;
    const { invoiceId } = req.body;

    if (!contractId) return res.status(400).json({ error: 'contractId required' });

    const result = await contractRevenueMapper.mapContractToRevenue(
      workspaceId,
      contractId,
      invoiceId ?? null,
      userId,
    );

    if (!result) {
      return res.status(404).json({ error: 'Contract not found or has no value' });
    }

    return res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    log.error('[RevenueRoutes] map-revenue error', { error: err?.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
