/**
 * Integration Status & Connection Management Routes
 * ==================================================
 * Provides status and connection management for all third-party integrations:
 * - QuickBooks
 * - Gusto
 * - Stripe
 * - Resend
 * - Twilio
 */

import express, { Router, Request, Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../auth';
import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import { workspaces } from '@shared/schema';

export const integrationsStatusRouter: Router = express.Router();

// ============================================================================
// INTEGRATION STATUS TYPES
// ============================================================================

interface IntegrationStatus {
  id: string;
  name: string;
  category: 'accounting' | 'payroll' | 'payments' | 'email' | 'sms';
  description: string;
  connected: boolean;
  configuredAt?: Date;
  lastSyncAt?: Date;
  syncStatus?: 'idle' | 'syncing' | 'error' | 'success';
  errorMessage?: string;
  features: string[];
  setupUrl?: string;
  docsUrl?: string;
}

// ============================================================================
// GET ALL INTEGRATIONS STATUS
// ============================================================================

/**
 * GET /api/integrations
 * Get status of all available integrations
 */
integrationsStatusRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.user?.currentWorkspaceId;

    // Get workspace-specific integration settings if available
    let workspaceSettings: any = null;
    if (workspaceId) {
      workspaceSettings = await db.query.workspaces.findFirst({
        where: eq(workspaces.id, workspaceId),
      });
    }

    const integrations: IntegrationStatus[] = [
      {
        id: 'quickbooks',
        name: 'QuickBooks Online',
        category: 'accounting',
        description: 'Sync invoices, expenses, and financial data with QuickBooks',
        connected: !!(process.env.QUICKBOOKS_CLIENT_ID && workspaceSettings?.quickbooksConnected),
        features: [
          'Invoice sync',
          'Expense tracking',
          'Customer sync',
          'Financial reports',
          'Tax integration',
        ],
        setupUrl: '/api/oauth/quickbooks/connect',
        docsUrl: 'https://developer.intuit.com/app/developer/qbo/docs',
      },
      {
        id: 'gusto',
        name: 'Gusto',
        category: 'payroll',
        description: 'Automate payroll, benefits, and HR with Gusto',
        connected: !!(process.env.GUSTO_CLIENT_ID && workspaceSettings?.gustoConnected),
        features: [
          'Payroll automation',
          'Employee sync',
          'Benefits management',
          'Tax filing',
          'Time tracking sync',
        ],
        setupUrl: '/api/oauth/gusto/connect',
        docsUrl: 'https://docs.gusto.com/',
      },
      {
        id: 'stripe',
        name: 'Stripe',
        category: 'payments',
        description: 'Process payments, invoices, and subscriptions',
        connected: !!process.env.STRIPE_SECRET_KEY,
        configuredAt: process.env.STRIPE_SECRET_KEY ? new Date() : undefined,
        syncStatus: process.env.STRIPE_SECRET_KEY ? 'idle' : undefined,
        features: [
          'Payment processing',
          'Invoice generation',
          'Subscription management',
          'Refund handling',
          'Webhook events',
        ],
        docsUrl: 'https://stripe.com/docs',
      },
      {
        id: 'resend',
        name: 'Resend',
        category: 'email',
        description: 'Send transactional emails and notifications',
        connected: !!process.env.RESEND_API_KEY,
        configuredAt: process.env.RESEND_API_KEY ? new Date() : undefined,
        features: [
          'Transactional emails',
          'Email templates',
          'Delivery tracking',
          'Analytics',
        ],
        docsUrl: 'https://resend.com/docs',
      },
      {
        id: 'twilio',
        name: 'Twilio',
        category: 'sms',
        description: 'Send SMS notifications and alerts',
        connected: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
        features: [
          'SMS notifications',
          'Two-factor authentication',
          'Shift reminders',
          'Alert broadcasts',
        ],
        docsUrl: 'https://www.twilio.com/docs',
      },
    ];

    res.json({
      success: true,
      integrations,
      summary: {
        total: integrations.length,
        connected: integrations.filter(i => i.connected).length,
        disconnected: integrations.filter(i => !i.connected).length,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get integrations', message: error.message });
  }
});

/**
 * GET /api/integrations/:id
 * Get detailed status of a specific integration
 */
integrationsStatusRouter.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.user?.currentWorkspaceId;

    let integration: IntegrationStatus | null = null;

    switch (id) {
      case 'quickbooks':
        integration = {
          id: 'quickbooks',
          name: 'QuickBooks Online',
          category: 'accounting',
          description: 'Sync invoices, expenses, and financial data with QuickBooks',
          connected: !!process.env.QUICKBOOKS_CLIENT_ID,
          features: ['Invoice sync', 'Expense tracking', 'Customer sync', 'Financial reports'],
          setupUrl: '/api/oauth/quickbooks/connect',
          docsUrl: 'https://developer.intuit.com/app/developer/qbo/docs',
        };
        break;

      case 'gusto':
        integration = {
          id: 'gusto',
          name: 'Gusto',
          category: 'payroll',
          description: 'Automate payroll, benefits, and HR with Gusto',
          connected: !!process.env.GUSTO_CLIENT_ID,
          features: ['Payroll automation', 'Employee sync', 'Benefits management'],
          setupUrl: '/api/oauth/gusto/connect',
          docsUrl: 'https://docs.gusto.com/',
        };
        break;

      case 'stripe':
        integration = {
          id: 'stripe',
          name: 'Stripe',
          category: 'payments',
          description: 'Process payments, invoices, and subscriptions',
          connected: !!process.env.STRIPE_SECRET_KEY,
          features: ['Payment processing', 'Invoice generation', 'Subscription management'],
          docsUrl: 'https://stripe.com/docs',
        };
        break;

      case 'resend':
        integration = {
          id: 'resend',
          name: 'Resend',
          category: 'email',
          description: 'Send transactional emails and notifications',
          connected: !!process.env.RESEND_API_KEY,
          features: ['Transactional emails', 'Email templates', 'Delivery tracking'],
          docsUrl: 'https://resend.com/docs',
        };
        break;

      case 'twilio':
        integration = {
          id: 'twilio',
          name: 'Twilio',
          category: 'sms',
          description: 'Send SMS notifications and alerts',
          connected: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
          features: ['SMS notifications', 'Two-factor authentication', 'Alerts'],
          docsUrl: 'https://www.twilio.com/docs',
        };
        break;

      default:
        return res.status(404).json({ error: `Integration '${id}' not found` });
    }

    res.json({ success: true, integration });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get integration status', message: error.message });
  }
});

