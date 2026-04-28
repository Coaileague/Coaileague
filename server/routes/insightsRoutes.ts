import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { db } from "../db";
import {
  employees,
  clients,
  aiInsights,
  invoices,
  turnoverRiskScores,
  aiUsageEvents,
} from "@shared/schema";
import { sql, eq, and, gte, desc } from "drizzle-orm";
import { requireAuth, requireManager, type AuthenticatedRequest } from "../rbac";
import { getMeteredOpenAICompletion } from '../services/billing/universalAIBillingInterceptor';
import { createLogger } from '../lib/logger';
import { z } from 'zod';
const log = createLogger('InsightsRoutes');


const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const { workspaceId } = req;
    
    const insights = await db.query.aiInsights.findMany({
      where: (aiInsights, { eq, and }) => and(
        eq(aiInsights.workspaceId, workspaceId!),
        eq(aiInsights.status, 'active')
      ),
      orderBy: (aiInsights, { desc, asc }) => [
        desc(aiInsights.priority),
        desc(aiInsights.createdAt),
      ],
    });

    res.json(insights);
  } catch (error) {
    log.error("Error fetching insights:", error);
    res.status(500).json({ message: "Failed to fetch insights" });
  }
});

router.post("/dismiss/:id", requireAuth, async (req, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const { userId, workspaceId } = req;
    const { id } = req.params;
    const { reason } = req.body;

    const { stagedShifts } = await import('@shared/schema');
    const updated = await db.update(aiInsights)
      .set({
        status: 'dismissed',
        dismissedBy: userId,
        dismissedAt: new Date(),
        dismissReason: reason,
        updatedAt: new Date(),
      })
      .where(and(
        eq(aiInsights.id, id),
        eq(aiInsights.workspaceId, workspaceId!)
      ))
      .returning();

    if (updated.length === 0) {
      return res.status(404).json({ message: "Insight not found" });
    }

    res.json(updated[0]);
  } catch (error) {
    log.error("Error dismissing insight:", error);
    res.status(500).json({ message: "Failed to dismiss insight" });
  }
});

