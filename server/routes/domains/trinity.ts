// Domain Trinity AI Engine — Route Mounts
// THE LAW: No new routes without Bryan's approval.
// Canonical prefixes: /api/ai/*, /api/ai-brain/*, /api/helpai, /api/trinity/*,
//   /api/automation/*, /api/execution-tracker, /api/subagents, /api/control-tower,
//   /api/bug-remediation, /api/workflows, /api/workflow-configs, /api/quick-fixes,
//   /api/gamification, /api/trinity-decisions, /api/trinity-training,
//   /api/trinity/empire/*, /api/trinity/bluedot/*
//
// MOUNT ORDER RULE: specific path prefixes BEFORE general path prefixes so
// more-specific routers always get first pick of matching requests.
import { sanitizeError } from '../../middleware/errorHandler';
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { ensureWorkspaceAccess } from "../../middleware/workspaceScope";
import { requirePlatformStaff, requireTrinityAccess, requirePlatformRole, AuthenticatedRequest } from "../../rbac";
import { registerWorkboardRoutes } from "../workboardRoutes";
import { registerFaqRoutes } from "../faq-routes";
import { aiBrainRouter } from "../ai-brain-routes";
import { helpaiRouter } from "../helpai-routes";
import { gamificationRouter } from "../gamification-api";
import { aiBrainConsoleRouter } from "../ai-brain-console";
import aiBrainControlRouter from "../aiBrainControlRoutes";
import aiOrchestraRouter from "../aiOrchestraRoutes";
import aiOrchestratorRoutes from "../aiOrchestratorRoutes";
import aiBrainInlineRouter from "../aiBrainInlineRoutes";
import aiRouter from "../aiRoutes";
import trinityAlertsRouter from "../trinity-alerts";
import trinityDecisionRoutes from "../trinityDecisionRoutes";
import bugRemediationRouter from "../bugRemediation";
import controlTowerRouter from "../controlTowerRoutes";
import automationInlineRouter from "../automationInlineRoutes";
import { automationRouter } from "../automation";
import automationEventsRouter from "../automation-events";
import { executionTrackerRouter } from "../executionTrackerRoutes";
import subagentRouter from "../subagentRoutes";
import codeEditorRouter from "../code-editor";
import trinityInsightsRouter from "../trinityInsightsRoutes";
import trinityMaintenanceRouter from "../trinityMaintenanceRoutes";
import { trinityNotificationRouter } from "../trinityNotificationRoutes";
import { trinityStaffingOrchestrator } from "../../services/trinityStaffing/orchestrator";
import trinityStaffingRouter, { publicWebhookRouter as trinityStaffingPublicRouter } from "../trinityStaffingRoutes";
import trinityChatRouter from "../trinityChatRoutes";
import trinityControlConsoleRouter from "../trinityControlConsoleRoutes";
import quickFixRouter from "../quickFixRoutes";
import trinitySelfEditRouter from "../trinitySelfEditRoutes";
import trinitySessionRouter from "../trinitySessionRoutes";
import trinitySwarmRouter from "../trinitySwarmRoutes";
import trinityCrisisRouter from "../trinityCrisisRoutes";
import trinityAuditRouter from "../trinityAuditRoutes";
import trinityEscalationRouter from "../trinityEscalationRoutes";
import trinityMiscRouter from "../trinityMiscRoutes";
import trinityTrainingRouter from "../trinityTrainingRoutes";
import { trinityThoughtStatusRouter } from "../trinityThoughtStatusRoutes";
import vqaRouter from "../vqaRoutes";
import workflowConfigRouter from "../workflowConfigRoutes";
import workflowRouter from "../workflowRoutes";
import automationGovernanceRouter from "../automationGovernanceRoutes";
import trinityIntelligenceRouter from "../trinityIntelligenceRoutes";
import empireRouter from "../empireRoutes"; // /api/trinity/empire/* + /api/trinity/bluedot/*
import trinityIntakeRouter from "../trinityIntakeRoutes";
import { Router } from "express";
import { runDomainHealthCheck } from "../../services/trinity/domainHealthValidator";
import { trinityACC } from "../../services/ai-brain/trinityACCService";
import { trinityThalamus } from "../../services/ai-brain/trinityThalamusService";
import agentActivityRouter from "../agentActivityRoutes";

