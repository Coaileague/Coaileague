import { Router } from "express";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { customFormSubmissions, employees } from "@shared/schema";
import { requireAuth, type AuthenticatedRequest } from "../rbac";
import { sql } from "drizzle-orm";
import { typedExec } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
const log = createLogger('OnboardingFormsRoutes');


const router = Router();

const ONBOARDING_FORM_ID = "employee-onboarding-packet-v1";

async function getEmployeeForUser(userId: string, workspaceId: string) {
  const [emp] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.workspaceId, workspaceId), eq(employees.userId, userId)))
    .limit(1);
  return emp || null;
}

router.get("/draft", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    const workspaceId = req.workspaceId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    if (!workspaceId) return res.status(403).json({ message: "Workspace context required" });

    const employee = await getEmployeeForUser(userId, workspaceId);

    const [existing] = await db
      .select()
      .from(customFormSubmissions)
      .where(
        and(
          eq(customFormSubmissions.workspaceId, workspaceId),
          eq(customFormSubmissions.formId, ONBOARDING_FORM_ID),
          employee ? eq(customFormSubmissions.employeeId, employee.id) : eq(customFormSubmissions.submittedBy, userId),
        )
      )
      .orderBy(sql`${customFormSubmissions.updatedAt} DESC`)
      .limit(1);

    return res.json({
      success: true,
      draft: existing || null,
      employeeId: employee?.id || null,
    });
  } catch (err: unknown) {
    log.error("[OnboardingForms] GET draft error:", err);
    return res.status(500).json({ message: "Failed to load draft" });
  }
});

router.post("/save-draft", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    const workspaceId = req.workspaceId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    if (!workspaceId) return res.status(403).json({ message: "Workspace context required" });

    const { formData, signatureData, documents: uploadedDocs, currentStep } = req.body;

    const employee = await getEmployeeForUser(userId, workspaceId);

    const [existing] = await db
      .select({ id: customFormSubmissions.id })
      .from(customFormSubmissions)
      .where(
        and(
          eq(customFormSubmissions.workspaceId, workspaceId),
          eq(customFormSubmissions.formId, ONBOARDING_FORM_ID),
          eq(customFormSubmissions.status, "draft"),
          employee ? eq(customFormSubmissions.employeeId, employee.id) : eq(customFormSubmissions.submittedBy, userId),
        )
      )
      .limit(1);

    const savedData = {
      formId: ONBOARDING_FORM_ID,
      workspaceId,
      submittedBy: userId,
      submittedByType: "employee",
      employeeId: employee?.id || null,
      formData: { ...formData, currentStep: currentStep ?? 0 },
      signatureData: signatureData || null,
      documents: uploadedDocs || null,
      status: "draft",
      ipAddress: req.ip || null,
      userAgent: req.get("user-agent") || null,
      updatedAt: new Date(),
    };

    let result: any;
    if (existing) {
      const [updated] = await db
        .update(customFormSubmissions)
        .set(savedData)
        .where(eq(customFormSubmissions.id, existing.id))
        .returning();
      result = updated;
    } else {
      const [created] = await db
        .insert(customFormSubmissions)
        .values({ ...savedData, submittedAt: new Date() })
        .returning();
      result = created;
    }

    return res.json({ success: true, id: result.id });
  } catch (err: unknown) {
    log.error("[OnboardingForms] POST save-draft error:", err);
    return res.status(500).json({ message: "Failed to save draft" });
  }
});

