/**
 * License Dashboard Routes
 * ========================
 * Bulk license status dashboard, DPS CSV export, and revoked-mid-assignment handler.
 *
 * Canonical prefix: /api/compliance/licenses
 *
 * GET  /api/compliance/licenses/dashboard         — Bulk license compliance summary
 * GET  /api/compliance/licenses/export/dps-csv    — DPS/TCOLE CSV export (compliance officers only)
 * POST /api/compliance/licenses/:certId/revoke    — Revoke a license + flag active shifts
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import {
  employees,
  employeeCertifications,
  shifts,
} from '@shared/schema';
import { eq, and, or, gte, isNotNull, isNull, lt, desc } from 'drizzle-orm';
import { ensureWorkspaceAccess } from '../middleware/workspaceScope';
import { getGuardLicenseStatus, getAlertTierLabel } from '../services/compliance/trinityComplianceEngine';
import { createNotification } from '../services/notificationService';
import { universalAudit } from '../services/universalAuditService';
import { notifyCertificationExpiring } from '../services/automation/notificationEventCoverage';
import { createLogger } from '../lib/logger';
import { z } from 'zod';
const log = createLogger('LicenseDashboard');


const router = Router();

// ─── Role gate helper ─────────────────────────────────────────────────────────

const ELEVATED_ROLES = new Set(['org_owner', 'co_owner', 'manager', 'supervisor', 'compliance_officer']);

function hasLicenseDashboardAccess(role: string | null | undefined): boolean {
  if (!role) return false;
  return ELEVATED_ROLES.has(role);
}

// ─── GET /api/compliance/licenses/dashboard ───────────────────────────────────

router.get('/dashboard', ensureWorkspaceAccess, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId as string;
    const actorRole = req.workspaceRole ?? (req.user)?.workspaceRole;

    if (!hasLicenseDashboardAccess(actorRole)) {
      return res.status(403).json({ error: 'License dashboard requires manager or compliance officer role' });
    }

    const activeEmployees = await db
      .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName })
      .from(employees)
      .where(and(eq(employees.workspaceId, workspaceId), eq(employees.isActive, true)));

    const statuses = await Promise.all(
      activeEmployees.map(async (emp) => {
        const status = await getGuardLicenseStatus(emp.id, workspaceId);
        const tierInfo = getAlertTierLabel(status.alertTier);
        return {
          ...status,
          tierLabel: tierInfo.label,
          severity: tierInfo.severity,
        };
      })
    );

    const summary = {
      total: statuses.length,
      compliant: statuses.filter(s => s.alertTier === 'compliant').length,
      expiring90: statuses.filter(s => s.alertTier === 'expiring_90').length,
      expiring60: statuses.filter(s => s.alertTier === 'expiring_60').length,
      expiring30: statuses.filter(s => s.alertTier === 'expiring_30').length,
      expired: statuses.filter(s => s.alertTier === 'expired').length,
      noExpiry: statuses.filter(s => s.alertTier === 'no_expiry_on_file').length,
      noLicense: statuses.filter(s => !s.hasGuardLicense).length,
      blocked: statuses.filter(s => !s.isSchedulingEligible).length,
    };

    return res.json({
      workspaceId,
      generatedAt: new Date().toISOString(),
      summary,
      officers: statuses.sort((a, b) => {
        const tierOrder: Record<string, number> = {
          expired: 0, no_expiry_on_file: 1, expiring_30: 2,
          expiring_60: 3, expiring_90: 4, compliant: 5,
        };
        return (tierOrder[a.alertTier] ?? 9) - (tierOrder[b.alertTier] ?? 9);
      }),
    });
  } catch (error: any) {
    log.error('[LicenseDashboard] Dashboard error:', error);
    return res.status(500).json({ error: 'Failed to load license dashboard' });
  }
});

// ─── GET /api/compliance/licenses/export/dps-csv ─────────────────────────────

router.get('/export/dps-csv', ensureWorkspaceAccess, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId as string;
    const actorRole = req.workspaceRole ?? (req.user)?.workspaceRole;

    if (!hasLicenseDashboardAccess(actorRole)) {
      return res.status(403).json({ error: 'DPS export requires manager or compliance officer role' });
    }

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
        archivedAt: employeeCertifications.archivedAt,
      })
      .from(employeeCertifications)
      .innerJoin(employees, eq(employeeCertifications.employeeId, employees.id))
      .where(and(
        eq(employeeCertifications.workspaceId, workspaceId),
        eq(employees.isActive, true),
        isNull(employeeCertifications.archivedAt),
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
      c.issuedDate ? new Date(c.issuedDate).toLocaleDateString('en-US') : '',
      c.expirationDate ? new Date(c.expirationDate).toLocaleDateString('en-US') : 'NO EXPIRY ON FILE',
      c.status ?? 'unknown',
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const filename = `dps-license-export-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Record-Count', String(certs.length));
    return res.send(csv);
  } catch (error: any) {
    log.error('[LicenseDashboard] CSV export error:', error);
    return res.status(500).json({ error: 'Failed to generate DPS CSV export' });
  }
});

// ─── POST /api/compliance/licenses/:certId/revoke ────────────────────────────

router.post('/:certId/revoke', ensureWorkspaceAccess, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId as string;
    const actorId = req.user?.id as string;
    const actorRole = req.workspaceRole ?? (req.user)?.workspaceRole;
    const { certId } = req.params;
    const { reason } = req.body;

    if (!hasLicenseDashboardAccess(actorRole)) {
      return res.status(403).json({ error: 'License revocation requires manager or compliance officer role' });
    }

    const cert = await db.query.employeeCertifications.findFirst({
      where: and(
        eq(employeeCertifications.id, certId),
        eq(employeeCertifications.workspaceId, workspaceId),
      ),
    });

    if (!cert) return res.status(404).json({ error: 'Certification record not found' });

    const [revoked] = await db
      .update(employeeCertifications)
      .set({
        status: 'revoked',
        archivedAt: new Date(),
        archivedById: actorId,
        renewalNotes: reason ? `REVOKED: ${reason}` : 'REVOKED by compliance officer',
        updatedAt: new Date(),
      })
      .where(and(
        eq(employeeCertifications.id, certId),
        eq(employeeCertifications.workspaceId, workspaceId),
      ))
      .returning();

    await universalAudit.log({
      workspaceId,
      actorId,
      actorType: 'user',
      changeType: 'update',
      action: 'COMPLIANCE:LICENSE_REVOKED',
      entityType: 'employee_certification',
      entityId: certId,
      entityName: cert.certificationName,
      metadata: {
        employeeId: cert.employeeId,
        reason: reason ?? 'Not specified',
        previousStatus: cert.status,
        certificationNumber: cert.certificationNumber,
      },
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    // Find active/upcoming shifts for this employee and flag them
    const now = new Date();
    const affectedShifts = await db
      .select({ id: shifts.id, startTime: shifts.startTime, endTime: shifts.endTime, workspaceId: shifts.workspaceId })
      .from(shifts)
      .where(and(
        eq(shifts.employeeId, cert.employeeId),
        eq(shifts.workspaceId, workspaceId),
        gte(shifts.startTime, now),
        or(
          eq(shifts.status as any, 'scheduled'),
          eq(shifts.status as any, 'confirmed'),
        )
      ));

    let shiftsNotified = 0;
    for (const shift of affectedShifts) {
      // Find supervisors/managers to notify about the conflict
      const supervisors = await db
        .select({ userId: employees.userId })
        .from(employees)
        .where(and(
          eq(employees.workspaceId, workspaceId),
          eq(employees.isActive, true),
          or(
            eq(employees.workspaceRole as any, 'org_owner'),
            eq(employees.workspaceRole as any, 'co_owner'),
            eq(employees.workspaceRole as any, 'manager'),
            eq(employees.workspaceRole as any, 'supervisor'),
            eq(employees.workspaceRole as any, 'compliance_officer'),
          )
        ));

      for (const sup of supervisors) {
        if (!sup.userId) continue;
        await createNotification({
          workspaceId,
          userId: sup.userId,
          type: 'warning',
          title: 'License Revoked — Active Shift Conflict',
          idempotencyKey: `warning-${Date.now()}-${sup.userId}`,
          message: `Officer (Employee ${cert.employeeId})'s "${cert.certificationName}" license has been REVOKED. They have a shift scheduled on ${new Date(shift.startTime).toLocaleDateString()} that must be reassigned immediately.`,
          actionUrl: '/scheduling',
          relatedEntityType: 'shift',
          relatedEntityId: shift.id,
          metadata: {
            notificationType: 'revoked_license_shift_conflict',
            employeeId: cert.employeeId,
            certId,
            shiftId: shift.id,
            shiftDate: new Date(shift.startTime).toISOString(),
            reason,
          },
        }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
      }
      shiftsNotified++;
    }

    return res.json({
      success: true,
      revoked,
      affectedShifts: affectedShifts.length,
      supervisorsNotified: shiftsNotified > 0,
      message: `License revoked. ${affectedShifts.length} upcoming shift(s) flagged for reassignment.`,
    });
  } catch (error: any) {
    log.error('[LicenseDashboard] Revoke error:', error);
    return res.status(500).json({ error: 'Failed to revoke license' });
  }
});

// ─── GET /api/compliance/licenses/export/:stateCode/csv ─────────────────────
// Phase 21B Check 23: Parameterized state export — generates state-specific CSV
// matching each state's regulatory body field requirements.

router.get('/export/:stateCode/csv', ensureWorkspaceAccess, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId as string;
    const { stateCode } = req.params;
    const actorRole = req.workspaceRole ?? (req.user)?.workspaceRole;

    if (!hasLicenseDashboardAccess(actorRole)) {
      return res.status(403).json({ error: 'License export requires manager or compliance officer role' });
    }

    const normalizedState = stateCode.toUpperCase();

    const { getStateConfig } = await import('../services/compliance/stateRegulatoryKnowledgeBase');
    const stateConfig = await getStateConfig(normalizedState).catch(() => null);

    if (!stateConfig) {
      return res.status(400).json({ error: `State '${normalizedState}' is not configured in the regulatory knowledge base` });
    }

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
        archivedAt: employeeCertifications.archivedAt,
      })
      .from(employeeCertifications)
      .innerJoin(employees, eq(employeeCertifications.employeeId, employees.id))
      .where(and(
        eq(employeeCertifications.workspaceId, workspaceId),
        eq(employees.isActive, true),
        isNull(employeeCertifications.archivedAt),
      ))
      .orderBy(desc(employees.lastName));

    const regulatoryBody = stateConfig.regulatoryBodyAcronym || stateConfig.regulatoryBody || normalizedState;

    const headers = [
      'Employee ID', 'Last Name', 'First Name',
      'Cert Type', 'Cert Name', 'License Number',
      `${regulatoryBody} Issuing Authority`, 'Issued Date', 'Expiration Date', 'Status', 'State',
    ];

    const rows = certs.map(c => [
      c.employeeId,
      c.lastName,
      c.firstName,
      c.certificationType,
      c.certificationName,
      c.certificationNumber ?? '',
      c.issuingAuthority ?? '',
      c.issuedDate ? new Date(c.issuedDate).toLocaleDateString('en-US') : '',
      c.expirationDate ? new Date(c.expirationDate).toLocaleDateString('en-US') : 'NO EXPIRY ON FILE',
      c.status ?? 'unknown',
      normalizedState,
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    await universalAudit({
      workspaceId,
      userId: req.user?.id,
      action: 'compliance_license_export',
      entityType: 'compliance',
      entityId: workspaceId,
      metadata: { stateCode: normalizedState, regulatoryBody, recordCount: certs.length },
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    const filename = `license-export-${normalizedState}-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Record-Count', String(certs.length));
    res.setHeader('X-State-Code', normalizedState);
    res.setHeader('X-Regulatory-Body', regulatoryBody);
    return res.send(csv);
  } catch (error: any) {
    log.error('[LicenseDashboard] State CSV export error:', error);
    return res.status(500).json({ error: 'Failed to generate state license CSV export' });
  }
});

export default router;
