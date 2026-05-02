import { Router } from "express";
import { db } from "../db";
import { documentVault, insertDocumentVaultSchema, employees, orgDocumentSignatures } from "@shared/schema";
import { eq, and, desc, ilike, count, sql, or, isNull, inArray } from "drizzle-orm";
import { z } from "zod";
import { createHash } from "crypto";
import { requireAuth } from "../rbac";
import type { AuthenticatedRequest } from "../rbac";
import { requirePlan } from '../tierGuards';
import { universalAudit } from "../services/universalAuditService";
import { downloadFileFromObjectStorage } from "../objectStorage";
import { writeHardenedPdfHeaders } from "../lib/pdfResponseHeaders";
import { createLogger } from '../lib/logger';
const log = createLogger('DocumentVaultRoutes');


const OFFICER_ROLES = ['employee', 'contractor'];

const MANAGER_ROLES = ["org_owner", "co_owner", "manager", "department_manager", "supervisor", "root_admin", "sysop"];

function hasManagerRole(req: unknown): boolean {
  const role = req.workspaceRole || req.session?.workspaceRole || req.user?.platformRole;
  if (MANAGER_ROLES.includes(role)) return true;
  if (process.env.NODE_ENV !== 'production' && req.user?.id?.startsWith("dev-owner")) return true;
  return false;
}

const router = Router();
// Document vault is a Professional+ feature (document_vault, document_signing)
router.use(requireAuth);
router.use(requirePlan('professional'));

// ─── Recycle bin — soft-deleted docs, restorable by managers ──────────────────
// Soft-deleted vault rows still exist (for audit) but are filtered out of the
// normal list view. The recycle-bin endpoints surface them so a manager can
// review what was removed and restore by mistake.

router.get("/recycle-bin", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerRole(req)) return res.status(403).json({ error: "Manager role required" });
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const [{ total } = { total: 0 }] = await db
      .select({ total: count() })
      .from(documentVault)
      .where(and(
        eq(documentVault.workspaceId, workspaceId),
        sql`${documentVault.deletedAt} IS NOT NULL`,
      ));

    const items = await db
      .select()
      .from(documentVault)
      .where(and(
        eq(documentVault.workspaceId, workspaceId),
        sql`${documentVault.deletedAt} IS NOT NULL`,
      ))
      .orderBy(desc(documentVault.deletedAt))
      .limit(limit)
      .offset(offset);

    res.json({ items, total: Number(total || 0), limit, offset });
  } catch (error: unknown) {
    log.error("[Document Vault] Recycle-bin list error:", error);
    res.status(500).json({ error: "Failed to list recycle bin" });
  }
});

router.post("/:id/restore", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerRole(req)) return res.status(403).json({ error: "Manager role required" });
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const [existing] = await db
      .select()
      .from(documentVault)
      .where(and(
        eq(documentVault.id, req.params.id),
        eq(documentVault.workspaceId, workspaceId),
        sql`${documentVault.deletedAt} IS NOT NULL`,
      ));

    if (!existing) return res.status(404).json({ error: "Deleted document not found" });

    const [restored] = await db
      .update(documentVault)
      .set({
        deletedAt: null,
        deletedBy: null,
        updatedAt: new Date(),
      })
      .where(and(eq(documentVault.id, req.params.id), eq(documentVault.workspaceId, workspaceId)))
      .returning();

    await universalAudit.log({
      workspaceId,
      actorId: req.user?.id || 'unknown',
      actorType: 'user',
      changeType: 'update',
      action: 'DOCUMENT_VAULT:RESTORED',
      entityType: 'document_vault',
      entityId: req.params.id,
      entityName: existing.title,
      metadata: {
        category: existing.category,
        wasSigned: existing.isSigned,
        previouslyDeletedAt: existing.deletedAt,
        previouslyDeletedBy: existing.deletedBy,
      },
    });

    res.json({ success: true, document: restored });
  } catch (error: unknown) {
    log.error("[Document Vault] Restore error:", error);
    res.status(500).json({ error: "Failed to restore document" });
  }
});

