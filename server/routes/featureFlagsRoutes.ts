/**
 * Trinity Runtime Flags API Routes
 * Provides endpoints for Trinity and admins to manage runtime configuration
 */

import { Router } from 'express';
import { z } from 'zod';
import { featureFlagsService } from '../services/featureFlagsService';

const router = Router();

const updateFlagSchema = z.object({
  key: z.string(),
  newValue: z.any(),
  reason: z.string().optional().default('No reason provided'),
  source: z.string().optional().default('api')
});

const toggleFlagSchema = z.object({
  key: z.string(),
  reason: z.string().optional().default('Toggle requested')
});

router.get('/api/runtime-flags', async (req, res) => {
  try {
    const { category, safetyLevel, workspaceId } = req.query;
    
    const flags = await featureFlagsService.listFlags({
      category: category as string,
      safetyLevel: safetyLevel as any,
      workspaceId: workspaceId as string,
      includeDisabled: req.query.includeDisabled === 'true'
    });
    
    res.json({ success: true, flags });
  } catch (error: any) {
    console.error('[RuntimeFlags] List error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/runtime-flags/:key', async (req, res) => {
  try {
    const flag = await featureFlagsService.getFlagByKey(req.params.key);
    
    if (!flag) {
      return res.status(404).json({ success: false, error: 'Flag not found' });
    }
    
    res.json({ 
      success: true, 
      flag,
      value: JSON.parse(flag.currentValue)
    });
  } catch (error: any) {
    console.error('[RuntimeFlags] Get error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/runtime-flags/bulk', async (req, res) => {
  try {
    const keys = (req.query.keys as string)?.split(',') || [];
    const workspaceId = req.query.workspaceId as string;
    
    if (keys.length === 0) {
      return res.status(400).json({ success: false, error: 'No keys provided' });
    }
    
    const flags = await featureFlagsService.getRuntimeFlags(keys, workspaceId);
    
    res.json({ success: true, flags });
  } catch (error: any) {
    console.error('[RuntimeFlags] Bulk get error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/runtime-flags/update', async (req, res) => {
  try {
    const data = updateFlagSchema.parse(req.body);
    const user = req.user as any;
    
    const actorType = req.headers['x-trinity-actor'] === 'trinity' ? 'trinity' : 
                      user ? 'admin' : 'system';
    const actorId = user?.id;
    
    const result = await featureFlagsService.updateFlagValue(
      data.key,
      data.newValue,
      { type: actorType as any, id: actorId },
      data.reason,
      data.source
    );
    
    if (!result.success) {
      return res.status(400).json({ 
        success: false, 
        error: result.error,
        requiresApproval: result.requiresApproval 
      });
    }
    
    res.json({ success: true, flag: result.flag });
  } catch (error: any) {
    console.error('[RuntimeFlags] Update error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/runtime-flags/toggle', async (req, res) => {
  try {
    const data = toggleFlagSchema.parse(req.body);
    const user = req.user as any;
    
    const actorType = req.headers['x-trinity-actor'] === 'trinity' ? 'trinity' : 
                      user ? 'admin' : 'system';
    const actorId = user?.id;
    
    const result = await featureFlagsService.toggleFlag(
      data.key,
      { type: actorType as any, id: actorId },
      data.reason
    );
    
    if (!result.success) {
      return res.status(400).json({ 
        success: false, 
        error: result.error,
        requiresApproval: result.requiresApproval 
      });
    }
    
    console.log(`[RuntimeFlags] Trinity toggled '${data.key}' - reason: ${data.reason}`);
    res.json({ success: true, flag: result.flag });
  } catch (error: any) {
    console.error('[RuntimeFlags] Toggle error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/runtime-flags/:key/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const history = await featureFlagsService.getFlagHistory(req.params.key, limit);
    
    res.json({ success: true, history });
  } catch (error: any) {
    console.error('[RuntimeFlags] History error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/runtime-flags/:key/rollback', async (req, res) => {
  try {
    const user = req.user as any;
    
    const actorType = req.headers['x-trinity-actor'] === 'trinity' ? 'trinity' : 
                      user ? 'admin' : 'system';
    const actorId = user?.id;
    
    const result = await featureFlagsService.rollbackFlag(
      req.params.key,
      { type: actorType as any, id: actorId }
    );
    
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    
    console.log(`[RuntimeFlags] Rolled back '${req.params.key}'`);
    res.json({ success: true, flag: result.flag });
  } catch (error: any) {
    console.error('[RuntimeFlags] Rollback error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
