import { Router, Request, Response } from "express";
import { db } from "../../db";
import {
  complianceAuditPackets,
  complianceAuditTrail,
  complianceDocuments,
  complianceStates,
  employeeComplianceRecords,
  employees,
  officerTrainingAttempts,
  officerTrainingCertificates,
  trainingModules
} from '@shared/schema';
import { eq, and, sql, inArray, desc } from "drizzle-orm";
import { requireAuth } from "../../auth";
import { mutationLimiter } from "../../middleware/rateLimiter";
import crypto from "crypto";
import { typedExec, typedQuery } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('Packets');


const router = Router();

function generatePacketHash(documents: any[]): string {
  const docHashes = documents.map(d => d.fileHashSha256 || d.file_hash_sha256 || '').sort().join('|');
  return crypto.createHash('sha256').update(docHashes).digest('hex');
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || (req.user as any)?.workspaceId || (req.user as any)?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }
    
    // Converted to Drizzle ORM: LEFT JOIN → db.leftJoin()
    const packetsRows = await db.select({
      id: complianceAuditPackets.id,
      workspaceId: complianceAuditPackets.workspaceId,
      packetName: complianceAuditPackets.packetName,
      description: complianceAuditPackets.description,
      employeesIncluded: complianceAuditPackets.employeesIncluded,
      generatedAt: complianceAuditPackets.generatedAt,
      stateCode: complianceStates.stateCode,
      stateName: complianceStates.stateName
    })
      .from(complianceAuditPackets)
      .leftJoin(complianceStates, eq(complianceAuditPackets.stateId, complianceStates.id))
      .where(eq(complianceAuditPackets.workspaceId, workspaceId))
      .orderBy(desc(complianceAuditPackets.generatedAt));
    
    res.json({ success: true, packets: packetsRows });
  } catch (error) {
    log.error("[Compliance Packets] Error fetching packets:", error);
    res.status(500).json({ success: false, error: "Failed to fetch compliance packets" });
  }
});

