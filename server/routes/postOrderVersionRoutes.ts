/**
 * MODULE 1 — Post Order Version Control & Acknowledgment System
 */
import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { randomUUID } from 'crypto';
import { db } from "../db";
import { requireAuth } from "../auth";
import { hasManagerAccess, type AuthenticatedRequest } from "../rbac";
import { platformEventBus } from "../services/platformEventBus";
import { createLogger } from '../lib/logger';
const log = createLogger('PostOrderVersionRoutes');


// CATEGORY C — All db.$client.query calls in this file use raw SQL for post order version control | Tables: post_order_versions, post_order_acknowledgments, employees, sites | Verified: 2026-03-23
const router = Router();

// ── GET all versions for a site ────────────────────────────────────────────
router.get("/sites/:siteId/versions", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const { siteId } = req.params;
    const r = await db.$client.query(
      `SELECT pov.*, e.first_name || ' ' || e.last_name AS created_by_name
       FROM post_order_versions pov
       LEFT JOIN employees e ON e.id = pov.created_by AND e.workspace_id = $1
       WHERE pov.workspace_id = $1 AND pov.site_id = $2
       ORDER BY pov.version_number DESC`,
      [wid, siteId]
    );
    res.json(r.rows);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── GET current version for a site ─────────────────────────────────────────
router.get("/sites/:siteId/current", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const { siteId } = req.params;
    const r = await db.$client.query(
      `SELECT pov.*, e.first_name || ' ' || e.last_name AS created_by_name
       FROM post_order_versions pov
       LEFT JOIN employees e ON e.id = pov.created_by AND e.workspace_id = $1
       WHERE pov.workspace_id = $1 AND pov.site_id = $2 AND pov.is_current = TRUE
       ORDER BY pov.version_number DESC LIMIT 1`,
      [wid, siteId]
    );
    if (r.rows.length === 0) return res.json(null);
    res.json(r.rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── GET current versions for all sites (workspace-level) ────────────────────
router.get("/current", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const r = await db.$client.query(
      `SELECT pov.*, s.name AS site_name
       FROM post_order_versions pov
       LEFT JOIN sites s ON s.id = pov.site_id AND s.workspace_id = $1
       WHERE pov.workspace_id = $1 AND pov.is_current = TRUE
       ORDER BY s.name`,
      [wid]
    );
    res.json(r.rows);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── GET all versions for the workspace ──────────────────────────────────────
router.get("/all", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const r = await db.$client.query(
      `SELECT pov.*, s.name AS site_name,
              e.first_name || ' ' || e.last_name AS created_by_name
       FROM post_order_versions pov
       LEFT JOIN sites s ON s.id = pov.site_id AND s.workspace_id = $1
       LEFT JOIN employees e ON e.id = pov.created_by AND e.workspace_id = $1
       WHERE pov.workspace_id = $1
       ORDER BY s.name, pov.version_number DESC`,
      [wid]
    );
    res.json(r.rows);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── GET all sites with their current post order versions ────────────────────
router.get("/summary", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const r = await db.$client.query(
      `SELECT s.id AS site_id, s.name AS site_name,
              pov.id AS version_id, pov.version_number, pov.title,
              pov.acknowledged_count, pov.pending_count,
              pov.acknowledgment_deadline, pov.requires_acknowledgment,
              pov.created_at AS version_created_at
       FROM sites s
       LEFT JOIN post_order_versions pov ON pov.site_id = s.id AND pov.is_current = TRUE AND pov.workspace_id = $1
       WHERE s.workspace_id = $1
       ORDER BY s.name`,
      [wid]
    );
    res.json(r.rows);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── POST create new version (manager+) ──────────────────────────────────────
router.post("/sites/:siteId/versions", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const uid = req.user?.id;
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required" });
    }
    const { siteId } = req.params;
    const { title, content, change_summary, effective_date, requires_acknowledgment, acknowledgment_deadline, officers_required_to_acknowledge } = req.body;
    if (!title || !content) return res.status(400).json({ error: "title and content required" });

    // Get next version number
    const vr = await db.$client.query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_v FROM post_order_versions WHERE workspace_id = $1 AND site_id = $2`,
      [wid, siteId]
    );
    const nextV = vr.rows[0].next_v;

    // Mark all prior versions as not current
    await db.$client.query(
      `UPDATE post_order_versions SET is_current = FALSE WHERE workspace_id = $1 AND site_id = $2`,
      [wid, siteId]
    );

    // Get site officers assigned if not provided
    let officerIds = officers_required_to_acknowledge || [];
    if (!officerIds.length) {
      const empR = await db.$client.query(
        `SELECT e.id FROM employees e
         JOIN site_assignments sa ON sa.employee_id = e.id
         WHERE sa.site_id = $1 AND sa.workspace_id = $2 AND e.status = 'active'`,
        [siteId, wid]
      ).catch(() => ({ rows: [] as any[] }));
      officerIds = empR.rows.map((r: any) => r.id);
    }

    const id = `pov-${randomUUID()}`;
    await db.$client.query(
      `INSERT INTO post_order_versions
        (id, workspace_id, site_id, version_number, title, content, change_summary,
         effective_date, created_by, is_current, requires_acknowledgment,
         acknowledgment_deadline, officers_required_to_acknowledge,
         acknowledged_count, pending_count, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,$10,$11,$12,0,$13,NOW())`,
      [id, wid, siteId, nextV, title, content, change_summary || null,
       effective_date || null, uid, requires_acknowledgment !== false,
       acknowledgment_deadline || null, JSON.stringify(officerIds), officerIds.length]
    );

    // Get site name for event
    const siteR = await db.$client.query(`SELECT name FROM sites WHERE id = $1`, [siteId]).catch(() => ({ rows: [] as any[] }));
    const siteName = siteR.rows[0]?.name || siteId;

    platformEventBus.publish({
      type: 'post_order_updated',
      category: 'automation',
      title: `Post Order Updated — ${siteName}`,
      description: `Version ${nextV} published. ${change_summary || 'No change summary.'}`,
      workspaceId: wid,
      metadata: { versionId: id, siteId, siteName, versionNumber: nextV }
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    const row = await db.$client.query(`SELECT * FROM post_order_versions WHERE id = $1`, [id]);
    res.status(201).json(row.rows[0]);
  } catch (err: unknown) {
    log.error("[PostOrderVersions] create error:", err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── POST revert to a previous version (creates new version with old content) ─
router.post("/versions/:versionId/revert", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const uid = req.user?.id;
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required" });
    }
    const { versionId } = req.params;
    const [old] = (await db.$client.query(
      `SELECT * FROM post_order_versions WHERE id = $1 AND workspace_id = $2`,
      [versionId, wid]
    )).rows;
    if (!old) return res.status(404).json({ error: "Version not found" });

    // Get next version number for this site
    const vr = await db.$client.query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_v FROM post_order_versions WHERE workspace_id = $1 AND site_id = $2`,
      [wid, old.site_id]
    );
    const nextV = vr.rows[0].next_v;

    await db.$client.query(
      `UPDATE post_order_versions SET is_current = FALSE WHERE workspace_id = $1 AND site_id = $2`,
      [wid, old.site_id]
    );

    const id = `pov-${randomUUID()}`;
    await db.$client.query(
      `INSERT INTO post_order_versions
        (id, workspace_id, site_id, version_number, title, content, change_summary,
         effective_date, created_by, is_current, requires_acknowledgment,
         acknowledgment_deadline, officers_required_to_acknowledge,
         acknowledged_count, pending_count, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,$10,$11,$12,0,$13,NOW())`,
      [id, wid, old.site_id, nextV, old.title, old.content,
       `Reverted to Version ${old.version_number}`,
       old.effective_date, uid, old.requires_acknowledgment,
       old.acknowledgment_deadline, JSON.stringify(old.officers_required_to_acknowledge || []),
       (old.officers_required_to_acknowledge || []).length]
    );

    const row = await db.$client.query(`SELECT * FROM post_order_versions WHERE id = $1`, [id]);
    res.status(201).json(row.rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── POST acknowledge a version ──────────────────────────────────────────────
router.post("/versions/:versionId/acknowledge", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const uid = req.user?.id;
    const { versionId } = req.params;
    const { employee_id, acknowledgment_method } = req.body;
    const empId = employee_id || uid;

    const [version] = (await db.$client.query(
      `SELECT * FROM post_order_versions WHERE id = $1 AND workspace_id = $2`,
      [versionId, wid]
    )).rows;
    if (!version) return res.status(404).json({ error: "Version not found" });

    // Check if already acknowledged
    const existing = await db.$client.query(
      `SELECT id FROM post_order_version_acknowledgments WHERE post_order_version_id = $1 AND employee_id = $2`,
      [versionId, empId]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Already acknowledged" });
    }

    const id = `pova-${randomUUID()}`;
    await db.$client.query(
      `INSERT INTO post_order_version_acknowledgments
        (id, workspace_id, site_id, post_order_version_id, employee_id, acknowledged_at, acknowledgment_method, ip_address)
       VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7)`,
      [id, wid, version.site_id, versionId, empId, acknowledgment_method || 'manual', req.ip || null]
    );

    // Update counts
    const ackCount = await db.$client.query(
      `SELECT COUNT(*) AS cnt FROM post_order_version_acknowledgments WHERE post_order_version_id = $1`,
      [versionId]
    );
    const acked = parseInt(ackCount.rows[0].cnt);
    const total = (version.officers_required_to_acknowledge || []).length;
    await db.$client.query(
      `UPDATE post_order_versions SET acknowledged_count = $1, pending_count = $2 WHERE id = $3`,
      [acked, Math.max(0, total - acked), versionId]
    );

    platformEventBus.publish({
      type: 'post_order_acknowledged',
      category: 'automation',
      title: 'Post Order Acknowledged',
      description: `Officer acknowledged version ${version.version_number}`,
      workspaceId: wid,
      metadata: { versionId, empId, method: acknowledgment_method }
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    res.json({ success: true, acknowledgedCount: acked, pendingCount: Math.max(0, total - acked) });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── GET acknowledgments for a version ──────────────────────────────────────
router.get("/versions/:versionId/acknowledgments", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const { versionId } = req.params;
    const r = await db.$client.query(
      `SELECT pova.*, e.first_name, e.last_name, e.employee_id AS badge_id
       FROM post_order_version_acknowledgments pova
       LEFT JOIN employees e ON e.id = pova.employee_id AND e.workspace_id = $1
       WHERE pova.workspace_id = $1 AND pova.post_order_version_id = $2
       ORDER BY pova.acknowledged_at DESC`,
      [wid, versionId]
    );
    res.json(r.rows);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── GET unacknowledged officers for a version ────────────────────────────────
router.get("/versions/:versionId/pending", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const { versionId } = req.params;
    const [version] = (await db.$client.query(
      `SELECT * FROM post_order_versions WHERE id = $1 AND workspace_id = $2`,
      [versionId, wid]
    )).rows;
    if (!version) return res.status(404).json({ error: "Version not found" });

    const officers = version.officers_required_to_acknowledge || [];
    if (!officers.length) return res.json([]);

    const acked = (await db.$client.query(
      `SELECT employee_id FROM post_order_version_acknowledgments WHERE post_order_version_id = $1`,
      [versionId]
    )).rows.map((r: any) => r.employee_id);

    const pending = officers.filter((id: string) => !acked.includes(id));
    if (!pending.length) return res.json([]);

    const empR = await db.$client.query(
      `SELECT id, first_name, last_name, email, phone FROM employees WHERE id = ANY($1::text[]) AND workspace_id = $2`,
      [pending, wid]
    );
    res.json(empR.rows);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── POST root alias — creates new version by extracting site_id from body ───
router.post("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const uid = req.user?.id;
    const { site_id, title, content, change_summary, effective_date, requires_acknowledgment, acknowledgment_deadline } = req.body;
    if (!site_id) return res.status(400).json({ error: "site_id required" });
    if (!title || !content) return res.status(400).json({ error: "title and content required" });

    const vr = await db.$client.query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_v FROM post_order_versions WHERE workspace_id = $1 AND site_id = $2`,
      [wid, site_id]
    );
    const nextV = vr.rows[0].next_v;

    await db.$client.query(
      `UPDATE post_order_versions SET is_current = FALSE WHERE workspace_id = $1 AND site_id = $2`,
      [wid, site_id]
    );

    const id = `pov-${randomUUID()}`;
    await db.$client.query(
      `INSERT INTO post_order_versions
        (id, workspace_id, site_id, version_number, title, content, change_summary,
         effective_date, created_by, is_current, requires_acknowledgment,
         acknowledgment_deadline, officers_required_to_acknowledge,
         acknowledged_count, pending_count, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,$10,$11,'[]',0,0,NOW())`,
      [id, wid, site_id, nextV, title, content, change_summary || null,
       effective_date || null, uid, requires_acknowledgment !== false,
       acknowledgment_deadline || null]
    );

    const r = await db.$client.query(`SELECT * FROM post_order_versions WHERE id = $1`, [id]);
    res.status(201).json(r.rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
