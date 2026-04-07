/**
 * server/services/universalIdService.ts
 * Phase 57 — Universal Identification System
 *
 * CANONICAL ID REGISTRY:
 *   ORG-TX-00142       → Workspace / Organization
 *   CLT-ACM-00891      → Client
 *   EMP-ACM-00034      → Employee / Officer
 *   USR-10847          → User account (platform-wide)
 *   SHF-20260329-00612 → Shift
 *   CLK-20260329-00847 → Clock-in record
 *   DOC-20260329-00291 → Document
 *
 * Rules:
 *   - All IDs are safe to say on a phone call
 *   - All IDs are unique at the appropriate scope
 *   - All entity resolvers use workspace isolation
 *   - Generation is atomic using DB sequence counters
 */

import { pool } from '../db';

// ─── Internal sequence counter (atomic, crash-safe via DB) ───────────────────

async function nextSequence(key: string): Promise<number> {
  const res = await pool.query<{ seq: string }>(
    `INSERT INTO universal_id_sequences (sequence_key, current_value)
     VALUES ($1, 1)
     ON CONFLICT (sequence_key) DO UPDATE
       SET current_value = universal_id_sequences.current_value + 1
     RETURNING current_value AS seq`,
    [key],
  );
  return parseInt(res.rows[0].seq, 10);
}

function pad(n: number, digits: number): string {
  return String(n).padStart(digits, '0');
}

function dateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1, 2);
  const day = pad(d.getDate(), 2);
  return `${y}${m}${day}`;
}

/** Derive a safe 2–4 char alphanumeric org short-code from a company name */
export function deriveOrgShort(companyName: string | null | undefined): string {
  if (!companyName) return 'ORG';
  // Strip non-alpha, take first 3 uppercase letters
  const cleaned = companyName.replace(/[^a-zA-Z]/g, '').toUpperCase();
  return cleaned.slice(0, 3) || 'ORG';
}

// ─── ORG ID ───────────────────────────────────────────────────────────────────
/**
 * Generate ORG-[STATE]-[NNNNN]
 * State defaults to "XX" if unknown.
 */
export async function generateOrgId(stateCode?: string | null): Promise<string> {
  const state = (stateCode || 'XX').toUpperCase().slice(0, 2);
  const seq = await nextSequence(`org:${state}`);
  return `ORG-${state}-${pad(seq, 5)}`;
}

// ─── CLIENT NUMBER ────────────────────────────────────────────────────────────
/**
 * Generate CLT-[ORG_SHORT]-[NNNNN]
 */
export async function generateClientNumber(workspaceId: string, orgShort?: string): Promise<string> {
  const short = (orgShort || 'ORG').toUpperCase().slice(0, 4);
  const seq = await nextSequence(`clt:${workspaceId}`);
  return `CLT-${short}-${pad(seq, 5)}`;
}

// ─── EMPLOYEE NUMBER ──────────────────────────────────────────────────────────
/**
 * Generate EMP-[ORG_SHORT]-[NNNNN]
 */
export async function generateEmployeeNumber(workspaceId: string, orgShort?: string): Promise<string> {
  const short = (orgShort || 'ORG').toUpperCase().slice(0, 4);
  const seq = await nextSequence(`emp:${workspaceId}`);
  return `EMP-${short}-${pad(seq, 5)}`;
}

// ─── USER NUMBER ─────────────────────────────────────────────────────────────
/**
 * Generate USR-[NNNNN] — platform-wide unique
 */
export async function generateUserNumber(): Promise<string> {
  const seq = await nextSequence('usr:platform');
  return `USR-${pad(seq, 5)}`;
}

// ─── SHIFT NUMBER ─────────────────────────────────────────────────────────────
/**
 * Generate SHF-[YYYYMMDD]-[NNNNN]
 */
export async function generateShiftNumber(date?: Date): Promise<string> {
  const ds = dateStr(date);
  const seq = await nextSequence(`shf:${ds}`);
  return `SHF-${ds}-${pad(seq, 5)}`;
}

// ─── CLOCK-IN REFERENCE ───────────────────────────────────────────────────────
/**
 * Generate CLK-[YYYYMMDD]-[NNNNN]
 */
export async function generateClockRef(date?: Date): Promise<string> {
  const ds = dateStr(date);
  const seq = await nextSequence(`clk:${ds}`);
  return `CLK-${ds}-${pad(seq, 5)}`;
}

// ─── DOCUMENT NUMBER ──────────────────────────────────────────────────────────
/**
 * Generate DOC-[YYYYMMDD]-[NNNNN]
 */
export async function generateDocumentNumber(date?: Date): Promise<string> {
  const ds = dateStr(date);
  const seq = await nextSequence(`doc:${ds}`);
  return `DOC-${ds}-${pad(seq, 5)}`;
}

// ─── ENTITY RESOLVER ─────────────────────────────────────────────────────────
/**
 * Resolve any universal ID to its database record.
 * Workspace-isolated for CLT/EMP/SHF/CLK/DOC.
 * Platform-wide for ORG/USR.
 */
