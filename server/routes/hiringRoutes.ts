/**
 * HIRING PIPELINE ROUTES — Trinity-Orchestrated Hiring Module
 * Extends the existing ATS with Trinity interview, license verification, and pipeline management
 */
import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { db } from '../db';
import { requireAuth } from '../auth';
import { hasManagerAccess, type AuthenticatedRequest } from '../rbac';
import { platformEventBus } from '../services/platformEventBus';
import { createLogger } from '../lib/logger';
const log = createLogger('HiringRoutes');

// CATEGORY C — All db.$client.query calls in this file use raw SQL for hiring pipeline operations | Tables: applicants, job_postings, interview_sessions, interview_session_messages, hiring_ai_conversations, screening_records | Verified: 2026-03-23
const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATED — hiring pipeline management (all routes require auth)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/hiring/pipeline — Full pipeline with all stages
router.get('/pipeline', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const applicants = await db.$client.query(
      `SELECT a.*, jp.title AS posting_title, jp.shift_type
       FROM applicants a
       LEFT JOIN job_postings jp ON jp.id = a.job_posting_id
       WHERE a.workspace_id = $1
       ORDER BY a.applied_at DESC`,
      [wid]
    );
    const postings = await db.$client.query(
      `SELECT * FROM job_postings WHERE workspace_id = $1 ORDER BY created_at DESC`,
      [wid]
    );
    const stats = await db.$client.query(
      `SELECT
        COUNT(*) FILTER (WHERE pipeline_stage = 'applied') AS applied,
        COUNT(*) FILTER (WHERE pipeline_stage = 'pre_screened') AS pre_screened,
        COUNT(*) FILTER (WHERE pipeline_stage = 'interview_scheduled') AS interview_scheduled,
        COUNT(*) FILTER (WHERE pipeline_stage = 'interview_complete') AS interview_complete,
        COUNT(*) FILTER (WHERE pipeline_stage = 'management_review') AS management_review,
        COUNT(*) FILTER (WHERE pipeline_stage = 'offer_extended') AS offer_extended,
        COUNT(*) FILTER (WHERE pipeline_stage = 'onboarding') AS onboarding,
        COUNT(*) FILTER (WHERE pipeline_stage = 'disqualified') AS disqualified,
        COUNT(*) AS total
       FROM applicants WHERE workspace_id = $1`,
      [wid]
    );
    res.json({
      applicants: applicants.rows,
      postings: postings.rows,
      stats: stats.rows[0]
    });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// GET /api/hiring/applicants/:id — Full applicant detail with interview session
// PATCH /api/hiring/applicants/:id/stage — Move pipeline stage
// POST /api/hiring/applicants/:id/verify-license — Trinity license verification via Agent Spawner
// POST /api/hiring/applicants/:id/score-interview — Spawn interview scoring agent
// POST /api/hiring/applicants/:id/assess — Parallel: applicant_summary + hire_liability_assessment
// GET /api/hiring/question-sets — List question sets
// GET /api/hiring/sessions/:id — Interview session with transcript
// POST /api/hiring/postings/:id/draft-approve — Publish a Trinity-drafted posting
// GET /api/hiring/training-pipeline — Applicants without license (sponsorship track)
router.get('/training-pipeline', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const r = await db.$client.query(
      `SELECT a.*, jp.title AS posting_title
       FROM applicants a
       LEFT JOIN job_postings jp ON jp.id = a.job_posting_id
       WHERE a.workspace_id = $1 AND a.has_guard_card = FALSE
       ORDER BY a.applied_at DESC`,
      [wid]
    );
    res.json(r.rows);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// POST /api/hiring/seed — Trigger Acme stress test seed (dev only)
router.post('/seed', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { seedHiringData } = await import('../services/hiring/hiringSeedData');
    const result = await seedHiringData();
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
