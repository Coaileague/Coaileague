/**
 * Owner/Manager Employee Routes
 * 
 * API endpoints for ensuring owners, managers, and supervisors have employee records
 * and proper compliance tracking.
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { requireAuth, requireAnyAuth } from '../auth';
import { 
  ensureRoleHoldersAreEmployees, 
  ensureUserHasEmployeeRecord,
  getOrCreateEmployeeForUser,
  userHasEmployeeRecord,
  getRoleHoldersWithoutEmployeeRecords
} from '../services/ownerManagerEmployeeService';
import { db } from '../db';
import {
  employees,
  employeeSkills,
  users,
  employeeCertifications,
} from '@shared/schema';
import { universalAudit } from '../services/universalAuditService';
import { eq, and, isNull, lt, gte, isNotNull, or } from 'drizzle-orm';
import { getCertificationTypes, getCertificationType, getCertificationTypesForRole } from '@shared/config/certificationConfig';
import { addDays } from 'date-fns';
import { WORKSPACE_ROLE_LEVEL } from '@shared/config/rbac';
import { createLogger } from '../lib/logger';
import { z } from 'zod';
const log = createLogger('OwnerEmployee');


function hasManagerAccess(role: string | null | undefined): boolean {
  if (!role) return false;
  const level = WORKSPACE_ROLE_LEVEL[role as keyof typeof WORKSPACE_ROLE_LEVEL];
  return level !== undefined && level <= 3;
}

const router = Router();

/**
 * GET /api/owner-employee/status
 * Check if current user has an employee record
 */
