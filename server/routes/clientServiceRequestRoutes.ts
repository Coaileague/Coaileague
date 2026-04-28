import { z } from 'zod';
import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { db } from '../db';
import {
  clientServiceRequests,
  insertClientServiceRequestSchema,
  supportTickets,
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth } from '../auth';
import { hasManagerAccess, type AuthenticatedRequest } from '../rbac';
import { platformEventBus } from '../services/platformEventBus';
import { createLogger } from '../lib/logger';
import { computeSlaTargets } from '../services/support/slaService';
import { writeSupportAuditLog } from '../services/support/supportAuditService';
const log = createLogger('clientServiceRequestRoutes');

const router = Router();

// GET /api/service-requests — management view of all requests
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });

    const { clientId, status } = req.query;

    const requests = await db
      .select()
      .from(clientServiceRequests)
      .where(and(
        eq(clientServiceRequests.workspaceId, workspaceId),
        ...(clientId && typeof clientId === 'string' ? [eq(clientServiceRequests.clientId, clientId)] : []),
        ...(status && typeof status === 'string' ? [eq(clientServiceRequests.status, status)] : []),
      ))
      .orderBy(desc(clientServiceRequests.createdAt));

    res.json(requests);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// POST /api/service-requests — client submits a request
// Phase 9 Issue #2: auto-create a linked support ticket atomically.
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });

    const parsed = insertClientServiceRequestSchema.safeParse({
      ...req.body,
      workspaceId,
      status: 'submitted',
    });
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors });
    }

    // Map service-request urgency → ticket priority
    const priorityMap: Record<string, string> = {
      urgent: 'urgent',
      high: 'high',
      normal: 'normal',
      low: 'low',
    };
    const priority = priorityMap[parsed.data.urgency ?? 'normal'] ?? 'normal';

    // Atomic: create service request + support ticket in one transaction
    const { request, ticket } = await db.transaction(async (tx) => {
      const [newRequest] = await tx
        .insert(clientServiceRequests)
        .values(parsed.data)
        .returning();

      const now = new Date();
      const ticketNumber = `TKT-SR-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Date.now().toString().slice(-5)}`;
      const slaTargets = computeSlaTargets(priority, now);

      const [newTicket] = await tx
        .insert(supportTickets)
        .values({
          workspaceId,
          ticketNumber,
          type: 'support',
          priority,
          subject: `Service Request: ${parsed.data.requestType}`,
          description: parsed.data.description,
          status: 'open',
          clientId: parsed.data.clientId,
          submissionMethod: 'portal',
          relatedResourceId: newRequest.id,
          relatedResourceType: 'service_request',
          responseTimeTarget: slaTargets.responseTimeTarget,
          resolutionTimeTarget: slaTargets.resolutionTimeTarget,
          slaStatus: 'on_track',
          lockVersion: 0,
          escalationLevel: 0,
        } as any)
        .returning();

      // Back-link on the service request
      await tx
        .update(clientServiceRequests)
        .set({ supportTicketId: newTicket.id, updatedAt: new Date() })
        .where(eq(clientServiceRequests.id, newRequest.id));

      return { request: { ...newRequest, supportTicketId: newTicket.id }, ticket: newTicket };
    });

    // Audit trail (non-blocking)
    writeSupportAuditLog({
      workspaceId,
      ticketId: ticket.id,
      action: 'ticket_created',
      actorId: req.user?.id,
      metadata: { source: 'service_request', serviceRequestId: request.id },
    }).catch((e: unknown) => log.warn('[Audit] write failed:', (e as Error)?.message));

    platformEventBus.publish({
      type: 'service_request_submitted',
      category: 'operations',
      title: `Service Request — ${parsed.data.requestType}`,
      description: `Client submitted a ${parsed.data.requestType} request (ticket ${ticket.ticketNumber})`,
      workspaceId,
      metadata: {
        requestId: request.id,
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        clientId: parsed.data.clientId,
        requestType: parsed.data.requestType,
        urgency: parsed.data.urgency,
      },
      visibility: 'supervisor',
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    // Notify every workspace manager/owner in-app so the ticket doesn't sit
    // silently in the portal. Urgent/high requests also get push.
    try {
      const { NotificationDeliveryService } = await import('../services/notificationDeliveryService');
      const { pool } = await import('../db');
      const mgrRes = await pool.query(
        `SELECT DISTINCT user_id
           FROM workspace_memberships
          WHERE workspace_id = $1
            AND role IN ('org_owner','co_owner','org_admin','org_manager','manager','supervisor')
          LIMIT 20`,
        [workspaceId]
      );
      const managerIds: string[] = mgrRes.rows.map((r: any) => r.user_id).filter(Boolean);
      const isHighPriority = parsed.data.urgency === 'urgent' || parsed.data.urgency === 'high';
      await Promise.allSettled(
        managerIds.flatMap((recipientUserId) => [
          NotificationDeliveryService.send({
            type: 'client_portal_report' as any,
            workspaceId,
            recipientUserId,
            channel: 'in_app' as any,
            subject: `New Client Service Request — ${parsed.data.requestType}`,
            body: {
              title: 'New Client Service Request',
              message: `Client submitted a ${parsed.data.requestType} request (${ticket.ticketNumber}).`,
              url: `/service-requests/${request.id}`,
              urgency: parsed.data.urgency,
            },
            idempotencyKey: `srq-${request.id}-inapp-${recipientUserId}`,
          }),
          ...(isHighPriority ? [NotificationDeliveryService.send({
            type: 'client_portal_report' as any,
            workspaceId,
            recipientUserId,
            channel: 'push' as any,
            subject: `${parsed.data.urgency?.toUpperCase()}: Client Service Request`,
            body: {
              title: `${parsed.data.urgency?.toUpperCase()}: Service Request`,
              message: `${parsed.data.requestType} — ${ticket.ticketNumber}`,
              url: `/service-requests/${request.id}`,
            },
            idempotencyKey: `srq-${request.id}-push-${recipientUserId}`,
          })] : []),
        ]),
      );
    } catch (err: any) {
      log.warn('[ClientServiceRequest] Manager notification failed (non-blocking):', err?.message);
    }

    res.status(201).json({ ...request, ticket });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// PATCH /api/service-requests/:id — update status, assign, add notes
router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (!hasManagerAccess(req)) return res.status(403).json({ error: 'Manager access required' });

    const { id } = req.params;
    const updateSchema = z.object({
      status: z.enum(['submitted','in_progress','resolved','closed','cancelled']).optional(),
      assignedTo: z.string().optional(),
      internalNotes: z.string().max(5000).optional(),
      resolvedAt: z.string().optional(),
    });
    const updateParsed = updateSchema.safeParse(req.body);
    if (!updateParsed.success) return res.status(400).json({ error: 'Validation failed', details: updateParsed.error.flatten() });
    const { status, assignedTo, internalNotes, resolvedAt } = updateParsed.data;

    const [updated] = await db
      .update(clientServiceRequests)
      .set({
        ...(status !== undefined && { status }),
        ...(assignedTo !== undefined && { assignedTo }),
        ...(internalNotes !== undefined && { internalNotes }),
        ...(resolvedAt !== undefined && { resolvedAt: new Date(resolvedAt) }),
        updatedAt: new Date(),
      })
      .where(and(eq(clientServiceRequests.id, id), eq(clientServiceRequests.workspaceId, workspaceId)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Request not found' });
    res.json(updated);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
