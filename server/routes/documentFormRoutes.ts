/**
 * Document Form Routes
 * ====================
 * Handles the Universal Document Template System (UDTS) form API.
 *
 * Routes:
 *   GET  /api/document-forms/templates          — list all templates
 *   GET  /api/document-forms/templates/:id      — get single template definition
 *   POST /api/document-forms/validate           — validate form data (Trinity pipeline)
 *   POST /api/document-forms/submit             — validate + store submission + trigger PDF
 *   POST /api/document-forms/draft              — save/update a draft
 *   GET  /api/document-forms/draft/:templateId  — load draft for current user
 */

import { Router } from "express";
import { db } from "../db";
import { customFormSubmissions } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../rbac";
import { getTemplate, getAllTemplates, TEMPLATE_REGISTRY } from "../services/documents/templateRegistry";
import { validateDocumentForm } from "../services/documents/trinityDocumentValidator";
import { createLogger } from '../lib/logger';
const log = createLogger('DocumentFormRoutes');


const router = Router();
router.use(requireAuth);

// ── GET /api/document-forms/templates ────────────────────────────────────────
router.get("/templates", async (_req: AuthenticatedRequest, res) => {
  try {
    const templates = getAllTemplates().map((t) => ({
      id: t.id,
      documentType: t.documentType,
      title: t.title,
      version: t.version,
      category: t.category,
      description: t.description,
      estimatedMinutes: t.estimatedMinutes,
      requiresSignature: t.requiresSignature,
      allowSaveForLater: t.allowSaveForLater,
      sectionCount: t.sections.length,
    }));
    res.json({ templates });
  } catch (err: unknown) {
    log.error("[DocumentForms] list templates error:", err);
    res.status(500).json({ error: "Failed to list templates" });
  }
});

// ── GET /api/document-forms/templates/:templateId ─────────────────────────────
router.get("/templates/:templateId", async (req: AuthenticatedRequest, res) => {
  try {
    const { templateId } = req.params;
    const template = getTemplate(templateId.toUpperCase());
    if (!template) {
      return res.status(404).json({ error: `Template '${templateId}' not found` });
    }
    res.json({ template });
  } catch (err: unknown) {
    log.error("[DocumentForms] get template error:", err);
    res.status(500).json({ error: "Failed to fetch template" });
  }
});

// ── POST /api/document-forms/validate ────────────────────────────────────────
const validateSchema = z.object({
  templateId: z.string().min(1),
  formData: z.record(z.any()),
});

router.post("/validate", async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = validateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    }
    const { templateId, formData } = parsed.data;
    const template = getTemplate(templateId.toUpperCase());
    if (!template) {
      return res.status(404).json({ error: `Template '${templateId}' not found` });
    }
    const result = validateDocumentForm(template, formData);
    res.json(result);
  } catch (err: unknown) {
    log.error("[DocumentForms] validate error:", err);
    res.status(500).json({ error: "Validation failed" });
  }
});

// ── POST /api/document-forms/draft ───────────────────────────────────────────
const draftSchema = z.object({
  templateId: z.string().min(1),
  formData: z.record(z.any()),
  currentSectionIndex: z.number().int().min(0).optional(),
});

router.post("/draft", async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = draftSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    }

    const userId = req.user?.id;
    const workspaceId = req.workspaceId;
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    if (!workspaceId) return res.status(403).json({ error: "Workspace context required" });

    const { templateId, formData, currentSectionIndex } = parsed.data;
    const formId = `udts-${templateId.toLowerCase()}`;

    const [existing] = await db
      .select({ id: customFormSubmissions.id })
      .from(customFormSubmissions)
      .where(
        and(
          eq(customFormSubmissions.workspaceId, workspaceId),
          eq(customFormSubmissions.formId, formId),
          eq(customFormSubmissions.submittedBy, userId),
          eq(customFormSubmissions.status, "draft"),
        )
      )
      .limit(1);

    const payload = {
      formId,
      workspaceId,
      submittedBy: userId,
      submittedByType: "employee",
      formData: {
        ...formData,
        __templateId: templateId,
        __currentSectionIndex: currentSectionIndex ?? 0,
        __savedAt: new Date().toISOString(),
      },
      status: "draft",
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    } as any;

    let record;
    if (existing) {
      [record] = await db
        .update(customFormSubmissions)
        .set({ ...payload, updatedAt: new Date() })
        .where(eq(customFormSubmissions.id, existing.id))
        .returning();
    } else {
      [record] = await db
        .insert(customFormSubmissions)
        .values(payload)
        .returning();
    }

    res.json({ success: true, draftId: record.id, savedAt: new Date().toISOString() });
  } catch (err: unknown) {
    log.error("[DocumentForms] draft save error:", err);
    res.status(500).json({ error: "Failed to save draft" });
  }
});

