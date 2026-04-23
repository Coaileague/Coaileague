/**
 * SMS API Routes - Twilio SMS Integration
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth';
import { requireWorkspaceRole, requireManager } from '../rbac';
import { 
  isSMSConfigured 
} from '../services/smsService';
import { isFeatureEnabled } from '@shared/platformConfig';
import '../types';
import { createLogger } from '../lib/logger';
import { PLATFORM } from '../config/platformConfig';
const log = createLogger('SmsRoutes');


interface AuthenticatedRequest extends Request {
  user: any;
  workspaceId?: string;
}

export const smsRouter = Router();

smsRouter.get('/status', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({
      enabled: isFeatureEnabled('enableSMSNotifications'),
      configured: isSMSConfigured(),
      provider: 'twilio',
    });
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

smsRouter.post('/send', requireWorkspaceRole(['org_owner', 'co_owner']), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!isFeatureEnabled('enableSMSNotifications')) {
      return res.status(403).json({ error: 'SMS notifications are not enabled' });
    }

    const { to, message, type, employeeId } = req.body;
    const user = authReq.user;
    const workspaceId = authReq.workspaceId || user?.workspaceId || user?.currentWorkspaceId;

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
      const { NotificationDeliveryService } = await import('../services/notificationDeliveryService');
      const id = await NotificationDeliveryService.send({
        idempotencyKey: `notif-${Date.now()}`,
            type: (type as any) || 'system_alert',
        workspaceId,
        recipientUserId: employeeId,
        channel: 'sms',
        body: {
          body: message,
        }
      });
      return res.json({ success: !id.startsWith('skipped'), id });
    }

    if (!targetPhone) {
      return res.status(400).json({ error: 'Phone number or employee ID is required' });
    }

    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneRegex.test(targetPhone.replace(/\s/g, ''))) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    const { NotificationDeliveryService } = await import('../services/notificationDeliveryService');
    const id = await NotificationDeliveryService.send({
      idempotencyKey: `notif-${Date.now()}`,
            type: (type as any) || 'system_alert',
      workspaceId,
      recipientUserId: user?.id || 'system',
      channel: 'sms',
      body: {
        phone: targetPhone,
        body: message,
      }
    });

    res.json({ success: !id.startsWith('skipped'), id });
  } catch (error: unknown) {
    log.error('[SMS] Send error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

smsRouter.post('/send-to-employee', requireManager, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!isFeatureEnabled('enableSMSNotifications')) {
      return res.status(403).json({ error: 'SMS notifications are not enabled' });
    }

    const user = authReq.user;
    const workspaceId = authReq.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
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

    const { NotificationDeliveryService } = await import('../services/notificationDeliveryService');
    const id = await NotificationDeliveryService.send({
      idempotencyKey: `notif-${Date.now()}`,
            type: (type as any) || 'system_alert',
      workspaceId,
      recipientUserId: employeeId,
      channel: 'sms',
      body: {
        body: message,
      }
    });

    res.json({ success: !id.startsWith('skipped'), id });
  } catch (error: unknown) {
    log.error('[SMS] Send to employee error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

smsRouter.post('/shift-reminder', requireManager, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!isFeatureEnabled('enableSMSNotifications')) {
      return res.status(403).json({ error: 'SMS notifications are not enabled' });
    }

    const user = authReq.user;
    const workspaceId = authReq.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { employeeId, shiftDate, shiftTime, location } = req.body;

    if (!employeeId || !shiftDate || !shiftTime) {
      return res.status(400).json({ error: 'Employee ID, shift date, and time are required' });
    }

    const { NotificationDeliveryService } = await import('../services/notificationDeliveryService');
    const id = await NotificationDeliveryService.send({
      idempotencyKey: `notif-${Date.now()}`,
            type: 'shift_reminder',
      workspaceId,
      recipientUserId: employeeId,
      channel: 'sms',
      body: {
        body: `${PLATFORM.name} Reminder: You have a shift on ${shiftDate} at ${shiftTime}${location ? ` at ${location}` : ''}. Reply STOP to unsubscribe.`,
      }
    });

    res.json({ success: !id.startsWith('skipped'), id });
  } catch (error: unknown) {
    log.error('[SMS] Shift reminder error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

smsRouter.post('/schedule-change', requireManager, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!isFeatureEnabled('enableSMSNotifications')) {
      return res.status(403).json({ error: 'SMS notifications are not enabled' });
    }

    const user = authReq.user;
    const workspaceId = authReq.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { employeeId, changeType, shiftDetails } = req.body;

    if (!employeeId || !changeType || !shiftDetails) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const messages = {
      added: `${PLATFORM.name}: New shift assigned - ${shiftDetails}. Check your schedule for details.`,
      removed: `${PLATFORM.name}: Shift cancelled - ${shiftDetails}. Check your schedule for updates.`,
      modified: `${PLATFORM.name}: Schedule update - ${shiftDetails}. Check your schedule for details.`,
    };

    const { NotificationDeliveryService } = await import('../services/notificationDeliveryService');
    const id = await NotificationDeliveryService.send({
      idempotencyKey: `notif-${Date.now()}`,
            type: 'schedule_notification',
      workspaceId,
      recipientUserId: employeeId,
      channel: 'sms',
      body: {
        body: messages[changeType as keyof typeof messages] || messages.modified,
      }
    });

    res.json({ success: !id.startsWith('skipped'), id });
  } catch (error: unknown) {
    log.error('[SMS] Schedule change error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

smsRouter.post('/invoice-reminder', requireWorkspaceRole(['org_owner', 'co_owner']), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!isFeatureEnabled('enableSMSNotifications')) {
      return res.status(403).json({ error: 'SMS notifications are not enabled' });
    }

    const { clientPhone, invoiceNumber, amount, dueDate } = req.body;
    const user = authReq.user;
    const workspaceId = authReq.workspaceId || user?.workspaceId || user?.currentWorkspaceId;

    if (!clientPhone || !invoiceNumber || !amount || !dueDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { NotificationDeliveryService } = await import('../services/notificationDeliveryService');
    const id = await NotificationDeliveryService.send({
      idempotencyKey: `notif-${Date.now()}`,
            type: 'invoice_notification',
      workspaceId: workspaceId || 'system',
      recipientUserId: clientPhone, // We don't have a userId here, using phone as identifier
      channel: 'sms',
      body: {
        phone: clientPhone,
        body: `${PLATFORM.name}: Invoice ${invoiceNumber} for ${amount} is due ${dueDate}. View and pay online at your client portal.`,
      }
    });

    res.json({ success: !id.startsWith('skipped'), id });
  } catch (error: unknown) {
    log.error('[SMS] Invoice reminder error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});
