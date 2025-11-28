/**
 * Timesheet Invoice API Routes
 * Generate invoices from approved time entries
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth';
import { requireWorkspaceRole, requireManager } from '../rbac';
import { 
  generateInvoiceFromTimesheets,
  getUninvoicedTimeEntries,
  sendInvoice,
  markInvoicePaid
} from '../services/timesheetInvoiceService';
import '../types';

export const timesheetInvoiceRouter = Router();

timesheetInvoiceRouter.post('/generate', requireAuth, requireWorkspaceRole(['org_owner', 'org_admin']), async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { clientId, startDate, endDate, taxRate, notes, dueInDays } = req.body;

    if (!clientId || !startDate || !endDate) {
      return res.status(400).json({ error: 'Client ID, start date, and end date are required' });
    }

    const result = await generateInvoiceFromTimesheets({
      workspaceId,
      clientId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      taxRate: taxRate ? Number(taxRate) : undefined,
      notes,
      dueInDays: dueInDays ? Number(dueInDays) : undefined,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('[TimesheetInvoice] Generate error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate invoice' });
  }
});

timesheetInvoiceRouter.get('/uninvoiced', requireAuth, requireManager, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const clientId = req.query.clientId as string | undefined;

    const result = await getUninvoicedTimeEntries(workspaceId, clientId);

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('[TimesheetInvoice] Uninvoiced error:', error);
    res.status(500).json({ error: error.message });
  }
});

timesheetInvoiceRouter.post('/:invoiceId/send', requireAuth, requireWorkspaceRole(['org_owner', 'org_admin']), async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { invoiceId } = req.params;

    const result = await sendInvoice(invoiceId, workspaceId);

    res.json(result);
  } catch (error: any) {
    console.error('[TimesheetInvoice] Send error:', error);
    res.status(500).json({ error: error.message });
  }
});

timesheetInvoiceRouter.post('/:invoiceId/mark-paid', requireAuth, requireWorkspaceRole(['org_owner', 'org_admin']), async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { invoiceId } = req.params;
    const { amountPaid, paymentIntentId } = req.body;

    const result = await markInvoicePaid(
      invoiceId,
      workspaceId,
      amountPaid ? Number(amountPaid) : undefined,
      paymentIntentId
    );

    res.json(result);
  } catch (error: any) {
    console.error('[TimesheetInvoice] Mark paid error:', error);
    res.status(500).json({ error: error.message });
  }
});
