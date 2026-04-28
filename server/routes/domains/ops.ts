// Domain Field Ops — Route Mounts
// THE LAW: No new routes without Bryan's approval.
// Canonical prefixes: /api/incidents, /api/incident-reports, /api/rms, /api/cad, /api/situation,
//   /api/post-order-versions, /api/incident-patterns, /api/subcontractors, /api/bots, /api/import
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { ensureWorkspaceAccess } from "../../middleware/workspaceScope";
import { mountWorkspaceRoutes } from "./routeMounting";
import { incidentsRouter } from "../mobileWorkerRoutes";
import { incidentPipelineRouter } from "../incidentPipelineRoutes";
import { rmsRouter } from "../rmsRoutes";
import { cadRouter } from "../cadRoutes";
import { situationRouter } from "../situationRoutes";
import { safetyRouter } from "../safetyRoutes";
import equipmentRouter from "../equipmentRoutes";
import armoryRouter from "../armoryRoutes";
import vehicleRouter from "../vehicleRoutes";
import guardTourRouter from "../guardTourRoutes";
import { migrationRouter } from "../migration";
import maintenanceRoutes from "../maintenanceRoutes";
import postOrderVersionRouter from "../postOrderVersionRoutes";
import incidentPatternRouter from "../incidentPatternRoutes";
import subcontractorRouter from "../subcontractorRoutes";
import shiftBotSimulationRouter from "../shiftBotSimulationRoutes";
import documentFormRoutes from "../documentFormRoutes";
import workOrderRouter, { registerWorkOrderActions } from "../workOrderRoutes";
import { visitorManagementRouter, ensureVisitorTables, registerVisitorActions, startOverstayMonitor } from "../visitorManagementRoutes";
import siteSurveyRoutes from "../siteSurveyRoutes";
import { createLogger } from '../../lib/logger';
const log = createLogger('Ops');

import onboardingPipelineRouter from "../onboardingPipelineRoutes";

export function mountOpsRoutes(app: Express): void {
  // MEGA Phase: Onboarding Pipeline — Trinity-orchestrated 7-step worker activation
  mountWorkspaceRoutes(app, [
    ["/api/onboarding-pipeline", onboardingPipelineRouter],
  ]);
  // maintenanceRoutes defines its own /api/maintenance/* paths with requireAuth + requirePlatformAdmin
  // on every handler. Mounted without a path prefix to define its own canonical paths internally.
  app.use(maintenanceRoutes);

  // incidentsRouter applies requireAuth on every route internally.
  // requireAuth added at mount level as defense-in-depth.
  app.use("/api/incidents", requireAuth, incidentsRouter);
  mountWorkspaceRoutes(app, [
    ["/api/incident-reports", incidentPipelineRouter],
    ["/api/rms", rmsRouter],
    ["/api/cad", cadRouter],
    ["/api/situation", situationRouter],
    ["/api/safety", safetyRouter],
    ["/api/equipment", equipmentRouter],
  ]);
  // Armory — Readiness Section 2 (inspections, qualifications, ammo)
  mountWorkspaceRoutes(app, [
    ["/api/armory", armoryRouter],
    ["/api/vehicles", vehicleRouter],
    ["/api/guard-tours", guardTourRouter],
    ["/api/migration", migrationRouter],
  ]);
  // Expansion Sprint modules
  mountWorkspaceRoutes(app, [
    ["/api/post-order-versions", postOrderVersionRouter],
    ["/api/incident-patterns", incidentPatternRouter],
    ["/api/subcontractors", subcontractorRouter],
    ["/api/bots", shiftBotSimulationRouter],
  ]);
  // Document form builder (field ops documents: post orders, incident forms, DAR templates)
  mountWorkspaceRoutes(app, [
    ["/api/document-forms", documentFormRoutes],
  ]);
  // Phase 35D — Work Orders
  mountWorkspaceRoutes(app, [
    ["/api/work-orders", workOrderRouter],
  ]);
  registerWorkOrderActions();

  // Phase 35I — Visitor & Guest Management
  mountWorkspaceRoutes(app, [
    ["/api/visitor-management", visitorManagementRouter],
  ]);
  ensureVisitorTables().catch(err => log.error('[VisitorMgmt] Startup table ensure failed:', err?.message));
  registerVisitorActions();
  startOverstayMonitor();

  // Phase 35M — Site Survey Workflow and Facility Assessment
  mountWorkspaceRoutes(app, [
    ["/api/site-survey", siteSurveyRoutes],
  ]);
}
