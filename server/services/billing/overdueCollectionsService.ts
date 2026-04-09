/**
 * Overdue Invoice Collections Escalation Service
 *
 * 3-tier escalation sequence for overdue invoices:
 *   Tier 1 (1-6 days past due):   Reminder email to client with payment link
 *   Tier 2 (7-29 days past due):  Escalation email to client + org_owner alert on all 3 channels
 *   Tier 3 (30+ days past due):   Trinity flag to org_owner with demand letter draft
 *
 * Each escalation step is logged in the universal audit trail.
 * Debouncing: one escalation per tier per invoice per 24h window (checked via audit log).
 */

import { createLogger } from '../../lib/logger';
import { db } from '../../db';
import { invoices, clients, workspaceMembers, users, workspaces, universalAuditTrail, clientPortalAccess } from '@shared/schema';
import { eq, and, lt, gte, inArray, isNull } from 'drizzle-orm';
import crypto from 'crypto';
import { sendInvoiceOverdueReminderEmail } from '../emailCore';
import { createNotification } from '../notificationService';
import { universalAudit, AUDIT_ACTIONS } from '../universalAuditService';
import { platformEventBus } from '../platformEventBus';

const log = createLogger('overdueCollectionsService');
interface OverdueInvoice {
  id: string;
  workspaceId: string;
  clientId: string;
  invoiceNumber: string;
  total: string;
  dueDate: Date;
  sentAt: Date | null;
  daysOverdue: number;
}

interface CollectionsResult {
  workspacesScanned: number;
  tier1Sent: number;
  tier2Sent: number;
  tier3Sent: number;
  errors: string[];
}

function daysOverdue(dueDate: Date): number {
  const now = new Date();
  const diff = now.getTime() - dueDate.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

async function alreadyEscalated(invoiceId: string, tier: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h debounce
  const action = `invoice.collections_tier${tier}`;
  const rows = await db
    .select({ id: universalAuditTrail.id })
    .from(universalAuditTrail)
    .where(and(
      eq(universalAuditTrail.entityId, invoiceId),
      eq(universalAuditTrail.action as any, action),
      gte(universalAuditTrail.createdAt, cutoff)
    ))
    .limit(1);
  return rows.length > 0;
}

async function logEscalation(
  workspaceId: string,
  invoiceId: string,
  invoiceNumber: string,
  tier: number,
  recipient: string
) {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    await universalAudit({
      workspaceId,
      action: `invoice.collections_tier${tier}` as any,
      entityType: 'invoice',
      entityId: invoiceId,
      metadata: {
        invoiceNumber,
        tier,
        recipient,
        reason: `Collections escalation tier ${tier} — automated overdue sequence`,
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    // Non-blocking
  }
}

async function getOrgOwners(workspaceId: string): Promise<Array<{ userId: string; email: string }>> {
  const rows = await db
    .select({ userId: workspaceMembers.userId, email: users.email })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.role, 'org_owner')
    ));
  return rows.map(r => ({ userId: r.userId, email: r.email || '' })).filter(r => r.email);
}

/**
 * Resolve the client-facing payment URL for an invoice.
 * Looks up the existing portal access token (or creates one) and builds the URL.
 */
async function resolvePortalUrl(inv: OverdueInvoice, clientEmail: string): Promise<string> {
  try {
    let [portal] = await db.select().from(clientPortalAccess).where(and(
      eq(clientPortalAccess.workspaceId, inv.workspaceId),
      eq(clientPortalAccess.clientId, inv.clientId),
      eq(clientPortalAccess.isActive, true),
    )).limit(1);

    if (!portal) {
      const accessToken = crypto.randomBytes(32).toString('hex');
      [portal] = await db.insert(clientPortalAccess).values({
        workspaceId: inv.workspaceId,
        clientId: inv.clientId,
        accessToken,
        email: clientEmail,
        isActive: true,
      }).returning();
    }

    const domain = (process.env.APP_BASE_URL || '');
    const base = domain ? `https://${domain}` : '';
    return `${base}/portal/client/${portal.accessToken}`;
  } catch (err: any) {
    log.error('[OverdueCollections] resolvePortalUrl failed — falling back to ID-based URL:', (err instanceof Error ? err.message : String(err)));
    const fallbackDomain = (process.env.APP_BASE_URL || '');
    const fallbackBase = fallbackDomain ? `https://${fallbackDomain}` : '';
    return fallbackBase ? `${fallbackBase}/pay/${inv.id}` : `/pay/${inv.id}`;
  }
}

