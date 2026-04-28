import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { randomUUID } from 'crypto';
import { db } from "../db";
import { employees, documentVault } from "@shared/schema";
import { eq, and, or } from "drizzle-orm";
import { readLimiter } from "../middleware/rateLimiter";
import { requireAuth, type AuthenticatedRequest } from "../rbac";
import { documentExtractionService } from "../services/documentExtraction";
import { bridgeFileCabinetToEmployeeDocument } from "../services/compliance/documentPipelineBridge";
import { softDelete } from "../lib/softDelete";
import { createLogger } from '../lib/logger';
import { z } from 'zod';
const log = createLogger('DocumentRoutes');


const router = Router();

router.post("/api/file-cabinet/upload", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { employeeId, fileName, fileType, category } = req.body;
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    if (!workspaceId || !userId || !employeeId)
      return res.status(400).json({ error: "Workspace, user, and employeeId required" });

    const [employee] = await db
      .select()
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)));

    if (!employee) return res.status(404).json({ error: "Employee not found" });

    const fileRecord = {
      id: `FILE-${randomUUID()}`,
      fileName,
      fileType: fileType || "document",
      category: category || "general",
      uploadedBy: userId,
      uploadedAt: new Date().toISOString(),
      status: "active",
    };

    await bridgeFileCabinetToEmployeeDocument(
      workspaceId,
      employeeId,
      fileRecord,
      req.ip || '0.0.0.0',
      req.get('user-agent'),
    );

    res.json({ success: true, data: fileRecord, message: "File uploaded successfully" });
  } catch (error: unknown) {
    log.error("Error uploading file:", error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

router.get("/api/file-cabinet/:employeeId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { employeeId } = req.params;
    const workspaceId = req.workspaceId;
    if (!workspaceId || !employeeId)
      return res.status(400).json({ error: "Workspace and employeeId required" });

    const [employee] = await db
      .select()
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)));

    if (!employee) return res.status(404).json({ error: "Employee not found" });

    res.json({ success: true, data: [] });
  } catch (error: unknown) {
    log.error("Error fetching file cabinet:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.delete("/api/file-cabinet/:employeeId/:fileId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { employeeId, fileId } = req.params;
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const [employee] = await db
      .select()
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)));

    if (!employee) return res.status(404).json({ error: "Employee not found" });

    // Attempt deletion from document_vault (compliance docs) scoped to workspace
    const [vaultDoc] = await db
      .select({ id: documentVault.id })
      .from(documentVault)
      .where(and(eq(documentVault.id, fileId), eq(documentVault.workspaceId, workspaceId)))
      .limit(1);

    if (vaultDoc) {
      // TRINITY.md Section R / Law P1 — soft delete (legal docs retained for audit)
      await softDelete({
        table: documentVault,
        where: and(eq(documentVault.id, fileId), eq(documentVault.workspaceId, workspaceId))!,
        userId: req.user!.id,
        workspaceId,
        entityType: 'document_vault',
        entityId: fileId,
      });
      return res.json({ success: true, message: "Document deleted successfully", source: "document_vault" });
    }

    // Attempt deletion from employee_documents (certifications, forms)
    const { employeeDocuments } = await import("@shared/schema");
    const [empDoc] = await db
      .select({ id: employeeDocuments.id })
      .from(employeeDocuments)
      .where(and(eq(employeeDocuments.id, fileId), eq(employeeDocuments.employeeId, employeeId)))
      .limit(1);

    if (empDoc) {
      // TRINITY.md Section R / Law P1 — soft delete (HR records retained for compliance)
      await softDelete({
        table: employeeDocuments,
        where: and(eq(employeeDocuments.id, fileId), eq(employeeDocuments.employeeId, employeeId))!,
        userId: req.user!.id,
        workspaceId,
        entityType: 'employee_document',
        entityId: fileId,
      });
      return res.json({ success: true, message: "Employee document deleted successfully", source: "employee_documents" });
    }

    // File not found in any table — return 404 so the caller knows the record doesn't exist
    return res.status(404).json({ error: "File not found in document storage" });
  } catch (error: unknown) {
    log.error("Error deleting file:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post("/api/documents/extract", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { documentName, documentType, fileData, fileMimeType } = req.body;

    if (!documentName || !documentType || !fileData || !fileMimeType) {
      return res.status(400).json({
        error: "Missing required fields: documentName, documentType, fileData, fileMimeType",
      });
    }

    const extracted = await documentExtractionService.extractDocumentData(
      workspaceId,
      documentName,
      documentType,
      fileData,
      fileMimeType
    );

    res.json({
      success: extracted.status === "success",
      data: extracted,
    });
  } catch (error: unknown) {
    log.error("Error extracting document:", error);
    res.status(500).json({ error: sanitizeError(error) || "Document extraction failed" });
  }
});

router.post("/api/documents/batch-extract", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { documents } = req.body;

    if (!Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({ error: "documents must be a non-empty array" });
    }

    const results = await documentExtractionService.batchExtractDocuments(
      workspaceId,
      documents.map((doc: any) => ({
        workspaceId,
        documentName: doc.documentName,
        documentType: doc.documentType,
        fileData: doc.fileData,
        fileMimeType: doc.fileMimeType,
      }))
    );

    res.json({
      success: true,
      data: results,
      total: results.length,
      successful: results.filter((r: any) => r.status === "success").length,
      failed: results.filter((r: any) => r.status !== "success").length,
    });
  } catch (error: unknown) {
    log.error("Error batch extracting documents:", error);
    res.status(500).json({ error: sanitizeError(error) || "Batch extraction failed" });
  }
});

router.post("/api/documents/validate", requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const { entityType, mappedData } = req.body;

    if (!entityType || !mappedData) {
      return res.status(400).json({
        error: "Missing required fields: entityType, mappedData",
      });
    }

    const validationResults = (documentExtractionService as any).validateExtractedData(entityType, mappedData);

    res.json({
      success: true,
      data: validationResults,
    });
  } catch (error: unknown) {
    log.error("Error validating extracted data:", error);
    res.status(500).json({ error: sanitizeError(error) || "Validation failed" });
  }
});

export default router;
