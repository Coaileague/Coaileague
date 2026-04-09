import { Router, Request, Response } from "express";
import { db } from "../../db";
import {
  complianceStates,
  employees,
  complianceDocuments,
  complianceAuditTrail,
  complianceRegulatorAccess,
  employeeComplianceRecords,
} from '@shared/schema';
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireAuth } from "../../auth";
import crypto from "crypto";
import { typedExec, typedQuery } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('Regulator');


const router = Router();

function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('[Regulator Access] SESSION_SECRET is required for secure token operations');
  }
  return secret;
}

function generateShortLivedToken(accessId: string): string {
  const timestamp = Date.now();
  const payload = `${accessId}:${timestamp}`;
  const signature = crypto.createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('hex')
    .substring(0, 16);
  return Buffer.from(`${payload}:${signature}`).toString('base64url');
}

function validateShortLivedToken(token: string): { accessId: string; valid: boolean; error?: string } {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const parts = decoded.split(':');
    if (parts.length !== 3) {
      return { accessId: '', valid: false, error: 'Invalid token format' };
    }
    const [accessId, timestampStr, signature] = parts;
    const timestamp = parseInt(timestampStr, 10);
    
    const tokenAge = Date.now() - timestamp;
    const maxAge = 24 * 60 * 60 * 1000;
    if (tokenAge > maxAge) {
      return { accessId, valid: false, error: 'Token expired' };
    }
    
    const expectedPayload = `${accessId}:${timestampStr}`;
    const expectedSignature = crypto.createHmac('sha256', getSessionSecret())
      .update(expectedPayload)
      .digest('hex')
      .substring(0, 16);
    
    if (signature !== expectedSignature) {
      return { accessId, valid: false, error: 'Invalid signature' };
    }
    
    return { accessId, valid: true };
  } catch (error) {
    return { accessId: '', valid: false, error: 'Token validation failed' };
  }
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }
    
    // Converted to Drizzle ORM: ORDER BY → .orderBy()
    const accessRows = await db.select({
      id: complianceRegulatorAccess.id,
      workspaceId: complianceRegulatorAccess.workspaceId,
      regulatorName: complianceRegulatorAccess.regulatorName,
      regulatorEmail: complianceRegulatorAccess.regulatorEmail,
      regulatorOrganization: (complianceRegulatorAccess as any).regulatorOrganization,
      grantedBy: complianceRegulatorAccess.grantedBy,
      expiresAt: complianceRegulatorAccess.expiresAt,
      createdAt: complianceRegulatorAccess.createdAt,
      lastAccessedAt: complianceRegulatorAccess.lastAccessedAt
    })
      .from(complianceRegulatorAccess)
      .where(eq(complianceRegulatorAccess.workspaceId, workspaceId))
      .orderBy(sql`${complianceRegulatorAccess.expiresAt} DESC NULLS LAST`);
    
    res.json({ success: true, regulatorAccess: accessRows });
  } catch (error) {
    log.error("[Regulator Access] Error fetching access:", error);
    res.status(500).json({ success: false, error: "Failed to fetch regulator access" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }
    
    const { 
      stateId, 
      regulatorName, 
      regulatorEmail, 
      regulatorTitle,
      regulatorBadgeNumber,
      regulatorOrganization,
      accessLevel = 'view_only',
      expiresInDays = 30,
      employeeIds,
      canViewAllEmployees = false,
      canExportDocuments = false,
      canGeneratePackets = false
    } = req.body;
    
    const oneTimeSecret = generateSecureToken();
    const secretHash = hashToken(oneTimeSecret);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    
    // CATEGORY C — Raw SQL retained: schema mismatch (SQL has state_id/regulator_title/regulator_badge_number/token_hash/access_level/employee_ids/can_view_all_employees etc. not in Drizzle schema) | Tables: compliance_regulator_access | Verified: 2026-03-23
    const result = await typedQuery(sql`
      INSERT INTO compliance_regulator_access (
        workspace_id, state_id, regulator_name, regulator_email, regulator_title,
        regulator_badge_number, regulator_organization, access_level,
        token_hash, granted_by, expires_at, employee_ids, can_view_all_employees,
        can_export_documents, can_generate_packets
      ) VALUES (
        ${workspaceId}, ${stateId}, ${regulatorName}, ${regulatorEmail}, ${regulatorTitle || null},
        ${regulatorBadgeNumber || null}, ${regulatorOrganization || null}, ${accessLevel},
        ${secretHash}, ${userId}, ${expiresAt.toISOString()}, ${employeeIds ? `{${employeeIds.join(',')}}` : null}, ${canViewAllEmployees},
        ${canExportDocuments}, ${canGeneratePackets}
      ) RETURNING *
    `);
    
    const accessId = (result[0] as any)?.id;
    const shortLivedToken = generateShortLivedToken(accessId);
    
    // CATEGORY C — Raw SQL retained: ::jsonb | Tables: compliance_audit_trail | Verified: 2026-03-23
    await db.insert(complianceAuditTrail).values({
      workspaceId: workspaceId,
      action: 'regulator_access_granted',
      performedBy: userId,
      regulatorAccessId: accessId,
      metadata: { action_type: 'create', target_type: 'regulator_access', severity: 'high', regulatorName, regulatorEmail, stateId, expiresAt: expiresAt.toISOString() },
    });
    
    res.json({ 
      success: true, 
      access: result[0],
      portalUrl: `/regulator-portal/${shortLivedToken}`
    });
  } catch (error) {
    log.error("[Regulator Access] Error creating access:", error);
    res.status(500).json({ success: false, error: "Failed to create regulator access" });
  }
});

