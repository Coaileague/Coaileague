import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { requireManager, requireOwner, type AuthenticatedRequest } from "../rbac";
import { pool, db } from "../db";
import { invoices } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { creditInvoice, discountInvoice, refundInvoice, correctInvoiceLineItem, getInvoiceAdjustmentHistory, bulkCreditInvoices } from "../services/invoiceAdjustmentService";
import { createLogger } from '../lib/logger';
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
    const { invoiceId, amount, description } = req.body;
    const userId = req.user?.id;
    const workspaceId = req.workspaceId || req.currentWorkspaceId;
    if (!invoiceId || !amount || !userId || !workspaceId) return res.status(400).json({ error: 'invoiceId, amount, and user required' });

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
    const { invoiceId, discountPercent, reason } = req.body;
    const userId = req.user?.id;
    const workspaceId = req.workspaceId || req.currentWorkspaceId;
    if (!invoiceId || discountPercent === undefined || !userId || !workspaceId) return res.status(400).json({ error: 'invoiceId, discountPercent, and user required' });
    if (!reason || !reason.trim()) return res.status(400).json({ error: 'reason is required for discount operations' });

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
    const { invoiceId, refundAmount, reason } = req.body;
    const userId = req.user?.id;
    const workspaceId = req.workspaceId || req.currentWorkspaceId;
    if (!invoiceId || !refundAmount || !userId || !workspaceId) return res.status(400).json({ error: 'invoiceId, refundAmount, and user required' });
    if (!reason || !reason.trim()) return res.status(400).json({ error: 'reason is required for refund operations' });

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
    const { invoiceId, lineItemIndex, newQuantity, newUnitPrice, reason } = req.body;
    const userId = req.user?.id;
    const workspaceId = req.workspaceId || req.currentWorkspaceId;
    if (!invoiceId || lineItemIndex === undefined || !userId || !workspaceId) return res.status(400).json({ error: 'invoiceId, lineItemIndex, and user required' });

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
    const { invoiceIds, creditPerInvoice, reason } = req.body;
    const userId = req.user?.id;
    const workspaceId = req.workspaceId || req.currentWorkspaceId;
    if (!invoiceIds || !creditPerInvoice || !userId || !workspaceId) return res.status(400).json({ error: 'invoiceIds, creditPerInvoice, and workspace required' });

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
    const period = (req.query.period as string) || "this_month";
    let startDate: Date;
    const now = new Date();
    switch (period) {
      case "this_month": startDate = new Date(now.getFullYear(), now.getMonth(), 1); break;
      case "last_month": startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1); break;
      case "this_quarter": startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1); break;
      case "this_year": startDate = new Date(now.getFullYear(), 0, 1); break;
      default: startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
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
      const totalRevenue = parseFloat(revenueRes.rows[0]?.total_revenue || "0");
      const totalExpenses = parseFloat(expenseRes.rows[0]?.total_expenses || "0");
      const netProfit = totalRevenue - totalExpenses;
      const margin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : "0.0";

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
