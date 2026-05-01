/**
 * INTEGRATION ROUTES
 * ==================
 * API endpoints for QuickBooks integration, exception management,
 * and automation health monitoring.
 * 
 * Milestone: QBO_AUTOMATION_V1_LOCKED
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { db } from '../db';
import {
  exceptionTriageQueue,
  partnerConnections
} from '@shared/schema';
import { eq, and, desc, sql, count } from 'drizzle-orm';
import { requireAuth } from '../auth';
import { type AuthenticatedRequest } from '../rbac';
import { quickbooksOAuthService } from '../services/oauth/quickbooks';
import { createLogger } from '../lib/logger';
import { z } from 'zod';
const log = createLogger('IntegrationRoutes');


const router = Router();

interface QueueStats {
  total: number;
  pending: number;
  inReview: number;
  resolved: number;
  escalated: number;
  byType: Record<string, number>;
  avgAgeHours: number;
}

interface AutomationHealth {
  status: 'GREEN' | 'YELLOW' | 'RED';
  pendingExceptions: number;
  autopilotEnabled: boolean;
  lastSyncStatus: string;
  tokenHealth: 'valid' | 'expiring_soon' | 'expired';
  mappingCoverage: number;
  message: string;
}

router.get('/api/exceptions', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId || req.workspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ message: 'No workspace context' });
    }

    const filter = req.query.filter as string || 'all';
    
    let whereClause = eq(exceptionTriageQueue.workspaceId, workspaceId);
    
    const exceptions = await db.select()
      .from(exceptionTriageQueue)
      .where(whereClause)
      .orderBy(desc(exceptionTriageQueue.createdAt))
      .limit(100);

    const filtered = filter === 'all' 
      ? exceptions 
      : exceptions.filter(e => e.status === filter);

    res.json(filtered);
  } catch (error) {
    log.error('[IntegrationRoutes] Error fetching exceptions:', error);
    res.status(500).json({ message: 'Failed to fetch exceptions' });
  }
});

router.get('/api/exceptions/stats', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId || req.workspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ message: 'No workspace context' });
    }

    const exceptions = await db.select()
      .from(exceptionTriageQueue)
      .where(eq(exceptionTriageQueue.workspaceId, workspaceId));

    const stats: QueueStats = {
      total: exceptions.length,
      pending: exceptions.filter(e => e.status === 'pending').length,
      inReview: exceptions.filter(e => e.status === 'in_review').length,
      resolved: exceptions.filter(e => e.status === 'manually_resolved' || e.status === 'auto_resolved').length,
      escalated: exceptions.filter(e => e.status === 'escalated').length,
      byType: {},
      avgAgeHours: 0,
    };

    exceptions.forEach(e => {
      const type = e.errorType || 'unknown';
      stats.byType[type] = (stats.byType[type] || 0) + 1;
    });

    if (exceptions.length > 0) {
      const totalAgeMs = exceptions.reduce((sum, e) => {
        return sum + (Date.now() - new Date(e.createdAt ?? Date.now()).getTime());
      }, 0);
      stats.avgAgeHours = Math.round(totalAgeMs / exceptions.length / (1000 * 60 * 60));
    }

    res.json(stats);
  } catch (error) {
    log.error('[IntegrationRoutes] Error fetching exception stats:', error);
    res.status(500).json({ message: 'Failed to fetch exception stats' });
  }
});

router.get('/api/quickbooks/automation-health', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId || req.workspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ message: 'No workspace context' });
    }

    const exceptions = await db.select()
      .from(exceptionTriageQueue)
      .where(
        and(
          eq(exceptionTriageQueue.workspaceId, workspaceId),
          eq(exceptionTriageQueue.status, 'pending')
        )
      );

    const pendingExceptions = exceptions.length;

    const [connection] = await db.select()
      .from(partnerConnections)
      .where(
        and(
          eq(partnerConnections.workspaceId, workspaceId),
          eq(partnerConnections.partnerType, 'quickbooks')
        )
      )
      .limit(1);

    let tokenHealth: 'valid' | 'expiring_soon' | 'expired' = 'expired';
    let autopilotEnabled = false;

    if (connection) {
      const tokenExpiry = connection.expiresAt ? new Date(connection.expiresAt) : null;
      const refreshTokenExpiry = connection.refreshTokenExpiresAt ? new Date(connection.refreshTokenExpiresAt) : null;
      const now = new Date();
      
      if (tokenExpiry) {
        const hoursUntilExpiry = (tokenExpiry.getTime() - now.getTime()) / (1000 * 60 * 60);
        if (hoursUntilExpiry > 24) {
          tokenHealth = 'valid';
        } else if (hoursUntilExpiry > 0) {
          tokenHealth = 'expiring_soon';
        } else {
          tokenHealth = 'expired';
        }
      }

      autopilotEnabled = (connection as any).metadata?.syncEnabled === true;
    }

    const mappingCoverage = 100;

    let status: 'GREEN' | 'YELLOW' | 'RED';
    let message: string;

    if (pendingExceptions === 0 && tokenHealth === 'valid' && mappingCoverage >= 90) {
      status = 'GREEN';
      message = 'All systems operational. Automation running smoothly.';
    } else if (pendingExceptions <= 3 && tokenHealth !== 'expired' && mappingCoverage >= 70) {
      status = 'YELLOW';
      message = `${pendingExceptions} exception${pendingExceptions !== 1 ? 's' : ''} require attention.`;
    } else {
      status = 'RED';
      const issues = [];
      if (pendingExceptions > 3) issues.push(`${pendingExceptions} pending exceptions`);
      if (tokenHealth === 'expired') issues.push('token expired');
      if (mappingCoverage < 70) issues.push(`${mappingCoverage}% mapping coverage`);
      message = `Action required: ${issues.join(', ')}.`;
    }

    const health: AutomationHealth = {
      status,
      pendingExceptions,
      autopilotEnabled,
      lastSyncStatus: connection?.lastSyncAt ? 'synced' : 'never',
      tokenHealth,
      mappingCoverage,
      message,
    };

    res.json(health);
  } catch (error) {
    log.error('[IntegrationRoutes] Error checking automation health:', error);
    res.status(500).json({ message: 'Failed to check automation health' });
  }
});

router.get('/api/quickbooks/pipeline-status', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId || req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ message: 'No workspace context' });
    }
    const { getWorkspacePipelineStatus } = await import('../services/financialPipelineOrchestrator');
    const status = await getWorkspacePipelineStatus(workspaceId);
    res.json(status);
  } catch (error) {
    log.error('[IntegrationRoutes] Error getting pipeline status:', error);
    res.status(500).json({ message: 'Failed to get pipeline status' });
  }
});

router.post('/api/exceptions/:id/resolve', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { action, notes } = req.body;
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId || req.workspaceId;
    const userId = user?.id;

    if (!workspaceId) {
      return res.status(400).json({ message: 'No workspace context' });
    }

    const [exception] = await db.select()
      .from(exceptionTriageQueue)
      .where(
        and(
          eq(exceptionTriageQueue.id, id),
          eq(exceptionTriageQueue.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (!exception) {
      return res.status(404).json({ message: 'Exception not found' });
    }

    await db.update(exceptionTriageQueue)
      .set({
        status: 'manually_resolved',
        resolvedAt: new Date(),
        resolvedBy: userId,
        resolutionNotes: notes,
        updatedAt: new Date(),
      })
      .where(eq(exceptionTriageQueue.id, id));

    res.json({ success: true, message: 'Exception resolved' });
  } catch (error) {
    log.error('[IntegrationRoutes] Error resolving exception:', error);
    res.status(500).json({ message: 'Failed to resolve exception' });
  }
});

router.post('/api/exceptions/:id/retry', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId || req.workspaceId;

    if (!workspaceId) {
      return res.status(400).json({ message: 'No workspace context' });
    }

    const [exception] = await db.select()
      .from(exceptionTriageQueue)
      .where(
        and(
          eq(exceptionTriageQueue.id, id),
          eq(exceptionTriageQueue.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (!exception) {
      return res.status(404).json({ message: 'Exception not found' });
    }

    if ((exception.retryCount ?? 0) >= (exception.maxRetries ?? 3)) {
      return res.status(400).json({ message: 'Maximum retries exceeded' });
    }

    await db.update(exceptionTriageQueue)
      .set({
        status: 'pending',
        retryCount: (exception.retryCount || 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(exceptionTriageQueue.id, id));

    res.json({ success: true, message: 'Retry scheduled' });
  } catch (error) {
    log.error('[IntegrationRoutes] Error retrying exception:', error);
    res.status(500).json({ message: 'Failed to retry exception' });
  }
});

/**
 * Get detailed QuickBooks connection status
 */
