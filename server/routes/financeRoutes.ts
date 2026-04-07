import { PLATFORM } from '../config/platformConfig';
import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { requireManager } from '../rbac';
import { z } from 'zod';
import {
  generateEmployeeICalFeed,
  generateWorkspaceICalFeed,
  resolveICalToken,
  createICalSubscription,
} from '../services/icalService';
import { financialLedgerService } from '../services/financialLedgerService';

const router = Router();

function parsePeriodParams(query: any): { start: Date; end: Date } {
  const now = new Date();
  const start = query.start ? new Date(query.start as string) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = query.end ? new Date(query.end as string) : now;
  return { start, end };
}

router.get('/ledger/chart-of-accounts', requireManager, (req: any, res: Response) => {
  const accounts = financialLedgerService.getChartOfAccounts();
  res.json({ accounts });
});

router.get('/ledger/journal-entries', requireManager, async (req: any, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    const { start, end } = parsePeriodParams(req.query);
    const entries = await financialLedgerService.generateJournalEntries(workspaceId, start, end);
    res.json({ entries, periodStart: start, periodEnd: end });
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) || 'Failed to generate journal entries' });
  }
});

router.get('/ledger/pl-report', requireManager, async (req: any, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    const { start, end } = parsePeriodParams(req.query);
    const report = await financialLedgerService.generatePLReport(workspaceId, start, end);
    res.json(report);
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) || 'Failed to generate P&L report' });
  }
});

router.get('/ledger/balance-sheet', requireManager, async (req: any, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    const asOf = req.query.asOf ? new Date(req.query.asOf as string) : new Date();
    const data = await financialLedgerService.generateBalanceSheet(workspaceId, asOf);
    res.json(data);
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) || 'Failed to generate balance sheet' });
  }
});

router.get('/dashboard/revenue-per-guard-hour', requireManager, async (req: any, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    const { start, end } = parsePeriodParams(req.query);
    const data = await financialLedgerService.getRevenuePerGuardHour(workspaceId, start, end);
    res.json({ data, periodStart: start, periodEnd: end });
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) || 'Failed to get revenue per guard hour' });
  }
});

router.get('/dashboard/labor-cost-ratio', requireManager, async (req: any, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    const { start, end } = parsePeriodParams(req.query);
    const data = await financialLedgerService.getLaborCostRatio(workspaceId, start, end);
    res.json(data);
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) || 'Failed to get labor cost ratio' });
  }
});

router.get('/dashboard/profit-margins', requireManager, async (req: any, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    const { start, end } = parsePeriodParams(req.query);
    const data = await financialLedgerService.getProfitMarginsByClient(workspaceId, start, end);
    res.json({ data, periodStart: start, periodEnd: end });
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) || 'Failed to get profit margins' });
  }
});

router.get('/dashboard/ar-aging', requireManager, async (req: any, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    const data = await financialLedgerService.getARAgingSummary(workspaceId);
    res.json(data);
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) || 'Failed to get AR aging summary' });
  }
});

router.get('/dashboard/employer-tax-liabilities', requireManager, async (req: any, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    const year = req.query.year ? parseInt(req.query.year) : undefined;
    const quarter = req.query.quarter ? parseInt(req.query.quarter) : undefined;
    const data = await financialLedgerService.getEmployerTaxLiabilities(workspaceId, year, quarter);
    res.json({
      ...data,
      disclaimer: `AI-generated estimates. Verify all figures before filing. ${PLATFORM.name} is workforce management middleware only — not a CPA, tax preparer, or financial institution. The organization representative or owner is solely responsible for verifying accuracy of all tax and financial data. ${PLATFORM.name} is not responsible for errors, omissions, or inaccuracies unless directly caused by a verifiable defect in the ${PLATFORM.name} processing engine.`,
    });
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) || 'Failed to get employer tax liabilities' });
  }
});

router.post('/ical/subscribe', async (req: any, res: Response) => {
  try {
    const userId = req.userId;
    const workspaceId = req.workspaceId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });

    const { employeeId, name } = req.body || {};
    const result = await createICalSubscription(workspaceId, userId, employeeId, name);

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const feedUrl = `${baseUrl}/api/schedule/ical/${result.token}`;

    res.json({
      id: result.id,
      token: result.token,
      feedUrl,
      instructions: {
        googleCalendar: `Add by URL: ${feedUrl}`,
        appleCalendar: `Subscribe to calendar: ${feedUrl}`,
        outlook: `Add Internet Calendar: ${feedUrl}`,
      },
    });
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) || 'Failed to create iCal subscription' });
  }
});

export default router;

export const icalPublicRouter = Router();

icalPublicRouter.get('/api/schedule/ical/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).json({ error: 'Token required' });

    const subscription = await resolveICalToken(token);
    if (!subscription) {
      return res.status(404).json({ error: 'Invalid or expired subscription' });
    }

    let icsContent: string;
    if (subscription.employeeId) {
      icsContent = await generateEmployeeICalFeed(subscription.employeeId, subscription.workspaceId);
    } else {
      icsContent = await generateWorkspaceICalFeed(subscription.workspaceId);
    }

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="schedule.ics"');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(icsContent);
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) || 'Failed to generate calendar feed' });
  }
});
