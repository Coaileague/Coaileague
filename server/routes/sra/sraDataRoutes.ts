/**
 * SRA Data Access Routes (Read-Only) — Phase 33
 * All routes require a valid SRA session. All access is logged.
 *
 * GET /api/sra/data/workspace         — Workspace overview (no financials)
 * GET /api/sra/data/officers          — Active officer roster
 * GET /api/sra/data/officer/:id       — Single officer detail
 * GET /api/sra/data/compliance        — Compliance documents
 * GET /api/sra/data/incidents         — Security incidents for audit period
 * GET /api/sra/data/occupation-codes  — State-specific occupation code autocomplete (Check 19)
 */

import { Router, Response } from 'express';
import { db } from '../../db';
import { securityIncidents, complianceDocuments, workspaces, employees } from '@shared/schema';
import { eq, and, gte } from 'drizzle-orm';
import { requireSRAAuth, SRARequest, logSraAction } from '../../middleware/sraAuth';
import { getStateConfigStatic } from '../../services/compliance/stateRegulatoryKnowledgeBase';
import { createLogger } from '../../lib/logger';
const log = createLogger('SraDataRoutes');


const router = Router();

// ── GET /api/sra/data/workspace ───────────────────────────────────────────────

router.get('/workspace', requireSRAAuth, async (req: SRARequest, res: Response) => {
  const { sraSession } = req;
  if (!sraSession) return res.status(401).json({ success: false });

  try {
    const [workspace] = await db.select({
      id: workspaces.id,
      name: workspaces.name,
      companyName: workspaces.companyName,
      subscriptionTier: workspaces.subscriptionTier,
      stateLicenseState: workspaces.stateLicenseState,
      stateLicenseNumber: workspaces.stateLicenseNumber,
      stateLicenseExpiry: workspaces.stateLicenseExpiry,
      stateLicenseVerified: workspaces.stateLicenseVerified,
      address: workspaces.address,
      phone: workspaces.phone,
      website: workspaces.website,
      createdAt: workspaces.createdAt,
    })
    .from(workspaces)
    .where(eq(workspaces.id, sraSession.workspaceId))
    .limit(1);

    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace not found.' });
    }

    await logSraAction(sraSession.sessionId, sraSession.sraAccountId, sraSession.workspaceId, 'data_view', { resource: 'workspace' }, req);
    return res.json({ success: true, data: workspace });
  } catch (err) {
    log.error('[SRA Data] Workspace error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load workspace.' });
  }
});

// ── GET /api/sra/data/officers ────────────────────────────────────────────────

router.get('/officers', requireSRAAuth, async (req: SRARequest, res: Response) => {
  const { sraSession } = req;
  if (!sraSession) return res.status(401).json({ success: false });

  try {
    const officerList = await db.select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: employees.email,
      phone: employees.phone,
      role: employees.role,
      position: employees.position,
      isActive: employees.isActive,
      status: employees.status,
      hireDate: employees.hireDate,
      isArmed: employees.isArmed,
      armedLicenseVerified: employees.armedLicenseVerified,
      guardCardVerified: employees.guardCardVerified,
      guardCardNumber: employees.guardCardNumber,
      guardCardIssueDate: employees.guardCardIssueDate,
      guardCardExpiryDate: employees.guardCardExpiryDate,
      licenseType: employees.licenseType,
      fullLegalName: employees.fullLegalName,
      schedulingScore: employees.schedulingScore,
    })
    .from(employees)
    .where(and(
      eq(employees.workspaceId, sraSession.workspaceId),
      eq(employees.isActive, true)
    ))
    .orderBy(employees.lastName);

    const stateConfig = getStateConfigStatic(sraSession.stateCode);

    await logSraAction(sraSession.sessionId, sraSession.sraAccountId, sraSession.workspaceId, 'data_view', {
      resource: 'officers',
      count: officerList.length,
    }, req);

    return res.json({
      success: true,
      data: officerList,
      stateRequirements: stateConfig ? {
        requiredTrainingHours: stateConfig.requiredTrainingHours,
        licenseRenewalPeriodMonths: stateConfig.licenseRenewalPeriodMonths,
      } : null,
    });
  } catch (err) {
    log.error('[SRA Data] Officers error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load officer roster.' });
  }
});

// ── GET /api/sra/data/officer/:id ─────────────────────────────────────────────

