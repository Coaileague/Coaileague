import { db } from '../db';
import { timeEntries, shifts, employees, clients, gpsLocations } from '@shared/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { platformEventBus } from './platformEventBus';
import { universalNotificationEngine } from './universalNotificationEngine';
import { createLogger } from '../lib/logger';
const log = createLogger('gpsGeofenceService');


export interface GPSLocation {
  latitude: number;
  longitude: number;
}

export interface GeofenceValidationResult {
  allowed: boolean;
  reason: string;
  distanceMeters?: number;
  siteVerified?: string;
  location?: GPSLocation;
  violationType?: 'too_far' | 'no_shift' | 'site_unknown' | 'low_accuracy';
  accuracyWarning?: string;
}

export interface GPSViolation {
  id?: string;
  employeeId: string;
  employeeName: string;
  shiftId: string;
  siteId: string;
  siteName: string;
  attemptedLocation: GPSLocation;
  correctLocation: GPSLocation;
  distanceMeters: number;
  timestamp: Date;
  workspaceId: string;
  action: 'clock_in' | 'clock_out';
}

export interface BreadcrumbEntry {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  timestamp: Date;
}

const DEFAULT_GEOFENCE_RADIUS_METERS = 200; // Spec says >200m = Out-of-Bounds
const GPS_ACCURACY_REJECT_THRESHOLD = 150;
const GPS_ACCURACY_WARN_THRESHOLD = 50;

export function calculateDistance(point1: GPSLocation, point2: GPSLocation): number {
  const R = 6371e3;
  const φ1 = (point1.latitude * Math.PI) / 180;
  const φ2 = (point2.latitude * Math.PI) / 180;
  const Δφ = ((point2.latitude - point1.latitude) * Math.PI) / 180;
  const Δλ = ((point2.longitude - point1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

async function getCurrentShift(employeeId: string, workspaceId: string) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  
  const currentShift = await db.query.shifts.findFirst({
    where: and(
      eq(shifts.employeeId, employeeId),
      eq(shifts.workspaceId, workspaceId),
      eq(shifts.date, today)
    ),
    orderBy: [desc(shifts.startTime)],
  });

  return currentShift;
}

async function getSiteLocation(clientId: string, workspaceId?: string): Promise<{ latitude: number; longitude: number; name: string; geofenceRadiusMeters: number } | null> {
  const client = await db.query.clients.findFirst({
    where: workspaceId
      ? and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId))
      : eq(clients.id, clientId),
  });

  if (!client) return null;

  const latitude = (client as any).latitude || (client as any).siteLatitude;
  const longitude = (client as any).longitude || (client as any).siteLongitude;

  if (!latitude || !longitude) {
    return null;
  }

  const geofenceRadius = (client as any).geofenceRadiusMeters ?? DEFAULT_GEOFENCE_RADIUS_METERS;

  return {
    latitude: parseFloat(latitude),
    longitude: parseFloat(longitude),
    name: client.companyName || `${client.firstName} ${client.lastName}` || 'Unknown Site',
    geofenceRadiusMeters: geofenceRadius,
  };
}

async function logGPSViolation(violation: GPSViolation): Promise<void> {
  log.info(`[GPS] VIOLATION: ${violation.employeeName} attempted clock ${violation.action} at ${Math.round(violation.distanceMeters)}m from ${violation.siteName}`);

  await platformEventBus.publish({
    type: 'trinity_issue_detected',
    category: 'security',
    title: 'GPS Violation Detected',
    description: `${violation.employeeName} attempted to clock ${violation.action} ${Math.round(violation.distanceMeters)}m away from ${violation.siteName}`,
    workspaceId: violation.workspaceId,
    metadata: {
      severity: 'high',
      violationType: 'gps_fraud_attempt',
      employeeId: violation.employeeId,
      shiftId: violation.shiftId,
      distance: violation.distanceMeters,
      attemptedLocation: violation.attemptedLocation,
      correctLocation: violation.correctLocation,
    },
  });
}

async function notifyManager(workspaceId: string, employeeId: string, message: string): Promise<void> {
  const employee = await db.query.employees.findFirst({
    where: and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)),
  });

  if (!(employee as any)?.supervisorId) {
    log.info('[GPS] No supervisor assigned for GPS violation notification');
    return;
  }

  await universalNotificationEngine.sendNotification({
    workspaceId,
    userId: (employee as any).supervisorId,
    idempotencyKey: `notif:gps_violation:${employeeId}:detected`,
          type: 'issue_detected',
    title: `GPS Location Violation Detected`,
    message: `Employee location verification failed. ${message}`,
    severity: 'warning',
    metadata: { 
      employeeId, 
      timestamp: new Date().toISOString(),
      violationType: 'gps_violation',
      source: 'gps_geofence_service',
    },
  });
}