async function runTier1(inv: OverdueInvoice, clientEmail: string, clientName: string, workspaceName: string): Promise<void> {
  const paymentUrl = await resolvePortalUrl(inv, clientEmail);
  await sendInvoiceOverdueReminderEmail(clientEmail, {
    clientName,
    invoiceNumber: inv.invoiceNumber,
    totalAmount: Number(inv.total).toFixed(2),
    originalDueDate: inv.dueDate.toLocaleDateString(),
    daysOverdue: inv.daysOverdue,
    portalUrl: paymentUrl,
  }, inv.workspaceId);
  await logEscalation(inv.workspaceId, inv.id, inv.invoiceNumber, 1, clientEmail);
}

async function runTier2(inv: OverdueInvoice, clientEmail: string, clientName: string, owners: Array<{ userId: string; email: string }>, workspaceName: string): Promise<void> {
  const paymentUrl = await resolvePortalUrl(inv, clientEmail);
  await sendInvoiceOverdueReminderEmail(clientEmail, {
    clientName,
    invoiceNumber: inv.invoiceNumber,
    totalAmount: Number(inv.total).toFixed(2),
    originalDueDate: inv.dueDate.toLocaleDateString(),
    daysOverdue: inv.daysOverdue,
    portalUrl: paymentUrl,
  }, inv.workspaceId);

  for (const owner of owners) {
    if (!owner.userId) continue;
    await createNotification({
      workspaceId: inv.workspaceId,
      userId: owner.userId,
      type: 'system' as any,
      title: `Invoice ${inv.invoiceNumber} — 7-Day Overdue Alert`,
      message: `${clientName} has not paid invoice ${inv.invoiceNumber} ($${Number(inv.total).toFixed(2)}). Now ${inv.daysOverdue} days overdue. Escalation email sent to client.`,
      actionUrl: `/invoices/${inv.id}`,
      relatedEntityType: 'invoice',
      relatedEntityId: inv.id,
      metadata: { tier: 2, daysOverdue: inv.daysOverdue, clientName, invoiceNumber: inv.invoiceNumber },
      createdBy: 'trinity-collections',
    });
  }

  platformEventBus.publish({
    type: 'invoice_overdue_escalated',
    workspaceId: inv.workspaceId,
    data: {
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      clientName,
      total: inv.total,
      daysOverdue: inv.daysOverdue,
      tier: 2,
    },
  }).catch((err: Error) => log.error('[OverdueCollections] Event bus publish failed (tier 2 escalation):', err.message));

  await logEscalation(inv.workspaceId, inv.id, inv.invoiceNumber, 2, clientEmail);
}

async function runTier3(inv: OverdueInvoice, clientName: string, clientEmail: string, owners: Array<{ userId: string; email: string }>, workspaceName: string): Promise<void> {
  const paymentUrl = await resolvePortalUrl(inv, clientEmail);
  const demandLetter = `DEMAND FOR PAYMENT

Date: ${new Date().toLocaleDateString()}
Invoice: ${inv.invoiceNumber}
Amount Due: $${Number(inv.total).toFixed(2)}
Days Overdue: ${inv.daysOverdue}

Dear ${clientName},

This letter serves as formal notice that invoice ${inv.invoiceNumber} in the amount of $${Number(inv.total).toFixed(2)} is now ${inv.daysOverdue} days past due.

We request immediate payment. Failure to remit payment within 10 business days may result in referral to a collections agency and suspension of services.

Payment link: ${paymentUrl}

${workspaceName}`;

  for (const owner of owners) {
    if (!owner.userId) continue;
    await createNotification({
      workspaceId: inv.workspaceId,
      userId: owner.userId,
      type: 'system' as any,
      title: `URGENT: Invoice ${inv.invoiceNumber} — 30-Day Collections Flag`,
      message: `${clientName} is ${inv.daysOverdue} days overdue on invoice ${inv.invoiceNumber} ($${Number(inv.total).toFixed(2)}). Trinity recommends: (1) Call the AP contact today, (2) Review draft demand letter, (3) Consider collections agency referral if unpaid within 10 days.`,
      actionUrl: `/invoices/${inv.id}`,
      relatedEntityType: 'invoice',
      relatedEntityId: inv.id,
      metadata: {
        tier: 3,
        daysOverdue: inv.daysOverdue,
        clientName,
        invoiceNumber: inv.invoiceNumber,
        demandLetter,
        recommendedActions: [
          'Call AP contact immediately',
          'Review draft demand letter below',
          'Consider collections agency referral if no response in 10 days',
          'Suspend non-critical services if applicable',
        ],
      },
      createdBy: 'trinity-collections',
    });
  }

  platformEventBus.publish({
    type: 'invoice_overdue_escalated',
    workspaceId: inv.workspaceId,
    data: {
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      clientName,
      total: inv.total,
      daysOverdue: inv.daysOverdue,
      tier: 3,
      demandLetterDraft: demandLetter,
    },
  }).catch((err: Error) => log.error('[OverdueCollections] Event bus publish failed (tier 3 escalation):', err.message));

  await logEscalation(inv.workspaceId, inv.id, inv.invoiceNumber, 3, owners.map(o => o.email).join(', '));
}

