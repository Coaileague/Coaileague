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

/**
 * GET /api/ai-brain/checkpoints - Get all paused automation checkpoints
 */
aiBrainRouter.get('/checkpoints', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const checkpoints = await db.query.aiCheckpoints.findMany({
      where: (checkpoints, { eq }) => eq(checkpoints.workspaceId, workspaceId),
      orderBy: (checkpoints, { desc }) => [desc(checkpoints.createdAt)],
    });
    
    res.json(checkpoints);
  } catch (error: any) {
    console.error('Error fetching checkpoints:', error);
    res.status(500).json({ error: 'Failed to fetch checkpoints' });
  }
});

/**
 * POST /api/ai-brain/checkpoints/:id/resume - Resume automation from checkpoint
 */
aiBrainRouter.post('/checkpoints/:id/resume', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const workspaceId = req.user?.currentWorkspaceId;

    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    // Import aiCheckpoints table
    const { aiCheckpoints, workspaceCredits } = await import('@shared/schema');
    const { eq, and } = await import('drizzle-orm');

    // Fetch the checkpoint
    const checkpoint = await db.query.aiCheckpoints.findFirst({
      where: and(
        eq(aiCheckpoints.id, id),
        eq(aiCheckpoints.workspaceId, workspaceId),
        eq(aiCheckpoints.status, 'paused')
      ),
    });

    if (!checkpoint) {
      return res.status(404).json({ error: 'Checkpoint not found or already resumed' });
    }

    // Check if workspace has enough credits
    const credits = await db.query.workspaceCredits.findFirst({
      where: eq(workspaceCredits.workspaceId, workspaceId),
    });

    if (!credits || credits.balance < checkpoint.creditsNeeded) {
      return res.status(400).json({ 
        error: 'Insufficient credits',
        needed: checkpoint.creditsNeeded,
        available: credits?.balance || 0
      });
    }

    // Mark checkpoint as resumed
    await db
      .update(aiCheckpoints)
      .set({ 
        status: 'resumed',
        resumedAt: new Date()
      })
      .where(eq(aiCheckpoints.id, id));

    // Re-enqueue the automation job with resume parameters
    const result = await aiBrainService.enqueueJob({
      workspaceId,
      userId,
      skill: checkpoint.automationType,
      input: checkpoint.resumeParams,
      priority: 'high', // Resume jobs get high priority
    });

    res.json({ 
      success: true,
      checkpoint,
      job: result
    });
  } catch (error: any) {
    console.error('Error resuming checkpoint:', error);
    res.status(500).json({ error: 'Failed to resume automation' });
  }
});
