/**
 * HRIS Integration Routes
 * ========================
 * API endpoints for HRIS (Human Resource Information Systems) integrations.
 * Handles OAuth flows, data synchronization, and provider management.
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { hrisIntegrationService, HRISProvider, SyncDirection, EntityType, HRIS_PROVIDERS } from '../services/hris/hrisIntegrationService';
import { requireAuth } from '../auth';
import { z } from 'zod';
import { platformEventBus } from '../services/platformEventBus';
import { typedPool } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
const log = createLogger('HrisRoutes');

const router = Router();

const syncRequestSchema = z.object({
  direction: z.enum(['inbound', 'outbound', 'bidirectional']).default('bidirectional'),
  entities: z.array(z.enum(['employee', 'department', 'payroll', 'time_off', 'benefits', 'compensation'])).default(['employee']),
  fullSync: z.boolean().default(false),
});

router.get('/providers', requireAuth, async (req: Request, res: Response) => {
  try {
    const providers = hrisIntegrationService.getAvailableProviders();
    res.json({ success: true, providers });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

uter.get('/callback/:provider', async (req: Request, res: Response) => {
  try {
    const provider = req.params.provider as HRISProvider;
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      return res.redirect(`/integrations?error=${encodeURIComponent(String(oauthError))}`);
    }

    if (!code || !state) {
      return res.redirect('/integrations?error=missing_parameters');
    }

    // FIX: Validate state against the value stored in the session at OAuth
    // initiation time. Without this check an attacker can craft a callback URL
    // that links their own HRIS provider to a victim's workspace (OAuth CSRF).
    const expectedState = req.session?.hrisOAuthState;
    if (!expectedState || String(state) !== expectedState) {
      return res.redirect('/integrations?error=invalid_oauth_state');
    }
    // Consume the state immediately so it cannot be replayed.
    req.session.hrisOAuthState = undefined;

    const redirectUri = `${req.protocol + '://' + req.get('host')}/api/hris/callback/${provider}`;

    const result = await hrisIntegrationService.handleOAuthCallback({
      provider,
      code: String(code),
      state: String(state),
      redirectUri,
    });

    if (result.success) {
      res.redirect(`/integrations?success=true&provider=${provider}`);
    } else {
      res.redirect(`/integrations?error=${encodeURIComponent(result.error || 'Unknown error')}`);
    }
  } catch (error: unknown) {
    log.error('[HRISRoutes] Callback error:', error);
    res.redirect(`/integrations?error=${encodeURIComponent(sanitizeError(error))}`);
  }
});

router.delete('/disconnect/:provider', requireAuth, async (req: Request, res: Response) => {
  try {
    const provider = req.params.provider as HRISProvider;
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId || req.session?.workspaceId;

    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace ID required' });
    }

    if (!HRIS_PROVIDERS[provider]) {
      return res.status(400).json({ success: false, error: 'Invalid provider' });
    }

    const success = await hrisIntegrationService.disconnectProvider(workspaceId, provider);

    platformEventBus.emit('hris.provider_disconnected', {
      workspaceId,
      provider,
      success,
    });

    res.json({ success });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/connections', requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId || req.session?.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace ID required' });
    }

    const connections = await hrisIntegrationService.getConnectedProviders(workspaceId);
    res.json({ success: true, connections });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
})

export default router;
