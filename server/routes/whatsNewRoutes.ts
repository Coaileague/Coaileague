/**
 * What's New API Routes - Platform Updates Feed
 * RBAC-aware with persistent view tracking
 */

import { Router } from 'express';
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
import { AuthenticatedRequest } from '../rbac';

export const whatsNewRouter = Router();

// Seed updates on startup
seedPlatformUpdates().catch(console.error);

whatsNewRouter.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    if (!isFeatureEnabled('enableWhatsNew')) {
      return res.json({ updates: [], enabled: false });
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const category = req.query.category as string | undefined;
    const includeAll = req.query.all === 'true';
    
    // Get user info for RBAC filtering and view tracking
    const userId = req.user?.id;
    const userRole = req.workspaceRole || 'staff';

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

whatsNewRouter.get('/latest', async (req: AuthenticatedRequest, res) => {
  try {
    if (!isFeatureEnabled('enableWhatsNew')) {
      return res.json({ updates: [], enabled: false });
    }

    const count = req.query.count ? parseInt(req.query.count as string) : 5;
    const userId = req.user?.id;
    const userRole = req.workspaceRole || 'staff';
    
    const updates = await getLatestUpdates(count, userId, userRole);

    res.json({
      success: true,
      updates,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

whatsNewRouter.get('/new-features', async (req: AuthenticatedRequest, res) => {
  try {
    if (!isFeatureEnabled('enableWhatsNew')) {
      return res.json({ updates: [], enabled: false });
    }

    const userId = req.user?.id;
    const userRole = req.workspaceRole || 'staff';
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

whatsNewRouter.get('/unviewed-count', async (req: AuthenticatedRequest, res) => {
  try {
    if (!isFeatureEnabled('enableWhatsNew')) {
      return res.json({ count: 0, enabled: false });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.json({ count: 0, message: 'Not authenticated' });
    }

    const userRole = req.workspaceRole || 'staff';
    const count = await getUnviewedCount(userId, userRole);

    res.json({
      success: true,
      count,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

whatsNewRouter.get('/stats', async (req: AuthenticatedRequest, res) => {
  try {
    if (!isFeatureEnabled('enableWhatsNew')) {
      return res.json({ enabled: false });
    }

    const userRole = req.workspaceRole || 'staff';
    const stats = await getUpdateStats(userRole);

    res.json({
      success: true,
      stats,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

whatsNewRouter.get('/category/:category', async (req: AuthenticatedRequest, res) => {
  try {
    if (!isFeatureEnabled('enableWhatsNew')) {
      return res.json({ updates: [], enabled: false });
    }

    const category = req.params.category as 'feature' | 'improvement' | 'bugfix' | 'security' | 'announcement';
    const userId = req.user?.id;
    const userRole = req.workspaceRole || 'staff';
    
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

whatsNewRouter.post('/:id/viewed', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
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

whatsNewRouter.get('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    if (!isFeatureEnabled('enableWhatsNew')) {
      return res.status(404).json({ error: 'Updates not enabled' });
    }

    const userId = req.user?.id;
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
