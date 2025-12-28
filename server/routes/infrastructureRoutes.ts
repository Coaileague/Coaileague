/**
 * INFRASTRUCTURE API ROUTES
 * ==========================
 * API endpoints for Q1 2026 infrastructure services.
 * Provides management interfaces for backups, error tracking, and key rotation.
 */

import { Router, Request, Response } from 'express';
import { durableJobQueue } from '../services/infrastructure/durableJobQueue';
import { backupService } from '../services/infrastructure/backupService';
import { errorTrackingService } from '../services/infrastructure/errorTrackingService';
import { apiKeyRotationService } from '../services/infrastructure/apiKeyRotationService';
import { getInfrastructureHealth } from '../services/infrastructure/index';

const router = Router();

// ============================================================================
// HEALTH & STATUS
// ============================================================================

router.get('/health', async (req: Request, res: Response) => {
  try {
    const health = await getInfrastructureHealth();
    res.json({
      success: true,
      data: health,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// JOB QUEUE
// ============================================================================

router.get('/jobs/stats', async (req: Request, res: Response) => {
  try {
    const stats = await durableJobQueue.getStats();
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const job = await durableJobQueue.getJobStatus(req.params.jobId);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    res.json({ success: true, data: job });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/jobs/retry-dead-letter', async (req: Request, res: Response) => {
  try {
    const { jobType } = req.body;
    const count = await durableJobQueue.retryDeadLetterJobs(jobType);
    res.json({ success: true, data: { retriedCount: count } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// BACKUPS
// ============================================================================

router.get('/backups', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const backups = await backupService.getRecentBackups(limit);
    res.json({ success: true, data: backups });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/backups/stats', async (req: Request, res: Response) => {
  try {
    const stats = await backupService.getStats();
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/backups/trigger', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const backup = await backupService.triggerManualBackup(userId);
    res.json({ success: true, data: backup });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/backups/config', (req: Request, res: Response) => {
  try {
    const config = backupService.getConfig();
    res.json({ success: true, data: config });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/backups/config', (req: Request, res: Response) => {
  try {
    const updatedConfig = backupService.updateConfig(req.body);
    res.json({ success: true, data: updatedConfig });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// ERROR TRACKING
// ============================================================================

router.get('/errors', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const errors = await errorTrackingService.getRecentErrors(limit);
    res.json({ success: true, data: errors });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/errors/stats', async (req: Request, res: Response) => {
  try {
    const windowMinutes = parseInt(req.query.window as string) || 60;
    const stats = await errorTrackingService.getStats(windowMinutes);
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/errors/alerts', (req: Request, res: Response) => {
  try {
    const rules = errorTrackingService.getAlertRules();
    res.json({ success: true, data: rules });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/errors/alerts', async (req: Request, res: Response) => {
  try {
    const rule = await errorTrackingService.addAlertRule(req.body);
    res.json({ success: true, data: rule });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// API KEY ROTATION
// ============================================================================

router.get('/keys', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.query.workspaceId as string | undefined;
    const keys = await apiKeyRotationService.getKeys(workspaceId);
    res.json({ success: true, data: keys });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/keys', async (req: Request, res: Response) => {
  try {
    const { name, keyType, workspaceId, expiresInDays, metadata } = req.body;
    const result = await apiKeyRotationService.generateKey({
      name,
      keyType,
      workspaceId,
      expiresInDays,
      metadata,
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/keys/:keyId/rotate', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { reason } = req.body;
    const result = await apiKeyRotationService.rotateKey(req.params.keyId, userId, reason);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/keys/:keyId/revoke', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { reason } = req.body;
    const success = await apiKeyRotationService.revokeKey(req.params.keyId, userId, reason);
    res.json({ success });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/keys/validate', async (req: Request, res: Response) => {
  try {
    const { keyValue } = req.body;
    const key = await apiKeyRotationService.validateKey(keyValue);
    res.json({ success: true, data: { valid: !!key, key: key ? { id: key.id, name: key.name, status: key.status } : null } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
