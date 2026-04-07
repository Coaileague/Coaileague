// Domain Sales & CRM — Route Mounts
// THE LAW: No new routes without Bryan's approval.
// Canonical prefixes: /api/public/leads, /api/testimonials, /api/proposals, /api/pipeline-deals,
//   /api/sales, /api/ethics/*, /api (rfp ethics admin), /api/bid-analytics
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { ensureWorkspaceAccess } from "../../middleware/workspaceScope";
import { registerLeadCrmRoutes } from "../leadCrmRoutes";
import { registerSalesRoutes } from "../salesRoutes";
import salesPipelineRouter, { registerSalesPipelineActions } from "../salesPipelineRoutes";
import proposalRouter from "../proposalRoutes";
import publicLeadsRouter from "../publicLeads";
import testimonialsRouter from "../testimonials";
import { rfpEthicsRouter } from "../rfpEthicsRoutes";
import rfpPipelineRouter from "../rfpPipelineRoutes";
import salesInlineRouter from "../salesInlineRoutes";
import bidAnalyticsRouter from "../bidAnalyticsRoutes";

export function mountSalesRoutes(app: Express): void {
  app.use("/api/public/leads", publicLeadsRouter);
  app.use("/api/testimonials", testimonialsRouter);
  app.use("/api/proposals", requireAuth, ensureWorkspaceAccess, proposalRouter);
  app.post("/api/ethics/report", (req: any, res: any, next: any) => rfpEthicsRouter(req, res, next));
  app.get("/api/ethics/followup/:token", (req: any, res: any, next: any) => rfpEthicsRouter(req, res, next));
  app.use("/api", requireAuth, ensureWorkspaceAccess, rfpEthicsRouter);
  app.use("/api/pipeline-deals", requireAuth, ensureWorkspaceAccess, rfpPipelineRouter);
  // Phase 35B — Sales Pipeline / CRM (must mount BEFORE generic /api/sales)
  app.use("/api/sales/pipeline", requireAuth, ensureWorkspaceAccess, salesPipelineRouter);
  registerSalesPipelineActions();
  app.use("/api/sales", salesInlineRouter);
  registerLeadCrmRoutes(app, requireAuth, ensureWorkspaceAccess);
  registerSalesRoutes(app, requireAuth, ensureWorkspaceAccess);
  // Bid analytics — win/loss analysis, pricing intelligence
  app.use("/api/bid-analytics", requireAuth, ensureWorkspaceAccess, bidAnalyticsRouter);
}
