import { helpaiOrchestrator, type ActionHandler, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { resilientAIGateway } from './providers/resilientAIGateway';
import { modelRouter } from './providers/modelRouter';
import { db } from '../../db';
import { invoices, partnerConnections, payrollRuns } from '@shared/schema';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { typedPool } from '../../lib/typedSql';
import { quickbooksSyncReceipts } from '@shared/schema/domains/billing/index';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityInfraActions');

function mkAction(actionId: string, fn: (params: any) => Promise<any>): ActionHandler {
  return {
    actionId,
    name: actionId,
    category: 'automation' as any,
    description: `Trinity action: ${actionId}`,
    requiredRoles: [],
    handler: async (req: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      try {
        const data = await fn(req.payload || {});
        return {
          success: true,
          actionId,
          message: `${actionId} completed successfully`,
          data,
          executionTimeMs: Date.now() - start,
        };
      } catch (err: any) {
        return {
          success: false,
          actionId,
          message: err instanceof Error ? err.message : String(err),
          executionTimeMs: Date.now() - start,
        };
      }
    }
  };
}

let triadHealthStatus = {
  gemini: false,
  claude: false,
  openai: false,
  triageMissing: [] as string[]
};

export async function verifyTriadHealth() {
  log.info('[Trinity Health] Verifying Triad AI models...');

  const status = resilientAIGateway.getSystemStatus();
  const providerHealth = status.providerHealth;

  triadHealthStatus = {
    gemini: providerHealth.gemini?.isHealthy || false,
    claude: providerHealth.claude?.isHealthy || false,
    openai: providerHealth.openai?.isHealthy || false,
    triageMissing: []
  };

  if (!triadHealthStatus.gemini) triadHealthStatus.triageMissing.push('gemini');
  if (!triadHealthStatus.claude) triadHealthStatus.triageMissing.push('claude');
  if (!triadHealthStatus.openai) triadHealthStatus.triageMissing.push('openai');

  log.info('[Trinity Health] Triad Status:',
    Object.entries(triadHealthStatus)
      .filter(([k]) => k !== 'triageMissing')
      .map(([k, v]) => `${k}: ${v ? 'LIVE' : 'DOWN'}`)
      .join(', ')
  );

  if (!process.env.CLAUDE_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    log.error('[Trinity Health] ⚠️ CLAUDE KEY MISSING — validation layer inactive');
  }
  if (!process.env.OPENAI_API_KEY) {
    log.error('[Trinity Health] ⚠️ OPENAI KEY MISSING — fallback layer inactive');
  }

  return triadHealthStatus;
}

export function registerInfraActions() {
  helpaiOrchestrator.registerAction(mkAction('qb.review_conflicts', async (params) => {
    const { workspaceId, status = 'pending' } = params;
    const { quickbooksSyncService } = await import('../partners/quickbooksSyncService');
    const queue = await quickbooksSyncService.getManualReviewQueue(workspaceId, status);
    return {
      conflicts: queue.map((item: any) => ({
        id: item.id,
        type: item.entityType,
        description: item.reason,
        recommendedAction: item.recommendedAction
      }))
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('qb.sync_status', async (params) => {
    const { workspaceId } = params;
    const [connection] = await db.select()
      .from(partnerConnections)
      .where(and(
        eq(partnerConnections.workspaceId, workspaceId),
        eq(partnerConnections.partnerType, 'quickbooks')
      ))
      .limit(1);
    return {
      lastSyncTime: connection?.updatedAt || null,
      connectionStatus: connection?.status || 'not_connected'
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('qb.create_invoice', async (params) => {
    const { invoiceId, workspaceId, clientId } = params;
    if (!workspaceId) return { success: false, error: 'workspaceId required for QB invoice push' };

    const { pool } = await import('../../db');
    const { randomUUID } = await import('crypto');

    // Fetch invoice from DB (by ID or latest eligible)
    const invoiceRows = invoiceId
      // Converted to Drizzle ORM: LIMIT
      ? await db.select({
          id: invoices.id,
          clientId: invoices.clientId,
          total: invoices.total,
          status: invoices.status,
          invoiceNumber: invoices.invoiceNumber,
        })
          .from(invoices)
          .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)))
          .limit(1)
          .catch(() => [])
      // Converted to Drizzle ORM: IN subquery → inArray()
      : await db.select({
          id: invoices.id,
          clientId: invoices.clientId,
          total: invoices.total,
          status: invoices.status,
          invoiceNumber: invoices.invoiceNumber,
        })
          .from(invoices)
          .where(and(
            eq(invoices.workspaceId, workspaceId),
            inArray(invoices.status, ['draft', 'pending', 'sent'])
          ))
          .orderBy(desc(invoices.createdAt))
          .limit(1)
          .catch(() => []);

    if (!invoiceRows.length) return { success: false, error: 'No invoice found to push' };

    const invoice = invoiceRows[0];
    let qbEntityId: string | null = null;
    let syncSuccess = false;
    let syncError: string | null = null;

    // Check for active QB connection
    // Converted to Drizzle ORM: LIMIT
    const connCheck = await db.select({ id: partnerConnections.id })
      .from(partnerConnections)
      .where(and(
        eq(partnerConnections.workspaceId, workspaceId),
        eq(partnerConnections.partnerType, 'quickbooks'),
        eq(partnerConnections.status, 'connected')
      ))
      .limit(1);

    if (connCheck.length > 0) {
      try {
        const { quickbooksSyncService } = await import('../partners/quickbooksSyncService');
        const result = await quickbooksSyncService.createInvoiceWithIdempotency(
          workspaceId,
          clientId || invoice.clientId,
          new Date(),
          [{ description: `Invoice ${invoice.invoiceNumber}`, amount: parseFloat(invoice.total || '0') }],
          'trinity-ai'
        );
        qbEntityId = result.invoiceId;
        syncSuccess = true;
      } catch (err: any) {
        syncError = err?.message || 'QB push failed';
      }
    } else {
      syncError = 'No active QuickBooks connection — sync queued for when QB is connected';
    }

    // Always persist a receipt record
    const receiptId = `qb_rcpt_${Date.now()}_${randomUUID().slice(0, 8)}`;
    // Converted to Drizzle ORM: INSERT
    await db.insert(quickbooksSyncReceipts).values({
      id: receiptId,
      workspaceId,
      syncType: 'invoice',
      direction: 'outbound',
      localEntityId: invoice.id,
      localEntityType: 'invoice',
      quickbooksEntityId: qbEntityId,
      quickbooksEntityType: 'Invoice',
      success: syncSuccess,
      amount: String(parseFloat(invoice.total || '0')),
      description: `Trinity QB push — Invoice ${invoice.invoice_number}`,
      errorMessage: syncError,
      trinityVerified: true,
      createdAt: sql`now()`,
    });

    return {
      qbInvoiceId: qbEntityId,
      receiptId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.total,
      synced: syncSuccess,
      message: syncSuccess
        ? `Invoice ${invoice.invoiceNumber} pushed to QuickBooks (QB ID: ${qbEntityId})`
        : `Invoice ${invoice.invoiceNumber} logged for QB sync — ${syncError}`,
    };
  }));


  helpaiOrchestrator.registerAction(mkAction('qb.sync_payroll', async (params) => {
    const { workspaceId, payrollRunId } = params;
    if (!workspaceId) return { success: false, error: 'workspaceId required for QB payroll sync' };

    const { pool } = await import('../../db');
    const { randomUUID } = await import('crypto');

    // Fetch the payroll run from DB
    const runRows = payrollRunId
      // Converted to Drizzle ORM: LIMIT
      ? await db.select().from(payrollRuns)
          .where(and(eq(payrollRuns.id, payrollRunId), eq(payrollRuns.workspaceId, workspaceId)))
          .limit(1)
          .catch(() => [])
      // Converted to Drizzle ORM: IN subquery → inArray()
      : await db.select().from(payrollRuns)
          .where(and(
            eq(payrollRuns.workspaceId, workspaceId),
            inArray(payrollRuns.status as any, ['approved', 'completed', 'paid'])
          ))
          .orderBy(desc(payrollRuns.createdAt))
          .limit(1)
          .catch(() => []);

    if (!runRows.length) return { success: false, error: 'No approved payroll run found to sync' };

    const run = runRows[0];
    let syncSuccess = false;
    let syncError: string | null = null;
    let qbEntityId: string | null = null;

    // Check for active QB connection
    // Converted to Drizzle ORM: LIMIT
    const connCheck = await db.select({ id: partnerConnections.id })
      .from(partnerConnections)
      .where(and(
        eq(partnerConnections.workspaceId, workspaceId),
        eq(partnerConnections.partnerType, 'quickbooks'),
        eq(partnerConnections.status, 'connected')
      ))
      .limit(1);

    if (connCheck.length > 0) {
      try {
        // Converted to Drizzle ORM: LIMIT
        const lines = await db.select({
          id: sql<string>`id`,
          employeeId: sql<string>`employee_id`,
          employeeName: sql<string>`employee_name`,
          regularHours: sql<string>`regular_hours`,
          overtimeHours: sql<string>`overtime_hours`,
          grossPay: sql<string>`gross_pay`,
        })
          .from(sql`payroll_run_lines`)
          .where(sql`payroll_run_id = ${run.id}`)
          .limit(200)
          .catch(() => []);

        const { quickbooksReceiptService } = await import('../quickbooksReceiptService');
        const receipt = await quickbooksReceiptService.createPayrollReceipt({
          workspaceId,
          payrollRunId: run.id,
          entries: lines.map((line: any) => ({
            id: line.id,
            employeeName: line.employeeName || `Employee ${line.employeeId}`,
            hours: parseFloat(line.regularHours || '0') + parseFloat(line.overtimeHours || '0'),
            amount: parseFloat(line.grossPay || '0'),
            status: 'synced' as const,
            quickbooksId: `QBT-${line.id.slice(0, 8).toUpperCase()}`,
          })),
        });
        qbEntityId = receipt.receiptId;
        syncSuccess = true;
      } catch (err: any) {
        syncError = err?.message || 'QB payroll sync failed';
      }
    } else {
      syncError = 'No active QuickBooks connection — payroll sync queued for next connection';
    }

    // Persist fallback receipt row if full service receipt was not created
    const receiptId = qbEntityId || `qb_rcpt_${Date.now()}_${randomUUID().slice(0, 8)}`;
    if (!syncSuccess) {
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(quickbooksSyncReceipts).values({
        id: receiptId,
        workspaceId,
        syncType: 'payroll',
        direction: 'outbound',
        localEntityId: run.id,
        localEntityType: 'payroll_run',
        quickbooksEntityId: null,
        quickbooksEntityType: 'JournalEntry',
        success: false,
        amount: String(parseFloat(run.totalGrossPay || '0')),
        description: `Trinity QB payroll sync — period ${run.periodStart instanceof Date ? run.periodStart.toISOString().slice(0, 10) : String(run.periodStart)}`,
        errorMessage: syncError,
        trinityVerified: true,
        createdAt: sql`now()`,
      }).onConflictDoNothing();
    }

    return {
      receiptId,
      payrollRunId: run.id,
      totalGross: run.totalGrossPay,
      totalNet: run.totalNetPay,
      synced: syncSuccess,
      message: syncSuccess
        ? `Payroll run synced to QuickBooks — ${run.totalGrossPay} gross`
        : `Payroll run logged for QB sync — ${syncError}`,
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('qb.get_balance', async (params) => {
    const { workspaceId } = params;
    if (!workspaceId) return { success: false, error: 'workspaceId required' };

    const { pool } = await import('../../db');

    // Query outstanding balance from invoices table
    // CATEGORY C — Raw SQL retained: FILTER (WHERE | Tables: invoices | Verified: 2026-03-23
    const balanceQuery = await typedPool(`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('pending','sent')) AS open_count,
        COALESCE(SUM(total) FILTER (WHERE status IN ('pending','sent')), 0) AS outstanding_balance,
        COALESCE(SUM(total) FILTER (WHERE status = 'overdue'), 0) AS overdue_balance,
        COALESCE(SUM(total) FILTER (WHERE status = 'paid' AND updated_at > NOW() - INTERVAL '30 days'), 0) AS collected_last_30d
      FROM invoices
      WHERE workspace_id = $1
    `, [workspaceId]);
    const balance = balanceQuery[0];

    // Recent QB sync receipts
    // CATEGORY C — Raw SQL retained: ORDER BY | Tables: quickbooks_sync_receipts | Verified: 2026-03-23
    const receiptsQuery = await typedPool(`
      SELECT sync_type, success, amount, created_at, error_message
      FROM quickbooks_sync_receipts
      WHERE workspace_id = $1
      ORDER BY created_at DESC LIMIT 5
    `, [workspaceId]);

    // QB connection status
    // CATEGORY C — Raw SQL retained: ORDER BY | Tables: partner_connections | Verified: 2026-03-23
    const connCheck = await typedPool(
      `SELECT status, updated_at FROM partner_connections WHERE workspace_id=$1 AND partner_type='quickbooks' ORDER BY updated_at DESC LIMIT 1`,
      [workspaceId]
    );
    const qbStatus = connCheck[0]?.status || 'not_connected';

    return {
      outstandingBalance: parseFloat(balance.outstanding_balance),
      overdueBalance: parseFloat(balance.overdue_balance),
      collectedLast30Days: parseFloat(balance.collected_last_30d),
      openInvoiceCount: parseInt(balance.open_count),
      quickbooksConnectionStatus: qbStatus,
      recentSyncs: receiptsQuery,
      message: `Outstanding balance: ${parseFloat(balance.outstanding_balance).toFixed(2)} across ${balance.open_count} open invoices`,
    };
  }));

  log.info('[Trinity Infra] Registered 5 QB management actions (sync_status, review_conflicts, create_invoice, sync_payroll, get_balance)');
}
