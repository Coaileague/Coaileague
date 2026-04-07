/**
 * Deletion Protection API Routes
 * 
 * Provides endpoints for:
 * - Checking if an entity can be safely deleted
 * - Viewing deletion audit logs
 * - Recovering soft-deleted entities
 * - Managing confirmation codes
 * 
 * Security: All routes require role-based access control
 * - Check: Manager or higher
 * - Delete/Recover: Owner only
 * - Audit/Migration: Platform Admin only
 */

import { Router } from 'express';
import { requireAuth } from '../auth';
import { requireOwner, requireManager, requirePlatformAdmin } from '../rbac';
import { createLogger } from '../lib/logger';
const log = createLogger('DeletionProtectionRoutes');

import { 
  deletionProtection, 
  DeletionRequest 
} from '../services/deletionProtectionService';

const router = Router();

/**
 * Check if an entity can be safely deleted
 * Requires MANAGER role - read-only check operation
 */
router.post('/check', requireManager, async (req: any, res) => {
  try {
    const { entityType, entityId, reason } = req.body;
    const userId = req.user?.id;

    if (!entityType || !entityId) {
      return res.status(400).json({ 
        message: 'entityType and entityId are required' 
      });
    }

    const result = await deletionProtection.checkDeletion({
      entityType,
      entityId,
      requestedBy: userId || 'unknown',
      reason: reason || 'Pre-deletion check',
    });

    res.json(result);
  } catch (error) {
    log.error('[DeletionProtection] Check failed:', error);
    res.status(500).json({ 
      message: 'Failed to check deletion safety' 
    });
  }
});

/**
 * Safely delete an entity with all protection checks
 * Requires OWNER role - destructive operation
 */
router.post('/delete', requireOwner, async (req: any, res) => {
  try {
    const { entityType, entityId, reason, confirmationCode, mode } = req.body;
    const userId = req.user?.id;

    if (!entityType || !entityId) {
      return res.status(400).json({ 
        message: 'entityType and entityId are required' 
      });
    }

    const request: DeletionRequest = {
      entityType,
      entityId,
      requestedBy: userId || 'unknown',
      reason: reason || 'User requested deletion',
      confirmationCode,
      mode,
    };

    const result = await deletionProtection.safeDelete(request);

    if (!result.success) {
      if (result.error?.includes('confirmation')) {
        const code = result.error.match(/code: ([A-Z0-9]+)/)?.[1];
        return res.status(409).json({
          message: 'Deletion requires confirmation',
          confirmationRequired: true,
          confirmationCode: code,
          auditId: result.auditId,
        });
      }

      return res.status(400).json({
        message: result.error,
        auditId: result.auditId,
      });
    }

    res.json({
      success: true,
      mode: result.mode,
      recoveryDeadline: result.recoveryDeadline,
      auditId: result.auditId,
    });
  } catch (error) {
    log.error('[DeletionProtection] Delete failed:', error);
    res.status(500).json({ 
      message: 'Failed to process deletion' 
    });
  }
});

/**
 * Recover a soft-deleted entity
 * Requires OWNER role - critical recovery operation
 */
router.post('/recover', requireOwner, async (req: any, res) => {
  try {
    const { entityType, entityId } = req.body;
    const userId = req.user?.id;

    if (!entityType || !entityId) {
      return res.status(400).json({ 
        message: 'entityType and entityId are required' 
      });
    }

    const result = await deletionProtection.recover(
      entityType,
      entityId,
      userId || 'unknown'
    );

    if (!result.success) {
      return res.status(400).json({ message: result.error });
    }

    res.json({ success: true, message: 'Entity recovered successfully' });
  } catch (error) {
    log.error('[DeletionProtection] Recovery failed:', error);
    res.status(500).json({ 
      message: 'Failed to recover entity' 
    });
  }
});

/**
 * Get deletion audit log
 * Requires PLATFORM ADMIN - sensitive audit data
 */
router.get('/audit-log', requireAuth, requirePlatformAdmin, async (req: any, res) => {
  try {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 100), 1000);
    const auditLog = deletionProtection.getAuditLog(limit);
    
    res.json({ 
      records: auditLog,
      count: auditLog.length,
    });
  } catch (error) {
    log.error('[DeletionProtection] Audit log fetch failed:', error);
    res.status(500).json({ 
      message: 'Failed to fetch audit log' 
    });
  }
});

/**
 * Check migration safety for batch operations
 * Requires PLATFORM ADMIN - used by QuickBooks sync, HRIS sync, and data migration
 */
router.post('/migration-safety', requireAuth, requirePlatformAdmin, async (req: any, res) => {
  try {
    const { entityType, entityIds } = req.body;

    if (!entityType || !entityIds || !Array.isArray(entityIds)) {
      return res.status(400).json({ 
        message: 'entityType and entityIds (array) are required' 
      });
    }

    const result = await deletionProtection.checkMigrationSafety(entityType, entityIds);
    
    res.json({
      totalChecked: entityIds.length,
      safeToDelete: result.safe.length,
      blocked: result.blocked.length,
      details: result,
    });
  } catch (error) {
    log.error('[DeletionProtection] Migration safety check failed:', error);
    res.status(500).json({ 
      message: 'Failed to check migration safety' 
    });
  }
});

export default router;
