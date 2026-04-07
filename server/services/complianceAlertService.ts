/**
 * Compliance Alert Service
 * Monitors expiring certifications and alerts HR before they expire
 */

import { db } from '../db';
import { employeeSkills, employees, users, shifts } from '@shared/schema';
import { eq, and, lt, isNotNull, gte, gt } from 'drizzle-orm';
import { createNotification } from './notificationService';
import { addDays } from 'date-fns';
import { createLogger } from '../lib/logger';
const log = createLogger('complianceAlertService');


const DAYS_BEFORE_EXPIRY = 30; // Alert 30 days before expiration

/**
 * Check for expiring employee certifications and alert HR
 */
export async function checkExpiringCertifications() {
  log.info('[ComplianceAlerts] Starting expiration check...');

  try {
    const thirtyDaysFromNow = addDays(new Date(), DAYS_BEFORE_EXPIRY);

    // Find expiring employee skill certifications
    const expiringSkills = await db
      .select()
      .from(employeeSkills)
      .where(
        and(
          isNotNull(employeeSkills.expiresAt),
          lt(employeeSkills.expiresAt, thirtyDaysFromNow),
          gte(employeeSkills.expiresAt, new Date()) // Still in future (not already expired)
        )
      );

    log.info(`[ComplianceAlerts] Found ${expiringSkills.length} expiring employee certifications`);

    // Note: Notifications for expiring certs are handled exclusively by
    // runCertificationExpiryCheck (notificationEventCoverage.ts) which fires at
    // 30/14/7-day milestones only — preventing daily notification spam for the
    // same cert. This function serves as a compliance data monitor only.

    // Note: Contractor certifications don't have built-in expiry tracking
    // They're tracked via employeeSkills for now
    const expiringContractorCerts: any[] = [];

    log.info(`[ComplianceAlerts] Found ${expiringContractorCerts.length} expiring contractor certifications`);

    return {
      success: true,
      employeeSkillsChecked: expiringSkills.length,
      contractorCertsChecked: expiringContractorCerts.length,
      timestamp: new Date(),
    };
  } catch (error) {
    log.error('[ComplianceAlerts] Error checking expiring certifications:', error);
    throw error;
  }
}

/**
 * Get compliance summary for a workspace
 */
export async function getComplianceSummary(workspaceId: string) {
  try {
    const thirtyDaysFromNow = addDays(new Date(), DAYS_BEFORE_EXPIRY);
    const today = new Date();

    // Expiring (within 30 days)
    const expiringCount = await db
      .select()
      .from(employeeSkills)
      .innerJoin(employees, eq(employeeSkills.employeeId, employees.id))
      .where(
        and(
          eq(employees.workspaceId, workspaceId),
          isNotNull(employeeSkills.expiresAt),
          lt(employeeSkills.expiresAt, thirtyDaysFromNow),
          gte(employeeSkills.expiresAt, today)
        )
      )
      .then(results => results.length);

    // Already expired
    const expiredCount = await db
      .select()
      .from(employeeSkills)
      .innerJoin(employees, eq(employeeSkills.employeeId, employees.id))
      .where(
        and(
          eq(employees.workspaceId, workspaceId),
          isNotNull(employeeSkills.expiresAt),
          lt(employeeSkills.expiresAt, today)
        )
      )
      .then(results => results.length);

    return {
      workspaceId,
      expiringIn30Days: expiringCount,
      alreadyExpired: expiredCount,
      complianceStatus: expiredCount > 0 ? 'at_risk' : expiringCount > 0 ? 'warning' : 'compliant',
    };
  } catch (error) {
    log.error('[ComplianceAlerts] Error getting compliance summary:', error);
    throw error;
  }
}

/**
 * Proactive shift-license conflict scan
 * Cross-references all future assigned shifts against officer certification expiry dates.
 * Fires if a scheduled officer's license will expire BEFORE their scheduled shift date.
 * Runs daily at 8 AM alongside checkExpiringCertifications.
 */