router.post("/generate", requireAuth, mutationLimiter, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || (req.user as any)?.workspaceId || (req.user as any)?.currentWorkspaceId;
    const userId = (req.user as any)?.id;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }
    
    const { 
      stateId, 
      employeeIds,
      packetName,
      description
    } = req.body;
    
    if (!stateId || !employeeIds?.length) {
      return res.status(400).json({ success: false, error: "State and employees required" });
    }
    
    const startTime = Date.now();
    
    const stateResult = await db.select().from(complianceStates)
      .where(eq(complianceStates.id, stateId))
      .limit(1);
    const state = stateResult[0];
    
    if (!state) {
      return res.status(404).json({ success: false, error: "State not found" });
    }
    
    const employeeRecords = await db.select({
      employee: employees,
      record: employeeComplianceRecords
    })
      .from(employeeComplianceRecords)
      .leftJoin(employees, eq(employeeComplianceRecords.employeeId, employees.id))
      .where(and(
        eq(employeeComplianceRecords.workspaceId, workspaceId),
        eq(employeeComplianceRecords.stateId, stateId),
        inArray(employeeComplianceRecords.employeeId, employeeIds)
      ));
    
    const allDocuments = await db.select()
      .from(complianceDocuments)
      .where(and(
        eq(complianceDocuments.workspaceId, workspaceId),
        inArray(complianceDocuments.employeeId, employeeIds)
      ));
    
    const lockedApprovedDocuments = allDocuments.filter(d => 
      d.status === 'approved' && d.isLocked === true
    );
    
    const nonLockedApproved = allDocuments.filter(d => 
      d.status === 'approved' && d.isLocked !== true
    );
    
    if (nonLockedApproved.length > 0) {
      log.warn(`[Compliance Packets] ${nonLockedApproved.length} approved documents excluded - not locked (WORM)`);
    }
    
    const documentHashes: Record<string, string> = {};
    const hashDiscrepancies: string[] = [];
    
    for (const doc of lockedApprovedDocuments) {
      const storedHash = doc.fileHashSha256 || '';
      documentHashes[doc.id] = storedHash;
      
      if (!storedHash) {
        hashDiscrepancies.push(`Document ${doc.id} missing SHA-256 hash`);
      }
    }
    
    if (hashDiscrepancies.length > 0) {
      // CATEGORY C — Raw SQL retained: ::jsonb | Tables: compliance_audit_trail | Verified: 2026-03-23
      await db.insert(complianceAuditTrail).values({
        workspaceId: workspaceId,
        action: 'audit_packet_hash_warning',
        performedBy: userId,
        metadata: { 
            action_type: 'read', target_type: 'compliance_document', severity: 'high',
            discrepancies: hashDiscrepancies,
            timestamp: new Date().toISOString()
          },
      });
    }
    
    const packetHash = generatePacketHash(lockedApprovedDocuments);
    
    const generationTimeMs = Date.now() - startTime;
    
    // CATEGORY C — Raw SQL retained: schema mismatch (SQL has state_id/documents_included/packet_hash_sha256/document_hashes/generated_by/generation_time_ms not in Drizzle schema) | Tables: compliance_audit_packets | Verified: 2026-03-23
    const packetResult = await typedQuery(sql`
      INSERT INTO compliance_audit_packets (
        workspace_id, state_id, packet_name, description, 
        documents_included, employees_included, packet_hash_sha256,
        document_hashes, generated_by, generation_time_ms
      ) VALUES (
        ${workspaceId}, ${stateId}, ${packetName || `${state.stateCode} Compliance Packet - ${new Date().toISOString().split('T')[0]}`}, 
        ${description || null},
        ${lockedApprovedDocuments.length}, ${employeeRecords.length}, ${packetHash},
        JSON.stringify(documentHashes), ${userId}, ${generationTimeMs}
      ) RETURNING *
    `);
    
    const packet = packetResult[0] as any;
    
    // CATEGORY C — Raw SQL retained: ::jsonb | Tables: compliance_audit_trail | Verified: 2026-03-23
    await db.insert(complianceAuditTrail).values({
      workspaceId: workspaceId,
      action: 'audit_packet_generated',
      performedBy: userId,
      packetId: packet?.id,
      metadata: { 
          action_type: 'create', target_type: 'audit_packet', severity: 'high',
          stateId, 
          stateCode: state.stateCode,
          employeeCount: employeeRecords.length, 
          documentCount: lockedApprovedDocuments.length,
          excludedNonLocked: nonLockedApproved.length,
          packetHash,
          wormEnforced: true
        },
    });
    
    // Fetch training transcript for all employees in the packet
    const packetEmployeeIds = employeeRecords.map(er => er.employee?.id).filter(Boolean) as string[];
    let trainingCertsByEmployee: Map<string, any[]> = new Map();
    let trainingAttemptsByEmployee: Map<string, any[]> = new Map();
    if (packetEmployeeIds.length > 0) {
      try {
        const certs = await db
          .select({
            id: officerTrainingCertificates.id,
            employeeId: officerTrainingCertificates.employeeId,
            moduleId: officerTrainingCertificates.moduleId,
            certificateNumber: officerTrainingCertificates.certificateNumber,
            overallScore: officerTrainingCertificates.overallScore,
            isValid: officerTrainingCertificates.isValid,
            expiresAt: officerTrainingCertificates.expiresAt,
            createdAt: officerTrainingCertificates.createdAt,
            moduleTitle: trainingModules.title,
          })
          .from(officerTrainingCertificates)
          .leftJoin(trainingModules, eq(officerTrainingCertificates.moduleId, trainingModules.id))
          .where(and(
            eq(officerTrainingCertificates.workspaceId, workspaceId),
            inArray(officerTrainingCertificates.employeeId, packetEmployeeIds),
          ))
          .orderBy(desc(officerTrainingCertificates.createdAt));
        for (const cert of certs) {
          const list = trainingCertsByEmployee.get(cert.employeeId) || [];
          list.push(cert);
          trainingCertsByEmployee.set(cert.employeeId, list);
        }

        const attempts = await db
          .select({
            id: officerTrainingAttempts.id,
            employeeId: officerTrainingAttempts.employeeId,
            moduleId: officerTrainingAttempts.moduleId,
            passed: officerTrainingAttempts.passed,
            overallScore: officerTrainingAttempts.overallScore,
            completedAt: officerTrainingAttempts.completedAt,
            timeSpentSeconds: officerTrainingAttempts.timeSpentSeconds,
            moduleTitle: trainingModules.title,
          })
          .from(officerTrainingAttempts)
          .leftJoin(trainingModules, eq(officerTrainingAttempts.moduleId, trainingModules.id))
          .where(and(
            eq(officerTrainingAttempts.workspaceId, workspaceId),
            inArray(officerTrainingAttempts.employeeId, packetEmployeeIds),
          ))
          .orderBy(desc(officerTrainingAttempts.completedAt));
        for (const att of attempts) {
          const list = trainingAttemptsByEmployee.get(att.employeeId) || [];
          list.push(att);
          trainingAttemptsByEmployee.set(att.employeeId, list);
        }
      } catch (trainingErr) {
        log.warn('[Compliance Packets] Training transcript fetch failed (non-fatal):', trainingErr);
      }
    }

    const packetData = {
      id: packet?.id,
      packetName: packet?.packet_name,
      stateCode: state.stateCode,
      stateName: state.stateName,
      regulatoryBody: state.regulatoryBody,
      generatedAt: new Date().toISOString(),
      generatedBy: userId,
      employeeCount: employeeRecords.length,
      documentCount: lockedApprovedDocuments.length,
      excludedNonLocked: nonLockedApproved.length,
      packetHash,
      wormEnforced: true,
      employees: employeeRecords.map(er => {
        const empId = er.employee?.id || '';
        const empCerts = trainingCertsByEmployee.get(empId) || [];
        const empAttempts = trainingAttemptsByEmployee.get(empId) || [];
        const totalHours = Math.round(
          empAttempts.reduce((sum, a) => sum + (Number(a.timeSpentSeconds) || 0), 0) / 3600 * 10
        ) / 10;
        return {
          id: er.employee?.id,
          firstName: er.employee?.firstName,
          lastName: er.employee?.lastName,
          complianceScore: er.record.complianceScore,
          overallStatus: er.record.overallStatus,
          vaultLocked: er.record.vaultLocked,
          documents: lockedApprovedDocuments
            .filter(d => d.employeeId === er.employee?.id)
            .map(d => ({
              id: d.id,
              documentTypeName: d.documentTypeName,
              fileName: d.fileName,
              fileHash: d.fileHashSha256,
              isLocked: d.isLocked,
              approvedAt: d.approvedAt,
              expirationDate: d.expirationDate
            })),
          trainingTranscript: {
            totalHoursCompleted: totalHours,
            certificatesEarned: empCerts.length,
            certificates: empCerts.map(c => ({
              certificateNumber: c.certificateNumber,
              moduleTitle: c.moduleTitle,
              overallScore: c.overallScore,
              isValid: c.isValid,
              expiresAt: c.expiresAt,
              issuedAt: c.createdAt,
            })),
            failedAttempts: empAttempts.filter(a => !a.passed).length,
            attempts: empAttempts.map(a => ({
              moduleTitle: a.moduleTitle,
              passed: a.passed,
              overallScore: a.overallScore,
              completedAt: a.completedAt,
              timeSpentSeconds: a.timeSpentSeconds,
            })),
          },
        };
      }),
    };
    
    res.json({ 
      success: true, 
      packet: packetData,
      generationTimeMs
    });
  } catch (error) {
    log.error("[Compliance Packets] Error generating packet:", error);
    res.status(500).json({ success: false, error: "Failed to generate compliance packet" });
  }
});

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || (req.user as any)?.workspaceId || (req.user as any)?.currentWorkspaceId;
    const { id } = req.params;
    
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }
    
    // Converted to Drizzle ORM: LEFT JOIN → db.leftJoin()
    const packetsRows = await db.select({
      id: complianceAuditPackets.id,
      workspaceId: complianceAuditPackets.workspaceId,
      packetName: complianceAuditPackets.packetName,
      description: complianceAuditPackets.description,
      employeesIncluded: complianceAuditPackets.employeesIncluded,
      documentsIncluded: complianceAuditPackets.documentsIncluded,
      packetHashSha256: complianceAuditPackets.packetHashSha256,
      generatedBy: complianceAuditPackets.generatedBy,
      generationTimeMs: complianceAuditPackets.generationTimeMs,
      generatedAt: complianceAuditPackets.generatedAt,
      stateCode: complianceStates.stateCode,
      stateName: complianceStates.stateName,
      regulatoryBody: complianceStates.regulatoryBody
    })
      .from(complianceAuditPackets)
      .leftJoin(complianceStates, eq(complianceAuditPackets.stateId, complianceStates.id))
      .where(and(
        eq(complianceAuditPackets.id, id),
        eq(complianceAuditPackets.workspaceId, workspaceId)
      ))
      .limit(1);
    
    if (!packetsRows.length) {
      return res.status(404).json({ success: false, error: "Packet not found" });
    }
    
    res.json({ success: true, packet: packetsRows[0] });
  } catch (error) {
    log.error("[Compliance Packets] Error fetching packet:", error);
    res.status(500).json({ success: false, error: "Failed to fetch packet" });
  }
});

router.post("/:id/download", requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || (req.user as any)?.workspaceId || (req.user as any)?.currentWorkspaceId;
    const userId = (req.user as any)?.id;
    const { id } = req.params;
    
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }
    
    // CATEGORY C — Genuine schema mismatch: download_count and last_downloaded_at columns not in Drizzle schema for compliance_audit_packets
    await typedExec(sql`
      UPDATE compliance_audit_packets
      SET download_count = download_count + 1, last_downloaded_at = NOW()
      WHERE id = ${id} AND workspace_id = ${workspaceId}
    `);
    
    // CATEGORY C — Raw SQL retained: ::jsonb | Tables: compliance_audit_trail | Verified: 2026-03-23
    await db.insert(complianceAuditTrail).values({
      workspaceId: workspaceId,
      action: 'audit_packet_downloaded',
      performedBy: userId,
      packetId: id,
      metadata: { action_type: 'read', target_type: 'audit_packet', severity: 'medium', timestamp: new Date().toISOString() },
    });
    
    res.json({ success: true, message: "Download logged" });
  } catch (error) {
    log.error("[Compliance Packets] Error logging download:", error);
    res.status(500).json({ success: false, error: "Failed to log download" });
  }
});

export const packetsRoutes = router;
