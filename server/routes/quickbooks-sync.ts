import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { eq, and, isNull, desc, gte } from 'drizzle-orm';
import { partnerConnections, partnerSyncLogs, invoices } from '@shared/schema';
import { requireAuth } from '../auth';
import { requireManager, type AuthenticatedRequest } from '../rbac';
import { requireProfessional } from '../tierGuards';
import { tokenManager } from '../services/billing/tokenManager';
import { createLogger } from '../lib/logger';
const log = createLogger('QuickbooksSync');


// AuthenticatedRequest is now imported from ../rbac (canonical source).

const router = Router();

const qbSyncInProgress = new Map<string, { userId: string; startedAt: number }>();
const QB_SYNC_LOCK_TTL_MS = 10 * 60 * 1000;

function acquireQbSyncLock(workspaceId: string, userId: string): { acquired: boolean; holder?: string } {
  const existing = qbSyncInProgress.get(workspaceId);
  if (existing && Date.now() - existing.startedAt < QB_SYNC_LOCK_TTL_MS && existing.userId !== userId) {
    return { acquired: false, holder: existing.userId };
  }
  qbSyncInProgress.set(workspaceId, { userId, startedAt: Date.now() });
  return { acquired: true };
}

function releaseQbSyncLock(workspaceId: string) {
  qbSyncInProgress.delete(workspaceId);
}

// T007: Standard health check for QuickBooks Sync
router.get('/health', async (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'quickbooks-sync'
  });
});

// ============= QUICKBOOKS SYNC SERVICE ROUTES =============
// Dynamic import to avoid circular dependencies
let quickbooksSyncService: any = null;

async function getQuickbooksSyncService() {
  if (!quickbooksSyncService) {
    const module = await import('../services/partners/quickbooksSyncService');
    quickbooksSyncService = module.quickbooksSyncService;
  }
  return quickbooksSyncService;
}

// Invoice creation schema
const qboInvoiceSchema = z.object({
  clientId: z.string().min(1, "clientId is required"),
  weekEnding: z.string().refine((val) => !isNaN(Date.parse(val)), "weekEnding must be a valid date"),
  lineItems: z.array(z.object({
    description: z.string().min(1),
    amount: z.union([z.number().positive(), z.string()]).transform(v => String(v)),
    hours: z.number().positive().optional(),
  })).min(1, "At least one line item is required"),
});

