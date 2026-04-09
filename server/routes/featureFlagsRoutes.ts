/**
 * Trinity Runtime Flags API Routes
 * Provides endpoints for Trinity and admins to manage runtime configuration
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth';
import { requireSysop, AuthenticatedRequest } from '../rbac';
import { trinityRuntimeFlagsService as featureFlagsService } from '../services/featureFlagsService';
import { platformEventBus } from '../services/platformEventBus';
import { createLogger } from '../lib/logger';
const log = createLogger('FeatureFlagsRoutes');


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

router.get('/api/runtime-flags', requireAuth, requireSysop, async (req, res) => {
  try {
    const { category, safetyLevel, workspaceId: queryWorkspaceId } = req.query;
    const workspaceId = (queryWorkspaceId as string) || (req as any).workspaceId;
    
    // Safety check for non-root admins
    const user = (req as any).user;
    const platformRole = (req as any).platformRole;
    if (workspaceId && workspaceId !== (req as any).workspaceId && platformRole !== 'root_admin') {
      return res.status(403).json({ success: false, error: 'Unauthorized workspace access' });
    }

    const flags = await featureFlagsService.listFlags({
      category: category as string,
      safetyLevel: safetyLevel as any,
      workspaceId: workspaceId,
      includeDisabled: req.query.includeDisabled === 'true'
    });
    
    res.json({ success: true, flags });
  } catch (error: unknown) {
    log.error('[RuntimeFlags] List error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/api/runtime-flags/bulk', requireAuth, requireSysop, async (req, res) => {
  try {
    const keys = (req.query.keys as string)?.split(',') || [];
    const queryWorkspaceId = req.query.workspaceId as string;
    const workspaceId = queryWorkspaceId || (req as any).workspaceId;

    // Safety check for non-root admins
    const platformRole = (req as any).platformRole;
    if (workspaceId && workspaceId !== (req as any).workspaceId && platformRole !== 'root_admin') {
      return res.status(403).json({ success: false, error: 'Unauthorized workspace access' });
    }
    
    if (keys.length === 0) {
      return res.status(400).json({ success: false, error: 'No keys provided' });
    }
    
    const flags = await featureFlagsService.getRuntimeFlags(keys, workspaceId);
    
    res.json({ success: true, flags });
  } catch (error: unknown) {
    log.error('[RuntimeFlags] Bulk get error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/api/runtime-flags/:key', requireAuth, async (req, res) => {
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
  } catch (error: unknown) {
    log.error('[RuntimeFlags] Get error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/api/runtime-flags/update', requireAuth, requireSysop, async (req, res) => {
  try {
    const data = updateFlagSchema.parse(req.body);
    const user = req.user;
    
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

    platformEventBus.emit('feature_flag.updated', {
      key: data.key,
      reason: data.reason,
      actorType,
      actorId,
      source: data.source,
    });

    res.json({ success: true, flag: result.flag });
  } catch (error: unknown) {
    log.error('[RuntimeFlags] Update error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/api/runtime-flags/toggle', requireAuth, requireSysop, async (req, res) => {
  try {
    const data = toggleFlagSchema.parse(req.body);
    const user = req.user;
    
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
    
    platformEventBus.emit('feature_flag.toggled', {
      key: data.key,
      reason: data.reason,
      actorType,
      actorId,
      newValue: result.flag?.currentValue,
    });

    log.info(`[RuntimeFlags] Trinity toggled '${data.key}' - reason: ${data.reason}`);
    res.json({ success: true, flag: result.flag });
  } catch (error: unknown) {
    log.error('[RuntimeFlags] Toggle error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/api/runtime-flags/:key/history', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 500);
    const history = await featureFlagsService.getFlagHistory(req.params.key, limit);
    
    res.json({ success: true, history });
  } catch (error: unknown) {
    log.error('[RuntimeFlags] History error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/api/runtime-flags/:key/rollback', requireAuth, requireSysop, async (req, res) => {
  try {
    const user = req.user;
    
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
    
    platformEventBus.emit('feature_flag.rolled_back', {
      key: req.params.key,
      actorType,
      actorId,
      restoredValue: result.flag?.currentValue,
    });

    log.info(`[RuntimeFlags] Rolled back '${req.params.key}'`);
    res.json({ success: true, flag: result.flag });
  } catch (error: unknown) {
    log.error('[RuntimeFlags] Rollback error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

export default router;
