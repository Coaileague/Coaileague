import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { z } from 'zod';
import { requireManager, requireOwner, type AuthenticatedRequest } from "../rbac";
import { pool, db } from "../db";
import { invoices } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { creditInvoice, discountInvoice, refundInvoice, correctInvoiceLineItem, getInvoiceAdjustmentHistory, bulkCreditInvoices } from "../services/invoiceAdjustmentService";
import { subtractFinancialValues, divideFinancialValues, multiplyFinancialValues, toFinancialString } from '../services/financialCalculator';
import { createLogger } from '../lib/logger';

// ─── Zod schemas for financial mutation boundaries ───────────────────────────
const CreditSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  description: z.string().min(1),
});
const DiscountSchema = z.object({
  invoiceId: z.string().uuid(),
  discountPercent: z.number().min(0).max(100),
  reason: z.string().min(1),
});
const RefundSchema = z.object({
  invoiceId: z.string().uuid(),
  refundAmount: z.number().positive(),
  reason: z.string().min(1),
});
const CorrectLineItemSchema = z.object({
  invoiceId: z.string().uuid(),
  lineItemIndex: z.number().int().min(0),
  newQuantity: z.number().positive().optional(),
  newUnitPrice: z.number().positive().optional(),
  reason: z.string().optional(),
});
const BulkCreditSchema = z.object({
  invoiceIds: z.array(z.string().uuid()).min(1),
  creditPerInvoice: z.number().positive(),
  reason: z.string().min(1),
});
const PeriodSchema = z.object({
  period: z.enum(['this_month', 'last_month', 'this_quarter', 'this_year', 'last_30_days'])
    .default('this_month'),
});
const log = createLogger('FinanceInlineRoutes');


const router = Router();

/**
 * GAP-22 FIX: All invoice adjustment routes previously accepted invoiceId from the request
 * body with no cross-workspace ownership check, making them vulnerable to IDOR — an
 * authenticated manager in workspace A could credit, discount, refund, or corrupt line
 * items on workspace B's invoices by supplying a foreign invoice UUID.
 *
 * Fix: Each mutating route now validates that the supplied invoiceId belongs to the
 * authenticated workspace (req.workspaceId) before calling the service layer.
 */

async function assertInvoiceBelongsToWorkspace(invoiceId: string, workspaceId: string): Promise<void> {
  const [inv] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)))
    .limit(1);
  if (!inv) {
    throw new Error(`Invoice not found or access denied`);
  }
}