router.post("/generate", requireManager, async (req, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const { workspaceId, userId } = req;

    const employeeCount = await db.select({ count: sql<number>`count(*)` })
      .from(employees)
      .where(eq(employees.workspaceId, workspaceId!));

    const clientCount = await db.select({ count: sql<number>`count(*)` })
      .from(clients)
      .where(eq(clients.workspaceId, workspaceId!));

    const { timeEntries, stagedShifts } = await import('@shared/schema');
    const recentEntries = await db.select({
      totalHours: sql<number>`sum(EXTRACT(EPOCH FROM (clock_out - clock_in)) / 3600)`,
      totalCost: sql<number>`sum(total_hours::numeric * hourly_rate::numeric)`,
    })
      .from(timeEntries)
      .where(and(
        eq(timeEntries.workspaceId, workspaceId!),
        gte(timeEntries.clockIn, sql`NOW() - INTERVAL '30 days'`)
      ));

    const recentInvoices = await db.select({
      totalRevenue: sql<number>`sum(total)`,
      avgInvoice: sql<number>`avg(total)`,
      count: sql<number>`count(*)`,
    })
      .from(invoices)
      .where(and(
        eq(invoices.workspaceId, workspaceId!),
        gte(invoices.createdAt, sql`NOW() - INTERVAL '30 days'`)
      ));

    const insights = [];
    let totalTokensUsed = 0;

    const aiApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    const useAI = !!aiApiKey && aiApiKey !== '_DUMMY_API_KEY_';

    if (useAI) {
      const metricsData = {
        employees: employeeCount[0]?.count || 0,
        clients: clientCount[0]?.count || 0,
        totalHours: recentEntries[0]?.totalHours || 0,
        totalLaborCost: recentEntries[0]?.totalCost || 0,
        totalRevenue: recentInvoices[0]?.totalRevenue || 0,
        avgInvoice: recentInvoices[0]?.avgInvoice || 0,
        invoiceCount: recentInvoices[0]?.count || 0,
      };

      if (!workspaceId) {
        return res.status(400).json({ error: 'Workspace context required for AI insights' });
      }
      const insightsAiResult = await getMeteredOpenAICompletion({
        workspaceId,
        userId,
        featureKey: 'ai_insights',
        messages: [{
          role: 'system',
          content: `You are AI Analytics™, an advanced AI analytics engine for workforce management. Analyze metrics and generate 3-5 actionable insights. For each insight, provide:
1. Title (concise, under 50 chars)
2. Category (cost_savings, revenue_opportunity, risk_alert, efficiency_improvement, growth_opportunity)
3. Priority (high, medium, low)
4. Summary (2-3 sentences)
5. Confidence (0-100%)
6. Suggested actions (3-5 bullet points)
7. Estimated impact (dollar amount or percentage)

Respond with valid JSON array only.`
        }, {
          role: 'user',
          content: `Analyze these workforce metrics and generate insights:\n${JSON.stringify(metricsData, null, 2)}`
        }],
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 2000,
        jsonMode: true,
      });

      if (insightsAiResult.blocked) {
        return res.status(402).json({ message: insightsAiResult.error || 'Insufficient credits' });
      }

      totalTokensUsed = insightsAiResult.tokensUsed || 0;

      const aiContent = insightsAiResult.success ? insightsAiResult.content || '{}' : '{}';
      try {
        const aiInsightsData = JSON.parse(aiContent);
        const insightsList = aiInsightsData.insights || [];

        for (const insight of insightsList) {
          const savedInsight = await db.insert(aiInsights).values({
            workspaceId,
            title: insight.title || 'AI-Generated Insight',
            category: insight.category || 'efficiency_improvement',
            priority: insight.priority || 'medium',
            summary: insight.summary || '',
            details: insight.details || null,
            dataPoints: JSON.stringify(metricsData),
            generatedBy: 'gpt-4o-mini',
            confidence: String(insight.confidence || 75),
            actionable: true,
            suggestedActions: insight.suggestedActions || [],
            estimatedImpact: insight.estimatedImpact || null,
            status: 'active',
          }).returning();
          insights.push(savedInsight[0]);
        }
      } catch (parseError) {
        log.error('[AI Analytics™] Failed to parse AI response:', parseError);
      }

      if (totalTokensUsed > 0) {
        const { aiUsageEvents } = await import('@shared/schema');
        try {
          await db.insert(aiUsageEvents).values({
            workspaceId,
            userId,
            featureKey: 'insightos_analytics',
            usageType: 'token',
            usageAmount: totalTokensUsed.toString(),
            usageUnit: 'tokens',
            totalCost: ((totalTokensUsed / 1000) * 0.00015).toFixed(6),
            metadata: { model: 'gpt-4o-mini', requestType: 'insightos_analytics' },
          });
        } catch (usageErr) {
          log.warn('[AI Analytics™] Failed to log AI usage (non-blocking):', usageErr);
        }
      }
    } else {
      if (employeeCount[0]?.count > 5) {
        const savingsInsight = await db.insert(aiInsights).values({
          // @ts-expect-error — TS migration: fix in refactoring sprint
          workspaceId,
          title: "Workforce Optimization Opportunity",
          category: 'efficiency_improvement',
          priority: 'medium',
          summary: `With ${employeeCount[0].count} employees, consider enabling AI-powered features for deeper insights.`,
          details: "Enable AI analytics to unlock predictive insights, cost optimization, and risk detection.",
          dataPoints: JSON.stringify({ employees: employeeCount[0].count }),
          generatedBy: 'system',
          confidence: "100",
          actionable: true,
          status: 'active',
          suggestedActions: [
            "Enable AI-powered analytics",
            "Review workforce metrics dashboard",
            "Set up automated reporting"
          ],
          estimatedImpact: "Potential 15-25% efficiency gain",
        }).returning();
        insights.push(savingsInsight[0]);
      }
    }

    res.json({
      message: "AI insights generated successfully",
      insights,
      count: insights.length,
      aiPowered: useAI,
      tokensUsed: totalTokensUsed,
    });
  } catch (error) {
    log.error("Error generating AI insights:", error);
    res.status(500).json({ message: "Failed to generate insights" });
  }
});

