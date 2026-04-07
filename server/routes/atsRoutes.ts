/**
 * MODULE 4 — Applicant Tracking System (ATS)
 */
import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "../db";
import { requireAuth } from "../auth";
import { hasManagerAccess, type AuthenticatedRequest } from "../rbac";
import { platformEventBus } from "../services/platformEventBus";
import { createLogger } from '../lib/logger';
const log = createLogger('atsRoutes');

// CATEGORY C — All db.$client.query calls in this file use raw SQL for complex ATS operations | Tables: job_postings, applicants, interview_sessions, interview_session_messages | Verified: 2026-03-23
const router = Router();

function scoreApplicant(data: any): { score: number; rationale: string } {
  let score = 0;
  const reasons: string[] = [];
  if (data.has_guard_card) {
    score += 30;
    reasons.push("+30: Valid guard card on file");
    const exp = data.guard_card_expiration ? new Date(data.guard_card_expiration) : null;
    const sixMonths = new Date();
    sixMonths.setMonth(sixMonths.getMonth() + 6);
    if (exp && exp > sixMonths) { score += 10; reasons.push("+10: Guard card valid 6+ months"); }
  }
  if (data.has_armed_endorsement) { score += 20; reasons.push("+20: Armed endorsement"); }
  const exp = Math.min(data.years_experience || 0, 15);
  if (exp > 0) { score += exp; reasons.push(`+${exp}: ${exp} year(s) experience`); }
  if (data.first_name && data.last_name && data.email && data.phone) { score += 10; reasons.push("+10: Complete application"); }
  const refs = data.applicant_references || data.references || [];
  if (Array.isArray(refs) && refs.length >= 2) { score += 10; reasons.push("+10: References provided"); }
  if (data.job_posting_id) { score += 5; reasons.push("+5: Applied for specific position"); }
  return { score: Math.min(100, score), rationale: reasons.join('. ') };
}

