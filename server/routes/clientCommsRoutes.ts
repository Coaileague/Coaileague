/**
 * Phase 35G — Client Communication Hub Routes
 * Endpoints: /api/client-comms/*
 *
 * 1. GET  /threads — list threads (filters: clientId, status, assignedTo) [manager+ staff only]
 * 2. POST /threads — create thread [manager+ staff only]
 * 3. GET  /threads/:id/messages — paginated messages [manager+ staff or owning client]
 * 4. POST /threads/:id/messages — send message [manager+ staff or owning client; senderType derived server-side]
 * 5. POST /threads/:id/resolve — resolve thread [manager+ staff only]
 * 6. GET  /inbox — unified inbox sorted by last_message_at desc [manager+ staff only]
 * 7. GET  /portal/threads — client portal: only own threads [any authenticated user, client resolved by email/userId]
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth } from '../auth';
import { requireManagerOrPlatformStaff, type AuthenticatedRequest } from '../rbac';
import { db } from '../db';
import { eq, and, desc } from 'drizzle-orm';
import {
  clientMessageThreads,
  clientMessages,
  clients,
} from '@shared/schema';
import { z } from 'zod';
import { NotificationDeliveryService } from '../services/notificationDeliveryService';
import { createLogger } from '../lib/logger';
const log = createLogger('ClientCommsRoutes');


const router = Router();

// ─── Client name enrichment ───────────────────────────────────────────────────

async function enrichWithClientName<T extends { clientId: string }>(
  threads: T[]
): Promise<(T & { clientName: string })[]> {
  if (threads.length === 0) return threads.map(t => ({ ...t, clientName: '' }));
  const clientIds = [...new Set(threads.map(t => t.clientId))];
  const clientRows: Array<{ id: string; companyName: string | null; firstName: string | null; lastName: string | null }> = [];
  for (const cid of clientIds) {
    const [c] = await db.select({ id: clients.id, companyName: clients.companyName, firstName: clients.firstName, lastName: clients.lastName })
      .from(clients)
      .where(eq(clients.id, cid))
      .limit(1)
      .catch(() => []);
    if (c) clientRows.push(c as { id: string; companyName: string | null; firstName: string | null; lastName: string | null });
  }
  const nameMap = new Map<string, string>();
  for (const c of clientRows) {
    const name = c.companyName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.id;
    nameMap.set(c.id, name);
  }
  return threads.map(t => ({ ...t, clientName: nameMap.get(t.clientId) || '' }));
}

// ─── SLA helpers ─────────────────────────────────────────────────────────────
//
// SLA model: "time awaiting staff reply" is measured from the moment a client
// sends an inbound message with no subsequent staff reply.
//
// - If lastClientReplyAt > lastStaffReplyAt (or no staff reply yet): the clock
//   is ticking. amber = 24 h, red = 48 h since lastClientReplyAt.
// - Otherwise (staff replied more recently than client): SLA is satisfied.
//
function computeSlaStatus(
  lastStaffReplyAt: Date | null,
  lastClientReplyAt: Date | null,
  status: string
): 'ok' | 'amber' | 'red' {
  if (status !== 'open') return 'ok';
  if (!lastClientReplyAt) return 'ok';
  if (lastStaffReplyAt && lastStaffReplyAt.getTime() >= lastClientReplyAt.getTime()) return 'ok';
  const hoursSince = (Date.now() - lastClientReplyAt.getTime()) / 3_600_000;
  if (hoursSince >= 48) return 'red';
  if (hoursSince >= 24) return 'amber';
  return 'ok';
}

async function recomputeThreadSla(threadId: string): Promise<void> {
  try {
    const [thread] = await db.select().from(clientMessageThreads)
      .where(eq(clientMessageThreads.id, threadId))
      .limit(1);
    if (!thread) return;
    const slaStatus = computeSlaStatus(
      thread.lastStaffReplyAt ? new Date(thread.lastStaffReplyAt) : null,
      thread.lastClientReplyAt ? new Date(thread.lastClientReplyAt) : null,
      thread.status
    );
    await db.update(clientMessageThreads)
      .set({ slaStatus, updatedAt: new Date() })
      .where(eq(clientMessageThreads.id, threadId));
  } catch { /* non-fatal */ }
}

