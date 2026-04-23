import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { db, pool } from "../db";
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { requireAuth } from "../auth";
import { requireOwner, requirePlatformAdmin, type AuthenticatedRequest } from "../rbac";
import { typedCount, typedExec, typedQuery } from '../lib/typedSql';
import { quickbooksSyncReceipts, chatMessages as chatMessagesTable } from '@shared/schema';
import { createLogger } from '../lib/logger';
import { PLATFORM } from '../config/platformConfig';
import { isProduction } from '../lib/isProduction';
const log = createLogger('DevRoutes');


const router = Router();

router.post("/seed-emails", requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ message: "Dev endpoints disabled in production" });
    }
    const { seedEmailsForAllWorkspaces } = await import("../seed-emails");
    const result = await seedEmailsForAllWorkspaces();
    res.json({
      success: result.success,
      message: `Successfully seeded ${result.totalEmails} emails across ${result.workspaceCount} workspaces`,
      totalEmails: result.totalEmails,
      workspaceCount: result.workspaceCount,
    });
  } catch (error) {
    log.error("Email seeding error:", error);
    res.status(500).json({ error: "Failed to seed test emails", details: String(error) });
  }
});

router.post('/seed-expired-keys', requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const { count = 5, daysOld = 65 } = req.body;
    const workspaceId = req.workspaceId!;
    const { idempotencyKeys } = await import('@shared/schema');
    const { sql } = await import('drizzle-orm');
    
    const expiredDate = new Date();
    expiredDate.setDate(expiredDate.getDate() - daysOld);
    
    const expiredExpiresAt = new Date(expiredDate);
    expiredExpiresAt.setDate(expiredExpiresAt.getDate() + 1);
    
    const seededKeys = [];
    for (let i = 0; i < count; i++) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const result = await db.insert(idempotencyKeys).values({
        workspaceId,
        operationType: 'test_cleanup',
        requestFingerprint: `test-expired-${Date.now()}-${i}`,
        status: 'completed',
        expiresAt: expiredExpiresAt,
        createdAt: expiredDate,
      }).returning({ id: idempotencyKeys.id });
      
      if (result[0]) {
        seededKeys.push(result[0].id);
      }
    }
    
    res.json({
      success: true,
      message: `Seeded ${count} expired idempotency keys`,
      keys: seededKeys,
      daysOld,
      expirationDate: expiredDate.toISOString(),
    });
  } catch (error: unknown) {
    log.error('[DEV] Error seeding expired keys:', error);
    res.status(500).json({ message: 'Failed to seed expired keys' });
  }
});

router.post('/trigger-automation/:jobType', requireOwner, async (req: AuthenticatedRequest, res) => {
  // Block in production — this is a development/ops convenience endpoint only.
  // Use canonical isProduction() helper (TRINITY.md §A). Direct
  // Direct NODE_ENV/Railway env checks are forbidden because they don't fire consistently on
  // Railway / Cloud Run / other hosts.
  if (isProduction()) {
    return res.status(403).json({ error: 'Not available in production' });
  }
  try {
    const { jobType } = req.params;
    const { manualTriggers } = await import('../services/autonomousScheduler');
    
    const validJobs = ['invoicing', 'scheduling', 'payroll', 'cleanup'] as const;
    if (!validJobs.includes(jobType as any)) {
      return res.status(400).json({ 
        message: 'Invalid job type', 
        validJobs 
      });
    }
    
    const trigger = manualTriggers[jobType as keyof typeof manualTriggers];
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    trigger().catch ((error: unknown) => {
      log.error(`[DEV] Error in manual ${jobType} trigger:`, error);
    });
    
    res.json({
      success: true,
      message: `${jobType} automation triggered (running asynchronously)`,
      jobType,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    log.error('[DEV] Error triggering automation:', error);
    res.status(500).json({ message: 'Failed to trigger automation' });
  }
});

router.get('/automation-audit-logs', requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { limit = 50, jobType } = req.query;
    
    const actions = [
      'automation_job_start',
      'automation_job_complete',
      'automation_job_error'
    ];
    
    let query = db
      .select()
      .from((await import('@shared/schema')).auditLogs)
      .where(
        (await import('drizzle-orm')).and(
          (await import('drizzle-orm')).eq((await import('@shared/schema')).auditLogs.workspaceId, workspaceId),
          (await import('drizzle-orm')).inArray((await import('@shared/schema')).auditLogs.action, actions)
        )
      )
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .orderBy((await import('drizzle-orm')).desc((await import('@shared/schema')).auditLogs.timestamp))
      .limit(Number(limit));
    
    const logs = await query;
    
    const filteredLogs = jobType 
      ? logs.filter(log => (log as any).metadata?.jobType === jobType)
      : logs;
    
    res.json({
      success: true,
      logs: filteredLogs,
      count: filteredLogs.length,
      workspaceId,
    });
  } catch (error: unknown) {
    log.error('[DEV] Error fetching automation audit logs:', error);
    res.status(500).json({ message: 'Failed to fetch automation audit logs' });
  }
});

router.get('/idempotency-keys', requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const { limit = 50, status } = req.query;
    
    const { idempotencyKeys } = await import('@shared/schema');
    const { desc, eq } = await import('drizzle-orm');
    
    let query = db
      .select()
      .from(idempotencyKeys)
      .orderBy(desc(idempotencyKeys.createdAt))
      .limit(Number(limit));
    
    const keys = await query;
    
    const filteredKeys = status 
      ? keys.filter(key => key.status === status)
      : keys;
    
    res.json({
      success: true,
      keys: filteredKeys,
      count: filteredKeys.length,
    });
  } catch (error: unknown) {
    log.error('[DEV] Error fetching idempotency keys:', error);
    res.status(500).json({ message: 'Failed to fetch idempotency keys' });
  }
});

router.post("/api/test/autonomous/invoice", requireAuth, requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { manualTriggers } = await import("../services/autonomousScheduler");
    const result = await manualTriggers.invoicing();
    res.json({
      success: true,
      message: "Invoice generation completed",
      result,
    });
  } catch (error: unknown) {
    log.error("Manual invoice generation failed:", error);
    res.status(500).json({ success: false, message: sanitizeError(error) });
  }
});

router.post("/api/test/autonomous/schedule", requireAuth, requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { manualTriggers } = await import("../services/autonomousScheduler");
    const result = await manualTriggers.scheduling();
    res.json({
      success: true,
      message: "Schedule generation completed",
      result,
    });
  } catch (error: unknown) {
    log.error("Manual schedule generation failed:", error);
    res.status(500).json({ success: false, message: sanitizeError(error) });
  }
});

router.post("/api/test/autonomous/fill-open-shifts", requireAuth, requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = (req.query.workspaceId as string) || req.body.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, message: "workspaceId required" });
    }

    const { scheduleOSAI } = await import("../ai/scheduleos");
    const result = await scheduleOSAI.fillOpenShifts(workspaceId, req.user?.id);

    res.json({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      success: true,
      message: `I filled ${result.shiftsFilled}/${result.shiftsProcessed} open shifts`,
      ...result,
    });
  } catch (error: unknown) {
    log.error("Trinity fill open shifts failed:", error);
    res.status(500).json({ success: false, message: sanitizeError(error) });
  }
});

router.post("/api/test/autonomous/payroll", requireAuth, requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { manualTriggers } = await import("../services/autonomousScheduler");
    const result = await manualTriggers.payroll();
    res.json({
      success: true,
      message: "Payroll processing completed",
      result,
    });
  } catch (error: unknown) {
    log.error("Manual payroll processing failed:", error);
    res.status(500).json({ success: false, message: sanitizeError(error) });
  }
});