router.get("/stats", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const [totalResult] = await db
      .select({ total: count() })
      .from(documentVault)
      .where(and(eq(documentVault.workspaceId, workspaceId), isNull(documentVault.deletedAt)));

    const [signedResult] = await db
      .select({ total: count() })
      .from(documentVault)
      .where(and(eq(documentVault.workspaceId, workspaceId), eq(documentVault.isSigned, true), isNull(documentVault.deletedAt)));

    const categoryRows = await db
      .select({
        category: documentVault.category,
        docCount: count(),
      })
      .from(documentVault)
      .where(and(eq(documentVault.workspaceId, workspaceId), isNull(documentVault.deletedAt)))
      .groupBy(documentVault.category);

    const byCategory: Record<string, number> = {};
    for (const row of categoryRows) {
      byCategory[row.category || "uncategorized"] = Number(row.docCount);
    }

    res.json({
      totalDocuments: Number(totalResult?.total || 0),
      signedDocuments: Number(signedResult?.total || 0),
      byCategory,
    });
  } catch (error: unknown) {
    log.error("[Document Vault] Stats error:", error);
    res.status(500).json({ error: "Failed to fetch document vault stats" });
  }
});

router.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const {
      search,
      category,
      relatedEntityType,
      relatedEntityId,
      from,
      to,
      signedOnly,
      limit: qLimit,
      offset: qOffset,
    } = req.query;
    const limit = Math.min(Math.max(parseInt(qLimit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(qOffset as string) || 0, 0);

    const conditions = [eq(documentVault.workspaceId, workspaceId), isNull(documentVault.deletedAt)];

    // Free-text search across title, category, documentNumber, and tags so a
    // user can find a doc by either its human label or its DOC-YYYYMMDD-NNNNN
    // reference number. The tags column is a jsonb array — cast to text for
    // the ilike match (matches each element's quoted form).
    if (search && typeof search === "string") {
      const needle = `%${search}%`;
      conditions.push(
        or(
          ilike(documentVault.title, needle),
          ilike(documentVault.category, needle),
          ilike(documentVault.documentNumber, needle),
          sql`${documentVault.tags}::text ILIKE ${needle}`,
        )!
      );
    }

    if (category && typeof category === "string") {
      conditions.push(eq(documentVault.category, category));
    }

    if (relatedEntityType && typeof relatedEntityType === "string") {
      conditions.push(eq(documentVault.relatedEntityType, relatedEntityType));
    }

    if (relatedEntityId && typeof relatedEntityId === "string") {
      conditions.push(eq(documentVault.relatedEntityId, relatedEntityId));
    }

    // Date-range filter on createdAt — accepts either ISO string or yyyy-mm-dd
    if (from && typeof from === "string") {
      const d = new Date(from);
      if (!isNaN(d.getTime())) conditions.push(sql`${documentVault.createdAt} >= ${d}`);
    }
    if (to && typeof to === "string") {
      const d = new Date(to);
      if (!isNaN(d.getTime())) conditions.push(sql`${documentVault.createdAt} <= ${d}`);
    }

    if (signedOnly === "true" || signedOnly === "1") {
      conditions.push(eq(documentVault.isSigned, true));
    }

    // ── Check 12: Officer document scope ─────────────────────────────────────
    // Employees and contractors must only see documents they are a signatory on
    // or that are explicitly addressed to them (relatedEntityId = their employeeId).
    const role = req.workspaceRole || req.session?.workspaceRole || req.user?.platformRole || null;
    if (role && OFFICER_ROLES.includes(role)) {
      const userId = req.user?.id;
      if (!userId) return res.status(403).json({ error: "Unauthorized" });

      // Find the officer's employee record in this workspace
      const [emp] = await db
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId)));

      // Collect document IDs where this user is a signatory
      const sigRows = await db
        .select({ documentId: orgDocumentSignatures.documentId })
        .from(orgDocumentSignatures)
        .where(eq(orgDocumentSignatures.signerUserId, userId));

      const allowedDocIds = sigRows.map(r => r.documentId).filter(Boolean);

      if (emp && allowedDocIds.length > 0) {
        // Documents addressed to this officer OR documents they are a signatory on
        conditions.push(
          or(
            inArray(documentVault.id, allowedDocIds),
            eq(documentVault.relatedEntityId, emp.id)
          )!
        );
      } else if (allowedDocIds.length > 0) {
        conditions.push(inArray(documentVault.id, allowedDocIds));
      } else if (emp) {
        conditions.push(eq(documentVault.relatedEntityId, emp.id));
      } else {
        // No employee record and no signature records — return empty result set
        return res.json({ items: [], total: 0, limit, offset });
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const whereClause = and(...conditions);

    const [totalResult] = await db
      .select({ total: count() })
      .from(documentVault)
      .where(whereClause);

    const docs = await db
      .select()
      .from(documentVault)
      .where(whereClause)
      .orderBy(desc(documentVault.updatedAt))
      .limit(limit)
      .offset(offset);

    res.json({ items: docs, total: Number(totalResult?.total || 0), limit, offset });
  } catch (error: unknown) {
    log.error("[Document Vault] List error:", error);
    res.status(500).json({ error: "Failed to list documents" });
  }
});

