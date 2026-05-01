/**
 * Integration Status & Connection Management Routes
 * ==================================================
 * Provides status and connection management for all third-party integrations:
 * - QuickBooks, Gusto, Stripe, Resend, Twilio
 */

import { Router } from 'express';
import { requireAuth } from '../rbac';
import { AuthenticatedRequest } from '../rbac';
import { createLogger } from '../lib/logger';

const log = createLogger('integrations-status');
const router = Router();

/** GET /api/integrations/status — Returns connection status for all integrations */
router.get('/status', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    res.json({
      quickbooks: { connected: false, status: 'not_configured' },
      gusto:      { connected: false, status: 'not_configured' },
      stripe:     { connected: !!process.env.STRIPE_SECRET_KEY, status: process.env.STRIPE_SECRET_KEY ? 'active' : 'not_configured' },
      resend:     { connected: !!process.env.RESEND_API_KEY, status: process.env.RESEND_API_KEY ? 'active' : 'not_configured' },
      twilio:     { connected: !!process.env.TWILIO_ACCOUNT_SID, status: process.env.TWILIO_ACCOUNT_SID ? 'active' : 'not_configured' },
      plaid:      { connected: !!process.env.PLAID_CLIENT_ID, status: process.env.PLAID_CLIENT_ID ? 'active' : 'not_configured' },
    });
  } catch (e: unknown) {
    log.error('Integration status check failed', e);
    res.status(500).json({ error: 'Failed to check integration status' });
  }
});

export default router;
