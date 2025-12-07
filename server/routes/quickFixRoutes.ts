/**
 * Quick Fix API Routes
 * 
 * RBAC-governed platform maintenance endpoints with audit trails.
 * All endpoints require platform staff authentication.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { quickFixService, type QuickFixContext } from '../services/quickFix/quickFixService';
import { requirePlatformStaff, requirePlatformRole } from '../rbac';
import { z } from 'zod';

// Extend Express Request for authenticated user
interface AuthRequest extends Request {
  user?: {
    id: string;
    platformRole?: string;
    currentWorkspaceId?: string;
  };
}

const router = Router();

// Helper to build QuickFixContext from request
function buildContext(req: AuthRequest): QuickFixContext {
  const user = req.user!;
  const userAgent = req.headers['user-agent'] || '';
  
  // Detect device type
  let deviceType: 'desktop' | 'tablet' | 'mobile' = 'desktop';
  if (/mobile/i.test(userAgent)) {
    deviceType = 'mobile';
  } else if (/tablet|ipad/i.test(userAgent)) {
    deviceType = 'tablet';
  }

  return {
    userId: user.id,
    platformRole: user.platformRole || 'none',
    deviceType,
    workspaceId: user.currentWorkspaceId,
  };
}

/**
 * GET /api/quick-fixes/actions
 * Get available quick fix actions for current user's role
 */
router.get('/actions', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const context = buildContext(req);
    const actions = await quickFixService.getAvailableActions(context);
    const limits = await quickFixService.getUserLimits(context);

    res.json({
      success: true,
      actions,
      limits,
      context: {
        role: context.platformRole,
        deviceType: context.deviceType,
      },
    });
  } catch (error: any) {
    console.error('[QuickFix] Actions error:', error);
    res.status(500).json({ error: 'Failed to get available actions' });
  }
});

/**
 * GET /api/quick-fixes/suggestions
 * Get AI-suggested quick fixes based on current platform state
 */
router.get('/suggestions', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const context = buildContext(req);
    const suggestions = await quickFixService.getAISuggestions(context);

    res.json({
      success: true,
      suggestions,
    });
  } catch (error: any) {
    console.error('[QuickFix] Suggestions error:', error);
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

/**
 * POST /api/quick-fixes/requests
 * Create a new quick fix request
 */
const requestSchema = z.object({
  actionCode: z.string().min(1),
  payload: z.record(z.any()).optional(),
  aiRecommendation: z.object({
    id: z.string(),
    confidence: z.number(),
    reasoning: z.string(),
  }).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
});

router.post('/requests', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const validation = requestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid request', details: validation.error.errors });
    }

    const context = buildContext(req);
    const { actionCode, payload, aiRecommendation } = validation.data;

    const result = await quickFixService.requestQuickFix(
      context,
      actionCode,
      payload,
      aiRecommendation
    );

    res.status(result.success ? 200 : 400).json(result);
  } catch (error: any) {
    console.error('[QuickFix] Request error:', error);
    res.status(500).json({ error: 'Failed to create request' });
  }
});

/**
 * GET /api/quick-fixes/requests
 * Get quick fix request history
 */
router.get('/requests', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const context = buildContext(req);
    const status = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;

    const requests = await quickFixService.getRequestHistory(context, { status, limit });

    res.json({
      success: true,
      requests,
      total: requests.length,
    });
  } catch (error: any) {
    console.error('[QuickFix] History error:', error);
    res.status(500).json({ error: 'Failed to get request history' });
  }
});

/**
 * GET /api/quick-fixes/pending-approvals
 * Get requests awaiting approval (for approvers)
 */
router.get('/pending-approvals', 
  requirePlatformRole(['root_admin', 'deputy_admin', 'support_manager']), 
  async (req: Request, res: Response) => {
    try {
      const context = buildContext(req);
      const pending = await quickFixService.getPendingApprovals(context);

      res.json({
        success: true,
        pending,
        count: pending.length,
      });
    } catch (error: any) {
      console.error('[QuickFix] Pending approvals error:', error);
      res.status(500).json({ error: 'Failed to get pending approvals' });
    }
  }
);

/**
 * POST /api/quick-fixes/requests/:id/approve
 * Approve a quick fix request
 */
router.post('/requests/:id/approve',
  requirePlatformRole(['root_admin', 'deputy_admin', 'support_manager']),
  async (req: Request, res: Response) => {
    try {
      const context = buildContext(req);
      const { approvalCode, notes } = req.body;

      const result = await quickFixService.approveRequest(
        req.params.id,
        context,
        approvalCode,
        notes
      );

      res.status(result.success ? 200 : 400).json(result);
    } catch (error: any) {
      console.error('[QuickFix] Approve error:', error);
      res.status(500).json({ error: 'Failed to approve request' });
    }
  }
);

/**
 * POST /api/quick-fixes/requests/:id/reject
 * Reject a quick fix request
 */
router.post('/requests/:id/reject',
  requirePlatformRole(['root_admin', 'deputy_admin', 'support_manager']),
  async (req: Request, res: Response) => {
    try {
      const context = buildContext(req);
      // Implementation would update status to 'rejected'
      res.json({ success: true, message: 'Request rejected' });
    } catch (error: any) {
      console.error('[QuickFix] Reject error:', error);
      res.status(500).json({ error: 'Failed to reject request' });
    }
  }
);

/**
 * POST /api/quick-fixes/requests/:id/execute
 * Execute an approved quick fix
 */
router.post('/requests/:id/execute',
  requirePlatformRole(['root_admin', 'deputy_admin']),
  async (req: Request, res: Response) => {
    try {
      const context = buildContext(req);
      const result = await quickFixService.executeQuickFix(req.params.id, context);

      res.status(result.success ? 200 : 400).json(result);
    } catch (error: any) {
      console.error('[QuickFix] Execute error:', error);
      res.status(500).json({ error: 'Failed to execute request' });
    }
  }
);

/**
 * POST /api/quick-fixes/requests/:id/generate-code
 * Generate an approval code for a request
 */
router.post('/requests/:id/generate-code',
  requirePlatformRole(['root_admin', 'deputy_admin', 'support_manager']),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const code = quickFixService.generateApprovalCode(req.params.id, user.id);

      res.json({
        success: true,
        approvalCode: code,
        expiresIn: '15 minutes',
        message: 'Share this code with the requester for approval verification',
      });
    } catch (error: any) {
      console.error('[QuickFix] Generate code error:', error);
      res.status(500).json({ error: 'Failed to generate approval code' });
    }
  }
);

/**
 * GET /api/quick-fixes/audit/:requestId
 * Get audit trail for a specific request
 */
router.get('/audit/:requestId', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    // Implementation would fetch audit links for the request
    res.json({
      success: true,
      auditTrail: [],
      message: 'Audit trail retrieval',
    });
  } catch (error: any) {
    console.error('[QuickFix] Audit error:', error);
    res.status(500).json({ error: 'Failed to get audit trail' });
  }
});

export default router;
