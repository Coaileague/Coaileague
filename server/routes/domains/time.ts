// Domain Time & Attendance — Route Mounts
// THE LAW: No new routes without Bryan's approval.
// Canonical prefixes: /api/time-entries, /api/breaks, /api/gps, /api/timesheet-reports, /api (timeOff per-route)
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { ensureWorkspaceAccess } from "../../middleware/workspaceScope";
import { timeEntryRouter } from "../time-entry-routes";
import { timesheetReportRouter } from "../timesheetReportRoutes";
import timeEntryInlineRouter from "../timeEntryRoutes";
import breakInlineRouter from "../breakRoutes";
import timeOffRouter from "../timeOffRoutes";
import mileageRouter from "../mileageRoutes";

export function mountTimeRoutes(app: Express): void {
  // ARCHITECTURE NOTE: Two routers share /api/time-entries intentionally — non-overlapping route paths.
  // time-entry-routes.ts (timeEntryRouter): /status /clock-in /clock-out /break/* /entries /geofence-override/*
  // timeEntryRoutes.ts (timeEntryInlineRouter): / /approve /reject /pending /bulk-approve /quiz /gps-ping /manual-override /:id/clock-out /:id/start-break /:id/end-break
  // Express evaluates both in registration order; no path conflicts exist between the two sets.
  // timeEntryRouter applies requireAuth on every route — mount-level guard added as defense-in-depth.
  app.use("/api/time-entries", requireAuth, timeEntryRouter);
  app.use("/api/time-entries", requireAuth, ensureWorkspaceAccess, timeEntryInlineRouter);
  app.use("/api/breaks", requireAuth, ensureWorkspaceAccess, breakInlineRouter);
  app.use("/api/timesheet-reports", requireAuth, ensureWorkspaceAccess, timesheetReportRouter);
  // timeOffRouter defines its own /api/pto, /api/time-off-requests, /api/timesheet-edit-requests,
  // /api/shift-actions paths internally with requireAuth on every route.
  app.use(timeOffRouter);
  app.use("/api/mileage", requireAuth, ensureWorkspaceAccess, mileageRouter);
}
