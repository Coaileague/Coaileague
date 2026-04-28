// Domain Sales & CRM — Route Mounts
// THE LAW: No new routes without Bryan's approval.
// Canonical prefixes: /api/public/leads, /api/testimonials, /api/proposals, /api/pipeline-deals,
//   /api/sales, /api/ethics/*, /api (rfp ethics admin), /api/bid-analytics
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { ensureWorkspaceAccess } from "../../middleware/workspaceScope";
import { mountWorkspaceRoutes } from "./routeMounting";
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
  mountWorkspaceRoutes(app, [
    ["/api/proposals", proposalRouter],
  ]);
  app.post("/api/ethics/report", (req: any, res: any, next: any) => rfpEthicsRouter(req, res, next));
  app.get("/api/ethics/followup/:token", (req: any, res: any, next: any) => rfpEthicsRouter(req, res, next));
  mountWorkspaceRoutes(app, [
    ["/api", rfpEthicsRouter],
    ["/api/pipeline-deals", rfpPipelineRouter],
  ]);
  // Phase 35B — Sales Pipeline / CRM (must mount BEFORE generic /api/sales)
  mountWorkspaceRoutes(app, [
    ["/api/sales/pipeline", salesPipelineRouter],
  ]);
  registerSalesPipelineActions();
  app.use("/api/sales", salesInlineRouter);
  registerLeadCrmRoutes(app, requireAuth, ensureWorkspaceAccess);
  registerSalesRoutes(app, requireAuth, ensureWorkspaceAccess);
  // Bid analytics — win/loss analysis, pricing intelligence
  mountWorkspaceRoutes(app, [
    ["/api/bid-analytics", bidAnalyticsRouter],
  ]);
}