router.get('/api/quickbooks/connection-status', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId || req.workspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ message: 'No workspace context' });
    }

    const [connection] = await db.select()
      .from(partnerConnections)
      .where(
        and(
          eq(partnerConnections.workspaceId, workspaceId),
          eq(partnerConnections.partnerType, 'quickbooks')
        )
      )
      .limit(1);

    if (!connection) {
      return res.json({
        connected: false,
        status: 'not_connected',
        message: 'QuickBooks is not connected. Click "Connect" to authorize.',
        canRefresh: false,
        needsReauthorization: false,
      });
    }

    const now = new Date();
    const accessTokenExpiry = connection.expiresAt ? new Date(connection.expiresAt) : null;
    const refreshTokenExpiry = connection.refreshTokenExpiresAt ? new Date(connection.refreshTokenExpiresAt) : null;
    
    const accessTokenExpired = accessTokenExpiry ? now > accessTokenExpiry : true;
    const refreshTokenExpired = refreshTokenExpiry ? now > refreshTokenExpiry : true;
    const refreshTokenValid = !refreshTokenExpired && connection.refreshToken;
    
    let status: string;
    let message: string;
    let canRefresh = false;
    let needsReauthorization = false;

    if (!accessTokenExpired) {
      const hoursRemaining = accessTokenExpiry 
        ? Math.round((accessTokenExpiry.getTime() - now.getTime()) / (1000 * 60 * 60))
        : 0;
      status = hoursRemaining > 24 ? 'connected' : 'expiring_soon';
      message = hoursRemaining > 24 
        ? 'QuickBooks is connected and working properly.'
        : `Access token expires in ${hoursRemaining} hours. Will auto-refresh when needed.`;
      canRefresh = true;
    } else if (refreshTokenValid) {
      status = 'token_expired';
      message = 'Access token expired. Click "Refresh" to reconnect automatically.';
      canRefresh = true;
      needsReauthorization = false;
    } else {
      status = 'needs_reauthorization';
      message = 'Both tokens have expired. You need to reconnect to QuickBooks.';
      canRefresh = false;
      needsReauthorization = true;
    }

    // If status is disconnected, check if we can still refresh
    if (connection.status === 'disconnected' && refreshTokenValid) {
      status = 'disconnected_recoverable';
      message = 'QuickBooks was disconnected. Click "Refresh" to try reconnecting.';
      canRefresh = true;
    }

    res.json({
      connected: !accessTokenExpired && connection.status !== 'disconnected',
      status,
      message,
      canRefresh,
      needsReauthorization,
      connectionId: connection.id,
      companyName: (connection as any).metadata?.companyName || 'Unknown Company',
      lastSync: connection.lastSyncAt,
      lastError: connection.lastError,
      accessTokenExpiresAt: accessTokenExpiry?.toISOString(),
      refreshTokenExpiresAt: refreshTokenExpiry?.toISOString(),
    });
  } catch (error) {
    log.error('[IntegrationRoutes] Error getting connection status:', error);
    res.status(500).json({ message: 'Failed to get connection status' });
  }
});

