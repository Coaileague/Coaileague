/**
 * Mobile Worker API Routes
 * 
 * MVP endpoints for the mobile worker experience - CONNECTED TO REAL DATA
 * 
 * Shifts: Connected to existing scheduling system (shifts table)
 * Incidents: Persisted to database via security_incidents table
 * Clock status: Uses existing /api/time-entries/status from time-entry-routes.ts
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { storage } from '../storage';
import { UPLOADS } from '../config/platformConfig';
import { requireAuth, type AuthenticatedRequest } from '../rbac';

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

incidentsRouter.get('/my-reports', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    const workspaceId = authReq.workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId;
    
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
    log.error('[MobileWorker] Error fetching incident reports:', error);
    res.json([]);
  }
});

import { incidentRoutingService, type IncidentType, type IncidentSeverity } from '../services/incidentRoutingService';
import { createLogger } from '../lib/logger';
const log = createLogger('MobileWorkerRoutes');


incidentsRouter.post('/ai-analyze', requireAuth, async (req: Request, res: Response) => {
  try {
    const { type, severity, description, title, location } = req.body;
    
    const incidentType = type || 'other';
    const incidentSeverity = severity || 'medium';
    const incidentDesc = (description || '').substring(0, 2000);
    
    const typeLabels: Record<string, string> = {
      suspicious_person: 'Suspicious Person',
      suspicious_vehicle: 'Suspicious Vehicle', 
      property_damage: 'Property Damage',
      medical_emergency: 'Medical Emergency',
      fire_safety: 'Fire/Safety Hazard',
      theft: 'Theft/Break-in',
      other: 'Other',
    };
    
    const typeLabel = typeLabels[incidentType] || incidentType;
    
    const recommendations: string[] = [];
    const suggestedActions: string[] = [];
    let riskLevel = incidentSeverity;
    let summary = '';
    
    if (incidentSeverity === 'critical' || incidentSeverity === 'high') {
      recommendations.push('Ensure immediate area is secured and safe for all personnel');
      recommendations.push('Document all witnesses and preserve any physical evidence');
      suggestedActions.push('Notify on-site supervisor immediately');
      suggestedActions.push('Contact emergency services if safety is at risk');
      if (incidentSeverity === 'critical') {
        suggestedActions.push('Initiate emergency response protocol');
        riskLevel = 'critical';
      }
    }
    
    if (incidentType === 'suspicious_person' || incidentType === 'suspicious_vehicle') {
      recommendations.push('Maintain safe distance - do not approach or confront');
      recommendations.push('Note physical description, clothing, vehicle make/model/color/plate');
      suggestedActions.push('Monitor from safe location until backup arrives');
      suggestedActions.push('Record time of observation and direction of travel');
    } else if (incidentType === 'medical_emergency') {
      recommendations.push('Call 911 immediately if not already done');
      recommendations.push('Do not move the injured person unless in immediate danger');
      suggestedActions.push('Administer first aid if trained and it is safe to do so');
      suggestedActions.push('Clear the area and direct emergency responders on arrival');
      riskLevel = 'critical';
    } else if (incidentType === 'fire_safety') {
      recommendations.push('Activate fire alarm if not already triggered');
      recommendations.push('Evacuate the area following emergency exit routes');
      suggestedActions.push('Call fire department - do not attempt to fight large fires');
      suggestedActions.push('Account for all personnel in the area');
      riskLevel = riskLevel === 'low' ? 'high' : riskLevel;
    } else if (incidentType === 'theft') {
      recommendations.push('Do not pursue suspects - prioritize personal safety');
      recommendations.push('Preserve the scene and avoid touching potential evidence');
      suggestedActions.push('File a police report with case number for documentation');
      suggestedActions.push('Review security camera footage if available');
    } else if (incidentType === 'property_damage') {
      recommendations.push('Photograph all damage from multiple angles');
      recommendations.push('Cordon off the affected area to prevent further damage or injury');
      suggestedActions.push('Document estimated repair costs if possible');
      suggestedActions.push('Report to property owner/management');
    }
    
    if (incidentDesc.length < 30) {
      recommendations.push('Add more detail to your description for a stronger report');
    }
    
    if (!location) {
      recommendations.push('Capture your GPS location to strengthen this report');
    }
    
    summary = `${typeLabel} incident classified as ${riskLevel.toUpperCase()} risk. ` +
      `${recommendations.length} recommendations and ${suggestedActions.length} suggested actions identified. ` +
      `Review the analysis below before submitting to your chain of command.`;
    
    res.json({
      recommendations,
      riskLevel,
      suggestedActions,
      summary,
    });
  } catch (error) {
    log.error('[IncidentAI] Analysis error:', error);
    res.status(500).json({ 
      message: 'Failed to analyze incident',
      recommendations: ['Submit report to chain of command for manual review'],
      riskLevel: 'medium',
      suggestedActions: ['Contact your supervisor directly'],
      summary: 'AI analysis encountered an error. Your report can still be submitted.',
    });
  }
});

const VALID_INCIDENT_TYPES = ['safety_hazard', 'property_damage', 'theft', 'injury', 'harassment', 'unauthorized_access', 'equipment_failure', 'other'];
const VALID_SEVERITIES = ['low', 'medium', 'high', 'critical'];
const MAX_DESCRIPTION_LENGTH = UPLOADS.maxDescriptionLength;
const MAX_PHOTOS = UPLOADS.maxPhotosPerReport;
const MAX_LOCATION_LENGTH = UPLOADS.maxLocationLength;

incidentsRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    const workspaceId = authReq.workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId;
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

    log.info('[MobileWorker] Incident routed:', { 
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
    log.error('[MobileWorker] Error creating incident:', error);
    res.status(500).json({ 
      message: 'Failed to save incident report. Please try again.',
      error: error instanceof Error ? sanitizeError(error) : 'Unknown error'
    });
  }
});
