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

export const whatsNewRouter = Router();

// Seed updates on startup
seedPlatformUpdates().catch(console.error);

whatsNewRouter.get('/', async (req, res) => {
  try {
    if (!isFeatureEnabled('enableWhatsNew')) {
      return res.json({ updates: [], enabled: false });
    }

    const authReq = req as AuthenticatedRequest;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const category = req.query.category as string | undefined;
    const includeAll = req.query.all === 'true';
    
    // Get user info for RBAC filtering and view tracking
    const userId = authReq.user?.id;
    const userRole = authReq.workspaceRole || 'staff';

    const updates = await getUpdates({ limit, category, includeAll, userId, userRole });

    res.json({
      success: true,
      updates,
      count: updates.length,
    });
  } catch (error: any) {
    console.error('[WhatsNew] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

whatsNewRouter.get('/latest', async (req, res) => {
  try {
    if (!isFeatureEnabled('enableWhatsNew')) {
      return res.json({ updates: [], enabled: false });
    }

    const authReq = req as AuthenticatedRequest;
    const count = req.query.count ? parseInt(req.query.count as string) : 5;
    const userId = authReq.user?.id;
    const userRole = authReq.workspaceRole || 'staff';
    
    const updates = await getLatestUpdates(count, userId, userRole);

    res.json({
      success: true,
      updates,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

whatsNewRouter.get('/new-features', async (req, res) => {
  try {
    if (!isFeatureEnabled('enableWhatsNew')) {
      return res.json({ updates: [], enabled: false });
    }

    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    const userRole = authReq.workspaceRole || 'staff';
    const updates = await getNewFeatures(userId, userRole);

    res.json({
      success: true,
      updates,
      count: updates.length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

whatsNewRouter.get('/unviewed-count', async (req, res) => {
  try {
    if (!isFeatureEnabled('enableWhatsNew')) {
      return res.json({ count: 0, enabled: false });
    }

    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    if (!userId) {
      return res.json({ count: 0, message: 'Not authenticated' });
    }

    const userRole = authReq.workspaceRole || 'staff';
    const count = await getUnviewedCount(userId, userRole);

    res.json({
      success: true,
      count,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

whatsNewRouter.get('/category/:category', async (req, res) => {
  try {
    if (!isFeatureEnabled('enableWhatsNew')) {
      return res.json({ updates: [], enabled: false });
    }

    const authReq = req as AuthenticatedRequest;
    const category = req.params.category as 'feature' | 'improvement' | 'bugfix' | 'security' | 'announcement';
    const userId = authReq.user?.id;
    const userRole = authReq.workspaceRole || 'staff';
    
    const updates = await getUpdatesByCategory(category, userId, userRole);

    res.json({
      success: true,
      updates,
      category,
      count: updates.length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

whatsNewRouter.post('/mark-all-viewed', async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const updateIds = req.body.updateIds || [];
    const viewSource = req.body.source || 'badge-clear-all';
    
    let marked = 0;
    for (const updateId of updateIds) {
      const success = await markUpdateViewed(userId, updateId, viewSource);
      if (success) marked++;
    }

    res.json({
      success: true,
      markedCount: marked,
      totalRequested: updateIds.length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

whatsNewRouter.post('/:id/viewed', async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
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
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

whatsNewRouter.get('/:id', async (req, res) => {
  try {
    if (!isFeatureEnabled('enableWhatsNew')) {
      return res.status(404).json({ error: 'Updates not enabled' });
    }

    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    const update = await getUpdateById(req.params.id, userId);

    if (!update) {
      return res.status(404).json({ error: 'Update not found' });
    }

    res.json({
      success: true,
      update,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
