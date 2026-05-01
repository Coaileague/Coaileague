/**
 * Canonical Officer Status Service
 * Single source of truth for officer field state across CAD, RMS, and Schedule.
 * All systems call this one function instead of querying 3 different tables.
 */

import { db, pool } from '../db';
import { sql, eq, and, desc } from 'drizzle-orm';
import { typedPool, typedPoolExec } from '../lib/typedSql';
import { cadUnits } from '@shared/schema';
import { createLogger } from '../lib/logger';
const log = createLogger('officerStatusService');


export interface OfficerStatus {
  employeeId: string;
  workspaceId: string;
  employeeName: string;
  scheduled: boolean;
  shiftId: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  siteId: string | null;
  siteName: string | null;
  siteAddress: string | null;
  clockedIn: boolean;
  clockInTime: string | null;
  gpsOnSite: boolean | null;
  lastGpsPingAt: string | null;
  lastGpsLat: number | null;
  lastGpsLng: number | null;
  cadUnitId: string | null;
  cadUnitIdentifier: string | null;
  cadUnitStatus: string | null;
  geofenceDeparted: boolean;
  departedAt: string | null;
  overallStatus: 'scheduled_not_in' | 'active_on_site' | 'geofence_departed' | 'clocked_out' | 'unscheduled';
}

export async function getOfficerCurrentStatus(employeeId: string, workspaceId: string): Promise<OfficerStatus | null> {
  try {
    const { employees, shifts, sites, timeEntries, cadUnits, geofenceDepartureLog } = await import('@shared/schema');
    const { and, eq, lte, gte, ne, isNull, sql: drizzleSql } = await import('drizzle-orm');

    // Converted to Drizzle ORM: getOfficerCurrentStatus → LEFT JOINs + INTERVAL
    const result = await db
      .select({
        employeeId: employees.id,
        workspaceId: employees.workspaceId,
        employeeName: drizzleSql<string>`COALESCE(${employees.firstName} || ' ' || ${employees.lastName}, ${employees.firstName}, ${employees.lastName}, 'Unknown')`,
        shiftId: shifts.id,
        shiftStart: shifts.startTime,
        shiftEnd: shifts.endTime,
        siteId: shifts.siteId,
        siteName: (shifts as any).siteName,
        siteAddress: sites.addressLine1,
        timeEntryId: timeEntries.id,
        clockIn: timeEntries.clockIn,
        clockOut: timeEntries.clockOut,
        gpsOnSite: drizzleSql<boolean>`(${timeEntries.gpsVerificationStatus} = 'verified')`,
        lastGpsPingAt: timeEntries.lastGpsPingAt,
        lastGpsPingLat: timeEntries.lastGpsPingLat,
        lastGpsPingLng: timeEntries.lastGpsPingLng,
        cadUnitId: cadUnits.id,
        cadUnitIdentifier: cadUnits.unitIdentifier,
        cadUnitStatus: cadUnits.currentStatus,
        departureLogId: geofenceDepartureLog.id,
        departedAt: geofenceDepartureLog.departedAt,
      })
      .from(employees)
      .leftJoin(shifts, and(
        eq(shifts.assignedEmployeeId, employees.id),
        eq(shifts.workspaceId, employees.workspaceId),
        lte(shifts.startTime, drizzleSql`NOW() + INTERVAL '30 minutes'`),
        gte(shifts.endTime, drizzleSql`NOW() - INTERVAL '30 minutes'`),
        ne(shifts.status, 'cancelled'),
      ))
      .leftJoin(sites, and(eq(sites.id, shifts.siteId), eq(sites.workspaceId, employees.workspaceId)))
      .leftJoin(timeEntries, and(
        eq(timeEntries.employeeId, employees.id),
        eq(timeEntries.workspaceId, employees.workspaceId),
        gte(timeEntries.clockIn, drizzleSql`NOW() - INTERVAL '14 hours'`),
        isNull(timeEntries.clockOut),
      ))
      .leftJoin(cadUnits, and(
        eq(cadUnits.employeeId, drizzleSql`${employees.id}::text`),
        eq(cadUnits.workspaceId, employees.workspaceId),
      ))
      .leftJoin(geofenceDepartureLog, and(
        eq(geofenceDepartureLog.employeeId, drizzleSql`${employees.id}::text`),
        eq(geofenceDepartureLog.workspaceId, employees.workspaceId),
        isNull(geofenceDepartureLog.returnedAt),
        gte(geofenceDepartureLog.departedAt, drizzleSql`NOW() - INTERVAL '4 hours'`),
      ))
      .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)))
      .limit(1);

    if (!result.length) return null;
    const row = result[0];

    const scheduled = !!row.shiftId;
    const clockedIn = !!row.timeEntryId && !row.clockOut;
    const geofenceDeparted = !!row.departureLogId;

    let overallStatus: OfficerStatus['overallStatus'];
    if (clockedIn && !geofenceDeparted) overallStatus = 'active_on_site';
    else if (geofenceDeparted) overallStatus = 'geofence_departed';
    else if (scheduled && !clockedIn) overallStatus = 'scheduled_not_in';
    else if (!scheduled && !clockedIn) overallStatus = 'unscheduled';
    else overallStatus = 'clocked_out';

    return {
      employeeId: row.employeeId?.toString(),
      workspaceId: row.workspaceId,
      employeeName: row.employeeName,
      scheduled,
      shiftId: row.shiftId || null,
      shiftStart: row.shiftStart ? new Date(row.shiftStart).toISOString() : null,
      shiftEnd: row.shiftEnd ? new Date(row.shiftEnd).toISOString() : null,
      siteId: row.siteId || null,
      siteName: row.siteName || null,
      siteAddress: row.siteAddress || null,
      clockedIn,
      clockInTime: row.clockIn ? new Date(row.clockIn).toISOString() : null,
      gpsOnSite: row.gpsOnSite ?? null,
      lastGpsPingAt: row.lastGpsPingAt ? new Date(row.lastGpsPingAt).toISOString() : null,
      lastGpsLat: row.lastGpsPingLat ? parseFloat(row.lastGpsPingLat) : null,
      lastGpsLng: row.lastGpsPingLng ? parseFloat(row.lastGpsPingLng) : null,
      cadUnitId: row.cadUnitId || null,
      cadUnitIdentifier: row.cadUnitIdentifier || null,
      cadUnitStatus: row.cadUnitStatus || null,
      geofenceDeparted,
      departedAt: row.departedAt ? new Date(row.departedAt).toISOString() : null,
      overallStatus,
    };
  } catch (e) {
    log.error('[OfficerStatusService] Error getting officer status:', e);
    return null;
  }
}

