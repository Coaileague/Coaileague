import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { requireAuth } from "../auth";
import { readLimiter, workspaceTrinityLimiter } from "../middleware/rateLimiter";
import { requireManager, requireOwner, type AuthenticatedRequest } from "../rbac";
import { storage } from "../storage";
import { db } from "../db";
import { workspaces } from "@shared/schema";
import { eq } from "drizzle-orm";
import aiBrainConfig from "@shared/config/aiBrainGuardrails";
import { issueDetectionService } from "../services/issueDetectionService";
import { aiNotificationService } from "../services/aiNotificationService";
import { notificationStateManager } from "../services/notificationStateManager";
import { typedPool } from '../lib/typedSql';
import { NotificationDeliveryService } from '../services/notificationDeliveryService';
import { createLogger } from '../lib/logger';
import { PLATFORM } from '../config/platformConfig';
const log = createLogger('AiBrainInlineRoutes');


const router = Router();

router.post("/detect-issues", requireManager, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { documentType, extractedData, documentId, useAIAnalysis } = req.body;

    if (!documentType || !extractedData) {
      return res.status(400).json({
        error: "Missing required fields: documentType, extractedData",
      });
    }

    const result = useAIAnalysis
      ? await issueDetectionService.analyzeWithAI(workspaceId, documentType, extractedData, documentId)
      : await issueDetectionService.detectIssues(workspaceId, documentType, extractedData, documentId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    log.error("Error detecting issues:", error);
    res.status(500).json({ error: sanitizeError(error) || "Issue detection failed" });
  }
});

router.post("/guardrails/validate", requireManager, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { ruleType, value } = req.body;

    if (!ruleType || value === undefined) {
      return res.status(400).json({
        error: "Missing required fields: ruleType, value",
      });
    }

    const isViolated = aiBrainConfig.isGuardrailViolated(ruleType, value);

    res.json({
      success: true,
      data: {
        ruleType,
        value,
        isViolated,
        message: isViolated ? `Guardrail violation: ${ruleType} exceeded` : "Within acceptable limits",
      },
    });
  } catch (error: unknown) {
    log.error("Error validating guardrails:", error);
    res.status(500).json({ error: sanitizeError(error) || "Validation failed" });
  }
});

