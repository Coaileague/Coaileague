import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../../db";
import {
  complianceDocuments,
  complianceDocumentTypes,
  complianceChecklists,
  complianceExpirations,
  complianceAuditTrail,
} from '@shared/schema';
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../../auth";
import crypto from "crypto";
import { checkCategoryQuota, recordStorageUsage } from "../../services/storage/storageQuotaService";
import { platformEventBus } from "../../services/platformEventBus";
import { bridgeComplianceToEmployeeDocument, bridgeComplianceStatusChange } from "../../services/compliance/documentPipelineBridge";
import { createLogger } from '../../lib/logger';
const log = createLogger('ComplianceDocuments');


const createDocumentSchema = z.object({
  employeeId: z.string().min(1),
  complianceRecordId: z.string().optional(),
  requirementId: z.string().optional(),
  documentTypeId: z.string().optional(),
  documentName: z.string().min(1).max(500),
  documentNumber: z.string().max(200).optional(),
  issuingAuthority: z.string().max(500).optional(),
  issuedDate: z.string().optional(),
  expirationDate: z.string().optional(),
  imageSide: z.enum(['front', 'back', 'both']).optional(),
  isColorImage: z.boolean().optional(),
  storageKey: z.string().optional(),
  storageUrl: z.string().optional(),
  fileName: z.string().optional(),
  fileType: z.string().optional(),
  fileSizeBytes: z.number().optional(),
  fileContent: z.string().optional(),
  fileHashSha256: z.string().optional(),
  fileHashMd5: z.string().optional(),
  isSubstitute: z.boolean().optional(),
  substituteFor: z.string().optional(),
  substituteNote: z.string().optional(),
});

const lockDocumentSchema = z.object({
  lockReason: z.string().max(1000).optional(),
});

const updateDocumentSchema = z.object({
  status: z.string().max(50).optional(),
  reviewNotes: z.string().max(5000).optional(),
  documentNumber: z.string().max(200).optional(),
  issuingAuthority: z.string().max(500).optional(),
});

const validateRequirementsSchema = z.object({
  documentTypeId: z.string().min(1),
  imageSide: z.enum(['front', 'back', 'both']).optional(),
  isColorImage: z.boolean().optional(),
});

const verifyHashSchema = z.object({
  currentHash: z.string().min(1),
});

const router = Router();

router.get("/employee/:employeeId", requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || (req.user as any)?.workspaceId || (req.user as any)?.currentWorkspaceId;
    const { employeeId } = req.params;
    
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }
    
    const documents = await db.select({
      id: complianceDocuments.id,
      employeeId: complianceDocuments.employeeId,
      documentTypeId: complianceDocuments.documentTypeId,
      documentTypeName: complianceDocumentTypes.typeName,
      documentName: complianceDocuments.documentName,
      fileName: complianceDocuments.fileName,
      status: complianceDocuments.status,
      isLocked: complianceDocuments.isLocked,
      isColorImage: complianceDocuments.isColorImage,
      imageSide: complianceDocuments.imageSide,
      expirationDate: complianceDocuments.expirationDate,
      fileHash: complianceDocuments.fileHashSha256,
      createdAt: complianceDocuments.createdAt
    })
      .from(complianceDocuments)
      .leftJoin(complianceDocumentTypes, eq(complianceDocuments.documentTypeId, complianceDocumentTypes.id))
      .where(and(
        eq(complianceDocuments.workspaceId, workspaceId),
        eq(complianceDocuments.employeeId, employeeId)
      ));
    
    res.json({ success: true, documents });
  } catch (error) {
    log.error("[Compliance Documents] Error fetching by employee:", error);
    res.status(500).json({ success: false, error: "Failed to fetch documents" });
  }
});

router.get("/record/:recordId", requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || (req.user as any)?.workspaceId || (req.user as any)?.currentWorkspaceId;
    const { recordId } = req.params;
    
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }
    
    const documents = await db.select({
      document: complianceDocuments,
      documentType: complianceDocumentTypes
    })
      .from(complianceDocuments)
      .leftJoin(complianceDocumentTypes, eq(complianceDocuments.documentTypeId, complianceDocumentTypes.id))
      .where(and(
        eq(complianceDocuments.workspaceId, workspaceId),
        eq(complianceDocuments.complianceRecordId, recordId)
      ));
    
    res.json({ success: true, documents });
  } catch (error) {
    log.error("[Compliance Documents] Error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch documents" });
  }
});

