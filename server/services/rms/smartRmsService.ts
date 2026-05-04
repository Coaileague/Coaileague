/**
 * Smart RMS Service — Wave 14
 * Supercharges existing RMS without replacing it.
 * Task 1: Auto-DAR aggregation from shift events
 * Task 2: HelpAI/Trinity Narrative Translator
 * Task 3: Shift Brief Generator (BOLO + Pass-Down on clock-in)
 * Task 4: Client Copy Sanitizer + Portal Sync
 */

import { pool } from "../../db";
import { platformEventBus } from "../platformEventBus";
import { createLogger } from "../../lib/logger";
import { randomUUID } from "crypto";

const log = createLogger("SmartRMS");

// ── TASK 1: Auto-DAR Aggregation ─────────────────────────────────────────────

export interface DARTimelineEvent {
  time: string;
  type: "clock_in" | "clock_out" | "nfc_tap" | "incident" | "patrol_complete" | "visitor";
  description: string;
  location?: string;
  integrity?: "verified" | "flagged";
}

export interface AutoDARPayload {
  employeeId: string;
  employeeName: string;
  siteId: string;
  siteName: string;
  shiftId: string;
  shiftDate: string;
  shiftStart: string;
  shiftEnd: string;
  timeline: DARTimelineEvent[];
  nfcTapCount: number;
  incidentCount: number;
  patrolCount: number;
  autoAggregated: true;
  guardReviewRequired: boolean;
}

