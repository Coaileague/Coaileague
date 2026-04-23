import { sanitizeError } from '../middleware/errorHandler';
import { PLATFORM } from '../config/platformConfig';
import { Router } from "express";
import type { AuthenticatedRequest } from "../rbac";
import { requireManager, requireOwner } from "../rbac";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import Stripe from "stripe";
import { createLogger } from '../lib/logger';
const log = createLogger('BillingSettingsRoutes');

import {
  workspaces,
  clients,
  clientBillingSettings,
  payrollSettings,
  auditLogs,
  insertClientBillingSettingsSchema
} from '@shared/schema';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// WORKSPACE BILLING SETTINGS  (payroll cycle, default billing config)
// ─────────────────────────────────────────────────────────────────────────────

router.get("/workspace", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: "Workspace required" });

    const [ws] = await db.select({ blob: workspaces.billingSettingsBlob })
      .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    const settings = ws?.blob || null;

    res.json({ settings, isDefault: !settings || Object.keys(settings as object).length === 0 });
  } catch (error: unknown) {
    log.error("[BillingSettings] Error fetching workspace settings:", sanitizeError(error));
    res.status(500).json({ message: "Failed to fetch billing settings" });
  }
});

router.post("/workspace", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: "Workspace required" });

    const [ws] = await db.select({ blob: workspaces.billingSettingsBlob })
      .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    const current = ((ws?.blob || {}) as Record<string, any>);

    const allowedSettingsFields = [
      'payrollCycle', 'payrollDayOfWeek', 'payrollDayOfMonth', 'payrollSecondDayOfMonth',
      'payrollCutoffDays', 'payrollFirstPeriodStart', 'payrollFirstPeriodEnd',
      'defaultBillingCycle', 'defaultPaymentTerms', 'defaultOvertimeThreshold',
      'defaultDailyOvertimeThreshold', 'defaultOvertimeMultiplier', 'defaultDoubleTimeMultiplier',
      'autoGenerateInvoices', 'invoicePrefix', 'invoiceNumberStart', 'invoiceProvider',
      'payrollProvider', 'qbAutoSync',
    ];
    const merged: Record<string, any> = { ...current, workspaceId, updatedAt: new Date().toISOString() };
    for (const field of allowedSettingsFields) {
      if (req.body[field] !== undefined) merged[field] = req.body[field];
    }

    await db.update(workspaces).set({ billingSettingsBlob: merged }).where(eq(workspaces.id, workspaceId));

    // Phase 7: audit all billing settings writes
    try {
      const { universalAudit } = await import('../services/universalAuditService');
      await universalAudit.log({
        workspaceId,
        actorId: req.user?.id || null,
        actorType: req.user?.id ? 'user' : 'system',
        action: 'settings.updated',
        entityType: 'workspace_billing_settings',
        entityId: workspaceId,
        changeType: 'update',
        changes: Object.fromEntries(Object.keys(req.body).map(k => [k, { old: null, new: req.body[k] }])),
        sourceRoute: 'POST /api/billing-settings',
      });
    } catch (_) { /* audit is best-effort */ }

    res.json({ settings: merged });
  } catch (error: unknown) {
    log.error("[BillingSettings] Error saving workspace settings:", sanitizeError(error));
    res.status(500).json({ message: "Failed to save billing settings" });
  }
});

