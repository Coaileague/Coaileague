/**
 * SMS API Routes - Twilio SMS Integration
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth';
import { requireWorkspaceRole, requireManager } from '../rbac';
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

smsRouter.get('/status', requireAuth, async (req: Request, res: Response) => {
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

smsRouter.post('/send', requireAuth, requireWorkspaceRole(['org_owner', 'org_admin']), async (req: Request, res: Response) => {
  try {
    if (!isFeatureEnabled('enableSMSNotifications')) {
      return res.status(403).json({ error: 'SMS notifications are not enabled' });
    }

    const { to, message, type, employeeId } = req.body;
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;

    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (message.length > 1600) {
      return res.status(400).json({ error: 'Message too long (max 1600 characters)' });
    }

    let targetPhone = to;
    if (employeeId && !to) {
      const result = await sendSMSToEmployee(employeeId, message, type || 'notification', workspaceId);
      return res.json(result);
    }

    if (!targetPhone) {
      return res.status(400).json({ error: 'Phone number or employee ID is required' });
    }

    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneRegex.test(targetPhone.replace(/\s/g, ''))) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    const result = await sendSMS({
      to: targetPhone,
      body: message,
      type: type || 'manual',
      workspaceId,
      userId: user?.id,
    });

    res.json(result);
  } catch (error: any) {
    console.error('[SMS] Send error:', error);
    res.status(500).json({ error: error.message });
  }
});

smsRouter.post('/send-to-employee', requireAuth, requireManager, async (req: Request, res: Response) => {
  try {
    if (!isFeatureEnabled('enableSMSNotifications')) {
      return res.status(403).json({ error: 'SMS notifications are not enabled' });
    }

    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { employeeId, message, type } = req.body;

    if (!employeeId || !message) {
      return res.status(400).json({ error: 'Employee ID and message are required' });
    }

    if (message.length > 1600) {
      return res.status(400).json({ error: 'Message too long (max 1600 characters)' });
    }

    const result = await sendSMSToEmployee(employeeId, message, type || 'notification', workspaceId);

    res.json(result);
  } catch (error: any) {
    console.error('[SMS] Send to employee error:', error);
    res.status(500).json({ error: error.message });
  }
});

smsRouter.post('/shift-reminder', requireAuth, requireManager, async (req: Request, res: Response) => {
  try {
    if (!isFeatureEnabled('enableSMSNotifications')) {
      return res.status(403).json({ error: 'SMS notifications are not enabled' });
    }

    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { employeeId, shiftDate, shiftTime, location } = req.body;

    if (!employeeId || !shiftDate || !shiftTime) {
      return res.status(400).json({ error: 'Employee ID, shift date, and time are required' });
    }

    const result = await sendShiftReminder(employeeId, shiftDate, shiftTime, location, workspaceId);

    res.json(result);
  } catch (error: any) {
    console.error('[SMS] Shift reminder error:', error);
    res.status(500).json({ error: error.message });
  }
});

smsRouter.post('/schedule-change', requireAuth, requireManager, async (req: Request, res: Response) => {
  try {
    if (!isFeatureEnabled('enableSMSNotifications')) {
      return res.status(403).json({ error: 'SMS notifications are not enabled' });
    }

    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { employeeId, changeType, shiftDetails } = req.body;

    if (!employeeId || !changeType || !shiftDetails) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await sendScheduleChangeNotification(employeeId, changeType, shiftDetails, workspaceId);

    res.json(result);
  } catch (error: any) {
    console.error('[SMS] Schedule change error:', error);
    res.status(500).json({ error: error.message });
  }
});

smsRouter.post('/invoice-reminder', requireAuth, requireWorkspaceRole(['org_owner', 'org_admin']), async (req: Request, res: Response) => {
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