export interface ResolvedEntity {
  type: string;
  id: string;
  humanId: string;
  workspaceId?: string;
  displayName?: string;
  data: Record<string, unknown>;
}

export async function resolveEntityById(
  humanId: string,
  workspaceId?: string,
): Promise<ResolvedEntity | null> {
  const upper = humanId.trim().toUpperCase();

  if (upper.startsWith('ORG-')) {
    const res = await pool.query(
      `SELECT id, company_name, org_id, subscription_tier, subscription_status
       FROM workspaces WHERE org_id = $1 LIMIT 1`,
      [upper],
    );
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return { type: 'workspace', id: r.id, humanId: upper, workspaceId: r.id, displayName: r.company_name, data: r };
  }

  if (upper.startsWith('CLT-')) {
    const params: unknown[] = [upper];
    let sql = `SELECT id, workspace_id, company_name, first_name, last_name, email, client_number
               FROM clients WHERE client_number = $1`;
    if (workspaceId) { sql += ' AND workspace_id = $2'; params.push(workspaceId); }
    sql += ' LIMIT 1';
    const res = await pool.query(sql, params);
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    const name = r.company_name || `${r.first_name} ${r.last_name}`.trim();
    return { type: 'client', id: r.id, humanId: upper, workspaceId: r.workspace_id, displayName: name, data: r };
  }

  if (upper.startsWith('EMP-')) {
    const params: unknown[] = [upper];
    let sql = `SELECT id, workspace_id, first_name, last_name, email, employee_number, status, position, role
               FROM employees WHERE employee_number = $1`;
    if (workspaceId) { sql += ' AND workspace_id = $2'; params.push(workspaceId); }
    sql += ' LIMIT 1';
    const res = await pool.query(sql, params);
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      type: 'employee', id: r.id, humanId: upper, workspaceId: r.workspace_id,
      displayName: `${r.first_name} ${r.last_name}`.trim(), data: r,
    };
  }

  if (upper.startsWith('USR-')) {
    const res = await pool.query(
      `SELECT id, email, first_name, last_name, user_number, current_workspace_id
       FROM users WHERE user_number = $1 LIMIT 1`,
      [upper],
    );
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      type: 'user', id: r.id, humanId: upper, workspaceId: r.current_workspace_id,
      displayName: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email, data: r,
    };
  }

  if (upper.startsWith('SHF-')) {
    const params: unknown[] = [upper];
    let sql = `SELECT s.id, s.workspace_id, s.shift_number, s.start_time, s.end_time, s.status,
                      e.first_name, e.last_name, c.company_name AS client_name
               FROM shifts s
               LEFT JOIN employees e ON e.id = s.employee_id
               LEFT JOIN clients c ON c.id = s.client_id
               WHERE s.shift_number = $1`;
    if (workspaceId) { sql += ' AND s.workspace_id = $2'; params.push(workspaceId); }
    sql += ' LIMIT 1';
    const res = await pool.query(sql, params);
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      type: 'shift', id: r.id, humanId: upper, workspaceId: r.workspace_id,
      displayName: `Shift ${upper} — ${r.client_name || 'Unassigned'}`, data: r,
    };
  }

  if (upper.startsWith('CLK-')) {
    const params: unknown[] = [upper];
    let sql = `SELECT te.id, te.workspace_id, te.reference_id, te.clock_in, te.clock_out,
                      te.clock_in_method, e.first_name, e.last_name, e.employee_number
               FROM time_entries te
               LEFT JOIN employees e ON e.id = te.employee_id
               WHERE te.reference_id = $1`;
    if (workspaceId) { sql += ' AND te.workspace_id = $2'; params.push(workspaceId); }
    sql += ' LIMIT 1';
    const res = await pool.query(sql, params);
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      type: 'time_entry', id: r.id, humanId: upper, workspaceId: r.workspace_id,
      displayName: `Clock-in ${upper} — ${r.first_name} ${r.last_name}`, data: r,
    };
  }

  if (upper.startsWith('DOC-')) {
    const params: unknown[] = [upper];
    let sql = `SELECT id, workspace_id, document_number, title, category, related_entity_type, related_entity_id
               FROM document_vault WHERE document_number = $1`;
    if (workspaceId) { sql += ' AND workspace_id = $2'; params.push(workspaceId); }
    sql += ' LIMIT 1';
    const res = await pool.query(sql, params);
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      type: 'document', id: r.id, humanId: upper, workspaceId: r.workspace_id,
      displayName: r.title, data: r,
    };
  }

  if (upper.startsWith('INV-')) {
    const params: unknown[] = [upper];
    let sql = `SELECT id, workspace_id, invoice_number, client_id, status, total_amount
               FROM invoices WHERE invoice_number = $1`;
    if (workspaceId) { sql += ' AND workspace_id = $2'; params.push(workspaceId); }
    sql += ' LIMIT 1';
    const res = await pool.query(sql, params);
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      type: 'invoice', id: r.id, humanId: upper, workspaceId: r.workspace_id,
      displayName: `Invoice ${upper}`, data: r,
    };
  }

  if (upper.startsWith('TKT-')) {
    const params: unknown[] = [upper];
    let sql = `SELECT id, workspace_id, ticket_number, subject, status, priority
               FROM support_tickets WHERE ticket_number = $1`;
    if (workspaceId) { sql += ' AND workspace_id = $2'; params.push(workspaceId); }
    sql += ' LIMIT 1';
    const res = await pool.query(sql, params);
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      type: 'support_ticket', id: r.id, humanId: upper, workspaceId: r.workspace_id,
      displayName: `Ticket ${upper}: ${r.subject}`, data: r,
    };
  }

  // ── INC — Incident Reports ────────────────────────────────────────────────
  if (upper.startsWith('INC-')) {
    const params: unknown[] = [upper];
    let sql = `SELECT id, workspace_id, incident_number, title, incident_type, status
               FROM incident_reports WHERE incident_number = $1`;
    if (workspaceId) { sql += ' AND workspace_id = $2'; params.push(workspaceId); }
    sql += ' LIMIT 1';
    const res = await pool.query(sql, params);
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      type: 'incident', id: r.id, humanId: upper, workspaceId: r.workspace_id,
      displayName: `Incident ${upper}${r.title ? ': ' + r.title : ''}`, data: r,
    };
  }

  return null; // Unrecognized prefix
}

