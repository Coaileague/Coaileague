/**
 * AI BRAIN MEMORY & LEARNING ROUTES
 * ==================================
 * API endpoints for Trinity Memory Service and cross-bot learning system.
 */

import type { Express } from 'express';
import { trinityMemoryService } from '../services/ai-brain/trinityMemoryService';
import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import { employees, workspaces } from '@shared/schema';

// Helper to check workspace access for tenant isolation
async function checkWorkspaceAccess(userId: string, workspaceId: string): Promise<{ hasAccess: boolean; role?: string }> {
  const [employee] = await db.select().from(employees).where(and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId))).limit(1);
  if (employee) return { hasAccess: true, role: employee.workspaceRole || 'staff' };
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (workspace?.ownerId === userId) return { hasAccess: true, role: 'org_owner' };
  return { hasAccess: false };
}

export function registerAiBrainMemoryRoutes(app: Express, requireAuth: any) {
  /**
   * GET /api/ai-brain/memory/profile
   * Get user memory profile for intelligent context
   */
  app.get("/api/ai-brain/memory/profile", requireAuth, async (req: any, res: any) => {
    try {
      const profile = await trinityMemoryService.getUserMemoryProfile(
        req.userId!,
        req.query.workspaceId as string | undefined
      );
      res.json({ success: true, profile });
    } catch (error: any) {
      console.error("[Memory API] Error getting profile:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/ai-brain/memory/context
   * Get memory context for AI prompts
   */
  app.get("/api/ai-brain/memory/context", requireAuth, async (req: any, res: any) => {
    try {
      const context = await trinityMemoryService.buildMemoryContext(
        req.userId!,
        req.query.workspaceId as string | undefined,
        req.query.topic as string | undefined
      );
      res.json({ success: true, context });
    } catch (error: any) {
      console.error("[Memory API] Error building context:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/ai-brain/tools/catalog
   * Get AI tool capability catalog with success metrics
   * REQUIRES workspaceId for tenant isolation
   */
  app.get("/api/ai-brain/tools/catalog", requireAuth, async (req: any, res: any) => {
    try {
      const workspaceId = req.query.workspaceId as string | undefined;
      
      // Require workspaceId for tenant isolation
      if (!workspaceId) {
        return res.status(400).json({ success: false, error: "workspaceId is required for tenant isolation" });
      }
      
      // Validate workspace access
      const access = await checkWorkspaceAccess(req.userId!, workspaceId);
      if (!access.hasAccess) {
        return res.status(403).json({ success: false, error: "Access denied to workspace" });
      }
      
      // Get workspace-scoped tools for tenant isolation
      const tools = await trinityMemoryService.getWorkspaceScopedToolCatalog(workspaceId);
      res.json({ success: true, tools, count: tools.length });
    } catch (error: any) {
      console.error("[Memory API] Error getting tool catalog:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/ai-brain/tools/recommended
   * Get recommended tools based on context
   * REQUIRES workspaceId for tenant isolation
   */
  app.get("/api/ai-brain/tools/recommended", requireAuth, async (req: any, res: any) => {
    try {
      const workspaceId = req.query.workspaceId as string | undefined;
      
      // Require workspaceId for tenant isolation
      if (!workspaceId) {
        return res.status(400).json({ success: false, error: "workspaceId is required for tenant isolation" });
      }
      
      // Validate workspace access
      const access = await checkWorkspaceAccess(req.userId!, workspaceId);
      if (!access.hasAccess) {
        return res.status(403).json({ success: false, error: "Access denied to workspace" });
      }
      
      const contextArray = req.query.context 
        ? (Array.isArray(req.query.context) ? req.query.context as string[] : [req.query.context as string])
        : [];
      
      // Get workspace-scoped recommendations
      const workspaceTools = await trinityMemoryService.getWorkspaceScopedToolCatalog(workspaceId);
      const recommendations = workspaceTools
        .filter(tool => 
          tool.healthStatus === 'healthy' &&
          tool.successMetrics.successRate >= 70 &&
          tool.usageCount >= 3
        )
        .sort((a, b) => b.successMetrics.successRate - a.successMetrics.successRate)
        .slice(0, 5);
      
      res.json({ success: true, tools: recommendations });
    } catch (error: any) {
      console.error("[Memory API] Error getting recommended tools:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/ai-brain/tools/catalog/refresh
   * Refresh tool catalog metrics from automation ledger
   * REQUIRES workspaceId for tenant isolation - returns workspace-scoped refresh
   */
  app.post("/api/ai-brain/tools/catalog/refresh", requireAuth, async (req: any, res: any) => {
    try {
      const workspaceId = req.body.workspaceId || req.query.workspaceId;
      
      // Require workspaceId for tenant isolation
      if (!workspaceId) {
        return res.status(400).json({ success: false, error: "workspaceId is required for tenant isolation" });
      }
      
      // Validate workspace access
      const access = await checkWorkspaceAccess(req.userId!, workspaceId);
      if (!access.hasAccess) {
        return res.status(403).json({ success: false, error: "Access denied to workspace" });
      }
      
      // Get workspace-scoped catalog (this queries fresh data from automation ledger)
      const tools = await trinityMemoryService.getWorkspaceScopedToolCatalog(workspaceId);
      res.json({ success: true, message: "Tool catalog refreshed for workspace", count: tools.length, tools });
    } catch (error: any) {
      console.error("[Memory API] Error refreshing tool catalog:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/ai-brain/insights/relevant
   * Get relevant shared insights for cross-bot learning
   * REQUIRES workspaceId for tenant isolation
   */
  app.get("/api/ai-brain/insights/relevant", requireAuth, async (req: any, res: any) => {
    try {
      const workspaceId = req.query.workspaceId as string | undefined;
      
      // Require workspaceId for tenant isolation
      if (!workspaceId) {
        return res.status(400).json({ success: false, error: "workspaceId is required for tenant isolation" });
      }
      
      // Validate workspace access
      const access = await checkWorkspaceAccess(req.userId!, workspaceId);
      if (!access.hasAccess) {
        return res.status(403).json({ success: false, error: "Access denied to workspace" });
      }
      
      const scenarios = req.query.scenarios 
        ? (Array.isArray(req.query.scenarios) ? req.query.scenarios as string[] : [req.query.scenarios as string])
        : [];
      const limit = parseInt(req.query.limit as string) || 5;
      
      // Get insights filtered by workspace scope
      const insights = trinityMemoryService.getRelevantInsights(scenarios, limit, workspaceId);
      res.json({ success: true, insights });
    } catch (error: any) {
      console.error("[Memory API] Error getting insights:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/ai-brain/insights/share
   * Share a learning insight for cross-bot knowledge
   */
  app.post("/api/ai-brain/insights/share", requireAuth, async (req: any, res: any) => {
    try {
      const { sourceAgent, insightType, workspaceScope, title, content, confidence, applicableScenarios } = req.body;
      
      if (!sourceAgent || !insightType || !title || !content) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
      }

      const insight = await trinityMemoryService.shareInsight({
        sourceAgent,
        insightType,
        workspaceScope: workspaceScope || null,
        title,
        content,
        confidence: confidence || 0.5,
        applicableScenarios: applicableScenarios || [],
      });
      res.json({ success: true, insight });
    } catch (error: any) {
      console.error("[Memory API] Error sharing insight:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/ai-brain/insights/record-usage
   * Record insight usage for effectiveness tracking
   */
  app.post("/api/ai-brain/insights/record-usage", requireAuth, async (req: any, res: any) => {
    try {
      const { insightId, wasEffective } = req.body;
      
      if (!insightId || typeof wasEffective !== 'boolean') {
        return res.status(400).json({ success: false, error: "Missing insightId or wasEffective" });
      }

      trinityMemoryService.recordInsightUsage(insightId, wasEffective);
      res.json({ success: true, message: "Usage recorded" });
    } catch (error: any) {
      console.error("[Memory API] Error recording usage:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  console.log("[AI Brain Memory] Memory and learning routes registered");
}
