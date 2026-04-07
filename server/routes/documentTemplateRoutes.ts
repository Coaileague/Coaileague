import { Router } from "express";
import { db } from "../db";
import {
  documentTemplates,
  documentInstances,
  insertDocumentTemplateSchema,
  insertDocumentInstanceSchema,
} from "@shared/schema";
import { eq, and, desc, count, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../rbac";
import type { AuthenticatedRequest } from "../rbac";
import { createLogger } from '../lib/logger';
const log = createLogger('DocumentTemplateRoutes');


const MANAGER_ROLES = ["org_owner", "co_owner", "manager", "department_manager", "supervisor", "root_admin", "sysop"];

function hasManagerRole(req: any): boolean {
  const role = req.workspaceRole || req.session?.workspaceRole || req.user?.platformRole;
  if (MANAGER_ROLES.includes(role)) return true;
  if (process.env.NODE_ENV !== 'production' && req.user?.id?.startsWith("dev-owner")) return true;
  return false;
}

const router = Router();
router.use(requireAuth);

router.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const { category, search, active, limit: qLimit, offset: qOffset } = req.query;
    const limit = Math.min(Math.max(parseInt(qLimit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(qOffset as string) || 0, 0);

    let conditions = [eq(documentTemplates.workspaceId, workspaceId)];

    if (category && typeof category === "string") {
      conditions.push(eq(documentTemplates.category, category));
    }
    if (search && typeof search === "string") {
      conditions.push(ilike(documentTemplates.name, `%${search}%`));
    }
    if (active !== undefined) {
      conditions.push(eq(documentTemplates.isActive, active === "true"));
    }

    const whereClause = and(...conditions);

    const [totalResult] = await db
      .select({ total: count() })
      .from(documentTemplates)
      .where(whereClause);

    const items = await db
      .select()
      .from(documentTemplates)
      .where(whereClause)
      .orderBy(desc(documentTemplates.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ items, total: totalResult?.total || 0, limit, offset });
  } catch (error: unknown) {
    log.error("[DocumentTemplates] List error:", error);
    res.status(500).json({ error: "Failed to list document templates" });
  }
});

router.get("/categories/list", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const categories = await db
      .select({
        category: documentTemplates.category,
        count: count(),
      })
      .from(documentTemplates)
      .where(eq(documentTemplates.workspaceId, workspaceId))
      .groupBy(documentTemplates.category);

    res.json(categories);
  } catch (error: unknown) {
    log.error("[DocumentTemplates] Categories error:", error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

router.get("/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const [template] = await db
      .select()
      .from(documentTemplates)
      .where(
        and(
          eq(documentTemplates.id, req.params.id),
          eq(documentTemplates.workspaceId, workspaceId)
        )
      );

    if (!template) return res.status(404).json({ error: "Template not found" });

    res.json(template);
  } catch (error: unknown) {
    log.error("[DocumentTemplates] Get error:", error);
    res.status(500).json({ error: "Failed to fetch document template" });
  }
});

router.post("/", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerRole(req)) return res.status(403).json({ error: "Manager role required" });
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const parsed = insertDocumentTemplateSchema.safeParse({
      ...req.body,
      workspaceId,
      createdBy: req.user?.id || null,
    });

    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const [template] = await db
      .insert(documentTemplates)
      .values(parsed.data)
      .returning();

    res.status(201).json(template);
  } catch (error: unknown) {
    log.error("[DocumentTemplates] Create error:", error);
    res.status(500).json({ error: "Failed to create document template" });
  }
});

router.patch("/:id", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerRole(req)) return res.status(403).json({ error: "Manager role required" });
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const [existing] = await db
      .select()
      .from(documentTemplates)
      .where(
        and(
          eq(documentTemplates.id, req.params.id),
          eq(documentTemplates.workspaceId, workspaceId)
        )
      );

    if (!existing) return res.status(404).json({ error: "Template not found" });

    const templateUpdateSchema = z.object({
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      category: z.string().optional(),
      contentType: z.enum(["rich_text", "pdf_upload", "ai_generated"]).optional(),
      contentBody: z.string().optional(),
      uploadedPdfUrl: z.string().optional(),
      mergeFields: z.array(z.string()).optional(),
      signatureFields: z.any().optional(),
      requiresCountersign: z.boolean().optional(),
      countersignRoles: z.array(z.string()).optional(),
      autoSendOnEvent: z.string().optional(),
      expirationDays: z.number().int().nonnegative().optional(),
      isActive: z.boolean().optional(),
    });

    const parsed = templateUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value !== undefined) updateData[key] = value;
    }

    if (parsed.data.contentBody !== undefined && parsed.data.contentBody !== existing.contentBody) {
      updateData.version = (existing.version || 1) + 1;
    }

    const [updated] = await db
      .update(documentTemplates)
      .set(updateData)
      .where(and(eq(documentTemplates.id, req.params.id), eq(documentTemplates.workspaceId, workspaceId!)))
      .returning();

    res.json(updated);
  } catch (error: unknown) {
    log.error("[DocumentTemplates] Update error:", error);
    res.status(500).json({ error: "Failed to update document template" });
  }
});