router.patch("/workspace", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: "Workspace required" });

    const [ws] = await db.select({ blob: workspaces.billingSettingsBlob })
      .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    const current = ((ws?.blob || {}) as Record<string, any>);

    const allowedFields = [
      // Payroll cycle
      'payrollCycle',               // weekly | biweekly | semimonthly | monthly
      'payrollDayOfWeek',           // 0-6 (Sun-Sat) — anchor for weekly/biweekly
      'payrollDayOfMonth',          // 1-31 — anchor for monthly / first day of semimonthly
      'payrollSecondDayOfMonth',    // 1-31 — second day of semimonthly
      'payrollCutoffDays',          // how many days before period end payroll locks
      'payrollFirstPeriodStart',    // ISO date — start of very first payroll period (synchronisation anchor)
      'payrollFirstPeriodEnd',      // ISO date — end of very first payroll period
      // Default billing/invoice config
      'defaultBillingCycle',
      'defaultPaymentTerms',
      'defaultOvertimeThreshold',
      'defaultDailyOvertimeThreshold',
      'defaultOvertimeMultiplier',
      'defaultDoubleTimeMultiplier',
      'autoGenerateInvoices',
      'invoicePrefix',
      'invoiceNumberStart',
      'invoiceProvider',
      'payrollProvider',
      'qbAutoSync',
    ];

    const updates: Record<string, any> = { ...current, updatedAt: new Date().toISOString() };
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if ((req.body.payrollFrequency !== undefined && req.body.payrollFrequency === null) ||
        (req.body.payrollCycle !== undefined && req.body.payrollCycle === null)) {
      return res.status(400).json({ message: "payrollFrequency/payrollCycle cannot be null or undefined" });
    }

    // PRIMARY WRITE: billingSettingsBlob is the canonical source for payrollCycle and all
    // billing preferences — all payroll services read from this blob. The dedicated workspace
    // columns (payrollCycle, payrollDayOfWeek, payrollDayOfMonth) are kept in sync below as
    // a secondary mirror so they remain consistent. Do NOT add a second code path that reads
    // from the dedicated columns without updating this sync block.
    const wsColumnSync: Record<string, unknown> = { billingSettingsBlob: updates };
    if (req.body.payrollCycle !== undefined)      wsColumnSync.payrollCycle      = req.body.payrollCycle;
    if (req.body.payrollDayOfWeek !== undefined)  wsColumnSync.payrollDayOfWeek  = Number(req.body.payrollDayOfWeek);
    if (req.body.payrollDayOfMonth !== undefined) wsColumnSync.payrollDayOfMonth = Number(req.body.payrollDayOfMonth);

    const [existingPayrollSettings] = await db
      .select()
      .from(payrollSettings)
      .where(eq(payrollSettings.workspaceId, workspaceId))
      .limit(1);

    // payrollCycle remains a compatibility alias for payrollFrequency during transition.
    const mergedPayrollSettings: Record<string, unknown> = {
      ...(existingPayrollSettings || {}),
      workspaceId,
      payrollFrequency: (req.body.payrollFrequency ?? req.body.payrollCycle ?? existingPayrollSettings?.payrollFrequency ?? 'biweekly'),
      payrollDayOfWeek: req.body.payrollDayOfWeek !== undefined ? Number(req.body.payrollDayOfWeek) : existingPayrollSettings?.payrollDayOfWeek,
      payrollDayOfMonth: req.body.payrollDayOfMonth !== undefined ? Number(req.body.payrollDayOfMonth) : existingPayrollSettings?.payrollDayOfMonth,
      payrollSecondDayOfMonth: req.body.payrollSecondDayOfMonth !== undefined ? Number(req.body.payrollSecondDayOfMonth) : existingPayrollSettings?.payrollSecondDayOfMonth,
      payrollCutoffDays: req.body.payrollCutoffDays !== undefined ? Number(req.body.payrollCutoffDays) : existingPayrollSettings?.payrollCutoffDays,
      payrollFirstPeriodStart: req.body.payrollFirstPeriodStart !== undefined ? req.body.payrollFirstPeriodStart : existingPayrollSettings?.payrollFirstPeriodStart,
      payrollFirstPeriodEnd: req.body.payrollFirstPeriodEnd !== undefined ? req.body.payrollFirstPeriodEnd : existingPayrollSettings?.payrollFirstPeriodEnd,
      createdAt: existingPayrollSettings?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    // Omit existing row id so inserts/updates only write mutable settings fields.
    const { id: _existingId, ...mergedPayrollSettingsWithoutId } = mergedPayrollSettings as Record<string, unknown> & { id?: string };

    let persistedPayrollSettings: Record<string, unknown> | null = null;
    await db.transaction(async (tx) => {
      await tx.update(workspaces).set(wsColumnSync).where(eq(workspaces.id, workspaceId));

      if (existingPayrollSettings?.id) {
        const [updatedPayrollSettings] = await tx.update(payrollSettings)
          .set(mergedPayrollSettingsWithoutId as any)
          .where(eq(payrollSettings.id, existingPayrollSettings.id))
          .returning();
        persistedPayrollSettings = updatedPayrollSettings as any;
      } else {
        const [insertedPayrollSettings] = await tx.insert(payrollSettings).values(mergedPayrollSettingsWithoutId as any).returning();
        persistedPayrollSettings = insertedPayrollSettings as any;
      }

      await tx.insert(auditLogs).values({
        workspaceId,
        userId: req.user?.id || null,
        action: 'payroll_settings_updated',
        entityType: 'payroll_settings',
        entityId: workspaceId,
        changesBefore: existingPayrollSettings || null,
        changesAfter: persistedPayrollSettings,
        createdAt: new Date(),
      } as any);
    });

    // Phase 7: audit ALL billing settings changes unconditionally
    try {
      const { universalAudit } = await import('../services/universalAuditService');
      const updatedFields = Object.keys(req.body).filter(k => req.body[k] !== undefined);
      await universalAudit.log({
        workspaceId,
        actorId: req.user?.id || null,
        actorType: req.user?.id ? 'user' : 'system',
        action: 'settings.updated',
        entityType: 'workspace_billing_settings',
        entityId: workspaceId,
        changeType: 'update',
        changes: Object.fromEntries(updatedFields.map(k => [k, { old: current[k], new: req.body[k] }])),
        metadata: { action: req.body.payrollCycle !== undefined || req.body.payrollFirstPeriodStart !== undefined ? 'payroll_cycle_configured' : 'billing_settings_updated' },
        sourceRoute: 'PATCH /api/billing-settings/workspace',
      });
    } catch (_) { /* audit is best-effort */ }

    res.json({ settings: updates });
  } catch (error: unknown) {
    log.error("[BillingSettings] Error updating workspace settings:", sanitizeError(error));
    res.status(500).json({ message: "Failed to update billing settings" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT BILLING TERMS  (per-client invoice frequency, service dates, etc.)
// ─────────────────────────────────────────────────────────────────────────────

router.get("/clients", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: "Workspace required" });

    const settings = await db
      .select({
        billingSettings: clientBillingSettings,
        clientName: clients.companyName,
        clientFirstName: clients.firstName,
        clientLastName: clients.lastName,
      })
      .from(clientBillingSettings)
      .leftJoin(clients, eq(clientBillingSettings.clientId, clients.id))
      .where(eq(clientBillingSettings.workspaceId, workspaceId));

    res.json({ settings });
  } catch (error: unknown) {
    log.error("[BillingSettings] Error fetching client settings:", sanitizeError(error));
    res.status(500).json({ message: "Failed to fetch client billing settings" });
  }
});

