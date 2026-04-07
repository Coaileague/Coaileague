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

router.get('/employees', requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    const { pool } = await import('../db');
    // CATEGORY C — Raw SQL retained: position | Tables: employees | Verified: 2026-03-23
    const { rows } = await typedPool(
      `SELECT id, first_name, last_name, role, email, phone, is_active,
              hire_date, position
       FROM employees
       WHERE workspace_id = $1
       ORDER BY last_name, first_name`,
      [workspaceId]
    );
    res.json({ employees: rows, total: rows.length, source: 'internal' });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to fetch HRIS employees' });
  }
});

router.get('/providers', requireAuth, async (req: Request, res: Response) => {
  try {
    const providers = hrisIntegrationService.getAvailableProviders();
    res.json({ success: true, providers });
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
});

router.get('/auth/:provider', requireAuth, async (req: Request, res: Response) => {
  try {
    const provider = req.params.provider as HRISProvider;
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId || req.session?.workspaceId;

    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace ID required' });
    }

    if (!HRIS_PROVIDERS[provider]) {
      return res.status(400).json({ success: false, error: 'Invalid provider' });
    }

    const redirectUri = `${process.env.REPLIT_DEV_DOMAIN || req.protocol + '://' + req.get('host')}/api/hris/callback/${provider}`;
    
    const { url, state } = hrisIntegrationService.generateAuthUrl({
      provider,
      workspaceId,
      redirectUri,
    });

    req.session.hrisOAuthState = state;

    res.json({ success: true, authUrl: url });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/callback/:provider', async (req: Request, res: Response) => {
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
    const expectedState = (req.session as any)?.hrisOAuthState;
    if (!expectedState || String(state) !== expectedState) {
      return res.redirect('/integrations?error=invalid_oauth_state');
    }
    // Consume the state immediately so it cannot be replayed.
    (req.session as any).hrisOAuthState = undefined;

    const redirectUri = `${process.env.REPLIT_DEV_DOMAIN || req.protocol + '://' + req.get('host')}/api/hris/callback/${provider}`;

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

router.post('/sync/:provider', requireAuth, async (req: Request, res: Response) => {
  try {
    const provider = req.params.provider as HRISProvider;
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId || req.session?.workspaceId;
    const userId = req.session?.userId || req.userId;

    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace ID required' });
    }

    if (!HRIS_PROVIDERS[provider]) {
      return res.status(400).json({ success: false, error: 'Invalid provider' });
    }

    const parsed = syncRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid request body', details: parsed.error.flatten() });
    }

    const result = await hrisIntegrationService.syncData({
      workspaceId,
      provider,
      options: {
        direction: parsed.data.direction as SyncDirection,
        entities: parsed.data.entities as EntityType[],
        fullSync: parsed.data.fullSync,
      },
      userId,
    });

    platformEventBus.emit('hris.sync_completed', {
      workspaceId,
      provider,
      direction: parsed.data.direction,
      entities: parsed.data.entities,
      success: result.success,
    });

    if (result.success) {
      platformEventBus.publish({
        type: 'partner_sync_complete',
        category: 'automation',
        title: `HRIS Sync Completed — ${provider}`,
        description: `${parsed.data.direction} sync of ${parsed.data.entities.join(', ')} completed via ${provider}`,
        workspaceId,
        metadata: { provider, direction: parsed.data.direction, entities: parsed.data.entities },
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    }

    res.json({ success: result.success, result });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
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

router.get('/sync-status/:provider', requireAuth, async (req: Request, res: Response) => {
  try {
    const provider = req.params.provider as HRISProvider;
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId || req.session?.workspaceId;

    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace ID required' });
    }

    const actions = hrisIntegrationService.getAIBrainActions();
    const getSyncStatusAction = actions.find(a => a.name === 'hris.get_sync_status');
    
    if (getSyncStatusAction) {
      const result = await getSyncStatusAction.handler({ workspaceId, provider });
      res.json(result);
    } else {
      res.status(500).json({ success: false, error: 'Action not found' });
    }
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

export default router;