const domainHealthRouter = Router();
domainHealthRouter.get("/domain-health", requireAuth, requireTrinityAccess, (_req, res) => {
  try {
    const report = runDomainHealthCheck();
    res.json({ success: true, report });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(err) });
  }
});

domainHealthRouter.get("/status", requireAuth, requireTrinityAccess, (_req, res) => {
  try {
    const report = runDomainHealthCheck();
    res.json({
      success: true,
      status: report.overall_status === 'healthy' ? 'operational' : 'degraded',
      version: '2.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      report
    });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(err) });
  }
});

// ── ACC + Thalamic Dashboard Endpoints ────────────────────────────────────────
// Owner/ops-manager only: /api/trinity/acc/stats, /api/trinity/thalamic/stats
const brainDashboardRouter = Router();

brainDashboardRouter.get("/acc/stats", requireAuth, ensureWorkspaceAccess, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId
      // @ts-expect-error — TS migration: fix in refactoring sprint
      || (authReq.user)?.workspaceId
      || '';
    if (!workspaceId) return res.status(400).json({ success: false, error: 'Workspace context required' });
    const stats = await trinityACC.getDashboardStats(workspaceId);
    res.json({ success: true, stats });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(err) });
  }
});

brainDashboardRouter.get("/thalamic/stats", requireAuth, ensureWorkspaceAccess, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId
      // @ts-expect-error — TS migration: fix in refactoring sprint
      || (authReq.user)?.workspaceId
      || '';
    if (!workspaceId) return res.status(400).json({ success: false, error: 'Workspace context required' });
    const stats = await trinityThalamus.getDashboardStats(workspaceId);
    res.json({ success: true, stats });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(err) });
  }
});