router.post("/:id/revoke", requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    const { id } = req.params;
    const { reason } = req.body;
    
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }
    
    // CATEGORY C — Genuine schema mismatch: is_revoked, revoked_at, revoked_by, revoke_reason columns not in Drizzle schema for compliance_regulator_access
    await typedExec(sql`
      UPDATE compliance_regulator_access
      SET is_revoked = true, revoked_at = NOW(), revoked_by = ${userId}, revoke_reason = ${reason || null}
      WHERE id = ${id} AND workspace_id = ${workspaceId}
    `);
    
    // CATEGORY C — Raw SQL retained: ::jsonb | Tables: compliance_audit_trail | Verified: 2026-03-23
    await db.insert(complianceAuditTrail).values({
      workspaceId: workspaceId,
      action: 'regulator_access_revoked',
      performedBy: userId,
      regulatorAccessId: id,
      metadata: { action_type: 'update', target_type: 'regulator_access', severity: 'high', reason },
    });
    
    res.json({ success: true, message: "Regulator access revoked" });
  } catch (error) {
    log.error("[Regulator Access] Error revoking access:", error);
    res.status(500).json({ success: false, error: "Failed to revoke access" });
  }
});

router.get("/portal/:token", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    const validation = validateShortLivedToken(token);
    if (!validation.valid) {
      // CATEGORY C — Raw SQL retained: ::jsonb | Tables: compliance_audit_trail | Verified: 2026-03-23
      await db.insert(complianceAuditTrail).values({
        workspaceId: null,
        action: 'regulator_portal_access_failed',
        regulatorAccessId: validation.accessId || null,
        metadata: { action_type: 'read', target_type: 'regulator_access', severity: 'high', error: validation.error, ip: req.ip, timestamp: new Date().toISOString() },
      });
      return res.status(401).json({ success: false, error: validation.error || "Invalid or expired access token" });
    }
    
    // Converted to Drizzle ORM: LEFT JOIN → db.leftJoin()
    const accessRows = await db.select({
      id: complianceRegulatorAccess.id,
      workspaceId: complianceRegulatorAccess.workspaceId,
      stateId: (complianceRegulatorAccess as any).stateId,
      regulatorName: complianceRegulatorAccess.regulatorName,
      regulatorEmail: complianceRegulatorAccess.regulatorEmail,
      regulatorOrganization: (complianceRegulatorAccess as any).regulatorOrganization,
      accessLevel: (complianceRegulatorAccess as any).accessLevel,
      expiresAt: complianceRegulatorAccess.expiresAt,
      canExportDocuments: (complianceRegulatorAccess as any).canExportDocuments,
      canGeneratePackets: (complianceRegulatorAccess as any).canGeneratePackets,
      stateCode: complianceStates.stateCode,
      stateName: complianceStates.stateName,
      regulatoryBody: complianceStates.regulatoryBody,
      regulatoryBodyAcronym: complianceStates.regulatoryBodyAcronym
    })
      .from(complianceRegulatorAccess)
      .leftJoin(complianceStates, eq(complianceRegulatorAccess.stateId, complianceStates.id))
      .where(eq(complianceRegulatorAccess.id, validation.accessId))
      .limit(1);
    
    const access = accessRows[0];
    
    if (!access) {
      return res.status(404).json({ success: false, error: "Access record not found" });
    }
    
    if (access.isRevoked) {
      return res.status(403).json({ success: false, error: "Access has been revoked" });
    }
    
    if (access.expiresAt && new Date(access.expiresAt) < new Date()) {
      return res.status(403).json({ success: false, error: "Access has expired" });
    }
    
    // CATEGORY C — Genuine schema mismatch: access_count column not in Drizzle schema for compliance_regulator_access
    await typedExec(sql`
      UPDATE compliance_regulator_access
      SET last_accessed_at = NOW(), access_count = access_count + 1
      WHERE id = ${access.id}
    `);
    
    // CATEGORY C — Raw SQL retained: ::jsonb | Tables: compliance_audit_trail | Verified: 2026-03-23
    await db.insert(complianceAuditTrail).values({
      workspaceId: access.workspaceId,
      action: 'regulator_portal_accessed',
      regulatorAccessId: access.id,
      metadata: { 
          action_type: 'read', target_type: 'regulator_access', severity: 'medium',
          regulatorName: access.regulatorName, 
          ip: req.ip, 
          timestamp: new Date().toISOString(),
          accessCount: (access.accessCount || 0) + 1
        },
    });
    
    let employeeRecords;
    if (access.canViewAllEmployees) {
      employeeRecords = await db.select({
        record: employeeComplianceRecords,
        employee: employees
      })
        .from(employeeComplianceRecords)
        .leftJoin(employees, eq(employeeComplianceRecords.employeeId, employees.id))
        .where(and(
          eq(employeeComplianceRecords.workspaceId, access.workspaceId),
          eq(employeeComplianceRecords.stateId, access.stateId)
        ));
    } else if (access.employeeIds?.length) {
      employeeRecords = await db.select({
        record: employeeComplianceRecords,
        employee: employees
      })
        .from(employeeComplianceRecords)
        .leftJoin(employees, eq(employeeComplianceRecords.employeeId, employees.id))
        .where(and(
          eq(employeeComplianceRecords.workspaceId, access.workspaceId),
          eq(employeeComplianceRecords.stateId, access.stateId),
          inArray(employeeComplianceRecords.employeeId, (access as any).employeeIds)
        ));
    } else {
      employeeRecords = [];
    }
    
    res.json({ 
      success: true, 
      access: {
        regulatorName: access.regulatorName,
        regulatorOrganization: access.regulatorOrganization,
        stateCode: access.stateCode,
        stateName: access.stateName,
        regulatoryBody: access.regulatoryBody,
        regulatoryBodyAcronym: access.regulatoryBodyAcronym,
        accessLevel: access.accessLevel,
        expiresAt: access.expiresAt,
        canExportDocuments: access.canExportDocuments,
        canGeneratePackets: access.canGeneratePackets
      },
      employees: employeeRecords.map(r => ({
        id: r.employee?.id,
        firstName: r.employee?.firstName,
        lastName: r.employee?.lastName,
        complianceScore: r.record.complianceScore,
        overallStatus: r.record.overallStatus,
        vaultLocked: r.record.vaultLocked,
        totalRequirements: r.record.totalRequirements,
        completedRequirements: r.record.completedRequirements
      }))
    });
  } catch (error) {
    log.error("[Regulator Portal] Error:", error);
    res.status(500).json({ success: false, error: "Failed to access portal" });
  }
});

