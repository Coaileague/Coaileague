// Domain Orgs & Workspaces — Route Mounts
// THE LAW: No new routes without Bryan's approval.
// Canonical prefixes: /api/workspace/*, /api/integrations, /api/enterprise/*,
//   /api/onboarding/*, /api/hireos, /api/import, /api/employee-onboarding
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { ensureWorkspaceAccess } from "../../middleware/workspaceScope";
import { requirePlatformStaff } from "../../rbac";
import integrationRouterOAuth from "../oauthIntegrationRoutes";
import configRegistryRouter from "../configRegistryRoutes";
import featureFlagsRoutes from "../featureFlagsRoutes";
import { assistedOnboardingRouter, acceptHandoffRouter } from "../assisted-onboarding";
import deviceLoaderRouter from "../deviceLoaderRoutes";
import { employeeOnboardingRoutes } from "../employeeOnboardingRoutes";
import { enterpriseRouter } from "../enterpriseFeatures";
import enterpriseOnboardingRoutes from "../enterpriseOnboardingRoutes";
import experienceRoutes from "../experienceRoutes";
import hireosRouter from "../hireosRoutes";
import importRouter from "../importRoutes";
import { integrationRoutes, partnerRoutes } from "../integrationManagementRoutes";
import { registerIntegrationRoutes } from "../integrationRoutes";
import integrationsInlineRouter from "../integrationsInlineRoutes";
import { onboardingAssistantRouter } from "../onboarding-assistant-routes";
import onboardingInlineRouter from "../onboardingInlineRoutes";
import { onboardingRouter } from "../onboardingRoutes";
import promotionalBannerRouter from "../promotionalBannerRoutes";
import { whatsNewRouter } from "../whatsNewRoutes";
import workspaceSettingsRouter from "../workspace";
import workspaceInlineRouter from "../workspaceInlineRoutes";
import { employeePacketRouter } from "../employeePacketRoutes";
import permissionMatrixRouter from "../permissionMatrixRoutes";

import developerPortalRoutes from "../developerPortalRoutes";

export function mountOrgsRoutes(app: Express): void {
  app.use("/api/developers", requireAuth, ensureWorkspaceAccess, developerPortalRoutes);
  app.use(featureFlagsRoutes);
  app.use(configRegistryRouter);

  registerIntegrationRoutes(app);

  app.use("/api/integrations", integrationRouterOAuth);
  app.use("/api/enterprise", enterpriseOnboardingRoutes);
  app.use("/api/enterprise-features", requireAuth, ensureWorkspaceAccess, enterpriseRouter);
  // Public onboarding inline routes FIRST — candidate invite/application flows (no auth required)
  app.use("/api/onboarding", onboardingInlineRouter);
  // Auth-required onboarding routes after (workspace owner pipeline, checklists, AI import)
  app.use("/api/onboarding", requireAuth, ensureWorkspaceAccess, onboardingRouter);
  app.use("/api/onboarding-assistant", requireAuth, ensureWorkspaceAccess, onboardingAssistantRouter);
  app.use("/api/support/assisted-onboarding", assistedOnboardingRouter);
  app.use("/api/accept-handoff", acceptHandoffRouter);
  app.use("/api/employee-onboarding", requireAuth, ensureWorkspaceAccess, employeeOnboardingRoutes);
  app.use("/api/employee-packets", requireAuth, ensureWorkspaceAccess, employeePacketRouter);
  // Workspace routes: requireAuth only (no ensureWorkspaceAccess) — POST /api/workspace creates the workspace
  // for users who do not have one yet; individual route handlers enforce workspace scope internally
  app.use("/api/workspace/integrations", requireAuth, ensureWorkspaceAccess, integrationRoutes);
  app.use("/api/workspace", requireAuth, workspaceSettingsRouter);
  app.use("/api/integrations", requireAuth, ensureWorkspaceAccess, integrationsInlineRouter);
  app.use("/api/workspace", requireAuth, workspaceInlineRouter);
  app.use("/api/admin/partners", requirePlatformStaff, partnerRoutes);
  app.use("/api/import", requireAuth, ensureWorkspaceAccess, importRouter);
  app.use("/api/hireos", requireAuth, ensureWorkspaceAccess, hireosRouter);
  app.use("/api/promotional-banners", promotionalBannerRouter);
  app.use("/api/whats-new", requireAuth, ensureWorkspaceAccess, whatsNewRouter);
  app.use("/api/experience", experienceRoutes);
  app.use("/api/device", deviceLoaderRouter);
  app.use("/api/workspace/permissions", requireAuth, ensureWorkspaceAccess, permissionMatrixRouter);
}