router.get("/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const [doc] = await db
      .select()
      .from(documentVault)
      .where(and(
        eq(documentVault.id, req.params.id),
        eq(documentVault.workspaceId, workspaceId),
        isNull(documentVault.deletedAt)
      ));

    if (!doc) return res.status(404).json({ error: "Document not found" });

    // ── Check 9: Storage path workspace scope — defense in depth ─────────────
    // The WHERE clause above already enforces workspaceId, but we add an explicit
    // runtime assertion here so any bypass path (e.g., a future cache layer or
    // direct call) is still caught before the URL is served.
    if (doc.workspaceId !== workspaceId) {
      log.error(`[DocumentVault] WORKSPACE SCOPE VIOLATION — doc.workspaceId=${doc.workspaceId} ≠ requester=${workspaceId}`);
      return res.status(403).json({ error: "Access denied" });
    }

    // If the stored URL is a relative storage path, verify it carries the workspace namespace.
    // This detects crafted cross-workspace path attacks on internal storage.
    if (doc.fileUrl && doc.fileUrl.startsWith('/') && !doc.fileUrl.includes(workspaceId)) {
      log.warn(`[DocumentVault] URL path namespace mismatch for doc=${doc.id}: url=${doc.fileUrl} workspaceId=${workspaceId}`);
      await universalAudit.log({
        workspaceId, actorId: req.user?.id || 'unknown', actorType: 'user',
        changeType: 'read', action: 'DOCUMENT_VAULT:URL_NAMESPACE_MISMATCH',
        entityType: 'document_vault', entityId: doc.id, entityName: doc.title,
        metadata: { fileUrl: doc.fileUrl, workspaceId },
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    // SHA-256 integrity verification — compute hash of URL+title as a tamper indicator
    const contentKey = `${doc.fileUrl}:${doc.title}:${doc.workspaceId}`;
    const computedHash = createHash('sha256').update(contentKey).digest('hex');
    const integrityVerified = !doc.integrityHash || doc.integrityHash === computedHash;

    await universalAudit.log({
      workspaceId,
      actorId: req.user?.id || 'unknown',
      actorType: 'user',
      changeType: 'read',
      action: 'DOCUMENT_VAULT:ACCESSED',
      entityType: 'document_vault',
      entityId: doc.id,
      entityName: doc.title,
      metadata: { category: doc.category, integrityVerified },
    });

    res.json({ ...doc, integrityVerified });
  } catch (error: unknown) {
    log.error("[Document Vault] Get error:", error);
    res.status(500).json({ error: "Failed to fetch document" });
  }
});

// ─── Stream the stored PDF buffer back to the caller ──────────────────────────
// fileUrl is the GCS object path written by businessFormsVaultService.saveToVault
// (or any future writer that follows the same convention). Officers may only
// download documents addressed to them or signed by them — same scope rules as
// the list endpoint. ?disposition=inline serves the PDF for in-app viewing,
// otherwise it downloads as an attachment.
async function streamVaultPdf(req: AuthenticatedRequest, res: Response, mode: 'attachment' | 'inline') {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const [doc] = await db
      .select()
      .from(documentVault)
      .where(and(
        eq(documentVault.id, req.params.id),
        eq(documentVault.workspaceId, workspaceId),
        isNull(documentVault.deletedAt)
      ));

    if (!doc) return res.status(404).json({ error: "Document not found" });

    // Officer scope — same rules as list (signatory or addressed-to)
    const role = req.workspaceRole || (req as Record<string, unknown>).session?.workspaceRole || req.user?.platformRole || null;
    if (role && OFFICER_ROLES.includes(role)) {
      const userId = req.user?.id;
      if (!userId) return res.status(403).json({ error: "Unauthorized" });

      const [emp] = await db
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId)));

      const sigRows = await db
        .select({ documentId: orgDocumentSignatures.documentId })
        .from(orgDocumentSignatures)
        .where(eq(orgDocumentSignatures.signerUserId, userId));

      const allowedSigIds = new Set(sigRows.map(r => r.documentId).filter(Boolean) as string[]);
      const isAddressee = !!emp && doc.relatedEntityId === emp.id;
      const isSignatory = allowedSigIds.has(doc.id);
      if (!isAddressee && !isSignatory) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    // Resolve the storage path stored in fileUrl. Reject anything that doesn't
    // look like an internal object path so we never make outbound requests on
    // behalf of an authenticated user.
    const fileUrl = doc.fileUrl || '';
    if (/^https?:\/\//i.test(fileUrl) || fileUrl.startsWith('internal://')) {
      log.warn(`[DocumentVault] download refused — fileUrl is not an internal storage path: ${fileUrl}`);
      return res.status(409).json({ error: "Document file is not available for streaming" });
    }

    // Defense in depth: vault-managed objects always live under
    //   vault/<category>/<workspaceId>/<documentNumber>.pdf
    // (see businessFormsVaultService.persistToVault). Refuse to stream any
    // path that does not contain the requesting workspaceId as a segment,
    // even though the WHERE clause above already enforces tenant scope.
    // This blocks crafted-row scenarios (manual DB writes, future cache layers)
    // and prevents cross-tenant content bleed.
    if (fileUrl.startsWith('vault/') || fileUrl.startsWith('/vault/')) {
      const segments = fileUrl.split('/').filter(Boolean);
      if (!segments.includes(workspaceId)) {
        log.error(`[DocumentVault] CROSS-TENANT PATH BLOCKED — doc=${doc.id} ws=${workspaceId} path=${fileUrl}`);
        await universalAudit.log({
          workspaceId,
          actorId: req.user?.id || 'unknown',
          actorType: 'user',
          changeType: 'read',
          action: 'DOCUMENT_VAULT:CROSS_TENANT_PATH_BLOCKED',
          entityType: 'document_vault',
          entityId: doc.id,
          entityName: doc.title,
          metadata: { fileUrl, requestingWorkspace: workspaceId },
        });
        return res.status(403).json({ error: "Access denied" });
      }
    }

    let buffer: Buffer;
    try {
      buffer = await downloadFileFromObjectStorage(fileUrl);
    } catch (err: unknown) {
      log.error(`[DocumentVault] storage fetch failed for doc=${doc.id} path=${fileUrl}:`, (err instanceof Error ? err.message : String(err)));
      return res.status(404).json({ error: "Document file not found in storage" });
    }

    // Verify integrity hash if one was recorded at write time. The hash stored
    // by businessFormsVaultService is the SHA-256 of the stamped buffer.
    let integrityVerified = true;
    if (doc.integrityHash) {
      const computed = createHash('sha256').update(buffer).digest('hex');
      integrityVerified = computed === doc.integrityHash;
      if (!integrityVerified) {
        log.error(`[DocumentVault] INTEGRITY MISMATCH doc=${doc.id} expected=${doc.integrityHash} computed=${computed}`);
      }
    }

    await universalAudit.log({
      workspaceId,
      actorId: req.user?.id || 'unknown',
      actorType: 'user',
      changeType: 'read',
      action: mode === 'inline' ? 'DOCUMENT_VAULT:PREVIEWED' : 'DOCUMENT_VAULT:DOWNLOADED',
      entityType: 'document_vault',
      entityId: doc.id,
      entityName: doc.title,
      metadata: { category: doc.category, integrityVerified, sizeBytes: buffer.length },
    });

    if (!integrityVerified) {
      // Refuse to serve a tampered file — same as a 409 on the metadata path
      return res.status(409).json({ error: "Document integrity check failed" });
    }

    writeHardenedPdfHeaders(res, {
      filename: `${doc.documentNumber || doc.id}.pdf`,
      size: buffer.length,
      mode,
      contentType: doc.mimeType || 'application/pdf',
    });
    return res.send(buffer);
  } catch (error: unknown) {
    log.error("[Document Vault] Stream error:", error);
    return res.status(500).json({ error: "Failed to stream document" });
  }
}

