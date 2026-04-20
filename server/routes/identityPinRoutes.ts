/**
 * IDENTITY PIN ROUTES — Phase 23
 * ===============================
 * HTTP surfaces for owner, employee, and client identity PINs plus the
 * combined identity-code + PIN verifier used by Trinity and HelpAI.
 *
 *   POST   /api/identity/pin/owner/set                 — owner sets own PIN
 *   DELETE /api/identity/pin/owner                     — owner clears own PIN
 *   GET    /api/identity/pin/owner/status              — owner checks PIN exists
 *
 *   POST   /api/identity/pin/client/:clientId/set      — tenant manager+ sets client PIN
 *   DELETE /api/identity/pin/client/:clientId          — tenant manager+ clears client PIN
 *   GET    /api/identity/pin/client/:clientId/status   — tenant manager+ reads status
 *
 *   POST   /api/identity/verify-with-pin               — Trinity / HelpAI entry point
 *                                                         { code, pin } → identity resolution
 *
 * Employee PIN endpoints already exist at /api/employees/:id/pin/* — those
 * remain the canonical surface and are not duplicated here.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth, requireWorkspaceRole, type AuthenticatedRequest } from '../rbac';
import { pinVerifyLimiter } from '../middleware/rateLimiter';
import { createLogger } from '../lib/logger';
import {
  setEntityPin,
  clearEntityPin,
  getEntityPinStatus,
  verifyIdentityAndPin,
} from '../services/entityPinService';

const log = createLogger('IdentityPinRoutes');

export const identityPinRouter = Router();

// ─── OWNER PIN (self-service) ────────────────────────────────────────────────

identityPinRouter.post('/pin/owner/set', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    const actorUserId = (req as any).user?.id;
    const role = (req as any).workspaceRole;
    if (!workspaceId || !actorUserId) {
      return res.status(401).json({ error: 'UNAUTHENTICATED' });
    }
    if (role !== 'org_owner' && role !== 'co_owner') {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only workspace owners can set the owner identification PIN',
      });
    }

    const { pin } = req.body || {};
    await setEntityPin({
      entity: 'owner',
      entityId: workspaceId,
      pin,
      workspaceId,
      actorUserId,
      actorPlatformRole: (req as any).platformRole ?? null,
    });

    return res.json({ success: true, message: 'Owner identification PIN saved' });
  } catch (err: any) {
    const msg = err?.message || 'Failed to set owner PIN';
    if (msg.startsWith('INVALID_PIN')) return res.status(400).json({ error: 'INVALID_PIN', message: msg });
    if (msg.startsWith('PIN_TARGET_NOT_FOUND')) return res.status(404).json({ error: 'NOT_FOUND', message: msg });
    log.error('[OwnerPin] set failed:', msg);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

identityPinRouter.delete('/pin/owner', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    const actorUserId = (req as any).user?.id;
    const role = (req as any).workspaceRole;
    if (!workspaceId || !actorUserId) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    if (role !== 'org_owner' && role !== 'co_owner') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    await clearEntityPin({
      entity: 'owner',
      entityId: workspaceId,
      workspaceId,
      actorUserId,
      actorPlatformRole: (req as any).platformRole ?? null,
    });

    return res.json({ success: true, message: 'Owner PIN cleared' });
  } catch (err: any) {
    log.error('[OwnerPin] clear failed:', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

identityPinRouter.get('/pin/owner/status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    const status = await getEntityPinStatus({
      entity: 'owner',
      entityId: workspaceId,
      workspaceId,
    });
    return res.json(status);
  } catch (err: any) {
    log.error('[OwnerPin] status failed:', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ─── CLIENT PIN (tenant-manager) ─────────────────────────────────────────────

const CLIENT_PIN_ROLES = ['manager', 'department_manager', 'org_admin', 'org_owner', 'co_owner'];

identityPinRouter.post(
  '/pin/client/:clientId/set',
  requireAuth,
  // @ts-expect-error — TS migration: fix in refactoring sprint
  requireWorkspaceRole(CLIENT_PIN_ROLES),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { clientId } = req.params;
      const workspaceId = req.workspaceId;
      const actorUserId = (req as any).user?.id;
      if (!workspaceId || !actorUserId) return res.status(401).json({ error: 'UNAUTHENTICATED' });

      const { pin } = req.body || {};
      await setEntityPin({
        entity: 'client',
        entityId: clientId,
        pin,
        workspaceId,
        actorUserId,
        actorPlatformRole: (req as any).platformRole ?? null,
      });

      return res.json({ success: true, message: 'Client PIN saved' });
    } catch (err: any) {
      const msg = err?.message || 'Failed to set client PIN';
      if (msg.startsWith('INVALID_PIN')) return res.status(400).json({ error: 'INVALID_PIN', message: msg });
      if (msg.startsWith('PIN_TARGET_NOT_FOUND')) return res.status(404).json({ error: 'NOT_FOUND', message: msg });
      log.error('[ClientPin] set failed:', msg);
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

identityPinRouter.delete(
  '/pin/client/:clientId',
  requireAuth,
  // @ts-expect-error — TS migration: fix in refactoring sprint
  requireWorkspaceRole(CLIENT_PIN_ROLES),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { clientId } = req.params;
      const workspaceId = req.workspaceId;
      const actorUserId = (req as any).user?.id;
      if (!workspaceId || !actorUserId) return res.status(401).json({ error: 'UNAUTHENTICATED' });

      await clearEntityPin({
        entity: 'client',
        entityId: clientId,
        workspaceId,
        actorUserId,
        actorPlatformRole: (req as any).platformRole ?? null,
      });

      return res.json({ success: true, message: 'Client PIN cleared' });
    } catch (err: any) {
      log.error('[ClientPin] clear failed:', err?.message);
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

identityPinRouter.get(
  '/pin/client/:clientId/status',
  requireAuth,
  // @ts-expect-error — TS migration: fix in refactoring sprint
  requireWorkspaceRole(CLIENT_PIN_ROLES),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { clientId } = req.params;
      const workspaceId = req.workspaceId;
      if (!workspaceId) return res.status(401).json({ error: 'UNAUTHENTICATED' });

      const status = await getEntityPinStatus({
        entity: 'client',
        entityId: clientId,
        workspaceId,
      });
      return res.json(status);
    } catch (err: any) {
      log.error('[ClientPin] status failed:', err?.message);
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

// ─── CLIENT PIN (self-service from client portal) ────────────────────────────
// A logged-in client portal user may manage the PIN on the clients row linked
// to their own user account. We resolve the client by user_id and then carry
// the client's own workspace_id through to setEntityPin/clearEntityPin, whose
// UPDATE clauses enforce the tenant scope via WHERE workspace_id = $N.

async function resolveSelfClient(
  req: AuthenticatedRequest,
): Promise<{ clientId: string; workspaceId: string } | null> {
  const userId = (req as any).user?.id;
  if (!userId) return null;
  const { pool } = await import('../db');
  const r = await pool.query(
    `SELECT id, workspace_id FROM clients WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  if (!r.rows.length) return null;
  return { clientId: r.rows[0].id, workspaceId: r.rows[0].workspace_id };
}

identityPinRouter.get('/pin/client/self/status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const self = await resolveSelfClient(req);
    if (!self) return res.status(404).json({ error: 'CLIENT_NOT_LINKED' });
    const status = await getEntityPinStatus({
      entity: 'client',
      entityId: self.clientId,
      workspaceId: self.workspaceId,
    });
    return res.json({ ...status, clientId: self.clientId });
  } catch (err: any) {
    log.error('[ClientPin] self-status failed:', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

identityPinRouter.post('/pin/client/self/set', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const self = await resolveSelfClient(req);
    if (!self) return res.status(404).json({ error: 'CLIENT_NOT_LINKED' });
    const actorUserId = (req as any).user?.id;
    const { pin } = req.body || {};
    await setEntityPin({
      entity: 'client',
      entityId: self.clientId,
      pin,
      workspaceId: self.workspaceId,
      actorUserId,
      actorPlatformRole: (req as any).platformRole ?? null,
    });
    return res.json({ success: true, message: 'Client PIN saved' });
  } catch (err: any) {
    const msg = err?.message || 'Failed to set client PIN';
    if (msg.startsWith('INVALID_PIN')) return res.status(400).json({ error: 'INVALID_PIN', message: msg });
    if (msg.startsWith('PIN_TARGET_NOT_FOUND')) return res.status(404).json({ error: 'NOT_FOUND', message: msg });
    log.error('[ClientPin] self-set failed:', msg);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

identityPinRouter.delete('/pin/client/self', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const self = await resolveSelfClient(req);
    if (!self) return res.status(404).json({ error: 'CLIENT_NOT_LINKED' });
    const actorUserId = (req as any).user?.id;
    await clearEntityPin({
      entity: 'client',
      entityId: self.clientId,
      workspaceId: self.workspaceId,
      actorUserId,
      actorPlatformRole: (req as any).platformRole ?? null,
    });
    return res.json({ success: true, message: 'Client PIN cleared' });
  } catch (err: any) {
    log.error('[ClientPin] self-clear failed:', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ─── COMBINED IDENTITY + PIN VERIFY (Trinity / HelpAI) ───────────────────────
// No workspace auth required — this is the entry point for inbound channels
// where the caller only has the universal code + PIN. Rate-limited to prevent
// brute force. Returns the resolved entity on success.

identityPinRouter.post('/verify-with-pin', pinVerifyLimiter, async (req: Request, res: Response) => {
  try {
    const { code, pin } = req.body || {};
    if (!code || !pin) {
      return res.status(400).json({ valid: false, error: 'code and pin are required' });
    }
    const result = await verifyIdentityAndPin({ code: String(code), pin: String(pin) });
    if (!result.valid) {
      const status = result.reason === 'not_found' ? 404
        : result.reason === 'no_pin' ? 400
        : 401;
      return res.status(status).json({ valid: false, reason: result.reason });
    }
    return res.json({
      valid: true,
      entity: result.entity,
      entityId: result.entityId,
      workspaceId: result.workspaceId,
      name: result.name,
    });
  } catch (err: any) {
    log.error('[IdentityPin] verify-with-pin failed:', err?.message);
    return res.status(500).json({ valid: false, error: 'INTERNAL_ERROR' });
  }
});
