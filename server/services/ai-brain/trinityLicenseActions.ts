/**
 * TRINITY LICENSE ACTIONS
 * =======================
 * AI-powered guard license management actions for the Trinity co-pilot.
 * Enables Trinity to query license status, trigger alerts, update renewal
 * notes, and export DPS compliance data — all within the action registry.
 *
 * Actions registered:
 *   license.query   — Return license/cert status for one or all officers
 *   license.alert   — Force-send an immediate license expiry/expired alert
 *   license.update  — Record renewal notes on a cert record
 *   license.export  — Generate DPS compliance CSV summary
 */

import { db } from '../../db';
import { employees, employeeCertifications } from '@shared/schema';
import { eq, and, isNotNull, lt, gte, or, desc } from 'drizzle-orm';
import { helpaiOrchestrator } from '../helpai/platformActionHub';
// @ts-expect-error — TS migration: fix in refactoring sprint
import type { ActionRequest, ActionResult, ActionHandler } from './actionRegistry';
import { getGuardLicenseStatus, getAlertTierLabel } from '../compliance/trinityComplianceEngine';
import { notifyCertificationExpiring } from '../automation/notificationEventCoverage';
import { universalAudit } from '../universalAuditService';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityLicenseActions');

const createResult = (
  actionId: string, success: boolean, message: string,
  data: any, start: number
): ActionResult => ({
  actionId, success, message, data,
  executionTimeMs: Date.now() - start,
  timestamp: new Date().toISOString(),
});

function mkAction(id: string, fn: (req: ActionRequest) => Promise<ActionResult>): ActionHandler {
  return {
    actionId: id,
    name: id,
    category: 'license',
    description: id,
    requiredRoles: [],
    handler: fn,
  };
}

// ─── license.query ────────────────────────────────────────────────────────────

async function handleLicenseQuery(req: ActionRequest): Promise<ActionResult> {
  const start = Date.now();
  const workspaceId = req.workspaceId;
  const employeeId = req.params?.employeeId as string | undefined;

  try {
    if (employeeId) {
      const status = await getGuardLicenseStatus(employeeId, workspaceId);
      const tierInfo = getAlertTierLabel(status.alertTier);
      return createResult('license.query', true, `License status retrieved for officer ${employeeId}`, {
        ...status,
        tierLabel: tierInfo.label,
        severity: tierInfo.severity,
      }, start);
    }

    const allEmployees = await db
      .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName })
      .from(employees)
      .where(and(eq(employees.workspaceId, workspaceId), eq(employees.isActive, true)));

    const statuses = await Promise.all(
      allEmployees.map(async (emp) => {
        const status = await getGuardLicenseStatus(emp.id, workspaceId);
        const tierInfo = getAlertTierLabel(status.alertTier);
        return { ...status, tierLabel: tierInfo.label, severity: tierInfo.severity };
      })
    );

    const summary = {
      total: statuses.length,
      compliant: statuses.filter(s => s.alertTier === 'compliant').length,
      expiring: statuses.filter(s => ['expiring_90', 'expiring_60', 'expiring_30'].includes(s.alertTier)).length,
      critical: statuses.filter(s => ['expiring_30'].includes(s.alertTier)).length,
      expired: statuses.filter(s => s.alertTier === 'expired').length,
      noExpiry: statuses.filter(s => s.alertTier === 'no_expiry_on_file').length,
      blocked: statuses.filter(s => !s.isSchedulingEligible).length,
    };

    return createResult('license.query', true, `License dashboard: ${summary.total} officers scanned`, {
      summary,
      officers: statuses,
    }, start);
  } catch (error: any) {
    return createResult('license.query', false, `License query failed: ${error.message}`, null, start);
  }
}

// ─── license.alert ────────────────────────────────────────────────────────────

async function handleLicenseAlert(req: ActionRequest): Promise<ActionResult> {
  const start = Date.now();
  const workspaceId = req.workspaceId;
  const { employeeId, certId } = req.params ?? {};

  try {
    if (!employeeId) {
      return createResult('license.alert', false, 'employeeId is required for license.alert', null, start);
    }

    let cert: any = null;

    if (certId) {
      cert = await db.query.employeeCertifications.findFirst({
        where: and(
          eq(employeeCertifications.id, certId as string),
          eq(employeeCertifications.employeeId, employeeId as string),
        ),
      });
    } else {
      const certs = await db
        .select()
        .from(employeeCertifications)
        .where(and(
          eq(employeeCertifications.employeeId, employeeId as string),
          eq(employeeCertifications.workspaceId, workspaceId),
        ))
        .orderBy(desc(employeeCertifications.createdAt))
        .limit(1);
      cert = certs[0] ?? null;
    }

    if (!cert) {
      return createResult('license.alert', false, `No certification record found for employee ${employeeId}`, null, start);
    }

    const isExpired = cert.expirationDate ? new Date(cert.expirationDate) <= new Date() : false;

    await notifyCertificationExpiring({
      workspaceId,
      employeeId: employeeId as string,
      certificationName: cert.certificationName || cert.certificationType || 'Security License',
      expiresAt: cert.expirationDate ? new Date(cert.expirationDate) : new Date(),
      licenseNumber: cert.certificationNumber ?? null,
      licenseType: cert.certificationType ?? null,
      renewalLink: 'https://tcole.texas.gov',
      isExpired,
    });

    await universalAudit.log({
      workspaceId,
      actorId: req.actorId ?? 'trinity',
      // @ts-expect-error — TS migration: fix in refactoring sprint
      actorType: 'ai',
      changeType: 'action',
      action: 'TRINITY:LICENSE_ALERT_TRIGGERED',
      entityType: 'employee_certification',
      entityId: cert.id,
      entityName: `${cert.certificationName} — Employee ${employeeId}`,
      metadata: { employeeId, certId: cert.id, isExpired, source: 'trinity-license.alert' },
    }).catch((err) => log.warn('[trinityLicenseActions] Fire-and-forget failed:', err));

    return createResult('license.alert', true, `License alert sent for officer ${employeeId} — ${isExpired ? 'EXPIRED' : 'expiring'} cert`, {
      certId: cert.id,
      certificationName: cert.certificationName,
      isExpired,
      expirationDate: cert.expirationDate,
    }, start);
  } catch (error: any) {
    return createResult('license.alert', false, `License alert failed: ${error.message}`, null, start);
  }
}