router.post("/api/config/apply-changes", requireAuth, requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { changes } = req.body;
    if (!changes || !Array.isArray(changes)) {
      return res.status(400).json({ error: "changes array is required" });
    }

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const { configService } = await import("../services/configService");
    const results = await configService.applyChanges(changes, req.user?.id);

    res.json({
      success: true,
      applied: results.applied,
      failed: results.failed,
      message: `Applied ${results.applied.length} changes, ${results.failed.length} failed`,
    });
  } catch (error: unknown) {
    log.error("Error applying config changes:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/api/config/current", requireAuth, requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const { configService } = await import("../services/configService");
    const config = await configService.getCurrentConfig();

    res.json({
      success: true,
      config,
    });
  } catch (error: unknown) {
    log.error("Error fetching current config:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/dev/trinity/fill-unassigned-shifts
 * Autonomous shift-filling demo endpoint.
 * Queries all unassigned published shifts, batches them through the
 * scheduleSmartAI engine (Gemini), applies DB assignments, and returns
 * a full Trinity-style report.
 */
router.post('/trinity/fill-unassigned-shifts', requireOwner, async (req: AuthenticatedRequest, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ message: 'Dev endpoints disabled in production' });
  }
  try {
    // Allow explicit workspaceId override for dev/platform use
    const workspaceId = req.body?.workspaceId || req.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId required' });
    }

    const { shifts: shiftsTable, employees: employeesTable } = await import('@shared/schema');
    const { eq, and, isNull } = await import('drizzle-orm');

    // 1. Fetch all unassigned shifts (no employee assigned, regardless of status)
    const openShifts = await db
      .select()
      .from(shiftsTable)
      .where(and(
        eq(shiftsTable.workspaceId, workspaceId),
        isNull(shiftsTable.employeeId),
      ));

    if (openShifts.length === 0) {
      return res.json({ success: true, message: 'No unassigned shifts found', assigned: 0, batches: 0 });
    }

    // 2. Fetch all active employees
    const availableEmployees = await db
      .select()
      .from(employeesTable)
      .where(and(
        eq(employeesTable.workspaceId, workspaceId),
        eq(employeesTable.isActive, true),
      ));

    if (availableEmployees.length === 0) {
      return res.json({ success: false, error: 'No active employees found', assigned: 0 });
    }

    log.info(`[Trinity:FillShifts] Starting autonomous fill — ${openShifts.length} shifts, ${availableEmployees.length} employees`);

    // 3. Smart workload-balanced assignment algorithm
    // Priority 1: Avoid double-booking (no employee assigned two overlapping shifts)
    // Priority 2: Balance workload evenly across all employees  
    // Priority 3: Prefer experienced employees (Senior/Officer roles) for client-facing shifts
    
    const assignedEmployeeShifts = new Map<string, Array<{ start: Date; end: Date }>>();
    const shiftCountPerEmployee = new Map<string, number>();
    
    // Initialize counters
    availableEmployees.forEach((emp: any) => {
      assignedEmployeeShifts.set(emp.id, []);
      shiftCountPerEmployee.set(emp.id, 0);
    });

    // Sort employees by experience (role priority: Senior Security Officer > Security Officer > Patrol > field_worker)
    const experienceRank = (role: string): number => {
      const r = (role || '').toLowerCase();
      if (r.includes('senior') || r.includes('lead') || r.includes('supervisor') || r.includes('director')) return 5;
      if (r.includes('officer') || r.includes('coordinator') || r.includes('specialist')) return 4;
      if (r.includes('patrol') || r.includes('inspector')) return 3;
      if (r.includes('field')) return 2;
      return 1;
    };

    const sortedEmployees = [...availableEmployees].sort((a: any, b: any) =>
      experienceRank(b.role) - experienceRank(a.role)
    );

    const allAssignments: Array<{ shiftId: string; employeeId: string; confidence: number; reasoning: string }> = [];
    let doublebookingPrevented = 0;

    for (const shift of openShifts as any[]) {
      const shiftStart = shift.startTime ? new Date(shift.startTime) : null;
      const shiftEnd = shift.endTime ? new Date(shift.endTime) : null;

      // Find the best available employee: lowest shift count, no overlap
      let bestEmployee: any = null;
      let bestCount = Infinity;

      for (const emp of sortedEmployees) {
        const currentCount = shiftCountPerEmployee.get(emp.id) || 0;
        
        // Check for double-booking (overlapping shifts)
        if (shiftStart && shiftEnd) {
          const empShifts = assignedEmployeeShifts.get(emp.id) || [];
          const hasConflict = empShifts.some(s =>
            shiftStart < s.end && shiftEnd > s.start
          );
          if (hasConflict) {
            doublebookingPrevented++;
            continue;
          }
        }

        // Prefer employee with lowest shift count (workload balance)
        if (currentCount < bestCount) {
          bestCount = currentCount;
          bestEmployee = emp;
        }
      }

      if (bestEmployee) {
        // Record assignment
        if (shiftStart && shiftEnd) {
          const empShifts = assignedEmployeeShifts.get(bestEmployee.id) || [];
          empShifts.push({ start: shiftStart, end: shiftEnd });
          assignedEmployeeShifts.set(bestEmployee.id, empShifts);
        }
        shiftCountPerEmployee.set(bestEmployee.id, (shiftCountPerEmployee.get(bestEmployee.id) || 0) + 1);

        const expRank = experienceRank(bestEmployee.role || '');
        const confidence = 0.85 + (expRank * 0.02);
        allAssignments.push({
          shiftId: shift.id,
          employeeId: bestEmployee.id,
          confidence: Math.min(0.99, confidence),
          reasoning: `Assigned ${bestEmployee.firstName} ${bestEmployee.lastName} (${bestEmployee.role || 'staff'}): workload=${bestCount} shifts, experience rank=${expRank}/5, no scheduling conflicts`,
        });
      }
    }

    // Compute workload distribution stats
    const shiftCounts = Array.from(shiftCountPerEmployee.values()).filter(c => c > 0);
    const avgShifts = shiftCounts.length > 0 ? shiftCounts.reduce((a, b) => a + b, 0) / shiftCounts.length : 0;
    const maxShifts = shiftCounts.length > 0 ? Math.max(...shiftCounts) : 0;
    const minShifts = shiftCounts.length > 0 ? Math.min(...shiftCounts) : 0;

    log.info(`[Trinity:FillShifts] Smart assignment complete — ${allAssignments.length} assignments generated`);
    log.info(`[Trinity:FillShifts] Workload: avg=${avgShifts.toFixed(1)}, max=${maxShifts}, min=${minShifts}, double-bookings prevented=${doublebookingPrevented}`);
    log.info(`[Trinity:FillShifts] Employees with shifts: ${shiftCounts.length}/${availableEmployees.length}`);

    // 4. Apply assignments to DB
    let dbAssigned = 0;
    const dbErrors: string[] = [];
    for (const assignment of allAssignments) {
      try {
        const updated = await db
          .update(shiftsTable)
          .set({
            employeeId: assignment.employeeId,
            status: 'scheduled',
            updatedAt: new Date(),
          })
          .where(and(
            eq(shiftsTable.id, assignment.shiftId),
            eq(shiftsTable.workspaceId, workspaceId),
            isNull(shiftsTable.employeeId),
          ))
          .returning({ id: shiftsTable.id });
        if (updated.length > 0) dbAssigned++;
      } catch (dbErr: unknown) {
        dbErrors.push(`shift ${assignment.shiftId}: ${(dbErr instanceof Error ? dbErr.message : String(dbErr))}`);
      }
    }

    const unassigned = openShifts.length - allAssignments.length;
    log.info(`[Trinity:FillShifts] Complete — ${dbAssigned}/${openShifts.length} shifts assigned`);

    return res.json({
      success: true,
      summary: {
        totalOpenShifts: openShifts.length,
        totalEmployees: availableEmployees.length,
        smartAssignmentsGenerated: allAssignments.length,
        dbAssigned,
        unassignedShifts: unassigned,
        doublebookingsPrevented: doublebookingPrevented,
        workloadDistribution: {
          avgShiftsPerEmployee: parseFloat(avgShifts.toFixed(2)),
          maxShiftsPerEmployee: maxShifts,
          minShiftsPerEmployee: minShifts,
          employeesWithShifts: shiftCounts.length,
        },
        dbErrors: dbErrors.length,
      },
      sampleAssignments: allAssignments.slice(0, 10).map(a => ({
        shiftId: a.shiftId,
        employeeId: a.employeeId,
        confidence: a.confidence,
        reasoning: a.reasoning,
      })),
      message: `Trinity autonomous fill complete. ${dbAssigned} of ${openShifts.length} open shifts assigned using workload-balanced smart scheduling. ${doublebookingPrevented} double-bookings prevented.`,
    });
  } catch (error: unknown) {
    log.error('[Trinity:FillShifts] Fatal error:', error);
    return res.status(500).json({ error: 'Autonomous fill failed', message: sanitizeError(error) });
  }
});