export async function runOverdueCollectionsSweep(): Promise<CollectionsResult> {
  const result: CollectionsResult = {
    workspacesScanned: 0,
    tier1Sent: 0,
    tier2Sent: 0,
    tier3Sent: 0,
    errors: [],
  };

  const now = new Date();

  const overdueInvoices = await db
    .select({
      id: invoices.id,
      workspaceId: invoices.workspaceId,
      clientId: invoices.clientId,
      invoiceNumber: invoices.invoiceNumber,
      total: invoices.total,
      dueDate: invoices.dueDate,
      sentAt: invoices.sentAt,
    })
    .from(invoices)
    .where(and(
      eq(invoices.status as any, 'sent'),
      lt(invoices.dueDate, now)
    ));

  if (overdueInvoices.length === 0) {
    log.info('[OverdueCollections] No overdue invoices found');
    return result;
  }

  const workspaceIds = [...new Set(overdueInvoices.map(i => i.workspaceId))];
  result.workspacesScanned = workspaceIds.length;

  const workspaceRows = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(inArray(workspaces.id, workspaceIds));
  const wsNameMap = Object.fromEntries(workspaceRows.map(w => [w.id, w.name]));

  const clientIds = [...new Set(overdueInvoices.map(i => i.clientId))];
  const clientRows = await db
    .select({ id: clients.id, email: clients.email, companyName: clients.companyName, firstName: clients.firstName, lastName: clients.lastName })
    .from(clients)
    .where(inArray(clients.id, clientIds));
  const clientMap = Object.fromEntries(clientRows.map(c => [c.id, c]));

  const ownersByWorkspace: Record<string, Array<{ userId: string; email: string }>> = {};

  for (const inv of overdueInvoices) {
    if (!inv.dueDate) continue;

    const days = daysOverdue(new Date(inv.dueDate));
    const invWithDays: OverdueInvoice = {
      ...inv,
      dueDate: new Date(inv.dueDate),
      total: String(inv.total),
      daysOverdue: days,
    };

    const client = clientMap[inv.clientId];
    const clientEmail = client?.email || '';
    const clientName = client?.companyName || `${client?.firstName || ''} ${client?.lastName || ''}`.trim() || 'Client';
    const wsName = wsNameMap[inv.workspaceId] || 'Your Organization';

    if (!ownersByWorkspace[inv.workspaceId]) {
      ownersByWorkspace[inv.workspaceId] = await getOrgOwners(inv.workspaceId);
    }
    const owners = ownersByWorkspace[inv.workspaceId];

    try {
      await db
        .update(invoices)
        .set({ status: 'overdue' as any })
        .where(and(eq(invoices.id, inv.id), eq(invoices.status as any, 'sent')));

      if (days >= 30) {
        if (await alreadyEscalated(inv.id, 3)) continue;
        await runTier3(invWithDays, clientName, clientEmail, owners, wsName);
        result.tier3Sent++;
      } else if (days >= 7) {
        if (await alreadyEscalated(inv.id, 2)) continue;
        if (clientEmail) await runTier2(invWithDays, clientEmail, clientName, owners, wsName);
        result.tier2Sent++;
      } else if (days >= 1) {
        if (await alreadyEscalated(inv.id, 1)) continue;
        if (clientEmail) await runTier1(invWithDays, clientEmail, clientName, wsName);
        result.tier1Sent++;
      }
    } catch (err: any) {
      result.errors.push(`Invoice ${inv.invoiceNumber}: ${(err instanceof Error ? err.message : String(err))}`);
    }
  }

  log.info(`[OverdueCollections] Sweep complete — tier1:${result.tier1Sent}, tier2:${result.tier2Sent}, tier3:${result.tier3Sent}, errors:${result.errors.length}`);
  return result;
}
