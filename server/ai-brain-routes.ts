/**
 * AI BRAIN API ROUTES
 * Universal API for the unified AI Brain system
 */

import express, { Router, Request } from 'express';
import { requireAuth, AuthenticatedRequest } from './auth';
import { db } from './db';
import { aiBrainService } from './services/ai-brain/aiBrainService';

export const aiBrainRouter: Router = express.Router();

/**
 * GET /api/ai-brain/health - Get AI Brain health metrics
 */
aiBrainRouter.get('/health', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.user?.currentWorkspaceId;
    const metrics = await aiBrainService.getHealthMetrics(workspaceId);
    
    res.json(metrics);
  } catch (error: any) {
    console.error('Error getting AI Brain health:', error);
    res.status(500).json({ error: 'Failed to get health metrics' });
  }
});

/**
 * GET /api/ai-brain/approvals - Get pending approvals
 */
aiBrainRouter.get('/approvals', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.user?.currentWorkspaceId;
    const approvals = await aiBrainService.getPendingApprovals(workspaceId);
    
    res.json(approvals);
  } catch (error: any) {
    console.error('Error getting approvals:', error);
    res.status(500).json({ error: 'Failed to get approvals' });
  }
});

/**
 * GET /api/ai-brain/patterns - Get global patterns
 */
aiBrainRouter.get('/patterns', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // Return sample patterns for now
    // TODO: Implement actual pattern retrieval
    res.json([]);
  } catch (error: any) {
    console.error('Error getting patterns:', error);
    res.status(500).json({ error: 'Failed to get patterns' });
  }
});

/**
 * GET /api/ai-brain/jobs/recent - Get recent jobs
 */
aiBrainRouter.get('/jobs/recent', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // Return sample jobs for now
    // TODO: Implement actual job retrieval
    res.json([]);
  } catch (error: any) {
    console.error('Error getting recent jobs:', error);
    res.status(500).json({ error: 'Failed to get recent jobs' });
  }
});

/**
 * POST /api/ai-brain/jobs - Enqueue new AI job
 */
aiBrainRouter.post('/jobs', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { skill, input, priority } = req.body;
    
    const result = await aiBrainService.enqueueJob({
      workspaceId: req.user?.currentWorkspaceId,
      userId: req.user?.id,
      skill,
      input,
      priority
    });
    
    res.json(result);
  } catch (error: any) {
    console.error('Error enqueueing job:', error);
    res.status(500).json({ error: 'Failed to enqueue job' });
  }
});

/**
 * POST /api/ai-brain/jobs/:id/approve - Approve a job
 */
aiBrainRouter.post('/jobs/:id/approve', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    await aiBrainService.approveJob(id, req.user!.id);
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error approving job:', error);
    res.status(500).json({ error: 'Failed to approve job' });
  }
});

/**
 * POST /api/ai-brain/jobs/:id/reject - Reject a job
 */
aiBrainRouter.post('/jobs/:id/reject', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    await aiBrainService.rejectJob(id, req.user!.id, reason);
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error rejecting job:', error);
    res.status(500).json({ error: 'Failed to reject job' });
  }
});

/**
 * POST /api/ai-brain/feedback - Submit feedback
 */
aiBrainRouter.post('/feedback', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await aiBrainService.submitFeedback({
      workspaceId: req.user?.currentWorkspaceId,
      userId: req.user?.id,
      ...req.body
    });
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});