router.post("/submit", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    const workspaceId = req.workspaceId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    if (!workspaceId) return res.status(403).json({ message: "Workspace context required" });

    const { formData, signatureData, documents: uploadedDocs } = req.body;

    if (!signatureData?.fullName) {
      return res.status(400).json({ message: "Signature is required to submit" });
    }

    const employee = await getEmployeeForUser(userId, workspaceId);

    const [existing] = await db
      .select({ id: customFormSubmissions.id })
      .from(customFormSubmissions)
      .where(
        and(
          eq(customFormSubmissions.workspaceId, workspaceId),
          eq(customFormSubmissions.formId, ONBOARDING_FORM_ID),
          employee ? eq(customFormSubmissions.employeeId, employee.id) : eq(customFormSubmissions.submittedBy, userId),
        )
      )
      .limit(1);

    const finalData = {
      formId: ONBOARDING_FORM_ID,
      workspaceId,
      submittedBy: userId,
      submittedByType: "employee",
      employeeId: employee?.id || null,
      formData,
      signatureData: {
        ...signatureData,
        submittedAt: new Date().toISOString(),
        ipAddress: req.ip || null,
      },
      documents: uploadedDocs || null,
      status: "completed",
      hasAccepted: true,
      acceptedAt: new Date(),
      submittedAt: new Date(),
      updatedAt: new Date(),
      ipAddress: req.ip || null,
      userAgent: req.get("user-agent") || null,
    };

    let result: any;
    if (existing) {
      const [updated] = await db
        .update(customFormSubmissions)
        .set(finalData)
        .where(eq(customFormSubmissions.id, existing.id))
        .returning();
      result = updated;
    } else {
      const [created] = await db
        .insert(customFormSubmissions)
        .values(finalData)
        .returning();
      result = created;
    }

    // ── Persist guard card and compliance data to employee record ────────────
    if (employee?.id && uploadedDocs) {
      const docs = uploadedDocs as Record<string, any>;
      // CATEGORY C — Raw SQL retained: ::date | Tables: employees | Verified: 2026-03-23
      await typedExec(sql`
        UPDATE employees SET
          guard_card_number      = COALESCE(${docs.guardCardNumber ?? null}, guard_card_number),
          guard_card_issue_date  = COALESCE(${docs.guardCardIssueDate ?? null}::date, guard_card_issue_date),
          guard_card_expiry_date = COALESCE(${docs.guardCardExpiryDate ?? null}::date, guard_card_expiry_date),
          license_type           = COALESCE(${docs.licenseType ?? null}, license_type),
          compliance_pay_type    = COALESCE(${docs.compliancePayType ?? null}, compliance_pay_type),
          onboarding_status      = 'completed',
          updated_at             = NOW()
        WHERE id = ${employee.id}
      `);
    }

    const { broadcastToWorkspace } = await import("../websocket");
    broadcastToWorkspace(workspaceId, {
      type: "onboarding_form_submitted",
      employeeId: employee?.id,
      submissionId: result.id,
    });

    // ── Webhook Emission ─────────────────────────────────────────────────────
    try {
      const { deliverWebhookEvent } = await import('../services/webhookDeliveryService');
      deliverWebhookEvent(workspaceId, 'officer.activated', {
        officerId: employee?.id,
        submissionId: result.id,
        onboardingStatus: 'completed',
        activatedAt: new Date().toISOString()
      });
    } catch (webhookErr: unknown) {
      log.error('[OnboardingForms] Webhook emission failed:', webhookErr);
    }

    // ── PDF Generation — non-blocking ───────────────────────────────────────
    setImmediate(async () => {
      try {
        const { generateAndStorePdf } = await import('../services/formsPdfService');
        const { workspaces } = await import('@shared/schema');
        const { eq: eqDrizzle } = await import('drizzle-orm');
        const [ws] = await db.select({ name: workspaces.name }).from(workspaces)
          .where(eqDrizzle(workspaces.id, workspaceId)).limit(1);
        const pdfUrl = await generateAndStorePdf({
          submission: {
            id: result.id,
            workspace_id: workspaceId,
            form_id: ONBOARDING_FORM_ID,
            submitted_by_name: signatureData?.fullName || null,
            submitted_by_email: null,
            data: formData || {},
            signature_data: signatureData?.signature || null,
            typed_name: signatureData?.fullName || null,
            submitted_at: result.submittedAt || new Date(),
            ip_address: req.ip || null,
            device_type: null,
          },
          form: {
            id: ONBOARDING_FORM_ID,
            title: 'Employee Onboarding Packet',
            form_type: 'onboarding',
            fields: [],
            requires_signature: true,
            signature_label: 'Employee Signature',
          },
          workspace: { name: ws?.name || null },
        });
        if (pdfUrl) {
          await db.update(customFormSubmissions)
            .set({ generatedDocumentUrl: pdfUrl } as any)
            .where(eqDrizzle(customFormSubmissions.id, result.id));
          log.info(`[OnboardingForms] PDF generated for submission ${result.id}: ${pdfUrl}`);
        }
      } catch (pdfErr: unknown) {
        log.error('[OnboardingForms] PDF generation failed (non-blocking):', pdfErr);
      }
    });

    return res.json({ success: true, id: result.id, status: "completed" });
  } catch (err: unknown) {
    log.error("[OnboardingForms] POST submit error:", err);
    return res.status(500).json({ message: "Failed to submit onboarding forms" });
  }
});

router.get("/status", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    const workspaceId = req.workspaceId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    if (!workspaceId) return res.status(403).json({ message: "Workspace context required" });

    const employee = await getEmployeeForUser(userId, workspaceId);

    const [submission] = await db
      .select()
      .from(customFormSubmissions)
      .where(
        and(
          eq(customFormSubmissions.workspaceId, workspaceId),
          eq(customFormSubmissions.formId, ONBOARDING_FORM_ID),
          employee ? eq(customFormSubmissions.employeeId, employee.id) : eq(customFormSubmissions.submittedBy, userId),
        )
      )
      .orderBy(sql`${customFormSubmissions.updatedAt} DESC`)
      .limit(1);

    return res.json({
      success: true,
      status: submission?.status || "not_started",
      submittedAt: submission?.submittedAt || null,
      currentStep: (submission?.formData as any)?.currentStep ?? 0,
    });
  } catch (err: unknown) {
    return res.status(500).json({ message: "Failed to fetch status" });
  }
});

export default router;
