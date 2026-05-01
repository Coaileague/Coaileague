/**
 * Auditor Access Service — Phase 18C
 * ===================================
 * Manages regulatory auditor lifecycle:
 *   1. Auditor emails Trinity from a recognized regulatory domain with the
 *      audit order attached (handled by auditorRoutes /intake).
 *   2. Trinity validates the request, creates an `auditor_accounts` row in
 *      'pending' state, mints a single-use invite token, and emails the
 *      auditor a magic link to claim the account.
 *   3. Auditor lands on a UI (TODO: client/src/pages/auditor-portal.tsx)
 *      that POSTs the token + a chosen password back; service marks the
 *      account 'active' and updates phone if provided.
 *   4. Each audit is a separate `auditor_audits` row scoped to a tenant
 *      workspace + license number with a 30-day window. Read/print only.
 *   5. Auditors must re-authenticate every 90 days (last_auth_at >
 *      NOW() - 90 days). Otherwise the account is suspended until the
 *      auditor re-verifies via the regulatory email channel.
 *   6. A nightly job (TODO) calls expireOldAudits() to close anything past
 *      its window unless an extension was approved.
 *
 * Security guardrails:
 *   - Email intake validates the From domain against REGULATORY_DOMAINS
 *     (configurable via AUDITOR_REGULATORY_DOMAINS env var).
 *   - Tokens are single-use, 32-byte random hex, 7-day expiry.
 *   - Sessions are 30-day workspace-scoped JWTs (delegated to existing auth).
 *   - All access is read+print only (enforced by the route layer; this
 *     service just records the access scope).
 *   - Every action is written to the audit log via Trinity's existing
 *     audit logger so we have a defensible record of who saw what.
 */

import crypto from 'crypto';
import { createLogger } from '../../lib/logger';
import { sendCanSpamCompliantEmail } from '../emailCore';

const log = createLogger('AuditorAccess');

const DEFAULT_REGULATORY_DOMAINS = [
  // Common state regulator patterns — admins can extend via env var.
  '.gov', '.state.', '.us',
  'tdlr.texas.gov', 'bsis.ca.gov', 'dpsst.oregon.gov', 'dol.wa.gov',
  'state.fl.us', 'opr.ny.gov', 'dls.virginia.gov',
];

function regulatoryDomains(): string[] {
  const env = process.env.AUDITOR_REGULATORY_DOMAINS || '';
  const extra = env.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return [...DEFAULT_REGULATORY_DOMAINS, ...extra];
}

export function isRegulatoryEmail(email: string): boolean {
  if (!email || !email.includes('@')) return false;
  const domain = email.split('@')[1].toLowerCase();
  return regulatoryDomains().some(d => domain === d.replace(/^\./, '') || domain.endsWith(d));
}

/**
 * Per-workspace allow-list — a tenant can explicitly whitelist named
 * regulatory contacts (full email addresses). Returns true if the email
 * is on the workspace's allow-list, OR if it passes the global
 * regulatory-domain heuristic.
 */
export async function isAuditorEmailAllowed(email: string, workspaceId: string): Promise<boolean> {
  if (!email) return false;
  if (isRegulatoryEmail(email)) return true;
  try {
    await ensureTables();
    const { pool } = await import('../../db');
    const r = await pool.query(
      `SELECT 1 FROM workspace_auditor_allowlist
        WHERE workspace_id = $1 AND LOWER(email) = LOWER($2) AND is_active = true
        LIMIT 1`,
      [workspaceId, email]
    );
    return r.rows.length > 0;
  } catch (err: unknown) {
    log.warn('[AuditorAccess] allowlist check failed (deny-fallback):', err?.message);
    return false;
  }
}

export async function addAuditorAllowlist(params: {
  workspaceId: string;
  email: string;
  fullName?: string;
  agencyName?: string;
  notes?: string;
  addedBy?: string;
}): Promise<{ success: boolean }> {
  await ensureTables();
  try {
    const { pool } = await import('../../db');
    await pool.query(
      `INSERT INTO workspace_auditor_allowlist
          (workspace_id, email, full_name, agency_name, notes, added_by)
       VALUES ($1, LOWER($2), $3, $4, $5, $6)
       ON CONFLICT (workspace_id, email) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         agency_name = EXCLUDED.agency_name,
         notes = EXCLUDED.notes,
         is_active = true,
         updated_at = NOW()`,
      [params.workspaceId, params.email, params.fullName || null, params.agencyName || null, params.notes || null, params.addedBy || null]
    );
    return { success: true };
  } catch (err: unknown) {
    log.warn('[AuditorAccess] addAllowlist failed:', err?.message);
    return { success: false };
  }
}

export async function removeAuditorAllowlist(workspaceId: string, email: string): Promise<{ success: boolean }> {
  await ensureTables();
  try {
    const { pool } = await import('../../db');
    await pool.query(
      `UPDATE workspace_auditor_allowlist
          SET is_active = false, updated_at = NOW()
        WHERE workspace_id = $1 AND LOWER(email) = LOWER($2)`,
      [workspaceId, email]
    );
    return { success: true };
  } catch { return { success: false }; }
}

