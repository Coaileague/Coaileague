/**
 * Universal Device Loader API Routes
 * 
 * Provides optimized settings based on device detection.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { deviceLoader, type DeviceCapabilities } from '../services/universalLoader/deviceLoader';
import { z } from 'zod';
import { requireAuth } from '../auth';
import { createLogger } from '../lib/logger';
const log = createLogger('DeviceLoaderRoutes');


const router = Router();

router.use(requireAuth);

// Schema for client capabilities
const capabilitiesSchema = z.object({
  screenWidth: z.number().optional(),
  screenHeight: z.number().optional(),
  devicePixelRatio: z.number().optional(),
  touchSupport: z.boolean().optional(),
  cpuCores: z.number().optional(),
  memoryGb: z.number().optional(),
  connectionType: z.string().optional(),
});

/**
 * GET /api/device/settings
 * Get optimized settings based on user agent (quick detection)
 */
router.get('/settings', (req: Request, res: Response) => {
  try {
    const userAgent = req.headers['user-agent'] || '';
    const settings = deviceLoader.getQuickSettings(userAgent);
    const parsed = deviceLoader.parseUserAgent(userAgent);

    res.json({
      success: true,
      deviceType: parsed.deviceType || 'desktop',
      platform: parsed.platform || 'unknown',
      browser: parsed.browser || 'unknown',
      settings,
    });
  } catch (error: unknown) {
    log.error('[DeviceLoader] Settings error:', error);
    res.status(500).json({ error: 'Failed to get device settings' });
  }
});

/**
 * POST /api/device/profile
 * Create or update device profile with detailed capabilities
 */
router.post('/profile', async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const userAgent = req.headers['user-agent'] || '';
    
    // Validate client capabilities
    const validation = capabilitiesSchema.safeParse(req.body);
    const clientCaps = validation.success ? validation.data : {};

    // Parse user agent
    const parsed = deviceLoader.parseUserAgent(userAgent);

    // Build full capabilities
    const capabilities: DeviceCapabilities = {
      deviceType: parsed.deviceType || 'desktop',
      platform: parsed.platform || 'unknown',
      browser: parsed.browser || 'unknown',
      browserVersion: parsed.browserVersion || '',
      screenWidth: clientCaps.screenWidth || 1920,
      screenHeight: clientCaps.screenHeight || 1080,
      devicePixelRatio: clientCaps.devicePixelRatio || 1,
      touchSupport: clientCaps.touchSupport ?? parsed.touchSupport ?? false,
      cpuCores: clientCaps.cpuCores,
      memoryGb: clientCaps.memoryGb,
      connectionType: clientCaps.connectionType,
    };

    // If user is authenticated, save profile
    if (user?.id) {
      const result = await deviceLoader.loadDeviceProfile(user.id, capabilities);
      res.json({
        success: true,
        ...result,
      });
    } else {
      // Anonymous user - just compute settings
      const settings = deviceLoader.getOptimizedSettings(capabilities);
      res.json({
        success: true,
        capabilities,
        settings,
        cached: false,
      });
    }
  } catch (error: unknown) {
    log.error('[DeviceLoader] Profile error:', error);
    res.status(500).json({ error: 'Failed to create device profile' });
  }
});

/**
 * DELETE /api/device/cache
 * Clear cached settings for current user
 */
router.delete('/cache', (req: Request, res: Response) => {
  try {
    const user = req.user;
    
    if (user?.id) {
      deviceLoader.clearUserCache(user.id);
      res.json({ success: true, message: 'Cache cleared' });
    } else {
      res.json({ success: true, message: 'No user cache to clear' });
    }
  } catch (error: unknown) {
    log.error('[DeviceLoader] Cache clear error:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

export default router;
