import { sanitizeError } from '../middleware/errorHandler';
import { isValidIANATimezone } from '../services/holidayService';
import { validateBillingRate, businessRuleResponse } from '../lib/businessRules';
import { Router } from "express";
import { NotificationDeliveryService } from '../services/notificationDeliveryService';
import { storage } from "../storage";
import { trimStrings } from "../utils/sanitize";
import { db } from "../db";
import { eq, and, desc, sql, gte, inArray } from "drizzle-orm";
import {
  users,
  insertClientSchema,
  invoices,
  invoicePayments,
  documentVault,
  clientPortalReports,
  clients,
  clientCollectionsLog,
  shifts,
  clientPortalAccess,
} from '@shared/schema';
import { z } from "zod";
import { requireAuth } from "../auth";
import { requireManagerOrPlatformStaff, type AuthenticatedRequest } from "../rbac";
import { clientsQuerySchema } from "../../shared/validation/pagination";
import { deletionProtection } from "../services/deletionProtectionService";
import { clientPortalHelpAIService } from "../services/helpai/clientPortalHelpAIService";
import { createLogger } from '../lib/logger';
const log = createLogger('ClientRoutes');

import {
  createFilterContext,
  filterClientForResponse,
  filterClientsForResponse,
} from "../utils/sensitiveFieldFilter";
import {
  startCollections,
  declineCollections,
  resolveCollections,
  writeOffCollections,
  getCollectionsLog,
} from "../services/clientCollectionsService";

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
}

// Integer columns: Drizzle maps these to z.number() in Zod, so coerce string → number
const CLIENT_INT_FIELDS = [
  'paymentTermsDays', 'minOfficerSchedulingScore', 'minimumStaffing',
  'maxDrivingDistance',
] as const;

// Decimal columns: Drizzle maps these to z.string() in Zod — keep as string, just handle empty
const CLIENT_DECIMAL_FIELDS = [
  'contractRate', 'clientOvertimeMultiplier', 'clientHolidayMultiplier',
  'armedBillRate', 'unarmedBillRate', 'overtimeBillRate',
  'latitude', 'longitude',
] as const;

function coerceClientNumbers(data: Record<string, unknown>): Record<string, unknown> {
  const result = { ...data };
  // Coerce integer fields: string → number
  for (const field of CLIENT_INT_FIELDS) {
    if (field in result && result[field] !== '' && result[field] !== null && result[field] !== undefined) {
      const n = Number(result[field]);
      if (!isNaN(n)) result[field] = n;
    } else if (field in result && result[field] === '') {
      result[field] = undefined;
    }
  }
  // Decimal fields: just null out empty strings; keep as string for Zod (z.string())
  for (const field of CLIENT_DECIMAL_FIELDS) {
    if (field in result && result[field] === '') {
      result[field] = null;
    }
  }
  return result;
}

const router = Router();

router.get('/', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    if (req.platformRole && (req.platformRole === 'root_admin' || req.platformRole === 'sysop' || req.platformRole === 'support_manager')) {
      const { workspaceId: queryWorkspaceId, ...paginationQuery } = req.query;
      const targetWorkspaceId = req.workspaceId || queryWorkspaceId as string;
      
      if (!targetWorkspaceId) {
        return res.json({
          data: [],
          total: 0,
          page: 1,
          limit: 50,
          pageCount: 0,
          hasNext: false,
          hasPrev: false
        });
      }
      
      const validated = clientsQuerySchema.parse(paginationQuery);
      
      const result = await storage.listClients({
        workspaceId: targetWorkspaceId,
        ...validated
      });
      const ctx = createFilterContext(req);
      return res.json({ ...result, data: filterClientsForResponse(result.data, ctx) });
    }
    
    const workspaceId = req.workspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ message: "Workspace ID is required" });
    }

    const validated = clientsQuerySchema.parse(req.query);
    
    const result = await storage.listClients({
      workspaceId,
      ...validated
    });
    const ctx = createFilterContext(req);
    res.json({ ...result, data: filterClientsForResponse(result.data, ctx) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Invalid query parameters",
        errors: error.errors
      });
    }
    log.error("Error fetching clients:", error);
    res.status(500).json({ message: "Failed to fetch clients" });
  }
});

router.get('/lookup', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    if (req.platformRole && (req.platformRole === 'root_admin' || req.platformRole === 'sysop' || req.platformRole === 'support_manager')) {
      const targetWorkspaceId = req.workspaceId;  // FIX-3: Removed query param fallback - only use JWT workspaceId
      
      if (!targetWorkspaceId) {
        return res.json([]);
      }
      
      const allClients = await storage.getClientsByWorkspace(targetWorkspaceId);
      const ctx = createFilterContext(req);
      return res.json(filterClientsForResponse(allClients, ctx));
    }
    
    const workspaceId = req.workspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ message: "Workspace ID is required" });
    }

    const allClients = await storage.getClientsByWorkspace(workspaceId);
    const ctx = createFilterContext(req);
    res.json(filterClientsForResponse(allClients, ctx));
  } catch (error) {
    log.error("Error fetching clients for lookup:", error);
    res.status(500).json({ message: "Failed to fetch clients" });
  }
});

