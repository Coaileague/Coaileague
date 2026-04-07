import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import type { AuthenticatedRequest } from "../rbac";
import { requireAuth } from "../auth";
import { db } from "../db";
import { employees, workspaces } from "@shared/schema";
import { and, eq } from "drizzle-orm";

const router = Router();

router.get("/topology", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { swarmCommanderService } = await import("../services/ai-brain/swarmCommanderService");
    const { getUserPlatformRole } = await import("../rbac");
    const userId = req.userId!;
    const platformRole = await getUserPlatformRole(userId);
    const guruRoles = ["root_admin", "deputy_admin", "sysop", "support_manager", "support_agent"];
    if (!guruRoles.includes(platformRole || "")) {
      return res.status(403).json({ success: false, error: "Guru mode access required" });
    }
    const workspaceId = (req.query.workspaceId as string) || req.workspaceId;
    if (workspaceId && workspaceId !== req.workspaceId && platformRole !== "root_admin") {
       return res.status(403).json({ success: false, error: "Unauthorized workspace access" });
    }
    const topology = await swarmCommanderService.getSwarmTopology(workspaceId);
    res.json({ success: true, topology });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get("/summary", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { swarmCommanderService } = await import("../services/ai-brain/swarmCommanderService");
    const { getUserPlatformRole } = await import("../rbac");
    const userId = req.userId!;
    const platformRole = await getUserPlatformRole(userId);
    const guruRoles = ["root_admin", "deputy_admin", "sysop", "support_manager", "support_agent"];
    if (!guruRoles.includes(platformRole || "")) {
      return res.status(403).json({ success: false, error: "Guru mode access required" });
    }
    const workspaceId = (req.query.workspaceId as string) || req.workspaceId;
    if (workspaceId && workspaceId !== req.workspaceId && platformRole !== "root_admin") {
       return res.status(403).json({ success: false, error: "Unauthorized workspace access" });
    }
    const summary = await swarmCommanderService.getGuruModeSummary(workspaceId);
    res.json({ success: true, summary });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get("/conflicts", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { swarmCommanderService } = await import("../services/ai-brain/swarmCommanderService");
    const { getUserPlatformRole } = await import("../rbac");
    const userId = req.userId!;
    const platformRole = await getUserPlatformRole(userId);
    const guruRoles = ["root_admin", "deputy_admin", "sysop", "support_manager", "support_agent"];
    if (!guruRoles.includes(platformRole || "")) {
      return res.status(403).json({ success: false, error: "Guru mode access required" });
    }
    const workspaceId = (req.query.workspaceId as string) || req.workspaceId;
    if (workspaceId && workspaceId !== req.workspaceId && platformRole !== "root_admin") {
       return res.status(403).json({ success: false, error: "Unauthorized workspace access" });
    }
    const conflicts = await swarmCommanderService.getPendingConflicts(workspaceId);
    res.json({ success: true, conflicts });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post("/conflicts/:conflictId/resolve", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { swarmCommanderService } = await import("../services/ai-brain/swarmCommanderService");
    const { getUserPlatformRole } = await import("../rbac");
    const userId = req.userId!;
    const platformRole = await getUserPlatformRole(userId);
    const guruRoles = ["root_admin", "deputy_admin", "sysop", "support_manager"];
    if (!guruRoles.includes(platformRole || "")) {
      return res.status(403).json({ success: false, error: "Insufficient permissions to resolve conflicts" });
    }
    const { conflictId } = req.params;
    const { decision, expiresInHours } = req.body;
    if (!decision || !["overrule", "sustain"].includes(decision)) {
      return res.status(400).json({ success: false, error: "decision must be overrule or sustain" });
    }
    const resolved = await swarmCommanderService.resolveConflict(conflictId, decision, userId, expiresInHours);
    if (!resolved) return res.status(404).json({ success: false, error: "Conflict not found" });
    res.json({ success: true, conflict: resolved });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post("/estimate-cost", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { swarmCommanderService } = await import("../services/ai-brain/swarmCommanderService");
    const { taskDescription, complexity, dataSize, domain } = req.body;
    if (!taskDescription || !complexity) {
      return res.status(400).json({ success: false, error: "taskDescription and complexity required" });
    }
    const estimate = await swarmCommanderService.estimateTaskCost({ taskDescription, complexity, dataSize, domain });
    res.json({ success: true, estimate });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get("/roi/:workspaceId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { swarmCommanderService } = await import("../services/ai-brain/swarmCommanderService");
    const { workspaceId } = req.params;
    const userId = req.userId!;
    const { employees, workspaces } = await import("@shared/schema");
    const [employee] = await db.select().from(employees).where(and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId))).limit(1);
    let hasAccess = false;
    if (employee) {
      hasAccess = true;
    } else {
      const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      if (workspace?.ownerId === userId) hasAccess = true;
    }
    if (!hasAccess) return res.status(403).json({ success: false, error: "Access denied" });
    const periodDays = Math.min(Math.max(parseInt(req.query.days as string) || 7, 1), 90);
    const roi = await swarmCommanderService.calculateROI(workspaceId, periodDays);
    res.json({ success: true, roi });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get("/replay/:workflowId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { swarmCommanderService } = await import("../services/ai-brain/swarmCommanderService");
    const { getUserPlatformRole } = await import("../rbac");
    const userId = req.userId!;
    const platformRole = await getUserPlatformRole(userId);
    const guruRoles = ["root_admin", "deputy_admin", "sysop", "support_manager", "support_agent"];
    if (!guruRoles.includes(platformRole || "")) {
      return res.status(403).json({ success: false, error: "Guru mode access required" });
    }
    const { workflowId } = req.params;
    const question = req.query.question as string | undefined;
    const replay = swarmCommanderService.getForensicReplay(workflowId, question);
    res.json({ success: true, replay });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

export default router;
