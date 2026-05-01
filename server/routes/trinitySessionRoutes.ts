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
    const userId =
      req.user?.id ||
      (typeof req.user?.claims?.sub === 'string' ? req.user.claims.sub : undefined);
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
    const userId = (req as any).user?.id || (req as any).user;
    const { role, content, contentType, toolCalls, toolResults, confidenceScore, confidenceFactors } = req.body;
    if (!role || !content) return res.status(400).json({ success: false, error: "role and content required" });

    // Ownership gate — closes the IDOR hole where any authenticated user could
    // POST turns into another user's session by guessing a sessionId.
    if (!userId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }
    try {
      const { db } = await import("../db");
      const { trinityConversationSessions } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [session] = await db.select({ userId: trinityConversationSessions.userId })
        .from(trinityConversationSessions)
        .where(eq(trinityConversationSessions.id, sessionId))
        .limit(1);
      if (!session) return res.status(404).json({ success: false, error: "Session not found" });
      if (session.userId !== userId) {
        return res.status(403).json({ success: false, error: "Session does not belong to this user" });
      }
    } catch (_) {
      // If the ownership lookup fails (DB issue), fail closed.
      return res.status(500).json({ success: false, error: "Failed to verify session ownership" });
    }

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
    const userId = (req as any).user?.id || (req as any).user;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    // Ownership gate so a user cannot end someone else's session.
    try {
      const { db } = await import("../db");
      const { trinityConversationSessions } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [session] = await db.select({ userId: trinityConversationSessions.userId })
        .from(trinityConversationSessions)
        .where(eq(trinityConversationSessions.id, sessionId))
        .limit(1);
      if (!session) return res.status(404).json({ success: false, error: "Session not found" });
      if (session.userId !== userId) {
        return res.status(403).json({ success: false, error: "Session does not belong to this user" });
      }
    } catch (_) {
      return res.status(500).json({ success: false, error: "Failed to verify session ownership" });
    }

    const success = await trinityContextManager.endSession(sessionId);
    res.json({ success });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

export default router;