router.post('/', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ message: "Workspace ID is required" });
    }
    
    const workspace = await storage.getWorkspace(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const { billableRate, serviceType, ...clientData } = req.body;

    const validationResult = insertClientSchema.safeParse({
      ...coerceClientNumbers(trimStrings(clientData)),
      workspaceId,
    });

    if (!validationResult.success) {
      return res.status(400).json({ error: "Validation failed", details: validationResult.error.issues });
    }

    const validated = validationResult.data;

    let userId: string | null = null;
    const normalizedEmail = normalizeEmail(validated.email);
    if (normalizedEmail) {
      try {
        const [matchingUser] = await db.select()
          .from(users)
          .where(sql`lower(${users.email}) = ${normalizedEmail}`)
          .limit(1);
        
        if (matchingUser) {
          userId = matchingUser.id;
        }
      } catch (error) {
        log.error('[Client Creation] Error looking up user by email:', error);
      }
    }

    const client = await storage.createClient({
      ...validated,
      userId: userId || validated.userId || null,
    });

    // GAP-L3-CRM: Initialize CRM pipeline record on client creation.
    // This ensures every new client is immediately visible in the sales/retention pipeline.
    try {
      const { typedPoolExec } = await import('../lib/typedSql');
      await typedPoolExec(
        `INSERT INTO client_crm_pipeline (workspace_id, client_id, stage, probability, health_score, created_at, updated_at)
         VALUES ($1, $2, 'onboarding', 100, 100, NOW(), NOW())
         ON CONFLICT (client_id) DO NOTHING`,
        [workspaceId, client.id]
      );
    } catch (crmErr: any) {
      log.warn('[Client Creation] CRM pipeline initialization failed (non-blocking):', crmErr.message);
    }

    const { attachClientExternalId } = await import('../services/identityService');
    attachClientExternalId(client.id, workspaceId).catch(err => 
      log.error('Failed to attach client external ID:', err)
    );

    if (billableRate !== undefined && billableRate !== null && billableRate !== '') {
      if (businessRuleResponse(res, [validateBillingRate(billableRate, 'billableRate')])) return;
    }

    const rateValue = parseFloat(billableRate || "0");
    if (!isNaN(rateValue) && rateValue > 0) {
      try {
        await storage.createClientRate({
          workspaceId: workspace.id,
          clientId: client.id,
          billableRate: rateValue.toFixed(2),
          description: serviceType || "Standard hourly rate",
          isActive: true,
          hasSubscription: false,
          subscriptionFrequency: validated.billingCycle || "monthly",
        });
      } catch (rateErr) {
        // Rate creation failed — clean up orphaned client record to maintain referential integrity.
        // T009: Ideally both operations should share a DB transaction; this manual rollback is the
        // next-best safeguard — but must itself succeed for the system to stay consistent.
        log.error('[Client Creation] Rate creation failed, removing orphaned client:', rateErr);
        try {
          await db.delete(clients).where(eq(clients.id, client.id));
        } catch (cleanupErr) {
          // Cleanup failed — the client record is now orphaned. Log for manual remediation.
          log.error('[Client Creation] CRITICAL: Orphaned client cleanup failed — client.id=%s workspaceId=%s needs manual deletion', client.id, workspaceId, cleanupErr);
        }
        throw rateErr;
      }
    }

    if (validated.email) {
      const { emailService } = await import('../services/emailService');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const _clientWelcomeEmail = emailService.buildClientWelcomeEmail(client.id, validated.email, (validated as any).name || 'Valued Client', validated.companyName || '', workspace.name || '');
      NotificationDeliveryService.send({ type: 'client_welcome', workspaceId: workspaceId || 'system', recipientUserId: client.id, channel: 'email', body: _clientWelcomeEmail })
        .catch(err => log.error('[Client Creation] Failed to queue welcome email:', err));
    }

    const { entityCreationNotifier } = await import('../services/entityCreationNotifier');
    entityCreationNotifier.notifyNewClient({
      clientId: client.id,
      workspaceId,
      name: (validated as any).name || validated.companyName || 'New Client',
      contactEmail: validated.email,
      address: validated.address,
      createdBy: userId || 'system',
    }).catch(err => log.error('[Client Creation] Failed to notify Trinity:', err));
    
    const { broadcastToWorkspace } = await import('../websocket');
    broadcastToWorkspace(workspaceId, { type: 'clients_updated', action: 'created' });

    // Emit client.created event for Trinity to assess invoice-readiness
    try {
      const { platformEventBus } = await import('../services/platformEventBus');
      const clientRates = await storage.getClientRates(workspaceId, client.id);
      const contractRate = (clientRates as any)?.[0]?.rate || null;
      platformEventBus.publish({
        type: 'client.created',
        workspaceId,
        title: `New client: ${client.companyName || `${client.firstName} ${client.lastName}`}`,
        description: `Client onboarded — category: ${client.category || 'unknown'}`,
        metadata: {
          clientId: client.id,
          clientName: client.companyName || `${client.firstName} ${client.lastName}`,
          billingEmail: client.billingEmail || client.email,
          contractRate,
          category: client.category,
        },
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    } catch (_publishErr) { log.warn('[ClientRoutes] Failed to publish client.created event — non-critical:', _publishErr instanceof Error ? _publishErr.message : String(_publishErr)); }

    res.status(201).json(filterClientForResponse(client, createFilterContext(req)));
  } catch (error: unknown) {
    log.error("Error creating client:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to create client" });
  }
});

router.patch('/:id', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ message: "Workspace ID is required" });
    }

    const { workspaceId: _, ...updateData } = req.body;
    const validationResult = insertClientSchema.partial().safeParse(coerceClientNumbers(trimStrings(updateData)));
    if (!validationResult.success) {
      return res.status(400).json({ error: "Validation failed", details: validationResult.error.issues });
    }
    const validated = validationResult.data;

    if ((validated as any).billableRate !== undefined) {
      if (businessRuleResponse(res, [validateBillingRate((validated as any).billableRate, 'billableRate')])) return;
    }

    // Fetch current client state BEFORE update so we can detect deactivation
    const [existing] = await db.select({ isActive: clients.isActive })
      .from(clients)
      .where(and(eq(clients.id, req.params.id), eq(clients.workspaceId, workspaceId)))
      .limit(1);

    const client = await storage.updateClient(req.params.id, workspaceId, validated);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    // When a client transitions from active → inactive, Trinity closes all their
    // FUTURE shifts. Historical shifts, time entries, invoices, and payroll records
    // are preserved exactly as financial records require for audit/tax purposes.
    const wasJustDeactivated = existing?.isActive === true && validated.isActive === false;
    let shiftsClosedCount = 0;
    if (wasJustDeactivated) {
      const now = new Date();
      const closedResult = await db.update(shifts)
        .set({ status: 'cancelled' })
        .where(and(
          eq(shifts.workspaceId, workspaceId),
          eq(shifts.clientId, req.params.id),
          gte(shifts.startTime, now),
          sql`${shifts.status} NOT IN ('cancelled', 'completed')`
        ))
        .returning({ id: shifts.id });
      shiftsClosedCount = closedResult.length;
      log.info(`[ClientDeactivation] Client ${req.params.id} deactivated — ${shiftsClosedCount} future shift(s) cancelled. Historical records preserved.`);
    }
    
    const { broadcastToWorkspace } = await import('../websocket');
    broadcastToWorkspace(workspaceId, {
      type: 'clients_updated',
      action: wasJustDeactivated ? 'deactivated' : 'updated',
      clientId: req.params.id,
      shiftsClosedCount: wasJustDeactivated ? shiftsClosedCount : undefined,
    });

    // 🧠 TRINITY: If billing rates changed, trigger downstream recalculation pipeline
    // Flags draft invoices, re-evaluates revenue projections and margin risk automatically
    const rateFields = ['armedBillRate', 'unarmedBillRate', 'overtimeBillRate', 'contractRate'];
    const hasRateChange = rateFields.some(field => (validated as any)[field] !== undefined);
    if (hasRateChange) {
      (async () => {
        try {
          const { helpaiOrchestrator } = await import('../services/helpai/platformActionHub');
          // @ts-expect-error — TS migration: fix in refactoring sprint
          await helpaiOrchestrator.executeAction('settings.propagate_bill_rate_change', {
            clientId: req.params.id,
            workspaceId,
            changedFields: rateFields.filter(f => (validated as any)[f] !== undefined),
            newRates: Object.fromEntries(
              rateFields.filter(f => (validated as any)[f] !== undefined)
                .map(f => [f, (validated as any)[f]])
            ),
            changedBy: req.user?.id,
          });
        } catch (propagateErr) {
          log.warn('[BillRatePropagation] Trinity propagation non-blocking failure:', propagateErr);
        }
      })();
    }
    
    res.json(filterClientForResponse(
      { ...client, shiftsClosedCount: wasJustDeactivated ? shiftsClosedCount : undefined },
      createFilterContext(req)
    ));
  } catch (error: unknown) {
    log.error("Error updating client:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to update client" });
  }
});

