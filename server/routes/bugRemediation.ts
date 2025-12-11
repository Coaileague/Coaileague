/**
 * BUG REMEDIATION ROUTES
 * ======================
 * API routes for the bug report orchestrator and auto-fix approval workflow.
 * Routes:
 * - POST /api/bug-remediation/submit - Submit a bug report for AI analysis
 * - GET /api/bug-remediation/report/:id - Get bug report details
 * - GET /api/bug-remediation/analysis/:id - Get AI analysis for a bug report
 * - GET /api/bug-remediation/pending - Get pending remediations for approval
 * - POST /api/bug-remediation/:id/approve - Approve a remediation
 * - POST /api/bug-remediation/:id/reject - Reject a remediation
 * - GET /api/bug-remediation/stats - Get bug report statistics
 */

import { Router, type Request, type Response, type RequestHandler } from 'express';
import { bugReportOrchestrator } from '../services/ai-brain/bugReportOrchestrator';

interface AuthenticatedRequest extends Request {
  user?: { id: string; email?: string; isAdmin?: boolean; isSupportStaff?: boolean };
  userId?: string;
  workspaceId?: string;
}

const router = Router();

/**
 * POST /api/bug-remediation/submit
 * Submit a bug report for AI analysis
 */
router.post('/submit', (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { type, title, description, screenshot, url, userAgent } = req.body;

    if (!type || !title || !description) {
      return res.status(400).json({ 
        success: false, 
        error: 'Type, title, and description are required' 
      });
    }

    const result = await bugReportOrchestrator.submitBugReport({
      type,
      title,
      description,
      screenshot,
      url: url || req.headers.referer || 'Unknown',
      userAgent: userAgent || req.headers['user-agent'] || 'Unknown',
      timestamp: new Date().toISOString(),
      userId: req.userId,
      workspaceId: req.workspaceId,
      email: req.user?.email
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('[BugRemediation] Submit error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to submit bug report' 
    });
  }
}) as RequestHandler);

/**
 * GET /api/bug-remediation/report/:id
 * Get bug report details
 */
router.get('/report/:id', (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const report = bugReportOrchestrator.getBugReport(id);

    if (!report) {
      return res.status(404).json({ 
        success: false, 
        error: 'Bug report not found' 
      });
    }

    res.json({
      success: true,
      data: report
    });
  } catch (error: any) {
    console.error('[BugRemediation] Get report error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to get bug report' 
    });
  }
}) as RequestHandler);

/**
 * GET /api/bug-remediation/analysis/:id
 * Get AI analysis for a bug report
 */
router.get('/analysis/:id', (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const analysis = bugReportOrchestrator.getBugAnalysis(id);

    if (!analysis) {
      return res.status(404).json({ 
        success: false, 
        error: 'Analysis not found or still processing' 
      });
    }

    res.json({
      success: true,
      data: analysis
    });
  } catch (error: any) {
    console.error('[BugRemediation] Get analysis error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to get analysis' 
    });
  }
}) as RequestHandler);

/**
 * GET /api/bug-remediation/pending
 * Get pending remediations for approval (support staff only)
 */
router.get('/pending', (async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.isSupportStaff && !req.user?.isAdmin) {
      return res.status(403).json({ 
        success: false, 
        error: 'Only support staff can view pending remediations' 
      });
    }

    const pending = bugReportOrchestrator.getPendingRemediations();

    res.json({
      success: true,
      data: pending
    });
  } catch (error: any) {
    console.error('[BugRemediation] Get pending error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to get pending remediations' 
    });
  }
}) as RequestHandler);

/**
 * GET /api/bug-remediation/all
 * Get all remediations (support staff only)
 */
router.get('/all', (async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.isSupportStaff && !req.user?.isAdmin) {
      return res.status(403).json({ 
        success: false, 
        error: 'Only support staff can view remediations' 
      });
    }

    const remediations = bugReportOrchestrator.getAllRemediations();

    res.json({
      success: true,
      data: remediations
    });
  } catch (error: any) {
    console.error('[BugRemediation] Get all error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to get remediations' 
    });
  }
}) as RequestHandler);

/**
 * POST /api/bug-remediation/:id/approve
 * Approve a remediation (support staff only)
 */
router.post('/:id/approve', (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!req.user?.isSupportStaff && !req.user?.isAdmin) {
      return res.status(403).json({ 
        success: false, 
        error: 'Only support staff can approve remediations' 
      });
    }

    const result = await bugReportOrchestrator.approveRemediation(
      id, 
      req.userId || req.user?.id || 'unknown'
    );

    if (result.success) {
      res.json({
        success: true,
        data: {
          commitHash: result.commitHash
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error: any) {
    console.error('[BugRemediation] Approve error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to approve remediation' 
    });
  }
}) as RequestHandler);

/**
 * POST /api/bug-remediation/:id/reject
 * Reject a remediation (support staff only)
 */
router.post('/:id/reject', (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!req.user?.isSupportStaff && !req.user?.isAdmin) {
      return res.status(403).json({ 
        success: false, 
        error: 'Only support staff can reject remediations' 
      });
    }

    const success = await bugReportOrchestrator.rejectRemediation(
      id,
      req.userId || req.user?.id || 'unknown',
      reason || 'Rejected by support staff'
    );

    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({
        success: false,
        error: 'Remediation not found'
      });
    }
  } catch (error: any) {
    console.error('[BugRemediation] Reject error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to reject remediation' 
    });
  }
}) as RequestHandler);

/**
 * GET /api/bug-remediation/stats
 * Get bug report statistics
 */
router.get('/stats', (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = bugReportOrchestrator.getStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    console.error('[BugRemediation] Get stats error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to get statistics' 
    });
  }
}) as RequestHandler);

/**
 * GET /api/bug-remediation/:id
 * Get remediation details
 */
router.get('/:id', (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const remediation = bugReportOrchestrator.getRemediationRequest(id);

    if (!remediation) {
      return res.status(404).json({ 
        success: false, 
        error: 'Remediation not found' 
      });
    }

    res.json({
      success: true,
      data: remediation
    });
  } catch (error: any) {
    console.error('[BugRemediation] Get remediation error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to get remediation' 
    });
  }
}) as RequestHandler);

export default router;
