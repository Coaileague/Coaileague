/**
 * Compliance Alert Service
 * Monitors expiring certifications and alerts HR before they expire
 */

import { db } from '../db';
import { employeeSkills, contractorCertifications, employees, users } from '@shared/schema';
import { eq, and, lt, isNotNull, gte } from 'drizzle-orm';
import { createNotification } from './notificationService';
import { addDays } from 'date-fns';

const DAYS_BEFORE_EXPIRY = 30; // Alert 30 days before expiration

/**
 * Check for expiring employee certifications and alert HR
 */
export async function checkExpiringCertifications() {
  console.log('[ComplianceAlerts] Starting expiration check...');

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

    console.log(`[ComplianceAlerts] Found ${expiringSkills.length} expiring employee certifications`);

    // Group by workspace and notify HR
    const alertsByWorkspace: Record<string, typeof expiringSkills> = {};

    for (const skill of expiringSkills) {
      // Get employee to find their workspace
      const employee = await db.query.employees.findFirst({
        where: eq(employees.id, skill.employeeId),
      });

      if (employee) {
        if (!alertsByWorkspace[employee.workspaceId]) {
          alertsByWorkspace[employee.workspaceId] = [];
        }
        alertsByWorkspace[employee.workspaceId].push(skill);
      }
    }

    // Send notifications to HR managers
    for (const [workspaceId, skills] of Object.entries(alertsByWorkspace)) {
      try {
        // Find HR managers in this workspace (workspaceId is implicit for workspace context)
        const managers = await db
          .select()
          .from(users)
          .where(eq(users.workspaceId, workspaceId as string));

        for (const manager of managers) {
          // Only notify HR/managers
          if (!['owner', 'manager', 'hr_manager'].includes(manager.role || '')) continue;

          const expiryDates = skills
            .map(s => new Date(s.expiresAt!).toLocaleDateString())
            .filter((v, i, a) => a.indexOf(v) === i); // Unique dates

          await createNotification({
            workspaceId,
            userId: manager.id,
            type: 'compliance_alert' as any,
            title: '⚠️ Expiring Certifications',
            message: `${skills.length} employee certification(s) expire in ${DAYS_BEFORE_EXPIRY} days. Review and plan renewals.`,
            actionUrl: `/compliance/certifications`,
            relatedEntityType: 'compliance_alert',
            relatedEntityId: workspaceId,
            metadata: {
              expiringCount: skills.length,
              expiryDates,
            },
          });
        }
      } catch (notifyError) {
        console.error(`[ComplianceAlerts] Error notifying workspace ${workspaceId}:`, notifyError);
      }
    }

    // Note: Contractor certifications don't have built-in expiry tracking
    // They're tracked via employeeSkills for now
    const expiringContractorCerts: any[] = [];

    console.log(`[ComplianceAlerts] Found ${expiringContractorCerts.length} expiring contractor certifications`);

    return {
      success: true,
      employeeSkillsChecked: expiringSkills.length,
      contractorCertsChecked: expiringContractorCerts.length,
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('[ComplianceAlerts] Error checking expiring certifications:', error);
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
    console.error('[ComplianceAlerts] Error getting compliance summary:', error);
    throw error;
  }
}