// ─── GET /deactivated — list all deactivated clients for this workspace ───────
router.get('/deactivated', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID required' });

    const { isNull, or } = await import('drizzle-orm');
    const deactivated = await db.query.clients.findMany({
      where: and(
        eq(clients.workspaceId, workspaceId),
        eq(clients.isActive, false)
      ),
      orderBy: [desc(clients.deactivatedAt)],
    });

    res.json(filterClientsForResponse(deactivated, createFilterContext(req)));
  } catch (err: unknown) {
    log.error('[ClientRoutes] GET /deactivated error:', err);
    res.status(500).json({ message: sanitizeError(err) || 'Failed to fetch deactivated clients' });
  }
});

// ─── POST /:id/deactivate — dedicated deactivation endpoint ──────────────────
router.post('/:id/deactivate', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID required' });

    const validation = z.object({
      reason: z.enum([
        'non_payment', 'legal_issue', 'contract_terminated', 'contract_non_renewal',
        'lawsuit', 'unable_to_staff', 'does_not_meet_billing_requirements',
        'does_not_meet_hourly_requirements', 'other', 'no_reason_provided',
      ]),
      notes: z.string().optional(),
      startCollectionsImmediately: z.boolean().optional().default(false),
      outstandingAmount: z.number().optional(),
    }).safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ error: "Validation failed", details: validation.error.issues });
    }
    const body = validation.data;

    // Race-condition guard: only deactivate if currently active
    const [existing] = await db.select().from(clients)
      .where(and(eq(clients.id, req.params.id), eq(clients.workspaceId, workspaceId), eq(clients.isActive, true)))
      .limit(1);

    if (!existing) {
      return res.status(409).json({ message: 'Client is already deactivated or not found' });
    }

    // Auto-query outstanding invoices before deactivation
    const [outstandingResult] = await db
      .select({
        count: sql<number>`count(*)::int`,
        totalOutstanding: sql<string>`coalesce(sum(${invoices.total}::numeric - coalesce(${invoices.amountPaid}::numeric, 0)), 0)::text`,
      })
      .from(invoices)
      .where(and(
        eq(invoices.workspaceId, workspaceId!),
        eq(invoices.clientId, req.params.id),
        sql`${invoices.status} NOT IN ('paid', 'cancelled', 'void')`
      ));

    const outstandingCount = outstandingResult?.count ?? 0;
    const outstandingBalance = parseFloat(outstandingResult?.totalOutstanding ?? '0');

    // Deactivate client
    await db.update(clients)
      .set({
        isActive: false,
        deactivatedAt: new Date(),
        deactivatedBy: userId || 'unknown',
        deactivationReason: body.reason,
        deactivationNotes: body.notes || null,
        collectionsStatus: body.startCollectionsImmediately ? 'active' : 'none',
      })
      .where(and(eq(clients.id, req.params.id), eq(clients.workspaceId, workspaceId)));

    // Cancel all future shifts
    const now = new Date();
    const closedResult = await db.update(shifts)
      .set({ status: 'cancelled' })
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        eq(shifts.clientId, req.params.id),
        gte(shifts.startTime, now),
        sql`${shifts.status} NOT IN ('cancelled', 'completed')`
      ))
      .returning({ id: shifts.id });

    log.info(`[ClientDeactivation] Client ${req.params.id} deactivated by ${userId} — ${closedResult.length} future shifts cancelled`);

    // Start collections if requested — use DB-queried balance; fall back to caller-provided amount
    if (body.startCollectionsImmediately) {
      const collectionsAmount = outstandingBalance > 0 ? outstandingBalance : body.outstandingAmount;
      startCollections(workspaceId, req.params.id, userId || 'system', collectionsAmount).catch(err =>
        log.error('[Collections] Failed to start collections after deactivation:', err)
      );
    }

    // ── FINAL INVOICE SWEEP: flag all unbilled confirmed hours ───────────────
    let finalInvoiceGenerated = false;
    try {
      const { timeEntries } = await import('@shared/schema');
      const { ne } = await import('drizzle-orm');
      const unbilledEntries = await db.select({
        id: timeEntries.id,
        totalHours: timeEntries.totalHours,
      })
        .from(timeEntries)
        .where(and(
          eq(timeEntries.workspaceId, workspaceId),
          eq(timeEntries.clientId, req.params.id),
          sql`${timeEntries.status} IN ('approved', 'confirmed')`,
          sql`${timeEntries.invoiceId} IS NULL`
        ))
        .limit(500);

      if (unbilledEntries.length > 0) {
        const totalUnbilledHours = unbilledEntries.reduce((sum, e) => sum + parseFloat(String(e.totalHours || 0)), 0);
        const contractRate = parseFloat(String(existing.contractRate || 0));
        const finalInvoiceAmount = Math.round(totalUnbilledHours * contractRate * 100);

        if (finalInvoiceAmount > 0) {
          const finalInvoiceId = `inv_final_${Date.now()}`;
          await db.insert(invoices).values({
            id: finalInvoiceId,
            workspaceId: workspaceId!,
            clientId: req.params.id,
            status: 'draft',
            total: String(finalInvoiceAmount / 100),
            amountPaid: '0',
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            notes: `Final invoice generated on client offboarding — ${unbilledEntries.length} unbilled entries, ${totalUnbilledHours.toFixed(2)} hours at $${contractRate}/hr`,
          } as any);

          await db.update(timeEntries as any)
            .set({ invoiceId: finalInvoiceId } as any)
            .where(inArray((timeEntries as any).id, unbilledEntries.map(e => e.id)));

          // Register in Document Vault for compliance/integrity
          const { createHash } = await import('crypto');
          const contentKey = `Final Invoice ${finalInvoiceId}:${workspaceId}`;
          const integrityHash = createHash('sha256').update(contentKey).digest('hex');

          await db.insert(documentVault).values({
            workspaceId: workspaceId!,
            title: `Final Invoice ${finalInvoiceId}`,
            category: 'financial',
            fileUrl: '', // No file generated in this sweep, only DB record
            fileSizeBytes: 0,
            mimeType: 'application/pdf',
            integrityHash,
            relatedEntityType: 'invoice',
            relatedEntityId: finalInvoiceId,
            uploadedBy: userId || 'system',
            createdAt: new Date(),
          }).onConflictDoNothing();

    finalInvoiceGenerated = true;
          log.info(`[ClientOffboarding] Final invoice ${finalInvoiceId} created for client ${req.params.id} — ${totalUnbilledHours.toFixed(2)} hours, $${(finalInvoiceAmount / 100).toFixed(2)}`);
        }
      }
    } catch (finalInvoiceErr: unknown) {
      log.error('[ClientOffboarding] Final invoice sweep failed (non-blocking):', (finalInvoiceErr instanceof Error ? finalInvoiceErr.message : String(finalInvoiceErr)));
    }

    // ── QUICKBOOKS FINAL SYNC — push all pending records to QB ───────────────
    try {
      const { db: dbInner } = await import('../db');
      const { sql: drizzleSql } = await import('drizzle-orm');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const [qbRow] = await dbInner.execute(drizzleSql`
        SELECT quickbooks_realm_id FROM workspaces WHERE id = ${workspaceId} LIMIT 1
      `) as any[];
      if (qbRow?.quickbooks_realm_id) {
        import('../services/partners/quickbooksSyncService')
          // @ts-expect-error — TS migration: fix in refactoring sprint
          .then(({ quickbooksSyncService }) => quickbooksSyncService.syncWorkspace(workspaceId!))
          .catch(e => log.warn('[ClientOffboarding] QB final sync failed (non-blocking):', e));
      }
    } catch (qbErr: unknown) {
      log.warn('[ClientOffboarding] QB sync check failed (non-blocking):', (qbErr instanceof Error ? qbErr.message : String(qbErr)));
    }

    // ── STRUCTURED OFFBOARDING AUDIT RECORD ──────────────────────────────────
    try {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const { universalAuditService, AUDIT_ACTIONS } = await import('../services/universalAuditService');
      await universalAuditService.log({
        workspaceId: workspaceId!,
        actorId: userId,
        actorType: 'user',
        action: AUDIT_ACTIONS.CLIENT_OFFBOARDED,
        entityType: 'client',
        entityId: req.params.id,
        entityName: existing.companyName,
        changeType: 'action',
        changes: {
          isActive: { old: true, new: false },
        },
        metadata: {
          reason: body.reason,
          notes: body.notes,
          shiftsClosedCount: closedResult.length,
          collectionsStarted: body.startCollectionsImmediately,
          finalInvoiceGenerated,
          outstandingInvoices: outstandingCount,
          outstandingBalance,
        },
        sourceRoute: 'POST /clients/:id/deactivate',
      });
    } catch (auditErr: unknown) {
      log.error('[ClientOffboarding] Structured audit write failed (non-blocking):', (auditErr instanceof Error ? auditErr.message : String(auditErr)));
    }

    // Trinity event
    (async () => {
      try {
        const { emitTrinityEvent } = await import('../services/trinityEventSubscriptions');
        await emitTrinityEvent('client_deactivated', {
          workspaceId,
          clientId: req.params.id,
          clientName: existing.companyName,
          reason: body.reason,
          notes: body.notes,
          deactivatedBy: userId,
          shiftsClosedCount: closedResult.length,
          collectionsStarted: body.startCollectionsImmediately,
          finalInvoiceGenerated,
        });
      } catch (e) { log.warn('[Trinity] client_deactivated event failed:', e); }
    })();

    // Broadcast WS
    const { broadcastToWorkspace } = await import('../websocket');
    broadcastToWorkspace(workspaceId, {
      type: 'clients_updated',
      action: 'deactivated',
      clientId: req.params.id,
      shiftsClosedCount: closedResult.length,
    });

    const updated = await db.query.clients.findFirst({
      where: and(eq(clients.id, req.params.id), eq(clients.workspaceId, workspaceId)),
    });

    res.json({
      ...filterClientForResponse(updated!, createFilterContext(req)),
      shiftsClosedCount: closedResult.length,
      collectionsStarted: body.startCollectionsImmediately,
      finalInvoiceGenerated,
      outstandingInvoices: {
        count: outstandingCount,
        totalBalance: outstandingBalance,
      },
    });
  } catch (err: unknown) {
    log.error('[ClientRoutes] POST /deactivate error:', err);
    res.status(400).json({ message: sanitizeError(err) || 'Failed to deactivate client' });
  }
});

