/**
 * Trinity Control Console API Routes
 * ===================================
 * Real-time streaming endpoints for Trinity AI Brain's cognitive process
 * 
 * Provides:
 * - SSE streaming of thought signatures and action logs
 * - Historical timeline queries
 * - Platform awareness summary
 */

import { Router, Request, Response } from 'express';
import { trinityControlConsole, sanitizeQueryResult } from '../services/ai-brain/trinityControlConsole';
import { requirePlatformStaff, requirePlatformAdmin } from '../rbac';
import { createLogger } from '../lib/logger';
import { sanitizeError } from '../middleware/errorHandler';
const log = createLogger('TrinityControlConsoleRoutes');


const router = Router();

// Type for authenticated request
interface AuthenticatedRequest extends Request {
  workspaceId?: string;
  user?: any;
}

/**
 * GET /api/trinity/control-console/stream
 * Server-Sent Events stream for real-time cognitive updates
 * Scoped to workspace for security
 */
router.get('/stream', requirePlatformStaff, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const sessionId = (req.query.sessionId as string) || 'default';
  const requestedWorkspaceId = req.query.workspaceId as string | undefined;
  
  // For security, use the user's current workspace if available
  const user = authReq.user;
  const workspaceId = authReq.workspaceId || user?.workspaceId || requestedWorkspaceId || user?.currentWorkspaceId;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send initial connection message with server timestamp
  res.write(`data: ${JSON.stringify({ type: 'connected', sessionId, workspaceId, timestamp: new Date().toISOString() })}\n\n`);

  // Subscribe to console events with workspace scoping for multi-tenant security
  const unsubscribe = trinityControlConsole.subscribe(sessionId, (payload) => {
    try {
      // Guard against writing to closed connections
      if (res.writableEnded) {
        return;
      }
      // Add server timestamp to all payloads for consistency
      const safePayload = {
        ...payload,
        timestamp: new Date().toISOString(),
      };
      res.write(`data: ${JSON.stringify(safePayload)}\n\n`);
    } catch (error) {
      log.error('[TrinityConsole SSE] Write error:', error);
    }
  }, workspaceId); // Pass workspace ID for multi-tenant filtering

  // Keep-alive ping every 30 seconds
  const keepAlive = setInterval(() => {
    try {
      // Guard against writing to closed connections
      if (res.writableEnded) {
        clearInterval(keepAlive);
        return;
      }
      res.write(`: ping\n\n`);
    } catch (error) {
      clearInterval(keepAlive);
    }
  }, 30000);

  // Cleanup on client disconnect
  req.on('close', () => {
    unsubscribe();
    clearInterval(keepAlive);
    log.info(`[TrinityConsole] SSE client disconnected for session ${sessionId}`);
  });
  
  // Handle errors
  req.on('error', () => {
    unsubscribe();
    clearInterval(keepAlive);
  });
});

/**
 * GET /api/trinity/control-console/timeline
 * Get historical timeline of thoughts and actions
 */
router.get('/timeline', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const sessionId = (req.query.sessionId as string) || 'default';
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500); // M06: clamp to 500

    const timeline = await trinityControlConsole.getSessionTimeline(sessionId);

    // Sanitize all data before sending to client
    res.json(sanitizeQueryResult(timeline.slice(0, limit)));
  } catch (error: unknown) {
    log.error('[TrinityConsole] Timeline error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to fetch timeline' });
  }
});

/**
 * GET /api/trinity/control-console/thoughts
 * Get recent thought signatures
 */
router.get('/thoughts', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const sessionId = req.query.sessionId as string | undefined;
    const workspaceId = req.query.workspaceId as string | undefined;
    const runId = req.query.runId as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 500); // M07: clamp to 500

    const thoughts = await trinityControlConsole.getRecentThoughts({
      sessionId,
      workspaceId,
      runId,
      limit,
    });

    // Sanitize all data before sending to client
    res.json({
      success: true,
      thoughts: sanitizeQueryResult(thoughts),
      count: thoughts.length,
    });
  } catch (error: unknown) {
    log.error('[TrinityConsole] Thoughts error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to fetch thoughts' });
  }
});

/**
 * GET /api/trinity/control-console/actions
 * Get recent action logs
 */
router.get('/actions', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const sessionId = req.query.sessionId as string | undefined;
    const workspaceId = req.query.workspaceId as string | undefined;
    const runId = req.query.runId as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500); // M08: clamp to 500

    const actions = await trinityControlConsole.getRecentActions({
      sessionId,
      workspaceId,
      runId,
      limit,
    });

    // Sanitize all data before sending to client
    res.json({
      success: true,
      actions: sanitizeQueryResult(actions),
      count: actions.length,
    });
  } catch (error: unknown) {
    log.error('[TrinityConsole] Actions error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to fetch actions' });
  }
});

/**
 * GET /api/trinity/control-console/awareness
 * Get platform awareness summary
 */
router.get('/awareness', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const summary = trinityControlConsole.getAwarenessSummary();
    const gaps = trinityControlConsole.getAwarenessGaps();

    // Sanitize all data before sending to client
    res.json({
      success: true,
      summary: sanitizeQueryResult(summary),
      gaps: sanitizeQueryResult(gaps),
      streamCount: trinityControlConsole.getActiveStreamCount(),
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    log.error('[TrinityConsole] Awareness error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to fetch awareness' });
  }
});

// NOTE: Thought and action logging endpoints removed for security.
// Internal AI Brain services should use trinityControlConsole.think() and trinityControlConsole.logAction() directly.
// External access to log thoughts/actions is not permitted to prevent XSS and injection attacks.

// NOTE: Database event endpoint removed for security.
// Use the platformAwarenessHelper.postDatabaseEventToAIBrain() function directly from server-side code.

export default router;
