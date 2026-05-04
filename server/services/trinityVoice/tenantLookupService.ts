/**
 * Tenant Lookup Service — Wave 16
 * Resolves workspace from license number, company name, or employee phone.
 * On-duty contact resolver: routes complaints → manager on shift,
 * law enforcement → owner, guard issues → supervisor on shift.
 */
import { pool } from '../../db';
import { createLogger } from '../../lib/logger';

const log = createLogger('TenantLookup');

export interface TenantRecord {
  workspaceId: string;
  workspaceName: string;
  companyName: string;
  licenseNumber: string | null;
  licenseState: string | null;
  ownerPhone: string | null;
  ownerName: string | null;
}

export type CallIntent =
  | 'complaint' | 'compliment' | 'law_enforcement' | 'legal'
  | 'guard_issue' | 'emergency' | 'general_help' | 'unknown';

export interface OnDutyContact {
  found: boolean;
  name: string | null;
  phone: string | null;
  role: string | null;
  isOnDuty: boolean;
  fallbackReason?: string;
}

export async function lookupByLicenseNumber(licenseNumber: string): Promise<TenantRecord | null> {
  const clean = licenseNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  try {
    const { rows } = await pool.query(
      `SELECT w.id AS workspace_id, w.name AS workspace_name,
              COALESCE(w.company_name, w.name) AS company_name,
              w.state_license_number AS license_number, w.state_license_state AS license_state,
              u.phone AS owner_phone, u.first_name || ' ' || u.last_name AS owner_name
       FROM workspaces w LEFT JOIN users u ON u.id = w.owner_id
       WHERE UPPER(REPLACE(REPLACE(w.state_license_number, '-', ''), ' ', '')) = $1
         AND w.is_active = true LIMIT 1`,
      [clean]
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return { workspaceId: r.workspace_id, workspaceName: r.workspace_name,
      companyName: r.company_name, licenseNumber: r.license_number,
      licenseState: r.license_state, ownerPhone: r.owner_phone || null, ownerName: r.owner_name || null };
  } catch (err) {
    log.error('[TenantLookup] License lookup failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function lookupByCompanyName(spokenName: string): Promise<TenantRecord | null> {
  const normalized = spokenName.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '');
  try {
    const { rows } = await pool.query(
      `SELECT w.id AS workspace_id, w.name AS workspace_name,
              COALESCE(w.company_name, w.name) AS company_name,
              w.state_license_number AS license_number, w.state_license_state AS license_state,
              u.phone AS owner_phone, u.first_name || ' ' || u.last_name AS owner_name
       FROM workspaces w LEFT JOIN users u ON u.id = w.owner_id
       WHERE w.is_active = true AND LOWER(COALESCE(w.company_name, w.name)) ILIKE $1
       LIMIT 1`,
      [`%${normalized}%`]
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return { workspaceId: r.workspace_id, workspaceName: r.workspace_name,
      companyName: r.company_name, licenseNumber: r.license_number,
      licenseState: r.license_state, ownerPhone: r.owner_phone || null, ownerName: r.owner_name || null };
  } catch (err) {
    log.error('[TenantLookup] Name lookup failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

export function detectCallIntent(spoken: string): CallIntent {
  const s = spoken.toLowerCase().trim();
  if (/\b(police|detective|badge|warrant|investigation|law enforce|subpoena|law enforcement)\b/.test(s))
    return 'law_enforcement';
  if (/\b(legal|lawsuit|attorney|court|subpoena|sue|liability)\b/.test(s))
    return 'legal';
  if (/\b(complain|complaint|unhappy|terrible|awful|problem|issue|rude|unprofessional)\b/.test(s))
    return 'complaint';
  if (/\b(compliment|great|excellent|wonderful|thank|commend|praise|amazing|good job)\b/.test(s))
    return 'compliment';
  if (/\b(emergency|help|danger|assault|threat|immediate|urgent|panic)\b/.test(s))
    return 'emergency';
  if (/\b(guard|officer|employee|my shift|schedule|pay|clock|calloff)\b/.test(s))
    return 'guard_issue';
  return 'general_help';
}

async function getOwnerContact(workspaceId: string): Promise<{ name: string; phone: string; role: string } | null> {
  const { rows } = await pool.query(
    `SELECT u.first_name || ' ' || u.last_name AS name, u.phone
     FROM workspaces w JOIN users u ON u.id = w.owner_id
     WHERE w.id = $1 AND u.phone IS NOT NULL AND u.phone != ''`,
    [workspaceId]
  ).catch(() => ({ rows: [] as Record<string,unknown>[] }));
  if (!rows[0]) return null;
  return { name: String(rows[0].name), phone: String(rows[0].phone), role: 'Owner' };
}

async function getOnDutyManager(workspaceId: string): Promise<{ name: string; phone: string; role: string } | null> {
  const { rows } = await pool.query(
    `SELECT e.first_name || ' ' || e.last_name AS name, u.phone, wm.workspace_role AS role
     FROM shifts s
     JOIN employees e ON e.id = s.assigned_employee_id
     JOIN workspace_members wm ON wm.user_id = e.user_id AND wm.workspace_id = s.workspace_id
     JOIN users u ON u.id = e.user_id
     WHERE s.workspace_id = $1
       AND s.status IN ('active','started','in_progress')
       AND s.start_time <= NOW() AND s.end_time >= NOW()
       AND wm.workspace_role IN ('department_manager','org_manager','supervisor','shift_leader')
       AND u.phone IS NOT NULL AND u.phone != ''
     ORDER BY CASE wm.workspace_role
       WHEN 'department_manager' THEN 1 WHEN 'org_manager' THEN 2
       WHEN 'supervisor' THEN 3 ELSE 4 END ASC LIMIT 1`,
    [workspaceId]
  ).catch(() => ({ rows: [] as Record<string,unknown>[] }));
  if (!rows[0]) return null;
  return { name: String(rows[0].name), phone: String(rows[0].phone), role: String(rows[0].role) };
}

async function getOnDutySupervisor(workspaceId: string): Promise<{ name: string; phone: string; role: string } | null> {
  const { rows } = await pool.query(
    `SELECT e.first_name || ' ' || e.last_name AS name, u.phone, wm.workspace_role AS role
     FROM shifts s JOIN employees e ON e.id = s.assigned_employee_id
     JOIN workspace_members wm ON wm.user_id = e.user_id AND wm.workspace_id = s.workspace_id
     JOIN users u ON u.id = e.user_id
     WHERE s.workspace_id = $1 AND s.status IN ('active','started','in_progress')
       AND s.start_time <= NOW() AND s.end_time >= NOW()
       AND wm.workspace_role IN ('supervisor','shift_leader')
       AND u.phone IS NOT NULL LIMIT 1`,
    [workspaceId]
  ).catch(() => ({ rows: [] as Record<string,unknown>[] }));
  if (!rows[0]) return null;
  return { name: String(rows[0].name), phone: String(rows[0].phone), role: String(rows[0].role) };
}

export async function resolveOnDutyContact(params: { workspaceId: string; intent: CallIntent }): Promise<OnDutyContact> {
  const { workspaceId, intent } = params;
  if (intent === 'law_enforcement' || intent === 'legal') {
    const owner = await getOwnerContact(workspaceId);
    return owner ? { found: true, ...owner, isOnDuty: false }
      : { found: false, name: null, phone: null, role: null, isOnDuty: false, fallbackReason: 'No owner phone on file' };
  }
  if (intent === 'complaint' || intent === 'emergency') {
    const manager = await getOnDutyManager(workspaceId);
    if (manager) return { found: true, ...manager, isOnDuty: true };
    const owner = await getOwnerContact(workspaceId);
    return owner ? { found: true, ...owner, isOnDuty: false, fallbackReason: 'No manager on duty — routed to owner' }
      : { found: false, name: null, phone: null, role: null, isOnDuty: false, fallbackReason: 'No manager on duty or owner phone' };
  }
  if (intent === 'guard_issue') {
    const sup = await getOnDutySupervisor(workspaceId);
    if (sup) return { found: true, ...sup, isOnDuty: true };
    const mgr = await getOnDutyManager(workspaceId);
    return mgr ? { found: true, ...mgr, isOnDuty: true, fallbackReason: 'No supervisor on duty — routed to manager' }
      : { found: false, name: null, phone: null, role: null, isOnDuty: false };
  }
  return { found: false, name: null, phone: null, role: null, isOnDuty: false };
}

export async function logGuestInteraction(params: {
  callSid: string; callerNumber: string;
  callerType: 'guest' | 'law_enforcement' | 'client_of_tenant' | 'prospect';
  intent: CallIntent; tenantWorkspaceId?: string; tenantName?: string;
  badgeNumber?: string; notes?: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO voice_call_sessions (id, twilio_call_sid, caller_number, workspace_id, caller_type, call_intent, metadata, created_at)
     VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6::jsonb,NOW())
     ON CONFLICT (twilio_call_sid) DO UPDATE
       SET caller_type=$4, call_intent=$5, metadata=voice_call_sessions.metadata||$6::jsonb`,
    [params.callSid, params.callerNumber, params.tenantWorkspaceId || null,
     params.callerType, params.intent,
     JSON.stringify({ tenantName: params.tenantName, badgeNumber: params.badgeNumber, notes: params.notes })]
  ).catch(() => {});
}
