/**
 * Regulatory Auditor Seeder — ACME Sandbox
 * =========================================
 * Provisions a clearly-labelled "regulatory auditor" account that can sign
 * in via the existing /api/auditor surface and walk the ACME workspace
 * read-only. The user wanted a login they can drive themselves; we
 * therefore set a known sandbox password (overridable via env) and pre-
 * accept the current NDA + open an audit window so no manual setup is
 * required after the simulation runs.
 *
 * In production this entire flow is gated by env (PLAID_ENV / NODE_ENV) —
 * we *will not* provision a synthetic auditor against a real workspace.
 */

import bcrypt from 'bcryptjs';
import { pool } from '../../db';
import { isProduction } from '../../lib/isProduction';
import { createLogger } from '../../lib/logger';

const log = createLogger('RegulatoryAuditorSeeder');

export const SANDBOX_AUDITOR_EMAIL =
  process.env.SANDBOX_AUDITOR_EMAIL || 'inspector.demo@tdlr.texas.gov';

// Default sandbox password — override via env. The string is intentionally
// recognisable so a casual reader knows it's not a production credential.
export const SANDBOX_AUDITOR_PASSWORD =
  process.env.SANDBOX_AUDITOR_PASSWORD || 'AcmeSandbox!Auditor#2026';

export interface AuditorSeedResult {
  auditorId: string;
  email: string;
  password: string;     // surfaced only in non-prod sims
  workspaceId: string;
  auditId: string;
  ndaAccepted: boolean;
  loginUrl: string;
  notes: string[];
}

/**
 * Provision (or refresh) a sandbox regulatory auditor and tie them to a
 * 30-day audit window on the supplied workspace.
 */
export async function seedRegulatoryAuditor(opts: {
  workspaceId: string;
  baseUrl?: string;
}): Promise<AuditorSeedResult> {
  if (isProduction()) {
    throw new Error(
      'seedRegulatoryAuditor refused: production environment detected'
    );
  }
  const notes: string[] = [];

  // Reuse the auditor service's bootstrapper so all referenced tables
  // exist before we touch them.
  const access = await import('../auditor/auditorAccessService');
  // Hit a no-op call so its private ensureTables() runs.
  try { await access.computeComplianceScore(opts.workspaceId); } catch { /* expected on empty */ }

  const passwordHash = await bcrypt.hash(SANDBOX_AUDITOR_PASSWORD, 12);

  // 1. Upsert the auditor account in 'active' state with NDA pre-accepted.
  const upsert = await pool.query(
    `INSERT INTO auditor_accounts
        (email, full_name, agency_name, regulatory_domain, status,
         password_hash, last_auth_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'active', $5, NOW(), NOW(), NOW())
     ON CONFLICT (email) DO UPDATE SET
        full_name        = EXCLUDED.full_name,
        agency_name      = EXCLUDED.agency_name,
        regulatory_domain= EXCLUDED.regulatory_domain,
        status           = 'active',
        password_hash    = EXCLUDED.password_hash,
        updated_at       = NOW()
     RETURNING id`,
    [
      SANDBOX_AUDITOR_EMAIL,
      'Sandbox Regulatory Inspector (DEMO)',
      'Texas DPS — Private Security Bureau (DEMO)',
      'tdlr.texas.gov',
      passwordHash,
    ]
  );
  const auditorId: string = upsert.rows[0].id;
  notes.push(`auditor_account upserted ${auditorId}`);

  // 2. Pre-accept the current NDA.
  const ndaVersion = process.env.AUDITOR_NDA_VERSION || 'v1.0-sandbox';
  await pool.query(
    `INSERT INTO auditor_nda_acceptances
        (auditor_id, nda_version, accepted_at, signature_name)
     VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (auditor_id, nda_version) DO NOTHING`,
    [auditorId, ndaVersion, 'Sandbox Inspector (DEMO)']
  );
  notes.push(`NDA ${ndaVersion} pre-accepted`);

  // 3. Open or refresh an audit window on the ACME workspace.
  const audit = await pool.query(
    `INSERT INTO auditor_audits
        (auditor_id, workspace_id, license_number, scope, status,
         opened_at, closes_at, notes, created_at, updated_at)
     VALUES ($1, $2, $3, 'read_print', 'active',
             NOW(), NOW() + INTERVAL '30 days',
             'Sandbox audit — provisioned by ACME simulation harness', NOW(), NOW())
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [auditorId, opts.workspaceId, 'TX-PSB-DEMO-AUDIT-0001']
  );
  let auditId: string;
  if (audit.rows.length > 0) {
    auditId = audit.rows[0].id;
    notes.push(`new audit window opened (${auditId})`);
  } else {
    const existing = await pool.query(
      `SELECT id FROM auditor_audits
        WHERE auditor_id = $1 AND workspace_id = $2 AND status = 'active'
        ORDER BY opened_at DESC LIMIT 1`,
      [auditorId, opts.workspaceId]
    );
    auditId = existing.rows[0]?.id ?? 'unknown';
    notes.push(`reused existing active audit ${auditId}`);
  }

  // 4. Allow-list the auditor on this workspace explicitly so the
  //    isAuditorEmailAllowed() heuristic doesn't depend on the global
  //    .gov regex matching.
  await pool.query(
    `INSERT INTO workspace_auditor_allowlist
        (workspace_id, email, full_name, agency_name, notes, added_by, is_active, created_at, updated_at)
     VALUES ($1, LOWER($2), $3, $4, $5, $6, true, NOW(), NOW())
     ON CONFLICT (workspace_id, email) DO UPDATE SET is_active = true, updated_at = NOW()`,
    [
      opts.workspaceId,
      SANDBOX_AUDITOR_EMAIL,
      'Sandbox Regulatory Inspector (DEMO)',
      'Texas DPS — Private Security Bureau (DEMO)',
      'Provisioned by ACME sandbox simulation harness',
      'sandbox_simulation',
    ]
  );
  notes.push('workspace allow-list entry recorded');

  const baseUrl = (opts.baseUrl || process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '');

  log.info(
    `[Auditor] Sandbox auditor provisioned: ${SANDBOX_AUDITOR_EMAIL} → audit ${auditId}`
  );

  return {
    auditorId,
    email: SANDBOX_AUDITOR_EMAIL,
    password: SANDBOX_AUDITOR_PASSWORD,
    workspaceId: opts.workspaceId,
    auditId,
    ndaAccepted: true,
    loginUrl: `${baseUrl}/auditor-portal`,
    notes,
  };
}
