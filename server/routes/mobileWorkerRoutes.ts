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

incidentsRouter.post('/', ensureAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    const workspaceId = authReq.workspaceId || authReq.user?.currentWorkspaceId;
    const { type, severity, description, location, timestamp } = req.body;
    
    if (!userId || !workspaceId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const employee = await storage.getEmployeeByUserId(userId, workspaceId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee profile not found' });
    }

    const incident = await storage.createSecurityIncident({
      workspaceId,
      employeeId: employee.id,
      type,
      severity,
      description,
      location: location ? JSON.stringify(location) : null,
      reportedAt: timestamp ? new Date(timestamp) : new Date(),
      status: 'open',
    });

    console.log('[MobileWorker] Security incident persisted:', { 
      id: incident.id,
      type, 
      severity, 
      employeeId: employee.id,
      workspaceId,
    });
    
    res.json({
      ...incident,
      message: 'Incident reported successfully. Management has been notified.',
    });
  } catch (error) {
    console.error('[MobileWorker] Error creating incident:', error);
    res.status(500).json({ 
      message: 'Failed to save incident report. Please try again.',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