export async function getScheduledOfficersStatus(workspaceId: string): Promise<OfficerStatus[]> {
  try {
    const { employees, shifts, sites, timeEntries, cadUnits, geofenceDepartureLog } = await import('@shared/schema');
    const { and, eq, lte, gte, ne, isNull, isNotNull, asc, sql: drizzleSql } = await import('drizzle-orm');

    // Converted to Drizzle ORM: getScheduledOfficersStatus → JOIN + LEFT JOINs + INTERVAL
    const result = await db
      .select({
        employeeId: employees.id,
        workspaceId: employees.workspaceId,
        employeeName: drizzleSql<string>`COALESCE(${employees.firstName} || ' ' || ${employees.lastName}, ${employees.firstName}, 'Unknown')`,
        shiftId: shifts.id,
        shiftStart: shifts.startTime,
        shiftEnd: shifts.endTime,
        siteId: shifts.siteId,
        siteName: (shifts as any).siteName,
        siteAddress: sites.addressLine1,
        timeEntryId: timeEntries.id,
        clockIn: timeEntries.clockIn,
        clockOut: timeEntries.clockOut,
        gpsOnSite: drizzleSql<boolean>`(${timeEntries.gpsVerificationStatus} = 'verified')`,
        lastGpsPingAt: timeEntries.lastGpsPingAt,
        lastGpsPingLat: timeEntries.lastGpsPingLat,
        lastGpsPingLng: timeEntries.lastGpsPingLng,
        cadUnitId: cadUnits.id,
        cadUnitIdentifier: cadUnits.unitIdentifier,
        cadUnitStatus: cadUnits.currentStatus,
        departureLogId: geofenceDepartureLog.id,
        departedAt: geofenceDepartureLog.departedAt,
      })
      .from(shifts)
      .innerJoin(employees, and(
        eq(drizzleSql`${employees.id}::text`, drizzleSql`${(shifts as any).assignedEmployeeId}::text`),
        eq(employees.workspaceId, shifts.workspaceId),
      ))
      .leftJoin(sites, and(eq(sites.id, shifts.siteId), eq(sites.workspaceId, shifts.workspaceId)))
      .leftJoin(timeEntries, and(
        eq(timeEntries.employeeId, employees.id),
        eq(timeEntries.workspaceId, employees.workspaceId),
        gte(timeEntries.clockIn, drizzleSql`NOW() - INTERVAL '14 hours'`),
        isNull(timeEntries.clockOut),
      ))
      .leftJoin(cadUnits, and(
        eq(cadUnits.employeeId, drizzleSql`${employees.id}::text`),
        eq(cadUnits.workspaceId, employees.workspaceId),
      ))
      .leftJoin(geofenceDepartureLog, and(
        eq(geofenceDepartureLog.employeeId, drizzleSql`${employees.id}::text`),
        eq(geofenceDepartureLog.workspaceId, employees.workspaceId),
        isNull(geofenceDepartureLog.returnedAt),
        gte(geofenceDepartureLog.departedAt, drizzleSql`NOW() - INTERVAL '4 hours'`),
      ))
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        lte(shifts.startTime, drizzleSql`NOW() + INTERVAL '2 hours'`),
        gte(shifts.endTime, drizzleSql`NOW() - INTERVAL '2 hours'`),
        ne(shifts.status, 'cancelled'),
        isNotNull(shifts.assignedEmployeeId),
      ))
      .orderBy(asc(shifts.startTime))
      .limit(100);

    return result.map(row => {
      const scheduled = true;
      const clockedIn = !!row.timeEntryId && !row.clockOut;
      const geofenceDeparted = !!row.departureLogId;

      let overallStatus: OfficerStatus['overallStatus'];
      if (clockedIn && !geofenceDeparted) overallStatus = 'active_on_site';
      else if (geofenceDeparted) overallStatus = 'geofence_departed';
      else overallStatus = 'scheduled_not_in';

      return {
        employeeId: row.employeeId?.toString(),
        workspaceId: row.workspaceId,
        employeeName: row.employeeName,
        scheduled,
        shiftId: row.shiftId || null,
        shiftStart: row.shiftStart ? new Date(row.shiftStart).toISOString() : null,
        shiftEnd: row.shiftEnd ? new Date(row.shiftEnd).toISOString() : null,
        siteId: row.siteId || null,
        siteName: row.siteName || null,
        siteAddress: row.siteAddress || null,
        clockedIn,
        clockInTime: row.clockIn ? new Date(row.clockIn).toISOString() : null,
        gpsOnSite: row.gpsOnSite ?? null,
        lastGpsPingAt: row.lastGpsPingAt ? new Date(row.lastGpsPingAt).toISOString() : null,
        lastGpsLat: row.lastGpsPingLat ? parseFloat(row.lastGpsPingLat) : null,
        lastGpsLng: row.lastGpsPingLng ? parseFloat(row.lastGpsPingLng) : null,
        cadUnitId: row.cadUnitId || null,
        cadUnitIdentifier: row.cadUnitIdentifier || null,
        cadUnitStatus: row.cadUnitStatus || null,
        geofenceDeparted,
        departedAt: row.departedAt ? new Date(row.departedAt).toISOString() : null,
        overallStatus,
      };
    });
  } catch (e) {
    log.error('[OfficerStatusService] Error getting scheduled officers:', e);
    return [];
  }
}