// ─── POST /:id/reactivate — dedicated reactivation endpoint ──────────────────
router.post('/:id/reactivate', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID required' });

    const validation = z.object({
      notes: z.string().optional(),
    }).safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ error: "Validation failed", details: validation.error.issues });
    }
    const body = validation.data;

    // Race-condition guard: only reactivate if currently inactive
    const [existing] = await db.select().from(clients)
      .where(and(eq(clients.id, req.params.id), eq(clients.workspaceId, workspaceId), eq(clients.isActive, false)))
      .limit(1);

    if (!existing) {
      return res.status(409).json({ message: 'Client is already active or not found' });
    }

    const wasInCollections = ['active', 'pending_decision'].includes(existing.collectionsStatus || '');

    await db.update(clients)
      .set({
        isActive: true,
        reactivatedAt: new Date(),
        reactivatedBy: userId || 'unknown',
        deactivatedAt: null,
        deactivatedBy: null,
        deactivationReason: null,
        deactivationNotes: null,
        collectionsStatus: wasInCollections ? 'resolved' : existing.collectionsStatus,
      })
      .where(and(eq(clients.id, req.params.id), eq(clients.workspaceId, workspaceId)));

    // Trinity event
    (async () => {
      try {
        const { emitTrinityEvent } = await import('../services/trinityEventSubscriptions');
        await emitTrinityEvent('client_reactivated', {
          workspaceId,
          clientId: req.params.id,
          clientName: existing.companyName,
          reactivatedBy: userId,
          wasInCollections,
          notes: body.notes,
        });
      } catch (e) { log.warn('[Trinity] client_reactivated event failed:', e); }
    })();

    // Broadcast WS
    const { broadcastToWorkspace } = await import('../websocket');
    broadcastToWorkspace(workspaceId, {
      type: 'clients_updated',
      action: 'reactivated',
      clientId: req.params.id,
    });

    const updated = await db.query.clients.findFirst({
      where: and(eq(clients.id, req.params.id), eq(clients.workspaceId, workspaceId)),
    });

    res.json(filterClientForResponse(updated!, createFilterContext(req)));
  } catch (err: unknown) {
    log.error('[ClientRoutes] POST /reactivate error:', err);
    res.status(400).json({ message: sanitizeError(err) || 'Failed to reactivate client' });
  }
});