router.get("/:documentId", requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || (req.user as any)?.workspaceId || (req.user as any)?.currentWorkspaceId;
    const { documentId } = req.params;
    
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }
    
    const document = await db.select({
      document: complianceDocuments,
      documentType: complianceDocumentTypes
    })
      .from(complianceDocuments)
      .leftJoin(complianceDocumentTypes, eq(complianceDocuments.documentTypeId, complianceDocumentTypes.id))
      .where(and(
        eq(complianceDocuments.workspaceId, workspaceId),
        eq(complianceDocuments.id, documentId)
      ))
      .limit(1);
    
    if (!document.length) {
      return res.status(404).json({ success: false, error: "Document not found" });
    }
    
    await db.insert(complianceAuditTrail).values({
      workspaceId,
      entityType: 'document',
      entityId: documentId,
      documentId,
      action: 'view',
      actionCategory: 'read',
      performedBy: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      severity: 'info'
    });
    
    res.json({ success: true, document: document[0] });
  } catch (error) {
    log.error("[Compliance Documents] Error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch document" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || (req.user as any)?.workspaceId || (req.user as any)?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }
    
    const parsed = createDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: "Invalid input", details: parsed.error.flatten().fieldErrors });
    }
    
    const {
      employeeId,
      complianceRecordId,
      requirementId,
      documentTypeId,
      documentName,
      documentNumber,
      issuingAuthority,
      issuedDate,
      expirationDate,
      imageSide,
      isColorImage,
      storageKey,
      storageUrl,
      fileName,
      fileType,
      fileSizeBytes,
      fileContent,
      isSubstitute,
      substituteFor,
      substituteNote
    } = parsed.data;
    
    let fileHashSha256 = parsed.data.fileHashSha256;
    let fileHashMd5 = parsed.data.fileHashMd5;
    
    if (fileContent && !fileHashSha256) {
      const buffer = Buffer.from(fileContent, 'base64');
      fileHashSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      fileHashMd5 = crypto.createHash('md5').update(buffer).digest('hex');
    }
    
    if (!fileHashSha256) {
      return res.status(400).json({ success: false, error: "File hash required for audit integrity" });
    }

    // Pre-upload quota check
    const quotaResult = await checkCategoryQuota(workspaceId, 'documents', fileSizeBytes || 0);
    if (!quotaResult.allowed) {
      return res.status(403).json({ success: false, error: quotaResult.reason });
    }
    
    const document = await db.transaction(async (tx) => {
      const [doc] = await tx.insert(complianceDocuments).values({
        workspaceId,
        employeeId,
        complianceRecordId,
        requirementId,
        documentTypeId,
        documentName,
        documentNumber,
        issuingAuthority,
        issuedDate: issuedDate ? new Date(issuedDate) : undefined,
        expirationDate: expirationDate ? new Date(expirationDate) : undefined,
        imageSide: imageSide || 'front',
        isColorImage: isColorImage ?? true,
        storageKey: storageKey || 'manual-upload',
        storageUrl,
        fileName,
        fileType,
        fileSizeBytes,
        fileHashSha256,
        fileHashMd5,
        hashVerifiedAt: new Date(),
        status: 'pending',
        isSubstitute: isSubstitute || false,
        substituteFor,
        substituteNote: isSubstitute ? (substituteNote || 'Pending guard card issuance') : undefined,
        uploadedBy: req.user?.id,
        uploadIpAddress: req.ip,
        uploadUserAgent: req.get('user-agent')
      }).returning();

      // Record storage usage after successful write
      if (fileSizeBytes) {
        await recordStorageUsage(workspaceId, 'documents', fileSizeBytes);
      }

      await tx.insert(complianceAuditTrail).values({
        workspaceId,
        entityType: 'document',
        entityId: doc.id,
        employeeId,
        documentId: doc.id,
        action: 'upload',
        actionCategory: 'create',
        performedBy: req.user?.id,
        performedByRole: req.user?.role,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        newValue: { documentName, fileHashSha256 },
        severity: 'info'
      });

      if (requirementId) {
        await tx.update(complianceChecklists)
          .set({
            documentId: doc.id,
            isSubstituted: isSubstitute || false,
            substituteDocumentId: isSubstitute ? doc.id : undefined,
            substituteNote: isSubstitute ? substituteNote : undefined,
            expirationDate: expirationDate ? new Date(expirationDate) : undefined,
            updatedAt: new Date()
          })
          .where(and(
            eq(complianceChecklists.complianceRecordId, complianceRecordId),
            eq(complianceChecklists.requirementId, requirementId)
          ));
      }

      if (expirationDate) {
        await tx.insert(complianceExpirations).values({
          workspaceId,
          employeeId,
          complianceRecordId,
          documentId: doc.id,
          expirationType: documentTypeId,
          expirationName: documentName,
          expirationDate: new Date(expirationDate),
          warningDays: 90,
          criticalDays: 30,
          status: 'active'
        });
      }

      return doc;
    });

    platformEventBus.publish({
      type: 'compliance_document_created',
      category: 'announcement',
      title: `Compliance Document Uploaded: \${documentName}`,
      description: `\${documentName} uploaded for employee \${employeeId}`,
      workspaceId,
      metadata: { documentId: document.id, employeeId, documentName, uploadedBy: req.user?.id },
    }).catch(() => null);

    if (employeeId) {
      const bridgeResult = await bridgeComplianceToEmployeeDocument({
        id: document.id,
        workspaceId,
        employeeId,
        documentName,
        documentTypeId,
        fileName,
        fileType,
        fileSizeBytes,
        storageUrl,
        storageKey,
        expirationDate: expirationDate ? new Date(expirationDate) : null,
        status: document.status || 'pending',
        fileHashSha256,
        uploadedBy: req.user?.id,
        uploadIpAddress: req.ip,
        uploadUserAgent: req.get('user-agent'),
      });

      if (bridgeResult.success) {
        log.info(`[Compliance Documents] Bridged to employee_documents: \${bridgeResult.action} (\${bridgeResult.employeeDocumentId})`);
      }
    }
    
    res.json({ success: true, document });
  } catch (error) {
    log.error("[Compliance Documents] Error creating document:", error);
    res.status(500).json({ success: false, error: "Failed to create document" });
  }
});

