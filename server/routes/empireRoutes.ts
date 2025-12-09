/**
 * Empire Mode Routes
 * 
 * API endpoints for Trinity's Empire Mode features:
 * - GrowthStrategist: 4 Pillars (Cashflow, Networking, Sales, Tools)
 * - Blue Dot Protocol: Precision Maintenance
 * - Holistic Growth Engine: CEO-level Business Intelligence
 * 
 * All Empire Mode operations are metered via SubagentBanker for credit tracking.
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../auth";
import { subagentBanker } from "../services/ai-brain/subagentBanker";

const router = Router();

const EMPIRE_CREDIT_COSTS = {
  strategyScan: 25,
  strategySummary: 10,
  toolOpportunities: 15,
  healthAnalysis: 30,
  healthRefresh: 35,
  blueDotSimulate: 5,
  blueDotInitiate: 20,
};

// ========================
// GROWTH STRATEGIST ROUTES
// ========================

// Run weekly strategy scan across 4 pillars
router.get("/empire/scan/:workspaceId", requireAuth, async (req: Request, res: Response) => {
  const { workspaceId } = req.params;
  const userId = (req as any).user?.id || 'system';
  let creditsDeducted = false;
  
  try {
    const { growthStrategist } = await import("../services/ai-brain/growthStrategist");
    
    // Deduct credits for Empire Mode scan
    const deductResult = await subagentBanker.directDeduct({
      workspaceId,
      userId,
      credits: EMPIRE_CREDIT_COSTS.strategyScan,
      actionType: 'empire_strategy_scan',
      description: 'Empire Mode: Weekly Strategy Scan'
    });
    
    if (!deductResult.success) {
      return res.status(402).json({ success: false, error: deductResult.error, creditsRequired: EMPIRE_CREDIT_COSTS.strategyScan });
    }
    creditsDeducted = true;
    
    const result = await growthStrategist.runWeeklyStrategyScan(workspaceId);
    res.json({ success: true, ...result, creditsUsed: EMPIRE_CREDIT_COSTS.strategyScan });
  } catch (error: any) {
    // Refund credits on error
    if (creditsDeducted) {
      await subagentBanker.refillCredits({
        workspaceId, userId,
        credits: EMPIRE_CREDIT_COSTS.strategyScan,
        source: 'refund',
        description: 'Empire Mode: Refund for failed strategy scan'
      });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Strategy Summary for workspace
router.get("/empire/strategies/:workspaceId", requireAuth, async (req: Request, res: Response) => {
  const { workspaceId } = req.params;
  const userId = (req as any).user?.id || 'system';
  let creditsDeducted = false;
  
  try {
    const { growthStrategist } = await import("../services/ai-brain/growthStrategist");
    
    const deductResult = await subagentBanker.directDeduct({
      workspaceId,
      userId,
      credits: EMPIRE_CREDIT_COSTS.strategySummary,
      actionType: 'empire_strategy_summary',
      description: 'Empire Mode: Strategy Summary'
    });
    
    if (!deductResult.success) {
      return res.status(402).json({ success: false, error: deductResult.error, creditsRequired: EMPIRE_CREDIT_COSTS.strategySummary });
    }
    creditsDeducted = true;
    
    const summary = await growthStrategist.getStrategySummary(workspaceId);
    res.json({ success: true, ...summary, creditsUsed: EMPIRE_CREDIT_COSTS.strategySummary });
  } catch (error: any) {
    if (creditsDeducted) {
      await subagentBanker.refillCredits({
        workspaceId, userId,
        credits: EMPIRE_CREDIT_COSTS.strategySummary,
        source: 'refund',
        description: 'Empire Mode: Refund for failed strategy summary'
      });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Tool Expansion opportunities
router.get("/empire/tools/:workspaceId", requireAuth, async (req: Request, res: Response) => {
  const { workspaceId } = req.params;
  const userId = (req as any).user?.id || 'system';
  let creditsDeducted = false;
  
  try {
    const { growthStrategist } = await import("../services/ai-brain/growthStrategist");
    
    const deductResult = await subagentBanker.directDeduct({
      workspaceId,
      userId,
      credits: EMPIRE_CREDIT_COSTS.toolOpportunities,
      actionType: 'empire_tool_opportunities',
      description: 'Empire Mode: Tool Expansion Analysis'
    });
    
    if (!deductResult.success) {
      return res.status(402).json({ success: false, error: deductResult.error, creditsRequired: EMPIRE_CREDIT_COSTS.toolOpportunities });
    }
    creditsDeducted = true;
    
    const opportunities = await growthStrategist.scanForToolOpportunities(workspaceId);
    res.json({ success: true, opportunities, creditsUsed: EMPIRE_CREDIT_COSTS.toolOpportunities });
  } catch (error: any) {
    if (creditsDeducted) {
      await subagentBanker.refillCredits({
        workspaceId, userId,
        credits: EMPIRE_CREDIT_COSTS.toolOpportunities,
        source: 'refund',
        description: 'Empire Mode: Refund for failed tool opportunities scan'
      });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================
// HOLISTIC GROWTH ENGINE ROUTES
// ========================

// Get CEO-level business health analysis
router.get("/empire/health/:workspaceId", requireAuth, async (req: Request, res: Response) => {
  const { workspaceId } = req.params;
  const userId = (req as any).user?.id || 'system';
  let creditsDeducted = false;
  
  try {
    const { holisticGrowthEngine } = await import("../services/ai-brain/holisticGrowthEngine");
    
    const deductResult = await subagentBanker.directDeduct({
      workspaceId,
      userId,
      credits: EMPIRE_CREDIT_COSTS.healthAnalysis,
      actionType: 'empire_health_analysis',
      description: 'Empire Mode: Holistic Health Analysis'
    });
    
    if (!deductResult.success) {
      return res.status(402).json({ success: false, error: deductResult.error, creditsRequired: EMPIRE_CREDIT_COSTS.healthAnalysis });
    }
    creditsDeducted = true;
    
    const report = await holisticGrowthEngine.analyzeBusinessHealth(workspaceId);
    res.json({ success: true, report, creditsUsed: EMPIRE_CREDIT_COSTS.healthAnalysis });
  } catch (error: any) {
    if (creditsDeducted) {
      await subagentBanker.refillCredits({
        workspaceId, userId,
        credits: EMPIRE_CREDIT_COSTS.healthAnalysis,
        source: 'refund',
        description: 'Empire Mode: Refund for failed health analysis'
      });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clear health cache and refresh
router.post("/empire/health/refresh/:workspaceId", requireAuth, async (req: Request, res: Response) => {
  const { workspaceId } = req.params;
  const userId = (req as any).user?.id || 'system';
  let creditsDeducted = false;
  
  try {
    const { holisticGrowthEngine } = await import("../services/ai-brain/holisticGrowthEngine");
    
    const deductResult = await subagentBanker.directDeduct({
      workspaceId,
      userId,
      credits: EMPIRE_CREDIT_COSTS.healthRefresh,
      actionType: 'empire_health_refresh',
      description: 'Empire Mode: Health Analysis Refresh'
    });
    
    if (!deductResult.success) {
      return res.status(402).json({ success: false, error: deductResult.error, creditsRequired: EMPIRE_CREDIT_COSTS.healthRefresh });
    }
    creditsDeducted = true;
    
    holisticGrowthEngine.clearCache(workspaceId);
    const report = await holisticGrowthEngine.analyzeBusinessHealth(workspaceId);
    res.json({ success: true, report, refreshed: true, creditsUsed: EMPIRE_CREDIT_COSTS.healthRefresh });
  } catch (error: any) {
    if (creditsDeducted) {
      await subagentBanker.refillCredits({
        workspaceId, userId,
        credits: EMPIRE_CREDIT_COSTS.healthRefresh,
        source: 'refund',
        description: 'Empire Mode: Refund for failed health refresh'
      });
    }
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
  let creditsDeducted = false;
  let workspaceIdForRefund: string | null = null;
  const userId = (req as any).user?.id;
  
  try {
    const { blueDotProtocol } = await import("../services/ai-brain/blueDotProtocol");
    const { getUserPlatformRole } = await import("../rbac");
    if (!userId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }
    const platformRole = await getUserPlatformRole(userId);
    const guruRoles = ["root_admin", "deputy_admin", "sysop"];
    if (!guruRoles.includes(platformRole || "")) {
      return res.status(403).json({ success: false, error: "Guru mode access required for Blue Dot simulation" });
    }
    const { repairs, workspaceId } = req.body;
    if (!repairs || !Array.isArray(repairs)) {
      return res.status(400).json({ success: false, error: "repairs array required" });
    }
    
    // Deduct credits for Blue Dot simulation
    if (workspaceId) {
      workspaceIdForRefund = workspaceId;
      const deductResult = await subagentBanker.directDeduct({
        workspaceId,
        userId,
        credits: EMPIRE_CREDIT_COSTS.blueDotSimulate,
        actionType: 'bluedot_simulate',
        description: 'Blue Dot Protocol: Maintenance Simulation'
      });
      
      if (!deductResult.success) {
        return res.status(402).json({ success: false, error: deductResult.error, creditsRequired: EMPIRE_CREDIT_COSTS.blueDotSimulate });
      }
      creditsDeducted = true;
    }
    
    const preview = await blueDotProtocol.simulateMaintenance(repairs);
    res.json({ success: true, preview, creditsUsed: workspaceIdForRefund ? EMPIRE_CREDIT_COSTS.blueDotSimulate : 0 });
  } catch (error: any) {
    // Refund credits on error if already deducted
    if (creditsDeducted && workspaceIdForRefund && userId) {
      await subagentBanker.refillCredits({
        workspaceId: workspaceIdForRefund,
        userId,
        credits: EMPIRE_CREDIT_COSTS.blueDotSimulate,
        source: 'refund',
        description: 'Blue Dot Protocol: Refund for failed simulation'
      });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// Initiate maintenance (Guru mode only)
router.post("/bluedot/initiate", requireAuth, async (req: Request, res: Response) => {
  let creditsDeducted = false;
  let workspaceIdForRefund: string | null = null;
  const userId = (req as any).user?.id;
  
  try {
    const { blueDotProtocol } = await import("../services/ai-brain/blueDotProtocol");
    const { getUserPlatformRole } = await import("../rbac");
    if (!userId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }
    const platformRole = await getUserPlatformRole(userId);
    const rootRoles = ["root_admin", "deputy_admin"];
    if (!rootRoles.includes(platformRole || "")) {
      return res.status(403).json({ success: false, error: "Root admin access required for Blue Dot initiation" });
    }
    const { repairs, workspaceId } = req.body;
    if (!repairs || !Array.isArray(repairs)) {
      return res.status(400).json({ success: false, error: "repairs array required" });
    }
    
    // Deduct credits for Blue Dot initiation
    if (workspaceId) {
      workspaceIdForRefund = workspaceId;
      const deductResult = await subagentBanker.directDeduct({
        workspaceId,
        userId,
        credits: EMPIRE_CREDIT_COSTS.blueDotInitiate,
        actionType: 'bluedot_initiate',
        description: 'Blue Dot Protocol: Precision Maintenance Initiation'
      });
      
      if (!deductResult.success) {
        return res.status(402).json({ success: false, error: deductResult.error, creditsRequired: EMPIRE_CREDIT_COSTS.blueDotInitiate });
      }
      creditsDeducted = true;
    }
    
    const result = await blueDotProtocol.initiatePrecisionMaintenance(repairs, userId);
    res.json({ success: true, result, creditsUsed: workspaceId ? EMPIRE_CREDIT_COSTS.blueDotInitiate : 0 });
  } catch (error: any) {
    // Refund credits on error if already deducted
    if (creditsDeducted && workspaceIdForRefund && userId) {
      await subagentBanker.refillCredits({
        workspaceId: workspaceIdForRefund,
        userId,
        credits: EMPIRE_CREDIT_COSTS.blueDotInitiate,
        source: 'refund',
        description: 'Blue Dot Protocol: Refund for failed initiation'
      });
    }
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