router.get("/:id/download", async (req: AuthenticatedRequest, res) => {
  return streamVaultPdf(req, res, 'attachment');
});

router.get("/:id/preview", async (req: AuthenticatedRequest, res) => {
  return streamVaultPdf(req, res, 'inline');
});

router.post("/", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerRole(req)) return res.status(403).json({ error: "Manager role required" });
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const parsed = insertDocumentVaultSchema.safeParse({
      ...req.body,
      workspaceId,
      uploadedBy: req.user?.id || null,
    });

    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    // ── Check 9: Storage path workspace namespace enforcement ─────────────────
    // For relative/internal storage paths (starting with '/'), the path must contain
    // the workspaceId as a namespace segment to prevent cross-workspace path crafting.
    // Full HTTPS URLs are allowed freely but get workspace scope enforced at read time.
    const { fileUrl } = parsed.data;
    if (fileUrl && fileUrl.startsWith('/') && !fileUrl.includes(workspaceId)) {
      return res.status(400).json({
        error: "Invalid file path — storage path must include workspace namespace",
        hint: `Path must contain /${workspaceId}/ segment`,
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    const contentKey = `${parsed.data.fileUrl}:${parsed.data.title}:${workspaceId}`;
    const integrityHash = createHash('sha256').update(contentKey).digest('hex');

    const [doc] = await db
      .insert(documentVault)
      .values({ ...parsed.data, integrityHash, createdAt: new Date() })
      .returning();

    await universalAudit.log({
      workspaceId,
      actorId: req.user?.id || 'unknown',
      actorType: 'user',
      changeType: 'create',
      action: 'DOCUMENT_VAULT:UPLOADED',
      entityType: 'document_vault',
      entityId: doc.id,
      entityName: doc.title,
      metadata: { category: doc.category, mimeType: doc.mimeType, fileSizeBytes: doc.fileSizeBytes, integrityHash },
    });

    res.status(201).json(doc);
  } catch (error: unknown) {
    log.error("[Document Vault] Create error:", error);
    res.status(500).json({ error: "Failed to create document" });
  }
});

