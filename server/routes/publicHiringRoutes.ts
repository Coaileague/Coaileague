/**
 * PUBLIC HIRING ROUTES — No authentication required
 * Job board and public application submission
 */
import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { db } from '../db';
import { platformEventBus } from '../services/platformEventBus';
import { createLogger } from '../lib/logger';
const log = createLogger('publicHiringRoutes');

// CATEGORY C — All db.$client.query calls in this file use raw SQL for public hiring portal | Tables: workspaces, job_postings, applicants | Verified: 2026-03-23
const router = Router();

// GET /api/public/jobs/:workspaceId — Public job board
router.get('/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const ws = await db.$client.query(
      `SELECT id, name, company_name, logo_url, brand_color, website, phone FROM workspaces WHERE id = $1 LIMIT 1`,
      [workspaceId]
    );
    if (!ws.rows.length) return res.status(404).json({ error: 'Organization not found' });

    const postings = await db.$client.query(
      `SELECT id, title, description, position_type, shift_type, employment_type, sites,
              pay_rate_min, pay_rate_max, schedule_details, requires_license,
              applications_count, posted_at
       FROM job_postings
       WHERE workspace_id = $1 AND status = 'active'
       ORDER BY posted_at DESC`,
      [workspaceId]
    );
    res.json({ workspace: ws.rows[0], postings: postings.rows });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// POST /api/public/jobs/:workspaceId/apply — Public application submission
router.post('/:workspaceId/apply', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const {
      job_posting_id, first_name, last_name, email, phone,
      has_license, license_number, license_state, license_type,
      interested_in_sponsorship
    } = req.body;

    if (!first_name || !last_name || !email) {
      return res.status(400).json({ error: 'first_name, last_name, and email are required' });
    }

    const jp = await db.$client.query(
      `SELECT id FROM job_postings WHERE id = $1 AND workspace_id = $2 AND status = 'active' LIMIT 1`,
      [job_posting_id, workspaceId]
    );
    if (!jp.rows.length) return res.status(404).json({ error: 'Job posting not found or no longer active' });

    const idResult = await db.$client.query(`SELECT gen_random_uuid()::VARCHAR AS id`);
    const id = idResult.rows[0].id;

    const pgClient = await db.$client.connect();
    try {
      await pgClient.query('BEGIN');
      await pgClient.query(
        `INSERT INTO applicants (
          id, workspace_id, job_posting_id, first_name, last_name, email, phone,
          has_guard_card, guard_card_number, license_state, license_type,
          has_armed_endorsement, years_experience, applied_at, status,
          trinity_score, trinity_score_rationale, pipeline_stage, license_verified, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,FALSE,0,NOW(),'applied',0,'Pending Trinity scoring','applied',FALSE,$12)`,
        [
          id, workspaceId, job_posting_id,
          first_name, last_name, email, phone || null,
          has_license || false, license_number || null,
          license_state || null, license_type || null,
          interested_in_sponsorship ? 'Applicant expressed interest in license sponsorship.' : null
        ]
      );
      await pgClient.query(
        `UPDATE job_postings SET applications_count = applications_count + 1 WHERE id = $1 AND workspace_id = $2`,
        [job_posting_id, workspaceId]
      );
      await pgClient.query('COMMIT');
    } catch (txErr) {
      await pgClient.query('ROLLBACK');
      throw txErr;
    } finally {
      pgClient.release();
    }

    platformEventBus.publish({
      type: 'system_signal',
      category: 'hiring',
      title: `New Public Application — ${first_name} ${last_name}`,
      description: `Applied for posting ${job_posting_id}. License: ${has_license}`,
      workspaceId,
      metadata: { applicantId: id, hasLicense: has_license }
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    res.status(201).json({
      success: true,
      applicantId: id,
      message: 'Application submitted successfully. You will be contacted within 2–3 business days.'
    });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
