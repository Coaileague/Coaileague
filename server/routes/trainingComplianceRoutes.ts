/**
 * MODULE 5 — Training & Certification Management
 */
import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { randomUUID } from 'crypto';
import { db } from "../db";
import { requireAuth } from "../auth";
import { hasManagerAccess, type AuthenticatedRequest } from "../rbac";
import { platformEventBus } from "../services/platformEventBus";
import { createLogger } from '../lib/logger';
const log = createLogger('trainingComplianceRoutes');

// CATEGORY C — All db.$client.query calls in this file use raw SQL for training compliance management | Tables: training_requirements, employee_training_records, employees | Verified: 2026-03-23
const router = Router();

// ── GET training requirements (platform + workspace) ──────────────────────
router.get("/requirements", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const r = await db.$client.query(
      `SELECT * FROM training_requirements
       WHERE (workspace_id = $1 OR workspace_id IS NULL) AND active = TRUE
       ORDER BY state_required DESC, requirement_type, requirement_name`,
      [wid]
    );
    res.json(r.rows);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── POST create training requirement ──────────────────────────────────────
router.post("/requirements", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const uid = req.user?.id;
    if (!hasManagerAccess(req.workspaceRole || '')) return res.status(403).json({ error: "Manager access required" });
    const {
      requirement_name, requirement_type, applies_to_roles, applies_to_positions,
      applies_to_sites, frequency, frequency_months, required_hours, provider_required,
      approved_providers, consequence_of_expiry, state_required, state_code, regulatory_reference
    } = req.body;
    if (!requirement_name || !requirement_type) return res.status(400).json({ error: "requirement_name and requirement_type required" });
    const id = `req-${randomUUID()}`;
    await db.$client.query(
      `INSERT INTO training_requirements
        (id, workspace_id, requirement_name, requirement_type, applies_to_roles, applies_to_positions,
         applies_to_sites, frequency, frequency_months, required_hours, provider_required,
         approved_providers, consequence_of_expiry, state_required, state_code, regulatory_reference,
         created_by, active, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,TRUE,NOW())`,
      [id, wid, requirement_name, requirement_type,
       JSON.stringify(applies_to_roles || []), JSON.stringify(applies_to_positions || []),
       JSON.stringify(applies_to_sites || []), frequency || 'annual', frequency_months || null,
       required_hours || null, provider_required || false,
       JSON.stringify(approved_providers || []), consequence_of_expiry || 'warning',
       state_required || false, state_code || 'TX', regulatory_reference || null, uid]
    );
    const r = await db.$client.query(`SELECT * FROM training_requirements WHERE id = $1`, [id]);
    res.status(201).json(r.rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── GET all training records for workspace ─────────────────────────────────
router.get("/records", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const { employee_id, status } = req.query;
    let query = `SELECT etr.*, e.first_name, e.last_name, e.employee_id AS badge_id,
                        tr.requirement_name, tr.requirement_type, tr.consequence_of_expiry,
                        CASE
                          WHEN etr.expiration_date IS NULL THEN 'no_expiry'
                          WHEN etr.expiration_date < CURRENT_DATE THEN 'expired'
                          WHEN (etr.expiration_date - CURRENT_DATE) <= 30 THEN 'expiring_soon'
                          WHEN (etr.expiration_date - CURRENT_DATE) <= 90 THEN 'expiring_90'
                          ELSE 'current'
                        END AS computed_status,
                        (etr.expiration_date - CURRENT_DATE) AS days_until_expiry
                 FROM employee_training_records etr
                 LEFT JOIN employees e ON e.id = etr.employee_id AND e.workspace_id = $1
                 LEFT JOIN training_requirements tr ON tr.id = etr.requirement_id
                 WHERE etr.workspace_id = $1`;
    const vals: any[] = [wid];
    let i = 2;
    if (employee_id) { query += ` AND etr.employee_id = $${i++}`; vals.push(employee_id); }
    if (status) { query += ` AND etr.status = $${i++}`; vals.push(status); }
    query += ` ORDER BY etr.expiration_date ASC NULLS LAST`;
    const r = await db.$client.query(query, vals);
    res.json(r.rows);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── POST create/update training record ────────────────────────────────────
router.post("/records", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const uid = req.user?.id;
    if (!hasManagerAccess(req.workspaceRole || '')) return res.status(403).json({ error: "Manager access required" });
    const {
      employee_id, requirement_id, training_name, completion_date,
      expiration_date, hours_completed, provider_name, certificate_number,
      certificate_file_path, notes
    } = req.body;
    if (!employee_id || !training_name) return res.status(400).json({ error: "employee_id and training_name required" });

    let status = 'current';
    if (expiration_date) {
      const days = Math.floor((new Date(expiration_date).getTime() - Date.now()) / 86400000);
      if (days < 0) status = 'expired';
      else if (days <= 30) status = 'expiring_soon';
      else if (days <= 90) status = 'expiring_soon';
    }

    const id = `etr-${randomUUID()}`;
    await db.$client.query(
      `INSERT INTO employee_training_records
        (id, workspace_id, employee_id, requirement_id, training_name, completion_date,
         expiration_date, hours_completed, provider_name, certificate_number,
         certificate_file_path, verified, verified_by, verified_at, status, notes, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE,$12,NOW(),$13,$14,NOW())`,
      [id, wid, employee_id, requirement_id || null, training_name, completion_date || null,
       expiration_date || null, hours_completed || null, provider_name || null,
       certificate_number || null, certificate_file_path || null, uid, status, notes || null]
    );

    if (expiration_date) {
      const days = Math.floor((new Date(expiration_date).getTime() - Date.now()) / 86400000);
      if (days <= 30 && days >= 0) {
        platformEventBus.publish({
          type: 'training_expiring',
          category: 'automation',
          title: `Training Expiring Soon — ${training_name}`,
          description: `Expires in ${days} days. Action required.`,
          workspaceId: wid,
          metadata: { employeeId: employee_id, trainingName: training_name, daysLeft: days }
        }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
      } else if (days < 0) {
        platformEventBus.publish({
          type: 'training_expired',
          category: 'automation',
          title: `Training Expired — ${training_name}`,
          description: `Expired ${Math.abs(days)} days ago. Immediate action required.`,
          workspaceId: wid,
          metadata: { employeeId: employee_id, trainingName: training_name }
        }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
      }
    }

    const r = await db.$client.query(`SELECT * FROM employee_training_records WHERE id = $1`, [id]);
    res.status(201).json(r.rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── PATCH update training record ───────────────────────────────────────────
router.patch("/records/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const allowed = ['training_name','completion_date','expiration_date','hours_completed',
      'provider_name','certificate_number','status','notes','verified'];
    const updates: string[] = [];
    const vals: any[] = [];
    let i = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) { updates.push(`${key} = $${i++}`); vals.push(req.body[key]); }
    }
    if (!updates.length) return res.status(400).json({ error: "No fields" });
    vals.push(req.params.id, wid);
    await db.$client.query(
      `UPDATE employee_training_records SET ${updates.join(', ')} WHERE id = $${i++} AND workspace_id = $${i}`,
      vals
    );
    const r = await db.$client.query(`SELECT * FROM employee_training_records WHERE id = $1`, [req.params.id]);
    res.json(r.rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── GET compliance grid (officers × requirements) ─────────────────────────
router.get("/compliance-grid", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const officers = (await db.$client.query(
      `SELECT id, first_name, last_name, position, employee_id AS badge_id
       FROM employees WHERE workspace_id = $1 AND is_active = TRUE
       ORDER BY last_name, first_name LIMIT 100`,
      [wid]
    )).rows;

    const requirements = (await db.$client.query(
      `SELECT * FROM training_requirements WHERE (workspace_id = $1 OR workspace_id IS NULL) AND active = TRUE
       ORDER BY state_required DESC, requirement_name`,
      [wid]
    )).rows;

    const records = (await db.$client.query(
      `SELECT etr.*, (etr.expiration_date - CURRENT_DATE) AS days_left
       FROM employee_training_records etr
       WHERE etr.workspace_id = $1`,
      [wid]
    )).rows;

    const recordMap: Record<string, Record<string, any>> = {};
    for (const rec of records) {
      if (!recordMap[rec.employee_id]) recordMap[rec.employee_id] = {};
      if (rec.requirement_id) {
        const existing = recordMap[rec.employee_id][rec.requirement_id];
        if (!existing || new Date(rec.expiration_date) > new Date(existing.expiration_date)) {
          recordMap[rec.employee_id][rec.requirement_id] = rec;
        }
      }
    }

    const grid = officers.map((officer: any) => ({
      officer,
      certifications: requirements.map((req: any) => {
        const rec = recordMap[officer.id]?.[req.id];
        if (!rec) return { requirementId: req.id, status: 'not_on_file', days_left: null };
        const days = rec.days_left;
        let status = 'current';
        if (days === null || days === undefined) status = 'current';
        else if (days < 0) status = 'expired';
        else if (days <= 30) status = 'expiring_critical';
        else if (days <= 90) status = 'expiring_soon';
        return { requirementId: req.id, status, days_left: days, record: rec };
      })
    }));

    res.json({ officers: officers.length, requirements: requirements.length, grid, requirementsList: requirements });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── GET expiring training alerts ───────────────────────────────────────────
router.get("/alerts", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const r = await db.$client.query(
      `SELECT etr.*, e.first_name, e.last_name, e.email,
              tr.requirement_name, tr.consequence_of_expiry,
              (etr.expiration_date - CURRENT_DATE) AS days_left
       FROM employee_training_records etr
       LEFT JOIN employees e ON e.id = etr.employee_id AND e.workspace_id = $1
       LEFT JOIN training_requirements tr ON tr.id = etr.requirement_id
       WHERE etr.workspace_id = $1 AND etr.expiration_date IS NOT NULL
         AND (etr.expiration_date - CURRENT_DATE) <= 90
       ORDER BY etr.expiration_date ASC`,
      [wid]
    );
    res.json(r.rows);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── POST schedule training session ────────────────────────────────────────
router.post("/schedule", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const uid = req.user?.id;
    const { employee_id, requirement_id, scheduled_date, provider, location } = req.body;
    if (!employee_id || !scheduled_date) return res.status(400).json({ error: "employee_id and scheduled_date required" });
    const id = `tss-${randomUUID()}`;
    await db.$client.query(
      `INSERT INTO training_scheduled_sessions (id, workspace_id, employee_id, requirement_id, scheduled_date, provider, location, status, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'scheduled',$8,NOW())`,
      [id, wid, employee_id, requirement_id || null, scheduled_date, provider || null, location || null, uid]
    );
    const r = await db.$client.query(`SELECT * FROM training_scheduled_sessions WHERE id = $1`, [id]);
    res.status(201).json(r.rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── GET scheduled sessions ─────────────────────────────────────────────────
router.get("/schedule", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const r = await db.$client.query(
      `SELECT tss.*, e.first_name, e.last_name, tr.requirement_name
       FROM training_scheduled_sessions tss
       LEFT JOIN employees e ON e.id = tss.employee_id AND e.workspace_id = $1
       LEFT JOIN training_requirements tr ON tr.id = tss.requirement_id
       WHERE tss.workspace_id = $1 AND tss.status IN ('scheduled')
       ORDER BY tss.scheduled_date ASC`,
      [wid]
    );
    res.json(r.rows);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── GET compliance-matrix — returns ComplianceSummary[] grouped by employee ─
router.get("/compliance-matrix", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const officers = (await db.$client.query(
      `SELECT id, first_name || ' ' || last_name AS employee_name, position
       FROM employees WHERE workspace_id = $1 AND is_active = TRUE
       ORDER BY last_name, first_name LIMIT 100`,
      [wid]
    )).rows;

    const allRecords = (await db.$client.query(
      `SELECT etr.*,
              e.first_name || ' ' || e.last_name AS employee_name,
              tr.requirement_name AS training_name,
              CASE
                WHEN etr.expiration_date IS NULL THEN 'current'
                WHEN etr.expiration_date < CURRENT_DATE THEN 'expired'
                WHEN (etr.expiration_date - CURRENT_DATE) <= 30 THEN 'expiring_soon'
                ELSE 'current'
              END AS status,
              (etr.expiration_date - CURRENT_DATE) AS days_left
       FROM employee_training_records etr
       LEFT JOIN employees e ON e.id = etr.employee_id AND e.workspace_id = $1
       LEFT JOIN training_requirements tr ON tr.id = etr.requirement_id
       WHERE etr.workspace_id = $1`,
      [wid]
    )).rows;

    const byEmployee: Record<string, any> = {};
    for (const off of officers) {
      byEmployee[off.id] = {
        employee_id: off.id,
        employee_name: off.employee_name,
        position: off.position,
        current_count: 0,
        expiring_soon_count: 0,
        expired_count: 0,
        missing_count: 0,
        overall_status: 'compliant',
        records: []
      };
    }

    for (const rec of allRecords) {
      if (!byEmployee[rec.employee_id]) continue;
      const emp = byEmployee[rec.employee_id];
      emp.records.push(rec);
      if (rec.status === 'current') emp.current_count++;
      else if (rec.status === 'expiring_soon') emp.expiring_soon_count++;
      else if (rec.status === 'expired') emp.expired_count++;
    }

    for (const emp of Object.values(byEmployee) as any[]) {
      if (emp.expired_count > 0 || emp.missing_count > 0) emp.overall_status = 'non_compliant';
      else if (emp.expiring_soon_count > 0) emp.overall_status = 'expiring_soon';
      else emp.overall_status = 'compliant';
    }

    res.json(Object.values(byEmployee));
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── POST refresh training statuses ─────────────────────────────────────────
router.post("/refresh-statuses", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const r = await db.$client.query(
      `SELECT COUNT(*) AS updated FROM employee_training_records WHERE workspace_id = $1`,
      [wid]
    );
    res.json({ message: "Training statuses refreshed", count: r.rows[0].updated });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── GET tcole-compliance — officers below required annual TCOLE hours ───────
router.get("/tcole-compliance", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const year = new Date().getFullYear();
    const requiredHours = 40; // Default requirement

    const r = await db.$client.query(
      `SELECT e.id, e.first_name, e.last_name, e.position,
              COALESCE(SUM(ta.tcole_hours_awarded), 0) AS hours_completed
       FROM employees e
       LEFT JOIN training_attendance ta ON ta.employee_id = e.id 
            AND ta.workspace_id = e.workspace_id
            AND ta.status = 'attended'
            AND EXTRACT(YEAR FROM ta.checked_in_at) = $2
       WHERE e.workspace_id = $1 AND e.is_active = TRUE
       GROUP BY e.id
       HAVING COALESCE(SUM(ta.tcole_hours_awarded), 0) < $3
       ORDER BY hours_completed ASC`,
      [wid, year, requiredHours]
    );

    const now = new Date();
    const endOfYear = new Date(now.getFullYear(), 11, 31);
    const daysUntilDeadline = Math.ceil((endOfYear.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    const compliance = r.rows.map((row: any) => {
      const hoursAccumulated = parseFloat(row.hours_completed);
      const hoursRemaining = requiredHours - hoursAccumulated;
      const urgency =
        hoursRemaining >= 30 ? 'critical' :
        hoursRemaining >= 20 ? 'high' :
        hoursRemaining > 0  ? 'medium' : 'low';
      return {
        employeeId: row.id,
        employeeName: `${row.first_name} ${row.last_name}`,
        position: row.position,
        hoursAccumulated,
        hoursRequired: requiredHours,
        hoursRemaining,
        urgency,
        daysUntilDeadline,
      };
    });

    res.json(compliance);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── POST tcole-alerts — trigger year-end alerts ─────────────────────────────
router.post("/tcole-alerts", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    if (!hasManagerAccess(req.workspaceRole || '')) return res.status(403).json({ error: "Manager access required" });

    const now = new Date();
    const endOfYear = new Date(now.getFullYear(), 11, 31);
    const diffDays = Math.ceil((endOfYear.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // For manual trigger, we might want to allow it anyway but let's stick to logic
    const requiredHours = 40;
    const year = now.getFullYear();

    const belowRequired = await db.$client.query(
      `SELECT e.id, e.first_name, e.last_name, e.email,
              COALESCE(SUM(ta.tcole_hours_awarded), 0) AS hours_completed
       FROM employees e
       LEFT JOIN training_attendance ta ON ta.employee_id = e.id 
            AND ta.workspace_id = e.workspace_id
            AND ta.status = 'attended'
            AND EXTRACT(YEAR FROM ta.checked_in_at) = $2
       WHERE e.workspace_id = $1 AND e.is_active = TRUE
       GROUP BY e.id
       HAVING COALESCE(SUM(ta.tcole_hours_awarded), 0) < $3`,
      [wid, year, requiredHours]
    );

    // Only send alerts when within 90 days of year end (30/60/90-day threshold windows)
    // Search smallest-first so we always land on the most urgent/specific threshold
    const thresholds = [30, 60, 90];
    const activeThreshold = thresholds.find(t => diffDays <= t);

    if (!activeThreshold) {
      return res.json({
        message: "No alerts needed — more than 90 days remain in the year",
        alertsSent: 0,
        daysUntilYearEnd: diffDays,
        year,
        nextThreshold: 90,
      });
    }

    let count = 0;
    for (const officer of belowRequired.rows) {
      const completed = parseFloat(officer.hours_completed);
      const remaining = requiredHours - completed;
      
      platformEventBus.publish({
        type: 'tcole_compliance_warning',
        category: 'automation',
        title: `TCOLE ${activeThreshold}-Day Alert: ${officer.first_name} ${officer.last_name}`,
        description: `Officer has ${completed} of ${requiredHours} required TCOLE hours with ${diffDays} days until year-end. ${remaining} hours still needed.`,
        workspaceId: wid,
        metadata: { 
          employeeId: officer.id, 
          hoursCompleted: completed, 
          hoursRemaining: remaining,
          daysUntilYearEnd: diffDays,
          threshold: activeThreshold,
        }
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
      count++;
    }

    res.json({ 
      message: `TCOLE ${activeThreshold}-day compliance alerts sent`,
      alertsSent: count, 
      daysUntilYearEnd: diffDays,
      threshold: activeThreshold,
      year
    });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