router.patch("/:id", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerRole(req)) return res.status(403).json({ error: "Manager role required" });
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const [existing] = await db
      .select()
      .from(documentVault)
      .where(and(
        eq(documentVault.id, req.params.id),
        eq(documentVault.workspaceId, workspaceId),
        isNull(documentVault.deletedAt),
      ));

    if (!existing) return res.status(404).json({ error: "Document not found" });

    // ── Immutability: signed/executed docs are legally binding ───────────────
    // Once a document has been signed, the binary AND its core metadata are
    // frozen. Tags and retentionUntil may still be amended (these are
    // organizational fields, not part of the signed content), but title,
    // category, file pointer, signature flag, and entity scope are locked.
    const requested = (req.body || {}) as Record<string, unknown>;
    const lockedFields = ['title', 'category', 'fileUrl', 'fileSizeBytes', 'mimeType', 'isSigned', 'relatedEntityType', 'relatedEntityId'];
    const offendingLocked = lockedFields.filter(f => requested[f] !== undefined);
    if (existing.isSigned && offendingLocked.length > 0) {
      await universalAudit.log({
        workspaceId,
        actorId: req.user?.id || 'unknown',
        actorType: 'user',
        changeType: 'update',
        action: 'DOCUMENT_VAULT:EDIT_DENIED_SIGNED',
        entityType: 'document_vault',
        entityId: req.params.id,
        entityName: existing.title,
        metadata: { attemptedFields: offendingLocked },
      });
      return res.status(409).json({
        error: 'Document is signed and immutable',
        lockedFields: offendingLocked,
        editableFields: ['tags', 'retentionUntil'],
      });
    }

    const vaultUpdateSchema = z.object({
      title: z.string().min(1).optional(),
      category: z.string().optional(),
      fileUrl: z.string().url().optional(),
      fileSizeBytes: z.number().int().nonnegative().optional(),
      mimeType: z.string().optional(),
      tags: z.array(z.string()).optional(),
      relatedEntityType: z.string().optional(),
      relatedEntityId: z.string().optional(),
      isSigned: z.boolean().optional(),
      retentionUntil: z.string().optional(),
    });

    const parsed = vaultUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value !== undefined) updateData[key] = value;
    }

    const [updated] = await db
      .update(documentVault)
      .set(updateData)
      .where(and(eq(documentVault.id, req.params.id), eq(documentVault.workspaceId, workspaceId)))
      .returning();

    await universalAudit.log({
      workspaceId,
      actorId: req.user?.id || 'unknown',
      actorType: 'user',
      changeType: 'update',
      action: 'DOCUMENT_VAULT:UPDATED',
      entityType: 'document_vault',
      entityId: req.params.id,
      entityName: existing.title,
      metadata: { fieldsUpdated: Object.keys(parsed.data), wasSigned: existing.isSigned },
    });

    res.json(updated);
  } catch (error: unknown) {
    log.error("[Document Vault] Update error:", error);
    res.status(500).json({ error: "Failed to update document" });
  }
});

