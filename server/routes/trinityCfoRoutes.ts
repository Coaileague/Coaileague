/**
 * Trinity CFO Routes
 *
 * Read-only endpoints exposing Trinity's CFO reasoning tools. Used by:
 *   - Trinity chat function-calling (server-side invocation via cfoTools)
 *   - The Financial Reports / Financial Intelligence UI for live numbers
 *   - Any future "ask CFO Trinity" panels
 *
 * Mounted under /api/trinity/cfo by domains/billing.ts.
 */

import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../rbac';
import { hasManagerAccess } from '../rbac';
import { createLogger } from '../lib/logger';
import {
  monthlyPnL, arDays, cashRunway, computeMargin,
  expenseTrend, clientProfitability, companyHealth,
  CFO_TOOL_CATALOG,
} from '../services/trinity/cfoTools';

const log = createLogger('TrinityCfoRoutes');
const router = Router();

const periodSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

function parsePeriod(query: unknown): { startDate: Date; endDate: Date; error?: string } {
  const now = new Date();
  let startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  let endDate = now;
  const parsed = periodSchema.safeParse(query);
  if (!parsed.success) return { startDate, endDate, error: 'Invalid date range' };
  const { startDate: s, endDate: e } = parsed.data;
  if (s) {
    const d = new Date(s);
    if (isNaN(d.getTime())) return { startDate, endDate, error: 'Invalid startDate' };
    startDate = d;
  }
  if (e) {
    const d = new Date(e);
    if (isNaN(d.getTime())) return { startDate, endDate, error: 'Invalid endDate' };
    endDate = d;
  }
  return { startDate, endDate };
}

function gateManager(req: AuthenticatedRequest, res: import('express').Response): boolean {
  if (!hasManagerAccess(req.workspaceRole || '')) {
    res.status(403).json({ error: 'Manager role required for CFO data' });
    return false;
  }
  return true;
}

router.get('/catalog', (_req, res) => {
  res.json({ tools: CFO_TOOL_CATALOG });
});

router.get('/pnl', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    if (!gateManager(req, res)) return;
    const { startDate, endDate, error } = parsePeriod(req.query);
    if (error) return res.status(400).json({ error });
    res.json(await monthlyPnL({ workspaceId, startDate, endDate }));
  } catch (err) { log.error('pnl', err); res.status(500).json({ error: 'P&L computation failed' }); }
});

router.get('/ar-days', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    if (!gateManager(req, res)) return;
    res.json(await arDays(workspaceId));
  } catch (err) { log.error('ar-days', err); res.status(500).json({ error: 'AR days computation failed' }); }
});

router.get('/runway', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    if (!gateManager(req, res)) return;
    res.json(await cashRunway(workspaceId));
  } catch (err) { log.error('runway', err); res.status(500).json({ error: 'Runway computation failed' }); }
});

router.get('/margin', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    if (!gateManager(req, res)) return;
    const { startDate, endDate, error } = parsePeriod(req.query);
    if (error) return res.status(400).json({ error });
    res.json(await computeMargin({ workspaceId, startDate, endDate }));
  } catch (err) { log.error('margin', err); res.status(500).json({ error: 'Margin computation failed' }); }
});

router.get('/expense-trend', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    if (!gateManager(req, res)) return;
    const months = req.query.months ? Math.max(1, Math.min(24, parseInt(String(req.query.months), 10))) : 6;
    res.json(await expenseTrend({ workspaceId, months }));
  } catch (err) { log.error('expense-trend', err); res.status(500).json({ error: 'Expense trend failed' }); }
});

router.get('/client-profitability', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    if (!gateManager(req, res)) return;
    const { startDate, endDate, error } = parsePeriod(req.query);
    if (error) return res.status(400).json({ error });
    res.json(await clientProfitability({ workspaceId, startDate, endDate }));
  } catch (err) { log.error('client-profitability', err); res.status(500).json({ error: 'Client profitability failed' }); }
});

router.get('/company-health', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    if (!gateManager(req, res)) return;
    res.json(await companyHealth(workspaceId));
  } catch (err) { log.error('company-health', err); res.status(500).json({ error: 'Company health failed' }); }
});

export default router;
