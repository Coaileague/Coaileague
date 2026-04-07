/**
 * PHASE 36 — DATA EXPORT, PORTABILITY, AND PRIVACY COMPLIANCE
 *
 * Endpoints:
 *   GET  /api/privacy/requests               — List DSRs (platform staff)
 *   POST /api/privacy/requests               — Submit a data subject request
 *   PATCH /api/privacy/requests/:id          — Update DSR status (platform staff)
 *   POST /api/privacy/officer-export/:id     — Generate officer personal data export
 *   POST /api/privacy/workspace-export       — Generate workspace portability export (org_owner)
 *   GET  /api/privacy/download/:token        — Secure time-bounded download
 *   GET  /api/privacy/cookie-consent         — Get current user's consent
 *   POST /api/privacy/cookie-consent         — Set/update cookie consent
 *   GET  /api/privacy/terms-status           — Check if user has accepted current terms
 *   POST /api/privacy/terms-acceptance       — Record terms acceptance
 *   GET  /api/privacy/retention-policies     — List all retention policies (platform staff)
 */

import { sanitizeError } from '../middleware/errorHandler';
import type { Express, Request, Response } from 'express';
import express from 'express';
import { pool } from '../db';
import { universalAudit } from '../services/universalAuditService';
import crypto from 'crypto';
import zlib from 'zlib';
import { createLogger } from '../lib/logger';
const log = createLogger('PrivacyRoutes');


// ── Current legal document versions ──────────────────────────────────────────
const CURRENT_TERMS_VERSION = '1.0';
const CURRENT_PRIVACY_VERSION = '1.0';

// ── Role constants ────────────────────────────────────────────────────────────
const ROLE_LEVEL: Record<string, number> = {
  platform_admin: 100, platform_staff: 90, org_owner: 80,
  manager: 60, compliance_officer: 55, supervisor: 40, officer: 20, client: 10,
};
function roleLevel(role?: string) { return ROLE_LEVEL[role ?? ''] ?? 0; }

interface AuthenticatedRequest extends Request {
  user?: { id: string; workspaceId?: string; currentWorkspaceId?: string; role?: string; workspaceRole?: string };
  workspaceId?: string;
}

function userRole(req: AuthenticatedRequest) {
  return req.user?.role ?? req.user?.workspaceRole ?? 'officer';
}
function isAtLeast(req: AuthenticatedRequest, minRole: string) {
  return roleLevel(userRole(req)) >= roleLevel(minRole);
}

// ── In-memory export store (keyed by token, with expiry) ──────────────────────
// Used to hold generated export data until the download token is redeemed
const exportStore = new Map<string, {
  data: Buffer;
  filename: string;
  contentType: string;
  sha256: string;
  expiresAt: Date;
}>();

// Cleanup expired entries every 15 minutes
setInterval(() => {
  const now = new Date();
  for (const [token, entry] of exportStore.entries()) {
    if (entry.expiresAt < now) exportStore.delete(token);
  }
}, 15 * 60 * 1000).unref();