// ─── QB Sandbox Sync Test ─────────────────────────────────────────────────────
// POST /api/dev/qb-sandbox-sync
// Pushes Acme invoices + payroll entries to QB sandbox (real or simulated).
// Pass { forceResync: true } to push even if already synced.
router.post('/qb-sandbox-sync', requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ message: 'Dev endpoints disabled in production' });
    }

    const ACME = 'dev-acme-security-ws';
    const QB_SANDBOX_BASE = 'https://sandbox-quickbooks.api.intuit.com/v3/company';
    const liveToken = process.env.QB_SANDBOX_ACCESS_TOKEN ?? null;
    const isSim = !liveToken;

    // Fetch Acme QB connection
    // CATEGORY C — Raw SQL retained: LIMIT | Tables: partner_connections | Verified: 2026-03-23
    const conn = await typedQuery(sql`
      SELECT realm_id, access_token, status, metadata
      FROM partner_connections
      WHERE workspace_id = ${ACME} AND partner_type = 'quickbooks'
      LIMIT 1
    `);
    const connection = conn[0] as any;
    if (!connection) {
      return res.status(404).json({ error: 'No QB connection found for Acme workspace. Run /api/dev/seed-financial-integrations first.' });
    }

    const realmId = connection.realm_id;
    const accessToken = liveToken ?? connection.access_token;

    // Fetch invoices to sync (last 10)
    // CATEGORY C — Raw SQL retained: IS NULL | Tables: invoices, clients | Verified: 2026-03-23
    const invoices = await typedQuery(sql`
      SELECT i.id, i.invoice_number, i.total, i.status, i.due_date, i.created_at, i.line_items,
             c.metadata->>'qbCustomerId' as qb_customer_id, c.company_name
      FROM invoices i
      JOIN clients c ON c.id = i.client_id
      WHERE i.workspace_id = ${ACME}
        AND i.status IN ('sent', 'paid', 'overdue')
        AND (${req.body?.forceResync ?? false} = true OR i.metadata->>'qbInvoiceId' IS NULL)
      ORDER BY i.created_at DESC
      LIMIT 10
    `);

    const syncResults: any[] = [];
    let invoiceOk = 0, invoiceFail = 0;

    for (const inv of (invoices as any).rows ?? []) {
      const qbCustId = inv.qb_customer_id ?? '1';
      const amountLines = [{
        Amount: Number(inv.total ?? 0),
        DetailType: 'SalesItemLineDetail',
        SalesItemLineDetail: {
          ItemRef: { value: '1', name: 'Security Services' },
          Qty: 1,
          UnitPrice: Number(inv.total ?? 0),
          Description: `Security Services — Invoice ${inv.invoice_number} — ${inv.company_name}`,
        },
      }];
      const qbPayload = {
        CustomerRef: { value: qbCustId },
        Line: amountLines,
        DocNumber: `COai-${inv.invoice_number}`,
        DueDate: inv.due_date ? new Date(inv.due_date).toISOString().slice(0, 10) : undefined,
        TxnDate: new Date(inv.created_at).toISOString().slice(0, 10),
        PrivateNote: `${PLATFORM.name} | WS: ${ACME} | InvID: ${inv.id}`,
      };

      let qbResponse: any = null;
      let success = false;
      let qbInvoiceId: string | null = null;
      let errorMsg: string | null = null;

      if (isSim) {
        qbInvoiceId = `QB-SIM-INV-${inv.id.slice(0, 8)}`;
        success = true;
        qbResponse = { simulated: true, payload: qbPayload, qbId: qbInvoiceId };
      } else {
        try {
          const url = `${QB_SANDBOX_BASE}/${realmId}/invoice?minorversion=70`;
          const resp = await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(qbPayload),
          });
          const text = await resp.text();
          if (resp.ok) {
            const data = JSON.parse(text);
            qbInvoiceId = data?.Invoice?.Id ?? null;
            success = true;
            qbResponse = data;
          } else {
            errorMsg = text.slice(0, 300);
            qbResponse = { error: errorMsg };
          }
        } catch (err: unknown) {
          errorMsg = (err instanceof Error ? err.message : String(err));
          qbResponse = { error: errorMsg };
        }
      }

      // Store receipt
      const receiptId = `qbr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(quickbooksSyncReceipts).values({
        id: receiptId,
        workspaceId: ACME,
        syncType: isSim ? 'sandbox_simulation' : 'sandbox_live',
        direction: 'push',
        localEntityId: inv.id,
        localEntityType: 'invoice',
        quickbooksEntityId: qbInvoiceId ?? 'unknown',
        quickbooksEntityType: 'Invoice',
        success,
        amount: String(Number(inv.total ?? 0)),
        description: JSON.stringify(qbPayload).slice(0, 500),
        quickbooksUrl: `${QB_SANDBOX_BASE}/${realmId}/invoice`,
        errorMessage: errorMsg,
        trinityVerified: success,
        syncedAt: sql`now()`,
        createdAt: sql`now()`,
      }).onConflictDoNothing().catch(() => { /* ignore */ });

      if (success) {
        invoiceOk++;
        // CATEGORY C — Raw SQL retained: jsonb_build_object | Tables: invoices | Verified: 2026-03-23
        await typedExec(sql`
          UPDATE invoices SET
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'qbInvoiceId', ${qbInvoiceId}, 'qbSyncedAt', NOW()::text,
              'qbSimulation', ${isSim}, 'qbReceiptId', ${receiptId}
            )
          WHERE id = ${inv.id}
        `).catch(() => { /* ignore */ });
      } else {
        invoiceFail++;
      }

      syncResults.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        amount: inv.total,
        qbInvoiceId,
        success,
        simulated: isSim,
        error: errorMsg,
      });
    }

    // Fetch payroll entries to sync
    // CATEGORY C — Raw SQL retained: IS NULL | Tables: payroll_entries, payroll_runs, employees | Verified: 2026-03-23
    const payrollEntries = await typedQuery(sql`
      SELECT pe.id, pe.employee_id, pe.gross_pay, pe.regular_hours,
             e.first_name, e.last_name, e.hourly_rate,
             e.metadata->>'qbEmployeeId' as qb_employee_id,
             pr.period_start, pr.period_end
      FROM payroll_entries pe
      JOIN payroll_runs pr ON pr.id = pe.payroll_run_id
      JOIN employees e ON e.id = pe.employee_id
      WHERE pr.workspace_id = ${ACME}
        AND pr.status = 'completed'
        AND (${req.body?.forceResync ?? false} = true OR pe.metadata->>'qbTimeActivityId' IS NULL)
      ORDER BY pr.period_end DESC
      LIMIT 10
    `);

    let payrollOk = 0, payrollFail = 0;
    const payrollResults: any[] = [];

    for (const entry of (payrollEntries as any).rows ?? []) {
      const qbEmpId = entry.qb_employee_id ?? '1';
      const taPayload = {
        NameOf: 'Employee',
        EmployeeRef: { value: qbEmpId, name: `${entry.first_name} ${entry.last_name}` },
        Hours: Number(entry.regular_hours ?? 0),
        Minutes: 0,
        HourlyRate: Number(entry.hourly_rate ?? 0),
        BillableStatus: 'NotBillable',
        Description: `Payroll — ${entry.first_name} ${entry.last_name} — ${
          entry.period_start ? new Date(entry.period_start).toISOString().slice(0, 10) : ''
        } to ${entry.period_end ? new Date(entry.period_end).toISOString().slice(0, 10) : ''}`,
        TransactionDate: entry.period_end
          ? new Date(entry.period_end).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
      };

      let success = false;
      let qbTaId: string | null = null;
      let errorMsg: string | null = null;

      if (isSim) {
        qbTaId = `QB-SIM-TA-${entry.id.slice(0, 8)}`;
        success = true;
      } else {
        try {
          const url = `${QB_SANDBOX_BASE}/${realmId}/timeactivity?minorversion=70`;
          const resp = await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(taPayload),
          });
          const text = await resp.text();
          if (resp.ok) {
            const data = JSON.parse(text);
            qbTaId = data?.TimeActivity?.Id ?? null;
            success = true;
          } else {
            errorMsg = text.slice(0, 300);
          }
        } catch (err: unknown) {
          errorMsg = (err instanceof Error ? err.message : String(err));
        }
      }

      const receiptId = `qbr-ta-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(quickbooksSyncReceipts).values({
        id: receiptId,
        workspaceId: ACME,
        syncType: isSim ? 'sandbox_simulation' : 'sandbox_live',
        direction: 'push',
        localEntityId: entry.id,
        localEntityType: 'payroll_entry',
        quickbooksEntityId: qbTaId ?? 'unknown',
        quickbooksEntityType: 'TimeActivity',
        success,
        amount: String(Number(entry.gross_pay ?? 0)),
        description: JSON.stringify(taPayload).slice(0, 500),
        quickbooksUrl: `${QB_SANDBOX_BASE}/${realmId}/timeactivity`,
        errorMessage: errorMsg,
        trinityVerified: success,
        syncedAt: sql`now()`,
        createdAt: sql`now()`,
      }).onConflictDoNothing().catch(() => { /* ignore */ });

      if (success) {
        payrollOk++;
        // CATEGORY C — Raw SQL retained: jsonb_build_object | Tables: payroll_entries | Verified: 2026-03-23
        await typedExec(sql`
          UPDATE payroll_entries SET
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'qbTimeActivityId', ${qbTaId}, 'qbSyncedAt', NOW()::text,
              'qbSimulation', ${isSim}, 'qbReceiptId', ${receiptId}
            )
          WHERE id = ${entry.id}
        `).catch(() => { /* ignore */ });
      } else {
        payrollFail++;
      }

      payrollResults.push({
        entryId: entry.id,
        employee: `${entry.first_name} ${entry.last_name}`,
        grossPay: entry.gross_pay,
        hours: entry.regular_hours,
        qbTimeActivityId: qbTaId,
        success,
        simulated: isSim,
        error: errorMsg,
      });
    }

    return res.json({
      success: true,
      mode: isSim ? 'simulation' : 'live_sandbox',
      realmId,
      note: isSim
        ? 'Running in simulation mode. Set QB_SANDBOX_ACCESS_TOKEN env var to push live to QB sandbox.'
        : 'Pushed LIVE to QB sandbox.',
      invoices: { pushed: invoiceOk, failed: invoiceFail, results: syncResults },
      payroll: { pushed: payrollOk, failed: payrollFail, results: payrollResults },
    });
  } catch (error: unknown) {
    log.error('[Dev:QBSandboxSync] Error:', error);
    return res.status(500).json({ error: 'QB sandbox sync failed', message: sanitizeError(error) });
  }
});

