import { Router } from "express";
import { randomUUID } from 'crypto';
import type { AuthenticatedRequest } from "../rbac";
import { requireAuth, requireOwner, requireManager, hasManagerAccess, hasPlatformWideAccess } from "../rbac";
import { db } from "../db";
import { eq, and, desc, isNull } from "drizzle-orm";
import {
  payStubs,
  payrollRuns,
  payrollEntries,
  payrollProviderConnections,
  employees,
  timeEntries,
  workspaces,
  insertPayrollExportSchema,
  insertPayrollProviderConnectionSchema
} from '@shared/schema';
import { z } from "zod";
import { createLogger } from "../lib/logger";
import { formatCurrency, calculateRegularPay, calculateOvertimePay, multiplyFinancialValues, calculateTotalDeductions } from '../services/financialCalculator';

const log = createLogger('PayStubRoutes');

async function generateAndStorePdf(
  stub: typeof payStubs.$inferSelect,
  run: typeof payrollRuns.$inferSelect,
  entry: typeof payrollEntries.$inferSelect,
): Promise<void> {
  try {
    const { paystubService } = await import('../services/paystubService');
    const { uploadFileToObjectStorage } = await import('../objectStorage');

    // Phase 30: Generate AI earnings summary via withGpt wrapper (document_generation)
    let aiSummary: string | undefined;
    try {
      const { meteredGptClient } = await import('../services/billing/meteredGptClient');
      const netPay = parseFloat(entry.netPay?.toString() || '0').toFixed(2);
      const grossPay = parseFloat(entry.grossPay?.toString() || '0').toFixed(2);
      const regHoursNum = parseFloat(entry.regularHours?.toString() || '0').toFixed(2);
      const aiResult = await meteredGptClient.execute({
        workspaceId: stub.workspaceId,
        featureKey: 'document_generation',
        prompt: `Write a single professional 1-2 sentence earnings summary for a security officer pay stub. Gross: $${grossPay}, Net: $${netPay}, Regular hours: ${regHoursNum}. Be concise, positive, and factual. No bullet points.`,
        tier: 'MINI',
        maxTokens: 80,
        temperature: 0.3,
      });
      if (aiResult && aiResult.content) {
        aiSummary = aiResult.content.trim().replace(/[*_`]/g, '');
      }
    } catch (aiErr) {
      log.warn('AI summary generation skipped (non-fatal):', aiErr instanceof Error ? aiErr.message : String(aiErr));
    }

    const rateStr = entry.hourlyRate?.toString() || '0';
    const regHrs = parseFloat(entry.regularHours?.toString() || '0');
    const otHrs = parseFloat(entry.overtimeHours?.toString() || '0');
    const fedTax = parseFloat(entry.federalTax?.toString() || '0');
    const stTax = parseFloat(entry.stateTax?.toString() || '0');
    const ss = parseFloat(entry.socialSecurity?.toString() || '0');
    const med = parseFloat(entry.medicare?.toString() || '0');
    // Use FinancialCalculator for overtime rate — no native arithmetic on financial values
    const overtimeRateDisplay = parseFloat(formatCurrency(multiplyFinancialValues(rateStr, '1.5')));

    const pdfBuffer = await paystubService.generatePDF({
      employeeId: stub.employeeId,
      workspaceId: stub.workspaceId,
      payPeriodStart: stub.payPeriodStart instanceof Date ? stub.payPeriodStart : new Date(stub.payPeriodStart!),
      payPeriodEnd: stub.payPeriodEnd instanceof Date ? stub.payPeriodEnd : new Date(stub.payPeriodEnd!),
      payDate: stub.payDate instanceof Date ? stub.payDate : new Date(stub.payDate!),
      regularHours: regHrs,
      overtimeHours: otHrs,
      regularRate: parseFloat(rateStr),
      overtimeRate: overtimeRateDisplay,
      grossPay: parseFloat(entry.grossPay?.toString() || '0'),
      deductions: [
        { name: 'Federal Tax', amount: fedTax },
        { name: 'State Tax', amount: stTax },
        { name: 'Social Security', amount: ss },
        { name: 'Medicare', amount: med },
      ].filter(d => d.amount > 0),
      netPay: parseFloat(entry.netPay?.toString() || '0'),
      payrollRunId: run.id,
      aiSummary,
    });

    const storageKey = `.private/paystubs/${stub.workspaceId}/${stub.payrollRunId}/${stub.id}.pdf`;
    await uploadFileToObjectStorage({
      objectPath: storageKey,
      buffer: pdfBuffer,
      metadata: { contentType: 'application/pdf', metadata: { stubId: stub.id, workspaceId: stub.workspaceId } },
    });
    // audit_reserve is always allowed — record usage for dashboard visibility (never blocks)
    const { recordStorageUsage } = await import('../services/storage/storageQuotaService');
    recordStorageUsage(stub.workspaceId, 'audit_reserve', pdfBuffer.length).catch(() => null);

    await db.update(payStubs)
      .set({ pdfStorageKey: storageKey, pdfUrl: `/api/payroll/pay-stubs/${stub.id}/pdf`, status: 'generated' })
      .where(eq(payStubs.id, stub.id));

    log.info('Pay stub PDF generated and stored', { stubId: stub.id, workspaceId: stub.workspaceId });
  } catch (err: unknown) {
    log.warn('Pay stub PDF generation failed (non-fatal)', { stubId: stub.id, error: (err instanceof Error ? err.message : String(err)) });
  }
}

const router = Router();

router.get("/pay-stubs", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace context required" });

    const isManager = req.workspaceRole && hasManagerAccess(req.workspaceRole);
    const isPlatform = req.platformRole && hasPlatformWideAccess(req.platformRole);

    const { employeeId: queryEmployeeId, payrollRunId } = req.query;
    let conditions = [eq(payStubs.workspaceId, workspaceId)];

    if (!isManager && !isPlatform) {
      // For officers, we must find their employee record in this workspace
      const employee = await storage.getEmployeeByUserId(req.user?.id || '', workspaceId);
      if (!employee) {
        return res.status(403).json({ error: "No employee record found for your user in this workspace" });
      }
      conditions.push(eq(payStubs.employeeId, employee.id));
    } else {
      if (queryEmployeeId && typeof queryEmployeeId === "string") {
        conditions.push(eq(payStubs.employeeId, queryEmployeeId));
      }
    }
    if (payrollRunId && typeof payrollRunId === "string") {
      conditions.push(eq(payStubs.payrollRunId, payrollRunId));
    }

    const stubs = await db.select().from(payStubs)
      .where(and(...conditions))
      .orderBy(desc(payStubs.payDate));

    res.json(stubs);
  } catch (error: unknown) {
    log.error("Error fetching pay stubs:", error);
    res.status(500).json({ error: "Failed to fetch pay stubs" });
  }
});

router.get("/pay-stubs/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace context required" });

    const [stub] = await db.select().from(payStubs)
      .where(and(eq(payStubs.id, req.params.id), eq(payStubs.workspaceId, workspaceId)));

    if (!stub) return res.status(404).json({ error: "Pay stub not found" });

    const isManager = req.workspaceRole && hasManagerAccess(req.workspaceRole);
    const isPlatform = req.platformRole && hasPlatformWideAccess(req.platformRole);
    if (!isManager && !isPlatform) {
      const employee = await storage.getEmployeeByUserId(req.user?.id || '', workspaceId);
      if (!employee || stub.employeeId !== employee.id) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    res.json(stub);
  } catch (error: unknown) {
    log.error("Error fetching pay stub:", error);
    res.status(500).json({ error: "Failed to fetch pay stub" });
  }
});

router.post("/pay-stubs/generate", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace context required" });

    const schema = z.object({ payrollRunId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "payrollRunId is required" });

    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, parsed.data.payrollRunId), eq(payrollRuns.workspaceId, workspaceId)));

    if (!run) return res.status(404).json({ error: "Payroll run not found" });

    const entries = await db.select().from(payrollEntries)
      .where(eq(payrollEntries.payrollRunId, run.id));

    if (entries.length === 0) return res.status(400).json({ error: "No payroll entries found for this run" });

    const generatedStubs = [];
    const pdfQueue: Array<{ stub: typeof payStubs.$inferSelect; entry: typeof payrollEntries.$inferSelect }> = [];

    // GAP-RATE-3: Load workspace differential pay config and employer name once before stub loop.
    // Differential amounts (night shift, weekend, hazard) are tracked as distinct
    // line items in earningsBreakdown so each pay stub shows the exact premium breakdown.
    const { orgFinanceSettings } = await import('@shared/schema');
    const [finSettings] = await db.select({ differentialRatesConfig: orgFinanceSettings.differentialRatesConfig })
      .from(orgFinanceSettings)
      .where(eq(orgFinanceSettings.workspaceId, workspaceId))
      .limit(1);
    const diffConfig = (finSettings?.differentialRatesConfig as any) ?? null;

    // GAP-13b FIX: Load employer name directly so every pay stub stores it as a first-class field.
    // Previously only workspaceId was stored — auditors and officers had no employer name on the stub itself.
    const [wsRow] = await db.select({ name: workspaces.name }).from(workspaces)
      .where(eq(workspaces.id, workspaceId)).limit(1);
    const employerName = wsRow?.name || workspaceId;

    // Stub number counter — human-readable, per workspace, per run: STU-YYYYMM-001, STU-YYYYMM-002, ...
    const stubDatePrefix = new Date().toISOString().slice(0, 7).replace('-', '');
    let stubCounter = 0;

    for (const entry of entries) {
      stubCounter++;
      const grossPay = entry.grossPay || "0.00";
      const rateStr2 = entry.hourlyRate?.toString() || "0";
      const regHrsStr = entry.regularHours?.toString() || "0";
      const otHrsStr = entry.overtimeHours?.toString() || "0";
      // All arithmetic via FinancialCalculator — no native arithmetic on financial values
      const regularPay = formatCurrency(calculateRegularPay(regHrsStr, rateStr2));
      const overtimeRate = formatCurrency(multiplyFinancialValues(rateStr2, '1.5'));
      const overtimePay = formatCurrency(calculateOvertimePay(otHrsStr, rateStr2, '1.5'));
      const totalDeductions = formatCurrency(calculateTotalDeductions([
        entry.federalTax?.toString() || '0',
        entry.stateTax?.toString() || '0',
        entry.socialSecurity?.toString() || '0',
        entry.medicare?.toString() || '0',
      ]));
      const netPay = entry.netPay || "0.00";

      // GAP-13a FIX: Human-readable sequential stub number — STU-YYYYMM-NNN (zero-padded).
      const stubNumber = `STU-${stubDatePrefix}-${String(stubCounter).padStart(3, '0')}`;

      // If this entry was disbursed via Plaid ACH, carry the transfer ID forward so the
      // PayrollTransferMonitor can poll and update the stub when the ACH settles.
      // GAP-9 FIX: Removed incorrect fallback to stripeTransferId — ACH entries never have a
      // stripeTransferId; the fallback silently produced null, causing the stub to be written
      // without plaidTransferId so the TransferMonitor could never poll its settlement status.
      const isPlaidAch = (entry as any).disbursementMethod === 'plaid_ach';
      const entryPlaidTransferId = isPlaidAch ? ((entry as any).plaidTransferId || null) : null;

      // GAP-6a FIX: Use the employee's actual clock-in time from time entries, not the period
      // start date as a proxy. The period start is the same for every employee in the run —
      // using it means everyone gets the same (often wrong) differential regardless of when
      // they actually worked. Instead, fetch the earliest clockIn from their time entries
      // that were payrolled into this run.
      let diffClockIn = run.periodStart ? new Date(run.periodStart) : new Date();
      try {
        const [firstEntry] = await db
          .select({ clockIn: timeEntries.clockIn })
          .from(timeEntries)
          .where(and(
            eq(timeEntries.employeeId, entry.employeeId),
            eq(timeEntries.payrollRunId, run.id),
          ))
          .limit(1);
        if (firstEntry?.clockIn) diffClockIn = new Date(firstEntry.clockIn);
      } catch (err: any) {
        log.warn('[PayStub] Non-critical error generating pay stub preview', { error: err.message });
      }

      // GAP-RATE-3 / GAP-6b FIX: Calculate each differential type independently as a
      // distinct line item. The previous if/else if chain prevented multiple differentials
      // from coexisting (e.g. an officer who worked a hazardous night shift only got one
      // premium — not both). Now all applicable types are computed separately from the config
      // and all fire simultaneously when applicable.
      let hazardPay: string | undefined;
      let nightShiftPay: string | undefined;
      let weekendPay: string | undefined;
      let differentialPay: string | undefined;
      let differentialMultiplier: string | undefined;
      let differentialTypes: string | undefined;
      if (diffConfig) {
        try {
          const { applyDifferentialPremium } = await import('../services/automation/rateResolver');
          const diffResult = applyDifferentialPremium(parseFloat(rateStr2), diffClockIn, diffConfig);
          const baseRegPay = parseFloat(regularPay);
          const allApplied: string[] = [];

          // GAP-6b: Compute each differential independently — not mutually exclusive
          if (diffResult.appliedDifferentials.includes('night_shift') && diffConfig.nightShiftMultiplier > 1.0) {
            const premium = parseFloat((baseRegPay * (diffConfig.nightShiftMultiplier - 1.0)).toFixed(2));
            if (premium > 0) { nightShiftPay = premium.toFixed(2); allApplied.push('night_shift'); }
          }
          if (diffResult.appliedDifferentials.includes('weekend') && diffConfig.weekendMultiplier > 1.0) {
            const premium = parseFloat((baseRegPay * (diffConfig.weekendMultiplier - 1.0)).toFixed(2));
            if (premium > 0) { weekendPay = premium.toFixed(2); allApplied.push('weekend'); }
          }
          if (diffResult.appliedDifferentials.includes('hazard_eligible') && diffConfig.hazardMultiplier > 1.0) {
            const premium = parseFloat((baseRegPay * (diffConfig.hazardMultiplier - 1.0)).toFixed(2));
            if (premium > 0) { hazardPay = premium.toFixed(2); allApplied.push('hazard'); }
          }
          // Generic differential catch-all: if total multiplier > 1 but no named type matched
          if (allApplied.length === 0 && diffResult.multiplier > 1.0) {
            differentialPay = parseFloat((baseRegPay * (diffResult.multiplier - 1.0)).toFixed(2)).toFixed(2);
          }
          if (diffResult.multiplier > 1.0) {
            differentialMultiplier = diffResult.multiplier.toFixed(4);
          }
          if (allApplied.length > 0) {
            differentialTypes = allApplied.join(',');
          }
        } catch (diffErr: any) {
          log.warn('[PayStubs] Differential pay calculation failed (non-blocking):', diffErr?.message);
        }
      }

      const [stub] = await db.insert(payStubs).values({
        workspaceId,
        payrollRunId: run.id,
        payrollEntryId: entry.id,
        employeeId: entry.employeeId,
        payPeriodStart: run.periodStart!,
        payPeriodEnd: run.periodEnd!,
        payDate: run.processedAt || new Date(),
        grossPay,
        totalDeductions,
        netPay,
        earningsBreakdown: {
          stub_number: stubNumber,
          employer_name: employerName,
          regular_hours: entry.regularHours?.toString() || "0",
          regular_rate: rateStr2,
          regular_pay: regularPay,
          overtime_hours: entry.overtimeHours?.toString() || "0",
          overtime_rate: overtimeRate,
          overtime_pay: overtimePay,
          ...(hazardPay ? { hazard_pay: hazardPay } : {}),
          ...(nightShiftPay ? { night_shift_pay: nightShiftPay } : {}),
          ...(weekendPay ? { weekend_pay: weekendPay } : {}),
          ...(differentialPay ? { differential_pay: differentialPay } : {}),
          ...(differentialMultiplier ? { differential_multiplier: differentialMultiplier } : {}),
          ...(differentialTypes ? { differential_types: differentialTypes } : {}),
        },
        deductionsBreakdown: {
          federal_tax: entry.federalTax?.toString() || "0",
          state_tax: entry.stateTax?.toString() || "0",
          social_security: entry.socialSecurity?.toString() || "0",
          medicare: entry.medicare?.toString() || "0",
        },
        status: "generated",
        createdBy: req.user?.id,
        // Plaid ACH tracking — enables TransferMonitor to poll status for this stub
        ...(entryPlaidTransferId ? {
          plaidTransferId: entryPlaidTransferId,
          plaidTransferStatus: (entry as any).plaidTransferStatus || 'pending',
        } : {}),
      }).returning();

      generatedStubs.push(stub);
      pdfQueue.push({ stub, entry });
    }

    setImmediate(async () => {
      const { billingAuditLog: billingAuditLogTable } = await import('@shared/schema');
      await db.insert(billingAuditLogTable).values({
        workspaceId,
        eventType: 'pay_stubs_generated',
        actorType: 'user',
        actorId: req.user?.id,
        idempotencyKey: `pay-stubs-${run.id}-${randomUUID()}`,
        newState: {
          payrollRunId: run.id,
          stubCount: generatedStubs.length,
          employeeIds: generatedStubs.map((s: any) => s.employeeId),
        },
      }).onConflictDoNothing().catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    });

    res.status(201).json({
      message: `Generated ${generatedStubs.length} pay stubs`,
      count: generatedStubs.length,
      stubs: generatedStubs,
    });

    setImmediate(async () => {
      for (const { stub, entry } of pdfQueue) {
        await generateAndStorePdf(stub, run, entry);
      }
    });
  } catch (error: unknown) {
    log.error("Error generating pay stubs:", error);
    res.status(500).json({ error: "Failed to generate pay stubs" });
  }
});

// PDF download — generates on-demand if not yet stored, then serves the PDF.
// Also serves as a retroactive backfill for stubs created before PDF generation was wired up.
router.get("/pay-stubs/:id/pdf", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace context required" });

    const [stub] = await db.select().from(payStubs)
      .where(and(eq(payStubs.id, req.params.id), eq(payStubs.workspaceId, workspaceId)));

    if (!stub) return res.status(404).json({ error: "Pay stub not found" });

    const isManager = req.workspaceRole && hasManagerAccess(req.workspaceRole);
    const isPlatform = req.platformRole && hasPlatformWideAccess(req.platformRole);
    if (!isManager && !isPlatform) {
      const employee = await storage.getEmployeeByUserId(req.user?.id || '', workspaceId);
      if (!employee || stub.employeeId !== employee.id) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    let pdfBuffer: Buffer | null = null;

    // Try to fetch from object storage first
    if (stub.pdfStorageKey) {
      try {
        const { downloadFileFromObjectStorage } = await import('../objectStorage');
        pdfBuffer = await downloadFileFromObjectStorage(stub.pdfStorageKey);
      } catch {
        log.warn('Stored PDF not found in object storage, regenerating', { stubId: stub.id });
      }
    }

    // If not in storage, generate on-demand from the linked payroll entry
    if (!pdfBuffer) {
      const [entry] = await db.select().from(payrollEntries)
        .where(eq(payrollEntries.id, stub.payrollEntryId!));
      const [run] = entry ? await db.select().from(payrollRuns).where(eq(payrollRuns.id, stub.payrollRunId!)) : [null];

      if (entry && run) {
        const { paystubService } = await import('../services/paystubService');
        const rate = parseFloat(entry.hourlyRate?.toString() || '0');
        const regHrs = parseFloat(entry.regularHours?.toString() || '0');
        const otHrs = parseFloat(entry.overtimeHours?.toString() || '0');
        const fedTax = parseFloat(entry.federalTax?.toString() || '0');
        const stTax = parseFloat(entry.stateTax?.toString() || '0');
        const ss = parseFloat(entry.socialSecurity?.toString() || '0');
        const med = parseFloat(entry.medicare?.toString() || '0');

        pdfBuffer = await paystubService.generatePDF({
          employeeId: stub.employeeId,
          workspaceId: stub.workspaceId,
          payPeriodStart: stub.payPeriodStart instanceof Date ? stub.payPeriodStart : new Date(stub.payPeriodStart!),
          payPeriodEnd: stub.payPeriodEnd instanceof Date ? stub.payPeriodEnd : new Date(stub.payPeriodEnd!),
          payDate: stub.payDate instanceof Date ? stub.payDate : new Date(stub.payDate!),
          regularHours: regHrs,
          overtimeHours: otHrs,
          regularRate: rate,
          overtimeRate: rate * 1.5,
          grossPay: parseFloat(entry.grossPay?.toString() || '0'),
          deductions: [
            { name: 'Federal Tax', amount: fedTax },
            { name: 'State Tax', amount: stTax },
            { name: 'Social Security', amount: ss },
            { name: 'Medicare', amount: med },
          ].filter(d => d.amount > 0),
          netPay: parseFloat(entry.netPay?.toString() || '0'),
          payrollRunId: run.id,
        });

        // Persist so future downloads are served from storage
        setImmediate(async () => {
          try {
            const { uploadFileToObjectStorage } = await import('../objectStorage');
            const { recordStorageUsage } = await import('../services/storage/storageQuotaService');
            const storageKey = `.private/paystubs/${stub.workspaceId}/${stub.payrollRunId}/${stub.id}.pdf`;
            await uploadFileToObjectStorage({
              objectPath: storageKey,
              buffer: pdfBuffer!,
              metadata: { contentType: 'application/pdf', metadata: { stubId: stub.id } },
            });
            // audit_reserve is always allowed — record usage for dashboard visibility (never blocks)
            recordStorageUsage(stub.workspaceId, 'audit_reserve', pdfBuffer!.length).catch(() => null);
            await db.update(payStubs)
              .set({ pdfStorageKey: storageKey, pdfUrl: `/api/payroll/pay-stubs/${stub.id}/pdf` })
              .where(eq(payStubs.id, stub.id));
          } catch (uploadErr: unknown) {
            log.warn('PDF upload after on-demand generation failed', { stubId: stub.id, error: (uploadErr instanceof Error ? uploadErr.message : String(uploadErr)) });
          }
        });
      }
    }

    if (!pdfBuffer) {
      return res.status(422).json({ error: "Unable to generate PDF — payroll entry data unavailable" });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="paystub-${stub.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: unknown) {
    log.error("Error serving pay stub PDF:", error);
    res.status(500).json({ error: "Failed to serve pay stub PDF" });
  }
});

const createExportSchema = z.object({
  payrollRunId: z.string().min(1),
  providerType: z.enum(["patriot", "check", "gusto", "csv", "custom"]),
  exportFormat: z.enum(["json", "csv", "xml"]).default("json"),
});

router.get("/payroll-exports", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace context required" });

    const exports = await db.select().from(payrollExports)
      .where(eq(payrollExports.workspaceId, workspaceId))
      .orderBy(desc(payrollExports.createdAt));

    res.json(exports);
  } catch (error: unknown) {
    log.error("Error fetching payroll exports:", error);
    res.status(500).json({ error: "Failed to fetch payroll exports" });
  }
});

router.get("/payroll-exports/:id", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace context required" });

    const [exp] = await db.select().from(payrollExports)
      .where(and(eq(payrollExports.id, req.params.id), eq(payrollExports.workspaceId, workspaceId)));

    if (!exp) return res.status(404).json({ error: "Payroll export not found" });
    res.json(exp);
  } catch (error: unknown) {
    log.error("Error fetching payroll export:", error);
    res.status(500).json({ error: "Failed to fetch payroll export" });
  }
});

router.post("/payroll-exports", requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace context required" });

    const parsed = createExportSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });

    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, parsed.data.payrollRunId), eq(payrollRuns.workspaceId, workspaceId)));

    if (!run) return res.status(404).json({ error: "Payroll run not found" });

    const entries = await db.select().from(payrollEntries)
      .where(eq(payrollEntries.payrollRunId, run.id));

    const employeeIds = entries.map(e => e.employeeId).filter(Boolean) as string[];
    const emps = employeeIds.length > 0
      ? await db.select().from(employees).where(eq(employees.workspaceId, workspaceId))
      : [];
    const empMap = new Map(emps.map(e => [e.id, e]));

    const payload = {
      company_id: workspaceId,
      pay_period: {
        start_date: run.periodStart?.toISOString().split("T")[0],
        end_date: run.periodEnd?.toISOString().split("T")[0],
        pay_date: run.processedAt?.toISOString().split("T")[0] || new Date().toISOString().split("T")[0],
      },
      employees: entries.map(entry => {
        const emp = empMap.get(entry.employeeId);
        const rate = parseFloat(entry.hourlyRate?.toString() || "0");
        const regHrs = parseFloat(entry.regularHours?.toString() || "0");
        const otHrs = parseFloat(entry.overtimeHours?.toString() || "0");
        const otRate = rate * 1.5;
        return {
          employee_reference_id: entry.employeeId,
          first_name: emp?.firstName || "",
          last_name: emp?.lastName || "",
          earnings: [
            {
              type: "regular",
              hours: regHrs,
              rate,
              amount: regHrs * rate,
            },
            ...(otHrs > 0 ? [{
              type: "overtime",
              hours: otHrs,
              rate: otRate,
              amount: otHrs * otRate,
            }] : []),
          ],
          gross_pay: parseFloat(entry.grossPay?.toString() || "0"),
          net_pay: parseFloat(entry.netPay?.toString() || "0"),
        };
      }),
      auto_approve: false,
    };

    const [exp] = await db.insert(payrollExports).values({
      workspaceId,
      payrollRunId: run.id,
      providerType: parsed.data.providerType,
      exportFormat: parsed.data.exportFormat,
      exportPayload: payload,
      status: "pending",
      createdBy: req.user?.id,
    }).returning();

    res.status(201).json(exp);
  } catch (error: unknown) {
    log.error("Error creating payroll export:", error);
    res.status(500).json({ error: "Failed to create payroll export" });
  }
});

const createProviderSchema = z.object({
  provider: z.enum(["gusto", "patriot", "check"]),
  externalCompanyId: z.string().optional(),
  connectionMetadata: z.record(z.any()).optional(),
});

const updateProviderSchema = createProviderSchema.partial();

router.get("/payroll-providers", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace context required" });

    const connections = await db.select().from(payrollProviderConnections)
      .where(eq(payrollProviderConnections.workspaceId, workspaceId));

    res.json(connections);
  } catch (error: unknown) {
    log.error("Error fetching payroll providers:", error);
    res.status(500).json({ error: "Failed to fetch payroll providers" });
  }
});

router.post("/payroll-providers", requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace context required" });

    const parsed = createProviderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });

    const [conn] = await db.insert(payrollProviderConnections).values({
      workspaceId,
      provider: parsed.data.provider,
      externalCompanyId: parsed.data.externalCompanyId,
      connectionMetadata: parsed.data.connectionMetadata,
      status: "pending",
      createdBy: req.user?.id,
    }).returning();

    res.status(201).json(conn);
  } catch (error: unknown) {
    log.error("Error creating payroll provider:", error);
    res.status(500).json({ error: "Failed to create payroll provider" });
  }
});

router.patch("/payroll-providers/:id", requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace context required" });

    const parsed = updateProviderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });

    const [updated] = await db.update(payrollProviderConnections)
      .set({
        ...parsed.data,
        updatedAt: new Date(),
      })
      .where(and(
        eq(payrollProviderConnections.id, req.params.id),
        eq(payrollProviderConnections.workspaceId, workspaceId)
      ))
      .returning();

    if (!updated) return res.status(404).json({ error: "Provider connection not found" });
    res.json(updated);
  } catch (error: unknown) {
    log.error("Error updating payroll provider:", error);
    res.status(500).json({ error: "Failed to update payroll provider" });
  }
});

router.delete("/payroll-providers/:id", requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace context required" });

    const [updated] = await db.update(payrollProviderConnections)
      .set({ status: "disconnected", updatedAt: new Date() })
      .where(and(
        eq(payrollProviderConnections.id, req.params.id),
        eq(payrollProviderConnections.workspaceId, workspaceId)
      ))
      .returning();

    if (!updated) return res.status(404).json({ error: "Provider connection not found" });
    res.json({ success: true, id: updated.id });
  } catch (error: unknown) {
    log.error("Error disconnecting payroll provider:", error);
    res.status(500).json({ error: "Failed to disconnect payroll provider" });
  }
});

export default router;