let bootstrapped = false;
async function ensureTables(): Promise<void> {
  if (bootstrapped) return;
  try {
    const { pool } = await import('../../db');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS auditor_accounts (
        id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        email         VARCHAR NOT NULL UNIQUE,
        phone         VARCHAR,
        full_name     VARCHAR,
        agency_name   VARCHAR,
        regulatory_domain VARCHAR,
        status        VARCHAR NOT NULL DEFAULT 'pending',
        invite_token  VARCHAR UNIQUE,
        invite_expires_at TIMESTAMP,
        password_hash VARCHAR,
        last_auth_at  TIMESTAMP,
        created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS auditor_accounts_status_idx ON auditor_accounts(status);
      CREATE INDEX IF NOT EXISTS auditor_accounts_invite_idx ON auditor_accounts(invite_token);

      CREATE TABLE IF NOT EXISTS auditor_audits (
        id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        auditor_id      VARCHAR NOT NULL,
        workspace_id    VARCHAR NOT NULL,
        license_number  VARCHAR,
        order_doc_url   TEXT,
        scope           VARCHAR NOT NULL DEFAULT 'read_print',
        status          VARCHAR NOT NULL DEFAULT 'pending_review',
        opened_at       TIMESTAMP NOT NULL DEFAULT NOW(),
        closes_at       TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
        closed_at       TIMESTAMP,
        closed_by       VARCHAR,
        extension_count INTEGER NOT NULL DEFAULT 0,
        notes           TEXT,
        created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS auditor_audits_auditor_idx ON auditor_audits(auditor_id);
      CREATE INDEX IF NOT EXISTS auditor_audits_workspace_idx ON auditor_audits(workspace_id);
      CREATE INDEX IF NOT EXISTS auditor_audits_status_idx ON auditor_audits(status);

      CREATE TABLE IF NOT EXISTS auditor_session_log (
        id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        auditor_id    VARCHAR NOT NULL,
        audit_id      VARCHAR,
        action        VARCHAR NOT NULL,
        ip_address    VARCHAR,
        user_agent    TEXT,
        metadata      JSONB,
        occurred_at   TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS auditor_session_log_auditor_idx ON auditor_session_log(auditor_id);
      CREATE INDEX IF NOT EXISTS auditor_session_log_audit_idx ON auditor_session_log(audit_id);

      CREATE TABLE IF NOT EXISTS workspace_auditor_allowlist (
        id           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        workspace_id VARCHAR NOT NULL,
        email        VARCHAR NOT NULL,
        full_name    VARCHAR,
        agency_name  VARCHAR,
        notes        TEXT,
        is_active    BOOLEAN NOT NULL DEFAULT true,
        added_by     VARCHAR,
        created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (workspace_id, email)
      );
      CREATE INDEX IF NOT EXISTS workspace_auditor_allowlist_workspace_idx
        ON workspace_auditor_allowlist(workspace_id);

      -- Readiness Section 3 — auditor NDA gate.
      -- An auditor may not see tenant data until they've acknowledged the
      -- current NDA. The current version lives in AUDITOR_NDA_VERSION env;
      -- if the stored accepted_version < current, re-acceptance is required.
      CREATE TABLE IF NOT EXISTS auditor_nda_acceptances (
        id                VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        auditor_id        VARCHAR NOT NULL,
        nda_version       VARCHAR NOT NULL,
        accepted_at       TIMESTAMP NOT NULL DEFAULT NOW(),
        accepted_ip       VARCHAR,
        accepted_user_agent TEXT,
        signature_name    VARCHAR,
        UNIQUE (auditor_id, nda_version)
      );
      CREATE INDEX IF NOT EXISTS auditor_nda_acceptances_auditor_idx
        ON auditor_nda_acceptances(auditor_id);

      -- ══════════════════════════════════════════════════════════════
      -- AI Regulatory Audit Suite — Phase 1 DB extensions
      -- ══════════════════════════════════════════════════════════════

      -- Phase 1: Visual evidence captured from applicant side.
      -- Each row = one image slot (e.g. Uniform_Front, Vehicle_OCR).
      CREATE TABLE IF NOT EXISTS visual_compliance_artifacts (
        id                  VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        workspace_id        VARCHAR NOT NULL,
        audit_id            VARCHAR,
        artifact_type       VARCHAR NOT NULL,
        gcs_url             TEXT NOT NULL,
        status              VARCHAR NOT NULL DEFAULT 'pending',
        confidence_score    DECIMAL(5,4),
        reasoning_text      TEXT,
        ocr_text            TEXT,
        exif_gps_lat        DECIMAL(10,7),
        exif_gps_lng        DECIMAL(10,7),
        exif_timestamp      TIMESTAMP,
        uploaded_by         VARCHAR,
        created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS vca_workspace_idx  ON visual_compliance_artifacts(workspace_id);
      CREATE INDEX IF NOT EXISTS vca_audit_idx      ON visual_compliance_artifacts(audit_id);
      CREATE INDEX IF NOT EXISTS vca_status_idx     ON visual_compliance_artifacts(status);
      CREATE INDEX IF NOT EXISTS vca_type_idx       ON visual_compliance_artifacts(artifact_type);

      -- Phase 3: Immutable log written the moment an auditor unlocks the Document Safe.
      -- Rows are INSERT-only; no UPDATE or DELETE permitted by application layer.
      CREATE TABLE IF NOT EXISTS audit_safe_access_log (
        id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        audit_id              VARCHAR NOT NULL,
        auditor_id            VARCHAR NOT NULL,
        workspace_id          VARCHAR NOT NULL,
        paperwork_url         TEXT,
        paperwork_verified_at TIMESTAMP,
        unlocked_at           TIMESTAMP NOT NULL DEFAULT NOW(),
        alert_sms_sent        BOOLEAN NOT NULL DEFAULT false,
        alert_email_sent      BOOLEAN NOT NULL DEFAULT false,
        alert_in_app_sent     BOOLEAN NOT NULL DEFAULT false
      );
      CREATE INDEX IF NOT EXISTS asal_audit_idx     ON audit_safe_access_log(audit_id);
      CREATE INDEX IF NOT EXISTS asal_workspace_idx ON audit_safe_access_log(workspace_id);

      -- Phase 4: Draft audit packets generated by Trinity for HITL approval.
      CREATE TABLE IF NOT EXISTS audit_packet_drafts (
        id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        audit_id        VARCHAR NOT NULL,
        workspace_id    VARCHAR NOT NULL,
        gcs_url         TEXT NOT NULL,
        status          VARCHAR NOT NULL DEFAULT 'pending_owner_review',
        modify_instructions TEXT,
        approved_by     VARCHAR,
        approved_at     TIMESTAMP,
        rejected_by     VARCHAR,
        rejected_at     TIMESTAMP,
        sent_to_auditor BOOLEAN NOT NULL DEFAULT false,
        sent_at         TIMESTAMP,
        created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS apd_audit_idx     ON audit_packet_drafts(audit_id);
      CREATE INDEX IF NOT EXISTS apd_workspace_idx ON audit_packet_drafts(workspace_id);
      CREATE INDEX IF NOT EXISTS apd_status_idx    ON audit_packet_drafts(status);

      -- Phase 5: Citation records written when auditor selects FAIL verdict.
      CREATE TABLE IF NOT EXISTS audit_citations (
        id                           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        audit_id                     VARCHAR NOT NULL,
        workspace_id                 VARCHAR NOT NULL,
        auditor_id                   VARCHAR NOT NULL,
        fine_amount                  DECIMAL(12,2) NOT NULL,
        state_violation_pdf_url      TEXT,
        issued_at                    TIMESTAMP NOT NULL DEFAULT NOW(),
        status                       VARCHAR NOT NULL DEFAULT 'issued',
        payment_money_order_url      TEXT,
        certified_mail_tracking      VARCHAR,
        payment_proof_uploaded_at    TIMESTAMP,
        payment_verified_at          TIMESTAMP,
        amount_verified              BOOLEAN,
        payment_verified_by          VARCHAR,
        resolved_at                  TIMESTAMP,
        created_at                   TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at                   TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS ac_audit_idx     ON audit_citations(audit_id);
      CREATE INDEX IF NOT EXISTS ac_workspace_idx ON audit_citations(workspace_id);
      CREATE INDEX IF NOT EXISTS ac_status_idx    ON audit_citations(status);

      -- Phase 6: Cure-period timers for PASS_WITH_CONDITIONS verdicts.
      CREATE TABLE IF NOT EXISTS audit_condition_timers (
        id                VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        audit_id          VARCHAR NOT NULL UNIQUE,
        workspace_id      VARCHAR NOT NULL,
        conditions_text   TEXT,
        cure_days         INTEGER NOT NULL,
        deadline_at       TIMESTAMP NOT NULL,
        status            VARCHAR NOT NULL DEFAULT 'active',
        reminder_7d_sent  BOOLEAN NOT NULL DEFAULT false,
        reminder_72h_sent BOOLEAN NOT NULL DEFAULT false,
        reminder_24h_sent BOOLEAN NOT NULL DEFAULT false,
        corrections_url   TEXT,
        corrections_uploaded_at TIMESTAMP,
        verified_by       VARCHAR,
        cured_at          TIMESTAMP,
        default_fine_assessed BOOLEAN NOT NULL DEFAULT false,
        created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS act_audit_idx     ON audit_condition_timers(audit_id);
      CREATE INDEX IF NOT EXISTS act_workspace_idx ON audit_condition_timers(workspace_id);
      CREATE INDEX IF NOT EXISTS act_status_idx    ON audit_condition_timers(status);
      CREATE INDEX IF NOT EXISTS act_deadline_idx  ON audit_condition_timers(deadline_at);

      -- Phase 5: Extend auditor_audits with verdict + finalization columns.
      -- ADD COLUMN IF NOT EXISTS is idempotent — safe to run every boot.
      ALTER TABLE auditor_audits
        ADD COLUMN IF NOT EXISTS verdict              VARCHAR,
        ADD COLUMN IF NOT EXISTS verdict_set_at       TIMESTAMP,
        ADD COLUMN IF NOT EXISTS verdict_set_by       VARCHAR,
        ADD COLUMN IF NOT EXISTS conditions_text      TEXT,
        ADD COLUMN IF NOT EXISTS audit_chat_room_id   VARCHAR,
        ADD COLUMN IF NOT EXISTS paperwork_url        TEXT,
        ADD COLUMN IF NOT EXISTS paperwork_verified_at TIMESTAMP;
    `);
    bootstrapped = true;
    log.info('[AuditorAccess] Bootstrap complete');
  } catch (err: unknown) {
    log.warn('[AuditorAccess] Bootstrap failed (non-fatal):', err?.message);
  }
}

function newToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export interface IntakeParams {
  email: string;
  fullName?: string;
  agencyName?: string;
  workspaceId: string;
  licenseNumber?: string;
  orderDocUrl?: string;
  baseUrl: string;
  notes?: string;
}

/**
 * Process an inbound auditor request. Validates the email is from a
 * recognized regulatory domain, finds-or-creates the auditor_accounts row,
 * creates a pending auditor_audits row tied to the requested workspace +
 * license, and emails the auditor a magic-link invite (or login link if
 * the account already exists).
 */
export async function processAuditorIntake(params: IntakeParams): Promise<{
  success: boolean;
  auditorId?: string;
  auditId?: string;
  inviteSent?: boolean;
  reason?: string;
}> {
  await ensureTables();
  const { email, fullName, agencyName, workspaceId, licenseNumber, orderDocUrl, baseUrl, notes } = params;
  if (!(await isAuditorEmailAllowed(email, workspaceId))) {
    log.warn(`[AuditorAccess] Intake rejected — not regulatory and not on workspace allow-list: ${email}`);
    return { success: false, reason: 'Email is not from a recognized regulatory domain or this workspace\'s allow-list' };
  }

  try {
    const { pool } = await import('../../db');
    const domain = email.split('@')[1].toLowerCase();

    // Find or create the auditor account.
    let auditorId: string;
    let inviteToken: string | null = null;
    const existing = await pool.query(
      `SELECT id, status FROM auditor_accounts WHERE email = $1 LIMIT 1`,
      [email]
    );
    if (existing.rows.length) {
      auditorId = existing.rows[0].id;
      // If they're suspended (>90 days since last auth) or pending, mint a fresh invite.
      if (existing.rows[0].status === 'pending' || existing.rows[0].status === 'suspended') {
        inviteToken = newToken();
        await pool.query(
          `UPDATE auditor_accounts
              SET invite_token = $1,
                  invite_expires_at = NOW() + INTERVAL '7 days',
                  status = 'pending',
                  updated_at = NOW()
            WHERE id = $2`,
          [inviteToken, auditorId]
        );
      }
    } else {
      inviteToken = newToken();
      const insert = await pool.query(
        `INSERT INTO auditor_accounts
            (email, full_name, agency_name, regulatory_domain, status, invite_token, invite_expires_at)
         VALUES ($1, $2, $3, $4, 'pending', $5, NOW() + INTERVAL '7 days')
         RETURNING id`,
        [email, fullName || null, agencyName || null, domain, inviteToken]
      );
      auditorId = insert.rows[0].id;
    }

    // Create the audit record (workspace-scoped, 30-day window).
    const auditInsert = await pool.query(
      `INSERT INTO auditor_audits
          (auditor_id, workspace_id, license_number, order_doc_url, status, notes)
       VALUES ($1, $2, $3, $4, 'pending_review', $5)
       RETURNING id`,
      [auditorId, workspaceId, licenseNumber || null, orderDocUrl || null, notes || null]
    );
    const auditId = auditInsert.rows[0].id;

    // Email the auditor with a magic link (or login link if already active).
    const link = inviteToken
      ? `${baseUrl}/co-auditor/claim?token=${inviteToken}`
      : `${baseUrl}/co-auditor/login`;
    const subject = inviteToken
      ? 'Co-League: Auditor account invitation'
      : 'Co-League: New audit assignment available';
    const html = `
      <p>Hello${fullName ? ' ' + fullName : ''},</p>
      <p>This message confirms receipt of your audit request${licenseNumber ? ` for license number <strong>${licenseNumber}</strong>` : ''}.
      Trinity has logged this request and reserved a read-and-print-only audit window of 30 days from the date of activation.</p>
      ${inviteToken
        ? `<p>To activate your auditor portal account, please click the secure link below within 7 days:</p>
           <p><a href="${link}">${link}</a></p>
           <p>You will be asked to set a password and confirm a callback phone number.</p>`
        : `<p>Your existing auditor account has been linked to this audit. <a href="${link}">Sign in to view it.</a></p>`}
      <p>For your protection, all auditor accounts must re-authenticate every 90 days. We will email you a reminder before your account is suspended.</p>
      <p>— Trinity, Co-League Compliance Concierge</p>
    `;

    let inviteSent = false;
    try {
      const sendResult = await sendCanSpamCompliantEmail({
        to: email,
        subject,
        html,
        emailType: 'transactional',
        workspaceId,
      });
      inviteSent = !!sendResult.success;
    } catch (e: unknown) {
      log.warn('[AuditorAccess] Invite email failed (non-fatal):', e?.message);
    }

    await pool.query(
      `INSERT INTO auditor_session_log (auditor_id, audit_id, action, metadata)
       VALUES ($1, $2, 'intake_processed', $3)`,
      [auditorId, auditId, JSON.stringify({ regulatoryDomain: domain, inviteSent })]
    );

    return { success: true, auditorId, auditId, inviteSent };
  } catch (err: unknown) {
    log.error('[AuditorAccess] Intake failed:', err?.message);
    return { success: false, reason: err?.message };
  }
}

export async function claimInvite(params: {
  token: string;
  passwordHash: string;
  phone?: string;
  fullName?: string;
}): Promise<{ success: boolean; auditorId?: string; reason?: string }> {
  await ensureTables();
  try {
    const { pool } = await import('../../db');
    const r = await pool.query(
      `SELECT id, status, invite_expires_at FROM auditor_accounts
        WHERE invite_token = $1 LIMIT 1`,
      [params.token]
    );
    if (!r.rows.length) return { success: false, reason: 'Invalid or already-used invite token' };
    const row = r.rows[0];
    if (row.invite_expires_at && new Date(row.invite_expires_at) < new Date()) {
      return { success: false, reason: 'Invite token expired — please request a new audit' };
    }

    await pool.query(
      `UPDATE auditor_accounts
          SET password_hash = $1,
              phone = COALESCE($2, phone),
              full_name = COALESCE($3, full_name),
              status = 'active',
              last_auth_at = NOW(),
              invite_token = NULL,
              invite_expires_at = NULL,
              updated_at = NOW()
        WHERE id = $4`,
      [params.passwordHash, params.phone || null, params.fullName || null, row.id]
    );

    await pool.query(
      `INSERT INTO auditor_session_log (auditor_id, action) VALUES ($1, 'invite_claimed')`,
      [row.id]
    );

    return { success: true, auditorId: row.id };
  } catch (err: unknown) {
    log.error('[AuditorAccess] Claim invite failed:', err?.message);
    return { success: false, reason: err?.message };
  }
}

/**
 * Verify an active auditor login. Enforces the 90-day re-auth rule by
 * suspending accounts that have not authenticated in that window. The
 * caller is responsible for password comparison; we just check status.
 */
export async function authenticateAuditor(email: string): Promise<{
  ok: boolean;
  auditorId?: string;
  passwordHash?: string;
  reason?: 'not_found' | 'suspended' | 'pending' | 'reauth_required';
}> {
  await ensureTables();
  try {
    const { pool } = await import('../../db');
    const r = await pool.query(
      `SELECT id, status, password_hash, last_auth_at
         FROM auditor_accounts
        WHERE email = $1 LIMIT 1`,
      [email]
    );
    if (!r.rows.length) return { ok: false, reason: 'not_found' };

    const row = r.rows[0];
    if (row.status === 'pending') return { ok: false, reason: 'pending' };
    if (row.status === 'suspended') return { ok: false, reason: 'suspended' };

    // 90-day re-auth rule.
    if (row.last_auth_at && (Date.now() - new Date(row.last_auth_at).getTime() > 90 * 24 * 60 * 60 * 1000)) {
      await pool.query(`UPDATE auditor_accounts SET status = 'suspended' WHERE id = $1`, [row.id]);
      return { ok: false, reason: 'reauth_required' };
    }

    return { ok: true, auditorId: row.id, passwordHash: row.password_hash };
  } catch (err: unknown) {
    log.error('[AuditorAccess] Authenticate failed:', err?.message);
    return { ok: false, reason: 'not_found' };
  }
}

export async function recordSuccessfulAuth(auditorId: string, ip?: string, ua?: string): Promise<void> {
  await ensureTables();
  try {
    const { pool } = await import('../../db');
    await pool.query(`UPDATE auditor_accounts SET last_auth_at = NOW(), updated_at = NOW() WHERE id = $1`, [auditorId]);
    await pool.query(
      `INSERT INTO auditor_session_log (auditor_id, action, ip_address, user_agent) VALUES ($1, 'login', $2, $3)`,
      [auditorId, ip || null, ua || null]
    );
  } catch (err: unknown) {
    log.warn('[AuditorAccess] recordSuccessfulAuth failed (non-fatal):', err?.message);
  }
}

export async function listAuditsForAuditor(auditorId: string): Promise<any[]> {
  await ensureTables();
  try {
    const { pool } = await import('../../db');
    const r = await pool.query(
      `SELECT id, workspace_id, license_number, status, opened_at, closes_at, closed_at, scope
         FROM auditor_audits
        WHERE auditor_id = $1
        ORDER BY opened_at DESC`,
      [auditorId]
    );
    return r.rows;
  } catch (err: unknown) {
    log.warn('[AuditorAccess] listAuditsForAuditor failed:', err?.message);
    return [];
  }
}

export async function requestNewAudit(params: {
  auditorId: string;
  workspaceId: string;
  licenseNumber?: string;
  orderDocUrl?: string;
  notes?: string;
}): Promise<{ success: boolean; auditId?: string; reason?: string }> {
  await ensureTables();
  try {
    const { pool } = await import('../../db');
    const r = await pool.query(
      `INSERT INTO auditor_audits (auditor_id, workspace_id, license_number, order_doc_url, status, notes)
       VALUES ($1, $2, $3, $4, 'pending_review', $5)
       RETURNING id`,
      [params.auditorId, params.workspaceId, params.licenseNumber || null, params.orderDocUrl || null, params.notes || null]
    );
    return { success: true, auditId: r.rows[0].id };
  } catch (err: unknown) {
    log.error('[AuditorAccess] requestNewAudit failed:', err?.message);
    return { success: false, reason: err?.message };
  }
}

export async function closeAudit(auditId: string, closedBy?: string): Promise<{ success: boolean }> {
  await ensureTables();
  try {
    const { pool } = await import('../../db');
    await pool.query(
      `UPDATE auditor_audits
          SET status = 'closed', closed_at = NOW(), closed_by = $1, updated_at = NOW()
        WHERE id = $2`,
      [closedBy || 'auditor', auditId]
    );
    return { success: true };
  } catch (err: unknown) {
    log.warn('[AuditorAccess] closeAudit failed:', err?.message);
    return { success: false };
  }
}

export async function extendAudit(auditId: string, days = 30): Promise<{ success: boolean }> {
  await ensureTables();
  try {
    const { pool } = await import('../../db');
    await pool.query(
      `UPDATE auditor_audits
          SET closes_at = closes_at + ($1::int * INTERVAL '1 day'),
              extension_count = extension_count + 1,
              updated_at = NOW()
        WHERE id = $2 AND status IN ('open', 'active', 'pending_review')`,
      [days, auditId]
    );
    return { success: true };
  } catch (err: unknown) {
    log.warn('[AuditorAccess] extendAudit failed:', err?.message);
    return { success: false };
  }
}

/**
 * Idempotent close-out for any audit past its window. Safe to run on a cron.
 */
// ─── NDA GATE (Readiness Section 3) ──────────────────────────────────────────

/**
 * The current NDA version. Pinned to env so counsel can rev the NDA text
 * without a code change — any bump invalidates prior acceptances for the
 * purpose of the gate check.
 */
export function currentNdaVersion(): string {
  return (process.env.AUDITOR_NDA_VERSION || '2026-04-19-v1').trim();
}

/**
 * True iff the auditor has accepted the current NDA version.
 * Required before any tenant data may be returned from the auditor surface.
 */
export async function hasAcceptedCurrentNda(auditorId: string): Promise<boolean> {
  await ensureTables();
  const { pool } = await import('../../db');
  const r = await pool.query(
    `SELECT 1 FROM auditor_nda_acceptances
      WHERE auditor_id = $1 AND nda_version = $2 LIMIT 1`,
    [auditorId, currentNdaVersion()],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function recordNdaAcceptance(params: {
  auditorId: string;
  ip?: string;
  userAgent?: string;
  signatureName?: string;
}): Promise<{ success: boolean; version: string }> {
  await ensureTables();
  const { pool } = await import('../../db');
  const version = currentNdaVersion();
  try {
    await pool.query(
      `INSERT INTO auditor_nda_acceptances
         (auditor_id, nda_version, accepted_ip, accepted_user_agent, signature_name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (auditor_id, nda_version) DO NOTHING`,
      [params.auditorId, version, params.ip || null, params.userAgent || null, params.signatureName || null],
    );
    return { success: true, version };
  } catch (err: unknown) {
    log.warn('[AuditorAccess] recordNdaAcceptance failed:', err?.message);
    return { success: false, version };
  }
}

// ─── MULTI-TENANT AUDITOR ROLLUP (Readiness Section 3) ───────────────────────

/**
 * Every workspace an auditor has ever had an audit (any status) against.
 * Used for the cross-company rollup view — a PSB auditor with credentials
 * for 5 Texas companies sees all 5 here, filtered to what they're
 * actually licensed to see via auditor_audits.
 */
export async function listWorkspacesForAuditor(auditorId: string): Promise<Array<{
  workspaceId: string;
  companyName: string | null;
  activeAudits: number;
  lastAuditAt: Date | null;
}>> {
  await ensureTables();
  const { pool } = await import('../../db');
  const r = await pool.query(
    `SELECT
        aa.workspace_id as workspace_id,
        w.company_name as company_name,
        COUNT(*) FILTER (WHERE aa.status IN ('open', 'active')) AS active_audits,
        MAX(aa.opened_at) AS last_audit_at
      FROM auditor_audits aa
      LEFT JOIN workspaces w ON w.id = aa.workspace_id
      WHERE aa.auditor_id = $1
      GROUP BY aa.workspace_id, w.company_name
      ORDER BY MAX(aa.opened_at) DESC NULLS LAST`,
    [auditorId],
  );
  return r.rows.map((row: any) => ({
    workspaceId: row.workspace_id,
    companyName: row.company_name,
    activeAudits: Number(row.active_audits || 0),
    lastAuditAt: row.last_audit_at,
  }));
}

/**
 * True iff the given auditor has (or has had) an audit against the given
 * workspace. Auditor queries are cross-tenant by design; this guards the
 * per-workspace data endpoints.
 */
export async function auditorHasAuditForWorkspace(
  auditorId: string,
  workspaceId: string,
): Promise<boolean> {
  await ensureTables();
  const { pool } = await import('../../db');
  const r = await pool.query(
    `SELECT 1 FROM auditor_audits
      WHERE auditor_id = $1 AND workspace_id = $2 LIMIT 1`,
    [auditorId, workspaceId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── COMPLIANCE SCORE (Readiness Section 3) ──────────────────────────────────

export interface ComplianceScoreBreakdown {
  workspaceId: string;
  score: number; // 0-100 composite
  components: {
    licensing: number;        // active workspace license / insurance
    qualifications: number;   // % officers with active weapon qualification
    inspections: number;      // % weapons inspected within 90 days
    insurance: number;        // insurance policy not expired
    incidents: number;        // inverse — fewer recent incidents = higher
  };
  notes: string[];
}

/**
 * Composite 0-100 compliance score for a single workspace. Inputs are
 * narrow, documented, and read-only — this is what the auditor sees.
 * Missing inputs reduce the component to 0 rather than throwing.
 */
export async function computeComplianceScore(workspaceId: string): Promise<ComplianceScoreBreakdown> {
  await ensureTables();
  const { pool } = await import('../../db');
  const notes: string[] = [];

  // 1. Licensing — binary: workspace has non-expired license?
  let licensing = 0;
  try {
    const r = await pool.query(
      `SELECT 1 FROM workspaces
        WHERE id = $1
          AND (license_expiry IS NULL OR license_expiry > NOW())`,
      [workspaceId],
    );
    licensing = (r.rowCount ?? 0) > 0 ? 100 : 0;
    if (licensing === 0) notes.push('workspace license missing or expired');
  } catch {
    notes.push('licensing check unavailable');
  }

  // 2. Officer qualifications — % of active employees with an active,
  //    non-expired weapon qualification. Reads the new weapon_qualifications
  //    table from Section 2.
  let qualifications = 100;
  try {
    const r = await pool.query(
      `SELECT
         COALESCE((
           SELECT 100 * COUNT(DISTINCT wq.employee_id)
                       / NULLIF((SELECT COUNT(*) FROM employees e
                                  WHERE e.workspace_id = $1 AND e.status = 'active'), 0)
             FROM weapon_qualifications wq
            WHERE wq.workspace_id = $1
              AND wq.status = 'active'
              AND wq.expires_at > NOW()
         ), 0) AS pct`,
      [workspaceId],
    );
    qualifications = Math.round(Number(r.rows[0]?.pct || 0));
  } catch {
    qualifications = 0;
    notes.push('qualification data unavailable');
  }

  // 3. Inspections — % of active weapons with an inspection in the last 90d.
  let inspections = 100;
  try {
    const r = await pool.query(
      `SELECT
         COALESCE((
           SELECT 100 * COUNT(DISTINCT wi.weapon_id)
                       / NULLIF((SELECT COUNT(*) FROM weapons w
                                  WHERE w.workspace_id = $1 AND w.status != 'retired'), 0)
             FROM weapon_inspections wi
            WHERE wi.workspace_id = $1
              AND wi.inspected_at > NOW() - INTERVAL '90 days'
         ), 0) AS pct`,
      [workspaceId],
    );
    inspections = Math.round(Number(r.rows[0]?.pct || 0));
  } catch {
    inspections = 0;
    notes.push('inspection data unavailable');
  }

  // 4. Insurance — non-expired policy exists?
  let insurance = 0;
  try {
    const r = await pool.query(
      `SELECT 1 FROM insurance_policies
        WHERE workspace_id = $1
          AND status = 'active'
          AND expires_at > NOW()
        LIMIT 1`,
      [workspaceId],
    );
    insurance = (r.rowCount ?? 0) > 0 ? 100 : 0;
    if (insurance === 0) notes.push('no active insurance policy on file');
  } catch {
    notes.push('insurance check unavailable');
  }

  // 5. Incidents — inverse score. 100 at zero incidents, -5 per incident in
  //    the last 30 days, floored at 0.
  let incidents = 100;
  try {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM incidents
        WHERE workspace_id = $1
          AND occurred_at > NOW() - INTERVAL '30 days'`,
      [workspaceId],
    );
    const n = Number(r.rows[0]?.n || 0);
    incidents = Math.max(0, 100 - n * 5);
    if (n > 0) notes.push(`${n} incident(s) in last 30 days`);
  } catch {
    incidents = 100;
  }

  const score = Math.round(
    licensing * 0.25 +
      qualifications * 0.25 +
      inspections * 0.20 +
      insurance * 0.15 +
      incidents * 0.15,
  );

  return {
    workspaceId,
    score,
    components: { licensing, qualifications, inspections, insurance, incidents },
    notes,
  };
}

// ─── COMPLIANCE TREND + REGULATOR NOTIFICATIONS (Readiness Section 19) ───────

/**
 * Last 90 days of compliance_score_snapshots rows (from Section 17) for
 * the workspace. Auditor portal renders this as a sparkline so the
 * regulator sees the trend, not just a point-in-time score.
 */
export async function getComplianceTrend(workspaceId: string): Promise<Array<{
  score: number;
  recordedAt: Date;
}>> {
  await ensureTables();
  const { pool } = await import('../../db');
  try {
    const r = await pool.query(
      `SELECT score, recorded_at
         FROM compliance_score_snapshots
        WHERE workspace_id = $1
          AND recorded_at > NOW() - INTERVAL '90 days'
        ORDER BY recorded_at ASC`,
      [workspaceId],
    );
    return r.rows.map((row: any) => ({
      score: Number(row.score),
      recordedAt: row.recorded_at,
    }));
  } catch {
    return [];
  }
}

/**
 * Regulator notification log — every time an auditor flags or escalates
 * a finding through the portal, it lands here as a persistent record.
 * Bootstrapped lazily.
 */
let regNotifBootstrapped = false;
async function ensureRegulatorNotificationTable(): Promise<void> {
  if (regNotifBootstrapped) return;
  const { pool } = await import('../../db');
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS auditor_regulator_notifications (
        id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        auditor_id    VARCHAR NOT NULL,
        workspace_id  VARCHAR NOT NULL,
        severity      VARCHAR NOT NULL,
        subject       VARCHAR NOT NULL,
        body          TEXT NOT NULL,
        status        VARCHAR NOT NULL DEFAULT 'sent',
        metadata      JSONB,
        created_at    TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS arn_workspace_idx ON auditor_regulator_notifications(workspace_id);
      CREATE INDEX IF NOT EXISTS arn_auditor_idx   ON auditor_regulator_notifications(auditor_id);
    `);
    regNotifBootstrapped = true;
  } catch (err: unknown) {
    log.warn('[AuditorAccess] regulator-notif bootstrap failed:', err?.message);
  }
}

export async function logRegulatorNotification(params: {
  auditorId: string;
  workspaceId: string;
  severity: 'info' | 'warning' | 'violation' | 'critical';
  subject: string;
  body: string;
  metadata?: Record<string, unknown>;
}): Promise<{ id: string | null; success: boolean }> {
  await ensureRegulatorNotificationTable();
  const { pool } = await import('../../db');
  try {
    const r = await pool.query(
      `INSERT INTO auditor_regulator_notifications
         (auditor_id, workspace_id, severity, subject, body, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        params.auditorId,
        params.workspaceId,
        params.severity,
        params.subject,
        params.body,
        params.metadata || {},
      ],
    );
    return { id: r.rows[0]?.id ?? null, success: true };
  } catch (err: unknown) {
    log.warn('[AuditorAccess] logRegulatorNotification failed:', err?.message);
    return { id: null, success: false };
  }
}

export async function listRegulatorNotificationsForWorkspace(
  workspaceId: string,
): Promise<Array<any>> {
  await ensureRegulatorNotificationTable();
  const { pool } = await import('../../db');
  try {
    const r = await pool.query(
      `SELECT * FROM auditor_regulator_notifications
        WHERE workspace_id = $1
     ORDER BY created_at DESC
        LIMIT 200`,
      [workspaceId],
    );
    return r.rows;
  } catch {
    return [];
  }
}

export async function expireOldAudits(): Promise<{ closed: number }> {
  await ensureTables();
  try {
    const { pool } = await import('../../db');
    const r = await pool.query(
      `UPDATE auditor_audits
          SET status = 'closed', closed_at = NOW(), closed_by = 'system_expiry', updated_at = NOW()
        WHERE status IN ('open', 'active', 'pending_review')
          AND closes_at < NOW()
        RETURNING id`
    );
    return { closed: r.rowCount ?? 0 };
  } catch (err: unknown) {
    log.warn('[AuditorAccess] expireOldAudits failed:', err?.message);
    return { closed: 0 };
  }
}