// ─── Role & identity helpers ─────────────────────────────────────────────────

/**
 * Resolve the client record ID for an authenticated user by looking up the
 * `clients` table using `clients.userId` (exact user ID match) or
 * `clients.email` (email match) as fallback.
 *
 * This is the ONLY canonical way to determine a user's client identity.
 * req.user does NOT carry a `clientId` property — the `users` table has no
 * such column. Client identity must always be resolved via DB lookup.
 *
 * Returns null if the user has no matching client record in the workspace.
 */
async function resolveClientId(user: AuthenticatedRequest['user'], workspaceId: string): Promise<string | null> {
  if (!user) return null;
  const u = user as unknown as Record<string, unknown>;
  const userId = typeof u.id === 'string' ? u.id : null;
  const userEmail = typeof u.email === 'string' ? u.email : null;
  if (!userId && !userEmail) return null;
  if (userId) {
    const [byUserId] = await db.select({ id: clients.id }).from(clients)
      .where(and(eq(clients.workspaceId, workspaceId), eq(clients.userId, userId)))
      .limit(1);
    if (byUserId) return byUserId.id;
  }
  if (userEmail) {
    const [byEmail] = await db.select({ id: clients.id }).from(clients)
      .where(and(eq(clients.workspaceId, workspaceId), eq(clients.email, userEmail)))
      .limit(1);
    if (byEmail) return byEmail.id;
  }
  return null;
}

/**
 * Look up the client record's email and userId for NDS notifications.
 */
async function resolveClientContactInfo(clientRecordId: string, workspaceId: string): Promise<{ email: string | null; userId: string | null }> {
  const [row] = await db.select({ email: clients.email, pocEmail: clients.pocEmail, userId: clients.userId })
    .from(clients)
    .where(and(eq(clients.id, clientRecordId), eq(clients.workspaceId, workspaceId)))
    .limit(1);
  return {
    email: row?.email || row?.pocEmail || null,
    userId: row?.userId || null,
  };
}

function getSenderName(user: AuthenticatedRequest['user'], fallback: string): string {
  if (!user) return fallback;
  const u = user as unknown as Record<string, unknown>;
  const first = typeof u.firstName === 'string' ? u.firstName : '';
  const last = typeof u.lastName === 'string' ? u.lastName : '';
  return `${first} ${last}`.trim() || fallback;
}

/**
 * Send an NDS notification to a client (fire-and-forget).
 * Looks up the client record to find email and userId.
 */
function notifyClient(workspaceId: string, clientRecordId: string, subject: string, text: string): void {
  (async () => {
    try {
      const { email, userId } = await resolveClientContactInfo(clientRecordId, workspaceId);
      if (!email) return;
      await NotificationDeliveryService.send({
        idempotencyKey: `notif-${Date.now()}`,
            type: 'client_portal_invite',
        workspaceId,
        recipientUserId: userId || email,
        channel: 'email',
        body: { to: email, subject, text },
      });
    } catch (err) {
      log.error('[ClientComms] NDS send failed:', err);
    }
  })();
}

// ─── 1. GET /threads — list threads ──────────────────────────────────────────
// Staff-only: requireManagerOrPlatformStaff

