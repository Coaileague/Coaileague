/**
 * SMS API Routes - Twilio SMS Integration
 */

import { Router, Response } from 'express';
import { requireAuth } from '../auth';
import { requireWorkspaceRole, requireManager, AuthenticatedRequest } from '../rbac';
import { 
  sendSMS, 
  sendSMSToEmployee, 
  sendShiftReminder,
  sendScheduleChangeNotification,
  sendInvoiceReminder,
  isSMSConfigured 
} from '../services/smsService';
import { isFeatureEnabled } from '@shared/platformConfig';
import '../types';

export const smsRouter = Router();

smsRouter.get('/status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({
      enabled: isFeatureEnabled('enableSMSNotifications'),
      configured: isSMSConfigured(),
      provider: 'twilio',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

smsRouter.post('/send', requireAuth, requireWorkspaceRole(['org_owner', 'org_admin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isFeatureEnabled('enableSMSNotifications')) {
      return res.status(403).json({ error: 'SMS notifications are not enabled' });
    }

    const { to, message, type } = req.body;
    const user = req.user;

    if (!to || !message) {
      return res.status(400).json({ error: 'Phone number and message are required' });
    }

    const result = await sendSMS({
      to,
      body: message,
      type: type || 'manual',
      workspaceId: user?.currentWorkspaceId,
      userId: user?.id,
    });

    res.json(result);
  } catch (error: any) {
    console.error('[SMS] Send error:', error);
    res.status(500).json({ error: error.message });
  }
});

smsRouter.post('/send-to-employee', requireAuth, requireManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isFeatureEnabled('enableSMSNotifications')) {
      return res.status(403).json({ error: 'SMS notifications are not enabled' });
    }

    const { employeeId, message, type } = req.body;

    if (!employeeId || !message) {
      return res.status(400).json({ error: 'Employee ID and message are required' });
    }

    const result = await sendSMSToEmployee(employeeId, message, type || 'notification');

    res.json(result);
  } catch (error: any) {
    console.error('[SMS] Send to employee error:', error);
    res.status(500).json({ error: error.message });
  }
});

smsRouter.post('/shift-reminder', requireAuth, requireManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isFeatureEnabled('enableSMSNotifications')) {
      return res.status(403).json({ error: 'SMS notifications are not enabled' });
    }

    const { employeeId, shiftDate, shiftTime, location } = req.body;

    if (!employeeId || !shiftDate || !shiftTime) {
      return res.status(400).json({ error: 'Employee ID, shift date, and time are required' });
    }

    const result = await sendShiftReminder(employeeId, shiftDate, shiftTime, location);

    res.json(result);
  } catch (error: any) {
    console.error('[SMS] Shift reminder error:', error);
    res.status(500).json({ error: error.message });
  }
});

smsRouter.post('/schedule-change', requireAuth, requireManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isFeatureEnabled('enableSMSNotifications')) {
      return res.status(403).json({ error: 'SMS notifications are not enabled' });
    }

    const { employeeId, changeType, shiftDetails } = req.body;

    if (!employeeId || !changeType || !shiftDetails) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await sendScheduleChangeNotification(employeeId, changeType, shiftDetails);

    res.json(result);
  } catch (error: any) {
    console.error('[SMS] Schedule change error:', error);
    res.status(500).json({ error: error.message });
  }
});

smsRouter.post('/invoice-reminder', requireAuth, requireWorkspaceRole(['org_owner', 'org_admin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isFeatureEnabled('enableSMSNotifications')) {
      return res.status(403).json({ error: 'SMS notifications are not enabled' });
    }

    const { clientPhone, invoiceNumber, amount, dueDate } = req.body;

    if (!clientPhone || !invoiceNumber || !amount || !dueDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await sendInvoiceReminder(clientPhone, invoiceNumber, amount, dueDate);

    res.json(result);
  } catch (error: any) {
    console.error('[SMS] Invoice reminder error:', error);
    res.status(500).json({ error: error.message });
  }
});