router.get('/officer/:id', requireSRAAuth, async (req: SRARequest, res: Response) => {
  const { sraSession } = req;
  if (!sraSession) return res.status(401).json({ success: false });
  const { id } = req.params;

  try {
    const [officer] = await db.select()
      .from(employees)
      .where(and(eq(employees.id, id), eq(employees.workspaceId, sraSession.workspaceId)))
      .limit(1);

    if (!officer) return res.status(404).json({ success: false, error: 'Officer not found.' });

    await logSraAction(sraSession.sessionId, sraSession.sraAccountId, sraSession.workspaceId, 'data_view', {
      resource: 'officer',
      resourceId: id,
    }, req);

    return res.json({ success: true, data: officer });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to load officer.' });
  }
});

// ── GET /api/sra/data/compliance ──────────────────────────────────────────────

router.get('/compliance', requireSRAAuth, async (req: SRARequest, res: Response) => {
  const { sraSession } = req;
  if (!sraSession) return res.status(401).json({ success: false });

  try {
    const docs = await db.select({
      id: complianceDocuments.id,
      employeeId: complianceDocuments.employeeId,
      documentName: complianceDocuments.documentName,
      documentNumber: complianceDocuments.documentNumber,
      issuingAuthority: complianceDocuments.issuingAuthority,
      issuedDate: complianceDocuments.issuedDate,
      expirationDate: complianceDocuments.expirationDate,
      status: complianceDocuments.status,
      verifiedAt: complianceDocuments.verifiedAt,
    })
    .from(complianceDocuments)
    .where(eq(complianceDocuments.workspaceId, sraSession.workspaceId))
    .orderBy(complianceDocuments.expirationDate);

    await logSraAction(sraSession.sessionId, sraSession.sraAccountId, sraSession.workspaceId, 'data_view', {
      resource: 'compliance_documents',
      count: docs.length,
    }, req);

    return res.json({ success: true, data: docs });
  } catch (err) {
    log.error('[SRA Data] Compliance error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load compliance documents.' });
  }
});

// ── GET /api/sra/data/incidents ───────────────────────────────────────────────

router.get('/incidents', requireSRAAuth, async (req: SRARequest, res: Response) => {
  const { sraSession } = req;
  if (!sraSession) return res.status(401).json({ success: false });

  try {
    const periodStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const incidentList = await db.select({
      id: securityIncidents.id,
      type: securityIncidents.type,
      severity: securityIncidents.severity,
      status: securityIncidents.status,
      description: securityIncidents.description,
      location: securityIncidents.location,
      reportedAt: securityIncidents.reportedAt,
      resolvedAt: securityIncidents.resolvedAt,
      employeeId: securityIncidents.employeeId,
    })
    .from(securityIncidents)
    .where(and(
      eq(securityIncidents.workspaceId, sraSession.workspaceId),
      gte(securityIncidents.reportedAt, periodStart)
    ))
    .orderBy(securityIncidents.reportedAt);

    await logSraAction(sraSession.sessionId, sraSession.sraAccountId, sraSession.workspaceId, 'data_view', {
      resource: 'incidents',
      count: incidentList.length,
    }, req);

    return res.json({ success: true, data: incidentList });
  } catch (err) {
    log.error('[SRA Data] Incidents error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load incidents.' });
  }
});

// ── GET /api/sra/data/occupation-codes ───────────────────────────────────────
// Check 19: State-specific occupation code autocomplete
// Returns the license types (which serve as occupation codes in security guard regulation)
// for the auditor's state, pulled directly from stateRegulatoryKnowledgeBase.

router.get('/occupation-codes', requireSRAAuth, async (req: SRARequest, res: Response) => {
  const { sraSession } = req;
  if (!sraSession) return res.status(401).json({ success: false });

  try {
    const stateConfig = getStateConfigStatic(sraSession.stateCode);

    if (!stateConfig) {
      return res.json({
        success: true,
        stateCode: sraSession.stateCode,
        occupationCodes: [],
        note: `No occupation code data available for state ${sraSession.stateCode}. Contact your regulatory agency for the official code list.`,
      });
    }

    // Map state license types to occupation code format for the finding form autocomplete
    const occupationCodes = stateConfig.licenseTypes.map((lt) => ({
      code: lt.code,
      label: `${lt.code} — ${lt.name}`,
      description: lt.description,
      armedAllowed: lt.armedAllowed,
      trainingHoursRequired: lt.trainingHoursRequired,
    }));

    return res.json({
      success: true,
      stateCode: sraSession.stateCode,
      stateName: stateConfig.stateName,
      regulatoryBody: stateConfig.regulatoryBody,
      occupationCodes,
    });
  } catch (err) {
    log.error('[SRA Data] Occupation codes error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load occupation codes.' });
  }
});

export default router;
