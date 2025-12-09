/**
 * Empire Mode Routes
 * 
 * API endpoints for Trinity's Empire Mode features:
 * - GrowthStrategist: 4 Pillars (Cashflow, Networking, Sales, Tools)
 * - Blue Dot Protocol: Precision Maintenance
 * - Holistic Growth Engine: CEO-level Business Intelligence
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../auth";

const router = Router();

// ========================
// GROWTH STRATEGIST ROUTES
// ========================

// Run weekly strategy scan across 4 pillars
router.get("/empire/scan/:workspaceId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { growthStrategist } = await import("../services/ai-brain/growthStrategist");
    const { workspaceId } = req.params;
    const result = await growthStrategist.runWeeklyStrategyScan(workspaceId);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Strategy Summary for workspace
router.get("/empire/strategies/:workspaceId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { growthStrategist } = await import("../services/ai-brain/growthStrategist");
    const { workspaceId } = req.params;
    const summary = await growthStrategist.getStrategySummary(workspaceId);
    res.json({ success: true, ...summary });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Tool Expansion opportunities
router.get("/empire/tools/:workspaceId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { growthStrategist } = await import("../services/ai-brain/growthStrategist");
    const { workspaceId } = req.params;
    const opportunities = await growthStrategist.scanForToolOpportunities(workspaceId);
    res.json({ success: true, opportunities });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================
// HOLISTIC GROWTH ENGINE ROUTES
// ========================

// Get CEO-level business health analysis
router.get("/empire/health/:workspaceId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { holisticGrowthEngine } = await import("../services/ai-brain/holisticGrowthEngine");
    const { workspaceId } = req.params;
    const report = await holisticGrowthEngine.analyzeBusinessHealth(workspaceId);
    res.json({ success: true, report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clear health cache and refresh
router.post("/empire/health/refresh/:workspaceId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { holisticGrowthEngine } = await import("../services/ai-brain/holisticGrowthEngine");
    const { workspaceId } = req.params;
    holisticGrowthEngine.clearCache(workspaceId);
    const report = await holisticGrowthEngine.analyzeBusinessHealth(workspaceId);
    res.json({ success: true, report, refreshed: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================
// BLUE DOT PROTOCOL ROUTES
// ========================

// Get current maintenance status
router.get("/bluedot/status", requireAuth, async (req: Request, res: Response) => {
  try {
    const { blueDotProtocol } = await import("../services/ai-brain/blueDotProtocol");
    const status = blueDotProtocol.getStatus();
    const godModeMessage = blueDotProtocol.getGodModeMessage();
    res.json({ success: true, status, godModeMessage });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Simulate maintenance (preview without executing)
router.post("/bluedot/simulate", requireAuth, async (req: Request, res: Response) => {
  try {
    const { blueDotProtocol } = await import("../services/ai-brain/blueDotProtocol");
    const { getUserPlatformRole } = await import("../rbac");
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }
    const platformRole = await getUserPlatformRole(userId);
    const guruRoles = ["root_admin", "deputy_admin", "sysop"];
    if (!guruRoles.includes(platformRole || "")) {
      return res.status(403).json({ success: false, error: "Guru mode access required for Blue Dot simulation" });
    }
    const { repairs } = req.body;
    if (!repairs || !Array.isArray(repairs)) {
      return res.status(400).json({ success: false, error: "repairs array required" });
    }
    const preview = await blueDotProtocol.simulateMaintenance(repairs);
    res.json({ success: true, preview });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Initiate maintenance (Guru mode only)
router.post("/bluedot/initiate", requireAuth, async (req: Request, res: Response) => {
  try {
    const { blueDotProtocol } = await import("../services/ai-brain/blueDotProtocol");
    const { getUserPlatformRole } = await import("../rbac");
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }
    const platformRole = await getUserPlatformRole(userId);
    const rootRoles = ["root_admin", "deputy_admin"];
    if (!rootRoles.includes(platformRole || "")) {
      return res.status(403).json({ success: false, error: "Root admin access required for Blue Dot initiation" });
    }
    const { repairs } = req.body;
    if (!repairs || !Array.isArray(repairs)) {
      return res.status(400).json({ success: false, error: "repairs array required" });
    }
    const result = await blueDotProtocol.initiatePrecisionMaintenance(repairs, userId);
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Resolve maintenance
router.post("/bluedot/resolve", requireAuth, async (req: Request, res: Response) => {
  try {
    const { blueDotProtocol } = await import("../services/ai-brain/blueDotProtocol");
    const { getUserPlatformRole } = await import("../rbac");
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }
    const platformRole = await getUserPlatformRole(userId);
    const rootRoles = ["root_admin", "deputy_admin"];
    if (!rootRoles.includes(platformRole || "")) {
      return res.status(403).json({ success: false, error: "Root admin access required to resolve Blue Dot" });
    }
    const { resolution, message } = req.body;
    blueDotProtocol.resolveMaintenance(resolution || "success", message);
    res.json({ success: true, message: "Maintenance resolved" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create repair task
router.post("/bluedot/repair", requireAuth, async (req: Request, res: Response) => {
  try {
    const { blueDotProtocol } = await import("../services/ai-brain/blueDotProtocol");
    const { type, target, description, estimatedMs } = req.body;
    if (!type || !target || !description) {
      return res.status(400).json({ success: false, error: "type, target, and description required" });
    }
    const repair = blueDotProtocol.createRepair(type, target, description, estimatedMs);
    res.json({ success: true, repair });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get repair queue
router.get("/bluedot/queue", requireAuth, async (req: Request, res: Response) => {
  try {
    const { blueDotProtocol } = await import("../services/ai-brain/blueDotProtocol");
    const queue = blueDotProtocol.getRepairQueue();
    const auditLog = blueDotProtocol.getAuditLog();
    res.json({ success: true, queue, auditLog });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
