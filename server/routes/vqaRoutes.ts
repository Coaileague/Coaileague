/**
 * VISUAL QA API ROUTES
 * =====================
 * REST API endpoints for Trinity's Visual QA (Eyes) system.
 * 
 * Features:
 * - Manual and automated visual checks
 * - Baseline management for regression testing
 * - Findings tracking and resolution
 * - Run history and analytics
 */

import { Router } from 'express';
import { visualQaSubagent } from '../services/ai-brain/subagents/visualQaSubagent';
import { browserAutomationTool, VIEWPORT_PRESETS } from '../services/ai-brain/browserAutomationTool';
import { db } from '../db';
import { eq, and, desc } from 'drizzle-orm';
import { visualQaRuns, visualQaFindings, visualQaBaselines } from '@shared/schema';

const router = Router();

/**
 * POST /api/vqa/checks
 * Trigger a visual QA check for a page
 * Requires: system:diagnose or vqa:execute permission
 */
router.post('/checks', async (req, res) => {
  try {
    const user = req.user as any;
    if (!user?.id || !user.currentWorkspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check for required permissions (platform admin, workspace owner, or explicit VQA permission)
    const allowedRoles = ['root', 'platform_admin', 'support_lead', 'owner', 'admin'];
    if (!allowedRoles.includes(user.role) && !allowedRoles.includes(user.platformRole)) {
      return res.status(403).json({ error: 'Insufficient permissions for visual QA checks' });
    }

    const { 
      url, 
      deviceName, 
      viewport, 
      baselineId, 
      analysisPrompt, 
      autoHeal 
    } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const result = await visualQaSubagent.runVisualCheck({
      url,
      workspaceId: user.currentWorkspaceId,
      triggeredBy: user.id,
      triggerSource: 'manual',
      deviceName,
      viewport,
      baselineId,
      analysisPrompt,
      autoHeal,
    });

    res.json(result);
  } catch (error) {
    console.error('[VQA API] Check failed:', error);
    res.status(500).json({ 
      error: 'Visual check failed', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * GET /api/vqa/checks
 * Get VQA run history for workspace
 */
router.get('/checks', async (req, res) => {
  try {
    const user = req.user as any;
    if (!user?.id || !user.currentWorkspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    
    const runs = await visualQaSubagent.getRunHistory(user.currentWorkspaceId, limit);
    res.json(runs);
  } catch (error) {
    console.error('[VQA API] Get checks failed:', error);
    res.status(500).json({ error: 'Failed to get check history' });
  }
});

/**
 * GET /api/vqa/checks/:id
 * Get details of a specific VQA run
 */
router.get('/checks/:id', async (req, res) => {
  try {
    const user = req.user as any;
    if (!user?.id || !user.currentWorkspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    
    const [run] = await db.select()
      .from(visualQaRuns)
      .where(and(
        eq(visualQaRuns.id, id),
        eq(visualQaRuns.workspaceId, user.currentWorkspaceId)
      ));

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    const findings = await visualQaSubagent.getRunFindings(id);

    res.json({ run, findings });
  } catch (error) {
    console.error('[VQA API] Get run failed:', error);
    res.status(500).json({ error: 'Failed to get run details' });
  }
});

/**
 * GET /api/vqa/checks/:id/findings
 * Get findings for a specific VQA run
 */
router.get('/checks/:id/findings', async (req, res) => {
  try {
    const user = req.user as any;
    if (!user?.id || !user.currentWorkspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const findings = await visualQaSubagent.getRunFindings(id);
    res.json(findings);
  } catch (error) {
    console.error('[VQA API] Get findings failed:', error);
    res.status(500).json({ error: 'Failed to get findings' });
  }
});

/**
 * PATCH /api/vqa/findings/:id
 * Update a finding (acknowledge, mark as fixed, etc.)
 */
router.patch('/findings/:id', async (req, res) => {
  try {
    const user = req.user as any;
    if (!user?.id || !user.currentWorkspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const { status, resolutionNotes } = req.body;

    const validStatuses = ['open', 'acknowledged', 'fixed', 'ignored', 'false_positive'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updates: any = {};
    if (status) {
      updates.status = status;
      if (['fixed', 'ignored', 'false_positive'].includes(status)) {
        updates.resolvedBy = user.id;
        updates.resolvedAt = new Date();
      }
    }
    if (resolutionNotes !== undefined) {
      updates.resolutionNotes = resolutionNotes;
    }

    const [updated] = await db.update(visualQaFindings)
      .set(updates)
      .where(and(
        eq(visualQaFindings.id, id),
        eq(visualQaFindings.workspaceId, user.currentWorkspaceId)
      ))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Finding not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error('[VQA API] Update finding failed:', error);
    res.status(500).json({ error: 'Failed to update finding' });
  }
});

/**
 * POST /api/vqa/baselines
 * Create a new baseline for a page
 * Requires: vqa:manage permission (admin+)
 */
router.post('/baselines', async (req, res) => {
  try {
    const user = req.user as any;
    if (!user?.id || !user.currentWorkspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check for required permissions (platform admin, workspace owner/admin only)
    const allowedRoles = ['root', 'platform_admin', 'support_lead', 'owner', 'admin'];
    if (!allowedRoles.includes(user.role) && !allowedRoles.includes(user.platformRole)) {
      return res.status(403).json({ error: 'Insufficient permissions to manage baselines' });
    }

    const { pageId, pageName, pageUrl, deviceName } = req.body;

    if (!pageId || !pageUrl) {
      return res.status(400).json({ error: 'pageId and pageUrl are required' });
    }

    const baseline = await visualQaSubagent.createBaseline({
      workspaceId: user.currentWorkspaceId,
      pageId,
      pageName: pageName || pageId,
      pageUrl,
      deviceName,
      capturedBy: user.id,
    });

    if (!baseline) {
      return res.status(500).json({ error: 'Failed to create baseline' });
    }

    res.json(baseline);
  } catch (error) {
    console.error('[VQA API] Create baseline failed:', error);
    res.status(500).json({ error: 'Failed to create baseline' });
  }
});

/**
 * GET /api/vqa/baselines
 * Get all baselines for workspace
 */
router.get('/baselines', async (req, res) => {
  try {
    const user = req.user as any;
    if (!user?.id || !user.currentWorkspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const baselines = await visualQaSubagent.getBaselines(user.currentWorkspaceId);
    res.json(baselines);
  } catch (error) {
    console.error('[VQA API] Get baselines failed:', error);
    res.status(500).json({ error: 'Failed to get baselines' });
  }
});

/**
 * DELETE /api/vqa/baselines/:id
 * Deactivate a baseline
 */
router.delete('/baselines/:id', async (req, res) => {
  try {
    const user = req.user as any;
    if (!user?.id || !user.currentWorkspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    const [updated] = await db.update(visualQaBaselines)
      .set({ isActive: false })
      .where(and(
        eq(visualQaBaselines.id, id),
        eq(visualQaBaselines.workspaceId, user.currentWorkspaceId)
      ))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Baseline not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[VQA API] Delete baseline failed:', error);
    res.status(500).json({ error: 'Failed to delete baseline' });
  }
});

/**
 * POST /api/vqa/screenshot
 * Capture a screenshot without analysis (utility endpoint)
 */
router.post('/screenshot', async (req, res) => {
  try {
    const user = req.user as any;
    if (!user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { url, deviceName, width, height, fullPage, waitForSelector } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const result = await browserAutomationTool.captureScreenshot({
      url,
      deviceName,
      width,
      height,
      fullPage,
      waitForSelector,
    });

    res.json(result);
  } catch (error) {
    console.error('[VQA API] Screenshot failed:', error);
    res.status(500).json({ error: 'Screenshot capture failed' });
  }
});

/**
 * POST /api/vqa/ask
 * Ask a visual question about a screenshot
 */
router.post('/ask', async (req, res) => {
  try {
    const user = req.user as any;
    if (!user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { url, question, deviceName } = req.body;

    if (!url || !question) {
      return res.status(400).json({ error: 'URL and question are required' });
    }

    // Capture screenshot first
    const screenshot = await browserAutomationTool.captureScreenshot({
      url,
      deviceName: deviceName || 'desktop-1080p',
    });

    if (!screenshot.success || !screenshot.base64) {
      return res.status(500).json({ error: 'Failed to capture screenshot' });
    }

    // Ask the visual question
    const answer = await visualQaSubagent.askVisualQuestion(screenshot.base64, question);

    res.json({
      question,
      answer,
      screenshot: {
        width: screenshot.width,
        height: screenshot.height,
        captureTimeMs: screenshot.captureTimeMs,
      },
    });
  } catch (error) {
    console.error('[VQA API] Visual question failed:', error);
    res.status(500).json({ error: 'Visual question failed' });
  }
});

/**
 * GET /api/vqa/viewports
 * Get available viewport presets
 */
router.get('/viewports', async (req, res) => {
  try {
    const viewports = Object.entries(VIEWPORT_PRESETS).map(([name, config]) => ({
      name,
      ...config,
    }));
    res.json(viewports);
  } catch (error) {
    console.error('[VQA API] Get viewports failed:', error);
    res.status(500).json({ error: 'Failed to get viewports' });
  }
});

/**
 * POST /api/vqa/quick-scan
 * Trinity-triggered quick scan of key application routes
 * Returns a summary of any issues found
 */
router.post('/quick-scan', async (req, res) => {
  try {
    const user = req.user as any;
    if (!user?.id || !user.currentWorkspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Key routes to scan - expandable
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : 'http://localhost:5000';
    
    const routesToScan = [
      { path: '/', name: 'Dashboard' },
      { path: '/schedule', name: 'Schedule' },
      { path: '/employees', name: 'Employees' },
      { path: '/time-tracking', name: 'Time Tracking' },
      { path: '/payroll', name: 'Payroll' },
    ];

    const results: Array<{
      route: string;
      name: string;
      status: 'ok' | 'warning' | 'error';
      issues: number;
      summary: string;
    }> = [];

    let totalIssues = 0;
    let criticalCount = 0;
    let warningCount = 0;

    // Scan each route (limit to avoid timeout)
    const scanLimit = Math.min(routesToScan.length, 3);
    
    for (let i = 0; i < scanLimit; i++) {
      const route = routesToScan[i];
      const url = `${baseUrl}${route.path}`;
      
      try {
        const checkResult = await visualQaSubagent.runVisualCheck({
          url,
          workspaceId: user.currentWorkspaceId,
          triggeredBy: user.id,
          triggerSource: 'trinity',
          deviceName: 'desktop-1080p',
        });

        const issueCount = checkResult.findings.length;
        totalIssues += issueCount;
        
        const criticalFindings = checkResult.findings.filter(f => f.severity === 'critical' || f.severity === 'high');
        criticalCount += criticalFindings.length;
        warningCount += checkResult.findings.filter(f => f.severity === 'medium').length;

        results.push({
          route: route.path,
          name: route.name,
          status: criticalFindings.length > 0 ? 'error' : issueCount > 0 ? 'warning' : 'ok',
          issues: issueCount,
          summary: checkResult.analysis?.summary || (issueCount === 0 ? 'No issues detected' : `${issueCount} issues found`),
        });
      } catch (scanError) {
        console.error(`[VQA] Failed to scan ${route.path}:`, scanError);
        results.push({
          route: route.path,
          name: route.name,
          status: 'error',
          issues: 1,
          summary: 'Failed to scan page',
        });
        criticalCount++;
      }
    }

    // Generate Trinity summary
    const overallStatus = criticalCount > 0 ? 'critical' : warningCount > 0 ? 'needs_attention' : 'healthy';
    const trinitySummary = criticalCount > 0
      ? `Found ${criticalCount} critical issue${criticalCount > 1 ? 's' : ''} requiring immediate attention.`
      : warningCount > 0
      ? `Found ${warningCount} minor issue${warningCount > 1 ? 's' : ''} to review.`
      : `All ${scanLimit} scanned pages look healthy!`;

    res.json({
      success: true,
      overallStatus,
      summary: trinitySummary,
      totalIssues,
      criticalCount,
      warningCount,
      pagesScanned: scanLimit,
      results,
      scannedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[VQA API] Quick scan failed:', error);
    res.status(500).json({ 
      error: 'Quick scan failed', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

export default router;