// ─── POST /:id/collections/start ─────────────────────────────────────────────
router.post('/:id/collections/start', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID required' });
    const validation = z.object({ outstandingAmount: z.number().optional() }).safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Validation failed", details: validation.error.issues });
    }
    const body = validation.data;
    const result = await startCollections(workspaceId, req.params.id, userId || 'system', body.outstandingAmount);
    if (!result.success) return res.status(400).json({ message: result.error || 'Failed to start collections' });
    res.json({ success: true, message: 'Collections pipeline started' });
  } catch (err: unknown) {
    res.status(400).json({ message: sanitizeError(err) || 'Failed to start collections' });
  }
});

// ─── POST /:id/collections/decline ───────────────────────────────────────────
router.post('/:id/collections/decline', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID required' });
    const body = z.object({ reason: z.string().optional() }).parse(req.body);
    await declineCollections(workspaceId, req.params.id, userId || 'system', body.reason);
    res.json({ success: true, message: 'Collections declined' });
  } catch (err: unknown) {
    res.status(400).json({ message: sanitizeError(err) || 'Failed to decline collections' });
  }
});

// ─── POST /:id/collections/resolve ───────────────────────────────────────────
router.post('/:id/collections/resolve', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID required' });
    const body = z.object({ notes: z.string().optional() }).parse(req.body);
    await resolveCollections(workspaceId, req.params.id, userId || 'system', body.notes);
    res.json({ success: true, message: 'Collections marked as resolved' });
  } catch (err: unknown) {
    res.status(400).json({ message: sanitizeError(err) || 'Failed to resolve collections' });
  }
});

// ─── POST /:id/collections/write-off ─────────────────────────────────────────
router.post('/:id/collections/write-off', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID required' });
    const body = z.object({ notes: z.string().optional() }).parse(req.body);
    await writeOffCollections(workspaceId, req.params.id, userId || 'system', body.notes);
    res.json({ success: true, message: 'Debt written off' });
  } catch (err: unknown) {
    res.status(400).json({ message: sanitizeError(err) || 'Failed to write off collections' });
  }
});

// ─── GET /:id/collections/log ─────────────────────────────────────────────────
router.get('/:id/collections/log', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID required' });
    const log = await getCollectionsLog(workspaceId, req.params.id);
    res.json(log);
  } catch (err: unknown) {
    res.status(500).json({ message: sanitizeError(err) || 'Failed to fetch collections log' });
  }
});

router.delete('/:id', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    
    if (!workspaceId) {
      return res.status(400).json({ message: "Workspace ID is required" });
    }

    const confirmationCode = req.body?.confirmationCode || req.query.confirmationCode;
    const reason = req.body?.reason || 'User requested deletion';
    
    const result = await deletionProtection.safeDelete({
      entityType: 'client',
      entityId: req.params.id,
      requestedBy: userId || 'unknown',
      reason,
      confirmationCode,
    });

    if (!result.success) {
      if (result.error?.includes('confirmation')) {
        const code = result.error.match(/code: ([A-Z0-9]+)/)?.[1];
        return res.status(409).json({ 
          message: "Deletion requires confirmation",
          confirmationRequired: true,
          confirmationCode: code,
          recoveryDays: 60,
          warning: "This client has dependent data. Deletion will be soft (recoverable for 60 days)."
        });
      }
      return res.status(400).json({ 
        message: result.error || "Cannot delete client - may have unpaid invoices", 
        auditId: result.auditId 
      });
    }
    
    log.info(`[DeletionProtection] Client ${req.params.id} safely deleted by ${userId}, mode: ${result.mode}, recovery until: ${result.recoveryDeadline}`);
    
    const { broadcastToWorkspace } = await import('../websocket');
    broadcastToWorkspace(workspaceId, { type: 'clients_updated', action: 'deleted' });
    
    res.json({ 
      success: true, 
      mode: result.mode,
      recoveryDeadline: result.recoveryDeadline,
      auditId: result.auditId
    });
  } catch (error) {
    log.error("Error deleting client:", error);
    res.status(500).json({ message: "Failed to delete client" });
  }
});

router.get('/:clientId/payments', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { clientId } = req.params;

    const payments = await db
      .select({
        id: invoicePayments.id,
        invoiceId: invoicePayments.invoiceId,
        invoiceNumber: invoices.invoiceNumber,
        amount: invoicePayments.amount,
        status: invoicePayments.status,
        paymentMethod: invoicePayments.paymentMethod,
        last4: invoicePayments.last4,
        paidAt: invoicePayments.paidAt,
        refundedAmount: invoicePayments.refundedAmount,
        createdAt: invoicePayments.createdAt,
      })
      .from(invoicePayments)
      .leftJoin(invoices, eq(invoicePayments.invoiceId, invoices.id))
      .where(
        and(
          eq(invoicePayments.workspaceId, workspaceId),
          eq(invoices.clientId, clientId)
        )
      )
      .orderBy(desc(invoicePayments.createdAt));

    res.json(payments);
  } catch (error: unknown) {
    log.error('Error getting client payments:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to get payments' });
  }
});

