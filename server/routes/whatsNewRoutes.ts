/**
 * What's New API Routes - Platform Updates Feed
 * RBAC-aware with persistent view tracking
 */

import { Router, Response, NextFunction } from 'express';
import { 
  getUpdates, 
  getLatestUpdates, 
  getNewFeatures, 
  getUpdateById,
  getUpdatesByCategory,
  getUpdateStats,
  markUpdateViewed,
  getUnviewedCount,
  seedPlatformUpdates,
} from '../services/whatsNewService';
import { isFeatureEnabled } from '@shared/platformConfig';
import { type AuthenticatedRequest } from '../rbac';
import { createLogger } from '../lib/logger';
const log = createLogger('WhatsNewRoutes');


export const whatsNewRouter = Router();

// Seed updates on startup — deferred 120s, probes DB first before seeding
setTimeout(async () => {
  try {
    const { probeDbConnection } = await import('../db');
    const dbOk = await probeDbConnection();
    if (!dbOk) {
      log.warn('[WhatsNew] Skipping deferred seed — DB probe failed');
      return;
    }
    await seedPlatformUpdates();
  } catch (err: unknown) {
    log.warn('[WhatsNew] Deferred seed failed (non-fatal):', (err as any)?.message);
  }
}, 120000);

whatsNewRouter.get('/', async (req, res) => {
  try {
    if (!isFeatureEnabled('enableWhatsNew')) {
      return res.json({ updates: [], enabled: false });
    }

    const authReq = req as AuthenticatedRequest;
    // M04: Clamp limit to prevent unbounded DB queries (max 100, default undefined = service default)
    const rawLimitParsed = req.query.limit ? parseInt(req.query.limit as string) : undefined; const rawLimit = rawLimitParsed !== undefined ? Math.min(Math.max(1, rawLimitParsed), 500) : undefined;
    const limit = rawLimit !== undefined ? Math.min(Math.max(rawLimit, 1), 100) : undefined;
    const category = req.query.category as string | undefined;
    const includeAll = req.query.all === 'true';
    
    // Get user info from session for RBAC filtering and view tracking
    const userId = authReq.user?.id || (req as any).session?.userId;
    const userRole = authReq.workspaceRole || 'staff';

    const updates = await getUpdates({ limit, category, includeAll, userId, userRole });

    res.json({
      success: true,
      updates,
      count: updates.length,
    });
  } catch (error: unknown) {
    log.error('[WhatsNew] Error:', error);
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

whatsNewRouter.get('/latest', async (req, res) => {
  try {
    if (!isFeatureEnabled('enableWhatsNew')) {
      return res.json({ updates: [], enabled: false });
    }

    const authReq = req as AuthenticatedRequest;
    // M05: Clamp count to prevent oversized response payloads
    const count = Math.min(Math.max(req.query.count ? parseInt(req.query.count as string) : 5, 1), 50);
    // Get user from session for view tracking
    const userId = authReq.user?.id || (req as any).session?.userId;
    const userRole = authReq.workspaceRole || 'staff';
    
    const updates = await getLatestUpdates(count, userId, userRole);

    res.json({
      success: true,
      updates,
    });
  } catch (error: unknown) {
    log.error('[WhatsNew] Error:', error);
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

whatsNewRouter.get('/new-features', async (req, res) => {
  try {
    if (!isFeatureEnabled('enableWhatsNew')) {
      return res.json({ updates: [], enabled: false });
    }

    const authReq = req as AuthenticatedRequest;
    // Get user from session for view tracking
    const userId = authReq.user?.id || (req as any).session?.userId;
    const userRole = authReq.workspaceRole || 'staff';
    const updates = await getNewFeatures(userId, userRole);

    res.json({
      success: true,
      updates,
      count: updates.length,
    });
  } catch (error: unknown) {
    log.error('[WhatsNew] Error:', error);
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

whatsNewRouter.get('/unviewed-count', async (req, res) => {
  try {
    if (!isFeatureEnabled('enableWhatsNew')) {
      return res.json({ count: 0, enabled: false });
    }

    const authReq = req as AuthenticatedRequest;
    // Get user from session - this is key for proper count!
    const userId = authReq.user?.id || (req as any).session?.userId;
    if (!userId) {
      return res.json({ count: 0, message: 'Not authenticated' });
    }

    // Use storage as single source of truth for unread count
    const { storage } = await import('../storage');
    const workspaceId = authReq.workspaceId;
    const count = await storage.getUnreadPlatformUpdatesCount(userId, workspaceId);

    res.json({
      success: true,
      count,
    });
  } catch (error: unknown) {
    log.error('[WhatsNew] Error:', error);
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

whatsNewRouter.get('/stats', async (req, res) => {
  try {
    if (!isFeatureEnabled('enableWhatsNew')) {
      return res.json({ enabled: false });
    }

    const authReq = req as AuthenticatedRequest;
    const userRole = authReq.workspaceRole || 'staff';
    const stats = await getUpdateStats(userRole);

    res.json({
      success: true,
      stats,
    });
  } catch (error: unknown) {
    log.error('[WhatsNew] Error:', error);
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

whatsNewRouter.get('/category/:category', async (req, res) => {
  try {
    if (!isFeatureEnabled('enableWhatsNew')) {
      return res.json({ updates: [], enabled: false });
    }

    const authReq = req as AuthenticatedRequest;
    const category = req.params.category as 'feature' | 'improvement' | 'bugfix' | 'security' | 'announcement';
    // Get user from session for view tracking
    const userId = authReq.user?.id || (req as any).session?.userId;
    const userRole = authReq.workspaceRole || 'staff';
    
    const updates = await getUpdatesByCategory(category, userId, userRole);

    res.json({
      success: true,
      updates,
      category,
      count: updates.length,
    });
  } catch (error: unknown) {
    log.error('[WhatsNew] Error:', error);
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

whatsNewRouter.post('/mark-all-viewed', async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    // Get user from session for marking as viewed
    const userId = authReq.user?.id || (req as any).session?.userId;
    const updateIds = req.body.updateIds || [];
    const viewSource = req.body.source || 'badge-clear-all';
    
    let marked = 0;
    
    // If authenticated, mark in database
    if (userId) {
      for (const updateId of updateIds) {
        const success = await markUpdateViewed(userId, updateId, viewSource);
        if (success) marked++;
      }
    } else {
      // For unauthenticated users, just return success
      // Frontend will handle persistence via localStorage
      marked = updateIds.length;
    }

    res.json({
      success: true,
      markedCount: marked,
      totalRequested: updateIds.length,
    });
  } catch (error: unknown) {
    log.error('[WhatsNew] Error:', error);
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

whatsNewRouter.post('/:id/viewed', async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    // Get user from session for marking as viewed
    const userId = authReq.user?.id || (req as any).session?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const updateId = req.params.id;
    const viewSource = req.body.source || 'feed';
    
    const success = await markUpdateViewed(userId, updateId, viewSource);

    res.json({
      success,
      updateId,
    });
  } catch (error: unknown) {
    log.error('[WhatsNew] Error:', error);
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

whatsNewRouter.get('/:id', async (req, res) => {
  try {
    if (!isFeatureEnabled('enableWhatsNew')) {
      return res.status(404).json({ error: 'Updates not enabled' });
    }

    const authReq = req as AuthenticatedRequest;
    // Get user from session for view status
    const userId = authReq.user?.id || (req as any).session?.userId;
    const update = await getUpdateById(req.params.id, userId);

    if (!update) {
      return res.status(404).json({ error: 'Update not found' });
    }

    res.json({
      success: true,
      update,
    });
  } catch (error: unknown) {
    log.error('[WhatsNew] Error:', error);
    res.status(500).json({ error: 'An internal error occurred' });
  }
});