router.post("/:documentId/lock", requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || (req.user as any)?.workspaceId || (req.user as any)?.currentWorkspaceId;
    const { documentId } = req.params;
    const lockParsed = lockDocumentSchema.safeParse(req.body);
    if (!lockParsed.success) {
      return res.status(400).json({ success: false, error: "Invalid input" });
    }
    const { lockReason } = lockParsed.data;
    
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }
    
    const existing = await db.select().from(complianceDocuments)
      .where(and(
        eq(complianceDocuments.id, documentId),
        eq(complianceDocuments.workspaceId, workspaceId)
      ))
      .limit(1);
    
    if (!existing.length) {
      return res.status(404).json({ success: false, error: "Document not found" });
    }
    
    if (existing[0].isLocked) {
      return res.status(400).json({ success: false, error: "Document is already locked (WORM)" });
    }
    
    const updated = await db.transaction(async (tx) => {
      const [lockedDoc] = await tx.update(complianceDocuments)
        .set({
          isLocked: true,
          lockedAt: new Date(),
          lockedBy: req.user?.id,
          lockReason,
          status: 'locked',
          updatedAt: new Date()
        })
        .where(and(eq(complianceDocuments.id, documentId), eq(complianceDocuments.workspaceId, workspaceId)))
        .returning();
      await tx.insert(complianceAuditTrail).values({
        workspaceId,
        entityType: 'document',
        entityId: documentId,
        documentId,
        action: 'lock',
        actionCategory: 'admin',
        performedBy: req.user?.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        previousValue: { isLocked: false },
        newValue: { isLocked: true, lockReason },
        severity: 'critical'
      });
      return lockedDoc;
    });

    await bridgeComplianceStatusChange(documentId, 'locked', req.user?.id);

    res.json({ success: true, document: updated, message: "Document locked with WORM semantics" });
  } catch (error) {
    log.error("[Compliance Documents] Error locking document:", error);
    res.status(500).json({ success: false, error: "Failed to lock document" });
  }
});