router.get('/threads', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID required' });

    const { clientId, status, assignedTo } = req.query as Record<string, string>;

    const conditions: ReturnType<typeof eq>[] = [eq(clientMessageThreads.workspaceId, workspaceId)];
    if (clientId) conditions.push(eq(clientMessageThreads.clientId, clientId));
    if (status) conditions.push(eq(clientMessageThreads.status, status));
    if (assignedTo) conditions.push(eq(clientMessageThreads.assignedToUserId, assignedTo));

    const threads = await db.select().from(clientMessageThreads)
      .where(and(...conditions))
      .orderBy(desc(clientMessageThreads.lastMessageAt))
      .limit(100);

    const withSla = threads.map(t => ({
      ...t,
      slaStatus: computeSlaStatus(
        t.lastStaffReplyAt ? new Date(t.lastStaffReplyAt) : null,
        t.lastClientReplyAt ? new Date(t.lastClientReplyAt) : null,
        t.status
      ),
    }));

    const enriched = await enrichWithClientName(withSla);
    res.json(enriched);
  } catch (err: unknown) {
    log.error('[ClientComms] GET /threads error:', err);
    res.status(500).json({ message: sanitizeError(err) || 'Failed to fetch threads' });
  }
});

// ─── 2. POST /threads — create thread ────────────────────────────────────────
// Staff-only: requireManagerOrPlatformStaff

router.post('/threads', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID required' });

    const bodySchema = z.object({
      clientId: z.string().min(1),
      subject: z.string().min(1).max(500),
      channel: z.enum(['platform', 'email', 'phone_note']).default('platform'),
      assignedToUserId: z.string().optional(),
      initialMessage: z.string().optional(),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    }
    const { clientId, subject, channel, assignedToUserId, initialMessage } = parsed.data;

    const [clientRecord] = await db.select({ id: clients.id }).from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)))
      .limit(1);
    if (!clientRecord) {
      return res.status(400).json({ message: 'Client not found in this workspace' });
    }

    const slaDeadline = new Date(Date.now() + 48 * 3_600_000);

    const [thread] = await db.transaction(async (tx) => {
      const [t] = await tx.insert(clientMessageThreads).values({
        workspaceId,
        clientId,
        subject,
        status: 'open',
        channel,
        assignedToUserId: assignedToUserId || null,
        slaDeadline,
        slaStatus: 'ok',
        lastMessageAt: new Date(),
        createdBy: userId || 'system',
      }).returning();

      if (initialMessage) {
        const preview = initialMessage.slice(0, 120);
        await tx.insert(clientMessages).values({
          workspaceId,
          threadId: t.id,
          senderType: 'staff',
          senderId: userId || null,
          senderName: getSenderName(req.user, 'Staff'),
          direction: 'outbound',
          channel,
          body: initialMessage,
          attachments: [],
        });
        const [updatedThread] = await tx.update(clientMessageThreads)
          .set({ lastMessageAt: new Date(), lastMessagePreview: preview, lastStaffReplyAt: new Date() })
          .where(eq(clientMessageThreads.id, t.id))
          .returning();

        return [updatedThread];
      }

      return [t];
    });

    if (initialMessage) {
      notifyClient(workspaceId, clientId, `New message: ${subject}`, initialMessage.slice(0, 300));
    }

    res.status(201).json(thread);
  } catch (err: unknown) {
    log.error('[ClientComms] POST /threads error:', err);
    res.status(500).json({ message: sanitizeError(err) || 'Failed to create thread' });
  }
});

// ─── 3. GET /threads/:id/messages — paginated ────────────────────────────────
// Access: manager+ staff (via requireManagerOrPlatformStaff check below)
//         OR owning client (resolved via DB lookup, not req.user.clientId).
//
// Two-gate approach: if the user passes requireManagerOrPlatformStaff, they
// have full workspace access. Otherwise, we check if they are the owning
// client via resolveClientId.