router.get("/metrics", requireAuth, async (req, res) => {
  try {
    const { workspaceId } = req;
    const { period = 'daily', limit = 30 } = req.query;

    const snapshots = await db.query.metricsSnapshots.findMany({
      where: (metricsSnapshots, { eq, and }) => and(
        eq(metricsSnapshots.workspaceId, workspaceId!),
        eq(metricsSnapshots.period, period as string)
      ),
      orderBy: (metricsSnapshots, { desc }) => [desc(metricsSnapshots.snapshotDate)],
      limit: Math.min(Math.max(1, parseInt(limit as string) || 50), 200),
    });

    res.json(snapshots);
  } catch (error) {
    log.error("Error fetching metrics:", error);
    res.status(500).json({ message: "Failed to fetch metrics" });
  }
});

router.post("/api/predict/turnover", requireManager, async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { employeeId } = req.body;

    if (!employeeId) {
      return res.status(400).json({ message: "employeeId is required" });
    }

    const { storage } = await import("../storage");
    const employee = await storage.getEmployee(employeeId, workspaceId);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found in your workspace" });
    }

    const { PredictionOSEngine } = await import("../services/predictionos");
    const analysis = await PredictionOSEngine.analyzeTurnoverRisk(employeeId, workspaceId);
    const predictionId = await PredictionOSEngine.saveTurnoverPrediction(employeeId, workspaceId, analysis);

    res.json({
      predictionId,
      employee: {
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`,
        role: employee.role,
      },
      ...analysis,
    });
  } catch (error: unknown) {
    log.error("PredictionOS turnover analysis failed:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to analyze turnover risk" });
  }
});

router.get("/api/predict/turnover/workspace", requireManager, async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { turnoverRiskScores } = await import("@shared/schema");

    const predictions = await db
      .select()
      .from(turnoverRiskScores)
      .where(eq(turnoverRiskScores.workspaceId, workspaceId))
      .orderBy(desc(turnoverRiskScores.analysisDate));

    const totalTurnoverCost = predictions.reduce((sum, pred) => {
      return sum + parseFloat(pred.totalTurnoverCost?.toString() || "0");
    }, 0);

    res.json({
      predictions,
      totalTurnoverCost,
      highRiskCount: predictions.filter((p) => p.riskLevel === "high" || p.riskLevel === "critical").length,
    });
  } catch (error: unknown) {
    log.error("Error fetching turnover predictions:", error);
    res.status(500).json({ message: "Failed to fetch predictions" });
  }
});

router.post("/api/predict/cost-overrun", requireManager, async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { scheduleDate, proposedShifts } = req.body;

    if (!scheduleDate || !proposedShifts || !Array.isArray(proposedShifts)) {
      return res.status(400).json({ message: "scheduleDate and proposedShifts array are required" });
    }

    const { PredictionOSEngine } = await import("../services/predictionos");
    const analysis = await PredictionOSEngine.analyzeCostVariance(workspaceId, new Date(scheduleDate), proposedShifts);
    const predictionId = await PredictionOSEngine.saveCostVariancePrediction(workspaceId, new Date(scheduleDate), analysis);

    res.json({
      predictionId,
      ...analysis,
    });
  } catch (error: unknown) {
    log.error("PredictionOS cost variance analysis failed:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to analyze cost variance" });
  }
});

router.get("/api/patterns/employee/:employeeId", requireAuth, async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { employeeId } = req.params;
    const { employeePatternService } = await import("../services/employeePatternService");

    const pattern = await employeePatternService.getEmployeePattern(workspaceId, employeeId);
    if (!pattern) {
      return res.status(404).json({ error: "Employee not found" });
    }

    res.json({ success: true, data: pattern });
  } catch (error: unknown) {
    log.error("Error fetching employee pattern:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/api/patterns/workspace", requireManager, async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { employeePatternService } = await import("../services/employeePatternService");

    const patterns = await employeePatternService.getWorkspacePatterns(workspaceId);

    res.json({
      success: true,
      data: patterns,
      count: patterns.length,
    });
  } catch (error: unknown) {
    log.error("Error fetching workspace patterns:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/api/patterns/similar/:employeeId", requireAuth, async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { employeeId } = req.params;
    const { employeePatternService } = await import("../services/employeePatternService");

    const similarPatterns = await employeePatternService.findSimilarPatterns(workspaceId, employeeId);

    res.json({
      success: true,
      data: similarPatterns,
      count: similarPatterns.length,
    });
  } catch (error: unknown) {
    log.error("Error finding similar patterns:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

export default router;
