// Domain Field Ops — Route Mounts
// THE LAW: No new routes without Bryan's approval.
// Canonical prefixes: /api/incidents, /api/incident-reports, /api/rms, /api/cad, /api/situation,
//   /api/post-order-versions, /api/incident-patterns, /api/subcontractors, /api/bots, /api/import
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { ensureWorkspaceAccess } from "../../middleware/workspaceScope";
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
  app.use("/api/onboarding-pipeline", requireAuth, ensureWorkspaceAccess, onboardingPipelineRouter);
  // maintenanceRoutes defines its own /api/maintenance/* paths with requireAuth + requirePlatformAdmin
  // on every handler. Mounted without a path prefix to define its own canonical paths internally.
  app.use(maintenanceRoutes);

  // incidentsRouter applies requireAuth on every route internally.
  // requireAuth added at mount level as defense-in-depth.
  app.use("/api/incidents", requireAuth, incidentsRouter);
  app.use("/api/incident-reports", requireAuth, ensureWorkspaceAccess, incidentPipelineRouter);
  app.use("/api/rms", requireAuth, ensureWorkspaceAccess, rmsRouter);
  app.use("/api/cad", requireAuth, ensureWorkspaceAccess, cadRouter);
  app.use("/api/situation", requireAuth, ensureWorkspaceAccess, situationRouter);
  app.use("/api/safety", requireAuth, ensureWorkspaceAccess, safetyRouter);
  app.use("/api/equipment", requireAuth, ensureWorkspaceAccess, equipmentRouter);
  // Armory — Readiness Section 2 (inspections, qualifications, ammo)
  app.use("/api/armory", requireAuth, ensureWorkspaceAccess, armoryRouter);
  app.use("/api/vehicles", requireAuth, ensureWorkspaceAccess, vehicleRouter);
  app.use("/api/guard-tours", requireAuth, ensureWorkspaceAccess, guardTourRouter);
  app.use("/api/migration", requireAuth, ensureWorkspaceAccess, migrationRouter);
  // Expansion Sprint modules
  app.use("/api/post-order-versions", requireAuth, ensureWorkspaceAccess, postOrderVersionRouter);
  app.use("/api/incident-patterns", requireAuth, ensureWorkspaceAccess, incidentPatternRouter);
  app.use("/api/subcontractors", requireAuth, ensureWorkspaceAccess, subcontractorRouter);
  app.use("/api/bots", requireAuth, ensureWorkspaceAccess, shiftBotSimulationRouter);
  // Document form builder (field ops documents: post orders, incident forms, DAR templates)
  app.use("/api/document-forms", requireAuth, ensureWorkspaceAccess, documentFormRoutes);
  // Phase 35D — Work Orders
  app.use("/api/work-orders", requireAuth, ensureWorkspaceAccess, workOrderRouter);
  registerWorkOrderActions();

  // Phase 35I — Visitor & Guest Management
  app.use("/api/visitor-management", requireAuth, ensureWorkspaceAccess, visitorManagementRouter);
  ensureVisitorTables().catch(err => log.error('[VisitorMgmt] Startup table ensure failed:', err?.message));
  registerVisitorActions();
  startOverstayMonitor();

  // Phase 35M — Site Survey Workflow and Facility Assessment
  app.use("/api/site-survey", requireAuth, ensureWorkspaceAccess, siteSurveyRoutes);
}
