// Domain Workforce — Route Mounts
// THE LAW: No new routes without Bryan's approval.
// Canonical prefixes: /api/employees, /api/engagement, /api/training, /api/feedback, /api/availability,
//   /api/benefits, /api/owner-employee, /api/gamification, /api/hris, /api (hr inline, termination, leader, deactivate),
//   /api/role-labels, /api/hr/*, /api/onboarding-forms, /api/smart-onboarding, /api/ats,
//   /api/officers (intelligence dashboard — Phase 11)
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { ensureWorkspaceAccess } from "../../middleware/workspaceScope";
import { attachWorkspaceIdOptional } from "../../rbac";
import { registerFlexStaffingRoutes } from "../flexStaffingRoutes";
import hrisRouter from "../hrisRoutes";
import hrInlineRouter from "../hrInlineRoutes";
import leaderRouter from "../leaderRoutes";
import ownerEmployeeRouter from "../owner-employee";
import officerScoreRouter from "../officerScoreRoutes";
import officerIntelligenceRouter from "../officerIntelligenceRoutes";
import employeeRouter from "../employeeRoutes";
import engagementRouter from "../engagementRoutes";
import gamificationEnhancedRoutes from "../gamificationRoutes";
import feedbackRouter from "../feedbackRoutes";
import availabilityRouter from "../availabilityRoutes";
import deactivateRouter from "../deactivateRoutes";
import benefitRouter from "../benefitRoutes";
import reviewRouter from "../reviewRoutes";
import roleLabelRoutes from "../roleLabelRoutes";
import hrDocumentRequestRoutes from "../hr/documentRequestRoutes";
import onboardingFormsRoutes from "../onboardingFormsRoutes";
import { intelligentOnboardingRouter } from "../intelligentOnboardingRoutes";
import atsRouter from "../atsRoutes";
import hiringRouter from "../hiringRoutes";
import hiringSettingsRouter from "../hiringSettingsRoutes";
import performanceNoteRouter from "../performanceNoteRoutes";
import disciplinaryRecordRouter from "../disciplinaryRecordRoutes";
import onboardingTaskRouter from "../onboardingTaskRoutes";
import recognitionRouter from "../recognitionRoutes";
import { clockinPinRouter } from "../clockinPinRoutes";
import { identityPinRouter } from "../identityPinRoutes";
import { employmentVerifyRouter } from "../employmentVerifyRoutes";
import recruitmentRouter from "../recruitmentRoutes";
import wellnessRouter from "../wellnessRoutes";
import inviteRouter, { publicInviteRouter } from "../inviteRoutes";

