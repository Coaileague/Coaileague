/**
 * Mobile Worker API Routes
 * 
 * MVP endpoints for the mobile worker experience - CONNECTED TO REAL DATA
 * 
 * Shifts: Connected to existing scheduling system (shifts table)
 * Incidents: Persisted to database via security_incidents table
 * Clock status: Uses existing /api/time-entries/status from time-entry-routes.ts
 */

import { Router, Request, Response, NextFunction } from 'express';
import { storage } from '../storage';

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    claims: {
      sub: string;
    };
    currentWorkspaceId?: string;
  };
  workspaceId?: string;
  userId?: number;
  employeeId?: number;
}

const ensureAuth = (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user?.claims?.sub) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
};

/**
 * Shifts Router - mounted at /api/shifts
 * 
 * Connected to real shifts data filtered by authenticated employee
 */
export const shiftsRouter = Router();

shiftsRouter.get('/today', ensureAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    const workspaceId = authReq.workspaceId || authReq.user?.currentWorkspaceId;
    
    if (!userId || !workspaceId) {
      return res.json([]);
    }

    const employee = await storage.getEmployeeByUserId(userId, workspaceId);
    if (!employee) {
      return res.json([]);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const shifts = await storage.getShiftsByEmployeeAndDateRange(
      workspaceId,
      employee.id,
      today,
      tomorrow
    );
    
    res.json(shifts);
  } catch (error) {
    console.error('[MobileWorker] Error fetching today shifts:', error);
    res.json([]);
  }
});

shiftsRouter.get('/upcoming', ensureAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    const workspaceId = authReq.workspaceId || authReq.user?.currentWorkspaceId;
    
    if (!userId || !workspaceId) {
      return res.json([]);
    }

    const employee = await storage.getEmployeeByUserId(userId, workspaceId);
    if (!employee) {
      return res.json([]);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekFromNow = new Date(today);
    weekFromNow.setDate(weekFromNow.getDate() + 7);

    const shifts = await storage.getShiftsByEmployeeAndDateRange(
      workspaceId,
      employee.id,
      today,
      weekFromNow
    );
    
    res.json(shifts);
  } catch (error) {
    console.error('[MobileWorker] Error fetching upcoming shifts:', error);
    res.json([]);
  }
});

/**
 * Incidents Router - mounted at /api/incidents
 * 
 * Security incident reporting for field workers
 * Now persists to database via security_incidents table
 * 
 * Incident types: suspicious_person, suspicious_vehicle, property_damage,
 *                 medical_emergency, fire_safety, theft, other
 * Severity levels: low, medium, high, critical
 */
export const incidentsRouter = Router();

incidentsRouter.get('/my-reports', ensureAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    const workspaceId = authReq.workspaceId || authReq.user?.currentWorkspaceId;
    
    if (!userId || !workspaceId) {
      return res.json([]);
    }

    const employee = await storage.getEmployeeByUserId(userId, workspaceId);
    if (!employee) {
      return res.json([]);
    }

    const incidents = await storage.getSecurityIncidentsByEmployee(workspaceId, employee.id);
    res.json(incidents);
  } catch (error) {
    console.error('[MobileWorker] Error fetching incident reports:', error);
    res.json([]);
  }
});

import { incidentRoutingService, type IncidentType, type IncidentSeverity } from '../services/incidentRoutingService';

const VALID_INCIDENT_TYPES = ['safety_hazard', 'property_damage', 'theft', 'injury', 'harassment', 'unauthorized_access', 'equipment_failure', 'other'];
const VALID_SEVERITIES = ['low', 'medium', 'high', 'critical'];
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_PHOTOS = 10;
const MAX_LOCATION_LENGTH = 500;

incidentsRouter.post('/', ensureAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    const workspaceId = authReq.workspaceId || authReq.user?.currentWorkspaceId;
    let { type, description, location, latitude, longitude, shiftId, photos, manualSeverity } = req.body;
    
    if (!userId || !workspaceId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (description && typeof description === 'string' && description.length > MAX_DESCRIPTION_LENGTH) {
      return res.status(400).json({ message: `Description exceeds maximum length of ${MAX_DESCRIPTION_LENGTH} characters` });
    }

    if (type && !VALID_INCIDENT_TYPES.includes(type)) {
      type = 'other';
    }

    if (manualSeverity && !VALID_SEVERITIES.includes(manualSeverity)) {
      manualSeverity = undefined;
    }

    if (latitude !== undefined) {
      const lat = parseFloat(latitude);
      if (isNaN(lat) || lat < -90 || lat > 90) {
        return res.status(400).json({ message: 'Invalid latitude. Must be between -90 and 90' });
      }
      latitude = lat;
    }

    if (longitude !== undefined) {
      const lng = parseFloat(longitude);
      if (isNaN(lng) || lng < -180 || lng > 180) {
        return res.status(400).json({ message: 'Invalid longitude. Must be between -180 and 180' });
      }
      longitude = lng;
    }

    if (photos && Array.isArray(photos)) {
      if (photos.length > MAX_PHOTOS) {
        return res.status(400).json({ message: `Maximum ${MAX_PHOTOS} photos allowed` });
      }
      photos = photos.filter((p: any) => typeof p === 'string' && p.length < 2000);
    } else {
      photos = undefined;
    }

    if (location && typeof location === 'string' && location.length > MAX_LOCATION_LENGTH) {
      location = location.substring(0, MAX_LOCATION_LENGTH);
    }

    const employee = await storage.getEmployeeByUserId(userId, workspaceId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee profile not found' });
    }

    const routingResult = await incidentRoutingService.createAndRouteIncident({
      workspaceId,
      employeeId: employee.id,
      type: (type || 'other') as IncidentType,
      description: (description || 'No description provided').substring(0, MAX_DESCRIPTION_LENGTH),
      location: location ? (typeof location === 'string' ? location : JSON.stringify(location)) : undefined,
      latitude,
      longitude,
      shiftId: shiftId && typeof shiftId === 'string' ? shiftId : undefined,
      photos,
      manualSeverity: manualSeverity as IncidentSeverity | undefined,
    });

    console.log('[MobileWorker] Incident routed:', { 
      id: routingResult.incidentId,
      severity: routingResult.severity,
      supervisorNotified: routingResult.supervisorNotified,
      managerNotified: routingResult.managerNotified,
      workspaceId,
    });
    
    res.json({
      incidentId: routingResult.incidentId,
      severity: routingResult.severity,
      supervisorNotified: routingResult.supervisorNotified,
      managerNotified: routingResult.managerNotified,
      clientNotified: routingResult.clientNotified,
      message: `Incident reported as ${routingResult.severity.toUpperCase()}. ${routingResult.managerNotified ? 'Manager has been alerted.' : 'Supervisor has been notified.'}`,
      routingDetails: routingResult.routingDetails,
    });
  } catch (error) {
    console.error('[MobileWorker] Error creating incident:', error);
    res.status(500).json({ 
      message: 'Failed to save incident report. Please try again.',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