export async function generateAutoDar(params: {
  workspaceId: string;
  shiftId: string;
  employeeId: string;
}): Promise<AutoDARPayload | null> {
  const { workspaceId, shiftId, employeeId } = params;
  const timeline: DARTimelineEvent[] = [];

  try {
    const { rows: shiftRows } = await pool.query(
      `SELECT s.*, si.name AS site_name,
              e.first_name || ' ' || e.last_name AS emp_name
       FROM shifts s
       LEFT JOIN sites si ON si.id = s.site_id
       LEFT JOIN employees e ON e.id = s.assigned_employee_id
       WHERE s.id = $1 AND s.workspace_id = $2`,
      [shiftId, workspaceId]
    );
    if (!shiftRows[0]) return null;
    const shift = shiftRows[0];

    // Clock in/out
    const { rows: timeRows } = await pool.query(
      `SELECT * FROM time_entries WHERE shift_id = $1 AND employee_id = $2 ORDER BY clock_in ASC`,
      [shiftId, employeeId]
    ).catch(() => ({ rows: [] as Record<string,unknown>[] }));

    for (const te of timeRows) {
      if (te.clock_in) timeline.push({ time: String(te.clock_in), type: "clock_in", description: "Officer clocked in and assumed post", location: String(shift.site_name || "Site") });
      if (te.clock_out) timeline.push({ time: String(te.clock_out), type: "clock_out", description: "Officer clocked out — shift complete", location: String(shift.site_name || "Site") });
    }

    // NFC patrol taps
    const { rows: nfcRows } = await pool.query(
      `SELECT gts.scanned_at, gtc.name AS cp_name, gts.integrity_verified
       FROM guard_tour_scans gts
       JOIN guard_tour_checkpoints gtc ON gtc.id = gts.checkpoint_id
       WHERE gts.workspace_id = $1 AND gts.employee_id = $2
         AND gts.scanned_at >= $3 AND gts.scanned_at <= COALESCE($4, NOW())
       ORDER BY gts.scanned_at ASC`,
      [workspaceId, employeeId, shift.start_time, shift.end_time]
    ).catch(() => ({ rows: [] as Record<string,unknown>[] }));

    for (const tap of nfcRows) {
      timeline.push({ time: String(tap.scanned_at), type: "nfc_tap", description: `Patrol checkpoint verified: ${tap.cp_name || "Checkpoint"}`, location: String(shift.site_name || ""), integrity: tap.integrity_verified ? "verified" : "flagged" });
    }

    // Incidents during shift
    const { rows: incRows } = await pool.query(
      `SELECT title, category, occurred_at, location_description FROM incident_reports
       WHERE workspace_id = $1 AND employee_id = $2
         AND occurred_at >= $3 AND occurred_at <= COALESCE($4, NOW())
       ORDER BY occurred_at ASC`,
      [workspaceId, employeeId, shift.start_time, shift.end_time]
    ).catch(() => ({ rows: [] as Record<string,unknown>[] }));

    for (const inc of incRows) {
      timeline.push({ time: String(inc.occurred_at), type: "incident", description: `Incident documented: ${inc.title || inc.category || "Incident"}`, location: String(inc.location_description || shift.site_name || "") });
    }

    timeline.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    const uniqueCheckpoints = new Set(nfcRows.map(r => r.cp_name));
    const patrolCount = uniqueCheckpoints.size > 0 ? Math.ceil(nfcRows.length / uniqueCheckpoints.size) : 0;

    log.info(`[AutoDAR] Generated ${timeline.length} events for shift ${shiftId}`);

    return { employeeId, employeeName: String(shift.emp_name || "Officer"), siteId: String(shift.site_id || ""), siteName: String(shift.site_name || "Site"), shiftId, shiftDate: shift.start_time ? new Date(shift.start_time).toLocaleDateString() : "", shiftStart: String(shift.start_time || ""), shiftEnd: String(shift.end_time || ""), timeline, nfcTapCount: nfcRows.length, incidentCount: incRows.length, patrolCount, autoAggregated: true, guardReviewRequired: true };
  } catch (err: unknown) {
    log.error("[AutoDAR] Failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function saveAutoDAR(params: { workspaceId: string; payload: AutoDARPayload }): Promise<string> {
  const { workspaceId, payload } = params;
  const id = randomUUID();
  await pool.query(
    `INSERT INTO daily_activity_reports (id, workspace_id, employee_id, employee_name, site_id, site_name, shift_id, shift_date, shift_start, shift_end, patrol_count, nfc_tap_count, event_timeline, auto_aggregated, guard_reviewed_at, status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,true,NOW(),'submitted',NOW(),NOW())
     ON CONFLICT (id) DO NOTHING`,
    [id, workspaceId, payload.employeeId, payload.employeeName, payload.siteId, payload.siteName, payload.shiftId, payload.shiftDate, payload.shiftStart, payload.shiftEnd, payload.patrolCount, payload.nfcTapCount, JSON.stringify(payload.timeline)]
  );
  await platformEventBus.publish({ type: "dar_auto_submitted", category: "automation", title: "Auto-DAR Submitted", description: `${payload.employeeName} submitted auto-generated DAR (${payload.timeline.length} events)`, workspaceId, metadata: { darId: id, shiftId: payload.shiftId } }).catch(() => {});
  return id;
}

// ── TASK 2: Narrative Translator ─────────────────────────────────────────────

export interface NarrativeTranslationResult {
  originalInput: string;
  formalNarrative: string;
  keyFacts: string[];
  suggestedTitle: string;
  requiresGuardApproval: true;
  draftId: string;
}

export async function translateNarrative(params: {
  workspaceId: string;
  employeeId: string;
  rawInput: string;
  incidentId?: string;
  context?: { site?: string; date?: string; category?: string };
}): Promise<NarrativeTranslationResult> {
  const { workspaceId, employeeId, rawInput, context } = params;
  const draftId = randomUUID();

  const { meteredGemini } = await import("../billing/meteredGeminiClient");

  const result = await meteredGemini({
    workspaceId, userId: employeeId,
    systemPrompt: `You are an expert private security report writer. Transform raw guard notes into formal third-person security terminology. Rules: use "Reporting Officer" not "I", past tense, factual only, professional vocabulary. Site: ${context?.site || "On-site"}.`,
    prompt: `Translate this raw guard input into a formal security incident narrative. Raw input: "${rawInput}"

Respond ONLY with JSON: { "formalNarrative": "...", "keyFacts": ["..."], "suggestedTitle": "..." }`,
    actionType: "narrative_translate", featureName: "rms_narrative_translator",
  });

  let parsed: { formalNarrative: string; keyFacts: string[]; suggestedTitle: string } = { formalNarrative: "", keyFacts: [], suggestedTitle: "" };
  try { parsed = JSON.parse(result.text?.replace(/```json|```/g, "").trim() || "{}"); } catch { parsed.formalNarrative = result.text || rawInput; parsed.suggestedTitle = "Incident Report"; }

  // Save draft to helpai_action_log — guard must approve via ChatDock before it saves
  await pool.query(
    `INSERT INTO helpai_action_log (workspace_id, user_id, action_type, action_status, action_payload, created_at)
     VALUES ($1,$2,'narrative_draft','pending_guard_approval',$3::jsonb,NOW())`,
    [workspaceId, employeeId, JSON.stringify({ draftId, rawInput, ...parsed, incidentId: params.incidentId })]
  ).catch(() => {});

  // Platform event → ChatDock shows approval block to guard
  await platformEventBus.publish({
    type: "narrative_draft_ready", category: "automation",
    title: "AI Narrative Ready for Review",
    description: "Trinity has drafted your incident narrative. Review and approve to save.",
    workspaceId, metadata: { draftId, employeeId, incidentId: params.incidentId },
  }).catch(() => {});

  await broadcastToWorkspace(workspaceId, {
    type: "narrative_approval_needed",
    payload: { draftId, formalNarrative: parsed.formalNarrative, keyFacts: parsed.keyFacts, suggestedTitle: parsed.suggestedTitle, employeeId },
  });

  log.info(`[NarrativeTranslator] Draft ${draftId} ready for ${employeeId}`);

  return { originalInput: rawInput, formalNarrative: parsed.formalNarrative || rawInput, keyFacts: parsed.keyFacts || [], suggestedTitle: parsed.suggestedTitle || "Incident Report", requiresGuardApproval: true, draftId };
}

/** Guard approves the draft — writes it to the incident report */
export async function approveNarrativeDraft(params: {
  workspaceId: string;
  draftId: string;
  incidentId: string;
  guardApprovedNarrative: string;
}): Promise<boolean> {
  const { workspaceId, draftId, incidentId, guardApprovedNarrative } = params;
  await pool.query(
    `UPDATE incident_reports SET ai_narrative = $1, narrative_approved_at = NOW(), updated_at = NOW() WHERE id = $2 AND workspace_id = $3`,
    [guardApprovedNarrative, incidentId, workspaceId]
  ).catch(() => {});
  await pool.query(
    `UPDATE helpai_action_log SET action_status = 'completed', resolved_at = NOW() WHERE action_payload->'draftId' = $1::jsonb`,
    [JSON.stringify(draftId)]
  ).catch(() => {});
  log.info(`[NarrativeTranslator] Draft ${draftId} approved and saved to incident ${incidentId}`);
  return true;
}

// ── TASK 3: Shift Brief ───────────────────────────────────────────────────────

export interface ShiftBrief {
  siteId: string; siteName: string; generatedAt: string;
  activeBolos: Array<{ id: string; subjectName?: string; licensePlate?: string; entityType: string; banType: string; reason: string }>;
  passDownNotes: Array<{ id: string; content: string; priority: string; category: string; authorName?: string; createdAt: string }>;
  recentIncidents: Array<{ title: string; category: string; occurredAt: string }>;
  hasCritical: boolean; requiresAcknowledgment: boolean;
}

export async function generateShiftBrief(params: { workspaceId: string; siteId: string; employeeId: string }): Promise<ShiftBrief> {
  const { workspaceId, siteId, employeeId } = params;
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [boloRes, legacyBoloRes, pdRes, incRes, siteRes] = await Promise.all([
    pool.query(`SELECT * FROM banned_entities WHERE workspace_id=$1 AND (site_id=$2 OR site_id IS NULL) AND is_active=true AND (expires_at IS NULL OR expires_at>NOW()) ORDER BY created_at DESC LIMIT 8`, [workspaceId, siteId]).catch(() => ({ rows: [] as Record<string,unknown>[] })),
    pool.query(`SELECT id, subject_name, reason, 'bolo' AS ban_type, 'person' AS entity_type FROM bolo_alerts WHERE workspace_id=$1 AND is_active=true AND (expires_at IS NULL OR expires_at>NOW()) ORDER BY created_at DESC LIMIT 5`, [workspaceId]).catch(() => ({ rows: [] as Record<string,unknown>[] })),
    pool.query(`SELECT id, content, priority, category, author_name, created_at FROM site_pass_down_log WHERE workspace_id=$1 AND site_id=$2 AND is_active=true AND (expires_at IS NULL OR expires_at>NOW()) AND created_at>=$3 ORDER BY priority DESC, created_at DESC LIMIT 10`, [workspaceId, siteId, since24h]).catch(() => ({ rows: [] as Record<string,unknown>[] })),
    pool.query(`SELECT title, category, occurred_at FROM incident_reports WHERE workspace_id=$1 AND site_id=$2 AND occurred_at>=$3 ORDER BY occurred_at DESC LIMIT 5`, [workspaceId, siteId, since24h]).catch(() => ({ rows: [] as Record<string,unknown>[] })),
    pool.query(`SELECT name FROM sites WHERE id=$1 LIMIT 1`, [siteId]).catch(() => ({ rows: [] as Record<string,unknown>[] })),
  ]);

  const allBolos = [
    ...boloRes.rows.map(r => ({ id: String(r.id), subjectName: r.full_name ? String(r.full_name) : undefined, licensePlate: r.license_plate ? String(r.license_plate) : undefined, entityType: String(r.entity_type || "person"), banType: String(r.ban_type || "bolo"), reason: String(r.reason) })),
    ...legacyBoloRes.rows.map(r => ({ id: String(r.id), subjectName: r.subject_name ? String(r.subject_name) : undefined, licensePlate: undefined, entityType: "person", banType: "bolo", reason: String(r.reason) })),
  ];

  // Auto-acknowledge pass-downs for this guard
  for (const pd of pdRes.rows) {
    await pool.query(`UPDATE site_pass_down_log SET acknowledged_by=acknowledged_by||$1::jsonb WHERE id=$2 AND NOT (acknowledged_by@>$1::jsonb)`, [JSON.stringify([{ employeeId, at: new Date().toISOString() }]), pd.id]).catch(() => {});
  }

  const hasCritical = pdRes.rows.some(r => r.priority === "critical") || allBolos.length > 0;
  log.info(`[ShiftBrief] ws=${workspaceId} site=${siteId}: ${allBolos.length} BOLOs, ${pdRes.rows.length} pass-downs`);

  return {
    siteId, siteName: siteRes.rows[0]?.name ? String(siteRes.rows[0].name) : "Your Site", generatedAt: new Date().toISOString(),
    activeBolos: allBolos,
    passDownNotes: pdRes.rows.map(r => ({ id: String(r.id), content: String(r.content), priority: String(r.priority), category: String(r.category), authorName: r.author_name ? String(r.author_name) : undefined, createdAt: String(r.created_at) })),
    recentIncidents: incRes.rows.map(r => ({ title: String(r.title || "Incident"), category: String(r.category || ""), occurredAt: String(r.occurred_at) })),
    hasCritical, requiresAcknowledgment: hasCritical,
  };
}

// ── TASK 4: Client Copy Sanitizer ────────────────────────────────────────────

export async function createClientCopy(params: { workspaceId: string; incidentId: string; supervisorId: string; clientId?: string; overrideNarrative?: string }): Promise<{ clientCopyId: string; narrative: string; sanitized: boolean }> {
  const { workspaceId, incidentId, supervisorId, clientId, overrideNarrative } = params;
  const { rows } = await pool.query(`SELECT * FROM incident_reports WHERE id=$1 AND workspace_id=$2`, [incidentId, workspaceId]);
  if (!rows[0]) throw new Error("Incident report not found");
  const inc = rows[0] as Record<string, unknown>;

  const sourceNarrative = String(overrideNarrative || inc.ai_narrative || inc.narrative || "");
  const sanitized = sourceNarrative
    .replace(/SSN[\s:]?[\d-]{9,11}/gi, "[REDACTED]")
    .replace(/Employee\s+#?\d{4,}/gi, "the Reporting Officer")
    .replace(/(?:badge|id)\s+#?\d{4,}/gi, "assigned officer")
    .replace(/\[INTERNAL[^\]]*\]/gi, "").trim();

  const clientCopyId = randomUUID();
  await pool.query(
    `INSERT INTO incident_report_client_copies (id, workspace_id, incident_report_id, client_id, client_narrative, client_title, incident_type, occurred_at, location_description, actions_taken, status, supervisor_approved_by, supervisor_approved_at, ai_drafted_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'supervisor_approved',$11,NOW(),NOW(),NOW(),NOW())`,
    [clientCopyId, workspaceId, incidentId, clientId || null, sanitized, String(inc.title || "Security Incident"), String(inc.category || "Incident"), inc.occurred_at, String(inc.location_description || ""), String(inc.actions_taken || ""), supervisorId]
  );

  await platformEventBus.publish({ type: "client_copy_ready", category: "automation", title: "Incident Report Approved for Client", description: `Sanitized client copy ready: ${inc.title}`, workspaceId, metadata: { clientCopyId, incidentId, clientId, supervisorId } }).catch(() => {});
  log.info(`[ClientCopy] Created ${clientCopyId} for incident ${incidentId}`);
  return { clientCopyId, narrative: sanitized, sanitized: true };
}

// Import broadcastToWorkspace for task 2
import { broadcastToWorkspace } from "../../websocket";