router.get("/clients/:clientId", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const { clientId } = req.params;
    if (!workspaceId) return res.status(400).json({ message: "Workspace required" });

    const [settings] = await db
      .select()
      .from(clientBillingSettings)
      .where(and(eq(clientBillingSettings.workspaceId, workspaceId), eq(clientBillingSettings.clientId, clientId)))
      .limit(1);

    res.json({ settings: settings || null, isDefault: !settings });
  } catch (error: unknown) {
    log.error("[BillingSettings] Error fetching client settings:", sanitizeError(error));
    res.status(500).json({ message: "Failed to fetch client billing settings" });
  }
});

router.post("/clients/:clientId", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const { clientId } = req.params;
    if (!workspaceId) return res.status(400).json({ message: "Workspace required" });

    const clientExists = await db.select({ id: clients.id }).from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId))).limit(1);

    if (clientExists.length === 0) return res.status(404).json({ message: "Client not found in this workspace" });

    const body = { ...req.body, workspaceId, clientId };
    const parsed = insertClientBillingSettingsSchema.parse(body);

    let settings;
    await db.transaction(async (tx) => {
      const existing = await tx.select().from(clientBillingSettings)
        .where(and(eq(clientBillingSettings.workspaceId, workspaceId), eq(clientBillingSettings.clientId, clientId))).limit(1);

      if (existing.length > 0) {
        [settings] = await tx.update(clientBillingSettings).set({ ...parsed, updatedAt: new Date() })
          .where(eq(clientBillingSettings.id, existing[0].id)).returning();
      } else {
        [settings] = await tx.insert(clientBillingSettings).values(parsed).returning();
      }
    });

    res.json({ settings });
  } catch (error: unknown) {
    log.error("[BillingSettings] Error saving client settings:", sanitizeError(error));
    res.status(500).json({ message: "Failed to save client billing settings" });
  }
});

