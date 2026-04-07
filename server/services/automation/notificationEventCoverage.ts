import { db } from '../../db';
import { employees, employeeSkills, employeeCertifications, userNotificationPreferences, idempotencyKeys } from '@shared/schema';
import { eq, and, lt, gte, isNotNull, or } from 'drizzle-orm';
import { createNotification } from '../notificationService';
import { addDays, format } from 'date-fns';
import { createLogger } from '../../lib/logger';
const log = createLogger('notificationEventCoverage');


async function shouldSendNotification(userId: string, notificationType: string): Promise<boolean> {
  try {
    const prefs = await db.query.userNotificationPreferences.findFirst({
      where: eq(userNotificationPreferences.userId, userId),
    });

    if (!prefs) return true;

    if (!prefs.enablePush && !prefs.enableEmail) return false;

    const enabledTypes = prefs.enabledTypes as string[] | null;
    if (enabledTypes && enabledTypes.length > 0 && !enabledTypes.includes(notificationType)) {
      return false;
    }

    return true;
  } catch {
    return true;
  }
}

async function isEmployeeActive(employeeId: string): Promise<boolean> {
  try {
    const emp = await db.query.employees.findFirst({
      where: eq(employees.id, employeeId),
      columns: { isActive: true, terminationDate: true },
    });

    if (!emp) return false;
    if (!emp.isActive) return false;
    if (emp.terminationDate && new Date(emp.terminationDate) <= new Date()) return false;

    return true;
  } catch {
    return false;
  }
}

export async function notifyTimesheetRejected(params: {
  workspaceId: string;
  timeEntryId: string;
  employeeId: string;
  rejectedByName: string;
  reason?: string;
  date?: string;
}): Promise<void> {
  try {
    const active = await isEmployeeActive(params.employeeId);
    if (!active) return;

    const emp = await db.query.employees.findFirst({
      where: eq(employees.id, params.employeeId),
      columns: { userId: true, firstName: true, lastName: true },
    });

    if (!emp?.userId) return;

    const allowed = await shouldSendNotification(emp.userId, 'timesheet_rejected');
    if (!allowed) return;

    const reasonText = params.reason ? `: ${params.reason}` : '';
    const dateText = params.date ? ` for ${params.date}` : '';

    await createNotification({
      workspaceId: params.workspaceId,
      userId: emp.userId,
      type: 'issue_detected',
      title: 'Timesheet Entry Rejected',
      message: `Your time entry${dateText} was rejected by ${params.rejectedByName}${reasonText}. Please review and resubmit if needed.`,
      actionUrl: '/time-tracking',
      relatedEntityType: 'time_entry',
      relatedEntityId: params.timeEntryId,
      metadata: {
        notificationType: 'timesheet_rejected',
        reason: params.reason,
        rejectedBy: params.rejectedByName,
        employeeId: params.employeeId,
      },
    });
  } catch (error) {
    log.error('[NotificationEvents] Failed to send timesheet rejected notification:', error);
  }
}

