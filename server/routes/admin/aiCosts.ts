import { sanitizeError } from '../../middleware/errorHandler';
import { Router } from "express";
import { z } from "zod";
import { aiCostMonitor } from "../../services/ai-brain/costMonitor";
import { requireAuth } from "../../auth";
import { requireSupportAgent } from "../../rbac";
import { createLogger } from '../../lib/logger';
const log = createLogger('AiCosts');


const router = Router();

const preflightSchema = z.object({
  operationType: z.string().min(1),
  estimatedTokens: z.number().positive(),
  creditsToCharge: z.number().positive(),
  ai: z.enum(['gemini', 'geminiPro', 'claude', 'claudeOpus']),
  workspaceId: z.string().min(1),
});

// All AI cost monitoring endpoints require platform staff access
router.use(requireAuth);
router.use(requireSupportAgent);

router.get("/health", async (req, res) => {
  try {
    const health = await aiCostMonitor.getHealthSummary();
    res.json({
      success: true,
      data: health,
    });
  } catch (error: unknown) {
    log.error("[AI Costs] Health check failed:", error);
    res.status(500).json({
      success: false,
      error: sanitizeError(error),
    });
  }
});

router.get("/by-operation", async (req, res) => {
  try {
    const days = Math.min(Math.max(1, parseInt(req.query.days as string) || 7), 365);
    const stats = await aiCostMonitor.getOperationStats(days);
    res.json({
      success: true,
      data: stats,
      meta: { days },
    });
  } catch (error: unknown) {
    log.error("[AI Costs] Operation stats failed:", error);
    res.status(500).json({
      success: false,
      error: sanitizeError(error),
    });
  }
});

router.get("/unprofitable-companies", async (req, res) => {
  try {
    const days = Math.min(Math.max(1, parseInt(req.query.days as string) || 7), 365);
    const companies = await aiCostMonitor.getUnprofitableCompanies(days);
    res.json({
      success: true,
      data: companies,
      meta: { 
        days,
        totalUnprofitable: companies.length,
        totalLoss: companies.reduce((sum, c) => sum + c.totalLoss, 0),
      },
    });
  } catch (error: unknown) {
    log.error("[AI Costs] Unprofitable companies failed:", error);
    res.status(500).json({
      success: false,
      error: sanitizeError(error),
    });
  }
});

router.get("/recommendations", async (req, res) => {
  try {
    const days = Math.min(Math.max(1, parseInt(req.query.days as string) || 30), 365);
    const adjustments = await aiCostMonitor.recommendCreditAdjustments(days);
    res.json({
      success: true,
      data: adjustments,
      meta: {
        days,
        totalRecommendations: adjustments.length,
        criticalCount: adjustments.filter(a => a.avgMargin < 0).length,
      },
    });
  } catch (error: unknown) {
    log.error("[AI Costs] Recommendations failed:", error);
    res.status(500).json({
      success: false,
      error: sanitizeError(error),
    });
  }
});

router.get("/alerts", async (req, res) => {
  try {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 20), 500);
    const alerts = await aiCostMonitor.getRecentAlerts(limit);
    res.json({
      success: true,
      data: alerts,
      meta: {
        total: alerts.length,
        unprofitableCount: alerts.filter(a => a.type === 'unprofitable').length,
        lowMarginCount: alerts.filter(a => a.type === 'low_margin').length,
      },
    });
  } catch (error: unknown) {
    log.error("[AI Costs] Alerts failed:", error);
    res.status(500).json({
      success: false,
      error: sanitizeError(error),
    });
  }
});

router.post("/preflight", async (req, res) => {
  try {
    const parsed = preflightSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: operationType, estimatedTokens, creditsToCharge, ai, workspaceId",
        details: parsed.error.flatten(),
      });
    }

    const { operationType, estimatedTokens, creditsToCharge, ai, workspaceId } = parsed.data;

    const result = await aiCostMonitor.checkProfitability(
      operationType,
      estimatedTokens,
      creditsToCharge,
      ai,
      workspaceId
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    log.error("[AI Costs] Preflight check failed:", error);
    res.status(500).json({
      success: false,
      error: sanitizeError(error),
    });
  }
});

router.get("/token-limits", async (req, res) => {
  res.json({
    success: true,
    data: {
      rfp_generation: 50000,
      capability_statement: 40000,
      compliance_analysis: 30000,
      ai_migration: 25000,
      ai_analytics_report: 20000,
      ai_predictions: 20000,
      ai_scheduling: 15000,
      ai_schedule_optimization: 15000,
      ai_payroll_processing: 15000,
      ai_invoice_generation: 10000,
      verification: 10000,
      ai_invoice_review: 8000,
      ai_payroll_verification: 8000,
      ai_email_generation: 5000,
      ai_shift_extraction: 5000,
      ai_shift_matching: 5000,
      ai_email_classification: 3000,
      ai_match_approval: 3000,
      ai_chat_query: 5000,
      chatbot_query: 5000,
      default: 10000,
    },
    meta: {
      targetMargin: "20%",
      creditToUsd: 0.01,
      overageFormula: "(tokens_over_limit / 10000) × 5 credits",
    },
  });
});

router.get("/pricing", async (req, res) => {
  res.json({
    success: true,
    data: {
      gemini: {
        model: "gemini-2.5-flash",
        inputPer1M: 0.075,
        outputPer1M: 0.30,
      },
      geminiPro: {
        model: "gemini-2.5-pro",
        inputPer1M: 1.25,
        outputPer1M: 5.00,
      },
      claude: {
        model: "claude-sonnet-4-20250514",
        inputPer1M: 3.00,
        outputPer1M: 15.00,
      },
      claudeOpus: {
        model: "claude-opus-4-20250514",
        inputPer1M: 15.00,
        outputPer1M: 75.00,
      },
    },
    meta: {
      lastUpdated: "2026-01-19",
      currency: "USD",
    },
  });
});

export default router;