// ── GET /api/document-forms/draft/:templateId ────────────────────────────────
router.get("/draft/:templateId", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    const workspaceId = req.workspaceId;
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    if (!workspaceId) return res.status(403).json({ error: "Workspace context required" });

    const { templateId } = req.params;
    const formId = `udts-${templateId.toLowerCase()}`;

    const [draft] = await db
      .select()
      .from(customFormSubmissions)
      .where(
        and(
          eq(customFormSubmissions.workspaceId, workspaceId),
          eq(customFormSubmissions.formId, formId),
          eq(customFormSubmissions.submittedBy, userId),
          eq(customFormSubmissions.status, "draft"),
        )
      )
      .orderBy(desc(customFormSubmissions.updatedAt))
      .limit(1);

    if (!draft) return res.json({ draft: null });

    res.json({ draft });
  } catch (err: unknown) {
    log.error("[DocumentForms] draft load error:", err);
    res.status(500).json({ error: "Failed to load draft" });
  }
});

// ── POST /api/document-forms/submit ──────────────────────────────────────────
const submitSchema = z.object({
  templateId: z.string().min(1),
  formData: z.record(z.any()),
  gpsData: z.object({
    latitude: z.number(),
    longitude: z.number(),
    accuracy: z.number(),
    denied: z.boolean().optional(),
  }).optional(),
  skipValidation: z.boolean().optional().default(false),
});

router.post("/submit", async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    }

    const userId = req.user?.id;
    const workspaceId = req.workspaceId;
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    if (!workspaceId) return res.status(403).json({ error: "Workspace context required" });

    const { templateId, formData, gpsData, skipValidation } = parsed.data;
    const template = getTemplate(templateId.toUpperCase());
    if (!template) {
      return res.status(404).json({ error: `Template '${templateId}' not found` });
    }

    // Run Trinity validation
    if (!skipValidation) {
      const validation = validateDocumentForm(template, formData);
      if (!validation.valid) {
        return res.status(422).json({
          error: "Validation failed",
          validation,
        });
      }
    }

    const formId = `udts-${templateId.toLowerCase()}`;

    // Build geo location string
    const geoLocation = gpsData && !gpsData.denied
      ? `${gpsData.latitude.toFixed(6)},${gpsData.longitude.toFixed(6)}`
      : gpsData?.denied ? "denied" : null;

    // Extract primary signature data (first signature field found)
    let primarySignatureData: string | null = null;
    let signerName: string | null = null;
    for (const section of template.sections) {
      for (const field of section.fields) {
        if (field.type === 'signature' && formData[field.id]) {
          primarySignatureData = formData[field.id];
          break;
        }
      }
      if (primarySignatureData) break;
    }

    // Try to extract name from form data
    const nameKeys = ['firstName', 'lastName', 'employeeName', 'fullName', 'name'];
    const parts: string[] = [];
    for (const k of nameKeys) {
      if (formData[k] && typeof formData[k] === 'string') parts.push(formData[k]);
      if (parts.length >= 2) break;
    }
    signerName = parts.join(' ').trim() || null;

    // Store submission record
    const submissionData = {
      formId,
      workspaceId,
      submittedBy: userId,
      submittedByType: "employee",
      formData: {
        ...formData,
        __templateId: templateId,
        __submittedAt: new Date().toISOString(),
        __geoLocation: geoLocation,
      },
      signatureData: primarySignatureData ? {
        signatureData: primarySignatureData,
        signerName,
        signedAt: new Date().toISOString(),
        ipAddress: req.ip,
        geoLocation,
        userAgent: req.headers["user-agent"],
      } : null,
      hasAccepted: true,
      acceptedAt: new Date(),
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
      status: "completed",
    } as any;

    const [submission] = await db
      .insert(customFormSubmissions)
      .values(submissionData)
      .returning();

    // Delete any existing drafts
    await db
      .delete(customFormSubmissions)
      .where(
        and(
          eq(customFormSubmissions.workspaceId, workspaceId),
          eq(customFormSubmissions.formId, formId),
          eq(customFormSubmissions.submittedBy, userId),
          eq(customFormSubmissions.status, "draft"),
        )
      );

    res.json({
      success: true,
      submissionId: submission.id,
      submittedAt: submission.submittedAt,
      message: "Document submitted successfully",
    });
  } catch (err: unknown) {
    log.error("[DocumentForms] submit error:", err);
    res.status(500).json({ error: "Failed to submit document" });
  }
});

// ── GET /api/document-forms/submissions ──────────────────────────────────────
router.get("/submissions", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    const workspaceId = req.workspaceId;
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    if (!workspaceId) return res.status(403).json({ error: "Workspace context required" });

    const submissions = await db
      .select({
        id: customFormSubmissions.id,
        formId: customFormSubmissions.formId,
        status: customFormSubmissions.status,
        submittedAt: customFormSubmissions.submittedAt,
        updatedAt: customFormSubmissions.updatedAt,
      })
      .from(customFormSubmissions)
      .where(
        and(
          eq(customFormSubmissions.workspaceId, workspaceId),
          eq(customFormSubmissions.submittedBy, userId),
        )
      )
      .orderBy(desc(customFormSubmissions.updatedAt))
      .limit(50);

    const enriched = submissions.map((s) => {
      const templateId = s.formId.startsWith("udts-") ? s.formId.slice(5).toUpperCase() : null;
      const template = templateId ? getTemplate(templateId) : null;
      return {
        ...s,
        templateId,
        templateTitle: template?.title ?? null,
        templateCategory: template?.category ?? null,
      };
    });

    res.json({ submissions: enriched });
  } catch (err: unknown) {
    log.error("[DocumentForms] submissions error:", err);
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
});

export default router;
