/**
 * What's New API Routes - Platform Updates Feed
 */

import { Router } from 'express';
import { 
  getUpdates, 
  getLatestUpdates, 
  getNewFeatures, 
  getUpdateById,
  getUpdatesByCategory,
  getUpdateStats 
} from '../services/whatsNewService';
import { isFeatureEnabled } from '@shared/platformConfig';

export const whatsNewRouter = Router();

whatsNewRouter.get('/', async (req, res) => {
  try {
    if (!isFeatureEnabled('enableWhatsNew')) {
      return res.json({ updates: [], enabled: false });
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const category = req.query.category as string | undefined;
    const includeAll = req.query.all === 'true';

    const updates = getUpdates({ limit, category, includeAll });

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

    const count = req.query.count ? parseInt(req.query.count as string) : 5;
    const updates = getLatestUpdates(count);

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

    const updates = getNewFeatures();

    res.json({
      success: true,
      updates,
      count: updates.length,
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

    const stats = getUpdateStats();

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

    const category = req.params.category as 'feature' | 'improvement' | 'bugfix' | 'security' | 'announcement';
    const updates = getUpdatesByCategory(category);

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

whatsNewRouter.get('/:id', async (req, res) => {
  try {
    if (!isFeatureEnabled('enableWhatsNew')) {
      return res.status(404).json({ error: 'Updates not enabled' });
    }

    const update = getUpdateById(req.params.id);

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