export async function autoProvisionCADUnit(
  employeeId: string,
  employeeName: string,
  workspaceId: string,
  shiftId: string | null,
  siteId: string | null,
  siteName: string | null,
  latitude?: number,
  longitude?: number
): Promise<string | null> {
  try {
    const unitIdentifier = `AUTO-${employeeName.split(' ')[0]?.toUpperCase().slice(0, 6)}-${Date.now().toString(36).toUpperCase().slice(-4)}`;

    // Converted to Drizzle ORM: CASE WHEN → sql fragment
    const result = await db.insert(cadUnits).values({
      workspaceId,
      unitIdentifier,
      employeeId,
      employeeName,
      currentStatus: 'available',
      currentSiteId: siteId,
      currentSiteName: siteName,
      latitude: latitude ? String(latitude) : null,
      longitude: longitude ? String(longitude) : null,
      lastLocationUpdate: sql`now()`,
      shiftId,
      scheduledFrom: sql`now()`,
      autoProvisioned: true,
      updatedAt: sql`now()`
    }).onConflictDoUpdate({
      target: [cadUnits.workspaceId, cadUnits.unitIdentifier],
      set: {
        employeeId: employeeId,
        employeeName: employeeName,
        currentStatus: sql`case when ${cadUnits.currentStatus} = 'off_duty' then 'available' else ${cadUnits.currentStatus} end`,
        currentSiteId: siteId,
        currentSiteName: siteName,
        latitude: latitude ? String(latitude) : cadUnits.latitude,
        longitude: longitude ? String(longitude) : cadUnits.longitude,
        lastLocationUpdate: latitude ? sql`now()` : cadUnits.lastLocationUpdate,
        shiftId: shiftId,
        autoProvisioned: true,
        updatedAt: sql`now()`
      }
    }).returning({ id: cadUnits.id });

    return result[0]?.id || null;
  } catch (e) {
    log.error('[OfficerStatusService] Error auto-provisioning CAD unit:', e);
    return null;
  }
}