router.get("/guardrails/config", requireManager, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    
    // Verify workspace access
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, workspaceId),
    });

    if (!workspace) {
      return res.status(403).json({ error: "Workspace not found or access denied" });
    }

    res.json({
      success: true,
      data: aiBrainConfig.guardrails,
    });
  } catch (error: unknown) {
    log.error("Error fetching guardrails config:", error);
    res.status(500).json({ error: sanitizeError(error) || "Failed to fetch config" });
  }
});

  router.post("/workflow/execute", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { autonomousWorkflowService } = await import("../services/ai-brain/autonomousWorkflowService");
      const { suggestionId, includeRelated } = req.body;

      if (!suggestionId) {
        return res.status(400).json({ success: false, error: "suggestionId required" });
      }

      const result = await autonomousWorkflowService.executeWorkflow(
        suggestionId,
        req.userId!,
        includeRelated !== false
      );

      res.json({ success: result.success, data: result });
    } catch (error: unknown) {
      log.error("Error executing workflow:", error);
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.post("/workflow/high-priority-fixes", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { autonomousWorkflowService } = await import("../services/ai-brain/autonomousWorkflowService");
      const result = await autonomousWorkflowService.executeHighPriorityFixes(req.userId!);
      res.json({ success: true, data: result });
    } catch (error: unknown) {
      log.error("Error executing high-priority fixes:", error);
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.post("/knowledge/route-query", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { knowledgeOrchestrationService } = await import("../services/ai-brain/knowledgeOrchestrationService");
      const { query, currentPage, recentActions } = req.body;

      if (!query) {
        return res.status(400).json({ success: false, error: "query required" });
      }

      const context = {
        userId: req.userId!,
        workspaceId: req.user?.activeWorkspaceId,
        userRole: req.user?.platformRole || 'user',
        currentPage,
        recentActions,
      };

      const decision = await knowledgeOrchestrationService.routeQuery(query, context);
      res.json({ success: true, data: decision });
    } catch (error: unknown) {
      log.error("Error routing query:", error);
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.get("/knowledge/diagnostics", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { knowledgeOrchestrationService } = await import("../services/ai-brain/knowledgeOrchestrationService");
      const diagnostics = knowledgeOrchestrationService.getDiagnostics();
      res.json({ success: true, data: diagnostics });
    } catch (error: unknown) {
      log.error("Error getting knowledge diagnostics:", error);
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.post("/knowledge/record-learning", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { knowledgeOrchestrationService } = await import("../services/ai-brain/knowledgeOrchestrationService");
      const { queryType, userIntent, selectedRoute, wasSuccessful, executionTimeMs, userFeedback } = req.body;

      knowledgeOrchestrationService.recordLearning({
        queryType,
        userIntent,
        selectedRoute,
        wasSuccessful,
        executionTimeMs,
        userFeedback,
        metadata: { userId: req.userId },
      });

      res.json({ success: true });
    } catch (error: unknown) {
      log.error("Error recording learning:", error);
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.post("/diagnostic/run-fast", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { runFastPlatformDiagnostic } = await import("../services/ai-brain/trinityFastDiagnostic");
      
      
      const report = await runFastPlatformDiagnostic({
        userId: req.userId,
        workspaceId: req.workspaceId,
        sendNotifications: true,
        applySelfHealing: true,
      });
      
      res.json({ 
        success: true, 
        data: report,
        message: `Diagnostic complete. Health: ${report.overallHealth}. Found ${report.findings.length} issues.`
      });
    } catch (error: unknown) {
      log.error("[API] FAST diagnostic failed:", error);
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.get("/services/registry", requireAuth, async (_req: AuthenticatedRequest, res) => {
    try {
      const { getServiceWatchdog } = await import("../services/ai-brain/serviceOrchestrationWatchdog");
      const watchdog = getServiceWatchdog();
      const registry = watchdog.getServiceRegistry();
      
      res.json({
        success: true,
        ...registry,
      });
    } catch (error: unknown) {
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.get("/services/orphans", requireAuth, async (_req: AuthenticatedRequest, res) => {
    try {
      const { getServiceWatchdog } = await import("../services/ai-brain/serviceOrchestrationWatchdog");
      const watchdog = getServiceWatchdog();
      const orphans = watchdog.getOrphanServices();
      
      res.json({
        success: true,
        count: orphans.length,
        services: orphans,
      });
    } catch (error: unknown) {
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.post("/services/:serviceId/heartbeat", requireAuth, async (req, res) => {
    try {
      const { serviceId } = req.params;
      const { healthScore } = req.body;
      
      const { getServiceWatchdog } = await import("../services/ai-brain/serviceOrchestrationWatchdog");
      const watchdog = getServiceWatchdog();
      watchdog.recordHeartbeat(serviceId, healthScore);
      
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.post("/services/:serviceId/hotpatch", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { serviceId } = req.params;
      const { type, payload, requiresApproval = true } = req.body;
      
      const { getServiceWatchdog } = await import("../services/ai-brain/serviceOrchestrationWatchdog");
      const watchdog = getServiceWatchdog();
      
      const result = await watchdog.requestHotpatch(serviceId, {
        type,
        payload,
        requiresApproval,
      });
      
      res.json(result);
    } catch (error: unknown) {
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.get("/knowledge/insights/:queryType", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { knowledgeOrchestrationService } = await import("../services/ai-brain/knowledgeOrchestrationService");
      const { queryType } = req.params;
      const insights = knowledgeOrchestrationService.getLearningInsights(queryType);
      res.json({ success: true, data: insights });
    } catch (error: unknown) {
      log.error("Error getting insights:", error);
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.post("/knowledge/reasoning-chain", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { knowledgeOrchestrationService } = await import("../services/ai-brain/knowledgeOrchestrationService");
      const { query, observations = [] } = req.body;

      if (!query) {
        return res.status(400).json({ success: false, error: "query required" });
      }

      const context = {
        userId: req.userId!,
        workspaceId: req.user?.activeWorkspaceId,
        userRole: req.user?.platformRole || 'user',
      };

      const chain = knowledgeOrchestrationService.buildReasoningChain(query, context, observations);
      res.json({ success: true, data: chain });
    } catch (error: unknown) {
      log.error("Error building reasoning chain:", error);
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.post("/knowledge/test-orchestration", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { knowledgeOrchestrationService } = await import("../services/ai-brain/knowledgeOrchestrationService");
      const { testQuery = "Show me employee schedules for next week" } = req.body;

      const context = {
        userId: req.userId!,
        workspaceId: req.user?.activeWorkspaceId,
        userRole: req.user?.platformRole || 'user',
        currentPage: '/test',
      };

      const startTime = Date.now();

      // Test 1: Query Routing
      const routingResult = await knowledgeOrchestrationService.routeQuery(testQuery, context);

      // Test 2: Reasoning Chain
      const reasoningResult = await knowledgeOrchestrationService.buildReasoningChain(
        testQuery,
        context,
        ['System is operational', 'Gemini 3 Pro connected']
      );

      // Test 3: Diagnostics
      const diagnostics = knowledgeOrchestrationService.getDiagnostics();

      const totalTime = Date.now() - startTime;

      res.json({
        success: true,
        testResults: {
          routing: {
            targetModel: routingResult.targetModel,
            preset: routingResult.preset,
            confidence: routingResult.confidenceScore,
            aiGenerated: routingResult.aiGenerated,
            reasoning: routingResult.reasoning,
          },
          reasoning: {
            stepsCount: reasoningResult.steps.length,
            conclusion: reasoningResult.conclusion,
            confidence: reasoningResult.confidence,
            aiGenerated: reasoningResult.aiGenerated,
            modelUsed: reasoningResult.modelUsed,
            tokensUsed: reasoningResult.tokensUsed,
          },
          diagnostics: {
            geminiEnabled: diagnostics.geminiEnabled,
            knowledgeNodes: diagnostics.knowledgeNodeCount,
            learningEntries: diagnostics.learningEntryCount,
          },
          performance: {
            totalTimeMs: totalTime,
          },
        },
      });
    } catch (error: unknown) {
      log.error("Error testing orchestration:", error);
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.post("/workflow/search-and-fix", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { autonomousWorkflowService } = await import("../services/ai-brain/autonomousWorkflowService");
      const { issueType } = req.body;

      if (!issueType) {
        return res.status(400).json({ success: false, error: "issueType required" });
      }

      const result = await autonomousWorkflowService.searchAndExecuteForIssue(issueType, req.userId!);

      res.json({ success: !!result, data: result });
    } catch (error: unknown) {
      log.error("Error searching and fixing:", error);
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.post("/command/execute", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { aiBrainMasterOrchestrator } = await import("../services/ai-brain/aiBrainMasterOrchestrator");
      const { aiBrainAuthorizationService } = await import("../services/ai-brain/aiBrainAuthorizationService");
      const { actionId, category, parameters } = req.body;

      if (!actionId || !category) {
        return res.status(400).json({ error: 'actionId and category required' });
      }

      const authCheck = await aiBrainAuthorizationService.validateSupportStaff(req.userId!);
      if (!authCheck.valid) {
        return res.status(403).json({ error: authCheck.reason });
      }

      const actionAuthCheck = await aiBrainAuthorizationService.canExecuteAction(
        { userId: req.userId!, userRole: authCheck.role! },
        category,
        actionId
      );

      if (!actionAuthCheck.isAuthorized) {
        return res.status(403).json({ error: actionAuthCheck.reason });
      }

      const { helpaiOrchestrator } = await import("../services/helpai/platformActionHub");
      const result = await helpaiOrchestrator.executeAction({
        actionId: `${category}.${actionId}`,
        category: category as any,
        name: actionId,
        payload: parameters || {},
        userId: req.userId,
        userRole: authCheck.role!,
        priority: parameters?.priority || 'normal'
      });

      await aiBrainAuthorizationService.logCommandExecution({
        userId: req.userId!,
        userRole: authCheck.role!,
        actionId: `${category}.${actionId}`,
        category,
        parameters,
        result: result.success
      });

      res.json({ success: result.success, message: result.message, data: result, executedBy: req.userId, authorizedRole: authCheck.role });
    } catch (error: unknown) {
      log.error('[AI Brain Command]', error);
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.post("/workflow/execute-chain", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { aiBrainMasterOrchestrator } = await import("../services/ai-brain/aiBrainMasterOrchestrator");
      const { aiBrainAuthorizationService } = await import("../services/ai-brain/aiBrainAuthorizationService");
      const { name, steps } = req.body;

      if (!name || !Array.isArray(steps)) {
        return res.status(400).json({ error: 'name and steps required' });
      }

      const authCheck = await aiBrainAuthorizationService.validateSupportStaff(req.userId!);
      if (!authCheck.valid) {
        return res.status(403).json({ error: authCheck.reason });
      }

      const workflow = await aiBrainMasterOrchestrator.executeWorkflowChain(name, steps, req.userId!, authCheck.role!);
      res.json({ success: workflow.status === 'completed', workflow, executedBy: req.userId, authorizedRole: authCheck.role });
    } catch (error: unknown) {
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.get("/permissions/summary", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { aiBrainAuthorizationService } = await import("../services/ai-brain/aiBrainAuthorizationService");
      const authCheck = await aiBrainAuthorizationService.validateSupportStaff(req.userId!);
      if (!authCheck.valid) {
        return res.status(403).json({ error: authCheck.reason, isSupported: false });
      }
      const summary = aiBrainAuthorizationService.getPermissionSummary(authCheck.role!);
      res.json({ success: true, ...summary });
    } catch (error: unknown) {
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.get("/graduation-status", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { subagentSupervisor } = await import("../services/ai-brain/subagentSupervisor");
      const workspaceId = req.workspaceId || req.user?.workspaceId;
      
      if (!workspaceId) {
        return res.status(400).json({ success: false, error: "Workspace ID required" });
      }

      const graduationStatus = await subagentSupervisor.getGraduationStatus(workspaceId);
      
      res.json({
        success: true,
        graduationStatus,
        thresholds: {
          graduationThreshold: 99.9,
          minimumExecutions: 100
        }
      });
    } catch (error: unknown) {
      log.error("[API] Failed to get graduation status:", error);
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.post("/can-auto-approve", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { subagentSupervisor } = await import("../services/ai-brain/subagentSupervisor");
      const { domain, actionId } = req.body;
      const workspaceId = req.workspaceId || req.user?.workspaceId;

      if (!workspaceId || !domain) {
        return res.status(400).json({ success: false, error: "workspaceId and domain required" });
      }

      const result = await subagentSupervisor.canAutoApprove(workspaceId, domain, actionId);
      res.json({ success: true, ...result });
    } catch (error: unknown) {
      log.error("[API] Auto-approval check failed:", error);
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.get("/fast-mode/tiers", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { FAST_MODE_CONTEXTS } = await import("../services/ai-brain/subagentSupervisor");
      res.json({
        success: true,
        tiers: FAST_MODE_CONTEXTS,
        description: {
          standard: "4 concurrent actions, 15s SLA, 1.5x credits",
          premium: "8 concurrent actions, 10s SLA, 2x credits, parallel phases",
          enterprise: "16 concurrent actions, 5s SLA, 2.5x credits, parallel phases, skip non-critical validation"
        }
      });
    } catch (error: unknown) {
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.post("/fast-mode/execute", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { subagentSupervisor, FAST_MODE_CONTEXTS } = await import("../services/ai-brain/subagentSupervisor");
      const { getUserPlatformRole } = await import("../rbac");
      
      const userId = req.userId!;
      const workspaceId = req.workspaceId || req.user?.workspaceId;
      const { tier = 'standard', actions } = req.body;

      if (!workspaceId) {
        return res.status(400).json({ success: false, error: "workspaceId required" });
      }

      if (!actions || !Array.isArray(actions) || actions.length === 0) {
        return res.status(400).json({ success: false, error: "actions array required" });
      }

      const platformRole = await getUserPlatformRole(userId) || 'user';
      const fastModeContext = FAST_MODE_CONTEXTS[tier] || FAST_MODE_CONTEXTS.standard;

      // Map actions to executable format
      const executableActions = actions.map((action: any) => ({
        domain: action.domain,
        actionId: action.actionId,
        parameters: action.parameters || {},
        actionHandler: async (params: Record<string, any>) => {
          return { executed: true, params };
        }
      }));

      const result = await subagentSupervisor.executeWithFastModeContext(
        executableActions,
        userId,
        workspaceId,
        platformRole,
        fastModeContext
      );

      res.json({
        success: result.success,
        results: result.results,
        totalDurationMs: result.totalDurationMs,
        parallelExecuted: result.parallelExecuted,
        phaseReports: result.phaseReports,
        graduationImpact: result.graduationImpact,
        tier: fastModeContext.tier
      });
    } catch (error: unknown) {
      log.error("[API] Fast Mode execution failed:", error);
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.get("/fast-mode/metrics", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { subagentSupervisor } = await import("../services/ai-brain/subagentSupervisor");
      const workspaceId = req.workspaceId || req.user?.workspaceId;

      if (!workspaceId) {
        return res.status(400).json({ success: false, error: "workspaceId required" });
      }

      const metrics = await subagentSupervisor.getFastModeMetrics(workspaceId);
      res.json({ success: true, metrics });
    } catch (error: unknown) {
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.get("/mailing-instructions", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { MAILING_INSTRUCTIONS } = await import("../services/ai-brain/subagentSupervisor");
      res.json({
        success: true,
        instructions: MAILING_INSTRUCTIONS,
        categories: Object.keys(MAILING_INSTRUCTIONS),
        description: "Specialized mailing instructions for all email categories"
      });
    } catch (error: unknown) {
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.get("/mailing-instructions/:category", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { getMailingInstruction } = await import("../services/ai-brain/subagentSupervisor");
      const { category } = req.params;
      
      const instruction = getMailingInstruction(category);
      if (!instruction) {
        return res.status(404).json({ 
          success: false, 
          error: `Unknown email category: ${category}`,
          availableCategories: ['password_reset', 'verification', 'shift_assignment', 'shift_reminder', 
                               'invoice_generated', 'payroll_processed', 'platform_update', 
                               'support_ticket_confirmation', 'employee_invitation', 'weekly_digest']
        });
      }

      res.json({ success: true, category, instruction });
    } catch (error: unknown) {
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.post("/mailing-instructions/validate", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { validateEmailData } = await import("../services/ai-brain/subagentSupervisor");
      const { category, data } = req.body;

      if (!category || !data) {
        return res.status(400).json({ success: false, error: "category and data required" });
      }

      const validation = validateEmailData(category, data);
      res.json({ 
        success: true, 
        category,
        validation,
        ready: validation.valid
      });
    } catch (error: unknown) {
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.post("/mailer/send", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { getMailingInstruction, validateEmailData } = await import("../services/ai-brain/subagentSupervisor");
      const { emailService } = await import("../services/emailService");
      
      const { category, recipient, data } = req.body;
      const workspaceId = req.workspaceId || req.user?.workspaceId;
      const userId = req.userId!;

      if (!category || !recipient || !data) {
        return res.status(400).json({ success: false, error: "category, recipient, and data required" });
      }

      // Validate against mailing instructions
      const instruction = getMailingInstruction(category);
      if (!instruction) {
        return res.status(400).json({ success: false, error: `Unknown email category: ${category}` });
      }

      const validation = validateEmailData(category, { email: recipient, ...data });
      if (!validation.valid) {
        return res.status(400).json({ 
          success: false, 
          error: "Email data validation failed",
          errors: validation.errors
        });
      }

      // Log the email send attempt for telemetry

      // Send via NDS — tracked delivery with automatic retry on failure
      const notifId = await NotificationDeliveryService.send({
        type: 'ai_brain_email',
        workspaceId: workspaceId || 'system',
        recipientUserId: userId || recipient,
        channel: 'email',
        body: {
          to: recipient,
          subject: data.subject || `${PLATFORM.name} ${category.replace(/_/g, ' ')}`,
          html: data.html || `<p>${data.message || 'No content provided'}</p>`,
        },
      });

      res.json({
        success: true,
        messageId: notifId,
        category,
        instruction: {
          priority: instruction.priority,
          maxRetries: instruction.maxRetries,
          deliveryRules: instruction.deliveryRules
        },
        governedByAiBrain: true
      });
    } catch (error: unknown) {
      log.error("[MailerSubagent] Email send failed:", error);
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.post("/work-orders/execute", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { subagentSupervisor } = await import("../services/ai-brain/subagentSupervisor");
      const { workboardJobId, tasks, options } = req.body;
      const workspaceId = req.workspaceId || req.user?.workspaceId;
      const userId = req.userId!;
      const platformRole = req.platformRole || 'employee';

      if (!workboardJobId || !tasks || !Array.isArray(tasks) || tasks.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: "workboardJobId and tasks array required" 
        });
      }


      const result = await subagentSupervisor.executeParallelWorkOrders({
        workboardJobId,
        workspaceId: workspaceId!,
        userId,
        platformRole,
        tasks,
        options
      });

      res.json({
        success: result.success,
        batchId: result.batchId,
        completedItems: result.completedItems,
        failedItems: result.failedItems,
        totalDurationMs: result.totalDurationMs,
        totalTokensUsed: result.totalTokensUsed,
        summary: result.summary
      });
    } catch (error: unknown) {
      log.error("[API] Parallel work orders failed:", error);
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.get("/work-orders/batch/:batchId", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { subagentSupervisor } = await import("../services/ai-brain/subagentSupervisor");
      const { batchId } = req.params;

      const batch = subagentSupervisor.getBatchStatus(batchId);
      if (!batch) {
        return res.status(404).json({ 
          success: false, 
          error: `Batch not found: ${batchId}` 
        });
      }

      res.json({
        success: true,
        batch: {
          id: batch.id,
          workboardJobId: batch.workboardJobId,
          status: batch.status,
          completedCount: batch.completedCount,
          failedCount: batch.failedCount,
          totalItems: batch.items.length,
          createdAt: batch.createdAt,
          parallelLimit: batch.parallelLimit,
          totalTokensUsed: batch.totalTokensUsed
        }
      });
    } catch (error: unknown) {
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.get("/work-orders/batch/:batchId/checkpoints", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { subagentSupervisor } = await import("../services/ai-brain/subagentSupervisor");
      const { batchId } = req.params;

      const checkpoints = subagentSupervisor.getBatchCheckpoints(batchId);

      res.json({
        success: true,
        batchId,
        checkpoints,
        count: checkpoints.length
      });
    } catch (error: unknown) {
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.get("/supervisor/model-policy", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { DEFAULT_SUPERVISOR_MODEL_POLICY } = await import("../services/ai-brain/subagentSupervisor");

      res.json({
        success: true,
        policy: DEFAULT_SUPERVISOR_MODEL_POLICY,
        description: {
          executionModel: "Model used for execution commands (Flash for speed)",
          validationModel: "Model used for validation/QC tasks (Flash for speed)",
          summarizationModel: "Model used for context summarization (Flash for token efficiency)",
          complianceModel: "Model used for compliance checks (Flash with RAG)",
          failureAnalysisModel: "Model used for failure analysis (Pro for deep reasoning)",
          retryThresholdForProEscalation: "Number of retries before escalating to Pro model",
          timeoutThresholdForProEscalation: "Timeout (ms) before escalating to Pro model"
        }
      });
    } catch (error: unknown) {
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  router.get("/supervisor/parallel-orchestration", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { 
        parallelDispatcher, 
        workboardLifecycle, 
        coordinationManager, 
        completionReporter,
        FAST_MODE_CONTEXTS 
      } = await import("../services/ai-brain/subagentSupervisor");

      res.json({
        success: true,
        orchestration: {
          parallelDispatcher: {
            description: "Distributes work orders to subagents in parallel",
            features: ["dependency resolution", "priority sorting", "checkpoint recording"]
          },
          coordinationManager: {
            description: "Manages tandem execution and validates batch outputs",
            features: ["batch validation", "result summarization", "Pro model escalation"]
          },
          workboardLifecycle: {
            description: "Integrates with AI Brain Workboard for job tracking",
            features: ["status updates", "progress tracking", "completion reporting"]
          },
          completionReporter: {
            description: "Reports results to Trinity and notifies end users",
            features: ["completion reports", "Trinity integration", "user notifications"]
          },
          fastModeTiers: Object.keys(FAST_MODE_CONTEXTS)
        }
      });
    } catch (error: unknown) {
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

// GET /api/ai-brain/status — runtime status of AI brain services
router.get("/status", requireAuth, async (req: any, res) => {
  try {
    const { getAISystemStatus } = await import("../services/ai-brain/providers/resilientAIGateway");
    const sysStatus = getAISystemStatus();
    res.json({
      healthy:         sysStatus.mode !== 'emergency',
      mode:            sysStatus.mode,
      activeProvider:  sysStatus.activeProvider,
      primaryProvider: sysStatus.primaryProvider,
      lastHealthCheck: sysStatus.lastHealthCheck,
      providers: Object.entries(sysStatus.providerHealth || {}).map(([name, h]: [string, any]) => ({
        name,
        healthy: h.healthy,
        latencyMs: h.latencyMs,
      })),
    });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to get AI brain status' });
  }
});

// GET /api/ai-brain/decisions — recent AI decisions/actions log
router.get("/decisions", requireManager, async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const limit = Math.min(parseInt((req.query.limit as string) || '20'), 100);
    const { pool } = await import('../db');
    // CATEGORY C — Raw SQL retained: ORDER BY | Tables: automation_executions | Verified: 2026-03-23
    const { rows } = await typedPool(
      `SELECT id, action_name, status, ai_summary, created_at, triggered_by
       FROM automation_executions
       WHERE workspace_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [workspaceId, limit]
    );
    res.json({ decisions: rows, total: rows.length });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to fetch AI decisions' });
  }
});

// GET /api/ai-brain/rules — current AI guardrails and rule configuration
router.get("/rules", requireManager, async (req: any, res) => {
  try {
    const { default: guardrails } = await import("@shared/config/aiBrainGuardrails");
    res.json({
      guardrails,
      version: '1.0',
      lastUpdated: new Date().toISOString(),
    });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to fetch AI rules' });
  }
});

// POST /api/ai-brain/actions/execute — execute a named Platform Action Hub action
// Used by feature components (e.g. mileage.tsx Trinity analysis button)
// OMEGA-L7: workspaceTrinityLimiter enforces 50 actions/min per workspace (token DDoS guard)
router.post("/actions/execute", requireAuth, workspaceTrinityLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const { actionId, payload } = req.body;
    if (!actionId) {
      return res.status(400).json({ success: false, error: 'actionId is required' });
    }
    const workspaceId = req.workspaceId!;
    const userId = req.userId!;
    const { helpaiOrchestrator } = await import("../services/helpai/platformActionHub");
    const [category, ...nameParts] = actionId.split('.');
    const name = nameParts.join('.') || actionId;
    const result = await helpaiOrchestrator.executeAction({
      actionId,
      category: category as any,
      name,
      payload: { ...payload, workspaceId },
      userId,
      userRole: req.userRole || 'employee',
      priority: 'medium',
    });
    res.json({ success: result.success, message: result.message, data: result.data ?? result });
  } catch (error: unknown) {
    log.error('[AI Brain Actions Execute]', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// GET /api/ai-brain/growth-log — Trinity's visible learning record (owner dashboard)
// Spec: Phase 2-L — Trinity Growth Log, Experience Timeline, auditable learning record.
// Merges ai_learning_events + trinity_decision_log into a unified chronological timeline.
router.get("/growth-log", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const limit = Math.min(parseInt((req.query.limit as string) || '50'), 200);
    const eventType = (req.query.type as string) || 'all'; // 'all' | 'learning' | 'decision'
    const { pool } = await import('../db');

    const entries: any[] = [];

    // 1. Pull ai_learning_events for this workspace
    if (eventType === 'all' || eventType === 'learning') {
      // CATEGORY C — Raw SQL retained: ORDER BY | Tables: ai_learning_events | Verified: 2026-03-23
      const { rows: learningRows } = await typedPool(`
        SELECT
          id,
          'learning' as entry_type,
          event_type as subtype,
          agent_id,
          action,
          action_type as domain,
          outcome,
          confidence_level,
          reward::float as reward,
          human_intervention,
          data,
          created_at
        FROM ai_learning_events
        WHERE workspace_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [workspaceId, Math.ceil(limit * 0.6)]);
      entries.push(...learningRows.map(r => ({
        id: r.id,
        entryType: r.entry_type,
        subtype: r.subtype,
        title: `Trinity learned: ${r.action || r.subtype}`,
        description: r.outcome
          ? `Outcome: ${r.outcome} | Confidence: ${((r.confidence_level || 0.5) * 100).toFixed(0)}%`
          : `Agent: ${r.agent_id} | Domain: ${r.domain || 'general'}`,
        outcome: r.outcome,
        confidence: r.confidence_level,
        reward: r.reward,
        humanIntervention: r.human_intervention,
        data: r.data,
        timestamp: r.created_at,
      })));
    }

    // 2. Pull trinity_decision_log for this workspace
    if (eventType === 'all' || eventType === 'decision') {
      // CATEGORY C — Raw SQL retained: ORDER BY | Tables: trinity_decision_log | Verified: 2026-03-23
      const { rows: decisionRows } = await typedPool(`
        SELECT
          id,
          'decision' as entry_type,
          decision_type,
          domain,
          chosen_option,
          reasoning,
          confidence_score::float as confidence_score,
          outcome_status,
          human_override,
          override_reason,
          created_at
        FROM trinity_decision_log
        WHERE workspace_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [workspaceId, Math.ceil(limit * 0.4)]);
      entries.push(...decisionRows.map(r => ({
        id: r.id,
        entryType: r.entry_type,
        subtype: r.decision_type,
        title: `Decision: ${r.chosen_option?.substring(0, 80) || r.decision_type}`,
        description: r.reasoning?.substring(0, 200) || `Domain: ${r.domain}`,
        outcome: r.outcome_status,
        confidence: r.confidence_score,
        humanIntervention: r.human_override,
        overrideReason: r.override_reason,
        data: { domain: r.domain },
        timestamp: r.created_at,
      })));
    }

    // 3. Sort unified timeline by timestamp desc, take limit
    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const timeline = entries.slice(0, limit);

    res.json({
      success: true,
      workspaceId,
      total: timeline.length,
      timeline,
      generatedAt: new Date().toISOString(),
      note: 'Trinity\'s Experience Timeline — every decision, correction, and pattern Trinity has learned',
    });
  } catch (err: unknown) {
    log.error('[GrowthLog]', err);
    res.status(500).json({ error: 'Failed to fetch Trinity growth log', detail: sanitizeError(err) });
  }
});

// GET /api/ai-brain/calloff-risks — predictive calloff risk for upcoming shifts (owner/manager)
// Spec: Phase 2-F — Predictive Brain, calloff prediction, 48-72h proactive alerts
router.get("/calloff-risks", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const horizonHours = Math.min(parseInt((req.query.hours as string) || '72'), 168);
    const { trinityCalloffPredictor } = await import('../services/ai-brain/trinityCalloffPredictor');
    const prediction = await trinityCalloffPredictor.predictCalloffRisks(workspaceId, horizonHours);
    res.json({
      success: true,
      ...prediction,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    log.error('[CalloffPredictor]', err);
    res.status(500).json({ error: 'Failed to generate calloff risk predictions', detail: sanitizeError(err) });
  }
});

// GET /api/ai-brain/dream-state/status — status of the nightly cognitive consolidation cycle
router.get("/dream-state/status", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const { trinityDreamState } = await import('../services/ai-brain/trinityDreamState');
    res.json({ success: true, status: trinityDreamState.getStatus() });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to get dream state status' });
  }
});

// POST /api/ai-brain/dream-state/trigger — manually trigger a dream state cycle (owner only)
// Used for testing, audits, and on-demand cognitive consolidation
router.post("/dream-state/trigger", requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const { trinityDreamState } = await import('../services/ai-brain/trinityDreamState');
    const status = trinityDreamState.getStatus();
    if (status.isRunning) {
      return res.status(409).json({
        success: false,
        error: 'Dream state cycle is already running. Please wait for it to complete.',
        status,
      });
    }

    res.json({
      success: true,
      message: 'Dream state cycle triggered. Running in background — check /dream-state/status for progress.',
      triggeredAt: new Date().toISOString(),
    });

    trinityDreamState.runFullCycle().then((results) => {
      log.info(`[DreamState] Manual trigger complete — ${results.length} workspaces processed`);
    }).catch((err) => {
      log.error('[DreamState] Manual trigger failed:', err?.message);
    });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to trigger dream state', detail: sanitizeError(err) });
  }
});

// POST /api/ai-brain/error-report — receive frontend error telemetry (fire-and-forget)
// Called by universal-error-page.tsx when a 500 error page is rendered
router.post("/error-report", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { errorType, errorDetails, url, timestamp, userAgent } = req.body;
    log.error('[FrontendErrorReport]', {
      userId: req.userId,
      workspaceId: req.workspaceId,
      errorType,
      errorDetails,
      url,
      timestamp,
      userAgent,
    });
    res.json({ success: true, received: true });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

export default router;