router.post("/billing/adjust-invoice/credit", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = CreditSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    const { invoiceId, amount, description } = parsed.data;
    const userId = req.user?.id;
    const workspaceId = req.workspaceId || req.currentWorkspaceId;
    if (!userId || !workspaceId) return res.status(400).json({ error: 'User and workspace context required' });

    await assertInvoiceBelongsToWorkspace(invoiceId, workspaceId);

    const result = await creditInvoice(invoiceId, amount, description || 'Manual credit', userId);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    log.error('Error applying credit:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

router.post("/billing/adjust-invoice/discount", requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = DiscountSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const { invoiceId, discountPercent, reason } = parsed.data;
    const userId = req.user?.id;
    const workspaceId = req.workspaceId || req.currentWorkspaceId;
    if (!userId || !workspaceId) return res.status(400).json({ error: 'auth context required' });

    await assertInvoiceBelongsToWorkspace(invoiceId, workspaceId);

    const result = await discountInvoice(invoiceId, discountPercent, reason.trim(), userId);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    log.error('Error applying discount:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

router.post("/billing/adjust-invoice/refund", requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = RefundSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const { invoiceId, refundAmount, reason } = parsed.data;
    const userId = req.user?.id;
    const workspaceId = req.workspaceId || req.currentWorkspaceId;
    if (!userId || !workspaceId) return res.status(400).json({ error: 'auth context required' });

    await assertInvoiceBelongsToWorkspace(invoiceId, workspaceId);

    const result = await refundInvoice(invoiceId, refundAmount, reason.trim(), userId);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    log.error('Error processing refund:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

router.post("/billing/adjust-invoice/correct-line-item", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = CorrectLineItemSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const { invoiceId, lineItemIndex, newQuantity, newUnitPrice, reason } = parsed.data;
    const userId = req.user?.id;
    const workspaceId = req.workspaceId || req.currentWorkspaceId;
    if (!userId || !workspaceId) return res.status(400).json({ error: 'auth context required' });

    await assertInvoiceBelongsToWorkspace(invoiceId, workspaceId);

    const result = await correctInvoiceLineItem(invoiceId, lineItemIndex, newQuantity, newUnitPrice, reason, userId);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    log.error('Error correcting line item:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

router.get("/billing/adjust-invoice/:invoiceId/history", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const { invoiceId } = req.params;
    const workspaceId = req.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace context required' });
    await assertInvoiceBelongsToWorkspace(invoiceId, workspaceId);
    const history = await getInvoiceAdjustmentHistory(invoiceId);
    res.json({ success: true, data: history });
  } catch (error: unknown) {
    log.error('Error fetching adjustment history:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post("/billing/adjust-invoice/bulk-credit", requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = BulkCreditSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const { invoiceIds, creditPerInvoice, reason } = parsed.data;
    const userId = req.user?.id;
    const workspaceId = req.workspaceId || req.currentWorkspaceId;
    if (!userId || !workspaceId) return res.status(400).json({ error: 'auth context required' });

    // Assert every invoice belongs to this workspace before processing (IDOR guard)
    await Promise.all(invoiceIds.map(id => assertInvoiceBelongsToWorkspace(id, workspaceId)));

    const result = await bulkCreditInvoices(workspaceId, invoiceIds, creditPerInvoice, reason || 'Bulk credit', userId);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    log.error('Error processing bulk credit:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

// GET /api/finance/pl/consolidated — Consolidated P&L across all clients
router.get("/finance/pl/consolidated", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const periodParsed = PeriodSchema.safeParse({ period: req.query.period || 'this_month' });
    if (!periodParsed.success) return res.status(400).json({ error: 'Invalid period', valid: ['this_month','last_month','this_quarter','this_year','last_30_days'] });
    const period = periodParsed.data.period;
    let startDate: Date;
    const now = new Date();
    switch (period) {
      case "this_month": startDate = new Date(now.getFullYear(), now.getMonth(), 1); break;
      case "last_month": startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1); break;
      case "this_quarter": startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1); break;
      case "this_year": startDate = new Date(now.getFullYear(), 0, 1); break;
      case "last_30_days": default: startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    // CATEGORY C — Raw SQL retained: COALESCE/SUM aggregations via pool client | Tables: invoices, expenses | Verified: 2026-03-23
    const client = await pool.connect();
    try {
      const [revenueRes, expenseRes] = await Promise.all([
        client.query(
          `SELECT COALESCE(SUM(amount), 0) AS total_revenue, COUNT(*) AS invoice_count
           FROM invoices WHERE workspace_id = $1 AND created_at >= $2 AND status = 'paid'`,
          [workspaceId, startDate]
        ),
        client.query(
          `SELECT COALESCE(SUM(amount), 0) AS total_expenses, COUNT(*) AS expense_count
           FROM expenses WHERE workspace_id = $1 AND created_at >= $2`,
          [workspaceId, startDate]
        ),
      ]);
      const totalRevenueStr = toFinancialString(String(revenueRes.rows[0]?.total_revenue || "0"));
      const totalExpensesStr = toFinancialString(String(expenseRes.rows[0]?.total_expenses || "0"));
      const netProfitStr = subtractFinancialValues(totalRevenueStr, totalExpensesStr);
      const totalRevenue = parseFloat(totalRevenueStr);
      const totalExpenses = parseFloat(totalExpensesStr);
      const netProfit = parseFloat(netProfitStr);
      const margin = totalRevenue > 0
        ? parseFloat(divideFinancialValues(multiplyFinancialValues(netProfitStr, '100'), totalRevenueStr)).toFixed(1)
        : "0.0";

      res.json({
        success: true,
        data: {
          period,
          totalRevenue,
          totalExpenses,
          netProfit,
          margin: parseFloat(margin),
          invoiceCount: parseInt(revenueRes.rows[0]?.invoice_count || "0"),
          expenseCount: parseInt(expenseRes.rows[0]?.expense_count || "0"),
          periodStart: startDate.toISOString(),
          periodEnd: now.toISOString(),
        },
      });
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    log.error("[finance/pl/consolidated]", sanitizeError(err));
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
