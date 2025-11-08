/**
 * DispatchOS™ API Routes
 * GPS tracking, incident management, unit status, real-time CAD operations
 */

import { Router, type Request, type Response } from "express";
import { dispatchService } from "../services/dispatch";
import { z } from "zod";
import { monitoringService } from "../monitoring";

const router = Router();

// ============================================================================
// GPS TRACKING ENDPOINTS
// ============================================================================

/**
 * POST /api/dispatch/gps
 * Mobile units submit location every 10 seconds
 */
router.post('/gps', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      employeeId: z.string(),
      workspaceId: z.string(),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      accuracy: z.number().optional(),
    });

    const data = schema.parse(req.body);
    const location = await dispatchService.recordGPSLocation(data);

    res.json({ success: true, location });
  } catch (error: any) {
    monitoringService.logError(error, {
      additionalData: { endpoint: '/api/dispatch/gps', body: req.body }
    });
    res.status(400).json({ message: error.message || "Failed to record GPS location" });
  }
});

/**
 * GET /api/dispatch/units
 * Get all active units with current status and location
 */
router.get('/units', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.query;
    
    if (!workspaceId || typeof workspaceId !== 'string') {
      return res.status(400).json({ message: "workspaceId query parameter required" });
    }

    const units = await dispatchService.getActiveUnits(workspaceId);
    res.json(units);
  } catch (error: any) {
    monitoringService.logError(error, {
      additionalData: { endpoint: '/api/dispatch/units' }
    });
    res.status(500).json({ message: "Failed to fetch units" });
  }
});

/**
 * GET /api/dispatch/units/:employeeId/trail
 * Get GPS trail for a specific unit
 */
router.get('/units/:employeeId/trail', async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const { workspaceId, limit } = req.query;

    if (!workspaceId || typeof workspaceId !== 'string') {
      return res.status(400).json({ message: "workspaceId query parameter required" });
    }

    const trail = await dispatchService.getUnitGPSTrail(
      employeeId,
      workspaceId,
      limit ? parseInt(limit as string) : 50
    );

    res.json(trail);
  } catch (error: any) {
    monitoringService.logError(error, {
      additionalData: { endpoint: '/api/dispatch/units/trail' }
    });
    res.status(500).json({ message: "Failed to fetch GPS trail" });
  }
});

/**
 * GET /api/dispatch/units/on-shift
 * Get only units currently on shift (ScheduleOS™ integration)
 */
router.get('/units/on-shift', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.query;
    
    if (!workspaceId || typeof workspaceId !== 'string') {
      return res.status(400).json({ message: "workspaceId query parameter required" });
    }

    const units = await dispatchService.getOnShiftUnits(workspaceId);
    res.json(units);
  } catch (error: any) {
    monitoringService.logError(error, {
      additionalData: { endpoint: '/api/dispatch/units/on-shift' }
    });
    res.status(500).json({ message: "Failed to fetch on-shift units" });
  }
});

// ============================================================================
// UNIT STATUS MANAGEMENT
// ============================================================================

/**
 * POST /api/dispatch/units/status
 * Update unit status (available/en route/on scene/offline)
 */
router.post('/units/status', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      employeeId: z.string(),
      workspaceId: z.string(),
      status: z.enum(['available', 'dispatched', 'en_route', 'on_scene', 'offline']),
      incidentId: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const unit = await dispatchService.updateUnitStatus(
      data.employeeId,
      data.workspaceId,
      data.status,
      data.incidentId
    );

    res.json({ success: true, unit });
  } catch (error: any) {
    monitoringService.logError(error, {
      additionalData: { endpoint: '/api/dispatch/units/status' }
    });
    res.status(400).json({ message: error.message || "Failed to update unit status" });
  }
});

// ============================================================================
// INCIDENT MANAGEMENT
// ============================================================================

/**
 * POST /api/dispatch/incidents
 * Create a new dispatch incident
 */
router.post('/incidents', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      workspaceId: z.string(),
      incidentNumber: z.string(),
      priority: z.enum(['emergency', 'urgent', 'routine']),
      type: z.string(),
      locationAddress: z.string(),
      locationLatitude: z.number().optional(),
      locationLongitude: z.number().optional(),
      clientId: z.string().optional(),
      callerName: z.string().optional(),
      callerPhone: z.string().optional(),
      notes: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const incident = await dispatchService.createIncident(data);

    res.json({ success: true, incident });
  } catch (error: any) {
    monitoringService.logError(error, {
      additionalData: { endpoint: '/api/dispatch/incidents' }
    });
    res.status(400).json({ message: error.message || "Failed to create incident" });
  }
});

/**
 * GET /api/dispatch/incidents
 * Get active incidents for workspace
 */
router.get('/incidents', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.query;
    
    if (!workspaceId || typeof workspaceId !== 'string') {
      return res.status(400).json({ message: "workspaceId query parameter required" });
    }

    const incidents = await dispatchService.getActiveIncidents(workspaceId);
    res.json(incidents);
  } catch (error: any) {
    monitoringService.logError(error, {
      additionalData: { endpoint: '/api/dispatch/incidents' }
    });
    res.status(500).json({ message: "Failed to fetch incidents" });
  }
});

/**
 * PATCH /api/dispatch/incidents/:id/status
 * Update incident status with timeline tracking
 */
router.patch('/incidents/:id/status', async (req: Request, res: Response) => {
  try {
    const incidentId = req.params.id;
    const schema = z.object({
      status: z.enum(['pending', 'assigned', 'en_route', 'on_scene', 'cleared']),
      dispatcherId: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const incident = await dispatchService.updateIncidentStatus(
      incidentId,
      data.status,
      data.dispatcherId
    );

    res.json({ success: true, incident });
  } catch (error: any) {
    monitoringService.logError(error, {
      additionalData: { endpoint: '/api/dispatch/incidents/status' }
    });
    res.status(400).json({ message: error.message || "Failed to update incident status" });
  }
});

// ============================================================================
// UNIT ASSIGNMENT
// ============================================================================

/**
 * POST /api/dispatch/assignments
 * Assign unit to incident
 */
router.post('/assignments', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      incidentId: z.string(),
      employeeId: z.string(),
      notes: z.string().optional(),
      dispatcherId: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const assignment = await dispatchService.assignUnit(
      {
        incidentId: data.incidentId,
        employeeId: data.employeeId,
        notes: data.notes,
      },
      data.dispatcherId
    );

    res.json({ success: true, assignment });
  } catch (error: any) {
    monitoringService.logError(error, {
      additionalData: { endpoint: '/api/dispatch/assignments' }
    });
    res.status(400).json({ message: error.message || "Failed to assign unit" });
  }
});

/**
 * POST /api/dispatch/assignments/respond
 * Unit accepts or rejects assignment
 */
router.post('/assignments/respond', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      incidentId: z.string(),
      employeeId: z.string(),
      response: z.enum(['accepted', 'rejected']),
      reason: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const assignment = await dispatchService.respondToAssignment(
      data.incidentId,
      data.employeeId,
      data.response,
      data.reason
    );

    res.json({ success: true, assignment });
  } catch (error: any) {
    monitoringService.logError(error, {
      additionalData: { endpoint: '/api/dispatch/assignments/respond' }
    });
    res.status(400).json({ message: error.message || "Failed to respond to assignment" });
  }
});

export default router;