router.delete("/:id", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerRole(req)) return res.status(403).json({ error: "Manager role required" });
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const [existing] = await db
      .select()
      .from(documentTemplates)
      .where(
        and(
          eq(documentTemplates.id, req.params.id),
          eq(documentTemplates.workspaceId, workspaceId)
        )
      );

    if (!existing) return res.status(404).json({ error: "Template not found" });

    const [instanceCount] = await db
      .select({ total: count() })
      .from(documentInstances)
      .where(eq(documentInstances.templateId, req.params.id));

    if ((instanceCount?.total || 0) > 0) {
      const [deactivated] = await db
        .update(documentTemplates)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(documentTemplates.id, req.params.id))
        .returning();

      return res.json({
        message: "Template has associated documents and was deactivated instead of deleted",
        template: deactivated,
      });
    }

    await db
      .delete(documentTemplates)
      .where(eq(documentTemplates.id, req.params.id));

    res.json({ message: "Template deleted successfully" });
  } catch (error: unknown) {
    log.error("[DocumentTemplates] Delete error:", error);
    res.status(500).json({ error: "Failed to delete document template" });
  }
});

const generateDocumentSchema = z.object({
  templateId: z.string().min(1),
  title: z.string().min(1).max(500),
  mergeData: z.record(z.any()).optional().default({}),
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.string().optional(),
});

router.post("/generate", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerRole(req)) return res.status(403).json({ error: "Manager role required" });
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const parsed = generateDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const { templateId, title, mergeData, relatedEntityType, relatedEntityId } = parsed.data;

    const [template] = await db
      .select()
      .from(documentTemplates)
      .where(
        and(
          eq(documentTemplates.id, templateId),
          eq(documentTemplates.workspaceId, workspaceId),
          eq(documentTemplates.isActive, true)
        )
      );

    if (!template) {
      return res.status(404).json({ error: "Template not found or inactive" });
    }

    const requiredFields = (template.mergeFields || []).filter((f) => f.required);
    const missingFields = requiredFields.filter((f) => !(f.key in mergeData));
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: "Missing required merge fields",
        missingFields: missingFields.map((f) => f.key),
      });
    }

    let expiresAt: Date | null = null;
    if (template.expirationDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + template.expirationDays);
    }

    const instanceData = {
      workspaceId,
      templateId,
      title,
      status: "draft" as const,
      mergeData,
      relatedEntityType: relatedEntityType || null,
      relatedEntityId: relatedEntityId || null,
      createdBy: req.user?.id || null,
      expiresAt,
    };

    const instanceParsed = insertDocumentInstanceSchema.safeParse(instanceData);
    if (!instanceParsed.success) {
      return res.status(400).json({ error: "Instance validation failed", details: instanceParsed.error.flatten() });
    }

    const [instance] = await db
      .insert(documentInstances)
      .values(instanceParsed.data)
      .returning();

    res.status(201).json({
      instance,
      template: { id: template.id, name: template.name, version: template.version },
    });
  } catch (error: unknown) {
    log.error("[DocumentTemplates] Generate error:", error);
    res.status(500).json({ error: "Failed to generate document from template" });
  }
});

router.get("/:id/categories", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const categories = await db
      .select({
        category: documentTemplates.category,
        count: count(),
      })
      .from(documentTemplates)
      .where(eq(documentTemplates.workspaceId, workspaceId))
      .groupBy(documentTemplates.category);

    res.json(categories);
  } catch (error: unknown) {
    log.error("[DocumentTemplates] Categories error:", error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

export default router;