/**
 * Attempt to refresh QuickBooks token
 */
router.post('/api/quickbooks/refresh-token', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId || req.workspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ message: 'No workspace context' });
    }

    const [connection] = await db.select()
      .from(partnerConnections)
      .where(
        and(
          eq(partnerConnections.workspaceId, workspaceId),
          eq(partnerConnections.partnerType, 'quickbooks')
        )
      )
      .limit(1);

    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'No QuickBooks connection found. Please connect first.' 
      });
    }

    // Check if refresh token is still valid
    const now = new Date();
    const refreshTokenExpiry = connection.refreshTokenExpiresAt 
      ? new Date(connection.refreshTokenExpiresAt) 
      : null;
    
    if (refreshTokenExpiry && now > refreshTokenExpiry) {
      return res.status(400).json({
        success: false,
        needsReauthorization: true,
        message: 'Refresh token has expired. You need to reconnect to QuickBooks.',
      });
    }

    if (!connection.refreshToken) {
      return res.status(400).json({
        success: false,
        needsReauthorization: true,
        message: 'No refresh token available. Please reconnect to QuickBooks.',
      });
    }

    // Attempt token refresh
    try {
      await quickbooksOAuthService.refreshAccessToken(connection.id);
      
      // Update connection status to connected
      await db.update(partnerConnections)
        .set({ 
          status: 'connected',
          lastError: null,
          lastErrorAt: null,
          updatedAt: new Date(),
        })
        .where(eq(partnerConnections.id, connection.id));

      res.json({
        success: true,
        message: 'Token refreshed successfully! QuickBooks is now connected.',
      });
    } catch (refreshError: unknown) {
      log.error('[IntegrationRoutes] Token refresh failed:', refreshError);
      
      // Check if it's an invalid_grant error (needs reauthorization)
      const errorMessage = refreshError.message || '';
      if (errorMessage.includes('invalid_grant') || errorMessage.includes('token')) {
        return res.status(400).json({
          success: false,
          needsReauthorization: true,
          message: 'Token refresh failed. Please reconnect to QuickBooks.',
        });
      }
      
      return res.status(500).json({
        success: false,
        message: `Token refresh failed: ${errorMessage}`,
      });
    }
  } catch (error: unknown) {
    log.error('[IntegrationRoutes] Error refreshing token:', error);
    res.status(500).json({ 
      success: false, 
      message: sanitizeError(error) || 'Failed to refresh token' 
    });
  }
});

export function registerIntegrationRoutes(app: any): void {
  app.use(router);
  log.info('[IntegrationRoutes] Registered exception and automation health routes');
}

export default router;
