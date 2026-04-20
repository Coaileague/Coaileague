import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { requireAuth } from '../auth';
import { unifiedAIOrchestrator, aiActionLogger, taskRouter, claudeVerificationService, trinityConfidenceScorer, claudeService } from "../services/ai-brain/dualai";
import { tokenManager, TOKEN_COSTS } from '../services/billing/tokenManager';
import { createLogger } from '../lib/logger';
const log = createLogger('AiOrchestratorRoutes');


// Maps AI Orchestrator task types to the correct TOKEN_COSTS feature key + override amount.
// Used to ensure contract reviews charge 30 credits, compliance audits 25, etc.
const TASK_CREDIT_MAP: Record<string, { key: keyof typeof TOKEN_COSTS; amount: number }> = {
  contract_review:       { key: 'trinity_contract_review', amount: 30 },
  rfp_response:          { key: 'rfp_proposal_generation', amount: 30 },
  capability_statement:  { key: 'rfp_proposal_generation', amount: 30 },
  strategic_planning:    { key: 'trinity_strategic',        amount: 30 },
  risk_assessment:       { key: 'trinity_analysis',         amount: 25 },
  compliance_analysis:   { key: 'compliance_audit',        amount: 25 },
  audit_preparation:     { key: 'compliance_audit',        amount: 25 },
  financial_analysis:    { key: 'pnl_analysis',            amount: 20 },
  financial_report:      { key: 'financial_pl_summary',    amount: 25 },
  cfo_dashboard:         { key: 'financial_pl_summary',    amount: 25 },
  scheduling_optimization: { key: 'ai_scheduling',         amount: 3  },
  payroll_processing:    { key: 'ai_payroll_processing',   amount: 5  },
  document_generation:   { key: 'ai_document_processing',  amount: 10 },
  data_research:         { key: 'ai_analytics_report',     amount: 15 },
};

const router = Router();

const ProcessRequestSchema = z.object({
  task: z.string().min(1),
  taskType: z.string().optional(),
  dataNeeds: z.array(z.string()).optional(),
  additionalContext: z.record(z.any()).optional(),
  forceAi: z.enum(['trinity', 'claude']).optional(),
});

const VerificationRequestSchema = z.object({
  operationType: z.string(),
  missingDataPoints: z.number().default(0),
  edgeCasesDetected: z.array(z.string()).default([]),
  hasHistoricalPrecedent: z.boolean().default(true),
  financialImpact: z.number().default(0),
  hasRegulatoryImplications: z.boolean().default(false),
  anomalyScore: z.number().default(0),
  affectsMultipleUsers: z.number().default(0),
  proposedAction: z.record(z.any()),
  data: z.record(z.any()).optional(),
});

const ConfidenceScoreRequestSchema = z.object({
  operationType: z.string(),
  missingDataPoints: z.number().default(0),
  edgeCasesDetected: z.array(z.string()).default([]),
  hasHistoricalPrecedent: z.boolean().default(true),
  financialImpact: z.number().default(0),
  hasRegulatoryImplications: z.boolean().default(false),
  anomalyScore: z.number().default(0),
  affectsMultipleUsers: z.number().default(0),
  data: z.record(z.any()).optional(),
});

router.post("/process", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: "Workspace ID required" });
    }

    const parsed = ProcessRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }

    const { task, taskType, dataNeeds, additionalContext, forceAi } = parsed.data;

    const result = await unifiedAIOrchestrator.processRequest({
      sessionId: randomUUID(),
      task,
      taskType: taskType as any,
      dataNeeds,
      userId: user?.id,
      workspaceId,
      additionalContext,
      forceAi,
    });

    // Deduct credits based on task type — unifiedAIOrchestrator has no internal billing
    const creditInfo = TASK_CREDIT_MAP[taskType || ''] || { key: 'ai_general' as keyof typeof TOKEN_COSTS, amount: TOKEN_COSTS['ai_general'] };
    tokenManager.recordUsage({
      workspaceId,
      userId: user?.id || 'system',
      featureKey: creditInfo.key,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      featureName: `AI Orchestrator: ${taskType || 'general'}`,
      description: task.substring(0, 120),
      amountOverride: creditInfo.amount,
    }).catch((billErr: unknown) => { log.error('[AI Orchestrator] Credit deduction failed (non-blocking):', (billErr as any)?.message); });

    return res.json({
      success: true,
      result: {
        content: result.content,
        primaryAi: result.primaryAi,
        supportAi: result.supportAi,
        collaborationType: result.collaborationType,
        creditsUsed: result.creditsUsed,
        latencyMs: result.latencyMs,
        sessionId: result.sessionId,
      },
    });
  } catch (error: unknown) {
    log.error("[AIOrchestrator] Process error:", error);
    return res.status(500).json({ error: "Processing failed", message: sanitizeError(error) });
  }
});

