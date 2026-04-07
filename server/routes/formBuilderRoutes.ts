import { Router } from "express";
import { db } from "../db";
import {
  customForms,
  customFormSubmissions,
  insertCustomFormSchema,
  insertCustomFormSubmissionSchema,
} from "@shared/schema";
import { eq, and, desc, count, sql, ilike } from "drizzle-orm";
import { z } from "zod";
import type { AuthenticatedRequest } from "../rbac";
import { createLogger } from '../lib/logger';
const log = createLogger('FormBuilderRoutes');


const MANAGER_ROLES = ["org_owner", "co_owner", "manager", "department_manager", "supervisor", "root_admin", "sysop"];

function hasManagerRole(req: any): boolean {
  const role = req.workspaceRole || req.session?.workspaceRole || req.user?.platformRole;
  if (MANAGER_ROLES.includes(role)) return true;
  if (process.env.NODE_ENV !== 'production' && req.user?.id?.startsWith("dev-owner")) return true;
  return false;
}

const router = Router();

router.get("/forms", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const { category, search, activeOnly } = req.query;
    const conditions = [eq(customForms.workspaceId, workspaceId)];

    if (category && typeof category === "string") {
      conditions.push(eq(customForms.category, category));
    }

    if (search && typeof search === "string") {
      conditions.push(ilike(customForms.name, `%${search}%`));
    }

    if (activeOnly === "true") {
      conditions.push(eq(customForms.isActive, true));
    }

    const forms = await db
      .select()
      .from(customForms)
      .where(and(...conditions))
      .orderBy(desc(customForms.createdAt));

    res.json(forms);
  } catch (error: unknown) {
    log.error("[FormBuilder] Error listing forms:", error);
    res.status(500).json({ error: "Failed to list forms" });
  }
});

router.get("/forms/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const [form] = await db
      .select()
      .from(customForms)
      .where(
        and(
          eq(customForms.id, req.params.id),
          eq(customForms.workspaceId, workspaceId)
        )
      );

    if (!form) return res.status(404).json({ error: "Form not found" });

    const [submissionCount] = await db
      .select({ total: count() })
      .from(customFormSubmissions)
      .where(eq(customFormSubmissions.formId, form.id));

    res.json({ ...form, submissionCount: submissionCount?.total || 0 });
  } catch (error: unknown) {
    log.error("[FormBuilder] Error fetching form:", error);
    res.status(500).json({ error: "Failed to fetch form" });
  }
});

router.post("/forms", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerRole(req)) return res.status(403).json({ error: "Manager role required" });
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const parsed = insertCustomFormSchema.safeParse({
      ...req.body,
      workspaceId,
      createdBy: req.user?.id || null,
    });

    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const [form] = await db
      .insert(customForms)
      .values(parsed.data)
      .returning();

    res.status(201).json(form);
  } catch (error: unknown) {
    log.error("[FormBuilder] Error creating form:", error);
    res.status(500).json({ error: "Failed to create form" });
  }
});

router.patch("/forms/:id", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerRole(req)) return res.status(403).json({ error: "Manager role required" });
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const [existing] = await db
      .select()
      .from(customForms)
      .where(
        and(
          eq(customForms.id, req.params.id),
          eq(customForms.workspaceId, workspaceId)
        )
      );

    if (!existing) return res.status(404).json({ error: "Form not found" });

    const formUpdateSchema = z.object({
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      category: z.string().optional(),
      template: z.any().optional(),
      requiresSignature: z.boolean().optional(),
      signatureType: z.string().optional(),
      signatureText: z.string().optional(),
      requiresDocuments: z.boolean().optional(),
      documentTypes: z.array(z.string()).optional(),
      maxDocuments: z.number().int().nonnegative().optional(),
      isActive: z.boolean().optional(),
      accessibleBy: z.array(z.string()).optional(),
    });

    const parsed = formUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value !== undefined) updateData[key] = value;
    }

    const [updated] = await db
      .update(customForms)
      .set(updateData)
      .where(and(eq(customForms.id, req.params.id), eq(customForms.workspaceId, workspaceId)))
      .returning();

    res.json(updated);
  } catch (error: unknown) {
    log.error("[FormBuilder] Error updating form:", error);
    res.status(500).json({ error: "Failed to update form" });
  }
});

