import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { crisisManager } from "../services/ai-brain/crisisManager";
import { getUserPlatformRole } from "../rbac";
import type { AuthenticatedRequest } from "../rbac";
import { requireAuth } from '../auth';

const router = Router();

// All crisis routes require authentication
router.use(requireAuth);

router.get("/summary", async (req: AuthenticatedRequest, res) => {
  try {

    const userId = req.user!;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const platformRole = await getUserPlatformRole(userId);
    const guruRoles = ["root_admin", "deputy_admin", "sysop", "support_manager", "support_agent"];
    if (!guruRoles.includes(platformRole || "")) {
      return res.status(403).json({ success: false, error: "Guru mode access required" });
    }
    const summary = await crisisManager.getCrisisSummary();
    const activeCrises = crisisManager.getActiveCrises();
    const blackout = crisisManager.getBlackoutStatus();
    res.json({ success: true, summary, activeCrises, blackout });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post("/lockdown", async (req: AuthenticatedRequest, res) => {
  try {

    const userId = req.user!;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const platformRole = await getUserPlatformRole(userId);
    const guruRoles = ["root_admin", "deputy_admin", "sysop", "support_manager", "support_agent"];
    if (!guruRoles.includes(platformRole || "")) {
      return res.status(403).json({ success: false, error: "Guru mode access required" });
    }
    const { targetUserId, reason } = req.body;
    if (!targetUserId || !reason) {
      return res.status(400).json({ success: false, error: "targetUserId and reason required" });
    }
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const result = await crisisManager.initiateLockdown(targetUserId, reason, userId, platformRole || "");
    res.json({ success: true, ...result });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post("/lockdown/release", async (req: AuthenticatedRequest, res) => {
  try {

    const userId = req.user!;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const platformRole = await getUserPlatformRole(userId);
    const rootRoles = ["root_admin", "deputy_admin"];
    if (!rootRoles.includes(platformRole || "")) {
      return res.status(403).json({ success: false, error: "Root admin access required" });
    }
    const { targetUserId, verificationCode } = req.body;
    if (!targetUserId || !verificationCode) {
      return res.status(400).json({ success: false, error: "targetUserId and verificationCode required" });
    }
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const result = await crisisManager.releaseLockdown(targetUserId, verificationCode, userId, platformRole || "");
    res.json({ success: true, ...result });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post("/blackout", async (req: AuthenticatedRequest, res) => {
  try {

    const userId = req.user!;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const platformRole = await getUserPlatformRole(userId);
    const guruRoles = ["root_admin", "deputy_admin", "sysop", "support_manager"];
    if (!guruRoles.includes(platformRole || "")) {
      return res.status(403).json({ success: false, error: "Elevated Guru mode access required" });
    }
    const { level, affectedServices, etaMinutes } = req.body;
    if (!level || !affectedServices || !etaMinutes) {
      return res.status(400).json({ success: false, error: "level, affectedServices, and etaMinutes required" });
    }
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const result = await crisisManager.initiateBlackout(level, affectedServices, etaMinutes, userId, platformRole || "");
    res.json({ success: true, blackout: result });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post("/blackout/resolve", async (req: AuthenticatedRequest, res) => {
  try {

    const userId = req.user!;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const platformRole = await getUserPlatformRole(userId);
    const guruRoles = ["root_admin", "deputy_admin", "sysop", "support_manager"];
    if (!guruRoles.includes(platformRole || "")) {
      return res.status(403).json({ success: false, error: "Elevated Guru mode access required" });
    }
    const { resolution } = req.body;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const result = await crisisManager.resolveBlackout(resolution || "Issue resolved", userId, platformRole || "");
    res.json({ success: true, ...result });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post("/dispute", async (req: AuthenticatedRequest, res) => {
  try {

    const userId = req.user!;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const platformRole = await getUserPlatformRole(userId);
    const guruRoles = ["root_admin", "deputy_admin", "sysop", "support_manager", "support_agent"];
    if (!guruRoles.includes(platformRole || "")) {
      return res.status(403).json({ success: false, error: "Guru mode access required" });
    }
    const { workspaceId, incidentDescription, claimedAmount } = req.body;
    if (!workspaceId || !claimedAmount) {
      return res.status(400).json({ success: false, error: "workspaceId and claimedAmount required" });
    }
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const result = await crisisManager.processDispute(workspaceId, incidentDescription || "", claimedAmount, userId, platformRole || "");
    res.json({ success: true, ...result });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post("/purge", async (req: AuthenticatedRequest, res) => {
  try {

    const userId = req.user!;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const platformRole = await getUserPlatformRole(userId);
    const rootRoles = ["root_admin", "deputy_admin"];
    if (!rootRoles.includes(platformRole || "")) {
      return res.status(403).json({ success: false, error: "Root admin access required for purge" });
    }
    const { targetOrgId, confirmPhrase } = req.body;
    if (!targetOrgId || !confirmPhrase) {
      return res.status(400).json({ success: false, error: "targetOrgId and confirmPhrase required" });
    }
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const result = await crisisManager.executePurge(targetOrgId, confirmPhrase, userId, platformRole || "");
    res.json({ success: true, ...result });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get("/script/:type", async (req: AuthenticatedRequest, res) => {
  try {

    const userId = req.user!;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const platformRole = await getUserPlatformRole(userId);
    const guruRoles = ["root_admin", "deputy_admin", "sysop", "support_manager", "support_agent"];
    if (!guruRoles.includes(platformRole || "")) {
      return res.status(403).json({ success: false, error: "Guru mode access required" });
    }
    const { type } = req.params;
    const context = req.query as Record<string, unknown>;
    const validTypes = ["lockdown", "blackout", "dispute", "purge"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, error: "Invalid crisis type" });
    }
    const script = crisisManager.getCrisisScript(type as any, context);
    res.json({ success: true, script, type });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get("/audit", async (req: AuthenticatedRequest, res) => {
  try {

    const userId = req.user!;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const platformRole = await getUserPlatformRole(userId);
    const guruRoles = ["root_admin", "deputy_admin", "sysop"];
    if (!guruRoles.includes(platformRole || "")) {
      return res.status(403).json({ success: false, error: "Elevated access required for audit trail" });
    }
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 500);
    const auditTrail = crisisManager.getAuditTrail(limit);
    res.json({ success: true, auditTrail });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

export default router;
