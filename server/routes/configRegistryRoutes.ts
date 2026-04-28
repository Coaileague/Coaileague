import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { universalConfigRegistry, CONFIG_DOMAINS } from '../services/universalConfigRegistry';
import { requireAuth } from '../auth';
import { db } from '../db';
import { platformRoles } from '@shared/schema';
import { eq, isNull, and } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();

async function isAdmin(req: Request): Promise<boolean> {
  const userId = req.user?.id;
  if (!userId) return false;
  const [row] = await db.select({ role: platformRoles.role })
    .from(platformRoles)
    .where(and(eq(platformRoles.userId, userId), isNull(platformRoles.revokedAt)))
    .limit(1);
  return !!row;
}

function getUserId(req: Request): string {
  const user = req.user;
  return user?.id || user?.email || 'unknown';
}

function getWorkspaceId(req: Request): string | undefined {
  // @ts-expect-error — TS migration: fix in refactoring sprint
  return req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
}

router.get('/api/platform/config', requireAuth, async (req: Request, res: Response) => {
  try {
    const config = await universalConfigRegistry.getAllConfig(getWorkspaceId(req));
    res.json({ success: true, config, domains: Object.values(CONFIG_DOMAINS) });
  } catch (error: unknown) {
    res.status(500).json({ success: false, message: sanitizeError(error) });
  }
});

router.get('/api/platform/config-audit', requireAuth, async (req: Request, res: Response) => {
  try {
    const { domain, key, limit } = req.query;
    const trail = await universalConfigRegistry.getAuditTrail({
      domain: domain as string,
      key: key as string,
      workspaceId: getWorkspaceId(req),
      limit: limit ? parseInt(limit as string) : 50,
    });
    res.json({ success: true, audit: trail });
  } catch (error: unknown) {
    res.status(500).json({ success: false, message: sanitizeError(error) });
  }
});

router.post('/api/platform/config-snapshot', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!await isAdmin(req)) return res.status(403).json({ success: false, message: 'Admin access required' });
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Snapshot name is required' });

    const snapshot = await universalConfigRegistry.createSnapshot(name, {
      workspaceId: getWorkspaceId(req),
      description,
      createdBy: getUserId(req),
    });
    if (!snapshot) return res.status(500).json({ success: false, message: 'Failed to create snapshot' });
    res.json({ success: true, snapshot });
  } catch (error: unknown) {
    res.status(500).json({ success: false, message: sanitizeError(error) });
  }
});

router.post('/api/platform/config-restore/:snapshotId', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!await isAdmin(req)) return res.status(403).json({ success: false, message: 'Admin access required' });
    const restored = await universalConfigRegistry.restoreSnapshot(req.params.snapshotId, {
      changedBy: getUserId(req),
      reason: req.body?.reason || 'Manual restore',
    });
    res.json({ success: true, restored });
  } catch (error: unknown) {
    res.status(500).json({ success: false, message: sanitizeError(error) });
  }
});

router.post('/api/platform/config-seed', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!await isAdmin(req)) return res.status(403).json({ success: false, message: 'Admin access required' });
    const result = await universalConfigRegistry.seedFromDefaults();
    res.json({ success: true, ...result });
  } catch (error: unknown) {
    res.status(500).json({ success: false, message: sanitizeError(error) });
  }
});

router.get('/api/platform/config/:domain', requireAuth, async (req: Request, res: Response) => {
  try {
    const entries = await universalConfigRegistry.listByDomain(req.params.domain, getWorkspaceId(req));
    res.json({ success: true, domain: req.params.domain, entries });
  } catch (error: unknown) {
    res.status(500).json({ success: false, message: sanitizeError(error) });
  }
});

router.put('/api/platform/config/:domain/:key(*)', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!await isAdmin(req)) return res.status(403).json({ success: false, message: 'Admin access required' });
    const { domain, key } = req.params;
    const { value, description, valueType, priority, metadata, reason } = req.body;
    if (value === undefined) return res.status(400).json({ success: false, message: 'value is required' });

    const result = await universalConfigRegistry.set(domain, key, value, {
      workspaceId: getWorkspaceId(req),
      description,
      valueType,
      priority,
      metadata,
      changedBy: getUserId(req),
      changeSource: 'api',
      reason,
    });
    if (!result) return res.status(500).json({ success: false, message: 'Failed to set config' });
    res.json({ success: true, entry: result });
  } catch (error: unknown) {
    res.status(500).json({ success: false, message: sanitizeError(error) });
  }
});

router.delete('/api/platform/config/:domain/:key(*)', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!await isAdmin(req)) return res.status(403).json({ success: false, message: 'Admin access required' });
    const deleted = await universalConfigRegistry.delete(req.params.domain, req.params.key, {
      workspaceId: getWorkspaceId(req),
      changedBy: getUserId(req),
      reason: req.body?.reason,
    });
    res.json({ success: true, deleted });
  } catch (error: unknown) {
    res.status(500).json({ success: false, message: sanitizeError(error) });
  }
});

export default router;