router.delete("/forms/:id", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerRole(req)) return res.status(403).json({ error: "Manager role required" });
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const [existing] = await db
      .select()
      .from(customForms)
      .where(
        and(
          eq(customForms.id, req.params.id),
          eq(customForms.workspaceId, workspaceId)
        )
      );

    if (!existing) return res.status(404).json({ error: "Form not found" });

    await db.delete(customForms).where(and(eq(customForms.id, req.params.id), eq(customForms.workspaceId, workspaceId)));

    res.json({ success: true });
  } catch (error: unknown) {
    log.error("[FormBuilder] Error deleting form:", error);
    res.status(500).json({ error: "Failed to delete form" });
  }
});

router.post("/forms/:id/duplicate", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerRole(req)) return res.status(403).json({ error: "Manager role required" });
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const [original] = await db
      .select()
      .from(customForms)
      .where(
        and(
          eq(customForms.id, req.params.id),
          eq(customForms.workspaceId, workspaceId)
        )
      );

    if (!original) return res.status(404).json({ error: "Form not found" });

    const [duplicate] = await db
      .insert(customForms)
      .values({
        workspaceId,
        name: `${original.name} (Copy)`,
        description: original.description,
        category: original.category,
        template: original.template,
        requiresSignature: original.requiresSignature,
        signatureType: original.signatureType,
        signatureText: original.signatureText,
        requiresDocuments: original.requiresDocuments,
        documentTypes: original.documentTypes,
        maxDocuments: original.maxDocuments,
        isActive: false,
        accessibleBy: original.accessibleBy,
        createdBy: req.user?.id || null,
      })
      .returning();

    res.status(201).json(duplicate);
  } catch (error: unknown) {
    log.error("[FormBuilder] Error duplicating form:", error);
    res.status(500).json({ error: "Failed to duplicate form" });
  }
});

router.get("/forms/:formId/submissions", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const { formId } = req.params;
    const { status, limit: qLimit, offset: qOffset } = req.query;
    const limit = Math.min(Math.max(parseInt(qLimit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(qOffset as string) || 0, 0);

    const [formCheck] = await db
      .select()
      .from(customForms)
      .where(
        and(
          eq(customForms.id, formId),
          eq(customForms.workspaceId, workspaceId)
        )
      );

    if (!formCheck) return res.status(404).json({ error: "Form not found" });

    const conditions = [
      eq(customFormSubmissions.formId, formId),
      eq(customFormSubmissions.workspaceId, workspaceId),
    ];

    if (status && typeof status === "string") {
      conditions.push(eq(customFormSubmissions.status, status));
    }

    const [totalResult] = await db
      .select({ total: count() })
      .from(customFormSubmissions)
      .where(and(...conditions));

    const submissions = await db
      .select()
      .from(customFormSubmissions)
      .where(and(...conditions))
      .orderBy(desc(customFormSubmissions.submittedAt))
      .limit(limit)
      .offset(offset);

    res.json({ items: submissions, total: totalResult?.total || 0, limit, offset });
  } catch (error: unknown) {
    log.error("[FormBuilder] Error listing submissions:", error);
    res.status(500).json({ error: "Failed to list submissions" });
  }
});

router.get("/submissions/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const [submission] = await db
      .select()
      .from(customFormSubmissions)
      .where(
        and(
          eq(customFormSubmissions.id, req.params.id),
          eq(customFormSubmissions.workspaceId, workspaceId)
        )
      );

    if (!submission) return res.status(404).json({ error: "Submission not found" });

    const [form] = await db
      .select()
      .from(customForms)
      .where(eq(customForms.id, submission.formId));

    res.json({ ...submission, form: form || null });
  } catch (error: unknown) {
    log.error("[FormBuilder] Error fetching submission:", error);
    res.status(500).json({ error: "Failed to fetch submission" });
  }
});