// ============================================================================
// CLIENT PORTAL DOCKCHAT (HelpAI) ROUTES
// Rate-limited public routes for guest client portal chat widget
// ============================================================================

const dockChatRateLimits = new Map<string, { count: number; resetAt: number }>();
// LAW 17 + GAP-DRL-01 FIX: Purge stale rate limit entries every 5 minutes to prevent memory leak.
// Without this, the Map grows unboundedly for long-running servers with many unique IPs.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of dockChatRateLimits.entries()) {
    if (now > entry.resetAt) dockChatRateLimits.delete(ip);
  }
}, 5 * 60 * 1000).unref();

function dockChatRateLimit(req: any, res: any, next: any) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 60_000;
  const maxRequests = 20;
  const entry = dockChatRateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    dockChatRateLimits.set(ip, { count: 1, resetAt: now + windowMs });
    return next();
  }
  if (entry.count >= maxRequests) {
    return res.status(429).json({ message: 'Too many requests. Please try again later.' });
  }
  entry.count++;
  return next();
}

router.post('/dockchat/start', dockChatRateLimit, async (req: any, res: any) => {
  try {
    const { orgWorkspaceId, clientId, clientName, clientEmail, reportType, initialMessage } = req.body;

    if (!orgWorkspaceId || !reportType) {
      return res.status(400).json({ message: 'orgWorkspaceId and reportType are required' });
    }

    const validTypes = ['billing_discrepancy', 'staff_issue', 'complaint', 'violation', 'service_quality', 'other'];
    if (!validTypes.includes(reportType)) {
      return res.status(400).json({ message: 'Invalid reportType' });
    }

    const result = await clientPortalHelpAIService.startSession({
      orgWorkspaceId,
      clientId,
      clientName,
      clientEmail,
      reportType,
      initialMessage,
    });

    res.json(result);
  } catch (error: unknown) {
    log.error('[DockChat] Error starting session:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to start DockChat session' });
  }
});

// Send a message in a DockChat session
router.post('/dockchat/message', dockChatRateLimit, async (req: any, res: any) => {
  try {
    const { sessionId, message, evidenceText } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ message: 'sessionId and message are required' });
    }

    const result = await clientPortalHelpAIService.processMessage({ sessionId, message, evidenceText });
    res.json(result);
  } catch (error: unknown) {
    log.error('[DockChat] Error processing message:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to process message' });
  }
});

// Close session and generate structured report
router.post('/dockchat/close', dockChatRateLimit, async (req: any, res: any) => {
  try {
    const { sessionId, title } = req.body;

    if (!sessionId) {
      return res.status(400).json({ message: 'sessionId is required' });
    }

    const result = await clientPortalHelpAIService.closeSession(sessionId, title || 'Client Report');
    res.json(result);
  } catch (error: unknown) {
    log.error('[DockChat] Error closing session:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to close session' });
  }
});

// ORG: Get all client portal reports (requires org auth)
router.get('/dockchat/reports', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId;
    if (!workspaceId) return res.status(403).json({ message: 'Workspace required' });

    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 500);
    const reports = await clientPortalHelpAIService.getOrgReports(workspaceId, limit);
    res.json({ reports, total: reports.length });
  } catch (error: unknown) {
    log.error('[DockChat] Error fetching reports:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to fetch reports' });
  }
});

// ORG: Get a single report by ID
router.get('/dockchat/reports/:reportId', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId;
    if (!workspaceId) return res.status(403).json({ message: 'Workspace required' });

    const report = await clientPortalHelpAIService.getReport(req.params.reportId, workspaceId);
    if (!report) return res.status(404).json({ message: 'Report not found' });

    res.json(report);
  } catch (error: unknown) {
    log.error('[DockChat] Error fetching report:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to fetch report' });
  }
});

// ORG: Acknowledge a report
router.post('/dockchat/reports/:reportId/acknowledge', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId;
    if (!workspaceId) return res.status(403).json({ message: 'Workspace required' });

    const { note } = req.body;
    const ok = await clientPortalHelpAIService.acknowledgeReport(req.params.reportId, workspaceId, note);
    if (!ok) return res.status(404).json({ message: 'Report not found or not in your workspace' });

    res.json({ success: true, message: 'Report acknowledged' });
  } catch (error: unknown) {
    log.error('[DockChat] Error acknowledging report:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to acknowledge report' });
  }
});

// ORG: Resolve a report
router.post('/dockchat/reports/:reportId/resolve', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId;
    if (!workspaceId) return res.status(403).json({ message: 'Workspace required' });

    const { note } = req.body;
    const userId = req.user?.id;
    const ok = await clientPortalHelpAIService.resolveReport(req.params.reportId, workspaceId, userId!, note);
    if (!ok) return res.status(404).json({ message: 'Report not found or not in your workspace' });

    res.json({ success: true, message: 'Report resolved' });
  } catch (error: unknown) {
    log.error('[DockChat] Error resolving report:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to resolve report' });
  }
});

// ============================================================================
// CLIENT-FACING: My Communications (DockChat report history for the client)
// Clients can view their own report submissions — no manager auth needed
// ============================================================================
router.get('/my-communications', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId;
    const userEmail = req.user?.email;
    if (!workspaceId) return res.status(403).json({ message: 'Workspace required' });

    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 500);

    // Pull all reports for this workspace, then filter to this client's submissions
    const allReports = await clientPortalHelpAIService.getOrgReports(workspaceId, 200);
    const myReports = allReports.filter(r => {
      if (!userEmail) return false;
      const reportEmail = (r as any).clientEmail || (r as any).guestEmail || '';
      return normalizeEmail(reportEmail) === normalizeEmail(userEmail);
    }).slice(0, limit);

    res.json({ reports: myReports, total: myReports.length });
  } catch (error: unknown) {
    log.error('[ClientPortal] Error fetching my-communications:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to fetch communications' });
  }
});