router.patch("/clients/:clientId", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const { clientId } = req.params;
    if (!workspaceId) return res.status(400).json({ message: "Workspace required" });

    const existing = await db.select().from(clientBillingSettings)
      .where(and(eq(clientBillingSettings.workspaceId, workspaceId), eq(clientBillingSettings.clientId, clientId))).limit(1);

    if (existing.length === 0) return res.status(404).json({ message: "No billing settings found for this client. Use POST to create." });

    const allowedFields = [
      // Service contract window
      'serviceStartDate',
      'serviceEndDate',
      // Invoice frequency
      'billingCycle',               // daily | weekly | biweekly | semimonthly | monthly
      'billingDayOfWeek',           // 0-6 anchor for weekly/biweekly invoices
      'billingDayOfMonth',          // 1-31 anchor for monthly / first day of semimonthly
      'billingSecondDayOfMonth',    // 1-31 second day for semimonthly
      // Payment terms
      'paymentTerms',               // net_15 | net_30 | net_45 | net_60 | due_on_receipt
      // Rates
      'defaultBillRate', 'defaultPayRate',
      'overtimeBillMultiplier', 'overtimePayMultiplier',
      // Invoice format
      'invoiceFormat', 'groupLineItemsBy', 'includeTimeBreakdown',
      'includeEmployeeDetails', 'autoSendInvoice', 'invoiceRecipientEmails',
      'ccEmails',
      // QB
      'qbCustomerId', 'qbItemId', 'qbClassId',
      'isActive',
    ];

    if (req.body.paymentTerms !== undefined && req.body.paymentTerms === null) {
      return res.status(400).json({ message: "paymentTerms cannot be null or undefined" });
    }

    const merged: Record<string, any> = { ...existing[0], updatedAt: new Date() };
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) merged[field] = req.body[field];
    }

    const [settings] = await db.update(clientBillingSettings).set(merged)
      .where(eq(clientBillingSettings.id, existing[0].id)).returning();

    await db.insert(auditLogs).values({
      workspaceId,
      userId: req.user?.id || null,
      action: 'invoice_settings_updated',
      entityType: 'invoice_settings',
      entityId: existing[0].id,
      changesBefore: existing[0],
      changesAfter: settings,
      createdAt: new Date(),
    } as any);

    res.json({ settings });
  } catch (error: unknown) {
    log.error("[BillingSettings] Error updating client settings:", sanitizeError(error));
    res.status(500).json({ message: "Failed to update client billing settings" });
  }
});

