/**
 * MODULE 8 — Bid & Proposal Management (Extension of RFP Pipeline)
 */
import { sanitizeError } from '../middleware/errorHandler';
import { randomUUID } from 'crypto';
import { Router } from "express";
import { db } from "../db";
import { requireAuth } from "../auth";
import { mutationLimiter } from "../middleware/rateLimiter";
import { hasManagerAccess, type AuthenticatedRequest } from "../rbac";
import { platformEventBus } from "../services/platformEventBus";
import { createLogger } from '../lib/logger';
const log = createLogger('BidAnalyticsRoutes');


// CATEGORY C — All db.$client.query calls in this file use raw SQL for bid/proposal analytics | Tables: pipeline_deals, bid_analytics, bid_proposal_templates | Verified: 2026-03-23
const router = Router();

// ── GET proposals with extended fields ────────────────────────────────────
router.get("/proposals", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const { stage, proposal_type } = req.query;
    let query = `SELECT *,
                  CASE
                    WHEN stage NOT IN ('won','lost') AND created_at < NOW() - INTERVAL '14 days' THEN true
                    ELSE false
                  END AS no_response_flag,
                  CASE
                    WHEN expected_close_date IS NOT NULL AND expected_close_date < CURRENT_DATE AND stage NOT IN ('won','lost') THEN true
                    ELSE false
                  END AS overdue_flag,
                  (EXTRACT(DAY FROM COALESCE(actual_close_date, NOW()) - created_at))::int AS days_open
                 FROM pipeline_deals WHERE workspace_id = $1`;
    const vals: any[] = [wid];
    let i = 2;
    if (stage) { query += ` AND stage = $${i++}`; vals.push(stage); }
    if (proposal_type) { query += ` AND proposal_type = $${i++}`; vals.push(proposal_type); }
    query += ` ORDER BY created_at DESC`;
    const r = await db.$client.query(query, vals);
    res.json(r.rows);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── GET single proposal ────────────────────────────────────────────────────
router.get("/proposals/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const r = await db.$client.query(
      `SELECT * FROM pipeline_deals WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, wid]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Proposal not found" });
    res.json(r.rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── PATCH update proposal (extended fields) ────────────────────────────────
router.patch("/proposals/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const allowed = ['stage', 'proposal_type', 'competition_known', 'competitor_names',
      'decision_timeline', 'decision_maker_name', 'decision_maker_title',
      'requirements_summary', 'our_differentiators', 'price_per_hour_proposed',
      'estimated_annual_value', 'estimated_monthly_value', 'loss_reason',
      'follow_up_count', 'last_follow_up_at', 'expected_close_date',
      'actual_close_date', 'converted_to_client_id', 'prospect_name',
      'contact_name', 'contact_email', 'contact_phone', 'notes'];
    const updates: string[] = [];
    const vals: any[] = [];
    let i = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        const val = typeof req.body[key] === 'object' && !Array.isArray(req.body[key]) && req.body[key] !== null
          ? JSON.stringify(req.body[key]) : req.body[key];
        updates.push(`${key} = $${i++}`);
        vals.push(val);
      }
    }
    if (!updates.length) return res.status(400).json({ error: "No fields to update" });
    updates.push(`updated_at = NOW()`);
    vals.push(req.params.id, wid);
    await db.$client.query(
      `UPDATE pipeline_deals SET ${updates.join(', ')} WHERE id = $${i++} AND workspace_id = $${i}`,
      vals
    );

    // Publish events on stage changes
    if (req.body.stage === 'won') {
      platformEventBus.publish({ type: 'proposal_won', category: 'automation', title: 'Proposal Won', description: `Deal ${req.params.id} marked as won.`, workspaceId: wid, metadata: { dealId: req.params.id } }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    } else if (req.body.stage === 'lost') {
      platformEventBus.publish({ type: 'proposal_lost', category: 'automation', title: 'Proposal Lost', description: `Deal ${req.params.id} marked as lost. Reason: ${req.body.loss_reason || 'Not specified'}`, workspaceId: wid, metadata: { dealId: req.params.id, reason: req.body.loss_reason } }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    } else if (req.body.stage === 'proposal' || req.body.stage === 'rfp') {
      platformEventBus.publish({ type: 'bid_submitted', category: 'automation', title: 'Bid/Proposal Submitted', description: `Deal ${req.params.id} moved to ${req.body.stage} stage.`, workspaceId: wid, metadata: { dealId: req.params.id } }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    }

    const r = await db.$client.query(`SELECT * FROM pipeline_deals WHERE id = $1`, [req.params.id]);
    res.json(r.rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── POST generate bid analytics snapshot ──────────────────────────────────
router.post("/analytics/generate", requireAuth, mutationLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    if (!hasManagerAccess(req.workspaceRole || '')) return res.status(403).json({ error: "Manager access required" });

    const periodStart = req.body.period_start || new Date(Date.now() - 180 * 86400000).toISOString().split('T')[0];
    const periodEnd = req.body.period_end || new Date().toISOString().split('T')[0];

    const deals = (await db.$client.query(
      `SELECT * FROM pipeline_deals WHERE workspace_id = $1 AND created_at >= $2 AND created_at <= $3`,
      [wid, periodStart, periodEnd]
    )).rows;

    const won = deals.filter((d: any) => d.stage === 'won');
    const lost = deals.filter((d: any) => d.stage === 'lost');
    const noResp = deals.filter((d: any) => !['won','lost'].includes(d.stage) && new Date(d.created_at) < new Date(Date.now() - 14 * 86400000));

    const closedCount = won.length + lost.length;
    const winRate = closedCount > 0 ? Math.round((won.length / closedCount) * 1000) / 10 : 0;

    const allValues = deals.map((d: any) => parseFloat(d.estimated_monthly_value || d.estimated_annual_value || 0));
    const avgValue = allValues.length ? allValues.reduce((a: number, b: number) => a + b, 0) / allValues.length : 0;
    const totalPipeline = deals.filter((d: any) => !['won','lost'].includes(d.stage)).reduce((s: number, d: any) => s + parseFloat(d.estimated_monthly_value || 0), 0);
    const totalWon = won.reduce((s: number, d: any) => s + parseFloat(d.estimated_monthly_value || 0), 0);

    // Average days to close
    const closeTimes = won.concat(lost).filter((d: any) => d.actual_close_date && d.created_at).map((d: any) =>
      (new Date(d.actual_close_date).getTime() - new Date(d.created_at).getTime()) / 86400000
    );
    const avgDays = closeTimes.length ? closeTimes.reduce((a: number, b: number) => a + b, 0) / closeTimes.length : 0;

    // Most common loss reason
    const lossReasons: Record<string, number> = {};
    for (const d of lost) {
      if (d.loss_reason) {
        lossReasons[d.loss_reason] = (lossReasons[d.loss_reason] || 0) + 1;
      }
    }
    const topLossReason = Object.entries(lossReasons).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    const id = `ba-${randomUUID()}`;
    await db.$client.query(
      `INSERT INTO bid_analytics
        (id, workspace_id, period_start, period_end, total_bids_submitted, total_bids_won,
         total_bids_lost, total_bids_no_response, win_rate_pct, average_proposal_value,
         total_pipeline_value, total_won_value, average_days_to_close, most_common_loss_reason, generated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
       ON CONFLICT DO NOTHING`,
      [id, wid, periodStart, periodEnd, deals.length, won.length, lost.length, noResp.length,
       winRate, avgValue, totalPipeline * 12, totalWon * 12, Math.round(avgDays * 10) / 10, topLossReason]
    );

    const r = await db.$client.query(`SELECT * FROM bid_analytics WHERE id = $1`, [id]);
    res.json(r.rows[0]);
  } catch (err: unknown) {
    log.error("[BidAnalytics] generate error:", err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── GET latest analytics for workspace ────────────────────────────────────
router.get("/analytics", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const r = await db.$client.query(
      `SELECT * FROM bid_analytics WHERE workspace_id = $1 ORDER BY generated_at DESC LIMIT 5`,
      [wid]
    );

    // Live pipeline stats
    const live = await db.$client.query(
      `SELECT
        COUNT(*) AS total_deals,
        COUNT(*) FILTER (WHERE stage = 'won') AS won,
        COUNT(*) FILTER (WHERE stage = 'lost') AS lost,
        COUNT(*) FILTER (WHERE stage NOT IN ('won','lost')) AS in_pipeline,
        COUNT(*) FILTER (WHERE stage NOT IN ('won','lost') AND created_at < NOW() - INTERVAL '14 days') AS no_response,
        SUM(CASE WHEN stage NOT IN ('won','lost') THEN COALESCE(estimated_monthly_value::numeric,0)*12 ELSE 0 END) AS pipeline_value,
        SUM(CASE WHEN stage = 'won' THEN COALESCE(estimated_monthly_value::numeric,0)*12 ELSE 0 END) AS won_value
       FROM pipeline_deals WHERE workspace_id = $1`,
      [wid]
    );

    res.json({ snapshots: r.rows, live: live.rows[0] });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── GET proposals flagged for follow-up ───────────────────────────────────
router.get("/follow-up-needed", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const r = await db.$client.query(
      `SELECT *,
              EXTRACT(DAY FROM NOW() - created_at)::int AS days_since_created,
              EXTRACT(DAY FROM NOW() - COALESCE(last_follow_up_at, created_at))::int AS days_since_follow_up
       FROM pipeline_deals
       WHERE workspace_id = $1
         AND stage NOT IN ('won','lost')
         AND (
           created_at < NOW() - INTERVAL '7 days'
           AND (last_follow_up_at IS NULL OR last_follow_up_at < NOW() - INTERVAL '7 days')
         )
       ORDER BY created_at ASC`,
      [wid]
    );
    res.json(r.rows);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── POST record follow-up ─────────────────────────────────────────────────
router.post("/proposals/:id/follow-up", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    await db.$client.query(
      `UPDATE pipeline_deals
       SET last_follow_up_at = NOW(),
           follow_up_count = COALESCE(follow_up_count, 0) + 1,
           updated_at = NOW()
       WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, wid]
    );
    const r = await db.$client.query(`SELECT * FROM pipeline_deals WHERE id = $1`, [req.params.id]);
    res.json(r.rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
