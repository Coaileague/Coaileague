// Domain Compliance & Documents — Route Mounts
// THE LAW: No new routes without Bryan's approval.
// Canonical prefixes: /api/security-compliance, /api/credentials, /api/document-*,
//   /api/files, /api/form*, /api/enforcement, /api/uacp, /api/security,
//   /api/audit-trail, /api/audit-logs, /api/safety-checks, /api/dar,
//   /api/compliance, /api/compliance/*, /api/training-compliance
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { ensureWorkspaceAccess } from "../../middleware/workspaceScope";
import { portalLimiter } from "../../middleware/rateLimiter";
import { attachWorkspaceIdOptional } from "../../rbac";
import { mountWorkspaceRoutes } from "./routeMounting";
import { registerDocumentLibraryRoutes } from "../documentLibraryRoutes";
import credentialRouter from "../credentialRoutes";
import documentRouter from "../documentRoutes";
import documentTemplateRouter from "../documentTemplateRoutes";
import documentVaultRouter from "../documentVaultRoutes";
import fileDownloadRoutes from "../fileDownload";
import formBuilderRouter from "../formBuilderRoutes";
import formRouter from "../formRoutes";
import policyComplianceRouter from "../policyComplianceRoutes";
import complianceInlineRouter from "../complianceInlineRoutes";
import governanceInlineRouter from "../governanceInlineRoutes";
import uacpRouter from "../uacpRoutes";
import securityAuditRouter from "../security-audit";
import { spsDocumentRouter, spsDocumentSafeRouter } from "../spsDocumentRoutes";
import { documentViewRouter } from "../documentViewRoutes";
import { spsNegotiationRouter } from "../spsNegotiationRoutes";
import { spsPublicRouter } from "../spsPublicRoutes";
import { spsOnboardingRoutes } from "../spsOnboardingRoutes";
import complianceReportsRouter from "../complianceReportsRoutes";
import regulatoryEnrollmentRouter from "../compliance/regulatoryEnrollment";
import { complianceSprintRouter } from "../complianceSprintRoutes";
import complianceScenarioRouter from "../complianceScenarioRoutes";
import { regulatoryPortalRoutes } from "../compliance/regulatoryPortal";
import trainingComplianceRouter from "../trainingComplianceRoutes";
import licenseDashboardRouter from "../license-dashboard";
import insuranceRouter from "../insuranceRoutes";
import complianceEvidenceRouter from "../complianceEvidenceRoutes";

export function mountComplianceRoutes(app: Express): void {
  // Governance inline routes BEFORE security-compliance to ensure lock-vault is handled
  mountWorkspaceRoutes(app, [
    ["/api", governanceInlineRouter],
    ["/api/compliance/evidence", complianceEvidenceRouter],
    ["/api/credentials", credentialRouter],
  ]);
  registerDocumentLibraryRoutes(app, requireAuth, ensureWorkspaceAccess);
  app.use(documentRouter);
  mountWorkspaceRoutes(app, [
    ["/api/document-templates", documentTemplateRouter],
    ["/api/document-vault", documentVaultRouter],
  ]);
  app.use("/api/files", requireAuth, attachWorkspaceIdOptional, fileDownloadRoutes);
  mountWorkspaceRoutes(app, [
    ["/api/form-builder", formBuilderRouter],
    ["/api", formRouter],
    ["/api", policyComplianceRouter],
  ]);
  // Enforcement auditor public login/me routes MUST come before the auth-protected catch-all
  app.use(complianceInlineRouter);
  mountWorkspaceRoutes(app, [
    ["/api/uacp", uacpRouter],
    ["/api/security", securityAuditRouter],
  ]);
  // SPS 10-Step Onboarding — must come before /api/sps catch-all mounts
  // /upload is handled inside the router without workspace middleware (multer + GCS)
  mountWorkspaceRoutes(app, [
    ["/api/sps/onboarding", spsOnboardingRoutes],
    ["/api/sps/forms", spsOnboardingRoutes],
  ]);
  // SPS Document Management System
  // Document view/download routes MUST come before spsDocumentRouter (/:id catch-all)
  mountWorkspaceRoutes(app, [
    ["/api/sps/documents", documentViewRouter],
    ["/api/sps/documents", spsDocumentRouter],
  ]);
  // SPS Document Safe tab routes (/api/sps/staff-packets, /api/sps/company-docs, /api/sps/reports)
  mountWorkspaceRoutes(app, [
    ["/api/sps", spsDocumentSafeRouter],
    ["/api/sps/negotiations", spsNegotiationRouter],
  ]);
  // SPS public routes — no auth, token-controlled (portalLimiter: 60 req/min per IP)
  app.use("/api/public/sps", portalLimiter, spsPublicRouter);
  // Compliance report generation (canonical: /api/compliance-reports)
  mountWorkspaceRoutes(app, [
    ["/api/compliance-reports", complianceReportsRouter],
  ]);
  // Regulatory credential enrollment — 30-day deadline for all org members
  app.use("/api/compliance/enrollment", regulatoryEnrollmentRouter);
  // Regulatory Auditor Portal — public + token-auth handled internally by the router
  // MUST come BEFORE generic /api/compliance mounts (route specificity)
  // G24-05 fix: portalLimiter (60/min per token) on portal endpoints.
  app.use("/api/compliance/regulatory-portal", portalLimiter, regulatoryPortalRoutes);
  // Training compliance module
  mountWorkspaceRoutes(app, [
    ["/api/training-compliance", trainingComplianceRouter],
  ]);
  // Compliance scenario planning
  mountWorkspaceRoutes(app, [
    ["/api/compliance", complianceScenarioRouter],
  ]);
  // Compliance Sprint — Phases F (handbook audit), G (contract protection), H (translation), M (verification)
  app.use("/api/compliance", complianceSprintRouter);
  // State regulatory config + post requirements — multi-state architecture
  // License Dashboard — bulk status, DPS CSV export, revoke handler (Phase 17)
  mountWorkspaceRoutes(app, [
    ["/api/compliance/licenses", licenseDashboardRouter],
  ]);
  // Insurance — certificates, bonding, coverage management (Phase 35R)
  mountWorkspaceRoutes(app, [
    ["/api/insurance", insuranceRouter],
  ]);
}
