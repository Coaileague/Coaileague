import { Router } from "express";
import { db } from "../db";
import {
  customForms,
  customFormSubmissions,
  formSignatures,
  insertCustomFormSchema,
  insertCustomFormSubmissionSchema,
  insertFormSignatureSchema,
} from "@shared/schema";
import { eq, and, desc, count, sql, ilike, gte } from "drizzle-orm";
import { z } from "zod";
import type { AuthenticatedRequest } from "../rbac";
import { createLogger } from '../lib/logger';
import { registerLegacyBootstrap } from '../services/legacyBootstrapRegistry';
import { universalAudit } from '../services/universalAuditService';
import { NotificationDeliveryService } from '../services/notificationDeliveryService';
import { generateCustomFormPdf } from '../services/formsPdfService';
const log = createLogger('FormBuilderRoutes');

// ── Schema bootstrap — idempotently add new columns and form_signatures table ─
registerLegacyBootstrap('form-builder-schema', async (pool) => {
  // New columns on custom_forms
  await pool.query(`ALTER TABLE custom_forms ADD COLUMN IF NOT EXISTS routing_rules jsonb`);
  await pool.query(`ALTER TABLE custom_forms ADD COLUMN IF NOT EXISTS prefill_rules jsonb`);

  // New columns on custom_form_submissions (approval workflow + PDF + compliance)
  await pool.query(`ALTER TABLE custom_form_submissions ADD COLUMN IF NOT EXISTS approved_by varchar`);
  await pool.query(`ALTER TABLE custom_form_submissions ADD COLUMN IF NOT EXISTS approved_at timestamptz`);
  await pool.query(`ALTER TABLE custom_form_submissions ADD COLUMN IF NOT EXISTS rejected_by varchar`);
  await pool.query(`ALTER TABLE custom_form_submissions ADD COLUMN IF NOT EXISTS rejected_at timestamptz`);
  await pool.query(`ALTER TABLE custom_form_submissions ADD COLUMN IF NOT EXISTS approval_notes text`);
  await pool.query(`ALTER TABLE custom_form_submissions ADD COLUMN IF NOT EXISTS pdf_url varchar(500)`);
  await pool.query(`ALTER TABLE custom_form_submissions ADD COLUMN IF NOT EXISTS expiry_date timestamptz`);

  // form_signatures — multi-party signature records
  await pool.query(`
    CREATE TABLE IF NOT EXISTS form_signatures (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      submission_id varchar NOT NULL,
      workspace_id varchar NOT NULL,
      signed_by varchar NOT NULL,
      signature_type varchar NOT NULL,
      signature_data text,
      signed_at timestamptz DEFAULT now(),
      ip_address varchar,
      legal_authority varchar
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS form_signatures_submission_idx ON form_signatures (submission_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS form_signatures_workspace_idx ON form_signatures (workspace_id)`);
});


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
      routingRules: z.any().optional(),
      prefillRules: z.any().optional(),
    });

    const parsed = formUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
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
    const { status, since, submittedBy, limit: qLimit, offset: qOffset } = req.query;
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
    if (since && typeof since === "string") {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        conditions.push(gte(customFormSubmissions.submittedAt, sinceDate));
      }
    }
    if (submittedBy && typeof submittedBy === "string") {
      conditions.push(eq(customFormSubmissions.submittedBy, submittedBy));
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

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
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

// ────────────────────────────────────────────────────────────────────────────
// APPROVAL WORKFLOW ROUTES
// ────────────────────────────────────────────────────────────────────────────

/**
 * POST /forms/:formId/submissions/:submissionId/submit
 * Transition a draft submission to "submitted" and notify the approver.
 */
router.post("/forms/:formId/submissions/:submissionId/submit", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const { formId, submissionId } = req.params;

    const [submission] = await db
      .select()
      .from(customFormSubmissions)
      .where(and(
        eq(customFormSubmissions.id, submissionId),
        eq(customFormSubmissions.formId, formId),
        eq(customFormSubmissions.workspaceId, workspaceId),
      ));

    if (!submission) return res.status(404).json({ error: "Submission not found" });

    if (!["draft", "completed"].includes(submission.status || "")) {
      return res.status(409).json({ error: `Cannot submit a form in status "${submission.status}"` });
    }

    const [form] = await db
      .select()
      .from(customForms)
      .where(and(eq(customForms.id, formId), eq(customForms.workspaceId, workspaceId)));

    if (!form) return res.status(404).json({ error: "Form not found" });

    const now = new Date();
    const [updated] = await db
      .update(customFormSubmissions)
      .set({ status: "submitted", submittedAt: now, updatedAt: now })
      .where(and(
        eq(customFormSubmissions.id, submissionId),
        eq(customFormSubmissions.workspaceId, workspaceId),
      ))
      .returning();

    await universalAudit.log({
      workspaceId,
      actorId: req.user?.id || null,
      actorType: 'user',
      action: 'form.submitted',
      entityType: 'form_submission',
      entityId: submissionId,
      entityName: form.name,
      changeType: 'update',
      metadata: { formId, previousStatus: submission.status },
    });

    // Notify the approver if routing rules specify one
    const routingRules = form.routingRules as any;
    if (routingRules?.approverUserId) {
      try {
        await NotificationDeliveryService.send({
          idempotencyKey: `notif-${Date.now()}`,
            type: 'document_requires_signature',
          workspaceId,
          recipientUserId: routingRules.approverUserId,
          channel: 'in_app',
          subject: `Form needs review: ${form.name}`,
          body: {
            message: `A new "${form.name}" submission is waiting for your review.`,
            submissionId,
            formId,
            formName: form.name,
            submittedBy: req.user?.id,
          },
        });
      } catch (notifErr: any) {
        log.warn('[FormBuilder] Approval notification failed (non-fatal):', notifErr?.message);
      }
    }

    res.json({ ...updated, formName: form.name });
  } catch (error: unknown) {
    log.error("[FormBuilder] Error submitting form:", error);
    res.status(500).json({ error: "Failed to submit form" });
  }
});

