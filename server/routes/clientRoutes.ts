import { sanitizeError } from '../middleware/errorHandler';
import { formatZodIssues } from '../middleware/validateRequest';
import { isValidIANATimezone } from '../services/holidayService';
import { validateBillingRate, businessRuleResponse } from '../lib/businessRules';
import { Router } from "express";
import { NotificationDeliveryService } from '../services/notificationDeliveryService';
import { storage } from "../storage";
import { trimStrings } from "../utils/sanitize";
import { db } from "../db";
import { softDelete } from "../lib/softDelete";
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
  auditLogs,
} from '@shared/schema';
import { z } from "zod";
import { requireAuth } from "../auth";
import { requireManagerOrPlatformStaff, type AuthenticatedRequest } from "../rbac";
import { scheduleNonBlocking } from "../lib/scheduleNonBlocking";
import { clientsQuerySchema } from "../../shared/validation/pagination";
import { deletionProtection } from "../services/deletionProtectionService";
import { clientPortalHelpAIService } from "../services/helpai/clientPortalHelpAIService";
import { createLogger } from '../lib/logger';
import { setInvoiceSettings } from '../services/billing/invoiceSettingsService';
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
  'maxDrivingDistance', 'numberOfGuards',
] as const;

// Decimal columns: Drizzle maps these to z.string() in Zod — keep as string, just handle empty
const CLIENT_DECIMAL_FIELDS = [
  'contractRate', 'clientOvertimeMultiplier', 'clientHolidayMultiplier',
  'armedBillRate', 'unarmedBillRate', 'overtimeBillRate',
  'latitude', 'longitude', 'billableHourlyRate',
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
      return res.status(400).json({ error: "Validation failed", details: formatZodIssues(validationResult.error) });
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

    // Keep client billing inputs and invoice settings in sync from day 1.
    await setInvoiceSettings({
      workspaceId,
      clientId: client.id,
      billingCycle: (validated.billingFrequency || validated.billingCycle || 'monthly') as string,
      taxRate: workspace.defaultTaxRate ? String(workspace.defaultTaxRate) : '0.0000',
      roundHoursTo: '0.25',
      defaultBillRate: validated.billableHourlyRate ? String(validated.billableHourlyRate) : undefined,
      autoSendInvoice: validated.autoSendInvoice ?? true,
      invoiceRecipientEmails: validated.billingEmail ? [validated.billingEmail] : undefined,
    }, req.user?.id || null);

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
        log.error('[Client Creation] Rate creation failed, soft-deleting orphaned client:', rateErr);
        try {
          // TRINITY.md Section R / Law P1 — soft delete (audit trail of failed creates retained)
          await softDelete({
            table: clients,
            where: and(eq(clients.id, client.id), eq(clients.workspaceId, workspaceId))!,
            userId: req.user?.id ?? 'system',
            workspaceId,
            entityType: 'client',
            entityId: client.id,
            reason: 'creation_rollback_rate_failure',
          });
        } catch (cleanupErr) {
          // Cleanup failed — the client record remains visible. Log for manual remediation.
          log.error('[Client Creation] CRITICAL: Orphaned client soft-delete failed — client.id=%s workspaceId=%s needs manual cleanup', client.id, workspaceId, cleanupErr);
        }
        throw rateErr;
      }
    }

    if (validated.email) {
      const { emailService } = await import('../services/emailService');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const _clientWelcomeEmail = emailService.buildClientWelcomeEmail(client.id, validated.email, (validated as any).name || 'Valued Client', validated.companyName || '', workspace.name || '');
      NotificationDeliveryService.send({ idempotencyKey: `notif:client:${client.id}:welcome`,
            type: 'client_welcome', workspaceId: workspaceId || 'system', recipientUserId: client.id, channel: 'email', body: _clientWelcomeEmail })
        .catch(err => log.error('[Client Creation] Failed to queue welcome email:', err));

      // Send Trinity-branded welcome email to client
      try {
        const { sendTrinityWelcomeEmail } = await import('../services/trinityWelcomeService');
        await sendTrinityWelcomeEmail({
          workspaceId: workspaceId || 'system',
          userId: client.id,
          userEmail: validated.email,
          userType: 'client',
          workspaceName: workspace.name || 'Your Organization',
          userName: (validated as any).name || validated.companyName || 'Valued Client',
          customContext: { tenantName: workspace.name || 'Your Organization' },
        });
      } catch (trinityEmailErr) {
        log.warn('[Client Creation] Trinity welcome email failed (non-blocking):', trinityEmailErr);
      }
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

    // Reserve email address for client portal — non-blocking
    try {
      const { pool: pgPool } = await import('../db');
      const wsRow = await pgPool.query(
        `SELECT email_slug FROM workspaces WHERE id = $1`,
        [workspaceId]
      );
      const emailSlug = wsRow.rows[0]?.email_slug;
      if (emailSlug) {
        const { emailProvisioningService } = await import('../services/email/emailProvisioningService');
        const clientName = validated.companyName || (validated as any).name || `client-${client.id.slice(0, 8)}`;
        await emailProvisioningService.reserveClientEmailAddress(
          workspaceId,
          client.id,
          clientName,
          emailSlug,
        );
        log.info(`[EmailProvisioning] Reserved @coaileague.com seat for client ${client.id}`);
      }
    } catch (emailProvErr) {
      log.warn('[Client Creation] Email seat provisioning failed (non-blocking):', (emailProvErr as Error).message);
    }
    
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
      return res.status(400).json({ error: "Validation failed", details: formatZodIssues(validationResult.error) });
    }
    const validated = validationResult.data;

    if ((validated as any).billableRate !== undefined) {
      if (businessRuleResponse(res, [validateBillingRate((validated as any).billableRate, 'billableRate')])) return;
    }

    // Fetch current client state BEFORE update so we can detect deactivation
    const [existing] = await db.select()
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

    const invoiceSyncFields = [
      validated.billingFrequency,
      validated.billingCycle,
      validated.billableHourlyRate,
      validated.autoSendInvoice,
      validated.billingEmail,
    ];
    const shouldSyncInvoiceSettings = invoiceSyncFields.some((value) => value !== undefined);
    if (shouldSyncInvoiceSettings) {
      await setInvoiceSettings({
        workspaceId,
        clientId: req.params.id,
        billingCycle: validated.billingFrequency ?? validated.billingCycle ?? undefined,
        defaultBillRate: validated.billableHourlyRate != null ? String(validated.billableHourlyRate) : undefined,
        autoSendInvoice: validated.autoSendInvoice ?? undefined,
        invoiceRecipientEmails: validated.billingEmail != null ? [validated.billingEmail] : undefined,
      }, req.user?.id || null);
    }

    await db.insert(auditLogs).values({
      workspaceId,
      userId: req.user?.id || null,
      userEmail: req.user?.email || null,
      action: 'client_updated',
      entityType: 'client',
      entityId: req.params.id,
      changesBefore: existing || null,
      changesAfter: client,
      createdAt: new Date(),
    } as any);
    
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
      return res.status(400).json({ error: "Validation failed", details: formatZodIssues(validation.error) });
    }
    const body = validation.data;

    // ── Trinity Deliberation Gate ───────────────────────────────────────────
    // Before any destructive action, Trinity's conscience considers financial,
    // legal, relational, and operational impact. Owners can override by
    // resubmitting with { deliberationApproved: true }.
    const deliberationApproved = (req.body as any)?.deliberationApproved === true;
    if (!deliberationApproved) {
      try {
        const { deliberate, persistDeliberationDocuments } =
          await import('../services/trinity/trinityDeliberation');
        const delibCtx = {
          requestType: 'cancel_client' as const,
          requestedBy: userId || 'unknown',
          requestedByRole: req.workspaceRole || '',
          workspaceId,
          targetId: req.params.id,
          targetType: 'client' as const,
          rawCommand: body.reason || 'Client deactivation requested',
        };
        const result = await deliberate(delibCtx);
        scheduleNonBlocking('client-deactivate.docs', () =>
          persistDeliberationDocuments(result, delibCtx),
        );
        if (['intervene', 'pause_and_warn', 'block'].includes(result.verdict)) {
          const isOwnerLevel = ['org_owner', 'co_owner'].includes(req.workspaceRole || '');
          return res.status(200).json({
            trinityIntervention: true,
            verdict: result.verdict,
            headline: result.headline,
            reasoning: result.reasoning,
            empathyStatement: result.empathyStatement,
            riskAssessment: result.riskAssessment,
            alternatives: result.alternatives,
            generatedDocuments: result.generatedDocuments?.map(d => ({ type: d.type, title: d.title })),
            overrideAvailable: isOwnerLevel && result.verdict !== 'block',
            overrideMessage: isOwnerLevel && result.verdict !== 'block'
              ? "Resubmit with deliberationApproved: true to override Trinity's recommendation."
              : result.verdict === 'block'
                ? 'Trinity blocked this action — override not available.'
                : 'Only org_owner or co_owner can override this recommendation.',
          });
        }
        log.info(`[ClientDeactivate] Trinity verdict: ${result.verdict} — ${result.headline}`);
      } catch (deliberationErr: any) {
        log.warn('[ClientDeactivate] Deliberation failed (non-fatal):', deliberationErr?.message);
      }
    }

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

    // Deactivate client and cancel future shifts atomically
    const now = new Date();
    const closedResult = await db.transaction(async (tx) => {
      await tx.update(clients)
        .set({
          isActive: false,
          deactivatedAt: now,
          deactivatedBy: userId || 'unknown',
          deactivationReason: body.reason,
          deactivationNotes: body.notes || null,
          collectionsStatus: body.startCollectionsImmediately ? 'active' : 'none',
        })
        .where(and(eq(clients.id, req.params.id), eq(clients.workspaceId, workspaceId)));

      return tx.update(shifts)
        .set({ status: 'cancelled' })
        .where(and(
          eq(shifts.workspaceId, workspaceId),
          eq(shifts.clientId, req.params.id),
          gte(shifts.startTime, now),
          sql`${shifts.status} NOT IN ('cancelled', 'completed')`
        ))
        .returning({ id: shifts.id });
    });

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
            .where(and(
              inArray((timeEntries as any).id, unbilledEntries.map(e => e.id)),
              eq((timeEntries as any).workspaceId, workspaceId),
            ));

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
      return res.status(400).json({ error: "Validation failed", details: formatZodIssues(validation.error) });
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
// ─── POST /:id/collections/decline ───────────────────────────────────────────
// ─── POST /:id/collections/resolve ───────────────────────────────────────────
// ─── POST /:id/collections/write-off ─────────────────────────────────────────
// ─── GET /:id/collections/log ─────────────────────────────────────────────────
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
    const dockChatStartSchema = z.object({
      orgWorkspaceId: z.string().min(1, 'orgWorkspaceId required'),
      reportType: z.enum(['billing_discrepancy','staff_issue','complaint','violation','service_quality','other'], {
        errorMap: () => ({ message: 'Invalid reportType' }),
      }),
      clientId: z.string().optional(),
      clientName: z.string().optional(),
      clientEmail: z.string().email().optional().or(z.literal('')).transform(v => v || undefined),
      initialMessage: z.string().optional(),
    });
    const dockStartParsed = dockChatStartSchema.safeParse(req.body);
    if (!dockStartParsed.success) return res.status(400).json({ message: 'Invalid request body', details: formatZodIssues(dockStartParsed.error) });
    const { orgWorkspaceId, clientId, clientName, clientEmail, reportType, initialMessage } = dockStartParsed.data;

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
    const dockChatMsgSchema = z.object({
      sessionId: z.string().min(1, 'sessionId required'),
      message: z.string().min(1, 'message required'),
      evidenceText: z.string().optional(),
    });
    const dockMsgParsed = dockChatMsgSchema.safeParse(req.body);
    if (!dockMsgParsed.success) return res.status(400).json({ message: 'Invalid request body', details: formatZodIssues(dockMsgParsed.error) });
    const { sessionId, message, evidenceText } = dockMsgParsed.data;

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
    const dockChatCloseSchema = z.object({
      sessionId: z.string().min(1, 'sessionId required'),
      title: z.string().optional(),
    });
    const dockCloseParsed = dockChatCloseSchema.safeParse(req.body);
    if (!dockCloseParsed.success) return res.status(400).json({ message: 'Invalid request body', details: formatZodIssues(dockCloseParsed.error) });
    const { sessionId, title } = dockCloseParsed.data;

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
// ORG: Acknowledge a report
// ORG: Resolve a report
// ============================================================================
// CLIENT-FACING: My Communications (DockChat report history for the client)
// Clients can view their own report submissions — no manager auth needed
// ============================================================================
router.get('/my-communications', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
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
    const workspaceId = req.workspaceId || (req.user)?.workspaceId;
    const userId = req.user?.id;
    const userEmail = req.user?.email;
    if (!workspaceId) return res.status(403).json({ message: 'Workspace required' });

    const contractRenewalReqSchema = z.object({
      contractTitle: z.string().min(1, 'contractTitle required'),
      notes: z.string().optional(),
    });
    const renewalReqParsed = contractRenewalReqSchema.safeParse(req.body);
    if (!renewalReqParsed.success) return res.status(400).json({ error: 'Invalid request body', details: formatZodIssues(renewalReqParsed.error) });
    const { contractTitle, notes } = renewalReqParsed.data;

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
    const workspaceId = req.workspaceId || (req.user)?.workspaceId;
    const userId = req.user?.id;
    const userEmail = req.user?.email;
    if (!workspaceId) return res.status(403).json({ message: 'Workspace required' });

    const coiReqSchema = z.object({
      reason: z.string().min(1, 'reason required'),
      additionalInfo: z.string().optional(),
      clientName: z.string().optional(),
      certificateHolder: z.string().optional(),
    });
    const coiParsed = coiReqSchema.safeParse(req.body);
    if (!coiParsed.success) return res.status(400).json({ error: 'Invalid request body', details: formatZodIssues(coiParsed.error) });
    const { reason, additionalInfo, clientName, certificateHolder } = coiParsed.data;

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
      idempotencyKey: `notif:coi:${userId}:request`,
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
// ─── GET /api/workspace/seat-cap — get hard cap setting ──────────────────────
// (mounted on the client router but serves as a general billing route)
// This is handled via the billing routes. Hard cap toggle is on subscriptions table.

// ─── GET /api/clients/my-portal-token ─────────────────────────────────────────
// Returns the portal access token for the currently authenticated client user.
// Used by the client portal frontend to make portal-authenticated payment calls.
router.get('/my-portal-token', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
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