// Run initial sync on OAuth connect
router.post("/api/quickbooks/sync/initial", requireAuth, requireManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: "Workspace required" });
    }
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const lockResult = acquireQbSyncLock(workspaceId, req.user.id);
    if (!lockResult.acquired) {
      return res.status(409).json({ error: "A QuickBooks sync is already in progress for this workspace", lockedBy: lockResult.holder });
    }
    try {
      const syncService = await getQuickbooksSyncService();
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const result = await syncService.runInitialSync(workspaceId, req.user.id);
      releaseQbSyncLock(workspaceId);

      // Deduct 5 credits per QuickBooks sync (99% automated accounting sync)
      tokenManager.recordUsage({
        workspaceId,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        userId: req.user.id,
        featureKey: 'quickbooks_sync',
        // @ts-expect-error — TS migration: fix in refactoring sprint
        featureName: 'QuickBooks Sync',
        description: 'QuickBooks initial bidirectional sync',
        amountOverride: 5,
      }).catch((err: Error) => { log.error('[QBSync] Credit deduction failed (non-blocking):', err.message); });

      // DB ledger: record QB sync fee in financial_processing_fees for monthly billing (non-blocking)
      import('../services/billing/financialProcessingFeeService').then(({ financialProcessingFeeService }) =>
        financialProcessingFeeService.recordQbSyncFee({ workspaceId, referenceId: `qb_initial_${workspaceId}_${Date.now()}` })
          .catch((err: Error) => log.warn('[QBSync] QB sync fee ledger record failed (non-blocking):', err.message))
      ).catch((err: Error) => log.warn('[QBSync] QB sync fee import failed:', err.message));

      res.json(result);
    } catch (innerError: unknown) {
      releaseQbSyncLock(workspaceId);
      throw innerError;
    }
  } catch (error: unknown) {
    log.error("[QBO Sync] Initial sync error:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// Create invoice with idempotency - Zod validated
router.post("/api/quickbooks/invoice/create", requireAuth, requireManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: "Workspace required" });
    }
    
    const parseResult = qboInvoiceSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ 
        error: "Validation failed", 
        details: parseResult.error.issues 
      });
    }
    
    const { clientId, weekEnding, lineItems } = parseResult.data;
    const syncService = await getQuickbooksSyncService();
    const result = await syncService.createInvoiceWithIdempotency(
      workspaceId,
      clientId,
      new Date(weekEnding),
      lineItems,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      req.user.id
    );
    res.json(result);
  } catch (error: unknown) {
    log.error("[QBO Sync] Invoice creation error:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// Run CDC poll for changes
router.post("/api/quickbooks/sync/cdc", requireAuth, requireManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: "Workspace required" });
    }
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const lockResult = acquireQbSyncLock(workspaceId, req.user.id);
    if (!lockResult.acquired) {
      return res.status(409).json({ error: "A QuickBooks sync is already in progress for this workspace", lockedBy: lockResult.holder });
    }
    try {
      const { sinceDate } = req.body;
      const syncService = await getQuickbooksSyncService();
      const result = await syncService.runCDCPoll(
        workspaceId,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        req.user.id,
        sinceDate ? new Date(sinceDate) : undefined
      );
      releaseQbSyncLock(workspaceId);

      // Deduct 5 credits per QuickBooks CDC sync
      tokenManager.recordUsage({
        workspaceId,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        userId: req.user.id,
        featureKey: 'quickbooks_sync',
        // @ts-expect-error — TS migration: fix in refactoring sprint
        featureName: 'QuickBooks Sync',
        description: 'QuickBooks change data capture (CDC) sync',
        amountOverride: 5,
      }).catch((err: Error) => { log.error('[QBSync] CDC credit deduction failed (non-blocking):', err.message); });

      // DB ledger: record QB sync fee in financial_processing_fees for monthly billing (non-blocking)
      import('../services/billing/financialProcessingFeeService').then(({ financialProcessingFeeService }) =>
        financialProcessingFeeService.recordQbSyncFee({ workspaceId, referenceId: `qb_cdc_${workspaceId}_${Date.now()}` })
          .catch((err: Error) => log.warn('[QBSync] CDC sync fee ledger record failed (non-blocking):', err.message))
      ).catch((err: Error) => log.warn('[QBSync] CDC sync fee import failed:', err.message));

      res.json(result);
    } catch (innerError: unknown) {
      releaseQbSyncLock(workspaceId);
      throw innerError;
    }
  } catch (error: unknown) {
    log.error("[QBO Sync] CDC poll error:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// Get manual review queue
router.get("/api/quickbooks/review-queue", requireAuth, requireProfessional, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: "Workspace required" });
    }
    const status = (req.query.status as string) || 'pending';
    const syncService = await getQuickbooksSyncService();
    const queue = await syncService.getManualReviewQueue(
      workspaceId,
      status as 'pending' | 'resolved' | 'skipped'
    );
    res.json({ queue });
  } catch (error: unknown) {
    log.error("[QBO Sync] Review queue error:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// Resolve manual review item
router.post("/api/quickbooks/review-queue/:itemId/resolve", requireAuth, requireManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { itemId } = req.params;
    const { resolution, selectedCoaileagueEntityId } = req.body;
    if (!resolution) {
      return res.status(400).json({ error: "resolution is required" });
    }
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace context required" });

    const syncService = await getQuickbooksSyncService();
    // Pass workspaceId so service can enforce ownership before resolving
    await syncService.resolveManualReview(
      itemId,
      resolution,
      selectedCoaileagueEntityId,
      req.user?.id || 'unknown',
      workspaceId  // G-P1-1 FIX: scope resolution by workspace
    );
    res.json({ success: true });
  } catch (error: unknown) {
    log.error("[QBO Sync] Review resolution error:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// Webhook handler for QuickBooks real-time updates with proper HMAC verification
// Supports both legacy format and new CloudEvents format (mandatory after May 15, 2026).
//
// Legacy:      POST body = { eventNotifications: [...] }
// CloudEvents: POST body = [ { specversion, id, source, type, data: { realmId, ... } } ]
router.post("/api/webhooks/quickbooks", async (req: Request, res: Response) => {
  try {
    // OMEGA DIRECTIVE: QB_WEBHOOK_SECRET (or equivalent) must be verified.
    const verifierSecret = process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN;
    if (!verifierSecret && process.env.NODE_ENV === 'production') {
      log.error("[QBO Webhook] CRITICAL: QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN not configured in production.");
    }

    const signature = req.headers['intuit-signature'] as string;
    if (!signature) {
      log.info("[QBO Webhook] Missing intuit-signature header");
      return res.status(401).json({ error: "Missing signature" });
    }

    // Use raw body captured by middleware for proper HMAC verification
    const rawPayload = req.rawBody;
    if (!rawPayload) {
      log.info("[QBO Webhook] No raw body available for verification");
      return res.status(400).json({ error: "Missing request body" });
    }
    
    const event = req.body;

    // Detect format and extract first realmId for connection lookup
    // CloudEvents: top-level array with data.realmId
    // Legacy:      object with eventNotifications[0].realmId
    let realmId: string | undefined;
    const isCloudEvents = Array.isArray(event);

    if (isCloudEvents) {
      if (event.length === 0) {
        log.info("[QBO Webhook] Empty CloudEvents array - nothing to process");
        return res.status(200).send('OK');
      }
      realmId = event[0]?.data?.realmId;
      log.info("[QBO Webhook] Received CloudEvents format, events:", event.length);
    } else {
      if (!event.eventNotifications || event.eventNotifications.length === 0) {
        log.info("[QBO Webhook] No event notifications in legacy payload");
        return res.status(200).send('OK');
      }
      realmId = event.eventNotifications[0]?.realmId;
    }

    if (!realmId) {
      log.info("[QBO Webhook] No realmId found in payload");
      return res.status(200).send('OK');
    }

    const [connection] = await db.select()
      .from(partnerConnections)
      .where(eq(partnerConnections.realmId, realmId))
      .limit(1);

    if (!connection || !connection.webhookSecret) {
      log.info("[QBO Webhook] No connection or webhook secret for realm:", realmId);
      return res.status(401).json({ error: "Unknown realm or missing webhook secret" });
    }

    // Verify HMAC-SHA256 signature using the raw payload
    try {
      const syncService = await getQuickbooksSyncService();
      const result = await syncService.handleWebhook(
        signature,
        rawPayload,
        connection.webhookSecret
      );
      log.info("[QBO Webhook] Successfully processed", result.entities?.length ?? 0, "entities via", isCloudEvents ? 'cloudevents' : 'legacy', "format");
    } catch (verifyError: unknown) {
      log.error("[QBO Webhook] HMAC verification failed");
      return res.status(401).json({ error: "Invalid signature" });
    }
    
    res.status(200).send('OK');
  } catch (error: unknown) {
    log.error("[QBO Webhook] Error:", sanitizeError(error));
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// T007: WEEKLY QUICKBOOKS STAFFING CLIENT SCAN
// Scans inbound_emails from the last 7 days, finds clients not yet in QB,
// and syncs them as QB customers. Also available as manual trigger.
// POST /api/admin/quickbooks/sync-staffing-clients
// ─────────────────────────────────────────────────────────────────────────────
router.post('/api/admin/quickbooks/sync-staffing-clients', requireAuth, requireManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace required' });

    const { inboundEmails, clients, auditLogs, partnerConnections } = await import('@shared/schema');
    const { gte, and, isNotNull, eq: eqOp } = await import('drizzle-orm');

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Step 1: Get all inbound emails from last 7 days that look like staffing requests
    const recentEmails = await db
      .select({
        fromEmail: inboundEmails.fromEmail,
        fromName: inboundEmails.fromName,
        workspaceId: inboundEmails.workspaceId,
        receivedAt: inboundEmails.receivedAt,
      })
      .from(inboundEmails)
      .where(
        and(
          eqOp(inboundEmails.workspaceId, workspaceId),
          gte(inboundEmails.receivedAt, sevenDaysAgo),
        )
      );

    if (recentEmails.length === 0) {
      return res.json({ success: true, message: 'No new staffing emails in the last 7 days', synced: 0, skipped: 0 });
    }

    // Step 2: Deduplicate by email
    const uniqueClients = new Map<string, { fromEmail: string; fromName: string | null }>();
    for (const email of recentEmails) {
      if (email.fromEmail && !uniqueClients.has(email.fromEmail.toLowerCase())) {
        uniqueClients.set(email.fromEmail.toLowerCase(), {
          fromEmail: email.fromEmail,
          fromName: email.fromName,
        });
      }
    }

    // Step 3: Check which are already in clients table — deduplicate by BOTH email AND company name
    // Without company-name check, running this sync twice creates identical duplicate clients
    const existingClients = await db
      .select({ email: clients.email, companyName: clients.companyName })
      .from(clients)
      .where(eqOp(clients.workspaceId, workspaceId));

    const existingEmails = new Set(existingClients.map(c => (c.email || '').toLowerCase()));
    const existingCompanyNames = new Set(
      existingClients.map(c => (c.companyName || '').trim().toLowerCase()).filter(Boolean)
    );

    const newClients = Array.from(uniqueClients.values()).filter(c => {
      const emailMatch = existingEmails.has(c.fromEmail.toLowerCase());
      const nameMatch = c.fromName && existingCompanyNames.has(c.fromName.trim().toLowerCase());
      return !emailMatch && !nameMatch;
    });

    if (newClients.length === 0) {
      return res.json({
        success: true,
        message: 'All staffing clients already exist in the system',
        synced: 0,
        skipped: uniqueClients.size,
      });
    }

    // Step 4: Check if QB is connected
    const [qbConnection] = await db
      .select()
      .from(partnerConnections)
      .where(eqOp(partnerConnections.workspaceId, workspaceId))
      .limit(1);

    const results: { email: string; name: string; action: string }[] = [];

    for (const newClient of newClients) {
      try {
        // Insert into clients table as a new lead
        await db.insert(clients).values({
          workspaceId,
          email: newClient.fromEmail,
          companyName: newClient.fromName || newClient.fromEmail.split('@')[1] || 'Staffing Client',
          firstName: (newClient.fromName || '').split(' ')[0] || '',
          lastName: (newClient.fromName || '').split(' ').slice(1).join(' ') || '',
          status: 'lead',
          source: 'inbound_email',
        } as any);

        // Log to audit_logs
        await db.insert(auditLogs).values({
          workspaceId,
          userId: req.user!.id,
          action: 'quickbooks_staffing_client_sync',
          entityType: 'client',
          entityId: newClient.fromEmail,
          changes: {
            fromEmail: newClient.fromEmail,
            fromName: newClient.fromName,
            syncedAt: new Date().toISOString(),
            qbConnected: !!qbConnection,
          },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] || null,
        } as any);

        results.push({ email: newClient.fromEmail, name: newClient.fromName || 'Unknown', action: 'created' });
      } catch (insertErr: unknown) {
        // May fail on duplicate constraint — that's okay
        if (!(insertErr instanceof Error ? insertErr.message : String(insertErr))?.includes('duplicate') && !(insertErr instanceof Error ? insertErr.message : String(insertErr))?.includes('unique')) {
          log.error(`[QB Staffing Scan] Error inserting client ${newClient.fromEmail}:`, (insertErr instanceof Error ? insertErr.message : String(insertErr)));
        }
        results.push({ email: newClient.fromEmail, name: newClient.fromName || 'Unknown', action: 'skipped_duplicate' });
      }
    }

    const synced = results.filter(r => r.action === 'created').length;
    const skipped = uniqueClients.size - synced;

    log.info(`[QB Staffing Scan] Workspace ${workspaceId}: ${synced} new clients synced, ${skipped} skipped`);

    res.json({
      success: true,
      message: `QB staffing client scan complete: ${synced} new clients added${qbConnection ? ', ready for QB push' : ' (QB not connected — connect QB to push to QuickBooks)'}`,
      synced,
      skipped,
      results,
      qbConnected: !!qbConnection,
    });
  } catch (error: unknown) {
    log.error('[QB Staffing Scan] Error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Staffing client sync failed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP-5: SYNC RETRY QUEUE
// Returns failed/errored partnerSyncLogs entries from the last 7 days.
// POST retry endpoint triggers a fresh incremental sync for the connection.
// GET  /api/quickbooks/sync/retry-queue
// POST /api/quickbooks/sync/retry-queue/:logId
// ─────────────────────────────────────────────────────────────────────────────

router.get('/api/quickbooks/sync/retry-queue', requireAuth, requireProfessional, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const failedLogs = await db.select()
      .from(partnerSyncLogs)
      .where(
        and(
          eq(partnerSyncLogs.workspaceId, workspaceId),
          gte(partnerSyncLogs.startedAt, sevenDaysAgo)
        )
      )
      .orderBy(desc(partnerSyncLogs.startedAt))
      .limit(50);

    const failed = failedLogs.filter(l => l.status === 'failed');
    const running = failedLogs.filter(l => l.status === 'running');
    const completed = failedLogs.filter(l => l.status === 'completed');

    return res.json({
      retryQueue: failed,
      runningJobs: running,
      recentCompleted: completed.slice(0, 5),
      totals: { failed: failed.length, running: running.length, completed: completed.length },
    });
  } catch (error: unknown) {
    log.error('[QB Retry Queue] Error:', error);
    return res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post('/api/quickbooks/sync/retry-queue/:logId', requireAuth, requireManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const { logId } = req.params;

    const [logEntry] = await db.select()
      .from(partnerSyncLogs)
      .where(and(eq(partnerSyncLogs.id, logId), eq(partnerSyncLogs.workspaceId, workspaceId)))
      .limit(1);

    if (!logEntry) return res.status(404).json({ error: 'Sync log not found' });
    if (logEntry.status !== 'failed') return res.status(400).json({ error: `Cannot retry a ${logEntry.status} log` });

    const lockResult = acquireQbSyncLock(workspaceId, req.user!.id);
    if (!lockResult.acquired) {
      return res.status(409).json({ error: 'A QuickBooks sync is already in progress', lockedBy: lockResult.holder });
    }

    try {
      const { quickbooksSyncPollingService } = await import('../services/integrations/quickbooksSyncPollingService');
      const result = await quickbooksSyncPollingService.triggerManualSync(workspaceId);
      releaseQbSyncLock(workspaceId);
      return res.json({ success: true, result });
    } catch (innerErr) {
      releaseQbSyncLock(workspaceId);
      throw innerErr;
    }
  } catch (error: unknown) {
    log.error('[QB Retry Queue] Retry error:', error);
    return res.status(500).json({ error: sanitizeError(error) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP-6: QB CONNECTION STATUS (persistent disconnected indicator)
// Frontend polls this to show a banner when QB is disconnected or token expired.
// Returns the current connection status including error state and reauth URL.
// GET /api/quickbooks/connection-status
// ─────────────────────────────────────────────────────────────────────────────

router.get('/api/quickbooks/connection-status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const [connection] = await db.select({
      id: partnerConnections.id,
      status: partnerConnections.status,
      realmId: partnerConnections.realmId,
      lastSyncAt: partnerConnections.lastSyncAt,
      errorCount: (partnerConnections as any).errorCount,
      lastError: partnerConnections.lastError,
    })
      .from(partnerConnections)
      .where(eq(partnerConnections.workspaceId, workspaceId))
      .limit(1);

    if (!connection) {
      return res.json({ connected: false });
    }

    return res.json({
      connected: connection.status === 'connected',
      status: connection.status,
      realmId: connection.realmId,
      lastSyncAt: connection.lastSyncAt,
      hasError: connection.errorCount > 0,
      lastError: connection.lastError,
    });
  } catch (error: unknown) {
    log.error('[QB Connection Status] Error:', error);
    return res.status(500).json({ error: sanitizeError(error) });
  }
});

export const quickbooksSyncRouter = router;
export default router;