export async function notifyCertificationExpiring(params: {
  workspaceId: string;
  employeeId: string;
  certificationName: string;
  expiresAt: Date;
  licenseNumber?: string | null;
  licenseType?: string | null;
  renewalLink?: string | null;
  isExpired?: boolean;
}): Promise<void> {
  try {
    const active = await isEmployeeActive(params.employeeId);
    if (!active) return;

    const emp = await db.query.employees.findFirst({
      where: eq(employees.id, params.employeeId),
      columns: { userId: true, firstName: true, lastName: true, workspaceId: true },
    });

    const daysUntilExpiry = params.isExpired
      ? 0
      : Math.ceil((params.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const expiryDate = format(params.expiresAt, 'MMM d, yyyy');
    const employeeName = emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown';

    const licenseDetail = params.licenseNumber ? ` (License #: ${params.licenseNumber})` : '';
    const renewalSuffix = params.renewalLink
      ? ` Renew at: ${params.renewalLink}`
      : ' Contact your compliance officer to initiate renewal.';

    const officerTitle = params.isExpired ? 'License EXPIRED — Immediate Action Required' : 'License Expiring Soon';
    const officerMsg = params.isExpired
      ? `Your "${params.certificationName}"${licenseDetail} EXPIRED on ${expiryDate}. You are not eligible to work until this is renewed.${renewalSuffix}`
      : `Your "${params.certificationName}"${licenseDetail} expires on ${expiryDate} (${daysUntilExpiry} days remaining). Please renew before expiration to maintain compliance.${renewalSuffix}`;

    const mgrTitle = params.isExpired ? `Officer License EXPIRED — ${employeeName}` : `Officer License Expiring — ${employeeName}`;
    const mgrMsg = params.isExpired
      ? `${employeeName}'s "${params.certificationName}"${licenseDetail} EXPIRED on ${expiryDate}. This officer is now blocked from shift assignments. Immediate compliance action required.`
      : `${employeeName}'s "${params.certificationName}"${licenseDetail} expires on ${expiryDate} (${daysUntilExpiry} days). Ensure renewal is in progress to maintain DPS compliance.${renewalSuffix}`;

    if (emp?.userId) {
      const allowed = await shouldSendNotification(emp.userId, 'certification_expiring');
      if (allowed) {
        await createNotification({
          workspaceId: params.workspaceId,
          userId: emp.userId,
          type: params.isExpired ? 'warning' : 'issue_detected',
          title: officerTitle,
          message: officerMsg,
          actionUrl: '/training-certification',
          relatedEntityType: 'certification',
          relatedEntityId: params.employeeId,
          metadata: {
            notificationType: params.isExpired ? 'license_expired' : 'certification_expiring',
            certificationName: params.certificationName,
            licenseNumber: params.licenseNumber ?? null,
            licenseType: params.licenseType ?? null,
            expiresAt: params.expiresAt.toISOString(),
            daysUntilExpiry,
            isExpired: params.isExpired ?? false,
          },
        });
      }
    }

    const supervisorsAndCompliance = await db.query.employees.findMany({
      where: and(
        eq(employees.workspaceId, params.workspaceId),
        eq(employees.isActive, true),
        or(
          eq(employees.workspaceRole as any, 'org_owner'),
          eq(employees.workspaceRole as any, 'co_owner'),
          eq(employees.workspaceRole as any, 'manager'),
          eq(employees.workspaceRole as any, 'supervisor'),
          eq(employees.workspaceRole as any, 'compliance_officer'),
        )
      ),
      columns: { userId: true, id: true, workspaceRole: true },
    });

    for (const mgr of supervisorsAndCompliance) {
      if (!mgr.userId || mgr.id === params.employeeId) continue;

      const mgrAllowed = await shouldSendNotification(mgr.userId, 'certification_expiring');
      if (!mgrAllowed) continue;

      await createNotification({
        workspaceId: params.workspaceId,
        userId: mgr.userId,
        type: params.isExpired ? 'warning' : 'issue_detected',
        title: mgrTitle,
        message: mgrMsg,
        actionUrl: '/compliance/expiration-alerts',
        relatedEntityType: 'certification',
        relatedEntityId: params.employeeId,
        metadata: {
          notificationType: params.isExpired ? 'license_expired_manager' : 'certification_expiring_manager',
          certificationName: params.certificationName,
          licenseNumber: params.licenseNumber ?? null,
          licenseType: params.licenseType ?? null,
          employeeId: params.employeeId,
          employeeName,
          expiresAt: params.expiresAt.toISOString(),
          daysUntilExpiry,
          isExpired: params.isExpired ?? false,
          recipientRole: mgr.workspaceRole,
        },
      });
    }
  } catch (error) {
    log.error('[NotificationEvents] Failed to send certification expiring notification:', error);
  }
}

export async function notifyPayrollReadyForReview(params: {
  workspaceId: string;
  payrollRunId: string;
  periodStart: Date;
  periodEnd: Date;
  totalEmployees: number;
  totalGrossPay: number;
}): Promise<void> {
  try {
    const periodLabel = `${format(params.periodStart, 'MMM d')} - ${format(params.periodEnd, 'MMM d, yyyy')}`;

    const owners = await db.query.employees.findMany({
      where: and(
        eq(employees.workspaceId, params.workspaceId),
        eq(employees.isActive, true),
        or(
          eq(employees.workspaceRole as any, 'org_owner'),
          eq(employees.workspaceRole as any, 'co_owner')
        )
      ),
      columns: { userId: true, id: true },
    });

    for (const owner of owners) {
      if (!owner.userId) continue;

      const allowed = await shouldSendNotification(owner.userId, 'payroll_ready');
      if (!allowed) continue;

      await createNotification({
        workspaceId: params.workspaceId,
        userId: owner.userId,
        type: 'issue_detected',
        title: 'Payroll Ready for Review',
        message: `Payroll for ${periodLabel} is ready for your review and approval. ${params.totalEmployees} employees, $${params.totalGrossPay.toFixed(2)} total gross pay. Please review and approve to process payments.`,
        actionUrl: '/payroll',
        relatedEntityType: 'payroll_run',
        relatedEntityId: params.payrollRunId,
        metadata: {
          notificationType: 'payroll_ready_for_review',
          payrollRunId: params.payrollRunId,
          periodStart: params.periodStart.toISOString(),
          periodEnd: params.periodEnd.toISOString(),
          totalEmployees: params.totalEmployees,
          totalGrossPay: params.totalGrossPay,
        },
      });
    }
  } catch (error) {
    log.error('[NotificationEvents] Failed to send payroll ready notification:', error);
  }
}

export async function runCertificationExpiryCheck(): Promise<{
  checked: number;
  notified: number;
}> {
  // Alert windows: 90-day advance notice (TCOLE planning), 60-day (renewal initiation),
  // 30-day (urgent), 14-day (critical), 7-day (final escalation)
  const DAYS_BEFORE = [90, 60, 30, 14, 7];
  let checked = 0;
  let notified = 0;

  try {
    for (const days of DAYS_BEFORE) {
      const windowStart = addDays(new Date(), days - 1);
      const windowEnd = addDays(new Date(), days + 1);

      // --- Check employeeSkills (training/non-DPS certifications) ---
      const expiringSkills = await db
        .select({
          skill: employeeSkills,
          employee: employees,
        })
        .from(employeeSkills)
        .innerJoin(employees, eq(employeeSkills.employeeId, employees.id))
        .where(
          and(
            isNotNull(employeeSkills.expiresAt),
            gte(employeeSkills.expiresAt, windowStart),
            lt(employeeSkills.expiresAt, windowEnd),
            eq(employees.isActive, true)
          )
        );

      checked += expiringSkills.length;

      for (const { skill, employee } of expiringSkills) {
        if (employee.terminationDate && new Date(employee.terminationDate) <= new Date()) continue;

        // DB-backed deduplication — month-scoped so consecutive cron runs don't duplicate.
        // Different threshold keys (30d vs 14d) coexist so escalations still fire.
        const yearMonth = new Date().toISOString().slice(0, 7);
        const certKey = `cert-expiry-skill-${skill.id}-${days}d-${yearMonth}`;
        const inserted = await db.insert(idempotencyKeys)
          .values({
            workspaceId: employee.workspaceId,
            operationType: 'cert_expiry_notify',
            requestFingerprint: certKey,
            status: 'completed',
            expiresAt: new Date(Date.now() + 95 * 24 * 60 * 60 * 1000), // 95 days covers 90-day window
          })
          .onConflictDoNothing()
          .returning({ id: idempotencyKeys.id });

        if (inserted.length === 0) {
          log.info(`[NotificationEvents] Skill expiry already notified for ${skill.id} at ${days}d window this month, skipping`);
          continue;
        }

        await notifyCertificationExpiring({
          workspaceId: employee.workspaceId,
          employeeId: employee.id,
          certificationName: skill.skillName || skill.skillCategory || 'Unknown Certification',
          expiresAt: new Date(skill.expiresAt!),
          licenseType: skill.skillCategory ?? null,
        });
        notified++;
      }

      // --- Check employeeCertifications (DPS/TCOLE guard license records) ---
      const expiringCerts = await db
        .select({
          cert: employeeCertifications,
          employee: employees,
        })
        .from(employeeCertifications)
        .innerJoin(employees, eq(employeeCertifications.employeeId, employees.id))
        .where(
          and(
            isNotNull(employeeCertifications.expirationDate),
            gte(employeeCertifications.expirationDate, windowStart),
            lt(employeeCertifications.expirationDate, windowEnd),
            eq(employees.isActive, true)
          )
        );

      checked += expiringCerts.length;

      for (const { cert, employee } of expiringCerts) {
        if (employee.terminationDate && new Date(employee.terminationDate) <= new Date()) continue;

        const yearMonth = new Date().toISOString().slice(0, 7);
        const certKey = `cert-expiry-dps-${cert.id}-${days}d-${yearMonth}`;
        const inserted = await db.insert(idempotencyKeys)
          .values({
            workspaceId: employee.workspaceId,
            operationType: 'cert_expiry_notify',
            requestFingerprint: certKey,
            status: 'completed',
            expiresAt: new Date(Date.now() + 95 * 24 * 60 * 60 * 1000),
          })
          .onConflictDoNothing()
          .returning({ id: idempotencyKeys.id });

        if (inserted.length === 0) {
          log.info(`[NotificationEvents] DPS cert expiry already notified for ${cert.id} at ${days}d window this month, skipping`);
          continue;
        }

        await notifyCertificationExpiring({
          workspaceId: employee.workspaceId,
          employeeId: employee.id,
          certificationName: cert.certificationName || cert.certificationType || 'Security License',
          expiresAt: new Date(cert.expirationDate!),
          licenseNumber: cert.certificationNumber ?? null,
          licenseType: cert.certificationType ?? null,
          renewalLink: 'https://tcole.texas.gov',
        });
        notified++;
      }
    }

    log.info(`[NotificationEvents] Certification expiry check complete: ${checked} records checked, ${notified} notifications sent`);
  } catch (error) {
    log.error('[NotificationEvents] Certification expiry check failed:', error);
  }

  return { checked, notified };
}