// ── GET all job postings ──────────────────────────────────────────────────
router.get("/postings", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const r = await db.$client.query(
      `SELECT jp.*, 
              (SELECT COUNT(*) FROM applicants WHERE job_posting_id = jp.id AND workspace_id = $1) AS applicant_count,
              (SELECT COUNT(*) FROM applicants WHERE job_posting_id = jp.id AND workspace_id = $1 AND status = 'hired') AS hired_count
       FROM job_postings jp
       WHERE jp.workspace_id = $1
       ORDER BY jp.created_at DESC`,
      [wid]
    );
    res.json(r.rows);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── POST create job posting ────────────────────────────────────────────────
router.post("/postings", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const uid = req.user?.id;
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required" });
    }
    const { title, description, position_type, employment_type, sites, pay_rate_min, pay_rate_max, required_certifications } = req.body;
    if (!title) return res.status(400).json({ error: "title required" });
    const id = randomUUID();
    await db.$client.query(
      `INSERT INTO job_postings (id, workspace_id, title, description, position_type, employment_type, sites, pay_rate_min, pay_rate_max, required_certifications, status, created_by, created_at, posted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',$11,NOW(),NOW())`,
      [id, wid, title, description || null, position_type || 'unarmed', employment_type || 'full_time',
       JSON.stringify(sites || []), pay_rate_min || null, pay_rate_max || null,
       JSON.stringify(required_certifications || []), uid]
    );
    const r = await db.$client.query(`SELECT * FROM job_postings WHERE id = $1 AND workspace_id = $2`, [id, wid]);
    res.status(201).json(r.rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── PATCH update job posting ───────────────────────────────────────────────
router.patch("/postings/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    if (!hasManagerAccess(req.workspaceRole || '')) return res.status(403).json({ error: "Manager access required" });
    const allowed = ['title','description','position_type','employment_type','status','pay_rate_min','pay_rate_max'];
    const updates: string[] = [];
    const vals: any[] = [];
    let i = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) { updates.push(`${key} = $${i++}`); vals.push(req.body[key]); }
    }
    if (!updates.length) return res.status(400).json({ error: "No fields to update" });
    vals.push(req.params.id, wid);
    await db.$client.query(
      `UPDATE job_postings SET ${updates.join(', ')} WHERE id = $${i++} AND workspace_id = $${i}`,
      vals
    );
    const r = await db.$client.query(`SELECT * FROM job_postings WHERE id = $1 AND workspace_id = $2`, [req.params.id, wid]);
    res.json(r.rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── POST score all applicants for a posting ────────────────────────────────
router.post("/postings/:id/score-all", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    if (!hasManagerAccess(req.workspaceRole || '')) return res.status(403).json({ error: "Manager access required" });
    const aprs = await db.$client.query(
      `SELECT * FROM applicants WHERE job_posting_id = $1 AND workspace_id = $2`,
      [req.params.id, wid]
    );
    let updated = 0;
    for (const a of aprs.rows) {
      const { score, rationale } = scoreApplicant(a);
      await db.$client.query(
        `UPDATE applicants SET trinity_score = $1, trinity_score_rationale = $2 WHERE id = $3 AND workspace_id = $4`,
        [score, rationale, a.id, wid]
      );
      updated++;
    }
    res.json({ success: true, updated });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── GET all applicants (optionally by posting) ─────────────────────────────
router.get("/applicants", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const { posting_id, status } = req.query;
    let query = `SELECT a.*, jp.title AS posting_title
                 FROM applicants a
                 LEFT JOIN job_postings jp ON jp.id = a.job_posting_id AND jp.workspace_id = $1
                 WHERE a.workspace_id = $1`;
    const vals: any[] = [wid];
    let i = 2;
    if (posting_id) { query += ` AND a.job_posting_id = $${i++}`; vals.push(posting_id); }
    if (status) { query += ` AND a.status = $${i++}`; vals.push(status); }
    query += ` ORDER BY a.trinity_score DESC, a.applied_at DESC`;
    const r = await db.$client.query(query, vals);
    res.json(r.rows);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── GET single applicant ───────────────────────────────────────────────────
router.get("/applicants/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const r = await db.$client.query(
      `SELECT a.*, jp.title AS posting_title FROM applicants a
       LEFT JOIN job_postings jp ON jp.id = a.job_posting_id
       WHERE a.id = $1 AND a.workspace_id = $2`,
      [req.params.id, wid]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Applicant not found" });
    const interviews = await db.$client.query(
      `SELECT * FROM applicant_interviews WHERE applicant_id = $1 AND workspace_id = $2 ORDER BY scheduled_at DESC`,
      [req.params.id, wid]
    );
    const offer = await db.$client.query(
      `SELECT * FROM offer_letters WHERE applicant_id = $1 AND workspace_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [req.params.id, wid]
    );
    res.json({ ...r.rows[0], interviews: interviews.rows, offer: offer.rows[0] || null });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── POST create applicant (with auto-scoring) ──────────────────────────────
router.post("/applicants", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const {
      job_posting_id, first_name, last_name, email, phone, address,
      has_guard_card, guard_card_number, guard_card_expiration,
      has_armed_endorsement, years_experience, prior_employers,
      applicant_references, notes
    } = req.body;
    if (!first_name || !last_name) return res.status(400).json({ error: "first_name and last_name required" });
    const { score, rationale } = scoreApplicant(req.body);
    const id = randomUUID();
    const pgClient = await db.$client.connect();
    try {
      await pgClient.query('BEGIN');
      await pgClient.query(
        `INSERT INTO applicants
          (id, workspace_id, job_posting_id, first_name, last_name, email, phone, address,
           has_guard_card, guard_card_number, guard_card_expiration, has_armed_endorsement,
           years_experience, prior_employers, applicant_references, applied_at, status,
           trinity_score, trinity_score_rationale, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),'applied',$16,$17,$18)`,
        [id, wid, job_posting_id || null, first_name, last_name, email || null, phone || null, address || null,
         has_guard_card || false, guard_card_number || null, guard_card_expiration || null,
         has_armed_endorsement || false, years_experience || 0,
         JSON.stringify(prior_employers || []), JSON.stringify(applicant_references || []),
         score, rationale, notes || null]
      );
      if (job_posting_id) {
        await pgClient.query(
          `UPDATE job_postings SET applications_count = applications_count + 1 WHERE id = $1 AND workspace_id = $2`,
          [job_posting_id, wid]
        );
      }
      await pgClient.query('COMMIT');
    } catch (txErr) {
      await pgClient.query('ROLLBACK');
      throw txErr;
    } finally {
      pgClient.release();
    }

    platformEventBus.publish({
      type: 'system_signal',
      category: 'automation',
      title: `New Applicant — ${first_name} ${last_name}`,
      description: `Trinity Score: ${score}/100. ${score >= 80 ? 'HIGH SCORE — Review recommended.' : ''}`,
      workspaceId: wid,
      metadata: { applicantId: id, score }
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    const r = await db.$client.query(`SELECT * FROM applicants WHERE id = $1 AND workspace_id = $2`, [id, wid]);
    res.status(201).json(r.rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── PATCH update applicant status ──────────────────────────────────────────
router.patch("/applicants/:id/status", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    if (!hasManagerAccess(req.workspaceRole || '')) return res.status(403).json({ error: "Manager access required" });
    const { status, rejection_reason, notes } = req.body;
    if (!status) return res.status(400).json({ error: "status required" });
    const updates: string[] = ['status = $1'];
    const vals: any[] = [status];
    let i = 2;
    if (rejection_reason) { updates.push(`rejection_reason = $${i++}`); vals.push(rejection_reason); }
    if (notes) { updates.push(`notes = $${i++}`); vals.push(notes); }
    vals.push(req.params.id, wid);
    await db.$client.query(
      `UPDATE applicants SET ${updates.join(', ')} WHERE id = $${i++} AND workspace_id = $${i}`,
      vals
    );
    if (status === 'hired') {
      const appr = await db.$client.query(`SELECT * FROM applicants WHERE id = $1 AND workspace_id = $2`, [req.params.id, wid]);
      platformEventBus.publish({
        type: 'applicant_hired',
        category: 'automation',
        title: `Applicant Hired — ${appr.rows[0]?.first_name} ${appr.rows[0]?.last_name}`,
        description: 'New hire triggers employee onboarding flow.',
        workspaceId: wid,
        metadata: { applicantId: req.params.id }
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    }
    const r = await db.$client.query(`SELECT * FROM applicants WHERE id = $1 AND workspace_id = $2`, [req.params.id, wid]);
    res.json(r.rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── POST schedule interview ────────────────────────────────────────────────
router.post("/applicants/:id/interviews", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    if (!hasManagerAccess(req.workspaceRole || '')) return res.status(403).json({ error: "Manager access required" });
    const { scheduled_at, interviewer_id, interview_type, notes } = req.body;
    const id = randomUUID();
    const pgClient2 = await db.$client.connect();
    try {
      await pgClient2.query('BEGIN');
      await pgClient2.query(
        `INSERT INTO applicant_interviews (id, workspace_id, applicant_id, scheduled_at, interviewer_id, interview_type, notes, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'scheduled')`,
        [id, wid, req.params.id, scheduled_at || null, interviewer_id || null, interview_type || 'in_person', notes || null]
      );
      await pgClient2.query(
        `UPDATE applicants SET status = 'interview_scheduled' WHERE id = $1 AND workspace_id = $2 AND status = 'reviewing'`,
        [req.params.id, wid]
      );
      await pgClient2.query('COMMIT');
    } catch (txErr) {
      await pgClient2.query('ROLLBACK');
      throw txErr;
    } finally {
      pgClient2.release();
    }
    const r = await db.$client.query(`SELECT * FROM applicant_interviews WHERE id = $1 AND workspace_id = $2`, [id, wid]);
    res.status(201).json(r.rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── PATCH complete interview ───────────────────────────────────────────────
router.patch("/interviews/:id/complete", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    if (!hasManagerAccess(req.workspaceRole || '')) return res.status(403).json({ error: "Manager access required" });
    const { rating, recommendation, notes } = req.body;
    const pgClient3 = await db.$client.connect();
    let interviewRow: any;
    try {
      await pgClient3.query('BEGIN');
      await pgClient3.query(
        `UPDATE applicant_interviews SET status = 'completed', completed_at = NOW(), rating = $1, recommendation = $2, notes = $3
         WHERE id = $4 AND workspace_id = $5`,
        [rating || null, recommendation || null, notes || null, req.params.id, wid]
      );
      const iv = await pgClient3.query(`SELECT * FROM applicant_interviews WHERE id = $1 AND workspace_id = $2`, [req.params.id, wid]);
      interviewRow = iv.rows[0];
      if (interviewRow) {
        await pgClient3.query(
          `UPDATE applicants SET status = 'interview_complete' WHERE id = $1 AND workspace_id = $2 AND status = 'interview_scheduled'`,
          [interviewRow.applicant_id, wid]
        );
      }
      await pgClient3.query('COMMIT');
    } catch (txErr) {
      await pgClient3.query('ROLLBACK');
      throw txErr;
    } finally {
      pgClient3.release();
    }
    res.json(interviewRow);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── POST generate offer letter ──────────────────────────────────────────────
router.post("/applicants/:id/offer", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    if (!hasManagerAccess(req.workspaceRole || '')) return res.status(403).json({ error: "Manager access required" });
    const { position, start_date, pay_rate, pay_type, employment_type, reporting_to } = req.body;
    if (!position || !pay_rate) return res.status(400).json({ error: "position and pay_rate required" });
    const appr = await db.$client.query(`SELECT * FROM applicants WHERE id = $1 AND workspace_id = $2`, [req.params.id, wid]);
    if (!appr.rows.length) return res.status(404).json({ error: "Applicant not found" });
    const applicant = appr.rows[0];
    const id = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    const pgClient4 = await db.$client.connect();
    try {
      await pgClient4.query('BEGIN');
      await pgClient4.query(
        `INSERT INTO offer_letters (id, workspace_id, applicant_id, position, start_date, pay_rate, pay_type, employment_type, reporting_to, offer_sent_at, offer_expires_at, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),$10,'sent')`,
        [id, wid, req.params.id, position, start_date || null, pay_rate, pay_type || 'hourly', employment_type || 'full_time', reporting_to || null, expiresAt.toISOString()]
      );
      await pgClient4.query(
        `UPDATE applicants SET status = 'offer_sent' WHERE id = $1 AND workspace_id = $2`,
        [req.params.id, wid]
      );
      await pgClient4.query('COMMIT');
    } catch (txErr) {
      await pgClient4.query('ROLLBACK');
      throw txErr;
    } finally {
      pgClient4.release();
    }
    const r = await db.$client.query(`SELECT * FROM offer_letters WHERE id = $1 AND workspace_id = $2`, [id, wid]);
    res.status(201).json({ ...r.rows[0], applicant: { name: `${applicant.first_name} ${applicant.last_name}`, email: applicant.email } });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── POST accept offer ──────────────────────────────────────────────────────
router.post("/offers/:id/accept", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    if (!hasManagerAccess(req.workspaceRole || '')) return res.status(403).json({ error: "Manager access required" });
    const pgClient5 = await db.$client.connect();
    let offerRow: any;
    try {
      await pgClient5.query('BEGIN');
      await pgClient5.query(
        `UPDATE offer_letters SET status = 'accepted', offer_accepted_at = NOW() WHERE id = $1 AND workspace_id = $2`,
        [req.params.id, wid]
      );
      const offer = await pgClient5.query(`SELECT * FROM offer_letters WHERE id = $1 AND workspace_id = $2`, [req.params.id, wid]);
      offerRow = offer.rows[0];
      if (offerRow) {
        await pgClient5.query(
          `UPDATE applicants SET status = 'hired' WHERE id = $1 AND workspace_id = $2`,
          [offerRow.applicant_id, wid]
        );
      }
      await pgClient5.query('COMMIT');
    } catch (txErr) {
      await pgClient5.query('ROLLBACK');
      throw txErr;
    } finally {
      pgClient5.release();
    }
    res.json({ success: true, offer: offerRow });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── GET pipeline stats ─────────────────────────────────────────────────────
router.get("/pipeline/stats", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const stats = await db.$client.query(
      `SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'applied') AS applied,
        COUNT(*) FILTER (WHERE status IN ('reviewing')) AS reviewing,
        COUNT(*) FILTER (WHERE status IN ('interview_scheduled','interview_complete')) AS interview,
        COUNT(*) FILTER (WHERE status IN ('offer_pending','offer_sent','offer_accepted')) AS offer,
        COUNT(*) FILTER (WHERE status = 'hired') AS hired,
        COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
        AVG(trinity_score) FILTER (WHERE trinity_score > 0) AS avg_score,
        COUNT(*) FILTER (WHERE trinity_score >= 80) AS high_scorers
       FROM applicants WHERE workspace_id = $1`,
      [wid]
    );
    const postings = await db.$client.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'active') AS active_postings FROM job_postings WHERE workspace_id = $1`,
      [wid]
    );
    res.json({ ...stats.rows[0], ...postings.rows[0] });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