router.get('/status', requireAnyAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || (req.user)?.claims?.sub || req.session?.userId;
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;

    if (!userId || !workspaceId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const hasRecord = await userHasEmployeeRecord(userId, workspaceId);
    
    let employee = null;
    if (hasRecord) {
      employee = await db.query.employees.findFirst({
        where: and(
          eq(employees.userId, userId),
          eq(employees.workspaceId, workspaceId)
        ),
      });
    }

    return res.json({
      hasEmployeeRecord: hasRecord,
      employee: employee ? {
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        role: employee.role,
        workspaceRole: employee.workspaceRole,
        organizationalTitle: employee.organizationalTitle,
        onboardingStatus: employee.onboardingStatus,
      } : null,
    });
  } catch (error: unknown) {
    log.error('[OwnerEmployeeRoute] Error checking status:', error);
    return res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/owner-employee/ensure
 * Ensure current user has an employee record (creates if needed)
 */
router.post('/ensure', requireAnyAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || (req.user)?.claims?.sub || req.session?.userId;
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;

    if (!userId || !workspaceId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const result = await ensureUserHasEmployeeRecord(userId, workspaceId);

    return res.json({
      success: true,
      action: result.action,
      employeeId: result.employeeId,
      details: result.details,
    });
  } catch (error: unknown) {
    log.error('[OwnerEmployeeRoute] Error ensuring employee record:', error);
    return res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/owner-employee/sync-role-holders
 * Sync all role holders in workspace to ensure they have employee records
 * Requires manager access
 */
router.post('/sync-role-holders', requireAnyAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || (req.user)?.claims?.sub || req.session?.userId;
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    const workspaceRole = req.workspaceRole || req.session?.workspaceRole;

    if (!userId || !workspaceId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!hasManagerAccess(workspaceRole)) {
      return res.status(403).json({ error: 'Manager access required' });
    }

    const result = await ensureRoleHoldersAreEmployees(workspaceId);

    return res.json({
      success: true,
      ...result,
    });
  } catch (error: unknown) {
    log.error('[OwnerEmployeeRoute] Error syncing role holders:', error);
    return res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/owner-employee/missing-records
 * Get list of role holders without employee records
 * Requires manager access
 */
router.get('/missing-records', requireAnyAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || (req.user)?.claims?.sub || req.session?.userId;
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    const workspaceRole = req.workspaceRole || req.session?.workspaceRole;

    if (!userId || !workspaceId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!hasManagerAccess(workspaceRole)) {
      return res.status(403).json({ error: 'Manager access required' });
    }

    const missing = await getRoleHoldersWithoutEmployeeRecords(workspaceId);

    return res.json({
      count: missing.length,
      roleHolders: missing,
    });
  } catch (error: unknown) {
    log.error('[OwnerEmployeeRoute] Error getting missing records:', error);
    return res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/owner-employee/compliance
 * Get compliance status for current user's employee record
 */
router.get('/compliance', requireAnyAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || (req.user)?.claims?.sub || req.session?.userId;
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;

    if (!userId || !workspaceId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const employee = await db.query.employees.findFirst({
      where: and(
        eq(employees.userId, userId),
        eq(employees.workspaceId, workspaceId)
      ),
    });

    if (!employee) {
      return res.json({
        hasEmployeeRecord: false,
        compliance: null,
      });
    }

    const today = new Date();
    const thirtyDaysFromNow = addDays(today, 30);

    const certifications = await db.select().from(employeeCertifications)
      .where(eq(employeeCertifications.employeeId, employee.id));

    const skills = await db.select().from(employeeSkills)
      .where(eq(employeeSkills.employeeId, employee.id));

    const expiringCerts = certifications.filter(c => 
      c.expirationDate && 
      c.expirationDate > today && 
      c.expirationDate <= thirtyDaysFromNow
    );

    const expiredCerts = certifications.filter(c => 
      c.expirationDate && c.expirationDate <= today
    );

    const expiringSkills = skills.filter(s => 
      s.expiresAt && 
      s.expiresAt > today && 
      s.expiresAt <= thirtyDaysFromNow
    );

    const expiredSkills = skills.filter(s => 
      s.expiresAt && s.expiresAt <= today
    );

    const complianceStatus = 
      (expiredCerts.length > 0 || expiredSkills.length > 0) ? 'expired' :
      (expiringCerts.length > 0 || expiringSkills.length > 0) ? 'expiring_soon' :
      'compliant';

    return res.json({
      hasEmployeeRecord: true,
      employeeId: employee.id,
      compliance: {
        status: complianceStatus,
        certifications: {
          total: certifications.length,
          expiring: expiringCerts.length,
          expired: expiredCerts.length,
          items: certifications.map(c => ({
            id: c.id,
            type: c.certificationType,
            name: c.certificationName,
            expirationDate: c.expirationDate,
            status: c.status,
          })),
        },
        skills: {
          total: skills.length,
          expiring: expiringSkills.length,
          expired: expiredSkills.length,
          items: skills.map(s => ({
            id: s.id,
            name: s.skillName,
            category: s.skillCategory,
            expiresAt: s.expiresAt,
            verified: s.verified,
          })),
        },
      },
    });
  } catch (error: unknown) {
    log.error('[OwnerEmployeeRoute] Error getting compliance:', error);
    return res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/owner-employee/certification-types
 * Get available certification types
 */
router.get('/certification-types', requireAnyAuth, async (req: Request, res: Response) => {
  try {
    const role = req.query.role as string | undefined;
    
    const types = role 
      ? getCertificationTypesForRole(role)
      : getCertificationTypes();

    return res.json({
      types,
      count: types.length,
    });
  } catch (error: unknown) {
    log.error('[OwnerEmployeeRoute] Error getting certification types:', error);
    return res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/owner-employee/certification
 * Add a certification to current user's employee record
 */
router.post('/certification', requireAnyAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || (req.user)?.claims?.sub || req.session?.userId;
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;

    if (!userId || !workspaceId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { employee, created } = await getOrCreateEmployeeForUser(userId, workspaceId);

    const {
      certificationType,
      certificationName,
      certificationNumber,
      issuingAuthority,
      issuedDate,
      expirationDate,
      documentUrl,
      notes,
    } = req.body;

    if (!certificationType || !certificationName) {
      return res.status(400).json({ error: 'Certification type and name are required' });
    }

    const [certification] = await db.insert(employeeCertifications)
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .values({
        workspaceId,
        employeeId: employee.id,
        certificationType,
        certificationName,
        certificationNumber: certificationNumber || null,
        issuingAuthority: issuingAuthority || null,
        issuedDate: issuedDate ? new Date(issuedDate) : null,
        expirationDate: expirationDate ? new Date(expirationDate) : null,
        documentUrl: documentUrl || null,
        notes: notes || null,
        status: 'pending',
      })
      .returning();

    await universalAudit.log({
      workspaceId,
      actorId: req.user?.id ?? 'system',
      actorType: 'user',
      changeType: 'create',
      action: 'COMPLIANCE:CERTIFICATION_ADDED',
      entityType: 'employee_certification',
      entityId: certification.id,
      entityName: `${certificationName} — Employee ${employee.id}`,
      metadata: {
        employeeId: employee.id,
        certificationType,
        certificationName,
        certificationNumber: certificationNumber || null,
        expirationDate: expirationDate || null,
        issuingAuthority: issuingAuthority || null,
        source: 'owner-employee-route',
      },
    }).catch(err => log.error('[OwnerEmployeeRoute] Audit log failed (non-blocking):', err));

    return res.json({
      success: true,
      certification,
      employeeCreated: created,
    });
  } catch (error: unknown) {
    log.error('[OwnerEmployeeRoute] Error adding certification:', error);
    return res.status(500).json({ error: sanitizeError(error) });
  }
});

export default router;