// ============================================================================
// CLIENT-FACING: COI Request
// Client requests a Certificate of Insurance / Proof of Insurance from org
// Logs to audit_logs + fires notification to org managers
// ============================================================================
// ============================================================================
// CLIENT-FACING: Contract Renewal Request
// Client requests renewal of a service agreement — logs to audit + notifies org
// ============================================================================
router.post('/contract-renewal-request', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId;
    const userId = req.user?.id;
    const userEmail = req.user?.email;
    if (!workspaceId) return res.status(403).json({ message: 'Workspace required' });

    const { contractTitle, notes } = req.body;

    const { auditLogs, notifications } = await import('@shared/schema');

    await db.insert(auditLogs).values({
      workspaceId,
      userId: userId || 'system',
      userEmail: userEmail || 'client@portal.com',
      userRole: 'client',
      action: 'contract_renewal_request' as any,
      entityType: 'contract',
      entityId: workspaceId,
      changes: {
        requestedBy: userEmail,
        contractTitle,
        notes: notes || null,
        requestedAt: new Date().toISOString(),
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || null,
    } as any);

    await db.insert(notifications).values({
      workspaceId,
      userId: userId || '',
      type: 'document_uploaded' as any,
      title: 'Contract Renewal Request',
      message: `${userEmail} has requested renewal of contract: "${contractTitle}". ${notes ? `Notes: ${notes}` : ''}`,
      isRead: false,
      metadata: { requestType: 'contract_renewal', contractTitle, notes, requestedBy: userEmail },
    });

    res.json({ success: true, message: 'Your renewal request has been submitted. Your security provider will review and respond.' });
  } catch (error: unknown) {
    log.error('[ClientPortal] Contract renewal request error:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to submit renewal request' });
  }
});

router.post('/coi-request', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId;
    const userId = req.user?.id;
    const userEmail = req.user?.email;
    if (!workspaceId) return res.status(403).json({ message: 'Workspace required' });

    const { reason, additionalInfo, clientName, certificateHolder } = req.body;

    const { auditLogs, workspaces } = await import('@shared/schema');
    const { notifications } = await import('@shared/schema');

    // Get workspace name
    const [ws] = await db.select({ name: workspaces.name }).from(workspaces)
      .where(eq(workspaces.id, workspaceId)).limit(1);

    // Log the COI request to audit trail
    await db.insert(auditLogs).values({
      workspaceId,
      userId: userId || 'system',
      userEmail: userEmail || 'client@portal.com',
      userRole: 'client',
      action: 'coi_request' as any,
      entityType: 'document',
      entityId: workspaceId,
      changes: {
        requestedBy: userEmail,
        clientName: clientName || userEmail,
        certificateHolder: certificateHolder || clientName,
        reason: reason || 'Client request',
        additionalInfo: additionalInfo || null,
        requestedAt: new Date().toISOString(),
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || null,
    } as any);

    // Fire UNS notification to org managers
    await db.insert(notifications).values({
      workspaceId,
      userId: userId || '',
      type: 'document_expiring' as any, // Reuse existing type for document requests
      title: 'COI Request from Client Portal',
      message: `${clientName || userEmail} has requested a Certificate of Insurance (COI/Proof of Insurance). Certificate Holder: ${certificateHolder || 'N/A'}. Reason: ${reason || 'Not specified'}.`,
      isRead: false,
      metadata: {
        requestType: 'coi_request',
        requestedBy: userEmail,
        clientName: clientName || userEmail,
        certificateHolder: certificateHolder || '',
        reason: reason || '',
        additionalInfo: additionalInfo || '',
        requestedAt: new Date().toISOString(),
      },
    });

    // Send email to org via NDS — tracked delivery with automatic retry on failure
    const _coiAdminEmail = `admin@${ws?.name?.toLowerCase().replace(/\s+/g, '') || 'organization'}.com`;
    NotificationDeliveryService.send({
      type: 'invoice_notification',
      workspaceId: workspaceId || 'system',
      recipientUserId: _coiAdminEmail,
      channel: 'email',
      body: {
        to: _coiAdminEmail,
        subject: `COI Request — ${clientName || userEmail}`,
        html: `<p><strong>${clientName || userEmail}</strong> has submitted a COI/Proof of Insurance request through the client portal.</p>
        <p><strong>Certificate Holder:</strong> ${certificateHolder || 'Not specified'}</p>
        <p><strong>Reason:</strong> ${reason || 'Not specified'}</p>
        <p><strong>Additional Info:</strong> ${additionalInfo || 'None'}</p>
        <p>Please fulfill this request and upload the COI to the client's document portal.</p>`,
      },
    }).catch(err => log.warn('[ClientRoutes] COI email queue failed:', (err as any)?.message));

    res.json({
      success: true,
      message: 'Your COI request has been submitted. Your security provider will prepare and deliver the certificate.',
      requestId: `COI-${Date.now()}`,
    });
  } catch (error: unknown) {
    log.error('[ClientPortal] COI request error:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to submit COI request' });
  }
});

const coverageScheduleSchema = z.object({
  coverageType: z.enum(['24_7', 'business_hours', 'custom']),
  coverageDays: z.array(z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])).optional().nullable(),
  coverageStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  coverageEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  // Phase 46: IANA timezone validated on save
  coverageTimezone: z.string().optional().refine(
    tz => !tz || isValidIANATimezone(tz),
    { message: 'coverageTimezone must be a valid IANA timezone (e.g. America/Chicago)' }
  ),
  coverageNotes: z.string().optional().nullable(),
});

router.get('/:clientId/coverage-schedule', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const { clientId } = req.params;
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace required' });

    const [client] = await db.select({
      id: clients.id,
      companyName: clients.companyName,
      coverageType: clients.coverageType,
      coverageDays: clients.coverageDays,
      coverageStartTime: clients.coverageStartTime,
      coverageEndTime: clients.coverageEndTime,
      coverageTimezone: clients.coverageTimezone,
      coverageNotes: clients.coverageNotes,
      minimumStaffing: clients.minimumStaffing,
    }).from(clients).where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)));

    if (!client) return res.status(404).json({ message: 'Client not found' });

    let displayLabel = 'Custom Schedule';
    if (client.coverageType === '24_7') {
      displayLabel = '24/7 — All days, all hours';
    } else if (client.coverageType === 'business_hours') {
      displayLabel = 'Business Hours — Mon-Fri, 08:00-18:00';
    } else if (client.coverageDays && client.coverageStartTime) {
      const days = client.coverageDays.map(d => d.charAt(0).toUpperCase() + d.slice(1, 3)).join(', ');
      displayLabel = `${days} ${client.coverageStartTime}-${client.coverageEndTime || '23:59'}`;
    }

    res.json({
      success: true,
      data: { ...client, displayLabel },
    });
  } catch (error: unknown) {
    log.error('[ClientCoverage] Get error:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to get coverage schedule' });
  }
});

