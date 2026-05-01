/**
 * Trinity Auditor Actions — Phase 18C
 * ====================================
 * Trinity-callable actions for the regulatory auditor flow:
 *   auditor.intake_request — process an inbound auditor email
 *   auditor.list_active    — list active audits for a workspace
 *   auditor.close          — close a specific audit window
 *   auditor.expire_old     — sweep + close anything past its window
 */

import { helpaiOrchestrator } from '../helpai/platformActionHub';
import type { ActionHandler, ActionRequest, ActionResult } from '../helpai/platformActionHub';
import { createLogger } from '../../lib/logger';

const log = createLogger('TrinityAuditorActions');

function ok(actionId: string, message: string, data: any, start: number): ActionResult {
  return { success: true, actionId, message, data, executionTimeMs: Date.now() - start };
}
function fail(actionId: string, message: string, start: number): ActionResult {
  return { success: false, actionId, message, executionTimeMs: Date.now() - start };
}

const auditorIntake: ActionHandler = {
  actionId: 'auditor.intake_request',
  name: 'Process Regulatory Auditor Intake',
  category: 'compliance',
  description:
    'Trinity validates an inbound regulatory auditor email and creates a 30-day read-and-print-only audit window for the requested workspace + license number. Auditor receives an emailed magic link.',
  requiredRoles: ['org_owner', 'platform_admin'],
  handler: async (request: ActionRequest): Promise<ActionResult> => {
    const start = Date.now();
    try {
      const { email, fullName, agencyName, licenseNumber, orderDocUrl, baseUrl, notes, workspaceId: payloadWs } = request.payload || {};
      const workspaceId = payloadWs || request.workspaceId;
      if (!email || !workspaceId || !baseUrl) {
        return fail(request.actionId, 'Required fields: email, workspaceId, baseUrl', start);
      }
      const { processAuditorIntake } = await import('../auditor/auditorAccessService');
      const result = await processAuditorIntake({
        email, fullName, agencyName, workspaceId, licenseNumber, orderDocUrl, baseUrl, notes,
      });
      if (!result.success) return fail(request.actionId, result.reason || 'Intake failed', start);
      return ok(request.actionId, `Auditor intake processed (auditId=${result.auditId})`, result, start);
    } catch (err: unknown) {
      return fail(request.actionId, `Failed: ${err.message}`, start);
    }
  },
};

const auditorListActive: ActionHandler = {
  actionId: 'auditor.list_active',
  name: 'List Active Audits for Workspace',
  category: 'compliance',
  description: 'Returns all auditor audit windows that are currently open or pending review for the given workspace.',
  requiredRoles: ['org_owner', 'platform_admin', 'manager'],
  handler: async (request: ActionRequest): Promise<ActionResult> => {
    const start = Date.now();
    try {
      const { pool } = await import('../../db');
      const r = await pool.query(
        `SELECT a.id, a.workspace_id, a.license_number, a.status, a.opened_at, a.closes_at, a.scope,
                acc.email AS auditor_email, acc.agency_name
           FROM auditor_audits a
           JOIN auditor_accounts acc ON acc.id = a.auditor_id
          WHERE a.workspace_id = $1
            AND a.status IN ('open', 'active', 'pending_review')
          ORDER BY a.opened_at DESC`,
        [request.workspaceId]
      );
      return ok(request.actionId, `${r.rows.length} active audit(s)`, r.rows, start);
    } catch (err: unknown) {
      return fail(request.actionId, `Failed: ${err.message}`, start);
    }
  },
};

const auditorClose: ActionHandler = {
  actionId: 'auditor.close',
  name: 'Close an Audit Window',
  category: 'compliance',
  description: 'Closes a single audit window early (e.g., when the auditor confirms completion). Tenant or platform admin only.',
  requiredRoles: ['org_owner', 'platform_admin'],
  handler: async (request: ActionRequest): Promise<ActionResult> => {
    const start = Date.now();
    try {
      const { auditId } = request.payload || {};
      if (!auditId) return fail(request.actionId, 'auditId required', start);
      const { closeAudit } = await import('../auditor/auditorAccessService');
      const r = await closeAudit(auditId, request.userId);
      return r.success ? ok(request.actionId, 'Audit closed', { auditId }, start) : fail(request.actionId, 'Close failed', start);
    } catch (err: unknown) {
      return fail(request.actionId, `Failed: ${err.message}`, start);
    }
  },
};

const auditorExpireOld: ActionHandler = {
  actionId: 'auditor.expire_old',
  name: 'Expire Old Auditor Windows',
  category: 'compliance',
  description: 'Sweep all auditor_audits and close anything past its 30-day window. Safe to run on a schedule.',
  requiredRoles: ['platform_admin'],
  handler: async (request: ActionRequest): Promise<ActionResult> => {
    const start = Date.now();
    try {
      const { expireOldAudits } = await import('../auditor/auditorAccessService');
      const r = await expireOldAudits();
      return ok(request.actionId, `Expired ${r.closed} stale audit window(s)`, r, start);
    } catch (err: unknown) {
      return fail(request.actionId, `Failed: ${err.message}`, start);
    }
  },
};

export function registerTrinityAuditorActions(): void {
  helpaiOrchestrator.registerAction(auditorIntake);
  helpaiOrchestrator.registerAction(auditorListActive);
  helpaiOrchestrator.registerAction(auditorClose);
  helpaiOrchestrator.registerAction(auditorExpireOld);
  log.info('[TrinityAuditorActions] Registered 4 actions: intake_request, list_active, close, expire_old');
}
