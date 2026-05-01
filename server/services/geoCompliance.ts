/**
 * GEO-COMPLIANCE & AUDIT TRAIL SERVICE (Monopolistic Feature #3)
 * Real-time GPS/IP tracking with 50m accuracy requirement
 * Detects discrepancies when clock-in/out is >250m from job site
 */

import { db } from "../db";
import { eq, and } from "drizzle-orm";
import {
  timeEntryDiscrepancies,
  auditLogs,
  shifts,
  clients,
} from "../../shared/schema";

export class GeoComplianceService {
  /**
   * Calculate distance between two GPS coordinates using Haversine formula
   * Returns distance in meters
   */
  static calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = R * c; // Distance in meters
    return distance;
  }

  /**
   * Detect geo-compliance discrepancies for a time entry
   * Flags entries where clock-in/out is >250m from job site
   */
  static async detectDiscrepancies(
    timeEntryId: string,
    workspaceId: string,
    clockInGps: { lat: number; lng: number } | null,
    clockOutGps: { lat: number; lng: number } | null,
    shiftId?: string | null
  ): Promise<{
    clockInDiscrepancy: boolean;
    clockOutDiscrepancy: boolean;
    clockInDistance: number | null;
    clockOutDistance: number | null;
  }> {
    let clockInDiscrepancy = false;
    let clockOutDiscrepancy = false;
    let clockInDistance: number | null = null;
    let clockOutDistance: number | null = null;

    // Only check if there's a shift (which has a job site location)
    if (!shiftId) {
      return {
        clockInDiscrepancy,
        clockOutDiscrepancy,
        clockInDistance,
        clockOutDistance,
      };
    }

    // Get shift details including client/job site location
    const shift = await db
      .select()
      .from(shifts)
      .where(and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId)))
      .limit(1);

    if (!shift[0] || !shift[0].clientId) {
      return {
        clockInDiscrepancy,
        clockOutDiscrepancy,
        clockInDistance,
        clockOutDistance,
      };
    }

    // Get client/job site location
    const client = await db
      .select()
      .from(clients)
      .where(eq(clients.id, shift[0].clientId))
      .limit(1);

    // If client doesn't have location data, we can't validate
    if (!client[0] || !client[0].latitude || !client[0].longitude) {
      return {
        clockInDiscrepancy,
        clockOutDiscrepancy,
        clockInDistance,
        clockOutDistance,
      };
    }

    const jobSiteLat = parseFloat(client[0].latitude.toString());
    const jobSiteLng = parseFloat(client[0].longitude.toString());

    // Check clock-in distance
    if (clockInGps) {
      clockInDistance = this.calculateDistance(
        clockInGps.lat,
        clockInGps.lng,
        jobSiteLat,
        jobSiteLng
      );

      // Flag if >250m from job site
      if (clockInDistance > 250) {
        clockInDiscrepancy = true;
        
        // Create discrepancy record
        await this.createDiscrepancy(
          timeEntryId,
          workspaceId,
          shift[0].employeeId, // Pass employeeId from shift
          'clock_in_location',
          {
            description: `Clock-in location is ${clockInDistance.toFixed(0)}m from job site (max allowed: 250m)`,
            distanceMeters: clockInDistance,
            jobSiteLocation: { lat: jobSiteLat, lng: jobSiteLng },
            clockInLocation: clockInGps,
            maxAllowedDistance: 250,
          }
        );
      }
    }

    // Check clock-out distance
    if (clockOutGps) {
      clockOutDistance = this.calculateDistance(
        clockOutGps.lat,
        clockOutGps.lng,
        jobSiteLat,
        jobSiteLng
      );

      // Flag if >250m from job site
      if (clockOutDistance > 250) {
        clockOutDiscrepancy = true;
        
        // Create discrepancy record
        await this.createDiscrepancy(
          timeEntryId,
          workspaceId,
          shift[0].employeeId, // Pass employeeId from shift
          'clock_out_location',
          {
            description: `Clock-out location is ${clockOutDistance.toFixed(0)}m from job site (max allowed: 250m)`,
            distanceMeters: clockOutDistance,
            jobSiteLocation: { lat: jobSiteLat, lng: jobSiteLng },
            clockOutLocation: clockOutGps,
            maxAllowedDistance: 250,
          }
        );
      }
    }

    return {
      clockInDiscrepancy,
      clockOutDiscrepancy,
      clockInDistance,
      clockOutDistance,
    };
  }

  /**
   * Create a geo-compliance discrepancy record
   */
  private static async createDiscrepancy(
    timeEntryId: string,
    workspaceId: string,
    employeeId: string,
    discrepancyType: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await db.insert(timeEntryDiscrepancies).values({
      workspaceId,
      timeEntryId,
      employeeId,
      discrepancyType,
      severity: 'medium', // Default to medium, can be escalated by manager
      status: 'open',
      expectedLocation: metadata.jobSiteLocation || null,
      actualLocation: metadata.clockInLocation || metadata.clockOutLocation || null,
      distanceMeters: metadata.distanceMeters?.toString() || null,
    });
  }

  /**
   * Create audit trail entry for compliance logging
   */
  static async logAuditTrail(
    workspaceId: string,
    userId: string,
    userName: string,
    userRole: string,
    action: string,
    entityType: string,
    entityId: string,
    entityDescription: string,
    changesBefore: Record<string, any> | null,
    changesAfter: Record<string, any> | null,
    ipAddress?: string
  ): Promise<void> {
    // Calculate field-level changes
    const fieldChanges: Record<string, unknown> = {};
    if (changesBefore && changesAfter) {
      Object.keys(changesAfter).forEach(key => {
        if (changesBefore[key] !== changesAfter[key]) {
          fieldChanges[key] = {
            before: changesBefore[key],
            after: changesAfter[key],
          };
        }
      });
    }

    await db.insert(auditLogs).values({
      workspaceId,
      userId,
      userName,
      userRole,
      rawAction: action,
      entityType,
      entityId,
      entityDescription,
      changesBefore,
      changesAfter,
      fieldChanges,
      ipAddress,
      userAgent: 'CoAIleague™ API',
    });
  }

  /**
   * Validate GPS accuracy meets compliance requirements (<=50m)
   */
  static validateGPSAccuracy(accuracy: number): {
    valid: boolean;
    message: string;
  } {
    const MAX_ACCURACY = 50; // 50 meters required for compliance
    
    if (accuracy <= MAX_ACCURACY) {
      return {
        valid: true,
        message: 'GPS accuracy meets compliance requirements',
      };
    }

    return {
      valid: false,
      message: `GPS accuracy of ${accuracy}m exceeds maximum allowed ${MAX_ACCURACY}m. Please move to an area with better signal.`,
    };
  }

  /**
   * Detect IP address changes between clock-in and clock-out
   * Can indicate potential buddy punching or location spoofing
   */
  static async detectIPAnomaly(
    timeEntryId: string,
    workspaceId: string,
    employeeId: string,
    clockInIp: string,
    clockOutIp: string
  ): Promise<boolean> {
    // Simple check: if IPs are different, flag for review
    if (clockInIp !== clockOutIp) {
      await this.createDiscrepancy(
        timeEntryId,
        workspaceId,
        employeeId,
        'ip_mismatch',
        {
          description: `Clock-in IP (${clockInIp}) differs from clock-out IP (${clockOutIp})`,
          clockInIp,
          clockOutIp,
          possibleReason: 'Network change, VPN, or location spoofing',
        }
      );
      return true;
    }

    return false;
  }

  /**
   * Get compliance summary for a workspace
   */
  static async getComplianceSummary(workspaceId: string): Promise<{
    totalDiscrepancies: number;
    openDiscrepancies: number;
    resolvedDiscrepancies: number;
    highSeverityCount: number;
    discrepanciesByType: Record<string, number>;
  }> {
    const allDiscrepancies = await db
      .select()
      .from(timeEntryDiscrepancies)
      .where(eq(timeEntryDiscrepancies.workspaceId, workspaceId));

    const summary = {
      totalDiscrepancies: allDiscrepancies.length,
      openDiscrepancies: allDiscrepancies.filter(d => d.status === 'open').length,
      resolvedDiscrepancies: allDiscrepancies.filter(d => d.status === 'resolved').length,
      highSeverityCount: allDiscrepancies.filter(d => d.severity === 'high').length,
      discrepanciesByType: {} as Record<string, number>,
    };

    // Count by type
    allDiscrepancies.forEach(d => {
      const type = d.discrepancyType || 'unknown';
      summary.discrepanciesByType[type] = (summary.discrepanciesByType[type] || 0) + 1;
    });

    return summary;
  }
}
