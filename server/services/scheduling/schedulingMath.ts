/**
 * schedulingMath.ts — Decimal-backed scheduling duration helpers
 *
 * All shift hour calculations must flow through this module to prevent
 * floating-point drift in overtime, rest-period, and payroll calculations.
 * Internally uses the same Decimal-backed financialCalculator helpers used
 * throughout the billing layer.
 *
 * Intentional non-overlap with financialCalculator:
 *   financialCalculator → dollar amounts, rates, pay totals
 *   schedulingMath      → hour durations, shift lengths, rest gaps, projections
 */

import Decimal from 'decimal.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ─── Core helpers ───────────────────────────────────────────────────────────

/** Convert Date pair to hour duration string, e.g. "8.5" */
export function hoursBetween(start: Date | string, end: Date | string): string {
  const s = typeof start === 'string' ? new Date(start) : start;
  const e = typeof end === 'string' ? new Date(end) : end;
  const ms = e.getTime() - s.getTime();
  if (ms < 0) throw new Error('End must be after start');
  return new Decimal(ms).div(3_600_000).toFixed(10).replace(/\.?0+$/, '') || '0';
}

/** Sum two or more hour strings/numbers, returning a string */
export function addHours(...hours: Array<string | number>): string {
  return hours
    .reduce((acc, h) => acc.plus(new Decimal(String(h))), new Decimal(0))
    .toFixed(10)
    .replace(/\.?0+$/, '') || '0';
}

/** Subtract b from a (a - b), returning a string. Clamps to "0" if negative. */
export function subtractHours(a: string | number, b: string | number): string {
  const result = new Decimal(String(a)).minus(new Decimal(String(b)));
  return (result.lt(0) ? new Decimal(0) : result)
    .toFixed(10)
    .replace(/\.?0+$/, '') || '0';
}

/** Round to N decimal places (default 1), returning a number */
export function roundHours(hours: string | number, decimals = 1): number {
  return parseFloat(new Decimal(String(hours)).toFixed(decimals));
}

/** Returns true if hours > threshold */
export function isOverHours(hours: string | number, threshold: string | number): boolean {
  return new Decimal(String(hours)).gt(new Decimal(String(threshold)));
}

/** Overtime hours above a weekly threshold (default 40h) */
export function overtimeHours(
  weeklyHours: string | number,
  threshold: string | number = '40'
): string {
  const w = new Decimal(String(weeklyHours));
  const t = new Decimal(String(threshold));
  return w.gt(t) ? w.minus(t).toFixed(10).replace(/\.?0+$/, '') : '0';
}

/** Gap between two shifts in hours */
export function restGapHours(shiftEnd: Date | string, nextShiftStart: Date | string): string {
  return hoursBetween(shiftEnd, nextShiftStart);
}

/** Convert milliseconds to hours string */
export function msToHours(ms: number): string {
  return new Decimal(ms).div(3_600_000).toFixed(10).replace(/\.?0+$/, '') || '0';
}

// ─── Geospatial helpers ─────────────────────────────────────────────────────

const EARTH_RADIUS_M  = 6_371_000;
const EARTH_RADIUS_MI = 3_958.8;

/** Distance between two GPS coordinates in metres */
export function haversineMeters(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Distance between two GPS coordinates in miles */
export function haversineMiles(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  return haversineMeters(lat1, lon1, lat2, lon2) / 1609.344;
}

/** Distance in km */
export function haversineKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  return haversineMeters(lat1, lon1, lat2, lon2) / 1000;
}

// ─── GPS / Proof-of-Service audit note ──────────────────────────────────────
// As of Phase C audit:
//   - time-entry-routes.ts clock-in: workspace_id checked via requireAuth + workspaceId guard ✅
//   - geofence routes in safetyRoutes/cadRoutes: requireAuth + ensureWorkspaceAccess ✅
//   - haversine duplicated in 5 files — canonical version now in schedulingMath.ts
//   - TODO (UI polish phase): migrate shiftRoutes.ts, time-entry-routes.ts,
//     trinityEmergencyStaffingActions.ts, trinityIntelligenceLayers.ts,
//     shiftRoomBotOrchestrator.ts to import from schedulingMath.haversineMeters
//   - GPS pings via /gps-ping are workspace-scoped by requireAuth upstream ✅
//   - clock-in verifies employee assignment to shift before recording proof-of-service ✅
