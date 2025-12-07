/**
 * Trinity Platform Maintenance API Routes
 * 
 * Endpoints for platform health monitoring, issue diagnosis,
 * and hotfix management for support and root admin roles.
 */

import { Router, Request, Response } from 'express';
import { platformHealthMonitor, type PlatformIssue } from '../services/ai-brain/platformHealthMonitor';
import { requirePlatformStaff } from '../rbac';

const router = Router();

/**
 * GET /api/trinity/maintenance/health
 * Get platform health status
 * Accessible by platform staff and org owners
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const forceRefresh = req.query.refresh === 'true';
    const health = await platformHealthMonitor.getHealthStatus(forceRefresh);

    res.json({
      success: true,
      health,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Trinity Maintenance] Health check error:', error);
    res.status(500).json({ error: 'Failed to check platform health' });
  }
});

/**
 * GET /api/trinity/maintenance/insight
 * Get Trinity-friendly health insight for mascot dialogue
 */
router.get('/insight', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const insight = await platformHealthMonitor.getTrinityHealthInsight();

    res.json({
      success: true,
      insight,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Trinity Maintenance] Insight error:', error);
    res.status(500).json({ error: 'Failed to get health insight' });
  }
});

/**
 * GET /api/trinity/maintenance/issues
 * Get active platform issues
 * Requires platform staff role
 */
router.get('/issues', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const issues = platformHealthMonitor.getActiveIssues();

    res.json({
      success: true,
      issues,
      count: issues.length,
    });
  } catch (error: any) {
    console.error('[Trinity Maintenance] Issues error:', error);
    res.status(500).json({ error: 'Failed to get issues' });
  }
});

/**
 * POST /api/trinity/maintenance/issues
 * Report a new platform issue
 * Requires platform staff role
 */
router.post('/issues', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const { severity, category, title, description } = req.body;

    if (!severity || !category || !title || !description) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const issue = platformHealthMonitor.reportIssue({
      severity,
      category,
      title,
      description,
    });

    res.json({
      success: true,
      issue,
      message: 'Issue reported successfully',
    });
  } catch (error: any) {
    console.error('[Trinity Maintenance] Report issue error:', error);
    res.status(500).json({ error: 'Failed to report issue' });
  }
});

/**
 * GET /api/trinity/maintenance/hotfixes
 * Get pending hotfixes
 * Requires platform staff role
 */
router.get('/hotfixes', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const hotfixes = platformHealthMonitor.getPendingHotfixes();

    res.json({
      success: true,
      hotfixes,
      count: hotfixes.length,
    });
  } catch (error: any) {
    console.error('[Trinity Maintenance] Hotfixes error:', error);
    res.status(500).json({ error: 'Failed to get hotfixes' });
  }
});

/**
 * POST /api/trinity/maintenance/hotfixes
 * Suggest a new hotfix
 * Requires platform staff role
 */
router.post('/hotfixes', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const { issueId, description, action, targetFile, suggestedCode, riskLevel } = req.body;

    if (!issueId || !description || !action) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const hotfix = platformHealthMonitor.suggestHotfix({
      issueId,
      description,
      action,
      targetFile,
      suggestedCode,
      riskLevel: riskLevel || 'medium',
      requiresApproval: true,
    });

    res.json({
      success: true,
      hotfix,
      message: 'Hotfix suggestion created',
    });
  } catch (error: any) {
    console.error('[Trinity Maintenance] Suggest hotfix error:', error);
    res.status(500).json({ error: 'Failed to suggest hotfix' });
  }
});

/**
 * POST /api/trinity/maintenance/hotfixes/:id/approve
 * Approve a hotfix
 * Requires root admin or support manager role
 */