router.patch("/:documentId", requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || (req.user as any)?.workspaceId || (req.user as any)?.currentWorkspaceId;
    const { documentId } = req.params;
    
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }
    
    const existing = await db.select().from(complianceDocuments)
      .where(and(
        eq(complianceDocuments.id, documentId),
        eq(complianceDocuments.workspaceId, workspaceId)
      ))
      .limit(1);
    
    if (!existing.length) {
      return res.status(404).json({ success: false, error: "Document not found" });
    }
    
    if (existing[0].isLocked) {
      await db.insert(complianceAuditTrail).values({
        workspaceId,
        entityType: 'document',
        entityId: documentId,
        documentId,
        action: 'update_blocked',
        actionCategory: 'security',
        performedBy: req.user?.id,
        ipAddress: req.ip,
        metadata: { reason: 'WORM protection active' },
        severity: 'warning'
      });
      return res.status(403).json({ 
        success: false, 
        error: "WORM PROTECTION: Document is locked and cannot be modified. This is a regulatory requirement." 
      });
    }
    
    const updateParsed = updateDocumentSchema.safeParse(req.body);
    if (!updateParsed.success) {
      return res.status(400).json({ success: false, error: "Invalid input", details: updateParsed.error.flatten().fieldErrors });
    }
    
    const allowedUpdates = ['status', 'reviewNotes', 'documentNumber', 'issuingAuthority'];
    const updates: any = { updatedAt: new Date() };
    
    for (const field of allowedUpdates) {
      if ((updateParsed.data as any)[field] !== undefined) {
        updates[field] = (updateParsed.data as any)[field];
      }
    }
    
    const updated = await db.transaction(async (tx) => {
      const [updatedDoc] = await tx.update(complianceDocuments)
        .set(updates)
        .where(and(eq(complianceDocuments.id, documentId), eq(complianceDocuments.workspaceId, workspaceId)))
        .returning();
      await tx.insert(complianceAuditTrail).values({
        workspaceId,
        entityType: 'document',
        entityId: documentId,
        documentId,
        action: 'update',
        actionCategory: 'update',
        performedBy: req.user?.id,
        ipAddress: req.ip,
        previousValue: existing[0],
        newValue: updates,
        severity: 'info'
      });
      return updatedDoc;
    });

    platformEventBus.publish({
      type: 'compliance_document_updated',
      category: 'announcement',
      title: 'Compliance Document Updated',
      description: `Document \${documentId} updated (fields: \${Object.keys(updates).join(', ')})`,
      workspaceId,
      metadata: { documentId, updatedFields: Object.keys(updates), updatedBy: req.user?.id },
    }).catch(() => null);

    if (updates.status) {
      await bridgeComplianceStatusChange(documentId, updates.status, req.user?.id);
    }

    res.json({ success: true, document: updated });
  } catch (error) {
    log.error("[Compliance Documents] Error updating document:", error);
    res.status(500).json({ success: false, error: "Failed to update document" });
  }
});

router.delete("/:documentId", requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || (req.user as any)?.workspaceId || (req.user as any)?.currentWorkspaceId;
    const { documentId } = req.params;
    
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }
    
    const existing = await db.select().from(complianceDocuments)
      .where(and(
        eq(complianceDocuments.id, documentId),
        eq(complianceDocuments.workspaceId, workspaceId)
      ))
      .limit(1);
    
    if (!existing.length) {
      return res.status(404).json({ success: false, error: "Document not found" });
    }
    
    if (existing[0].isLocked) {
      await db.insert(complianceAuditTrail).values({
        workspaceId,
        entityType: 'document',
        entityId: documentId,
        documentId,
        action: 'delete_blocked',
        actionCategory: 'security',
        performedBy: req.user?.id,
        ipAddress: req.ip,
        metadata: { reason: 'WORM protection active - deletion permanently blocked' },
        severity: 'critical'
      });
      return res.status(403).json({ 
        success: false, 
        error: "WORM PROTECTION: Locked documents cannot be deleted. This action has been logged for audit." 
      });
    }

    // SOFT DELETE: Mark as archived instead of hard delete
    await db.update(complianceDocuments)
      .set({ 
        status: 'archived',
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(complianceDocuments.id, documentId), eq(complianceDocuments.workspaceId, workspaceId)));
    
    await db.insert(complianceAuditTrail).values({
      workspaceId,
      entityType: 'document',
      entityId: documentId,
      action: 'archive',
      actionCategory: 'delete',
      performedBy: req.user?.id,
      ipAddress: req.ip,
      previousValue: { documentName: existing[0].documentName, fileHash: existing[0].fileHashSha256, status: existing[0].status },
      newValue: { status: 'archived' },
      severity: 'warning'
    });

    platformEventBus.publish({
      type: 'compliance_document_updated',
      category: 'announcement',
      title: `Compliance Document Archived: ${existing[0].documentName}`,
      description: `${existing[0].documentName} archived by ${req.user?.id}`,
      workspaceId,
      metadata: { documentId, documentName: existing[0].documentName, archivedBy: req.user?.id, status: 'archived' },
    }).catch(() => null);

    res.json({ success: true, message: "Document archived" });
  } catch (error) {
    log.error("[Compliance Documents] Error archiving document:", error);
    res.status(500).json({ success: false, error: "Failed to archive document" });
  }
});