router.post("/consult", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: "Workspace ID required" });
    }

    const { task, context } = req.body;

    if (!task) {
      return res.status(400).json({ error: "Task is required" });
    }

    const result = await (claudeService as any).execute({
      task,
      sessionId: randomUUID(),
      userId: user?.id,
      workspaceId,
      trinityContext: context,
    });

    // Infer task type from the task string and charge the correct credit rate
    const inferredTaskType = taskRouter.inferTaskType(task);
    const consultCreditInfo = TASK_CREDIT_MAP[inferredTaskType] || { key: 'ai_general' as keyof typeof TOKEN_COSTS, amount: TOKEN_COSTS['ai_general'] };
    tokenManager.recordUsage({
      workspaceId,
      userId: user?.id || 'system',
      featureKey: consultCreditInfo.key,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      featureName: `AI Consult: ${inferredTaskType}`,
      description: task.substring(0, 120),
      amountOverride: consultCreditInfo.amount,
    }).catch((billErr: unknown) => { log.error('[AI Orchestrator Consult] Billing failed:', (billErr as any)?.message); });

    return res.json({
      success: true,
      consultation: {
        content: result.content,
        creditsUsed: result.creditsUsed,
        latencyMs: result.latencyMs,
      },
    });
  } catch (error: unknown) {
    log.error("[AIOrchestrator] Consultation error:", error);
    return res.status(500).json({ error: "Consultation failed", message: sanitizeError(error) });
  }
});

router.post("/verify", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: "Workspace ID required" });
    }

    const parsed = VerificationRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }

    const data = parsed.data;

    const operation = {
      type: data.operationType,
      workspaceId,
      missingDataPoints: data.missingDataPoints,
      edgeCasesDetected: data.edgeCasesDetected,
      hasHistoricalPrecedent: data.hasHistoricalPrecedent,
      financialImpact: data.financialImpact,
      hasRegulatoryImplications: data.hasRegulatoryImplications,
      anomalyScore: data.anomalyScore,
      affectsMultipleUsers: data.affectsMultipleUsers,
      data: data.data || {},
    };

    const confidence = trinityConfidenceScorer.calculateConfidence(operation);

    const verification = await claudeVerificationService.verify({
      operation,
      trinityConfidence: confidence,
      trinityProposedAction: data.proposedAction,
      context: {
        sessionId: randomUUID(),
        workspaceId,
        userId: user?.id,
        task: `Verify ${data.operationType}`,
      },
    });

    return res.json({
      success: true,
      verification: {
        approved: verification.approved,
        boostedConfidence: verification.boostedConfidence,
        criticalIssues: verification.criticalIssues,
        suggestedModifications: verification.suggestedModifications,
        rejectionReason: verification.rejectionReason,
        reasoning: verification.reasoning,
        creditsUsed: verification.creditsUsed,
      },
    });
  } catch (error: unknown) {
    log.error("[AIOrchestrator] Verification error:", error);
    return res.status(500).json({ error: "Verification failed", message: sanitizeError(error) });
  }
});

router.post("/route", requireAuth, async (req: Request, res: Response) => {
  try {
    const { task, domain, context } = req.body;

    if (!task) {
      return res.status(400).json({ error: "Task is required" });
    }

    const taskType = taskRouter.inferTaskType(task);
    const routing = taskRouter.routeTask(taskType, context?.dataNeeds || []);

    return res.json({
      success: true,
      routing: {
        taskType,
        primaryAI: routing.primaryAi,
        supportAI: routing.supportAi,
        collaborationType: routing.collaborationType,
        estimatedCredits: routing.estimatedCredits,
        reason: routing.reason,
        dataNeeds: routing.dataNeeds,
      },
    });
  } catch (error: unknown) {
    log.error("[AIOrchestrator] Routing error:", error);
    return res.status(500).json({ error: "Routing failed", message: sanitizeError(error) });
  }
});

