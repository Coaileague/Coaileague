import { db } from '../db';
import { clients, clientCollectionsLog } from '../../shared/schema';
import { eq, and, inArray, lt, isNotNull, sql } from 'drizzle-orm';
import { sendBilledEmail } from './emailAutomation';
import { getAppBaseUrl } from '../utils/getAppBaseUrl';
import { createLogger } from '../lib/logger';
const log = createLogger('clientCollectionsService');


const MAX_AUTO_ATTEMPTS = 3;
const MIN_HOURS_BETWEEN_EMAILS = 23;

// ─────────────────────────────────────────────────────────────────────────────
// Start collections pipeline for a newly-deactivated client
// ─────────────────────────────────────────────────────────────────────────────
export async function startCollections(
  workspaceId: string,
  clientId: string,
  initiatedBy: string,
  outstandingAmount?: number
): Promise<{ success: boolean; error?: string }> {
  const client = await db.query.clients.findFirst({
    where: and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)),
  });
  if (!client) return { success: false, error: 'Client not found' };
  if (client.collectionsStatus === 'active') {
    return { success: false, error: 'Collections already active for this client' };
  }

  await db.update(clients)
    .set({
      collectionsStatus: 'active',
      collectionsStartedAt: new Date(),
      collectionAttemptCount: 0,
      lastCollectionEmailAt: null,
    })
    .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)));

  await sendCollectionsEmail(workspaceId, clientId, 1, initiatedBy, outstandingAmount);
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Decline to start collections (record decision, set status to none)
// ─────────────────────────────────────────────────────────────────────────────
export async function declineCollections(
  workspaceId: string,
  clientId: string,
  declinedBy: string,
  reason?: string
): Promise<{ success: boolean }> {
  await db.transaction(async (tx) => {
    await tx.update(clients)
      .set({ collectionsStatus: 'none' })
      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)));

    await tx.insert(clientCollectionsLog).values({
      workspaceId,
      clientId,
      attemptNumber: 0,
      attemptType: 'declined',
      subject: 'Collections Declined',
      bodySummary: reason || 'Owner chose not to pursue collections at this time.',
      createdBy: declinedBy,
    });
  });

  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mark collections as resolved (payment received)
// ─────────────────────────────────────────────────────────────────────────────
export async function resolveCollections(
  workspaceId: string,
  clientId: string,
  resolvedBy: string,
  responseNotes?: string
): Promise<{ success: boolean }> {
  const client = await db.query.clients.findFirst({
    where: and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)),
  });
  if (!client) return { success: false };

  await db.transaction(async (tx) => {
    await tx.update(clients)
      .set({ collectionsStatus: 'resolved' })
      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)));

    await tx.insert(clientCollectionsLog).values({
      workspaceId,
      clientId,
      attemptNumber: client.collectionAttemptCount ?? 0,
      attemptType: 'resolved',
      subject: 'Collections Resolved',
      bodySummary: responseNotes || 'Payment received — collections resolved.',
      responseReceived: true,
      responseNotes,
      createdBy: resolvedBy,
    });
  });

  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Write off debt — final escalation after max attempts
// ─────────────────────────────────────────────────────────────────────────────
export async function writeOffCollections(
  workspaceId: string,
  clientId: string,
  writtenOffBy: string,
  notes?: string
): Promise<{ success: boolean }> {
  const client = await db.query.clients.findFirst({
    where: and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)),
  });
  if (!client) return { success: false };

  await db.transaction(async (tx) => {
    await tx.update(clients)
      .set({ collectionsStatus: 'written_off' })
      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)));

    await tx.insert(clientCollectionsLog).values({
      workspaceId,
      clientId,
      attemptNumber: client.collectionAttemptCount ?? 0,
      attemptType: 'written_off',
      subject: 'Debt Written Off',
      bodySummary: notes || 'No response after maximum collection attempts. Debt written off.',
      createdBy: writtenOffBy,
    });
  });

  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Send a single collections email + log it
// ─────────────────────────────────────────────────────────────────────────────
async function sendCollectionsEmail(
  workspaceId: string,
  clientId: string,
  attemptNumber: number,
  sentBy: string,
  outstandingAmount?: number
): Promise<void> {
  const client = await db.query.clients.findFirst({
    where: and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)),
  });
  if (!client) return;

  const recipientEmail = client.billingEmail || client.pocEmail;
  if (!recipientEmail) {
    await db.insert(clientCollectionsLog).values({
      workspaceId,
      clientId,
      attemptNumber,
      attemptType: 'automated_email',
      subject: 'No email address on file — email skipped',
      bodySummary: 'Client has no billing or POC email on file. Email not sent.',
      createdBy: 'trinity-system',
    });
    return;
  }

  const amountStr = outstandingAmount
    ? `$${Number(outstandingAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : 'an outstanding balance';

  const clientDisplayName = client.companyName || `${client.firstName} ${client.lastName}`.trim();
  const subject = attemptNumber === 1
    ? `Important: Outstanding Balance — ${clientDisplayName}`
    : `Follow-Up ${attemptNumber}: Outstanding Balance — ${clientDisplayName}`;

  const bodyText = `
