/**
 * Session Checkpoint API Routes
 * Provides endpoints for session state checkpointing and recovery
 */

import { Router } from 'express';
import { sessionCheckpointService } from '../services/session/sessionCheckpointService';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../rbac';
import { db } from '../db';
import { workspaces, employees, users, systemAuditLogs } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

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

// ============================================================================
// TRINITY DIAGNOSTIC TOOLS ACCESS CONTROL
// ============================================================================

const ALLOWED_TOGGLE_ROLES = ['org_owner', 'org_admin', 'root_admin', 'deputy_admin', 'sysop', 'support_manager'];

/**
 * Get Trinity diagnostics status for a workspace
 */
sessionCheckpointRouter.get('/trinity-diagnostics/:workspaceId', async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id || authReq.session?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { workspaceId } = req.params;
    
    const workspace = await db.select({
      id: workspaces.id,
      name: workspaces.name,
      trinityDiagnosticsEnabled: workspaces.trinityDiagnosticsEnabled,
      trinityDiagnosticsEnabledAt: workspaces.trinityDiagnosticsEnabledAt,
      trinityDiagnosticsEnabledBy: workspaces.trinityDiagnosticsEnabledBy,
    })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    
    if (!workspace[0]) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    
    res.json({ 
      success: true, 
      trinityDiagnostics: {
        enabled: workspace[0].trinityDiagnosticsEnabled ?? true,
        enabledAt: workspace[0].trinityDiagnosticsEnabledAt,
        enabledBy: workspace[0].trinityDiagnosticsEnabledBy,
      }
    });
  } catch (error: any) {
    console.error('[TrinityDiagnostics] Status check error:', error);
    res.status(500).json({ error: 'Failed to check Trinity diagnostics status' });
  }
});

/**
 * Toggle Trinity diagnostics access for a workspace
 * Only org owners, org admins, and root/support roles can toggle
 */
sessionCheckpointRouter.patch('/trinity-diagnostics/:workspaceId/toggle', async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id || authReq.session?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { workspaceId } = req.params;
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled (boolean) is required' });
    }
    
    // Check user permission (org owner, org admin, or platform support roles)
    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    
    if (!user[0]) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const platformRole = user[0].platformRole;
    const isPlatformSupport = ['root_admin', 'deputy_admin', 'sysop', 'support_manager'].includes(platformRole || '');
    
    // If not platform support, check workspace ownership or employee role
    if (!isPlatformSupport) {
      // Check if user is workspace owner
      const workspace = await db.select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      
      const isOwner = workspace[0]?.ownerId === userId;
      
      // Check employee role (for org_admin, department_manager, etc.)
      let isAdmin = false;
      if (!isOwner) {
        const employee = await db.select()
          .from(employees)
          .where(and(
            eq(employees.workspaceId, workspaceId),
            eq(employees.userId, userId)
          ))
          .limit(1);
        
        isAdmin = ['org_admin', 'department_manager'].includes(employee[0]?.role || '');
      }
      
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ 
          error: 'Forbidden: Only org owners, org admins, or support staff can toggle Trinity diagnostics'
        });
      }
    }
    
    // Update the workspace
    const updated = await db.update(workspaces)
      .set({
        trinityDiagnosticsEnabled: enabled,
        trinityDiagnosticsEnabledAt: new Date(),
        trinityDiagnosticsEnabledBy: userId,
      })
      .where(eq(workspaces.id, workspaceId))
      .returning();
    
    if (!updated[0]) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    
    // Audit log the change
    await db.insert(systemAuditLogs).values({
      action: enabled ? 'trinity_diagnostics_enabled' : 'trinity_diagnostics_disabled',
      entityType: 'workspace',
      entityId: workspaceId,
      userId,
      workspaceId,
      metadata: {
        previousState: !enabled,
        newState: enabled,
        changedBy: userId,
        changedByRole: isPlatformSupport ? platformRole : 'workspace_admin',
      },
    });
    
    console.log(`[TrinityDiagnostics] ${enabled ? 'Enabled' : 'Disabled'} for workspace ${workspaceId} by ${userId}`);
    
    res.json({ 
      success: true, 
      trinityDiagnostics: {
        enabled,
        enabledAt: updated[0].trinityDiagnosticsEnabledAt,
        enabledBy: userId,
      }
    });
  } catch (error: any) {
    console.error('[TrinityDiagnostics] Toggle error:', error);
    res.status(500).json({ error: 'Failed to toggle Trinity diagnostics' });
  }
});
