import { Router } from "express";
import type { AuthenticatedRequest } from "../rbac";
import { requireOwner, requireManager, hasManagerAccess, hasPlatformWideAccess } from "../rbac";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { orgFinanceSettings, deductionConfigs, insertOrgFinanceSettingsSchema, insertDeductionConfigSchema } from "@shared/schema";
import { z } from "zod";
import { createLogger } from '../lib/logger';
import { scheduleNonBlocking } from '../lib/scheduleNonBlocking';
const log = createLogger('FinanceSettingsRoutes');


const router = Router();

const updateFinanceSettingsSchema = z.object({
  accountingMode: z.enum(["native", "quickbooks", "hybrid"]).optional(),
  quickbooksSyncEnabled: z.boolean().optional(),
  payrollProvider: z.enum(["internal", "gusto", "patriot", "check"]).optional(),
  payrollProviderExternalId: z.string().nullable().optional(),
  stripeConnectAccountId: z.string().nullable().optional(),
  defaultPaymentTermsDays: z.number().int().min(1).max(180).optional(),
  autoGenerateInvoices: z.boolean().optional(),
  autoSendInvoices: z.boolean().optional(),
  invoicePrefix: z.string().max(10).optional(),
  invoiceFooterNotes: z.string().nullable().optional(),
});

router.get("/finance-settings", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace context required" });

    let [settings] = await db.select().from(orgFinanceSettings).where(eq(orgFinanceSettings.workspaceId, workspaceId));

    if (!settings) {
      [settings] = await db.insert(orgFinanceSettings).values({
        workspaceId,
      }).returning();
    }

    res.json(settings);
  } catch (error: unknown) {
    log.error("Error fetching finance settings:", error);
    res.status(500).json({ error: "Failed to fetch finance settings" });
  }
});

router.patch("/finance-settings", requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace context required" });

    const parsed = updateFinanceSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    }

    let [existing] = await db.select().from(orgFinanceSettings).where(eq(orgFinanceSettings.workspaceId, workspaceId));

    if (!existing) {
      [existing] = await db.insert(orgFinanceSettings).values({
        workspaceId,
        ...parsed.data,
        updatedBy: req.user?.id,
      }).returning();
    } else {
      [existing] = await db.update(orgFinanceSettings)
        .set({
          ...parsed.data,
          updatedAt: new Date(),
          updatedBy: req.user?.id,
        })
        .where(eq(orgFinanceSettings.workspaceId, workspaceId))
        .returning();
    }

    // GAP-AUDIT-1 FIX: Audit trail write for finance settings changes (rate multipliers,
    // accounting mode, QB sync toggle, invoice config). These are high-impact financial
    // configuration changes that require a full immutable record.
    scheduleNonBlocking('finance-settings.audit-write', async () => {
      const { billingAuditLog } = await import('@shared/schema');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await db.insert(billingAuditLog).values({
        workspaceId,
        eventType: 'finance_settings_updated',
        actorType: 'user',
        actorId: req.user?.id,
        idempotencyKey: `finance-settings-${workspaceId}-${Date.now()}`,
        newState: parsed.data,
      }).onConflictDoNothing();
    });

    res.json(existing);
  } catch (error: unknown) {
    log.error("Error updating finance settings:", error);
    res.status(500).json({ error: "Failed to update finance settings" });
  }
});

const createDeductionSchema = z.object({
  name: z.string().min(1).max(100),
  deductionType: z.enum(["health_insurance", "dental", "vision", "401k", "ira", "hsa", "fsa", "life_insurance", "other"]),
  calcMethod: z.enum(["fixed", "percent"]).default("fixed"),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  isPreTax: z.boolean().default(true),
  appliesTo: z.enum(["all", "specific_employees"]).default("all"),
});

const updateDeductionSchema = createDeductionSchema.partial();

router.get("/deduction-configs", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace context required" });

    const configs = await db.select().from(deductionConfigs)
      .where(and(
        eq(deductionConfigs.workspaceId, workspaceId),
        eq(deductionConfigs.isActive, true)
      ));

    res.json(configs);
  } catch (error: unknown) {
    log.error("Error fetching deduction configs:", error);
    res.status(500).json({ error: "Failed to fetch deduction configs" });
  }
});

router.post("/deduction-configs", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace context required" });

    const parsed = createDeductionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    }

    const [config] = await db.insert(deductionConfigs).values({
      workspaceId,
      ...parsed.data,
      createdBy: req.user?.id,
    }).returning();

    res.status(201).json(config);
  } catch (error: unknown) {
    log.error("Error creating deduction config:", error);
    res.status(500).json({ error: "Failed to create deduction config" });
  }
});

router.patch("/deduction-configs/:id", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace context required" });

    const parsed = updateDeductionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    }

    const [updated] = await db.update(deductionConfigs)
      .set({
        ...parsed.data,
        updatedAt: new Date(),
        updatedBy: req.user?.id,
      })
      .where(and(
        eq(deductionConfigs.id, req.params.id),
        eq(deductionConfigs.workspaceId, workspaceId)
      ))
      .returning();

    if (!updated) return res.status(404).json({ error: "Deduction config not found" });
    res.json(updated);
  } catch (error: unknown) {
    log.error("Error updating deduction config:", error);
    res.status(500).json({ error: "Failed to update deduction config" });
  }
});

router.delete("/deduction-configs/:id", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace context required" });

    const [updated] = await db.update(deductionConfigs)
      .set({ isActive: false, updatedAt: new Date(), updatedBy: req.user?.id })
      .where(and(
        eq(deductionConfigs.id, req.params.id),
        eq(deductionConfigs.workspaceId, workspaceId)
      ))
      .returning();

    if (!updated) return res.status(404).json({ error: "Deduction config not found" });
    res.json({ success: true, id: updated.id });
  } catch (error: unknown) {
    log.error("Error deleting deduction config:", error);
    res.status(500).json({ error: "Failed to delete deduction config" });
  }
});

export default router;