Dear ${client.pocName || clientDisplayName},

This is a formal notice regarding ${amountStr} owed to us for security services previously rendered to ${clientDisplayName}.

As of the date of this communication, your account has been deactivated due to non-payment. We are reaching out to arrange resolution of this outstanding balance.

Please contact us within 5 business days to discuss payment arrangements.

Attempt ${attemptNumber} of ${MAX_AUTO_ATTEMPTS}.

Sincerely,
Collections Department
  `.trim();

  const emailResult = await sendBilledEmail({
    workspaceId,
    to: [recipientEmail],
    subject,
    html: `<p>${bodyText.replace(/\n/g, '<br/>')}</p>`,
    emailType: 'invoice',
    recipientCount: 1,
  });

  const now = new Date();
  const newCount = attemptNumber;

  await db.transaction(async (tx) => {
    await tx.update(clients)
      .set({
        lastCollectionEmailAt: now,
        collectionAttemptCount: newCount,
      })
      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)));

    await tx.insert(clientCollectionsLog).values({
      workspaceId,
      clientId,
      attemptNumber,
      attemptType: 'automated_email',
      sentAt: now,
      sentToEmail: recipientEmail,
      subject,
      bodySummary: bodyText.substring(0, 500),
      outstandingAmount: outstandingAmount ? String(outstandingAmount) : null,
      responseReceived: false,
      createdBy: sentBy,
    });
  });

  if (!emailResult.success) {
    log.error(`[Collections] Email failed for client ${clientId}:`, emailResult.error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily cron runner — processes all workspaces with active collections
// ─────────────────────────────────────────────────────────────────────────────
export async function runDailyCollectionsCron(): Promise<void> {
  log.info('[Collections] Starting daily collections outreach cron...');

  const cutoff = new Date(Date.now() - MIN_HOURS_BETWEEN_EMAILS * 60 * 60 * 1000);

  const activeCollections = await db.query.clients.findMany({
    where: (c, { eq: eqOp, and: andOp, or: orOp, isNull }) =>
      andOp(
        eqOp(c.collectionsStatus, 'active'),
        orOp(isNull(c.lastCollectionEmailAt), lt(c.lastCollectionEmailAt, cutoff))
      ),
  });

  log.info(`[Collections] Found ${activeCollections.length} clients due for outreach`);

  for (const client of activeCollections) {
    try {
      const currentAttempt = (client.collectionAttemptCount ?? 0) + 1;

      if (currentAttempt > MAX_AUTO_ATTEMPTS) {
        await db.transaction(async (tx) => {
          await tx.update(clients)
            .set({ collectionsStatus: 'written_off' })
            .where(and(eq(clients.id, client.id), eq(clients.workspaceId, client.workspaceId)));

          await tx.insert(clientCollectionsLog).values({
            workspaceId: client.workspaceId,
            clientId: client.id,
            attemptNumber: currentAttempt,
            attemptType: 'written_off',
            subject: 'Auto-Escalated: Debt Written Off',
            bodySummary: `No response after ${MAX_AUTO_ATTEMPTS} automated attempts. Status escalated to written_off.`,
            createdBy: 'trinity-system',
          });
        });

        log.info(`[Collections] Client ${client.id} escalated to written_off after ${MAX_AUTO_ATTEMPTS} attempts`);
        continue;
      }

      await sendCollectionsEmail(client.workspaceId, client.id, currentAttempt, 'trinity-system');
      log.info(`[Collections] Sent attempt ${currentAttempt} for client ${client.id}`);
    } catch (err) {
      log.error(`[Collections] Error processing client ${client.id}:`, err);
    }
  }

  log.info('[Collections] Daily collections cron complete');
}

// ─────────────────────────────────────────────────────────────────────────────
// Get collections log for a specific client
// ─────────────────────────────────────────────────────────────────────────────
export async function getCollectionsLog(
  workspaceId: string,
  clientId: string
): Promise<typeof clientCollectionsLog.$inferSelect[]> {
  return db.query.clientCollectionsLog.findMany({
    where: and(
      eq(clientCollectionsLog.workspaceId, workspaceId),
      eq(clientCollectionsLog.clientId, clientId)
    ),
    orderBy: (log, { desc }) => [desc(log.sentAt)],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Get all active collections across a workspace (for dashboard/Trinity)
// ─────────────────────────────────────────────────────────────────────────────
export async function getWorkspaceActiveCollections(workspaceId: string) {
  return db.query.clients.findMany({
    where: and(
      eq(clients.workspaceId, workspaceId),
      inArray(clients.collectionsStatus, ['active', 'pending_decision'])
    ),
  });
}
