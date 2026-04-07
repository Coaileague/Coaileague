/**
 * MODULE 7 — Client Satisfaction Scoring
 */
import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { randomUUID } from 'crypto';
import { db } from "../db";
import { requireAuth } from "../auth";
import { hasManagerAccess, type AuthenticatedRequest } from "../rbac";
import { platformEventBus } from "../services/platformEventBus";
import { createLogger } from '../lib/logger';
const log = createLogger('clientSatisfactionRoutes');

// CATEGORY C — All db.$client.query calls in this file use raw SQL for client satisfaction scoring | Tables: client_satisfaction_records, client_concerns, clients | Verified: 2026-03-23
const router = Router();

// ── GET all satisfaction records for workspace ─────────────────────────────
router.get("/records", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const { client_id } = req.query;
    let query = `SELECT csr.*, c.company_name AS client_name,
                        e.first_name || ' ' || e.last_name AS conducted_by_name
                 FROM client_satisfaction_records csr
                 LEFT JOIN clients c ON c.id = csr.client_id AND c.workspace_id = $1
                 LEFT JOIN employees e ON e.id = csr.conducted_by AND e.workspace_id = $1
                 WHERE csr.workspace_id = $1`;
    const vals: any[] = [wid];
    if (client_id) { query += ` AND csr.client_id = $2`; vals.push(client_id); }
    query += ` ORDER BY csr.check_in_date DESC`;
    const r = await db.$client.query(query, vals);
    res.json(r.rows);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── GET satisfaction trend for a client ─────────────────────────────────────
router.get("/clients/:clientId/trend", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const { clientId } = req.params;
    const r = await db.$client.query(
      `SELECT csr.*, c.company_name AS client_name
       FROM client_satisfaction_records csr
       LEFT JOIN clients c ON c.id = csr.client_id AND c.workspace_id = $1
       WHERE csr.workspace_id = $1 AND csr.client_id = $2
       ORDER BY csr.check_in_date ASC`,
      [wid, clientId]
    );
    const records = r.rows;

    // Detect churn risk (decline of 2+ points across consecutive check-ins)
    let churnRisk = false;
    let churnMessage = '';
    if (records.length >= 2) {
      const last = records[records.length - 1];
      const prev = records[records.length - 2];
      if (last.satisfaction_score && prev.satisfaction_score) {
        const drop = parseFloat(prev.satisfaction_score) - parseFloat(last.satisfaction_score);
        if (drop >= 0.5) {
          churnRisk = true;
          churnMessage = `Satisfaction declined from ${prev.satisfaction_score} to ${last.satisfaction_score}. Recommend executive-level check-in within 14 days.`;
        }
      }
      if (records.length >= 3) {
        const oldest = records[records.length - 3];
        const totalDrop = parseFloat(oldest.satisfaction_score || '5') - parseFloat(last.satisfaction_score || '5');
        if (totalDrop >= 2) {
          churnRisk = true;
          churnMessage = `Satisfaction has declined ${totalDrop.toFixed(1)} points over ${records.length} consecutive check-ins. CHURN RISK.`;
        }
      }
    }

    const avg = records.length ? records.reduce((s: number, r: any) => s + parseFloat(r.satisfaction_score || 0), 0) / records.length : null;
    res.json({ records, churnRisk, churnMessage, averageScore: avg ? Math.round(avg * 10) / 10 : null });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── POST create satisfaction record ──────────────────────────────────────
router.post("/records", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const uid = req.user?.id;
    if (!hasManagerAccess(req.workspaceRole || '')) return res.status(403).json({ error: "Manager access required" });
    const {
      client_id, check_in_type, check_in_date, conducted_by,
      satisfaction_score, nps_score, feedback_text, issues_raised,
      issues_resolved, follow_up_required
    } = req.body;
    if (!client_id || !check_in_date) return res.status(400).json({ error: "client_id and check_in_date required" });
    const id = `csr-${randomUUID()}`;
    await db.$client.query(
      `INSERT INTO client_satisfaction_records
        (id, workspace_id, client_id, check_in_type, check_in_date, conducted_by,
         satisfaction_score, nps_score, feedback_text, issues_raised,
         issues_resolved, follow_up_required, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())`,
      [id, wid, client_id, check_in_type || 'scheduled', check_in_date, conducted_by || uid,
       satisfaction_score || null, nps_score || null, feedback_text || null,
       JSON.stringify(issues_raised || []), issues_resolved || false, follow_up_required || false]
    );

    // Check for churn risk after new record
    const trend = await db.$client.query(
      `SELECT satisfaction_score, check_in_date FROM client_satisfaction_records
       WHERE workspace_id = $1 AND client_id = $2 ORDER BY check_in_date DESC LIMIT 3`,
      [wid, client_id]
    );
    if (trend.rows.length >= 2) {
      const latest = parseFloat(trend.rows[0].satisfaction_score || '5');
      const previous = parseFloat(trend.rows[1].satisfaction_score || '5');
      if (previous - latest >= 0.5) {
        // Tenant isolation: enforce workspace_id (CLAUDE.md §1)
        const clientR = await db.$client.query(`SELECT company_name FROM clients WHERE id = $1 AND workspace_id = $2`, [client_id, wid]).catch(() => ({ rows: [] as any[] }));
        const clientName = clientR.rows[0]?.company_name || 'Client';
        platformEventBus.publish({
          type: 'client_satisfaction_decline',
          category: 'automation',
          title: `Satisfaction Decline — ${clientName}`,
          description: `Score dropped from ${previous} to ${latest}. Churn risk detected.`,
          workspaceId: wid,
          metadata: { clientId: client_id, previousScore: previous, newScore: latest }
        }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
      }
    }

    const r = await db.$client.query(`SELECT * FROM client_satisfaction_records WHERE id = $1`, [id]);
    res.status(201).json(r.rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── POST create concern ────────────────────────────────────────────────────
router.post("/concerns", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const uid = req.user?.id;
    const { client_id, concern_type, severity, description, assigned_to, linked_incident_id } = req.body;
    if (!client_id || !concern_type || !description) return res.status(400).json({ error: "client_id, concern_type, description required" });
    const id = `cc-${randomUUID()}`;
    await db.$client.query(
      `INSERT INTO client_concerns
        (id, workspace_id, client_id, concern_type, severity, description, raised_at, raised_by, assigned_to, status, linked_incident_id)
       VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,$8,'open',$9)`,
      [id, wid, client_id, concern_type, severity || 'moderate', description, uid, assigned_to || null, linked_incident_id || null]
    );
    const r = await db.$client.query(`SELECT * FROM client_concerns WHERE id = $1`, [id]);
    res.status(201).json(r.rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── GET concerns for a client ──────────────────────────────────────────────
router.get("/concerns", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const { client_id, status } = req.query;
    let query = `SELECT cc.*, c.company_name AS client_name,
                        e.first_name || ' ' || e.last_name AS assigned_to_name
                 FROM client_concerns cc
                 LEFT JOIN clients c ON c.id = cc.client_id AND c.workspace_id = $1
                 LEFT JOIN employees e ON e.id = cc.assigned_to AND e.workspace_id = $1
                 WHERE cc.workspace_id = $1`;
    const vals: any[] = [wid];
    let i = 2;
    if (client_id) { query += ` AND cc.client_id = $${i++}`; vals.push(client_id); }
    if (status) { query += ` AND cc.status = $${i++}`; vals.push(status); }
    query += ` ORDER BY CASE cc.severity WHEN 'critical' THEN 1 WHEN 'major' THEN 2 WHEN 'moderate' THEN 3 ELSE 4 END, cc.raised_at DESC`;
    const r = await db.$client.query(query, vals);
    res.json(r.rows);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── PATCH resolve concern ──────────────────────────────────────────────────
router.patch("/concerns/:id/resolve", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const uid = req.user?.id;
    const { resolution_notes } = req.body;
    await db.$client.query(
      `UPDATE client_concerns SET status = 'resolved', resolution_notes = $1, resolved_at = NOW(), resolved_by = $2
       WHERE id = $3 AND workspace_id = $4`,
      [resolution_notes || null, uid, req.params.id, wid]
    );
    const r = await db.$client.query(`SELECT * FROM client_concerns WHERE id = $1`, [req.params.id]);
    res.json(r.rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── GET satisfaction dashboard ─────────────────────────────────────────────
router.get("/dashboard", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    // Get all clients with their latest satisfaction score
    const clients = await db.$client.query(
      `SELECT c.id, c.company_name,
              MAX(csr.check_in_date) AS last_check_in,
              (SELECT csr2.satisfaction_score FROM client_satisfaction_records csr2
               WHERE csr2.client_id = c.id AND csr2.workspace_id = $1
               ORDER BY csr2.check_in_date DESC LIMIT 1) AS latest_score,
              (SELECT csr3.satisfaction_score FROM client_satisfaction_records csr3
               WHERE csr3.client_id = c.id AND csr3.workspace_id = $1
               ORDER BY csr3.check_in_date DESC LIMIT 1 OFFSET 1) AS previous_score,
              COUNT(csr.id) AS check_in_count
       FROM clients c
       LEFT JOIN client_satisfaction_records csr ON csr.client_id = c.id AND csr.workspace_id = $1
       WHERE c.workspace_id = $1 AND c.is_active = TRUE
       GROUP BY c.id, c.company_name
       ORDER BY latest_score ASC NULLS LAST`,
      [wid]
    );

    const openConcerns = await db.$client.query(
      `SELECT COUNT(*) AS count FROM client_concerns WHERE workspace_id = $1 AND status IN ('open','in_progress')`,
      [wid]
    );

    const avgScore = await db.$client.query(
      `SELECT AVG(satisfaction_score::numeric) AS avg_score
       FROM (SELECT DISTINCT ON (client_id) satisfaction_score FROM client_satisfaction_records
             WHERE workspace_id = $1 ORDER BY client_id, check_in_date DESC) sub`,
      [wid]
    );

    const churnRisks = clients.rows.filter((c: any) =>
      c.latest_score && c.previous_score &&
      parseFloat(c.previous_score) - parseFloat(c.latest_score) >= 0.5
    );

    res.json({
      clients: clients.rows,
      openConcerns: parseInt(openConcerns.rows[0].count),
      averageScore: avgScore.rows[0].avg_score ? Math.round(parseFloat(avgScore.rows[0].avg_score) * 10) / 10 : null,
      churnRisks: churnRisks.length
    });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
