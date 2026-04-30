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
import { approvalsRoutes as complianceApprovalsRouter } from "../compliance/approvals";
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
import { spsFormsRouter } from '../spsFormsRoutes';
import { matrixRoutes } from '../compliance/matrix';

export function mountComplianceRoutes(app: Express): void {
  // Compliance matrix routes — includes /api/compliance/matrix/my-score
  // Security compliance approvals (documents, certifications, records)
  app.use("/api/security-compliance/approvals", requireAuth, ensureWorkspaceAccess, complianceApprovalsRouter);

  app.use('/api/compliance/matrix', requireAuth, ensureWorkspaceAccess, matrixRoutes);
  // Governance inline routes BEFORE security-compliance to ensure lock-vault is handled
  app.use("/api", requireAuth, ensureWorkspaceAccess, governanceInlineRouter);
  app.use("/api/compliance/evidence", requireAuth, ensureWorkspaceAccess, complianceEvidenceRouter);
  app.use("/api/credentials", requireAuth, ensureWorkspaceAccess, credentialRouter);
  registerDocumentLibraryRoutes(app, requireAuth, ensureWorkspaceAccess);
  app.use(documentRouter);
  app.use("/api/document-templates", requireAuth, ensureWorkspaceAccess, documentTemplateRouter);
  app.use("/api/document-vault", requireAuth, ensureWorkspaceAccess, documentVaultRouter);
  app.use("/api/files", requireAuth, attachWorkspaceIdOptional, fileDownloadRoutes);
  app.use("/api/form-builder", requireAuth, ensureWorkspaceAccess, formBuilderRouter);
  app.use("/api", requireAuth, ensureWorkspaceAccess, formRouter);
  app.use("/api", requireAuth, ensureWorkspaceAccess, policyComplianceRouter);
  // Enforcement auditor public login/me routes MUST come before the auth-protected catch-all
  app.use(complianceInlineRouter);
  app.use("/api/uacp", requireAuth, ensureWorkspaceAccess, uacpRouter);
  app.use("/api/security", requireAuth, ensureWorkspaceAccess, securityAuditRouter);
  // SPS 10-Step Onboarding — must come before /api/sps catch-all mounts
  // /upload is handled inside the router without workspace middleware (multer + GCS)
  app.use("/api/sps/onboarding", requireAuth, ensureWorkspaceAccess, spsOnboardingRoutes);
  app.use("/api/sps/forms", requireAuth, ensureWorkspaceAccess, spsOnboardingRoutes);
  // SPS Document Management System
  // Document view/download routes MUST come before spsDocumentRouter (/:id catch-all)
  app.use("/api/sps/documents", requireAuth, ensureWorkspaceAccess, documentViewRouter);
  app.use("/api/sps/documents", requireAuth, ensureWorkspaceAccess, spsDocumentRouter);
  // SPS Document Safe tab routes (/api/sps/staff-packets, /api/sps/company-docs, /api/sps/reports)
  app.use("/api/sps", requireAuth, ensureWorkspaceAccess, spsDocumentSafeRouter);
  app.use("/api/sps/negotiations", requireAuth, ensureWorkspaceAccess, spsNegotiationRouter);
  // SPS public routes — no auth, token-controlled (portalLimiter: 60 req/min per IP)
  app.use("/api/public/sps", portalLimiter, spsPublicRouter);
  // Compliance report generation (canonical: /api/compliance-reports)
  app.use("/api/compliance-reports", requireAuth, ensureWorkspaceAccess, complianceReportsRouter);
  // Regulatory credential enrollment — 30-day deadline for all org members
  app.use("/api/compliance/enrollment", regulatoryEnrollmentRouter);
  // Regulatory Auditor Portal — public + token-auth handled internally by the router
  // MUST come BEFORE generic /api/compliance mounts (route specificity)
  // G24-05 fix: portalLimiter (60/min per token) on portal endpoints.
  app.use("/api/compliance/regulatory-portal", portalLimiter, regulatoryPortalRoutes);
  // Training compliance module
  app.use("/api/training-compliance", requireAuth, ensureWorkspaceAccess, trainingComplianceRouter);
  // Compliance scenario planning
  app.use("/api/compliance", requireAuth, ensureWorkspaceAccess, complianceScenarioRouter);
  // Compliance Sprint — Phases F (handbook audit), G (contract protection), H (translation), M (verification)
  app.use("/api/compliance", complianceSprintRouter);
  // State regulatory config + post requirements — multi-state architecture
  // License Dashboard — bulk status, DPS CSV export, revoke handler (Phase 17)
  app.use("/api/compliance/licenses", requireAuth, ensureWorkspaceAccess, licenseDashboardRouter);
  // Insurance — certificates, bonding, coverage management (Phase 35R)
  app.use("/api/insurance", requireAuth, ensureWorkspaceAccess, insuranceRouter);
  app.use('/api/sps/forms', requireAuth, spsFormsRouter);
}
