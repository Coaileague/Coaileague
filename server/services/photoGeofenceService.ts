/**
 * PHOTO GEOFENCE SERVICE - Location-Verified Photo Submissions
 * =============================================================
 * Ensures employees can only submit on-site photos (clock-in proofs,
 * task completion, incident reports) when within geofence range.
 * 
 * Integration with GPS Geofence Service for distance calculation.
 */

import { db } from '../db';
import { shifts, clients, employees, timeEntries } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { calculateDistance, GPSLocation } from './gpsGeofenceService';
import { platformEventBus } from './platformEventBus';
import { createLogger } from '../lib/logger';
const log = createLogger('photoGeofenceService');


export interface PhotoSubmissionRequest {
  workspaceId: string;
  employeeId: string;
  shiftId?: string;
  location: GPSLocation;
  photoType: 'clock_in' | 'clock_out' | 'site_check' | 'incident' | 'task_completion';
  photoData?: string;
}

export interface PhotoValidationResult {
  allowed: boolean;
  reason: string;
  distanceMeters?: number;
  siteVerified?: string;
  withinRange: boolean;
  maxRangeMeters: number;
}

const PHOTO_GEOFENCE_RADIUS_METERS = 150;

class PhotoGeofenceService {
  private static instance: PhotoGeofenceService;

  private constructor() {}

  static getInstance(): PhotoGeofenceService {
    if (!this.instance) {
      this.instance = new PhotoGeofenceService();
    }
    return this.instance;
  }

  async validatePhotoSubmission(request: PhotoSubmissionRequest): Promise<PhotoValidationResult> {
    try {
      let siteLocation: GPSLocation | null = null;
      let siteName = 'Unknown Site';

      if (request.shiftId) {
        const shift = await db.query.shifts.findFirst({
          where: eq(shifts.id, request.shiftId),
        });

        if (shift?.clientId) {
          const client = await db.query.clients.findFirst({
            where: eq(clients.id, shift.clientId),
          });

          if (client) {
            const lat = (client as any).latitude || (client as any).siteLatitude;
            const lon = (client as any).longitude || (client as any).siteLongitude;
            
            if (lat && lon) {
              siteLocation = {
                latitude: parseFloat(lat),
                longitude: parseFloat(lon),
              };
              siteName = client.companyName || `${client.firstName} ${client.lastName}` || 'Client Site';
            }
          }
        }
      }

      if (!siteLocation) {
        const now = new Date();
        const today = now.toISOString().split('T')[0];

        const activeShift = await db.query.shifts.findFirst({
          where: and(
            eq(shifts.employeeId, request.employeeId),
            eq(shifts.workspaceId, request.workspaceId),
            eq(shifts.date, today)
          ),
        });

        if (activeShift?.clientId) {
          const client = await db.query.clients.findFirst({
            where: eq(clients.id, activeShift.clientId),
          });

          if (client) {
            const lat = (client as any).latitude || (client as any).siteLatitude;
            const lon = (client as any).longitude || (client as any).siteLongitude;
            
            if (lat && lon) {
              siteLocation = {
                latitude: parseFloat(lat),
                longitude: parseFloat(lon),
              };
              siteName = client.companyName || `${client.firstName} ${client.lastName}` || 'Client Site';
            }
          }
        }
      }

      if (!siteLocation) {
        log.info(`[PhotoGeofence] No site location found for validation`);
        return {
          allowed: true,
          reason: 'No site location configured - photo submission allowed',
          withinRange: true,
          maxRangeMeters: PHOTO_GEOFENCE_RADIUS_METERS,
        };
      }

      const distanceMeters = calculateDistance(request.location, siteLocation);
      const withinRange = distanceMeters <= PHOTO_GEOFENCE_RADIUS_METERS;

      if (!withinRange) {
        log.info(`[PhotoGeofence] VIOLATION: Employee ${request.employeeId} attempted photo at ${Math.round(distanceMeters)}m from ${siteName}`);

        await platformEventBus.publish({
          type: 'photo_geofence_violation',
          category: 'security',
          title: 'Photo Submission Outside Geofence',
          description: `Employee attempted to submit ${request.photoType} photo ${Math.round(distanceMeters)}m from ${siteName}`,
          workspaceId: request.workspaceId,
          metadata: {
            employeeId: request.employeeId,
            shiftId: request.shiftId,
            photoType: request.photoType,
            distance: distanceMeters,
            maxAllowed: PHOTO_GEOFENCE_RADIUS_METERS,
            attemptedLocation: request.location,
            siteLocation,
          },
        });

        return {
          allowed: false,
          reason: `You must be within ${PHOTO_GEOFENCE_RADIUS_METERS}m of the work site to submit photos. Current distance: ${Math.round(distanceMeters)}m`,
          distanceMeters,
          siteVerified: siteName,
          withinRange: false,
          maxRangeMeters: PHOTO_GEOFENCE_RADIUS_METERS,
        };
      }

      return {
        allowed: true,
        reason: 'Location verified',
        distanceMeters,
        siteVerified: siteName,
        withinRange: true,
        maxRangeMeters: PHOTO_GEOFENCE_RADIUS_METERS,
      };

    } catch (error) {
      log.error('[PhotoGeofence] Validation error:', error);
      return {
        allowed: true,
        reason: 'Validation error - allowing submission',
        withinRange: true,
        maxRangeMeters: PHOTO_GEOFENCE_RADIUS_METERS,
      };
    }
  }

  async submitPhotoWithValidation(request: PhotoSubmissionRequest): Promise<{
    success: boolean;
    validation: PhotoValidationResult;
    photoId?: string;
    message: string;
  }> {
    const validation = await this.validatePhotoSubmission(request);

    if (!validation.allowed) {
      return {
        success: false,
        validation,
        message: validation.reason,
      };
    }

    const photoId = `photo_${Date.now()}_${crypto.randomUUID().slice(0, 9)}`;

    log.info(`[PhotoGeofence] Photo submitted: ${photoId} (${request.photoType}) at ${validation.siteVerified}`);

    return {
      success: true,
      validation,
      photoId,
      message: `Photo submitted successfully at ${validation.siteVerified}`,
    };
  }
}

export const photoGeofenceService = PhotoGeofenceService.getInstance();