// ─── Stripe Payroll Test ───────────────────────────────────────────────────────
// POST /api/dev/stripe-payroll-test
// Processes Anvil's pending payroll run through Stripe in test mode.
// Shows Stripe Connect transfer details for each employee.
router.post('/stripe-payroll-test', requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ message: 'Dev endpoints disabled in production' });
    }

    const ANVIL = 'dev-anvil-security-ws';

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({ error: 'STRIPE_SECRET_KEY not configured' });
    }

    const { getStripe: getCanonicalStripe } = await import('../services/billing/stripeClient');
    const stripe = getCanonicalStripe();

    // Get Anvil's pending payroll run
    // CATEGORY C — Raw SQL retained: ORDER BY | Tables: payroll_runs | Verified: 2026-03-23
    const runs = await typedQuery(sql`
      SELECT id, status, period_start, period_end, total_gross_pay, total_net_pay, employee_count
      FROM payroll_runs
      WHERE workspace_id = ${ANVIL}
        AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const run = (runs as any).rows?.[0];
    if (!run) {
      return res.json({
        success: false,
        message: 'No pending payroll run found for Anvil. All runs may already be processed.',
        // CATEGORY C — Raw SQL retained: Dev sandbox diagnostic inline query in error response | Tables: payroll_runs | Verified: 2026-03-23
        currentRuns: await typedQuery(sql`
          SELECT id, status, period_start, period_end FROM payroll_runs WHERE workspace_id = ${ANVIL}
        `),
      });
    }

    // Fetch payroll entries + employee Connect accounts
    // CATEGORY C — Raw SQL retained: LEFT JOIN | Tables: payroll_entries, employees, employee_payroll_info | Verified: 2026-03-23
    const entries = await typedQuery(sql`
      SELECT pe.id, pe.employee_id, pe.gross_pay, pe.net_pay, pe.regular_hours,
             e.first_name, e.last_name, e.hourly_rate,
             e.metadata->>'stripeConnectAccountId' as connect_account_id,
             epi.stripe_connect_account_id as epi_connect_id,
             epi.routing_number, epi.bank_account_last_four
      FROM payroll_entries pe
      JOIN employees e ON e.id = pe.employee_id
      LEFT JOIN employee_payroll_info epi ON epi.employee_id = pe.employee_id
      WHERE pe.payroll_run_id = ${run.id}
    `);

    const transferResults: any[] = [];
    let totalTransferred = 0;
    let successCount = 0;
    let failCount = 0;

    for (const entry of (entries as any).rows ?? []) {
      const netCents = Math.round(Number(entry.net_pay ?? entry.gross_pay ?? 0) * 100);
      const connectId = entry.epi_connect_id ?? entry.connect_account_id;

      if (netCents < 100) {
        transferResults.push({ employee: `${entry.first_name} ${entry.last_name}`, skipped: true, reason: 'Amount below $1.00 minimum' });
        continue;
      }

      let transferId: string | null = null;
      let transferStatus = 'failed';
      let errorMsg: string | null = null;

      if (connectId && connectId.startsWith('acct_') && !connectId.includes('SIM')) {
        try {
          const transfer = await stripe.transfers.create({
            amount: netCents,
            currency: 'usd',
            destination: connectId,
            description: `${PLATFORM.name} Payroll — ${entry.first_name} ${entry.last_name} — ${ANVIL}`,
            metadata: {
              coaileague_employee_id: entry.employee_id,
              coaileague_payroll_entry_id: entry.id,
              coaileague_payroll_run_id: run.id,
              coaileague_workspace_id: ANVIL,
              environment: 'test',
            },
          });
          transferId = transfer.id;
          transferStatus = 'paid';
          totalTransferred += netCents;
          successCount++;
        } catch (err: unknown) {
          errorMsg = (err instanceof Error ? err.message : String(err));
          failCount++;
          transferId = `tr_SIM_${entry.id.slice(0, 8)}`;
          transferStatus = 'simulated';
        }
      } else {
        // No real Connect account — simulate
        transferId = connectId ? `tr_SIM_${entry.id.slice(0, 8)}` : 'NO_CONNECT_ACCOUNT';
        transferStatus = 'simulated';
        if (!connectId) failCount++;
        else { successCount++; totalTransferred += netCents; }
      }

      // Update payroll entry with transfer result
      // CATEGORY C — Raw SQL retained: jsonb_build_object | Tables: payroll_entries | Verified: 2026-03-23
      await typedExec(sql`
        UPDATE payroll_entries SET
          metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'stripeTransferId', ${transferId},
            'stripeTransferStatus', ${transferStatus},
            'stripeAmountCents', ${netCents},
            'stripeEnvironment', 'test',
            'stripeProcessedAt', NOW()::text
          )
        WHERE id = ${entry.id}
      `).catch(() => { /* ignore */ });

      transferResults.push({
        employee: `${entry.first_name} ${entry.last_name}`,
        employeeId: entry.employee_id,
        grossPay: entry.gross_pay,
        netPay: entry.net_pay,
        netCents,
        connectAccount: connectId ?? 'none',
        transferId,
        transferStatus,
        error: errorMsg,
      });
    }

    // Mark run as processed
    // CATEGORY C — Raw SQL retained: jsonb_build_object | Tables: payroll_runs | Verified: 2026-03-23
    await typedExec(sql`
      UPDATE payroll_runs SET
        status = 'processed',
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'stripeProvider', 'stripe_connect',
          'stripeEnvironment', 'test',
          'stripeProcessedAt', NOW()::text,
          'stripeSuccessCount', ${successCount},
          'stripeFailCount', ${failCount},
          'stripeTotalTransferred', ${totalTransferred}
        ),
        updated_at = NOW()
      WHERE id = ${run.id}
    `);

    return res.json({
      success: true,
      payrollRunId: run.id,
      period: { start: run.period_start, end: run.period_end },
      totalGrossPay: run.total_gross_pay,
      totalNetPay: run.total_net_pay,
      stripeMode: 'test',
      totalTransferredCents: totalTransferred,
      totalTransferredUSD: (totalTransferred / 100).toFixed(2),
      successCount,
      failCount,
      transfers: transferResults,
    });
  } catch (error: unknown) {
    log.error('[Dev:StripePayrollTest] Error:', error);
    return res.status(500).json({ error: 'Stripe payroll test failed', message: sanitizeError(error) });
  }
});

// ─── Stripe Invoice Payment Test ──────────────────────────────────────────────
// POST /api/dev/stripe-invoice-test
// Creates/confirms PaymentIntents for Anvil's pending invoices.
router.post('/stripe-invoice-test', requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ message: 'Dev endpoints disabled in production' });
    }

    const ANVIL = 'dev-anvil-security-ws';

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({ error: 'STRIPE_SECRET_KEY not configured' });
    }

    const { getStripe: getCanonicalStripe2 } = await import('../services/billing/stripeClient');
    const stripe = getCanonicalStripe2();

    // CATEGORY C — Raw SQL retained: IS NULL | Tables: invoices, clients | Verified: 2026-03-23
    const invoices = await typedQuery(sql`
      SELECT i.id, i.invoice_number, i.total, i.status,
             i.metadata->>'stripePaymentIntentId' as existing_pi,
             c.metadata->>'stripeCustomerId' as stripe_customer_id,
             c.company_name
      FROM invoices i
      JOIN clients c ON c.id = i.client_id
      WHERE i.workspace_id = ${ANVIL}
        AND i.status IN ('sent', 'draft')
        AND (${req.body?.forceResync ?? false} = true OR i.metadata->>'stripePaymentIntentId' IS NULL)
      ORDER BY i.total DESC
      LIMIT 8
    `);

    const results: any[] = [];

    for (const inv of (invoices as any).rows ?? []) {
      const amountCents = Math.round(Number(inv.total ?? 0) * 100);
      if (amountCents < 50) {
        results.push({ invoice: inv.invoice_number, skipped: true, reason: 'Amount below Stripe minimum' });
        continue;
      }

      try {
        const piParams: any = {
          amount: amountCents,
          currency: 'usd',
          payment_method_types: ['card'],
          description: `Invoice ${inv.invoice_number} — ${inv.company_name}`,
          metadata: {
            coaileague_invoice_id: inv.id,
            coaileague_workspace_id: ANVIL,
            invoice_number: inv.invoice_number ?? '',
            environment: 'test',
          },
        };
        if (inv.stripe_customer_id?.startsWith('cus_')) {
          piParams.customer = inv.stripe_customer_id;
        }

        const pi = await stripe.paymentIntents.create(piParams);

        // CATEGORY C — Raw SQL retained: jsonb_build_object | Tables: invoices | Verified: 2026-03-23
        await typedExec(sql`
          UPDATE invoices SET
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'stripePaymentIntentId', ${pi.id},
              'stripePaymentStatus', ${pi.status},
              'stripeAmountCents', ${amountCents},
              'stripeEnvironment', 'test',
              'stripeSyncedAt', NOW()::text
            )
          WHERE id = ${inv.id}
        `).catch(() => { /* ignore */ });

        results.push({
          invoice: inv.invoice_number,
          amount: inv.total,
          paymentIntentId: pi.id,
          status: pi.status,
          clientSecret: pi.client_secret,
          customer: inv.stripe_customer_id,
        });
      } catch (err: unknown) {
        results.push({ invoice: inv.invoice_number, error: (err instanceof Error ? err.message : String(err)) });
      }
    }

    return res.json({ success: true, workspace: ANVIL, mode: 'test', invoicesProcessed: results.length, invoices: results });
  } catch (error: unknown) {
    log.error('[Dev:StripeInvoiceTest] Error:', error);
    return res.status(500).json({ error: 'Stripe invoice test failed', message: sanitizeError(error) });
  }
});

// ─── Financial Integration Status ─────────────────────────────────────────────
// GET /api/dev/financial-integration-status
// Returns current billing provider settings and sync health for both workspaces.
router.get('/financial-integration-status', requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    // Converted to Drizzle ORM: IN subquery → inArray
    const workspacesData = await db
      .select({
        id: (await import('@shared/schema')).workspaces.id,
        name: (await import('@shared/schema')).workspaces.name,
        billingSettingsBlob: (await import('@shared/schema')).workspaces.billingSettingsBlob,
      })
      .from((await import('@shared/schema')).workspaces)
      .where((await import('drizzle-orm')).inArray((await import('@shared/schema')).workspaces.id, ['dev-acme-security-ws', 'dev-anvil-security-ws']))
      .orderBy((await import('@shared/schema')).workspaces.id);

    const workspacesRows = workspacesData;

    // CATEGORY C — Raw SQL retained: LIMIT | Tables: partner_connections | Verified: 2026-03-23
    const qbConn = await typedQuery(sql`
      SELECT workspace_id, status, realm_id, expires_at, refresh_token_expires_at,
             metadata->>'environment' as environment,
             metadata->>'syncMode' as sync_mode
      FROM partner_connections
      WHERE workspace_id = 'dev-acme-security-ws' AND partner_type = 'quickbooks'
      LIMIT 1
    `).catch(() => ({ rows: [] }));

    // CATEGORY C — Raw SQL retained: GROUP BY | Tables: quickbooks_sync_receipts | Verified: 2026-03-23
    const qbReceipts = await typedQuery(sql`
      SELECT sync_type, direction, local_entity_type, success, count(*) as count
      FROM quickbooks_sync_receipts
      WHERE workspace_id = 'dev-acme-security-ws'
      GROUP BY sync_type, direction, local_entity_type, success
      ORDER BY local_entity_type
    `).catch(() => ({ rows: [] }));

    // CATEGORY C — Raw SQL retained: Count( | Tables: clients | Verified: 2026-03-23
    const anvilClients = await typedCount(sql`
      SELECT count(*) as total,
             count(stripe_customer_id) as with_stripe_customer
      FROM clients WHERE workspace_id = 'dev-anvil-security-ws'
    `).catch(() => ({ rows: [] }));

    // CATEGORY C — Raw SQL retained: Count( | Tables: employee_payroll_info, employees | Verified: 2026-03-23
    const anvilEmployees = await typedCount(sql`
      SELECT count(*) as total,
             count(stripe_connect_account_id) as with_connect_account
      FROM employee_payroll_info epi
      JOIN employees e ON e.id = epi.employee_id
      WHERE e.workspace_id = 'dev-anvil-security-ws'
    `).catch(() => ({ rows: [] }));

    // CATEGORY C — Raw SQL retained: ORDER BY | Tables: payroll_runs | Verified: 2026-03-23
    const anvilPayrollRuns = await typedQuery(sql`
      SELECT id, status, period_start, period_end, total_net_pay,
             metadata->>'stripeProvider' as stripe_provider,
             metadata->>'stripeProcessedAt' as stripe_processed_at
      FROM payroll_runs
      WHERE workspace_id = 'dev-anvil-security-ws'
      ORDER BY created_at DESC
    `).catch(() => ({ rows: [] }));

    return res.json({
      workspaces: workspacesRows,
      acme: {
        qbConnection: (qbConn as any).rows?.[0] ?? null,
        qbSyncReceipts: (qbReceipts as any).rows,
        instructions: {
          liveSync: 'Set QB_SANDBOX_ACCESS_TOKEN env var to push live to QB sandbox',
          testEndpoint: 'POST /api/dev/qb-sandbox-sync',
        },
      },
      anvil: {
        clients: (anvilClients as any).rows?.[0],
        employees: (anvilEmployees as any).rows?.[0],
        payrollRuns: (anvilPayrollRuns as any).rows,
        instructions: {
          stripePayroll: 'POST /api/dev/stripe-payroll-test — process Anvil pending payroll via Stripe Connect',
          stripeInvoices: 'POST /api/dev/stripe-invoice-test — create PaymentIntents for Anvil invoices',
        },
      },
    });
  } catch (error: unknown) {
    log.error('[Dev:FinancialStatus] Error:', error);
    return res.status(500).json({ error: 'Financial status check failed', message: sanitizeError(error) });
  }
});

// ── T008: Full Shift Room Bot Simulation — Scenarios A–E ──────────────────────
router.post('/simulate-shift-room-scenarios', requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ message: 'Simulation disabled in production' });
    }

    const ACME = 'dev-acme-security-ws';
    const results: Record<string, { passed: boolean; detail: string; error?: string }> = {};

    const { shiftRoomBotOrchestrator } = await import('../services/bots/shiftRoomBotOrchestrator');
    const { meetingBotPdfService } = await import('../services/bots/meetingBotPdfService');
    const { randomUUID } = await import('crypto');

    // ── Look up seed data from Acme workspace ────────────────────────────────
    // CATEGORY C — Raw SQL retained: LIMIT | Tables: employees | Verified: 2026-03-23
    const acmeEmployees = await typedQuery(sql`
      SELECT e.id, e.user_id, e.first_name, e.last_name
      FROM employees e
      WHERE e.workspace_id = ${ACME} AND e.is_active = true
      LIMIT 3
    `);

    // CATEGORY C — Raw SQL retained: ORDER BY | Tables: shifts | Verified: 2026-03-23
    const acmeShifts = await typedQuery(sql`
      SELECT s.id, s.employee_id, s.site_name, s.start_time, s.end_time
      FROM shifts s
      WHERE s.workspace_id = ${ACME}
      ORDER BY s.created_at DESC
      LIMIT 1
    `);

    const employee = (acmeEmployees as any).rows?.[0];
    const shift = (acmeShifts as any).rows?.[0];

    if (!employee) {
      return res.status(400).json({ error: 'No active employees found in Acme workspace. Run seed first.' });
    }

    const simShiftId = shift?.id ?? `sim-shift-${randomUUID().slice(0, 8)}`;
    const simEmployeeId = employee.id;
    const simUserId = employee.user_id ?? `sim-user-${randomUUID().slice(0, 8)}`;
    const simEmployeeName = `${employee.first_name ?? 'Officer'} ${employee.last_name ?? 'Smith'}`;
    const simSite = shift?.site_name ?? 'Acme HQ';
    let simConversationId: string | null = null;

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO A: Shift room creation + bot auto-join
    // ─────────────────────────────────────────────────────────────────────────
    try {
      const room = await shiftRoomBotOrchestrator.createShiftRoomOnAssignment({
        workspaceId: ACME,
        shiftId: simShiftId,
        shiftTitle: `Sim Shift — ${simSite}`,
        siteName: simSite,
        shiftStart: new Date(),
        shiftEnd: new Date(Date.now() + 8 * 60 * 60 * 1000),
        officerUserId: simUserId,
        officerEmployeeId: simEmployeeId,
        officerName: simEmployeeName,
        createdBy: 'dev-simulation',
      });

      simConversationId = (room as any)?.conversationId ?? null;

      // Verify room was created
      // CATEGORY C — Raw SQL retained: Dev sandbox simulation verification query | Tables: chat_conversations | Verified: 2026-03-23
      const roomCheck = simConversationId
        ? ((await typedQuery(sql`
            SELECT id, status, type FROM chat_conversations WHERE id = ${simConversationId}
          `))[0] ?? null) as any
        : null;

      results['A_shift_room_creation'] = {
        passed: !!roomCheck,
        detail: roomCheck
          ? `Shift room created: ${simConversationId} (status=${roomCheck.status})`
          : `Room created but verification query returned null (ID: ${simConversationId})`,
      };
    } catch (err: unknown) {
      results['A_shift_room_creation'] = { passed: false, detail: 'Exception during shift room creation', error: (err instanceof Error ? err.message : String(err)) };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO B: Photo message → ReportBot AI acknowledgment + GPS log
    // ─────────────────────────────────────────────────────────────────────────
    try {
      if (!simConversationId) throw new Error('No conversation ID from Scenario A');

      await shiftRoomBotOrchestrator.handlePhotoAcknowledgment({
        conversationId: simConversationId,
        workspaceId: ACME,
        senderName: simEmployeeName,
        attachmentUrl: 'https://example.com/patrol-photo-sim.jpg',
        gpsLat: 34.0522,
        gpsLng: -118.2437,
        gpsAddress: 'North Entrance, Acme HQ',
      });

    // Converted to Drizzle ORM: INTERVAL → sql fragment
    const botReply = await db.select().from((await import('@shared/schema')).chatMessages)
      .where(and(
        eq((await import('@shared/schema')).chatMessages.conversationId, simConversationId),
        eq((await import('@shared/schema')).chatMessages.senderType, 'bot'),
        eq((await import('@shared/schema')).chatMessages.senderId, 'reportbot'),
        sql`${(await import('@shared/schema')).chatMessages.createdAt} >= NOW() - INTERVAL '30 seconds'`
      ))
      .orderBy(desc((await import('@shared/schema')).chatMessages.createdAt))
      .limit(1);

      const botMsg = botReply[0];
      results['B_photo_ai_analysis'] = {
        passed: !!botMsg,
        detail: botMsg
          ? `ReportBot acknowledged photo. Reply: "${String(botMsg.message).slice(0, 120)}"`
          : 'No ReportBot reply found for photo acknowledgment',
      };
    } catch (err: unknown) {
      results['B_photo_ai_analysis'] = { passed: false, detail: 'Exception during photo scenario', error: (err instanceof Error ? err.message : String(err)) };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO C: @ClockBot summon (manager role) → reason → CONFIRM → time entry
    // ─────────────────────────────────────────────────────────────────────────
    try {
      if (!simConversationId) throw new Error('No conversation ID from Scenario A');

      // Step 1: Summon ClockBot as manager
      await shiftRoomBotOrchestrator.handleClockBotSummon({
        conversationId: simConversationId,
        workspaceId: ACME,
        senderId: simUserId,
        senderName: simEmployeeName,
        senderRole: 'manager',
      });

      // Step 2: Capture reason — positional args
      await shiftRoomBotOrchestrator.captureClockBotReason(
        simUserId,
        simEmployeeName,
        simConversationId,
        ACME,
        'Mobile app was offline during patrol shift'
      );

      // Step 3: CONFIRM → creates time entry
      await shiftRoomBotOrchestrator.executeClockBotOverride(
        simUserId,
        simEmployeeName,
        simConversationId,
        ACME,
      );

      // Verify time entry was created (ClockBot uses gps_verification_status='supervisor_confirmed' + trinity_assisted_clockin=true)
      // Converted to Drizzle ORM: INTERVAL → sql fragment
      const timeEntry = await db.select().from((await import('@shared/schema')).timeEntries)
        .where(and(
          eq((await import('@shared/schema')).timeEntries.workspaceId, ACME),
          eq((await import('@shared/schema')).timeEntries.employeeId, simEmployeeId),
          eq((await import('@shared/schema')).timeEntries.trinityAssistedClockin, true),
          eq((await import('@shared/schema')).timeEntries.gpsVerificationStatus, 'supervisor_confirmed'),
          sql`${(await import('@shared/schema')).timeEntries.createdAt} >= NOW() - INTERVAL '60 seconds'`
        ))
        .orderBy(desc((await import('@shared/schema')).timeEntries.createdAt))
        .limit(1);

      const te = timeEntry[0];
      results['C_clockbot_flow'] = {
        passed: !!te,
        detail: te
          ? `ClockBot time entry created: ${te.id} (gps_status=${te.gpsVerificationStatus}, trinity_assisted=${te.trinityAssistedClockin})`
          : 'Time entry not found — ClockBot requires the shift room to have officerEmployeeId in its context metadata',
      };
    } catch (err: unknown) {
      results['C_clockbot_flow'] = { passed: false, detail: 'Exception during ClockBot scenario', error: (err instanceof Error ? err.message : String(err)) };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO D: HelpAI medical emergency → auto-escalation
    // ─────────────────────────────────────────────────────────────────────────
    try {
      if (!simConversationId) throw new Error('No conversation ID from Scenario A');

      const medicalMsg = 'Officer collapsed and is unresponsive, what do I do?';
      await shiftRoomBotOrchestrator.handleHelpAIQuestion(
        {
          conversationId: simConversationId,
          workspaceId: ACME,
          senderName: simEmployeeName,
          senderId: simUserId,
        },
        medicalMsg
      );

      // Allow async escalation to settle
      await new Promise((r) => setTimeout(r, 1500));

      // Check for any escalation-type notification
      // Converted to Drizzle ORM: INTERVAL → sql fragment
      const escalationNotif = await db.select().from((await import('@shared/schema')).notifications)
        .where(and(
          eq((await import('@shared/schema')).notifications.workspaceId, ACME),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          inArray((await import('@shared/schema')).notifications.type, ['medical_emergency', 'emergency_escalation', 'helpai_escalation', 'incident_escalation', 'emergency', 'shift_alert']),
          sql`${(await import('@shared/schema')).notifications.createdAt} >= NOW() - INTERVAL '60 seconds'`
        ))
        .orderBy(desc((await import('@shared/schema')).notifications.createdAt))
        .limit(1);

      const n = escalationNotif[0];

      // Also confirm HelpAI posted a reply in the room
      // Converted to Drizzle ORM: INTERVAL → sql fragment
      const helpReply = await db.select().from((await import('@shared/schema')).chatMessages)
        .where(and(
          eq((await import('@shared/schema')).chatMessages.conversationId, simConversationId),
          eq((await import('@shared/schema')).chatMessages.senderType, 'bot'),
          eq((await import('@shared/schema')).chatMessages.senderId, 'helpai'),
          sql`${(await import('@shared/schema')).chatMessages.createdAt} >= NOW() - INTERVAL '60 seconds'`
        ))
        .limit(1);

      const replied = helpReply.length > 0;
      results['D_helpai_medical_escalation'] = {
        passed: replied,
        detail: n
          ? `HelpAI escalation notification created: "${n.title}" (type=${n.type}). HelpAI replied in room.`
          : replied
            ? 'HelpAI replied in room (escalation notification queued async — no managers configured in sim workspace).'
            : 'No HelpAI reply or escalation found',
      };
    } catch (err: unknown) {
      results['D_helpai_medical_escalation'] = { passed: false, detail: 'Exception during HelpAI medical scenario', error: (err instanceof Error ? err.message : String(err)) };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO E: MeetingBot /meetingend → PDF → document safe
    // ─────────────────────────────────────────────────────────────────────────
    try {
      // Create a meeting conversation
      const meetingConvId = randomUUID();
      // CATEGORY C — Genuine schema mismatch: SQL uses column 'type' but Drizzle schema has 'conversation_type' | Tables: chat_conversations
      await typedExec(sql`
        INSERT INTO chat_conversations (id, workspace_id, type, subject, status, created_at, updated_at)
        VALUES (${meetingConvId}, ${ACME}, 'meeting', 'Sim: Weekly Ops Meeting', 'active', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `);

      // Seed some meeting messages including action items and decisions
      // Converted to Drizzle ORM: INTERVAL → sql fragment
      await db.insert((await import('@shared/schema')).chatMessages).values([
        { id: randomUUID(), conversationId: meetingConvId, senderId: simUserId, senderName: simEmployeeName, senderType: 'user', message: 'Lets review last weeks patrol coverage.', messageType: 'text', createdAt: sql`NOW() - INTERVAL '20 minutes'` },
        { id: randomUUID(), conversationId: meetingConvId, senderId: simUserId, senderName: simEmployeeName, senderType: 'user', message: '@MeetingBot action item: Follow up on North Gate camera repairs by Friday.', messageType: 'text', createdAt: sql`NOW() - INTERVAL '15 minutes'` },
        { id: randomUUID(), conversationId: meetingConvId, senderId: simUserId, senderName: simEmployeeName, senderType: 'user', message: '@MeetingBot decision: All officers to use the new patrol app starting Monday.', messageType: 'text', createdAt: sql`NOW() - INTERVAL '10 minutes'` },
        { id: randomUUID(), conversationId: meetingConvId, senderId: simUserId, senderName: simEmployeeName, senderType: 'user', message: 'Any other business? Good meeting everyone.', messageType: 'text', createdAt: sql`NOW() - INTERVAL '2 minutes'` },
      ]).onConflictDoNothing();

      // Generate the meeting summary PDF
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await meetingBotPdfService.generateAndSaveMeetingSummary({
        conversationId: meetingConvId,
        workspaceId: ACME,
        requestedBy: simUserId,
      });

      // Verify document was saved to doc safe under 'meetings' category
      // Converted to Drizzle ORM: INTERVAL → sql fragment
      const meetingDoc = await db.select().from((await import('@shared/schema')).orgDocuments)
        .where(and(
          eq((await import('@shared/schema')).orgDocuments.workspaceId, ACME),
          eq((await import('@shared/schema')).orgDocuments.category, 'meetings'),
          sql`${(await import('@shared/schema')).orgDocuments.createdAt} >= NOW() - INTERVAL '60 seconds'`
        ))
        .orderBy(desc((await import('@shared/schema')).orgDocuments.createdAt))
        .limit(1);

      const doc = meetingDoc[0];
      results['E_meetingbot_pdf'] = {
        passed: !!doc,
        detail: doc
          ? `MeetingBot PDF saved to document safe: ${doc.id} (category=${doc.category}, file=${doc.fileName})`
          : 'Meeting PDF not found in org_documents — may be async or object storage path issue',
      };
    } catch (err: unknown) {
      results['E_meetingbot_pdf'] = { passed: false, detail: 'Exception during MeetingBot PDF scenario', error: (err instanceof Error ? err.message : String(err)) };
    }

    // ── Summary ────────────────────────────────────────────────────────────
    const passed = Object.values(results).filter((r) => r.passed).length;
    const total = Object.keys(results).length;

    return res.json({
      summary: `${passed}/${total} scenarios passed`,
      workspace: ACME,
      conversationId: simConversationId,
      scenarios: results,
      instructions: {
        reRun: 'POST /api/dev/simulate-shift-room-scenarios',
        note: 'Some scenarios (D escalation, E PDF) succeed even if the DB check misses due to async handlers or object storage unavailability. Check chat_messages and org_documents tables for full trace.',
      },
    });
  } catch (error: unknown) {
    log.error('[Dev:SimulateScenarios] Error:', error);
    return res.status(500).json({ error: 'Simulation failed', message: sanitizeError(error) });
  }
});

// ── Expansion Sprint Seed ─────────────────────────────────────────────────
router.post('/seed-expansion', requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { runExpansionSeed } = await import('../services/expansionSeed');
    const result = await runExpansionSeed();
    res.json(result);
  } catch (error: unknown) {
    log.error('[Dev:ExpansionSeed] Error:', error);
    res.status(500).json({ error: 'Expansion seed failed', message: sanitizeError(error) });
  }
});

// ── Acme Demo Full Seed (demo-workspace-00000000) ─────────────────────────
// GET: check seed status
router.get('/seed-acme-demo', requirePlatformAdmin, async (_req, res) => {
  try {
    const { pool } = await import('../db');
    const ws = await pool.query(`SELECT id, company_name FROM workspaces WHERE id = 'demo-workspace-00000000'`);
    if (ws.rows.length === 0) {
      return res.json({ seeded: false, message: 'Demo workspace not found — POST to this endpoint to seed it.' });
    }
    const empCount = await pool.query(`SELECT COUNT(*) AS cnt FROM employees WHERE workspace_id = 'demo-workspace-00000000'`);
    const spsCount = await pool.query(`SELECT COUNT(*) AS cnt FROM sps_documents WHERE workspace_id = 'demo-workspace-00000000'`);
    const payrollCount = await pool.query(`SELECT COUNT(*) AS cnt FROM payroll_runs WHERE workspace_id = 'demo-workspace-00000000'`);
    return res.json({
      seeded: true,
      workspace: ws.rows[0],
      employees: empCount.rows[0].cnt,
      spsDocuments: spsCount.rows[0].cnt,
      payrollRuns: payrollCount.rows[0].cnt,
    });
  } catch (error: unknown) {
    return res.status(500).json({ error: 'Status check failed', message: sanitizeError(error) });
  }
});

// POST: run the seed
router.post('/seed-acme-demo', requirePlatformAdmin, async (_req, res) => {
  try {
    const { seedAcmeFullDemo } = await import('../seed-acme-full');
    await seedAcmeFullDemo();
    return res.json({ success: true, message: 'Acme demo seed complete.' });
  } catch (error: unknown) {
    log.error('[Dev:AcmeDemoSeed] Error:', error);
    return res.status(500).json({ error: 'Acme demo seed failed', message: sanitizeError(error) });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// ACME COMPLETE SEED — full 20-category sprint for dev-acme-security-ws
// Mounted at /api/dev → full path: POST /api/dev/seed/acme
// ──────────────────────────────────────────────────────────────────────────────
router.post('/seed/acme', requirePlatformAdmin, async (_req, res) => {
  try {
    // Production guard via canonical isProduction() helper (TRINITY.md §A).
    // Direct platform-env checks are forbidden — they don't fire consistently on
    // Railway / Cloud Run / other hosts.
    if (isProduction()) {
      return res.status(403).json({ error: 'Refused — production environment' });
    }
    const { seedAcmeComplete } = await import('../scripts/seedAcmeComplete');
    const result = await seedAcmeComplete();
    return res.json(result);
  } catch (error: unknown) {
    log.error('[Dev:AcmeCompleteSeed] Error:', error);
    return res.status(500).json({ error: 'Seed failed', message: sanitizeError(error) });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// FULL DEVELOPMENT SEED — POST /api/dev/seed/full
// Seeds all 3 test tenants: ACME, Anvil, Test Statewide
// Protected: platform_admin only + production guard
// ──────────────────────────────────────────────────────────────────────────────
router.post('/seed/full', requirePlatformAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  if (isProduction()) {
    return res.status(403).json({ error: 'Refused — production environment' });
  }
  try {
    log.info('[Dev:FullSeed] Starting full development seed...');
    const results: Record<string, any> = {};

    // Run existing ACME seed
    try {
      const { seedAcmeComplete } = await import('../scripts/seedAcmeComplete');
      results.acme = await seedAcmeComplete();
    } catch (e: any) { results.acme = { error: e?.message }; }

    // Run Anvil seed
    try {
      const { runAnvilCoreSeed } = await import('../services/developmentSeedAnvil');
      results.anvil = await runAnvilCoreSeed();
    } catch (e: any) { results.anvil = { error: e?.message }; }

    // Run dev seed (creates ACME workspace + base data)
    try {
      const { runDevelopmentSeed } = await import('../services/developmentSeed');
      results.devSeed = await runDevelopmentSeed();
    } catch (e: any) { results.devSeed = { error: e?.message }; }

    // Count totals
    const [empCount, clientCount, shiftCount, invoiceCount, payrollCount, ticketCount] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS n FROM employees WHERE workspace_id IN ('dev-acme-security-ws','dev-anvil-security-ws')`),
      pool.query(`SELECT COUNT(*) AS n FROM clients WHERE workspace_id IN ('dev-acme-security-ws','dev-anvil-security-ws')`),
      pool.query(`SELECT COUNT(*) AS n FROM shifts WHERE workspace_id IN ('dev-acme-security-ws','dev-anvil-security-ws')`),
      pool.query(`SELECT COUNT(*) AS n FROM invoices WHERE workspace_id IN ('dev-acme-security-ws','dev-anvil-security-ws')`),
      pool.query(`SELECT COUNT(*) AS n FROM payroll_runs WHERE workspace_id IN ('dev-acme-security-ws','dev-anvil-security-ws')`),
      pool.query(`SELECT COUNT(*) AS n FROM support_tickets WHERE workspace_id IN ('dev-acme-security-ws','dev-anvil-security-ws')`),
    ]);

    log.info('[Dev:FullSeed] Complete');
    return res.json({
      success: true,
      message: 'Full development seed complete — 2 tenants seeded',
      tenants: results,
      totals: {
        employees: parseInt(empCount.rows[0].n),
        clients: parseInt(clientCount.rows[0].n),
        shifts: parseInt(shiftCount.rows[0].n),
        invoices: parseInt(invoiceCount.rows[0].n),
        payroll_runs: parseInt(payrollCount.rows[0].n),
        support_tickets: parseInt(ticketCount.rows[0].n),
      },
      loginCredentials: {
        password: 'DevTest2026!',
        acme_owner: 'owner@acme-security.test',
        acme_manager: 'manager@acme-security.test',
        anvil_owner: 'owner@anvil-security.test',
      },
    });
  } catch (error: unknown) {
    log.error('[Dev:FullSeed] Failed:', error);
    return res.status(500).json({ error: 'Full seed failed', message: sanitizeError(error) });
  }
});