/**
 * POST /forms/:formId/submissions/:submissionId/approve
 * Approve or reject a submitted form. Manager role required.
 * Body: { approved: boolean, notes?: string, signatureData?: string }
 */
router.post("/forms/:formId/submissions/:submissionId/approve", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerRole(req)) return res.status(403).json({ error: "Manager role required" });
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const { formId, submissionId } = req.params;

    const approveSchema = z.object({
      approved: z.boolean(),
      notes: z.string().optional(),
      signatureData: z.string().optional(), // base64 canvas or typed name
    });

    const parsed = approveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const { approved, notes, signatureData } = parsed.data;

    const [submission] = await db
      .select()
      .from(customFormSubmissions)
      .where(and(
        eq(customFormSubmissions.id, submissionId),
        eq(customFormSubmissions.formId, formId),
        eq(customFormSubmissions.workspaceId, workspaceId),
      ));

    if (!submission) return res.status(404).json({ error: "Submission not found" });

    if (submission.status !== "submitted") {
      return res.status(409).json({ error: `Cannot approve/reject a form in status "${submission.status}"` });
    }

    const [form] = await db
      .select()
      .from(customForms)
      .where(and(eq(customForms.id, formId), eq(customForms.workspaceId, workspaceId)));

    const reviewerId = req.user?.id || "system";
    const now = new Date();
    const newStatus = approved ? "approved" : "rejected";

    const updateFields: Record<string, unknown> = {
      status: newStatus,
      approvalNotes: notes || null,
      updatedAt: now,
    };
    if (approved) {
      updateFields.approvedBy = reviewerId;
      updateFields.approvedAt = now;
    } else {
      updateFields.rejectedBy = reviewerId;
      updateFields.rejectedAt = now;
    }

    const [updated] = await db
      .update(customFormSubmissions)
      .set(updateFields)
      .where(and(
        eq(customFormSubmissions.id, submissionId),
        eq(customFormSubmissions.workspaceId, workspaceId),
      ))
      .returning();

    // Record reviewer's signature if provided
    if (signatureData && req.user?.id) {
      try {
        await db.insert(formSignatures).values({
          submissionId,
          workspaceId,
          signedBy: req.user?.id,
          signatureType: signatureData.startsWith("data:image") ? "canvas" : "typed",
          signatureData,
          ipAddress: req.ip || null,
        });
      } catch (sigErr: any) {
        log.warn('[FormBuilder] Signature record failed (non-fatal):', sigErr?.message);
      }
    }

    await universalAudit.log({
      workspaceId,
      actorId: reviewerId,
      actorType: 'user',
      action: approved ? 'approval.granted' : 'approval.denied',
      entityType: 'form_submission',
      entityId: submissionId,
      entityName: form?.name || formId,
      changeType: 'update',
      metadata: { notes, approved },
    });

    // Notify submitter of the decision
    if (submission.submittedBy) {
      try {
        await NotificationDeliveryService.send({
          idempotencyKey: `notif-${Date.now()}`,
            type: 'document_requires_signature',
          workspaceId,
          recipientUserId: submission.submittedBy,
          channel: 'in_app',
          subject: `Form ${approved ? "approved" : "rejected"}: ${form?.name || ""}`,
          body: {
            message: approved
              ? `Your "${form?.name}" submission has been approved.`
              : `Your "${form?.name}" submission has been rejected${notes ? `: ${notes}` : "."}`,
            submissionId,
            approved,
            notes,
          },
        });
      } catch (notifErr: any) {
        log.warn('[FormBuilder] Decision notification failed (non-fatal):', notifErr?.message);
      }
    }

    res.json(updated);
  } catch (error: unknown) {
    log.error("[FormBuilder] Error approving submission:", error);
    res.status(500).json({ error: "Failed to process approval" });
  }
});

/**
 * GET /forms/:formId/submissions/:submissionId/pdf
 * Generate and stream the PDF for a form submission.
 */
router.get("/forms/:formId/submissions/:submissionId/pdf", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const { formId, submissionId } = req.params;

    const [submission] = await db
      .select()
      .from(customFormSubmissions)
      .where(and(
        eq(customFormSubmissions.id, submissionId),
        eq(customFormSubmissions.formId, formId),
        eq(customFormSubmissions.workspaceId, workspaceId),
      ));

    if (!submission) return res.status(404).json({ error: "Submission not found" });

    const [form] = await db
      .select()
      .from(customForms)
      .where(and(eq(customForms.id, formId), eq(customForms.workspaceId, workspaceId)));

    if (!form) return res.status(404).json({ error: "Form not found" });

    // Fetch reviewer signatures for the approval stamp
    const signatures = await db
      .select()
      .from(formSignatures)
      .where(eq(formSignatures.submissionId, submissionId));

    const pdfBuffer = await generateCustomFormPdf({ form, submission, signatures });

    if (!pdfBuffer) {
      return res.status(500).json({ error: "PDF generation failed" });
    }

    const fileName = `${form.name.replace(/[^a-z0-9]/gi, "_")}_${submissionId.slice(0, 8)}.pdf`;
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Content-Length": pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (error: unknown) {
    log.error("[FormBuilder] Error generating submission PDF:", error);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

export default router;
