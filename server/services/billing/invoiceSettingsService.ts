import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { clientBillingSettings, invoices } from '@shared/schema';
import { createLogger } from '../../lib/logger';

const log = createLogger('InvoiceSettingsService');

type MutableInvoiceSettings = Partial<{
  billingCycle: string;
  paymentTerms: string;
  taxRate: string;
  roundHoursTo: string;
  defaultBillRate: string;
  autoSendInvoice: boolean;
  invoiceRecipientEmails: string[];
  ccEmails: string[];
  isActive: boolean;
}>;

interface SetInvoiceSettingsInput extends MutableInvoiceSettings {
  workspaceId: string;
  clientId: string;
}

const IMMUTABLE_KEYS = new Set(['id', 'workspaceId', 'clientId', 'createdAt']);

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function sameStringArray(a?: string[] | null, b?: string[] | null): boolean {
  const left = Array.isArray(a) ? [...a].sort() : [];
  const right = Array.isArray(b) ? [...b].sort() : [];
  if (left.length !== right.length) return false;
  return left.every((val, idx) => val === right[idx]);
}

export async function getInvoiceSettings(workspaceId: string, clientId: string) {
  const [settings] = await db
    .select()
    .from(clientBillingSettings)
    .where(and(eq(clientBillingSettings.workspaceId, workspaceId), eq(clientBillingSettings.clientId, clientId)))
    .limit(1);

  return settings ?? null;
}

export async function setInvoiceSettings(input: SetInvoiceSettingsInput, actorId?: string | null) {
  if (!input.workspaceId || !input.clientId) {
    throw new Error('workspaceId and clientId are required');
  }

  for (const key of Object.keys(input)) {
    if ((key === 'workspaceId' || key === 'clientId') && IMMUTABLE_KEYS.has(key)) continue;
    if (IMMUTABLE_KEYS.has(key)) {
      throw new Error(`${key} is immutable and cannot be set directly`);
    }
  }

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(clientBillingSettings)
      .where(and(eq(clientBillingSettings.workspaceId, input.workspaceId), eq(clientBillingSettings.clientId, input.clientId)))
      .limit(1);

    const patch = stripUndefined({
      billingCycle: input.billingCycle,
      paymentTerms: input.paymentTerms,
      taxRate: input.taxRate,
      roundHoursTo: input.roundHoursTo,
      defaultBillRate: input.defaultBillRate,
      autoSendInvoice: input.autoSendInvoice,
      invoiceRecipientEmails: input.invoiceRecipientEmails,
      ccEmails: input.ccEmails,
      isActive: input.isActive,
      updatedAt: new Date(),
    });

    let persisted;
    if (existing) {
      const hasChanges =
        (patch.billingCycle !== undefined && patch.billingCycle !== existing.billingCycle) ||
        (patch.paymentTerms !== undefined && patch.paymentTerms !== existing.paymentTerms) ||
        (patch.taxRate !== undefined && patch.taxRate !== existing.taxRate) ||
        (patch.roundHoursTo !== undefined && patch.roundHoursTo !== existing.roundHoursTo) ||
        (patch.defaultBillRate !== undefined && patch.defaultBillRate !== existing.defaultBillRate) ||
        (patch.autoSendInvoice !== undefined && patch.autoSendInvoice !== existing.autoSendInvoice) ||
        (patch.isActive !== undefined && patch.isActive !== existing.isActive) ||
        (patch.invoiceRecipientEmails !== undefined && !sameStringArray(patch.invoiceRecipientEmails as string[] | undefined, existing.invoiceRecipientEmails as string[] | undefined)) ||
        (patch.ccEmails !== undefined && !sameStringArray(patch.ccEmails as string[] | undefined, existing.ccEmails as string[] | undefined));

      // Critical loop-breaker: do not write a no-op update.
      // Some downstream automations subscribe to row updates; rewriting unchanged
      // settings can trigger repeated notifications without real user changes.
      if (!hasChanges) {
        return existing;
      }

      [persisted] = await tx
        .update(clientBillingSettings)
        .set(patch)
        .where(eq(clientBillingSettings.id, existing.id))
        .returning();
    } else {
      [persisted] = await tx
        .insert(clientBillingSettings)
        .values({
          workspaceId: input.workspaceId,
          clientId: input.clientId,
          billingCycle: input.billingCycle ?? 'monthly',
          paymentTerms: input.paymentTerms ?? 'net_30',
          taxRate: input.taxRate ?? '0.0000',
          roundHoursTo: input.roundHoursTo ?? '0.25',
          defaultBillRate: input.defaultBillRate,
          autoSendInvoice: input.autoSendInvoice ?? true,
          invoiceRecipientEmails: input.invoiceRecipientEmails,
          ccEmails: input.ccEmails,
          isActive: input.isActive ?? true,
        })
        .returning();
    }

    try {
      const { universalAudit, AUDIT_ACTIONS } = await import('../universalAuditService');
      await universalAudit.log({
        workspaceId: input.workspaceId,
        actorId: actorId ?? null,
        actorType: actorId ? 'user' : 'system',
        action: AUDIT_ACTIONS.SETTINGS_UPDATED,
        entityType: 'invoice_settings',
        entityId: persisted.id,
        changeType: existing ? 'update' : 'create',
        changes: existing
          ? {
              billingCycle: { old: existing.billingCycle, new: persisted.billingCycle },
              paymentTerms: { old: existing.paymentTerms, new: persisted.paymentTerms },
              defaultBillRate: { old: existing.defaultBillRate, new: persisted.defaultBillRate },
              taxRate: { old: existing.taxRate, new: persisted.taxRate },
            }
          : null,
      });
    } catch (error) {
      log.warn('[InvoiceSettingsService] Audit logging failed (non-blocking):', error);
    }

    return persisted;
  });
}

export async function getSettingsForInvoiceGeneration(invoiceId: string) {
  const [invoice] = await db
    .select({ workspaceId: invoices.workspaceId, clientId: invoices.clientId })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);

  if (!invoice?.workspaceId || !invoice?.clientId) return null;

  return getInvoiceSettings(invoice.workspaceId, invoice.clientId);
}
