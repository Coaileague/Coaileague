// Domain Support & HelpAI — Route Mounts
// THE LAW: No new routes without Bryan's approval.
// Canonical prefixes: /api/support/*, /api/helpdesk, /api/tickets, /api/platform (service-control), /api/admin/financial
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { ensureWorkspaceAccess } from "../../middleware/workspaceScope";
import supportActionRouter from "../supportActionRoutes";
import { supportCommandRouter } from "../support-command-console";
import { supportChatRouter } from "../support-chat";
import { ticketSearchRouter } from "../ticketSearchRoutes";
import supportRouter from "../supportRoutes";
import helpdeskRouter from "../helpdeskRoutes";
import serviceControlRouter from "../service-control";
import financialAdminRouter from "../financialAdminRoutes";
import helpAITriageRouter from "../helpAITriageRoutes";
import adminWorkspaceDetailsRouter from "../adminWorkspaceDetailsRoutes";
import trinityOrgStateRouter from "../trinityOrgStateRoutes";

export function mountSupportRoutes(app: Express): void {
  app.use("/api/platform/services", serviceControlRouter);
  app.use(supportActionRouter);
  app.use("/api/support/command", supportCommandRouter);
  app.use("/api/support/chat", supportChatRouter);
  app.use("/api/tickets", ticketSearchRouter);
  app.use("/api/support", supportRouter);
  app.use("/api/helpdesk", helpdeskRouter);
  app.use(financialAdminRouter);
  // Phase 63: HelpAI triage (POST /api/helpai/triage)
  // Note: GET /api/support/my-workspace-history lives in supportRoutes.ts
  app.use("/api/helpai", helpAITriageRouter);
  // Phase 63: Admin workspace details + platform search
  app.use("/api/admin", adminWorkspaceDetailsRouter);
  // PFC: Trinity org survival state API
  app.use("/api/trinity", trinityOrgStateRouter);
}
