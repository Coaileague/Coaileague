import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { NotificationDeliveryService } from '../services/notificationDeliveryService';
import { pool } from "../db";
import { universalAudit, AUDIT_ACTIONS } from "../services/universalAuditService";
import { requireAuth } from "../auth";
import { ensureWorkspaceAccess } from "../middleware/workspaceScope";
import { z } from "zod";
import { randomUUID } from "crypto";
import { format } from "date-fns";
import { platformEventBus } from "../services/platformEventBus";
import { broadcastToWorkspace } from "../websocket";
import { stampNewReport, stampReportHash } from "../services/reportIntegrityService";
import { typedPool } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
import { clampLimit, clampOffset } from '../utils/pagination';
import { PLATFORM } from '../config/platformConfig';
const log = createLogger('RmsRoutes');


export const rmsRouter = Router();

function genNum(prefix: string) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${prefix}-${y}${m}${d}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function wid(req: any) {
  return req.workspaceId || req.session?.workspaceId;
}

async function q(text: string, params: any[] = []) {
  const r = await typedPool(text, params);
  return r.rows;
}

// ─── INCIDENT REPORTS ────────────────────────────────────────────────────────

rmsRouter.get("/incidents", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { status, category, siteId, limit = 50, offset = 0 } = req.query;
    let query = `SELECT * FROM incident_reports WHERE workspace_id = $1`;
    const params: any[] = [workspaceId];
    let i = 2;
    if (status) { query += ` AND status = $${i++}`; params.push(status); }
    if (category) { query += ` AND category = $${i++}`; params.push(category); }
    if (siteId) { query += ` AND site_id = $${i++}`; params.push(siteId); }
    query += ` ORDER BY occurred_at DESC LIMIT $${i++} OFFSET $${i++}`;
    params.push(Number(limit), Number(offset));
    const rows = await q(query, params);
    res.json({ incidents: rows });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.get("/incidents/:id", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const rows = await q(`SELECT * FROM incident_reports WHERE id = $1 AND workspace_id = $2`, [req.params.id, wid(req)]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

// In-memory idempotency cache for RMS submissions (5-minute TTL)
const rmsIdempotencyCache = new Map<string, { result: any; expiresAt: number }>();

rmsRouter.post("/incidents", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    // Idempotency check — client sends X-Idempotency-Key header to prevent duplicate submissions
    const idemKey = req.headers['x-idempotency-key'] as string;
    if (idemKey) {
      const cached = rmsIdempotencyCache.get(`${workspaceId}:${idemKey}`);
      if (cached && cached.expiresAt > Date.now()) {
        return res.status(200).json({ ...cached.result, _idempotent: true });
      }
    }
    // Accept both old field names (category/priority/narrative) and new schema names for compatibility
    const {
      incidentType, category, severity, priority = "medium", title,
      rawDescription, narrative, polishedDescription,
      locationAddress, locationDescription, occurredAt,
      reportedBy, reportedByEmployeeId, reportedByName,
      witnessStatements, witnesses, photos,
      siteId, siteName, latitude, longitude,
      gpsLatitude, gpsLongitude,
    } = req.body;
    const resolvedIncidentType = incidentType || category;
    const resolvedSeverity = severity || priority;
    const resolvedDescription = rawDescription || narrative || null;
    const resolvedLocation = locationAddress || locationDescription || null;
    const resolvedReportedBy = reportedBy || reportedByEmployeeId || null;
    const resolvedWitnesses = witnessStatements || witnesses || [];
    if (!resolvedIncidentType || !title || !occurredAt) {
      return res.status(400).json({ error: "incidentType (or category), title, occurredAt required" });
    }
    const id = randomUUID();
    const incidentNumber = genNum("INC");
    await q(
      `INSERT INTO incident_reports
        (id, workspace_id, incident_number, site_id, incident_type, severity, title,
         raw_description, polished_description, location_address, occurred_at,
         reported_by, witness_statements, photos, gps_latitude, gps_longitude,
         status, version, version_history, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'draft',1,'[]'::jsonb,NOW())`,
      [id, workspaceId, incidentNumber, siteId || null, resolvedIncidentType, resolvedSeverity, title,
       resolvedDescription, polishedDescription || null, resolvedLocation, occurredAt,
       resolvedReportedBy, JSON.stringify(resolvedWitnesses), JSON.stringify(photos || []),
       gpsLatitude || latitude || null, gpsLongitude || longitude || null]
    );
    // Phase I — Stamp integrity hash immediately after creation
    stampNewReport(id, workspaceId, resolvedReportedBy || 'system').catch(err =>
      log.error(`[ReportIntegrity] Failed to stamp new report ${id}:`, err)
    );
    const rows = await q(`SELECT * FROM incident_reports WHERE id = $1`, [id]);
    platformEventBus.publish({
      type: 'incident_report_filed', category: 'automation',
      title: `Incident Report Filed — ${incidentNumber}`,
      description: `${reportedByName || 'Officer'} filed ${resolvedIncidentType} incident${siteName ? ` at ${siteName}` : ''}: ${title}`,
      workspaceId,
      metadata: { incidentId: id, incidentNumber, incidentType: resolvedIncidentType, severity: resolvedSeverity, title, siteId: siteId || null, siteName: siteName || null, reportedBy: resolvedReportedBy, latitude: gpsLatitude || latitude || null, longitude: gpsLongitude || longitude || null }
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    // Notify supervisors + org owner + client portal per §7 RMS pipeline.
    // All NDS calls awaited with non-fatal try/catch (TRINITY.md §B).
    try {
      const supervisors = await q(
        `SELECT id FROM users
           WHERE workspace_id = $1
             AND workspace_role IN ('supervisor', 'manager', 'department_manager', 'org_manager')
           LIMIT 20`,
        [workspaceId]
      );
      for (const sup of supervisors as any[]) {
        try {
          await NotificationDeliveryService.send({
            type: 'incident_submitted',
            workspaceId,
            recipientUserId: sup.id,
            channel: 'in_app',
            subject: `Incident Reported: ${resolvedIncidentType}`,
            body: {
              title: `Incident Reported: ${resolvedIncidentType}`,
              message: `${reportedByName || 'An officer'} reported an incident${siteName ? ` at ${siteName}` : ''}. Requires your review.`,
              url: `/rms/incidents/${id}`,
              incidentId: id,
              incidentNumber,
              severity: resolvedSeverity,
              actionButtons: [{ label: 'Review Now', action: 'open_incident', data: { incidentId: id } }],
            },
          });
        } catch (err: any) {
          log.warn('[Incident] supervisor NDS failed (non-fatal):', err?.message);
        }
      }

      if (['high', 'critical'].includes(String(resolvedSeverity).toLowerCase())) {
        const owners = await q(
          `SELECT id FROM users
             WHERE workspace_id = $1
               AND workspace_role IN ('org_owner', 'co_owner', 'org_admin')
             LIMIT 5`,
          [workspaceId]
        );
        for (const owner of owners as any[]) {
          try {
            await NotificationDeliveryService.send({
              type: 'incident_high_severity',
              workspaceId,
              recipientUserId: owner.id,
              channel: 'in_app',
              subject: `⚠️ High Severity Incident — ${siteName || 'Your site'}`,
              body: {
                title: `⚠️ High Severity Incident — ${siteName || 'Your site'}`,
                message: title,
                url: `/rms/incidents/${id}`,
                incidentId: id,
                incidentNumber,
                severity: resolvedSeverity,
              },
            });
          } catch (err: any) {
            log.warn('[Incident] owner NDS failed (non-fatal):', err?.message);
          }
        }
      }

      try {
        await platformEventBus.publish({
          type: 'incident_available_to_client',
          category: 'client_transparency',
          title: `Incident Available — ${incidentNumber}`,
          description: `Incident ${incidentNumber} visible to client`,
          workspaceId,
          metadata: { incidentId: id, siteId: siteId || null, severity: resolvedSeverity },
        });
      } catch (pubErr: any) {
        log.warn('[EventBus] incident_available_to_client publish failed (non-fatal):', pubErr?.message);
      }
    } catch (err: any) {
      log.warn('[Incident] notification pipeline failed (non-fatal):', err?.message);
    }

    const result = rows[0];
    // Store in idempotency cache for 5 minutes
    if (idemKey) rmsIdempotencyCache.set(`${workspaceId}:${idemKey}`, { result, expiresAt: Date.now() + 5 * 60 * 1000 });
    res.status(201).json(result);
  } catch (e: unknown) { res.status(400).json({ error: sanitizeError(e) }); }
});

rmsRouter.patch("/incidents/:id", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const allowed = ["status","narrative","supervisorNotes","supervisorId","caseId","policeReportNumber","clientNotified","notificationSent"];
    const updates: string[] = [];
    const vals: any[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(req.body)) {
      if (!allowed.includes(k)) continue;
      const col = k.replace(/[A-Z]/g, (c: string) => `_${c.toLowerCase()}`);
      updates.push(`${col} = $${i++}`);
      vals.push(v);
    }
    if (!updates.length) return res.status(400).json({ error: "Nothing to update" });
    updates.push(`updated_at = NOW()`);
    vals.push(req.params.id, wid(req));
    await q(`UPDATE incident_reports SET ${updates.join(", ")} WHERE id = $${i++} AND workspace_id = $${i}`, vals);
    // Phase I — Re-stamp integrity hash after any content update
    const contentFields = ["narrative","rawDescription","polishedDescription","status","title","severity","incidentType","locationDescription"];
    const hasContentChange = Object.keys(req.body).some(k => contentFields.includes(k));
    if (hasContentChange) {
      stampReportHash({
        reportId: req.params.id,
        workspaceId: wid(req),
        changedBy: req.user?.id || 'system',
        changeReason: `Updated fields: ${Object.keys(req.body).join(', ')}`,
      }).catch(err => log.error(`[ReportIntegrity] Hash re-stamp failed for ${req.params.id}:`, err));
    }
    const rows = await q(`SELECT * FROM incident_reports WHERE id = $1`, [req.params.id]);
    platformEventBus.publish({ type: 'incident_report_updated', category: 'automation', title: 'Incident Report Updated', description: `Incident report ${req.params.id} updated — fields: ${Object.keys(req.body).join(', ')}`, workspaceId: wid(req), metadata: { incidentId: req.params.id, updates: Object.keys(req.body) } }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    res.json(rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.post("/incidents/:id/ai-narrative", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const rows = await q(`SELECT * FROM incident_reports WHERE id = $1 AND workspace_id = $2`, [req.params.id, workspaceId]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const inc = rows[0] as any;
    const prompt = `You are a professional security report writer. Rewrite the following incident narrative in formal, third-person, factual language suitable for legal and law enforcement review:\n\nTitle: ${inc.title}\nCategory: ${inc.category}\nLocation: ${inc.location_description || "On premises"}\nOccurred: ${inc.occurred_at}\nOriginal Narrative: ${inc.narrative || "No narrative provided."}\n\nWrite a polished, professional incident narrative:`;
    const { meteredGemini } = await import("../services/billing/meteredGeminiClient");
    const aiNarrativeResult = await meteredGemini.generate({ workspaceId, userId: req.user?.id || req.session?.userId || "system", featureKey: "rms_narrative_polish", prompt });
    const aiNarrative = aiNarrativeResult.text;
    // Tenant isolation: enforce workspace_id in the UPDATE WHERE clause
    // (TRINITY.md §1 — every query scoped by workspace_id, no exceptions)
    await q(`UPDATE incident_reports SET ai_narrative = $1, updated_at = NOW() WHERE id = $2 AND workspace_id = $3`, [aiNarrative, req.params.id, workspaceId]);
    res.json({ aiNarrative });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.post("/incidents/:id/supervisor-sign", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { supervisorId, supervisorNotes } = req.body;
    await q(`UPDATE incident_reports SET reviewed_by=$1, review_notes=$2, reviewed_at=NOW(), status='reviewed', updated_at=NOW() WHERE id=$3 AND workspace_id=$4`, [supervisorId, supervisorNotes||null, req.params.id, workspaceId]);
    const rows = await q(`SELECT * FROM incident_reports WHERE id=$1`, [req.params.id]);
    const report = rows[0] as any;
    if (report) {
      platformEventBus.publish({ type: 'incident_supervisor_signed', category: 'automation', title: `Incident Report Signed — ${report.report_number || req.params.id}`, description: `Supervisor ${supervisorId || 'unknown'} reviewed and signed incident report ${report.report_number || req.params.id}`, workspaceId, metadata: { incidentId: req.params.id, reportNumber: report.report_number, supervisorId, supervisorNotes: supervisorNotes || null } }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    }
    res.json(report);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

// ─── DAILY ACTIVITY REPORTS ──────────────────────────────────────────────────

rmsRouter.get("/dars", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { employeeId, status, siteId, limit = 50, offset = 0 } = req.query;
    let query = `SELECT * FROM daily_activity_reports WHERE workspace_id = $1`;
    const params: any[] = [workspaceId];
    let i = 2;
    if (employeeId) { query += ` AND employee_id = $${i++}`; params.push(employeeId); }
    if (status) { query += ` AND status = $${i++}`; params.push(status); }
    if (siteId) { query += ` AND site_id = $${i++}`; params.push(siteId); }
    query += ` ORDER BY shift_date DESC LIMIT $${i++} OFFSET $${i++}`;
    params.push(Number(limit), Number(offset));
    res.json({ dars: await q(query, params) });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.get("/dars/:id", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const rows = await q(`SELECT * FROM daily_activity_reports WHERE id=$1 AND workspace_id=$2`, [req.params.id, wid(req)]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.post("/dars", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const authUserId = req.user?.id;
    const { employeeId, employeeName, siteId, siteName, shiftId, shiftDate, shiftStart, shiftEnd, activitySummary, incidentsOccurred = false, incidentReportIds, equipmentChecked = false, equipmentNotes, visitorCount = 0, patrolRoundsCompleted = 0, postOrdersFollowed = true, postOrdersNotes, weatherConditions, photos } = req.body;
    if (!employeeName || !shiftDate || !activitySummary) return res.status(400).json({ error: "employeeName, shiftDate, activitySummary required" });
    if (employeeId) {
      const empRows = await q(`SELECT id FROM employees WHERE id=$1 AND workspace_id=$2 AND user_id=$3 LIMIT 1`, [employeeId, workspaceId, authUserId]);
      if (!empRows.length) return res.status(403).json({ error: "employeeId does not match your account" });
    }
    const id = randomUUID();
    const reportNumber = genNum("DAR");
    await q(`INSERT INTO daily_activity_reports (id,workspace_id,report_number,employee_id,employee_name,site_id,site_name,shift_id,shift_date,shift_start,shift_end,activity_summary,incidents_occurred,incident_report_ids,equipment_checked,equipment_notes,visitor_count,patrol_rounds_completed,post_orders_followed,post_orders_notes,weather_conditions,status,created_at,updated_at,photos) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'submitted',NOW(),NOW(),$22)`,
      [id, workspaceId, reportNumber, employeeId||null, employeeName, siteId||null, siteName||null, shiftId||null, shiftDate, shiftStart||null, shiftEnd||null, activitySummary, incidentsOccurred, JSON.stringify(incidentReportIds||[]), equipmentChecked, equipmentNotes||null, visitorCount, patrolRoundsCompleted, postOrdersFollowed, postOrdersNotes||null, weatherConditions||null, JSON.stringify(photos||[])]);
    const rows = await q(`SELECT * FROM daily_activity_reports WHERE id=$1`, [id]);
    platformEventBus.publish({ type: 'dar_submitted', category: 'automation', title: `DAR Submitted — ${reportNumber}`, description: `${employeeName} submitted daily activity report for ${siteName || 'site'} on ${shiftDate}`, workspaceId, metadata: { darId: id, reportNumber, employeeId, employeeName, siteId, siteName, shiftDate, incidentsOccurred, incidentIds: incidentReportIds, photos } }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    res.status(201).json(rows[0]);
  } catch (e: unknown) { res.status(400).json({ error: sanitizeError(e) }); }
});

rmsRouter.post("/dars/:id/ai-summary", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const rows = await q(`SELECT * FROM daily_activity_reports WHERE id=$1 AND workspace_id=$2`, [req.params.id, workspaceId]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const dar = rows[0] as any;
    const prompt = `Summarize this Daily Activity Report in 2-3 professional sentences:\nOfficer: ${dar.employee_name}\nSite: ${dar.site_name}\nDate: ${dar.shift_date}\nActivity: ${dar.activity_summary}\nPatrol Rounds: ${dar.patrol_rounds_completed}\nVisitors: ${dar.visitor_count}\nIncidents: ${dar.incidents_occurred ? "Yes" : "No"}`;
    const { meteredGemini } = await import("../services/billing/meteredGeminiClient");
    const aiSummaryResult = await meteredGemini.generate({ workspaceId, userId: req.user?.id || req.session?.userId || "system", featureKey: "dar_ai_summary", prompt });
    const aiSummary = aiSummaryResult.text;
    await q(`UPDATE daily_activity_reports SET ai_summary=$1, updated_at=NOW() WHERE id=$2`, [aiSummary, req.params.id]);
    res.json({ aiSummary });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.post("/dars/:id/approve", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { supervisorId } = req.body;
    await q(`UPDATE daily_activity_reports SET status='approved', supervisor_id=$1, supervisor_review_at=NOW(), updated_at=NOW() WHERE id=$2 AND workspace_id=$3`, [supervisorId, req.params.id, workspaceId]);
    const rows = await q(`SELECT * FROM daily_activity_reports WHERE id=$1`, [req.params.id]);
    const dar = rows[0] as any;
    if (dar) {
      platformEventBus.publish({ type: 'dar_approved', category: 'automation', title: `DAR Approved — ${dar.report_number}`, description: `${dar.report_number} approved by supervisor ${supervisorId || 'unknown'} for ${dar.employee_name} on ${dar.shift_date}`, workspaceId, metadata: { darId: req.params.id, reportNumber: dar.report_number, employeeName: dar.employee_name, employeeId: dar.employee_id, siteId: dar.site_id, siteName: dar.site_name, supervisorId } }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    }
    res.json(dar);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.post("/dars/:id/submit", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    await q(`UPDATE daily_activity_reports SET status='pending_review', updated_at=NOW() WHERE id=$1 AND workspace_id=$2`, [req.params.id, workspaceId]);
    const rows = await q(`SELECT * FROM daily_activity_reports WHERE id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const dar = rows[0] as any;

    // Trinity Claude articulation pass — improve activity_summary for professional articulation
    if (dar.activity_summary && dar.activity_summary.trim().length > 20) {
      try {
        const { claudeService } = await import("../services/ai-brain/trinity-orchestration/trinityValidationService");
        if (claudeService.isAvailable()) {
          const claudeResult = await claudeService.processRequest({
            task: `You are a professional security report editor. Improve the following field officer's activity summary for a formal Daily Activity Report (DAR). Keep all facts intact, maintain accuracy, and improve professionalism and clarity. Do not add information not present. Return only the improved text with no preamble.\n\nOriginal activity summary:\n${dar.activity_summary}`,
            taskType: 'dar_articulation',
            context: {
              sessionId: `dar-${req.params.id}`,
              workspaceId,
              userId: req.user?.id || 'system',
              taskType: 'dar_articulation',
              domain: 'reporting',
            },
            maxTokens: 500,
            temperature: 0.3,
          });
          if (claudeResult.content && claudeResult.content.trim().length > 0) {
            await q(
              `UPDATE daily_activity_reports SET activity_summary=$1, trinity_articulated=true, updated_at=NOW() WHERE id=$2`,
              [claudeResult.content.trim(), req.params.id]
            );
            dar.activity_summary = claudeResult.content.trim();
            dar.trinity_articulated = true;
            log.info(`[DAR] Trinity articulation applied to DAR ${req.params.id}`);
          }
        }
      } catch (aiErr: unknown) {
        log.warn('[DAR] Trinity articulation failed (non-blocking):', (aiErr instanceof Error ? aiErr.message : String(aiErr)));
      }
    }

    try {
      const { generateDarPdf } = await import("../services/darPdfService");
      const pdfUrl = await generateDarPdf(req.params.id, workspaceId);
      if (pdfUrl) {
        await q(`UPDATE daily_activity_reports SET pdf_url=$1, pdf_generated_at=NOW(), updated_at=NOW() WHERE id=$2`, [pdfUrl, req.params.id]);
        dar.pdf_url = pdfUrl;
      }
    } catch (pdfErr: unknown) {
      log.error('[DAR] PDF generation failed (non-blocking):', (pdfErr instanceof Error ? pdfErr.message : String(pdfErr)));
    }
    platformEventBus.publish({ type: 'dar_submitted', category: 'automation', title: `DAR Submitted — ${dar.report_number}`, description: `${dar.employee_name} submitted daily activity report for ${dar.site_name || 'site'} on ${dar.shift_date}`, workspaceId, metadata: { darId: req.params.id, reportNumber: dar.report_number, employeeName: dar.employee_name, employeeId: dar.employee_id, siteId: dar.site_id, siteName: dar.site_name, shiftDate: dar.shift_date } }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    res.json(dar);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.post("/dars/:id/verify", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const authenticatedUserId = req.user?.id;
    const { verifierName, verificationNotes } = req.body;
    const verifierId = authenticatedUserId || req.body.verifierId;
    if (!verifierId) return res.status(400).json({ error: "verifierId required" });
    await q(`UPDATE daily_activity_reports SET status='verified', supervisor_id=$1, supervisor_review_at=NOW(), updated_at=NOW() WHERE id=$2 AND workspace_id=$3`, [verifierId, req.params.id, workspaceId]);
    const rows = await q(`SELECT * FROM daily_activity_reports WHERE id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const dar = rows[0] as any;

    // 1. Auto-generate PDF if not already produced so the client portal
    //    sees a downloadable report the moment the DAR is verified.
    if (!dar.pdf_url) {
      try {
        const { generateDarPdf } = await import("../services/darPdfService");
        const pdfUrl = await generateDarPdf(req.params.id, workspaceId);
        if (pdfUrl) {
          await q(
            `UPDATE daily_activity_reports SET pdf_url=$1, pdf_generated_at=NOW(), updated_at=NOW() WHERE id=$2`,
            [pdfUrl, req.params.id]
          );
          dar.pdf_url = pdfUrl;
        }
      } catch (pdfErr: any) {
        log.error('[DAR] Auto PDF generation failed (non-blocking):', pdfErr?.message);
      }
    }

    // 2. Signal the client-transparency subscribers (portal refresh, etc.)
    //    so the client portal picks the new DAR up without a reload cycle.
    platformEventBus.publish({
      type: 'dar_available_to_client',
      category: 'client_transparency',
      title: `DAR Available — ${dar.report_number}`,
      description: `DAR ${dar.report_number} verified and now visible in client portal`,
      workspaceId,
      metadata: { darId: req.params.id, clientId: dar.client_id, siteId: dar.site_id },
    }).catch((err: any) => log.warn('[EventBus] dar_available_to_client publish failed:', err?.message));

    // 3. Optional auto-send per workspace setting. Stored in the
    //    automation_policy_blob JSONB so we don't need a new column.
    try {
      const settingRows = await q(
        `SELECT (automation_policy_blob->>'auto_send_dars_to_client')::boolean AS auto_send_dars_to_client
           FROM workspaces WHERE id = $1`,
        [workspaceId]
      );
      const autoSend = (settingRows?.[0] as any)?.auto_send_dars_to_client === true;
      if (autoSend && dar.client_email) {
        const darHtml = `<h2>Daily Activity Report</h2>
          <p><strong>Officer:</strong> ${dar.employee_name}</p>
          <p><strong>Site:</strong> ${dar.site_name || 'N/A'}</p>
          <p><strong>Date:</strong> ${dar.shift_date || 'N/A'}</p>
          <p><strong>Report #:</strong> ${dar.report_number}</p>
          <hr/>
          <p>${dar.activity_summary || 'No activity summary provided.'}</p>
          ${dar.pdf_url ? `<p><a href="${dar.pdf_url}">Download Full PDF Report</a></p>` : ''}`;
        await NotificationDeliveryService.send({
          type: 'dar_delivered',
          workspaceId,
          recipientUserId: dar.client_email,
          channel: 'email',
          body: {
            to: dar.client_email,
            subject: `Daily Activity Report — ${dar.site_name || 'Site'} — ${dar.shift_date || new Date().toLocaleDateString()}`,
            html: darHtml,
          },
        });
      }
    } catch (autoSendErr: any) {
      log.warn('[DAR] Auto-send check failed (non-fatal):', autoSendErr?.message);
    }

    platformEventBus.publish({ type: 'dar_verified', category: 'automation', title: `DAR Verified — ${dar.report_number}`, description: `${dar.report_number} verified by ${verifierName || verifierId}`, workspaceId, metadata: { darId: req.params.id, reportNumber: dar.report_number, verifiedBy: verifierName || verifierId } }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    res.json(dar);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.post("/dars/:id/send-to-client", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { recipientEmail, recipientName } = req.body;
    const rows = await q(`SELECT * FROM daily_activity_reports WHERE id=$1 AND workspace_id=$2`, [req.params.id, workspaceId]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const dar = rows[0] as any;
    if (dar.status !== 'verified' && dar.status !== 'approved') {
      return res.status(400).json({ error: "DAR must be verified before sending to client" });
    }
    if (recipientEmail) {
      try {
        const darHtml = `<h2>Daily Activity Report</h2>
          <p><strong>Officer:</strong> ${dar.employee_name}</p>
          <p><strong>Site:</strong> ${dar.site_name || 'N/A'}</p>
          <p><strong>Date:</strong> ${dar.shift_date || 'N/A'}</p>
          <p><strong>Report #:</strong> ${dar.report_number}</p>
          <hr/>
          <p>${dar.activity_summary || 'No activity summary provided.'}</p>
          ${dar.ai_summary ? `<p><em>AI Summary: ${dar.ai_summary}</em></p>` : ''}
          ${dar.pdf_url ? `<p><a href="${dar.pdf_url}">Download Full PDF Report</a></p>` : ''}
          <hr/>
          <p style="color:#888;font-size:12px;">Generated by  Platform</p>`;
        await NotificationDeliveryService.send({ type: 'report_delivery', workspaceId: workspaceId || 'system', recipientUserId: recipientEmail, channel: 'email', body: { to: recipientEmail, subject: `Daily Activity Report - ${dar.site_name || 'Site'} - ${dar.shift_date || new Date().toLocaleDateString()}`, html: darHtml } });
      } catch (emailErr: unknown) {
        log.error('[DAR] Email send failed (non-blocking):', (emailErr instanceof Error ? emailErr.message : String(emailErr)));
      }
    }
    await q(`UPDATE daily_activity_reports SET status='sent', sent_to_client=true, sent_at=NOW(), updated_at=NOW() WHERE id=$1`, [req.params.id]);
    platformEventBus.publish({ type: 'dar_sent_to_client', category: 'automation', title: `DAR Sent to Client — ${dar.report_number}`, description: `${dar.report_number} delivered to ${recipientEmail || 'client'}`, workspaceId, metadata: { darId: req.params.id, reportNumber: dar.report_number, recipientEmail } }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    const updated = await q(`SELECT * FROM daily_activity_reports WHERE id=$1`, [req.params.id]);
    res.json(updated[0]);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.post("/dars/:id/generate-pdf", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { generateDarPdf } = await import("../services/darPdfService");
    const pdfUrl = await generateDarPdf(req.params.id, workspaceId);
    if (pdfUrl) {
      await q(`UPDATE daily_activity_reports SET pdf_url=$1, pdf_generated_at=NOW(), updated_at=NOW() WHERE id=$2`, [pdfUrl, req.params.id]);
    }
    res.json({ pdfUrl });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

// ── DAR Narrative: Download as formatted HTML document ─────────────────────
rmsRouter.get("/dars/:id/narrative-download", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const rows = await q(`SELECT * FROM daily_activity_reports WHERE id=$1 AND workspace_id=$2`, [req.params.id, workspaceId]);
    if (!rows.length) return res.status(404).json({ error: "DAR not found" });
    const dar = rows[0];

    const wsRows = await q(`SELECT name FROM workspaces WHERE id=$1`, [workspaceId]);
    const orgName = wsRows[0]?.name || "Security Organization";
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const incidentDate = dar.shift_date ? new Date(dar.shift_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A';
    const generatedAt = new Date().toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const narrative = dar.activity_summary || dar.ai_narrative || "No narrative available.";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Incident Narrative — ${dar.report_number || dar.id}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12pt; color: #111; margin: 40px; line-height: 1.6; }
  .header { border-bottom: 3px solid #1a3a6b; padding-bottom: 12px; margin-bottom: 24px; }
  .header h1 { margin: 0; font-size: 20pt; color: #1a3a6b; }
  .header .org { font-size: 14pt; color: #333; margin-top: 4px; }
  .header .doc-meta { font-size: 9pt; color: #666; margin-top: 4px; }
  .section { margin-bottom: 24px; }
  .section-title { font-size: 11pt; font-weight: bold; color: #1a3a6b; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
  .field { display: flex; margin-bottom: 4px; }
  .field label { min-width: 200px; font-weight: bold; color: #444; }
  .field span { color: #111; }
  .narrative-body { background: #f9f9f9; border: 1px solid #ddd; padding: 16px; border-radius: 4px; white-space: pre-wrap; line-height: 1.8; }
  .trinity-badge { display: inline-block; font-size: 8pt; background: #1a3a6b; color: white; padding: 2px 6px; border-radius: 2px; margin-left: 8px; vertical-align: middle; }
  .disclaimer { margin-top: 32px; border-top: 1px solid #ccc; padding-top: 12px; font-size: 9pt; color: #666; }
  .chain-of-command { font-size: 10pt; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
<div class="header">
  <div class="org">${orgName}</div>
  <h1>Daily Activity Report — Incident Narrative</h1>
  <div class="doc-meta">Report No: ${dar.report_number || dar.id} &nbsp;|&nbsp; Generated: ${generatedAt} &nbsp;|&nbsp; CONFIDENTIAL</div>
</div>

<div class="section">
  <div class="section-title">Case Header</div>
  <div class="field"><label>Officer Name:</label><span>${dar.employee_name || 'N/A'}</span></div>
  <div class="field"><label>Incident / Shift Date:</label><span>${incidentDate}</span></div>
  <div class="field"><label>Site / Location:</label><span>${dar.site_name || 'N/A'}</span></div>
  // @ts-expect-error — TS migration: fix in refactoring sprint
  // @ts-ignore — TS migration: fix in refactoring sprint
  <div class="field"><label>Shift Start:</label><span>${(dar as any).shift_start ? new Date((dar as any).shift_start).toLocaleTimeString() : 'N/A'}</span></div>
  // @ts-expect-error — TS migration: fix in refactoring sprint
  // @ts-expect-error — TS migration: fix in refactoring sprint
  // @ts-ignore — TS migration: fix in refactoring sprint
  <div class="field"><label>Shift End:</label><span>${(dar as any).shift_end ? new Date((dar as any).shift_end).toLocaleTimeString() : 'N/A'}</span></div>
  // @ts-ignore — TS migration: fix in refactoring sprint
  <div class="field"><label>Report Status:</label><span>${((dar as any).status || 'submitted').toUpperCase()}</span></div>
</div>

<div class="section">
  <div class="section-title">Narrative Body ${dar.trinity_articulated ? '<span class="trinity-badge">Trinity AI Articulated</span>' : ''}</div>
  <div class="narrative-body">${narrative}</div>
</div>

<div class="section">
  <div class="section-title">Supporting Data</div>
  <div class="field"><label>Patrol Rounds Completed:</label><span>${dar.patrol_rounds_completed ?? 0}</span></div>
  <div class="field"><label>Visitor Count:</label><span>${dar.visitor_count ?? 0}</span></div>
  <div class="field"><label>Incidents Occurred:</label><span>${dar.incidents_occurred ? 'YES' : 'No'}</span></div>
  <div class="field"><label>Equipment Checked:</label><span>${dar.equipment_checked ? 'Yes' : 'No'}</span></div>
  ${dar.equipment_notes ? `<div class="field"><label>Equipment Notes:</label><span>${dar.equipment_notes}</span></div>` : ''}
  ${dar.weather_conditions ? `<div class="field"><label>Weather Conditions:</label><span>${dar.weather_conditions}</span></div>` : ''}
  <div class="field"><label>Post Orders Followed:</label><span>${dar.post_orders_followed !== false ? 'Yes' : 'NO — See notes'}</span></div>
  ${dar.post_orders_notes ? `<div class="field"><label>Post Orders Notes:</label><span>${dar.post_orders_notes}</span></div>` : ''}
</div>

<div class="section">
  // @ts-expect-error — TS migration: fix in refactoring sprint
  <div class="section-title">Chain of Command Notification Log</div>
  <div class="chain-of-command">
  // @ts-expect-error — TS migration: fix in refactoring sprint
    // @ts-ignore — TS migration: fix in refactoring sprint
    <div class="field"><label>Report Submitted:</label><span>${(dar as any).created_at ? new Date((dar as any).created_at).toLocaleString() : 'N/A'}</span></div>
    <div class="field"><label>Trinity Articulation:</label><span>${dar.trinity_articulated ? 'Completed' : 'Pending / Not Required'}</span></div>
    // @ts-ignore — TS migration: fix in refactoring sprint
    <div class="field"><label>Supervisor Review:</label><span>${(dar as any).reviewed_at ? new Date((dar as any).reviewed_at).toLocaleString() : 'Pending'}</span></div>
    <div class="field"><label>Verified By:</label><span>${dar.verified_by || 'Pending verification'}</span></div>
  </div>
</div>

<div class="disclaimer">
  <strong>Legal Disclaimer:</strong> This document is prepared for internal security operations, insurance submission, and potential legal discovery. The contents are confidential and intended solely for authorized personnel. Unauthorized disclosure is prohibited. This report was generated by the  Workforce Management Platform and may incorporate AI-assisted narrative articulation. All factual data reflects information as recorded by the responding security officer at time of incident.
</div>
</body>
</html>`;

    const filename = `DAR_Narrative_${dar.report_number || req.params.id}_${dar.shift_date || 'report'}.html`;
    res.set({
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
    res.send(html);
  } catch (e: unknown) {
    log.error("[DAR Narrative Download]", (e instanceof Error ? e.message : String(e)));
    res.status(500).json({ error: sanitizeError(e) });
  }
});

// ── Incident Narrative: Download formatted document ─────────────────────────
rmsRouter.get("/incidents/:id/narrative-download", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const rows = await q(`SELECT * FROM incident_reports WHERE id=$1 AND workspace_id=$2`, [req.params.id, workspaceId]);
    if (!rows.length) return res.status(404).json({ error: "Incident report not found" });
    const inc = rows[0];

    const wsRows = await q(`SELECT name FROM workspaces WHERE id=$1`, [workspaceId]);
    const orgName = wsRows[0]?.name || "Security Organization";
    const generatedAt = new Date().toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const narrative = inc.ai_narrative || inc.narrative || "No narrative available.";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Incident Narrative — ${inc.report_number || inc.id}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12pt; color: #111; margin: 40px; line-height: 1.6; }
  .header { border-bottom: 3px solid #1a3a6b; padding-bottom: 12px; margin-bottom: 24px; }
  .header h1 { margin: 0; font-size: 20pt; color: #1a3a6b; }
  .header .org { font-size: 14pt; color: #333; margin-top: 4px; }
  .header .doc-meta { font-size: 9pt; color: #666; margin-top: 4px; }
  .section { margin-bottom: 24px; }
  .section-title { font-size: 11pt; font-weight: bold; color: #1a3a6b; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
  .field { display: flex; margin-bottom: 4px; }
  .field label { min-width: 200px; font-weight: bold; color: #444; }
  .field span { color: #111; }
  .narrative-body { background: #f9f9f9; border: 1px solid #ddd; padding: 16px; border-radius: 4px; white-space: pre-wrap; line-height: 1.8; }
  .trinity-badge { display: inline-block; font-size: 8pt; background: #1a3a6b; color: white; padding: 2px 6px; border-radius: 2px; margin-left: 8px; vertical-align: middle; }
  .disclaimer { margin-top: 32px; border-top: 1px solid #ccc; padding-top: 12px; font-size: 9pt; color: #666; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
<div class="header">
  <div class="org">${orgName}</div>
  <h1>Incident Report — Formal Narrative</h1>
  <div class="doc-meta">Report No: ${inc.report_number || inc.id} &nbsp;|&nbsp; Generated: ${generatedAt} &nbsp;|&nbsp; CONFIDENTIAL</div>
</div>

  // @ts-expect-error — TS migration: fix in refactoring sprint
<div class="section">
  <div class="section-title">Case Header</div>
  <div class="field"><label>Incident Title:</label><span>${inc.title || 'N/A'}</span></div>
  // @ts-expect-error — TS migration: fix in refactoring sprint
  <div class="field"><label>Category:</label><span>${inc.category || 'N/A'}</span></div>
  // @ts-ignore — TS migration: fix in refactoring sprint
  <div class="field"><label>Priority:</label><span>${((inc as any).priority || 'medium').toUpperCase()}</span></div>
  <div class="field"><label>Officer / Reporter:</label><span>${inc.reported_by_name || 'N/A'}</span></div>
  <div class="field"><label>Site / Location:</label><span>${inc.site_name || inc.location_description || 'N/A'}</span></div>
  // @ts-ignore — TS migration: fix in refactoring sprint
  <div class="field"><label>Incident Occurred:</label><span>${(inc as any).occurred_at ? new Date((inc as any).occurred_at).toLocaleString() : 'N/A'}</span></div>
  ${inc.police_report_number ? `<div class="field"><label>Police Report #:</label><span>${inc.police_report_number}</span></div>` : ''}
</div>

<div class="section">
  // @ts-expect-error — TS migration: fix in refactoring sprint
  <div class="section-title">Narrative Body ${inc.ai_narrative ? '<span class="trinity-badge">Trinity AI Articulated</span>' : ''}</div>
  <div class="narrative-body">${narrative}</div>
</div>
  // @ts-expect-error — TS migration: fix in refactoring sprint

<div class="section">
  <div class="section-title">Supporting Data</div>
  // @ts-ignore — TS migration: fix in refactoring sprint
  <div class="field"><label>Status:</label><span>${((inc as any).status || 'open').toUpperCase()}</span></div>
  <div class="field"><label>Client Notified:</label><span>${inc.client_notified ? 'Yes' : 'No'}</span></div>
  <div class="field"><label>Notification Sent:</label><span>${inc.notification_sent ? 'Yes' : 'No'}</span></div>
  // @ts-ignore — TS migration: fix in refactoring sprint
  <div class="field"><label>Report Filed:</label><span>${(inc as any).created_at ? new Date((inc as any).created_at).toLocaleString() : 'N/A'}</span></div>
</div>

<div class="disclaimer">
  <strong>Legal Disclaimer:</strong> This document is prepared for internal security operations, insurance submission, and potential legal discovery. The contents are confidential and intended solely for authorized personnel. Unauthorized disclosure is prohibited. This report was generated by the  Workforce Management Platform and may incorporate AI-assisted narrative articulation.
</div>
</body>
</html>`;

    const filename = `Incident_Narrative_${inc.report_number || req.params.id}.html`;
    res.set({
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
    res.send(html);
  } catch (e: unknown) {
    log.error("[Incident Narrative Download]", (e instanceof Error ? e.message : String(e)));
    res.status(500).json({ error: sanitizeError(e) });
  }
});

rmsRouter.post("/shift-reports/:id/generate-pdf", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { generateShiftTransparencyPdf } = await import("../services/darPdfService");
    const pdfUrl = await generateShiftTransparencyPdf(req.params.id, workspaceId);
    if (pdfUrl) {
      await q(`UPDATE dar_reports SET pdf_url=$1, pdf_generated_at=NOW(), updated_at=NOW() WHERE id=$2`, [pdfUrl, req.params.id]);
    }
    res.json({ pdfUrl });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

// Direct PDF stream — uses the shared objectStorageClient which has Replit credentials
// uploadFileToObjectStorage strips the first path component (.private/objects) so we match that
async function streamPdfFromStorage(pdfPath: string, filename: string, res: any): Promise<boolean> {
  try {
    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    if (!bucketId) throw new Error('Object storage not configured');
    const { objectStorageClient } = await import('../objectStorage');
    // uploadFileToObjectStorage does: pathParts.slice(1).join('/') to strip first segment
    const rawPath = pdfPath.startsWith('/') ? pdfPath.slice(1) : pdfPath;
    const parts = rawPath.split('/');
    const objectPath = parts.length > 1 ? parts.slice(1).join('/') : rawPath;
    const file = objectStorageClient.bucket(bucketId).file(objectPath);
    const [fileExists] = await file.exists();
    if (!fileExists) {
      log.warn(`[RMS PDF] File not found in GCS: ${objectPath} (from stored path: ${pdfPath})`);
      return false;
    }
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
    res.set('Cache-Control', 'no-store');
    file.createReadStream()
      .on('error', (err: any) => { log.error('[RMS PDF] Stream error:', sanitizeError(err)); if (!res.headersSent) res.status(500).json({ error: sanitizeError(err) }); })
      .pipe(res);
    return true;
  } catch (err: unknown) {
    log.error('[RMS PDF] streamPdfFromStorage error:', sanitizeError(err));
    return false;
  }
}

rmsRouter.get("/shift-reports/:id/download-pdf", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const rows = await q(`SELECT id, pdf_url, employee_name, shift_start_time FROM dar_reports WHERE id=$1 AND workspace_id=$2`, [req.params.id, workspaceId]);
    if (!rows.length) return res.status(404).json({ error: 'Report not found' });
    const report = rows[0] as any;
    if (!report.pdf_url) return res.status(404).json({ error: 'PDF not yet generated' });
    const dateStr = report.shift_start_time ? new Date(report.shift_start_time).toISOString().slice(0, 10) : 'shift';
    const filename = `shift-report-${dateStr}.pdf`;
    const ok = await streamPdfFromStorage(report.pdf_url, filename, res);
    if (!ok) return res.status(404).json({ error: 'PDF file not found in storage' });
  } catch (e: unknown) { if (!res.headersSent) res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.get("/dars/:id/download-pdf", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const rows = await q(`SELECT id, pdf_url, employee_name, shift_date, report_number FROM daily_activity_reports WHERE id=$1 AND workspace_id=$2`, [req.params.id, workspaceId]);
    if (!rows.length) return res.status(404).json({ error: 'DAR not found' });
    const dar = rows[0] as any;
    if (!dar.pdf_url) return res.status(404).json({ error: 'PDF not yet generated' });
    const dateStr = dar.shift_date ? new Date(dar.shift_date).toISOString().slice(0, 10) : 'dar';
    const filename = `dar-${dar.report_number || dateStr}.pdf`;
    const ok = await streamPdfFromStorage(dar.pdf_url, filename, res);
    if (!ok) return res.status(404).json({ error: 'PDF file not found in storage' });
  } catch (e: unknown) { if (!res.headersSent) res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.get("/shift-reports", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { status, limit = 50, offset = 0 } = req.query;
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
    const safeOffset = Math.max(0, Number(offset) || 0);
    let query = `SELECT * FROM dar_reports WHERE workspace_id = $1`;
    const params: any[] = [workspaceId];
    let paramIdx = 2;
    if (status) { query += ` AND status = $${paramIdx}`; params.push(status); paramIdx++; }
    query += ` ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    params.push(safeLimit, safeOffset);
    res.json({ reports: await q(query, params) });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.get("/shift-reports/:id", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const rows = await q(`SELECT * FROM dar_reports WHERE id=$1 AND workspace_id=$2`, [req.params.id, workspaceId]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const report = rows[0] as any;

    let chatroomMessages: any[] = [];
    if (report.chatroom_id) {
      chatroomMessages = await q(
        `SELECT id, content, message_type, attachment_url, attachment_type, attachment_size, user_id, created_at
         FROM shift_chatroom_messages WHERE chatroom_id=$1 ORDER BY created_at ASC`,
        [report.chatroom_id]
      );
    }

    res.json({ report, chatroomMessages });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.post("/shift-reports/:id/submit", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    await q(`UPDATE dar_reports SET status='pending_review', updated_at=NOW() WHERE id=$1 AND workspace_id=$2`, [req.params.id, workspaceId]);
    const rows = await q(`SELECT * FROM dar_reports WHERE id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const report = rows[0] as any;

    // Trinity Claude articulation pass — improve summary for professional articulation
    if (report.summary && report.summary.trim().length > 20) {
      try {
        const { claudeService } = await import("../services/ai-brain/trinity-orchestration/trinityValidationService");
        if (claudeService.isAvailable()) {
          const claudeResult = await claudeService.processRequest({
            task: `You are a professional security report editor. Improve the following shift report summary for a formal Daily Activity Report (DAR). Keep all facts intact, maintain accuracy, and improve professionalism and clarity. Do not add information not present. Return only the improved text with no preamble.\n\nOriginal summary:\n${report.summary}`,
            taskType: 'dar_articulation',
            context: {
              sessionId: `dar-${req.params.id}`,
              workspaceId,
              userId: req.user?.id || 'system',
              taskType: 'dar_articulation',
              domain: 'reporting',
            },
            maxTokens: 500,
            temperature: 0.3,
          });
          if (claudeResult.content && claudeResult.content.trim().length > 0) {
            await q(
              `UPDATE dar_reports SET summary=$1, trinity_articulated=true, updated_at=NOW() WHERE id=$2`,
              [claudeResult.content.trim(), req.params.id]
            );
            report.summary = claudeResult.content.trim();
            log.info(`[ShiftReport] Trinity articulation applied to DAR ${req.params.id}`);
          }
        }
      } catch (aiErr: unknown) {
        log.warn('[ShiftReport] Trinity articulation failed (non-blocking):', (aiErr instanceof Error ? aiErr.message : String(aiErr)));
      }
    }

    if (!report.pdf_url) {
      try {
        const { generateShiftTransparencyPdf } = await import("../services/darPdfService");
        const pdfUrl = await generateShiftTransparencyPdf(req.params.id, workspaceId);
        if (pdfUrl) {
          await q(`UPDATE dar_reports SET pdf_url=$1, pdf_generated_at=NOW() WHERE id=$2`, [pdfUrl, req.params.id]);
          report.pdf_url = pdfUrl;
        }
      } catch (pdfErr: unknown) {
        log.error('[ShiftReport] PDF generation failed (non-blocking):', (pdfErr instanceof Error ? pdfErr.message : String(pdfErr)));
      }
    }

    platformEventBus.publish({ type: 'dar_submitted', category: 'automation', title: `Shift Report Submitted — ${report.employee_name}`, description: `${report.employee_name} submitted shift transparency report`, workspaceId, metadata: { darId: req.params.id, shiftId: report.shift_id, employeeName: report.employee_name, autoGenerated: false } }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    res.json(report);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.post("/shift-reports/:id/verify", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const verifierId = req.user?.id || req.body.verifierId;
    const { verifierName } = req.body;
    if (!verifierId) return res.status(400).json({ error: "verifierId required" });
    await q(`UPDATE dar_reports SET status='verified', verified_by=$1, verified_at=NOW(), updated_at=NOW() WHERE id=$2 AND workspace_id=$3`, [verifierId, req.params.id, workspaceId]);
    const rows = await q(`SELECT * FROM dar_reports WHERE id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    platformEventBus.publish({ type: 'dar_verified', category: 'automation', title: 'Shift Report Verified', description: `Shift report ${req.params.id} verified by ${verifierName || verifierId}`, workspaceId, metadata: { darId: req.params.id, verifiedBy: verifierName || verifierId } }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    res.json(rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.post("/shift-reports/:id/send-to-client", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { recipientEmail } = req.body;
    const rows = await q(`SELECT * FROM dar_reports WHERE id=$1 AND workspace_id=$2`, [req.params.id, workspaceId]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const report = rows[0] as any;
    if (report.status !== 'verified' && report.status !== 'approved') {
      return res.status(400).json({ error: "Report must be verified before sending to client" });
    }

    if (recipientEmail) {
      try {
        const photoInfo = report.photo_count > 0 ? `<p><strong>Photos Captured:</strong> ${report.photo_count} photo(s) included in the report</p>` : '';
        const shiftHtml = `<h2>Shift Transparency Report</h2>
          <p><strong>Officer:</strong> ${report.employee_name}</p>
          <p><strong>Shift:</strong> ${report.shift_start_time ? format(new Date(report.shift_start_time), 'MMM dd, yyyy h:mm a') : 'N/A'} - ${report.shift_end_time ? format(new Date(report.shift_end_time), 'h:mm a') : 'N/A'}</p>
          <p><strong>Messages:</strong> ${report.message_count} activity entries</p>
          ${photoInfo}
          <hr/>
          <p>${report.summary || 'No summary.'}</p>
          ${report.pdf_url ? `<p><a href="${report.pdf_url}">Download Full Transparency Report (PDF)</a></p>` : ''}
          <hr/>
          <p style="color:#888;font-size:12px;">This report includes all shift communications, photo evidence, and visitor logs. Generated by  Platform.</p>`;
        await NotificationDeliveryService.send({ type: 'report_delivery', workspaceId: workspaceId || 'system', recipientUserId: recipientEmail, channel: 'email', body: { to: recipientEmail, subject: `Shift Transparency Report - ${report.employee_name} - ${report.shift_start_time ? format(new Date(report.shift_start_time), 'MMM dd, yyyy') : ''}`, html: shiftHtml } });
      } catch (emailErr: unknown) {
        log.error('[ShiftReport] Email send failed (non-blocking):', (emailErr instanceof Error ? emailErr.message : String(emailErr)));
      }
    }

    await q(`UPDATE dar_reports SET status='sent', sent_to_client=true, sent_at=NOW(), updated_at=NOW() WHERE id=$1`, [req.params.id]);
    platformEventBus.publish({ type: 'dar_sent_to_client', category: 'automation', title: 'Shift Report Sent to Client', description: `Shift report ${req.params.id} delivered to client${recipientEmail ? ` at ${recipientEmail}` : ''}`, workspaceId, metadata: { darId: req.params.id, recipientEmail } }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    const updated = await q(`SELECT * FROM dar_reports WHERE id=$1`, [req.params.id]);
    res.json(updated[0]);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

// ─── VISITOR LOGS ────────────────────────────────────────────────────────────

rmsRouter.get("/visitors/stats", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const [stats] = await q(`
      SELECT 
        COUNT(*) FILTER (WHERE checked_out_at IS NULL AND checked_in_at > NOW() - INTERVAL '24 hours') as "activeCount",
        COUNT(*) FILTER (WHERE checked_in_at::date = CURRENT_DATE) as "todayCount",
        COUNT(*) FILTER (WHERE expected_departure IS NOT NULL AND expected_departure < NOW() AND checked_out_at IS NULL) as "overdueCount"
      FROM visitor_logs 
      WHERE workspace_id = $1
    `, [workspaceId]);
    
    // Hourly breakdown for the last 12 hours
    const hourlyBreakdown = await q(`
      SELECT 
        to_char(date_trunc('hour', checked_in_at), 'HH24:00') as hour,
        COUNT(*) as count
      FROM visitor_logs
      WHERE workspace_id = $1 AND checked_in_at > NOW() - INTERVAL '12 hours'
      GROUP BY 1 ORDER BY 1 ASC
    `, [workspaceId]);

    res.json({ 
      activeCount: Number(stats.activeCount || 0),
      todayCount: Number(stats.todayCount || 0),
      overdueCount: Number(stats.overdueCount || 0),
      hourlyBreakdown 
    });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.post("/visitors/pre-register", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { 
      siteId, siteName, visitorName, visitorCompany, 
      hostName, purpose, expectedArrival, expectedDeparture, 
      vehiclePlate, notes 
    } = req.body;
    
    if (!visitorName || !siteName) {
      return res.status(400).json({ error: "visitorName and siteName required" });
    }

    const id = randomUUID();
    // Pre-registration: checked_in_at is NULL, we use expected_arrival if provided
    // Note: session_plan says "insert into visitor_logs with expected_departure... checkedInAt=NULL"
    // It also says "insert checked_in_at as expected_arrival provided... OR NOW() as placeholder"
    // Wait, if it's pre-registered, checked_in_at should probably be NULL until they actually arrive.
    // Re-reading T001.6: "checkedInAt=NULL (use a sentinel: insert checked_in_at as expected_arrival provided in body OR NOW() as placeholder)"
    // This is contradictory. "checkedInAt=NULL" vs "insert checked_in_at as expected_arrival".
    // Usually checked_in_at NULL means they haven't arrived.
    // I'll follow the "sentinel" instruction but keep it NULL if the intention is "Pre-registered".
    // Actually, looking at existing GET /visitors, it filters by nothing special.
    // If I insert with checked_in_at = NULL, it will show up in the list if sorted by checked_in_at DESC (but NULLs last usually).
    
    await q(`
      INSERT INTO visitor_logs 
      (id, workspace_id, site_id, site_name, visitor_name, visitor_company, 
       host_name, purpose, vehicle_plate, notes, expected_departure, 
       checked_in_at, created_at) 
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())`,
      [
        id, workspaceId, siteId||null, siteName, visitorName, visitorCompany||null,
        hostName||null, purpose||null, vehiclePlate||null, notes||null, expectedDeparture||null,
        expectedArrival || null // Using expectedArrival as the "checked_in_at" sentinel if provided, else NULL
      ]
    );

    const rows = await q(`SELECT * FROM visitor_logs WHERE id=$1`, [id]);
    res.status(201).json(rows[0]);
  } catch (e: unknown) { res.status(400).json({ error: sanitizeError(e) }); }
});

rmsRouter.get("/visitors", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { status, siteId, search, limit = 50, offset = 0 } = req.query;
    
    let query = `SELECT * FROM visitor_logs WHERE workspace_id = $1`;
    const params: any[] = [workspaceId];
    let i = 2;

    if (status === 'active') {
      query += ` AND checked_out_at IS NULL AND checked_in_at IS NOT NULL`;
    } else if (status === 'checked_out') {
      query += ` AND checked_out_at IS NOT NULL`;
    } else if (status === 'pre_registered') {
      query += ` AND checked_in_at IS NULL`;
    }

    if (siteId) {
      query += ` AND site_id = $${i++}`;
      params.push(siteId);
    }

    if (search) {
      query += ` AND (visitor_name ILIKE $${i} OR visitor_company ILIKE $${i} OR host_name ILIKE $${i})`;
      params.push(`%${search}%`);
      i++;
    }

    query += ` ORDER BY COALESCE(checked_in_at, created_at) DESC LIMIT $${i++} OFFSET $${i++}`;
    params.push(Number(limit), Number(offset));

    res.json({ visitors: await q(query, params) });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.get("/visitors/:id", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const rows = await q(`SELECT * FROM visitor_logs WHERE id=$1 AND workspace_id=$2`, [req.params.id, wid(req)]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json({ visitor: rows[0] });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.put("/visitors/:id", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { notes, visitorBadgeNumber, hostName, purpose } = req.body;
    
    await q(`
      UPDATE visitor_logs 
      SET notes = COALESCE($1, notes),
          visitor_badge_number = COALESCE($2, visitor_badge_number),
          host_name = COALESCE($3, host_name),
          purpose = COALESCE($4, purpose)
      WHERE id = $5 AND workspace_id = $6
    `, [notes, visitorBadgeNumber, hostName, purpose, req.params.id, workspaceId]);

    const rows = await q(`SELECT * FROM visitor_logs WHERE id=$1`, [req.params.id]);
    res.json({ visitor: rows[0] });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.delete("/visitors/:id", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    await q(`DELETE FROM visitor_logs WHERE id=$1 AND workspace_id=$2`, [req.params.id, wid(req)]);
    res.json({ success: true });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.post("/visitors", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { siteId, siteName, visitorName, visitorCompany, visitorIdType, visitorIdNumber, visitorBadgeNumber, hostName, hostEmployeeId, purpose, vehiclePlate, vehicleDescription, checkedInBy, notes, idPhotoUrl, vehicleFrontPhotoUrl, vehicleRearPhotoUrl, visitorPhotoUrl, expectedDeparture } = req.body;
    if (!siteName || !visitorName) return res.status(400).json({ error: "siteName, visitorName required" });
    const id = randomUUID();
    await q(`INSERT INTO visitor_logs (id,workspace_id,site_id,site_name,visitor_name,visitor_company,visitor_id_type,visitor_id_number,visitor_badge_number,host_name,host_employee_id,purpose,vehicle_plate,vehicle_description,checked_in_at,checked_in_by,notes,id_photo_url,vehicle_front_photo_url,vehicle_rear_photo_url,visitor_photo_url,expected_departure,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),$15,$16,$17,$18,$19,$20,$21,NOW())`,
      [id, workspaceId, siteId||null, siteName, visitorName, visitorCompany||null, visitorIdType||null, visitorIdNumber||null, visitorBadgeNumber||null, hostName||null, hostEmployeeId||null, purpose||null, vehiclePlate||null, vehicleDescription||null, checkedInBy||null, notes||null, idPhotoUrl||null, vehicleFrontPhotoUrl||null, vehicleRearPhotoUrl||null, visitorPhotoUrl||null, expectedDeparture||null]);
    const rows = await q(`SELECT * FROM visitor_logs WHERE id=$1`, [id]);

    // BOLO match check
    const boloMatches = await q(`
      SELECT id, subject_name FROM bolo_alerts
      WHERE workspace_id=$1 AND is_active=true
        AND expires_at IS NULL OR expires_at > NOW()
        AND SIMILARITY(subject_name, $2) > 0.4
      LIMIT 1
    `, [workspaceId, visitorName]).catch(() => []);
    if (boloMatches.length > 0) {
      const bolo = boloMatches[0] as any;
      await broadcastToWorkspace(workspaceId, {
        type: 'rms:bolo_match',
        visitorLogId: id, visitorName, siteName,
        boloId: bolo.id, boloSubjectName: bolo.subject_name,
      });
      platformEventBus.publish({ type: 'bolo_match_detected', category: 'automation', title: `BOLO Match Detected — ${visitorName}`, description: `Visitor '${visitorName}' matches active BOLO at ${siteName || 'site'}`, workspaceId, metadata: { boloId: bolo.id, subjectName: visitorName, siteId, siteName, visitorLogId: id } }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    }

    platformEventBus.publish({ type: 'visitor_checked_in', category: 'automation', title: `Visitor Checked In — ${visitorName}`, description: `${visitorName} checked in at ${siteName || 'site'}`, workspaceId, metadata: { visitorLogId: id, visitorName, siteId, siteName } }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    res.status(201).json({ ...rows[0], boloMatch: boloMatches.length > 0 });
  } catch (e: unknown) { res.status(400).json({ error: sanitizeError(e) }); }
});

rmsRouter.post("/visitors/:id/checkout", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const { checkedOutBy } = req.body;
    await q(`UPDATE visitor_logs SET checked_out_at=NOW(), checked_out_by=$1 WHERE id=$2 AND workspace_id=$3`, [checkedOutBy||null, req.params.id, wid(req)]);
    const rows = await q(`SELECT * FROM visitor_logs WHERE id=$1`, [req.params.id]);
    res.json(rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

// ─── KEY CONTROL ─────────────────────────────────────────────────────────────

rmsRouter.get("/key-control", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { siteId, limit = 50, offset = 0 } = req.query;
    let query = `SELECT * FROM key_control_logs WHERE workspace_id=$1`;
    const params: any[] = [workspaceId];
    if (siteId) { query += ` AND site_id=$2`; params.push(siteId); }
    query += ` ORDER BY checked_out_at DESC LIMIT ${clampLimit(limit)} OFFSET ${clampOffset(offset)}`;
    res.json({ keys: await q(query, params) });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.post("/key-control", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { siteId, siteName, keyIdentifier, keyDescription, checkedOutByEmployeeId, checkedOutByName, expectedReturnAt, purpose, notes } = req.body;
    if (!keyIdentifier || !checkedOutByName) return res.status(400).json({ error: "keyIdentifier, checkedOutByName required" });
    const id = randomUUID();
    await q(`INSERT INTO key_control_logs (id,workspace_id,site_id,site_name,key_identifier,key_description,checked_out_by_employee_id,checked_out_by_name,checked_out_at,expected_return_at,purpose,notes,is_overdue,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9,$10,$11,false,NOW(),NOW())`,
      [id, workspaceId, siteId||null, siteName||null, keyIdentifier, keyDescription||null, checkedOutByEmployeeId||null, checkedOutByName, expectedReturnAt||null, purpose||null, notes||null]);
    const rows = await q(`SELECT * FROM key_control_logs WHERE id=$1`, [id]);
    res.status(201).json(rows[0]);
  } catch (e: unknown) { res.status(400).json({ error: sanitizeError(e) }); }
});

rmsRouter.post("/key-control/:id/return", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const { returnedTo, notes } = req.body;
    await q(`UPDATE key_control_logs SET returned_at=NOW(), returned_to=$1, notes=COALESCE($2,notes), updated_at=NOW() WHERE id=$3 AND workspace_id=$4`, [returnedTo||null, notes||null, req.params.id, wid(req)]);
    const rows = await q(`SELECT * FROM key_control_logs WHERE id=$1`, [req.params.id]);
    res.json(rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

// ─── LOST & FOUND ────────────────────────────────────────────────────────────

rmsRouter.get("/lost-found", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { status, limit = 50, offset = 0 } = req.query;
    let query = `SELECT * FROM lost_found_items WHERE workspace_id=$1`;
    const params: any[] = [workspaceId];
    if (status) { query += ` AND status=$2`; params.push(status); }
    query += ` ORDER BY found_at DESC LIMIT ${clampLimit(limit)} OFFSET ${clampOffset(offset)}`;
    res.json({ items: await q(query, params) });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.post("/lost-found", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { siteId, siteName, description, category, foundLocation, foundByEmployeeId, foundByName, storageLocation, notes } = req.body;
    if (!description) return res.status(400).json({ error: "description required" });
    const id = randomUUID();
    const itemNumber = genNum("LF");
    await q(`INSERT INTO lost_found_items (id,workspace_id,site_id,site_name,item_number,description,category,found_location,found_by_employee_id,found_by_name,found_at,storage_location,status,notes,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),$11,'found',$12,NOW(),NOW())`,
      [id, workspaceId, siteId||null, siteName||null, itemNumber, description, category||null, foundLocation||null, foundByEmployeeId||null, foundByName||null, storageLocation||null, notes||null]);
    const rows = await q(`SELECT * FROM lost_found_items WHERE id=$1`, [id]);
    res.status(201).json(rows[0]);
  } catch (e: unknown) { res.status(400).json({ error: sanitizeError(e) }); }
});

rmsRouter.post("/lost-found/:id/claim", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const { claimantName, claimantIdVerified } = req.body;
    await q(`UPDATE lost_found_items SET status='claimed', claimant_name=$1, claimant_id_verified=$2, claimed_at=NOW(), updated_at=NOW() WHERE id=$3 AND workspace_id=$4`, [claimantName, claimantIdVerified||false, req.params.id, wid(req)]);
    const rows = await q(`SELECT * FROM lost_found_items WHERE id=$1`, [req.params.id]);
    res.json(rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

// ─── TRESPASS NOTICES ────────────────────────────────────────────────────────

rmsRouter.get("/trespass", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { status, siteId, limit = 50, offset = 0 } = req.query;
    let query = `SELECT * FROM trespass_notices WHERE workspace_id=$1`;
    const params: any[] = [workspaceId];
    let i = 2;
    if (status) { query += ` AND status=$${i++}`; params.push(status); }
    if (siteId) { query += ` AND site_id=$${i++}`; params.push(siteId); }
    query += ` ORDER BY issued_at DESC LIMIT ${clampLimit(limit)} OFFSET ${clampOffset(offset)}`;
    res.json({ notices: await q(query, params) });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.post("/trespass", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { siteId, siteName, subjectName, subjectDob, subjectDescription, reason, issuedByEmployeeId, issuedByName, validUntil, isPermanent = false, witnessName, policeNotified = false, policeReportNumber } = req.body;
    if (!subjectName || !reason) return res.status(400).json({ error: "subjectName, reason required" });
    const id = randomUUID();
    const noticeNumber = genNum("TNO");
    await q(`INSERT INTO trespass_notices (id,workspace_id,notice_number,site_id,site_name,subject_name,subject_dob,subject_description,reason,issued_at,issued_by_employee_id,issued_by_name,valid_until,is_permanent,witness_name,police_notified,police_report_number,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),$10,$11,$12,$13,$14,$15,$16,'active',NOW(),NOW())`,
      [id, workspaceId, noticeNumber, siteId||null, siteName||null, subjectName, subjectDob||null, subjectDescription||null, reason, issuedByEmployeeId||null, issuedByName||null, validUntil||null, isPermanent, witnessName||null, policeNotified, policeReportNumber||null]);
    const rows = await q(`SELECT * FROM trespass_notices WHERE id=$1`, [id]);
    res.status(201).json(rows[0]);
  } catch (e: unknown) { res.status(400).json({ error: sanitizeError(e) }); }
});

// ─── RMS CASES ───────────────────────────────────────────────────────────────

rmsRouter.get("/cases", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { status, priority, limit = 50, offset = 0 } = req.query;
    let query = `SELECT * FROM rms_cases WHERE workspace_id=$1`;
    const params: any[] = [workspaceId];
    let i = 2;
    if (status) { query += ` AND status=$${i++}`; params.push(status); }
    if (priority) { query += ` AND priority=$${i++}`; params.push(priority); }
    query += ` ORDER BY created_at DESC LIMIT ${clampLimit(limit)} OFFSET ${clampOffset(offset)}`;
    res.json({ cases: await q(query, params) });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.get("/cases/:id", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const rows = await q(`SELECT * FROM rms_cases WHERE id=$1 AND workspace_id=$2`, [req.params.id, wid(req)]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const evidence = await q(`SELECT * FROM evidence_items WHERE case_id=$1 AND workspace_id=$2 ORDER BY created_at ASC`, [req.params.id, wid(req)]);
    res.json({ ...rows[0], evidence });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.post("/cases", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { title, category, priority = "medium", description, siteId, siteName, assignedToEmployeeId, assignedToName, incidentReportIds, policeCaseNumber } = req.body;
    if (!title || !category) return res.status(400).json({ error: "title, category required" });
    const id = randomUUID();
    const caseNumber = genNum("CASE");
    await q(`INSERT INTO rms_cases (id,workspace_id,case_number,title,category,priority,status,description,site_id,site_name,assigned_to_employee_id,assigned_to_name,incident_report_ids,evidence,notes,police_case_number,document_storage_keys,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,'open',$7,$8,$9,$10,$11,$12,'[]','[]',$13,'[]',NOW(),NOW())`,
      [id, workspaceId, caseNumber, title, category, priority, description||null, siteId||null, siteName||null, assignedToEmployeeId||null, assignedToName||null, JSON.stringify(incidentReportIds||[]), policeCaseNumber||null]);
    const rows = await q(`SELECT * FROM rms_cases WHERE id=$1`, [id]);
    platformEventBus.publish({ type: 'rms_case_opened', category: 'automation', title: `Case Opened — ${caseNumber}`, description: `${category} case '${title}' opened at ${siteName || 'site'} — priority: ${priority}`, workspaceId, metadata: { caseId: id, caseNumber, title, category, priority, siteId, siteName, assignedToName } }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    res.status(201).json(rows[0]);
  } catch (e: unknown) { res.status(400).json({ error: sanitizeError(e) }); }
});

rmsRouter.patch("/cases/:id", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const allowed = ["status","title","priority","description","assignedToEmployeeId","assignedToName","resolution","resolvedAt","resolvedBy","aiSummary","policeCaseNumber"];
    const updates: string[] = [];
    const vals: any[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(req.body)) {
      if (!allowed.includes(k)) continue;
      const col = k.replace(/[A-Z]/g, (c: string) => `_${c.toLowerCase()}`);
      updates.push(`${col} = $${i++}`);
      vals.push(v);
    }
    if (!updates.length) return res.status(400).json({ error: "Nothing to update" });
    updates.push(`updated_at = NOW()`);
    vals.push(req.params.id, wid(req));
    await q(`UPDATE rms_cases SET ${updates.join(", ")} WHERE id=$${i++} AND workspace_id=$${i}`, vals);
    const rows = await q(`SELECT * FROM rms_cases WHERE id=$1`, [req.params.id]);
    if (req.body.status === 'closed') {
      platformEventBus.publish({ type: 'rms_case_closed', category: 'automation', title: 'Case Closed', description: `Case ${req.params.id} resolved by ${req.body.resolvedBy || 'system'}`, workspaceId: wid(req), metadata: { caseId: req.params.id, resolvedBy: req.body.resolvedBy } }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    }
    res.json(rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

// ─── BOLO ALERTS ─────────────────────────────────────────────────────────────

rmsRouter.get("/bolo", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { active, limit = 50, offset = 0 } = req.query;
    let query = `SELECT * FROM bolo_alerts WHERE workspace_id=$1`;
    const params: any[] = [workspaceId];
    if (active === 'true') { query += ` AND is_active=true AND (expires_at IS NULL OR expires_at > NOW())`; }
    query += ` ORDER BY created_at DESC LIMIT ${clampLimit(limit)} OFFSET ${clampOffset(offset)}`;
    res.json({ bolos: await q(query, params) });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.post("/bolo", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { subjectName, subjectDob, subjectDescription, photoUrl, reason, expiresAt, createdByName } = req.body;
    if (!subjectName || !reason) return res.status(400).json({ error: "subjectName, reason required" });
    const id = randomUUID();
    await q(`INSERT INTO bolo_alerts (id,workspace_id,subject_name,subject_dob,subject_description,photo_url,reason,is_active,expires_at,created_by_id,created_by_name,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10,NOW(),NOW())`,
      [id, workspaceId, subjectName, subjectDob||null, subjectDescription||null, photoUrl||null, reason, expiresAt||null, req.session?.userId||null, createdByName||null]);
    const rows = await q(`SELECT * FROM bolo_alerts WHERE id=$1`, [id]);
    platformEventBus.publish({ type: 'bolo_created', category: 'automation', title: `BOLO Created — ${subjectName}`, description: `New BOLO alert for '${subjectName}' — reason: ${reason}`, workspaceId, metadata: { boloId: id, subjectName, reason } }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    res.status(201).json(rows[0]);
  } catch (e: unknown) { res.status(400).json({ error: sanitizeError(e) }); }
});

rmsRouter.patch("/bolo/:id", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const { isActive } = req.body;
    await q(`UPDATE bolo_alerts SET is_active=$1, updated_at=NOW() WHERE id=$2 AND workspace_id=$3`, [isActive, req.params.id, wid(req)]);
    const rows = await q(`SELECT * FROM bolo_alerts WHERE id=$1`, [req.params.id]);
    res.json(rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

// ─── EVIDENCE ────────────────────────────────────────────────────────────────

rmsRouter.get("/evidence", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { caseId, status, limit = 50, offset = 0 } = req.query;
    let query = `SELECT * FROM evidence_items WHERE workspace_id=$1`;
    const params: any[] = [workspaceId];
    let i = 2;
    if (caseId) { query += ` AND case_id=$${i++}`; params.push(caseId); }
    if (status) { query += ` AND status=$${i++}`; params.push(status); }
    query += ` ORDER BY created_at DESC LIMIT ${clampLimit(limit)} OFFSET ${clampOffset(offset)}`;
    const items = await q(query, params);
    res.json({ evidence: items });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.post("/evidence", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { caseId, description, category, storageLocation, photoUrls, policeCaseNumber, currentCustodianName, createdByName } = req.body;
    if (!description) return res.status(400).json({ error: "description required" });
    const id = randomUUID();
    const itemNumber = genNum("EVD");
    await q(`INSERT INTO evidence_items (id,workspace_id,case_id,item_number,description,category,storage_location,photo_urls,status,police_case_number,current_custodian_name,created_by_name,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'in_custody',$9,$10,$11,NOW(),NOW())`,
      [id, workspaceId, caseId||null, itemNumber, description, category||'physical', storageLocation||null, JSON.stringify(photoUrls||[]), policeCaseNumber||null, currentCustodianName||null, createdByName||null]);
    const rows = await q(`SELECT * FROM evidence_items WHERE id=$1`, [id]);
    const evidence = rows[0] as any;
    if (evidence) {
      platformEventBus.publish({ type: 'evidence_created', category: 'automation', title: `Evidence Logged — ${itemNumber}`, description: `Evidence item '${description}' logged into RMS${caseId ? ` for case ${caseId}` : ''}`, workspaceId, metadata: { evidenceId: id, itemNumber, description, category: category||'physical', caseId: caseId||null, currentCustodianName: currentCustodianName||null } }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    }
    res.status(201).json(evidence);
  } catch (e: unknown) { res.status(400).json({ error: sanitizeError(e) }); }
});

rmsRouter.post("/evidence/:id/transfer", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { transferredFromName, transferredToName, method, notes, policeCaseNumber } = req.body;
    if (!transferredToName) return res.status(400).json({ error: "transferredToName required" });

    const logId = randomUUID();
    await q(`INSERT INTO evidence_custody_log (id,evidence_id,workspace_id,transferred_from_name,transferred_to_name,method,notes,police_case_number,transferred_at,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())`,
      [logId, req.params.id, workspaceId, transferredFromName||null, transferredToName, method||'in_person', notes||null, policeCaseNumber||null]);
    await q(`UPDATE evidence_items SET current_custodian_name=$1, updated_at=NOW() WHERE id=$2 AND workspace_id=$3`, [transferredToName, req.params.id, workspaceId]);
    const rows = await q(`SELECT * FROM evidence_items WHERE id=$1`, [req.params.id]);
    platformEventBus.publish({ type: 'evidence_transferred', category: 'automation', title: 'Evidence Transferred', description: `Evidence custody transferred from ${transferredFromName || 'previous custodian'} to ${transferredToName}`, workspaceId, metadata: { evidenceId: req.params.id, transferredFromName, transferredToName } }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    res.json(rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.get("/evidence/:id/custody-log", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const log = await q(`SELECT * FROM evidence_custody_log WHERE evidence_id=$1 AND workspace_id=$2 ORDER BY transferred_at ASC`, [req.params.id, wid(req)]);
    res.json({ log });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

// ─── STATS ───────────────────────────────────────────────────────────────────

rmsRouter.get("/stats", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const [inc, dar, vis, keys, lf, tn, cases, bolos] = await Promise.all([
      q(`SELECT COUNT(*) FROM incident_reports WHERE workspace_id=$1 AND status!='closed'`, [workspaceId]),
      q(`SELECT COUNT(*) FROM daily_activity_reports WHERE workspace_id=$1 AND status='submitted'`, [workspaceId]),
      q(`SELECT COUNT(*) FROM visitor_logs WHERE workspace_id=$1 AND checked_out_at IS NULL AND created_at>NOW()-INTERVAL '24 hours'`, [workspaceId]),
      q(`SELECT COUNT(*) FROM key_control_logs WHERE workspace_id=$1 AND returned_at IS NULL`, [workspaceId]),
      q(`SELECT COUNT(*) FROM lost_found_items WHERE workspace_id=$1 AND status='found'`, [workspaceId]),
      q(`SELECT COUNT(*) FROM trespass_notices WHERE workspace_id=$1 AND status='active'`, [workspaceId]),
      q(`SELECT COUNT(*) FROM rms_cases WHERE workspace_id=$1 AND status!='closed'`, [workspaceId]),
      q(`SELECT COUNT(*) FROM bolo_alerts WHERE workspace_id=$1 AND is_active=true AND (expires_at IS NULL OR expires_at > NOW())`, [workspaceId]),
    ]);
    res.json({
      openIncidents: Number(inc[0]?.count || 0),
      pendingDARs: Number(dar[0]?.count || 0),
      activeVisitors: Number(vis[0]?.count || 0),
      keysOut: Number(keys[0]?.count || 0),
      unclaimed: Number(lf[0]?.count || 0),
      activeTrespass: Number(tn[0]?.count || 0),
      openCases: Number(cases[0]?.count || 0),
      activeBolos: Number(bolos[0]?.count || 0),
    });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

// ─── SITE LOOKUP FOR FORMS ────────────────────────────────────────────────────

rmsRouter.get("/sites-lookup", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const rows = await q(`
      SELECT s.id, s.name, s.address_line1, s.address_line2, s.city, s.state, s.zip,
        s.geofence_lat, s.geofence_lng, s.geofence_radius_meters,
        c.company_name AS client_name, c.id AS client_id
      FROM sites s
      LEFT JOIN clients c ON c.id = s.client_id AND c.workspace_id = s.workspace_id
      WHERE s.workspace_id=$1
      ORDER BY s.name ASC
      LIMIT 200
    `, [workspaceId]);
    res.json({ sites: rows });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

const RMS_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
  'video/mp4', 'video/quicktime', 'video/webm',
  'application/pdf',
]);
const RMS_ALLOWED_CATEGORIES = new Set(['photos', 'evidence', 'signatures', 'documents', 'dar-photos', 'scene']);

rmsRouter.post("/upload", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { base64Data, fileName, category } = req.body;
    if (!base64Data) {
      return res.status(400).json({ error: "base64Data is required. Send photo as base64 data URI." });
    }
    const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: "Invalid base64 data URI format" });
    const contentType = matches[1];
    // MIME type allowlist — do not trust client-supplied content type blindly
    if (!RMS_ALLOWED_MIME_TYPES.has(contentType)) {
      return res.status(400).json({ error: "Unsupported file type" });
    }
    const buffer = Buffer.from(matches[2], "base64");
    if (buffer.length > 10 * 1024 * 1024) return res.status(400).json({ error: "File too large (max 10MB)" });
    const id = randomUUID();
    const safeName = ((fileName as string) || `photo-${Date.now()}.jpg`).replace(/[^a-zA-Z0-9._-]/g, "_");
    // Category allowlist — prevent storage path injection
    const safeCategory = RMS_ALLOWED_CATEGORIES.has(category) ? category : "photos";
    const objectPath = `.private/rms/${workspaceId}/${safeCategory}/${id}-${safeName}`;
    const { uploadFileToObjectStorage } = await import("../objectStorage");
    // STORAGE QUOTA CHECK: RMS photos are media category
    const { checkCategoryQuota, recordStorageUsage } = await import("../services/storage/storageQuotaService");
    const quotaCheck = await checkCategoryQuota(workspaceId, 'media', buffer.length);
    if (!quotaCheck.allowed) {
      return res.status(507).json({ error: `Media storage quota exceeded. Used: ${Math.round(quotaCheck.usedBytes / 1048576)}MB of ${Math.round(quotaCheck.limitBytes / 1048576)}MB.`, code: 'STORAGE_QUOTA_EXCEEDED' });
    }
    await uploadFileToObjectStorage({ objectPath, buffer, metadata: { contentType } });
    recordStorageUsage(workspaceId, 'media', buffer.length).catch(() => null);
    res.json({ url: objectPath, id, fileName: safeName });
  } catch (e: unknown) {
    log.error("[RMS] /upload error:", (e instanceof Error ? e.message : String(e)));
    res.status(500).json({ error: sanitizeError(e) });
  }
});

// ─── INCIDENT ANALYTICS HEATMAP ──────────────────────────────────────────────

rmsRouter.get("/analytics/heatmap", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { from, to, category } = req.query;
    let query = `SELECT location_address AS site_name, incident_type AS category, severity AS priority, occurred_at, location_address AS location_description FROM incident_reports WHERE workspace_id=$1`;
    const params: any[] = [workspaceId];
    let i = 2;
    if (from) { query += ` AND occurred_at >= $${i++}`; params.push(from); }
    if (to) { query += ` AND occurred_at <= $${i++}`; params.push(to); }
    if (category) { query += ` AND incident_type = $${i++}`; params.push(category); }
    const rows = await q(query + ` ORDER BY occurred_at DESC LIMIT 500`, params);

    // Group by site for heatmap
    const grouped: Record<string, any> = {};
    for (const row of rows as any[]) {
      const key = row.site_name || 'Unknown';
      if (!grouped[key]) grouped[key] = { siteName: key, count: 0, byCategory: {} };
      grouped[key].count++;
      grouped[key].byCategory[row.category] = (grouped[key].byCategory[row.category] || 0) + 1;
    }
    res.json({ heatmap: Object.values(grouped), total: rows.length });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

// ─── REPORT AUDIT TRAIL ──────────────────────────────────────────────────────

const reportAuditTrail: Map<string, Array<{
  id: string; reportId: string; reportType: string; workspaceId: string;
  action: string; actorId: string | null; actorName: string | null;
  actorEmail: string | null; ipAddress: string | null; userAgent: string | null;
  metadata: any; createdAt: string;
}>> = new Map();

rmsRouter.post("/reports/:id/track", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const reportId = req.params.id;
    const { action, reportType = "dar", metadata } = req.body;
    if (!action) return res.status(400).json({ error: "action required" });
    const validActions = ["opened", "downloaded", "printed", "shared", "exported"];
    if (!validActions.includes(action)) return res.status(400).json({ error: `action must be one of: ${validActions.join(", ")}` });
    const entry = {
      id: randomUUID(),
      reportId,
      reportType,
      workspaceId,
      action,
      actorId: req.user?.id || req.session?.userId || null,
      actorName: req.user?.firstName || req.body.actorName || null,
      actorEmail: req.user?.email || req.body.actorEmail || null,
      ipAddress: req.headers['x-forwarded-for'] as string || req.socket?.remoteAddress || null,
      userAgent: req.headers['user-agent'] || null,
      metadata: metadata || null,
      createdAt: new Date().toISOString(),
    };
    const key = `${workspaceId}:${reportId}`;
    if (!reportAuditTrail.has(key)) reportAuditTrail.set(key, []);
    reportAuditTrail.get(key)!.push(entry);
    try {
      await universalAudit.log({
        workspaceId,
        actorId: entry.actorId,
        actorType: 'user',
        action: action === 'opened' ? AUDIT_ACTIONS.DAILY_REPORT_OPENED : AUDIT_ACTIONS.DAILY_REPORT_DOWNLOADED,
        entityType: 'report',
        entityId: reportId,
        changeType: 'read',
        metadata: { ...entry.metadata, reportType: entry.reportType },
        actorIp: entry.ipAddress,
      });
    } catch {
      // fallback handled by reportAuditTrail in-memory map
    }
    res.json({ tracked: true, entry });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.get("/reports/:id/audit-trail", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const reportId = req.params.id;
    let trail: any[] = [];
    try {
      const history = await universalAudit.getEntityHistory('report', reportId, workspaceId);
      trail = history.map(h => ({
        id: h.id,
        report_id: h.entityId,
        report_type: (h as any).metadata?.reportType || 'unknown',
        workspace_id: h.workspaceId,
        action: h.action === AUDIT_ACTIONS.DAILY_REPORT_OPENED ? 'opened' : 'downloaded',
        actor_id: h.actorId,
        metadata: h.metadata,
        created_at: h.createdAt,
      }));
    } catch {
      const key = `${workspaceId}:${reportId}`;
      trail = (reportAuditTrail.get(key) || []).slice().reverse();
    }
    const openCount = trail.filter((e: any) => e.action === 'opened').length;
    const downloadCount = trail.filter((e: any) => e.action === 'downloaded').length;
    const lastOpened = trail.find((e: any) => e.action === 'opened')?.created_at || null;
    const lastDownloaded = trail.find((e: any) => e.action === 'downloaded')?.created_at || null;
    res.json({ trail, summary: { openCount, downloadCount, lastOpened, lastDownloaded } });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.get("/reports/audit-summary", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    let summaries: any[] = [];
    try {
      const history = await universalAudit.getWorkspaceHistory(workspaceId, {
        entityType: 'report',
        limit: 500,
      });
      const reportGroups = new Map<string, any>();
      for (const h of history) {
        const rid = h.entityId!;
        if (!reportGroups.has(rid)) {
          reportGroups.set(rid, { report_id: rid, open_count: 0, download_count: 0, last_opened: null, last_downloaded: null });
        }
        const g = reportGroups.get(rid);
        if (h.action === AUDIT_ACTIONS.DAILY_REPORT_OPENED) {
          g.open_count++;
          if (!g.last_opened || h.createdAt > g.last_opened) g.last_opened = h.createdAt;
        } else if (h.action === AUDIT_ACTIONS.DAILY_REPORT_DOWNLOADED) {
          g.download_count++;
          if (!g.last_downloaded || h.createdAt > g.last_downloaded) g.last_downloaded = h.createdAt;
        }
      }
      summaries = Array.from(reportGroups.values());
    } catch {
      const seen = new Map<string, any>();
      for (const [key, entries] of reportAuditTrail.entries()) {
        if (!key.startsWith(`${workspaceId}:`)) continue;
        const reportId = key.split(':')[1];
        const openEntries = entries.filter(e => e.action === 'opened');
        const dlEntries = entries.filter(e => e.action === 'downloaded');
        seen.set(reportId, {
          report_id: reportId,
          open_count: openEntries.length,
          download_count: dlEntries.length,
          last_opened: openEntries.length ? openEntries[openEntries.length - 1].createdAt : null,
          last_downloaded: dlEntries.length ? dlEntries[dlEntries.length - 1].createdAt : null,
        });
      }
      summaries = Array.from(seen.values());
    }
    const byReportId: Record<string, any> = {};
    for (const s of summaries) {
      byReportId[s.report_id] = {
        openCount: Number(s.open_count || 0),
        downloadCount: Number(s.download_count || 0),
        lastOpened: s.last_opened || null,
        lastDownloaded: s.last_downloaded || null,
      };
    }
    res.json({ summaries: byReportId });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rmsRouter.post("/upload-photo", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { base64Data, fileName, category } = req.body;
    if (!base64Data) return res.status(400).json({ error: "base64Data required" });

    const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: "Invalid base64 data URI" });
    const contentType = matches[1];
    // MIME type allowlist — do not trust client-supplied content type blindly
    if (!RMS_ALLOWED_MIME_TYPES.has(contentType)) {
      return res.status(400).json({ error: "Unsupported file type" });
    }
    const buffer = Buffer.from(matches[2], 'base64');

    if (buffer.length > 10 * 1024 * 1024) return res.status(400).json({ error: "File too large (max 10MB)" });

    const safeName = (fileName || `photo-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    // Category allowlist — prevent storage path injection
    const safeCategory = RMS_ALLOWED_CATEGORIES.has(category) ? category : "photos";
    const objectPath = `.private/rms/${workspaceId}/${safeCategory}/${safeName}`;

    try {
      const { uploadFileToObjectStorage } = await import("../objectStorage");
      // STORAGE QUOTA CHECK: Incident photos are media category
      const { checkCategoryQuota, recordStorageUsage } = await import("../services/storage/storageQuotaService");
      const quotaCheck = await checkCategoryQuota(workspaceId, 'media', buffer.length);
      if (!quotaCheck.allowed) {
        return res.status(507).json({ error: `Media storage quota exceeded. Used: ${Math.round(quotaCheck.usedBytes / 1048576)}MB of ${Math.round(quotaCheck.limitBytes / 1048576)}MB.`, code: 'STORAGE_QUOTA_EXCEEDED' });
      }
      await uploadFileToObjectStorage({
        objectPath,
        buffer,
        metadata: { contentType },
      });
      recordStorageUsage(workspaceId, 'media', buffer.length).catch(() => null);
      res.json({ url: objectPath, fileName: safeName });
    } catch (uploadErr: unknown) {
      log.error('[RMS] Photo upload failed:', (uploadErr instanceof Error ? uploadErr.message : String(uploadErr)));
      res.status(500).json({ error: "Upload failed" });
    }
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});