router.delete("/clients/:clientId", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const { clientId } = req.params;
    if (!workspaceId) return res.status(400).json({ message: "Workspace required" });

    const deleted = await db.delete(clientBillingSettings)
      .where(and(eq(clientBillingSettings.workspaceId, workspaceId), eq(clientBillingSettings.clientId, clientId)))
      .returning();

    if (deleted.length === 0) return res.status(404).json({ message: "No billing settings found for this client" });

    res.json({ message: "Client billing settings removed, workspace defaults will apply" });
  } catch (error: unknown) {
    log.error("[BillingSettings] Error deleting client settings:", sanitizeError(error));
    res.status(500).json({ message: "Failed to delete client billing settings" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT METHODS ON FILE
// Cards/ACH saved to the workspace's Stripe customer for:
//   - Subscription charges
//   - Credit pack purchases
//   - AI credit overages
//   - Middleware transaction fees (payroll per-run, invoice processing, payout ACH)
// ─────────────────────────────────────────────────────────────────────────────

// Use canonical lazy Stripe factory (TRINITY.md §F) — single API version, shared singleton.
import { getStripe as getCanonicalStripe } from '../services/billing/stripeClient';
function getStripe(): Stripe {
  return getCanonicalStripe();
}

// List all saved payment methods for this workspace's Stripe customer
router.get("/payment-methods", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: "Workspace required" });

    const [ws] = await db.select({ stripeCustomerId: workspaces.stripeCustomerId })
      .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);

    if (!ws?.stripeCustomerId) {
      return res.json({ paymentMethods: [], defaultPaymentMethodId: null });
    }

    const stripe = getStripe();
    const [cards, achDebits, customer] = await Promise.all([
      stripe.paymentMethods.list({ customer: ws.stripeCustomerId, type: "card", limit: 20 }),
      stripe.paymentMethods.list({ customer: ws.stripeCustomerId, type: "us_bank_account", limit: 10 }),
      stripe.customers.retrieve(ws.stripeCustomerId),
    ]);

    const defaultId = typeof customer !== 'string' && !customer.deleted
      ? ((customer.invoice_settings?.default_payment_method as string) || null)
      : null;

    const methods = [...cards.data, ...achDebits.data].map(pm => ({
      id: pm.id,
      type: pm.type,
      brand: pm.card?.brand || pm.us_bank_account?.bank_name || null,
      last4: pm.card?.last4 || pm.us_bank_account?.last4 || null,
      expMonth: pm.card?.exp_month || null,
      expYear: pm.card?.exp_year || null,
      bankName: pm.us_bank_account?.bank_name || null,
      isDefault: pm.id === defaultId,
    }));

    res.json({ paymentMethods: methods, defaultPaymentMethodId: defaultId });
  } catch (error: unknown) {
    // Stripe customer-not-found (invalid dev/test customer ID) → return empty
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (error?.code === "resource_missing" || (error as any)?.statusCode === 404) {
      return res.json({ paymentMethods: [], defaultPaymentMethodId: null });
    }
    log.error("[PaymentMethods] Error listing:", sanitizeError(error));
    res.status(500).json({ message: "Failed to list payment methods" });
  }
});

// Create a Stripe SetupIntent so the frontend can securely collect card details
router.post("/payment-methods/setup-intent", requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: "Workspace required" });

    const [ws] = await db.select({
      stripeCustomerId: workspaces.stripeCustomerId,
      name: workspaces.name,
    }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);

    const stripe = getStripe();

    let customerId = ws?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: ws?.name || `${PLATFORM.name} Workspace`,
        metadata: { workspaceId },
      });
      customerId = customer.id;
      await db.update(workspaces).set({ stripeCustomerId: customerId }).where(eq(workspaces.id, workspaceId));
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card", "us_bank_account"],
      usage: "off_session",
      metadata: { workspaceId, purpose: "platform_billing" },
    });

    res.json({ clientSecret: setupIntent.client_secret, customerId });
  } catch (error: unknown) {
    log.error("[PaymentMethods] Error creating setup intent:", sanitizeError(error));
    res.status(500).json({ message: "Failed to create payment setup" });
  }
});

