/**
 * Financial Reports Routes
 *
 * Tenant-facing endpoints that stream branded PDFs for the reports hub.
 * Mounted under /api/financial-reports by domains/billing.ts. All endpoints
 * require auth + workspace scope (applied at mount time).
 */

import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../rbac';
import { hasManagerAccess } from '../rbac';
import { createLogger } from '../lib/logger';
import {
  generateAccountStatementPdf,
  generateBalanceSheetPdf,
  generateCashFlowPdf,
  generateProfitLossPdf,
  generateArAgingPdf,
  generateApAgingPdf,
  generateExpenseReportPdf,
  generatePaymentReceiptPdf,
} from '../services/financialReportsService';

const log = createLogger('FinancialReportsRoutes');
const router = Router();

const dateRangeSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

function parseRange(query: unknown): { start: Date; end: Date; error?: string } {
  const now = new Date();
  let start = new Date(now.getFullYear(), now.getMonth(), 1);
  let end = now;
  const parsed = dateRangeSchema.safeParse(query);
  if (!parsed.success) return { start, end, error: 'Invalid date range' };
  const { startDate, endDate } = parsed.data;
  if (startDate) {
    const d = new Date(startDate);
    if (isNaN(d.getTime())) return { start, end, error: 'Invalid startDate' };
    start = d;
  }
  if (endDate) {
    const d = new Date(endDate);
    if (isNaN(d.getTime())) return { start, end, error: 'Invalid endDate' };
    end = d;
  }
  if (start > end) return { start, end, error: 'startDate must be before endDate' };
  return { start, end };
}

function pdfHeaders(res: import('express').Response, filename: string): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
}

function requireManager(req: AuthenticatedRequest, res: import('express').Response): boolean {
  if (!hasManagerAccess(req.workspaceRole || '')) {
    res.status(403).json({ error: 'Manager role required for financial reports' });
    return false;
  }
  return true;
}

// ── Account statement (per client) ─────────────────────────────────────────
router.get('/account-statement/:clientId', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    if (!requireManager(req, res)) return;

    const { start, end, error } = parseRange(req.query);
    if (error) return res.status(400).json({ error });

    const buf = await generateAccountStatementPdf({
      workspaceId, clientId: req.params.clientId, startDate: start, endDate: end,
    });
    pdfHeaders(res, `statement-${req.params.clientId}-${end.toISOString().slice(0,10)}.pdf`);
    res.send(buf);
  } catch (err: unknown) {
    log.error('Account statement generation failed', err);
    const msg = err instanceof Error ? err.message : 'Failed';
    res.status(msg === 'Client not found' ? 404 : 500).json({ error: msg });
  }
});

// ── Balance sheet (point-in-time) ──────────────────────────────────────────
router.get('/balance-sheet', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    if (!requireManager(req, res)) return;

    const asOfStr = (req.query.asOf as string) || new Date().toISOString();
    const asOf = new Date(asOfStr);
    if (isNaN(asOf.getTime())) return res.status(400).json({ error: 'Invalid asOf' });

    const buf = await generateBalanceSheetPdf({ workspaceId, asOf });
    pdfHeaders(res, `balance-sheet-${asOf.toISOString().slice(0,10)}.pdf`);
    res.send(buf);
  } catch (err: unknown) {
    log.error('Balance sheet generation failed', err);
    res.status(500).json({ error: 'Failed to generate balance sheet' });
  }
});

// ── Cash flow statement (period) ───────────────────────────────────────────
router.get('/cash-flow', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    if (!requireManager(req, res)) return;

    const { start, end, error } = parseRange(req.query);
    if (error) return res.status(400).json({ error });

    const buf = await generateCashFlowPdf({ workspaceId, startDate: start, endDate: end });
    pdfHeaders(res, `cash-flow-${end.toISOString().slice(0,10)}.pdf`);
    res.send(buf);
  } catch (err: unknown) {
    log.error('Cash flow generation failed', err);
    res.status(500).json({ error: 'Failed to generate cash flow' });
  }
});

// ── P&L statement (period) ─────────────────────────────────────────────────
router.get('/profit-loss', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    if (!requireManager(req, res)) return;

    const { start, end, error } = parseRange(req.query);
    if (error) return res.status(400).json({ error });

    const buf = await generateProfitLossPdf({ workspaceId, startDate: start, endDate: end });
    pdfHeaders(res, `profit-loss-${end.toISOString().slice(0,10)}.pdf`);
    res.send(buf);
  } catch (err: unknown) {
    log.error('P&L generation failed', err);
    res.status(500).json({ error: 'Failed to generate P&L' });
  }
});