// ── Generate secure download token ───────────────────────────────────────────
async function createDownloadToken(opts: {
  workspaceId: string;
  requestorId: string;
  exportType: string;
  filename: string;
  contentType: string;
  data: Buffer;
  expiryHours: number;
}): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const sha256 = crypto.createHash('sha256').update(opts.data).digest('hex');
  const expiresAt = new Date(Date.now() + opts.expiryHours * 60 * 60 * 1000);

  // Store in memory
  exportStore.set(token, {
    data: opts.data,
    filename: opts.filename,
    contentType: opts.contentType,
    sha256,
    expiresAt,
  });

  // Log in DB
  await pool.query(
    `INSERT INTO export_download_tokens (token, workspace_id, requestor_id, export_type, filename, content_type, sha256_hash, file_size_bytes, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [token, opts.workspaceId, opts.requestorId, opts.exportType, opts.filename, opts.contentType, sha256, opts.data.length, expiresAt]
  );

  return token;
}

// ── Officer personal data export — 10 categories ─────────────────────────────
async function generateOfficerExport(employeeId: string, workspaceId: string): Promise<Buffer> {
  const [
    personal, schedule, pay, licenses, incidents,
    documents, compliance, shifts, timeEntries, auditLog
  ] = await Promise.all([
    // 1. Personal information
    pool.query(`SELECT id, first_name, last_name, email, phone, address, city, state, zip_code,
                       date_of_birth, emergency_contact_name, emergency_contact_phone,
                       emergency_contact_relation, hire_date, position, role, employee_number,
                       guard_card_number, worker_type, is_active
                FROM employees WHERE id=$1 AND workspace_id=$2`, [employeeId, workspaceId]),

    // 2. Shifts/schedule history
    pool.query(`SELECT s.id, s.title, s.description, s.date, s.start_time, s.end_time, s.status,
                       c.company_name AS client_name, s.category, s.created_at
                FROM shifts s LEFT JOIN clients c ON c.id=s.client_id
                WHERE s.employee_id=$1 AND s.workspace_id=$2
                ORDER BY s.date DESC LIMIT 500`, [employeeId, workspaceId]),

    // 3. Pay history
    pool.query(`SELECT id, paid_period_start, paid_period_end, net_pay, federal_tax, state_tax,
                       social_security, medicare, adjustments
                FROM payroll_entries WHERE employee_id=$1
                ORDER BY paid_period_start DESC LIMIT 500`, [employeeId]),

    // 4. Licenses
    pool.query(`SELECT id, guard_card_number, guard_card_issue_date, guard_card_expiry_date,
                       license_type, armed_license_verified, guard_card_verified, is_armed
                FROM employees WHERE id=$1`, [employeeId]),

    // 5. Incidents
    pool.query(`SELECT id, incident_number, title, incident_type, status, location_address,
                       occurred_at, polished_summary, severity
                FROM incident_reports WHERE workspace_id=$2
                  AND (reported_by=$1 OR reviewed_by=$1)
                ORDER BY occurred_at DESC LIMIT 100`, [employeeId, workspaceId]),

    // 6. Documents
    pool.query(`SELECT id, title, category, related_entity_type, mime_type, created_at
                FROM document_vault WHERE workspace_id=$2
                  AND related_entity_id=$1 AND deleted_at IS NULL
                ORDER BY created_at DESC LIMIT 100`, [employeeId, workspaceId]),

    // 7. Compliance history (audit log)
    pool.query(`SELECT id::text, action_type, resource_type, resource_id, timestamp
                FROM sra_audit_log WHERE workspace_id=$2
                  AND (resource_id=$1 OR metadata->>'employee_id'=$1)
                ORDER BY timestamp DESC LIMIT 200`, [employeeId, workspaceId]),

    // 8. Time entries
    pool.query(`SELECT id, clock_in, clock_out, duration_minutes, clock_in_location,
                       clock_out_location, status, note
                FROM time_entries WHERE employee_id=$1 AND workspace_id=$2
                ORDER BY clock_in DESC LIMIT 500`, [employeeId, workspaceId]),

    // 9. Support tickets
    pool.query(`SELECT id, ticket_number, subject, description, status, priority, created_at
                FROM support_tickets WHERE workspace_id=$2 AND employee_id=$1
                ORDER BY created_at DESC`, [employeeId, workspaceId]),

    // 10. Data subject request history
    pool.query(`SELECT id, request_type, status, requested_at, completed_at
                FROM data_subject_requests WHERE workspace_id=$2 AND requestor_id=$1
                ORDER BY requested_at DESC`, [employeeId, workspaceId]),
  ]);

  const exportData = {
    _meta: {
      export_type: 'officer_personal_data',
      generated_at: new Date().toISOString(),
      employee_id: employeeId,
      data_categories: [
        'personal_information', 'schedule_history', 'pay_history', 'licenses_certifications',
        'incident_involvement', 'documents', 'compliance_history', 'time_entries',
        'support_tickets', 'data_subject_request_history'
      ],
      legal_basis: 'GDPR Article 15 — Right of Access; CCPA Section 1798.110 — Right to Know',
      retention_note: 'Some records are retained beyond any deletion request per Texas Employment Law and IRS requirements',
    },
    personal_information: personal.rows[0] ?? {},
    schedule_history: schedule.rows,
    pay_history: pay.rows,
    licenses_certifications: licenses.rows[0] ?? {},
    incident_involvement: incidents.rows,
    documents: documents.rows,
    compliance_history: compliance.rows,
    time_entries: timeEntries.rows,
    support_tickets: shifts.rows,
    data_subject_request_history: auditLog.rows,
  };

  return Buffer.from(JSON.stringify(exportData, null, 2), 'utf8');
}

// ── Workspace portability export ──────────────────────────────────────────────
async function generateWorkspaceExport(workspaceId: string): Promise<Buffer> {
  const [
    officers, clients, shiftsData, invoices, payroll,
    incidents, documents, auditLog, tickets, timeEntries
  ] = await Promise.all([
    pool.query(`SELECT * FROM employees WHERE workspace_id=$1`, [workspaceId]),
    pool.query(`SELECT id, company_name, first_name, last_name, email, phone, address, city, state, zip_code, is_active, created_at FROM clients WHERE workspace_id=$1`, [workspaceId]),
    pool.query(`SELECT * FROM shifts WHERE workspace_id=$1 ORDER BY date DESC LIMIT 5000`, [workspaceId]),
    pool.query(`SELECT id, invoice_number, client_id, issue_date, due_date, subtotal, tax_amount, total, status, paid_at, notes, created_at FROM invoices WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 5000`, [workspaceId]),
    pool.query(`SELECT id, employee_id, paid_period_start, paid_period_end, net_pay, federal_tax, state_tax, social_security, medicare FROM payroll_entries WHERE employee_id IN (SELECT id FROM employees WHERE workspace_id=$1) LIMIT 10000`, [workspaceId]),
    pool.query(`SELECT * FROM incident_reports WHERE workspace_id=$1 ORDER BY occurred_at DESC LIMIT 2000`, [workspaceId]),
    pool.query(`SELECT id, title, category, related_entity_type, related_entity_id, mime_type, created_at FROM document_vault WHERE workspace_id=$1 AND deleted_at IS NULL`, [workspaceId]),
    pool.query(`SELECT id::text, action_type, resource_type, resource_id, timestamp FROM sra_audit_log WHERE workspace_id=$1 ORDER BY timestamp DESC LIMIT 10000`, [workspaceId]),
    pool.query(`SELECT id, ticket_number, subject, status, priority, type, created_at FROM support_tickets WHERE workspace_id=$1 ORDER BY created_at DESC`, [workspaceId]),
    pool.query(`SELECT id, employee_id, clock_in, clock_out, duration_minutes, status FROM time_entries WHERE workspace_id=$1 ORDER BY clock_in DESC LIMIT 10000`, [workspaceId]),
  ]);

  const exportData = {
    _meta: {
      export_type: 'workspace_portability',
      generated_at: new Date().toISOString(),
      workspace_id: workspaceId,
      entity_counts: {
        officers: officers.rows.length, clients: clients.rows.length, shifts: shiftsData.rows.length,
        invoices: invoices.rows.length, payroll_entries: payroll.rows.length, incidents: incidents.rows.length,
        documents: documents.rows.length, audit_log: auditLog.rows.length, support_tickets: tickets.rows.length,
        time_entries: timeEntries.rows.length,
      },
      legal_basis: 'GDPR Article 20 — Right to Data Portability; CCPA Section 1798.100 — Right to Know',
      manifest: [
        'officers', 'clients', 'shifts', 'invoices', 'payroll_records', 'incidents',
        'documents_metadata', 'audit_log', 'support_tickets', 'time_entries',
      ],
    },
    officers: officers.rows,
    clients: clients.rows,
    shifts: shiftsData.rows,
    invoices: invoices.rows,
    payroll_records: payroll.rows,
    incidents: incidents.rows,
    documents_metadata: documents.rows,
    audit_log: auditLog.rows,
    support_tickets: tickets.rows,
    time_entries: timeEntries.rows,
  };

  const jsonStr = JSON.stringify(exportData, null, 2);
  return Buffer.from(jsonStr, 'utf8');
}

// ── Route registration ────────────────────────────────────────────────────────

export function registerPrivacyRoutes(app: Express, requireAuth: any) {
  const router = express.Router();

  // ── Data subject requests ───────────────────────────────────────────────────

  // GET /api/privacy/requests — list DSRs (platform staff or org_owner)
  router.get('/requests', requireAuth, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const workspaceId = authReq.workspaceId || authReq.user?.workspaceId || authReq.user?.currentWorkspaceId;
      const role = userRole(authReq);

      let query: string;
      let params: any[];

      if (isAtLeast(authReq, 'platform_staff')) {
        // Platform staff sees all DSRs
        query = `SELECT * FROM data_subject_requests ORDER BY requested_at DESC LIMIT 200`;
        params = [];
      } else if (isAtLeast(authReq, 'org_owner') && workspaceId) {
        // Org owners see their workspace's DSRs
        query = `SELECT * FROM data_subject_requests WHERE workspace_id=$1 ORDER BY requested_at DESC`;
        params = [workspaceId];
      } else {
        // Officers see their own requests
        query = `SELECT * FROM data_subject_requests WHERE requestor_id=$1 ORDER BY requested_at DESC`;
        params = [authReq.user?.id!];
      }

      const { rows } = await pool.query(query, params);
      return res.json({ success: true, data: rows });
    } catch (error: unknown) {
      return res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  // POST /api/privacy/requests — submit a data subject request
  router.post('/requests', requireAuth, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const workspaceId = authReq.workspaceId || authReq.user?.workspaceId || authReq.user?.currentWorkspaceId;
      if (!workspaceId) return res.status(403).json({ success: false, error: 'No workspace' });

      const { request_type, requestor_type = 'officer', data_types_requested } = req.body;
      const validTypes = ['access', 'portability', 'erasure', 'restriction', 'correction', 'objection'];
      if (!validTypes.includes(request_type)) {
        return res.status(400).json({ success: false, error: `request_type must be one of: ${validTypes.join(', ')}` });
      }

      const { rows } = await pool.query(
        `INSERT INTO data_subject_requests (workspace_id, requestor_id, requestor_type, request_type, data_types_requested, sla_deadline)
         VALUES ($1,$2,$3,$4,$5, now() + interval '30 days')
         RETURNING *`,
        [workspaceId, authReq.user?.id, requestor_type, request_type, data_types_requested ?? null]
      );

      return res.status(201).json({ success: true, data: rows[0], message: 'Data subject request submitted. You will be notified within 30 days.' });
    } catch (error: unknown) {
      return res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  // PATCH /api/privacy/requests/:id — update DSR status (platform staff)
  router.patch('/requests/:id', requireAuth, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      if (!isAtLeast(authReq, 'platform_staff')) {
        return res.status(403).json({ success: false, error: 'Platform staff access required' });
      }

      const { id } = req.params;
      const { status, response_notes, data_types_retained, retention_reasons } = req.body;
      const validStatuses = ['received', 'under_review', 'approved', 'in_progress', 'completed', 'denied', 'partially_fulfilled'];

      const updates: string[] = ['updated_at=now()', 'handled_by=$2'];
      const params: any[] = [id, authReq.user?.id];

      if (status && validStatuses.includes(status)) {
        params.push(status);
        updates.push(`status=$${params.length}`);
        if (status === 'completed') {
          updates.push('completed_at=now()');
        }
        if (status === 'under_review') {
          updates.push('acknowledged_at=now()');
        }
      }
      if (response_notes) { params.push(response_notes); updates.push(`response_notes=$${params.length}`); }
      if (data_types_retained) { params.push(JSON.stringify(data_types_retained)); updates.push(`data_types_retained=$${params.length}`); }
      if (retention_reasons) { params.push(JSON.stringify(retention_reasons)); updates.push(`retention_reasons=$${params.length}`); }

      const { rows } = await pool.query(
        `UPDATE data_subject_requests SET ${updates.join(',')} WHERE id=$1 RETURNING *`,
        params
      );
      if (!rows.length) return res.status(404).json({ success: false, error: 'DSR not found' });
      return res.json({ success: true, data: rows[0] });
    } catch (error: unknown) {
      return res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  // ── Officer personal data export ────────────────────────────────────────────

  // POST /api/privacy/officer-export/:employeeId
  router.post('/officer-export/:employeeId', requireAuth, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const workspaceId = authReq.workspaceId || authReq.user?.workspaceId || authReq.user?.currentWorkspaceId;
      if (!workspaceId) return res.status(403).json({ success: false, error: 'No workspace' });

      const { employeeId } = req.params;

      // Officers can only export their own data; managers/platform staff can export any
      if (!isAtLeast(authReq, 'manager') && authReq.user?.id !== employeeId) {
        return res.status(403).json({ success: false, error: 'You can only request your own data export' });
      }

      const exportBuffer = await generateOfficerExport(employeeId, workspaceId);
      const filename = `officer-data-export-${employeeId}-${Date.now()}.json`;

      const token = await createDownloadToken({
        workspaceId,
        requestorId: authReq.user?.id!,
        exportType: 'officer_personal_data',
        filename,
        contentType: 'application/json',
        data: exportBuffer,
        expiryHours: 48,
      });

      // Log DSR record
      await pool.query(
        `INSERT INTO data_subject_requests (workspace_id, requestor_id, requestor_type, request_type, status, data_types_requested, export_url, export_expires_at, completed_at)
         VALUES ($1,$2,'officer','access','completed',ARRAY['all'],$3, now() + interval '48 hours', now())`,
        [workspaceId, authReq.user?.id, `/api/privacy/download/${token}`]
      );

      // Append DSR audit record
      await universalAudit.log({
        workspaceId,
        actorId: authReq.user?.id,
        actorType: 'user',
        action: 'data_export',
        entityType: 'employee',
        entityId: employeeId,
        changeType: 'action',
        metadata: { export_type: 'officer_personal_data', token_created: true },
      });

      return res.json({
        success: true,
        data: {
          download_url: `/api/privacy/download/${token}`,
          filename,
          expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          expiry_hours: 48,
          file_size_bytes: exportBuffer.length,
        },
        message: 'Personal data export ready. Download link expires in 48 hours.',
      });
    } catch (error: unknown) {
      log.error('[Privacy] Officer export error:', error);
      return res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  // ── Workspace portability export ────────────────────────────────────────────

  // POST /api/privacy/workspace-export
  router.post('/workspace-export', requireAuth, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      if (!isAtLeast(authReq, 'org_owner')) {
        return res.status(403).json({ success: false, error: 'Only org_owner can request workspace data export' });
      }

      const workspaceId = authReq.workspaceId || authReq.user?.workspaceId || authReq.user?.currentWorkspaceId;
      if (!workspaceId) return res.status(403).json({ success: false, error: 'No workspace' });

      const { confirm } = req.body;
      if (confirm !== 'I understand this will export all workspace data') {
        return res.status(400).json({
          success: false,
          error: 'Confirmation required',
          message: 'Set confirm: "I understand this will export all workspace data"',
        });
      }

      const exportBuffer = await generateWorkspaceExport(workspaceId);
      const sha256 = crypto.createHash('sha256').update(exportBuffer).digest('hex');
      const filename = `workspace-export-${workspaceId}-${Date.now()}.json`;

      const token = await createDownloadToken({
        workspaceId,
        requestorId: authReq.user?.id!,
        exportType: 'workspace_portability',
        filename,
        contentType: 'application/json',
        data: exportBuffer,
        expiryHours: 7 * 24, // 7 days
      });

      // Log DSR record
      await pool.query(
        `INSERT INTO data_subject_requests (workspace_id, requestor_id, requestor_type, request_type, status, data_types_requested, export_url, export_expires_at, completed_at)
         VALUES ($1,$2,'platform_user','portability','completed',ARRAY['all'],$3, now() + interval '7 days', now())`,
        [workspaceId, authReq.user?.id, `/api/privacy/download/${token}`]
      );

      // Audit record
      await universalAudit.log({
        workspaceId,
        actorId: authReq.user?.id,
        actorType: 'user',
        action: 'workspace_export',
        entityType: 'workspace',
        entityId: workspaceId,
        changeType: 'action',
        metadata: { sha256, filename, size_bytes: exportBuffer.length },
      });

      return res.json({
        success: true,
        data: {
          download_url: `/api/privacy/download/${token}`,
          filename,
          sha256_hash: sha256,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          expiry_days: 7,
          file_size_bytes: exportBuffer.length,
        },
        message: 'Workspace data export ready. SHA-256 hash provided for integrity verification. Download link expires in 7 days.',
      });
    } catch (error: unknown) {
      log.error('[Privacy] Workspace export error:', error);
      return res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  // ── Secure download endpoint ────────────────────────────────────────────────

  // GET /api/privacy/download/:token
  router.get('/download/:token', requireAuth, async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const entry = exportStore.get(token);

      if (!entry) {
        return res.status(404).json({ success: false, error: 'Download link not found or expired' });
      }

      if (entry.expiresAt < new Date()) {
        exportStore.delete(token);
        return res.status(410).json({ success: false, error: 'Download link has expired' });
      }

      // Mark as downloaded in DB
      await pool.query(
        `UPDATE export_download_tokens SET downloaded_at=now() WHERE token=$1`,
        [token]
      ).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

      res.setHeader('Content-Type', entry.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${entry.filename}"`);
      res.setHeader('X-Content-SHA256', entry.sha256);
      res.setHeader('Content-Length', entry.data.length);
      return res.send(entry.data);
    } catch (error: unknown) {
      return res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  // ── Cookie consent ──────────────────────────────────────────────────────────

  // GET /api/privacy/cookie-consent
  router.get('/cookie-consent', requireAuth, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const { rows } = await pool.query(
        `SELECT essential, functional, analytics, consented_at, updated_at FROM cookie_consent WHERE user_id=$1`,
        [authReq.user?.id]
      );
      return res.json({
        success: true,
        data: rows[0] ?? { essential: true, functional: false, analytics: false, consented_at: null },
      });
    } catch (error: unknown) {
      return res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  // POST /api/privacy/cookie-consent
  router.post('/cookie-consent', requireAuth, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const { functional = false, analytics = false } = req.body;
      const workspaceId = authReq.workspaceId || authReq.user?.workspaceId || authReq.user?.currentWorkspaceId;
      const ip = req.ip || req.socket?.remoteAddress;
      const ua = req.headers['user-agent'];

      await pool.query(
        `INSERT INTO cookie_consent (user_id, workspace_id, essential, functional, analytics, ip_address, user_agent)
         VALUES ($1,$2,true,$3,$4,$5,$6)
         ON CONFLICT (user_id) DO UPDATE SET functional=$3, analytics=$4, ip_address=$5, user_agent=$6, updated_at=now()`,
        [authReq.user?.id, workspaceId, functional, analytics, ip, ua]
      );

      return res.json({ success: true, message: 'Cookie preferences saved', data: { essential: true, functional, analytics } });
    } catch (error: unknown) {
      return res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  // ── Terms acceptance ────────────────────────────────────────────────────────

  // GET /api/privacy/terms-status
  router.get('/terms-status', requireAuth, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const { rows } = await pool.query(
        `SELECT terms_version, privacy_version, accepted_at FROM terms_acceptance
         WHERE user_id=$1 AND terms_version=$2 AND privacy_version=$3`,
        [authReq.user?.id, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION]
      );
      return res.json({
        success: true,
        data: {
          accepted: rows.length > 0,
          accepted_at: rows[0]?.accepted_at ?? null,
          current_terms_version: CURRENT_TERMS_VERSION,
          current_privacy_version: CURRENT_PRIVACY_VERSION,
        },
      });
    } catch (error: unknown) {
      return res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  // POST /api/privacy/terms-acceptance
  router.post('/terms-acceptance', requireAuth, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const workspaceId = authReq.workspaceId || authReq.user?.workspaceId || authReq.user?.currentWorkspaceId;
      const ip = req.ip || req.socket?.remoteAddress;

      await pool.query(
        `INSERT INTO terms_acceptance (user_id, workspace_id, terms_version, privacy_version, ip_address)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (user_id, terms_version) DO NOTHING`,
        [authReq.user?.id, workspaceId, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION, ip]
      );

      return res.json({
        success: true,
        message: 'Terms and privacy policy acceptance recorded',
        data: { terms_version: CURRENT_TERMS_VERSION, privacy_version: CURRENT_PRIVACY_VERSION, accepted_at: new Date().toISOString() },
      });
    } catch (error: unknown) {
      return res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  // ── Retention policies ──────────────────────────────────────────────────────

  // GET /api/privacy/retention-policies
  router.get('/retention-policies', requireAuth, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      if (!isAtLeast(authReq, 'platform_staff')) {
        return res.status(403).json({ success: false, error: 'Platform staff access required' });
      }
      const { rows } = await pool.query(`SELECT * FROM retention_policies ORDER BY data_type`);
      return res.json({ success: true, data: rows });
    } catch (error: unknown) {
      return res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  /**
   * POST /api/privacy/anonymize/:employeeId
   * OMEGA-L9: GDPR Right-to-Erasure — Employee PII hard-purge.
   *
   * Access: ORG_OWNER (own workspace only) or platform_staff (any workspace).
   * Workspace-scoped: ORG_OWNER can only anonymize employees in their own workspace.
   * Financial records (payroll, time entries, ledger rows) are retained but
   * personally-identifying fields are replaced with [ANONYMIZED-XXXXXXXX].
   * This satisfies the directive requirement that the core financial ledger
   * remains intact while employee identity is removed.
   */
  router.post('/anonymize/:employeeId', requireAuth, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const isOrgOwner = isAtLeast(authReq, 'org_owner');
      const isPlatformStaff = isAtLeast(authReq, 'platform_staff');

      if (!isOrgOwner && !isPlatformStaff) {
        return res.status(403).json({ success: false, error: 'ORG_OWNER or platform staff access required for PII anonymization' });
      }

      const { employeeId } = req.params;
      const workspaceId = authReq.workspaceId || authReq.user?.workspaceId || authReq.user?.currentWorkspaceId;

      if (!workspaceId) {
        return res.status(400).json({ success: false, error: 'Workspace context required' });
      }

      // Scope check: ORG_OWNER may only anonymize employees within their own workspace.
      const empCheck = await pool.query(
        `SELECT id, workspace_id FROM employees WHERE id=$1 LIMIT 1`,
        [employeeId]
      );
      if (!empCheck.rows.length) {
        return res.status(404).json({ success: false, error: 'Employee not found' });
      }
      if (isOrgOwner && !isPlatformStaff && empCheck.rows[0].workspace_id !== workspaceId) {
        return res.status(403).json({ success: false, error: 'You may only anonymize employees within your own workspace' });
      }

      const placeholder = `[ANONYMIZED-${employeeId.slice(0, 8)}]`;

      // Anonymize PII fields — IRREVERSIBLE.
      // WHERE clause includes workspace_id to prevent cross-tenant mutation by platform_staff
      // operating with a specific workspace context.
      await pool.query(
        `UPDATE employees SET
           first_name=$2, last_name=$2, email=$2, phone=$2,
           address=$2, city=$2, state=$2, zip_code=$2,
           date_of_birth=NULL, emergency_contact_name=$2,
           emergency_contact_phone=$2, emergency_contact_relation=$2,
           ssn_hash=$2, ssn_last4=$2
         WHERE id=$1 AND workspace_id=$3`,
        [employeeId, placeholder, empCheck.rows[0].workspace_id]
      );

      await universalAudit.log({
        workspaceId: empCheck.rows[0].workspace_id,
        actorId: authReq.user?.id,
        actorType: 'user',
        action: 'pii_anonymization',
        entityType: 'employee',
        entityId: employeeId,
        changeType: 'delete',
        metadata: {
          anonymized_fields: ['first_name','last_name','email','phone','address','city','state','zip_code','date_of_birth','emergency_contact_name','emergency_contact_phone','emergency_contact_relation','ssn_hash','ssn_last4'],
          anonymized_by: authReq.user?.id,
          actor_role: userRole(authReq),
          placeholder,
          irreversible: true,
          retained_for_legal: ['payroll_records', 'time_entries', 'compliance_records', 'shift_history'],
        },
      });

      return res.json({
        success: true,
        message: 'Employee PII anonymized. This action is irreversible.',
        data: {
          employee_id: employeeId,
          anonymized_fields: 14,
          placeholder,
          retained: ['payroll_records', 'time_entries', 'compliance_records', 'shift_history'],
        },
      });
    } catch (error: unknown) {
      return res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  /**
   * POST /api/privacy/anonymize-client/:clientId
   * OMEGA-L9: GDPR Right-to-Erasure — Client (business contact) PII hard-purge.
   *
   * Access: ORG_OWNER (own workspace only) or platform_staff.
   * Anonymizes client contact PII while preserving the financial ledger
   * (invoices, payment records) by replacing identity fields with a placeholder.
   * Client record is retained (not deleted) so shift and invoice history remains intact.
   */
  router.post('/anonymize-client/:clientId', requireAuth, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const isOrgOwner = isAtLeast(authReq, 'org_owner');
      const isPlatformStaff = isAtLeast(authReq, 'platform_staff');

      if (!isOrgOwner && !isPlatformStaff) {
        return res.status(403).json({ success: false, error: 'ORG_OWNER or platform staff access required for client PII anonymization' });
      }

      const { clientId } = req.params;
      const workspaceId = authReq.workspaceId || authReq.user?.workspaceId || authReq.user?.currentWorkspaceId;

      if (!workspaceId) {
        return res.status(400).json({ success: false, error: 'Workspace context required' });
      }

      const clientCheck = await pool.query(
        `SELECT id, workspace_id FROM clients WHERE id=$1 LIMIT 1`,
        [clientId]
      );
      if (!clientCheck.rows.length) {
        return res.status(404).json({ success: false, error: 'Client not found' });
      }
      if (isOrgOwner && !isPlatformStaff && clientCheck.rows[0].workspace_id !== workspaceId) {
        return res.status(403).json({ success: false, error: 'You may only anonymize clients within your own workspace' });
      }

      const placeholder = `[ANONYMIZED-${clientId.slice(0, 8)}]`;

      // Anonymize client contact PII — financial records (invoices, payments) are retained.
      await pool.query(
        `UPDATE clients SET
           name=$2, email=$2, phone=$2,
           contact_name=$2, contact_email=$2, contact_phone=$2,
           address=$2, city=$2, state=$2, zip_code=$2
         WHERE id=$1 AND workspace_id=$3`,
        [clientId, placeholder, clientCheck.rows[0].workspace_id]
      );

      const anonymizedFields = ['name','email','phone','contact_name','contact_email','contact_phone','address','city','state','zip_code'];

      await universalAudit.log({
        workspaceId: clientCheck.rows[0].workspace_id,
        actorId: authReq.user?.id,
        actorType: 'user',
        action: 'client_pii_anonymization',
        entityType: 'client',
        entityId: clientId,
        changeType: 'delete',
        metadata: {
          anonymized_fields: anonymizedFields,
          anonymized_by: authReq.user?.id,
          actor_role: userRole(authReq),
          placeholder,
          irreversible: true,
          retained_for_legal: ['invoices', 'payment_records', 'contracts', 'shift_history'],
        },
      });

      return res.json({
        success: true,
        message: 'Client PII anonymized. Financial records are retained. This action is irreversible.',
        data: {
          client_id: clientId,
          anonymized_fields: anonymizedFields.length,
          placeholder,
          retained: ['invoices', 'payment_records', 'contracts', 'shift_history'],
        },
      });
    } catch (error: unknown) {
      return res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  app.use('/api/privacy', router);
}
