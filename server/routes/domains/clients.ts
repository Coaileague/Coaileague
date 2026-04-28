// Domain Clients & Sites — Route Mounts
// THE LAW: No new routes without Bryan's approval.
// Canonical prefixes: /api/clients, /api/contracts/*, /api/site-briefings,
//   /api/client-reports, /api/customer-reports, /api/locked-reports,
//   /api/contract-documents, /api/custom-rules, /api/signatures,
//   /api/contract-renewals, /api/client-satisfaction
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { ensureWorkspaceAccess } from "../../middleware/workspaceScope";
import { mountWorkspaceRoutes } from "./routeMounting";
import clientRouter from "../clientRoutes";
import contractPipelineRouter, { publicPortalRouter as contractPortalRouter } from "../contractPipelineRoutes";
import siteBriefingRouter from "../siteBriefingRoutes";
import contentInlineRouter from "../contentInlineRoutes";
import contractRenewalRouter from "../contractRenewalRoutes";
import clientSatisfactionRouter from "../clientSatisfactionRoutes";
import clientServiceRequestRouter from "../clientServiceRequestRoutes";
import clientPortalInviteRouter from "../clientPortalInviteRoutes";
import clientCommsRouter from "../clientCommsRoutes";
import surveyRouter from "../surveyRoutes";

export function mountClientRoutes(app: Express): void {
  app.use("/api/contracts/portal", contractPortalRouter);
  mountWorkspaceRoutes(app, [
    ["/api/contracts", contractPipelineRouter],
    ["/api/surveys", surveyRouter],
  ]);
  // clientRouter applies requireAuth + requireManagerOrPlatformStaff on every route internally.
  // requireAuth added at mount level as defense-in-depth; ensureWorkspaceAccess intentionally
  // omitted — individual routes resolve workspace via requireManagerOrPlatformStaff internally.
  app.use("/api/clients", requireAuth, clientRouter);
  mountWorkspaceRoutes(app, [
    ["/api/site-briefings", siteBriefingRouter],
    ["/api", contentInlineRouter],
  ]);
  // Contract renewals — pipeline for expiring client contracts
  mountWorkspaceRoutes(app, [
    ["/api/contract-renewals", contractRenewalRouter],
  ]);
  // Client satisfaction — CSAT and NPS survey management
  mountWorkspaceRoutes(app, [
    ["/api/client-satisfaction", clientSatisfactionRouter],
  ]);
  // Client service requests — clients submit requests for extra coverage, site walks, etc.
  mountWorkspaceRoutes(app, [
    ["/api/service-requests", clientServiceRequestRouter],
  ]);
  // Phase 35G: Client Communication Hub
  mountWorkspaceRoutes(app, [
    ["/api/client-comms", clientCommsRouter],
  ]);

  // Client Portal Invite — Manager+ only, NDS tracked
  app.use("/api/clients", clientPortalInviteRouter);

  // Client portal dashboard — quick summary for portal users
  app.get("/api/client-portal/dashboard", requireAuth, ensureWorkspaceAccess, async (req: any, res: any) => {
    try {
      const workspaceId = req.workspaceId;
      const { pool } = await import("../../db");
      // CATEGORY C — Raw SQL retained: FILTER (WHERE | Tables: clients | Verified: 2026-03-23
      const clientResult = await pool.query(
        `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_active = true) AS active
         FROM clients WHERE workspace_id = $1`,
        [workspaceId]
      );
      const clientRow = clientResult.rows[0];
      // CATEGORY C — Raw SQL retained: FILTER (WHERE | Tables: client_contracts | Verified: 2026-03-23
      const contractResult = await pool.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'executed') AS active,
                COUNT(*) FILTER (WHERE status = 'expired')  AS expiring
         FROM client_contracts WHERE workspace_id = $1`,
        [workspaceId]
      );
      const contractRow = contractResult.rows[0];
      // CATEGORY C — Raw SQL retained: FILTER (WHERE | Tables: invoices | Verified: 2026-03-23
      const invoiceResult = await pool.query(
        `SELECT COUNT(*) FILTER (WHERE status = 'pending') AS pending,
                COALESCE(SUM(total) FILTER (WHERE status = 'pending'), 0) AS pending_amount
         FROM invoices WHERE workspace_id = $1`,
        [workspaceId]
      );
      const invoiceRow = invoiceResult.rows[0];
      res.json({
        clients:   { total: parseInt(clientRow?.total || '0'), active: parseInt(clientRow?.active || '0') },
        contracts: { total: parseInt(contractRow?.total || '0'), active: parseInt(contractRow?.active || '0'), expiringSoon: parseInt(contractRow?.expiring || '0') },
        invoices:  { pending: parseInt(invoiceRow?.pending || '0'), pendingAmount: parseFloat(invoiceRow?.pending_amount || '0') },
      });
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to load client portal dashboard' });
    }
  });
}