router.delete("/:id", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerRole(req)) return res.status(403).json({ error: "Manager role required" });
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const [existing] = await db
      .select()
      .from(documentVault)
      .where(and(
        eq(documentVault.id, req.params.id),
        eq(documentVault.workspaceId, workspaceId),
        isNull(documentVault.deletedAt)
      ));

    if (!existing) return res.status(404).json({ error: "Document not found" });

    // ── Signed-doc deletion guard ────────────────────────────────────────────
    // Signed documents are legally binding; deletion requires both an explicit
    // ?force=true query and a deletion `reason` in the body. The reason is
    // captured in the audit trail. Without both, signed deletes are refused.
    const forceParam = (req.query.force as string | undefined)?.toLowerCase() === 'true';
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (existing.isSigned) {
      if (!forceParam || reason.length < 8) {
        await universalAudit.log({
          workspaceId,
          actorId: req.user?.id || 'unknown',
          actorType: 'user',
          changeType: 'delete',
          action: 'DOCUMENT_VAULT:DELETE_DENIED_SIGNED',
          entityType: 'document_vault',
          entityId: req.params.id,
          entityName: existing.title,
          metadata: { providedForce: forceParam, providedReasonLength: reason.length },
        });
        return res.status(409).json({
          error: 'Signed documents cannot be deleted without a force flag and reason',
          required: { force: true, reason: 'min 8 characters explaining why' },
        });
      }
    }

    // Soft-delete — physically retains record (and the GCS object) for audit
    await db
      .update(documentVault)
      .set({ deletedAt: new Date(), deletedBy: req.user?.id || 'unknown', updatedAt: new Date() })
      .where(eq(documentVault.id, req.params.id));

    await universalAudit.log({
      workspaceId,
      actorId: req.user?.id || 'unknown',
      actorType: 'user',
      changeType: 'delete',
      action: existing.isSigned ? 'DOCUMENT_VAULT:SIGNED_FORCE_DELETED' : 'DOCUMENT_VAULT:SOFT_DELETED',
      entityType: 'document_vault',
      entityId: req.params.id,
      entityName: existing.title,
      metadata: {
        category: existing.category,
        wasSigned: existing.isSigned,
        softDelete: true,
        physicallyRetained: true,
        reason: existing.isSigned ? reason : null,
      },
    });

    res.json({ success: true, message: "Document soft-deleted — record retained for audit" });
  } catch (error: unknown) {
    log.error("[Document Vault] Delete error:", error);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

export default router;
