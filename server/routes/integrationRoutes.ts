/**
 * INTEGRATION ROUTES
 * ==================
 * API endpoints for QuickBooks integration, exception management,
 * and automation health monitoring.
 * 
 * Milestone: QBO_AUTOMATION_V1_LOCKED
 */

import { Router } from 'express';
import { db } from '../db';
import { exceptionTriageQueue, partnerDataMappings, partnerConnections } from '@shared/schema';
import { eq, and, desc, sql, count } from 'drizzle-orm';
import { requireAuth, type AuthenticatedRequest } from '../auth';

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
    const workspaceId = user?.claims?.metadata?.currentWorkspaceId;
    
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
    console.error('[IntegrationRoutes] Error fetching exceptions:', error);
    res.status(500).json({ message: 'Failed to fetch exceptions' });
  }
});

router.get('/api/exceptions/stats', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    const workspaceId = user?.claims?.metadata?.currentWorkspaceId;
    
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
        return sum + (Date.now() - new Date(e.createdAt).getTime());
      }, 0);
      stats.avgAgeHours = Math.round(totalAgeMs / exceptions.length / (1000 * 60 * 60));
    }

    res.json(stats);
  } catch (error) {
    console.error('[IntegrationRoutes] Error fetching exception stats:', error);
    res.status(500).json({ message: 'Failed to fetch exception stats' });
  }
});

router.get('/api/quickbooks/automation-health', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    const workspaceId = user?.claims?.metadata?.currentWorkspaceId;
    
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
      const tokenExpiry = connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt) : null;
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

      autopilotEnabled = connection.syncEnabled === true;
    }

    const mappings = await db.select()
      .from(partnerDataMappings)
      .where(
        and(
          eq(partnerDataMappings.workspaceId, workspaceId),
          eq(partnerDataMappings.partnerType, 'quickbooks')
        )
      );

    const confirmedMappings = mappings.filter(m => m.mappingStatus === 'confirmed').length;
    const totalMappings = mappings.length;
    const mappingCoverage = totalMappings > 0 ? Math.round((confirmedMappings / totalMappings) * 100) : 100;

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
      lastSyncStatus: connection?.lastSyncStatus || 'never',
      tokenHealth,
      mappingCoverage,
      message,
    };

    res.json(health);
  } catch (error) {
    console.error('[IntegrationRoutes] Error checking automation health:', error);
    res.status(500).json({ message: 'Failed to check automation health' });
  }
});

router.post('/api/exceptions/:id/resolve', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { action, notes } = req.body;
    const user = req.user;
    const workspaceId = user?.claims?.metadata?.currentWorkspaceId;
    const userId = user?.claims?.sub;

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
    console.error('[IntegrationRoutes] Error resolving exception:', error);
    res.status(500).json({ message: 'Failed to resolve exception' });
  }
});

router.post('/api/exceptions/:id/retry', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const workspaceId = user?.claims?.metadata?.currentWorkspaceId;

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

    if (exception.retryCount >= exception.maxRetries) {
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
    console.error('[IntegrationRoutes] Error retrying exception:', error);
    res.status(500).json({ message: 'Failed to retry exception' });
  }
});

export function registerIntegrationRoutes(app: any): void {
  app.use(router);
  console.log('[IntegrationRoutes] Registered exception and automation health routes');
}

export default router;