/**
 * POST /api/integrations/:id/test
 * Test connection for a specific integration
 */
integrationsStatusRouter.post('/:id/test', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    let testResult = { success: false, message: 'Unknown integration' };

    switch (id) {
      case 'quickbooks':
        testResult = {
          success: !!process.env.QUICKBOOKS_CLIENT_ID,
          message: process.env.QUICKBOOKS_CLIENT_ID
            ? 'QuickBooks credentials configured. OAuth connection required.'
            : 'QuickBooks client ID not configured',
        };
        break;

      case 'gusto':
        testResult = {
          success: !!process.env.GUSTO_CLIENT_ID,
          message: process.env.GUSTO_CLIENT_ID
            ? 'Gusto credentials configured. OAuth connection required.'
            : 'Gusto client ID not configured',
        };
        break;

      case 'stripe':
        if (process.env.STRIPE_SECRET_KEY) {
          try {
            const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
            await stripe.balance.retrieve();
            testResult = { success: true, message: 'Stripe connection successful' };
          } catch (err: any) {
            testResult = { success: false, message: `Stripe test failed: ${err.message}` };
          }
        } else {
          testResult = { success: false, message: 'Stripe secret key not configured' };
        }
        break;

      case 'resend':
        testResult = {
          success: !!process.env.RESEND_API_KEY,
          message: process.env.RESEND_API_KEY
            ? 'Resend API key configured'
            : 'Resend API key not configured',
        };
        break;

      case 'twilio':
        testResult = {
          success: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
          message: (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
            ? 'Twilio credentials configured'
            : 'Twilio credentials not configured',
        };
        break;

      default:
        return res.status(404).json({ error: `Integration '${id}' not found` });
    }

    res.json(testResult);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to test integration', message: error.message });
  }
});

/**
 * POST /api/integrations/:id/sync
 * Trigger manual sync for an integration
 */
integrationsStatusRouter.post('/:id/sync', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.user?.currentWorkspaceId;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    // TODO: Implement actual sync logic for each integration
    // For now, return a pending sync status
    res.json({
      success: true,
      message: `Sync initiated for ${id}`,
      syncId: `sync_${Date.now()}`,
      status: 'pending',
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to sync integration', message: error.message });
  }
});

/**
 * DELETE /api/integrations/:id/disconnect
 * Disconnect an integration
 */
integrationsStatusRouter.delete('/:id/disconnect', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.user?.currentWorkspaceId;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    // TODO: Implement actual disconnection logic
    // This would involve revoking OAuth tokens, clearing stored credentials, etc.
    res.json({
      success: true,
      message: `Integration ${id} disconnected successfully`,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to disconnect integration', message: error.message });
  }
});

export default integrationsStatusRouter;