router.post("/submissions", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const parsed = insertCustomFormSubmissionSchema.safeParse({
      ...req.body,
      workspaceId,
      submittedBy: req.user?.id || null,
    });

    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const [form] = await db
      .select()
      .from(customForms)
      .where(
        and(
          eq(customForms.id, parsed.data.formId),
          eq(customForms.workspaceId, workspaceId)
        )
      );

    if (!form) return res.status(404).json({ error: "Form not found" });

    if (!form.isActive) {
      return res.status(400).json({ error: "Form is not active" });
    }

    const [submission] = await db
      .insert(customFormSubmissions)
      .values(parsed.data)
      .returning();

    res.status(201).json(submission);
  } catch (error: unknown) {
    log.error("[FormBuilder] Error creating submission:", error);
    res.status(500).json({ error: "Failed to create submission" });
  }
});

router.patch("/submissions/:id", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerRole(req)) return res.status(403).json({ error: "Manager role required to review submissions" });
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const [existing] = await db
      .select()
      .from(customFormSubmissions)
      .where(
        and(
          eq(customFormSubmissions.id, req.params.id),
          eq(customFormSubmissions.workspaceId, workspaceId)
        )
      );

    if (!existing) return res.status(404).json({ error: "Submission not found" });

    const updateSchema = z.object({
      status: z.enum(["draft", "completed", "archived", "approved", "rejected"]).optional(),
      formData: z.any().optional(),
      signatureData: z.any().optional(),
      hasAccepted: z.boolean().optional(),
      documents: z.any().optional(),
    });

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    const { data } = parsed;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.formData !== undefined) updateData.formData = data.formData;
    if (data.signatureData !== undefined) updateData.signatureData = data.signatureData;
    if (data.hasAccepted !== undefined) {
      updateData.hasAccepted = data.hasAccepted;
      if (data.hasAccepted) updateData.acceptedAt = new Date();
    }
    if (data.documents !== undefined) updateData.documents = data.documents;

    const [updated] = await db
      .update(customFormSubmissions)
      .set(updateData)
      .where(eq(customFormSubmissions.id, req.params.id))
      .returning();

    res.json(updated);
  } catch (error: unknown) {
    log.error("[FormBuilder] Error updating submission:", error);
    res.status(500).json({ error: "Failed to update submission" });
  }
});

router.get("/stats", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const [formCount] = await db
      .select({ total: count() })
      .from(customForms)
      .where(eq(customForms.workspaceId, workspaceId));

    const [activeFormCount] = await db
      .select({ total: count() })
      .from(customForms)
      .where(and(eq(customForms.workspaceId, workspaceId), eq(customForms.isActive, true)));

    const [submissionCount] = await db
      .select({ total: count() })
      .from(customFormSubmissions)
      .where(eq(customFormSubmissions.workspaceId, workspaceId));

    const [completedCount] = await db
      .select({ total: count() })
      .from(customFormSubmissions)
      .where(
        and(
          eq(customFormSubmissions.workspaceId, workspaceId),
          eq(customFormSubmissions.status, "completed")
        )
      );

    const categoryBreakdown = await db
      .select({
        category: customForms.category,
        total: count(),
      })
      .from(customForms)
      .where(eq(customForms.workspaceId, workspaceId))
      .groupBy(customForms.category);

    res.json({
      totalForms: formCount?.total || 0,
      activeForms: activeFormCount?.total || 0,
      totalSubmissions: submissionCount?.total || 0,
      completedSubmissions: completedCount?.total || 0,
      categoryBreakdown,
    });
  } catch (error: unknown) {
    log.error("[FormBuilder] Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch form builder stats" });
  }
});

export default router;
