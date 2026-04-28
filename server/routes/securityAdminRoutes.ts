/**
 * Security Admin Routes — Phase 18D
 * ==================================
 * Workspace-scoped management of:
 *   - Break-glass verification overrides (supervisor PIN required)
 *   - Per-workspace auditor allow-list
 *
 * All endpoints require an authenticated workspace member with manager+ role.
 * Mounted at /api/security-admin/*.
 */

import { Router, type Response } from 'express';
import { createLogger } from '../lib/logger';
import { requireAuth, type AuthenticatedRequest } from '../rbac';
import { z } from 'zod';

const log = createLogger('SecurityAdminRoutes');
export const securityAdminRouter = Router();

securityAdminRouter.use(requireAuth);

function requireManagerRole(req: AuthenticatedRequest, res: Response): boolean {
  const role = (req.workspaceRole || '').toLowerCase();
  const allowed = ['supervisor', 'manager', 'department_manager', 'org_admin', 'org_manager', 'co_owner', 'org_owner'];
  if (!allowed.some(r => role.includes(r))) {
    res.status(403).json({ ok: false, error: 'Manager+ role required' });
    return false;
  }
  return true;
}

// ─── Break-glass overrides ────────────────────────────────────────────────────

securityAdminRouter.post('/overrides', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireManagerRole(req, res)) return;
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ ok: false, error: 'workspaceId missing' });

    const { employeeId, fromPhone, supervisorEmployeeNumber, supervisorPin, hours, reason } = req.body || {};
    if (!employeeId || !fromPhone || !supervisorEmployeeNumber || !supervisorPin) {
      return res.status(400).json({
        ok: false,
        error: 'employeeId, fromPhone, supervisorEmployeeNumber, supervisorPin required',
      });
    }
    const { grantOverride } = await import('../services/trinityVoice/verificationOverrideService');
    const r = await grantOverride({
      workspaceId,
      employeeId,
      fromPhone,
      supervisorEmployeeNumber,
      supervisorPin,
      hours,
      reason,
    });
    if (!r.success) return res.status(400).json({ ok: false, error: r.reason });
    return res.json({ ok: true, expiresAt: r.expiresAt });
  } catch (err: any) {
    log.error('[SecurityAdmin] grant override failed:', err.message);
    res.status(500).json({ ok: false, error: 'Failed' });
  }
});

securityAdminRouter.get('/overrides', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireManagerRole(req, res)) return;
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ ok: false, error: 'workspaceId missing' });
    const { listActiveOverrides } = await import('../services/trinityVoice/verificationOverrideService');
    const list = await listActiveOverrides(workspaceId);
    res.json({ ok: true, overrides: list });
  } catch (err: any) {
    log.error('[SecurityAdmin] list overrides failed:', err.message);
    res.status(500).json({ ok: false, error: 'Failed' });
  }
});

securityAdminRouter.delete('/overrides/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireManagerRole(req, res)) return;
    const { revokeOverride } = await import('../services/trinityVoice/verificationOverrideService');
    const r = await revokeOverride(req.params.id, req.user?.id);
    res.json({ ok: r.success });
  } catch (err: any) {
    log.error('[SecurityAdmin] revoke override failed:', err.message);
    res.status(500).json({ ok: false, error: 'Failed' });
  }
});

// ─── Auditor allow-list ───────────────────────────────────────────────────────

securityAdminRouter.get('/auditor-allowlist', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireManagerRole(req, res)) return;
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ ok: false, error: 'workspaceId missing' });
    const { pool } = await import('../db');
    const r = await pool.query(
      `SELECT id, email, full_name, agency_name, notes, is_active, created_at
         FROM workspace_auditor_allowlist
        WHERE workspace_id = $1
        ORDER BY created_at DESC`,
      [workspaceId]
    );
    res.json({ ok: true, entries: r.rows });
  } catch (err: any) {
    log.error('[SecurityAdmin] list allowlist failed:', err.message);
    res.status(500).json({ ok: false, error: 'Failed' });
  }
});

securityAdminRouter.post('/auditor-allowlist', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireManagerRole(req, res)) return;
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ ok: false, error: 'workspaceId missing' });
    const { email, fullName, agencyName, notes } = req.body || {};
    if (!email) return res.status(400).json({ ok: false, error: 'email required' });
    const { addAuditorAllowlist } = await import('../services/auditor/auditorAccessService');
    const r = await addAuditorAllowlist({
      workspaceId, email, fullName, agencyName, notes, addedBy: req.user?.id,
    });
    res.json({ ok: r.success });
  } catch (err: any) {
    log.error('[SecurityAdmin] add allowlist failed:', err.message);
    res.status(500).json({ ok: false, error: 'Failed' });
  }
});

securityAdminRouter.delete('/auditor-allowlist/:email', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireManagerRole(req, res)) return;
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ ok: false, error: 'workspaceId missing' });
    const { removeAuditorAllowlist } = await import('../services/auditor/auditorAccessService');
    const r = await removeAuditorAllowlist(workspaceId, req.params.email);
    res.json({ ok: r.success });
  } catch (err: any) {
    log.error('[SecurityAdmin] remove allowlist failed:', err.message);
    res.status(500).json({ ok: false, error: 'Failed' });
  }
});