export async function scanShiftLicenseConflicts(): Promise<{ conflictsFound: number }> {
  log.info('[ComplianceAlerts] Starting shift-license conflict scan...');
  let conflictsFound = 0;

  try {
    const now = new Date();

    const futureAssignedShifts = await db
      .select({
        shiftId: shifts.id,
        workspaceId: shifts.workspaceId,
        employeeId: shifts.employeeId,
        startTime: shifts.startTime,
      })
      .from(shifts)
      .where(
        and(
          gt(shifts.startTime, now),
          isNotNull(shifts.employeeId)
        )
      );

    log.info(`[ComplianceAlerts] Scanning ${futureAssignedShifts.length} future assigned shifts for license conflicts`);

    for (const shift of futureAssignedShifts) {
      if (!shift.employeeId) continue;

      const expiringBeforeShift = await db
        .select()
        .from(employeeSkills)
        .where(
          and(
            eq(employeeSkills.employeeId, shift.employeeId),
            isNotNull(employeeSkills.expiresAt),
            gt(employeeSkills.expiresAt, now),
            lt(employeeSkills.expiresAt, shift.startTime)
          )
        );

      if (expiringBeforeShift.length === 0) continue;

      const employee = await db.query.employees.findFirst({
        where: eq(employees.id, shift.employeeId),
      });

      if (!employee || !employee.isActive) continue;

      for (const skill of expiringBeforeShift) {
        conflictsFound++;
        log.warn(`[ComplianceAlerts] SHIFT-LICENSE CONFLICT: Employee ${shift.employeeId} has "${skill.skillName || skill.skillCategory}" expiring ${skill.expiresAt?.toISOString()} before shift ${shift.shiftId} on ${shift.startTime.toISOString()}`);

        await createNotification({
          workspaceId: shift.workspaceId,
          userId: employee.userId || '',
          type: 'compliance_alert',
          title: 'License Expires Before Scheduled Shift',
          message: `Officer ${employee.firstName} ${employee.lastName} has "${skill.skillName || skill.skillCategory || 'a required certification'}" expiring on ${skill.expiresAt?.toLocaleDateString()} — before their scheduled shift on ${shift.startTime.toLocaleDateString()}. Reassignment or renewal required.`,
          metadata: {
            shiftId: shift.shiftId,
            employeeId: shift.employeeId,
            certificationName: skill.skillName || skill.skillCategory,
            expiresAt: skill.expiresAt,
            shiftDate: shift.startTime,
          },
        }).catch(err => log.error(`[ComplianceAlerts] Notification error for shift-license conflict:`, err));
      }
    }

    log.info(`[ComplianceAlerts] Shift-license conflict scan complete. ${conflictsFound} conflicts found.`);
    return { conflictsFound };
  } catch (error) {
    log.error('[ComplianceAlerts] Error in shift-license conflict scan:', error);
    return { conflictsFound: 0 };
  }
}

/**
 * Trigger an immediate license expired alert without waiting for the 8 AM cron sweep.
 * Call this whenever a license is confirmed expired in real time (e.g., revocation, data import).
 */
export async function triggerImmediateExpiredLicenseAlert(params: {
  workspaceId: string;
  employeeId: string;
  certificationId: string;
  certificationName: string;
  licenseNumber?: string | null;
  licenseType?: string | null;
}): Promise<{ notified: boolean }> {
  const { notifyCertificationExpiring } = await import('./automation/notificationEventCoverage');
  try {
    await notifyCertificationExpiring({
      workspaceId: params.workspaceId,
      employeeId: params.employeeId,
      certificationName: params.certificationName,
      expiresAt: new Date(), // already expired
      licenseNumber: params.licenseNumber ?? null,
      licenseType: params.licenseType ?? null,
      renewalLink: 'https://tcole.texas.gov',
      isExpired: true,
    });
    log.info(`[ComplianceAlerts] Immediate expired alert sent for employee ${params.employeeId}, cert ${params.certificationId}`);
    return { notified: true };
  } catch (error) {
    log.error('[ComplianceAlerts] triggerImmediateExpiredLicenseAlert failed:', error);
    return { notified: false };
  }
}
