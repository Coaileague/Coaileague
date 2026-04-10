/**
 * Trinity Compliance Intelligence — API Routes
 * =============================================
 * GET /api/compliance/acme-scenarios  — Run all 6 Acme simulation scenarios
 * GET /api/compliance/workspace-scan  — Full workspace compliance scan
 * GET /api/compliance/employee/:id    — Single employee license + cert status
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth';
import { db } from '../db';
import { employeeCertifications } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { universalAudit } from '../services/universalAuditService';
import { runAllAcmeScenarios } from '../services/compliance/complianceScenarioRunner';
import {
  getGuardLicenseStatus,
  checkSchedulingEligibility,
  checkRequiredCertifications,
  detectOutOfStateLicense,
  runWorkspaceComplianceScan,
  deliverComplianceAlerts,
} from '../services/compliance/trinityComplianceEngine';
import { createNotification } from '../services/notificationService';
import { createLogger } from '../lib/logger';
const log = createLogger('ComplianceScenarioRoutes');


const router = Router();

// ── Run all 6 Acme compliance scenarios ──────────────────────────────────────
router.get('/acme-scenarios', requireAuth, async (req, res) => {
  try {
    const results = await runAllAcmeScenarios();
    return res.json(results);
  } catch (err: unknown) {
    log.error('[ComplianceScenarios] Error running scenarios:', err);
    return res.status(500).json({ message: 'Failed to run compliance scenarios', error: sanitizeError(err) });
  }
});

// ── Full workspace compliance scan ──────────────────────────────────────────
router.get('/workspace-scan', requireAuth, async (req, res) => {
  try {
    const workspaceId = req.workspaceId as string;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace context required' });

    const scan = await runWorkspaceComplianceScan(workspaceId);
    return res.json(scan);
  } catch (err: unknown) {
    log.error('[ComplianceScenarios] Workspace scan error:', err);
    return res.status(500).json({ message: 'Failed to run workspace scan', error: sanitizeError(err) });
  }
});

// ── Single employee license status ──────────────────────────────────────────
router.get('/employee/:employeeId', requireAuth, async (req, res) => {
  try {
    const workspaceId = req.workspaceId as string;
    const { employeeId } = req.params;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace context required' });

    const [licenseStatus, eligibility, outOfState] = await Promise.all([
      getGuardLicenseStatus(employeeId, workspaceId),
      checkSchedulingEligibility(employeeId, workspaceId),
      detectOutOfStateLicense(employeeId, workspaceId),
    ]);

    return res.json({ licenseStatus, eligibility, outOfState });
  } catch (err: unknown) {
    return res.status(500).json({ message: 'Failed to get employee compliance status', error: sanitizeError(err) });
  }
});

// ── Check if employee meets cert requirements for a post ───────────────────
router.post('/check-certs', requireAuth, async (req, res) => {
  try {
    const workspaceId = req.workspaceId as string;
    const { employeeId, requiredCerts } = req.body;

    if (!employeeId || !Array.isArray(requiredCerts)) {
      return res.status(400).json({ message: 'employeeId and requiredCerts[] required' });
    }

    const result = await checkRequiredCertifications(employeeId, workspaceId, requiredCerts);
    return res.json(result);
  } catch (err: unknown) {
    return res.status(500).json({ message: 'Cert check failed', error: sanitizeError(err) });
  }
});

// ── Deliver compliance alerts via all 3 channels ────────────────────────────
router.post('/deliver-alerts', requireAuth, async (req, res) => {
  try {
    const workspaceId = req.workspaceId as string;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace context required' });

    const result = await deliverComplianceAlerts(workspaceId);
    return res.json(result);
  } catch (err: unknown) {
    log.error('[ComplianceAlerts] Delivery error:', err);
    return res.status(500).json({ message: 'Alert delivery failed', error: sanitizeError(err) });
  }
});

// ── S3: Manager confirms renewal — restores scheduling eligibility ──────────
const renewalConfirmSchema = z.object({
  certId: z.string().min(1),
  newExpirationDate: z.string().min(1),
  newLicenseNumber: z.string().optional(),
  confirmedByUserId: z.string().min(1),
});

router.post('/confirm-renewal/:employeeId', requireAuth, async (req, res) => {
  try {
    const workspaceId = req.workspaceId as string;
    const actorId = req.user?.id as string;
    const { employeeId } = req.params;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace context required' });

    const parsed = renewalConfirmSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid body', errors: parsed.error.flatten() });
    const { certId, newExpirationDate, newLicenseNumber, confirmedByUserId } = parsed.data;

    const newExpiry = new Date(newExpirationDate);
    if (isNaN(newExpiry.getTime())) return res.status(400).json({ message: 'Invalid expiration date format' });

    // Fetch the existing cert to preserve history
    const existingCert = await db.query.employeeCertifications.findFirst({
      where: and(
        eq(employeeCertifications.id, certId),
        eq(employeeCertifications.employeeId, employeeId),
        eq(employeeCertifications.workspaceId, workspaceId)
      ),
    });

    if (!existingCert) return res.status(404).json({ message: 'Certification record not found' });

    // Archive the old cert record — preserves the previous expiry date in history
    // Status is NOT changed (preserves last known state; archivedAt marks the record as historical)
    await db
      .update(employeeCertifications)
      .set({
        archivedAt: new Date(),
        archivedById: actorId ?? confirmedByUserId,
        renewalNotes: `Superseded by renewal confirmed on ${new Date().toLocaleDateString()} by ${confirmedByUserId}`,
        updatedAt: new Date(),
      })
      .where(eq(employeeCertifications.id, certId));

    // Create a new active cert record, linked back to the archived one via supersededById
    const [newCert] = await db
      .insert(employeeCertifications)
      .values({
        workspaceId,
        employeeId,
        certificationType: existingCert.certificationType,
        certificationName: existingCert.certificationName,
        certificationNumber: newLicenseNumber ?? existingCert.certificationNumber,
        issuingAuthority: existingCert.issuingAuthority,
        issuedDate: new Date(),
        expirationDate: newExpiry,
        status: 'active',
        isRequired: existingCert.isRequired ?? false,
        documentId: existingCert.documentId,
        supersededById: certId,
        renewalNotes: `Renewal of cert ${certId}. Confirmed by ${confirmedByUserId}.`,
      })
      .returning();

    const newStatus = await checkSchedulingEligibility(employeeId, workspaceId);

    await universalAudit.log({
      workspaceId,
      actorId: actorId ?? confirmedByUserId,
      actorType: 'user',
      changeType: 'create',
      action: 'COMPLIANCE:RENEWAL_CONFIRMED',
      entityType: 'employee_certification',
      entityId: newCert.id,
      entityName: `Employee ${employeeId} license renewal`,
      metadata: {
        employeeId,
        previousCertId: certId,
        newCertId: newCert.id,
        previousExpirationDate: existingCert.expirationDate?.toISOString() ?? null,
        newExpirationDate: newExpiry.toISOString(),
        newLicenseNumber: newLicenseNumber ?? null,
        confirmedByUserId,
        schedulingEligibleAfterRenewal: newStatus.eligible,
        historyPreserved: true,
      },
    });

    await createNotification({
      workspaceId,
      userId: confirmedByUserId,
      type: 'compliance_alert',
      title: `License Renewal Confirmed — Employee ${employeeId}`,
      message: `Guard card renewal confirmed. New expiration: ${newExpiry.toLocaleDateString()}. Previous record archived (ID: ${certId}). Scheduling eligibility ${newStatus.eligible ? 'RESTORED' : 'still blocked — verify cert data'}.`,
      actionUrl: '/compliance-scenarios',
      relatedEntityType: 'employee',
      relatedEntityId: employeeId,
      createdBy: 'trinity-compliance-engine',
    });

    return res.json({
      success: true,
      message: 'Renewal confirmed — previous cert archived, new active cert created',
      newCert,
      archivedCertId: certId,
      schedulingEligibility: newStatus,
    });
  } catch (err: unknown) {
    log.error('[ComplianceRenewal] Confirm renewal error:', err);
    return res.status(500).json({ message: 'Failed to confirm renewal', error: sanitizeError(err) });
  }
});

// ── S6: Manager approves out-of-state license with documented reason ────────
const outOfStateOverrideSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
  approvedByUserId: z.string().min(1),
  overrideExpiresAt: z.string().optional(),
});

router.post('/override-out-of-state/:employeeId', requireAuth, async (req, res) => {
  try {
    const workspaceId = req.workspaceId as string;
    const actorId = req.user?.id as string;
    const { employeeId } = req.params;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace context required' });

    const parsed = outOfStateOverrideSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid body', errors: parsed.error.flatten() });
    const { reason, approvedByUserId, overrideExpiresAt } = parsed.data;

    const outOfStateCheck = await detectOutOfStateLicense(employeeId, workspaceId);
    if (!outOfStateCheck.hasOutOfStateLicense) {
      return res.status(400).json({ message: 'No out-of-state license detected for this employee', outOfStateCheck });
    }

    const expiresAt = overrideExpiresAt ? new Date(overrideExpiresAt) : null;

    await universalAudit.log({
      workspaceId,
      actorId: actorId ?? approvedByUserId,
      actorType: 'user',
      // @ts-expect-error — TS migration: fix in refactoring sprint
      changeType: 'override',
      action: 'COMPLIANCE:OUT_OF_STATE_LICENSE_APPROVED',
      entityType: 'employee',
      entityId: employeeId,
      entityName: `Employee ${employeeId} out-of-state license override`,
      metadata: {
        employeeId,
        issuingState: outOfStateCheck.issuingState,
        licenseNumber: outOfStateCheck.licenseNumber,
        reason,
        approvedByUserId,
        overrideExpiresAt: expiresAt?.toISOString() ?? null,
        note: outOfStateCheck.note,
      },
    });

    await createNotification({
      workspaceId,
      userId: approvedByUserId,
      type: 'compliance_alert',
      title: `Out-of-State License Override Logged`,
      message: `Manager approval documented for ${outOfStateCheck.issuingState} license (${outOfStateCheck.licenseNumber ?? 'N/A'}). Reason: ${reason}`,
      actionUrl: '/compliance-scenarios',
      relatedEntityType: 'employee',
      relatedEntityId: employeeId,
      createdBy: 'trinity-compliance-engine',
    });

    return res.json({
      success: true,
      message: 'Out-of-state license override documented and logged to audit trail',
      overrideDetails: {
        employeeId,
        issuingState: outOfStateCheck.issuingState,
        licenseNumber: outOfStateCheck.licenseNumber,
        reason,
        approvedByUserId,
        overrideExpiresAt: expiresAt?.toISOString() ?? null,
        auditedAt: new Date().toISOString(),
      },
    });
  } catch (err: unknown) {
    log.error('[ComplianceOverride] Out-of-state override error:', err);
    return res.status(500).json({ message: 'Failed to log override', error: sanitizeError(err) });
  }
});

export default router;
