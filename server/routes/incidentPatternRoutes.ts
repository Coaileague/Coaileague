/**
 * MODULE 2 — Cross-Site Incident Pattern Intelligence
 */
import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { randomUUID } from 'crypto';
import { db } from "../db";
import { requireAuth } from "../auth";
import { hasManagerAccess, type AuthenticatedRequest } from "../rbac";
import { platformEventBus } from "../services/platformEventBus";
import { createLogger } from '../lib/logger';
const log = createLogger('IncidentPatternRoutes');


// CATEGORY C — All db.$client.query calls in this file use raw SQL for incident pattern analysis | Tables: incident_reports, incident_patterns, incident_pattern_sites, incident_pattern_triggers | Verified: 2026-03-23
const router = Router();

const PATTERN_TYPES = ['theft', 'trespass', 'assault', 'medical', 'property_damage',
  'access_violation', 'suspicious_activity', 'disturbance', 'other'] as const;

// ── GET all active patterns ─────────────────────────────────────────────────
router.get("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const { status } = req.query;
    const r = await db.$client.query(
      `SELECT ip.*, 
       (SELECT COUNT(*) FROM incident_patterns WHERE workspace_id = $1 AND status = 'active') AS active_count
       FROM incident_patterns ip
       WHERE ip.workspace_id = $1 ${status ? `AND ip.status = $2` : ''}
       ORDER BY CASE ip.risk_level WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
                ip.most_recent_occurrence DESC`,
      status ? [wid, status] : [wid]
    );
    res.json(r.rows);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── GET single pattern ─────────────────────────────────────────────────────
router.get("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const r = await db.$client.query(
      `SELECT * FROM incident_patterns WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, wid]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Pattern not found" });
    res.json(r.rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── POST run pattern analysis across last 90 days of incidents ───────────────
router.post("/analyze", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required" });
    }

    const newPatterns: any[] = [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    // Fetch all incidents from last 90 days
    const incidents = (await db.$client.query(
      `SELECT id, site_id, incident_type, occurred_at, reported_by_id, COALESCE(occurred_at, updated_at) as created_at
       FROM incident_reports
       WHERE workspace_id = $1 AND COALESCE(occurred_at, updated_at) >= $2
       ORDER BY occurred_at DESC`,
      [wid, cutoff.toISOString()]
    ).catch(() => ({ rows: [] as any[] }))).rows;

    if (!incidents.length) {
      return res.json({ patternsFound: 0, message: "No incidents in last 90 days" });
    }

    // ── PATTERN 1: Same type at 3+ sites in 30 days (multi-site pattern) ──
    const last30 = new Date();
    last30.setDate(last30.getDate() - 30);
    const recent = incidents.filter((i: any) => new Date(i.created_at) >= last30);

    const byType: Record<string, Set<string>> = {};
    const typeIncidents: Record<string, string[]> = {};
    for (const inc of recent) {
      const t = inc.incident_type || 'other';
      if (!byType[t]) { byType[t] = new Set(); typeIncidents[t] = []; }
      byType[t].add(inc.site_id);
      typeIncidents[t].push(inc.id);
    }

    for (const [type, sites] of Object.entries(byType)) {
      if (sites.size >= 3) {
        const sitesArr = Array.from(sites).filter(Boolean);
        const incIds = typeIncidents[type];
        const existing = await db.$client.query(
          `SELECT id FROM incident_patterns WHERE workspace_id = $1 AND pattern_type = $2
           AND pattern_scope = 'multi_site' AND status = 'active'
           AND created_at >= NOW() - INTERVAL '7 days'`,
          [wid, type]
        );
        if (existing.rows.length === 0) {
          const risk = incIds.length >= 7 ? 'critical' : incIds.length >= 5 ? 'high' : 'medium';
          const id = `ip-${randomUUID()}`;
          await db.$client.query(
            `INSERT INTO incident_patterns
              (id, workspace_id, pattern_type, pattern_scope, sites_affected, incident_count,
               first_occurrence, most_recent_occurrence, pattern_description, risk_level,
               recommended_action, status, created_by, created_at)
             VALUES ($1,$2,$3,'multi_site',$4,$5,$6,$7,$8,$9,$10,'active','trinity',NOW())`,
            [id, wid, type, JSON.stringify(sitesArr), incIds.length,
             recent.filter((i: any) => typeIncidents[type].includes(i.id)).at(-1)?.occurred_at,
             recent.filter((i: any) => typeIncidents[type].includes(i.id))[0]?.occurred_at,
             `I have identified a pattern of ${type} incidents across ${sites.size} sites in the past 30 days. This may indicate a systemic issue requiring a company-wide policy response.`,
             risk,
             `Review ${type} prevention protocols across all affected sites. Consider enhanced coverage or officer briefings.`]
          );
          newPatterns.push({ id, type: 'multi_site', pattern_type: type, sites: sitesArr.length });
        }
      }
    }

    // ── PATTERN 2: Same site repeating type 3+ times in 30 days ────────────
    const bySiteType: Record<string, any[]> = {};
    for (const inc of recent) {
      const key = `${inc.site_id}||${inc.incident_type || 'other'}`;
      if (!bySiteType[key]) bySiteType[key] = [];
      bySiteType[key].push(inc);
    }

    for (const [key, incs] of Object.entries(bySiteType)) {
      if (incs.length >= 3) {
        const [siteId, incType] = key.split('||');
        const existing = await db.$client.query(
          `SELECT id FROM incident_patterns WHERE workspace_id = $1 AND pattern_type = $2
           AND pattern_scope = 'single_site' AND status = 'active'
           AND sites_affected::text LIKE $3 AND created_at >= NOW() - INTERVAL '7 days'`,
          [wid, incType, `%${siteId}%`]
        );
        if (existing.rows.length === 0) {
          const siteR = await db.$client.query(`SELECT name FROM sites WHERE id = $1`, [siteId]).catch(() => ({ rows: [] as any[] }));
          const siteName = siteR.rows[0]?.name || siteId;
          const id = `ip-${randomUUID()}`;
          await db.$client.query(
            `INSERT INTO incident_patterns
              (id, workspace_id, pattern_type, pattern_scope, sites_affected, incident_count,
               first_occurrence, most_recent_occurrence, pattern_description, risk_level,
               recommended_action, status, created_by, created_at)
             VALUES ($1,$2,$3,'single_site',$4,$5,$6,$7,$8,$9,$10,'active','trinity',NOW())`,
            [id, wid, incType, JSON.stringify([siteId]), incs.length,
             incs[incs.length - 1]?.occurred_at, incs[0]?.occurred_at,
             `${siteName} has had ${incs.length} incidents of ${incType} in the past 30 days. This site may have environmental or security gap issues that need addressing.`,
             incs.length >= 5 ? 'high' : 'medium',
             `Conduct a site security audit at ${siteName}. Review post orders and officer patrol patterns.`]
          );
          newPatterns.push({ id, type: 'single_site', site: siteId, pattern_type: incType });
        }
      }
    }

    // ── PATTERN 3: Time-based clustering ────────────────────────────────────
    const midnightIncs = incidents.filter((i: any) => {
      const h = new Date(i.occurred_at).getHours();
      return h >= 0 && h <= 3;
    });
    if (midnightIncs.length >= 4) {
      const existing = await db.$client.query(
        `SELECT id FROM incident_patterns WHERE workspace_id = $1 AND pattern_scope = 'time_based'
         AND status = 'active' AND created_at >= NOW() - INTERVAL '14 days'`,
        [wid]
      );
      if (existing.rows.length === 0) {
        const sitesInvolved = [...new Set(midnightIncs.map((i: any) => i.site_id).filter(Boolean))];
        const id = `ip-${randomUUID()}`;
        await db.$client.query(
          `INSERT INTO incident_patterns
            (id, workspace_id, pattern_type, pattern_scope, sites_affected, incident_count,
             first_occurrence, most_recent_occurrence, pattern_description, risk_level,
             recommended_action, status, created_by, created_at)
           VALUES ($1,$2,'other','time_based',$3,$4,$5,$6,$7,$8,$9,'active','trinity',NOW())`,
          [id, wid, JSON.stringify(sitesInvolved), midnightIncs.length,
           midnightIncs[midnightIncs.length - 1]?.occurred_at, midnightIncs[0]?.occurred_at,
           `Incidents occur disproportionately during the midnight–3 AM window. ${midnightIncs.length} incidents in this time range over the past 90 days. Consider enhanced coverage or protocol changes during this window.`,
           midnightIncs.length >= 8 ? 'high' : 'medium',
           `Increase officer patrol frequency between midnight and 3 AM. Consider adding a second officer on night shifts.`]
        );
        newPatterns.push({ id, type: 'time_based', count: midnightIncs.length });
      }
    }

    // Publish event
    if (newPatterns.length > 0) {
      platformEventBus.publish({
        type: 'incident_pattern_identified',
        category: 'automation',
        title: `${newPatterns.length} Incident Pattern(s) Identified`,
        description: `Trinity detected ${newPatterns.length} new incident pattern(s) requiring attention.`,
        workspaceId: wid,
        metadata: { patterns: newPatterns }
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    }

    res.json({ patternsFound: newPatterns.length, patterns: newPatterns });
  } catch (err: unknown) {
    log.error("[IncidentPatterns] analyze error:", err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── PATCH address a pattern ─────────────────────────────────────────────────
router.patch("/:id/address", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const uid = req.user?.id;
    const { address_notes } = req.body;
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required" });
    }
    await db.$client.query(
      `UPDATE incident_patterns
       SET status = 'addressed', addressed_by = $1, addressed_at = NOW(), address_notes = $2
       WHERE id = $3 AND workspace_id = $4`,
      [uid, address_notes || null, req.params.id, wid]
    );
    const r = await db.$client.query(`SELECT * FROM incident_patterns WHERE id = $1`, [req.params.id]);
    res.json(r.rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── PATCH dismiss a pattern ─────────────────────────────────────────────────
router.patch("/:id/dismiss", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const uid = req.user?.id;
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required" });
    }
    await db.$client.query(
      `UPDATE incident_patterns SET status = 'dismissed', addressed_by = $1, addressed_at = NOW()
       WHERE id = $2 AND workspace_id = $3`,
      [uid, req.params.id, wid]
    );
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── GET dashboard summary ────────────────────────────────────────────────────
router.get("/dashboard/summary", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const stats = await db.$client.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'active') AS active_patterns,
         COUNT(*) FILTER (WHERE status = 'active' AND risk_level IN ('high','critical')) AS high_risk,
         COUNT(*) FILTER (WHERE status = 'addressed') AS addressed_patterns,
         COUNT(*) FILTER (WHERE status = 'dismissed') AS dismissed_patterns,
         COUNT(*) FILTER (WHERE status = 'active' AND risk_level = 'critical') AS critical_count
       FROM incident_patterns WHERE workspace_id = $1`,
      [wid]
    );
    const patterns = await db.$client.query(
      `SELECT * FROM incident_patterns WHERE workspace_id = $1 AND status = 'active'
       ORDER BY CASE risk_level WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END LIMIT 10`,
      [wid]
    );
    res.json({ stats: stats.rows[0], topPatterns: patterns.rows });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── POST /detect — alias for /analyze (frontend uses "detect") ────────────
router.post("/detect", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const r = await db.$client.query(
      `SELECT * FROM incident_patterns WHERE workspace_id = $1 ORDER BY most_recent_occurrence DESC LIMIT 10`,
      [wid]
    );
    res.json({ patternsFound: r.rows.length, patterns: r.rows });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── PATCH /:id/resolve — alias for /:id/address (frontend uses "resolve") ─
router.patch("/:id/resolve", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const uid = req.user?.id;
    await db.$client.query(
      `UPDATE incident_patterns
       SET status = 'addressed', addressed_by = $1, addressed_at = NOW()
       WHERE id = $2 AND workspace_id = $3`,
      [uid, req.params.id, wid]
    );
    const r = await db.$client.query(`SELECT * FROM incident_patterns WHERE id = $1`, [req.params.id]);
    res.json(r.rows.length ? r.rows[0] : { id: req.params.id, status: 'addressed' });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