router.post("/validate-requirements", requireAuth, async (req: Request, res: Response) => {
  try {
    const valParsed = validateRequirementsSchema.safeParse(req.body);
    if (!valParsed.success) {
      return res.status(400).json({ success: false, error: "Invalid input" });
    }
    const { documentTypeId, imageSide, isColorImage } = valParsed.data;
    
    if (!documentTypeId) {
      return res.status(400).json({ success: false, error: "Document type required" });
    }
    
    const docType = await db.select().from(complianceDocumentTypes)
      .where(eq(complianceDocumentTypes.id, documentTypeId))
      .limit(1);
    
    if (!docType.length) {
      return res.status(404).json({ success: false, error: "Document type not found" });
    }
    
    const type = docType[0];
    const errors: string[] = [];
    
    if (type.requiresColor && !isColorImage) {
      errors.push(`\${type.name} MUST be a COLOR scan (not black & white)`);
    }
    
    if (type.requiresBackImage && imageSide === 'front') {
      errors.push(`\${type.name} requires BOTH front AND back images`);
    }
    
    if (errors.length > 0) {
      return res.json({ 
        success: true, 
        isValid: false,
        errors,
        requirements: {
          requiresColor: type.requiresColor,
          requiresFrontSide: type.requiresFrontImage,
          requiresBackSide: type.requiresBackImage,
          description: type.validationRules
        }
      });
    }
    
    res.json({ 
      success: true, 
      isValid: true,
      message: "Document meets all requirements"
    });
  } catch (error) {
    log.error("[Compliance Documents] Error validating:", error);
    res.status(500).json({ success: false, error: "Validation failed" });
  }
});

router.post("/:documentId/verify-hash", requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || (req.user as any)?.workspaceId || (req.user as any)?.currentWorkspaceId;
    const { documentId } = req.params;
    const hashParsed = verifyHashSchema.safeParse(req.body);
    if (!hashParsed.success) {
      return res.status(400).json({ success: false, error: "Invalid input" });
    }
    const { currentHash } = hashParsed.data;
    
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }
    
    const document = await db.select().from(complianceDocuments)
      .where(and(
        eq(complianceDocuments.id, documentId),
        eq(complianceDocuments.workspaceId, workspaceId)
      ))
      .limit(1);
    
    if (!document.length) {
      return res.status(404).json({ success: false, error: "Document not found" });
    }
    
    const isValid = document[0].fileHashSha256 === currentHash;
    
    await db.update(complianceDocuments)
      .set({ hashVerifiedAt: new Date() })
      .where(eq(complianceDocuments.id, documentId));
    
    await db.insert(complianceAuditTrail).values({
      workspaceId,
      entityType: 'document',
      entityId: documentId,
      documentId,
      action: 'verify_hash',
      actionCategory: 'read',
      performedBy: req.user?.id,
      ipAddress: req.ip,
      metadata: { isValid, providedHash: currentHash, storedHash: document[0].fileHashSha256 },
      severity: isValid ? 'info' : 'critical'
    });
    
    res.json({ 
      success: true, 
      isValid,
      storedHash: document[0].fileHashSha256,
      message: isValid ? "Hash verification passed" : "INTEGRITY WARNING: Hash mismatch detected"
    });
  } catch (error) {
    log.error("[Compliance Documents] Error verifying hash:", error);
    res.status(500).json({ success: false, error: "Failed to verify hash" });
  }
});

export const documentsRoutes = router;
