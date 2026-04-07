/**
 * BUG REMEDIATION ROUTES
 * ======================
 * API routes for the bug report orchestrator and auto-fix approval workflow.
 * All routes require authentication. Approval actions require support staff role.
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, type Request, type Response, type RequestHandler } from 'express';
import { bugReportOrchestrator } from '../services/ai-brain/bugReportOrchestrator';
import { z } from 'zod';
import { requireAuth } from '../auth';
import { requirePlatformStaff } from '../rbac';
import { createLogger } from '../lib/logger';
const log = createLogger('BugRemediation');


interface AuthenticatedRequest extends Request {
  user?: any;
  userId?: string;
  workspaceId?: string;
}

const router = Router();

router.use(requireAuth);

const bugReportSchema = z.object({
  type: z.enum(['bug', 'feature', 'question', 'other']),
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(10000),
  screenshot: z.string().optional(),
  url: z.string().optional(),
  userAgent: z.string().optional()
});

const rejectReasonSchema = z.object({
  reason: z.string().min(1).max(1000).optional()
});

const requireUserAuth = (req: AuthenticatedRequest, res: Response): boolean => {
  if (!req.user?.id && !req.userId) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return false;
  }
  return true;
};

router.post('/submit', (async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireUserAuth(req, res)) return;

    const validation = bugReportSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        success: false, 
        error: 'Validation failed',
        details: validation.error.errors
      });
    }

    const { type, title, description, screenshot, url, userAgent } = validation.data;

    const result = await bugReportOrchestrator.submitBugReport({
      type,
      title,
      description,
      screenshot,
      url: url || req.headers.referer as string || 'Unknown',
      userAgent: userAgent || req.headers['user-agent'] || 'Unknown',
      timestamp: new Date().toISOString(),
      userId: req.userId,
      workspaceId: req.workspaceId,
      email: req.user?.email
    });

    res.json({ success: true, data: result });
  } catch (error: unknown) {
    log.error('[BugRemediation] Submit error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) || 'Failed to submit bug report' });
  }
}) as RequestHandler);

router.get('/report/:id', (async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireUserAuth(req, res)) return;

    const { id } = req.params;
    const report = bugReportOrchestrator.getBugReport(id);

    if (!report) {
      return res.status(404).json({ success: false, error: 'Bug report not found' });
    }

    res.json({ success: true, data: report });
  } catch (error: unknown) {
    log.error('[BugRemediation] Get report error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) || 'Failed to get bug report' });
  }
}) as RequestHandler);

router.get('/analysis/:id', (async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireUserAuth(req, res)) return;

    const { id } = req.params;
    const analysis = bugReportOrchestrator.getBugAnalysis(id);

    if (!analysis) {
      return res.status(404).json({ success: false, error: 'Analysis not found or still processing' });
    }

    res.json({ success: true, data: analysis });
  } catch (error: unknown) {
    log.error('[BugRemediation] Get analysis error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) || 'Failed to get analysis' });
  }
}) as RequestHandler);

router.get('/pending', requirePlatformStaff, (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pending = bugReportOrchestrator.getPendingRemediations();
    res.json({ success: true, data: pending });
  } catch (error: unknown) {
    log.error('[BugRemediation] Get pending error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) || 'Failed to get pending remediations' });
  }
}) as any);

router.get('/all', requirePlatformStaff, (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const remediations = bugReportOrchestrator.getAllRemediations();
    res.json({ success: true, data: remediations });
  } catch (error: unknown) {
    log.error('[BugRemediation] Get all error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) || 'Failed to get remediations' });
  }
}) as any);

router.post('/:id/approve', requirePlatformStaff, (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const approverId = req.userId || req.user?.id;

    if (!approverId) {
      return res.status(401).json({ success: false, error: 'User ID required for approval' });
    }

    const result = await bugReportOrchestrator.approveRemediation(id, approverId);

    if (result.success) {
      res.json({
        success: true,
        data: { commitHash: result.commitHash, message: 'Fix applied successfully' }
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        canRetry: true,
        hint: 'The remediation remains in pending state. You can retry after investigating the error.'
      });
    }
  } catch (error: unknown) {
    log.error('[BugRemediation] Approve error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) || 'Failed to approve remediation', canRetry: true });
  }
}) as RequestHandler);

router.post('/:id/reject', requirePlatformStaff, (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const validation = rejectReasonSchema.safeParse(req.body);
    const reason = validation.success ? validation.data.reason : undefined;

    const rejecterId = req.userId || req.user?.id;
    if (!rejecterId) {
      return res.status(401).json({ success: false, error: 'User ID required for rejection' });
    }

    const success = await bugReportOrchestrator.rejectRemediation(id, rejecterId, reason || 'Rejected by support staff');

    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, error: 'Remediation not found' });
    }
  } catch (error: unknown) {
    log.error('[BugRemediation] Reject error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) || 'Failed to reject remediation' });
  }
}) as RequestHandler);

router.get('/stats', (async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireUserAuth(req, res)) return;

    const stats = bugReportOrchestrator.getStats();
    res.json({ success: true, data: stats });
  } catch (error: unknown) {
    log.error('[BugRemediation] Get stats error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) || 'Failed to get statistics' });
  }
}) as RequestHandler);

router.get('/:id', (async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireUserAuth(req, res)) return;

    const { id } = req.params;
    const remediation = bugReportOrchestrator.getRemediationRequest(id);

    if (!remediation) {
      return res.status(404).json({ success: false, error: 'Remediation not found' });
    }

    res.json({ success: true, data: remediation });
  } catch (error: unknown) {
    log.error('[BugRemediation] Get remediation error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) || 'Failed to get remediation' });
  }
}) as RequestHandler);

export default router;