export function mountWorkforceRoutes(app: Express): void {
  app.use(publicInviteRouter);
  // hrisRouter applies requireAuth on every route internally; requireAuth added at mount level
  // as defense-in-depth. attachWorkspaceIdOptional retained for HRIS provider flows where
  // the workspace is resolved from the provider token rather than the user session.
  app.use("/api/hris", requireAuth, attachWorkspaceIdOptional, hrisRouter);
  app.use("/api/wellness", requireAuth, ensureWorkspaceAccess, wellnessRouter);
  app.use("/api", requireAuth, ensureWorkspaceAccess, hrInlineRouter);
  app.use("/api", requireAuth, ensureWorkspaceAccess, leaderRouter);
  app.use("/api/owner-employee", requireAuth, ensureWorkspaceAccess, ownerEmployeeRouter);
  app.use(officerScoreRouter);
  // Phase 11: Officer Intelligence Dashboard — AI-driven insights and recommendations
  // Router defines full /api/officers/... paths internally, so scope auth to /api
  // to avoid swallowing the root request (which served JSON 401 for coaileague.com).
  app.use("/api", requireAuth, ensureWorkspaceAccess, officerIntelligenceRouter);
  app.use("/api/employees", requireAuth, ensureWorkspaceAccess, employeeRouter);
  app.use("/api/engagement", requireAuth, ensureWorkspaceAccess, engagementRouter);
  app.use("/api/gamification/enhanced", requireAuth, ensureWorkspaceAccess, gamificationEnhancedRoutes);
  // Public certificate verification — no auth, accessed via QR code
  app.use("/api/public/training/certification", publicCertRouter);
  app.use("/api/feedback", requireAuth, ensureWorkspaceAccess, feedbackRouter);
  app.use("/api/availability", requireAuth, ensureWorkspaceAccess, availabilityRouter);
  app.use("/api", requireAuth, ensureWorkspaceAccess, deactivateRouter);
  // benefitRouter applies requireAuth + resolveWorkspaceWithRole on every route internally.
  // requireAuth added at mount level as defense-in-depth.
  app.use("/api/benefits", requireAuth, benefitRouter);
  // reviewRouter defines its own full /api/reviews, /api/ratings/*, /api/report-templates
  // paths internally and applies requireAuth on every individual route handler.
  app.use(reviewRouter);
  registerFlexStaffingRoutes(app, requireAuth, ensureWorkspaceAccess);
  // Role label customisation — org owners can rename workspace roles for their org
  app.use("/api/role-labels", requireAuth, ensureWorkspaceAccess, roleLabelRoutes);
  // HR document requests — mass onboarding + targeted doc sends (I9, W4, W9, drug, guard card)
  app.use("/api/hr/document-requests", requireAuth, ensureWorkspaceAccess, hrDocumentRequestRoutes);
  // Onboarding forms — employee forms hub
  app.use("/api/onboarding-forms", requireAuth, ensureWorkspaceAccess, onboardingFormsRoutes);
  // Intelligent onboarding — AI-guided smart onboarding flow
  app.use("/api/smart-onboarding", requireAuth, ensureWorkspaceAccess, intelligentOnboardingRouter);
  // ATS — applicant tracking system
  app.use("/api/ats", requireAuth, ensureWorkspaceAccess, atsRouter);
  // Hiring pipeline — Trinity-orchestrated full hiring module (authenticated endpoints)
  app.use("/api/hiring", requireAuth, ensureWorkspaceAccess, hiringRouter);
  // Per-workspace Trinity Scoring Engine settings (auto-score, thresholds, cross-tenant opt-in)
  app.use("/api/workspace/hiring-settings", requireAuth, ensureWorkspaceAccess, hiringSettingsRouter);
  // Performance notes — manager-authored notes per officer
  app.use("/api/performance-notes", requireAuth, ensureWorkspaceAccess, performanceNoteRouter);
  // Disciplinary records — formal HR disciplinary workflow
  app.use("/api/disciplinary-records", requireAuth, ensureWorkspaceAccess, disciplinaryRecordRouter);
  // Performance management hub — disciplinary records (role-scoped), performance reviews, NDS notifications
  // Onboarding task management — Phase 48 task tracking and blocking
  app.use("/api/onboarding-tasks", requireAuth, ensureWorkspaceAccess, onboardingTaskRouter);
  // Phase 35T: Officer Recognition, Awards & Culture Building
  app.use("/api/recognition", requireAuth, ensureWorkspaceAccess, recognitionRouter);
  app.use("/api/invitations", requireAuth, ensureWorkspaceAccess, inviteRouter);
  // Phase 57: Clock-in PIN management (set/verify/clear/status per employee)
  app.use("/api/employees", requireAuth, ensureWorkspaceAccess, clockinPinRouter);
  // Phase 23: Universal identity PINs (owner, client, combined verify)
  // Note: individual routes inside apply their own auth — /verify-with-pin
  // is intentionally unauthenticated because Trinity and HelpAI call it with
  // just (code, pin) from inbound channels. Rate limiting is enforced at the
  // route level.
  app.use("/api/identity", identityPinRouter);
  // Phase 27: Employment verification — manager-facing approve/deny endpoints
  // for verify@{slug}.coaileague.com inbound requests. FCRA-compliant: only
  // employment dates, title, status, pay band, and officer score are shared.
  app.use("/api/employment-verify", requireAuth, ensureWorkspaceAccess, employmentVerifyRouter);
  // Phase 58: Trinity Interview Pipeline — Recruitment API
  app.use("/api/recruitment", requireAuth, ensureWorkspaceAccess, recruitmentRouter);
}