// ─── CANDIDATE NUMBER ─────────────────────────────────────────────────────────
/**
 * Generate CND-[ORG_SHORT]-[NNNNN]
 */
export async function generateCandidateNumber(workspaceId: string, orgShort?: string): Promise<string> {
  const short = (orgShort || 'ORG').toUpperCase().slice(0, 4);
  const seq = await nextSequence(`cnd:${workspaceId}`);
  return `CND-${short}-${pad(seq, 5)}`;
}

// ─── BULK BACKFILL HELPERS ────────────────────────────────────────────────────

/**
 * Backfill employee_number for all employees that are missing it.
 * Must be called with org-short derived from the workspace.
 */
export async function backfillEmployeeNumbers(): Promise<number> {
  const workspaces = await pool.query<{ id: string; company_name: string; state_license_state: string }>(
    `SELECT id, company_name, state_license_state FROM workspaces WHERE id != 'system'`,
  );

  let total = 0;
  for (const ws of workspaces.rows) {
    const short = deriveOrgShort(ws.company_name);
    const employees = await pool.query<{ id: string }>(
      `SELECT id FROM employees WHERE workspace_id = $1 AND (employee_number IS NULL OR employee_number NOT LIKE 'EMP-%') ORDER BY created_at`,
      [ws.id],
    );
    for (const emp of employees.rows) {
      const num = await generateEmployeeNumber(ws.id, short);
      await pool.query(`UPDATE employees SET employee_number = $1 WHERE id = $2`, [num, emp.id]);
      total++;
    }
  }
  return total;
}

export async function backfillOrgIds(): Promise<number> {
  const workspaces = await pool.query<{ id: string; company_name: string; state_license_state: string }>(
    `SELECT id, company_name, state_license_state FROM workspaces WHERE org_id IS NULL AND id != 'system'`,
  );
  let total = 0;
  for (const ws of workspaces.rows) {
    const state = ws.state_license_state || 'XX';
    const orgId = await generateOrgId(state);
    await pool.query(`UPDATE workspaces SET org_id = $1 WHERE id = $2`, [orgId, ws.id]);
    total++;
  }
  return total;
}

export async function backfillClientNumbers(): Promise<number> {
  const workspaces = await pool.query<{ id: string; company_name: string }>(
    `SELECT DISTINCT w.id, w.company_name
     FROM workspaces w
     JOIN clients c ON c.workspace_id = w.id
     WHERE c.client_number IS NULL`,
  );
  let total = 0;
  for (const ws of workspaces.rows) {
    const short = deriveOrgShort(ws.company_name);
    const clients = await pool.query<{ id: string }>(
      `SELECT id FROM clients WHERE workspace_id = $1 AND client_number IS NULL ORDER BY created_at`,
      [ws.id],
    );
    for (const c of clients.rows) {
      const num = await generateClientNumber(ws.id, short);
      await pool.query(`UPDATE clients SET client_number = $1 WHERE id = $2`, [num, c.id]);
      total++;
    }
  }
  return total;
}

export async function backfillUserNumbers(): Promise<number> {
  const users = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE user_number IS NULL ORDER BY created_at`,
  );
  let total = 0;
  for (const u of users.rows) {
    const num = await generateUserNumber();
    await pool.query(`UPDATE users SET user_number = $1 WHERE id = $2`, [num, u.id]);
    total++;
  }
  return total;
}
