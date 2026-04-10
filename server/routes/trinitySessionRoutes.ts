import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import type { AuthenticatedRequest } from "../rbac";
import { trinityContextManager } from "../services/ai-brain/trinityContextManager";
import { createLogger } from '../lib/logger';
const log = createLogger('TrinitySessionRoutes');


const router = Router();

// SECURITY: workspaceId must come exclusively from the JWT-populated req.workspaceId.
// Never accept workspaceId from query params, body, or headers — any such value is silently ignored.
// A missing req.workspaceId means the auth middleware did not set workspace context → 401.

router.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user || (req as any).user?.id || (req.user as any)?.claims?.sub;
    const workspaceId = req.workspaceId;

    if (!workspaceId) {
      return res.status(403).json({ success: false, error: "Workspace context missing from session" });
    }

    if (!userId) {
      log.warn("[Trinity Session] No userId in authenticated request, returning fallback session");
      return res.json({
        success: true,
        sessionId: `fallback-${Date.now()}`,
        turnCount: 0,
        knowledgeGaps: [],
        pendingClarifications: [],
      });
    }

    const context = await trinityContextManager.getEnrichedSessionContext(userId, workspaceId);
    res.json({ success: true, sessionId: context.sessionId, turnCount: context.turns.length, knowledgeGaps: context.knowledgeGaps, pendingClarifications: context.pendingClarifications });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post("/:sessionId/turn", async (req: AuthenticatedRequest, res) => {
  try {
    const { sessionId } = req.params;
    const { role, content, contentType, toolCalls, toolResults, confidenceScore, confidenceFactors } = req.body;
    if (!role || !content) return res.status(400).json({ success: false, error: "role and content required" });
    const turn = await trinityContextManager.addTurn(sessionId, role, content, { contentType, toolCalls, toolResults, confidenceScore, confidenceFactors });
    if (!turn) return res.status(500).json({ success: false, error: "Failed to add turn" });
    res.json({ success: true, turn });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post("/:sessionId/escalate", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!;
    const workspaceId = req.workspaceId;

    if (!workspaceId) {
      return res.status(403).json({ success: false, error: "Workspace context missing from session" });
    }

    const { sessionId } = req.params;
    const { reason, urgency } = req.body;
    if (!reason) return res.status(400).json({ success: false, error: "reason required" });
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const context = await trinityContextManager.getEnrichedSessionContext(userId, workspaceId);
    if (context.sessionId !== sessionId) return res.status(404).json({ success: false, error: "Session not found" });
    const success = await trinityContextManager.escalateToSupport(context, reason, urgency || 'medium');
    res.json({ success });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post("/:sessionId/end", async (req: AuthenticatedRequest, res) => {
  try {
    const { sessionId } = req.params;
    const success = await trinityContextManager.endSession(sessionId);
    res.json({ success });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

export default router;