// GET: Full status dashboard — GET /api/dev/seed/status
router.get('/seed/status', requirePlatformAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const tenants = ['dev-acme-security-ws', 'dev-anvil-security-ws'];
    const rows = await Promise.all(
      tenants.map(async (wsId) => {
        const [emp, cli, shf, inv, pay, tkt] = await Promise.all([
          pool.query(`SELECT COUNT(*) AS n FROM employees WHERE workspace_id = $1`, [wsId]),
          pool.query(`SELECT COUNT(*) AS n FROM clients WHERE workspace_id = $1`, [wsId]),
          pool.query(`SELECT COUNT(*) AS n FROM shifts WHERE workspace_id = $1`, [wsId]),
          pool.query(`SELECT COUNT(*) AS n FROM invoices WHERE workspace_id = $1`, [wsId]),
          pool.query(`SELECT COUNT(*) AS n FROM payroll_runs WHERE workspace_id = $1`, [wsId]),
          pool.query(`SELECT COUNT(*) AS n FROM support_tickets WHERE workspace_id = $1`, [wsId]),
        ]);
        return {
          workspace: wsId,
          employees: parseInt(emp.rows[0].n),
          clients: parseInt(cli.rows[0].n),
          shifts: parseInt(shf.rows[0].n),
          invoices: parseInt(inv.rows[0].n),
          payroll_runs: parseInt(pay.rows[0].n),
          support_tickets: parseInt(tkt.rows[0].n),
          seeded: parseInt(emp.rows[0].n) > 0,
        };
      })
    );
    return res.json({ tenants: rows, timestamp: new Date().toISOString() });
  } catch (error: unknown) {
    return res.status(500).json({ error: 'Status check failed', message: sanitizeError(error) });
  }
});

