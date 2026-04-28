// Domain Orgs & Workspaces — Route Mounts
// THE LAW: No new routes without Bryan's approval.
// Canonical prefixes: /api/workspace/*, /api/integrations, /api/enterprise/*,
//   /api/onboarding/*, /api/hireos, /api/import, /api/employee-onboarding
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { ensureWorkspaceAccess } from "../../middleware/workspaceScope";
import { requirePlatformStaff } from "../../rbac";
import { mountWorkspaceRoutes } from "./routeMounting";
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
  mountWorkspaceRoutes(app, [
    ["/api/developers", developerPortalRoutes],
  ]);
  app.use(featureFlagsRoutes);
  app.use(configRegistryRouter);

  registerIntegrationRoutes(app);

  app.use("/api/integrations", integrationRouterOAuth);
  app.use("/api/enterprise", enterpriseOnboardingRoutes);
  mountWorkspaceRoutes(app, [
    ["/api/enterprise-features", enterpriseRouter],
  ]);
  // Public onboarding inline routes FIRST — candidate invite/application flows (no auth required)
  app.use("/api/onboarding", onboardingInlineRouter);
  // Auth-required onboarding routes after (workspace owner pipeline, checklists, AI import)
  mountWorkspaceRoutes(app, [
    ["/api/onboarding", onboardingRouter],
    ["/api/onboarding-assistant", onboardingAssistantRouter],
  ]);
  app.use("/api/support/assisted-onboarding", assistedOnboardingRouter);
  app.use("/api/accept-handoff", acceptHandoffRouter);
  mountWorkspaceRoutes(app, [
    ["/api/employee-onboarding", employeeOnboardingRoutes],
    ["/api/employee-packets", employeePacketRouter],
  ]);
  // Workspace routes: requireAuth only (no ensureWorkspaceAccess) — POST /api/workspace creates the workspace
  // for users who do not have one yet; individual route handlers enforce workspace scope internally
  mountWorkspaceRoutes(app, [
    ["/api/workspace/integrations", integrationRoutes],
  ]);
  app.use("/api/workspace", requireAuth, workspaceSettingsRouter);
  mountWorkspaceRoutes(app, [
    ["/api/integrations", integrationsInlineRouter],
  ]);
  app.use("/api/workspace", requireAuth, workspaceInlineRouter);
  app.use("/api/admin/partners", requirePlatformStaff, partnerRoutes);
  mountWorkspaceRoutes(app, [
    ["/api/import", importRouter],
    ["/api/hireos", hireosRouter],
  ]);
  app.use("/api/promotional-banners", promotionalBannerRouter);
  mountWorkspaceRoutes(app, [
    ["/api/whats-new", whatsNewRouter],
  ]);
  app.use("/api/experience", experienceRoutes);
  app.use("/api/device", deviceLoaderRouter);
  mountWorkspaceRoutes(app, [
    ["/api/workspace/permissions", permissionMatrixRouter],
  ]);
}