router.get('/threads/:id/messages', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID required' });
    const { id } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = 50;
    const offset = (page - 1) * limit;

    const [thread] = await db.select().from(clientMessageThreads)
      .where(and(eq(clientMessageThreads.id, id), eq(clientMessageThreads.workspaceId, workspaceId)))
      .limit(1);

    if (!thread) return res.status(404).json({ message: 'Thread not found' });

    // Authorization: check if user is manager+ staff or the owning client.
    const isManager = req.workspaceRole && ['org_owner', 'co_owner', 'org_admin', 'org_manager', 'manager', 'department_manager', 'supervisor'].includes(req.workspaceRole);
    const isPlatformStaff = !!(req as unknown as Record<string, unknown>).platformRole;
    if (!isManager && !isPlatformStaff) {
      const resolvedId = await resolveClientId(req.user, workspaceId);
      if (!resolvedId || resolvedId !== thread.clientId) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const messages = await db.select().from(clientMessages)
      .where(and(eq(clientMessages.threadId, id), eq(clientMessages.workspaceId, workspaceId)))
      .orderBy(clientMessages.createdAt)
      .limit(limit)
      .offset(offset);

    res.json({
      thread: {
        ...thread,
        slaStatus: computeSlaStatus(
          thread.lastStaffReplyAt ? new Date(thread.lastStaffReplyAt) : null,
          thread.lastClientReplyAt ? new Date(thread.lastClientReplyAt) : null,
          thread.status
        ),
      },
      messages,
      page,
      limit,
    });
  } catch (err: unknown) {
    log.error('[ClientComms] GET /threads/:id/messages error:', err);
    res.status(500).json({ message: sanitizeError(err) || 'Failed to fetch messages' });
  }
});

// ─── 4. POST /threads/:id/messages — send message ────────────────────────────
// senderType is ALWAYS derived server-side:
// - Manager+ staff: senderType = 'staff'
// - Owning client: senderType = 'client'
// Any other role is rejected with 403.

router.post('/threads/:id/messages', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID required' });
    const { id } = req.params;

    const [thread] = await db.select().from(clientMessageThreads)
      .where(and(eq(clientMessageThreads.id, id), eq(clientMessageThreads.workspaceId, workspaceId)))
      .limit(1);

    if (!thread) return res.status(404).json({ message: 'Thread not found' });
    if (thread.status === 'resolved') {
      return res.status(400).json({ message: 'Thread is resolved. Reopen before sending.' });
    }

    // Determine role: manager+ staff, or owning client, or reject
    const isManager = req.workspaceRole && ['org_owner', 'co_owner', 'org_admin', 'org_manager', 'manager', 'department_manager', 'supervisor'].includes(req.workspaceRole);
    const isPlatformStaff = !!(req as unknown as Record<string, unknown>).platformRole;
    let senderType: 'staff' | 'client';

    if (isManager || isPlatformStaff) {
      senderType = 'staff';
    } else {
      const resolvedId = await resolveClientId(req.user, workspaceId);
      if (!resolvedId || resolvedId !== thread.clientId) {
        return res.status(403).json({ message: 'Access denied' });
      }
      senderType = 'client';
    }

    const bodySchema = z.object({
      body: z.string().min(1),
      attachments: z.array(z.string()).optional(),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    }
    const { body, attachments } = parsed.data;

    const direction = senderType === 'client' ? 'inbound' : 'outbound';

    const preview = body.slice(0, 120);
    const threadUpdate: {
      lastMessageAt: Date;
      lastMessagePreview: string;
      updatedAt: Date;
      lastClientReplyAt?: Date;
      lastStaffReplyAt?: Date;
    } = {
      lastMessageAt: new Date(),
      lastMessagePreview: preview,
      updatedAt: new Date(),
    };
    if (senderType === 'client') {
      threadUpdate.lastClientReplyAt = new Date();
    } else {
      threadUpdate.lastStaffReplyAt = new Date();
    }

    const [msg] = await db.transaction(async (tx) => {
      // Update thread first (includes status guard) to prevent messages on resolved threads.
      const [openThread] = await tx.update(clientMessageThreads)
        .set(threadUpdate)
        .where(and(
          eq(clientMessageThreads.id, id),
          eq(clientMessageThreads.workspaceId, workspaceId),
          eq(clientMessageThreads.status, 'open'),
        ))
        .returning({ id: clientMessageThreads.id });

      if (!openThread) {
        throw new Error('Thread is resolved. Reopen before sending.');
      }

      const [m] = await tx.insert(clientMessages).values({
        workspaceId,
        threadId: id,
        senderType,
        senderId: userId || null,
        senderName: getSenderName(req.user, senderType),
        direction,
        channel: thread.channel,
        body,
        attachments: (attachments || []) as unknown[],
        isTrinityDraft: false,
      }).returning();

      return [m];
    });

    await recomputeThreadSla(id);

    if (senderType === 'staff') {
      notifyClient(workspaceId, thread.clientId, `Re: ${thread.subject}`, body.slice(0, 300));
    }

    res.status(201).json(msg);
  } catch (err: unknown) {
    log.error('[ClientComms] POST /threads/:id/messages error:', err);
    res.status(500).json({ message: sanitizeError(err) || 'Failed to send message' });
  }
});

