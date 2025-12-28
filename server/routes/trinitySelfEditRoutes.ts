/**
 * TRINITY SELF-EDIT GOVERNANCE ROUTES
 * ====================================
 * API endpoints for managing Trinity's self-editing capabilities.
 * Provides human-in-the-loop approval workflows and safety controls.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth';
import { trinitySelfEditGovernance } from '../services/ai-brain/trinitySelfEditGovernance';
import { z } from 'zod';

const router = Router();

const updateRulesSchema = z.object({
  allowedTiers: z.array(z.enum(['config', 'service_logic', 'core_infrastructure', 'database_schema'])).optional(),
  blockedPaths: z.array(z.string()).optional(),
  maxDailyChanges: z.number().min(1).max(200).optional(),
  maxChangesPerHour: z.number().min(1).max(50).optional(),
  confidenceThreshold: z.number().min(0.5).max(1.0).optional(),
  sandboxRequired: z.boolean().optional(),
  testingRequired: z.boolean().optional(),
  gitTrackingRequired: z.boolean().optional(),
});

const createProposalSchema = z.object({
  trinitySessionId: z.string(),
  workspaceId: z.string().optional(),
  changes: z.array(z.object({
    file: z.string(),
    operation: z.enum(['create', 'modify', 'delete']),
    newContent: z.string().optional(),
  })),
  reasoning: z.string(),
  confidenceScore: z.number().min(0).max(1),
  confidenceFactors: z.object({
    syntaxValidation: z.number(),
    semanticUnderstanding: z.number(),
    testCoverage: z.number(),
    historicalSuccess: z.number(),
    codebaseAlignment: z.number(),
    riskAssessment: z.number(),
  }),
});

const approvalSchema = z.object({
  notes: z.string().optional(),
});

const rejectionSchema = z.object({
  reason: z.string().min(1),
});

const isAdminRole = (role?: string): boolean => {
  const adminRoles = ['root_admin', 'deputy_admin', 'sysop'];
  return adminRoles.includes(role || '');
};

router.get('/rules', requireAuth, async (req: Request, res: Response) => {
  try {
    const rules = trinitySelfEditGovernance.getEditingRules();
    res.json({ success: true, rules });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/rules', requireAuth, async (req: Request, res: Response) => {
  try {
    const userRole = req.session?.role || (req as any).userRole;
    if (!isAdminRole(userRole)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const parsed = updateRulesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid request', details: parsed.error.flatten() });
    }

    const updatedRules = trinitySelfEditGovernance.updateEditingRules(parsed.data);
    res.json({ success: true, rules: updatedRules });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/circuit-breaker', requireAuth, async (req: Request, res: Response) => {
  try {
    const state = trinitySelfEditGovernance.getCircuitBreakerState();
    res.json({ success: true, state });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/circuit-breaker/reset', requireAuth, async (req: Request, res: Response) => {
  try {
    const userRole = req.session?.role || (req as any).userRole;
    if (!isAdminRole(userRole)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const userId = req.session?.userId || (req as any).userId;
    trinitySelfEditGovernance.resetCircuitBreaker(userId);
    
    res.json({ success: true, message: 'Circuit breaker reset' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/check-permission', requireAuth, async (req: Request, res: Response) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) {
      return res.status(400).json({ success: false, error: 'Path query parameter required' });
    }

    const result = trinitySelfEditGovernance.canEditPath(filePath);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/proposals', requireAuth, async (req: Request, res: Response) => {
  try {
    const proposals = trinitySelfEditGovernance.getPendingProposals();
    res.json({ success: true, proposals });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/proposals/:proposalId', requireAuth, async (req: Request, res: Response) => {
  try {
    const proposal = trinitySelfEditGovernance.getProposal(req.params.proposalId);
    if (!proposal) {
      return res.status(404).json({ success: false, error: 'Proposal not found' });
    }
    res.json({ success: true, proposal });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/proposals', requireAuth, async (req: Request, res: Response) => {
  try {
    const userRole = req.session?.role || (req as any).userRole;
    if (!isAdminRole(userRole)) {
      return res.status(403).json({ success: false, error: 'Admin access required to create proposals' });
    }

    const parsed = createProposalSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid request', details: parsed.error.flatten() });
    }

    const userId = req.session?.userId || (req as any).userId;
    const result = await trinitySelfEditGovernance.createChangeProposal({
      ...parsed.data,
      userId,
    });

    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/proposals/:proposalId/sandbox', requireAuth, async (req: Request, res: Response) => {
  try {
    const execution = await trinitySelfEditGovernance.executeInSandbox(req.params.proposalId);
    res.json({ success: true, execution });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/proposals/:proposalId/approve', requireAuth, async (req: Request, res: Response) => {
  try {
    const userRole = req.session?.role || (req as any).userRole;
    if (!isAdminRole(userRole)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const parsed = approvalSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid request', details: parsed.error.flatten() });
    }

    const userId = req.session?.userId || (req as any).userId;
    const proposal = await trinitySelfEditGovernance.approveProposal(
      req.params.proposalId,
      userId,
      parsed.data.notes
    );

    res.json({ success: true, proposal });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/proposals/:proposalId/reject', requireAuth, async (req: Request, res: Response) => {
  try {
    const userRole = req.session?.role || (req as any).userRole;
    if (!isAdminRole(userRole)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const parsed = rejectionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid request', details: parsed.error.flatten() });
    }

    const userId = req.session?.userId || (req as any).userId;
    const proposal = await trinitySelfEditGovernance.rejectProposal(
      req.params.proposalId,
      userId,
      parsed.data.reason
    );

    res.json({ success: true, proposal });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/proposals/:proposalId/apply', requireAuth, async (req: Request, res: Response) => {
  try {
    const userRole = req.session?.role || (req as any).userRole;
    if (!isAdminRole(userRole)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const result = await trinitySelfEditGovernance.applyApprovedChanges(req.params.proposalId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/proposals/:proposalId/rollback', requireAuth, async (req: Request, res: Response) => {
  try {
    const userRole = req.session?.role || (req as any).userRole;
    if (!isAdminRole(userRole)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const userId = req.session?.userId || (req as any).userId;
    const result = await trinitySelfEditGovernance.rollbackProposal(req.params.proposalId, userId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    const circuitState = trinitySelfEditGovernance.getCircuitBreakerState();
    const pendingProposals = trinitySelfEditGovernance.getPendingProposals();
    const rules = trinitySelfEditGovernance.getEditingRules();

    res.json({
      success: true,
      stats: {
        circuitBreakerOpen: circuitState.isOpen,
        changesInLastHour: circuitState.changesInLastHour,
        changesInLastDay: circuitState.changesInLastDay,
        errorRate: circuitState.errorRate,
        pendingProposalCount: pendingProposals.length,
        maxDailyChanges: rules.maxDailyChanges,
        maxChangesPerHour: rules.maxChangesPerHour,
        confidenceThreshold: rules.confidenceThreshold,
        sandboxRequired: rules.sandboxRequired,
        testingRequired: rules.testingRequired,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