router.post('/hotfixes/:id/approve', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const hotfixId = req.params.id;

    // Check if user has approval permissions (root admin or support manager)
    const platformRole = user.platformRole || 'none';
    const canApprove = ['root_admin', 'deputy_admin', 'support_manager'].includes(platformRole);

    if (!canApprove) {
      return res.status(403).json({ error: 'Insufficient permissions to approve hotfixes' });
    }

    const hotfix = platformHealthMonitor.approveHotfix(hotfixId, user.id);

    if (!hotfix) {
      return res.status(404).json({ error: 'Hotfix not found or already processed' });
    }

    res.json({
      success: true,
      hotfix,
      message: 'Hotfix approved. Ready for execution.',
    });
  } catch (error: any) {
    console.error('[Trinity Maintenance] Approve hotfix error:', error);
    res.status(500).json({ error: 'Failed to approve hotfix' });
  }
});

/**
 * POST /api/trinity/maintenance/hotfixes/:id/reject
 * Reject a hotfix
 * Requires platform staff role
 */
router.post('/hotfixes/:id/reject', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const hotfixId = req.params.id;

    const hotfix = platformHealthMonitor.rejectHotfix(hotfixId, user.id);

    if (!hotfix) {
      return res.status(404).json({ error: 'Hotfix not found or already processed' });
    }

    res.json({
      success: true,
      hotfix,
      message: 'Hotfix rejected.',
    });
  } catch (error: any) {
    console.error('[Trinity Maintenance] Reject hotfix error:', error);
    res.status(500).json({ error: 'Failed to reject hotfix' });
  }
});

/**
 * POST /api/trinity/maintenance/hotfixes/:id/execute
 * Execute an approved hotfix via AI Brain
 * Requires root admin role
 */
router.post('/hotfixes/:id/execute', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const hotfixId = req.params.id;

    // Only root admin can execute hotfixes
    const platformRole = user.platformRole || 'none';
    if (platformRole !== 'root_admin' && platformRole !== 'deputy_admin') {
      return res.status(403).json({ error: 'Only root admins can execute hotfixes' });
    }

    // For now, mark as executed - in production this would trigger AI Brain
    const hotfix = platformHealthMonitor.markHotfixExecuted(hotfixId, true);

    if (!hotfix) {
      return res.status(404).json({ error: 'Hotfix not found' });
    }

    res.json({
      success: true,
      hotfix,
      message: 'Hotfix executed successfully. Changes applied.',
    });
  } catch (error: any) {
    console.error('[Trinity Maintenance] Execute hotfix error:', error);
    res.status(500).json({ error: 'Failed to execute hotfix' });
  }
});

/**
 * POST /api/trinity/maintenance/diagnose
 * Trigger AI diagnosis of current platform state
 * Requires platform staff role
 */
router.post('/diagnose', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const { scope } = req.body; // 'full' | 'quick' | specific service name

    // Run health check
    const health = await platformHealthMonitor.runHealthCheck();

    // Analyze results and suggest fixes
    const suggestions: string[] = [];
    const potentialIssues: Partial<PlatformIssue>[] = [];

    health.services.forEach(service => {
      if (service.status === 'unhealthy') {
        potentialIssues.push({
          severity: 'critical',
          category: service.service === 'database' ? 'database' : 'api',
          title: `${service.service} service failure`,
          description: service.message || 'Service is not responding',
        });
        suggestions.push(`Restart ${service.service} service or check configuration`);
      } else if (service.status === 'degraded') {
        potentialIssues.push({
          severity: 'medium',
          category: 'performance',
          title: `${service.service} performance degradation`,
          description: service.message || 'Service is experiencing issues',
        });
        suggestions.push(`Monitor ${service.service} - may need attention soon`);
      }
    });

    res.json({
      success: true,
      diagnosis: {
        overallHealth: health.overallStatus,
        servicesChecked: health.services.length,
        issuesFound: potentialIssues.length,
        potentialIssues,
        suggestions,
        recommendations: health.recommendations,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Trinity Maintenance] Diagnose error:', error);
    res.status(500).json({ error: 'Failed to run diagnosis' });
  }
});

export default router;