router.patch('/:clientId/coverage-schedule', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const { clientId } = req.params;
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace required' });

    const parsed = coverageScheduleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid coverage schedule', errors: parsed.error.flatten() });

    const data = parsed.data;

    let coverageDays = data.coverageDays;
    let coverageStartTime = data.coverageStartTime;
    let coverageEndTime = data.coverageEndTime;

    if (data.coverageType === '24_7') {
      coverageDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      coverageStartTime = '00:00';
      coverageEndTime = '23:59';
    } else if (data.coverageType === 'business_hours') {
      coverageDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
      coverageStartTime = '08:00';
      coverageEndTime = '18:00';
    }

    const [updated] = await db.update(clients).set({
      coverageType: data.coverageType,
      coverageDays,
      coverageStartTime,
      coverageEndTime,
      coverageTimezone: data.coverageTimezone || 'America/New_York',
      coverageNotes: data.coverageNotes,
      updatedAt: new Date(),
    }).where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId))).returning();

    if (!updated) return res.status(404).json({ message: 'Client not found' });

    res.json({ success: true, data: updated });
  } catch (error: unknown) {
    log.error('[ClientCoverage] Update error:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to update coverage schedule' });
  }
});

// ─── GET /:id/export — data export package for departing client ───────────────
router.get('/:id/export', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID required' });

    const [client] = await db.select().from(clients)
      .where(and(eq(clients.id, req.params.id), eq(clients.workspaceId, workspaceId)))
      .limit(1);

    if (!client) return res.status(404).json({ message: 'Client not found' });

    const { timeEntries, shifts: shiftsTable } = await import('@shared/schema');

    const [clientInvoices, clientShifts, clientTimeEntries] = await Promise.all([
      db.select().from(invoices)
        .where(and(eq(invoices.workspaceId, workspaceId), eq(invoices.clientId, req.params.id)))
        .orderBy(desc(invoices.createdAt)),
      db.select().from(shiftsTable)
        .where(and(eq(shiftsTable.workspaceId, workspaceId), eq(shiftsTable.clientId, req.params.id)))
        .orderBy(desc(shiftsTable.startTime))
        .limit(1000),
      db.select().from(timeEntries)
        .where(and(eq(timeEntries.workspaceId, workspaceId), eq(timeEntries.clientId, req.params.id)))
        // @ts-expect-error — TS migration: fix in refactoring sprint
        .orderBy(desc(timeEntries.clockInTime))
        .limit(5000),
    ]);

    const exportPackage = {
      exportedAt: new Date().toISOString(),
      exportedBy: userId,
      retentionPolicyYears: 7,
      client: filterClientForResponse(client, createFilterContext(req)),
      summary: {
        totalInvoices: clientInvoices.length,
        totalShifts: clientShifts.length,
        totalTimeEntries: clientTimeEntries.length,
        totalBilled: clientInvoices.reduce((sum, inv) => sum + parseFloat(String(inv.total || 0)), 0).toFixed(2),
        totalPaid: clientInvoices.reduce((sum, inv) => sum + parseFloat(String(inv.amountPaid || 0)), 0).toFixed(2),
      },
      invoices: clientInvoices,
      shifts: clientShifts,
      timeEntries: clientTimeEntries,
    };

    try {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const { universalAuditService, AUDIT_ACTIONS } = await import('../services/universalAuditService');
      await universalAuditService.log({
        workspaceId,
        actorId: userId,
        actorType: 'user',
        action: AUDIT_ACTIONS.CLIENT_DATA_EXPORTED,
        entityType: 'client',
        entityId: req.params.id,
        entityName: client.companyName,
        changeType: 'read',
        metadata: {
          invoiceCount: clientInvoices.length,
          shiftCount: clientShifts.length,
          timeEntryCount: clientTimeEntries.length,
        },
        sourceRoute: 'GET /clients/:id/export',
      });
    } catch { /* non-blocking */ }

    res.json(exportPackage);
  } catch (err: unknown) {
    log.error('[ClientExport] Error generating export:', err);
    res.status(500).json({ message: sanitizeError(err) || 'Failed to generate export' });
  }
});

// ─── GET /api/workspace/seat-cap — get hard cap setting ──────────────────────
// (mounted on the client router but serves as a general billing route)
// This is handled via the billing routes. Hard cap toggle is on subscriptions table.

// ─── GET /api/clients/my-portal-token ─────────────────────────────────────────
// Returns the portal access token for the currently authenticated client user.
// Used by the client portal frontend to make portal-authenticated payment calls.
router.get('/my-portal-token', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = (req.user)?.workspaceId;
    const userEmail = req.user?.email;
    if (!workspaceId || !userEmail) return res.status(401).json({ message: 'Unauthorized' });

    // Find the client record matching this user's email
    const [client] = await db.select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.email, userEmail), eq(clients.workspaceId, workspaceId)));

    if (!client) return res.status(404).json({ message: 'Client account not found for this user' });

    // Get the most recent active portal access token for this client
    const [portal] = await db.select({
      accessToken: clientPortalAccess.accessToken,
      expiresAt: clientPortalAccess.expiresAt,
      isActive: clientPortalAccess.isActive,
    })
      .from(clientPortalAccess)
      .where(and(
        eq(clientPortalAccess.clientId, client.id),
        eq(clientPortalAccess.workspaceId, workspaceId),
        eq(clientPortalAccess.isActive, true),
      ))
      .orderBy(desc(clientPortalAccess.createdAt))
      .limit(1);

    if (!portal) return res.status(404).json({ message: 'No active portal access found. Contact your service provider.' });
    if (portal.expiresAt && new Date(portal.expiresAt) < new Date()) {
      return res.status(403).json({ message: 'Portal access has expired. Contact your service provider.' });
    }

    return res.json({ accessToken: portal.accessToken });
  } catch (err: unknown) {
    log.error('[ClientPortal] Error fetching portal token:', err);
    return res.status(500).json({ message: 'Failed to retrieve portal access' });
  }
});

export default router;