router.get("/portal/:token/employee/:employeeId/documents", async (req: Request, res: Response) => {
  try {
    const { token, employeeId } = req.params;
    
    const validation = validateShortLivedToken(token);
    if (!validation.valid) {
      return res.status(401).json({ success: false, error: validation.error || "Invalid or expired access token" });
    }
    
    // Converted to Drizzle ORM: IS NOT NULL
    const accessRows = await db.select()
      .from(complianceRegulatorAccess)
      .where(and(
        eq(complianceRegulatorAccess.id, validation.accessId),
        eq(complianceRegulatorAccess.isRevoked, false),
        sql`${complianceRegulatorAccess.expiresAt} > NOW()`
      ))
      .limit(1);
    
    const access = accessRows[0];
    
    if (!access) {
      return res.status(403).json({ success: false, error: "Invalid or expired access" });
    }
    
    // Converted to Drizzle ORM: Multi-condition compliance record lookup
    const employeeRecordRows = await db.select({ id: employeeComplianceRecords.id })
      .from(employeeComplianceRecords)
      .where(and(
        eq(employeeComplianceRecords.employeeId, employeeId),
        eq(employeeComplianceRecords.workspaceId, access.workspaceId!),
        eq(employeeComplianceRecords.stateId, (access as any).stateId!)
      ))
      .limit(1);
    
    if (!employeeRecordRows.length) {
      // CATEGORY C — Raw SQL retained: not in | Tables: compliance_audit_trail | Verified: 2026-03-23
      await db.insert(complianceAuditTrail).values({
        workspaceId: access.workspaceId!,
        action: 'regulator_documents_denied',
        regulatorAccessId: access.id,
        metadata: { 
            action_type: 'read', target_type: 'compliance_document', severity: 'high',
            regulatorName: access.regulatorName, 
            employeeId,
            reason: 'Employee not in authorized workspace/state',
            ip: req.ip, 
            timestamp: new Date().toISOString()
          },
      });
      return res.status(403).json({ success: false, error: "Employee not in authorized scope" });
    }
    
    if (!(access as any).canViewAllEmployees && !(access as any).employeeIds?.includes(employeeId)) {
      return res.status(403).json({ success: false, error: "Access denied for this employee" });
    }
    
    const documents = await db.select()
      .from(complianceDocuments)
      .where(and(
        eq(complianceDocuments.employeeId, employeeId),
        eq(complianceDocuments.workspaceId, access.workspaceId!),
        eq(complianceDocuments.status, 'approved'),
        eq(complianceDocuments.isLocked, true)
      ));
    
    // CATEGORY C — Raw SQL retained: ::jsonb | Tables: compliance_audit_trail | Verified: 2026-03-23
    await db.insert(complianceAuditTrail).values({
      workspaceId: access.workspaceId!,
      action: 'regulator_documents_viewed',
      regulatorAccessId: access.id,
      metadata: { 
          action_type: 'read', target_type: 'compliance_document', severity: 'medium',
          regulatorName: access.regulatorName, 
          employeeId,
          documentCount: documents.length,
          ip: req.ip, 
          timestamp: new Date().toISOString()
        },
    });
    
    res.json({ 
      success: true, 
      documents: documents.map(d => ({
        id: d.id,
        documentTypeName: d.documentName,
        status: d.status,
        isLocked: d.isLocked,
        expirationDate: d.expirationDate,
        fileHash: d.fileHashSha256,
        createdAt: d.createdAt
      }))
    });
  } catch (error) {
    log.error("[Regulator Portal] Error fetching documents:", error);
    res.status(500).json({ success: false, error: "Failed to fetch documents" });
  }
});

export const regulatorRoutes = router;
