import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { requireManager, requireAdmin, requireOwner } from "../rbac";
import type { AuthenticatedRequest } from "../rbac";
import { exportEmployees, exportPayroll, exportAuditLogs, exportTimeEntries, exportAllData, anonymizeEmployeeData, exportInvoices, exportPaymentRecords, exportExpenses, exportFinancialSummary, exportProfitLoss, exportShiftHistory } from "../services/exportService";
import { createLogger } from '../lib/logger';
import { universalAudit } from '../services/universalAuditService';
import { db } from '../db';
import { sql } from 'drizzle-orm';

const log = createLogger('ExportRoutes');

const router = Router();

function auditExport(req: AuthenticatedRequest, category: string, filename: string, filters?: Record<string, any>) {
  const workspaceId = req.workspaceId;
  const userId = req.user?.id;
  universalAudit.log({
    workspaceId: workspaceId || 'unknown',
    actorId: userId,
    action: 'data_export',
    entityType: 'export',
    entityId: category,
    // @ts-expect-error — TS migration: fix in refactoring sprint
    description: `Regulatory export: ${category} — file: ${filename}`,
    metadata: { category, filename, filters: filters || {}, ip: req.ip, userAgent: req.headers['user-agent'] },
  }).catch((err: any) => log.warn('[ExportAudit] Failed to write export audit log', { category, error: err?.message }));
}

