// Domain Clients & Sites — Route Mounts
// THE LAW: No new routes without Bryan's approval.
// Canonical prefixes: /api/clients, /api/contracts/*, /api/site-briefings,
//   /api/client-reports, /api/customer-reports, /api/locked-reports,
//   /api/contract-documents, /api/custom-rules, /api/signatures,
//   /api/contract-renewals, /api/client-satisfaction
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { ensureWorkspaceAccess } from "../../middleware/workspaceScope";
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
  app.use("/api/contracts", requireAuth, ensureWorkspaceAccess, contractPipelineRouter);
  app.use("/api/surveys", requireAuth, ensureWorkspaceAccess, surveyRouter);
  // clientRouter applies requireAuth + requireManagerOrPlatformStaff on every route internally.
  // requireAuth added at mount level as defense-in-depth; ensureWorkspaceAccess intentionally
  // omitted — individual routes resolve workspace via requireManagerOrPlatformStaff internally.
  app.use("/api/clients", requireAuth, clientRouter);
  app.use("/api/site-briefings", requireAuth, ensureWorkspaceAccess, siteBriefingRouter);
  app.use("/api", requireAuth, ensureWorkspaceAccess, contentInlineRouter);
  // Contract renewals — pipeline for expiring client contracts
  app.use("/api/contract-renewals", requireAuth, ensureWorkspaceAccess, contractRenewalRouter);
  // Client satisfaction — CSAT and NPS survey management
  app.use("/api/client-satisfaction", requireAuth, ensureWorkspaceAccess, clientSatisfactionRouter);
  // Client service requests — clients submit requests for extra coverage, site walks, etc.
  app.use("/api/service-requests", requireAuth, ensureWorkspaceAccess, clientServiceRequestRouter);
  // Phase 35G: Client Communication Hub
  app.use("/api/client-comms", requireAuth, ensureWorkspaceAccess, clientCommsRouter);

  // Client Portal Invite — Manager+ only, NDS tracked
  app.use("/api/clients", clientPortalInviteRouter);

  // ── Spec §4: /{org_code}/login — Unified Login Entry Point ──────────────────
  // Redirects org-scoped login URL to the main login with org pre-filled
  app.get("/:orgCode/login", (req: any, res: any) => {
    const { orgCode } = req.params;
    if (!orgCode || orgCode.length < 2 || orgCode.length > 20) {
      return res.redirect('/login');
    }
    // Redirect to main login with orgCode pre-populated as a query param
    res.redirect(`/login?org=${encodeURIComponent(orgCode.toUpperCase())}`);
  });

  // ── Spec §4: Handshake Confirmation — flips INVITED → ACTIVE ────────────────
  // Called when client clicks Confirm on the verification screen.
  // Requires all: POC Email, Address, Bill Rate, Service Hours.
  app.post("/api/clients/portal/handshake/confirm", requireAuth, async (req: any, res: any) => {
    try {
      const { flipInvitedToActive, validateHandshakePayload } = await import("../services/onboarding/onboardingHandshakeService");
      const payload = { ...req.body, userId: req.session?.userId || req.user?.id };

      // Pre-flight check — Confirm button should already be disabled on frontend,
      // but we double-enforce server-side
      const { valid, missing } = validateHandshakePayload(payload);
      if (!valid) {
        return res.status(400).json({
          message: `Verification incomplete. Missing required fields: ${missing.join(', ')}`,
          missing,
          confirmEnabled: false,
        });
      }

      const result = await flipInvitedToActive(payload);

      // Inject full context into session widget (spec §4)
      if (req.session) {
        req.session.userId = result.userId;
        (req.session as any).clientId = result.clientId;
        (req.session as any).tenantId = result.workspaceId;
        (req.session as any).orgCode = result.orgCode;
      }

      res.json({
        success: true,
        visualStatus: 'accepted',
        borderClass: 'border-green-500',
        context: {
          userId: result.userId,
          clientId: result.clientId,
          tenantId: result.workspaceId,
          orgCode: result.orgCode,
        },
      });
    } catch (err: unknown) {
      res.status(400).json({ message: err?.message || 'Handshake failed' });
    }
  });

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

  // Client portal — active officer status (read-only view for clients)
  app.get("/api/client-portal/officers/status", requireAuth, async (req: any, res: any) => {
    try {
      const workspaceId = req.workspaceId;
      const { pool } = await import("../../db");
      const result = await pool.query(
        `SELECT
          e.id, e.first_name, e.last_name, e.workspace_role,
          s.id AS shift_id, s.date, s.start_time, s.end_time, s.status,
          s.site_name, s.client_id,
          tc.status AS clock_status, tc.clock_in_time,
          CASE WHEN s.id IS NOT NULL AND s.status IN ('scheduled','confirmed') THEN 'scheduled'
               WHEN tc.status = 'clocked_in' THEN 'on_shift'
               ELSE 'off_duty'
          END AS officer_status
         FROM employees e
         LEFT JOIN shifts s ON s.employee_id = e.id
           AND s.workspace_id = $1
           AND s.date = CURRENT_DATE
         LEFT JOIN time_clock_entries tc ON tc.employee_id = e.id
           AND tc.workspace_id = $1
           AND tc.status = 'clocked_in'
         WHERE e.workspace_id = $1
           AND e.is_active = true
         ORDER BY officer_status DESC, e.last_name ASC
         LIMIT 50`,
        [workspaceId]
      );
      res.json({ officers: result.rows ?? [], asOf: new Date().toISOString() });
    } catch (err: unknown) {
      res.json({ officers: [], asOf: new Date().toISOString() });
    }
  });

}
