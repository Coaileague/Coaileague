/**
 * MODULE 6 — Subcontractor Management
 */
import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { randomUUID } from 'crypto';
import { db } from "../db";
import { requireAuth } from "../auth";
import { hasManagerAccess, type AuthenticatedRequest } from "../rbac";
import { platformEventBus } from "../services/platformEventBus";
import { createLogger } from '../lib/logger';
const log = createLogger('subcontractorRoutes');

// CATEGORY C — All db.$client.query calls in this file use raw SQL for subcontractor management | Tables: subcontractor_companies, subcontractor_guards, subcontractor_assignments | Verified: 2026-03-23
const router = Router();

// ── GET all subcontractor companies ────────────────────────────────────────
router.get("/companies", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const r = await db.$client.query(
      `SELECT sc.*,
              CASE
                WHEN sc.insurance_expiration IS NULL THEN 'no_expiry'
                WHEN sc.insurance_expiration < CURRENT_DATE THEN 'expired'
                WHEN (sc.insurance_expiration - CURRENT_DATE) <= 20 THEN 'critical'
                WHEN (sc.insurance_expiration - CURRENT_DATE) <= 60 THEN 'warning'
                ELSE 'ok'
              END AS coi_status,
              CASE
                WHEN sc.company_license_expiration IS NULL THEN 'no_expiry'
                WHEN sc.company_license_expiration < CURRENT_DATE THEN 'expired'
                WHEN (sc.company_license_expiration - CURRENT_DATE) <= 30 THEN 'critical'
                WHEN (sc.company_license_expiration - CURRENT_DATE) <= 90 THEN 'warning'
                ELSE 'ok'
              END AS license_status,
              (sc.insurance_expiration - CURRENT_DATE) AS coi_days_left,
              (sc.company_license_expiration - CURRENT_DATE) AS license_days_left
       FROM subcontractor_companies sc
       WHERE sc.workspace_id = $1
       ORDER BY sc.status DESC, sc.company_name`,
      [wid]
    );
    res.json(r.rows);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── GET single subcontractor ───────────────────────────────────────────────
router.get("/companies/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const r = await db.$client.query(
      `SELECT sc.*,
              (sc.insurance_expiration - CURRENT_DATE) AS coi_days_left,
              (sc.company_license_expiration - CURRENT_DATE) AS license_days_left
       FROM subcontractor_companies sc
       WHERE sc.id = $1 AND sc.workspace_id = $2`,
      [req.params.id, wid]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Subcontractor not found" });
    res.json(r.rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── POST create subcontractor ──────────────────────────────────────────────
router.post("/companies", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const uid = req.user?.id;
    if (!hasManagerAccess(req.workspaceRole || '')) return res.status(403).json({ error: "Manager access required" });
    const {
      company_name, dba_name, contact_name, contact_email, contact_phone,
      company_license_number, company_license_state, company_license_expiration,
      insurance_coi_path, insurance_expiration, insurance_coverage_amount,
      contract_path, contract_start, contract_end, payment_terms, hourly_rate, flat_rate, notes
    } = req.body;
    if (!company_name) return res.status(400).json({ error: "company_name required" });
    const id = `sc-${randomUUID()}`;
    await db.$client.query(
      `INSERT INTO subcontractor_companies
        (id, workspace_id, company_name, dba_name, contact_name, contact_email, contact_phone,
         company_license_number, company_license_state, company_license_expiration,
         insurance_coi_path, insurance_expiration, insurance_coverage_amount,
         contract_path, contract_start, contract_end, payment_terms, hourly_rate, flat_rate,
         status, notes, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'active',$20,$21,NOW())`,
      [id, wid, company_name, dba_name || null, contact_name || null, contact_email || null,
       contact_phone || null, company_license_number || null, company_license_state || 'TX',
       company_license_expiration || null, insurance_coi_path || null, insurance_expiration || null,
       insurance_coverage_amount || null, contract_path || null, contract_start || null,
       contract_end || null, payment_terms || null, hourly_rate || null, flat_rate || null,
       notes || null, uid]
    );

    if (insurance_expiration) {
      const days = Math.floor((new Date(insurance_expiration).getTime() - Date.now()) / 86400000);
      if (days <= 60) {
        platformEventBus.publish({
          type: 'subcontractor_compliance_issue',
          category: 'automation',
          title: `Subcontractor COI Expiring — ${company_name}`,
          description: `Certificate of Insurance expires in ${days} days.`,
          workspaceId: wid,
          metadata: { subcontractorId: id, companyName: company_name, daysLeft: days }
        }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
      }
    }

    const r = await db.$client.query(`SELECT * FROM subcontractor_companies WHERE id = $1`, [id]);
    res.status(201).json(r.rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── PATCH update subcontractor ─────────────────────────────────────────────
router.patch("/companies/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    if (!hasManagerAccess(req.workspaceRole || '')) return res.status(403).json({ error: "Manager access required" });
    const allowed = ['company_name','dba_name','contact_name','contact_email','contact_phone',
      'company_license_number','company_license_state','company_license_expiration',
      'insurance_coi_path','insurance_expiration','insurance_coverage_amount',
      'contract_path','contract_start','contract_end','payment_terms',
      'hourly_rate','flat_rate','status','notes'];
    const updates: string[] = [];
    const vals: any[] = [];
    let i = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) { updates.push(`${key} = $${i++}`); vals.push(req.body[key]); }
    }
    if (!updates.length) return res.status(400).json({ error: "No fields to update" });
    vals.push(req.params.id, wid);
    await db.$client.query(
      `UPDATE subcontractor_companies SET ${updates.join(', ')} WHERE id = $${i++} AND workspace_id = $${i}`,
      vals
    );
    const r = await db.$client.query(`SELECT * FROM subcontractor_companies WHERE id = $1`, [req.params.id]);
    res.json(r.rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── GET compliance alerts ──────────────────────────────────────────────────
router.get("/alerts", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const r = await db.$client.query(
      `SELECT id, company_name,
              insurance_expiration, (insurance_expiration - CURRENT_DATE) AS coi_days_left,
              company_license_expiration, (company_license_expiration - CURRENT_DATE) AS license_days_left,
              status
       FROM subcontractor_companies
       WHERE workspace_id = $1 AND status = 'active'
         AND (
           (insurance_expiration IS NOT NULL AND (insurance_expiration - CURRENT_DATE) <= 60)
           OR (company_license_expiration IS NOT NULL AND (company_license_expiration - CURRENT_DATE) <= 90)
         )
       ORDER BY LEAST(insurance_expiration, company_license_expiration) ASC`,
      [wid]
    );
    res.json(r.rows);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── GET dashboard summary ─────────────────────────────────────────────────
router.get("/dashboard", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const stats = await db.$client.query(
      `SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'active') AS active_count,
        COUNT(*) FILTER (WHERE insurance_expiration < CURRENT_DATE AND status = 'active') AS coi_expired,
        COUNT(*) FILTER (WHERE insurance_expiration IS NOT NULL AND (insurance_expiration - CURRENT_DATE) <= 60 AND insurance_expiration >= CURRENT_DATE) AS coi_expiring_soon,
        COUNT(*) FILTER (WHERE company_license_expiration < CURRENT_DATE AND status = 'active') AS license_expired,
        COUNT(*) FILTER (WHERE company_license_expiration IS NOT NULL AND (company_license_expiration - CURRENT_DATE) <= 30 AND company_license_expiration >= CURRENT_DATE) AS license_expiring_soon
       FROM subcontractor_companies WHERE workspace_id = $1`,
      [wid]
    );
    const companies = await db.$client.query(
      `SELECT *, (insurance_expiration - CURRENT_DATE) AS coi_days_left
       FROM subcontractor_companies WHERE workspace_id = $1 ORDER BY company_name`,
      [wid]
    );
    res.json({ stats: stats.rows[0], companies: companies.rows });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── Root aliases (frontend uses /api/subcontractors directly) ──────────────
router.get("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const { status } = req.query;
    const r = await db.$client.query(
      `SELECT sc.*,
              CASE
                WHEN sc.insurance_expiration IS NULL THEN 'no_expiry'
                WHEN sc.insurance_expiration < CURRENT_DATE THEN 'expired'
                WHEN (sc.insurance_expiration - CURRENT_DATE) <= 20 THEN 'critical'
                WHEN (sc.insurance_expiration - CURRENT_DATE) <= 60 THEN 'warning'
                ELSE 'ok'
              END AS coi_status,
              (sc.insurance_expiration - CURRENT_DATE) AS coi_days_left,
              (sc.company_license_expiration - CURRENT_DATE) AS license_days_left
       FROM subcontractor_companies sc
       WHERE sc.workspace_id = $1 ${status && status !== 'all' ? `AND sc.status = $2` : ''}
       ORDER BY sc.status DESC, sc.company_name`,
      status && status !== 'all' ? [wid, status] : [wid]
    );
    res.json(r.rows);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.post("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const uid = req.user?.id;
    const {
      company_name, dba_name, contact_name, contact_email, contact_phone,
      company_license_number, company_license_state, company_license_expiration,
      insurance_expiration, insurance_coverage_amount,
      contract_start, contract_end, payment_terms, hourly_rate, flat_rate, notes
    } = req.body;
    if (!company_name) return res.status(400).json({ error: "company_name required" });
    const id = `sc-${randomUUID()}`;
    await db.$client.query(
      `INSERT INTO subcontractor_companies
        (id, workspace_id, company_name, dba_name, contact_name, contact_email, contact_phone,
         company_license_number, company_license_state, company_license_expiration,
         insurance_expiration, insurance_coverage_amount,
         contract_start, contract_end, payment_terms, hourly_rate, flat_rate,
         status, notes, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'active',$18,$19,NOW())`,
      [id, wid, company_name, dba_name || null, contact_name || null, contact_email || null,
       contact_phone || null, company_license_number || null, company_license_state || 'TX',
       company_license_expiration || null, insurance_expiration || null, insurance_coverage_amount || null,
       contract_start || null, contract_end || null, payment_terms || null,
       hourly_rate || null, flat_rate || null, notes || null, uid]
    );
    const r = await db.$client.query(`SELECT * FROM subcontractor_companies WHERE id = $1`, [id]);
    res.status(201).json(r.rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.patch("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const allowed = ['company_name','contact_name','contact_email','contact_phone','status',
      'insurance_expiration','insurance_coverage_amount','notes'];
    const updates: string[] = [];
    const vals: any[] = [];
    let i = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) { updates.push(`${key} = $${i++}`); vals.push(req.body[key]); }
    }
    if (!updates.length) return res.status(400).json({ error: "No fields to update" });
    vals.push(req.params.id, wid);
    await db.$client.query(
      `UPDATE subcontractor_companies SET ${updates.join(', ')} WHERE id = $${i++} AND workspace_id = $${i}`,
      vals
    );
    const r = await db.$client.query(`SELECT * FROM subcontractor_companies WHERE id = $1`, [req.params.id]);
    res.json(r.rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