export function mountTrinityRoutes(app: Express): void {
  registerWorkboardRoutes(app, requireAuth);
  registerFaqRoutes(app);

  // ── Gamification & AI Orchestra ───────────────────────────────────────────
  app.use("/api/gamification", gamificationRouter);
  app.use("/api/ai/orchestra", aiOrchestraRouter);

  // ── AI Brain — specific sub-paths FIRST to avoid shadowing ───────────────
  // Console is a platform-staff-only ops surface — must be gated before the
  // general aiBrainRouter so the requirePlatformStaff guard fires first.
  app.use("/api/ai-brain/console", requirePlatformStaff, aiBrainConsoleRouter);
  app.use("/api/ai-brain/control", requireAuth, aiBrainControlRouter);
  app.use("/api/ai-brain", aiBrainRouter);
  app.use("/api/ai-brain", requireAuth, ensureWorkspaceAccess, aiBrainInlineRouter);

  // ── HelpAI ────────────────────────────────────────────────────────────────
  app.use("/api/helpai", helpaiRouter);

  // ── Trinity — specific sub-paths FIRST, general mounts after ─────────────
  app.use("/api/trinity", domainHealthRouter);
  app.use("/api/trinity/maintenance", trinityMaintenanceRouter);
  app.use("/api/trinity/control-console", trinityControlConsoleRouter);
  // Notification management routes rely on req.platformRole being set by the outer gate.
  // Without this guard the inline requireSupportRole/requireAdminRole checks always see
  // req.platformRole === undefined → 'none' → 403 for every caller.
  // 'Bot' is included so Trinity autonomous pipelines authenticated via x-trinity-bot-token
  // can push maintenance alerts, insights, and What's New updates without a human session.
  app.use(
    "/api/trinity/notifications",
    requirePlatformRole(['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'Bot']),
    trinityNotificationRouter,
  );

  // Phase 55: Trinity Staffing — Professional tier only
  app.use("/api/trinity/staffing/webhook", trinityStaffingPublicRouter);
  app.use("/api/trinity/staffing", requireAuth, ensureWorkspaceAccess, trinityStaffingRouter);

  app.use("/api/trinity/intake", requireAuth, ensureWorkspaceAccess, trinityIntakeRouter);
  app.use("/api/trinity/chat", requireAuth, ensureWorkspaceAccess, trinityChatRouter);
  app.use("/api/trinity/self-edit", requireAuth, ensureWorkspaceAccess, trinitySelfEditRouter);
  app.use("/api/trinity/session", requireAuth, ensureWorkspaceAccess, trinitySessionRouter);
  app.use("/api/trinity/swarm", requireAuth, ensureWorkspaceAccess, trinitySwarmRouter);
  app.use("/api/trinity/crisis", requireAuth, ensureWorkspaceAccess, trinityCrisisRouter);
  // ── ACC + Thalamic Brain Dashboard ───────────────────────────────────────────
  app.use("/api/trinity", brainDashboardRouter);

  // ── Trinity Audit Trail ──────────────────────────────────────────────────
  app.use("/api/trinity", requireAuth, ensureWorkspaceAccess, trinityAuditRouter);

  // ── Trinity SLA Escalation (Phase 10-5) ─────────────────────────────────
  app.use("/api/trinity/escalation", requireAuth, ensureWorkspaceAccess, trinityEscalationRouter);

  // General /api/trinity — empire & bluedot first (requireAuth inside router), then broader catches
  app.use("/api/trinity", empireRouter);
  app.use("/api/trinity", trinityAlertsRouter);
  app.use("/api/trinity", requireAuth, requireTrinityAccess, trinityInsightsRouter);
  app.use("/api/trinity", requireAuth, ensureWorkspaceAccess, trinityThoughtStatusRouter);
  // requireAuth fires first: populates req.user, checks account lock, emits auth telemetry.
  // requirePlatformStaff then does the DB-level platform-role gate.
  // Both guards must be present — requirePlatformStaff alone skips the account-lock check.
  app.use("/api/trinity", requireAuth, requirePlatformStaff, trinityMiscRouter); // platform-staff gate — must be last

  // ── Trinity Intelligence — Phases A-D (Regulatory, Financial, Autonomous, Officer) ──
  app.use("/api/trinity/intelligence", trinityIntelligenceRouter);

  // ── Automation — inline (no auth) before auth-required ───────────────────
  app.use("/api/automation", automationInlineRouter);
  app.use("/api/automation", requireAuth, ensureWorkspaceAccess, automationRouter);
  app.use("/api/automation-events", requireAuth, ensureWorkspaceAccess, automationEventsRouter);
  app.use("/api/automation-governance", automationGovernanceRouter);

  // ── Execution, Decisions, Subagents ──────────────────────────────────────
  app.use("/api/execution-tracker", requireAuth, ensureWorkspaceAccess, executionTrackerRouter);
  app.use("/api/subagents", requireAuth, ensureWorkspaceAccess, subagentRouter);
  app.use("/api/trinity-decisions", requireAuth, ensureWorkspaceAccess, trinityDecisionRoutes);
  app.use("/api/trinity-training", trinityTrainingRouter);

  // ── Operations & Tooling ──────────────────────────────────────────────────
  app.use("/api/bug-remediation", bugRemediationRouter);
  app.use("/api/control-tower", requireAuth, ensureWorkspaceAccess, controlTowerRouter);
  app.use("/api/quick-fixes", requireAuth, ensureWorkspaceAccess, quickFixRouter);
  app.use("/api/vqa", requireAuth, ensureWorkspaceAccess, vqaRouter);
  app.use("/api/ai-orchestrator", aiOrchestratorRoutes);
  app.use("/api/ai", aiRouter);
  app.use("/api/code-editor", codeEditorRouter);

  // ── Workflows ─────────────────────────────────────────────────────────────
  app.use("/api/workflow-configs", workflowConfigRouter);
  app.use("/api/workflows", requireAuth, ensureWorkspaceAccess, workflowRouter);

  // ── Agent Spawning Activity (Phase 6) ─────────────────────────────────────
  app.use("/api/agent-activity", requireAuth, ensureWorkspaceAccess, agentActivityRouter);
}
