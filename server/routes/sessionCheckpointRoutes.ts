/**
 * Session Checkpoint API Routes
 * Provides endpoints for session state checkpointing and recovery
 */

import { Router } from 'express';
import { sessionCheckpointService } from '../services/session/sessionCheckpointService';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../rbac';

export const sessionCheckpointRouter = Router();

// Validation schemas
const createCheckpointSchema = z.object({
  sessionId: z.string().min(1),
  phaseKey: z.string().min(1).max(100),
  payload: z.record(z.any()),
  pageRoute: z.string().optional(),
  contextSummary: z.string().optional(),
  actionHistory: z.array(z.any()).optional(),
});

const updateCheckpointSchema = z.object({
  payload: z.record(z.any()).optional(),
  phaseKey: z.string().optional(),
  contextSummary: z.string().optional(),
  actionHistory: z.array(z.any()).optional(),
});

/**
 * Create a new checkpoint
 */
sessionCheckpointRouter.post('/', async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id || authReq.session?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const validation = createCheckpointSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid request', details: validation.error.errors });
    }
    
    const { sessionId, phaseKey, payload, pageRoute, contextSummary, actionHistory } = validation.data;
    
    const checkpoint = await sessionCheckpointService.createCheckpoint({
      userId,
      workspaceId: authReq.workspaceId,
      sessionId,
      phaseKey,
      payload,
      pageRoute,
      contextSummary,
      actionHistory,
    });
    
    res.json({ success: true, checkpoint });
  } catch (error: any) {
    console.error('[SessionCheckpoint] Create error:', error);
    res.status(500).json({ error: 'Failed to create checkpoint' });
  }
});

/**
 * Update an existing checkpoint
 */
sessionCheckpointRouter.patch('/:checkpointId', async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id || authReq.session?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { checkpointId } = req.params;
    const validation = updateCheckpointSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid request', details: validation.error.errors });
    }
    
    const checkpoint = await sessionCheckpointService.updateCheckpoint({
      checkpointId,
      ...validation.data,
    });
    
    if (!checkpoint) {
      return res.status(404).json({ error: 'Checkpoint not found or already finalized' });
    }
    
    res.json({ success: true, checkpoint });
  } catch (error: any) {
    console.error('[SessionCheckpoint] Update error:', error);
    res.status(500).json({ error: 'Failed to update checkpoint' });
  }
});

/**
 * Finalize a checkpoint (graceful session end)
 */
sessionCheckpointRouter.post('/:checkpointId/finalize', async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id || authReq.session?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { checkpointId } = req.params;
    const success = await sessionCheckpointService.finalizeCheckpoint(checkpointId, 'user_action');
    
    res.json({ success });
  } catch (error: any) {
    console.error('[SessionCheckpoint] Finalize error:', error);
    res.status(500).json({ error: 'Failed to finalize checkpoint' });
  }
});

/**
 * Get active checkpoint for current session
 */
sessionCheckpointRouter.get('/active', async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id || authReq.session?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const sessionId = req.query.sessionId as string | undefined;
    const checkpoint = await sessionCheckpointService.getActiveCheckpoint(userId, sessionId);
    
    res.json({ success: true, checkpoint });
  } catch (error: any) {
    console.error('[SessionCheckpoint] Get active error:', error);
    res.status(500).json({ error: 'Failed to get active checkpoint' });
  }
});

/**
 * Get recoverable checkpoints (for session recovery prompt)
 */
sessionCheckpointRouter.get('/recoverable', async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id || authReq.session?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const checkpoints = await sessionCheckpointService.getRecoverableCheckpoints(userId);
    
    res.json({ 
      success: true, 
      checkpoints,
      hasRecoverable: checkpoints.length > 0,
    });
  } catch (error: any) {
    console.error('[SessionCheckpoint] Get recoverable error:', error);
    res.status(500).json({ error: 'Failed to get recoverable checkpoints' });
  }
});

/**
 * Create a recovery request
 */
sessionCheckpointRouter.post('/recovery-request', async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id || authReq.session?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { checkpointId, sessionId, source } = req.body;
    
    if (!checkpointId || !sessionId) {
      return res.status(400).json({ error: 'checkpointId and sessionId are required' });
    }
    
    const requestId = await sessionCheckpointService.createRecoveryRequest(
      userId, 
      checkpointId, 
      sessionId, 
      source || 'user_initiated'
    );
    
    res.json({ success: true, requestId });
  } catch (error: any) {
    console.error('[SessionCheckpoint] Recovery request error:', error);
    res.status(500).json({ error: 'Failed to create recovery request' });
  }
});

/**
 * Complete a recovery
 */
sessionCheckpointRouter.post('/recovery/:requestId/complete', async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id || authReq.session?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { requestId } = req.params;
    const { newSessionId, userFeedback } = req.body;
    
    if (!newSessionId) {
      return res.status(400).json({ error: 'newSessionId is required' });
    }
    
    const checkpoint = await sessionCheckpointService.completeRecovery(
      requestId,
      newSessionId,
      userFeedback
    );
    
    if (!checkpoint) {
      return res.status(404).json({ error: 'Recovery request not found or already processed' });
    }
    
    res.json({ 
      success: true, 
      checkpoint,
      recoveredPayload: checkpoint.payload,
    });
  } catch (error: any) {
    console.error('[SessionCheckpoint] Recovery complete error:', error);
    res.status(500).json({ error: 'Failed to complete recovery' });
  }
});