// Set a payment method as the default for all off-session platform charges
router.post("/payment-methods/set-default/:paymentMethodId", requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const { paymentMethodId } = req.params;
    if (!workspaceId) return res.status(400).json({ message: "Workspace required" });

    const [ws] = await db.select({ stripeCustomerId: workspaces.stripeCustomerId })
      .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);

    if (!ws?.stripeCustomerId) return res.status(400).json({ message: "No Stripe customer on file" });

    const stripe = getStripe();
    await stripe.customers.update(ws.stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    res.json({ success: true, defaultPaymentMethodId: paymentMethodId });
  } catch (error: unknown) {
    log.error("[PaymentMethods] Error setting default:", sanitizeError(error));
    res.status(500).json({ message: "Failed to set default payment method" });
  }
});

// Detach (remove) a saved payment method
router.delete("/payment-methods/:paymentMethodId", requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const { paymentMethodId } = req.params;
    if (!workspaceId) return res.status(400).json({ message: "Workspace required" });

    const [ws] = await db.select({ stripeCustomerId: workspaces.stripeCustomerId })
      .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);

    if (!ws?.stripeCustomerId) return res.status(400).json({ message: "No Stripe customer on file" });

    const stripe = getStripe();
    // Verify the payment method belongs to this customer before detaching
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer !== ws.stripeCustomerId) {
      return res.status(403).json({ message: "Payment method does not belong to this workspace" });
    }

    await stripe.paymentMethods.detach(paymentMethodId);
    res.json({ success: true, detached: paymentMethodId });
  } catch (error: unknown) {
    log.error("[PaymentMethods] Error detaching:", sanitizeError(error));
    res.status(500).json({ message: "Failed to remove payment method" });
  }
});

// ─── GET /api/billing-settings/seat-hard-cap — get current hard cap setting ──
router.get('/seat-hard-cap', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID required' });

    const { db: dbInner } = await import('../db');
    const { sql: drizzleSql } = await import('drizzle-orm');
    const [row] = await dbInner.execute(drizzleSql`
      SELECT seat_hard_cap_enabled, max_employees, current_employees
      FROM subscriptions WHERE workspace_id = ${workspaceId} LIMIT 1
    `) as unknown as any[];

    res.json({
      seatHardCapEnabled: row?.seat_hard_cap_enabled === true,
      maxEmployees: row?.max_employees ?? 5,
      currentEmployees: row?.current_employees ?? 0,
    });
  } catch (err: unknown) {
    res.status(500).json({ message: 'Failed to fetch seat cap setting' });
  }
});

// ─── PATCH /api/billing-settings/seat-hard-cap — toggle hard cap ─────────────
router.patch('/seat-hard-cap', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID required' });

    const { workspaceRole } = req.user || {};
    const isOwner = ['org_owner', 'co_owner'].includes(workspaceRole || '');
    const { isPlatformStaff } = await import('../rbac').then(m => ({ isPlatformStaff: m.hasPlatformWideAccess(req.platformRole) }));
    if (!isOwner && !isPlatformStaff) {
      return res.status(403).json({ message: 'Only organization owners can change the hard cap setting' });
    }

    const { z } = await import('zod');
    const body = z.object({ enabled: z.boolean() }).parse(req.body);

    const { db: dbInner } = await import('../db');
    const { sql: drizzleSql } = await import('drizzle-orm');
    await dbInner.execute(drizzleSql`
      UPDATE subscriptions SET seat_hard_cap_enabled = ${body.enabled}
      WHERE workspace_id = ${workspaceId}
    `);

    try {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const { universalAuditService } = await import('../services/universalAuditService');
      await universalAuditService.log({
        workspaceId,
        actorId: userId,
        actorType: 'user',
        action: 'workspace.seat_hard_cap_changed',
        entityType: 'workspace',
        entityId: workspaceId,
        changeType: 'update',
        changes: { seatHardCapEnabled: { old: !body.enabled, new: body.enabled } },
        metadata: { changedBy: userId },
        sourceRoute: 'PATCH /billing-settings/seat-hard-cap',
      });
    } catch { /* non-blocking */ }

    res.json({ success: true, seatHardCapEnabled: body.enabled });
  } catch (err: unknown) {
    res.status(500).json({ message: 'Failed to update seat cap setting' });
  }
});

export { router as billingSettingsRouter };