router.post("/score-confidence", requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = ConfidenceScoreRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }

    const data = parsed.data;

    const operation = {
      type: data.operationType,
      missingDataPoints: data.missingDataPoints,
      edgeCasesDetected: data.edgeCasesDetected,
      hasHistoricalPrecedent: data.hasHistoricalPrecedent,
      financialImpact: data.financialImpact,
      hasRegulatoryImplications: data.hasRegulatoryImplications,
      anomalyScore: data.anomalyScore,
      affectsMultipleUsers: data.affectsMultipleUsers,
      data: data.data || {},
    };

    const score = trinityConfidenceScorer.calculateConfidence(operation);

    return res.json({
      success: true,
      confidence: {
        score: score.score,
        concerns: score.concerns,
        edgeCases: score.edgeCases,
        recommendation: score.recommendation,
      },
    });
  } catch (error: unknown) {
    log.error("[AIOrchestrator] Confidence scoring error:", error);
    return res.status(500).json({ error: "Scoring failed", message: sanitizeError(error) });
  }
});

router.get("/logs", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: "Workspace ID required" });
    }

    const { 
      limit = 50, 
      offset = 0, 
      primaryAI, 
      actionType, 
      collaborationType,
      startDate,
      endDate,
    } = req.query;

    const logs = await (aiActionLogger as any).getLogs({
      workspaceId,
      limit: Number(limit),
      offset: Number(offset),
      filters: {
        primaryAI: primaryAI as string,
        actionType: actionType as string,
        collaborationType: collaborationType as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
      },
    });

    return res.json({
      success: true,
      logs,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
      },
    });
  } catch (error: unknown) {
    log.error("[AIOrchestrator] Logs error:", error);
    return res.status(500).json({ error: "Failed to fetch logs", message: sanitizeError(error) });
  }
});

router.get("/stats", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: "Workspace ID required" });
    }

    const { period = '24h' } = req.query;

    const stats = await (aiActionLogger as any).getStats({
      workspaceId,
      period: period as string,
    });

    return res.json({
      success: true,
      stats,
    });
  } catch (error: unknown) {
    log.error("[AIOrchestrator] Stats error:", error);
    return res.status(500).json({ error: "Failed to fetch stats", message: sanitizeError(error) });
  }
});

router.get("/capabilities", requireAuth, async (_req: Request, res: Response) => {
  try {
    const capabilities = {
      trinity: {
        name: "Trinity (Gemini)",
        role: "CEO/Orchestrator",
        strengths: [
          "Autonomous scheduling optimization",
          "Real-time monitoring and alerts",
          "Data analysis and pattern recognition",
          "Payroll processing",
          "System health monitoring",
          "Quick operational decisions",
        ],
        taskTypes: taskRouter.getTrinityTaskTypes(),
      },
      claude: {
        name: "Claude (Anthropic)",
        role: "CFO/Specialist",
        strengths: [
          "RFP and proposal writing",
          "Compliance analysis",
          "Contract generation and review",
          "Strategic planning",
          "Policy development",
          "Complex reasoning tasks",
        ],
        taskTypes: taskRouter.getClaudeTaskTypes(),
      },
      collaboration: {
        patterns: [
          {
            type: "verification",
            description: "Claude verifies critical Trinity outputs",
            triggers: ["payroll", "compliance", "financial"],
          },
          {
            type: "consultation",
            description: "Trinity consults Claude for complex decisions",
            triggers: ["strategic", "regulatory", "contract"],
          },
          {
            type: "parallel",
            description: "Both AIs work on different aspects simultaneously",
            triggers: ["audit_preparation", "comprehensive_reports"],
          },
        ],
        collaborativeTaskTypes: taskRouter.getCollaborativeTaskTypes(),
      },
    };

    return res.json({
      success: true,
      capabilities,
    });
  } catch (error: unknown) {
    log.error("[AIOrchestrator] Capabilities error:", error);
    return res.status(500).json({ error: "Failed to fetch capabilities", message: sanitizeError(error) });
  }
});

router.get("/health", requireAuth, async (_req: Request, res: Response) => {
  try {
    const health = {
      status: "operational",
      services: {
        orchestrator: "healthy",
        taskRouter: "healthy",
        confidenceScorer: "healthy",
        actionLogger: "healthy",
        claudeService: "healthy",
        verificationService: "healthy",
      },
      timestamp: new Date().toISOString(),
    };

    return res.json({
      success: true,
      health,
    });
  } catch (error: unknown) {
    return res.status(500).json({
      success: false,
      health: {
        status: "degraded",
        error: sanitizeError(error),
      },
    });
  }
});

export default router;
