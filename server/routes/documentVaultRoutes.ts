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
import { createLogger } from '../lib/logger';
const log = createLogger('DocumentVaultRoutes');


const OFFICER_ROLES = ['employee', 'contractor'];

const MANAGER_ROLES = ["org_owner", "co_owner", "manager", "department_manager", "supervisor", "root_admin", "sysop"];

function hasManagerRole(req: any): boolean {
  const role = req.workspaceRole || req.session?.workspaceRole || req.user?.platformRole;
  if (MANAGER_ROLES.includes(role)) return true;
  if (process.env.NODE_ENV !== 'production' && req.user?.id?.startsWith("dev-owner")) return true;
  return false;
}

const router = Router();
// Document vault is a Professional+ feature (document_vault, document_signing)
router.use(requireAuth);
router.use(requirePlan('professional'));

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

    const { search, category, relatedEntityType, relatedEntityId, limit: qLimit, offset: qOffset } = req.query;
    const limit = Math.min(Math.max(parseInt(qLimit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(qOffset as string) || 0, 0);

    const conditions = [eq(documentVault.workspaceId, workspaceId), isNull(documentVault.deletedAt)];

    if (search && typeof search === "string") {
      conditions.push(
        or(
          ilike(documentVault.title, `%${search}%`),
          ilike(documentVault.category, `%${search}%`)
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

    // ── Check 12: Officer document scope ─────────────────────────────────────
    // Employees and contractors must only see documents they are a signatory on
    // or that are explicitly addressed to them (relatedEntityId = their employeeId).
    const role = req.workspaceRole || req.session?.workspaceRole || req.user?.platformRole || undefined;
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
      // @ts-expect-error — TS migration: fix in refactoring sprint
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
      .where(and(eq(documentVault.id, req.params.id), eq(documentVault.workspaceId, workspaceId)));

    if (!existing) return res.status(404).json({ error: "Document not found" });

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

    const updateData: Record<string, any> = { updatedAt: new Date() };
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
      metadata: { fieldsUpdated: Object.keys(parsed.data) },
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

    // Soft-delete — physically retains record for audit purposes
    await db
      .update(documentVault)
      .set({ deletedAt: new Date(), deletedBy: req.user?.id || 'unknown', updatedAt: new Date() })
      .where(eq(documentVault.id, req.params.id));

    await universalAudit.log({
      workspaceId,
      actorId: req.user?.id || 'unknown',
      actorType: 'user',
      changeType: 'delete',
      action: 'DOCUMENT_VAULT:SOFT_DELETED',
      entityType: 'document_vault',
      entityId: req.params.id,
      entityName: existing.title,
      metadata: { category: existing.category, softDelete: true, physicallyRetained: true },
    });

    res.json({ success: true, message: "Document soft-deleted — record retained for audit" });
  } catch (error: unknown) {
    log.error("[Document Vault] Delete error:", error);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

export default router;