// ─── license.update ───────────────────────────────────────────────────────────

async function handleLicenseUpdate(req: ActionRequest): Promise<ActionResult> {
  const start = Date.now();
  const workspaceId = req.workspaceId;
  const { certId, renewalNotes, newExpirationDate, newLicenseNumber } = req.params ?? {};

  try {
    if (!certId) {
      return createResult('license.update', false, 'certId is required for license.update', null, start);
    }

    const updateFields: Record<string, any> = { updatedAt: new Date() };
    if (renewalNotes) updateFields.renewalNotes = renewalNotes;
    if (newExpirationDate) updateFields.expirationDate = new Date(newExpirationDate as string);
    if (newLicenseNumber) updateFields.certificationNumber = newLicenseNumber;

    const [updated] = await db
      .update(employeeCertifications)
      .set(updateFields)
      .where(and(
        eq(employeeCertifications.id, certId as string),
        eq(employeeCertifications.workspaceId, workspaceId),
      ))
      .returning();

    if (!updated) {
      return createResult('license.update', false, `Certification ${certId} not found in this workspace`, null, start);
    }

    await universalAudit.log({
      workspaceId,
      actorId: req.actorId ?? 'trinity',
      // @ts-expect-error — TS migration: fix in refactoring sprint
      actorType: 'ai',
      changeType: 'update',
      action: 'TRINITY:LICENSE_UPDATED',
      entityType: 'employee_certification',
      entityId: certId as string,
      entityName: updated.certificationName,
      metadata: { renewalNotes, newExpirationDate, newLicenseNumber, source: 'trinity-license.update' },
    }).catch((err) => log.warn('[trinityLicenseActions] Fire-and-forget failed:', err));

    return createResult('license.update', true, `Certification ${certId} updated successfully`, updated, start);
  } catch (error: any) {
    return createResult('license.update', false, `License update failed: ${error.message}`, null, start);
  }
}

// ─── license.export ───────────────────────────────────────────────────────────

async function handleLicenseExport(req: ActionRequest): Promise<ActionResult> {
  const start = Date.now();
  const workspaceId = req.workspaceId;

  try {
    const certs = await db
      .select({
        certId: employeeCertifications.id,
        employeeId: employeeCertifications.employeeId,
        firstName: employees.firstName,
        lastName: employees.lastName,
        certificationType: employeeCertifications.certificationType,
        certificationName: employeeCertifications.certificationName,
        certificationNumber: employeeCertifications.certificationNumber,
        issuingAuthority: employeeCertifications.issuingAuthority,
        issuedDate: employeeCertifications.issuedDate,
        expirationDate: employeeCertifications.expirationDate,
        status: employeeCertifications.status,
      })
      .from(employeeCertifications)
      .innerJoin(employees, eq(employeeCertifications.employeeId, employees.id))
      .where(and(
        eq(employeeCertifications.workspaceId, workspaceId),
        eq(employees.isActive, true),
      ))
      .orderBy(desc(employees.lastName));

    const headers = [
      'Employee ID', 'Last Name', 'First Name',
      'Cert Type', 'Cert Name', 'License Number',
      'Issuing Authority', 'Issued Date', 'Expiration Date', 'Status',
    ];

    const rows = certs.map(c => [
      c.employeeId,
      c.lastName,
      c.firstName,
      c.certificationType,
      c.certificationName,
      c.certificationNumber ?? '',
      c.issuingAuthority ?? '',
      c.issuedDate ? new Date(c.issuedDate).toLocaleDateString() : '',
      c.expirationDate ? new Date(c.expirationDate).toLocaleDateString() : 'NO EXPIRY ON FILE',
      c.status ?? 'unknown',
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    return createResult('license.export', true, `DPS license export: ${certs.length} records`, {
      csv,
      recordCount: certs.length,
      generatedAt: new Date().toISOString(),
      filename: `dps-license-export-${new Date().toISOString().slice(0, 10)}.csv`,
    }, start);
  } catch (error: any) {
    return createResult('license.export', false, `License export failed: ${error.message}`, null, start);
  }
}

// ─── REGISTRATION ─────────────────────────────────────────────────────────────

export function registerLicenseActions(): void {
  helpaiOrchestrator.registerAction(mkAction('license.query', handleLicenseQuery));
  helpaiOrchestrator.registerAction(mkAction('license.alert', handleLicenseAlert));
  helpaiOrchestrator.registerAction(mkAction('license.update', handleLicenseUpdate));
  helpaiOrchestrator.registerAction(mkAction('license.export', handleLicenseExport));
  log.info('[TrinityLicenseActions] Registered: license.query, license.alert, license.update, license.export');
}