// ─── 5. POST /threads/:id/resolve — resolve thread ───────────────────────────
// Staff-only: requireManagerOrPlatformStaff

router.post('/threads/:id/resolve', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID required' });
    const { id } = req.params;

    const [thread] = await db.update(clientMessageThreads)
      .set({ status: 'resolved', resolvedAt: new Date(), resolvedBy: userId || 'staff', slaStatus: 'ok', updatedAt: new Date() })
      .where(and(eq(clientMessageThreads.id, id), eq(clientMessageThreads.workspaceId, workspaceId)))
      .returning();

    if (!thread) return res.status(404).json({ message: 'Thread not found' });

    res.json(thread);
  } catch (err: unknown) {
    log.error('[ClientComms] POST /threads/:id/resolve error:', err);
    res.status(500).json({ message: sanitizeError(err) || 'Failed to resolve thread' });
  }
});

// ─── 6. GET /inbox — unified inbox ───────────────────────────────────────────
// Staff-only: requireManagerOrPlatformStaff

router.get('/inbox', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID required' });

    const threads = await db.select().from(clientMessageThreads)
      .where(and(eq(clientMessageThreads.workspaceId, workspaceId), eq(clientMessageThreads.status, 'open')))
      .orderBy(desc(clientMessageThreads.lastMessageAt))
      .limit(200);

    const withSla = threads.map(t => ({
      ...t,
      slaStatus: computeSlaStatus(
        t.lastStaffReplyAt ? new Date(t.lastStaffReplyAt) : null,
        t.lastClientReplyAt ? new Date(t.lastClientReplyAt) : null,
        t.status
      ),
    }));

    const enriched = await enrichWithClientName(withSla);
    res.json(enriched);
  } catch (err: unknown) {
    log.error('[ClientComms] GET /inbox error:', err);
    res.status(500).json({ message: sanitizeError(err) || 'Failed to fetch inbox' });
  }
});

// ─── 7. GET /portal/threads — client portal own threads only ─────────────────
// Client identity is ALWAYS resolved server-side via DB lookup (clients.userId
// or clients.email match against the authenticated user). The clientId is NEVER
// taken from query params.
//
// Any authenticated user can call this endpoint; if they have no matching client
// record, they get an empty array (not a 403) — this avoids leaking role info.

router.get('/portal/threads', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID required' });

    const clientId = await resolveClientId(req.user, workspaceId);
    if (!clientId) {
      return res.json([]);
    }

    const threads = await db.select().from(clientMessageThreads)
      .where(and(
        eq(clientMessageThreads.workspaceId, workspaceId),
        eq(clientMessageThreads.clientId, clientId)
      ))
      .orderBy(desc(clientMessageThreads.lastMessageAt));

    res.json(threads);
  } catch (err: unknown) {
    log.error('[ClientComms] GET /portal/threads error:', err);
    res.status(500).json({ message: sanitizeError(err) || 'Failed to fetch threads' });
  }
});

export default router;