// ── AR aging report ────────────────────────────────────────────────────────
router.get('/ar-aging', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    if (!requireManager(req, res)) return;

    const asOfStr = (req.query.asOf as string) || new Date().toISOString();
    const asOf = new Date(asOfStr);
    if (isNaN(asOf.getTime())) return res.status(400).json({ error: 'Invalid asOf' });

    const buf = await generateArAgingPdf({ workspaceId, asOf });
    pdfHeaders(res, `ar-aging-${asOf.toISOString().slice(0,10)}.pdf`);
    res.send(buf);
  } catch (err: unknown) {
    log.error('AR aging generation failed', err);
    res.status(500).json({ error: 'Failed to generate AR aging' });
  }
});

// ── AP aging report ────────────────────────────────────────────────────────
router.get('/ap-aging', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    if (!requireManager(req, res)) return;

    const asOfStr = (req.query.asOf as string) || new Date().toISOString();
    const asOf = new Date(asOfStr);
    if (isNaN(asOf.getTime())) return res.status(400).json({ error: 'Invalid asOf' });

    const buf = await generateApAgingPdf({ workspaceId, asOf });
    pdfHeaders(res, `ap-aging-${asOf.toISOString().slice(0,10)}.pdf`);
    res.send(buf);
  } catch (err: unknown) {
    log.error('AP aging generation failed', err);
    res.status(500).json({ error: 'Failed to generate AP aging' });
  }
});

// ── Expense report ─────────────────────────────────────────────────────────
router.get('/expense-report', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    if (!requireManager(req, res)) return;

    const { start, end, error } = parseRange(req.query);
    if (error) return res.status(400).json({ error });

    const buf = await generateExpenseReportPdf({ workspaceId, startDate: start, endDate: end });
    pdfHeaders(res, `expense-report-${end.toISOString().slice(0,10)}.pdf`);
    res.send(buf);
  } catch (err: unknown) {
    log.error('Expense report generation failed', err);
    res.status(500).json({ error: 'Failed to generate expense report' });
  }
});

// ── Payment receipt (single payment) ───────────────────────────────────────
router.get('/payment-receipt/:paymentId', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    if (!requireManager(req, res)) return;

    const buf = await generatePaymentReceiptPdf({ workspaceId, paymentId: req.params.paymentId });
    pdfHeaders(res, `receipt-${req.params.paymentId.slice(0,8)}.pdf`);
    res.send(buf);
  } catch (err: unknown) {
    log.error('Payment receipt generation failed', err);
    const msg = err instanceof Error ? err.message : 'Failed';
    res.status(msg === 'Payment not found' ? 404 : 500).json({ error: msg });
  }
});

// ── Catalog: list available reports for the UI hub ─────────────────────────
router.get('/catalog', async (req: AuthenticatedRequest, res) => {
  res.json({
    reports: [
      {
        id: 'profit-loss', name: 'Profit & Loss', kind: 'period',
        description: 'Revenue, direct labor, expenses, net income, margins.',
        endpoint: '/api/financial-reports/profit-loss',
      },
      {
        id: 'balance-sheet', name: 'Balance Sheet', kind: 'point',
        description: 'Assets, liabilities, equity at a point in time.',
        endpoint: '/api/financial-reports/balance-sheet',
      },
      {
        id: 'cash-flow', name: 'Cash Flow', kind: 'period',
        description: 'Cash in (collected payments) vs payroll/expenses out, by month.',
        endpoint: '/api/financial-reports/cash-flow',
      },
      {
        id: 'ar-aging', name: 'AR Aging', kind: 'point',
        description: 'Unpaid invoices bucketed by days overdue.',
        endpoint: '/api/financial-reports/ar-aging',
      },
      {
        id: 'ap-aging', name: 'AP Aging', kind: 'point',
        description: 'Unpaid expenses bucketed by age.',
        endpoint: '/api/financial-reports/ap-aging',
      },
      {
        id: 'expense-report', name: 'Expense Report', kind: 'period',
        description: 'All expenses in the period with vendor, status, amount.',
        endpoint: '/api/financial-reports/expense-report',
      },
      {
        id: 'account-statement', name: 'Client Account Statement', kind: 'period+client',
        description: 'Per-client statement: opening balance, charges, payments, closing balance.',
        endpoint: '/api/financial-reports/account-statement/:clientId',
      },
    ],
  });
});

export default router;