router.post("/employees", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const { format = 'csv' } = req.body;
    const result = await exportEmployees(workspaceId, { format: format as any });
    auditExport(req, 'employees', result.filename, { format });

    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.data);
  } catch (error: unknown) {
    log.error('Error exporting employees:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post("/payroll", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const { format = 'csv', startDate, endDate } = req.body;
    const result = await exportPayroll(workspaceId, { format: format as any, startDate, endDate });
    auditExport(req, 'payroll', result.filename, { format, startDate, endDate });

    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.data);
  } catch (error: unknown) {
    log.error('Error exporting payroll:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post("/audit-logs", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const { format = 'json', startDate, endDate } = req.body;
    const result = await exportAuditLogs(workspaceId, { format: format as any, startDate, endDate });
    auditExport(req, 'audit_logs', result.filename, { format, startDate, endDate });

    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.data);
  } catch (error: unknown) {
    log.error('Error exporting audit logs:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post("/time-entries", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const { format = 'csv', startDate, endDate } = req.body;
    const result = await exportTimeEntries(workspaceId, { format: format as any, startDate, endDate });
    auditExport(req, 'time_entries', result.filename, { format, startDate, endDate });

    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.data);
  } catch (error: unknown) {
    log.error('Error exporting time entries:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post("/all", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const { format = 'json', startDate, endDate } = req.body;
    const result = await exportAllData(workspaceId, { format: format as any, startDate, endDate });
    auditExport(req, 'full_data_export', result.filename, { format, startDate, endDate });

    res.setHeader('Content-Type', format === 'json' ? 'application/json' : 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.data);
  } catch (error: unknown) {
    log.error('Error exporting all data:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post("/invoices", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const { format = 'csv', startDate, endDate } = req.body;
    const result = await exportInvoices(workspaceId, {
      format: format as any,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
    auditExport(req, 'invoices', result.filename, { format, startDate, endDate });

    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.data);
  } catch (error: unknown) {
    log.error('Error exporting invoices:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post("/payments", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const { format = 'csv', startDate, endDate } = req.body;
    const result = await exportPaymentRecords(workspaceId, {
      format: format as any,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
    auditExport(req, 'payment_records', result.filename, { format, startDate, endDate });

    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.data);
  } catch (error: unknown) {
    log.error('Error exporting payments:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post("/expenses", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const { format = 'csv', startDate, endDate } = req.body;
    const result = await exportExpenses(workspaceId, {
      format: format as any,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
    auditExport(req, 'expenses', result.filename, { format, startDate, endDate });

    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.data);
  } catch (error: unknown) {
    log.error('Error exporting expenses:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post("/financial-summary", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const { format = 'csv', startDate, endDate } = req.body;
    const result = await exportFinancialSummary(workspaceId, {
      format: format as any,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
    auditExport(req, 'financial_summary', result.filename, { format, startDate, endDate });

    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.data);
  } catch (error: unknown) {
    log.error('Error exporting financial summary:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post("/profit-loss", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const { format = 'csv', startDate, endDate } = req.body;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const result = await exportProfitLoss(workspaceId, userId, {
      format: format as any,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
    auditExport(req, 'profit_loss', result.filename, { format, startDate, endDate });

    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.data);
  } catch (error: unknown) {
    log.error('Error exporting P&L:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post("/shifts", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const { format = 'csv', startDate, endDate } = req.body;
    const result = await exportShiftHistory(workspaceId, {
      format: format as any,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
    auditExport(req, 'shift_history', result.filename, { format, startDate, endDate });

    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.data);
  } catch (error: unknown) {
    log.error('Error exporting shift history:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post("/anonymize-employee/:employeeId", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const { employeeId } = req.params;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const result = await anonymizeEmployeeData(workspaceId, employeeId);
    auditExport(req, 'pii_anonymization', `employee-${employeeId}-anonymized`, { employeeId });
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    log.error('Error anonymizing employee:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/exports/tenant-takeout — Readiness Section 11
 *
 * Gated to org_owner / co_owner. This is the canonical tenant-offboarding
 * data export: calls exportAllData (employees, payroll, audit, time,
 * shifts) AND appends the new tables added in Sections 2–3 (weapon
 * inspections, qualifications, ammo inventory + ledger, auditor NDA
 * acceptances) so nothing we built on this branch is left behind when a
 * tenant offboards.
 *
 * All queries are workspace-scoped (CLAUDE §G). Every takeout writes an
 * audit_logs row identifying the org_owner who triggered it. The MSA
 * offboarding clause points to this endpoint.
 */
router.post("/tenant-takeout", requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    // Reuse the existing consolidated export for the core tables.
    const core = await exportAllData(workspaceId, { format: 'json' });
    const parsed = JSON.parse(core.data);

    // Append tables introduced by this readiness-audit branch. Each query
    // is workspace-scoped (CLAUDE §G) via parameterized SQL; failure on
    // one table does not abort the takeout — we prefer a partial export
    // over no export.
    const safeWorkspaceRows = async <T = any>(table: string): Promise<T[]> => {
      try {
        const r = await db.execute(
          sql`SELECT * FROM ${sql.identifier(table)} WHERE workspace_id = ${workspaceId}`,
        );
        return ((r as any).rows ?? []) as T[];
      } catch (err: any) {
        log.warn(`[tenant-takeout] ${table} export failed:`, err?.message);
        return [];
      }
    };

    const armory = {
      weaponInspections:    await safeWorkspaceRows('weapon_inspections'),
      weaponQualifications: await safeWorkspaceRows('weapon_qualifications'),
      ammoInventory:        await safeWorkspaceRows('ammo_inventory'),
      ammoTransactions:     await safeWorkspaceRows('ammo_transactions'),
    };

    // auditor_nda_acceptances is keyed by auditor_id, not workspace_id —
    // include acceptances from every auditor who has audited this tenant.
    let ndaAcceptances: any[] = [];
    try {
      const r = await db.execute(sql`
        SELECT na.*
          FROM auditor_nda_acceptances na
          JOIN auditor_audits aa ON aa.auditor_id = na.auditor_id
         WHERE aa.workspace_id = ${workspaceId}
      `);
      ndaAcceptances = ((r as any).rows ?? []);
    } catch (err: any) {
      log.warn('[tenant-takeout] auditor_nda_acceptances export failed:', err?.message);
    }

    const takeout = {
      ...parsed,
      armory,
      auditorNdaAcceptances: ndaAcceptances,
      takeoutMetadata: {
        takeoutDate: new Date().toISOString(),
        triggeredBy: req.user?.id,
        scope: 'full',
        note: 'Tenant takeout per MSA offboarding clause. Includes core tables plus armory + auditor compliance data.',
      },
    };

    const filename = `tenant-takeout-${workspaceId}-${new Date().toISOString().split('T')[0]}.json`;
    auditExport(req, 'tenant_takeout', filename);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(takeout, null, 2));
  } catch (error: unknown) {
    log.error('Error generating tenant takeout:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

export default router;