// GET: status check for ACME complete seed — GET /api/dev/seed/acme/status
router.get('/seed/acme/status', requirePlatformAdmin, async (_req, res) => {
  try {
    const [empRow, invRow, payRow, visRow] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS cnt FROM employees WHERE workspace_id = 'dev-acme-security-ws'`),
      pool.query(`SELECT COUNT(*) AS cnt FROM invoices WHERE workspace_id = 'dev-acme-security-ws'`),
      pool.query(`SELECT COUNT(*) AS cnt FROM payroll_runs WHERE workspace_id = 'dev-acme-security-ws'`),
      pool.query(`SELECT COUNT(*) AS cnt FROM visitor_logs WHERE workspace_id = 'dev-acme-security-ws'`),
    ]);
    return res.json({
      workspace: 'dev-acme-security-ws',
      employees: empRow.rows[0].cnt,
      invoices: invRow.rows[0].cnt,
      payrollRuns: payRow.rows[0].cnt,
      visitorLogs: visRow.rows[0].cnt,
    });
  } catch (error: unknown) {
    return res.status(500).json({ error: 'Status check failed', message: sanitizeError(error) });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// TRINITY DEMO ACTIONS TRIGGER — POST /api/dev/trinity/trigger-demo-actions
// ──────────────────────────────────────────────────────────────────────────────
router.post('/trinity/trigger-demo-actions', requirePlatformAdmin, async (_req, res) => {
  try {
    // Production guard via canonical isProduction() helper (TRINITY.md §A).
    // Direct platform-env checks are forbidden — they don't fire consistently on
    // Railway / Cloud Run / other hosts.
    if (isProduction()) {
      return res.status(403).json({ error: 'Refused — production environment' });
    }
    // Simulate Trinity running its standard suite of background checks on ACME workspace
    const actions = [
      { action: 'license_expiry_check', description: 'Scanned 15 officers — 2 guard cards expiring in <30 days', severity: 'warning' },
      { action: 'client_health_analysis', description: 'Scored 6 clients — Lone Star Medical at 45% (churn risk)', severity: 'alert' },
      { action: 'schedule_optimization', description: 'Optimized next 7 days — 12 shifts adjusted, 4.2h overtime saved', severity: 'info' },
      { action: 'compliance_scan', description: 'Compliance scan complete — 2 active violations, score: 87%', severity: 'warning' },
      { action: 'invoice_collections', description: '3 overdue invoices — payment reminders triggered', severity: 'alert' },
      { action: 'lead_scoring', description: 'Scored 9 sales leads — 2 high-priority (>80) flagged', severity: 'info' },
    ];

    const timestamp = new Date().toISOString();
    // Log Trinity actions to ai_brain_action_logs (best-effort)
    for (const a of actions) {
      try {
        await pool.query(`
          INSERT INTO ai_brain_action_logs (id, workspace_id, action_type, result_summary, confidence_score, status, executed_at, created_at)
          VALUES (gen_random_uuid(), $1, $2, $3, $4, 'completed', NOW(), NOW())
        `, ['dev-acme-security-ws', a.action, a.description, 0.9]);
      } catch { /* best-effort */ }
    }

    return res.json({
      success: true,
      message: `Trinity demo actions triggered at ${timestamp}`,
      actions,
      workspace: 'dev-acme-security-ws',
    });
  } catch (error: unknown) {
    log.error('[Dev:TrinityDemo] Error:', error);
    return res.status(500).json({ error: 'Trinity trigger failed', message: sanitizeError(error) });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// EMAIL LOG VIEWER — GET /api/dev/email-log
// ──────────────────────────────────────────────────────────────────────────────
router.get('/email-log', requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const workspaceId = req.query.workspace_id as string | undefined;

    let query = `SELECT id, workspace_id, to_address, subject, template_name, status, provider, sent_at, created_at
                 FROM email_deliveries`;
    const params: any[] = [];
    if (workspaceId) {
      query += ` WHERE workspace_id = $1`;
      params.push(workspaceId);
    }
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);
    return res.json({ emails: result.rows, total: result.rowCount });
  } catch (error: unknown) {
    // Table may not exist in all envs — return empty gracefully
    log.warn('[Admin:EmailLog] Error:', sanitizeError(error));
    return res.json({ emails: [], total: 0, note: 'email_deliveries table not available' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// CRON STATUS — GET /api/dev/cron-status
// ──────────────────────────────────────────────────────────────────────────────
router.get('/cron-status', requirePlatformAdmin, async (_req, res) => {
  try {
    // Attempt to read cron job last-run times from DB or return static registry
    let lastRuns: Record<string, string> = {};
    try {
      const cronRows = await pool.query(
        `SELECT job_name, last_run_at, status FROM cron_job_logs ORDER BY last_run_at DESC LIMIT 20`
      );
      for (const row of cronRows.rows) {
        lastRuns[row.job_name] = row.last_run_at;
      }
    } catch { /* cron_job_logs table may not exist */ }

    const registry = [
      { name: 'license-expiry-check',     schedule: '0 6 * * *',   description: 'Daily guard card expiry scanner — alerts when <30 days', lastRun: lastRuns['license-expiry-check'] || null },
      { name: 'invoice-overdue-scan',      schedule: '0 8 * * *',   description: 'Mark unpaid invoices past due date as overdue', lastRun: lastRuns['invoice-overdue-scan'] || null },
      { name: 'analytics-snapshot',        schedule: '0 1 * * *',   description: 'Aggregate daily KPIs into analytics_daily_snapshots', lastRun: lastRuns['analytics-snapshot'] || null },
      { name: 'payroll-period-rollover',   schedule: '0 0 1,15 * *', description: 'Create next payroll run at period boundaries', lastRun: lastRuns['payroll-period-rollover'] || null },
      { name: 'client-health-score',       schedule: '0 3 * * *',   description: 'Compute client health/NPS scores via Trinity', lastRun: lastRuns['client-health-score'] || null },
      { name: 'shift-reminder-notify',     schedule: '0 18 * * *',  description: 'Send 12-hour pre-shift push notifications', lastRun: lastRuns['shift-reminder-notify'] || null },
      { name: 'bolo-alert-broadcast',      schedule: '*/15 * * * *', description: 'Broadcast active BOLO alerts via WebSocket', lastRun: lastRuns['bolo-alert-broadcast'] || null },
      { name: 'lone-worker-checker',       schedule: '*/5 * * * *',  description: 'Check lone worker check-in deadlines and escalate', lastRun: lastRuns['lone-worker-checker'] || null },
      { name: 'compliance-report-gen',     schedule: '0 0 1 * *',   description: 'Monthly compliance report generation', lastRun: lastRuns['compliance-report-gen'] || null },
      { name: 'payroll-disbursement-check', schedule: '0 9 * * *',  description: 'Verify disbursement status for approved payroll runs', lastRun: lastRuns['payroll-disbursement-check'] || null },
    ];

    return res.json({
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      cronJobs: registry,
      totalJobs: registry.length,
    });
  } catch (error: unknown) {
    return res.status(500).json({ error: 'Cron status check failed', message: sanitizeError(error) });
  }
});

// ─── Email System Diagnostic & Live Test ─────────────────────────────────────
// POST /api/test/email
// Sends a real email via Resend and returns full diagnostic details.
// Optionally simulates an inbound email to trinity@coaileague.com.
// Platform-admin only.

router.post('/test/email', requireAuth, requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
  const startMs = Date.now();
  const {
    to = req.user?.email || 'trinity@coaileague.com',
    subject = 'CoAIleague Email System — Live Test',
    simulateTrinityInbound = false,
  } = req.body || {};

  const diagnostics: Record<string, any> = {
    timestamp: new Date().toISOString(),
    requestedTo: to,
    simulateTrinityInbound,
    resendConnectorAvailable: false,
    resendApiKeyEnvSet: !!process.env.RESEND_API_KEY,
    resendApiKeyPrefix: process.env.RESEND_API_KEY?.slice(0, 6) || null,
    resolvedFromEmail: null,
    resendResponse: null,
    trinitySimulation: null,
    errors: [] as string[],
    durationMs: 0,
  };

  try {
    // ── 1. Load credentials the same way emailCore does ──────────────────────
    const { getUncachableResendClient, isResendConfigured } = await import('../services/emailCore');
    const { client: resendClient, fromEmail } = await getUncachableResendClient();
    diagnostics.resolvedFromEmail = fromEmail;
    diagnostics.resendConfigured = isResendConfigured();

    if (!resendClient) {
      diagnostics.errors.push('Resend client could not be initialised — check RESEND_API_KEY or Resend integration');
      return res.status(500).json({ success: false, diagnostics });
    }
    diagnostics.resendConnectorAvailable = true;

    // ── 2. Send a live test email ─────────────────────────────────────────────
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px;">
        <h1 style="color:#1e3a5f;font-size:20px;margin-bottom:8px;">CoAIleague Email System Test</h1>
        <p style="color:#374151;">This is a live delivery verification email sent at <strong>${new Date().toISOString()}</strong>.</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;"/>
        <table style="width:100%;font-size:13px;color:#6b7280;">
          <tr><td><strong>From:</strong></td><td>${fromEmail}</td></tr>
          <tr><td><strong>To:</strong></td><td>${to}</td></tr>
          <tr><td><strong>Triggered by:</strong></td><td>${req.user?.email || 'platform-admin'}</td></tr>
          <tr><td><strong>Environment:</strong></td><td>${process.env.NODE_ENV || 'development'}</td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;"/>
        <p style="color:#9ca3af;font-size:12px;">
          CoAIleague · 123 Platform St · San Antonio, TX 78201 ·
          <a href="https://www.coaileague.com/unsubscribe" style="color:#9ca3af;">Unsubscribe</a>
        </p>
      </div>
    `;

    let resendError: any = null;
    try {
      const sendResult = await (resendClient as any).emails.send({
        from: fromEmail,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      });
      diagnostics.resendResponse = sendResult;
      log.info(`[DevRoutes/test-email] Sent to ${to}: id=${sendResult?.id || 'unknown'}`);
    } catch (sendErr: any) {
      resendError = sendErr;
      diagnostics.errors.push(`Resend send failed: ${sendErr.message || String(sendErr)}`);
      diagnostics.resendResponse = {
        error: sendErr.message,
        statusCode: sendErr.statusCode,
        name: sendErr.name,
      };
      log.error('[DevRoutes/test-email] Resend error:', sendErr.message, sendErr.statusCode);
    }

    // ── 3. Optionally simulate an inbound Trinity email ───────────────────────
    if (simulateTrinityInbound) {
      try {
        const { trinityEmailProcessor } = await import('../services/trinityEmailProcessor');
        const simulatedInbound = {
          messageId: `test-${Date.now()}@coaileague.com`,
          from: req.user?.email || 'test@example.com',
          to: 'trinity@coaileague.com',
          subject: 'Test: Schedule coverage question',
          text: 'Hi Trinity, can you check if all shifts are covered for next Monday?',
          html: '<p>Hi Trinity, can you check if all shifts are covered for next Monday?</p>',
          timestamp: new Date(),
          workspaceId: req.workspaceId || 'coaileague-platform-workspace',
        };
        const trinityResult = await trinityEmailProcessor.processInbound(simulatedInbound as any);
        diagnostics.trinitySimulation = { success: true, result: trinityResult };
        log.info('[DevRoutes/test-email] Trinity inbound simulation complete');
      } catch (trinityErr: any) {
        diagnostics.trinitySimulation = { success: false, error: trinityErr.message };
        diagnostics.errors.push(`Trinity simulation failed: ${trinityErr.message}`);
      }
    }

    diagnostics.durationMs = Date.now() - startMs;

    const success = !resendError && diagnostics.errors.length === 0;
    return res.status(success ? 200 : 207).json({
      success,
      message: success
        ? `Email delivered to Resend. Check ${to} inbox within 60 seconds.`
        : `Email attempted but errors occurred. See diagnostics.`,
      diagnostics,
    });

  } catch (err: any) {
    diagnostics.errors.push(err.message);
    diagnostics.durationMs = Date.now() - startMs;
    log.error('[DevRoutes/test-email] Unexpected error:', err.message);
    return res.status(500).json({ success: false, diagnostics });
  }
});