export async function validateClockIn(
  workspaceId: string,
  employeeId: string,
  location: GPSLocation,
  accuracyMeters?: number
): Promise<GeofenceValidationResult> {
  if (accuracyMeters !== undefined && accuracyMeters > GPS_ACCURACY_REJECT_THRESHOLD) {
    return {
      allowed: false,
      reason: `GPS accuracy too low (${Math.round(accuracyMeters)}m). Please move to an area with better GPS signal and try again.`,
      violationType: 'low_accuracy',
      location,
    };
  }

  const currentShift = await getCurrentShift(employeeId, workspaceId);

  if (!currentShift) {
    return {
      allowed: false,
      reason: 'No shift scheduled for this time',
      violationType: 'no_shift',
    };
  }

  const clientId = currentShift.clientId || (currentShift as any).siteId;
  if (!clientId) {
    return {
      allowed: true,
      reason: 'No site assigned to shift - allowing clock-in',
      location,
    };
  }

  const site = await getSiteLocation(clientId, workspaceId);

  if (!site) {
    return {
      allowed: true,
      reason: 'Site location not configured - allowing clock-in',
      location,
    };
  }

  const geofenceRadius = site.geofenceRadiusMeters;
  const distanceMeters = calculateDistance(location, { latitude: site.latitude, longitude: site.longitude });

  if (distanceMeters > geofenceRadius) {
    const employee = await db.query.employees.findFirst({
      where: and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)),
    });

    const violation: GPSViolation = {
      employeeId,
      employeeName: employee ? `${employee.firstName} ${employee.lastName}` : 'Unknown',
      shiftId: currentShift.id,
      siteId: clientId,
      siteName: site.name,
      attemptedLocation: location,
      correctLocation: { latitude: site.latitude, longitude: site.longitude },
      distanceMeters,
      timestamp: new Date(),
      workspaceId,
      action: 'clock_in',
    };

    // GAP-L3-GEO: Ensure scheduling_audit_log is written BEFORE mutation completes.
    try {
      const { typedPoolExec } = await import('../lib/typedSql');
      await typedPoolExec(
        `INSERT INTO scheduling_audit_log (workspace_id, shift_id, action, performed_by, details, created_at)
         VALUES ($1, $2, 'gps_violation', $3, $4, NOW())`,
        [workspaceId, currentShift.id, employeeId, JSON.stringify({
          action: 'clock_in',
          distance: distanceMeters,
          radius: geofenceRadius,
          location,
          site: site.name
        })]
      );
    } catch (auditErr: any) {
      log.warn('[GPS] Failed to write scheduling audit log:', auditErr.message);
    }

    await logGPSViolation(violation);

    await notifyManager(
      workspaceId,
      employeeId,
      `${violation.employeeName} attempted to clock in ${Math.round(distanceMeters)}m away from ${site.name}`
    );

    return {
      allowed: false,
      reason: `You must be within ${geofenceRadius}m of ${site.name} to clock in. You are ${Math.round(distanceMeters)}m away.`,
      distanceMeters,
      violationType: 'too_far',
    };
  }

  const result: GeofenceValidationResult = {
    allowed: true,
    reason: 'Location verified',
    location,
    siteVerified: site.name,
    distanceMeters,
  };

  if (accuracyMeters !== undefined && accuracyMeters > GPS_ACCURACY_WARN_THRESHOLD) {
    result.accuracyWarning = `GPS accuracy is ${Math.round(accuracyMeters)}m. Location verified but accuracy is moderate.`;
  }

  return result;
}

export async function validateClockOut(
  workspaceId: string,
  employeeId: string,
  location: GPSLocation,
  accuracyMeters?: number
): Promise<GeofenceValidationResult> {
  const result = await validateClockIn(workspaceId, employeeId, location, accuracyMeters);
  
  if (!result.allowed && result.violationType === 'too_far') {
    result.reason = result.reason.replace('clock in', 'clock out');
    
    const employee = await db.query.employees.findFirst({
      where: and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)),
    });

    if (employee) {
      const currentShift = await getCurrentShift(employeeId, workspaceId);
      if (currentShift) {
        const clientId = currentShift.clientId || (currentShift as any).siteId;
        const site = await getSiteLocation(clientId, workspaceId);
        
        if (site && result.distanceMeters) {
          await logGPSViolation({
            employeeId,
            employeeName: `${employee.firstName} ${employee.lastName}`,
            shiftId: currentShift.id,
            siteId: clientId,
            siteName: site.name,
            attemptedLocation: location,
            correctLocation: { latitude: site.latitude, longitude: site.longitude },
            distanceMeters: result.distanceMeters,
            timestamp: new Date(),
            workspaceId,
            action: 'clock_out',
          });
        }
      }
    }
  }

  return result;
}

export async function recordBreadcrumb(
  workspaceId: string,
  employeeId: string,
  timeEntryId: string,
  location: GPSLocation,
  accuracyMeters?: number
): Promise<{ id: string }> {
  const [record] = await db.insert(gpsLocations).values({
    workspaceId,
    employeeId,
    timeEntryId,
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: accuracyMeters?.toString() ?? null,
    timestamp: new Date(),
  }).returning({ id: gpsLocations.id });

  return record;
}

export async function getShiftBreadcrumbs(
  workspaceId: string,
  timeEntryId: string
): Promise<Array<{
  id: string;
  latitude: number;
  longitude: number;
  accuracy: string | null;
  timestamp: Date;
}>> {
  const breadcrumbs = await db
    .select({
      id: gpsLocations.id,
      latitude: gpsLocations.latitude,
      longitude: gpsLocations.longitude,
      accuracy: gpsLocations.accuracy,
      timestamp: gpsLocations.timestamp,
    })
    .from(gpsLocations)
    .where(
      and(
        eq(gpsLocations.workspaceId, workspaceId),
        eq(gpsLocations.timeEntryId, timeEntryId)
      )
    )
    .orderBy(gpsLocations.timestamp);

  return breadcrumbs;
}

export async function getGPSViolations(workspaceId: string, days: number = 7): Promise<number> {
  return 0;
}

export async function isGPSValidationEnabled(workspaceId: string): Promise<boolean> {
  return true;
}

export const gpsGeofenceService = {
  validateClockIn,
  validateClockOut,
  calculateDistance,
  getGPSViolations,
  isGPSValidationEnabled,
  recordBreadcrumb,
  getShiftBreadcrumbs,
};