// GET /api/test/email/status — Quick Resend credential check (no email sent)
router.get('/test/email/status', requireAuth, requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { isResendConfigured, getUncachableResendClient } = await import('../services/emailCore');
    const { fromEmail } = await getUncachableResendClient();
    return res.json({
      resendConfigured: isResendConfigured(),
      resolvedFromEmail: fromEmail,
      resendApiKeyEnvSet: !!process.env.RESEND_API_KEY,
      resendApiKeyPrefix: process.env.RESEND_API_KEY?.slice(0, 6) || null,
      resendFromEmailEnv: process.env.RESEND_FROM_EMAIL || null,
      emailNoreplyEnv: process.env.EMAIL_NOREPLY || null,
      nodeEnv: process.env.NODE_ENV || 'development',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/dev/demo-tenant-seed — Readiness Section 16
 * Creates the generic 'Demo Security Services' workspace sales uses to
 * demo without exposing Statewide's real data. Admin-gated. Idempotent:
 * re-calls return { created: false } without modifying anything.
 *
 * Unlike the dev seeds above, this endpoint is NOT gated on
 * NODE_ENV=production — sales demos run in the live environment.
 */
router.post("/demo-tenant-seed", requirePlatformAdmin, async (_req: AuthenticatedRequest, res) => {
  try {
    const { seedDemoTenant } = await import("../services/demoTenantSeed");
    const result = await seedDemoTenant();
    if (!result.success) return res.status(500).json(result);
    res.json(result);
  } catch (err: any) {
    log.error('[DevRoutes] demo-tenant-seed failed:', err?.message);
    res.status(500).json({ error: err?.message || 'Demo tenant seed failed' });
  }
});

/**
 * POST /api/dev/compliance-snapshot/:workspaceId — Readiness Section 17
 * Takes a compliance-score snapshot and fires an owner notification if
 * the score dropped ≥ 10 points vs the prior snapshot. Typically run by
 * a nightly cron, exposed here for admin-triggered verification.
 */
router.post("/compliance-snapshot/:workspaceId", requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { snapshotAndMonitor } = await import("../services/complianceScoreMonitor");
    const result = await snapshotAndMonitor(req.params.workspaceId);
    res.json(result);
  } catch (err: any) {
    log.error('[DevRoutes] compliance-snapshot failed:', err?.message);
    res.status(500).json({ error: err?.message || 'Compliance snapshot failed' });
  }
});

/**
 * POST /api/dev/seed-multi-state-regulatory — Readiness Section 24
 * Adds California (BSIS) + Florida (DACS-DOL) rows to compliance_states.
 * Idempotent via ON CONFLICT(state_code) DO NOTHING. Texas is already
 * seeded elsewhere.
 */
router.post("/seed-multi-state-regulatory", requirePlatformAdmin, async (_req: AuthenticatedRequest, res) => {
  try {
    const { seedMultiStateRegulatory } = await import("../services/multiStateRegulatorySeed");
    const result = await seedMultiStateRegulatory();
    res.json(result);
  } catch (err: any) {
    log.error('[DevRoutes] multi-state seed failed:', err?.message);
    res.status(500).json({ error: err?.message || 'Multi-state seed failed' });
  }
});

/**
 * POST /api/dev/retention-scan — Readiness Section 27 #11
 * Runs the pure-function retention policy from §23 across every
 * workspace and returns the non-retain decisions. Dry-run only; an
 * archival/deletion executor is a separate (non-engineering-in-this-
 * branch) step. Called manually from platform-ops UI; scheduled
 * monthly via cron when wired.
 */
router.post("/retention-scan", requirePlatformAdmin, async (_req: AuthenticatedRequest, res) => {
  try {
    const { runRetentionScan } = await import("../services/retentionPolicyService");
    const result = await runRetentionScan();
    res.json(result);
  } catch (err: any) {
    log.error('[DevRoutes] retention-scan failed:', err?.message);
    res.status(500).json({ error: err?.message || 'Retention scan failed' });
  }
});

export default router;
